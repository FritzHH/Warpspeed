/* eslint-disable */
import { useState, useRef, memo } from "react";
import { Button, SmallLoadingIndicator, Tooltip } from "../../../../dom_components";
import { C, COLOR_GRADIENTS, Fonts, ICONS } from "../../../../styles";
import { usdTypeMask, formatCurrencyDisp, log, generateEAN13Barcode } from "../../../../utils";
import { useSettingsStore } from "../../../../stores";
import { newCheckoutProcessStripeRefund } from "./newCheckoutFirebaseCalls";
import { dlog, DCAT } from "./checkoutDebugLog";
import styles from "./CardRefund.module.css";

function resolveIcon(src) {
  if (!src) return null;
  return typeof src === "object" ? src.default || src : src;
}

export const CardRefund = memo(function CardRefund({
  selectedPayment,
  maxCardRefund = 0,
  onProcessRefund,
  onRefundStarted,
  onRefundFailed,
  onProcessingChange,
  workorderLines = [],
  salesTaxPercent,
  refundComplete = false,
  suggestedAmount = 0,
  onManualInput,
  reasonMissing = false,
}) {
  const [sRefundAmount, _setRefundAmount] = useState("");
  const [sRefundAmountDisp, _setRefundAmountDisp] = useState("");
  const [sProcessing, _setProcessing] = useState(false);
  const [sErrorMessage, _setErrorMessage] = useState("");
  const [sSuccessMessage, _setSuccessMessage] = useState("");
  const [sFocused, _setFocused] = useState(false);
  const prevSuggestedRef = useRef(0);
  const inputRef = useRef(null);

  // Auto-populate when suggested amount changes from item selection
  if (suggestedAmount !== prevSuggestedRef.current) {
    prevSuggestedRef.current = suggestedAmount;
    if (suggestedAmount > 0 && !sFocused) {
      _setRefundAmountDisp(formatCurrencyDisp(suggestedAmount));
      _setRefundAmount(suggestedAmount);
    } else if (suggestedAmount === 0) {
      _setRefundAmountDisp("");
      _setRefundAmount("");
    }
  }

  function handleAmountChange(val) {
    if (onManualInput) onManualInput();
    dlog(DCAT.INPUT, "handleAmountChange", "CardRefund", { cents: usdTypeMask(val, { withDollar: false }).cents });
    let result = usdTypeMask(val, { withDollar: false });
    let maxAllowed = maxCardRefund;
    if (selectedPayment) {
      let cardAvailable = selectedPayment.amountCaptured - ((selectedPayment.refunds || []).reduce((s, r) => s + (r.amount || 0), 0));
      maxAllowed = Math.min(maxAllowed, cardAvailable);
    }
    if (result.cents > maxAllowed) {
      _setRefundAmountDisp(formatCurrencyDisp(maxAllowed));
      _setRefundAmount(maxAllowed);
      return;
    }
    _setRefundAmountDisp(result.display);
    _setRefundAmount(result.cents);
  }

  async function handleProcessRefund() {
    dlog(DCAT.BUTTON, "handleProcessRefund", "CardRefund", { amount: sRefundAmount, paymentIntentID: selectedPayment?.paymentIntentID });
    if (!selectedPayment) {
      _setErrorMessage("Select a card payment to refund against");
      return;
    }
    if (!sRefundAmount || sRefundAmount < 50) {
      _setErrorMessage("Minimum card refund is $0.50");
      return;
    }

    let available =
      selectedPayment.amountCaptured - ((selectedPayment.refunds || []).reduce((s, r) => s + (r.amount || 0), 0));
    if (sRefundAmount > available) {
      _setErrorMessage(
        `Exceeds available on this card (${formatCurrencyDisp(available)})`
      );
      return;
    }
    if (sRefundAmount > maxCardRefund) {
      _setErrorMessage(
        `Exceeds max refund allowed (${formatCurrencyDisp(maxCardRefund)})`
      );
      return;
    }

    if (workorderLines.length > 0) {
      let itemsSum = 0;
      workorderLines.forEach((item) => {
        let p = item.discountObj?.newPrice != null
          ? item.discountObj.newPrice
          : item.inventoryItem?.price || 0;
        itemsSum += p;
      });
      let itemTotal = itemsSum + Math.round(itemsSum * ((salesTaxPercent || 0) / 100));
      if (sRefundAmount < itemTotal) {
        _setErrorMessage(
          `Refund must cover selected items (${formatCurrencyDisp(itemTotal)})`
        );
        return;
      }
    }

    _setProcessing(true);
    if (onProcessingChange) onProcessingChange(true);
    _setErrorMessage("");
    _setSuccessMessage("Processing refund...");

    let refundId;
    try {
      let { tenantID, storeID } = useSettingsStore.getState().getSettings();
      refundId = generateEAN13Barcode();

      if (onRefundStarted) onRefundStarted({ refundId, transactionID: selectedPayment.id, amount: sRefundAmount });

      let result = await newCheckoutProcessStripeRefund(
        sRefundAmount,
        selectedPayment.paymentIntentID,
        {
          transactionID: selectedPayment.id,
          chargeID: selectedPayment.chargeID || "",
          tenantID,
          storeID,
          refundId,
          method: "card",
          salesTax: salesTaxPercent > 0 ? Math.round(sRefundAmount * (salesTaxPercent / (100 + salesTaxPercent))) : 0,
          workorderLines,
        }
      );

      if (result?.success) {
        dlog(DCAT.ACTION, "refundSuccess", "CardRefund", { amount: sRefundAmount, refundId });
        _setSuccessMessage(
          `Refund of ${formatCurrencyDisp(sRefundAmount)} processed`
        );
        _setRefundAmount("");
        _setRefundAmountDisp("");

        if (onProcessRefund) {
          onProcessRefund(sRefundAmount, "card", {
            refundId: refundId,
            paymentId: selectedPayment.id,
            paymentIntentID: selectedPayment.paymentIntentID,
            refundObj: result.data?.refundObj || null,
          });
        }
      } else {
        dlog(DCAT.ACTION, "refundFailed", "CardRefund", { error: result?.message || "Refund failed" });
        if (onRefundFailed) onRefundFailed(refundId);
        _setErrorMessage(result?.message || "Refund failed");
        _setSuccessMessage("");
      }
    } catch (error) {
      dlog(DCAT.ACTION, "refundError", "CardRefund", { error: error?.message || "Unknown error" });
      log("Card refund error:", error);
      if (error?.code && refundId && onRefundFailed) onRefundFailed(refundId);
      _setErrorMessage(error?.message || "Refund processing failed");
      _setSuccessMessage("");
    } finally {
      _setProcessing(false);
      if (onProcessingChange) onProcessingChange(false);
    }
  }

  let isEnabled =
    !refundComplete &&
    !sProcessing &&
    !!selectedPayment &&
    maxCardRefund > 0;
  let inputEditable = isEnabled;

  let available = selectedPayment
    ? selectedPayment.amountCaptured - ((selectedPayment.refunds || []).reduce((s, r) => s + (r.amount || 0), 0))
    : 0;

  let buttonStyle = {
    paddingTop: 8,
    paddingBottom: 8,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  };
  let buttonTextStyle = { fontSize: 13, fontWeight: Fonts.weight.textHeavy };

  return (
    <div className={styles.container}>
      <div
        className={styles.title}
        style={{ fontWeight: Fonts.weight.textHeavy, color: C.text }}
      >
        CARD REFUND
      </div>

      {selectedPayment ? (
        <div
          className={styles.cardInfo}
          style={{ backgroundColor: C.surfaceAccentMuted }}
        >
          <div className={styles.cardInfoLine} style={{ color: C.text }}>
            {selectedPayment.cardIssuer || selectedPayment.cardType} ****
            {selectedPayment.last4}
          </div>
          <div className={styles.cardInfoSub} style={{ color: C.lightText }}>
            Exp: {selectedPayment.expMonth}/{selectedPayment.expYear} |
            Available: {formatCurrencyDisp(available)}
          </div>
        </div>
      ) : (
        <div className={styles.noCardSelected} style={{ color: C.lightText }}>
          Select a card payment from the list
        </div>
      )}

      <div className={styles.amountSection}>
        <div className={styles.amountLabel} style={{ color: C.lightText }}>
          Refund Amount
        </div>
        <div
          className={styles.inputWrap}
          style={{ borderColor: sFocused ? C.green : C.borderSubtle }}
        >
          <span className={styles.dollar} style={{ color: C.lightred }}>$</span>
          <input
            ref={inputRef}
            type="text"
            className={styles.input}
            style={{ color: C.lightred }}
            value={sRefundAmountDisp}
            onChange={(e) => handleAmountChange(e.target.value)}
            placeholder="0.00"
            onFocus={() => _setFocused(true)}
            onBlur={() => _setFocused(false)}
            disabled={!inputEditable}
          />
        </div>
      </div>

      <div className={styles.statusRow}>
        {sProcessing && (
          <div className={styles.statusFlex}>
            <SmallLoadingIndicator color={C.orange} text="" message="" containerStyle={{ padding: 2 }} />
            <span className={styles.statusText} style={{ color: C.textMuted }}>
              {sSuccessMessage || "Processing refund..."}
            </span>
          </div>
        )}
        {!sProcessing && !!sErrorMessage && (
          <span className={styles.errorText} style={{ color: C.lightred }}>
            {sErrorMessage}
          </span>
        )}
        {!sProcessing && !!sSuccessMessage && (
          <div className={styles.statusFlexSm}>
            <img
              src={resolveIcon(ICONS.check)}
              alt=""
              className={styles.checkIcon}
            />
            <span className={styles.statusText} style={{ color: C.green }}>
              {sSuccessMessage}
            </span>
          </div>
        )}
      </div>

      {reasonMissing ? (
        <Tooltip text="Enter a refund reason first (min 10 characters)" position="bottom">
          <div>
            <Button
              text="PROCESS CARD REFUND"
              onPress={() => {}}
              enabled={false}
              colorGradientArr={COLOR_GRADIENTS.green}
              textStyle={buttonTextStyle}
              buttonStyle={{ ...buttonStyle, opacity: 0.4 }}
            />
          </div>
        </Tooltip>
      ) : (
        <Button
          text={sProcessing ? "PROCESSING..." : "PROCESS CARD REFUND"}
          onPress={handleProcessRefund}
          enabled={isEnabled && sRefundAmount >= 50 && !sProcessing}
          colorGradientArr={COLOR_GRADIENTS.green}
          textStyle={buttonTextStyle}
          buttonStyle={{
            ...buttonStyle,
            opacity: isEnabled && sRefundAmount >= 50 && !sProcessing ? 1 : 0.4,
          }}
        />
      )}
    </div>
  );
});

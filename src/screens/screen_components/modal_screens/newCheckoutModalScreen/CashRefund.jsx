/* eslint-disable */
import { useState, useRef, memo } from "react";
import { Button, Tooltip } from "../../../../dom_components";
import { C, COLOR_GRADIENTS, Fonts, Radius } from "../../../../styles";
import { usdTypeMask, formatCurrencyDisp } from "../../../../utils";
import { dlog, DCAT } from "./checkoutDebugLog";
import styles from "./CashRefund.module.css";

export const CashRefund = memo(function CashRefund({
  maxCashRefund = 0,
  onProcessRefund,
  refundComplete = false,
  suggestedAmount = 0,
  onManualInput,
  reasonMissing = false,
}) {
  const [sRefundAmount, _setRefundAmount] = useState("");
  const [sRefundAmountDisp, _setRefundAmountDisp] = useState("");
  const [sStatusMessage, _setStatusMessage] = useState("");
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
    dlog(DCAT.INPUT, "handleAmountChange", "CashRefund", { cents: usdTypeMask(val, { withDollar: false }).cents });
    let result = usdTypeMask(val, { withDollar: false });
    if (result.cents > maxCashRefund) {
      _setRefundAmountDisp(formatCurrencyDisp(maxCashRefund));
      _setRefundAmount(maxCashRefund);
      return;
    }
    _setRefundAmountDisp(result.display);
    _setRefundAmount(result.cents);
  }

  function handleProcessRefund() {
    dlog(DCAT.BUTTON, "handleProcessRefund", "CashRefund", { amount: sRefundAmount, maxCashRefund });
    if (!sRefundAmount || sRefundAmount <= 0) {
      _setStatusMessage("Enter a refund amount");
      return;
    }
    if (sRefundAmount > maxCashRefund) {
      _setStatusMessage(
        `Amount exceeds max cash refund (${formatCurrencyDisp(maxCashRefund)})`
      );
      return;
    }

    if (onProcessRefund) onProcessRefund(sRefundAmount, "cash");

    _setRefundAmount("");
    _setRefundAmountDisp("");
    _setStatusMessage("");
  }

  let isEnabled = !refundComplete && maxCashRefund > 0;
  let inputEditable = isEnabled;

  let buttonStyle = {
    paddingTop: 8,
    paddingBottom: 8,
    borderRadius: Radius.control,
    alignItems: "center",
    justifyContent: "center",
  };
  let buttonTextStyle = { fontSize: 13, fontWeight: Fonts.weight.textHeavy };

  return (
    <div
      className={styles.container}
      style={{ borderBottomColor: C.borderSubtle }}
    >
      <div
        className={styles.title}
        style={{ fontWeight: Fonts.weight.textHeavy, color: C.text }}
      >
        CASH REFUND
      </div>

      <div className={styles.amountSection}>
        <div className={styles.amountLabel} style={{ color: C.lightText }}>
          Refund Amount (max: {formatCurrencyDisp(maxCashRefund)})
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

      {sStatusMessage ? (
        <div className={styles.statusMsg} style={{ color: C.lightred }}>
          {sStatusMessage}
        </div>
      ) : null}

      {reasonMissing ? (
        <Tooltip text="Enter a refund reason first (min 10 characters)" position="top">
          <div>
            <Button
              text="PROCESS CASH REFUND"
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
          text="PROCESS CASH REFUND"
          onPress={handleProcessRefund}
          enabled={isEnabled && sRefundAmount > 0}
          colorGradientArr={COLOR_GRADIENTS.green}
          textStyle={buttonTextStyle}
          buttonStyle={{
            ...buttonStyle,
            opacity: isEnabled && sRefundAmount > 0 ? 1 : 0.4,
          }}
        />
      )}
    </div>
  );
});

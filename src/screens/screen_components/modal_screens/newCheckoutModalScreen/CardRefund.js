/* eslint-disable */
import { View, Text, TextInput, Image } from "react-native-web";
import { useState, useRef, memo } from "react";
import { Button_, SmallLoadingIndicator } from "../../../../components";
import { C, COLOR_GRADIENTS, Fonts, ICONS } from "../../../../styles";
import {
  usdTypeMask,
  formatCurrencyDisp,
  log,
  gray,
  generateEAN13Barcode,
} from "../../../../utils";
import { useSettingsStore } from "../../../../stores";
import { newCheckoutProcessStripeRefund } from "./newCheckoutFirebaseCalls";

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
  lockedAmount = false,
  shouldFocus = false,
}) {
  const [sRefundAmount, _setRefundAmount] = useState("");
  const [sRefundAmountDisp, _setRefundAmountDisp] = useState("");
  const [sProcessing, _setProcessing] = useState(false);
  const [sErrorMessage, _setErrorMessage] = useState("");
  const [sSuccessMessage, _setSuccessMessage] = useState("");
  const [sFocused, _setFocused] = useState(false);
  const prevSuggestedRef = useRef(0);
  const inputRef = useRef(null);
  const prevShouldFocusRef = useRef(false);

  if (shouldFocus && !prevShouldFocusRef.current) {
    setTimeout(() => inputRef.current?.focus(), 100);
  }
  prevShouldFocusRef.current = shouldFocus;

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
    let result = usdTypeMask(val, { withDollar: false });
    // Cap to the lesser of max card refund and selected card's available amount
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

    _setProcessing(true);
    if (onProcessingChange) onProcessingChange(true);
    _setErrorMessage("");
    _setSuccessMessage("Processing refund...");

    try {
      let { tenantID, storeID } = useSettingsStore.getState().getSettings();
      let refundId = generateEAN13Barcode();

      // Persist pending refund marker before calling Cloud Function (crash recovery)
      if (onRefundStarted) onRefundStarted({ refundId, transactionID: selectedPayment.id, amount: sRefundAmount });

      let result = await newCheckoutProcessStripeRefund(
        sRefundAmount,
        selectedPayment.chargeID,
        {
          transactionID: selectedPayment.id,
          tenantID,
          storeID,
          refundId,
          method: "card",
          salesTax: salesTaxPercent > 0 ? Math.round(sRefundAmount * (salesTaxPercent / (100 + salesTaxPercent))) : 0,
          workorderLines,
        }
      );

      if (result?.success) {
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
        // Cloud Function returned explicit failure — refund did not happen
        if (onRefundFailed) onRefundFailed(refundId);
        _setErrorMessage(result?.message || "Refund failed");
        _setSuccessMessage("");
      }
    } catch (error) {
      log("Card refund error:", error);
      // HttpsError has a .code property — means the Cloud Function responded (refund failed server-side)
      // No .code means network/timeout — refund may have succeeded, keep pending marker for reconciliation
      if (error?.code && onRefundFailed) onRefundFailed(refundId);
      _setErrorMessage(error?.message || "Refund processing failed");
      _setSuccessMessage("");
    }

    _setProcessing(false);
    if (onProcessingChange) onProcessingChange(false);
  }

  let isEnabled =
    !refundComplete &&
    !sProcessing &&
    !!selectedPayment &&
    maxCardRefund > 0;
  let inputEditable = isEnabled && !lockedAmount;

  let available = selectedPayment
    ? selectedPayment.amountCaptured - ((selectedPayment.refunds || []).reduce((s, r) => s + (r.amount || 0), 0))
    : 0;

  return (
    <View style={{ flex: 1, padding: 10 }}>
      <Text
        style={{
          fontSize: 15,
          fontWeight: Fonts.weight.textHeavy,
          color: C.text,
          marginBottom: 8,
        }}
      >
        CARD REFUND
      </Text>

      {/* Selected Card Info */}
      {selectedPayment ? (
        <View
          style={{
            backgroundColor: "rgb(230, 240, 252)",
            borderRadius: 6,
            padding: 8,
            marginBottom: 8,
          }}
        >
          <Text style={{ fontSize: 12, color: C.text }}>
            {selectedPayment.cardIssuer || selectedPayment.cardType} ****
            {selectedPayment.last4}
          </Text>
          <Text style={{ fontSize: 11, color: C.lightText }}>
            Exp: {selectedPayment.expMonth}/{selectedPayment.expYear} |
            Available: {formatCurrencyDisp(available)}
          </Text>
        </View>
      ) : (
        <Text
          style={{
            fontSize: 11,
            color: C.lightText,
            fontStyle: "italic",
            marginBottom: 8,
          }}
        >
          Select a card payment from the list
        </Text>
      )}

      {/* Refund Amount Input */}
      <View style={{ marginBottom: 8 }}>
        <Text style={{ fontSize: 11, color: C.lightText, marginBottom: 3 }}>
          Refund Amount
        </Text>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            borderWidth: 1,
            borderColor: sFocused ? C.green : gray(0.15),
            borderRadius: 6,
            paddingHorizontal: 8,
            paddingVertical: 6,
            backgroundColor: "white",
          }}
        >
          <Text style={{ fontSize: 14, color: C.lightred, marginRight: 2 }}>$</Text>
          <TextInput
            ref={inputRef}
            style={{
              flex: 1,
              outlineWidth: 0,
              outlineStyle: "none",
              fontSize: 14,
              color: C.lightred,
              textAlign: "right",
            }}
            value={sRefundAmountDisp}
            onChangeText={handleAmountChange}
            placeholder="0.00"
            placeholderTextColor={gray(0.3)}
            onFocus={() => _setFocused(true)}
            onBlur={() => _setFocused(false)}
            editable={inputEditable}
          />
        </View>
      </View>

      {/* Status Messages */}
      <View style={{ minHeight: 28, justifyContent: "center", marginBottom: 4 }}>
        {sProcessing && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <SmallLoadingIndicator color={C.orange} text="" message="" containerStyle={{ padding: 2 }} />
            <Text style={{ fontSize: 12, color: gray(0.5), fontWeight: "600" }}>
              {sSuccessMessage || "Processing refund..."}
            </Text>
          </View>
        )}
        {!sProcessing && !!sErrorMessage && (
          <Text style={{ fontSize: 11, color: C.lightred, fontWeight: "600" }}>
            {sErrorMessage}
          </Text>
        )}
        {!sProcessing && !!sSuccessMessage && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Image source={ICONS.check} style={{ width: 14, height: 14, tintColor: C.green }} resizeMode="contain" />
            <Text style={{ fontSize: 12, color: C.green, fontWeight: "600" }}>
              {sSuccessMessage}
            </Text>
          </View>
        )}
      </View>

      {/* Button */}
      <Button_
        text={sProcessing ? "PROCESSING..." : "PROCESS CARD REFUND"}
        onPress={handleProcessRefund}
        enabled={isEnabled && sRefundAmount >= 50 && !sProcessing}
        colorGradientArr={COLOR_GRADIENTS.yellow}
        textStyle={{ fontSize: 13, fontWeight: Fonts.weight.textHeavy }}
        buttonStyle={{
          paddingVertical: 8,
          borderRadius: 6,
          alignItems: "center",
          justifyContent: "center",
          opacity: isEnabled && sRefundAmount >= 50 && !sProcessing ? 1 : 0.4,
        }}
      />
    </View>
  );
});

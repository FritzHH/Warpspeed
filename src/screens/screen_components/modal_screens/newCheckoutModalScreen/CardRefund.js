/* eslint-disable */
import { View, Text, TextInput } from "react-native-web";
import { useState, useRef } from "react";
import { Button_ } from "../../../../components";
import { C, COLOR_GRADIENTS, Fonts } from "../../../../styles";
import {
  usdTypeMask,
  formatCurrencyDisp,
  log,
  gray,
} from "../../../../utils";
import { newCheckoutProcessStripeRefund } from "./newCheckoutFirebaseCalls";

export function CardRefund({
  selectedPayment,
  maxCardRefund = 0,
  onProcessRefund,
  settings,
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
      let cardAvailable = selectedPayment.amountCaptured - (selectedPayment.amountRefunded || 0);
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
      selectedPayment.amountCaptured - (selectedPayment.amountRefunded || 0);
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
    _setErrorMessage("");
    _setSuccessMessage("Processing refund...");

    try {
      let result = await newCheckoutProcessStripeRefund(
        sRefundAmount,
        selectedPayment.paymentIntentID
      );

      if (result?.success) {
        _setSuccessMessage(
          `Refund of ${formatCurrencyDisp(sRefundAmount)} processed`
        );

        if (onProcessRefund) {
          onProcessRefund(sRefundAmount, "card", {
            refundId: result.data?.refundId,
            paymentId: selectedPayment.id,
            paymentIntentID: selectedPayment.paymentIntentID,
          });
        }

        _setRefundAmount("");
        _setRefundAmountDisp("");
      } else {
        _setErrorMessage(result?.message || "Refund failed");
        _setSuccessMessage("");
      }
    } catch (error) {
      log("Card refund error:", error);
      _setErrorMessage(error?.message || "Refund processing failed");
      _setSuccessMessage("");
    }

    _setProcessing(false);
  }

  let isEnabled =
    !refundComplete &&
    !sProcessing &&
    !!selectedPayment &&
    maxCardRefund > 0;
  let inputEditable = isEnabled && !lockedAmount;

  let available = selectedPayment
    ? selectedPayment.amountCaptured - (selectedPayment.amountRefunded || 0)
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
      {sErrorMessage ? (
        <Text
          style={{
            fontSize: 11,
            color: C.lightred,
            fontStyle: "italic",
            marginBottom: 4,
          }}
        >
          {sErrorMessage}
        </Text>
      ) : null}
      {sSuccessMessage ? (
        <Text
          style={{
            fontSize: 11,
            color: C.green,
            fontStyle: "italic",
            marginBottom: 4,
          }}
        >
          {sSuccessMessage}
        </Text>
      ) : null}

      {/* Button */}
      <Button_
        text={sProcessing ? "PROCESSING..." : "PROCESS CARD REFUND"}
        onPress={handleProcessRefund}
        enabled={isEnabled && sRefundAmount >= 50}
        colorGradientArr={COLOR_GRADIENTS.red}
        textStyle={{ fontSize: 13, fontWeight: Fonts.weight.textHeavy }}
        buttonStyle={{
          paddingVertical: 8,
          borderRadius: 6,
          alignItems: "center",
          justifyContent: "center",
          opacity: isEnabled && sRefundAmount >= 50 ? 1 : 0.4,
        }}
      />
    </View>
  );
}

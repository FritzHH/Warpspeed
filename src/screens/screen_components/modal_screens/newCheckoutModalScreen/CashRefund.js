/* eslint-disable */
import { View, Text, TextInput } from "react-native-web";
import { useState, useRef, memo } from "react";
import { Button_ } from "../../../../components";
import { C, COLOR_GRADIENTS, Fonts } from "../../../../styles";
import { usdTypeMask, formatCurrencyDisp, gray } from "../../../../utils";
import { dlog, DCAT } from "./checkoutDebugLog";

export const CashRefund = memo(function CashRefund({
  maxCashRefund = 0,
  onProcessRefund,
  refundComplete = false,
  suggestedAmount = 0,
  lockedAmount = false,
  shouldFocus = false,
}) {
  const [sRefundAmount, _setRefundAmount] = useState("");
  const [sRefundAmountDisp, _setRefundAmountDisp] = useState("");
  const [sStatusMessage, _setStatusMessage] = useState("");
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
  let inputEditable = isEnabled && !lockedAmount;

  return (
    <View
      style={{
        flex: 1,
        padding: 10,
        borderBottomWidth: 1,
        borderBottomColor: gray(0.1),
      }}
    >
      <Text
        style={{
          fontSize: 15,
          fontWeight: Fonts.weight.textHeavy,
          color: C.text,
          marginBottom: 8,
        }}
      >
        CASH REFUND
      </Text>

      {/* Amount Input */}
      <View style={{ marginBottom: 8 }}>
        <Text style={{ fontSize: 11, color: C.lightText, marginBottom: 3 }}>
          Refund Amount (max: {formatCurrencyDisp(maxCashRefund)})
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

      {/* Status */}
      {sStatusMessage ? (
        <Text
          style={{
            fontSize: 11,
            color: C.lightred,
            fontStyle: "italic",
            marginBottom: 4,
          }}
        >
          {sStatusMessage}
        </Text>
      ) : null}

      {/* Button */}
      <Button_
        text="PROCESS CASH REFUND"
        onPress={handleProcessRefund}
        enabled={isEnabled && sRefundAmount > 0}
        colorGradientArr={COLOR_GRADIENTS.yellow}
        textStyle={{ fontSize: 13, fontWeight: Fonts.weight.textHeavy }}
        buttonStyle={{
          paddingVertical: 8,
          borderRadius: 6,
          alignItems: "center",
          justifyContent: "center",
          opacity: isEnabled && sRefundAmount > 0 ? 1 : 0.4,
        }}
      />
    </View>
  );
});

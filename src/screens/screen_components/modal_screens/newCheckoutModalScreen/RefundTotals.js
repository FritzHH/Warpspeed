/* eslint-disable */
import { View, Text, TextInput } from "react-native-web";
import { useState } from "react";
import { C, Fonts } from "../../../../styles";
import {
  formatCurrencyDisp,
  usdTypeMask,
  gray,
} from "../../../../utils";

function TotalRow({ label, value, color, bold, fontSize = 13 }) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: 3,
      }}
    >
      <Text
        style={{
          fontSize,
          color: color || C.text,
          fontWeight: bold ? Fonts.weight.textHeavy : Fonts.weight.textRegular,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontSize,
          color: color || C.text,
          fontWeight: bold ? Fonts.weight.textHeavy : Fonts.weight.textRegular,
        }}
      >
        {typeof value === "number" ? formatCurrencyDisp(value) : value}
      </Text>
    </View>
  );
}

export function RefundTotals({
  originalSale,
  selectedItemsTotal = 0,
  itemRefundTotal = 0,
  selectedPaymentsTotal = 0,
  customRefundAmount = 0,
  previouslyRefunded = 0,
  maxRefundAllowed = 0,
  cardFeeDeduction = 0,
  salesTaxPercent,
  isCustomAmount = false,
  hasItemSelection = false,
  onCustomAmountChange,
  refundComplete = false,
}) {
  const [sFocused, _setFocused] = useState(false);
  const [sCustomDisp, _setCustomDisp] = useState("");

  // Grand total: items take priority, then payments, then custom
  let grandTotalRefund = isCustomAmount
    ? customRefundAmount
    : hasItemSelection
    ? itemRefundTotal
    : selectedPaymentsTotal;

  // Exceeds limit check
  let exceedsLimit = grandTotalRefund > maxRefundAllowed;

  function handleCustomAmountInput(val) {
    let result = usdTypeMask(val, { withDollar: false });
    _setCustomDisp(result.display);
    if (onCustomAmountChange) onCustomAmountChange(result.cents);
  }

  return (
    <View style={{ padding: 10 }}>
      <Text
        style={{
          fontSize: 14,
          fontWeight: Fonts.weight.textHeavy,
          color: C.text,
          marginBottom: 8,
          borderBottomWidth: 1,
          borderBottomColor: gray(0.1),
          paddingBottom: 6,
        }}
      >
        REFUND TOTALS
      </Text>

      {/* Original Sale Info */}
      <TotalRow
        label="ORIGINAL SALE TOTAL"
        value={originalSale?.total || 0}
      />

      {previouslyRefunded > 0 && (
        <TotalRow
          label="PREVIOUSLY REFUNDED"
          value={`-${formatCurrencyDisp(previouslyRefunded)}`}
          color={C.lightred}
        />
      )}

      <TotalRow
        label="MAX REFUND REMAINING"
        value={maxRefundAllowed}
        bold
      />

      {cardFeeDeduction > 0 && (
        <TotalRow
          label="CARD FEE (non-refundable)"
          value={`-${formatCurrencyDisp(cardFeeDeduction)}`}
          color={C.lightText}
          fontSize={11}
        />
      )}

      {/* Divider */}
      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: gray(0.15),
          marginVertical: 8,
        }}
      />

      {/* Selected Items Total */}
      {!isCustomAmount && hasItemSelection && (
        <>
          <TotalRow
            label="SELECTED ITEMS"
            value={selectedItemsTotal}
          />
          {salesTaxPercent > 0 && (
            <TotalRow
              label={`TAX (${salesTaxPercent}%)`}
              value={itemRefundTotal - selectedItemsTotal}
              fontSize={11}
              color={C.lightText}
            />
          )}
        </>
      )}

      {/* Selected Payments Total */}
      {!isCustomAmount && !hasItemSelection && selectedPaymentsTotal > 0 && (
        <TotalRow
          label="SELECTED PAYMENTS"
          value={selectedPaymentsTotal}
        />
      )}

      {/* Custom Amount Input */}
      {isCustomAmount && (
        <View style={{ marginBottom: 8 }}>
          <Text style={{ fontSize: 11, color: C.lightText, marginBottom: 3 }}>
            Custom Refund Amount
          </Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              borderWidth: 1,
              borderColor: sFocused ? C.lightred : gray(0.15),
              borderRadius: 6,
              paddingHorizontal: 8,
              paddingVertical: 6,
              backgroundColor: "white",
            }}
          >
            <Text style={{ fontSize: 14, color: C.lightred, marginRight: 2 }}>$</Text>
            <TextInput
              style={{
                flex: 1,
                outlineWidth: 0,
                outlineStyle: "none",
                fontSize: 14,
                color: C.lightred,
                textAlign: "right",
              }}
              value={sCustomDisp}
              onChangeText={handleCustomAmountInput}
              placeholder="0.00"
              placeholderTextColor={gray(0.3)}
              onFocus={() => _setFocused(true)}
              onBlur={() => _setFocused(false)}
              editable={!refundComplete}
            />
          </View>
        </View>
      )}

      {/* Divider */}
      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: gray(0.15),
          marginVertical: 6,
        }}
      />

      {/* Total Refund */}
      <TotalRow
        label="TOTAL REFUND"
        value={grandTotalRefund}
        bold
        color={exceedsLimit ? C.lightred : C.text}
        fontSize={16}
      />

      {/* Error: Exceeds limit */}
      {exceedsLimit && (
        <View
          style={{
            backgroundColor: "rgb(252, 235, 235)",
            borderRadius: 6,
            padding: 8,
            marginTop: 6,
          }}
        >
          <Text
            style={{
              fontSize: 11,
              color: C.lightred,
              fontWeight: Fonts.weight.textHeavy,
              textAlign: "center",
            }}
          >
            Refund exceeds maximum allowed ({formatCurrencyDisp(maxRefundAllowed)})
          </Text>
        </View>
      )}

      {/* Refund Complete */}
      {refundComplete && (
        <View
          style={{
            backgroundColor: "rgb(232, 243, 239)",
            borderRadius: 6,
            padding: 8,
            marginTop: 8,
            alignItems: "center",
          }}
        >
          <Text
            style={{
              fontSize: 14,
              fontWeight: Fonts.weight.textHeavy,
              color: C.green,
            }}
          >
            REFUND COMPLETE
          </Text>
        </View>
      )}
    </View>
  );
}

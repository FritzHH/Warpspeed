/* eslint-disable */
import { View, Text, Image } from "react-native-web";
import { memo } from "react";
import { C, Fonts, ICONS } from "../../../../styles";
import {
  formatCurrencyDisp,
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

export const RefundTotals = memo(function RefundTotals({
  originalSale,
  selectedItemsTotal = 0,
  itemRefundTotal = 0,
  selectedPaymentsTotal = 0,
  previouslyRefunded = 0,
  maxRefundAllowed = 0,
  cardFeeDeduction = 0,
  salesTaxPercent,
  hasItemSelection = false,
  refundComplete = false,
}) {
  let grandTotalRefund = hasItemSelection ? itemRefundTotal : selectedPaymentsTotal;

  // Exceeds limit check
  let exceedsLimit = grandTotalRefund > maxRefundAllowed;

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

      {(originalSale?.creditsApplied || []).length > 0 && (
        <TotalRow
          label="STORE CREDIT (non-refundable)"
          value={`-${formatCurrencyDisp((originalSale.creditsApplied || []).reduce((s, c) => s + (c.amount || 0), 0))}`}
          color={C.lightText}
          fontSize={11}
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
      {hasItemSelection && (
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
      {!hasItemSelection && selectedPaymentsTotal > 0 && (
        <TotalRow
          label="SELECTED PAYMENTS"
          value={selectedPaymentsTotal}
        />
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
        color={refundComplete ? C.lightText : exceedsLimit ? C.lightred : C.text}
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
            backgroundColor: C.green,
            borderRadius: 10,
            paddingBottom: 10,
            paddingHorizontal: 14,
            marginTop: 4,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Image
            source={ICONS.popperCelebration}
            style={{ width: 130, height: 130, marginTop: -5 }}
            resizeMode="contain"
          />
          <Text
            style={{
              fontSize: 17,
              fontWeight: Fonts.weight.textSuperheavy,
              color: "white",
              letterSpacing: 1.5,
            }}
          >
            REFUND COMPLETE
          </Text>
        </View>
      )}
    </View>
  );
});

/* eslint-disable */
import { memo } from "react";
import styles from "./RefundTotals.module.css";
import { C, Fonts, ICONS } from "../../../../styles";
import { formatCurrencyDisp } from "../../../../utils";

function TotalRow({ label, value, color, bold, fontSize = 13 }) {
  let textStyle = {
    fontSize,
    color: color || C.text,
    fontWeight: bold ? Fonts.weight.textHeavy : Fonts.weight.textRegular,
  };
  return (
    <div className={styles.totalRow}>
      <span style={textStyle}>{label}</span>
      <span style={textStyle}>
        {typeof value === "number" ? formatCurrencyDisp(value) : value}
      </span>
    </div>
  );
}

function resolveIcon(src) {
  if (!src) return null;
  return typeof src === "object" ? src.default || src : src;
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
  lastRefundAmount = 0,
  customerFirst = "",
}) {
  let grandTotalRefund = hasItemSelection ? itemRefundTotal : selectedPaymentsTotal;
  let exceedsLimit = grandTotalRefund > maxRefundAllowed;

  return (
    <div className={styles.container}>
      <div
        className={styles.title}
        style={{
          color: C.text,
          fontWeight: Fonts.weight.textHeavy,
          borderBottomColor: C.borderSubtle,
        }}
      >
        REFUND TOTALS
      </div>

      <TotalRow label="ORIGINAL SALE TOTAL" value={originalSale?.total || 0} />

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

      <TotalRow label="MAX REFUND REMAINING" value={maxRefundAllowed} bold />

      {cardFeeDeduction > 0 && (
        <TotalRow
          label="CARD FEE (non-refundable)"
          value={`-${formatCurrencyDisp(cardFeeDeduction)}`}
          color={C.lightText}
          fontSize={11}
        />
      )}

      <div className={styles.divider} style={{ borderTopColor: C.borderSubtle }} />

      {hasItemSelection && (
        <>
          <TotalRow label="SELECTED ITEMS" value={selectedItemsTotal} />
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

      {!hasItemSelection && selectedPaymentsTotal > 0 && (
        <TotalRow label="SELECTED PAYMENTS" value={selectedPaymentsTotal} />
      )}

      <div className={styles.dividerTight} style={{ borderTopColor: C.borderSubtle }} />

      <TotalRow
        label="TOTAL REFUND"
        value={grandTotalRefund}
        bold
        color={refundComplete ? C.lightText : exceedsLimit ? C.lightred : C.text}
        fontSize={16}
      />

      {exceedsLimit && (
        <div
          className={styles.exceedsBox}
          style={{ backgroundColor: "rgb(252, 235, 235)" }}
        >
          <div
            className={styles.exceedsText}
            style={{
              color: C.lightred,
              fontWeight: Fonts.weight.textHeavy,
            }}
          >
            Refund exceeds maximum allowed ({formatCurrencyDisp(maxRefundAllowed)})
          </div>
        </div>
      )}

      {refundComplete && (
        <div className={styles.completeBox} style={{ backgroundColor: C.green }}>
          <img
            src={resolveIcon(ICONS.popperCelebration)}
            alt=""
            className={styles.completeImage}
          />
          <div
            className={styles.completeHeading}
            style={{ fontWeight: Fonts.weight.textSuperheavy }}
          >
            REFUND COMPLETE
          </div>
          {lastRefundAmount > 0 && (
            <div
              className={styles.completeReturn}
              style={{ color: C.text, fontWeight: Fonts.weight.textHeavy }}
            >
              {"Return " + formatCurrencyDisp(lastRefundAmount, true) + " to " + (customerFirst ? customerFirst.charAt(0).toUpperCase() + customerFirst.slice(1).toLowerCase() : "customer")}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

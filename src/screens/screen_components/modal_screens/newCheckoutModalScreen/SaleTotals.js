/* eslint-disable */
import { memo } from "react";
import styles from "./SaleTotals.module.css";
import { C } from "../../../../styles";
import { formatCurrencyDisp } from "../../../../utils";

function TotalRow({ label, value, labelStyle, valueStyle }) {
  let displayValue =
    typeof value === "number" ? formatCurrencyDisp(value) : value;

  return (
    <div className={styles.totalRow}>
      <span
        className={styles.totalRowLabel}
        style={{ color: C.textMuted, ...labelStyle }}
      >
        {label}
      </span>
      <div className={styles.totalRowValueWrap}>
        <span className={styles.dollarSign} style={{ color: C.green }}>
          $
        </span>
        <span
          className={styles.totalRowValue}
          style={{ color: C.textMuted, ...valueStyle }}
        >
          {displayValue}
        </span>
      </div>
    </div>
  );
}

function Divider() {
  return (
    <div
      className={styles.divider}
      style={{ backgroundColor: C.buttonLightGreenOutline }}
    />
  );
}

export const PaymentStatus = memo(function PaymentStatus({ sale, amountRemaining }) {
  if (!sale) return null;

  return (
    <div className={styles.statusContainer}>
      {(sale.amountCaptured || 0) > 0 && !sale.paymentComplete && (
        <span className={styles.amountText} style={{ color: C.textSecondary }}>
          {"AMOUNT PAID:   $" + formatCurrencyDisp(sale.amountCaptured || 0)}
        </span>
      )}

      {amountRemaining > 0 && (
        <span className={styles.amountText} style={{ color: C.green }}>
          {"AMOUNT LEFT TO PAY:   $" + formatCurrencyDisp(amountRemaining)}
        </span>
      )}

      {sale.paymentComplete && (
        <div className={styles.successPill} style={{ backgroundColor: C.green }}>
          <span className={styles.successText} style={{ color: C.textWhite }}>
            PAYMENT COMPLETE
          </span>
        </div>
      )}
    </div>
  );
});

export const CashChangeNeeded = memo(function CashChangeNeeded({ cashChangeNeeded }) {
  if (!cashChangeNeeded || cashChangeNeeded <= 0) return null;
  return (
    <div
      className={styles.changeBox}
      style={{
        borderColor: C.buttonLightGreenOutline,
        backgroundColor: C.green,
      }}
    >
      <span className={styles.changeLabel} style={{ color: C.textSecondary }}>
        CHANGE NEEDED
      </span>
      <span className={styles.changeAmount} style={{ color: C.textWhite }}>
        <span className={styles.changeAmountDollar}>$</span>
        {formatCurrencyDisp(cashChangeNeeded)}
      </span>
    </div>
  );
});

export const SaleTotals = memo(function SaleTotals({ sale, settings }) {
  if (!sale) return null;

  let hasDiscount = (sale.discount || 0) > 0;
  let hasCardFee = (sale.cardFee || 0) > 0;
  let amountRemaining = (sale.total || 0) - (sale.amountCaptured || 0);
  if (amountRemaining < 0) amountRemaining = 0;

  return (
    <div className={styles.totalsWrap}>
      <div
        className={styles.totalsBox}
        style={{ borderColor: C.buttonLightGreenOutline }}
      >
        <TotalRow label="SUBTOTAL" value={sale.subtotal || 0} />

        {hasDiscount && <Divider />}
        {hasDiscount && (
          <TotalRow
            label="DISCOUNT"
            labelStyle={{ marginLeft: 15 }}
            value={`- ${formatCurrencyDisp(sale.discount)}`}
          />
        )}

        {hasDiscount && (
          <TotalRow
            label="DISCOUNTED TOTAL"
            labelStyle={{ marginLeft: 15 }}
            value={(sale.subtotal || 0) - (sale.discount || 0)}
          />
        )}
        {hasDiscount && <Divider />}

        <TotalRow label="SALES TAX" value={sale.salesTax || 0} />

        {hasCardFee && (
          <TotalRow
            label={`CARD FEE (${sale.cardFeePercent || 0}%)`}
            value={sale.cardFee}
          />
        )}

        <Divider />

        <TotalRow
          label="TOTAL SALE"
          value={sale.total || 0}
          labelStyle={{ fontSize: 16 }}
          valueStyle={{ fontWeight: 500, fontSize: 18, color: C.textSecondary }}
        />
      </div>
    </div>
  );
});

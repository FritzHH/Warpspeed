/* eslint-disable */
import { memo } from "react";
import styles from "./PaymentsList.module.css";
import { C } from "../../../../styles";
import { Tooltip, Pressable } from "../../../../dom_components";
import { formatCurrencyDisp, formatMillisForDisplay } from "../../../../utils";
import { dlog, DCAT } from "./checkoutDebugLog";

const PaymentRow = memo(function PaymentRow({ payment, onRefund, onPress }) {
  let isCash = payment.method === "cash";
  let isCheck = payment.method === "check";
  let isCard = !isCash && !isCheck;

  let amountRefunded = (payment.refunds || []).reduce((sum, r) => sum + (r.amount || 0), 0);
  let fullyRefunded = amountRefunded > 0 && payment.amountCaptured <= amountRefunded;

  function getPaymentLabel() {
    if (isCheck) return "CHECK SALE";
    if (isCash) return "CASH SALE";
    return "CARD SALE";
  }

  function getAmountLabel() {
    if (isCheck) return "Check received";
    if (isCash) return "Cash received";
    return "Card payment received";
  }

  let content = (
    <div
      className={styles.card}
      style={{ backgroundColor: C.listItemWhite }}
    >
      <div className={styles.cardTopRow}>
        <span className={styles.typeLabel} style={{ color: C.green }}>
          {getPaymentLabel()}
        </span>
        {fullyRefunded && (
          <div className={styles.pill} style={{ backgroundColor: C.borderStrong }}>
            <span className={styles.pillText} style={{ color: C.textWhite }}>Fully Refunded</span>
          </div>
        )}
        {onRefund && !fullyRefunded && (
          <Tooltip text="Refund this payment" position="top">
            <Pressable
              onPress={(e) => {
                if (e && e.stopPropagation) e.stopPropagation();
                dlog(DCAT.BUTTON, "refund", "PaymentsList", { paymentId: payment.id, method: payment.method, amount: payment.amountCaptured });
                onRefund();
              }}
              className={styles.pill}
              style={{ backgroundColor: C.green }}
            >
              <span className={styles.pillText} style={{ color: C.textWhite }}>
                REFUND
              </span>
            </Pressable>
          </Tooltip>
        )}
      </div>

      <div className={styles.row}>
        <span style={{ color: C.text }}>{getAmountLabel()}</span>
        <span style={{ color: C.text }}>{formatCurrencyDisp(payment.amountCaptured, true)}</span>
      </div>

      {(isCard && payment.last4) ? (
        <div className={styles.row}>
          <span className={styles.cardSmall} style={{ color: C.textMuted }}>
            {(payment.cardType || payment.cardIssuer || "").split(" ")[0].toUpperCase() + "  ***" + payment.last4}
          </span>
          {payment.expMonth && (
            <span className={styles.cardSmall} style={{ color: C.textMuted }}>
              {payment.expMonth + "/" + payment.expYear}
            </span>
          )}
        </div>
      ) : null}

      {amountRefunded > 0 && (
        <div className={styles.row}>
          <span className={styles.cardSmall} style={{ color: C.red }}>
            Previous Refund amount
          </span>
          <span className={styles.cardSmall} style={{ color: C.red }}>
            {formatCurrencyDisp(amountRefunded, true)}
          </span>
        </div>
      )}

      {!!isCash && (
        <div className={styles.row}>
          <span style={{ color: C.text }}>Amount Tendered</span>
          <span style={{ color: C.text }}>{formatCurrencyDisp(payment.amountTendered, true)}</span>
        </div>
      )}
    </div>
  );

  return (
    <Tooltip text="Click to print paper receipt" position="top">
      <Pressable
        onPress={onPress || undefined}
        activeOpacity={onPress ? 0.6 : 1}
      >
        {content}
      </Pressable>
    </Tooltip>
  );
});

const CreditRow = memo(function CreditRow({ credit, onPrintDepositReceipt, onRemoveDeposit }) {
  let isGiftCard = credit.type === "giftcard";
  let isCredit = credit.type === "credit";
  let method = credit._method || "cash";
  let paidByCash = method === "cash";
  let paidByCard = method !== "cash";

  function getCreditLabel() {
    if (isCredit) return "ACCOUNT CREDIT";
    if (isGiftCard) return "GIFT CARD";
    if (paidByCard && credit._last4) return "CARD DEPOSIT";
    return "DEPOSIT";
  }

  let labelColor = isGiftCard ? C.orange : isCredit ? C.orange : C.blue;

  let content = (
    <div
      className={styles.card}
      style={{ backgroundColor: C.listItemWhite }}
    >
      <div className={styles.cardTopRow}>
        <span className={styles.typeLabel} style={{ color: labelColor }}>
          {getCreditLabel()}
        </span>
      </div>

      <div className={styles.row}>
        <span style={{ color: C.text }}>Amount applied</span>
        <span style={{ color: C.text }}>{formatCurrencyDisp(credit.amount, true)}</span>
      </div>

      {credit._originalAmount && credit.amount < credit._originalAmount && (
        <div className={styles.row}>
          <span className={styles.noteSmall} style={{ color: C.textMuted }}>
            {"of " + formatCurrencyDisp(credit._originalAmount, true) + " total"}
          </span>
          <span className={styles.partialTag} style={{ color: C.blue }}>PARTIAL</span>
        </div>
      )}

      {credit._millis ? (
        <div className={styles.row}>
          <span className={styles.dateSmall} style={{ color: C.textMuted }}>
            {formatMillisForDisplay(credit._millis)}
          </span>
          {!isCredit && (
            <span className={styles.dateSmall} style={{ color: C.textMuted }}>
              {paidByCard && credit._last4 ? "Card ***" + credit._last4 : paidByCash ? "Cash" : ""}
            </span>
          )}
        </div>
      ) : null}

      {!!credit._note && (
        <span className={styles.noteLines} style={{ color: C.textMuted }}>
          {credit._note}
        </span>
      )}
    </div>
  );

  let tooltipText = onRemoveDeposit
    ? "- Click to print paper receipt\n- Right-click to adjust or remove deposit"
    : "Click to print paper receipt";

  let handlePress = onPrintDepositReceipt && credit._depositSaleID ? onPrintDepositReceipt : undefined;

  return (
    <Tooltip text={tooltipText} position="top">
      <Pressable
        onPress={handlePress}
        onRightPress={onRemoveDeposit || undefined}
        activeOpacity={handlePress ? 0.6 : 1}
      >
        {content}
      </Pressable>
    </Tooltip>
  );
});

export const PaymentsList = memo(function PaymentsList({ payments = [], credits = [], onRefund, onPrintReceipt, onPrintDepositReceipt, onRemoveDeposit }) {
  if ((!payments || payments.length === 0) && (!credits || credits.length === 0)) return null;
  return (
    <div className={styles.list}>
      <div className={styles.listInner}>
        {credits.map((credit, idx) => (
          <CreditRow
            key={credit.id || idx}
            credit={credit}
            onPrintDepositReceipt={onPrintDepositReceipt ? () => onPrintDepositReceipt(credit) : null}
            onRemoveDeposit={onRemoveDeposit ? () => onRemoveDeposit(credit) : null}
          />
        ))}
        {payments.sort((a, b) => {
          let aRefunded = (a.refunds || []).reduce((s, r) => s + (r.amount || 0), 0);
          let bRefunded = (b.refunds || []).reduce((s, r) => s + (r.amount || 0), 0);
          let aFull = a.amountCaptured <= aRefunded ? 1 : 0;
          let bFull = b.amountCaptured <= bRefunded ? 1 : 0;
          return aFull - bFull;
        }).map((payment, idx) => (
          <PaymentRow
            key={payment.id || idx}
            payment={payment}
            onRefund={onRefund ? () => onRefund(payment) : null}
            onPress={onPrintReceipt ? () => onPrintReceipt(payment) : null}
          />
        ))}
      </div>
    </div>
  );
});

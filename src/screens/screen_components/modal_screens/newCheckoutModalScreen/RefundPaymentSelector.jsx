/* eslint-disable */
import { memo, useState } from "react";
import { C, Fonts } from "../../../../styles";
import { formatCurrencyDisp, usdTypeMask } from "../../../../utils";
import dayjs from "dayjs";
import { dlog, DCAT } from "./checkoutDebugLog";
import styles from "./RefundPaymentSelector.module.css";

function formatTransactionDate(millis) {
  let d = dayjs(millis);
  let day = d.date();
  let suffix = day % 10 === 1 && day !== 11 ? "st" : day % 10 === 2 && day !== 12 ? "nd" : day % 10 === 3 && day !== 13 ? "rd" : "th";
  let fmt = d.year() === dayjs().year() ? "ddd, MMM " : "ddd, MMM ";
  return d.format(fmt) + day + suffix + (d.year() !== dayjs().year() ? ", " + d.year() : "");
}

const BADGE_COLORS = {
  credit: "rgb(103, 124, 231)",
  deposit: C.green,
  giftcard: C.blue,
};

const BADGE_LABELS = {
  credit: "CREDIT",
  deposit: "DEPOSIT",
  giftcard: "GIFT CARD",
};

const CreditDepositRow = memo(function CreditDepositRow({
  item,
  isSelected,
  onSelect,
  isDisabled,
  returnMode,
  onReturnModeChange,
  customAmountDisp,
  onCustomAmountChange,
}) {
  let [sShowCustom, _setShowCustom] = useState(false);
  let amountRefunded = (item.refunds || []).reduce((s, r) => s + (r.amount || 0), 0);
  let available = item.amount - amountRefunded;
  let fullyRefunded = available <= 0;
  let isCredit = item.type === "credit";
  let badgeColor = BADGE_COLORS[item.type] || "rgb(103, 124, 231)";
  let badgeLabel = BADGE_LABELS[item.type] || "CREDIT";

  let rowBg = isSelected
    ? "rgb(237, 232, 252)"
    : fullyRefunded
    ? C.surfaceAlt
    : "transparent";

  let interactionDisabled = isDisabled || fullyRefunded;

  function handleRowClick() {
    if (!interactionDisabled) {
      dlog(DCAT.BUTTON, "selectCreditDeposit", "RefundPaymentSelector", { id: item.id, type: item.type, amount: item.amount });
      onSelect(item);
    }
  }

  return (
    <button
      type="button"
      onClick={handleRowClick}
      disabled={interactionDisabled}
      className={styles.creditRow}
      style={{
        borderBottomColor: C.borderSubtle,
        backgroundColor: rowBg,
        opacity: interactionDisabled ? 0.4 : 1,
      }}
    >
      {!isCredit && isSelected && (
        <div className={styles.returnModeRow}>
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onReturnModeChange("account"); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); onReturnModeChange("account"); } }}
            className={styles.returnModeBtn}
            style={{
              backgroundColor: returnMode === "account" ? "rgb(103, 124, 231)" : C.surfaceAlt,
            }}
          >
            <span
              className={styles.returnModeText}
              style={{
                fontWeight: Fonts.weight.textHeavy,
                color: returnMode === "account" ? "white" : C.lightText,
              }}
            >
              RETURN TO ACCOUNT
            </span>
          </span>
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onReturnModeChange("customer"); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); onReturnModeChange("customer"); } }}
            className={styles.returnModeBtn}
            style={{
              backgroundColor: returnMode === "customer" ? C.green : C.surfaceAlt,
            }}
          >
            <span
              className={styles.returnModeText}
              style={{
                fontWeight: Fonts.weight.textHeavy,
                color: returnMode === "customer" ? "white" : C.lightText,
              }}
            >
              RETURN TO CUSTOMER
            </span>
          </span>
        </div>
      )}

      <div className={styles.rowMain}>
        <div
          className={styles.checkbox}
          style={{
            borderColor: isSelected ? badgeColor : C.borderSubtle,
            backgroundColor: isSelected ? badgeColor : "transparent",
          }}
        >
          {isSelected && <span className={styles.checkboxTick}>✓</span>}
        </div>

        <div className={styles.rowMiddle}>
          <div className={styles.badgeRow}>
            <span className={styles.badge} style={{ backgroundColor: badgeColor }}>
              <span
                className={styles.badgeText}
                style={{ fontWeight: Fonts.weight.textHeavy }}
              >
                {badgeLabel}
              </span>
            </span>
            <span
              className={styles.amountText}
              style={{ fontWeight: Fonts.weight.textHeavy, color: C.text }}
            >
              {formatCurrencyDisp(item.amount)}
            </span>
          </div>

          {(item._note || item._method) && (
            <span className={styles.cardLine} style={{ color: C.lightText }}>
              {item._note || ""}{item._last4 ? ` ****${item._last4}` : ""}
            </span>
          )}

          {amountRefunded > 0 && !fullyRefunded && (
            <span className={styles.refundedText} style={{ color: C.lightred }}>
              Previously refunded: {formatCurrencyDisp(amountRefunded)}
            </span>
          )}

          {!fullyRefunded && (
            <span className={styles.availableText} style={{ color: C.green }}>
              Available: {formatCurrencyDisp(available)}
            </span>
          )}

          {fullyRefunded && (
            <span className={styles.fullyRefundedText} style={{ color: C.lightred }}>
              Fully refunded
            </span>
          )}
        </div>
      </div>

      {isSelected && (isCredit || returnMode === "account") && !fullyRefunded && (
        <div className={styles.customAmountRow}>
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              let next = !sShowCustom;
              _setShowCustom(next);
              if (!next) onCustomAmountChange(0, "");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
                let next = !sShowCustom;
                _setShowCustom(next);
                if (!next) onCustomAmountChange(0, "");
              }
            }}
            className={styles.customAmountBtn}
            style={{
              backgroundColor: sShowCustom ? "rgb(103, 124, 231)" : C.surfaceAlt,
            }}
          >
            <span
              className={styles.returnModeText}
              style={{
                fontWeight: Fonts.weight.textHeavy,
                color: sShowCustom ? "white" : C.lightText,
              }}
            >
              CUSTOM AMOUNT
            </span>
          </span>
          {sShowCustom && (
            <div
              className={styles.customAmountInputWrap}
              style={{ borderColor: C.borderSubtle }}
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="text"
                className={styles.customAmountInput}
                style={{ color: C.text }}
                value={customAmountDisp}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  let val = e.target.value;
                  let result = usdTypeMask(val, { withDollar: false });
                  let maxCents = available;
                  if (result.cents > maxCents) {
                    onCustomAmountChange(maxCents, formatCurrencyDisp(maxCents));
                  } else {
                    onCustomAmountChange(result.cents, result.display);
                  }
                }}
                placeholder="0.00"
              />
            </div>
          )}
        </div>
      )}
    </button>
  );
});

const PaymentSelectRow = memo(function PaymentSelectRow({ payment, isSelected, onSelect, isDisabled }) {
  let isCash = payment.method === "cash";
  let isCheck = payment.method === "check";
  let isLightspeedCard = !isCash && !isCheck && payment._importSource === "lightspeed";
  let typeLabel = isCheck ? "CHECK" : isCash ? "CASH" : "CARD";
  let amountRefunded = (payment.refunds || []).reduce((s, r) => s + (r.amount || 0), 0);
  let available = payment.amountCaptured - amountRefunded;
  let fullyRefunded = available <= 0;

  let interactionDisabled = isDisabled || fullyRefunded;

  let rowBg = isSelected
    ? "rgb(230, 240, 252)"
    : isLightspeedCard
    ? "rgb(255, 248, 230)"
    : fullyRefunded
    ? C.surfaceAlt
    : "transparent";

  function handleClick() {
    if (!interactionDisabled) {
      dlog(DCAT.BUTTON, "selectPayment", "RefundPaymentSelector", { paymentId: payment.id, method: payment.method });
      onSelect(payment);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={interactionDisabled}
      className={styles.row}
      style={{
        borderBottomColor: C.borderSubtle,
        backgroundColor: rowBg,
        opacity: interactionDisabled ? 0.4 : 1,
      }}
    >
      <div
        className={styles.checkbox}
        style={{
          borderColor: isSelected ? C.blue : C.borderSubtle,
          backgroundColor: isSelected ? C.blue : "transparent",
        }}
      >
        {isSelected && <span className={styles.checkboxTick}>✓</span>}
      </div>

      <div className={styles.rowMiddle}>
        <div className={styles.badgeRow}>
          <span
            className={styles.badge}
            style={{ backgroundColor: isCash || isCheck ? C.green : C.blue }}
          >
            <span
              className={styles.badgeText}
              style={{ fontWeight: Fonts.weight.textHeavy }}
            >
              {typeLabel}
            </span>
          </span>
          <span
            className={styles.amountText}
            style={{ fontWeight: Fonts.weight.textHeavy, color: C.text }}
          >
            {formatCurrencyDisp(payment.amountCaptured)}
          </span>
        </div>

        {!isCash && !isCheck && payment.last4 && (
          <span className={styles.cardLine} style={{ color: C.lightText }}>
            {payment.cardIssuer} ****{payment.last4} {payment.expMonth}/{payment.expYear}
          </span>
        )}

        {isLightspeedCard && (
          <span
            className={styles.lsIndicator}
            style={{ backgroundColor: "rgb(255, 237, 180)" }}
          >
            <span
              className={styles.lsIndicatorText}
              style={{ fontWeight: Fonts.weight.textHeavy, color: "rgb(140, 100, 0)" }}
            >
              LIGHTSPEED - CASH REFUND ONLY
            </span>
          </span>
        )}

        {amountRefunded > 0 && (
          <span className={styles.refundedText} style={{ color: C.lightred }}>
            Previously refunded: {formatCurrencyDisp(amountRefunded)}
          </span>
        )}

        {!fullyRefunded && !isCash && !isCheck && (
          <span className={styles.availableText} style={{ color: C.green }}>
            Available: {formatCurrencyDisp(available)}
          </span>
        )}

        {fullyRefunded && (
          <span className={styles.fullyRefundedText} style={{ color: C.lightred }}>
            Fully refunded
          </span>
        )}

        {!!payment.millis && (
          <span className={styles.dateText} style={{ color: C.lightText }}>
            {formatTransactionDate(payment.millis)}
          </span>
        )}
      </div>
    </button>
  );
});

export const RefundPaymentSelector = memo(function RefundPaymentSelector({
  payments = [],
  selectedPayments = [],
  onSelectPayment,
  creditsApplied = [],
  depositsApplied = [],
  selectedItem = null,
  onSelectItem,
  returnMode = "account",
  onReturnModeChange,
  customAmountDisp = "",
  onCustomAmountChange,
  disabled = false,
}) {
  let hasItemSelected = !!selectedItem;
  let isReturnToCustomer = hasItemSelected && returnMode === "customer" && selectedItem.type !== "credit";
  let hasPaymentsSelected = selectedPayments.length > 0;
  let allCreditsAndDeposits = [...creditsApplied, ...depositsApplied];

  let allRefunds = [];
  payments.forEach((t) => {
    (t.refunds || []).forEach((r) => {
      allRefunds.push({ ...r, _parentMethod: t.method, _parentLast4: t.last4, _parentCardIssuer: t.cardIssuer });
    });
  });

  return (
    <div className={styles.container}>
      <div
        className={styles.title}
        style={{
          fontWeight: Fonts.weight.textHeavy,
          color: C.text,
          borderBottomColor: C.borderSubtle,
        }}
      >
        ORIGINAL PAYMENTS
      </div>
      <div className={styles.subtitle} style={{ color: C.lightText }}>
        Select payments to refund
      </div>

      <div>
        {payments.map((payment, idx) => {
          let isSelected = selectedPayments.some((p) => p.id === payment.id);
          let paymentIsCash = payment.method === "cash" || payment.method === "check";
          let isLsCard = !paymentIsCash && payment._importSource === "lightspeed";

          let rowDisabled = disabled || (hasItemSelected && !isReturnToCustomer);
          if (!rowDisabled && selectedPayments.length > 0 && !isSelected) {
            let selFirst = selectedPayments[0];
            let selIsCashLike = selFirst.method === "cash" || selFirst.method === "check" || (selFirst._importSource === "lightspeed");
            let thisCashLike = paymentIsCash || isLsCard;
            if (thisCashLike !== selIsCashLike) {
              rowDisabled = true;
            } else if (!thisCashLike) {
              rowDisabled = true;
            }
          }

          return (
            <PaymentSelectRow
              key={payment.id || idx}
              payment={payment}
              isSelected={isSelected}
              onSelect={onSelectPayment}
              isDisabled={rowDisabled}
            />
          );
        })}

        {allCreditsAndDeposits.length > 0 && (
          <div
            className={styles.section}
            style={{ borderTopColor: C.borderSubtle }}
          >
            <div
              className={styles.sectionTitle}
              style={{ fontWeight: Fonts.weight.textHeavy, color: C.lightText }}
            >
              CREDITS & DEPOSITS
            </div>
            {allCreditsAndDeposits.map((item, idx) => {
              let isSelected = selectedItem?.id === item.id;
              let rowDisabled = disabled || hasPaymentsSelected || (hasItemSelected && !isSelected);
              return (
                <CreditDepositRow
                  key={item.id || "cd" + idx}
                  item={item}
                  isSelected={isSelected}
                  onSelect={onSelectItem}
                  isDisabled={rowDisabled}
                  returnMode={isSelected ? returnMode : "account"}
                  onReturnModeChange={onReturnModeChange}
                  customAmountDisp={isSelected ? customAmountDisp : ""}
                  onCustomAmountChange={onCustomAmountChange}
                />
              );
            })}
          </div>
        )}

        {allRefunds.length > 0 && (
          <div
            className={styles.section}
            style={{ borderTopColor: C.borderSubtle }}
          >
            <div
              className={styles.sectionTitle}
              style={{ fontWeight: Fonts.weight.textHeavy, color: C.lightText }}
            >
              PREVIOUS REFUNDS
            </div>
            {allRefunds.map((refund, idx) => {
              let methodLabel = refund.method === "cash" ? "CASH" : refund.method === "check" ? "CHECK" : "CARD";
              return (
                <div
                  key={refund.id || "r" + idx}
                  className={styles.refundRow}
                  style={{ borderBottomColor: C.borderSubtle }}
                >
                  <div className={styles.rowMiddle}>
                    <div className={styles.badgeRow}>
                      <span className={styles.badge} style={{ backgroundColor: C.lightred }}>
                        <span
                          className={styles.badgeText}
                          style={{ fontWeight: Fonts.weight.textHeavy }}
                        >
                          {methodLabel} REFUND
                        </span>
                      </span>
                      <span
                        className={styles.amountText}
                        style={{ fontWeight: Fonts.weight.textHeavy, color: C.lightred }}
                      >
                        -{formatCurrencyDisp(refund.amount)}
                      </span>
                    </div>
                    {refund._parentLast4 && (
                      <span className={styles.cardLine} style={{ color: C.lightText }}>
                        {refund._parentCardIssuer} ****{refund._parentLast4}
                      </span>
                    )}
                    {!!refund.millis && (
                      <span className={styles.dateText} style={{ color: C.lightText }}>
                        {formatTransactionDate(refund.millis)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});

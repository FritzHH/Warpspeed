import React, { forwardRef } from "react";
import { C } from "../../styles";
import { lightenRGBByPercent, formatCurrencyDisp, formatMillisForDisplay } from "../../utils";
import { useAlertScreenStore } from "../../stores";
import styles from "./DepositsList.module.css";

export const DepositsList = forwardRef(function DepositsList(
  {
    deposits,
    credits,
    onDepositPress,
    onCreditPress,
    className = "",
    style = {},
    "data-testid": testId,
  },
  ref
) {
  let activeDeposits = (deposits || []).filter((d) => d.amountCents > 0);
  let activeCredits = (credits || []).filter((d) => d.amountCents > 0);
  let allItems = [
    ...activeDeposits.map((d) => ({ ...d, _type: "deposit" })),
    ...activeCredits.map((d) => ({ ...d, _type: "credit" })),
  ];

  return (
    <div
      ref={ref}
      className={`${styles.container} ${className}`}
      style={{ borderColor: C.buttonLightGreenOutline, backgroundColor: C.listItemWhite, ...style }}
      data-testid={testId}
    >
      <span className={styles.heading} style={{ color: C.green }}>
        Deposits / Credits / Gift Cards
      </span>
      {allItems.length === 0 && (
        <span className={styles.empty} style={{ color: C.textMuted }}>
          No deposits, credits, or gift cards on file
        </span>
      )}
      {allItems.map((item) => {
        let isCredit = item._type === "credit";
        let isGiftCard = item.type === "giftcard";
        let badgeColor = isGiftCard ? C.orange : isCredit ? C.blue : C.green;
        let noteText = item.note || item.text || "";

        return (
          <button
            key={item.id}
            className={styles.row}
            style={{ borderLeftColor: badgeColor, borderColor: C.buttonLightGreenOutline, backgroundColor: C.listItemWhite }}
            onClick={() => {
              let inUse = (item.reservedCents || 0) > 0;
              if (inUse) {
                let label = isGiftCard ? "gift card" : isCredit ? "credit" : "deposit";
                let actionWord = isCredit ? "make changes" : "issue refunds";
                useAlertScreenStore.getState().setValues({
                  title: "In Use",
                  message: "This " + label + " must be fully released from the sale to " + actionWord + ".",
                  btn1Text: "OK",
                  canExitOnOuterClick: true,
                });
                return;
              }
              isCredit ? onCreditPress?.(item) : onDepositPress?.(item);
            }}
          >
            <div className={styles.rowLeft}>
              <div className={styles.badgeRow}>
                <span
                  className={styles.badge}
                  style={{ backgroundColor: lightenRGBByPercent(badgeColor, 70), color: badgeColor }}
                >
                  {isGiftCard ? "Gift Card" : isCredit ? "Credit" : "Deposit"}
                </span>
                {item.refunded && (
                  <span
                    className={styles.badge}
                    style={{ backgroundColor: lightenRGBByPercent(C.lightred, 70), color: C.lightred }}
                  >
                    Refunded
                  </span>
                )}
                {!!noteText && (
                  <span className={styles.noteText} style={{ color: C.textMuted }}>
                    {noteText}
                  </span>
                )}
              </div>
              <span className={styles.dateText} style={{ color: C.textMuted }}>
                {formatMillisForDisplay(item.millis)}
              </span>
            </div>
            <div className={styles.rowRight}>
              {item.refunded ? (
                <>
                  <span
                    className={styles.amount}
                    style={{ color: C.textMuted, textDecoration: "line-through" }}
                  >
                    {"$" + formatCurrencyDisp(item.amountCents)}
                  </span>
                  <span className={styles.amount} style={{ color: C.text }}>
                    $0
                  </span>
                </>
              ) : (
                <span className={styles.amount} style={{ color: C.text }}>
                  {"$" + formatCurrencyDisp(item.amountCents)}
                </span>
              )}
              {!item.refunded && (item.reservedCents || 0) > 0 && (
                <span className={styles.reservedText} style={{ color: C.orange }}>
                  In use: {"$" + formatCurrencyDisp(item.reservedCents)}
                </span>
              )}
              {!item.refunded && (item.reservedCents || 0) > 0 && item.amountCents > item.reservedCents && (
                <span className={styles.availableText} style={{ color: C.green }}>
                  Available: {"$" + formatCurrencyDisp(item.amountCents - item.reservedCents)}
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
});

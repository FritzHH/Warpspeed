/* eslint-disable */
import { memo } from "react";
import { C, Fonts, COLOR_GRADIENTS, Radius } from "../../../../styles";
import { Button, CheckBox } from "../../../../dom_components";
import { formatCurrencyDisp, formatWorkorderNumber } from "../../../../utils";
import { dlog, DCAT } from "./checkoutDebugLog";
import styles from "./RefundItemSelector.module.css";

const RefundItemRow = memo(function RefundItemRow({
  line,
  workorderNumber,
  isSelected,
  isRefunded,
  isDisabled,
  onToggle,
}) {
  let name = line.inventoryItem?.catalogName || line.inventoryItem?.formalName || "Unknown Item";
  let price = line.discountObj?.newPrice != null
    ? line.discountObj.newPrice
    : line.inventoryItem?.price || 0;

  let rowBg = isRefunded
    ? C.surfaceAlt
    : isSelected
    ? "rgb(252, 235, 235)"
    : "transparent";

  return (
    <div
      className={styles.row}
      style={{
        borderBottomColor: C.borderSubtle,
        backgroundColor: rowBg,
        opacity: isRefunded || isDisabled ? 0.5 : 1,
      }}
    >
      <CheckBox
        isChecked={isSelected || isRefunded}
        onCheck={() => {
          if (!isRefunded && !isDisabled) {
            dlog(DCAT.CHECKBOX, "toggleItem", "RefundItemSelector", { lineId: line.id, itemName: line.inventoryItem?.catalogName || line.inventoryItem?.formalName });
            onToggle(line);
          }
        }}
        enabled={!isRefunded && !isDisabled}
        buttonStyle={{ marginRight: 8 }}
      />
      <div className={styles.rowMiddle}>
        <div className={styles.rowNameLine}>
          <span
            className={styles.itemName}
            style={{
              color: isRefunded ? C.lightText : C.text,
              textDecorationLine: isRefunded ? "line-through" : "none",
            }}
          >
            {name}
          </span>
          {isRefunded && (
            <div
              className={styles.refundedBadge}
              style={{ backgroundColor: C.lightred }}
            >
              <span
                className={styles.refundedBadgeText}
                style={{ fontWeight: Fonts.weight.textHeavy }}
              >
                REFUNDED
              </span>
            </div>
          )}
        </div>
        {workorderNumber && (
          <div
            className={styles.workorderSubLabel}
            style={{ color: C.lightText }}
          >
            WO #{formatWorkorderNumber(workorderNumber)}
          </div>
        )}
      </div>
      <span
        className={styles.itemPrice}
        style={{
          fontWeight: Fonts.weight.textHeavy,
          color: isRefunded ? C.lightText : C.text,
        }}
      >
        {formatCurrencyDisp(price)}
      </span>
    </div>
  );
});

export const RefundItemSelector = memo(function RefundItemSelector({
  workordersInSale = [],
  selectedItems = [],
  onToggleItem,
  onClearItems,
  previouslyRefundedIDs = [],
  disabledItemIDs = new Set(),
  hasPaymentSelection = false,
  isDepositSale = false,
  isActiveSale = false,
}) {
  function isItemSelected(line) {
    return selectedItems.some((s) => s.id === line.id);
  }

  function isItemRefunded(line) {
    return previouslyRefundedIDs.includes(line.id) ||
      previouslyRefundedIDs.includes(line._originalLineId);
  }

  // Active/partial sales — restrict to payment-level refunds only
  if (isActiveSale) {
    return (
      <div className={styles.partialContainer}>
        <div
          className={styles.partialBox}
          style={{ backgroundColor: "rgb(252, 243, 225)" }}
        >
          <div className={styles.partialWarnIcon}>{"\u26A0"}</div>
          <div
            className={styles.partialTitle}
            style={{ fontWeight: Fonts.weight.textHeavy, color: C.orange }}
          >
            PARTIAL SALE
          </div>
          <div
            className={styles.partialDescription}
            style={{ color: C.text }}
          >
            Item-level refunds are not available for sales that are still in progress. Select a payment on the left to refund by amount.
          </div>
          <div
            className={styles.partialDivider}
            style={{ borderTopColor: "rgb(230, 215, 185)" }}
          >
            <div
              className={styles.partialFooter}
              style={{ color: C.lightText }}
            >
              Complete the sale first, then reopen this screen to refund individual items.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div
        className={styles.header}
        style={{ borderBottomColor: C.borderSubtle }}
      >
        <div className={styles.headerLeft}>
          {hasPaymentSelection ? (
            <span
              className={styles.headerWarn}
              style={{ color: C.orange, fontWeight: Fonts.weight.textHeavy }}
            >
              UNCHECK ALL PAYMENTS TO SELECT ITEMS
            </span>
          ) : (
            <span
              className={styles.headerTitle}
              style={{ fontWeight: Fonts.weight.textHeavy, color: C.text }}
            >
              SELECT ITEMS TO REFUND
            </span>
          )}
        </div>
        <Button
          text="CLEAR LIST"
          onPress={() => { dlog(DCAT.BUTTON, "clearList", "RefundItemSelector"); onClearItems(); }}
          enabled={selectedItems.length > 0}
          colorGradientArr={COLOR_GRADIENTS.grey}
          textStyle={{ fontSize: 10 }}
          buttonStyle={{
            paddingTop: 3,
            paddingBottom: 3,
            paddingLeft: 10,
            paddingRight: 10,
            borderRadius: Radius.control,
            opacity: selectedItems.length > 0 ? 1 : 0.3,
          }}
        />
      </div>

      <div className={styles.scroll}>
        {workordersInSale.map((wo) => (
          <div key={wo.id}>
            {workordersInSale.length > 1 && (
              <div
                className={styles.workorderHeader}
                style={{ fontWeight: Fonts.weight.textHeavy, color: C.lightText }}
              >
                WO #{formatWorkorderNumber(wo.workorderNumber) || wo.id?.slice(-4)}
              </div>
            )}

            {(wo.workorderLines || []).map((line, idx) => (
              <RefundItemRow
                key={line.id || idx}
                line={line}
                workorderNumber={
                  workordersInSale.length > 1
                    ? wo.workorderNumber || wo.id?.slice(-4)
                    : null
                }
                isSelected={isItemSelected(line)}
                isRefunded={isItemRefunded(line)}
                isDisabled={hasPaymentSelection || disabledItemIDs.has(line.id)}
                onToggle={onToggleItem}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
});

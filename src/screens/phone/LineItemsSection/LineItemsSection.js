import { useState } from "react";
import { ICONS } from "../../../styles";
import { formatCurrencyDisp } from "../../../utils";
import { Image, DropdownMenu, TouchableOpacity } from "../../../dom_components";
import styles from "./LineItemsSection.module.css";

const DISCOUNT_DROPDOWN_BUTTON_STYLE = {
  backgroundColor: "transparent",
  borderWidth: 0,
  padding: 6,
};

export function LineItemsSection({
  workorder,
  zSettings,
  runningQty,
  onOpenItemSearch,
  modifyLineQty,
  splitLineItem,
  applyLineDiscount,
  clearLineDiscount,
  deleteLineItem,
}) {
  const [sEditingLineId, _setEditingLineId] = useState(null);

  const lines = workorder.workorderLines || [];
  const zDiscounts = zSettings?.discounts || [];

  return (
    <div className={styles.card}>
      <div className={styles.headerRow}>
        <span className={styles.headerLabel}>ITEMS ({runningQty})</span>
        <TouchableOpacity onPress={onOpenItemSearch} className={styles.addBtn}>
          <Image icon={ICONS.add} size={20} />
        </TouchableOpacity>
      </div>

      {lines.map((line, idx) => {
        const name =
          line.inventoryItem?.formalName ||
          line.inventoryItem?.informalName ||
          "Item";
        const unitPrice = line.useSalePrice
          ? line.inventoryItem?.salePrice
          : line.inventoryItem?.price;
        const lineTotal =
          line.discountObj?.newPrice != null
            ? line.discountObj.newPrice
            : (unitPrice || 0) * (line.qty || 1);
        const isEditing = sEditingLineId === line.id;
        const showUnit = line.qty > 1 || line.discountObj?.newPrice != null;
        const isLast = idx >= lines.length - 1;

        return (
          <div
            key={line.id || idx}
            className={`${styles.lineRow} ${!isLast ? styles.lineRowDivider : ""}`}
          >
            <div className={styles.lineTop}>
              <TouchableOpacity
                onPress={() => _setEditingLineId(isEditing ? null : line.id)}
                className={styles.editBtn}
              >
                <Image icon={ICONS.editPencil} size={16} />
              </TouchableOpacity>
              <div className={styles.lineInfo}>
                <span className={styles.lineName}>{name}</span>
                {line.qty > 1 && (
                  <span className={styles.lineQty}>Qty: {line.qty}</span>
                )}
                {!!line.discountObj?.name && (
                  <span className={styles.lineDiscount}>
                    {line.discountObj.name}
                    {line.discountObj.savings
                      ? " (-$" + formatCurrencyDisp(line.discountObj.savings) + ")"
                      : ""}
                  </span>
                )}
              </div>
              <div className={styles.linePriceCol}>
                {showUnit && (
                  <span
                    className={
                      line.discountObj?.newPrice != null
                        ? styles.unitPriceStrike
                        : styles.unitPrice
                    }
                  >
                    {"$" + formatCurrencyDisp(unitPrice)}
                  </span>
                )}
                <span className={styles.lineTotal}>
                  {formatCurrencyDisp(lineTotal, true)}
                </span>
              </div>
            </div>

            {isEditing && (
              <div className={styles.editControlsRow}>
                <div className={styles.qtyGroup}>
                  <TouchableOpacity
                    onPress={() => modifyLineQty(line, "down")}
                    disabled={line.qty <= 1}
                    className={line.qty <= 1 ? styles.qtyBtnDisabled : styles.qtyBtn}
                  >
                    <Image icon={ICONS.downArrowOrange} size={22} />
                  </TouchableOpacity>
                  <span className={styles.qtyValue}>{line.qty}</span>
                  <TouchableOpacity
                    onPress={() => modifyLineQty(line, "up")}
                    className={styles.qtyBtn}
                  >
                    <Image icon={ICONS.upArrowOrange} size={22} />
                  </TouchableOpacity>
                </div>
                <div className={styles.actionsGroup}>
                  {line.qty > 1 && (
                    <TouchableOpacity
                      onPress={() => splitLineItem(line, idx)}
                      className={styles.actionBtn}
                    >
                      <Image icon={ICONS.axe} size={22} />
                    </TouchableOpacity>
                  )}
                  <DropdownMenu
                    buttonIcon={ICONS.dollar}
                    buttonIconSize={22}
                    buttonStyle={DISCOUNT_DROPDOWN_BUTTON_STYLE}
                    centerMenuVertically={true}
                    centerMenuHorizontally={true}
                    dataArr={[
                      { label: "No Discount" },
                      ...zDiscounts.map((o) => ({ label: o.name })),
                    ]}
                    onSelect={(selected) => {
                      if (selected.label === "No Discount") {
                        clearLineDiscount(line);
                      } else {
                        const discountObj = zDiscounts.find(
                          (o) => o.name === selected.label
                        );
                        if (discountObj) applyLineDiscount(line, discountObj);
                      }
                    }}
                  />
                  <TouchableOpacity
                    onPress={() => {
                      _setEditingLineId(null);
                      deleteLineItem(idx);
                    }}
                    className={styles.actionBtn}
                  >
                    <Image icon={ICONS.trash} size={22} />
                  </TouchableOpacity>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {lines.length === 0 && <span className={styles.emptyText}>No items</span>}
    </div>
  );
}

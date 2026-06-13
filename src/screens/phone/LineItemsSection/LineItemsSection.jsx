import { useState } from "react";
import { ICONS } from "../../../styles";
import { formatCurrencyDisp } from "../../../utils";
import {
  Image,
  LineItemActionRow,
  TouchableOpacity,
} from "../../../dom_components";
import styles from "./LineItemsSection.module.css";

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
          <Image icon={ICONS.add} size={29} />
        </TouchableOpacity>
      </div>

      {lines.map((line, idx) => {
        const name = line.inventoryItem?.catalogName || line.inventoryItem?.formalName || "Item";
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
                className={styles.lineInfo}
              >
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
              </TouchableOpacity>
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
              <LineItemActionRow
                qty={line.qty}
                itemName={name}
                deleteMessage={`${name} will be removed from this workorder.`}
                onQtyChange={(direction) => modifyLineQty(line, direction)}
                onSplit={() => splitLineItem(line, idx)}
                onDelete={() => {
                  _setEditingLineId(null);
                  deleteLineItem(idx);
                }}
                discounts={zDiscounts}
                onApplyDiscount={(discountObj) => applyLineDiscount(line, discountObj)}
                onClearDiscount={() => clearLineDiscount(line)}
              />
            )}
          </div>
        );
      })}

      {lines.length === 0 && <span className={styles.emptyText}>No items</span>}
    </div>
  );
}

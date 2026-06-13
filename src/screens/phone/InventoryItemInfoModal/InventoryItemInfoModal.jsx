import { ICONS } from "../../../styles";
import { formatCurrencyDisp } from "../../../utils";
import { Image, TouchableOpacity } from "../../../dom_components";
import { useZ } from "../../../hooks/useZ";
import styles from "./InventoryItemInfoModal.module.css";

function formatMoney(cents) {
  if (cents == null || cents === "" || cents === 0) return "-";
  return "$" + formatCurrencyDisp(cents);
}

function formatMinutes(mins) {
  if (!mins) return "-";
  return String(mins) + " min";
}

export function InventoryItemInfoModal({ item, onClose }) {
  const zModal = useZ("modal", !!item);
  if (!item) return null;

  const isLabor = item.category === "Labor";
  const name = item.catalogName || item.formalName || "Unknown";
  const category = item.category || "Item";

  return (
    <div className={styles.backdrop} style={{ zIndex: zModal }} onClick={onClose}>
      <div className={styles.card} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>Item Info</span>
          <TouchableOpacity onPress={onClose} className={styles.closeBtn}>
            <Image icon={ICONS.close1} size={20} />
          </TouchableOpacity>
        </div>

        <div className={styles.body}>
          <div className={styles.fieldFull}>
            <span className={styles.label}>Catalog Name</span>
            <span className={styles.value}>{name}</span>
          </div>

          <div className={styles.fieldFull}>
            <span className={styles.label}>Category</span>
            <span className={styles.value}>{category}</span>
          </div>

          <div className={styles.grid}>
            {isLabor && (
              <div className={styles.field}>
                <span className={styles.label}>Minutes</span>
                <span className={styles.value}>{formatMinutes(item.minutes)}</span>
              </div>
            )}
            <div className={styles.field}>
              <span className={styles.label}>Price</span>
              <span className={styles.value}>{formatMoney(item.price)}</span>
            </div>
            <div className={styles.field}>
              <span className={styles.label}>Sale Price</span>
              <span className={styles.value}>{formatMoney(item.salePrice)}</span>
            </div>
            {!isLabor && (
              <div className={styles.field}>
                <span className={styles.label}>Cost</span>
                <span className={styles.value}>{formatMoney(item.cost)}</span>
              </div>
            )}
            {!isLabor && (
              <div className={styles.field}>
                <span className={styles.label}>MSRP</span>
                <span className={styles.value}>{formatMoney(item.msrp)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

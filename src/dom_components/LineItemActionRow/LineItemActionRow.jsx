import { ICONS } from "../../styles";
import { useAlertScreenStore } from "../../stores";
import { Image } from "../Image/Image";
import { TouchableOpacity } from "../TouchableOpacity/TouchableOpacity";
import { DropdownMenu } from "../DropdownMenu/DropdownMenu";
import styles from "./LineItemActionRow.module.css";

const DISCOUNT_DROPDOWN_BUTTON_STYLE = {
  backgroundColor: "transparent",
  borderWidth: 0,
  padding: 6,
};

export function LineItemActionRow({
  qty,
  itemName = "Item",
  deleteMessage,
  onQtyChange,
  onSplit,
  onDelete,
  discounts,
  onApplyDiscount,
  onClearDiscount,
  skipConfirm = false,
}) {
  const showSplit = qty > 1 && typeof onSplit === "function";
  const showDiscounts = Array.isArray(discounts);

  function handleDelete() {
    if (skipConfirm) {
      if (typeof onDelete === "function") onDelete();
      return;
    }
    useAlertScreenStore.getState().setValues({
      title: "Delete Item?",
      message: deleteMessage || `${itemName} will be removed.`,
      severity: "info",
      btn1Text: "Delete",
      handleBtn1Press: () => {
        if (typeof onDelete === "function") onDelete();
      },
      showAlert: true,
      canExitOnOuterClick: true,
    });
  }

  return (
    <div className={styles.row}>
      <div className={styles.qtyGroup}>
        <TouchableOpacity
          onPress={() => onQtyChange?.("down")}
          disabled={qty <= 1}
          className={qty <= 1 ? styles.qtyBtnDisabled : styles.qtyBtn}
        >
          <Image icon={ICONS.downArrowOrange} size={25} />
        </TouchableOpacity>
        <span className={styles.qtyValue}>{qty}</span>
        <TouchableOpacity
          onPress={() => onQtyChange?.("up")}
          className={styles.qtyBtn}
        >
          <Image icon={ICONS.upArrowOrange} size={25} />
        </TouchableOpacity>
      </div>
      <div className={styles.actionsGroup}>
        {showSplit && (
          <TouchableOpacity onPress={onSplit} className={styles.actionBtn}>
            <Image icon={ICONS.axe} size={23} />
          </TouchableOpacity>
        )}
        {showDiscounts && (
          <DropdownMenu
            buttonIcon={ICONS.dollar}
            buttonIconSize={23}
            buttonStyle={DISCOUNT_DROPDOWN_BUTTON_STYLE}
            centerMenuVertically={true}
            centerMenuHorizontally={true}
            dataArr={[
              { label: "No Discount" },
              ...discounts.map((o) => ({ label: o.name })),
            ]}
            onSelect={(selected) => {
              if (selected.label === "No Discount") {
                onClearDiscount?.();
              } else {
                const discountObj = discounts.find(
                  (o) => o.name === selected.label,
                );
                if (discountObj && onApplyDiscount) onApplyDiscount(discountObj);
              }
            }}
          />
        )}
        <TouchableOpacity onPress={handleDelete} className={styles.trashBtn}>
          <Image icon={ICONS.trash} size={23} />
        </TouchableOpacity>
      </div>
    </div>
  );
}

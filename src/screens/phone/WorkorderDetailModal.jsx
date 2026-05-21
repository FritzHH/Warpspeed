/* eslint-disable */
import { useState } from "react";
import { ICONS } from "../../styles";
import { useOpenWorkordersStore, useAlertScreenStore } from "../../stores";
import {
  resolveStatus,
  formatCurrencyDisp,
  calculateRunningTotals,
  applyDiscountToWorkorderItem,
  replaceOrAddToArr,
} from "../../utils";
import { AlertBox, Image, StatusPickerModal, TouchableOpacity } from "../../dom_components";
import cloneDeep from "lodash/cloneDeep";
import { MobileMessagesScreen } from "../mobile/MobileMessagesScreen";
import { CustomerSection } from "./CustomerSection/CustomerSection";
import { BikeOrderingSection } from "./BikeOrderingSection/BikeOrderingSection";
import { LineItemsSection } from "./LineItemsSection/LineItemsSection";
import { NotesSection } from "./NotesSection/NotesSection";
import { ItemSearchModal } from "./ItemSearchModal/ItemSearchModal";
import { MediaSection } from "./MediaSection/MediaSection";
import styles from "./WorkorderDetailModal.module.css";

const STATUS_BUTTON_BASE_STYLE = {
  alignSelf: "flex-start",
  paddingHorizontal: 12,
  paddingVertical: 8,
  borderRadius: 8,
};
const STATUS_BUTTON_TEXT_BASE_STYLE = {
  fontWeight: "500",
  fontSize: 14,
};
const STATUS_ITEM_TEXT_STYLE = { fontSize: 16 };

export function WorkorderDetailModal({ workorder, zSettings, onClose }) {
  let { runningTotal, runningQty } = calculateRunningTotals(workorder);
  let rs = resolveStatus(workorder.status, zSettings?.statuses);

  const zShowAlert = useAlertScreenStore((s) => s.showAlert);

  const [sShowMessages, _setShowMessages] = useState(false);
  const [sShowItemSearch, _setShowItemSearch] = useState(false);

  function setField(fieldName, val) {
    useOpenWorkordersStore.getState().setField(fieldName, val, workorder.id);
  }

  function deleteLineItem(index) {
    let workorderLines = workorder.workorderLines.filter((o, idx) => idx !== index);
    useOpenWorkordersStore.getState().setField("workorderLines", workorderLines, workorder.id);
  }

  function modifyLineQty(line, option) {
    let newLine = cloneDeep(line);
    if (option === "up") {
      newLine.qty = newLine.qty + 1;
    } else {
      if (newLine.qty <= 1) return;
      newLine.qty = newLine.qty - 1;
    }
    if (newLine.discountObj?.name) {
      let discounted = applyDiscountToWorkorderItem(newLine);
      if (discounted.discountObj?.newPrice > 0) newLine = discounted;
    }
    useOpenWorkordersStore.getState().setField("workorderLines", replaceOrAddToArr(workorder.workorderLines, newLine), workorder.id);
  }

  function applyLineDiscount(line, discountObj) {
    let workorderLines = workorder.workorderLines.map((o) => {
      if (o.id === line.id) {
        return applyDiscountToWorkorderItem({ ...line, discountObj });
      }
      return o;
    });
    useOpenWorkordersStore.getState().setField("workorderLines", workorderLines, workorder.id);
  }

  function clearLineDiscount(line) {
    let workorderLines = workorder.workorderLines.map((o) => {
      if (o.id === line.id) return { ...line, discountObj: null };
      return o;
    });
    useOpenWorkordersStore.getState().setField("workorderLines", workorderLines, workorder.id);
  }

  function splitLineItem(line, index) {
    let num = line.qty;
    let workorderLines = cloneDeep(workorder.workorderLines);
    for (let i = 0; i <= num - 1; i++) {
      let newLine = cloneDeep(line);
      newLine.qty = 1;
      newLine.id = crypto.randomUUID();
      newLine.discountObj = null;
      if (i === 0) { workorderLines[index] = newLine; continue; }
      workorderLines.splice(index + 1, 0, newLine);
    }
    useOpenWorkordersStore.getState().setField("workorderLines", workorderLines, workorder.id);
  }

  function addItemsToWorkorder(lineItems) {
    const workorderLines = [...(workorder.workorderLines || []), ...lineItems];
    useOpenWorkordersStore.getState().setField("workorderLines", workorderLines, workorder.id);
  }

  function handleStatusSelect(val) {
    setField("status", val.id);
  }

  if (sShowMessages) {
    return (
      <div className={styles.root}>
        <MobileMessagesScreen workorderID={workorder.id} onBack={() => _setShowMessages(false)} />
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <TouchableOpacity onPress={onClose} className={styles.backBtn}>
          <Image icon={ICONS.backRed} size={20} />
          <span className={styles.backText}>Back</span>
        </TouchableOpacity>
      </div>

      <div className={styles.scroll}>
        <CustomerSection
          workorder={workorder}
          zSettings={zSettings}
          onShowMessages={() => _setShowMessages(true)}
        />

        <div className={styles.statusWrap}>
          <StatusPickerModal
            statuses={(zSettings?.statuses || []).filter((s) => !s.systemOwned && !s.hidden)}
            enabled={true}
            onSelect={handleStatusSelect}
            menuWidth={Math.round(window.innerWidth * 0.6)}
            centered={true}
            itemHeight={44}
            itemTextStyle={STATUS_ITEM_TEXT_STYLE}
            buttonStyle={{ ...STATUS_BUTTON_BASE_STYLE, backgroundColor: rs.backgroundColor }}
            buttonTextStyle={{ ...STATUS_BUTTON_TEXT_BASE_STYLE, color: rs.textColor }}
            buttonText={rs.label}
          />
        </div>

        <MediaSection workorder={workorder} zSettings={zSettings} />

        <BikeOrderingSection workorder={workorder} zSettings={zSettings} setField={setField} />

        <LineItemsSection
          workorder={workorder}
          zSettings={zSettings}
          runningQty={runningQty}
          onOpenItemSearch={() => _setShowItemSearch(true)}
          modifyLineQty={modifyLineQty}
          splitLineItem={splitLineItem}
          applyLineDiscount={applyLineDiscount}
          clearLineDiscount={clearLineDiscount}
          deleteLineItem={deleteLineItem}
        />

        <NotesSection notes={workorder.notes} />

        <div className={styles.totalRow}>
          <span className={styles.totalLabel}>Total</span>
          <span className={styles.totalValue}>
            {formatCurrencyDisp(runningTotal, true)}
          </span>
        </div>
      </div>

      {sShowItemSearch && (
        <ItemSearchModal
          onClose={() => _setShowItemSearch(false)}
          onAddItems={addItemsToWorkorder}
        />
      )}

      <AlertBox showAlert={zShowAlert} />
    </div>
  );
}

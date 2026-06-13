import { useState } from "react";
import { ICONS } from "../../../styles";
import { Image, TouchableOpacity, ModalFooter, ModalFooterButton } from "../../../dom_components";
import { useAlertScreenStore, useSettingsStore } from "../../../stores";
import { localStorageWrapper, printBuilder } from "../../../utils";
import { labelPrintBuilder } from "../../../shared/labelPrintBuilder";
import { dbSavePrintObj } from "../../../db_calls_wrapper";
import { useZ } from "../../../hooks/useZ";
import styles from "./PrintingModal.module.css";

function PrinterRow({ printer, isSelected, onSelect, isLabel }) {
  const online = printer.active === true;
  return (
    <div className={`${styles.row} ${isSelected ? styles.rowSelected : ""}`}>
      <div className={styles.rowTop}>
        <div className={styles.rowInfo}>
          <span className={styles.rowLabel}>{printer.label || "Unlabeled"}</span>
          <span className={styles.rowName}>{printer.printerName || "—"}</span>
        </div>
        <span className={`${styles.status} ${online ? styles.statusOnline : styles.statusOffline}`}>
          {online ? "ONLINE" : "OFFLINE"}
        </span>
      </div>
      <div className={styles.rowActions}>
        <TouchableOpacity
          onPress={() => onSelect(printer.id)}
          className={`${styles.selectBtn} ${isSelected ? styles.selectBtnActive : ""}`}
        >
          <span className={styles.selectBtnText}>
            {isSelected ? "SELECTED" : "USE THIS"}
          </span>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            if (!online) return;
            const testObj = isLabel ? labelPrintBuilder.test() : printBuilder.test();
            dbSavePrintObj(testObj, printer.id);
            if (isLabel) return;
            useAlertScreenStore.getState().setValues({
              title: "Test Print",
              message: "Was the test print successful?",
              btn1Text: "Yes",
              btn2Text: "No",
              handleBtn1Press: () => {
                onSelect(printer.id);
                useAlertScreenStore.getState().setShowAlert(false);
              },
              handleBtn2Press: () => useAlertScreenStore.getState().setShowAlert(false),
              canExitOnOuterClick: true,
            });
          }}
          className={`${styles.testBtn} ${online ? "" : styles.testBtnDisabled}`}
        >
          <Image icon={ICONS.print} size={16} />
          <span className={styles.testBtnText}>TEST PRINT</span>
        </TouchableOpacity>
      </div>
    </div>
  );
}

export function PrintingModal({ onClose }) {
  const zSettings = useSettingsStore((s) => s.settings);
  const z = useZ("modal");

  const printersObj = zSettings?.printers || {};
  const printersList = Object.values(printersObj);
  const receiptPrinters = printersList.filter((p) => p.type === "receipt");
  const labelPrinters = printersList.filter((p) => p.type === "label");

  const [sSelectedReceipt, _setSelectedReceipt] = useState(
    localStorageWrapper.getItem("selectedPrinterID") || ""
  );
  const [sSelectedLabel, _setSelectedLabel] = useState(
    localStorageWrapper.getItem("selectedLabelPrinterID") || ""
  );

  function handleSelectReceipt(printerID) {
    localStorageWrapper.setItem("selectedPrinterID", printerID);
    _setSelectedReceipt(printerID);
  }

  function handleSelectLabel(printerID) {
    localStorageWrapper.setItem("selectedLabelPrinterID", printerID);
    _setSelectedLabel(printerID);
  }

  return (
    <div className={styles.backdrop} style={{ zIndex: z }} onClick={onClose}>
      <div className={styles.card} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>Printing</span>
          <span className={styles.subtitle}>
            Selection saved to this phone
          </span>
        </div>
        <div className={styles.body}>
          <div className={styles.sectionLabel}>THERMAL (RECEIPT)</div>
          {receiptPrinters.length === 0 ? (
            <div className={styles.empty}>No thermal receipt printers configured</div>
          ) : (
            receiptPrinters.map((printer) => (
              <PrinterRow
                key={printer.id}
                printer={printer}
                isSelected={sSelectedReceipt === printer.id}
                onSelect={handleSelectReceipt}
                isLabel={false}
              />
            ))
          )}

          <div className={styles.sectionLabel}>LABEL PRINTING</div>
          {labelPrinters.length === 0 ? (
            <div className={styles.empty}>No label printers configured</div>
          ) : (
            labelPrinters.map((printer) => (
              <PrinterRow
                key={printer.id}
                printer={printer}
                isSelected={sSelectedLabel === printer.id}
                onSelect={handleSelectLabel}
                isLabel={true}
              />
            ))
          )}
        </div>
        <ModalFooter>
          <ModalFooterButton variant="accent" onClick={onClose}>
            Close
          </ModalFooterButton>
        </ModalFooter>
      </div>
    </div>
  );
}

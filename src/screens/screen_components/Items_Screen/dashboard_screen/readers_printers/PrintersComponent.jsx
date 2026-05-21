import React, { useState } from "react";
import { Button, CheckBox } from "../../../../../dom_components";
import { C, COLOR_GRADIENTS, ICONS } from "../../../../../styles";
import { localStorageWrapper, printBuilder } from "../../../../../utils";
import { useAlertScreenStore } from "../../../../../stores";
import { dbSavePrintObj } from "../../../../../db_calls_wrapper";
import { labelPrintBuilder } from "../../../../../shared/labelPrintBuilder";
import { BoxContainerOuterComponent, BoxContainerInnerComponent } from "../Dashboard_Admin";
import styles from "./PrintersComponent.module.css";

function isPrinterOnline(printer) {
  return printer.active === true;
}

function PrinterCard({ printer, isSelected, onSelect, onDelete, testPrintBuilder, isLabelPrinter }) {
  const online = isPrinterOnline(printer);
  return (
    <div
      className={styles.printerCard}
      style={{
        borderColor: isSelected ? C.green : C.buttonLightGreenOutline,
        backgroundColor: C.backgroundListWhite,
      }}
    >
      <div className={styles.cardTopRow}>
        {!online ? (
          <span
            className={styles.offlineBadge}
            style={{ color: C.red, backgroundColor: "yellow" }}
          >
            Printer Offline
          </span>
        ) : (
          <span />
        )}
        <button
          type="button"
          className={styles.trashBtn}
          onClick={onDelete}
          aria-label="Remove printer"
        >
          <img className={styles.iconImg} src={ICONS.trash} alt="" width={14} height={14} />
        </button>
      </div>
      <div className={styles.cardInfoRow}>
        <div className={styles.cardInfoCol}>
          <span className={styles.printerLabel} style={{ color: C.text }}>
            {printer.label || "Unlabeled"}
          </span>
          <span className={styles.printerName} style={{ color: C.textMuted }}>
            {printer.printerName || "—"}
          </span>
        </div>
      </div>
      <div className={styles.cardBottomRow}>
        <CheckBox
          isChecked={isSelected}
          text="Use this printer"
          textStyle={{ fontSize: 13 }}
          buttonStyle={{ backgroundColor: "transparent" }}
          onCheck={() => onSelect(printer.id)}
        />
        <Button
          text="Test Print"
          onPress={() => {
            let testObj = isLabelPrinter ? labelPrintBuilder.test() : printBuilder.test();
            dbSavePrintObj(testObj, printer.id);
            if (isLabelPrinter) return;
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
          colorGradientArr={COLOR_GRADIENTS.green}
          buttonStyle={{ paddingHorizontal: 16, paddingVertical: 10 }}
          textStyle={{ fontSize: 14, fontWeight: "700" }}
          enabled={online}
        />
      </div>
    </div>
  );
}

export const PrintersComponent = ({ zSettingsObj, handleSettingsFieldChange }) => {
  const printersObj = zSettingsObj?.printers || {};
  const printersList = Object.values(printersObj);
  const receiptPrinters = printersList.filter((p) => p.type === "receipt");
  const labelPrinters = printersList.filter((p) => p.type === "label");
  const [sSelectedReceiptPrinter, _setSelectedReceiptPrinter] = useState(
    localStorageWrapper.getItem("selectedPrinterID") || ""
  );
  const [sSelectedLabelPrinter, _setSelectedLabelPrinter] = useState(
    localStorageWrapper.getItem("selectedLabelPrinterID") || ""
  );

  function handleSelectReceiptPrinter(printerID) {
    localStorageWrapper.setItem("selectedPrinterID", printerID);
    _setSelectedReceiptPrinter(printerID);
  }

  function handleSelectLabelPrinter(printerID) {
    localStorageWrapper.setItem("selectedLabelPrinterID", printerID);
    _setSelectedLabelPrinter(printerID);
  }

  function confirmDeletePrinter(printer, isLabel) {
    useAlertScreenStore.getState().setValues({
      title: "Remove Printer",
      message:
        "This will delete the printer from the database for all users. It must be re-added through the WarpHub app.",
      btn1Text: "Delete",
      btn2Text: "Cancel",
      handleBtn1Press: () => {
        let updated = { ...printersObj };
        delete updated[printer.id];
        handleSettingsFieldChange("printers", updated);
        if (isLabel) {
          if (sSelectedLabelPrinter === printer.id) {
            localStorageWrapper.removeItem("selectedLabelPrinterID");
            _setSelectedLabelPrinter("");
          }
        } else {
          if (sSelectedReceiptPrinter === printer.id) {
            localStorageWrapper.removeItem("selectedPrinterID");
            _setSelectedReceiptPrinter("");
          }
        }
        useAlertScreenStore.getState().setShowAlert(false);
      },
      handleBtn2Press: () => useAlertScreenStore.getState().setShowAlert(false),
      canExitOnOuterClick: true,
    });
  }

  return (
    <>
      <BoxContainerOuterComponent style={{ marginTop: 20 }}>
        <BoxContainerInnerComponent>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionHeaderText} style={{ color: C.textSecondary }}>
              RECEIPT PRINTER
            </span>
          </div>
          {receiptPrinters.length === 0 && (
            <span className={styles.emptyText} style={{ color: C.textMuted }}>
              No receipt printers configured
            </span>
          )}
          {receiptPrinters.map((printer, idx) => (
            <PrinterCard
              key={printer.id || idx}
              printer={printer}
              isSelected={sSelectedReceiptPrinter === printer.id}
              onSelect={handleSelectReceiptPrinter}
              onDelete={() => confirmDeletePrinter(printer, false)}
              isLabelPrinter={false}
            />
          ))}
        </BoxContainerInnerComponent>
      </BoxContainerOuterComponent>

      <BoxContainerOuterComponent style={{ marginTop: 20 }}>
        <BoxContainerInnerComponent>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionHeaderText} style={{ color: C.textSecondary }}>
              LABEL PRINTER
            </span>
          </div>
          {labelPrinters.length === 0 && (
            <span className={styles.emptyText} style={{ color: C.textMuted }}>
              No label printers configured
            </span>
          )}
          {labelPrinters.map((printer, idx) => (
            <PrinterCard
              key={printer.id || idx}
              printer={printer}
              isSelected={sSelectedLabelPrinter === printer.id}
              onSelect={handleSelectLabelPrinter}
              onDelete={() => confirmDeletePrinter(printer, true)}
              isLabelPrinter={true}
            />
          ))}
        </BoxContainerInnerComponent>
      </BoxContainerOuterComponent>

      <BoxContainerOuterComponent style={{ marginTop: 20 }}>
        <BoxContainerInnerComponent>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionHeaderText} style={{ color: C.textSecondary }}>
              INTAKE RECEIPTS
            </span>
          </div>
          <CheckBox
            isChecked={zSettingsObj?.autoPrintIntakeReceipt}
            textStyle={{ fontSize: 15 }}
            buttonStyle={{ backgroundColor: "transparent" }}
            text={"Auto print intake receipt"}
            onCheck={() =>
              handleSettingsFieldChange(
                "autoPrintIntakeReceipt",
                !zSettingsObj?.autoPrintIntakeReceipt
              )
            }
          />
          <CheckBox
            isChecked={zSettingsObj?.autoSMSIntakeReceipt}
            textStyle={{ fontSize: 15 }}
            buttonStyle={{ backgroundColor: "transparent" }}
            text={"Auto SMS intake receipt"}
            onCheck={() =>
              handleSettingsFieldChange(
                "autoSMSIntakeReceipt",
                !zSettingsObj?.autoSMSIntakeReceipt
              )
            }
          />
          <CheckBox
            isChecked={zSettingsObj?.autoEmailIntakeReceipt}
            textStyle={{ fontSize: 15 }}
            buttonStyle={{ backgroundColor: "transparent" }}
            text={"Auto email intake receipt"}
            onCheck={() =>
              handleSettingsFieldChange(
                "autoEmailIntakeReceipt",
                !zSettingsObj?.autoEmailIntakeReceipt
              )
            }
          />
        </BoxContainerInnerComponent>
      </BoxContainerOuterComponent>

      <BoxContainerOuterComponent style={{ marginTop: 20 }}>
        <BoxContainerInnerComponent>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionHeaderText} style={{ color: C.textSecondary }}>
              SALES RECEIPTS
            </span>
          </div>
          <CheckBox
            isChecked={zSettingsObj?.autoPrintSalesReceipt}
            textStyle={{ fontSize: 15 }}
            buttonStyle={{ backgroundColor: "transparent" }}
            text={"Auto print sales receipt"}
            onCheck={() =>
              handleSettingsFieldChange(
                "autoPrintSalesReceipt",
                !zSettingsObj?.autoPrintSalesReceipt
              )
            }
          />
          <CheckBox
            isChecked={zSettingsObj?.autoSMSSalesReceipt}
            textStyle={{ fontSize: 15 }}
            buttonStyle={{ backgroundColor: "transparent" }}
            text={"Auto SMS sales receipt"}
            onCheck={() =>
              handleSettingsFieldChange(
                "autoSMSSalesReceipt",
                !zSettingsObj?.autoSMSSalesReceipt
              )
            }
          />
          <CheckBox
            isChecked={zSettingsObj?.autoEmailSalesReceipt}
            textStyle={{ fontSize: 15 }}
            buttonStyle={{ backgroundColor: "transparent" }}
            text={"Auto email sales receipt"}
            onCheck={() =>
              handleSettingsFieldChange(
                "autoEmailSalesReceipt",
                !zSettingsObj?.autoEmailSalesReceipt
              )
            }
          />
        </BoxContainerInnerComponent>
      </BoxContainerOuterComponent>
    </>
  );
};

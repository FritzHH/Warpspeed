import React, { useState } from "react";
import styles from "./PrintersComponent.module.css";
import { Button, CheckBox, Image } from "../../../../dom_components";
import { useAlertScreenStore } from "../../../../stores";
import { C, COLOR_GRADIENTS, ICONS } from "../../../../styles";
import { localStorageWrapper, printBuilder } from "../../../../utils";
import { dbSavePrintObj } from "../../../../db_calls_wrapper";
import { labelPrintBuilder } from "../../../../shared/labelPrintBuilder";

function isPrinterOnline(printer) {
  return printer.active === true;
}

function PrinterCard({
  printer,
  isSelected,
  onSelect,
  onTestPrint,
  onDelete,
  spaced,
}) {
  const online = isPrinterOnline(printer);
  return (
    <div
      className={`${styles.printerCard} ${spaced ? styles.printerCardSpaced : ""}`}
      style={{
        borderColor: isSelected ? C.green : C.buttonLightGreenOutline,
        backgroundColor: C.backgroundListWhite,
      }}
    >
      <div className={styles.printerCardHeader}>
        {!online ? (
          <span className={styles.offlineBadge} style={{ color: C.red }}>
            Printer Offline
          </span>
        ) : (
          <div className={styles.spacer} />
        )}
        <Button
          icon={ICONS.trash}
          iconSize={14}
          onPress={onDelete}
          buttonStyle={{
            paddingLeft: 4,
            paddingRight: 4,
            paddingTop: 4,
            paddingBottom: 4,
            backgroundColor: "transparent",
          }}
          iconStyle={{ marginRight: 0 }}
        />
      </div>
      <div className={styles.printerInfoRow}>
        <div className={styles.printerInfoLabel}>
          <span className={styles.printerLabel} style={{ color: C.text }}>
            {printer.label || "Unlabeled"}
          </span>
          <span className={styles.printerName} style={{ color: C.textMuted }}>
            {printer.printerName || "—"}
          </span>
        </div>
      </div>
      <div className={styles.printerActionsRow}>
        <CheckBox
          isChecked={isSelected}
          text="Use this printer"
          textStyle={{ fontSize: 13 }}
          buttonStyle={{ backgroundColor: "transparent" }}
          onCheck={onSelect}
        />
        <Button
          text="Test Print"
          onPress={onTestPrint}
          colorGradientArr={COLOR_GRADIENTS.green}
          buttonStyle={{ paddingHorizontal: 16, paddingVertical: 10 }}
          textStyle={{ fontSize: 14, fontWeight: "700" }}
          enabled={online}
        />
      </div>
    </div>
  );
}

export function PrintersComponent({ zSettingsObj, handleSettingsFieldChange }) {
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

  function promptDeletePrinter(printer, isReceipt) {
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
        if (isReceipt && sSelectedReceiptPrinter === printer.id) {
          localStorageWrapper.removeItem("selectedPrinterID");
          _setSelectedReceiptPrinter("");
        }
        if (!isReceipt && sSelectedLabelPrinter === printer.id) {
          localStorageWrapper.removeItem("selectedLabelPrinterID");
          _setSelectedLabelPrinter("");
        }
        useAlertScreenStore.getState().setShowAlert(false);
      },
      handleBtn2Press: () => useAlertScreenStore.getState().setShowAlert(false),
      canExitOnOuterClick: true,
    });
  }

  function handleReceiptTestPrint(printer) {
    let testObj = printBuilder.test();
    dbSavePrintObj(testObj, printer.id);
    useAlertScreenStore.getState().setValues({
      title: "Test Print",
      message: "Was the test print successful?",
      btn1Text: "Yes",
      btn2Text: "No",
      handleBtn1Press: () => {
        handleSelectReceiptPrinter(printer.id);
        useAlertScreenStore.getState().setShowAlert(false);
      },
      handleBtn2Press: () => useAlertScreenStore.getState().setShowAlert(false),
      canExitOnOuterClick: true,
    });
  }

  function handleLabelTestPrint(printer) {
    let testObj = labelPrintBuilder.test();
    dbSavePrintObj(testObj, printer.id);
  }

  return (
    <>
      <div className={`${styles.outerBox} ${styles.outerBoxSpaced}`}>
        <div className={styles.innerBox}>
          <div className={styles.sectionHeaderRow}>
            <span className={styles.sectionHeaderLabel} style={{ color: C.textSecondary }}>
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
              onSelect={() => handleSelectReceiptPrinter(printer.id)}
              onTestPrint={() => handleReceiptTestPrint(printer)}
              onDelete={() => promptDeletePrinter(printer, true)}
              spaced={idx < receiptPrinters.length - 1}
            />
          ))}
        </div>
      </div>

      <div className={`${styles.outerBox} ${styles.outerBoxSpaced}`}>
        <div className={styles.innerBox}>
          <div className={styles.sectionHeaderRow}>
            <span className={styles.sectionHeaderLabel} style={{ color: C.textSecondary }}>
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
              onSelect={() => handleSelectLabelPrinter(printer.id)}
              onTestPrint={() => handleLabelTestPrint(printer)}
              onDelete={() => promptDeletePrinter(printer, false)}
              spaced={idx < labelPrinters.length - 1}
            />
          ))}
        </div>
      </div>

      <div className={`${styles.outerBox} ${styles.outerBoxSpaced}`}>
        <div className={styles.innerBox}>
          <div className={styles.sectionHeaderRow}>
            <span className={styles.sectionHeaderLabel} style={{ color: C.textSecondary }}>
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
        </div>
      </div>

      <div className={`${styles.outerBox} ${styles.outerBoxSpaced}`}>
        <div className={styles.innerBox}>
          <div className={styles.sectionHeaderRow}>
            <span className={styles.sectionHeaderLabel} style={{ color: C.textSecondary }}>
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
        </div>
      </div>
    </>
  );
}

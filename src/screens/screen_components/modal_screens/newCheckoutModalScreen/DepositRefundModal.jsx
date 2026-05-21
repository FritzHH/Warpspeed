/* eslint-disable */
import { useState, memo } from "react";
import cloneDeep from "lodash/cloneDeep";
import { Dialog, Button, SmallLoadingIndicator, CheckBox } from "../../../../dom_components";
import { C, COLOR_GRADIENTS, Fonts, Z } from "../../../../styles";
import { useCurrentCustomerStore, useSettingsStore, useLoginStore } from "../../../../stores";
import { formatCurrencyDisp, formatMillisForDisplay, lightenRGBByPercent, log, generateEAN13Barcode, localStorageWrapper, findTemplateByType, printBuilder } from "../../../../utils";
import { readTransaction, writeCashRefund, newCheckoutProcessStripeRefund } from "./newCheckoutFirebaseCalls";
import { buildRefundObject } from "./newCheckoutUtils";
import { dbSaveCustomer, dbSavePrintObj, dbSendReceipt } from "../../../../db_calls_wrapper";
import { RECEIPT_TYPES } from "../../../../data";
import { build_db_path } from "../../../../constants";
import styles from "./DepositRefundModal.module.css";

export const DepositRefundModal = memo(function DepositRefundModal({ visible, deposit, customer, onClose, onCustomerUpdated }) {
  const [sTransaction, _setTransaction] = useState(null);
  const [sLoading, _setLoading] = useState(false);
  const [sLoadMessage, _setLoadMessage] = useState("");
  const [sRefundComplete, _setRefundComplete] = useState(false);
  const [sProcessing, _setProcessing] = useState(false);
  const [sErrorMessage, _setErrorMessage] = useState("");
  const [sInitialized, _setInitialized] = useState(false);
  const [sPrint, _setPrint] = useState(true);
  const [sSMS, _setSMS] = useState(false);
  const [sEmail, _setEmail] = useState(false);
  const [sShowConfirm, _setShowConfirm] = useState(false);
  const [sShowRemoveConfirm, _setShowRemoveConfirm] = useState(false);
  const [sRemoved, _setRemoved] = useState(false);

  let hasPhone = !!customer?.phone || !!customer?.customerCell;
  let hasEmail = !!customer?.email;

  let isGiftCard = deposit?.type === "giftcard";
  let label = isGiftCard ? "Gift Card" : "Deposit";
  let refundAmount = deposit?.amountCents || 0;

  let totalRefunded = (sTransaction?.refunds || []).reduce((sum, r) => sum + (r.amount || 0), 0);
  let available = sTransaction ? sTransaction.amountCaptured - totalRefunded : 0;
  let isImportedCard = sTransaction?.method === "card" && !!sTransaction?._importSource;
  let isCard = sTransaction?.method === "card" && !sTransaction?._importSource;
  let isCash = !isCard;
  let isOriginallyCard = sTransaction?.method === "card";
  let fullyRefunded = sTransaction && available <= 0;

  if (visible && !sInitialized && deposit?.transactionId) {
    _setInitialized(true);
    loadTransaction(deposit.transactionId);
  }
  if (visible && !sInitialized && !deposit?.transactionId) {
    _setInitialized(true);
    _setLoadMessage("No transaction linked to this deposit");
  }

  async function loadTransaction(txnId) {
    _setLoading(true);
    _setLoadMessage("Loading transaction...");
    try {
      let txn = await readTransaction(txnId);
      if (!txn) {
        _setLoadMessage("Transaction not found");
        _setLoading(false);
        return;
      }
      _setTransaction(txn);
      _setLoading(false);
      _setLoadMessage("");
    } catch (error) {
      log("DepositRefundModal loadTransaction error:", error);
      _setLoadMessage("Error loading transaction");
      _setLoading(false);
    }
  }

  async function handleFullRefund() {
    _setProcessing(true);
    _setErrorMessage("");

    try {
      let updatedTxn;
      if (isCash) {
        updatedTxn = cloneDeep(sTransaction);
        let refundObj = buildRefundObject(refundAmount, updatedTxn.id, "cash", [], "", 0, "");
        await writeCashRefund(updatedTxn.id, refundObj);
        updatedTxn.refunds = [...(updatedTxn.refunds || []), refundObj];
        _setTransaction(updatedTxn);
      } else {
        let { tenantID, storeID } = useSettingsStore.getState().getSettings();
        let refundId = generateEAN13Barcode();

        let result = await newCheckoutProcessStripeRefund(
          refundAmount,
          sTransaction.paymentIntentID,
          {
            transactionID: sTransaction.id,
            tenantID,
            storeID,
            refundId,
            method: "card",
            salesTax: 0,
            workorderLines: [],
          }
        );

        if (!result?.success) {
          _setErrorMessage(result?.message || "Refund failed");
          _setProcessing(false);
          return;
        }

        updatedTxn = cloneDeep(sTransaction);
        if (result.data?.refundObj) {
          updatedTxn.refunds = [...(updatedTxn.refunds || []), result.data.refundObj];
        }
        _setTransaction(updatedTxn);
      }

      _setRefundComplete(true);

      if (isCash) {
        let printerID = localStorageWrapper.getItem("selectedPrinterID") || "";
        if (printerID) dbSavePrintObj({ id: crypto.randomUUID(), receiptType: RECEIPT_TYPES.register }, printerID);
      }

      removeDepositFromCustomer();
    } catch (error) {
      log("Deposit refund error:", error);
      _setErrorMessage(error?.message || "Refund processing failed");
    }

    _setProcessing(false);
  }

  function removeDepositFromCustomer() {
    if (!customer?.id || !deposit?.id) return;
    let updatedCustomer = cloneDeep(customer);
    updatedCustomer.deposits = (updatedCustomer.deposits || []).filter((d) => d.id !== deposit.id);
    useCurrentCustomerStore.getState().setCustomer(updatedCustomer);
    dbSaveCustomer(updatedCustomer);
    if (onCustomerUpdated) onCustomerUpdated(updatedCustomer);
  }

  function handleSendDepositReceipt() {
    if (!sPrint && !sSMS && !sEmail) return;
    if (!sTransaction) return;

    let settings = useSettingsStore.getState().getSettings();
    let currentUser = useLoginStore.getState().getCurrentUser();
    let _ctx = { currentUser, settings };

    let receipt = printBuilder.transaction(sTransaction, _ctx);
    receipt.depositType = deposit?.type || "deposit";
    receipt.depositNote = deposit?.note || "";
    receipt.customerFirstName = customer?.first || "";
    receipt.customerLastName = customer?.last || "";
    receipt.customerCell = customer?.phone || customer?.customerCell || "";
    receipt.customerEmail = customer?.email || "";
    receipt.popCashRegister = false;

    if (sPrint) {
      let printerID = localStorageWrapper.getItem("selectedPrinterID") || "";
      if (printerID) dbSavePrintObj(receipt, printerID);
    }

    if (sSMS || sEmail) {
      let { tenantID, storeID } = settings;
      let smsTemplate = sSMS ? findTemplateByType(settings?.smsTemplates || settings?.textTemplates, "saleReceipt") : null;
      let emailTemplate = sEmail ? findTemplateByType(settings?.emailTemplates, "saleReceipt") : null;
      let storagePath = build_db_path.cloudStorage.saleReceiptPDF(sTransaction.id, tenantID, storeID);
      dbSendReceipt({
        receiptType: "transaction",
        receiptData: receipt,
        storagePath,
        sendSMS: !!(smsTemplate && (customer?.phone || customer?.customerCell)),
        sendEmail: !!(emailTemplate && customer?.email),
        customerEmail: customer?.email || "",
        customerCell: customer?.phone || customer?.customerCell || "",
        customerID: customer?.id || "",
        templateVars: {
          firstName: (customer?.first || "Customer").trim(),
          storeName: settings?.storeInfo?.displayName || "our store",
          total: formatCurrencyDisp(sTransaction.amountCaptured, true),
        },
        smsMessageID: crypto.randomUUID(),
      });
    }
  }

  function handleClose() {
    _setTransaction(null);
    _setLoading(false);
    _setLoadMessage("");
    _setRefundComplete(false);
    _setProcessing(false);
    _setErrorMessage("");
    _setInitialized(false);
    _setPrint(true);
    _setSMS(false);
    _setEmail(false);
    _setShowConfirm(false);
    _setShowRemoveConfirm(false);
    _setRemoved(false);
    if (onClose) onClose();
  }

  let formLocked = sProcessing;

  return (
    <Dialog
      visible={visible}
      onClose={handleClose}
      preventClose={formLocked}
      title="Deposit Refund"
      aria-label="Deposit Refund"
    >
      <>
        <div
          className={styles.card}
          style={{
            backgroundColor: lightenRGBByPercent(C.backgroundWhite, 35),
            boxShadow: `0 4px 12px ${C.lightred}`,
          }}
        >
            {/* Header */}
            <div className={styles.header} style={{ borderBottomColor: C.borderSubtle }}>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span
                  className={styles.headerTitle}
                  style={{ fontWeight: Fonts.weight.textHeavy, color: C.text }}
                >
                  {label} Details
                </span>
                {deposit?.note ? (
                  <span className={styles.headerNote} style={{ color: C.textMuted }}>
                    {deposit.note}
                  </span>
                ) : null}
              </div>
            </div>

            {/* Loading */}
            {sLoading && (
              <div className={styles.loadingState}>
                <span className={styles.loadingText} style={{ color: C.lightText }}>
                  {sLoadMessage}
                </span>
              </div>
            )}

            {/* Transaction Not Found */}
            {!sLoading && !sTransaction && sLoadMessage && !sRemoved && (
              <div className={styles.notFoundState}>
                <span className={styles.notFoundTitle} style={{ color: C.lightred }}>
                  {sLoadMessage}
                </span>
                <span className={styles.notFoundSub} style={{ color: C.textMuted }}>
                  This {label.toLowerCase()} may have been created from an import error. You can remove it from the customer's account.
                </span>
                <div
                  className={styles.depositBadge}
                  style={{ backgroundColor: lightenRGBByPercent(C.orange, 75) }}
                >
                  <span className={styles.depositBadgeText} style={{ color: C.orange }}>
                    {"$" + formatCurrencyDisp(refundAmount) + " - " + formatMillisForDisplay(deposit?.millis)}
                  </span>
                </div>
                <div className={styles.actionRow}>
                  <Button
                    text={"Remove " + label}
                    onPress={() => _setShowRemoveConfirm(true)}
                    colorGradientArr={COLOR_GRADIENTS.red}
                    textStyle={{ fontSize: 13, color: C.textWhite, fontWeight: Fonts.weight.textHeavy }}
                    buttonStyle={{ height: 36, paddingHorizontal: 18, borderRadius: 6 }}
                  />
                  <Button
                    text="Cancel"
                    onPress={handleClose}
                    colorGradientArr={COLOR_GRADIENTS.grey}
                    textStyle={{ fontSize: 13, color: C.textWhite }}
                    buttonStyle={{ height: 36, paddingHorizontal: 18, borderRadius: 6 }}
                  />
                </div>
              </div>
            )}

            {/* Removed Success */}
            {!sLoading && sRemoved && (
              <div className={styles.removedState}>
                <div
                  className={styles.removedBanner}
                  style={{ backgroundColor: lightenRGBByPercent(C.green, 80) }}
                >
                  <span className={styles.removedTitle} style={{ color: C.green }}>
                    {label} removed from account
                  </span>
                  <span className={styles.removedSub} style={{ color: C.textMuted }}>
                    {"$" + formatCurrencyDisp(refundAmount) + " " + label.toLowerCase() + " has been removed"}
                  </span>
                </div>
                <Button
                  text="Done"
                  onPress={handleClose}
                  colorGradientArr={COLOR_GRADIENTS.green}
                  textStyle={{ fontSize: 13, color: C.textWhite }}
                  buttonStyle={{ marginTop: 15, width: 120, height: 36, borderRadius: 6 }}
                />
              </div>
            )}

            {/* Main Content */}
            {!sLoading && sTransaction && (
              <div className={styles.mainBody}>
                {/* Transaction Info Card */}
                <div className={styles.txnCard} style={{ borderColor: C.borderSubtle }}>
                  <div className={styles.txnCardTopRow}>
                    <div className={styles.txnLeft}>
                      <div className={styles.txnMethodRow}>
                        <div
                          className={styles.methodPill}
                          style={{
                            backgroundColor: isOriginallyCard
                              ? lightenRGBByPercent(C.blue, 70)
                              : lightenRGBByPercent(C.green, 70),
                          }}
                        >
                          <span
                            className={styles.methodPillText}
                            style={{ color: isOriginallyCard ? C.blue : C.green }}
                          >
                            {isOriginallyCard ? "CARD" : "CASH"}
                          </span>
                        </div>
                        {isOriginallyCard && sTransaction.last4 && (
                          <span className={styles.cardInfo} style={{ color: C.textMuted }}>
                            {sTransaction.cardIssuer !== "Unknown" ? sTransaction.cardIssuer : sTransaction.cardType} ****{sTransaction.last4}
                          </span>
                        )}
                        {isImportedCard && (
                          <div
                            className={styles.importPill}
                            style={{ backgroundColor: lightenRGBByPercent(C.blue, 60) }}
                          >
                            <span className={styles.importPillText} style={{ color: C.blue }}>
                              {sTransaction._importSource}
                            </span>
                          </div>
                        )}
                      </div>
                      <span className={styles.txnDate} style={{ color: C.textMuted }}>
                        {formatMillisForDisplay(sTransaction.millis)}
                      </span>
                    </div>
                    <div className={styles.txnRight}>
                      <span className={styles.txnAmount} style={{ color: C.text }}>
                        {"$" + formatCurrencyDisp(sTransaction.amountCaptured)}
                      </span>
                    </div>
                  </div>
                  {isImportedCard && (
                    <div
                      className={styles.importedNotice}
                      style={{ backgroundColor: lightenRGBByPercent(C.orange, 75) }}
                    >
                      <span className={styles.importedNoticeText} style={{ color: C.orange }}>
                        Imported card payment - refund will be issued as cash
                      </span>
                    </div>
                  )}
                </div>

                {/* Receipt Options */}
                <div className={styles.receiptOptionsRow}>
                  <CheckBox
                    text="Print"
                    isChecked={sPrint}
                    onCheck={() => _setPrint(!sPrint)}
                    textStyle={{ fontSize: 11, color: C.text }}
                    buttonStyle={{ marginRight: 10 }}
                  />
                  <CheckBox
                    text="SMS"
                    isChecked={sSMS}
                    enabled={hasPhone}
                    onCheck={() => _setSMS(!sSMS)}
                    textStyle={{ fontSize: 11, color: hasPhone ? C.text : C.textDisabled }}
                    buttonStyle={{ marginRight: 10 }}
                  />
                  <CheckBox
                    text="Email"
                    isChecked={sEmail}
                    enabled={hasEmail}
                    onCheck={() => _setEmail(!sEmail)}
                    textStyle={{ fontSize: 11, color: hasEmail ? C.text : C.textDisabled }}
                    buttonStyle={{ marginRight: 12 }}
                  />
                  <Button
                    text="Print/Send Deposit Receipt"
                    onPress={handleSendDepositReceipt}
                    enabled={(sPrint || sSMS || sEmail) && !sProcessing}
                    colorGradientArr={COLOR_GRADIENTS.blue}
                    textStyle={{ fontSize: 11, color: C.textWhite, fontWeight: Fonts.weight.textHeavy }}
                    buttonStyle={{
                      height: 28,
                      paddingHorizontal: 12,
                      borderRadius: 6,
                      opacity: (sPrint || sSMS || sEmail) && !sProcessing ? 1 : 0.3,
                    }}
                  />
                </div>

                {/* Fully Refunded Message */}
                {fullyRefunded && !sRefundComplete && (
                  <div className={styles.fullyRefundedBox}>
                    <span className={styles.fullyRefundedTitle} style={{ color: C.lightred }}>
                      Fully Refunded
                    </span>
                    <span className={styles.fullyRefundedSub} style={{ color: C.textMuted }}>
                      This {label.toLowerCase()} has already been fully refunded.
                    </span>
                  </div>
                )}

                {/* Refund Section */}
                {!fullyRefunded && !sRefundComplete && (
                  <div>
                    <div
                      className={styles.refundAmountBox}
                      style={{ backgroundColor: lightenRGBByPercent(C.lightred, 80) }}
                    >
                      <span className={styles.refundAmountLabel} style={{ color: C.textMuted }}>
                        Refund Amount
                      </span>
                      <span className={styles.refundAmountValue} style={{ color: C.lightred }}>
                        {"$" + formatCurrencyDisp(refundAmount)}
                      </span>
                      <span className={styles.refundAmountSub} style={{ color: C.textMuted }}>
                        {isCard ? "Card" : "Cash"} refund - full {label.toLowerCase()} amount
                      </span>
                    </div>

                    {sErrorMessage ? (
                      <span
                        className={styles.errorMessage}
                        style={{ color: C.lightred, display: "block" }}
                      >
                        {sErrorMessage}
                      </span>
                    ) : null}

                    {sProcessing && (
                      <div className={styles.processingRow}>
                        <SmallLoadingIndicator
                          color={C.orange}
                          text=""
                          message=""
                          containerStyle={{ padding: 2, marginRight: 8 }}
                        />
                        <span className={styles.processingText} style={{ color: C.textMuted }}>
                          Processing {isCard ? "card" : "cash"} refund...
                        </span>
                      </div>
                    )}

                    <Button
                      text={
                        sProcessing
                          ? "PROCESSING..."
                          : `REFUND FULL ${isGiftCard ? "GIFT CARD" : "DEPOSIT"}${isImportedCard ? " (CASH)" : ""}`
                      }
                      onPress={() => _setShowConfirm(true)}
                      enabled={!sProcessing}
                      colorGradientArr={COLOR_GRADIENTS.yellow}
                      textStyle={{ fontSize: 13, fontWeight: Fonts.weight.textHeavy }}
                      buttonStyle={{
                        paddingVertical: 8,
                        borderRadius: 6,
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: sProcessing ? 0.4 : 1,
                      }}
                    />
                  </div>
                )}

                {/* Success Message */}
                {sRefundComplete && (
                  <div
                    className={styles.successBox}
                    style={{ backgroundColor: lightenRGBByPercent(C.green, 80) }}
                  >
                    <span className={styles.successTitle} style={{ color: C.green }}>
                      {label} refund processed successfully
                    </span>
                    <span className={styles.successSub} style={{ color: C.textMuted }}>
                      {"$" + formatCurrencyDisp(refundAmount)} refunded - {label.toLowerCase()} removed
                    </span>
                  </div>
                )}

                {/* Close Button */}
                <div className={styles.closeRow}>
                  <Button
                    text={sRefundComplete ? "Done" : "Cancel"}
                    onPress={handleClose}
                    colorGradientArr={sRefundComplete ? COLOR_GRADIENTS.green : COLOR_GRADIENTS.red}
                    textStyle={{ fontSize: 13, color: C.textWhite }}
                    buttonStyle={{ width: 120, height: 36, borderRadius: 6 }}
                    enabled={!sProcessing}
                  />
                </div>
              </div>
            )}
          </div>

          {sShowConfirm && (
            <div className={styles.confirmOverlay} style={{ zIndex: Z.alert }}>
              <div className={styles.confirmCard} style={{ backgroundColor: C.backgroundWhite }}>
                <span className={styles.confirmTitle} style={{ color: "red" }}>
                  Confirm Refund
                </span>
                <span className={styles.confirmMessage} style={{ color: C.text }}>
                  {"Refund $" + formatCurrencyDisp(refundAmount) + " " + (isCard ? "to card" : "in cash") + "? This cannot be undone."}
                </span>
                <div className={styles.confirmActions}>
                  <Button
                    colorGradientArr={COLOR_GRADIENTS.green}
                    text="REFUND"
                    buttonStyle={{ paddingVertical: 4, flex: 1 }}
                    textStyle={{ color: C.textWhite, fontWeight: "600" }}
                    onPress={() => {
                      _setShowConfirm(false);
                      handleFullRefund();
                    }}
                  />
                  <Button
                    colorGradientArr={COLOR_GRADIENTS.blue}
                    text="CANCEL"
                    buttonStyle={{ paddingVertical: 4, flex: 1 }}
                    textStyle={{ color: C.textWhite, fontWeight: "600" }}
                    onPress={() => _setShowConfirm(false)}
                  />
                </div>
              </div>
            </div>
          )}

          {sShowRemoveConfirm && (
            <div className={styles.confirmOverlay} style={{ zIndex: Z.alert }}>
              <div className={styles.confirmCard} style={{ backgroundColor: C.backgroundWhite }}>
                <span className={styles.confirmTitle} style={{ color: "red" }}>
                  {"Remove " + label}
                </span>
                <span className={styles.confirmMessage} style={{ color: C.text }}>
                  {"Remove $" + formatCurrencyDisp(refundAmount) + " " + label.toLowerCase() + " from this customer? No refund will be issued."}
                </span>
                <div className={styles.confirmActions}>
                  <Button
                    colorGradientArr={COLOR_GRADIENTS.red}
                    text="REMOVE"
                    buttonStyle={{ paddingVertical: 4, flex: 1 }}
                    textStyle={{ color: C.textWhite, fontWeight: "600" }}
                    onPress={() => {
                      _setShowRemoveConfirm(false);
                      removeDepositFromCustomer();
                      _setRemoved(true);
                    }}
                  />
                  <Button
                    colorGradientArr={COLOR_GRADIENTS.blue}
                    text="CANCEL"
                    buttonStyle={{ paddingVertical: 4, flex: 1 }}
                    textStyle={{ color: C.textWhite, fontWeight: "600" }}
                    onPress={() => _setShowRemoveConfirm(false)}
                  />
                </div>
              </div>
            </div>
          )}
        </>
    </Dialog>
  );
});

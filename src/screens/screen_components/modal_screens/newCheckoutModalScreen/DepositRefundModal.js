/* eslint-disable */
import { View, Text } from "react-native-web";
import { useState, memo } from "react";
import cloneDeep from "lodash/cloneDeep";
import { ScreenModal, Button_, SmallLoadingIndicator, SHADOW_RADIUS_PROTO } from "../../../../components";
import { CheckBox } from "../../../../dom_components";
import { C, COLOR_GRADIENTS, Fonts } from "../../../../styles";
import { useCurrentCustomerStore, useSettingsStore, useLoginStore } from "../../../../stores";
import { formatCurrencyDisp, formatMillisForDisplay, gray, lightenRGBByPercent, log, generateEAN13Barcode, localStorageWrapper, findTemplateByType, printBuilder } from "../../../../utils";
import { readTransaction, writeCashRefund, newCheckoutProcessStripeRefund } from "./newCheckoutFirebaseCalls";
import { buildRefundObject } from "./newCheckoutUtils";
import { dbSaveCustomer, dbSavePrintObj, dbSendReceipt } from "../../../../db_calls_wrapper";
import { RECEIPT_TYPES } from "../../../../data";
import { build_db_path } from "../../../../constants";

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

  // Calculate transaction info
  let totalRefunded = (sTransaction?.refunds || []).reduce((sum, r) => sum + (r.amount || 0), 0);
  let available = sTransaction ? sTransaction.amountCaptured - totalRefunded : 0;
  let isImportedCard = sTransaction?.method === "card" && !!sTransaction?._importSource;
  let isCard = sTransaction?.method === "card" && !sTransaction?._importSource;
  let isCash = !isCard;
  let isOriginallyCard = sTransaction?.method === "card";
  let fullyRefunded = sTransaction && available <= 0;

  // ─── Initialization ──────────────────────────────────────
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

  // ─── Process Full Refund ───────────────────────────────────
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
        // Card refund via Stripe
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

  // ─── Close ──────────────────────────────────────────────
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

  // ─── Render ──────────────────────────────────────────────
  return (
    <ScreenModal
      modalVisible={visible}
      showOuterModal={true}
      outerModalStyle={{ backgroundColor: "rgba(50,50,50,.65)" }}
      buttonVisible={false}
      Component={() => (
        <>
        <View
          style={{
            flexDirection: "column",
            backgroundColor: lightenRGBByPercent(C.backgroundWhite, 35),
            width: 420,
            borderRadius: 15,
            ...SHADOW_RADIUS_PROTO,
            shadowColor: C.lightred,
            overflow: "hidden",
          }}
        >
          {/* ── Header ──────────────────────────────────── */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              paddingHorizontal: 15,
              paddingVertical: 10,
              borderBottomWidth: 1,
              borderBottomColor: gray(0.1),
            }}
          >
            <View>
              <Text style={{ fontSize: 14, fontWeight: Fonts.weight.textHeavy, color: C.text }}>
                {label} Details
              </Text>
              {deposit?.note ? (
                <Text style={{ fontSize: 11, color: gray(0.5), marginTop: 2 }}>{deposit.note}</Text>
              ) : null}
            </View>
          </View>

          {/* ── Loading ──────────────────────────────────── */}
          {sLoading && (
            <View style={{ padding: 30, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 14, color: C.lightText, fontStyle: "italic" }}>{sLoadMessage}</Text>
            </View>
          )}

          {/* ── Transaction Not Found / No Transaction ───── */}
          {!sLoading && !sTransaction && sLoadMessage && !sRemoved && (
            <View style={{ padding: 20, alignItems: "center" }}>
              <Text style={{ fontSize: 14, color: C.lightred, fontWeight: "600" }}>{sLoadMessage}</Text>
              <Text style={{ fontSize: 12, color: gray(0.45), textAlign: "center", marginTop: 6 }}>
                This {label.toLowerCase()} may have been created from an import error. You can remove it from the customer's account.
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6, backgroundColor: lightenRGBByPercent(C.orange, 75), borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5 }}>
                <Text style={{ fontSize: 11, color: C.orange, fontWeight: "500" }}>
                  {"$" + formatCurrencyDisp(refundAmount) + " - " + formatMillisForDisplay(deposit?.millis)}
                </Text>
              </View>
              <View style={{ flexDirection: "row", gap: 12, marginTop: 18 }}>
                <Button_
                  text={"Remove " + label}
                  onPress={() => _setShowRemoveConfirm(true)}
                  colorGradientArr={COLOR_GRADIENTS.red}
                  textStyle={{ fontSize: 13, color: C.textWhite, fontWeight: Fonts.weight.textHeavy }}
                  buttonStyle={{ height: 36, paddingHorizontal: 18, borderRadius: 6 }}
                />
                <Button_
                  text="Cancel"
                  onPress={handleClose}
                  colorGradientArr={COLOR_GRADIENTS.grey}
                  textStyle={{ fontSize: 13, color: C.textWhite }}
                  buttonStyle={{ height: 36, paddingHorizontal: 18, borderRadius: 6 }}
                />
              </View>
            </View>
          )}

          {/* ── Removed Success ──────────────────────────── */}
          {!sLoading && sRemoved && (
            <View style={{ padding: 20, alignItems: "center" }}>
              <View style={{ padding: 15, alignItems: "center", backgroundColor: lightenRGBByPercent(C.green, 80), borderRadius: 8, width: "100%" }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: C.green }}>
                  {label} removed from account
                </Text>
                <Text style={{ fontSize: 11, color: gray(0.5), marginTop: 4 }}>
                  {"$" + formatCurrencyDisp(refundAmount) + " " + label.toLowerCase() + " has been removed"}
                </Text>
              </View>
              <Button_
                text="Done"
                onPress={handleClose}
                colorGradientArr={COLOR_GRADIENTS.green}
                textStyle={{ fontSize: 13, color: C.textWhite }}
                buttonStyle={{ marginTop: 15, width: 120, height: 36, borderRadius: 6 }}
              />
            </View>
          )}

          {/* ── Main Content ─────────────────────────────── */}
          {!sLoading && sTransaction && (
            <View style={{ padding: 15 }}>
              {/* Transaction Info Card */}
              <View
                style={{
                  borderWidth: 1,
                  borderColor: gray(0.1),
                  borderRadius: 8,
                  padding: 10,
                  marginBottom: 12,
                  backgroundColor: "white",
                }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <View>
                    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
                      <View
                        style={{
                          backgroundColor: isOriginallyCard ? lightenRGBByPercent(C.blue, 70) : lightenRGBByPercent(C.green, 70),
                          paddingHorizontal: 6,
                          paddingVertical: 1,
                          borderRadius: 4,
                          marginRight: 6,
                        }}
                      >
                        <Text style={{ fontSize: 10, fontWeight: "600", color: isOriginallyCard ? C.blue : C.green }}>
                          {isOriginallyCard ? "CARD" : "CASH"}
                        </Text>
                      </View>
                      {isOriginallyCard && sTransaction.last4 && (
                        <Text style={{ fontSize: 12, color: gray(0.5) }}>
                          {sTransaction.cardIssuer !== "Unknown" ? sTransaction.cardIssuer : sTransaction.cardType} ****{sTransaction.last4}
                        </Text>
                      )}
                      {isImportedCard && (
                        <View
                          style={{
                            backgroundColor: lightenRGBByPercent(C.blue, 60),
                            paddingHorizontal: 5,
                            paddingVertical: 1,
                            borderRadius: 4,
                            marginLeft: 6,
                          }}
                        >
                          <Text style={{ fontSize: 9, fontWeight: "600", color: C.blue }}>
                            {sTransaction._importSource}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={{ fontSize: 11, color: gray(0.4) }}>
                      {formatMillisForDisplay(sTransaction.millis)}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ fontSize: 16, fontWeight: "700", color: C.text }}>
                      {"$" + formatCurrencyDisp(sTransaction.amountCaptured)}
                    </Text>
                  </View>
                </View>
                {isImportedCard && (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: lightenRGBByPercent(C.orange, 75),
                      borderRadius: 6,
                      paddingHorizontal: 8,
                      paddingVertical: 5,
                      marginTop: 8,
                    }}
                  >
                    <Text style={{ fontSize: 11, color: C.orange, fontWeight: "500" }}>
                      Imported card payment - refund will be issued as cash
                    </Text>
                  </View>
                )}
              </View>

              {/* Receipt Options */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginBottom: 12,
                  paddingHorizontal: 2,
                }}
              >
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
                  textStyle={{ fontSize: 11, color: hasPhone ? C.text : gray(0.3) }}
                  buttonStyle={{ marginRight: 10 }}
                />
                <CheckBox
                  text="Email"
                  isChecked={sEmail}
                  enabled={hasEmail}
                  onCheck={() => _setEmail(!sEmail)}
                  textStyle={{ fontSize: 11, color: hasEmail ? C.text : gray(0.3) }}
                  buttonStyle={{ marginRight: 12 }}
                />
                <Button_
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
              </View>

              {/* Fully Refunded Message */}
              {fullyRefunded && !sRefundComplete && (
                <View style={{ padding: 20, alignItems: "center" }}>
                  <Text style={{ fontSize: 14, color: C.lightred, fontWeight: "600", marginBottom: 4 }}>
                    Fully Refunded
                  </Text>
                  <Text style={{ fontSize: 12, color: gray(0.5), textAlign: "center" }}>
                    This {label.toLowerCase()} has already been fully refunded.
                  </Text>
                </View>
              )}

              {/* Refund Section - Full amount only */}
              {!fullyRefunded && !sRefundComplete && (
                <View>
                  {/* Full Refund Amount Display */}
                  <View
                    style={{
                      backgroundColor: lightenRGBByPercent(C.lightred, 80),
                      borderRadius: 8,
                      padding: 12,
                      marginBottom: 12,
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ fontSize: 11, color: gray(0.5), marginBottom: 4 }}>
                      Refund Amount
                    </Text>
                    <Text style={{ fontSize: 22, fontWeight: "700", color: C.lightred }}>
                      {"$" + formatCurrencyDisp(refundAmount)}
                    </Text>
                    <Text style={{ fontSize: 11, color: gray(0.4), marginTop: 4 }}>
                      {isCard ? "Card" : "Cash"} refund - full {label.toLowerCase()} amount
                    </Text>
                  </View>

                  {/* Error Message */}
                  {sErrorMessage ? (
                    <Text style={{ fontSize: 11, color: C.lightred, fontWeight: "600", textAlign: "center", marginBottom: 8 }}>
                      {sErrorMessage}
                    </Text>
                  ) : null}

                  {/* Processing indicator */}
                  {sProcessing && (
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
                      <SmallLoadingIndicator color={C.orange} text="" message="" containerStyle={{ padding: 2, marginRight: 8 }} />
                      <Text style={{ fontSize: 12, color: gray(0.5), fontWeight: "600" }}>
                        Processing {isCard ? "card" : "cash"} refund...
                      </Text>
                    </View>
                  )}

                  {/* Refund Button */}
                  <Button_
                    text={sProcessing ? "PROCESSING..." : `REFUND FULL ${isGiftCard ? "GIFT CARD" : "DEPOSIT"}${isImportedCard ? " (CASH)" : ""}`}
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
                </View>
              )}

              {/* Success Message */}
              {sRefundComplete && (
                <View style={{ padding: 15, alignItems: "center", backgroundColor: lightenRGBByPercent(C.green, 80), borderRadius: 8, marginTop: 8 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: C.green }}>
                    {label} refund processed successfully
                  </Text>
                  <Text style={{ fontSize: 11, color: gray(0.5), marginTop: 4 }}>
                    {"$" + formatCurrencyDisp(refundAmount)} refunded - {label.toLowerCase()} removed
                  </Text>
                </View>
              )}

              {/* Close Button */}
              <View style={{ flexDirection: "row", justifyContent: "center", marginTop: 15 }}>
                <Button_
                  text={sRefundComplete ? "Done" : "Cancel"}
                  onPress={handleClose}
                  colorGradientArr={sRefundComplete ? COLOR_GRADIENTS.green : COLOR_GRADIENTS.red}
                  textStyle={{ fontSize: 13, color: C.textWhite }}
                  buttonStyle={{ width: 120, height: 36, borderRadius: 6 }}
                  enabled={!sProcessing}
                />
              </View>
            </View>
          )}
        </View>
        {sShowConfirm && (
          <View
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              backgroundColor: "rgba(0, 0, 0, 0.5)",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 99999,
            }}
          >
            <View
              style={{
                backgroundColor: C.backgroundWhite,
                borderRadius: 15,
                alignItems: "center",
                justifyContent: "space-around",
                minWidth: "32%",
                minHeight: "24%",
              }}
            >
              <Text style={{ fontWeight: "500", marginTop: 25, fontSize: 25, color: "red", textAlign: "center" }}>
                Confirm Refund
              </Text>
              <Text style={{ textAlign: "center", width: "90%", marginTop: 10, fontSize: 18, color: C.text }}>
                {"Refund $" + formatCurrencyDisp(refundAmount) + " " + (isCard ? "to card" : "in cash") + "? This cannot be undone."}
              </Text>
              <View style={{ marginTop: 25, flexDirection: "row", justifyContent: "center", alignItems: "center", marginBottom: 25, width: "100%", paddingHorizontal: 20, gap: 20 }}>
                <Button_
                  colorGradientArr={COLOR_GRADIENTS.green}
                  text="REFUND"
                  buttonStyle={{ paddingVertical: 4, flex: 1 }}
                  textStyle={{ color: C.textWhite, fontWeight: "600" }}
                  onPress={() => {
                    _setShowConfirm(false);
                    handleFullRefund();
                  }}
                />
                <Button_
                  colorGradientArr={COLOR_GRADIENTS.blue}
                  text="CANCEL"
                  buttonStyle={{ paddingVertical: 4, flex: 1 }}
                  textStyle={{ color: C.textWhite, fontWeight: "600" }}
                  onPress={() => _setShowConfirm(false)}
                />
              </View>
            </View>
          </View>
        )}
        {sShowRemoveConfirm && (
          <View
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              backgroundColor: "rgba(0, 0, 0, 0.5)",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 99999,
            }}
          >
            <View
              style={{
                backgroundColor: C.backgroundWhite,
                borderRadius: 15,
                alignItems: "center",
                justifyContent: "space-around",
                minWidth: "32%",
                minHeight: "24%",
              }}
            >
              <Text style={{ fontWeight: "500", marginTop: 25, fontSize: 25, color: "red", textAlign: "center" }}>
                {"Remove " + label}
              </Text>
              <Text style={{ textAlign: "center", width: "90%", marginTop: 10, fontSize: 18, color: C.text }}>
                {"Remove $" + formatCurrencyDisp(refundAmount) + " " + label.toLowerCase() + " from this customer? No refund will be issued."}
              </Text>
              <View style={{ marginTop: 25, flexDirection: "row", justifyContent: "center", alignItems: "center", marginBottom: 25, width: "100%", paddingHorizontal: 20, gap: 20 }}>
                <Button_
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
                <Button_
                  colorGradientArr={COLOR_GRADIENTS.blue}
                  text="CANCEL"
                  buttonStyle={{ paddingVertical: 4, flex: 1 }}
                  textStyle={{ color: C.textWhite, fontWeight: "600" }}
                  onPress={() => _setShowRemoveConfirm(false)}
                />
              </View>
            </View>
          </View>
        )}
        </>
      )}
    />
  );
});

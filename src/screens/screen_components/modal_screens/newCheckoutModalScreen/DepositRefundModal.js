/* eslint-disable */
import { View, Text } from "react-native-web";
import { useState, memo } from "react";
import { cloneDeep } from "lodash";
import { ScreenModal, Button_, SmallLoadingIndicator, SHADOW_RADIUS_PROTO } from "../../../../components";
import { C, COLOR_GRADIENTS, Fonts } from "../../../../styles";
import { useCurrentCustomerStore, useSettingsStore } from "../../../../stores";
import { formatCurrencyDisp, formatMillisForDisplay, gray, lightenRGBByPercent, log, generateEAN13Barcode } from "../../../../utils";
import { readTransaction, writeCashRefund, newCheckoutProcessStripeRefund } from "./newCheckoutFirebaseCalls";
import { buildRefundObject } from "./newCheckoutUtils";
import { dbSaveCustomer } from "../../../../db_calls_wrapper";

export const DepositRefundModal = memo(function DepositRefundModal({ visible, deposit, customer, onClose, onCustomerUpdated }) {
  const [sTransaction, _setTransaction] = useState(null);
  const [sLoading, _setLoading] = useState(false);
  const [sLoadMessage, _setLoadMessage] = useState("");
  const [sRefundComplete, _setRefundComplete] = useState(false);
  const [sProcessing, _setProcessing] = useState(false);
  const [sErrorMessage, _setErrorMessage] = useState("");
  const [sInitialized, _setInitialized] = useState(false);

  let isGiftCard = deposit?.type === "giftcard";
  let label = isGiftCard ? "Gift Card" : "Deposit";
  let refundAmount = deposit?.amountCents || 0;

  // Calculate transaction info
  let totalRefunded = (sTransaction?.refunds || []).reduce((sum, r) => sum + (r.amount || 0), 0);
  let available = sTransaction ? sTransaction.amountCaptured - totalRefunded : 0;
  let isCard = sTransaction?.method === "card";
  let isCash = !isCard;
  let fullyRefunded = sTransaction && available <= 0;

  // ─── Initialization ──────────────────────────────────────
  if (visible && !sInitialized && deposit?.transactionId) {
    _setInitialized(true);
    loadTransaction(deposit.transactionId);
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
      if (isCash) {
        let txn = cloneDeep(sTransaction);
        let refundObj = buildRefundObject(refundAmount, txn.id, "cash", [], "", 0, "");
        await writeCashRefund(txn.id, refundObj);
        txn.refunds = [...(txn.refunds || []), refundObj];
        _setTransaction(txn);
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

        let updatedTxn = cloneDeep(sTransaction);
        if (result.data?.refundObj) {
          updatedTxn.refunds = [...(updatedTxn.refunds || []), result.data.refundObj];
        }
        _setTransaction(updatedTxn);
      }

      _setRefundComplete(true);
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

  // ─── Close ──────────────────────────────────────────────
  function handleClose() {
    _setTransaction(null);
    _setLoading(false);
    _setLoadMessage("");
    _setRefundComplete(false);
    _setProcessing(false);
    _setErrorMessage("");
    _setInitialized(false);
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
                {label} Refund
              </Text>
              {deposit?.note ? (
                <Text style={{ fontSize: 11, color: gray(0.5), marginTop: 2 }}>{deposit.note}</Text>
              ) : null}
            </View>
            <View
              style={{
                backgroundColor: C.lightred,
                borderRadius: 6,
                paddingHorizontal: 10,
                paddingVertical: 3,
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: Fonts.weight.textHeavy, color: "white", letterSpacing: 0.5 }}>
                REFUND
              </Text>
            </View>
          </View>

          {/* ── Loading ──────────────────────────────────── */}
          {sLoading && (
            <View style={{ padding: 30, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 14, color: C.lightText, fontStyle: "italic" }}>{sLoadMessage}</Text>
            </View>
          )}

          {/* ── Transaction Not Found ────────────────────── */}
          {!sLoading && !sTransaction && sLoadMessage && (
            <View style={{ padding: 30, alignItems: "center" }}>
              <Text style={{ fontSize: 14, color: C.lightred }}>{sLoadMessage}</Text>
              <Button_
                text="Close"
                onPress={handleClose}
                colorGradientArr={COLOR_GRADIENTS.grey}
                textStyle={{ fontSize: 13, color: C.textWhite }}
                buttonStyle={{ marginTop: 15, width: 100, height: 34, borderRadius: 6 }}
              />
            </View>
          )}

          {/* ── Main Content ─────────────────────────────── */}
          {!sLoading && sTransaction && (
            <View style={{ padding: 15 }}>
              {/* Transaction Info Card */}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: gray(0.1),
                  borderRadius: 8,
                  padding: 10,
                  marginBottom: 12,
                  backgroundColor: "white",
                }}
              >
                <View>
                  <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
                    <View
                      style={{
                        backgroundColor: isCard ? lightenRGBByPercent(C.blue, 70) : lightenRGBByPercent(C.green, 70),
                        paddingHorizontal: 6,
                        paddingVertical: 1,
                        borderRadius: 4,
                        marginRight: 6,
                      }}
                    >
                      <Text style={{ fontSize: 10, fontWeight: "600", color: isCard ? C.blue : C.green }}>
                        {isCard ? "CARD" : "CASH"}
                      </Text>
                    </View>
                    {isCard && sTransaction.last4 && (
                      <Text style={{ fontSize: 12, color: gray(0.5) }}>
                        {sTransaction.cardIssuer !== "Unknown" ? sTransaction.cardIssuer : sTransaction.cardType} ****{sTransaction.last4}
                      </Text>
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
                    text={sProcessing ? "PROCESSING..." : `REFUND FULL ${isGiftCard ? "GIFT CARD" : "DEPOSIT"}`}
                    onPress={handleFullRefund}
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
      )}
    />
  );
});

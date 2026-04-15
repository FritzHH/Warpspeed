/* eslint-disable */
import { View, Text } from "react-native-web";
import { useState, useRef, memo } from "react";
import { cloneDeep } from "lodash";
import { ScreenModal, Button_, SHADOW_RADIUS_PROTO } from "../../../../components";
import { C, COLOR_GRADIENTS, Fonts, ICONS } from "../../../../styles";
import { useCurrentCustomerStore, useSettingsStore, useLoginStore } from "../../../../stores";
import { formatCurrencyDisp, formatMillisForDisplay, gray, lightenRGBByPercent, log, localStorageWrapper } from "../../../../utils";
import { readTransaction, writeCashRefund } from "./newCheckoutFirebaseCalls";
import { buildRefundObject } from "./newCheckoutUtils";
import { dbSaveCustomer, dbSavePrintObj } from "../../../../db_calls_wrapper";
import { CashRefund } from "./CashRefund";
import { CardRefund } from "./CardRefund";
import { printBuilder } from "../../../../utils";

export const DepositRefundModal = memo(function DepositRefundModal({ visible, deposit, customer, onClose, onCustomerUpdated }) {
  const [sTransaction, _setTransaction] = useState(null);
  const [sLoading, _setLoading] = useState(false);
  const [sLoadMessage, _setLoadMessage] = useState("");
  const [sRefundComplete, _setRefundComplete] = useState(false);
  const [sCardRefundProcessing, _setCardRefundProcessing] = useState(false);
  const [sInitialized, _setInitialized] = useState(false);

  let isGiftCard = deposit?.type === "giftcard";
  let label = isGiftCard ? "Gift Card" : "Deposit";

  // Calculate available refund from transaction
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

  // ─── Process Refund ──────────────────────────────────────
  async function handleProcessRefund(amount, type, cardDetails) {
    let txn = cloneDeep(sTransaction);

    // Cash refund: write to transaction
    if (type === "cash") {
      let refundObj = buildRefundObject(amount, txn.id, "cash", [], "", 0, "");
      await writeCashRefund(txn.id, refundObj);
      txn.refunds = [...(txn.refunds || []), refundObj];
    }

    // Card refund: CardRefund component already called the Cloud Function and wrote to transaction
    if (type === "card" && cardDetails?.refundObj) {
      txn.refunds = [...(txn.refunds || []), cardDetails.refundObj];
    }

    _setTransaction(txn);
    _setRefundComplete(true);

    // Update customer deposit
    updateCustomerDeposit(amount);
  }

  function updateCustomerDeposit(refundAmount) {
    if (!customer?.id || !deposit?.id) return;
    let updatedCustomer = cloneDeep(customer);
    let deposits = updatedCustomer.deposits || [];
    let idx = deposits.findIndex((d) => d.id === deposit.id);
    if (idx < 0) return;

    let newAmount = deposits[idx].amountCents - refundAmount;
    if (newAmount <= 0) {
      // Fully refunded - remove deposit
      deposits.splice(idx, 1);
    } else {
      // Partial refund - reduce amount
      deposits[idx] = { ...deposits[idx], amountCents: newAmount };
    }

    updatedCustomer.deposits = deposits;
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
    _setCardRefundProcessing(false);
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
                  {totalRefunded > 0 && (
                    <Text style={{ fontSize: 10, color: C.lightred, fontWeight: "600", marginTop: 1 }}>
                      Refunded: {"$" + formatCurrencyDisp(totalRefunded)}
                    </Text>
                  )}
                  {available > 0 && totalRefunded > 0 && (
                    <Text style={{ fontSize: 10, color: C.green, fontWeight: "600", marginTop: 1 }}>
                      Available: {"$" + formatCurrencyDisp(available)}
                    </Text>
                  )}
                </View>
              </View>

              {/* Fully Refunded Message */}
              {fullyRefunded && !sRefundComplete && (
                <View style={{ padding: 20, alignItems: "center" }}>
                  <Text style={{ fontSize: 14, color: C.lightred, fontWeight: "600", marginBottom: 4 }}>
                    Fully Refunded
                  </Text>
                  <Text style={{ fontSize: 12, color: gray(0.5), textAlign: "center" }}>
                    This transaction has already been fully refunded.
                  </Text>
                </View>
              )}

              {/* Refund Section */}
              {!fullyRefunded && (
                <View>
                  {isCash && (
                    <CashRefund
                      maxCashRefund={available}
                      onProcessRefund={handleProcessRefund}
                      refundComplete={sRefundComplete}
                      suggestedAmount={available}
                    />
                  )}
                  {isCard && (
                    <CardRefund
                      selectedPayment={sTransaction}
                      maxCardRefund={available}
                      onProcessRefund={handleProcessRefund}
                      onProcessingChange={(val) => _setCardRefundProcessing(val)}
                      workorderLines={[]}
                      salesTaxPercent={0}
                      refundComplete={sRefundComplete}
                      suggestedAmount={available}
                    />
                  )}
                </View>
              )}

              {/* Success Message */}
              {sRefundComplete && (
                <View style={{ padding: 15, alignItems: "center", backgroundColor: lightenRGBByPercent(C.green, 80), borderRadius: 8, marginTop: 8 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: C.green }}>
                    Refund processed successfully
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
                  enabled={!sCardRefundProcessing}
                />
              </View>
            </View>
          )}
        </View>
      )}
    />
  );
});

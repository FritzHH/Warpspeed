/* eslint-disable */
import { View, Text, ScrollView } from "react-native-web";
import { useState } from "react";
import { cloneDeep } from "lodash";
import { ScreenModal, SHADOW_RADIUS_PROTO, Button_ } from "../../../../components";
import { C, COLOR_GRADIENTS, Fonts } from "../../../../styles";
import {
  useSettingsStore,
  useAlertScreenStore,
  useCurrentCustomerStore,
} from "../../../../stores";
import {
  lightenRGBByPercent,
  formatCurrencyDisp,
  log,
  gray,
} from "../../../../utils";
import {
  calculateRefundLimits,
  validateRefundAmount,
  buildRefundObject,
  getPreviouslyRefundedLineIDs,
  splitWorkorderLinesToSingleQty,
} from "./newCheckoutUtils";
import {
  newCheckoutFetchCompletedSale,
  newCheckoutFetchWorkordersForSale,
  newCheckoutCompleteSale,
  newCheckoutSaveActiveSale,
  saveRefundIndex,
} from "./newCheckoutFirebaseCalls";

import { CashRefund } from "./CashRefund";
import { CardRefund } from "./CardRefund";
import { RefundTotals } from "./RefundTotals";
import { RefundItemSelector } from "./RefundItemSelector";
import { RefundPaymentSelector } from "./RefundPaymentSelector";

export function NewRefundModalScreen({ visible, saleID, onClose }) {
  const zSettings = useSettingsStore((state) => state.settings);

  // ─── Local State ──────────────────────────────────────────
  const [sOriginalSale, _setOriginalSale] = useState(null);
  const [sWorkordersInSale, _setWorkordersInSale] = useState([]);
  const [sSelectedItems, _setSelectedItems] = useState([]);
  const [sSelectedPayment, _setSelectedPayment] = useState(null);
  const [sIsCustomAmount, _setIsCustomAmount] = useState(false);
  const [sCustomRefundAmount, _setCustomRefundAmount] = useState(0);
  const [sRefundComplete, _setRefundComplete] = useState(false);
  const [sLoading, _setLoading] = useState(false);
  const [sLoadMessage, _setLoadMessage] = useState("");
  const [sInitialized, _setInitialized] = useState(false);

  // ─── Derived Values ───────────────────────────────────────
  let refundLimits = calculateRefundLimits(sOriginalSale, zSettings);
  let previouslyRefundedIDs = getPreviouslyRefundedLineIDs(sOriginalSale);

  // Calculate selected items subtotal
  let selectedItemsTotal = 0;
  sSelectedItems.forEach((item) => {
    let price = item.discountObj?.newPrice != null
      ? item.discountObj.newPrice
      : item.inventoryItem?.price || 0;
    selectedItemsTotal += price;
  });

  // Calculate card payments total and cash payments total
  let cardPaymentsTotal = 0;
  let cashPaymentsTotal = 0;
  (sOriginalSale?.payments || []).forEach((p) => {
    let available = p.amountCaptured - (p.amountRefunded || 0);
    if (p.cash || p.check) {
      cashPaymentsTotal += available;
    } else {
      cardPaymentsTotal += available;
    }
  });

  let maxCardRefund = Math.min(cardPaymentsTotal, refundLimits.maxRefund);
  let maxCashRefund = Math.min(cashPaymentsTotal, refundLimits.maxRefund);

  // ─── Initialization ──────────────────────────────────────
  if (visible && saleID && !sInitialized) {
    _setInitialized(true);
    loadSaleData(saleID);
  }

  async function loadSaleData(id) {
    _setLoading(true);
    _setLoadMessage("Loading sale...");

    try {
      let sale = await newCheckoutFetchCompletedSale(id);
      if (!sale) {
        _setLoadMessage("Sale not found");
        _setLoading(false);
        return;
      }

      _setOriginalSale(sale);
      _setLoadMessage("Loading workorders...");

      let workorders = await newCheckoutFetchWorkordersForSale(
        sale.workorderIDs || []
      );

      // Split to single qty for refund selection
      let splitWOs = splitWorkorderLinesToSingleQty(workorders);
      _setWorkordersInSale(splitWOs);

      _setLoading(false);
      _setLoadMessage("");
    } catch (error) {
      log("Error loading sale for refund:", error);
      _setLoadMessage("Error loading sale data");
      _setLoading(false);
    }
  }

  // ─── Item Selection ───────────────────────────────────────
  function handleToggleItem(line) {
    let exists = sSelectedItems.find((s) => s.id === line.id);
    if (exists) {
      _setSelectedItems(sSelectedItems.filter((s) => s.id !== line.id));
    } else {
      // Check if adding this item would exceed the refund limit
      let itemPrice = line.discountObj?.newPrice != null
        ? line.discountObj.newPrice
        : line.inventoryItem?.price || 0;
      let taxRate = zSettings?.salesTaxPercent || 0;
      let newItemsTotal = selectedItemsTotal + itemPrice;
      let newTotalWithTax = newItemsTotal + Math.round(newItemsTotal * (taxRate / 100));

      if (newTotalWithTax > refundLimits.maxRefund) {
        useAlertScreenStore.getState().setValues({
          showAlert: true,
          title: "Refund Limit Exceeded",
          message: `Adding this item would bring the refund to ${formatCurrencyDisp(newTotalWithTax)}, which exceeds the maximum refund of ${formatCurrencyDisp(refundLimits.maxRefund)}.`,
          subMessage: refundLimits.previouslyRefunded > 0
            ? `Previous refunds totaling ${formatCurrencyDisp(refundLimits.previouslyRefunded)} have already been processed.`
            : "",
          btn1Text: "OK",
          btn1Handler: () => useAlertScreenStore.getState().setValues({ showAlert: false }),
        });
        return;
      }

      _setSelectedItems([...sSelectedItems, cloneDeep(line)]);
    }
    // Switch out of custom amount mode when selecting items
    _setIsCustomAmount(false);
  }

  // ─── Payment Selection ────────────────────────────────────
  function handleSelectPayment(payment) {
    _setSelectedPayment(payment);
  }

  // ─── Custom Amount ────────────────────────────────────────
  function handleCustomAmountChange(cents) {
    _setCustomRefundAmount(cents);
  }

  function toggleCustomAmount() {
    _setIsCustomAmount(!sIsCustomAmount);
    if (!sIsCustomAmount) {
      _setSelectedItems([]); // Clear item selection when switching to custom
    }
  }

  // ─── Process Refund ───────────────────────────────────────
  async function handleProcessRefund(amount, type, cardDetails) {
    let sale = cloneDeep(sOriginalSale);

    let refund = buildRefundObject(
      amount,
      type === "cash" ? sSelectedItems : sSelectedItems,
      cardDetails?.refundId || "",
      ""
    );

    sale.refunds = [...(sale.refunds || []), refund];
    sale.amountRefunded = (sale.amountRefunded || 0) + amount;

    // Update the specific payment's amountRefunded if it's a card refund
    if (type === "card" && cardDetails?.paymentId) {
      sale.payments = sale.payments.map((p) => {
        if (p.id === cardDetails.paymentId) {
          return {
            ...p,
            amountRefunded: (p.amountRefunded || 0) + amount,
          };
        }
        return p;
      });
    }

    _setOriginalSale(sale);

    // Persist updated sale immediately
    await newCheckoutCompleteSale(sale);

    // Write refund index for reporting
    const customer = useCurrentCustomerStore.getState().customer;
    const customerInfo = {
      first: customer?.first || "",
      last: customer?.last || "",
      phone: customer?.cell || "",
      id: customer?.id || "",
    };
    saveRefundIndex(sale, refund, customerInfo);

    // Check if fully refunded
    let newLimits = calculateRefundLimits(sale, zSettings);
    if (newLimits.maxRefund <= 0) {
      _setRefundComplete(true);
    }
  }

  // ─── Close Modal ──────────────────────────────────────────
  function handleClose() {
    _setOriginalSale(null);
    _setWorkordersInSale([]);
    _setSelectedItems([]);
    _setSelectedPayment(null);
    _setIsCustomAmount(false);
    _setCustomRefundAmount(0);
    _setRefundComplete(false);
    _setLoading(false);
    _setLoadMessage("");
    _setInitialized(false);
    if (onClose) onClose();
  }

  // ─── Render ───────────────────────────────────────────────
  return (
    <ScreenModal
      modalVisible={visible}
      showOuterModal={true}
      outerModalStyle={{
        backgroundColor: "rgba(50,50,50,.65)",
      }}
      buttonVisible={false}
      Component={() => (
        <View
          style={{
            flexDirection: "column",
            backgroundColor: lightenRGBByPercent(C.backgroundWhite, 35),
            width: "85%",
            height: "95%",
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
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
            >
              <View
                style={{
                  backgroundColor: C.lightred,
                  borderRadius: 6,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: Fonts.weight.textHeavy,
                    color: "white",
                    letterSpacing: 1,
                  }}
                >
                  REFUND
                </Text>
              </View>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: Fonts.weight.textHeavy,
                  color: C.text,
                }}
              >
                Sale: {saleID}
              </Text>
              {sOriginalSale && (
                <Text style={{ fontSize: 12, color: C.lightText }}>
                  Original: {formatCurrencyDisp(sOriginalSale.total)}
                </Text>
              )}
            </View>

            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              {/* Toggle custom amount mode */}
              {sOriginalSale && !sRefundComplete && (
                <Button_
                  text={sIsCustomAmount ? "SELECT ITEMS" : "CUSTOM AMOUNT"}
                  onPress={toggleCustomAmount}
                  colorGradientArr={COLOR_GRADIENTS.grey}
                  textStyle={{ fontSize: 11 }}
                  buttonStyle={{
                    paddingVertical: 6,
                    paddingHorizontal: 12,
                    borderRadius: 6,
                  }}
                />
              )}
              <Button_
                text="CLOSE"
                onPress={handleClose}
                colorGradientArr={COLOR_GRADIENTS.red}
                textStyle={{
                  fontSize: 11,
                  fontWeight: Fonts.weight.textHeavy,
                }}
                buttonStyle={{
                  paddingVertical: 6,
                  paddingHorizontal: 14,
                  borderRadius: 6,
                }}
              />
            </View>
          </View>

          {/* ── Loading State ───────────────────────────── */}
          {sLoading && (
            <View
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  fontSize: 16,
                  color: C.lightText,
                  fontStyle: "italic",
                }}
              >
                {sLoadMessage}
              </Text>
            </View>
          )}

          {/* ── Main Content ────────────────────────────── */}
          {!sLoading && sOriginalSale && (
            <View
              style={{
                flex: 1,
                flexDirection: "row",
                padding: 10,
              }}
            >
              {/* ── LEFT COLUMN: Refund Methods ─────────── */}
              <View
                style={{
                  width: "29%",
                  borderRightWidth: 1,
                  borderRightColor: gray(0.1),
                  flexDirection: "column",
                }}
              >
                <View style={{ flex: 1 }}>
                  <CashRefund
                    maxCashRefund={maxCashRefund}
                    onProcessRefund={handleProcessRefund}
                    refundComplete={sRefundComplete}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <CardRefund
                    selectedPayment={sSelectedPayment}
                    maxCardRefund={maxCardRefund}
                    onProcessRefund={handleProcessRefund}
                    settings={zSettings}
                    refundComplete={sRefundComplete}
                  />
                </View>
              </View>

              {/* ── MIDDLE COLUMN: Totals & Payments ─────── */}
              <View
                style={{
                  width: "29%",
                  borderRightWidth: 1,
                  borderRightColor: gray(0.1),
                }}
              >
                <ScrollView style={{ flex: 1 }}>
                  <RefundTotals
                    originalSale={sOriginalSale}
                    selectedItemsTotal={selectedItemsTotal}
                    customRefundAmount={sCustomRefundAmount}
                    previouslyRefunded={refundLimits.previouslyRefunded}
                    maxRefundAllowed={refundLimits.maxRefund}
                    cardFeeDeduction={refundLimits.cardFeeDeduction}
                    settings={zSettings}
                    isCustomAmount={sIsCustomAmount}
                    onCustomAmountChange={handleCustomAmountChange}
                    refundComplete={sRefundComplete}
                  />

                  <RefundPaymentSelector
                    payments={sOriginalSale?.payments || []}
                    selectedPayment={sSelectedPayment}
                    onSelectPayment={handleSelectPayment}
                    disabled={sRefundComplete}
                  />
                </ScrollView>
              </View>

              {/* ── RIGHT COLUMN: Item Selector ──────────── */}
              <View
                style={{
                  width: "42%",
                  paddingLeft: 10,
                }}
              >
                {sIsCustomAmount ? (
                  <View
                    style={{
                      flex: 1,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        color: C.lightText,
                        textAlign: "center",
                      }}
                    >
                      Custom refund amount mode active.{"\n"}
                      Enter the amount in the Refund Totals section.
                    </Text>
                  </View>
                ) : (
                  <RefundItemSelector
                    workordersInSale={sWorkordersInSale}
                    selectedItems={sSelectedItems}
                    onToggleItem={handleToggleItem}
                    previouslyRefundedIDs={previouslyRefundedIDs}
                  />
                )}
              </View>
            </View>
          )}

          {/* ── No Sale Found ───────────────────────────── */}
          {!sLoading && !sOriginalSale && sLoadMessage && (
            <View
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  fontSize: 16,
                  color: C.lightred,
                }}
              >
                {sLoadMessage}
              </Text>
            </View>
          )}
        </View>
      )}
    />
  );
}

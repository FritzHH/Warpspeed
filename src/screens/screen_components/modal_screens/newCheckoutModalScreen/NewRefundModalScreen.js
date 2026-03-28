/* eslint-disable */
import { View, Text, ScrollView, TouchableOpacity } from "react-native-web";
import { useState, memo, useMemo } from "react";
import { cloneDeep } from "lodash";
import { ScreenModal, SHADOW_RADIUS_PROTO, Button_ } from "../../../../components";
import { C, COLOR_GRADIENTS, Fonts } from "../../../../styles";
import {
  useSettingsStore,
  useLoginStore,
  useOpenWorkordersStore,
  useAlertScreenStore,
} from "../../../../stores";
import {
  lightenRGBByPercent,
  formatCurrencyDisp,
  findTemplateByType,
  log,
  gray,
  deepEqual,
  printBuilder,
  resolveStatus,
} from "../../../../utils";
import { dbSavePrintObj } from "../../../../db_calls_wrapper";
import {
  calculateRefundLimits,
  validateRefundAmount,
  buildRefundObject,
  getPreviouslyRefundedLineIDs,
  splitWorkorderLinesToSingleQty,
  sendRefundReceipt,
} from "./newCheckoutUtils";
import {
  newCheckoutFetchCompletedSale,
  newCheckoutFetchWorkordersForSale,
  newCheckoutUpdateCompletedSale,
  newCheckoutSaveActiveSale,
  newCheckoutCompleteSale,
  newCheckoutDeleteActiveSale,
  saveRefundIndex,
  markItemSalesRefunded,
  voidCustomerDeposit,
} from "./newCheckoutFirebaseCalls";

import { CashRefund } from "./CashRefund";
import { CardRefund } from "./CardRefund";
import { RefundTotals } from "./RefundTotals";
import { RefundItemSelector } from "./RefundItemSelector";
import { RefundPaymentSelector } from "./RefundPaymentSelector";

export const NewRefundModalScreen = memo(function NewRefundModalScreen({ visible, saleID, sale: saleProp, initialPayment, onClose, onSaleUpdated }) {
  const zSalesTaxPercent = useSettingsStore((s) => s.settings?.salesTaxPercent);
  const zCardFeeRefund = useSettingsStore((s) => s.settings?.cardFeeRefund);

  // ─── Local State ──────────────────────────────────────────
  const [sOriginalSale, _setOriginalSale] = useState(null);
  const [sWorkordersInSale, _setWorkordersInSale] = useState([]);
  const [sSelectedItems, _setSelectedItems] = useState([]);
  const [sSelectedPayments, _setSelectedPayments] = useState([]);
  const [sIsCustomAmount, _setIsCustomAmount] = useState(false);
  const [sCustomRefundAmount, _setCustomRefundAmount] = useState(0);
  const [sRefundComplete, _setRefundComplete] = useState(false);
  const [sLoading, _setLoading] = useState(false);
  const [sLoadMessage, _setLoadMessage] = useState("");
  const [sInitialized, _setInitialized] = useState(false);
  const [sIsActiveSale, _setIsActiveSale] = useState(false);
  const [sCustomCardPayment, _setCustomCardPayment] = useState(null);

  // ─── Derived Values ───────────────────────────────────────
  let refundLimits = calculateRefundLimits(sOriginalSale, { cardFeeRefund: zCardFeeRefund });
  let previouslyRefundedIDs = useMemo(() => getPreviouslyRefundedLineIDs(sOriginalSale), [sOriginalSale]);

  // Calculate selected items subtotal
  let selectedItemsTotal = 0;
  sSelectedItems.forEach((item) => {
    let price = item.discountObj?.newPrice != null
      ? item.discountObj.newPrice
      : item.inventoryItem?.price || 0;
    selectedItemsTotal += price;
  });

  // Calculate card payments total and cash payments total
  // Deposit-applied payments are refunded as cash (the deposit was consumed)
  let cardPaymentsTotal = 0;
  let cashPaymentsTotal = 0;
  (sOriginalSale?.payments || []).forEach((p) => {
    let available = p.amountCaptured - (p.amountRefunded || 0);
    if (p.cash || p.check || p.isDeposit) {
      cashPaymentsTotal += available;
    } else {
      cardPaymentsTotal += available;
    }
  });

  let maxCardRefund = Math.min(cardPaymentsTotal, refundLimits.maxRefund);
  let maxCashRefund = Math.min(cashPaymentsTotal, refundLimits.maxRefund);

  // Total available from selected payments
  let selectedPaymentsTotal = 0;
  sSelectedPayments.forEach((p) => {
    selectedPaymentsTotal += p.amountCaptured - (p.amountRefunded || 0);
  });

  // Item-based refund total (subtotal + tax)
  let itemRefundTotal = 0;
  if (sSelectedItems.length > 0) {
    let taxRate = zSalesTaxPercent || 0;
    let refundTax = Math.round(selectedItemsTotal * (taxRate / 100));
    itemRefundTotal = selectedItemsTotal + refundTax;
  }

  // Determine which mode drives the refund: items or payments
  let hasItemSelection = sSelectedItems.length > 0;
  let hasPaymentSelection = sSelectedPayments.length > 0;

  // Suggested refund total: items take priority, then payments
  let suggestedRefundTotal = hasItemSelection ? itemRefundTotal : selectedPaymentsTotal;

  // Split item refund across card/cash (card first, then cash remainder)
  let itemCardAmount = 0;
  let itemCashAmount = 0;
  if (hasItemSelection) {
    itemCardAmount = Math.min(itemRefundTotal, cardPaymentsTotal);
    itemCashAmount = Math.min(itemRefundTotal - itemCardAmount, cashPaymentsTotal);
  }

  let hasCardPayments = cardPaymentsTotal > 0;
  let hasCashPayments = cashPaymentsTotal > 0;

  // Compute which items would exceed the refund limit if added
  let disabledItemIDs = useMemo(() => {
    let set = new Set();
    let taxRate = zSalesTaxPercent || 0;
    sWorkordersInSale.forEach((wo) => {
      (wo.workorderLines || []).forEach((line) => {
        if (sSelectedItems.find((s) => s.id === line.id)) return;
        if (previouslyRefundedIDs.includes(line.id) || previouslyRefundedIDs.includes(line._originalLineId)) return;
        let itemPrice = line.discountObj?.newPrice != null
          ? line.discountObj.newPrice
          : line.inventoryItem?.price || 0;
        let newItemsTotal = selectedItemsTotal + itemPrice;
        let newTotalWithTax = newItemsTotal + Math.round(newItemsTotal * (taxRate / 100));
        if (newTotalWithTax > refundLimits.maxRefund) {
          set.add(line.id);
        }
      });
    });
    return set;
  }, [sSelectedItems, sWorkordersInSale, previouslyRefundedIDs, selectedItemsTotal, zSalesTaxPercent, refundLimits.maxRefund]);

  // ─── Initialization ──────────────────────────────────────
  if (visible && !sInitialized && (saleID || saleProp)) {
    _setInitialized(true);
    if (saleProp) {
      loadSaleFromProp(saleProp);
    } else {
      loadSaleData(saleID);
    }
  }

  async function loadSaleFromProp(sale) {
    _setLoading(true);
    _setLoadMessage("Loading sale...");
    try {
      _setOriginalSale(cloneDeep(sale));
      _setIsActiveSale(!sale.paymentComplete);
      _setLoadMessage("Loading workorders...");
      let workorders = await newCheckoutFetchWorkordersForSale(
        sale.workorderIDs || []
      );
      let splitWOs = splitWorkorderLinesToSingleQty(workorders);
      _setWorkordersInSale(splitWOs);
      if (initialPayment) _setSelectedPayments([initialPayment]);
      _setLoading(false);
      _setLoadMessage("");
    } catch (error) {
      log("Error loading sale for refund:", error);
      _setLoadMessage("Error loading sale data");
      _setLoading(false);
    }
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
    if (hasPaymentSelection) return; // items disabled when payments are selected
    let exists = sSelectedItems.find((s) => s.id === line.id);
    if (exists) {
      _setSelectedItems(sSelectedItems.filter((s) => s.id !== line.id));
    } else {
      if (disabledItemIDs.has(line.id)) return;
      _setSelectedItems([...sSelectedItems, cloneDeep(line)]);
    }
    _setIsCustomAmount(false);
    _setCustomCardPayment(null);
  }

  // ─── Payment Selection ────────────────────────────────────
  let selectedIsCash = sSelectedPayments.length > 0 && (sSelectedPayments[0].cash || sSelectedPayments[0].check || sSelectedPayments[0].isDeposit);
  let selectedIsCard = sSelectedPayments.length > 0 && !selectedIsCash;

  function handleSelectPayment(payment) {
    let alreadySelected = sSelectedPayments.find((p) => p.id === payment.id);
    if (alreadySelected) {
      _setSelectedPayments(sSelectedPayments.filter((p) => p.id !== payment.id));
      return;
    }
    // Clear selected items — payment selection takes over
    if (sSelectedItems.length > 0) _setSelectedItems([]);
    // Block mixed cash/card selection (deposits refund as cash)
    let incomingIsCash = payment.cash || payment.check || payment.isDeposit;
    if (sSelectedPayments.length > 0) {
      let currentIsCash = sSelectedPayments[0].cash || sSelectedPayments[0].check || sSelectedPayments[0].isDeposit;
      if (incomingIsCash !== currentIsCash) return; // mismatched type — disabled rows handle this visually
    }
    _setSelectedPayments([...sSelectedPayments, payment]);
  }

  // ─── Custom Amount ────────────────────────────────────────
  function handleCustomAmountChange(cents) {
    _setCustomRefundAmount(cents);
  }

  function toggleCustomAmount() {
    let entering = !sIsCustomAmount;
    _setIsCustomAmount(entering);
    if (entering) {
      _setSelectedItems([]);
      _setSelectedPayments([]);
      // Auto-select if only one available card payment (exclude deposits)
      let availableCards = (sOriginalSale?.payments || []).filter(
        (p) => !p.cash && !p.check && !p.isDeposit && (p.amountCaptured - (p.amountRefunded || 0)) > 0
      );
      _setCustomCardPayment(availableCards.length === 1 ? availableCards[0] : null);
    } else {
      _setCustomCardPayment(null);
      _setCustomRefundAmount(0);
    }
  }

  function handleSelectCustomCard(payment) {
    if (sCustomCardPayment?.id === payment.id) {
      _setCustomCardPayment(null);
    } else {
      _setCustomCardPayment(payment);
    }
  }

  // ─── Process Refund ───────────────────────────────────────
  async function handleProcessRefund(amount, type, cardDetails) {
    let sale = cloneDeep(sOriginalSale);

    let refund = buildRefundObject(
      amount,
      sSelectedItems,
      cardDetails?.refundId || "",
      "",
      type
    );

    sale.refunds = [...(sale.refunds || []), refund];
    sale.amountRefunded = (sale.amountRefunded || 0) + amount;

    // Update per-payment amountRefunded
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
    } else if (type === "cash") {
      let remaining = amount;
      sale.payments = sale.payments.map((p) => {
        if (remaining <= 0 || (!p.cash && !p.check && !p.isDeposit)) return p;
        let available = p.amountCaptured - (p.amountRefunded || 0);
        let deduct = Math.min(remaining, available);
        remaining -= deduct;
        return { ...p, amountRefunded: (p.amountRefunded || 0) + deduct };
      });
    }

    _setOriginalSale(sale);

    // Persist updated sale immediately
    if (sIsActiveSale) {
      await newCheckoutSaveActiveSale(sale);
    } else {
      await newCheckoutUpdateCompletedSale(sale);
    }

    // Write refund index for reporting
    const primaryWO = sWorkordersInSale[0];
    const customerInfo = {
      first: primaryWO?.customerFirst || "",
      last: primaryWO?.customerLast || "",
      phone: primaryWO?.customerCell || "",
      id: primaryWO?.customerID || "",
    };
    saveRefundIndex(sale, refund, customerInfo);
    if (refund.workorderLines && refund.workorderLines.length > 0) {
      markItemSalesRefunded(sale.id, refund.workorderLines);
    }

    // Build refund receipt
    let settings = useSettingsStore.getState().getSettings();
    let printerID = settings?.selectedPrinterID || "";
    let currentUser = useLoginStore.getState().getCurrentUser();
    let _ctx = { currentUser, settings };
    let refundReceipt = printBuilder.refund(
      refund,
      sale,
      customerInfo,
      primaryWO || { workorderLines: [], taxFree: false },
      zSalesTaxPercent,
      _ctx
    );

    // Always print a paper copy
    if (printerID) {
      dbSavePrintObj(refundReceipt, printerID);
    }

    // SMS/Email — same templates as sale receipts
    const customerForReceipt = {
      first: customerInfo.first,
      last: customerInfo.last,
      customerCell: primaryWO?.customerCell || "",
      email: primaryWO?.customerEmail || "",
      id: customerInfo.id,
    };
    const smsTemplate = findTemplateByType(settings?.smsTemplates || settings?.textTemplates, "saleReceipt");
    const emailTemplate = findTemplateByType(settings?.emailTemplates, "saleReceipt");

    const smsContent = smsTemplate?.content || smsTemplate?.message || "";
    const emailContent = emailTemplate?.content || emailTemplate?.body || "";
    let emptyParts = [];
    if (settings?.autoSMSSalesReceipt && customerForReceipt.customerCell && !smsContent.trim()) emptyParts.push("SMS");
    if (settings?.autoEmailSalesReceipt && customerForReceipt.email && !emailContent.trim()) emptyParts.push("email");
    if (emptyParts.length > 0) {
      useAlertScreenStore.getState().setValues({
        title: "Empty Template",
        message: "The refund receipt " + emptyParts.join(" and ") + " template is empty. Fill in the template content in Dashboard > " + (emptyParts.includes("SMS") ? "Text Templates" : "Email Templates") + ", or uncheck the auto " + emptyParts.join("/") + " option in Dashboard > Printing.",
        btn1Text: "OK",
        handleBtn1Press: () => useAlertScreenStore.getState().setShowAlert(false),
        canExitOnOuterClick: true,
      });
    }

    const canSMS = customerForReceipt.customerCell && smsContent.trim();
    const canEmail = customerForReceipt.email && emailContent.trim();
    if (canSMS || canEmail) {
      sendRefundReceipt(refundReceipt, customerForReceipt, settings, canSMS ? smsTemplate : null, canEmail ? emailTemplate : null);
    }

    // Lock screen — one refund at a time, close and reopen for another
    _setRefundComplete(true);

    // Check if fully refunded
    let newLimits = calculateRefundLimits(sale, { cardFeeRefund: zCardFeeRefund });
    if (newLimits.maxRefund <= 0) {
      if (sIsActiveSale) {
        // Partial sale fully refunded — void it and restore workorders
        sale.voidedByRefund = true;
        _setOriginalSale(sale);
        await newCheckoutCompleteSale(sale);

        let _settings = useSettingsStore.getState().getSettings();
        let statuses = _settings?.statuses || [];
        let _user = useLoginStore.getState().currentUser?.first || "System";
        let _ts = Date.now();
        let finishedLabel = resolveStatus("finished", statuses)?.label || "Finished";
        let allWorkorders = useOpenWorkordersStore.getState().getWorkorders();

        for (let woID of (sale.workorderIDs || [])) {
          let wo = allWorkorders.find((w) => w.id === woID);
          if (!wo) continue;
          let updated = cloneDeep(wo);
          let oldStatusLabel = resolveStatus(wo.status, statuses)?.label || wo.status || "";

          updated.status = "finished";
          updated.activeSaleID = "";
          updated.saleID = "";
          updated.amountPaid = 0;

          let entries = [
            { timestamp: _ts, user: _user, field: "status", action: "changed", from: oldStatusLabel, to: finishedLabel },
            { timestamp: _ts, user: _user, field: "payment", action: "voided", from: "", to: "Sale fully refunded — workorder restored" },
          ];
          updated.changeLog = [...(updated.changeLog || []), ...entries];
          useOpenWorkordersStore.getState().setWorkorder(updated, true);
        }
      } else {
        // Completed sale fully refunded — just flag it
        sale.voidedByRefund = true;
        _setOriginalSale(sale);
        await newCheckoutUpdateCompletedSale(sale);
      }

      // If deposit sale fully refunded, remove deposit from customer
      if (sale.isDepositSale) {
        voidCustomerDeposit(sale.id);
      }
    }

    // Sync parent sale state (checkout modal)
    if (onSaleUpdated) onSaleUpdated(sale);

    // Reset selection for next refund
    _setSelectedItems([]);
    _setSelectedPayments([]);
    _setCustomRefundAmount(0);
    _setIsCustomAmount(false);
    _setCustomCardPayment(null);
  }

  // ─── Close Modal ──────────────────────────────────────────
  function handleClose() {
    _setOriginalSale(null);
    _setWorkordersInSale([]);
    _setSelectedItems([]);
    _setSelectedPayments([]);
    _setIsCustomAmount(false);
    _setCustomRefundAmount(0);
    _setCustomCardPayment(null);
    _setRefundComplete(false);
    _setIsActiveSale(false);
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
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: Fonts.weight.textHeavy,
                  color: C.text,
                }}
              >
                Sale: {saleID || sOriginalSale?.id || saleProp?.id || ""}
              </Text>
              {sOriginalSale && (
                <Text style={{ fontSize: 12, color: C.lightText }}>
                  Original: {formatCurrencyDisp(sOriginalSale.total)}
                </Text>
              )}
            </View>

            {/* Center: Custom refund button or REFUND SCREEN label */}
            <View
              style={{
                position: "absolute",
                left: "50%",
                transform: [{ translateX: "-50%" }],
              }}
            >
              {sOriginalSale && !sRefundComplete ? (
                <Button_
                  text={sIsCustomAmount ? "EXIT CUSTOM REFUND" : "CUSTOM REFUND AMOUNT"}
                  onPress={toggleCustomAmount}
                  colorGradientArr={sIsCustomAmount ? COLOR_GRADIENTS.red : COLOR_GRADIENTS.green}
                  textStyle={{ fontSize: 12, fontWeight: Fonts.weight.textHeavy, letterSpacing: 1 }}
                  buttonStyle={{
                    paddingVertical: 5,
                    paddingHorizontal: 14,
                    borderRadius: 6,
                  }}
                />
              ) : (
                <View
                  style={{
                    backgroundColor: C.lightred,
                    borderRadius: 6,
                    paddingHorizontal: 14,
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
                    REFUND SCREEN
                  </Text>
                </View>
              )}
            </View>

            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            />
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
                <View
                  style={{ flex: 1, opacity: selectedIsCard || !hasCashPayments ? 0.3 : 1 }}
                  pointerEvents={selectedIsCard || !hasCashPayments ? "none" : "auto"}
                >
                  <CashRefund
                    maxCashRefund={maxCashRefund}
                    onProcessRefund={handleProcessRefund}
                    refundComplete={sRefundComplete}
                    suggestedAmount={
                      hasItemSelection ? itemCashAmount
                      : !sIsCustomAmount && !selectedIsCard ? suggestedRefundTotal
                      : 0
                    }
                    lockedAmount={!sIsCustomAmount}
                    shouldFocus={sIsCustomAmount && !!((sOriginalSale?.payments || [])[0]?.cash || (sOriginalSale?.payments || [])[0]?.check || (sOriginalSale?.payments || [])[0]?.isDeposit)}
                  />
                </View>
                <View
                  style={{ flex: 1, opacity: selectedIsCash || !hasCardPayments ? 0.3 : 1 }}
                  pointerEvents={selectedIsCash || !hasCardPayments ? "none" : "auto"}
                >
                  <CardRefund
                    selectedPayment={
                      sIsCustomAmount ? sCustomCardPayment
                      : hasItemSelection && hasCardPayments
                        ? (sOriginalSale?.payments || []).find((p) => !p.cash && !p.check && !p.isDeposit)
                        : selectedIsCard ? sSelectedPayments[0] : null
                    }
                    maxCardRefund={maxCardRefund}
                    onProcessRefund={handleProcessRefund}
                    salesTaxPercent={zSalesTaxPercent}
                    refundComplete={sRefundComplete}
                    suggestedAmount={
                      hasItemSelection ? itemCardAmount
                      : !sIsCustomAmount && !selectedIsCash ? suggestedRefundTotal
                      : 0
                    }
                    lockedAmount={!sIsCustomAmount}
                    shouldFocus={sIsCustomAmount && !((sOriginalSale?.payments || [])[0]?.cash || (sOriginalSale?.payments || [])[0]?.check || (sOriginalSale?.payments || [])[0]?.isDeposit)}
                  />
                </View>
              </View>

              {/* ── MIDDLE COLUMN: Totals & Payments ─────── */}
              <View
                style={{
                  width: "29%",
                  alignSelf: "stretch",
                  borderRightWidth: 1,
                  borderRightColor: gray(0.1),
                }}
              >
                <ScrollView style={{ flex: 1 }}>
                  <RefundTotals
                    originalSale={sOriginalSale}
                    selectedItemsTotal={selectedItemsTotal}
                    itemRefundTotal={itemRefundTotal}
                    selectedPaymentsTotal={selectedPaymentsTotal}
                    customRefundAmount={sCustomRefundAmount}
                    previouslyRefunded={refundLimits.previouslyRefunded}
                    maxRefundAllowed={refundLimits.maxRefund}
                    cardFeeDeduction={refundLimits.cardFeeDeduction}
                    salesTaxPercent={zSalesTaxPercent}
                    isCustomAmount={false}
                    hasItemSelection={hasItemSelection}
                    onCustomAmountChange={handleCustomAmountChange}
                    refundComplete={sRefundComplete}
                  />

                  <RefundPaymentSelector
                    payments={sOriginalSale?.payments || []}
                    selectedPayments={sSelectedPayments}
                    onSelectPayment={handleSelectPayment}
                    disabled={sRefundComplete || sIsCustomAmount}
                  />

                  {/* Card picker for custom refund mode */}
                  {sIsCustomAmount && hasCardPayments && (
                    <View style={{ padding: 10 }}>
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: Fonts.weight.textHeavy,
                          color: C.text,
                          marginBottom: 6,
                          borderBottomWidth: 1,
                          borderBottomColor: gray(0.1),
                          paddingBottom: 4,
                        }}
                      >
                        SELECT CARD FOR REFUND
                      </Text>
                      {(sOriginalSale?.payments || [])
                        .filter((p) => !p.cash && !p.check && !p.isDeposit)
                        .map((payment, idx) => {
                          let available = payment.amountCaptured - (payment.amountRefunded || 0);
                          let fullyRefunded = available <= 0;
                          let isSelected = sCustomCardPayment?.id === payment.id;
                          return (
                            <TouchableOpacity
                              key={payment.id || idx}
                              onPress={() => {
                                if (!fullyRefunded) handleSelectCustomCard(payment);
                              }}
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                paddingVertical: 8,
                                paddingHorizontal: 8,
                                borderBottomWidth: 1,
                                borderBottomColor: gray(0.05),
                                backgroundColor: isSelected ? "rgb(230, 240, 252)" : fullyRefunded ? gray(0.04) : "transparent",
                                borderRadius: 4,
                                opacity: fullyRefunded ? 0.4 : 1,
                              }}
                            >
                              {/* Selection indicator */}
                              <View
                                style={{
                                  width: 16,
                                  height: 16,
                                  borderRadius: 8,
                                  borderWidth: 2,
                                  borderColor: isSelected ? C.blue : gray(0.2),
                                  backgroundColor: isSelected ? C.blue : "transparent",
                                  marginRight: 10,
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                {isSelected && (
                                  <View
                                    style={{
                                      width: 6,
                                      height: 6,
                                      borderRadius: 3,
                                      backgroundColor: "white",
                                    }}
                                  />
                                )}
                              </View>
                              <View style={{ flex: 1 }}>
                                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                                  <View
                                    style={{
                                      backgroundColor: C.blue,
                                      borderRadius: 3,
                                      paddingHorizontal: 5,
                                      paddingVertical: 1,
                                    }}
                                  >
                                    <Text
                                      style={{
                                        fontSize: 9,
                                        fontWeight: Fonts.weight.textHeavy,
                                        color: "white",
                                      }}
                                    >
                                      CARD
                                    </Text>
                                  </View>
                                  <Text
                                    style={{
                                      fontSize: 13,
                                      fontWeight: Fonts.weight.textHeavy,
                                      color: C.text,
                                    }}
                                  >
                                    {formatCurrencyDisp(payment.amountCaptured)}
                                  </Text>
                                </View>
                                {payment.last4 && (
                                  <Text style={{ fontSize: 11, color: C.lightText, marginTop: 2 }}>
                                    {payment.cardIssuer} ****{payment.last4}
                                  </Text>
                                )}
                                {!fullyRefunded && (
                                  <Text style={{ fontSize: 10, color: C.green, marginTop: 1 }}>
                                    Available: {formatCurrencyDisp(available)}
                                  </Text>
                                )}
                                {fullyRefunded && (
                                  <Text style={{ fontSize: 10, color: C.lightred, fontStyle: "italic", marginTop: 2 }}>
                                    Fully refunded
                                  </Text>
                                )}
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                    </View>
                  )}

                </ScrollView>

                <Button_
                  text="EXIT REFUND SCREEN"
                  onPress={handleClose}
                  colorGradientArr={COLOR_GRADIENTS.red}
                  textStyle={{
                    fontSize: 11,
                    fontWeight: Fonts.weight.textHeavy,
                  }}
                  buttonStyle={{
                    paddingVertical: 8,
                    paddingHorizontal: 14,
                    borderRadius: 6,
                    margin: 10,
                  }}
                />
              </View>

              {/* ── RIGHT COLUMN: Item Selector ──────────── */}
              <View
                style={{
                  width: "42%",
                  paddingLeft: 10,
                  opacity: sRefundComplete || sOriginalSale?.isDepositSale ? 0.3 : 1,
                }}
                pointerEvents={sRefundComplete || sOriginalSale?.isDepositSale ? "none" : "auto"}
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
                      Enter the refund amount in the Cash or Card section.
                    </Text>
                  </View>
                ) : (
                  <RefundItemSelector
                    workordersInSale={sWorkordersInSale}
                    selectedItems={sSelectedItems}
                    onToggleItem={handleToggleItem}
                    onClearItems={() => _setSelectedItems([])}
                    previouslyRefundedIDs={previouslyRefundedIDs}
                    disabledItemIDs={disabledItemIDs}
                    hasPaymentSelection={hasPaymentSelection}
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
});

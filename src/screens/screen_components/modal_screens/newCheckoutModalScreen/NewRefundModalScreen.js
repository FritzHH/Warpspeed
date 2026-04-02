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
  useCurrentCustomerStore,
} from "../../../../stores";
import {
  lightenRGBByPercent,
  formatCurrencyDisp,
  findTemplateByType,
  log,
  gray,
  printBuilder,
} from "../../../../utils";
import { dbSavePrintObj } from "../../../../db_calls_wrapper";
import {
  calculateRefundLimits,
  buildRefundObject,
  getPreviouslyRefundedLineIDs,
  splitWorkorderLinesToSingleQty,
  sendRefundReceipt,
  recomputeSaleAmounts,
} from "./newCheckoutUtils";
import {
  readCompletedSale,
  newCheckoutFetchWorkordersForSale,
  writeCompletedSale,
  newCheckoutUpdateCompletedWorkorder,
  markItemSalesRefunded,
  voidCustomerDeposit,
  writeCashRefund,
  writeActiveSale,
  readTransactions,
} from "./newCheckoutFirebaseCalls";

import { CashRefund } from "./CashRefund";
import { CardRefund } from "./CardRefund";
import { RefundTotals } from "./RefundTotals";
import { RefundItemSelector } from "./RefundItemSelector";
import { RefundPaymentSelector } from "./RefundPaymentSelector";

export const NewRefundModalScreen = memo(function NewRefundModalScreen({ visible, saleID, sale: saleProp, transactions: transactionsProp, initialPayment, onClose, onSaleUpdated }) {
  const zSalesTaxPercent = useSettingsStore((s) => s.settings?.salesTaxPercent);
  const zCardFeeRefund = useSettingsStore((s) => s.settings?.cardFeeRefund);

  // ─── Local State ──────────────────────────────────────────
  const [sOriginalSale, _setOriginalSale] = useState(null);
  const [sTransactions, _setTransactions] = useState([]);
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
  const [sCardRefundProcessing, _setCardRefundProcessing] = useState(false);

  // ─── Derived Values ───────────────────────────────────────
  let refundLimits = calculateRefundLimits(sOriginalSale, { cardFeeRefund: zCardFeeRefund }, sTransactions);
  let previouslyRefundedIDs = useMemo(() => getPreviouslyRefundedLineIDs(sOriginalSale, sTransactions), [sOriginalSale, sTransactions]);

  // Calculate selected items subtotal
  let selectedItemsTotal = 0;
  sSelectedItems.forEach((item) => {
    let price = item.discountObj?.newPrice != null
      ? item.discountObj.newPrice
      : item.inventoryItem?.price || 0;
    selectedItemsTotal += price;
  });

  // Calculate card payments total and cash payments total from transactions
  let cardPaymentsTotal = 0;
  let cashPaymentsTotal = 0;
  sTransactions.forEach((p) => {
    let refunded = (p.refunds || []).reduce((s, r) => s + (r.amount || 0), 0);
    let available = p.amountCaptured - refunded;
    if (p.method === "cash" || p.method === "check") {
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
    let refunded = (p.refunds || []).reduce((s, r) => s + (r.amount || 0), 0);
    selectedPaymentsTotal += p.amountCaptured - refunded;
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
      loadSaleFromProp(saleProp, transactionsProp || []);
    } else {
      loadSaleData(saleID);
    }
  }

  async function loadSaleFromProp(sale, txns) {
    _setLoading(true);
    _setLoadMessage("Loading sale...");
    try {
      let saleCopy = cloneDeep(sale);
      let txnsCopy = cloneDeep(txns);

      // Reconcile pending refunds (crash recovery)
      if (saleCopy.pendingRefundIDs?.length > 0) {
        recomputeSaleAmounts(saleCopy, txnsCopy, saleCopy.creditsApplied || []);
        saleCopy.pendingRefundIDs = [];
        if (!saleCopy.paymentComplete) {
          writeActiveSale(saleCopy);
        } else {
          writeCompletedSale(saleCopy);
        }
      }

      _setOriginalSale(saleCopy);
      _setTransactions(txnsCopy);
      _setIsActiveSale(!saleCopy.paymentComplete);
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
      let sale = await readCompletedSale(id);
      if (!sale) {
        _setLoadMessage("Sale not found");
        _setLoading(false);
        return;
      }

      // Load transactions from collection
      let txns = [];
      if (sale.transactionIDs?.length > 0) {
        txns = (await readTransactions(sale.transactionIDs)).filter(Boolean);
      }

      // Reconcile pending refunds (crash recovery)
      if (sale.pendingRefundIDs?.length > 0) {
        recomputeSaleAmounts(sale, txns, sale.creditsApplied || []);
        sale.pendingRefundIDs = [];
        await writeCompletedSale(sale);
      }

      _setOriginalSale(sale);
      _setTransactions(txns);

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
  let selectedIsCash = sSelectedPayments.length > 0 && (sSelectedPayments[0].method === "cash" || sSelectedPayments[0].method === "check");
  let selectedIsCard = sSelectedPayments.length > 0 && !selectedIsCash;

  function handleSelectPayment(payment) {
    let alreadySelected = sSelectedPayments.find((p) => p.id === payment.id);
    if (alreadySelected) {
      _setSelectedPayments([]);
      return;
    }
    // Clear selected items - payment selection takes over
    if (sSelectedItems.length > 0) _setSelectedItems([]);
    // Only one payment at a time
    _setSelectedPayments([payment]);
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
      // Auto-select if only one available card payment
      let availableCards = sTransactions.filter((p) => {
        if (p.method !== "card") return false;
        let refunded = (p.refunds || []).reduce((s, r) => s + (r.amount || 0), 0);
        return (p.amountCaptured - refunded) > 0;
      });
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

  // ─── Pending Refund Tracking (crash recovery) ────────────
  function handleRefundStarted({ refundId, transactionID, amount }) {
    let sale = cloneDeep(sOriginalSale);
    sale.pendingRefundIDs = [...(sale.pendingRefundIDs || []), { refundId, transactionID, amount }];
    _setOriginalSale(sale);
    if (sIsActiveSale) {
      writeActiveSale(sale);
    } else {
      writeCompletedSale(sale);
    }
  }

  function handleRefundFailed(refundId) {
    let sale = cloneDeep(sOriginalSale);
    sale.pendingRefundIDs = (sale.pendingRefundIDs || []).filter((p) => p.refundId !== refundId);
    _setOriginalSale(sale);
    if (sIsActiveSale) {
      writeActiveSale(sale);
    } else {
      writeCompletedSale(sale);
    }
  }

  // ─── Process Refund ───────────────────────────────────────
  async function handleProcessRefund(amount, type, cardDetails) {
    let sale = cloneDeep(sOriginalSale);
    let updatedTxns = cloneDeep(sTransactions);

    // Compute sales tax portion of this refund
    let refundSalesTax = 0;
    if (sale.total > 0 && sale.salesTax > 0) {
      refundSalesTax = Math.round(sale.salesTax * (amount / sale.total));
    }

    // Build refund objects and attach to the correct transaction(s)
    let refundObjects = []; // { transactionID, refundObj } pairs for persistence

    if (type === "card" && cardDetails?.paymentId) {
      // Card refund: use callable's returned refundObj (already written to Firestore by the callable)
      let refund = cardDetails.refundObj || buildRefundObject(amount, cardDetails.paymentId, "card", sSelectedItems, cardDetails.refundId || "", refundSalesTax, "");
      let txnIdx = updatedTxns.findIndex((t) => t.id === cardDetails.paymentId);
      if (txnIdx >= 0) {
        updatedTxns[txnIdx].refunds = [...(updatedTxns[txnIdx].refunds || []), refund];
        refundObjects.push({ transactionID: cardDetails.paymentId, refundObj: refund });
      }
    } else if (type === "cash") {
      // Cash refund: write directly to the selected transaction
      let targetTxn = sSelectedPayments[0];
      let txnIdx = targetTxn ? updatedTxns.findIndex((t) => t.id === targetTxn.id) : -1;
      if (txnIdx >= 0) {
        let refund = buildRefundObject(amount, updatedTxns[txnIdx].id, "cash", sSelectedItems, "", refundSalesTax, "");
        updatedTxns[txnIdx].refunds = [...(updatedTxns[txnIdx].refunds || []), refund];
        refundObjects.push({ transactionID: updatedTxns[txnIdx].id, refundObj: refund });
      }
    }

    // Recompute sale amounts from updated transactions
    recomputeSaleAmounts(sale, updatedTxns, sale.creditsApplied || []);

    // Clear pending refund marker (refund completed successfully on client)
    sale.pendingRefundIDs = [];


    _setOriginalSale(sale);
    _setTransactions(updatedTxns);
    _setRefundComplete(true);
    _setSelectedItems([]);
    _setSelectedPayments([]);
    _setCustomRefundAmount(0);
    _setIsCustomAmount(false);
    _setCustomCardPayment(null);

    // Persist refunds to transaction documents (card refunds already written by callable)
    for (let { transactionID, refundObj } of refundObjects) {
      if (refundObj.method !== "card") await writeCashRefund(transactionID, refundObj);
    }

    // Persist updated sale
    if (sIsActiveSale) {
      await writeActiveSale(sale);
    } else {
      await writeCompletedSale(sale);
    }

    // Update workorder changelogs to reflect refund
    let woIDs = sale.workorderIDs || [];
    if (woIDs.length > 0) {
      let allOpenWorkorders = useOpenWorkordersStore.getState().getWorkorders();
      let freshWorkorders = await newCheckoutFetchWorkordersForSale(woIDs);
      let _user = useLoginStore.getState().currentUser?.first || "System";
      let _ts = Date.now();
      let refundLabel = type === "card" ? "Card" : "Cash";
      let entry = { timestamp: _ts, user: _user, field: "payment", action: "refunded", from: "", to: refundLabel + " refund " + formatCurrencyDisp(amount, true) };
      for (let wo of freshWorkorders) {
        if (!wo || wo.id === "standalone") continue;
        let updatedWO = cloneDeep(wo);
        updatedWO.changeLog = [...(updatedWO.changeLog || []), entry];
        let isOpen = allOpenWorkorders.some((w) => w.id === wo.id);
        if (isOpen) {
          useOpenWorkordersStore.getState().setWorkorder(updatedWO, true);
        } else {
          newCheckoutUpdateCompletedWorkorder(updatedWO);
        }
      }
    }

    // Build refund receipt using the first refund object
    let primaryRefund = refundObjects[0]?.refundObj;
    if (!primaryRefund) return;

    const primaryWO = sWorkordersInSale[0];
    let customerInfo;
    if (primaryWO && primaryWO.id !== "standalone") {
      customerInfo = { first: primaryWO.customerFirst || "", last: primaryWO.customerLast || "", phone: primaryWO.customerCell || "", id: primaryWO.customerID || "" };
    } else {
      let cust = useCurrentCustomerStore.getState().getCustomer();
      customerInfo = { first: cust?.first || "", last: cust?.last || "", phone: cust?.customerCell || "", id: cust?.id || sale.customerID || "" };
    }

    // Mark item sales as refunded
    if (primaryRefund.workorderLines && primaryRefund.workorderLines.length > 0) {
      markItemSalesRefunded(sale.id, primaryRefund.workorderLines);
    }

    let settings = useSettingsStore.getState().getSettings();
    let printerID = settings?.selectedPrinterID || "";
    let currentUser = useLoginStore.getState().getCurrentUser();
    let _ctx = { currentUser, settings };
    let refundReceipt = printBuilder.refund(
      primaryRefund,
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

    // SMS/Email
    const customerForReceipt = {
      first: customerInfo.first,
      last: customerInfo.last,
      customerCell: (primaryWO && primaryWO.id !== "standalone") ? (primaryWO.customerCell || "") : customerInfo.phone,
      email: (primaryWO && primaryWO.id !== "standalone") ? (primaryWO.customerEmail || "") : (useCurrentCustomerStore.getState().getCustomer()?.email || ""),
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

    // Check if fully refunded
    let newLimits = calculateRefundLimits(sale, { cardFeeRefund: zCardFeeRefund }, updatedTxns);
    if (newLimits.maxRefund <= 0) {
      if (sIsActiveSale) {
        // Active sale fully refunded — sale stays open (checkout screen is still active).
        // transactionIDs already cleared above. Just persist the updated sale.
        sale.voidedByRefund = true;
        _setOriginalSale(sale);
        await writeActiveSale(sale);
      } else {
        // Completed sale fully refunded - just flag it
        sale.voidedByRefund = true;
        _setOriginalSale(sale);
        await writeCompletedSale(sale);
      }

      // If deposit sale fully refunded, remove deposit from customer
      if (sale.isDepositSale) {
        voidCustomerDeposit(sale.id, sale.customerID || customerInfo?.id || "");
      }
    }

    // Sync parent sale state (checkout modal)
    if (onSaleUpdated) onSaleUpdated(sale, updatedTxns);
  }

  // ─── Close Modal ──────────────────────────────────────────
  function handleClose() {
    _setOriginalSale(null);
    _setTransactions([]);
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

  // Helper: check if first transaction is cash/check
  let firstTxnIsCash = sTransactions.length > 0 && (sTransactions[0].method === "cash" || sTransactions[0].method === "check");

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
              {sOriginalSale && !sRefundComplete && !sIsActiveSale ? (
                <Button_
                  text={sIsCustomAmount ? "EXIT CUSTOM REFUND" : "CUSTOM REFUND AMOUNT"}
                  onPress={toggleCustomAmount}
                  enabled={!sCardRefundProcessing}
                  colorGradientArr={sIsCustomAmount ? COLOR_GRADIENTS.red : COLOR_GRADIENTS.green}
                  textStyle={{ fontSize: 12, fontWeight: Fonts.weight.textHeavy, letterSpacing: 1 }}
                  buttonStyle={{
                    paddingVertical: 5,
                    paddingHorizontal: 14,
                    borderRadius: 6,
                    opacity: sCardRefundProcessing ? 0.4 : 1,
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
                  style={{ flex: 1, opacity: sCardRefundProcessing || selectedIsCard || !hasCashPayments ? 0.3 : 1 }}
                  pointerEvents={sCardRefundProcessing || selectedIsCard || !hasCashPayments ? "none" : "auto"}
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
                    shouldFocus={sIsCustomAmount && firstTxnIsCash}
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
                        ? sTransactions.find((p) => p.method === "card")
                        : selectedIsCard ? sSelectedPayments[0] : null
                    }
                    maxCardRefund={maxCardRefund}
                    onProcessRefund={handleProcessRefund}
                    onRefundStarted={handleRefundStarted}
                    onRefundFailed={handleRefundFailed}
                    onProcessingChange={(val) => _setCardRefundProcessing(val)}
                    workorderLines={sSelectedItems}
                    salesTaxPercent={zSalesTaxPercent}
                    refundComplete={sRefundComplete}
                    suggestedAmount={
                      hasItemSelection ? itemCardAmount
                      : !sIsCustomAmount && !selectedIsCash ? suggestedRefundTotal
                      : 0
                    }
                    lockedAmount={!sIsCustomAmount}
                    shouldFocus={sIsCustomAmount && !firstTxnIsCash}
                  />
                </View>
              </View>

              {/* ── MIDDLE COLUMN: Totals & Payments ─────── */}
              <View
                style={{
                  width: "29%",
                  borderRightWidth: 1,
                  borderRightColor: gray(0.1),
                  opacity: sCardRefundProcessing ? 0.4 : 1,
                }}
                pointerEvents={sCardRefundProcessing ? "none" : "auto"}
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
                    payments={sTransactions}
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
                      {sTransactions
                        .filter((p) => p.method === "card")
                        .map((payment, idx) => {
                          let refunded = (payment.refunds || []).reduce((s, r) => s + (r.amount || 0), 0);
                          let available = payment.amountCaptured - refunded;
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
                  opacity: sCardRefundProcessing || sRefundComplete || sOriginalSale?.isDepositSale ? 0.3 : 1,
                }}
                pointerEvents={sCardRefundProcessing || sRefundComplete || sOriginalSale?.isDepositSale ? "none" : "auto"}
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
                    isDepositSale={!!sOriginalSale?.isDepositSale}
                    isActiveSale={sIsActiveSale}
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

/* eslint-disable */
import { View, Text, ScrollView, TouchableOpacity, TextInput } from "react-native-web";
import { useState, memo, useMemo } from "react";
import { cloneDeep } from "lodash";
import { ScreenModal, SHADOW_RADIUS_PROTO, Image_, Tooltip } from "../../../../components";
import { C, Fonts, ICONS } from "../../../../styles";
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
  localStorageWrapper,
  capitalizeFirstLetterOfString,
  formatPhoneWithDashes,
  formatMillisForDisplay,
} from "../../../../utils";
import { dbSavePrintObj } from "../../../../db_calls_wrapper";
import {
  calculateRefundLimits,
  buildRefundObject,
  getPreviouslyRefundedLineIDs,
  splitWorkorderLinesToSingleQty,
  sendRefundReceipt,
  recomputeSaleAmounts,
  getAllAppliedCredits,
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

import { dlog, DCAT } from "./checkoutDebugLog";
import { CashRefund } from "./CashRefund";
import { CardRefund } from "./CardRefund";
import { RefundTotals } from "./RefundTotals";
import { RefundItemSelector } from "./RefundItemSelector";
import { RefundPaymentSelector } from "./RefundPaymentSelector";
import { SendReceiptModal } from "./SendReceiptModal";

export const NewRefundModalScreen = memo(function NewRefundModalScreen({ visible, saleID, sale: saleProp, transactions: transactionsProp, initialPayment, onClose, onSaleUpdated }) {
  const zSalesTaxPercent = useSettingsStore((s) => s.settings?.salesTaxPercent);
  const zCardFeeRefund = useSettingsStore((s) => s.settings?.cardFeeRefund);

  // ─── Local State ──────────────────────────────────────────
  const [sOriginalSale, _setOriginalSale] = useState(null);
  const [sTransactions, _setTransactions] = useState([]);
  const [sWorkordersInSale, _setWorkordersInSale] = useState([]);
  const [sSelectedItems, _setSelectedItems] = useState([]);
  const [sSelectedPayments, _setSelectedPayments] = useState([]);
  const [sRefundNote, _setRefundNote] = useState("");
  const [sRefundComplete, _setRefundComplete] = useState(false);
  const [sLoading, _setLoading] = useState(false);
  const [sLoadMessage, _setLoadMessage] = useState("");
  const [sInitialized, _setInitialized] = useState(false);
  const [sIsActiveSale, _setIsActiveSale] = useState(false);
  const [sCardRefundProcessing, _setCardRefundProcessing] = useState(false);
  const [sLastRefundReceipt, _setLastRefundReceipt] = useState(null);
  const [sShowSendReceiptModal, _sSetShowSendReceiptModal] = useState(false);

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

  let selectedIsCash = sSelectedPayments.length > 0 && (sSelectedPayments[0].method === "cash" || sSelectedPayments[0].method === "check");
  let selectedIsCard = sSelectedPayments.length > 0 && !selectedIsCash;

  // Selected payment(s) combined available balance
  let selectedPaymentAvailable = 0;
  sSelectedPayments.forEach((sp) => {
    let spRefunded = (sp.refunds || []).reduce((s, r) => s + (r.amount || 0), 0);
    selectedPaymentAvailable += sp.amountCaptured - spRefunded;
  });

  // Split item refund: if a payment is selected, route to that payment type.
  // Suggested amount must equal items+tax exactly so the user cannot silently
  // process a refund for less than what was selected. If the selected payment
  // can't cover it, the per-method PROCESS guards / handleProcessRefund will
  // surface a clear error.
  let itemCardAmount = 0;
  let itemCashAmount = 0;
  if (hasItemSelection) {
    if (selectedIsCash) {
      itemCashAmount = itemRefundTotal;
    } else if (selectedIsCard) {
      itemCardAmount = itemRefundTotal;
    } else {
      // Fallback: card first, then cash
      itemCardAmount = Math.min(itemRefundTotal, cardPaymentsTotal);
      itemCashAmount = Math.min(itemRefundTotal - itemCardAmount, cashPaymentsTotal);
    }
  }

  let hasCardPayments = cardPaymentsTotal > 0;
  let hasCashPayments = cashPaymentsTotal > 0;

  // Payment-first: require payment selection when multiple payments exist
  let needsPaymentSelection = sTransactions.length > 1 && sSelectedPayments.length === 0;

  let reasonMissing = !sRefundNote.trim();

  // Compute which items would exceed the refund limit or selected payment's available balance
  let disabledItemIDs = useMemo(() => {
    let set = new Set();
    let taxRate = zSalesTaxPercent || 0;
    let maxCap = refundLimits.maxRefund;
    if (sSelectedPayments.length > 0) {
      let combinedAvailable = 0;
      sSelectedPayments.forEach((sp) => {
        let spRefunded = (sp.refunds || []).reduce((s, r) => s + (r.amount || 0), 0);
        combinedAvailable += sp.amountCaptured - spRefunded;
      });
      maxCap = Math.min(maxCap, combinedAvailable);
    }
    sWorkordersInSale.forEach((wo) => {
      (wo.workorderLines || []).forEach((line) => {
        if (sSelectedItems.find((s) => s.id === line.id)) return;
        if (previouslyRefundedIDs.includes(line.id) || previouslyRefundedIDs.includes(line._originalLineId)) return;
        let itemPrice = line.discountObj?.newPrice != null
          ? line.discountObj.newPrice
          : line.inventoryItem?.price || 0;
        let newItemsTotal = selectedItemsTotal + itemPrice;
        let newTotalWithTax = newItemsTotal + Math.round(newItemsTotal * (taxRate / 100));
        if (newTotalWithTax > maxCap) {
          set.add(line.id);
        }
      });
    });
    return set;
  }, [sSelectedItems, sSelectedPayments, sWorkordersInSale, previouslyRefundedIDs, selectedItemsTotal, zSalesTaxPercent, refundLimits.maxRefund]);

  // ─── Initialization ──────────────────────────────────────
  if (visible && !sInitialized && (saleID || saleProp)) {
    dlog(DCAT.INIT, "refund_modal_init", "RefundModal", { saleID: saleID || saleProp?.id || null, fromProp: !!saleProp, hasInitialPayment: !!initialPayment });
    _setInitialized(true);
    if (saleProp) {
      loadSaleFromProp(saleProp, transactionsProp || []);
    } else {
      loadSaleData(saleID);
    }
  }

  async function loadSaleFromProp(sale, txns) {
    dlog(DCAT.INIT, "load_sale_from_prop", "RefundModal", { saleID: sale?.id, txnCount: txns?.length || 0, paymentComplete: sale?.paymentComplete });
    _setLoading(true);
    _setLoadMessage("Loading sale...");
    try {
      let saleCopy = cloneDeep(sale);
      let txnsCopy = cloneDeep(txns);

      // Reconcile pending refunds (crash recovery)
      if (saleCopy.pendingRefundIDs?.length > 0) {
        recomputeSaleAmounts(saleCopy, txnsCopy, getAllAppliedCredits(saleCopy));
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
      // Auto-select payment: use initialPayment if provided, otherwise auto-select if only 1 with balance
      if (initialPayment) {
        _setSelectedPayments([initialPayment]);
      } else {
        let available = txnsCopy.filter((t) => {
          let refunded = (t.refunds || []).reduce((s, r) => s + (r.amount || 0), 0);
          return (t.amountCaptured - refunded) > 0;
        });
        if (available.length === 1) _setSelectedPayments([available[0]]);
      }
      _setLoading(false);
      _setLoadMessage("");
    } catch (error) {
      log("Error loading sale for refund:", error);
      _setLoadMessage("Error loading sale data");
      _setLoading(false);
    }
  }

  async function loadSaleData(id) {
    dlog(DCAT.INIT, "load_sale_data", "RefundModal", { saleID: id });
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
        recomputeSaleAmounts(sale, txns, getAllAppliedCredits(sale));
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

      // Auto-select payment if only 1 with balance
      let available = txns.filter((t) => {
        let refunded = (t.refunds || []).reduce((s, r) => s + (r.amount || 0), 0);
        return (t.amountCaptured - refunded) > 0;
      });
      if (available.length === 1) _setSelectedPayments([available[0]]);

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
    dlog(DCAT.CHECKBOX, "toggle_item", "RefundModal", { lineID: line?.id, alreadySelected: !!sSelectedItems.find((s) => s.id === line?.id) });
    let exists = sSelectedItems.find((s) => s.id === line.id);
    if (exists) {
      _setSelectedItems(sSelectedItems.filter((s) => s.id !== line.id));
    } else {
      if (disabledItemIDs.has(line.id)) return;
      _setSelectedItems([...sSelectedItems, cloneDeep(line)]);
    }
  }

  // ─── Manual Amount Input (clears item selections) ──────────
  function handleManualAmountInput() {
    if (sSelectedItems.length > 0) _setSelectedItems([]);
  }

  // ─── Payment Selection ────────────────────────────────────
  function handleSelectPayment(payment) {
    dlog(DCAT.BUTTON, "select_payment", "RefundModal", { paymentID: payment?.id, method: payment?.method, amountCaptured: payment?.amountCaptured, alreadySelected: !!sSelectedPayments.find((p) => p.id === payment?.id) });
    let alreadySelected = sSelectedPayments.find((p) => p.id === payment.id);
    let isCashOrCheck = payment.method === "cash" || payment.method === "check";

    if (alreadySelected) {
      let remaining = sSelectedPayments.filter((p) => p.id !== payment.id);
      _setSelectedPayments(remaining);
      if (remaining.length === 0) _setSelectedItems([]);
      return;
    }

    if (isCashOrCheck) {
      let existingCash = sSelectedPayments.filter((p) => p.method === "cash" || p.method === "check");
      _setSelectedPayments([...existingCash, payment]);
    } else {
      _setSelectedPayments([payment]);
    }
  }

  // ─── Pending Refund Tracking (crash recovery) ────────────
  function handleRefundStarted({ refundId, transactionID, amount }) {
    dlog(DCAT.ACTION, "refund_started", "RefundModal", { refundId, transactionID, amount });
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
    dlog(DCAT.ACTION, "refund_failed", "RefundModal", { refundId });
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
    dlog(DCAT.ACTION, "process_refund_start", "RefundModal", { amount, type, paymentId: cardDetails?.paymentId || null, refundId: cardDetails?.refundId || null, saleID: sOriginalSale?.id, selectedItemCount: sSelectedItems.length, isActiveSale: sIsActiveSale });
    let sale = cloneDeep(sOriginalSale);
    let updatedTxns = cloneDeep(sTransactions);

    // Compute sales tax portion of this refund
    let refundSalesTax = 0;
    if (sale.total > 0 && sale.salesTax > 0) {
      refundSalesTax = Math.round(sale.salesTax * (amount / sale.total));
    }

    // Build refund notes object
    let currentUser = useLoginStore.getState().getCurrentUser();
    let refundNotes = sRefundNote.trim() ? {
      millis: Date.now(),
      reason: sRefundNote.trim(),
      userID: currentUser?.id || "",
      userInitials: ((currentUser?.first || "")[0] || "") + ((currentUser?.last || "")[0] || ""),
    } : null;

    // Build refund objects and attach to the correct transaction(s)
    let refundObjects = []; // { transactionID, refundObj } pairs for persistence

    if (type === "card" && cardDetails?.paymentId) {
      // Card refund: use callable's returned refundObj (already written to Firestore by the callable)
      let refund = cardDetails.refundObj || buildRefundObject(amount, cardDetails.paymentId, "card", sSelectedItems, cardDetails.refundId || "", refundSalesTax, refundNotes);
      if (refundNotes && !refund.notes) refund.notes = refundNotes;
      let txnIdx = updatedTxns.findIndex((t) => t.id === cardDetails.paymentId);
      if (txnIdx >= 0) {
        updatedTxns[txnIdx].refunds = [...(updatedTxns[txnIdx].refunds || []), refund];
        refundObjects.push({ transactionID: cardDetails.paymentId, refundObj: refund });
      }
    } else if (type === "cash") {
      let cashTargets = sSelectedPayments.filter((p) => p.method === "cash" || p.method === "check");
      if (cashTargets.length === 0) {
        cashTargets = updatedTxns.filter((t) => {
          if (t.method !== "cash" && t.method !== "check") return false;
          let refunded = (t.refunds || []).reduce((s, r) => s + (r.amount || 0), 0);
          return (t.amountCaptured - refunded) > 0;
        });
      }

      // Compute items+tax total. When items are attached we must guarantee
      // that the refund object holding the items has amount >= items+tax,
      // otherwise the receipt's items/tax/total will not match refund.amount.
      let itemsSum = 0;
      sSelectedItems.forEach((item) => {
        let p = item.discountObj?.newPrice != null
          ? item.discountObj.newPrice
          : item.inventoryItem?.price || 0;
        itemsSum += p;
      });
      let itemTotal = sSelectedItems.length > 0
        ? itemsSum + Math.round(itemsSum * ((zSalesTaxPercent || 0) / 100))
        : 0;

      if (sSelectedItems.length > 0) {
        if (amount < itemTotal) {
          useAlertScreenStore.getState().setValues({
            title: "Refund Amount Mismatch",
            message: "Refund amount " + formatCurrencyDisp(amount, true) + " does not cover the selected items total " + formatCurrencyDisp(itemTotal, true) + ". Increase the refund amount or remove items.",
            btn1Text: "OK",
            handleBtn1Press: () => useAlertScreenStore.getState().setShowAlert(false),
            canExitOnOuterClick: true,
          });
          return;
        }
        // Sort descending so the first cash target (where items attach) has
        // the most available balance and can cover items+tax in a single hit.
        cashTargets.sort((a, b) => {
          let aAvail = a.amountCaptured - ((a.refunds || []).reduce((s, r) => s + (r.amount || 0), 0));
          let bAvail = b.amountCaptured - ((b.refunds || []).reduce((s, r) => s + (r.amount || 0), 0));
          return bAvail - aAvail;
        });
        let largestAvail = cashTargets[0]
          ? cashTargets[0].amountCaptured - ((cashTargets[0].refunds || []).reduce((s, r) => s + (r.amount || 0), 0))
          : 0;
        if (largestAvail < itemTotal) {
          useAlertScreenStore.getState().setValues({
            title: "Insufficient Single-Payment Balance",
            message: "Selected items total " + formatCurrencyDisp(itemTotal, true) + " exceeds the largest selected cash payment's available balance " + formatCurrencyDisp(largestAvail, true) + ". Item refunds must come from a single payment with enough balance.",
            btn1Text: "OK",
            handleBtn1Press: () => useAlertScreenStore.getState().setShowAlert(false),
            canExitOnOuterClick: true,
          });
          return;
        }
      } else {
        cashTargets.sort((a, b) => {
          let aAvail = a.amountCaptured - ((a.refunds || []).reduce((s, r) => s + (r.amount || 0), 0));
          let bAvail = b.amountCaptured - ((b.refunds || []).reduce((s, r) => s + (r.amount || 0), 0));
          return aAvail - bAvail;
        });
      }

      let remaining = amount;
      let taxRemaining = refundSalesTax;
      let isFirst = true;
      for (let target of cashTargets) {
        if (remaining <= 0) break;
        let txnIdx = updatedTxns.findIndex((t) => t.id === target.id);
        if (txnIdx < 0) continue;
        let txnAvail = updatedTxns[txnIdx].amountCaptured - ((updatedTxns[txnIdx].refunds || []).reduce((s, r) => s + (r.amount || 0), 0));
        let portion = Math.min(remaining, txnAvail);
        if (portion <= 0) continue;
        let portionTax = remaining === portion ? taxRemaining : Math.round(refundSalesTax * (portion / amount));
        taxRemaining -= portionTax;
        let refund = buildRefundObject(portion, updatedTxns[txnIdx].id, "cash", isFirst ? sSelectedItems : [], "", portionTax, refundNotes);
        updatedTxns[txnIdx].refunds = [...(updatedTxns[txnIdx].refunds || []), refund];
        refundObjects.push({ transactionID: updatedTxns[txnIdx].id, refundObj: refund });
        remaining -= portion;
        isFirst = false;
      }
    }

    // Recompute sale amounts from updated transactions
    recomputeSaleAmounts(sale, updatedTxns, getAllAppliedCredits(sale));

    // Clear pending refund marker (refund completed successfully on client)
    sale.pendingRefundIDs = [];

    _setOriginalSale(sale);
    _setTransactions(updatedTxns);
    _setRefundComplete(true);
    _setSelectedItems([]);
    _setSelectedPayments([]);
    _setRefundNote("");

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
    let printerID = localStorageWrapper.getItem("selectedPrinterID") || "";
    let currentRefundIDs = new Set(refundObjects.map((ro) => ro.refundObj.id));
    let previousRefunds = [];
    for (let txn of updatedTxns) {
      for (let r of (txn.refunds || [])) {
        if (!currentRefundIDs.has(r.id)) previousRefunds.push(r);
      }
    }
    let _ctx = { currentUser, settings, previousRefunds };
    let refundReceipt = printBuilder.refund(
      primaryRefund,
      sale,
      customerInfo,
      primaryWO || { workorderLines: [], taxFree: false },
      zSalesTaxPercent,
      _ctx
    );

    _setLastRefundReceipt(refundReceipt);

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
    dlog(DCAT.ACTION, "process_refund_complete", "RefundModal", { amount, type, saleID: sale?.id, newTotal: sale?.total, voidedByRefund: !!sale?.voidedByRefund });
    if (onSaleUpdated) onSaleUpdated(sale, updatedTxns);
  }

  // ─── Send Refund Receipt (Text / Email) ─────────────────
  function handleSendRefundReceipt() {
    dlog(DCAT.RECEIPT, "send_refund_receipt", "RefundModal", { hasReceipt: !!sLastRefundReceipt, saleID: sOriginalSale?.id });
    if (!sLastRefundReceipt) return;
    let settings = useSettingsStore.getState().getSettings();
    let smsTemplate = findTemplateByType(settings?.smsTemplates || settings?.textTemplates, "saleReceipt");
    let emailTemplate = findTemplateByType(settings?.emailTemplates, "saleReceipt");

    let primaryWO = sWorkordersInSale[0];
    let customerForReceipt = {
      first: (primaryWO && primaryWO.id !== "standalone") ? (primaryWO.customerFirst || "") : (useCurrentCustomerStore.getState().getCustomer()?.first || ""),
      last: (primaryWO && primaryWO.id !== "standalone") ? (primaryWO.customerLast || "") : (useCurrentCustomerStore.getState().getCustomer()?.last || ""),
      customerCell: (primaryWO && primaryWO.id !== "standalone") ? (primaryWO.customerCell || "") : (useCurrentCustomerStore.getState().getCustomer()?.customerCell || ""),
      email: (primaryWO && primaryWO.id !== "standalone") ? (primaryWO.customerEmail || "") : (useCurrentCustomerStore.getState().getCustomer()?.email || ""),
      id: (primaryWO && primaryWO.id !== "standalone") ? (primaryWO.customerID || "") : (useCurrentCustomerStore.getState().getCustomer()?.id || sOriginalSale?.customerID || ""),
    };

    if (customerForReceipt.customerCell || customerForReceipt.email) {
      let smsContent = smsTemplate?.content || smsTemplate?.message || "";
      let emailContent = emailTemplate?.content || emailTemplate?.body || "";
      let canSMS = customerForReceipt.customerCell && smsContent.trim();
      let canEmail = customerForReceipt.email && emailContent.trim();
      if (canSMS || canEmail) {
        sendRefundReceipt(sLastRefundReceipt, customerForReceipt, settings, canSMS ? smsTemplate : null, canEmail ? emailTemplate : null);
      }
    } else {
      _sSetShowSendReceiptModal(true);
    }
  }

  async function handleSendRefundReceiptFromModal({ phone, email }) {
    dlog(DCAT.RECEIPT, "send_refund_receipt_from_modal", "RefundModal", { hasReceipt: !!sLastRefundReceipt, hasPhone: !!phone, hasEmail: !!email });
    if (!sLastRefundReceipt) return;
    let settings = useSettingsStore.getState().getSettings();
    let smsTemplate = findTemplateByType(settings?.smsTemplates || settings?.textTemplates, "saleReceipt");
    let emailTemplate = findTemplateByType(settings?.emailTemplates, "saleReceipt");
    let smsContent = smsTemplate?.content || smsTemplate?.message || "";
    let emailContent = emailTemplate?.content || emailTemplate?.body || "";

    let primaryWO = sWorkordersInSale[0];
    let customerForReceipt = {
      first: primaryWO?.customerFirst || useCurrentCustomerStore.getState().getCustomer()?.first || "Customer",
      last: primaryWO?.customerLast || useCurrentCustomerStore.getState().getCustomer()?.last || "",
      customerCell: phone || "",
      email: email || "",
      id: primaryWO?.customerID || useCurrentCustomerStore.getState().getCustomer()?.id || "",
    };

    let canSMS = phone && smsContent.trim();
    let canEmail = email && emailContent.trim();
    if (canSMS || canEmail) {
      await sendRefundReceipt(sLastRefundReceipt, customerForReceipt, settings, canSMS ? smsTemplate : null, canEmail ? emailTemplate : null);
    }
  }

  // ─── Close Modal ──────────────────────────────────────────
  function handleClose() {
    dlog(DCAT.BUTTON, "close_refund_modal", "RefundModal", { saleID: sOriginalSale?.id, refundComplete: sRefundComplete });
    _setOriginalSale(null);
    _setTransactions([]);
    _setWorkordersInSale([]);
    _setSelectedItems([]);
    _setSelectedPayments([]);
    _setRefundNote("");
    _setRefundComplete(false);
    _setLastRefundReceipt(null);
    _sSetShowSendReceiptModal(false);
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
              {sOriginalSale?.millis ? (
                <Text style={{ fontSize: 12, color: C.lightText }}>
                  {formatMillisForDisplay(sOriginalSale.millis)}
                </Text>
              ) : null}
              {(() => {
                let wo = sWorkordersInSale[0];
                let custFirst = wo?.customerFirst || "";
                let custLast = wo?.customerLast || "";
                let custPhone = wo?.customerCell || "";
                if (!custFirst && !custLast && !custPhone) return null;
                let custName = (capitalizeFirstLetterOfString(custFirst) + " " + capitalizeFirstLetterOfString(custLast)).trim();
                return (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginLeft: 4 }}>
                    {custName ? (
                      <Text style={{ fontSize: 12, color: C.text, fontWeight: Fonts.weight.textHeavy }}>
                        {custName}
                      </Text>
                    ) : null}
                    {custPhone ? (
                      <Text style={{ fontSize: 12, color: C.lightText }}>
                        {formatPhoneWithDashes(custPhone)}
                      </Text>
                    ) : null}
                  </View>
                );
              })()}
            </View>

            {/* Center: REFUND SCREEN label */}
            <View
              style={{
                position: "absolute",
                left: "50%",
                transform: [{ translateX: "-50%" }],
              }}
            >
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
                  style={{ flex: 1, opacity: sCardRefundProcessing || selectedIsCard || !hasCashPayments || needsPaymentSelection ? 0.3 : 1 }}
                  pointerEvents={sCardRefundProcessing || selectedIsCard || !hasCashPayments || needsPaymentSelection ? "none" : "auto"}
                >
                  <CashRefund
                    maxCashRefund={maxCashRefund}
                    onProcessRefund={handleProcessRefund}
                    refundComplete={sRefundComplete}
                    suggestedAmount={
                      hasItemSelection ? itemCashAmount
                      : !selectedIsCard ? suggestedRefundTotal
                      : 0
                    }
                    onManualInput={handleManualAmountInput}
                    reasonMissing={reasonMissing}
                  />
                </View>
                <View
                  style={{ flex: 1, opacity: selectedIsCash || !hasCardPayments || needsPaymentSelection ? 0.3 : 1 }}
                  pointerEvents={selectedIsCash || !hasCardPayments || needsPaymentSelection ? "none" : "auto"}
                >
                  <CardRefund
                    selectedPayment={selectedIsCard ? sSelectedPayments[0] : null}
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
                      : !selectedIsCash ? suggestedRefundTotal
                      : 0
                    }
                    onManualInput={handleManualAmountInput}
                    reasonMissing={reasonMissing}
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
                    previouslyRefunded={refundLimits.previouslyRefunded}
                    maxRefundAllowed={refundLimits.maxRefund}
                    cardFeeDeduction={refundLimits.cardFeeDeduction}
                    salesTaxPercent={zSalesTaxPercent}
                    hasItemSelection={hasItemSelection}
                    refundComplete={sRefundComplete}
                  />

                  <RefundPaymentSelector
                    payments={sTransactions}
                    selectedPayments={sSelectedPayments}
                    onSelectPayment={handleSelectPayment}
                    disabled={sRefundComplete}
                  />

                  {/* ── Refund Notes ──────────────────────────── */}
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
                      REFUND NOTES
                    </Text>

                    {/* Previous refund notes */}
                    {(() => {
                      let allNotes = [];
                      sTransactions.forEach((t) => {
                        (t.refunds || []).forEach((r) => {
                          if (r.notes && r.notes.reason) {
                            allNotes.push(r.notes);
                          }
                        });
                      });
                      if (allNotes.length === 0) return null;
                      return allNotes.map((note, idx) => (
                        <View
                          key={"rn" + idx}
                          style={{
                            backgroundColor: gray(0.03),
                            borderRadius: 4,
                            padding: 6,
                            marginBottom: 4,
                          }}
                        >
                          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                            <Text style={{ fontSize: 10, color: C.lightText, fontStyle: "italic" }}>
                              {note.millis ? formatMillisForDisplay(note.millis) : ""}
                            </Text>
                            {note.userInitials ? (
                              <Text style={{ fontSize: 10, color: C.lightText, fontWeight: Fonts.weight.textHeavy }}>
                                {note.userInitials}
                              </Text>
                            ) : null}
                          </View>
                          <Text style={{ fontSize: 11, color: C.text, marginTop: 2 }}>
                            {note.reason}
                          </Text>
                        </View>
                      ));
                    })()}

                    {/* New note input */}
                    {!sRefundComplete && (
                      <View
                        style={{
                          borderWidth: reasonMissing ? 2 : 1,
                          borderColor: reasonMissing ? C.red : gray(0.15),
                          borderRadius: 6,
                          paddingHorizontal: 8,
                          paddingVertical: 6,
                          backgroundColor: "white",
                          marginTop: 4,
                        }}
                      >
                        <TextInput
                          style={{
                            fontSize: 15,
                            color: C.text,
                            minHeight: 70,
                            outlineWidth: 0,
                            outlineStyle: "none",
                          }}
                          value={sRefundNote}
                          onChangeText={(val) => _setRefundNote(val.length === 1 ? val.toUpperCase() : val)}
                          placeholder={reasonMissing ? "Refund reason (required)" : "Reason for refund..."}
                          placeholderTextColor={reasonMissing ? C.red : gray(0.3)}
                          multiline
                        />
                      </View>
                    )}
                  </View>

                </ScrollView>

                <View style={{ flexDirection: "row", justifyContent: sRefundComplete ? "space-evenly" : "center", alignItems: "center", paddingVertical: 8, borderTopWidth: 1, borderTopColor: gray(0.1) }}>
                  {sRefundComplete && (
                    <Tooltip text="Reprint receipt" position="top">
                      <TouchableOpacity
                        onPress={() => {
                          dlog(DCAT.BUTTON, "reprint_refund_receipt", "RefundModal", { hasReceipt: !!sLastRefundReceipt });
                          let printerID = localStorageWrapper.getItem("selectedPrinterID") || "";
                          if (printerID && sLastRefundReceipt) {
                            dbSavePrintObj(sLastRefundReceipt, printerID);
                          }
                        }}
                        style={{ alignItems: "center", justifyContent: "center", padding: 6 }}
                      >
                        <Image_ icon={ICONS.print} size={35} />
                      </TouchableOpacity>
                    </Tooltip>
                  )}
                  {sRefundComplete && (
                    <Tooltip text="Send receipt" position="top">
                      <TouchableOpacity
                        onPress={handleSendRefundReceipt}
                        style={{ alignItems: "center", justifyContent: "center", padding: 6 }}
                      >
                        <Image_ icon={ICONS.paperPlane} size={35} />
                      </TouchableOpacity>
                    </Tooltip>
                  )}
                  <Tooltip text="Close" position="top">
                    <TouchableOpacity
                      onPress={handleClose}
                      style={{ alignItems: "center", justifyContent: "center", padding: 6 }}
                    >
                      <Image_ icon={ICONS.close1} size={35} />
                    </TouchableOpacity>
                  </Tooltip>
                </View>
              </View>

              {/* ── RIGHT COLUMN: Item Selector ──────────── */}
              <View
                style={{
                  width: "42%",
                  paddingLeft: 10,
                  opacity: sCardRefundProcessing || sRefundComplete || sOriginalSale?.isDepositSale || needsPaymentSelection ? 0.3 : 1,
                }}
                pointerEvents={sCardRefundProcessing || sRefundComplete || sOriginalSale?.isDepositSale || needsPaymentSelection ? "none" : "auto"}
              >
                {needsPaymentSelection ? (
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
                      Select a payment to begin
                    </Text>
                  </View>
                ) : (
                  <RefundItemSelector
                    workordersInSale={sWorkordersInSale}
                    selectedItems={sSelectedItems}
                    onToggleItem={handleToggleItem}
                    onClearItems={() => { dlog(DCAT.BUTTON, "clear_selected_items", "RefundModal"); _setSelectedItems([]); }}
                    previouslyRefundedIDs={previouslyRefundedIDs}
                    disabledItemIDs={disabledItemIDs}
                    hasPaymentSelection={false}
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

          {/* ── Send Receipt Modal ───────────────────── */}
          <SendReceiptModal
            visible={sShowSendReceiptModal}
            onSend={handleSendRefundReceiptFromModal}
            onClose={() => _sSetShowSendReceiptModal(false)}
          />
        </View>
      )}
    />
  );
});

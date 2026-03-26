/* eslint-disable */
import { View, Text, ScrollView } from "react-native-web";
import { useState, useRef, useEffect } from "react";
import { cloneDeep } from "lodash";
import { ScreenModal, SHADOW_RADIUS_PROTO, Button_, CheckBox_, DropdownMenu, Tooltip, Image_ } from "../../../../components";
import { C, Fonts, COLOR_GRADIENTS, ICONS } from "../../../../styles";
import {
  useCheckoutStore,
  useOpenWorkordersStore,
  useInventoryStore,
  useSettingsStore,
  useLoginStore,
  useAlertScreenStore,
  useCurrentCustomerStore,
  useStripePaymentStore,
} from "../../../../stores";
import {
  lightenRGBByPercent,
  formatCurrencyDisp,
  generateEAN13Barcode,
  generateRandomID,
  log,
  printBuilder,
  gray,
  replaceOrAddToArr,
  formatPhoneWithDashes,
  formatPhoneForDisplay,
  findTemplateByType,
  applyDiscountToWorkorderItem,
} from "../../../../utils";
import { WORKORDER_ITEM_PROTO, CONTACT_RESTRICTIONS, RECEIPT_TYPES, RECEIPT_PROTO, CUSTOMER_LANGUAGES, PAYMENT_OBJECT_PROTO, CUSTOMER_DEPOST_TYPES } from "../../../../data";
import { dbSavePrintObj, dbGetCompletedWorkorder, dbSaveCustomer, dbGetCompletedSale } from "../../../../db_calls_wrapper";
import {
  createNewSale,
  updateSaleWithTotals,
  calculateSaleTotals,
  sendSaleReceipt,
} from "./newCheckoutUtils";
import { translateSalesReceipt } from "../../../../shared/receiptTranslator";
import { generateSaleReceiptPDF } from "../../../../pdfGenerator";
import {
  newCheckoutSaveActiveSale,
  newCheckoutGetActiveSale,
  newCheckoutCompleteSale,
  newCheckoutSaveWorkorder,
  newCheckoutCompleteWorkorder,
  newCheckoutGetStripeReaders,
  newCheckoutDeleteActiveSale,
  saveSaleIndex,
} from "./newCheckoutFirebaseCalls";

import { SaleHeader } from "./SaleHeader";
import { CashPayment } from "./CashPayment";
import { CardPayment } from "./CardPayment";
import { CardReaderPayment } from "./CardReaderPayment";
import { SaleTotals } from "./SaleTotals";
import { PaymentsList } from "./PaymentsList";
import { WorkorderCombiner } from "./WorkorderCombiner";
import { InventorySearch } from "./InventorySearch";
import { broadcastToDisplay, broadcastClear, DISPLAY_MSG_TYPES } from "../../../../broadcastChannel";
import { InventoryItemModalScreen } from "../InventoryItemModalScreen";
import { NewRefundModalScreen } from "./NewRefundModalScreen";

// DEV FLAG default — toggled via on-screen switch
let _devSkipCompletion = false;

// Map CUSTOMER_LANGUAGES keys to Google Translate ISO codes
const LANG_TO_ISO = { spanish: "es", english: "en" };
function getTranslateCode(langKey) {
  if (!langKey || langKey === "english") return "";
  return LANG_TO_ISO[langKey] || langKey;
}

function broadcastSaleToDisplay(sale, combinedWOs, addedItems, customerFirst, customerLast) {
  if (!sale) return;
  let mapLine = (line) => ({
    id: line.id,
    qty: line.qty,
    inventoryItem: {
      formalName: line.inventoryItem?.formalName || "",
      price: line.inventoryItem?.price || 0,
    },
    discountObj: line.discountObj
      ? { name: line.discountObj.name, savings: line.discountObj.savings || 0, newPrice: line.discountObj.newPrice || 0 }
      : null,
  });
  broadcastToDisplay(DISPLAY_MSG_TYPES.SALE, {
    customerFirst: customerFirst || "",
    customerLast: customerLast || "",
    combinedWorkorders: (combinedWOs || []).map((wo) => ({
      brand: wo.brand || "",
      model: wo.model || "",
      description: wo.description || "",
      workorderLines: (wo.workorderLines || []).map(mapLine),
    })),
    addedItems: (addedItems || []).map(mapLine),
    sale: {
      subtotal: sale.subtotal,
      discount: sale.discount || 0,
      tax: sale.tax,
      taxRate: sale.salesTaxPercent,
      cardFee: sale.cardFee || 0,
      cardFeePercent: sale.cardFeePercent || 0,
      total: sale.total,
      amountCaptured: sale.amountCaptured || 0,
      paymentComplete: sale.paymentComplete || false,
    },
  });
}

export function NewCheckoutModalScreen() {
  // ─── Zustand Store Access ─────────────────────────────────
  const zIsCheckingOut = useCheckoutStore((state) => state.isCheckingOut);
  const zDepositInfo = useCheckoutStore((state) => state.depositInfo);
  const zOpenWorkorder = useOpenWorkordersStore((state) =>
    state.workorders.find((o) => o.id === state.openWorkorderID) || null
  );
  const zOpenWorkorders = useOpenWorkordersStore((state) => state.workorders);
  const zInventory = useInventoryStore((state) => state.inventoryArr);
  const zSettings = useSettingsStore((state) => state.settings);
  const zCurrentUser = useLoginStore((state) => state.currentUser);
  const zCustomer = useCurrentCustomerStore((state) => state.customer);
  const zStripeReaders = useStripePaymentStore((state) => state.readersArr) || [];

  // ─── Local State ──────────────────────────────────────────
  const [sSale, _setSale] = useState(null);
  const [sCombinedWorkorders, _setCombinedWorkorders] = useState([]);
  const [sAddedItems, _setAddedItems] = useState([]);
  const [sCashChangeNeeded, _setCashChangeNeeded] = useState(0);
  const [sReaderError, _setReaderError] = useState("");
  const [sInitialized, _setInitialized] = useState(false);
  const [sReceiptLanguage, _setReceiptLanguage] = useState("english");
  const [sShowTaxFreeConfirm, _setShowTaxFreeConfirm] = useState(false);
  const [sShowPopConfirm, _setShowPopConfirm] = useState(false);
  const [sCardProcessingAmount, _setCardProcessingAmount] = useState(0);
  const [sCardMode, _setCardMode] = useState("reader"); // "reader" or "manual"
  const [sNewItemModal, _setNewItemModal] = useState(null);
  const [sDevSkip, _setDevSkip] = useState(_devSkipCompletion);
  const [sShowRefundModal, _setShowRefundModal] = useState(false);
  const [sRefundPayment, _setRefundPayment] = useState(null);
  const [sSessionStartPaymentCount, _setSessionStartPaymentCount] = useState(0);

  // ─── Derived Values ───────────────────────────────────────
  let isDepositMode = !!zDepositInfo;
  let isStandalone = !zOpenWorkorder;
  let saleComplete = sSale?.paymentComplete || false;
  let amountLeftToPay = (sSale?.total || 0) - (sSale?.amountCaptured || 0);
  if (amountLeftToPay < 0) amountLeftToPay = 0;
  let cashAmountLeftToPay = amountLeftToPay - sCardProcessingAmount;
  if (cashAmountLeftToPay < 0) cashAmountLeftToPay = 0;
  let custFirst = zOpenWorkorder?.customerFirst || "";
  let custLast = zOpenWorkorder?.customerLast || "";
  let sessionHasNewPayments = (sSale?.payments?.length || 0) > sSessionStartPaymentCount;

  // ─── Initialization ──────────────────────────────────────
  // Called once when the modal opens. We use a flag to avoid
  // repeated init without adding a useEffect.
  if (zIsCheckingOut && !sInitialized) {
    _setInitialized(true);
    _setReceiptLanguage(zCustomer?.language || "english");

    // Check if we're opening a partial sale from ticket search
    let viewOnlySale = useCheckoutStore.getState().viewOnlySale;
    let depositInfo = useCheckoutStore.getState().depositInfo;
    if (depositInfo) {
      initializeDepositCheckout(depositInfo);
    } else if (viewOnlySale) {
      initializeFromViewOnlySale(viewOnlySale);
    } else {
      initializeCheckout();
    }
  }

  async function initializeCheckout() {
    let createdBy = zCurrentUser?.first
      ? zCurrentUser.first + " " + (zCurrentUser.last || "")
      : "";

    // Check if workorder has an existing partial-payment sale to resume
    if (zOpenWorkorder?.activeSaleID) {
      let existingSale = await newCheckoutGetActiveSale(zOpenWorkorder.activeSaleID);
      if (existingSale) {
        log("Resuming existing sale:", existingSale.id);

        // Rebuild combined workorders from the sale's workorderIDs
        let combined = [cloneDeep(zOpenWorkorder)];
        if (existingSale.workorderIDs?.length > 1) {
          for (let woID of existingSale.workorderIDs) {
            if (woID === zOpenWorkorder.id) continue;
            let otherWO = (zOpenWorkorders || []).find((w) => w.id === woID);
            if (otherWO) combined.push(cloneDeep(otherWO));
          }
        }
        _setCombinedWorkorders(combined);

        // Restore added items from the sale
        if (existingSale.addedItems?.length > 0) {
          _setAddedItems(existingSale.addedItems);
        }

        _setSessionStartPaymentCount(existingSale.payments?.length || 0);
        _setSale(existingSale);
        broadcastSaleToDisplay(existingSale, combined, existingSale.addedItems || [], custFirst, custLast);
        fetchReaders();
        return;
      }
    }

    // No existing sale — create a new one
    let sale = createNewSale(zSettings, createdBy);

    if (zOpenWorkorder) {
      // Checkout with workorder
      sale.customerID = zOpenWorkorder.customerID || "";
      let combined = [cloneDeep(zOpenWorkorder)];
      _setCombinedWorkorders(combined);

      // Calculate initial totals
      sale = updateSaleWithTotals(sale, combined, [], zSettings);
      sale.workorderIDs = [zOpenWorkorder.id];
    } else {
      // Standalone sale
      sale.status = "active";
    }

    _setSale(sale);
    broadcastSaleToDisplay(sale, zOpenWorkorder ? [cloneDeep(zOpenWorkorder)] : [], [], custFirst, custLast);

    // Persist immediately for network resilience
    newCheckoutSaveActiveSale(sale);

    // Fetch card readers
    fetchReaders();
  }

  function initializeDepositCheckout(depositInfo) {
    let createdBy = zCurrentUser?.first
      ? zCurrentUser.first + " " + (zCurrentUser.last || "")
      : "";
    let sale = createNewSale(zSettings, createdBy);
    sale.subtotal = depositInfo.amountCents;
    sale.tax = 0;
    sale.discount = 0;
    sale.salesTaxPercent = 0;
    sale.cardFeePercent = zSettings?.useCardFee ? zSettings.cardFeePercent || 0 : 0;
    sale.cardFee = sale.cardFeePercent > 0
      ? Math.round(depositInfo.amountCents * (sale.cardFeePercent / 100))
      : 0;
    sale.total = sale.subtotal + sale.cardFee;
    sale.isDepositSale = true;
    sale.depositType = depositInfo.type || "";
    sale.depositNote = depositInfo.note || "";
    sale.customerID = zCustomer?.id || "";
    _setCombinedWorkorders([]);
    _setAddedItems([]);
    _setSale(sale);
    newCheckoutSaveActiveSale(sale);
    fetchReaders();
  }

  async function initializeFromViewOnlySale(sale) {
    _setSale(sale);

    // Rebuild combined workorders from the sale's workorderIDs
    let combined = [];
    let openWOs = useOpenWorkordersStore.getState().getWorkorders() || [];
    for (let woID of (sale.workorderIDs || [])) {
      let wo = openWOs.find((w) => w.id === woID);
      if (wo) {
        combined.push(cloneDeep(wo));
      } else {
        let completed = await dbGetCompletedWorkorder(woID);
        if (completed) combined.push(completed);
      }
    }
    _setCombinedWorkorders(combined);

    if (sale.addedItems?.length > 0) {
      _setAddedItems(sale.addedItems);
    }

    fetchReaders();
  }

  async function fetchReaders() {
    try {
      let result = await newCheckoutGetStripeReaders();
      let readersArr = result?.data?.data || [];
      useStripePaymentStore.getState().setReadersArr(readersArr);
      let online = readersArr.filter((r) => r.status === "online");
      if (online.length > 0) {
        _setReaderError("");
      } else {
        _setReaderError("No card readers connected to account");
      }
    } catch (e) {
      log("Failed to fetch card readers:", e);
      _setReaderError("No card readers connected to account");
    }
  }

  // Poll for card readers every 5s when none are detected
  let onlineReaders = zStripeReaders.filter((r) => r.status === "online");
  const readerPollRef = useRef(null);
  useEffect(() => {
    if (onlineReaders.length === 0 && sInitialized) {
      readerPollRef.current = setInterval(fetchReaders, 5000);
    }
    return () => {
      if (readerPollRef.current) {
        clearInterval(readerPollRef.current);
        readerPollRef.current = null;
      }
    };
  }, [onlineReaders.length, sInitialized]);

  // ─── Workorder Combining ──────────────────────────────────
  function handleToggleWorkorder(wo) {
    // Cannot uncheck primary workorder
    if (wo.id === zOpenWorkorder?.id) return;

    let newArr;
    if (sCombinedWorkorders.find((o) => o.id === wo.id)) {
      newArr = sCombinedWorkorders.filter((o) => o.id !== wo.id);
    } else {
      newArr = [...sCombinedWorkorders, cloneDeep(wo)];
    }
    _setCombinedWorkorders(newArr);

    // Recalculate totals
    let updated = updateSaleWithTotals(sSale, newArr, sAddedItems, zSettings);
    updated.workorderIDs = newArr.map((o) => o.id);
    _setSale(updated);
    broadcastSaleToDisplay(updated, newArr, sAddedItems, custFirst, custLast);
    newCheckoutSaveActiveSale(updated);
  }

  function handleWorkorderLineChange(woId, newLines) {
    let newArr = sCombinedWorkorders.map((wo) =>
      wo.id === woId ? { ...wo, workorderLines: newLines } : wo
    );
    _setCombinedWorkorders(newArr);
    useOpenWorkordersStore.getState().setField("workorderLines", newLines, woId);

    let updated = updateSaleWithTotals(sSale, newArr, sAddedItems, zSettings);
    _setSale(updated);
    broadcastSaleToDisplay(updated, newArr, sAddedItems, custFirst, custLast);
    newCheckoutSaveActiveSale(updated);
  }

  // Other open workorders for the same customer
  function getOtherCustomerWorkorders() {
    if (!zOpenWorkorder?.customerID) return [];
    return (zOpenWorkorders || []).filter(
      (wo) =>
        wo.customerID === zOpenWorkorder.customerID &&
        wo.id !== zOpenWorkorder.id
    );
  }

  // ─── Inventory Item Management ────────────────────────────
  function handleAddItem(invItem) {
    let newItem = {
      qty: 1,
      inventoryItem: cloneDeep(invItem),
      discountObj: null,
      id: generateEAN13Barcode(),
      useSalePrice: false,
      warranty: false,
    };

    let newAddedItems = [...sAddedItems, newItem];
    _setAddedItems(newAddedItems);

    // Recalculate totals
    let updated = updateSaleWithTotals(
      sSale,
      sCombinedWorkorders,
      newAddedItems,
      zSettings
    );
    _setSale(updated);
    broadcastSaleToDisplay(updated, sCombinedWorkorders, newAddedItems, custFirst, custLast);
    newCheckoutSaveActiveSale(updated);
  }

  function handleItemQtyChange(item, newQty) {
    if (newQty < 1) return;
    let newAddedItems = sAddedItems.map((i) =>
      i.id === item.id ? { ...i, qty: newQty } : i
    );
    _setAddedItems(newAddedItems);

    let updated = updateSaleWithTotals(
      sSale,
      sCombinedWorkorders,
      newAddedItems,
      zSettings
    );
    _setSale(updated);
    broadcastSaleToDisplay(updated, sCombinedWorkorders, newAddedItems, custFirst, custLast);
    newCheckoutSaveActiveSale(updated);
  }

  function handleItemDiscount(item, discountObj) {
    let newAddedItems = sAddedItems.map((i) => {
      if (i.id !== item.id) return i;
      let updatedItem = { ...i, discountObj };
      if (discountObj) {
        updatedItem = applyDiscountToWorkorderItem(updatedItem);
      }
      return updatedItem;
    });
    _setAddedItems(newAddedItems);

    let updated = updateSaleWithTotals(
      sSale,
      sCombinedWorkorders,
      newAddedItems,
      zSettings
    );
    _setSale(updated);
    broadcastSaleToDisplay(updated, sCombinedWorkorders, newAddedItems, custFirst, custLast);
    newCheckoutSaveActiveSale(updated);
  }

  function handleRemoveItem(item) {
    let newAddedItems = sAddedItems.filter((i) => i.id !== item.id);
    _setAddedItems(newAddedItems);

    let updated = updateSaleWithTotals(
      sSale,
      sCombinedWorkorders,
      newAddedItems,
      zSettings
    );
    _setSale(updated);
    broadcastSaleToDisplay(updated, sCombinedWorkorders, newAddedItems, custFirst, custLast);
    newCheckoutSaveActiveSale(updated);
  }

  // ─── Deposit / Credit Application ───────────────────────
  function handleApplyDeposit(deposit) {
    if (!sSale || sSale.paymentComplete) return;
    let amountNeeded = (sSale.total || 0) - (sSale.amountCaptured || 0);
    if (amountNeeded <= 0) return;

    let appliedAmount = Math.min(deposit.amountCents, amountNeeded);
    let remainder = deposit.amountCents - appliedAmount;

    // Create a payment object for this deposit
    let payment = {
      ...cloneDeep(PAYMENT_OBJECT_PROTO),
      id: generateRandomID(),
      amountCaptured: appliedAmount,
      amountTendered: appliedAmount,
      isDeposit: true,
      depositId: deposit.id,
      depositType: deposit.type,
      depositNote: deposit.note || "",
      depositCash: !!deposit.cash,
      depositSaleID: deposit.saleID || "",
      depositOriginalAmount: deposit.amountCents,
      last4: deposit.last4 || "",
      cardType: deposit.cardType || "",
      cardIssuer: deposit.cardIssuer || "",
      millis: Date.now(),
    };

    // Update customer deposits: reduce or remove the used deposit
    let customerDeposits = cloneDeep(zCustomer?.deposits || []);
    let idx = customerDeposits.findIndex((d) => d.id === deposit.id);
    if (idx >= 0) {
      if (remainder > 0) {
        customerDeposits[idx] = { ...customerDeposits[idx], amountCents: remainder };
      } else {
        customerDeposits.splice(idx, 1);
      }
    }
    useCurrentCustomerStore.getState().setCustomer({ ...zCustomer, deposits: customerDeposits });

    // Feed into the existing payment capture flow
    handlePaymentCapture(payment);
  }

  function handleRemoveDeposit(payment) {
    if (!sSale || sSale.paymentComplete) return;
    if (!payment.isDeposit) return;

    // Remove deposit payment from sale
    let sale = cloneDeep(sSale);
    sale.payments = sale.payments.filter((p) => p.id !== payment.id);
    sale.amountCaptured = sale.amountCaptured - payment.amountCaptured;
    _setSale(sale);
    newCheckoutSaveActiveSale(sale);

    // Restore the deposit on the customer
    let customerDeposits = cloneDeep(zCustomer?.deposits || []);
    let existing = customerDeposits.find((d) => d.id === payment.depositId);
    if (existing) {
      // Deposit was partially used — restore the applied amount
      existing.amountCents = existing.amountCents + payment.amountCaptured;
    } else {
      // Deposit was fully consumed — re-add it
      customerDeposits.push({
        id: payment.depositId,
        type: payment.depositType,
        amountCents: payment.depositOriginalAmount || payment.amountCaptured,
        millis: payment.millis,
        note: payment.depositNote || "",
        saleID: payment.depositSaleID || "",
        cash: payment.depositCash || false,
        last4: payment.last4 || "",
        cardType: payment.cardType || "",
        cardIssuer: payment.cardIssuer || "",
      });
    }
    useCurrentCustomerStore.getState().setCustomer({ ...zCustomer, deposits: customerDeposits });
  }

  async function handlePrintDepositReceipt(payment) {
    if (!payment.depositSaleID) return;
    let sale = await dbGetCompletedSale(payment.depositSaleID);
    if (!sale) return;
    let settings = useSettingsStore.getState().getSettings();
    let printerID = settings?.printerCloudId || "";
    if (!printerID) return;
    let _ctx = { currentUser: useLoginStore.getState().getCurrentUser(), settings };
    let customerInfo = {
      first: zCustomer?.first || "",
      last: zCustomer?.last || "",
      phone: zCustomer?.customerCell || "",
      id: zCustomer?.id || "",
    };
    let emptyWO = { workorderLines: [], taxFree: false, status: "" };
    let receipt = printBuilder.sale(sale, sale.payments || [], customerInfo, emptyWO, 0, _ctx);
    dbSavePrintObj(receipt, printerID);
  }

  // ─── Payment Handling ─────────────────────────────────────
  function handlePaymentCapture(payment) {
    // Guard: if sale is already marked complete locally, skip
    if (sSale?.paymentComplete) {
      log("handlePaymentCapture: sale already complete, skipping");
      return;
    }
    let sale = cloneDeep(sSale);
    payment.saleID = sale.id;
    sale.payments = [...sale.payments, payment];
    sale.amountCaptured = sale.amountCaptured + payment.amountCaptured;
    sale.workorderIDs = sCombinedWorkorders.map((o) => o.id);

    // Store added items on the sale so they can be restored on resume
    sale.addedItems = cloneDeep(sAddedItems);

    // Check if fully paid
    if (sale.amountCaptured >= sale.total) {
      sale.paymentComplete = true;
      sale.status = "complete";
      handleSaleComplete(sale);
    } else {
      sale.status = "partial";
      // Update all combined workorders with partial payment info
      updateWorkordersWithPaymentStatus(sale);
    }

    _setSale(sale);
    broadcastSaleToDisplay(sale, sCombinedWorkorders, sAddedItems, custFirst, custLast);

    // Persist immediately — network-failure-proof
    if (!sDevSkip) newCheckoutSaveActiveSale(sale);
  }

  // Update workorders to track that a sale is in progress
  function updateWorkordersWithPaymentStatus(sale) {
    for (let wo of sCombinedWorkorders) {
      let updated = cloneDeep(wo);
      updated.activeSaleID = sale.id;
      updated.amountPaid = sale.amountCaptured;
      if (!sDevSkip) useOpenWorkordersStore.getState().setWorkorder(updated, true);
    }
  }

  async function handleDepositSaleComplete(sale) {
    if (sDevSkip) {
      log("sDevSkip: deposit sale complete locally, skipping DB/print/SMS", sale);
      return;
    }
    let depositInfo = useCheckoutStore.getState().depositInfo;
    if (!depositInfo) return;

    // Create the deposit and add to customer
    let primaryPayment = (sale.payments || [])[0];
    let newDeposit = {
      id: generateRandomID(),
      type: depositInfo.type,
      amountCents: depositInfo.amountCents,
      millis: Date.now(),
      note: depositInfo.note || "",
      saleID: sale.id || "",
      cash: !!primaryPayment?.cash,
      last4: primaryPayment?.last4 || "",
      cardType: primaryPayment?.cardType || "",
      cardIssuer: primaryPayment?.cardIssuer || "",
    };
    let updatedCustomer = cloneDeep(zCustomer) || {};
    updatedCustomer.deposits = [...(updatedCustomer.deposits || []), newDeposit];
    useCurrentCustomerStore.getState().setCustomer(updatedCustomer);
    dbSaveCustomer(updatedCustomer);

    // Complete the sale
    await newCheckoutCompleteSale(sale);

    // Save sale index
    let customerInfo = {
      first: zCustomer?.first || "",
      last: zCustomer?.last || "",
      phone: zCustomer?.customerCell || "",
      id: zCustomer?.id || "",
    };
    saveSaleIndex(sale, customerInfo, [], false);

    // Print receipt
    let settings = useSettingsStore.getState().getSettings();
    let printerID = settings?.printerCloudId || "";
    let _ctx = { currentUser: useLoginStore.getState().getCurrentUser(), settings };
    let emptyWO = { workorderLines: [], taxFree: false, status: "" };
    let saleReceipt = printBuilder.sale(sale, sale.payments || [], customerInfo, emptyWO, 0, _ctx);
    if (settings?.autoPrintSalesReceipt && printerID) {
      dbSavePrintObj(saleReceipt, printerID);
    }
    if (saleReceipt.popCashRegister && !settings?.autoPrintSalesReceipt && printerID) {
      dbSavePrintObj({ popCashRegister: true }, printerID);
    }
  }

  async function handleSaleComplete(sale) {
    // Deposit sale — separate completion path
    if (sale.isDepositSale) {
      handleDepositSaleComplete(sale);
      return;
    }
    // DEV: skip all DB writes, printing, SMS — freeze UI for layout work
    if (sDevSkip) {
      log("sDevSkip: sale complete locally, skipping DB/print/SMS", sale);
      return;
    }
    // Idempotency: check if webhook already completed this sale
    let existingActiveSale = await newCheckoutGetActiveSale(sale.id);
    if (!existingActiveSale) {
      log("handleSaleComplete: active sale gone (webhook completed it). UI cleanup only.");
      // Webhook handled DB completion, printing, SMS/email — just clean up local UI
      for (let wo of sCombinedWorkorders) {
        useOpenWorkordersStore.getState().removeWorkorder(wo, false);
      }
      return;
    }

    // Normal flow — webhook hasn't completed it yet
    // Mark all combined workorders as complete
    for (let wo of sCombinedWorkorders) {
      let woToComplete = cloneDeep(wo);
      woToComplete.paymentComplete = true;
      woToComplete.activeSaleID = "";
      woToComplete.amountPaid = sale.total;
      woToComplete.saleID = sale.id;
      woToComplete.sales = replaceOrAddToArr(woToComplete.sales || [], sale.id);
      woToComplete.endedOnMillis = Date.now();

      // Merge added items into primary workorder only
      if (wo.id === sCombinedWorkorders[0]?.id && sAddedItems.length > 0) {
        sAddedItems.forEach((addedItem) => {
          woToComplete.workorderLines = [
            ...woToComplete.workorderLines,
            cloneDeep(addedItem),
          ];
        });
      }

      await newCheckoutCompleteWorkorder(woToComplete);
      useOpenWorkordersStore.getState().removeWorkorder(woToComplete, false); // remove from local store, don't send DB delete (already archived)
    }

    // Save completed sale to Cloud Storage
    await newCheckoutCompleteSale(sale);

    // Write sale index for reporting
    const primaryWO = sCombinedWorkorders[0];
    const customerInfo = {
      first: primaryWO?.customerFirst || "",
      last: primaryWO?.customerLast || "",
      phone: primaryWO?.customerCell || "",
      id: primaryWO?.customerID || "",
    };
    const allLines = sCombinedWorkorders.flatMap((wo) => wo.workorderLines || []);
    const isStandalone = primaryWO?.isStandaloneSale || false;
    saveSaleIndex(sale, customerInfo, allLines, isStandalone);

    // Receipt actions based on settings
    const settings = useSettingsStore.getState().getSettings();
    const customerForReceipt = {
      first: primaryWO?.customerFirst || "",
      last: primaryWO?.customerLast || "",
      customerCell: primaryWO?.customerCell || "",
      email: primaryWO?.customerEmail || "",
      id: primaryWO?.customerID || "",
    };
    const printerID = settings?.printerCloudId || "8C:77:3B:60:33:22_Star MCP31";

    // Build receipt context
    const _ctx = { currentUser: useLoginStore.getState().getCurrentUser(), settings };

    // Build the sale receipt — it computes popCashRegister and cashChangeGiven
    let saleReceipt = printBuilder.sale(sale, sale.payments || [], customerForReceipt, primaryWO, settings?.salesTaxPercent, _ctx);

    // Pop cash register if receipt says change is needed and auto-print is off
    // (auto-printed receipt already carries the popCashRegister flag)
    if (saleReceipt.popCashRegister && !settings?.autoPrintSalesReceipt) {
      dbSavePrintObj({ popCashRegister: true }, printerID);
    }

    // Translate receipt if non-English language is set
    let translatedReceipt = null;
    let translatedPdfLabels = null;
    let langCode = getTranslateCode(sReceiptLanguage);
    if (langCode) {
      try {
        let translated = await translateSalesReceipt(saleReceipt, langCode);
        translatedReceipt = translated.translatedReceipt;
        translatedPdfLabels = translated.pdfLabels;
      } catch (e) {
        log("Receipt translation failed, falling back to English:", e);
      }
    }

    // Print sale receipt
    if (settings?.autoPrintSalesReceipt) {
      let toPrint = translatedReceipt || saleReceipt;
      dbSavePrintObj(toPrint, printerID);
    }

    // SMS/Email — template-driven
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
        message: "The sale receipt " + emptyParts.join(" and ") + " template is empty. Fill in the template content in Dashboard > " + (emptyParts.includes("SMS") ? "Text Templates" : "Email Templates") + ", or uncheck the auto " + emptyParts.join("/") + " option in Dashboard > Printing.",
        btn1Text: "OK",
        handleBtn1Press: () => useAlertScreenStore.getState().setShowAlert(false),
        canExitOnOuterClick: true,
      });
    }

    const canSMS = customerForReceipt.customerCell && smsContent.trim();
    const canEmail = customerForReceipt.email && emailContent.trim();
    if (canSMS || canEmail) {
      sendSaleReceipt(sale, customerForReceipt, primaryWO, settings, canSMS ? smsTemplate : null, canEmail ? emailTemplate : null, translatedReceipt, translatedPdfLabels);
    }
  }

  function handleCashChange(change) {
    _setCashChangeNeeded(prev => prev + change);
  }

  function handlePartialPayment() {
    let remaining = (sSale?.total || 0) - (sSale?.amountCaptured || 0);
    useAlertScreenStore.getState().setValues({
      showAlert: true,
      title: "Partial Payment",
      message:
        "Close this sale with a remaining balance of $" +
        formatCurrencyDisp(remaining) +
        "? A receipt will be printed and the customer can return to pay the rest.",
      btn1Text: "Yes, Close",
      handleBtn1Press: async () => {
        useAlertScreenStore.getState().setValues({ showAlert: false });

        const primaryWO = sCombinedWorkorders[0];
        const customerForReceipt = {
          first: primaryWO?.customerFirst || "",
          last: primaryWO?.customerLast || "",
          customerCell: primaryWO?.customerCell || "",
          email: primaryWO?.customerEmail || "",
          id: primaryWO?.customerID || "",
        };
        const settings = useSettingsStore.getState().getSettings();
        const printerID = settings?.printerCloudId || "8C:77:3B:60:33:22_Star MCP31";
        const _ctx = { currentUser: useLoginStore.getState().getCurrentUser(), settings };

        // Build receipt
        let saleReceipt = printBuilder.sale(
          sSale,
          sSale.payments,
          customerForReceipt,
          primaryWO,
          settings?.salesTaxPercent,
          _ctx
        );

        // Pop register if change is owed
        if (saleReceipt.popCashRegister && !settings?.autoPrintSalesReceipt) {
          dbSavePrintObj({ popCashRegister: true }, printerID);
        }

        // Translate if non-English
        let translatedReceipt = null;
        let translatedPdfLabels = null;
        let langCode = getTranslateCode(sReceiptLanguage);
        if (langCode) {
          try {
            let translated = await translateSalesReceipt(saleReceipt, langCode);
            translatedReceipt = translated.translatedReceipt;
            translatedPdfLabels = translated.pdfLabels;
          } catch (e) {
            log("Receipt translation failed on partial payment, using English:", e);
          }
        }

        // Print receipt if auto-print enabled
        if (settings?.autoPrintSalesReceipt) {
          let toPrint = translatedReceipt || saleReceipt;
          dbSavePrintObj(toPrint, printerID);
        }

        // SMS/Email
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
            message: "The sale receipt " + emptyParts.join(" and ") + " template is empty. Fill in the template content in Dashboard > " + (emptyParts.includes("SMS") ? "Text Templates" : "Email Templates") + ", or uncheck the auto " + emptyParts.join("/") + " option in Dashboard > Printing.",
            btn1Text: "OK",
            handleBtn1Press: () => useAlertScreenStore.getState().setShowAlert(false),
            canExitOnOuterClick: true,
          });
        }

        const canSMS = customerForReceipt.customerCell && smsContent.trim();
        const canEmail = customerForReceipt.email && emailContent.trim();
        if (canSMS || canEmail) {
          sendSaleReceipt(sSale, customerForReceipt, primaryWO, settings, canSMS ? smsTemplate : null, canEmail ? emailTemplate : null, translatedReceipt, translatedPdfLabels);
        }

        // Close without completing — sale stays in active-sales
        resetAndClose();
      },
      btn2Text: "Go Back",
      handleBtn2Press: () => {
        useAlertScreenStore.getState().setValues({ showAlert: false });
      },
    });
  }

  // ─── Close Modal ──────────────────────────────────────────
  function closeModal() {
    if (
      sSale?.payments?.length > 0 &&
      !sSale.paymentComplete
    ) {
      // Partial payment — confirm with user
      useAlertScreenStore.getState().setValues({
        showAlert: true,
        title: "Partial Payment In Progress",
        message:
          "This sale has partial payments recorded. They have been saved and you can resume later.",
        btn1Text: "Close Anyway",
        handleBtn1Press: () => {
          resetAndClose();
          useAlertScreenStore.getState().setValues({ showAlert: false });
        },
        btn2Text: "Go Back",
        handleBtn2Press: () => {
          useAlertScreenStore.getState().setValues({ showAlert: false });
        },
      });
      return;
    }
    resetAndClose();
  }

  function resetAndClose() {
    // Clean up orphaned active-sale if no payments were made
    if (sSale?.id && !(sSale?.amountCaptured > 0)) {
      newCheckoutDeleteActiveSale(sSale.id);
    }
    broadcastClear();
    _setSale(null);
    _setCombinedWorkorders([]);
    _setAddedItems([]);
    _setCashChangeNeeded(0);
    _setCardProcessingAmount(0);
    _setReaderError("");
    _setInitialized(false);
    _setReceiptLanguage("english");
    _setSessionStartPaymentCount(0);
    // Clean up card payment state + listeners
    let stripeStore = useStripePaymentStore.getState();
    if (stripeStore._cardListeners) {
      stripeStore._cardListeners.unsubscribe();
      stripeStore._cardListeners = null;
    }
    if (stripeStore._cardTimeout) {
      clearTimeout(stripeStore._cardTimeout);
      stripeStore._cardTimeout = null;
    }
    stripeStore.resetCardTransaction();
    useCheckoutStore.getState().setDepositInfo(null);
    useCheckoutStore.getState().setViewOnlySale(null);
    useCheckoutStore.getState().setIsCheckingOut(false);
  }

  async function handleReprint() {
    if (!sSale) return;
    const primaryWO = sCombinedWorkorders[0];
    const customer = {
      first: primaryWO?.customerFirst || "",
      last: primaryWO?.customerLast || "",
      customerCell: primaryWO?.customerCell || "",
      email: primaryWO?.customerEmail || "",
      id: primaryWO?.customerID || "",
    };
    const _ctx = { currentUser: useLoginStore.getState().getCurrentUser(), settings: zSettings };
    let toPrint = printBuilder.sale(
      sSale,
      sSale.payments,
      customer,
      primaryWO,
      zSettings?.salesTaxPercent,
      _ctx
    );

    let langCode = getTranslateCode(sReceiptLanguage);
    if (langCode) {
      try {
        let translated = await translateSalesReceipt(toPrint, langCode);
        toPrint = translated.translatedReceipt;
      } catch (e) {
        log("Receipt translation failed on reprint, using English:", e);
      }
    }

    const printerID = zSettings?.printerCloudId || "8C:77:3B:60:33:22_Star MCP31";
    dbSavePrintObj(toPrint, printerID);
  }

  function handlePrintReceipt() {
    if (!sSale) return;
    let isDeposit = sSale.isDepositSale;
    let primaryWO = isDeposit ? null : sCombinedWorkorders[0];
    let customer = isDeposit
      ? { first: zCustomer?.first || "", last: zCustomer?.last || "", customerCell: zCustomer?.customerCell || "", email: zCustomer?.email || "", id: zCustomer?.id || "" }
      : { first: primaryWO?.customerFirst || "", last: primaryWO?.customerLast || "", customerCell: primaryWO?.customerCell || "", email: primaryWO?.customerEmail || "", id: primaryWO?.customerID || "" };
    let _ctx = { currentUser: useLoginStore.getState().getCurrentUser(), settings: zSettings };
    let wo = isDeposit ? { workorderLines: [], taxFree: false, status: "" } : primaryWO;
    let receipt = printBuilder.sale(sSale, sSale.payments || [], customer, wo, zSettings?.salesTaxPercent, _ctx);
    let printerID = zSettings?.printerCloudId || "";
    if (printerID) dbSavePrintObj(receipt, printerID);
  }

  function handlePopRegister() {
    let printObj = { id: generateEAN13Barcode(), receiptType: RECEIPT_TYPES.register };
    dbSavePrintObj(printObj, zSettings?.printerCloudId || "8C:77:3B:60:33:22_Star MCP31");
    _setShowPopConfirm(true);
    setTimeout(() => _setShowPopConfirm(false), 1000);
  }

  function applyTaxFree(newVal) {
    let newCombined = sCombinedWorkorders.map((wo) => ({
      ...wo,
      taxFree: newVal,
    }));
    _setCombinedWorkorders(newCombined);

    // Persist to each workorder
    newCombined.forEach((wo) => {
      useOpenWorkordersStore.getState().setField("taxFree", newVal, wo.id);
    });

    // Recalculate sale totals
    let updated = updateSaleWithTotals(sSale, newCombined, sAddedItems, zSettings);
    _setSale(updated);
    broadcastSaleToDisplay(updated, newCombined, sAddedItems, custFirst, custLast);
    newCheckoutSaveActiveSale(updated);
  }

  function handleTaxFreeToggle() {
    const primaryWO = sCombinedWorkorders[0];
    if (!primaryWO) return;
    const currentlyTaxFree = !!primaryWO.taxFree;

    if (currentlyTaxFree) {
      applyTaxFree(false);
    } else {
      _setShowTaxFreeConfirm(true);
    }
  }

  // ─── Render ───────────────────────────────────────────────
  return (<>
    <ScreenModal
      modalVisible={zIsCheckingOut}
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
            height: "90%",
            borderRadius: 6,
            ...SHADOW_RADIUS_PROTO,
            shadowColor: C.green,
            overflow: "hidden",
          }}
        >
          {/* DEV TOGGLE */}
          <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", paddingVertical: 4 }}>
            <CheckBox_
              text={"DEV: Skip DB/Print"}
              isChecked={sDevSkip}
              onCheck={() => _setDevSkip(!sDevSkip)}
              textStyle={{ fontSize: 11, color: sDevSkip ? C.red : gray(0.4) }}
            />
          </View>
          {/* ── Main 3-Column Layout ────────────────────── */}
          <View
            style={{
              flex: 1,
              flexDirection: "row",
              padding: 20,
            }}
          >
            {/* ── LEFT COLUMN: Payment Methods ──────────── */}
            <View
              style={{
                width: "29%",
                height: "100%",
                justifyContent: "space-between",
              }}
            >
              <CashPayment
                amountLeftToPay={cashAmountLeftToPay}
                onPaymentCapture={handlePaymentCapture}
                acceptChecks={zSettings?.acceptChecks}
                saleComplete={saleComplete}
                onCashChange={handleCashChange}
                hasReaders={onlineReaders.length > 0}
                isVisible={zIsCheckingOut}
              />
              {sCardMode === "manual" ? (
                <CardPayment
                  amountLeftToPay={amountLeftToPay}
                  onPaymentCapture={handlePaymentCapture}
                  saleComplete={saleComplete}
                  saleID={sSale?.id || ""}
                  customerID={sSale?.customerID || zCustomer?.id || ""}
                  customerEmail={zCustomer?.email || ""}
                  onCardProcessingStart={(amount) => _setCardProcessingAmount(amount)}
                  onCardProcessingEnd={() => _setCardProcessingAmount(0)}
                  onSwitchToReader={() => _setCardMode("reader")}
                />
              ) : (
                <CardReaderPayment
                  amountLeftToPay={amountLeftToPay}
                  onPaymentCapture={handlePaymentCapture}
                    stripeReaders={zStripeReaders}
                    settings={zSettings}
                    saleComplete={saleComplete}
                    readerError={sReaderError}
                    saleID={sSale?.id || ""}
                    customerID={sSale?.customerID || zCustomer?.id || ""}
                    customerEmail={zCustomer?.email || ""}
                    onCardProcessingStart={(amount) => _setCardProcessingAmount(amount)}
                    onCardProcessingEnd={() => _setCardProcessingAmount(0)}
                    onSwitchToManual={() => _setCardMode("manual")}
                  />
              )}
            </View>

            {isDepositMode ? (
              /* ── DEPOSIT MODE: Combined middle+right ───── */
              <View style={{ flex: 1, paddingLeft: 10 }}>
                {/* Deposit Summary Card */}
                <View
                  style={{
                    borderWidth: 2,
                    borderColor: zDepositInfo?.type === CUSTOMER_DEPOST_TYPES.credit ? C.blue : C.green,
                    borderRadius: 8,
                    padding: 14,
                    backgroundColor: C.backgroundListWhite,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
                    <View
                      style={{
                        backgroundColor: zDepositInfo?.type === CUSTOMER_DEPOST_TYPES.credit
                          ? lightenRGBByPercent(C.blue, 70)
                          : lightenRGBByPercent(C.green, 70),
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        borderRadius: 8,
                        marginRight: 10,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 16,
                          fontWeight: "600",
                          color: zDepositInfo?.type === CUSTOMER_DEPOST_TYPES.credit ? C.blue : C.green,
                        }}
                      >
                        {zDepositInfo?.type === CUSTOMER_DEPOST_TYPES.credit ? "Credit" : "Deposit"}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 24, fontWeight: "700", color: C.text }}>
                      {"$" + formatCurrencyDisp(zDepositInfo?.amountCents || 0)}
                    </Text>
                  </View>
                  {!!zDepositInfo?.note && (
                    <Text style={{ fontSize: 15, color: gray(0.5), marginBottom: 4, flexWrap: "wrap" }}>
                      {zDepositInfo.note}
                    </Text>
                  )}
                  {zCustomer && (
                    <Text style={{ fontSize: 15, color: C.text }}>
                      {zCustomer.first} {zCustomer.last}
                    </Text>
                  )}
                </View>

                <SaleTotals
                  sale={sSale}
                  cashChangeNeeded={sCashChangeNeeded}
                  settings={zSettings}
                />

                <View style={{ flex: 1, marginTop: 3 }}>
                  <PaymentsList
                    payments={sSale?.payments}
                    onRefund={(payment) => { _setRefundPayment(payment); _setShowRefundModal(true); }}
                    onPrintReceipt={handlePrintReceipt}
                  />
                </View>

                {/* Bottom Buttons */}
                <View
                  style={{
                    width: "100%",
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "flex-end",
                    borderWidth: 1,
                    borderColor: C.buttonLightGreenOutline,
                    backgroundColor: C.backgroundListWhite,
                    borderRadius: 6,
                    paddingVertical: 2,
                    paddingHorizontal: 3,
                    marginTop: 5,
                  }}
                >
                  <Button_
                    enabled={saleComplete || !sessionHasNewPayments}
                    colorGradientArr={COLOR_GRADIENTS.red}
                    text={saleComplete ? "CLOSE" : "CANCEL"}
                    onPress={closeModal}
                    textStyle={{ color: C.textWhite, fontSize: 13 }}
                    buttonStyle={{ width: 80, height: 30, borderRadius: 6, marginRight: 10 }}
                  />
                  {saleComplete && (
                    <Button_
                      colorGradientArr={COLOR_GRADIENTS.greenblue}
                      text="REPRINT"
                      onPress={handleReprint}
                      textStyle={{ color: C.textWhite }}
                      buttonStyle={{ width: 100, borderRadius: 6, marginRight: 10 }}
                    />
                  )}
                  <Tooltip text="Pop register" position="top">
                    <Button_
                      onPress={handlePopRegister}
                      icon={ICONS.openCashRegister}
                      iconSize={30}
                    />
                  </Tooltip>
                </View>
              </View>
            ) : (
              <>
            {/* ── MIDDLE COLUMN: Totals & Payments ──────── */}
            <View
              style={{
                width: "29%",
                paddingLeft: 10,
              }}
            >
              {/* Customer Info */}
              {zCustomer && (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: C.buttonLightGreenOutline,
                    borderRadius: 6,
                    paddingVertical: 5,
                    paddingHorizontal: 10,
                    backgroundColor: C.backgroundListWhite,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                    }}
                  >
                    <View>
                      <Text style={{ color: C.text, textTransform: "uppercase" }}>
                        {zCustomer.first} {zCustomer.last}
                        {!!zCustomer.contactRestriction && (
                          <Text style={{ color: C.red }}>
                            {zCustomer.contactRestriction === CONTACT_RESTRICTIONS.call
                              ? "    (CALL ONLY)"
                              : "    (EMAIL ONLY)"}
                          </Text>
                        )}
                      </Text>
                      {zCustomer.email && (
                        <Text style={{ color: gray(0.6), fontSize: 12 }}>
                          {zCustomer.email}
                        </Text>
                      )}
                    </View>
                    <View>
                      {zCustomer.customerCell ? (
                        <Text style={{ color: C.text }}>
                          {formatPhoneForDisplay(zCustomer.customerCell)}
                        </Text>
                      ) : !!zCustomer.land && (
                        <Text style={{ color: C.text }}>
                          {formatPhoneForDisplay(zCustomer.land)}
                        </Text>
                      )}
                    </View>
                  </View>
                  {!!zCustomer.streetAddress && (
                    <Text style={{ color: C.text, fontSize: 13 }}>
                      {zCustomer.streetAddress}
                      {!!zCustomer.unit && (
                        <Text style={{ color: C.text, fontSize: 13 }}>
                          {"  |  Unit " + zCustomer.unit}
                        </Text>
                      )}
                      {!!zCustomer.city && (
                        <Text style={{ color: C.text, fontSize: 13 }}>
                          {"   |   " + zCustomer.city}
                        </Text>
                      )}
                    </Text>
                  )}
                </View>
              )}

              {/* Customer Deposits / Credits */}
              {(() => {
                let availableDeposits = (zCustomer?.deposits || []).filter((d) => d.amountCents > 0);
                let saleComplete = sSale?.paymentComplete;
                if (availableDeposits.length === 0 || saleComplete) return null;
                return (
                  <ScrollView
                    style={{
                      maxHeight: 60,
                      borderWidth: 1,
                      borderColor: C.buttonLightGreenOutline,
                      borderRadius: 6,
                      backgroundColor: C.backgroundListWhite,
                      marginTop: 5,
                      paddingHorizontal: 6,
                      paddingVertical: 3,
                    }}
                  >
                    {availableDeposits.map((deposit) => (
                      <View
                        key={deposit.id}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          paddingVertical: 2,
                        }}
                      >
                        <CheckBox_
                          text=""
                          isChecked={false}
                          onCheck={() => handleApplyDeposit(deposit)}
                          buttonStyle={{ marginRight: 4 }}
                          iconSize={16}
                        />
                        <View
                          style={{
                            backgroundColor: deposit.type === CUSTOMER_DEPOST_TYPES.credit
                              ? lightenRGBByPercent(C.blue, 70)
                              : lightenRGBByPercent(C.green, 70),
                            paddingHorizontal: 5,
                            paddingVertical: 1,
                            borderRadius: 6,
                            marginRight: 6,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 9,
                              fontWeight: "600",
                              color: deposit.type === CUSTOMER_DEPOST_TYPES.credit ? C.blue : C.green,
                            }}
                          >
                            {deposit.type === CUSTOMER_DEPOST_TYPES.credit ? "Credit" : "Deposit"}
                          </Text>
                        </View>
                        <Text style={{ fontSize: 12, fontWeight: "600", color: C.text, marginRight: 6 }}>
                          {"$" + formatCurrencyDisp(deposit.amountCents)}
                        </Text>
                        {!!deposit.note && (
                          <Text numberOfLines={1} style={{ fontSize: 10, color: gray(0.5), flex: 1 }}>
                            {deposit.note}
                          </Text>
                        )}
                      </View>
                    ))}
                  </ScrollView>
                );
              })()}

              {/* Sale Totals (includes Amount Left To Pay + Change) */}
              <SaleTotals
                sale={sSale}
                cashChangeNeeded={sCashChangeNeeded}
                settings={zSettings}
              />

              {/* Blue container — fills remaining space */}
              <View
                style={{
                  flex: 1,
                  // backgroundColor: "blue",
                  // borderRadius: 15,
                  marginTop: 3,
                }}
              >

                <PaymentsList
                  payments={sSale?.payments}
                  onRefund={(payment) => { _setRefundPayment(payment); _setShowRefundModal(true); }}
                  onPrintReceipt={handlePrintReceipt}
                  onPrintDepositReceipt={handlePrintDepositReceipt}
                  onRemoveDeposit={!saleComplete ? handleRemoveDeposit : null}
                />

              </View>


              {/* Bottom Buttons: Cancel/Close + Reprint */}
              <View
                style={{
                  width: "100%",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderWidth: 1,
                  borderColor: C.buttonLightGreenOutline,
                  backgroundColor: C.backgroundListWhite,
                  borderRadius: 6,
                  paddingVertical: 2,
                  paddingHorizontal: 3,
                  marginTop: 5
                }}
              >
                {/* Tax-Free & Receipt Language */}

                {sCombinedWorkorders.length > 0 && !saleComplete && !(sSale?.payments.length > 0) && (
                  <CheckBox_
                    text="Tax-Free"
                    isChecked={!!sCombinedWorkorders[0]?.taxFree}
                    onCheck={handleTaxFreeToggle}
                    textStyle={{ fontSize: 13, color: gray(0.5) }}
                  />
                )}


                <View style={{ flexDirection: "column", alignItems: "center" }}>
                  <Text style={{ fontSize: 12, color: gray(0.5) }}>Receipt text</Text>

                  <DropdownMenu
                    dataArr={Object.keys(CUSTOMER_LANGUAGES).map((key) => ({ label: CUSTOMER_LANGUAGES[key], key }))}
                    selectedIdx={Object.keys(CUSTOMER_LANGUAGES).indexOf(sReceiptLanguage || "english")}
                    useSelectedAsButtonTitle={true}
                    onSelect={(item) => _setReceiptLanguage(item.key)}
                    buttonStyle={{ marginLeft: 5, paddingHorizontal: 2, paddingVertical: 3 }}
                    buttonTextStyle={{ fontSize: 12 }}
                    buttonIcon={null}
                    buttonIconSize={0}
                    modalCoordX={80}
                    // modalCoordY={50}
                    openUpward={true}
                  />
                </View>
                {!saleComplete && sessionHasNewPayments && (
                  <Button_
                    colorGradientArr={COLOR_GRADIENTS.greenblue}
                    text="PARTIAL PAYMENT"
                    onPress={handlePartialPayment}
                    textStyle={{ color: C.textWhite, fontSize: 13 }}
                    buttonStyle={{ width: 130, height: 35, borderRadius: 6 }}
                  />
                )}
                <Button_
                  enabled={saleComplete || !sessionHasNewPayments}
                  colorGradientArr={COLOR_GRADIENTS.red}
                  text={saleComplete ? "CLOSE" : "CANCEL"}
                  onPress={closeModal}
                  textStyle={{ color: C.textWhite, fontSize: 13 }}
                  buttonStyle={{ width: 80, height: 30, borderRadius: 6 }}
                />
                {saleComplete && (
                  <Button_
                    colorGradientArr={COLOR_GRADIENTS.greenblue}
                    text="REPRINT"
                    onPress={handleReprint}
                    textStyle={{ color: C.textWhite }}
                    buttonStyle={{ width: 100, borderRadius: 6 }}
                  />
                )}
                <Tooltip text="Pop register" position="top">
                  <Button_
                    onPress={handlePopRegister}
                    icon={ICONS.openCashRegister}
                    iconSize={30}
                  />
                </Tooltip>

              </View>
            </View>

            {/* ── RIGHT COLUMN: Workorders & Inventory ───── */}
            <View
              style={{
                width: "42%",
                paddingLeft: 10,
              }}
            >
              <ScrollView style={{ flex: 1 }}>
                {/* Inventory Search (always available) */}
                <InventorySearch
                  addedItems={sAddedItems}
                  onAddItem={handleAddItem}
                  onRemoveItem={handleRemoveItem}
                  onQtyChange={handleItemQtyChange}
                  onDiscountChange={handleItemDiscount}
                  inventory={zInventory}
                  discounts={zSettings?.discounts || []}
                  onOpenNewItemModal={(item) => _setNewItemModal(item)}
                />

                {/* Workorders (combiner + line items) */}
                {!isStandalone && (
                  <View style={{ marginTop: 15 }} />
                )}
                {!isStandalone && (
                  <WorkorderCombiner
                    combinedWorkorders={sCombinedWorkorders}
                    otherCustomerWorkorders={getOtherCustomerWorkorders()}
                    onToggle={handleToggleWorkorder}
                    onLineChange={handleWorkorderLineChange}
                    primaryWorkorderID={zOpenWorkorder?.id}
                    saleHasPayments={sSale?.payments?.length > 0}
                    salesTaxPercent={zSettings?.salesTaxPercent || 0}
                  />
                )}
              </ScrollView>
            </View>
              </>
            )}
          </View>

          {/* Tax-Free Confirmation Overlay (inline to avoid z-index issues with global AlertBox_) */}
          {sShowTaxFreeConfirm && (
            <View
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: "rgba(0, 0, 0, 0.4)",
                justifyContent: "center",
                alignItems: "center",
                borderRadius: 6,
                zIndex: 100,
              }}
            >
              <View
                style={{
                  backgroundColor: C.backgroundWhite,
                  borderRadius: 6,
                  alignItems: "center",
                  justifyContent: "space-around",
                  minWidth: "32%",
                  minHeight: "24%",
                  paddingVertical: 25,
                  paddingHorizontal: 20,
                }}
              >
                <Text
                  style={{
                    fontWeight: "500",
                    color: "red",
                    fontSize: 25,
                    textAlign: "center",
                  }}
                >
                  Tax-Free Confirmation
                </Text>
                <Text
                  style={{
                    textAlign: "center",
                    width: "90%",
                    marginTop: 10,
                    color: C.text,
                    fontSize: 18,
                  }}
                >
                  No shop parts, even a drop of oil, must leave with the customer for this workorder to qualify as tax-free.
                </Text>
                <View
                  style={{
                    marginTop: 25,
                    flexDirection: "row",
                    justifyContent: "center",
                    gap: 20,
                  }}
                >
                  <Button_
                    colorGradientArr={COLOR_GRADIENTS.green}
                    text="Confirm Tax-Free"
                    textStyle={{ color: C.textWhite }}
                    onPress={() => {
                      _setShowTaxFreeConfirm(false);
                      applyTaxFree(true);
                    }}
                  />
                  <Button_
                    colorGradientArr={COLOR_GRADIENTS.blue}
                    text="Cancel"
                    textStyle={{ color: C.textWhite }}
                    onPress={() => _setShowTaxFreeConfirm(false)}
                  />
                </View>
              </View>
            </View>
          )}

          {/* Pop Register Confirmation */}
          {sShowPopConfirm && (
            <View
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: "rgba(0, 0, 0, 0.35)",
                justifyContent: "center",
                alignItems: "center",
                borderRadius: 6,
                zIndex: 100,
              }}
            >
              <View
                style={{
                  backgroundColor: C.backgroundWhite,
                  borderRadius: 6,
                  alignItems: "center",
                  justifyContent: "center",
                  paddingVertical: 30,
                  paddingHorizontal: 40,
                }}
              >
                <Image_
                  source={ICONS.openCashRegister}
                  style={{ width: 60, height: 60, marginBottom: 12 }}
                />
                <Text style={{ fontSize: 18, fontWeight: "600", color: C.text }}>
                  Register Opened
                </Text>
              </View>
            </View>
          )}
          {sNewItemModal && (
            <InventoryItemModalScreen
              key={sNewItemModal.id}
              item={sNewItemModal}
              isNew={true}
              handleExit={() => _setNewItemModal(null)}
              skipPortal={true}
            />
          )}
        </View>
      )}
    />
    {sShowRefundModal && (
      <NewRefundModalScreen
        visible={true}
        sale={sSale}
        initialPayment={sRefundPayment}
        onClose={() => { _setShowRefundModal(false); _setRefundPayment(null); }}
        onSaleUpdated={(updatedSale) => _setSale(updatedSale)}
      />
    )}
  </>
  );
}

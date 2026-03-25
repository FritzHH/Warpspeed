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
  log,
  printBuilder,
  gray,
  replaceOrAddToArr,
  formatPhoneWithDashes,
  formatPhoneForDisplay,
  findTemplateByType,
  applyDiscountToWorkorderItem,
} from "../../../../utils";
import { WORKORDER_ITEM_PROTO, CONTACT_RESTRICTIONS, RECEIPT_TYPES, RECEIPT_PROTO, CUSTOMER_LANGUAGES } from "../../../../data";
import { dbSavePrintObj, dbGetCompletedWorkorder } from "../../../../db_calls_wrapper";
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
let _devSkipCompletion = true;

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

  // ─── Derived Values ───────────────────────────────────────
  let isStandalone = !zOpenWorkorder;
  let saleComplete = sSale?.paymentComplete || false;
  let amountLeftToPay = (sSale?.total || 0) - (sSale?.amountCaptured || 0);
  if (amountLeftToPay < 0) amountLeftToPay = 0;
  let cashAmountLeftToPay = amountLeftToPay - sCardProcessingAmount;
  if (cashAmountLeftToPay < 0) cashAmountLeftToPay = 0;
  let custFirst = zOpenWorkorder?.customerFirst || "";
  let custLast = zOpenWorkorder?.customerLast || "";

  // ─── Initialization ──────────────────────────────────────
  // Called once when the modal opens. We use a flag to avoid
  // repeated init without adding a useEffect.
  if (zIsCheckingOut && !sInitialized) {
    _setInitialized(true);
    _setReceiptLanguage(zCustomer?.language || "english");

    // Check if we're opening a partial sale from ticket search
    let viewOnlySale = useCheckoutStore.getState().viewOnlySale;
    if (viewOnlySale) {
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

  async function handleSaleComplete(sale) {
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
      btn1Handler: async () => {
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
      btn2Handler: () => {
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
        btn1Handler: () => {
          resetAndClose();
          useAlertScreenStore.getState().setValues({ showAlert: false });
        },
        btn2Text: "Go Back",
        btn2Handler: () => {
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
  return (
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
            borderRadius: 15,
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
                    borderRadius: 10,
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
                  onRefund={saleComplete ? () => _setShowRefundModal(true) : null}
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
                  borderRadius: 10,
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
                {!saleComplete && (sSale?.payments.length > 0) && (
                  <Button_
                    colorGradientArr={COLOR_GRADIENTS.greenblue}
                    text="PARTIAL PAYMENT"
                    onPress={handlePartialPayment}
                    textStyle={{ color: C.textWhite, fontSize: 13 }}
                    buttonStyle={{ width: 130, height: 35 }}
                  />
                )}
                <Button_
                  enabled={
                    saleComplete ||
                    (!(sSale?.amountCaptured > 0) && !saleComplete)
                  }
                  colorGradientArr={COLOR_GRADIENTS.red}
                  text={saleComplete ? "CLOSE" : "CANCEL"}
                  onPress={closeModal}
                  textStyle={{ color: C.textWhite, fontSize: 13 }}
                  buttonStyle={{ width: 80, height: 30, }}
                />
                {saleComplete && (
                  <Button_
                    colorGradientArr={COLOR_GRADIENTS.greenblue}
                    text="REPRINT"
                    onPress={handleReprint}
                    textStyle={{ color: C.textWhite }}
                    buttonStyle={{ width: 100 }}
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
                borderRadius: 15,
                zIndex: 100,
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
                borderRadius: 15,
                zIndex: 100,
              }}
            >
              <View
                style={{
                  backgroundColor: C.backgroundWhite,
                  borderRadius: 15,
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
          <NewRefundModalScreen
            visible={sShowRefundModal}
            sale={sSale}
            onClose={() => _setShowRefundModal(false)}
            onSaleUpdated={(updatedSale) => _setSale(updatedSale)}
          />
        </View>
      )}
    />
  );
}

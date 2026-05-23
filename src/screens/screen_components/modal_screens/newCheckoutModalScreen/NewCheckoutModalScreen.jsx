/* eslint-disable */
import { useState, useRef, useEffect, lazy, Suspense } from "react";
import cloneDeep from "lodash/cloneDeep";
import { DropdownMenu } from "../../../../dom_components/DropdownMenu/DropdownMenu";
import {
  Button,
  CheckBox,
  Dialog,
  Image,
  LoadingIndicator,
  ReceiptSentOverlay,
  StaleBanner,
  TextInput,
  Tooltip,
  TouchableOpacity,
} from "../../../../dom_components";
import styles from "./NewCheckoutModalScreen.module.css";
import { C, Fonts, COLOR_GRADIENTS, ICONS, SHADOW_RADIUS_PROTO } from "../../../../styles";
import {
  useCheckoutStore,
  useOpenWorkordersStore,
  useInventoryStore,
  useSettingsStore,
  useLoginStore,
  useAlertScreenStore,
  useCurrentCustomerStore,
  useStripePaymentStore,
  useTabNamesStore,
  useActiveSalesStore,
  getChangeLogUser,
  diffWorkorderLines,
} from "../../../../stores";
import { lightenRGBByPercent, formatCurrencyDisp, log, printBuilder, replaceOrAddToArr, formatPhoneWithDashes, formatPhoneForDisplay, findTemplateByType, resolveStatus, usdTypeMask, generateEAN13Barcode, createNewWorkorder, localStorageWrapper } from "../../../../utils";
import { WORKORDER_ITEM_PROTO, WORKORDER_PROTO, CONTACT_RESTRICTIONS, RECEIPT_TYPES, RECEIPT_PROTO, CUSTOMER_LANGUAGES, TRANSACTION_PROTO, CREDIT_APPLIED_PROTO, CUSTOMER_DEPOST_TYPES, CUSTOMER_DEPOSIT_PROTO, TAB_NAMES, CUSTOMER_PROTO } from "../../../../data";
import { dbSavePrintObj, dbGetCompletedWorkorder, dbSaveCustomer, dbGetCompletedSale, dbGetCustomer, dbDeleteWorkorder } from "../../../../db_calls_wrapper";
import { takeId, getId } from "../../../../idPool";
import {
  createNewSale,
  updateSaleWithTotals,
  calculateSaleTotals,
  sendSaleReceipt,
  sendGiftCardReceipt,
  recomputeSaleAmounts,
  getAllAppliedCredits,
} from "./newCheckoutUtils";
import { translateSalesReceipt } from "../../../../shared/receiptTranslator";
import {
  newCheckoutSaveWorkorder,
  newCheckoutCompleteWorkorder,
  newCheckoutGetStripeReaders,
  saveItemSales,
  writeTransaction,
  readTransactions,
  deleteTransaction,
  writeActiveSale,
  readActiveSale,
  deleteActiveSale,
  writeCompletedSale,
  newCheckoutCancelStripePayment,
} from "./newCheckoutFirebaseCalls";

import { SaleHeader } from "./SaleHeader";
import { CashPayment } from "./CashPayment";
import { CardPayment } from "./CardPayment";
import { CardReaderPayment } from "./CardReaderPayment";
import { SaleTotals, PaymentStatus, CashChangeNeeded } from "./SaleTotals";
import { PaymentsList } from "./PaymentsList";
import { InventorySearch } from "./InventorySearch";
import { broadcastToDisplay, broadcastClear, DISPLAY_MSG_TYPES } from "../../../../broadcastChannel";
const InventoryItemModalScreen = lazy(() =>
  import("../InventoryItemModalScreen").then((m) => ({ default: m.InventoryItemModalScreen }))
);

const WorkorderCombiner = lazy(() =>
  import("./WorkorderCombiner").then((m) => ({ default: m.WorkorderCombiner }))
);
const NewRefundModalScreen = lazy(() =>
  import("./NewRefundModalScreen").then((m) => ({ default: m.NewRefundModalScreen }))
);
const SendReceiptModal = lazy(() =>
  import("./SendReceiptModal").then((m) => ({ default: m.SendReceiptModal }))
);
import { dlog, DCAT } from "./checkoutDebugLog";

// Stable empty array reference to prevent re-renders from || [] patterns
const EMPTY_ARR = [];

// Map CUSTOMER_LANGUAGES keys to Google Translate ISO codes
const LANG_TO_ISO = { spanish: "es", english: "en" };
function getTranslateCode(langKey) {
  if (!langKey || langKey === "english") return "";
  return LANG_TO_ISO[langKey] || langKey;
}

function broadcastSaleToDisplay(sale, combinedWOs, customerFirst, customerLast, customerLanguage) {
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
  let _storeName = useSettingsStore.getState().getSettings()?.storeInfo?.displayName || "";
  broadcastToDisplay(DISPLAY_MSG_TYPES.SALE, {
    storeName: _storeName,
    customerFirst: customerFirst || "",
    customerLast: customerLast || "",
    customerLanguage: customerLanguage || "",
    combinedWorkorders: (combinedWOs || []).map((wo) => ({
      brand: wo.brand || "",
      description: wo.description || "",
      workorderLines: (wo.workorderLines || []).map(mapLine),
    })),
    sale: {
      subtotal: sale.subtotal,
      discount: sale.discount || 0,
      tax: sale.salesTax,
      taxRate: sale.salesTaxPercent,
      cardFee: sale.cardFee || 0,
      cardFeePercent: sale.cardFeePercent || 0,
      total: sale.total,
      amountCaptured: sale.amountCaptured || 0,
      paymentComplete: sale.paymentComplete || false,
    },
  });
}

function SplitDepositModal({ payment, maxAvailable, onConfirm, onRemove, onClose }) {
  const [sAmount, _sSetAmount] = useState("");
  const [sAmountCents, _sSetAmountCents] = useState(0);

  let maxAmount = maxAvailable || payment.amount;
  let isValid = sAmountCents > 0 && sAmountCents <= maxAmount;
  let isUnchanged = sAmountCents === payment.amount;
  let typeLabel = payment.type === "credit" ? "Credit" : "Deposit";

  return (
    <div className={styles.splitOverlay}>
      <div
        className={styles.splitBox}
        style={{ backgroundColor: C.backgroundWhite, borderColor: C.buttonLightGreenOutline }}
      >
        <span className={styles.splitTitle} style={{ color: C.text }}>
          {"Adjust " + typeLabel + " Amount"}
        </span>

        <div className={styles.splitRow}>
          <span className={styles.splitRowText} style={{ color: C.green }}>Currently applied</span>
          <span className={styles.splitRowText} style={{ color: C.green }}>{formatCurrencyDisp(payment.amount, true)}</span>
        </div>

        {maxAmount !== payment.amount && (
          <div className={styles.splitRow}>
            <span className={styles.splitRowText} style={{ color: C.textMuted }}>Full amount available</span>
            <span className={styles.splitRowText} style={{ color: C.textMuted }}>{formatCurrencyDisp(maxAmount, true)}</span>
          </div>
        )}

        <div
          className={styles.splitInputWrap}
          style={{ borderColor: C.buttonLightGreenOutline, backgroundColor: C.listItemWhite }}
        >
          <span className={styles.splitDollar} style={{ color: C.textMuted }}>$</span>
          <TextInput
            placeholder="0.00"
            placeholderTextColor={C.textDisabled}
            value={sAmount}
            onChangeText={(val) => {
              let cleaned = val.replace(/[^0-9.]/g, "");
              let result = usdTypeMask(cleaned);
              if (result.cents > maxAmount) {
                result = usdTypeMask(formatCurrencyDisp(maxAmount));
              }
              _sSetAmount(result.display);
              _sSetAmountCents(result.cents);
            }}
            debounceMs={0}
            autoFocus={true}
            style={{
              flex: 1, fontSize: 16, outlineWidth: 0, outlineStyle: "none",
              borderWidth: 0, height: 38, color: C.text,
            }}
          />
        </div>

        {isValid && !isUnchanged && (
          <span className={styles.splitRemainderText} style={{ color: C.textMuted }}>
            {formatCurrencyDisp(maxAmount - sAmountCents, true) + " remainder available for future use"}
          </span>
        )}

        <div className={styles.splitButtonsRow}>
          <Button
            text="Remove From Sale"
            icon={ICONS.trash}
            iconSize={14}
            colorGradientArr={COLOR_GRADIENTS.red}
            textStyle={{ color: C.textWhite, fontSize: 12 }}
            buttonStyle={{ height: 32, borderRadius: 5, paddingHorizontal: 10 }}
            onPress={onRemove}
          />
          <div className={styles.splitButtonsRight}>
            <Button
              text="Cancel"
              colorGradientArr={COLOR_GRADIENTS.grey}
              textStyle={{ color: C.textWhite, fontSize: 12 }}
              buttonStyle={{ height: 32, borderRadius: 5, paddingHorizontal: 10, marginRight: 8 }}
              onPress={onClose}
            />
            <Button
              text={isUnchanged ? "No Change" : "Apply"}
              colorGradientArr={isValid && !isUnchanged ? COLOR_GRADIENTS.green : COLOR_GRADIENTS.grey}
              textStyle={{ color: C.textWhite, fontSize: 12 }}
              buttonStyle={{ height: 32, borderRadius: 5, paddingHorizontal: 10, opacity: isValid && !isUnchanged ? 1 : 0.5 }}
              onPress={() => { if (isValid && !isUnchanged) onConfirm(sAmountCents); }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function NewCheckoutModalScreen() {
  // ─── Zustand Store Access ─────────────────────────────────
  const zIsCheckingOut = useCheckoutStore((state) => state.isCheckingOut);
  const zDepositInfo = useCheckoutStore((state) => state.depositInfo);
  const zOpenWorkorder = useOpenWorkordersStore((state) =>
    state.workorders.find((o) => o.id === state.openWorkorderID) || null
  );
  const zInventory = useInventoryStore((state) => state.inventoryArr);
  const zSettings = useSettingsStore((state) => state.settings);
  const zCustomer = useCurrentCustomerStore((state) => state.customer);
  const zStripeReaders = useStripePaymentStore((state) => state.readersArr || EMPTY_ARR);

  // ─── Local State ──────────────────────────────────────────
  const [sSale, _setSale] = useState(null);
  const [sCombinedWorkorders, _setCombinedWorkorders] = useState([]);
  const [sCashChangeNeeded, _setCashChangeNeeded] = useState(0);
  const [sReaderError, _setReaderError] = useState("");
  const [sInitialized, _setInitialized] = useState(false);
  const [sReceiptLanguage, _setReceiptLanguage] = useState("english");
  const [sShowTaxFreeConfirm, _setShowTaxFreeConfirm] = useState(false);
  const [sShowPopConfirm, _setShowPopConfirm] = useState(false);
  const [sCardProcessingAmount, _setCardProcessingAmount] = useState(0);
  const [sCardMode, _setCardMode] = useState("reader"); // "reader" or "manual"
  const [sNewItemModal, _setNewItemModal] = useState(null);
  const [sShowRefundModal, _setShowRefundModal] = useState(false);
  const [sRefundPayment, _setRefundPayment] = useState(null);
  const [sSplitDepositPayment, _setSplitDepositPayment] = useState(null);
  const [sExpandedCreditIds, _setExpandedCreditIds] = useState([]);
  const [sDepositInputDisp, _setDepositInputDisp] = useState("");
  const [sDepositInputCents, _setDepositInputCents] = useState(0);
  const [sShowSendReceiptModal, _sSetShowSendReceiptModal] = useState(false);
  const [sShowPickupModal, _setShowPickupModal] = useState(false);
  const [sPickupKeepOpenExpanded, _setPickupKeepOpenExpanded] = useState(false);
  const [sPickupKeepOpenReason, _setPickupKeepOpenReason] = useState("");
  const [sPickupCountdown, _setPickupCountdown] = useState(10);
  const [sReceiptSentOverlay, _setReceiptSentOverlay] = useState(null);
  const [sTransactions, _setTransactions] = useState([]);   // real payments (cash/card)
  const [sCredits, _setCredits] = useState([]);              // applied credits/deposits/gift cards
  const salePersistedRef = useRef(false);
  // ─── Derived Values ───────────────────────────────────────
  let isDepositMode = !!zDepositInfo;
  let isStandalone = !zOpenWorkorder?.customerID;
  let saleComplete = sSale?.paymentComplete || false;
  let amountLeftToPay = Math.round((sSale?.total || 0) - (sSale?.amountCaptured || 0));
  if (amountLeftToPay < 0) amountLeftToPay = 0;
  let cashAmountLeftToPay = amountLeftToPay - sCardProcessingAmount;
  let cardIsProcessing = sCardProcessingAmount > 0;
  if (cashAmountLeftToPay < 0) cashAmountLeftToPay = 0;
  let custFirst = zOpenWorkorder?.customerFirst || zCustomer?.first || "";
  let custLast = zOpenWorkorder?.customerLast || zCustomer?.last || "";
  let custLanguage = zOpenWorkorder?.customerLanguage || zCustomer?.language || "";
  let isZeroTotal = (sSale?.total === 0) && !saleComplete;
  let isFullyPaid = !isZeroTotal && amountLeftToPay <= 0 && (sSale?.amountCaptured || 0) > 0;
  let hasRealPayments = sTransactions.some((t) => {
    let refunded = (t.refunds || []).reduce((s, r) => s + (r.amount || 0), 0);
    return (t.amountCaptured || 0) > refunded;
  }) || sCredits.length > 0;

  // Auto-close after sale completion (only when pickup-decision modal is NOT awaiting input — e.g., deposit/gift-card sales).
  useEffect(() => {
    if (!saleComplete) return;
    if (sShowPickupModal) return;
    let timer = setTimeout(() => closeModal(), 15000);
    return () => clearTimeout(timer);
  }, [saleComplete, sShowPickupModal]);

  // Pickup-decision modal: 10-second countdown that auto-fires Complete & Close at zero.
  // Pauses (cancels) the moment the user clicks "Keep Ticket Open" (expanded = true).
  useEffect(() => {
    if (!sShowPickupModal) return;
    if (sPickupKeepOpenExpanded) return;
    if (sPickupCountdown <= 0) {
      handlePickupCompleteAndClose();
      return;
    }
    let t = setTimeout(() => _setPickupCountdown((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [sShowPickupModal, sPickupKeepOpenExpanded, sPickupCountdown]);

  // ─── Initialization ──────────────────────────────────────
  useEffect(() => {
    if (!zIsCheckingOut || sInitialized) return;
    dlog(DCAT.INIT, "checkout_modal_open", "CheckoutModal", { workorderID: zOpenWorkorder?.id, customerID: zOpenWorkorder?.customerID, hasDepositInfo: !!useCheckoutStore.getState().depositInfo, hasViewOnlySale: !!useCheckoutStore.getState().viewOnlySale });
    _setInitialized(true);
    _setReceiptLanguage(
      Object.keys(CUSTOMER_LANGUAGES).find((k) => CUSTOMER_LANGUAGES[k] === zCustomer?.language) || "english"
    );

    fetchReaders();

    let viewOnlySale = useCheckoutStore.getState().viewOnlySale;
    let depositInfo = useCheckoutStore.getState().depositInfo;
    if (depositInfo) {
      initializeDepositCheckout(depositInfo);
    } else if (viewOnlySale) {
      initializeFromViewOnlySale(viewOnlySale);
    } else {
      initializeCheckout();
    }
  }, [zIsCheckingOut, sInitialized]);


  async function initializeCheckout() {
    dlog(DCAT.INIT, "initializeCheckout", "CheckoutModal", { workorderID: zOpenWorkorder?.id, activeSaleID: zOpenWorkorder?.activeSaleID, customerID: zOpenWorkorder?.customerID });
    let currentUser = useLoginStore.getState().currentUser;
    let createdBy = currentUser?.first
      ? currentUser.first + " " + (currentUser.last || "")
      : "";

    // Refresh customer in background — Zustand already has the data from workorder selection
    let customerID = zOpenWorkorder?.customerID || zCustomer?.id || "";
    if (customerID) {
      dbGetCustomer(customerID).then((freshCustomer) => {
        if (freshCustomer) useCurrentCustomerStore.getState().setCustomer(freshCustomer, false);
      }).catch(() => {});
    }

    // Check if workorder has an existing active sale to resume
    if (zOpenWorkorder?.activeSaleID) {
      // Use Zustand listener copy first (instant), then reconcile from Firestore in background
      let existingSale = useActiveSalesStore.getState().getActiveSale(zOpenWorkorder.activeSaleID);
      if (!existingSale) {
        // Fallback: not in listener yet — must await Firestore
        existingSale = await readActiveSale(zOpenWorkorder.activeSaleID);
      }
      if (existingSale && !existingSale.voidedByRefund) {
        existingSale = cloneDeep(existingSale);
        log("Resuming existing sale:", existingSale.id);

        // Rebuild combined workorders from the sale's workorderIDs
        let combined = [cloneDeep(zOpenWorkorder)];
        if (existingSale.workorderIDs?.length > 1) {
          for (let woID of existingSale.workorderIDs) {
            if (woID === zOpenWorkorder.id) continue;
            let otherWO = (useOpenWorkordersStore.getState().workorders || []).find((w) => w.id === woID);
            if (otherWO) combined.push(cloneDeep(otherWO));
          }
        }
        _setCombinedWorkorders(combined);

        // Recalculate sale totals from current workorder lines
        // (items may have been added/removed on the main screen since last checkout)
        existingSale = updateSaleWithTotals(existingSale, combined, zSettings);

        // Show sale immediately — transactions and reconciliation happen in background
        let initialCredits = getAllAppliedCredits(existingSale, useCurrentCustomerStore.getState().customer);
        _setCredits(initialCredits);
        _setSale(existingSale);
        salePersistedRef.current = true;
        broadcastSaleToDisplay(existingSale, combined, custFirst, custLast, custLanguage);

        // Background: load transactions and reconcile crash-recovery state
        (async () => {
          let loadedTxns = [];
          if (existingSale.transactionIDs?.length > 0) {
            loadedTxns = (await readTransactions(existingSale.transactionIDs)).filter(Boolean);
          }

          // Reconcile pending transactions (crash recovery)
          let needsPersist = false;
          if (existingSale.pendingTransactionIDs?.length > 0) {
            let pendingResults = await readTransactions(existingSale.pendingTransactionIDs);
            for (let i = 0; i < existingSale.pendingTransactionIDs.length; i++) {
              let txn = pendingResults[i];
              if (txn) {
                loadedTxns.push(txn);
                if (!existingSale.transactionIDs.includes(txn.id)) {
                  existingSale.transactionIDs.push(txn.id);
                }
              }
            }
            existingSale.pendingTransactionIDs = [];
            needsPersist = true;
          }

          // Reconcile pending refunds (crash recovery)
          if (existingSale.pendingRefundIDs?.length > 0) {
            existingSale.pendingRefundIDs = [];
            needsPersist = true;
          }

          let reconciledCredits = getAllAppliedCredits(existingSale, useCurrentCustomerStore.getState().customer);
          _setTransactions(loadedTxns);
          _setCredits(reconciledCredits);

          recomputeSaleAmounts(existingSale, loadedTxns, reconciledCredits);
          _setSale(cloneDeep(existingSale));

          if (needsPersist) persistSale(existingSale, loadedTxns, reconciledCredits);

          // If reconciliation shows fully paid, just update the UI — don't auto-complete.
          // The user will see the "fully paid" state and can click Complete Sale.
        })();

        return;
      }
      // Stale or voided activeSaleID — clean up the workorder
      let cleanedWO = cloneDeep(zOpenWorkorder);
      cleanedWO.activeSaleID = "";
      cleanedWO.saleID = "";
      useOpenWorkordersStore.getState().setWorkorder(cleanedWO, true);
    }

    // No existing sale — create a new one and persist immediately
    let saleId = takeId("sales") || await getId("sales");
    let sale = createNewSale(zSettings, createdBy, saleId);

    if (zOpenWorkorder) {
      // Checkout with workorder
      sale.customerID = zOpenWorkorder.customerID || "";
      let combined = [cloneDeep(zOpenWorkorder)];
      _setCombinedWorkorders(combined);
      sale = updateSaleWithTotals(sale, combined, zSettings);
      sale.workorderIDs = [zOpenWorkorder.id];

      // Write activeSaleID to workorder and persist the sale
      let updatedWO = cloneDeep(zOpenWorkorder);
      updatedWO.activeSaleID = sale.id;
      useOpenWorkordersStore.getState().setWorkorder(updatedWO, true);
    } else {
      // No workorder — should not normally happen
    }

    _setSale(sale);
    salePersistedRef.current = true;
    persistSale(sale, [], []);
    broadcastSaleToDisplay(sale, zOpenWorkorder ? [cloneDeep(zOpenWorkorder)] : [], custFirst, custLast, custLanguage);
  }

  async function initializeDepositCheckout(depositInfo) {
    dlog(DCAT.INIT, "initializeDepositCheckout", "CheckoutModal", { amountCents: depositInfo?.amountCents, type: depositInfo?.type, customerID: zCustomer?.id });
    let currentUser = useLoginStore.getState().currentUser;
    let createdBy = currentUser?.first
      ? currentUser.first + " " + (currentUser.last || "")
      : "";
    let saleId = takeId("sales") || await getId("sales");
    let sale = createNewSale(zSettings, createdBy, saleId);

    sale.subtotal = depositInfo.amountCents;
    sale.salesTax = 0;
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
    _setSale(sale);
  }

  async function initializeFromViewOnlySale(sale) {
    dlog(DCAT.INIT, "initializeFromViewOnlySale", "CheckoutModal", { saleID: sale?.id, paymentComplete: sale?.paymentComplete, amountCaptured: sale?.amountCaptured, total: sale?.total, workorderIDCount: sale?.workorderIDs?.length });
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

    // Load transactions from collection, credits from sale
    let loadedTxns = [];
    if (sale.transactionIDs?.length > 0) {
      loadedTxns = (await readTransactions(sale.transactionIDs)).filter(Boolean);
    }
    let loadedCredits = getAllAppliedCredits(sale, useCurrentCustomerStore.getState().customer);
    _setTransactions(loadedTxns);
    _setCredits(loadedCredits);

    recomputeSaleAmounts(sale, loadedTxns, loadedCredits);
    _setSale(sale);
  }

  async function fetchReaders() {
    dlog(DCAT.ACTION, "fetchReaders", "CheckoutModal", {});
    console.log("[CARD_READER] fetchReaders called");
    try {
      let result = await newCheckoutGetStripeReaders();
      let readersArr = result?.data?.data || [];
      console.log("[CARD_READER] fetchReaders:", readersArr.length, "readers found", readersArr.map(r => ({ id: r.id, label: r.label, status: r.status, deviceType: r.device_type })));
      useStripePaymentStore.getState().setReadersArr(readersArr);
      let online = readersArr.filter((r) => r.status === "online");
      console.log("[CARD_READER] Online readers:", online.length);
      if (online.length > 0) {
        _setReaderError("");
      } else {
        _setReaderError("No card readers connected to account");
      }
    } catch (e) {
      console.log("[CARD_READER] fetchReaders ERROR:", e?.message, e);
      log("Failed to fetch card readers:", e);
    }
  }

  // Poll for card readers every 5s when none are detected
  let onlineReaders = zStripeReaders.filter((r) => r.status === "online");
  const readerPollRef = useRef(null);

  // Shared: build a thin sale object and write all transaction docs
  function prepareSaleForPersist(sale, txns, creds) {
    let saleToPersist = { ...sale };
    let allCreds = creds || sCredits;
    saleToPersist.creditsApplied = allCreds
      .filter((c) => c.type === "credit")
      .map((c) => ({ id: c.id, amount: c.amount, type: c.type, ownerPhone: c._ownerPhone || c.ownerPhone || "", remainingBalance: c._remainingBalance != null ? c._remainingBalance : (c.remainingBalance ?? 0), appliedMillis: c._appliedMillis || c.appliedMillis || Date.now() }));
    saleToPersist.depositsApplied = allCreds
      .filter((c) => c.type !== "credit")
      .map((c) => ({ id: c.id, amount: c.amount, type: c.type, transactionId: c.transactionId || "", ownerPhone: c._ownerPhone || c.ownerPhone || "", remainingBalance: c._remainingBalance != null ? c._remainingBalance : (c.remainingBalance ?? 0), appliedMillis: c._appliedMillis || c.appliedMillis || Date.now() }));
    let existingIDs = saleToPersist.transactionIDs || [];
    let currentIDs = (txns || sTransactions).map((t) => t.id);
    saleToPersist.transactionIDs = [...new Set([...existingIDs, ...currentIDs])];
    if (saleToPersist.transactionIDs.length > 0 || saleToPersist.pendingTransactionIDs?.length > 0) {
      saleToPersist.lastTransactionStamp = Date.now();
    }
    return saleToPersist;
  }

  function writeAllTransactions(txns) {
    let allTxns = txns || sTransactions;
    return Promise.all(allTxns.map((t) => writeTransaction(t)));
  }

  function persistSale(sale, txns, creds) {
    dlog(DCAT.ACTION, "persistSale", "CheckoutModal", { saleID: sale?.id, total: sale?.total, amountCaptured: sale?.amountCaptured, transactionCount: (txns || sTransactions)?.length });
    let saleToPersist = prepareSaleForPersist(sale, txns, creds);
    Promise.all([writeActiveSale(saleToPersist), ...((txns || sTransactions).map((t) => writeTransaction(t)))]);
    salePersistedRef.current = true;
  }
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
  async function handleToggleWorkorder(wo) {
    dlog(DCAT.CHECKBOX, "handleToggleWorkorder", "CheckoutModal", { woID: wo?.id, isPrimary: wo?.id === zOpenWorkorder?.id, currentlyIncluded: !!sCombinedWorkorders.find((o) => o.id === wo?.id) });
    // Cannot uncheck primary workorder
    if (wo.id === zOpenWorkorder?.id) return;

    let newArr;
    let carriedCredits = [];
    if (sCombinedWorkorders.find((o) => o.id === wo.id)) {
      // Block unlink if payments exist
      if ((sSale?.amountCaptured || 0) > 0) return;
      // Removing WO from combined sale — clean up its sale references
      newArr = sCombinedWorkorders.filter((o) => o.id !== wo.id);
      let cleaned = cloneDeep(wo);
      cleaned.activeSaleID = "";
      let _user = useLoginStore.getState().currentUser?.first || "System";
      cleaned.changeLog = [...(cleaned.changeLog || []), { timestamp: Date.now(), user: _user, field: "payment", action: "recorded", from: "", to: "Removed from combined sale" }];
      useOpenWorkordersStore.getState().setWorkorder(cleaned, true);
    } else {
      // Check if WO has an orphaned active sale from a crashed session
      if (wo.activeSaleID && wo.activeSaleID !== sSale?.id) {
        let orphanedSale = await readActiveSale(wo.activeSaleID);
        if (orphanedSale?.transactionIDs?.length > 0) {
          useAlertScreenStore.getState().setValues({
            title: "Cannot Combine",
            message: "This workorder has an active sale with payments from another session. Close or complete that sale first.",
            btn1Text: "OK",
            handleBtn1Press: () => useAlertScreenStore.getState().setShowAlert(false),
            canExitOnOuterClick: true,
          });
          return;
        }
        if (orphanedSale) {
          // Carry over any applied credits/deposits before deleting
          carriedCredits = getAllAppliedCredits(orphanedSale, useCurrentCustomerStore.getState().customer);
          await deleteActiveSale(orphanedSale.id);
        }
      }
      let linked = cloneDeep(wo);
      if (sSale?.id) {
        linked.activeSaleID = sSale.id;
        let _user = useLoginStore.getState().currentUser?.first || "System";
        linked.changeLog = [...(linked.changeLog || []), { timestamp: Date.now(), user: _user, field: "payment", action: "recorded", from: "", to: "Added to combined sale" }];
        useOpenWorkordersStore.getState().setWorkorder(linked, true);
      }
      newArr = [...sCombinedWorkorders, linked];
    }
    _setCombinedWorkorders(newArr);

    // Merge carried-over credits into local state
    let mergedCredits = carriedCredits.length > 0 ? [...sCredits, ...carriedCredits] : sCredits;
    if (carriedCredits.length > 0) _setCredits(mergedCredits);

    // Recalculate totals and recompute amounts with carried credits
    let updated = updateSaleWithTotals(sSale, newArr, zSettings);
    updated.workorderIDs = newArr.map((o) => o.id);
    recomputeSaleAmounts(updated, sTransactions, mergedCredits);
    _setSale(updated);
    if (salePersistedRef.current) persistSale(updated, sTransactions, mergedCredits);
    broadcastSaleToDisplay(updated, newArr, custFirst, custLast, custLanguage);
  }

  function handleWorkorderLineChange(woId, newLines) {
    dlog(DCAT.ACTION, "handleWorkorderLineChange", "CheckoutModal", { woID: woId, lineCount: newLines?.length });
    let newArr = sCombinedWorkorders.map((wo) =>
      wo.id === woId ? { ...wo, workorderLines: newLines } : wo
    );

    // Floor check: never allow total to drop below amountCaptured
    if ((sSale?.amountCaptured || 0) > 0) {
      let preview = updateSaleWithTotals(sSale, newArr, zSettings);
      if (preview.total < sSale.amountCaptured) {
        log("handleWorkorderLineChange: blocked — new total", preview.total, "below amountCaptured", sSale.amountCaptured);
        return;
      }
    }

    _setCombinedWorkorders(newArr);
    let woStore = useOpenWorkordersStore.getState();
    let fullWO = newArr.find((wo) => wo.id === woId);
    if (fullWO) {
      let storeWO = woStore.workorders.find((o) => o.id === woId);
      let entries = diffWorkorderLines(storeWO?.workorderLines || [], newLines);
      if (entries.length > 0) {
        let user = getChangeLogUser();
        let timestamp = Date.now();
        fullWO = { ...fullWO, changeLog: [...(fullWO.changeLog || []), ...entries.map((e) => ({ ...e, timestamp, user }))] };
      }
      woStore.setWorkorder(fullWO, true);
    }

    let updated = updateSaleWithTotals(sSale, newArr, zSettings);
    _setSale(updated);
    broadcastSaleToDisplay(updated, newArr, custFirst, custLast, custLanguage);
    if (salePersistedRef.current) persistSale(updated);
  }

  // Other open workorders for the same customer
  function getOtherCustomerWorkorders() {
    if (!zOpenWorkorder?.customerID) return EMPTY_ARR;
    return (useOpenWorkordersStore.getState().workorders || []).filter(
      (wo) =>
        wo.customerID === zOpenWorkorder.customerID &&
        wo.id !== zOpenWorkorder.id
    );
  }

  // ─── Inventory Item Management ────────────────────────────
  function handleAddItem(invItem) {
    dlog(DCAT.BUTTON, "handleAddItem", "CheckoutModal", { itemID: invItem?.id, itemName: invItem?.formalName, price: invItem?.price });
    let primaryWO = sCombinedWorkorders[0];
    if (!primaryWO) return;
    const { _score, ...cleanItem } = invItem;
    let newLine = {
      qty: 1,
      inventoryItem: cloneDeep(cleanItem),
      discountObj: null,
      id: crypto.randomUUID(),
      useSalePrice: false,
      warranty: false,
    };
    handleWorkorderLineChange(primaryWO.id, [...(primaryWO.workorderLines || []), newLine]);
  }

  // ─── Deposit / Credit Application ───────────────────────
  function handleApplyDeposit(deposit, requestedAmountCents) {
    dlog(DCAT.BUTTON, "handleApplyDeposit", "CheckoutModal", { depositID: deposit?.id, amountCents: deposit?.amountCents, type: deposit?._type, requestedAmountCents, saleID: sSale?.id });
    if (!sSale || sSale.paymentComplete) return;
    let amountNeeded = (sSale.total || 0) - (sSale.amountCaptured || 0);
    if (amountNeeded <= 0) return;

    let isCredit = deposit._type === "credit";
    let maxApplicable = Math.min(deposit.amountCents, amountNeeded);
    let appliedAmount = requestedAmountCents > 0
      ? Math.min(requestedAmountCents, maxApplicable)
      : maxApplicable;
    if (appliedAmount <= 0) return;

    // Create a credit entry (not a transaction)
    let credit = {
      id: deposit.id,
      ...(isCredit ? {} : { transactionId: deposit.transactionId || deposit.id || "" }),
      amount: appliedAmount,
      type: isCredit ? "credit" : deposit._type === "giftcard" ? "giftcard" : "deposit",
      // Display-only fields (stripped on persist)
      _originalAmount: deposit.amountCents,
      _note: isCredit ? (deposit.text || "") : (deposit.note || ""),
      _last4: deposit.last4 || "",
      _method: deposit.method || "cash",
      _millis: deposit.millis || 0,
      _depositSaleID: deposit.saleID || "",
      _ownerPhone: zCustomer?.customerCell || "",
      _remainingBalance: deposit.amountCents - appliedAmount,
      _appliedMillis: Date.now(),
    };

    // Reserve deposit/credit on customer (not consumed until sale completes)
    let arrKey = isCredit ? "credits" : "deposits";
    let customerArr = cloneDeep(zCustomer?.[arrKey] || []);
    let idx = customerArr.findIndex((d) => d.id === deposit.id);
    if (idx >= 0) {
      customerArr[idx] = { ...customerArr[idx], reservedCents: (customerArr[idx].reservedCents || 0) + appliedAmount };
      let updatedCustomer = { ...zCustomer, [arrKey]: customerArr };
      useCurrentCustomerStore.getState().setCustomer(updatedCustomer);
      dbSaveCustomer(updatedCustomer);
    }

    // Update sale and credits state
    let newCredits = [...sCredits, credit];
    _setCredits(newCredits);
    let sale = cloneDeep(sSale);
    recomputeSaleAmounts(sale, sTransactions, newCredits);

    if (sale.paymentComplete) {
      handleSaleComplete(sale, sTransactions, newCredits);
    } else {
      updateWorkordersWithPaymentStatus(sale, credit);
    }

    _setSale(sale);
    broadcastSaleToDisplay(sale, sCombinedWorkorders, custFirst, custLast, custLanguage);
    if (!sale.paymentComplete) persistSale(sale, sTransactions, newCredits);
  }

  function handleRemoveDeposit(credit) {
    dlog(DCAT.BUTTON, "handleRemoveDeposit", "CheckoutModal", { creditID: credit?.id, amount: credit?.amount, type: credit?.type, saleID: sSale?.id });
    if (!sSale || sSale.paymentComplete) return;
    if (!credit.type) return;

    // Release reservation on deposit/credit (not consumed yet, just reserved)
    let isCredit = credit.type === "credit";
    let arrKey = isCredit ? "credits" : "deposits";
    let customerArr = cloneDeep(zCustomer?.[arrKey] || []);
    let existing = customerArr.find((d) => d.id === credit.id);
    if (existing) {
      existing.reservedCents = Math.max(0, (existing.reservedCents || 0) - credit.amount);
    }
    let updatedCustomer = { ...zCustomer, [arrKey]: customerArr };
    useCurrentCustomerStore.getState().setCustomer(updatedCustomer);
    dbSaveCustomer(updatedCustomer);

    // Remove credit from sCredits
    let newCredits = sCredits.filter((c) => c.id !== credit.id);
    _setCredits(newCredits);
    let sale = cloneDeep(sSale);
    recomputeSaleAmounts(sale, sTransactions, newCredits);
    _setSale(sale);
    persistSale(sale, sTransactions, newCredits);

    // Log removal to workorder changelogs
    let user = useLoginStore.getState().currentUser?.first || "System";
    let timestamp = Date.now();
    let label = isCredit ? "Credit" : "Deposit";
    let entry = { timestamp, user, field: "payment", action: "recorded", from: "", to: label + " removed " + formatCurrencyDisp(credit.amount, true) };
    let updatedWorkorders = [];
    for (let wo of sCombinedWorkorders) {
      let updated = cloneDeep(wo);
      updated.changeLog = [...(updated.changeLog || []), entry];
      useOpenWorkordersStore.getState().setWorkorder(updated, true);
      updatedWorkorders.push(updated);
    }
    _setCombinedWorkorders(updatedWorkorders);
  }

  function handleSplitDeposit(credit, newAmountCents) {
    dlog(DCAT.ACTION, "handleSplitDeposit", "CheckoutModal", { creditID: credit?.id, currentAmount: credit?.amount, newAmountCents: newAmountCents, type: credit?.type });
    if (!sSale || sSale.paymentComplete) return;
    if (!credit.type) return;

    if (newAmountCents <= 0) {
      handleRemoveDeposit(credit);
      _setSplitDepositPayment(null);
      return;
    }
    if (newAmountCents === credit.amount) {
      _setSplitDepositPayment(null);
      return;
    }

    let difference = credit.amount - newAmountCents; // positive = decrease, negative = increase
    log("handleSplitDeposit: credit.amount=", credit.amount, "newAmountCents=", newAmountCents, "difference=", difference, "id=", credit.id, "zCustomer?.id=", zCustomer?.id);

    // Update the credit in sCredits
    let newCredits = sCredits.map((c) =>
      c.id === credit.id ? { ...c, amount: newAmountCents } : c
    );
    _setCredits(newCredits);
    let sale = cloneDeep(sSale);
    recomputeSaleAmounts(sale, sTransactions, newCredits);
    _setSale(sale);
    persistSale(sale, sTransactions, newCredits);

    // Adjust reservation on customer deposits/credits: positive difference = release, negative = reserve more
    let isCredit = credit.type === "credit";
    let arrKey = isCredit ? "credits" : "deposits";
    let customerArr = cloneDeep(zCustomer?.[arrKey] || []);
    let existing = customerArr.find((d) => d.id === credit.id);
    if (existing) {
      // difference > 0 means user reduced the applied amount (release some reservation)
      // difference < 0 means user increased the applied amount (reserve more)
      existing.reservedCents = Math.max(0, (existing.reservedCents || 0) - difference);
    }
    log("handleSplitDeposit: existing deposit found=", !!existing, "reservedCents=", existing?.reservedCents, "zCustomer?.id=", zCustomer?.id);
    if (zCustomer?.id) {
      let updatedCustomer = { ...zCustomer, [arrKey]: customerArr };
      useCurrentCustomerStore.getState().setCustomer(updatedCustomer);
      dbSaveCustomer(updatedCustomer);
    }

    // Log split to workorder changelogs
    let user = useLoginStore.getState().currentUser?.first || "System";
    let timestamp = Date.now();
    let label = isCredit ? "Credit" : "Deposit";
    let action = difference > 0 ? "reduced to" : "increased to";
    let entry = { timestamp, user, field: "payment", action: "recorded", from: "", to: label + " " + action + " " + formatCurrencyDisp(newAmountCents, true) };
    let updatedWorkorders = [];
    for (let wo of sCombinedWorkorders) {
      let updated = cloneDeep(wo);
      updated.changeLog = [...(updated.changeLog || []), entry];
      useOpenWorkordersStore.getState().setWorkorder(updated, true);
      updatedWorkorders.push(updated);
    }
    _setCombinedWorkorders(updatedWorkorders);

    _setSplitDepositPayment(null);
  }

  async function handlePrintDepositReceipt(credit) {
    dlog(DCAT.RECEIPT, "handlePrintDepositReceipt", "CheckoutModal", { creditID: credit?.id, depositSaleID: credit?._depositSaleID });
    if (!credit._depositSaleID) return;
    let sale = await dbGetCompletedSale(credit._depositSaleID);
    if (!sale) return;
    let settings = useSettingsStore.getState().getSettings();
    let printerID = localStorageWrapper.getItem("selectedPrinterID") || "";
    if (!printerID) return;
    let _ctx = { currentUser: useLoginStore.getState().getCurrentUser(), settings };
    let customerInfo = {
      first: zCustomer?.first || "",
      last: zCustomer?.last || "",
      phone: zCustomer?.customerCell || "",
      id: zCustomer?.id || "",
    };
    let emptyWO = { workorderLines: [], taxFree: false };
    let txns = sale.transactionIDs?.length > 0
      ? (await readTransactions(sale.transactionIDs)).filter(Boolean)
      : [];
    let receipt = printBuilder.sale(sale, txns, customerInfo, emptyWO, 0, _ctx, sale.creditsApplied);
    dbSavePrintObj(receipt, printerID);
  }

  // ─── Payment Handling ─────────────────────────────────────
  function handlePaymentStarted(transactionID) {
    dlog(DCAT.ACTION, "handlePaymentStarted", "CheckoutModal", { transactionID: transactionID, saleID: sSale?.id });
    let sale = cloneDeep(sSale);
    sale.pendingTransactionIDs = [...(sale.pendingTransactionIDs || []), transactionID];
    _setSale(sale);

    // Persist the pending transaction ID on the sale (already in Firestore)
    persistSale(sale);
  }

  function handlePaymentFailed(transactionID) {
    dlog(DCAT.ACTION, "handlePaymentFailed", "CheckoutModal", { transactionID: transactionID, saleID: sSale?.id });
    if (!transactionID) return;
    let sale = cloneDeep(sSale);
    sale.pendingTransactionIDs = (sale.pendingTransactionIDs || []).filter((id) => id !== transactionID);
    _setSale(sale);
    persistSale(sale);
  }

  function handleZeroTotalComplete() {
    if (!sSale || saleComplete) return;
    let sale = cloneDeep(sSale);
    sale.paymentComplete = true;
    sale.amountCaptured = 0;
    sale.workorderIDs = sCombinedWorkorders.map((o) => o.id);
    _setSale(sale);
    handleSaleComplete(sale, sTransactions, sCredits);
  }

  function handleFullyPaidComplete() {
    if (!sSale) return;
    let sale = cloneDeep(sSale);
    sale.paymentComplete = true;
    sale.workorderIDs = sCombinedWorkorders.map((o) => o.id);
    _setSale(sale);
    handleSaleComplete(sale, sTransactions, sCredits);
  }

  function handlePaymentCapture(payment) {
    dlog(DCAT.ACTION, "handlePaymentCapture", "CheckoutModal", { transactionID: payment?.id, method: payment?.method, amountCaptured: payment?.amountCaptured, saleID: sSale?.id, saleComplete: sSale?.paymentComplete });
    log("handlePaymentCapture called:", JSON.stringify(payment));
    // Guard: if sale is already marked complete locally, skip
    if (sSale?.paymentComplete) {
      log("handlePaymentCapture: sale already complete, skipping");
      return;
    }
    let sale = cloneDeep(sSale);

    // Compute proportional salesTax for this transaction
    if (sale.total > 0 && sale.salesTax > 0) {
      payment.salesTax = Math.round(sale.salesTax * (payment.amountCaptured / sale.total));
    } else {
      payment.salesTax = 0;
    }

    let newTransactions = [...sTransactions, payment];
    _setTransactions(newTransactions);
    sale.transactionIDs = [...new Set([...(sale.transactionIDs || []), ...newTransactions.map((t) => t.id)])];
    sale.pendingTransactionIDs = (sale.pendingTransactionIDs || []).filter((id) => id !== payment.id);
    sale.workorderIDs = sCombinedWorkorders.map((o) => o.id);

    recomputeSaleAmounts(sale, newTransactions, sCredits);

    if (sale.paymentComplete) {
      handleSaleComplete(sale, newTransactions, sCredits);
    } else {
      updateWorkordersWithPaymentStatus(sale, payment, newTransactions);

      // Pop register on any cash payment
      if (payment.method === "cash") {
        let printerID = localStorageWrapper.getItem("selectedPrinterID") || "";
        if (printerID) {
          dbSavePrintObj({ id: crypto.randomUUID(), receiptType: RECEIPT_TYPES.register }, printerID);
        }
      }
    }

    _setSale(sale);
    broadcastSaleToDisplay(sale, sCombinedWorkorders, custFirst, custLast, custLanguage);

    // Persist immediately on every capture so the txn is durable before any modal/UI step.
    // For completing payments, handleSaleComplete will write the completed-sale doc and delete the active-sale doc.
    persistSale(sale, newTransactions, sCredits);
  }

  // Update workorders to track that a sale is in progress
  function updateWorkordersWithPaymentStatus(sale, entry, txns) {
    let user = useLoginStore.getState().currentUser?.first || "System";
    let timestamp = Date.now();
    let isCredit = ["credit", "deposit", "giftcard"].includes(entry.type);
    let paymentLabel = isCredit ? "Deposit/credit applied" : entry.method === "cash" ? "Cash payment" : "Card payment";
    let entryAmount = isCredit ? entry.amount : entry.amountCaptured;

    let currentTxns = txns || sTransactions;
    let updatedWorkorders = [];
    for (let wo of sCombinedWorkorders) {
      let updated = cloneDeep(wo);
      updated.activeSaleID = sale.id;

      let entries = [];
      entries.push({ timestamp, user, field: "payment", action: "recorded", from: "", to: paymentLabel + " " + formatCurrencyDisp(entryAmount || 0, true) });

      updated.changeLog = [...(updated.changeLog || []), ...entries];
      useOpenWorkordersStore.getState().setWorkorder(updated, true);
      if (!updated.customerID) newCheckoutSaveWorkorder(updated);
      updatedWorkorders.push(updated);
    }
    _setCombinedWorkorders(updatedWorkorders);
  }

  async function handleDepositSaleComplete(sale, txns, creds) {
    dlog(DCAT.ACTION, "handleDepositSaleComplete", "CheckoutModal", { saleID: sale?.id, total: sale?.total, amountCaptured: sale?.amountCaptured, transactionCount: (txns || sTransactions)?.length, creditCount: (creds || sCredits)?.length });
    let localTxns = txns || sTransactions;
    let localCreds = creds || sCredits;
    let depositInfo = useCheckoutStore.getState().depositInfo;
    if (!depositInfo) return;

    // Create the deposit and add to customer
    let primaryPayment = localTxns[0];
    let newDeposit = { ...CUSTOMER_DEPOSIT_PROTO };
    newDeposit.id = generateEAN13Barcode();
    newDeposit.transactionId = primaryPayment?.id || "";
    newDeposit.amountCents = depositInfo.amountCents;
    newDeposit.millis = Date.now();
    newDeposit.method = primaryPayment?.method || "cash";
    newDeposit.note = depositInfo.note || "";
    newDeposit.last4 = primaryPayment?.last4 || "";
    newDeposit.type = sale.depositType === "giftcard" ? "giftcard" : "deposit";
    if (zCustomer?.id) {
      let updatedCustomer = cloneDeep(zCustomer);
      updatedCustomer.deposits = [...(updatedCustomer.deposits || []), newDeposit];
      useCurrentCustomerStore.getState().setCustomer(updatedCustomer);
      dbSaveCustomer(updatedCustomer);
    }

    // Send gift card receipt if requested from deposit modal
    if (newDeposit.type === "giftcard" && (depositInfo.sendSMS || depositInfo.sendEmail)) {
      let gcSettings = useSettingsStore.getState().getSettings();
      let gcCustomer = {
        first: zCustomer?.first || "",
        last: zCustomer?.last || "",
        customerCell: zCustomer?.customerCell || "",
        email: zCustomer?.email || "",
        id: zCustomer?.id || "",
      };
      let gcObj = { id: newDeposit.id, amountCents: newDeposit.amountCents, note: newDeposit.note, millis: newDeposit.millis };
      sendGiftCardReceipt(gcObj, gcCustomer, gcSettings, depositInfo.sendSMS, depositInfo.sendEmail);
    }

    // Mark transactions with deposit type before persisting
    localTxns.forEach((txn) => {
      txn.depositType = sale.depositType === "giftcard" ? "giftcard" : "deposit";
    });

    // Persist all transactions (no completed-sale for deposits/gift cards)
    await writeAllTransactions(localTxns);
    await deleteActiveSale(sale.id);

    // Receipt actions based on settings
    let settings = useSettingsStore.getState().getSettings();
    let printerID = localStorageWrapper.getItem("selectedPrinterID") || "";
    let _ctx = { currentUser: useLoginStore.getState().getCurrentUser(), settings };
    let emptyWO = { workorderLines: [], taxFree: false };
    let customerInfo = { first: zCustomer?.first || "", last: zCustomer?.last || "", phone: zCustomer?.customerCell || "", id: zCustomer?.id || "" };
    let saleReceipt = printBuilder.sale(sale, localTxns, customerInfo, emptyWO, 0, _ctx, localCreds);
    // log("Receipt object (deposit sale):", JSON.stringify(saleReceipt, null, 2));

    // Translate receipt if non-English language is set
    let translatedReceipt = null;
    let translatedPdfLabels = null;
    let langCode = getTranslateCode(sReceiptLanguage);
    if (langCode) {
      try {
        let translated = await translateSalesReceipt(saleReceipt, langCode, { saleID: sale?.id || "", customerID: zCustomer?.id || "" });
        translatedReceipt = translated.translatedReceipt;
        translatedPdfLabels = translated.pdfLabels;
      } catch (e) {
        log("Receipt translation failed, falling back to English:", e);
      }
    }

    // Print sale receipt (popCashRegister flag is already on the receipt if change is due)
    if (printerID) {
      let toPrint = translatedReceipt || saleReceipt;
      dbSavePrintObj(toPrint, printerID);
    }

    // SMS/Email — template-driven
    const smsTemplate = findTemplateByType(settings?.smsTemplates || settings?.textTemplates, "saleReceipt");
    const emailTemplate = findTemplateByType(settings?.emailTemplates, "saleReceipt");
    const smsContent = smsTemplate?.content || smsTemplate?.message || smsTemplate?.text || "";
    const emailContent = emailTemplate?.message || emailTemplate?.content || emailTemplate?.body || "";
    let emptyParts = [];
    if (settings?.autoSMSSalesReceipt && customerInfo.phone && !smsContent.trim()) emptyParts.push("SMS");
    if (settings?.autoEmailSalesReceipt && (zCustomer?.email) && !emailContent.trim()) emptyParts.push("email");
    if (emptyParts.length > 0) {
      useAlertScreenStore.getState().setValues({
        title: "Empty Template",
        message: "The sale receipt " + emptyParts.join(" and ") + " template is empty. Fill in the template content in Dashboard > " + (emptyParts.includes("SMS") ? "Text Templates" : "Email Templates") + ", or uncheck the auto " + emptyParts.join("/") + " option in Dashboard > Printing.",
        btn1Text: "OK",
        handleBtn1Press: () => useAlertScreenStore.getState().setShowAlert(false),
        canExitOnOuterClick: true,
      });
    }

    const customerForReceipt = {
      first: zCustomer?.first || "",
      last: zCustomer?.last || "",
      customerCell: zCustomer?.customerCell || "",
      email: zCustomer?.email || "",
      id: zCustomer?.id || "",
    };
    const canSMS = customerForReceipt.customerCell && smsContent.trim();
    const canEmail = customerForReceipt.email && emailContent.trim();
    if (canSMS || canEmail) {
      sendSaleReceipt(sale, customerForReceipt, emptyWO, settings, canSMS ? smsTemplate : null, canEmail ? emailTemplate : null, translatedReceipt, translatedPdfLabels, langCode, localTxns, localCreds);
    }
  }

  async function handleSaleComplete(sale, txns, creds) {
    dlog(DCAT.ACTION, "handleSaleComplete", "CheckoutModal", { saleID: sale?.id, total: sale?.total, amountCaptured: sale?.amountCaptured, paymentComplete: sale?.paymentComplete, isDepositSale: sale?.isDepositSale, transactionCount: (txns || sTransactions)?.length, creditCount: (creds || sCredits)?.length, workorderCount: sCombinedWorkorders?.length });
    let localTxns = txns || sTransactions;
    let localCreds = creds || sCredits;
    log("handleSaleComplete entered, paymentComplete:", sale.paymentComplete, "isDepositSale:", sale.isDepositSale);
    // Deposit sale — separate completion path
    if (sale.isDepositSale) {
      handleDepositSaleComplete(sale, localTxns, localCreds);
      return;
    }
    // Mark all combined workorders as paid IN-PLACE (still in open list).
    // Archival (newCheckoutCompleteWorkorder + removeWorkorder) is deferred to the pickup modal selection.
    // If the user steps away / crashes mid-modal, the WO stays in the open list with Finished & Paid status — safe default.
    let settings = useSettingsStore.getState().getSettings();
    let statuses = settings?.statuses || [];
    let user = useLoginStore.getState().currentUser?.first || "System";
    let timestamp = Date.now();

    for (let wo of sCombinedWorkorders) {
      let woUpdated = cloneDeep(wo);
      let oldStatusLabel = resolveStatus(wo.status, statuses)?.label || wo.status || "";
      let newStatusLabel = resolveStatus("finished_and_paid", statuses)?.label || "Finished & Paid";

      woUpdated.paymentComplete = true;
      woUpdated.paidOnMillis = Date.now();
      woUpdated.activeSaleID = "";
      woUpdated.saleID = sale.id;
      woUpdated.status = "finished_and_paid";

      let entries = [];
      if (wo.status !== "finished_and_paid") {
        entries.push({ timestamp, user, field: "status", action: "changed", from: oldStatusLabel, to: newStatusLabel });
      }
      entries.push({ timestamp, user, field: "payment", action: "completed", from: "", to: "Sale completed — " + formatCurrencyDisp(sale.total, true) });
      woUpdated.changeLog = [...(woUpdated.changeLog || []), ...entries];
      woUpdated.endedOnMillis = Date.now();

      useOpenWorkordersStore.getState().setWorkorder(woUpdated, true);
    }

    // Transactions were already persisted on capture (persistSale). Just write the completed-sale and delete the active-sale.
    let saleToPersist = prepareSaleForPersist(sale, localTxns, localCreds);
    delete saleToPersist.pendingTransactionIDs;
    await writeCompletedSale(saleToPersist);
    await deleteActiveSale(sale.id);

    // Add sale ID to customer and persist deposit removal
    let currentCustomer = cloneDeep(useCurrentCustomerStore.getState().getCustomer());
    if (currentCustomer) {
      // Add sale ID to customer's sales array
      let customerSales = currentCustomer.sales || [];
      if (!customerSales.includes(sale.id)) {
        currentCustomer.sales = [...customerSales, sale.id];
      }

      // Consume reserved deposits/credits now that sale is complete
      for (let cred of localCreds) {
        let isCredit = cred.type === "credit";
        let arrKey = isCredit ? "credits" : "deposits";
        let arr = currentCustomer[arrKey] || [];
        let idx = arr.findIndex((d) => d.id === cred.id);
        if (idx >= 0) {
          let dep = arr[idx];
          dep.amountCents = Math.max(0, (dep.amountCents || 0) - cred.amount);
          dep.reservedCents = Math.max(0, (dep.reservedCents || 0) - cred.amount);
          if (dep.amountCents <= 0) {
            arr.splice(idx, 1);
          }
          currentCustomer[arrKey] = arr;
        }
      }

      useCurrentCustomerStore.getState().setCustomer(currentCustomer, true);
    }

    // Write sale index for reporting
    const primaryWO = sCombinedWorkorders[0];
    const customerInfo = primaryWO
      ? { first: primaryWO.customerFirst || "", last: primaryWO.customerLast || "", phone: primaryWO.customerCell || "", id: primaryWO.customerID || "" }
      : { first: zCustomer?.first || "", last: zCustomer?.last || "", phone: zCustomer?.customerCell || "", id: zCustomer?.id || "" };
    let allLines = sCombinedWorkorders.flatMap((wo) =>
      (wo.workorderLines || []).map((line) => ({ ...line, _workorderID: wo.id }))
    );
    saveItemSales(sale, allLines);

    // Receipt actions based on settings
    const customerForReceipt = primaryWO
      ? { first: primaryWO.customerFirst || "", last: primaryWO.customerLast || "", customerCell: primaryWO.customerCell || "", email: primaryWO.customerEmail || "", id: primaryWO.customerID || "" }
      : { first: zCustomer?.first || "", last: zCustomer?.last || "", customerCell: zCustomer?.customerCell || "", email: zCustomer?.email || "", id: zCustomer?.id || "" };
    const printerID = localStorageWrapper.getItem("selectedPrinterID") || "";

    // Build receipt context
    const _ctx = { currentUser: useLoginStore.getState().getCurrentUser(), settings };

    // Build the sale receipt — it computes popCashRegister and cashChangeGiven
    let woForReceipt = primaryWO || { workorderLines: [], taxFree: false };
    let saleReceipt = printBuilder.sale(sale, localTxns, customerForReceipt, woForReceipt, settings?.salesTaxPercent, _ctx, localCreds);
    log("Receipt object (sale complete):", JSON.stringify(saleReceipt, null, 2));

    // Translate receipt if non-English language is set
    let translatedReceipt = null;
    let translatedPdfLabels = null;
    let langCode = getTranslateCode(sReceiptLanguage);
    if (langCode) {
      try {
        let translated = await translateSalesReceipt(saleReceipt, langCode, { saleID: sale?.id || "", workorderID: primaryWO?.id || "", customerID: customerForReceipt?.id || "" });
        translatedReceipt = translated.translatedReceipt;
        translatedPdfLabels = translated.pdfLabels;
      } catch (e) {
        log("Receipt translation failed, falling back to English:", e);
      }
    }

    // Print sale receipt (popCashRegister flag is already on the receipt if change is due)
    if (printerID) {
      let toPrint = translatedReceipt || saleReceipt;
      dbSavePrintObj(toPrint, printerID);
    }

    // SMS/Email — template-driven
    const smsTemplate = findTemplateByType(settings?.smsTemplates || settings?.textTemplates, "saleReceipt");
    const emailTemplate = findTemplateByType(settings?.emailTemplates, "saleReceipt");

    const smsContent = smsTemplate?.content || smsTemplate?.message || smsTemplate?.text || "";
    const emailContent = emailTemplate?.message || emailTemplate?.content || emailTemplate?.body || "";
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
      sendSaleReceipt(sale, customerForReceipt, woForReceipt, settings, canSMS ? smsTemplate : null, canEmail ? emailTemplate : null, translatedReceipt, translatedPdfLabels, langCode, localTxns, localCreds);
    }

    // Reset the customer-facing display before showing the pickup-decision modal —
    // sale is done, no reason to keep the checkout on the customer screen.
    broadcastClear();

    // Ask the user: archive the workorder, or keep it open for pickup.
    _setPickupKeepOpenExpanded(false);
    _setPickupKeepOpenReason("");
    _setPickupCountdown(10);
    _setShowPickupModal(true);
  }

  // ─── Pickup-Decision Modal Handlers ───────────────────────
  // Called when user picks "Complete & Close" — archive each WO and close the checkout modal.
  async function handlePickupCompleteAndClose() {
    dlog(DCAT.BUTTON, "pickup_completeAndClose", "CheckoutModal", { saleID: sSale?.id, workorderCount: sCombinedWorkorders?.length });
    _setShowPickupModal(false);
    // Pull fresh copies from the open-workorders store (handleSaleComplete already wrote the paid-state to them).
    let woStore = useOpenWorkordersStore.getState();
    for (let wo of sCombinedWorkorders) {
      let current = woStore.workorders.find((w) => w.id === wo.id);
      let woToArchive = cloneDeep(current || wo);
      await newCheckoutCompleteWorkorder(woToArchive);
      woStore.removeWorkorder(woToArchive, false);
    }
    useTabNamesStore.getState().setInfoTabName(TAB_NAMES.infoTab.customer);
    useTabNamesStore.getState().setOptionsTabName(TAB_NAMES.optionsTab.workorders);
    // For standalone sales, also clear the open-workorder pointer + customer (mirrors closeModal's standalone branch).
    if (isStandalone) {
      let oldWoId = woStore.openWorkorderID;
      if (oldWoId) woStore.removeWorkorder(oldWoId, false);
      woStore.setOpenWorkorderID(null);
      useCurrentCustomerStore.getState().setCustomer({ ...CUSTOMER_PROTO }, false);
      useTabNamesStore.getState().setItems({
        infoTabName: TAB_NAMES.infoTab.customer,
        itemsTabName: TAB_NAMES.itemsTab.empty,
        optionsTabName: TAB_NAMES.optionsTab.workorders,
      });
    }
    resetAndClose();
  }

  // Called when user picks "Keep Ticket Open" — expand the modal to collect a required reason.
  function handlePickupKeepOpen() {
    dlog(DCAT.BUTTON, "pickup_keepOpen", "CheckoutModal", { saleID: sSale?.id, workorderCount: sCombinedWorkorders?.length });
    _setPickupKeepOpenExpanded(true);
  }

  // Called when user clicks "Save & Close" after entering the keep-alive reason.
  // Writes the reason into each combined workorder's internalNotes (matches the Notes-tab add pattern), then closes.
  function handlePickupSaveKeepOpenReason() {
    let reason = sPickupKeepOpenReason.trim();
    if (reason.length < 7) return;
    dlog(DCAT.BUTTON, "pickup_saveKeepOpenReason", "CheckoutModal", { saleID: sSale?.id, workorderCount: sCombinedWorkorders?.length, reasonLength: reason.length });
    let currentUser = useLoginStore.getState().currentUser;
    let userName = "(" + (currentUser?.first || "") + " " + ((currentUser?.last || "")[0] || "") + ")  ";
    let woStore = useOpenWorkordersStore.getState();
    for (let wo of sCombinedWorkorders) {
      let current = woStore.workorders.find((w) => w.id === wo.id);
      if (!current) continue;
      let updated = cloneDeep(current);
      let notes = [...(updated.internalNotes || [])];
      notes.unshift({
        id: crypto.randomUUID(),
        name: userName,
        userID: currentUser?.id || "",
        value: reason,
        createdAt: Date.now(),
      });
      updated.internalNotes = notes;
      woStore.setWorkorder(updated, true);
    }
    _setShowPickupModal(false);
    _setPickupKeepOpenExpanded(false);
    _setPickupKeepOpenReason("");
    useTabNamesStore.getState().setInfoTabName(TAB_NAMES.infoTab.customer);
    useTabNamesStore.getState().setOptionsTabName(TAB_NAMES.optionsTab.workorders);
    resetAndClose();
  }

  function handleCashChange(change) {
    dlog(DCAT.ACTION, "handleCashChange", "CheckoutModal", { changeCents: change });
    _setCashChangeNeeded(prev => prev + change);
  }

  function handlePartialPayment() {
    dlog(DCAT.BUTTON, "handlePartialPayment", "CheckoutModal", { saleID: sSale?.id, total: sSale?.total, amountCaptured: sSale?.amountCaptured, remaining: (sSale?.total || 0) - (sSale?.amountCaptured || 0) });
    let remaining = (sSale?.total || 0) - (sSale?.amountCaptured || 0);

    function buildPartialReceipt() {
      const primaryWO = sCombinedWorkorders[0];
      const _noCustomer = !primaryWO?.customerID;
      const customerForReceipt = (!_noCustomer)
        ? { first: primaryWO.customerFirst || "", last: primaryWO.customerLast || "", customerCell: primaryWO.customerCell || "", email: primaryWO.customerEmail || "", id: primaryWO.customerID || "" }
        : { first: zCustomer?.first || "", last: zCustomer?.last || "", customerCell: zCustomer?.customerCell || "", email: zCustomer?.email || "", id: zCustomer?.id || "" };
      const settings = useSettingsStore.getState().getSettings();
      const printerID = localStorageWrapper.getItem("selectedPrinterID") || "";
      const _ctx = { currentUser: useLoginStore.getState().getCurrentUser(), settings };
      let woForReceipt = primaryWO || { workorderLines: [], taxFree: false };
      let saleReceipt = printBuilder.sale(sSale, sTransactions, customerForReceipt, woForReceipt, settings?.salesTaxPercent, _ctx, sCredits);
      // log("Receipt object (partial/reprint):", JSON.stringify(saleReceipt, null, 2));
      return { saleReceipt, customerForReceipt, primaryWO, settings, printerID };
    }

    async function handlePrintReceipts() {
      let { saleReceipt, customerForReceipt, primaryWO, settings, printerID } = buildPartialReceipt();

      let translatedReceipt = null;
      let translatedPdfLabels = null;
      let langCode = getTranslateCode(sReceiptLanguage);
      if (langCode) {
        try {
          let translated = await translateSalesReceipt(saleReceipt, langCode, { saleID: sSale?.id || "", workorderID: primaryWO?.id || "", customerID: customerForReceipt?.id || "" });
          translatedReceipt = translated.translatedReceipt;
          translatedPdfLabels = translated.pdfLabels;
        } catch (e) {
          log("Receipt translation failed on partial payment, using English:", e);
        }
      }

      if (printerID) {
        let toPrint = translatedReceipt || saleReceipt;
        toPrint.popCashRegister = false;
        dbSavePrintObj(toPrint, printerID);
      }

      const smsTemplate = findTemplateByType(settings?.smsTemplates || settings?.textTemplates, "saleReceipt");
      const emailTemplate = findTemplateByType(settings?.emailTemplates, "saleReceipt");
      const smsContent = smsTemplate?.content || smsTemplate?.message || smsTemplate?.text || "";
      const emailContent = emailTemplate?.message || emailTemplate?.content || emailTemplate?.body || "";

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
        return;
      }

      const canSMS = customerForReceipt.customerCell && smsContent.trim();
      const canEmail = customerForReceipt.email && emailContent.trim();
      if (canSMS || canEmail) {
        sendSaleReceipt(sSale, customerForReceipt, primaryWO, settings, canSMS ? smsTemplate : null, canEmail ? emailTemplate : null, translatedReceipt, translatedPdfLabels, langCode, sTransactions, sCredits);
      }
    }

    useAlertScreenStore.getState().setValues({
      showAlert: true,
      fullScreen: true,
      title: "Partial Payment",
      message:
        "Remaining balance: $" +
        formatCurrencyDisp(remaining) +
        "\n\nAll payments have been saved. You can close this checkout and continue the sale later.",
      alertBoxStyle: { minWidth: "50%" },
      btn1Text: "Close",
      handleBtn1Press: () => {
        resetAndClose();
      },
      btn2Text: "Print Receipt",
      handleBtn2Press: () => {
        handlePrintReceipts();
        resetAndClose();
      },
      useCancelButton: true,
    });
  }

  // ─── Close Modal ──────────────────────────────────────────
  function closeModal() {
    dlog(DCAT.BUTTON, "closeModal", "CheckoutModal", { saleID: sSale?.id, saleComplete: saleComplete, isStandalone: isStandalone, hasRealPayments: hasRealPayments, amountCaptured: sSale?.amountCaptured });
    // Standalone: completed sale — clean up workorder and navigate back
    if (isStandalone && saleComplete) {
      resetAndClose();
      let woStore = useOpenWorkordersStore.getState();
      let oldWoId = woStore.openWorkorderID;
      if (oldWoId) woStore.removeWorkorder(oldWoId, false);
      woStore.setOpenWorkorderID(null);
      useCurrentCustomerStore.getState().setCustomer({ ...CUSTOMER_PROTO }, false);
      useTabNamesStore.getState().setItems({
        infoTabName: TAB_NAMES.infoTab.customer,
        itemsTabName: TAB_NAMES.itemsTab.empty,
        optionsTabName: TAB_NAMES.optionsTab.workorders,
      });
      return;
    }
    // Standalone: no money captured (or fully refunded) — clean up Firestore, keep workorder local
    if (isStandalone && !(sSale?.amountCaptured > 0)) {
      if (sSale?.id && salePersistedRef.current) {
        deleteActiveSale(sSale.id);
      }
      let woStore = useOpenWorkordersStore.getState();
      for (let wo of sCombinedWorkorders) {
        let current = woStore.workorders.find((w) => w.id === wo.id);
        if (current) {
          woStore.setWorkorder({ ...current, activeSaleID: "", saleID: "" }, false);
          dbDeleteWorkorder(wo.id);
        }
      }
      resetAndClose();
      return;
    }
    // Partial payment in progress (standalone with captured money, or regular workorder)
    if (
      (sTransactions.length > 0 || sCredits.length > 0) &&
      !sSale.paymentComplete
    ) {
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
    dlog(DCAT.ACTION, "resetAndClose", "CheckoutModal", { saleID: sSale?.id, transactionCount: sTransactions?.length, creditCount: sCredits?.length, salePersistedRef: salePersistedRef.current });
    let hasPayments = sTransactions.length > 0 || sCredits.length > 0;
    if (sSale?.id && !hasPayments && salePersistedRef.current) {
      deleteActiveSale(sSale.id);
      let woStore = useOpenWorkordersStore.getState();
      for (let wo of sCombinedWorkorders) {
        let current = woStore.workorders.find((w) => w.id === wo.id);
        if (current && current.activeSaleID) {
          woStore.setWorkorder({ ...current, activeSaleID: "" }, true);
        }
      }
    }
    salePersistedRef.current = false;
    broadcastClear();
    _setSale(null);
    _setTransactions([]);
    _setCredits([]);
    _setCombinedWorkorders([]);
    _setCashChangeNeeded(0);
    _setCardProcessingAmount(0);
    _setReaderError("");
    if (readerPollRef.current) {
      clearInterval(readerPollRef.current);
      readerPollRef.current = null;
    }
    _setInitialized(false);
    _setReceiptLanguage("english");
    // Clean up card payment state + listeners
    let stripeStore = useStripePaymentStore.getState();
    // If reader is waiting for a card, cancel the payment on the terminal
    if (stripeStore.cardStatus === "waitingForCard" || stripeStore.cardStatus === "initiating") {
      let savedReader = localStorageWrapper.getItem("warpspeed_selected_card_reader");
      if (savedReader?.id) {
        newCheckoutCancelStripePayment(savedReader.id).catch((err) => log("clearReader on close error:", err));
      }
    }
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

  async function resetStandaloneWorkorder() {
    dlog(DCAT.ACTION, "resetStandaloneWorkorder", "CheckoutModal", { currentWorkorderID: useOpenWorkordersStore.getState().openWorkorderID });
    let store = useOpenWorkordersStore.getState();
    let oldWo = store.getOpenWorkorder();
    if (oldWo) store.removeWorkorder(oldWo.id);

    let id = takeId("workorders") || await getId("workorders");
    let wo = createNewWorkorder({
      id,
      startedByFirst: useLoginStore.getState().currentUser?.first,
      startedByLast: useLoginStore.getState().currentUser?.last,
    });
    store.setWorkorder(wo, false);
    store.setOpenWorkorderID(wo.id);
  }

  async function handleReprint() {
    dlog(DCAT.RECEIPT, "handleReprint", "CheckoutModal", { saleID: sSale?.id, receiptLanguage: sReceiptLanguage });
    if (!sSale) return;
    const primaryWO = sCombinedWorkorders[0];
    const _noCustomer = !primaryWO?.customerID;
    const customer = (!_noCustomer)
      ? { first: primaryWO.customerFirst || "", last: primaryWO.customerLast || "", customerCell: primaryWO.customerCell || "", email: primaryWO.customerEmail || "", id: primaryWO.customerID || "" }
      : { first: zCustomer?.first || "", last: zCustomer?.last || "", customerCell: zCustomer?.customerCell || "", email: zCustomer?.email || "", id: zCustomer?.id || "" };
    const _ctx = { currentUser: useLoginStore.getState().getCurrentUser(), settings: zSettings };
    let toPrint = printBuilder.sale(
      sSale,
      sTransactions,
      customer,
      primaryWO || { workorderLines: [], taxFree: false },
      zSettings?.salesTaxPercent,
      _ctx,
      sCredits
    );

    let langCode = getTranslateCode(sReceiptLanguage);
    if (langCode) {
      try {
        let translated = await translateSalesReceipt(toPrint, langCode, { saleID: sSale?.id || "", workorderID: primaryWO?.id || "", customerID: customer?.id || "" });
        toPrint = translated.translatedReceipt;
      } catch (e) {
        log("Receipt translation failed on reprint, using English:", e);
      }
    }

    const printerID = localStorageWrapper.getItem("selectedPrinterID") || "";
    toPrint.popCashRegister = false;
    dbSavePrintObj(toPrint, printerID);
  }

  function handleSendSaleReceipt() {
    dlog(DCAT.RECEIPT, "handleSendSaleReceipt", "CheckoutModal", { saleID: sSale?.id });
    if (!sSale) return;
    let settings = useSettingsStore.getState().getSettings();
    let smsTemplate = findTemplateByType(settings?.smsTemplates || settings?.textTemplates, "saleReceipt");
    let emailTemplate = findTemplateByType(settings?.emailTemplates, "saleReceipt");

    const primaryWO = sCombinedWorkorders[0];
    const _noCustomer = !primaryWO?.customerID;
    const customerForReceipt = (!_noCustomer)
      ? { first: primaryWO.customerFirst || "", last: primaryWO.customerLast || "", customerCell: primaryWO.customerCell || "", email: primaryWO.customerEmail || "", id: primaryWO.customerID || "" }
      : { first: zCustomer?.first || "", last: zCustomer?.last || "", customerCell: zCustomer?.customerCell || "", email: zCustomer?.email || "", id: zCustomer?.id || "" };

    if (customerForReceipt.customerCell || customerForReceipt.email) {
      let smsContent = smsTemplate?.content || smsTemplate?.message || smsTemplate?.text || "";
      let emailContent = emailTemplate?.message || emailTemplate?.content || emailTemplate?.body || "";
      let canSMS = customerForReceipt.customerCell && smsContent.trim();
      let canEmail = customerForReceipt.email && emailContent.trim();
      if (canSMS || canEmail) {
        const _ctx = { currentUser: useLoginStore.getState().getCurrentUser(), settings };
        let woForReceipt = primaryWO || { workorderLines: [], taxFree: false };
        let receipt = printBuilder.sale(sSale, sTransactions, customerForReceipt, woForReceipt, settings?.salesTaxPercent, _ctx, sCredits);
        sendSaleReceipt(sSale, customerForReceipt, woForReceipt, settings, canSMS ? smsTemplate : null, canEmail ? emailTemplate : null, null, null, getTranslateCode(sReceiptLanguage), sTransactions, sCredits);
        _setReceiptSentOverlay({ sentSMS: !!canSMS, sentEmail: !!canEmail });
      }
    } else {
      _sSetShowSendReceiptModal(true);
    }
  }

  async function handleSendSaleReceiptFromModal({ phone, email }) {
    dlog(DCAT.RECEIPT, "handleSendSaleReceiptFromModal", "CheckoutModal", { saleID: sSale?.id, hasPhone: !!phone, hasEmail: !!email });
    if (!sSale) return;
    let settings = useSettingsStore.getState().getSettings();
    let smsTemplate = findTemplateByType(settings?.smsTemplates || settings?.textTemplates, "saleReceipt");
    let emailTemplate = findTemplateByType(settings?.emailTemplates, "saleReceipt");
    let smsContent = smsTemplate?.content || smsTemplate?.message || smsTemplate?.text || "";
    let emailContent = emailTemplate?.message || emailTemplate?.content || emailTemplate?.body || "";

    const primaryWO = sCombinedWorkorders[0];
    let customerForReceipt = {
      first: primaryWO?.customerFirst || zCustomer?.first || "Customer",
      last: primaryWO?.customerLast || zCustomer?.last || "",
      customerCell: phone || "",
      email: email || "",
      id: primaryWO?.customerID || zCustomer?.id || "",
    };

    let canSMS = phone && smsContent.trim();
    let canEmail = email && emailContent.trim();
    if (canSMS || canEmail) {
      let woForReceipt = primaryWO || { workorderLines: [], taxFree: false };
      await sendSaleReceipt(sSale, customerForReceipt, woForReceipt, settings, canSMS ? smsTemplate : null, canEmail ? emailTemplate : null, null, null, getTranslateCode(sReceiptLanguage), sTransactions, sCredits);
      _setReceiptSentOverlay({ sentSMS: !!canSMS, sentEmail: !!canEmail });
    }
    _sSetShowSendReceiptModal(false);
  }

  function handlePrintReceipt(payment) {
    dlog(DCAT.RECEIPT, "handlePrintReceipt", "CheckoutModal", { saleID: sSale?.id, transactionID: payment?.id, method: payment?.method, amountCaptured: payment?.amountCaptured });
    if (!sSale) return;
    let settings = useSettingsStore.getState().getSettings();
    let isDeposit = sSale.isDepositSale;
    let primaryWO = isDeposit ? null : sCombinedWorkorders[0];
    let _noCustomer = !primaryWO?.customerID;
    let customer = (isDeposit || _noCustomer)
      ? { first: zCustomer?.first || "", last: zCustomer?.last || "", customerCell: zCustomer?.customerCell || "", email: zCustomer?.email || "", id: zCustomer?.id || "" }
      : { first: primaryWO.customerFirst || "", last: primaryWO.customerLast || "", customerCell: primaryWO.customerCell || "", email: primaryWO.customerEmail || "", id: primaryWO.customerID || "" };
    let _ctx = { currentUser: useLoginStore.getState().getCurrentUser(), settings };
    let wo = (isDeposit || !primaryWO) ? { workorderLines: [], taxFree: false } : primaryWO;
    let paymentsForReceipt = payment ? [payment] : sTransactions;
    let creditsForReceipt = payment ? [] : sCredits;
    let receipt = printBuilder.sale(sSale, paymentsForReceipt, customer, wo, settings?.salesTaxPercent, _ctx, creditsForReceipt);
    if (payment) {
      receipt.transactionOnly = true;
      receipt.popCashRegister = false;
    }
    log("handlePrintReceipt receipt:", JSON.stringify(receipt));
    let printerID = localStorageWrapper.getItem("selectedPrinterID") || "";
    if (printerID) dbSavePrintObj(receipt, printerID);
  }

  function handlePopRegister() {
    dlog(DCAT.BUTTON, "handlePopRegister", "CheckoutModal", {});
    let settings = useSettingsStore.getState().getSettings();
    let printObj = { id: crypto.randomUUID(), receiptType: RECEIPT_TYPES.register };
    log("handlePopRegister printObj:", JSON.stringify(printObj));
    dbSavePrintObj(printObj, localStorageWrapper.getItem("selectedPrinterID") || "");
    _setShowPopConfirm(true);
    setTimeout(() => _setShowPopConfirm(false), 1000);
  }

  function applyTaxFree(newVal) {
    dlog(DCAT.CHECKBOX, "applyTaxFree", "CheckoutModal", { taxFree: newVal, saleID: sSale?.id });
    let note = newVal ? (useSettingsStore.getState().settings?.taxFreeReceiptNote || "") : "";
    let newCombined = sCombinedWorkorders.map((wo) => ({
      ...wo,
      taxFree: newVal,
      taxFreeReceiptNote: note,
    }));
    _setCombinedWorkorders(newCombined);

    // Persist to each workorder
    newCombined.forEach((wo) => {
      useOpenWorkordersStore.getState().setField("taxFree", newVal, wo.id);
      useOpenWorkordersStore.getState().setField("taxFreeReceiptNote", note, wo.id);
    });

    // Recalculate sale totals
    let updated = updateSaleWithTotals(sSale, newCombined, zSettings);
    _setSale(updated);
    broadcastSaleToDisplay(updated, newCombined, custFirst, custLast, custLanguage);
    if (salePersistedRef.current) persistSale(updated);
  }

  function handleTaxFreeToggle() {
    dlog(DCAT.CHECKBOX, "handleTaxFreeToggle", "CheckoutModal", { currentlyTaxFree: !!sCombinedWorkorders[0]?.taxFree });
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
    <Dialog
      visible={zIsCheckingOut}
      onClose={closeModal}
      preventClose={cardIsProcessing}
      title="Checkout"
      aria-label="Checkout"
    >
        <div
          className={styles.modalCard}
          style={{
            backgroundColor: lightenRGBByPercent(C.backgroundWhite, 35),
            ...SHADOW_RADIUS_PROTO,
            shadowColor: C.green,
          }}
        >
          {/* Loading overlay */}
          {!sSale && (
            <div
              className={styles.loadingOverlay}
              style={{ backgroundColor: lightenRGBByPercent(C.backgroundWhite, 35) }}
            >
              <LoadingIndicator />
            </div>
          )}
          {/* ── Main 3-Column Layout ────────────────────── */}
          <div className={styles.mainRow}>
            {/* ── LEFT COLUMN: Payment Methods ──────────── */}
            <div className={styles.leftCol}>
              {isZeroTotal ? (
                <div className={styles.zeroTotalBox} style={{ ...SHADOW_RADIUS_PROTO }}>
                  <span className={styles.zeroTotalTitle} style={{ fontWeight: Fonts.weight.textHeavy, color: C.text }}>Total is $0.00</span>
                  <button
                    type="button"
                    onClick={handleZeroTotalComplete}
                    className={styles.completeButton}
                    style={{ backgroundColor: C.green }}
                  >
                    <span className={styles.completeButtonText} style={{ fontWeight: Fonts.weight.textHeavy }}>Complete Workorder</span>
                  </button>
                </div>
              ) : isFullyPaid ? (
                <div className={styles.zeroTotalBox} style={{ ...SHADOW_RADIUS_PROTO }}>
                  <span className={styles.fullyPaidLabel} style={{ color: C.textMuted }}>AMOUNT PAID</span>
                  <span className={styles.fullyPaidAmount} style={{ fontWeight: Fonts.weight.textSuperheavy, color: C.green }}>{"$" + formatCurrencyDisp(sSale?.amountCaptured || 0)}</span>
                  <span className={styles.fullyPaidTotal} style={{ color: C.textMuted }}>{"Sale total: $" + formatCurrencyDisp(sSale?.total || 0)}</span>
                  <button
                    type="button"
                    onClick={handleFullyPaidComplete}
                    className={styles.completeButton}
                    style={{ backgroundColor: C.green }}
                  >
                    <span className={styles.completeButtonText} style={{ fontWeight: Fonts.weight.textHeavy }}>Complete Sale</span>
                  </button>
                </div>
              ) : (
                <CashPayment
                  amountLeftToPay={cashAmountLeftToPay}
                  onPaymentCapture={handlePaymentCapture}
                  acceptChecks={zSettings?.acceptChecks}
                  saleComplete={saleComplete}
                  onCashChange={handleCashChange}
                  hasReaders={onlineReaders.length > 0}
                  isVisible={zIsCheckingOut}
                  lockAmount={isDepositMode}
                  cardIsProcessing={cardIsProcessing}
                />
              )}
              {!isZeroTotal && !isFullyPaid && (sCardMode === "manual" ? (
                <CardPayment
                  amountLeftToPay={amountLeftToPay}
                  onPaymentCapture={handlePaymentCapture}
                  onPaymentStarted={handlePaymentStarted}
                  onPaymentFailed={handlePaymentFailed}
                  saleComplete={saleComplete}
                  saleID={sSale?.id || ""}
                  customerID={sSale?.customerID || zCustomer?.id || ""}
                  customerEmail={zCustomer?.email || ""}
                  onCardProcessingStart={(amount) => { dlog(DCAT.ACTION, "cardProcessingStart_manual", "CheckoutModal", { amountCents: amount }); _setCardProcessingAmount(amount); }}
                  onCardProcessingEnd={() => { dlog(DCAT.ACTION, "cardProcessingEnd_manual", "CheckoutModal", {}); _setCardProcessingAmount(0); }}
                  onSwitchToReader={() => { dlog(DCAT.BUTTON, "switchToReader", "CheckoutModal", {}); _setCardMode("reader"); }}
                  lockAmount={isDepositMode}
                />
              ) : (
                <CardReaderPayment
                  amountLeftToPay={amountLeftToPay}
                  onPaymentCapture={handlePaymentCapture}
                  onPaymentStarted={handlePaymentStarted}
                  onPaymentFailed={handlePaymentFailed}
                    stripeReaders={zStripeReaders}
                    settings={zSettings}
                    saleComplete={saleComplete}
                    readerError={sReaderError}
                    saleID={sSale?.id || ""}
                    customerID={sSale?.customerID || zCustomer?.id || ""}
                    customerEmail={zCustomer?.email || ""}
                    saleSalesTax={sSale?.salesTax || 0}
                    saleTotal={sSale?.total || 0}
                    onCardProcessingStart={(amount) => { dlog(DCAT.ACTION, "cardProcessingStart_reader", "CheckoutModal", { amountCents: amount }); _setCardProcessingAmount(amount); }}
                    onCardProcessingEnd={() => { dlog(DCAT.ACTION, "cardProcessingEnd_reader", "CheckoutModal", {}); _setCardProcessingAmount(0); }}
                    onSwitchToManual={() => { dlog(DCAT.BUTTON, "switchToManual", "CheckoutModal", {}); _setCardMode("manual"); }}
                    lockAmount={isDepositMode}
                  />
              ))}
            </div>

            {isDepositMode ? (
              /* ── DEPOSIT MODE: Combined middle+right ───── */
              <div
                className={styles.depositCol}
                style={{ opacity: cardIsProcessing ? 0.4 : 1, pointerEvents: cardIsProcessing ? "none" : "auto" }}
              >
                {/* Deposit Summary Card */}
                <div
                  className={styles.depositSummaryCard}
                  style={{
                    borderColor: zDepositInfo?.type === CUSTOMER_DEPOST_TYPES.credit ? C.blue : C.green,
                    backgroundColor: C.backgroundListWhite,
                  }}
                >
                  <div className={styles.depositSummaryHeader}>
                    <div
                      className={styles.depositTypePill}
                      style={{
                        backgroundColor: zDepositInfo?.type === CUSTOMER_DEPOST_TYPES.credit
                          ? lightenRGBByPercent(C.blue, 70)
                          : lightenRGBByPercent(C.green, 70),
                      }}
                    >
                      <span
                        className={styles.depositTypePillText}
                        style={{ color: zDepositInfo?.type === CUSTOMER_DEPOST_TYPES.credit ? C.blue : C.green }}
                      >
                        {zDepositInfo?.type === CUSTOMER_DEPOST_TYPES.credit ? "Credit" : "Deposit"}
                      </span>
                    </div>
                    <span className={styles.depositAmountText} style={{ color: C.text }}>
                      {"$" + formatCurrencyDisp(zDepositInfo?.amountCents || 0)}
                    </span>
                  </div>
                  {!!zDepositInfo?.note && (
                    <span className={styles.depositNoteText} style={{ color: C.textMuted }}>
                      {zDepositInfo.note}
                    </span>
                  )}
                  {zCustomer && (
                    <span className={styles.depositCustomerName} style={{ color: C.text }}>
                      {zCustomer.first} {zCustomer.last}
                    </span>
                  )}
                </div>

                {/* Deposit info banner */}
                <div
                  className={styles.depositInfoBanner}
                  style={{ backgroundColor: C.backgroundListWhite, borderColor: C.orange }}
                >
                  <Image
                    src={ICONS.info}
                    style={{ width: 18, height: 18, marginRight: 8, tintColor: C.orange }}
                  />
                  <span className={styles.depositInfoBannerText} style={{ color: C.orange }}>
                    {sSale?.depositType === "giftcard" ? "Gift card" : "Deposit"} requires full payment - partial payments are not allowed.
                  </span>
                </div>

                <SaleTotals
                  sale={sSale}
                  settings={zSettings}
                />

                <div className={styles.paymentsListWrap}>
                  <PaymentsList
                    payments={sTransactions}
                    credits={sCredits}
                    onRefund={(payment) => { dlog(DCAT.BUTTON, "openRefundModal_deposit", "CheckoutModal", { transactionID: payment?.id, method: payment?.method, amountCaptured: payment?.amountCaptured }); _setRefundPayment(payment); _setShowRefundModal(true); }}
                    onPrintReceipt={handlePrintReceipt}
                  />
                </div>

                <CashChangeNeeded cashChangeNeeded={sCashChangeNeeded} />

                {/* Bottom Buttons */}
                <div
                  className={styles.bottomButtonsRow}
                  style={{ borderColor: C.buttonLightGreenOutline, backgroundColor: C.backgroundListWhite }}
                >
                  {saleComplete && (
                    <Tooltip text="Reprint receipt" position="top">
                      <button type="button" onClick={handleReprint} className={styles.iconButton}>
                        <Image icon={ICONS.print} size={35} />
                      </button>
                    </Tooltip>
                  )}
                  {saleComplete && (
                    <Tooltip text="Send receipt" position="top">
                      <button type="button" onClick={handleSendSaleReceipt} className={styles.iconButton}>
                        <Image icon={ICONS.paperPlane} size={35} />
                      </button>
                    </Tooltip>
                  )}
                  <Tooltip text={saleComplete ? "Close" : isStandalone ? "Cancel sale" : "Cancel"} position="top">
                    <button type="button" onClick={closeModal} className={styles.iconButton}>
                      <Image icon={ICONS.close1} size={35} />
                    </button>
                  </Tooltip>
                  <Tooltip text="Pop register" position="top">
                    <button type="button" onClick={handlePopRegister} className={styles.iconButton}>
                      <Image icon={ICONS.openCashRegister} size={30} />
                    </button>
                  </Tooltip>
                </div>
              </div>
            ) : (
              <>
            {/* ── MIDDLE COLUMN: Totals & Payments ──────── */}
            <div
              className={styles.midCol}
              style={{ opacity: cardIsProcessing ? 0.4 : 1, pointerEvents: cardIsProcessing ? "none" : "auto" }}
            >
              {/* Customer Info */}
              {zCustomer && (
                <div
                  className={styles.customerInfoCard}
                  style={{ borderColor: C.buttonLightGreenOutline, backgroundColor: C.backgroundListWhite }}
                >
                  <div className={styles.customerInfoTopRow}>
                    <div className={styles.customerInfoCol}>
                      <span className={styles.customerNameText} style={{ color: C.text }}>
                        {zCustomer.first} {zCustomer.last}
                        {!!zCustomer.contactRestriction && (
                          <span style={{ color: C.red }}>
                            {zCustomer.contactRestriction === CONTACT_RESTRICTIONS.call
                              ? "    (CALL ONLY)"
                              : "    (EMAIL ONLY)"}
                          </span>
                        )}
                      </span>
                      {zCustomer.email && (
                        <span className={styles.customerEmailText} style={{ color: C.textSecondary }}>
                          {zCustomer.email}
                        </span>
                      )}
                    </div>
                    <div className={styles.customerInfoCol}>
                      {zCustomer.customerCell ? (
                        <span style={{ color: C.text }}>
                          {formatPhoneForDisplay(zCustomer.customerCell)}
                        </span>
                      ) : !!zCustomer.land && (
                        <span style={{ color: C.text }}>
                          {formatPhoneForDisplay(zCustomer.land)}
                        </span>
                      )}
                    </div>
                  </div>
                  {!!zCustomer.streetAddress && (
                    <span className={styles.customerAddressText} style={{ color: C.text }}>
                      {zCustomer.streetAddress}
                      {!!zCustomer.unit && (
                        <span style={{ color: C.text, fontSize: 13 }}>
                          {"  |  Unit " + zCustomer.unit}
                        </span>
                      )}
                      {!!zCustomer.city && (
                        <span style={{ color: C.text, fontSize: 13 }}>
                          {"   |   " + zCustomer.city}
                        </span>
                      )}
                    </span>
                  )}
                </div>
              )}

              {/* Customer Deposits / Credits */}
              {(() => {
                      let appliedCreditIds = new Set(sCredits.map((c) => c.id));
                      let availableDeposits = (zCustomer?.deposits || []).filter((d) => (d.amountCents - (d.reservedCents || 0)) > 0 && !appliedCreditIds.has(d.id)).map((d) => ({ ...d, amountCents: d.amountCents - (d.reservedCents || 0), _type: d.type === "giftcard" ? "giftcard" : "deposit" }));
                      let availableCredits = (zCustomer?.credits || []).filter((d) => (d.amountCents - (d.reservedCents || 0)) > 0 && !appliedCreditIds.has(d.id)).map((d) => ({ ...d, amountCents: d.amountCents - (d.reservedCents || 0), _type: "credit" }));
                      let allAvailable = [...availableDeposits, ...availableCredits];
                let saleComplete = sSale?.paymentComplete;
                      if (allAvailable.length === 0 || saleComplete) return null;
                return (
                  <div
                    className={styles.depositsListCard}
                    style={{ borderColor: C.buttonLightGreenOutline }}
                  >
                    <div className={styles.depositsListHeader}>
                      <span className={styles.depositsListHeaderText} style={{ fontWeight: Fonts.weight.textHeavy, color: C.text }}>DEPOSITS, CREDITS & GIFT CARDS</span>
                    </div>
                    {allAvailable.map((item) => {
                      let isCredit = item._type === "credit";
                      let isGiftCard = item._type === "giftcard";
                      let badgeColor = isGiftCard ? C.orange : isCredit ? C.blue : C.green;
                      let noteText = item.note || item.text || "";
                      let isExpanded = sExpandedCreditIds.includes(item.id);
                      let amountNeeded = Math.max(0, (sSale?.total || 0) - (sSale?.amountCaptured || 0));
                      let smartAmount = Math.min(item.amountCents, amountNeeded);
                      let hasTyped = sDepositInputCents > 0;
                      let buttonAmount = hasTyped ? sDepositInputCents : smartAmount;
                      let buttonLabel = hasTyped ? "Apply" : "Apply $" + formatCurrencyDisp(smartAmount);
                      function toggleExpand() {
                        if (isExpanded) {
                          _setExpandedCreditIds([]);
                        } else {
                          _setExpandedCreditIds([item.id]);
                        }
                        _setDepositInputDisp("");
                        _setDepositInputCents(0);
                      }
                      function handleAmountChange(val) {
                        let result = usdTypeMask(val, { withDollar: false });
                        if (result.cents === 0) {
                          _setDepositInputDisp("");
                          _setDepositInputCents(0);
                          return;
                        }
                        let maxApplicable = Math.min(item.amountCents, amountNeeded);
                        if (result.cents > maxApplicable) {
                          _setDepositInputDisp(formatCurrencyDisp(maxApplicable));
                          _setDepositInputCents(maxApplicable);
                          return;
                        }
                        _setDepositInputDisp(result.display);
                        _setDepositInputCents(result.cents);
                      }
                      function handleApplyClick() {
                        if (buttonAmount <= 0) return;
                        handleApplyDeposit(item, buttonAmount);
                        _setExpandedCreditIds([]);
                        _setDepositInputDisp("");
                        _setDepositInputCents(0);
                      }
                      return (
                        <div key={item.id} className={styles.depositRow}>
                          <div
                            className={styles.depositRowInner}
                            onClick={toggleExpand}
                            role="button"
                            tabIndex={0}
                            style={{ cursor: "pointer" }}
                          >
                            <span
                              className={styles.depositExpandChevron}
                              style={{ color: C.textMuted }}
                            >
                              {isExpanded ? "▾" : "▸"}
                            </span>
                            <div
                              className={styles.depositTypeBadge}
                              style={{ backgroundColor: lightenRGBByPercent(badgeColor, 70) }}
                            >
                              <span className={styles.depositTypeBadgeText} style={{ color: badgeColor }}>
                                {isGiftCard ? "Gift Card" : isCredit ? "Credit" : "Deposit"}
                              </span>
                            </div>
                            <span className={styles.depositAmountInList} style={{ color: C.text }}>
                              {"$" + formatCurrencyDisp(item.amountCents)}
                            </span>
                            {(item.reservedCents || 0) > 0 && (
                              <span className={styles.depositReservedText} style={{ color: C.orange }}>
                                {"$" + formatCurrencyDisp(item.reservedCents) + "/$" + formatCurrencyDisp(item.amountCents + item.reservedCents) + (item.amountCents <= 0 ? " Used" : " In use")}
                              </span>
                            )}
                          </div>
                          {isExpanded && (
                            <div className={styles.depositExpandPanel}>
                              {!!noteText && (
                                <span className={styles.depositReasonExpanded} style={{ color: C.textMuted }}>
                                  <span style={{ color: "var(--text-disabled)" }}>{"Reason: "}</span>
                                  {noteText}
                                </span>
                              )}
                              <div className={styles.depositApplyRow}>
                                <div
                                  className={styles.depositAmountInputWrap}
                                  style={{ borderColor: C.borderDefault }}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <span className={styles.depositAmountInputLabel} style={{ color: C.textMuted }}>
                                    Custom amount
                                  </span>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    className={styles.depositAmountInput}
                                    placeholder="0.00"
                                    value={sDepositInputDisp}
                                    onChange={(e) => handleAmountChange(e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                    autoFocus
                                    style={{ color: C.text }}
                                  />
                                </div>
                                <button
                                  type="button"
                                  className={styles.depositApplyButton}
                                  onClick={(e) => { e.stopPropagation(); handleApplyClick(); }}
                                  disabled={buttonAmount <= 0}
                                  style={{ backgroundColor: buttonAmount > 0 ? C.green : C.borderDefault, color: C.surfaceBase }}
                                >
                                  {buttonLabel}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Sale Totals */}
              <SaleTotals
                sale={sSale}
                settings={zSettings}
              />

                    {/* Payments container */}
              <div className={styles.paymentsContainer}>
                <div className={styles.paymentsScroll}>
                      <PaymentsList
                          payments={sTransactions}
                          credits={sCredits}
                  onRefund={(payment) => { dlog(DCAT.BUTTON, "openRefundModal", "CheckoutModal", { transactionID: payment?.id, method: payment?.method, amountCaptured: payment?.amountCaptured }); _setRefundPayment(payment); _setShowRefundModal(true); }}
                  onPrintReceipt={handlePrintReceipt}
                  onPrintDepositReceipt={handlePrintDepositReceipt}
                  onRemoveDeposit={!saleComplete ? (credit) => _setSplitDepositPayment(credit) : null}
                />
                </div>

                      {!!sSplitDepositPayment && (() => {
                        let isCredit = sSplitDepositPayment.type === "credit";
                        let customerArr = isCredit ? (zCustomer?.credits || []) : (zCustomer?.deposits || []);
                        let customerRemaining = customerArr
                          .filter((d) => d.id === sSplitDepositPayment.id)
                          .reduce((sum, d) => sum + (d.amountCents || 0), 0);
                        let totalDeposit = customerRemaining + sSplitDepositPayment.amount;
                        let originalAmount = sSplitDepositPayment._originalAmount || totalDeposit;
                        let saleRemaining = (sSale?.total || 0) - (sSale?.amountCaptured || 0) + sSplitDepositPayment.amount;
                        let maxAvailable = Math.min(totalDeposit, originalAmount, saleRemaining);
                        return (
                          <SplitDepositModal
                            payment={sSplitDepositPayment}
                            maxAvailable={maxAvailable}
                            onConfirm={(cents) => handleSplitDeposit(sSplitDepositPayment, cents)}
                            onRemove={() => { handleRemoveDeposit(sSplitDepositPayment); _setSplitDepositPayment(null); }}
                            onClose={() => _setSplitDepositPayment(null)}
                          />
                        );
                      })()}

                      <PaymentStatus
                        sale={sSale}
                        amountRemaining={Math.max(0, (sSale?.total || 0) - (sSale?.amountCaptured || 0))}
                      />

              </div>

              <div className={styles.flexSpacer} />

              <CashChangeNeeded cashChangeNeeded={sCashChangeNeeded} />

              {/* Bottom Buttons: Cancel/Close + Reprint */}
              <div
                className={styles.bottomButtonsRowMain}
                style={{ borderColor: C.buttonLightGreenOutline, backgroundColor: C.backgroundListWhite }}
              >
                {/* Tax-Free & Receipt Language */}

                      {sCombinedWorkorders.length > 0 && !saleComplete && !(sTransactions.length > 0 || sCredits.length > 0) && (
                  <CheckBox
                    text="Tax-Free"
                    isChecked={!!sCombinedWorkorders[0]?.taxFree}
                    onCheck={handleTaxFreeToggle}
                    textStyle={{ fontSize: 13, color: C.textMuted }}
                  />
                )}


                <div className={styles.langSelectCol}>
                  <span className={styles.langSelectLabel} style={{ color: C.textMuted }}>Receipt text</span>

                  <DropdownMenu
                    dataArr={Object.keys(CUSTOMER_LANGUAGES).map((key) => ({ label: CUSTOMER_LANGUAGES[key], key }))}
                    matchValue={CUSTOMER_LANGUAGES[sReceiptLanguage] || "English"}
                    useSelectedAsButtonTitle={true}
                    onSelect={(item) => { dlog(DCAT.DROPDOWN, "receiptLanguageSelect", "CheckoutModal", { language: item?.key }); _setReceiptLanguage(item.key); }}
                    buttonStyle={{ marginLeft: 5, paddingHorizontal: 10, paddingVertical: 3 }}
                    buttonTextStyle={{ fontSize: 12 }}
                    buttonIcon={null}
                    buttonIconSize={0}
                  />
                </div>
                {(saleComplete || hasRealPayments) && (
                  <Tooltip text={saleComplete ? "Reprint receipt" : "Print partial payment receipt"} position="top">
                    <button type="button" onClick={handleReprint} className={styles.iconButton}>
                      <Image icon={ICONS.print} size={35} />
                    </button>
                  </Tooltip>
                )}
                {(saleComplete || hasRealPayments) && (() => {
                  let hasContact = !!(zCustomer?.customerCell || zCustomer?.email || zOpenWorkorder?.customerCell || zOpenWorkorder?.customerEmail);
                  if (!hasContact) return null;
                  return (
                    <Tooltip text={saleComplete ? "Send receipt" : "Send partial payment receipt"} position="top">
                      <button type="button" onClick={handleSendSaleReceipt} className={styles.iconButton}>
                        <Image icon={ICONS.paperPlane} size={35} />
                      </button>
                    </Tooltip>
                  );
                })()}
                <Tooltip text={hasRealPayments && !saleComplete ? "Close with partial payment" : saleComplete ? "Close" : isStandalone ? "Cancel sale" : "Close checkout"} position="top">
                  <button
                    type="button"
                    onClick={hasRealPayments && !saleComplete ? handlePartialPayment : closeModal}
                    className={styles.iconButton}
                  >
                    <Image icon={ICONS.close1} size={35} />
                  </button>
                </Tooltip>
                <Tooltip text="Pop register" position="top">
                  <button type="button" onClick={handlePopRegister} className={styles.iconButton}>
                    <Image icon={ICONS.openCashRegister} size={35} />
                  </button>
                </Tooltip>

              </div>
            </div>

            {/* ── RIGHT COLUMN: Workorders & Inventory ───── */}
            <div
              className={styles.rightCol}
              style={{ opacity: cardIsProcessing ? 0.4 : 1, pointerEvents: cardIsProcessing ? "none" : "auto" }}
            >
              <div className={styles.rightScroll}>
                {/* {hasRealPayments ? (
                  <StaleBanner
                    text="Sale In Progress"
                          style={{ height: 60, justifyContent: "center", width: "100%", backgroundColor: "black" }}
                          textStyle={{ fontSize: 21, color: "yellow" }}
                  />
                ) : ( */}
                {(
                        <InventorySearch
                          onAddItem={handleAddItem}
                          inventory={zInventory}
                          onOpenNewItemModal={(item) => _setNewItemModal(item)}
                  />
                )}

                      {/* Workorders (combiner + line items) */}
                      <div className={styles.workorderCombinerSpacer} />
                      <Suspense fallback={<LoadingIndicator />}>
                        <WorkorderCombiner
                          combinedWorkorders={sCombinedWorkorders}
                          otherCustomerWorkorders={getOtherCustomerWorkorders()}
                          onToggle={handleToggleWorkorder}
                          onLineChange={handleWorkorderLineChange}
                          primaryWorkorderID={zOpenWorkorder?.id}
                          salesTaxPercent={zSettings?.salesTaxPercent || 0}
                          saleTotal={sSale?.total || 0}
                          amountCaptured={sSale?.amountCaptured || 0}
                        />
                      </Suspense>
              </div>
            </div>
              </>
            )}
          </div>

          {/* Tax-Free Confirmation Overlay (inline to avoid z-index issues with global AlertBox_) */}
          {sShowTaxFreeConfirm && (
            <div className={`${styles.confirmOverlay} ${styles.confirmOverlayTaxFree}`}>
              <div className={styles.confirmBoxTaxFree} style={{ backgroundColor: C.backgroundWhite }}>
                <span className={styles.confirmTitle}>Tax-Free Confirmation</span>
                <span className={styles.confirmMessage} style={{ color: C.text }}>
                  No shop parts, even a drop of oil, must leave with the customer for this workorder to qualify as tax-free.
                </span>
                <div className={styles.confirmActions}>
                  <Button
                    colorGradientArr={COLOR_GRADIENTS.green}
                    text="Confirm Tax-Free"
                    textStyle={{ color: C.textWhite }}
                    onPress={() => {
                      _setShowTaxFreeConfirm(false);
                      applyTaxFree(true);
                    }}
                  />
                  <Button
                    colorGradientArr={COLOR_GRADIENTS.blue}
                    text="Cancel"
                    textStyle={{ color: C.textWhite }}
                    onPress={() => _setShowTaxFreeConfirm(false)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Pop Register Confirmation */}
          {sShowPopConfirm && (
            <div className={`${styles.confirmOverlay} ${styles.confirmOverlayPop}`}>
              <div className={styles.confirmBoxPop} style={{ backgroundColor: C.backgroundWhite }}>
                <Image
                  src={ICONS.openCashRegister}
                  style={{ width: 60, height: 60, marginBottom: 12 }}
                />
                <span className={styles.popRegisterText} style={{ color: C.text }}>
                  Register Opened
                </span>
              </div>
            </div>
          )}
          <ReceiptSentOverlay visible={!!sReceiptSentOverlay} sentSMS={sReceiptSentOverlay?.sentSMS} sentEmail={sReceiptSentOverlay?.sentEmail} onDone={() => _setReceiptSentOverlay(null)} />
          {sNewItemModal && (
            <Suspense fallback={<LoadingIndicator />}>
              <InventoryItemModalScreen
                key={sNewItemModal.id}
                item={sNewItemModal}
                isNew={true}
                handleExit={() => _setNewItemModal(null)}
              />
            </Suspense>
          )}
          {sShowPickupModal && (
            <div className={styles.pickupOverlay}>
              <div className={styles.pickupBox} style={{ backgroundColor: C.backgroundWhite, borderColor: C.buttonLightGreenOutline }}>
                <span className={styles.pickupTitle} style={{ color: C.text }}>Payment Complete</span>
                <span className={styles.pickupSubtitle} style={{ color: C.textMuted }}>
                  Close out this ticket, or keep it open for pickup?
                </span>
                <button
                  type="button"
                  className={styles.pickupPrimaryBtn}
                  style={{ backgroundColor: C.green, color: C.textWhite }}
                  onClick={handlePickupCompleteAndClose}
                  disabled={sPickupKeepOpenExpanded}
                >
                  Complete & Close
                  {!sPickupKeepOpenExpanded && (
                    <span
                      className={styles.pickupCountdown}
                      style={{ color: sPickupCountdown <= 3 ? C.red : C.textWhite }}
                    >
                      {sPickupCountdown}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  className={styles.pickupSecondaryBtn}
                  style={{ borderColor: C.borderDefault, color: C.text, backgroundColor: C.backgroundWhite }}
                  onClick={handlePickupKeepOpen}
                  disabled={sPickupKeepOpenExpanded}
                >
                  Keep Ticket Open
                </button>
                {sPickupKeepOpenExpanded && (
                  <>
                    <textarea
                      className={styles.pickupReasonInput}
                      style={{ borderColor: C.borderDefault, color: C.text, backgroundColor: C.backgroundWhite }}
                      placeholder="Enter keep alive reason  REQUIRED"
                      value={sPickupKeepOpenReason}
                      onChange={(e) => {
                        let v = e.target.value;
                        if (v.length > 0) v = v.charAt(0).toUpperCase() + v.slice(1);
                        _setPickupKeepOpenReason(v);
                      }}
                      autoCapitalize="sentences"
                      rows={3}
                      autoFocus
                    />
                    <button
                      type="button"
                      className={styles.pickupPrimaryBtn}
                      style={{
                        backgroundColor: sPickupKeepOpenReason.trim().length >= 7 ? C.green : C.textDisabled,
                        color: C.textWhite,
                        cursor: sPickupKeepOpenReason.trim().length >= 7 ? "pointer" : "not-allowed",
                        marginTop: 12,
                        marginBottom: 0,
                      }}
                      onClick={handlePickupSaveKeepOpenReason}
                      disabled={sPickupKeepOpenReason.trim().length < 7}
                    >
                      Save & Close
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
    </Dialog>
    {sShowSendReceiptModal && (
      <Suspense fallback={<LoadingIndicator />}>
        <SendReceiptModal
          visible={sShowSendReceiptModal}
          onSend={handleSendSaleReceiptFromModal}
          onClose={() => _sSetShowSendReceiptModal(false)}
        />
      </Suspense>
    )}
    {sShowRefundModal && (
      <Suspense fallback={<LoadingIndicator />}>
      <NewRefundModalScreen
        visible={true}
        sale={prepareSaleForPersist(sSale)}
        transactions={sTransactions}
        initialPayment={sRefundPayment}
        onClose={() => { dlog(DCAT.BUTTON, "refundModal_onClose", "CheckoutModal", {}); _setShowRefundModal(false); _setRefundPayment(null); }}
        onSaleUpdated={(updatedSale, updatedTransactions) => {
          dlog(DCAT.ACTION, "refundModal_onSaleUpdated", "CheckoutModal", { saleID: updatedSale?.id, voidedByRefund: !!updatedSale?.voidedByRefund, amountCaptured: updatedSale?.amountCaptured, transactionCount: updatedTransactions?.length });
          // Refresh combined workorders from store to pick up refund changelog entries
          let freshWorkorders = sCombinedWorkorders.map((wo) => {
            let storeWO = useOpenWorkordersStore.getState().workorders.find((w) => w.id === wo.id);
            return storeWO ? cloneDeep(storeWO) : wo;
          });
          _setCombinedWorkorders(freshWorkorders);

          if (updatedSale?.voidedByRefund) {
            // All payments refunded - reset payment state but keep credits applied
            let resetSale = cloneDeep(updatedSale);
            delete resetSale.voidedByRefund;
            resetSale.paymentComplete = false;
            recomputeSaleAmounts(resetSale, updatedTransactions || [], getAllAppliedCredits(resetSale));
            resetSale = updateSaleWithTotals(resetSale, freshWorkorders, zSettings);
            _setSale(resetSale);
            _setTransactions(updatedTransactions || []);
            persistSale(resetSale, updatedTransactions || []);
          } else {
            _setSale(updatedSale);
            if (updatedTransactions) _setTransactions(updatedTransactions);
          }
        }}
      />
      </Suspense>
    )}
  </>
  );
}

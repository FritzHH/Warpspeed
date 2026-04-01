/* eslint-disable */
import { View, Text, ScrollView, Image } from "react-native-web";
import { useState, useRef, useEffect } from "react";
import { cloneDeep } from "lodash";
import { ScreenModal, SHADOW_RADIUS_PROTO, Button_, CheckBox_, DropdownMenu, Tooltip, Image_, StaleBanner, TextInput_, LoadingIndicator } from "../../../../components";
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
  useTabNamesStore,
  getChangeLogUser,
  diffWorkorderLines,
} from "../../../../stores";
import {
  lightenRGBByPercent,
  formatCurrencyDisp,
  log,
  printBuilder,
  gray,
  replaceOrAddToArr,
  formatPhoneWithDashes,
  formatPhoneForDisplay,
  findTemplateByType,
  resolveStatus,
  usdTypeMask,
  generateEAN13Barcode,
  createNewWorkorder,
  localStorageWrapper,
} from "../../../../utils";
import { WORKORDER_ITEM_PROTO, WORKORDER_PROTO, CONTACT_RESTRICTIONS, RECEIPT_TYPES, RECEIPT_PROTO, CUSTOMER_LANGUAGES, TRANSACTION_PROTO, CREDIT_APPLIED_PROTO, CUSTOMER_DEPOST_TYPES, CUSTOMER_DEPOSIT_PROTO, TAB_NAMES, TAX_FREE_RECEIPT_NOTE, CUSTOMER_PROTO } from "../../../../data";
import { dbSavePrintObj, dbGetCompletedWorkorder, dbSaveCustomer, dbGetCompletedSale, dbGetCustomer, dbDeleteWorkorder, dbReturnId, dbRequestNewId } from "../../../../db_calls_wrapper";
import { generateIdCallable } from "../../../../db_calls";
import {
  createNewSale,
  updateSaleWithTotals,
  calculateSaleTotals,
  sendSaleReceipt,
  recomputeSaleAmounts,
} from "./newCheckoutUtils";
import { translateSalesReceipt } from "../../../../shared/receiptTranslator";
import { generateSaleReceiptPDF } from "../../../../pdfGenerator";
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
import { SaleTotals, PaymentStatus } from "./SaleTotals";
import { PaymentsList } from "./PaymentsList";
import { WorkorderCombiner } from "./WorkorderCombiner";
import { InventorySearch } from "./InventorySearch";
import { broadcastToDisplay, broadcastClear, DISPLAY_MSG_TYPES } from "../../../../broadcastChannel";
import { InventoryItemModalScreen } from "../InventoryItemModalScreen";
import { NewRefundModalScreen } from "./NewRefundModalScreen";

// DEV FLAG default — toggled via on-screen switch
let _devSkipCompletion = false;

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
  broadcastToDisplay(DISPLAY_MSG_TYPES.SALE, {
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
    <View
      style={{
        position: "absolute",
        top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 200,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "rgba(0,0,0,0.3)",
      }}
    >
      <View
        style={{
          width: 360,
          backgroundColor: C.backgroundWhite,
          borderRadius: 12,
          borderWidth: 2,
          borderColor: C.buttonLightGreenOutline,
          padding: 16,
        }}
      >
        <Text style={{ fontSize: 15, fontWeight: "600", color: C.text, marginBottom: 10 }}>
          {"Adjust " + typeLabel + " Amount"}
        </Text>

        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
          <Text style={{ fontSize: 12, color: C.green }}>Currently applied</Text>
          <Text style={{ fontSize: 12, color: C.green }}>{formatCurrencyDisp(payment.amount, true)}</Text>
        </View>

        {maxAmount !== payment.amount && (
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
            <Text style={{ fontSize: 12, color: gray(0.4) }}>Full amount available</Text>
            <Text style={{ fontSize: 12, color: gray(0.4) }}>{formatCurrencyDisp(maxAmount, true)}</Text>
          </View>
        )}

        <View
          style={{
            flexDirection: "row", alignItems: "center",
            borderColor: C.buttonLightGreenOutline, borderWidth: 1, borderRadius: 7,
            backgroundColor: C.listItemWhite, marginTop: 8, marginBottom: 6,
            paddingHorizontal: 10, height: 40,
          }}
        >
          <Text style={{ fontSize: 16, color: gray(0.4), marginRight: 4 }}>$</Text>
          <TextInput_
            placeholder="0.00"
            placeholderTextColor={gray(0.35)}
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
        </View>

        {isValid && !isUnchanged && (
          <Text style={{ fontSize: 11, color: gray(0.5), marginBottom: 8 }}>
            {formatCurrencyDisp(maxAmount - sAmountCents, true) + " remainder available for future use"}
          </Text>
        )}

        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
          <Button_
            text="Remove From Sale"
            colorGradientArr={COLOR_GRADIENTS.red}
            textStyle={{ color: C.textWhite, fontSize: 12 }}
            buttonStyle={{ height: 32, borderRadius: 5, paddingHorizontal: 10 }}
            onPress={onRemove}
          />
          <View style={{ flexDirection: "row" }}>
            <Button_
              text="Cancel"
              colorGradientArr={COLOR_GRADIENTS.grey}
              textStyle={{ color: C.textWhite, fontSize: 12 }}
              buttonStyle={{ height: 32, borderRadius: 5, paddingHorizontal: 10, marginRight: 8 }}
              onPress={onClose}
            />
            <Button_
              text={isUnchanged ? "No Change" : "Apply"}
              colorGradientArr={isValid && !isUnchanged ? COLOR_GRADIENTS.green : COLOR_GRADIENTS.grey}
              textStyle={{ color: C.textWhite, fontSize: 12 }}
              buttonStyle={{ height: 32, borderRadius: 5, paddingHorizontal: 10, opacity: isValid && !isUnchanged ? 1 : 0.5 }}
              onPress={() => { if (isValid && !isUnchanged) onConfirm(sAmountCents); }}
            />
          </View>
        </View>
      </View>
    </View>
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
  const [sDevSkip, _setDevSkip] = useState(_devSkipCompletion);
  const [sShowRefundModal, _setShowRefundModal] = useState(false);
  const [sRefundPayment, _setRefundPayment] = useState(null);
  const [sSplitDepositPayment, _setSplitDepositPayment] = useState(null);
  const [sExpandedCreditIds, _setExpandedCreditIds] = useState([]);
  const [sTransactions, _setTransactions] = useState([]);   // real payments (cash/card)
  const [sCredits, _setCredits] = useState([]);              // applied credits/deposits/gift cards
  const salePersistedRef = useRef(false);
  const prefetchedTxnIdRef = useRef(null);
  // ─── Derived Values ───────────────────────────────────────
  let isDepositMode = !!zDepositInfo;
  let isStandalone = !zOpenWorkorder?.customerID;
  let saleComplete = sSale?.paymentComplete || false;
  let amountLeftToPay = Math.round((sSale?.total || 0) - (sSale?.amountCaptured || 0));
  if (amountLeftToPay < 0) amountLeftToPay = 0;
  let cashAmountLeftToPay = amountLeftToPay - sCardProcessingAmount;
  if (cashAmountLeftToPay < 0) cashAmountLeftToPay = 0;
  let custFirst = zOpenWorkorder?.customerFirst || zCustomer?.first || "";
  let custLast = zOpenWorkorder?.customerLast || zCustomer?.last || "";
  let custLanguage = zOpenWorkorder?.customerLanguage || zCustomer?.language || "";
  let hasRealPayments = sTransactions.some((t) => {
    let refunded = (t.refunds || []).reduce((s, r) => s + (r.amount || 0), 0);
    return (t.amountCaptured || 0) > refunded;
  }) || sCredits.length > 0;

  // ─── Initialization ──────────────────────────────────────
  // Called once when the modal opens. We use a flag to avoid
  // repeated init without adding a useEffect.
  if (zIsCheckingOut && !sInitialized) {
    _setInitialized(true);
    _setReceiptLanguage(
      Object.keys(CUSTOMER_LANGUAGES).find((k) => CUSTOMER_LANGUAGES[k] === zCustomer?.language) || "english"
    );

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

  function handleTransactionIdUsed() {
    prefetchedTxnIdRef.current = null;
    generateIdCallable({ node: "transactions" }).then((r) => {
      prefetchedTxnIdRef.current = r.data?.id || null;
    }).catch(() => {});
  }

  async function initializeCheckout() {
    let currentUser = useLoginStore.getState().currentUser;
    let createdBy = currentUser?.first
      ? currentUser.first + " " + (currentUser.last || "")
      : "";

    // Fetch fresh customer from DB to ensure deposits/credits are current
    let customerID = zOpenWorkorder?.customerID || zCustomer?.id || "";
    if (customerID) {
      let freshCustomer = await dbGetCustomer(customerID);
      if (freshCustomer) {
        useCurrentCustomerStore.getState().setCustomer(freshCustomer, false);
      }
    }

    // Ensure standalone workorder is persisted to Firestore before creating a sale
    if (zOpenWorkorder && !zOpenWorkorder.customerID) {
      await newCheckoutSaveWorkorder(zOpenWorkorder);
    }

    // Check if workorder has an existing active sale to resume
    if (zOpenWorkorder?.activeSaleID) {
      let existingSale = await readActiveSale(zOpenWorkorder.activeSaleID);
      if (existingSale && !existingSale.voidedByRefund) {
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

        // Load transactions from collection, credits from sale
        let loadedTxns = [];
        if (existingSale.transactionIDs?.length > 0) {
          loadedTxns = (await readTransactions(existingSale.transactionIDs)).filter(Boolean);
        }
        let loadedCredits = existingSale.creditsApplied || [];

        // Reconcile pending transactions (crash recovery)
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
        }

        // Reconcile pending refunds (crash recovery)
        // Transaction docs already contain refund arrays written by the Cloud Function.
        // recomputeSaleAmounts below derives amountCaptured (true net) from loaded transactions.
        if (existingSale.pendingRefundIDs?.length > 0) {
          existingSale.pendingRefundIDs = [];
        }

        _setTransactions(loadedTxns);
        _setCredits(loadedCredits);

        recomputeSaleAmounts(existingSale, loadedTxns, loadedCredits);
        salePersistedRef.current = true;

        // Persist reconciled state (clears pending IDs, updates amounts)
        persistSale(existingSale, loadedTxns, loadedCredits);

        _setSale(existingSale);
        broadcastSaleToDisplay(existingSale, combined, custFirst, custLast, custLanguage);
        fetchReaders();

        // If reconciliation completed the sale, trigger completion
        if (existingSale.paymentComplete) {
          handleSaleComplete(existingSale, loadedTxns, loadedCredits);
        }
        return;
      }
      // Stale or voided activeSaleID — clean up the workorder
      let cleanedWO = cloneDeep(zOpenWorkorder);
      cleanedWO.activeSaleID = "";
      cleanedWO.saleID = "";
      useOpenWorkordersStore.getState().setWorkorder(cleanedWO, true);
    }

    // No existing sale — create a new one and persist immediately
    let saleId = null;
    try {
      let saleResult = await generateIdCallable({ node: "sales" });
      saleId = saleResult.data?.id || null;
    } catch (e) { log("initializeCheckout: sale ID prefetch failed, using fallback", e?.message); }
    let sale = createNewSale(zSettings, createdBy, saleId);

    // Pre-fetch a transaction ID for the first payment
    generateIdCallable({ node: "transactions" }).then((r) => {
      prefetchedTxnIdRef.current = r.data?.id || null;
    }).catch(() => {});

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

    // Fetch card readers
    fetchReaders();
  }

  async function initializeDepositCheckout(depositInfo) {
    let currentUser = useLoginStore.getState().currentUser;
    let createdBy = currentUser?.first
      ? currentUser.first + " " + (currentUser.last || "")
      : "";
    let saleId = null;
    try {
      let saleResult = await generateIdCallable({ node: "sales" });
      saleId = saleResult.data?.id || null;
    } catch (e) { log("initializeDepositCheckout: sale ID prefetch failed", e?.message); }
    let sale = createNewSale(zSettings, createdBy, saleId);

    // Pre-fetch a transaction ID for the first payment
    generateIdCallable({ node: "transactions" }).then((r) => {
      prefetchedTxnIdRef.current = r.data?.id || null;
    }).catch(() => {});

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
    fetchReaders();
  }

  async function initializeFromViewOnlySale(sale) {
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
    let loadedCredits = sale.creditsApplied || [];
    _setTransactions(loadedTxns);
    _setCredits(loadedCredits);

    recomputeSaleAmounts(sale, loadedTxns, loadedCredits);
    _setSale(sale);

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

  // Shared: build a thin sale object and write all transaction docs
  function prepareSaleForPersist(sale, txns, creds) {
    let saleToPersist = { ...sale };
    saleToPersist.creditsApplied = (creds || sCredits).map((c) => {
      let entry = { creditId: c.creditId, amount: c.amount, type: c.type };
      if (c.type !== "credit") entry.transactionId = c.transactionId || "";
      return entry;
    });
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
  function handleToggleWorkorder(wo) {
    // Cannot uncheck primary workorder
    if (wo.id === zOpenWorkorder?.id) return;

    let newArr;
    if (sCombinedWorkorders.find((o) => o.id === wo.id)) {
      // Block unlink if payments exist (transactionIDs is not empty)
      if (sSale?.transactionIDs?.length > 0) return;
      // Removing WO from combined sale — clean up its sale references
      newArr = sCombinedWorkorders.filter((o) => o.id !== wo.id);
      let cleaned = cloneDeep(wo);
      cleaned.activeSaleID = "";
      let _user = useLoginStore.getState().currentUser?.first || "System";
      cleaned.changeLog = [...(cleaned.changeLog || []), { timestamp: Date.now(), user: _user, field: "payment", action: "recorded", from: "", to: "Removed from combined sale" }];
      useOpenWorkordersStore.getState().setWorkorder(cleaned, true);
    } else {
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

    // Recalculate totals
    let updated = updateSaleWithTotals(sSale, newArr, zSettings);
    updated.workorderIDs = newArr.map((o) => o.id);
    _setSale(updated);
    if (salePersistedRef.current) persistSale(updated);
    broadcastSaleToDisplay(updated, newArr, custFirst, custLast, custLanguage);
  }

  function handleWorkorderLineChange(woId, newLines) {
    let newArr = sCombinedWorkorders.map((wo) =>
      wo.id === woId ? { ...wo, workorderLines: newLines } : wo
    );
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
  function handleApplyDeposit(deposit) {
    if (!sSale || sSale.paymentComplete) return;
    let amountNeeded = (sSale.total || 0) - (sSale.amountCaptured || 0);
    if (amountNeeded <= 0) return;

    let isCredit = deposit._type === "credit";
    let appliedAmount = Math.min(deposit.amountCents, amountNeeded);

    // Create a credit entry (not a transaction)
    let credit = {
      creditId: deposit.id,
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
    if (!sDevSkip && !sale.paymentComplete) persistSale(sale, sTransactions, newCredits);
  }

  function handleRemoveDeposit(credit) {
    if (!sSale || sSale.paymentComplete) return;
    if (!credit.type) return;

    // Release reservation on deposit/credit (not consumed yet, just reserved)
    let isCredit = credit.type === "credit";
    let arrKey = isCredit ? "credits" : "deposits";
    let customerArr = cloneDeep(zCustomer?.[arrKey] || []);
    let existing = customerArr.find((d) => d.id === credit.creditId);
    if (existing) {
      existing.reservedCents = Math.max(0, (existing.reservedCents || 0) - credit.amount);
    }
    let updatedCustomer = { ...zCustomer, [arrKey]: customerArr };
    useCurrentCustomerStore.getState().setCustomer(updatedCustomer);
    dbSaveCustomer(updatedCustomer);

    // Remove credit from sCredits
    let newCredits = sCredits.filter((c) => c.creditId !== credit.creditId);
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
      if (!sDevSkip) useOpenWorkordersStore.getState().setWorkorder(updated, true);
      updatedWorkorders.push(updated);
    }
    _setCombinedWorkorders(updatedWorkorders);
  }

  function handleSplitDeposit(credit, newAmountCents) {
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
    log("handleSplitDeposit: credit.amount=", credit.amount, "newAmountCents=", newAmountCents, "difference=", difference, "creditId=", credit.creditId, "zCustomer?.id=", zCustomer?.id);

    // Update the credit in sCredits
    let newCredits = sCredits.map((c) =>
      c.creditId === credit.creditId ? { ...c, amount: newAmountCents } : c
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
    let existing = customerArr.find((d) => d.id === credit.creditId);
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
      if (!sDevSkip) useOpenWorkordersStore.getState().setWorkorder(updated, true);
      updatedWorkorders.push(updated);
    }
    _setCombinedWorkorders(updatedWorkorders);

    _setSplitDepositPayment(null);
  }

  async function handlePrintDepositReceipt(credit) {
    if (!credit._depositSaleID) return;
    let sale = await dbGetCompletedSale(credit._depositSaleID);
    if (!sale) return;
    let settings = useSettingsStore.getState().getSettings();
    let printerID = settings?.selectedPrinterID || "";
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
    let sale = cloneDeep(sSale);
    sale.pendingTransactionIDs = [...(sale.pendingTransactionIDs || []), transactionID];
    _setSale(sale);

    // Persist the pending transaction ID on the sale (already in Firestore)
    if (!sDevSkip) persistSale(sale);
  }

  function handlePaymentCapture(payment) {
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

      // Print receipt after partial cash payment (includes popCashRegister if change is due)
      if (payment.method === "cash") {
        let settings = useSettingsStore.getState().getSettings();
        let printerID = settings?.selectedPrinterID || "";
        if (printerID) {
          let primaryWO = sCombinedWorkorders[0];
          let _noCustomer = !primaryWO?.customerID;
          let customer = (_noCustomer)
            ? { first: zCustomer?.first || "", last: zCustomer?.last || "", customerCell: zCustomer?.customerCell || "", email: zCustomer?.email || "", id: zCustomer?.id || "" }
            : { first: primaryWO.customerFirst || "", last: primaryWO.customerLast || "", customerCell: primaryWO.customerCell || "", email: primaryWO.customerEmail || "", id: primaryWO.customerID || "" };
          let wo = primaryWO || { workorderLines: [], taxFree: false };
          let _ctx = { currentUser: useLoginStore.getState().getCurrentUser(), settings };
          let receipt = printBuilder.sale(sale, [payment], customer, wo, settings?.salesTaxPercent, _ctx);
          receipt.transactionOnly = true;
          dbSavePrintObj(receipt, printerID);
        }
      }
    }

    _setSale(sale);
    broadcastSaleToDisplay(sale, sCombinedWorkorders, custFirst, custLast, custLanguage);

    // Persist immediately (skip if complete — handleSaleComplete handles deletion)
    if (!sDevSkip && !sale.paymentComplete) persistSale(sale, newTransactions, sCredits);
  }

  // Update workorders to track that a sale is in progress
  function updateWorkordersWithPaymentStatus(sale, entry, txns) {
    let user = useLoginStore.getState().currentUser?.first || "System";
    let timestamp = Date.now();
    let isCredit = !!entry.creditId;
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
      if (!sDevSkip) useOpenWorkordersStore.getState().setWorkorder(updated, true);
      updatedWorkorders.push(updated);
    }
    _setCombinedWorkorders(updatedWorkorders);
  }

  async function handleDepositSaleComplete(sale, txns, creds) {
    let localTxns = txns || sTransactions;
    let localCreds = creds || sCredits;
    if (sDevSkip) {
      log("sDevSkip: deposit sale complete locally, skipping DB/print/SMS", sale);
      return;
    }
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

    // Persist all transactions (no completed-sale for deposits/gift cards)
    await writeAllTransactions(localTxns);
    await deleteActiveSale(sale.id);

    // Receipt actions based on settings
    let settings = useSettingsStore.getState().getSettings();
    let printerID = settings?.selectedPrinterID || "";
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
        let translated = await translateSalesReceipt(saleReceipt, langCode);
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
    const smsContent = smsTemplate?.content || smsTemplate?.message || "";
    const emailContent = emailTemplate?.content || emailTemplate?.body || "";
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
    let localTxns = txns || sTransactions;
    let localCreds = creds || sCredits;
    log("handleSaleComplete entered, paymentComplete:", sale.paymentComplete, "isDepositSale:", sale.isDepositSale);
    // Deposit sale — separate completion path
    if (sale.isDepositSale) {
      handleDepositSaleComplete(sale, localTxns, localCreds);
      return;
    }
    // DEV: skip all DB writes, printing, SMS — freeze UI for layout work
    if (sDevSkip) {
      log("sDevSkip: sale complete locally, skipping DB/print/SMS", sale);
      return;
    }
    // Mark all combined workorders as complete
    let settings = useSettingsStore.getState().getSettings();
    let statuses = settings?.statuses || [];
    let user = useLoginStore.getState().currentUser?.first || "System";
    let timestamp = Date.now();

    for (let wo of sCombinedWorkorders) {
      let woToComplete = cloneDeep(wo);
      let oldStatusLabel = resolveStatus(wo.status, statuses)?.label || wo.status || "";
      let newStatusLabel = resolveStatus("finished_and_paid", statuses)?.label || "Finished & Paid";

      woToComplete.paymentComplete = true;
      woToComplete.paidOnMillis = Date.now();
      woToComplete.activeSaleID = "";
      woToComplete.saleID = sale.id;
      woToComplete.status = "finished_and_paid";

      let entries = [];
      if (wo.status !== "finished_and_paid") {
        entries.push({ timestamp, user, field: "status", action: "changed", from: oldStatusLabel, to: newStatusLabel });
      }
      entries.push({ timestamp, user, field: "payment", action: "completed", from: "", to: "Sale completed — " + formatCurrencyDisp(sale.total, true) });
      woToComplete.changeLog = [...(woToComplete.changeLog || []), ...entries];
      woToComplete.endedOnMillis = Date.now();

      await newCheckoutCompleteWorkorder(woToComplete);
      useOpenWorkordersStore.getState().removeWorkorder(woToComplete, false); // remove from local store, don't send DB delete (already archived)
    }
    useTabNamesStore.getState().setInfoTabName(TAB_NAMES.infoTab.customer);
    useTabNamesStore.getState().setOptionsTabName(TAB_NAMES.optionsTab.workorders);

    // Write all transaction docs + completed sale
    let saleToPersist = prepareSaleForPersist(sale, localTxns, localCreds);
    delete saleToPersist.pendingTransactionIDs;
    await Promise.all([writeAllTransactions(localTxns), writeCompletedSale(saleToPersist)]);
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
        let idx = arr.findIndex((d) => d.id === cred.creditId);
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
    const printerID = settings?.selectedPrinterID || "";

    // Build receipt context
    const _ctx = { currentUser: useLoginStore.getState().getCurrentUser(), settings };

    // Build the sale receipt — it computes popCashRegister and cashChangeGiven
    let woForReceipt = primaryWO || { workorderLines: [], taxFree: false };
    let saleReceipt = printBuilder.sale(sale, sTransactions, customerForReceipt, woForReceipt, settings?.salesTaxPercent, _ctx, sCredits);
    log("Receipt object (sale complete):", JSON.stringify(saleReceipt, null, 2));

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

    // Print sale receipt (popCashRegister flag is already on the receipt if change is due)
    if (printerID) {
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
      sendSaleReceipt(sale, customerForReceipt, woForReceipt, settings, canSMS ? smsTemplate : null, canEmail ? emailTemplate : null, translatedReceipt, translatedPdfLabels, langCode, sTransactions, sCredits);
    }
  }

  function handleCashChange(change) {
    _setCashChangeNeeded(prev => prev + change);
  }

  function handlePartialPayment() {
    let remaining = (sSale?.total || 0) - (sSale?.amountCaptured || 0);

    function buildPartialReceipt() {
      const primaryWO = sCombinedWorkorders[0];
      const _noCustomer = !primaryWO?.customerID;
      const customerForReceipt = (!_noCustomer)
        ? { first: primaryWO.customerFirst || "", last: primaryWO.customerLast || "", customerCell: primaryWO.customerCell || "", email: primaryWO.customerEmail || "", id: primaryWO.customerID || "" }
        : { first: zCustomer?.first || "", last: zCustomer?.last || "", customerCell: zCustomer?.customerCell || "", email: zCustomer?.email || "", id: zCustomer?.id || "" };
      const settings = useSettingsStore.getState().getSettings();
      const printerID = settings?.selectedPrinterID || "";
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
          let translated = await translateSalesReceipt(saleReceipt, langCode);
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
        return;
      }

      const canSMS = customerForReceipt.customerCell && smsContent.trim();
      const canEmail = customerForReceipt.email && emailContent.trim();
      if (canSMS || canEmail) {
        sendSaleReceipt(sSale, customerForReceipt, primaryWO, settings, canSMS ? smsTemplate : null, canEmail ? emailTemplate : null, translatedReceipt, translatedPdfLabels, langCode, sTransactions, sCredits);
      }
    }

    function handlePrintPaperOnly() {
      let { saleReceipt, settings, printerID } = buildPartialReceipt();
      saleReceipt.popCashRegister = false;
      dbSavePrintObj(saleReceipt, printerID);
    }

    useAlertScreenStore.getState().setValues({
      showAlert: true,
      fullScreen: true,
      title: "Partial Payment",
      message:
        "Close this sale with a remaining balance of $" +
        formatCurrencyDisp(remaining) +
        "?\nAll payments are saved and you may return at any time",
      alertBoxStyle: { minWidth: "50%" },
      btn1Text: "Exit",
      handleBtn1Press: () => {
        resetAndClose();
      },
      btn2Text: "Print Receipts",
      handleBtn2Press: () => {
        handlePrintReceipts();
        resetAndClose();
      },
      btn3Text: "Print Paper Only",
      handleBtn3Press: () => {
        handlePrintPaperOnly();
        resetAndClose();
      },
      useCancelButton: true,
    });
  }

  // ─── Close Modal ──────────────────────────────────────────
  function closeModal() {
    if (
      (sTransactions.length > 0 || sCredits.length > 0) &&
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
    if (isStandalone) {
      useAlertScreenStore.getState().setValues({
        showAlert: true,
        title: "Clear the sale?",
        message: "Or go back to inventory selections",
        btn1Text: "Clear Sale",
        handleBtn1Press: () => {
          useAlertScreenStore.getState().setValues({ showAlert: false });
          let woStore = useOpenWorkordersStore.getState();
          let oldWoId = woStore.openWorkorderID;
          resetAndClose();
          if (oldWoId) {
            dbDeleteWorkorder(oldWoId);
            woStore.removeWorkorder(oldWoId, false);
          }
          woStore.setOpenWorkorderID(null);
          useTabNamesStore.getState().setItems({
            infoTabName: TAB_NAMES.infoTab.customer,
            itemsTabName: TAB_NAMES.itemsTab.empty,
            optionsTabName: TAB_NAMES.optionsTab.workorders,
          });
        },
        btn2Text: "Choose More Items",
        handleBtn2Press: () => {
          useAlertScreenStore.getState().setValues({ showAlert: false });
          resetAndClose();
        },
      });
      return;
    }
    resetAndClose();
  }

  function resetAndClose() {
    let hasPayments = sTransactions.length > 0 || sCredits.length > 0;
    if (sSale?.id && !hasPayments && salePersistedRef.current) {
      deleteActiveSale(sSale.id);
      dbReturnId("sales", sSale.id);
      for (let wo of sCombinedWorkorders) {
        let cleaned = cloneDeep(wo);
        cleaned.activeSaleID = "";
        useOpenWorkordersStore.getState().setWorkorder(cleaned, true);
      }
    }
    if (prefetchedTxnIdRef.current) {
      dbReturnId("transactions", prefetchedTxnIdRef.current);
      prefetchedTxnIdRef.current = null;
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

  function resetStandaloneWorkorder() {
    let store = useOpenWorkordersStore.getState();
    let oldWo = store.getOpenWorkorder();
    if (oldWo) store.removeWorkorder(oldWo.id);

    let tmpKey = dbRequestNewId("workorders", (realId, tmpKey) => {
      let st = useOpenWorkordersStore.getState();
      let wo = st.workorders.find((w) => String(w._tmpKey) === String(tmpKey));
      if (!wo) return;
      st.removeWorkorder(String(tmpKey), false);
      let updated = { ...wo, id: realId };
      delete updated._tmpKey;
      st.setWorkorder(updated, false);
      if (st.getOpenWorkorderID() === String(tmpKey)) st.setOpenWorkorderID(realId);
    });

    let wo = createNewWorkorder({
      id: String(tmpKey),
      startedByFirst: useLoginStore.getState().currentUser?.first,
      startedByLast: useLoginStore.getState().currentUser?.last,
    });
    wo._tmpKey = tmpKey;
    store.setWorkorder(wo, false);
    store.setOpenWorkorderID(wo.id);
  }

  async function handleReprint() {
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
        let translated = await translateSalesReceipt(toPrint, langCode);
        toPrint = translated.translatedReceipt;
      } catch (e) {
        log("Receipt translation failed on reprint, using English:", e);
      }
    }

    const printerID = zSettings?.selectedPrinterID || "";
    toPrint.popCashRegister = false;
    dbSavePrintObj(toPrint, printerID);
  }

  function handlePrintReceipt(payment) {
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
    let printerID = settings?.selectedPrinterID || "";
    if (printerID) dbSavePrintObj(receipt, printerID);
  }

  function handlePopRegister() {
    let settings = useSettingsStore.getState().getSettings();
    let printObj = { id: crypto.randomUUID(), receiptType: RECEIPT_TYPES.register };
    log("handlePopRegister printObj:", JSON.stringify(printObj));
    dbSavePrintObj(printObj, settings?.selectedPrinterID || "");
    _setShowPopConfirm(true);
    setTimeout(() => _setShowPopConfirm(false), 1000);
  }

  function applyTaxFree(newVal) {
    let note = newVal ? TAX_FREE_RECEIPT_NOTE : "";
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
          {/* Loading overlay */}
          {!sSale && (
            <View
              style={{
                position: "absolute",
                top: 0, left: 0, right: 0, bottom: 0,
                justifyContent: "center",
                alignItems: "center",
                backgroundColor: lightenRGBByPercent(C.backgroundWhite, 35),
                zIndex: 998,
              }}
            >
              <LoadingIndicator />
            </View>
          )}
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
                lockAmount={isDepositMode}
                transactionId={prefetchedTxnIdRef.current}
                onTransactionIdUsed={handleTransactionIdUsed}
              />
              {sCardMode === "manual" ? (
                <CardPayment
                  amountLeftToPay={amountLeftToPay}
                  onPaymentCapture={handlePaymentCapture}
                  onPaymentStarted={handlePaymentStarted}
                  saleComplete={saleComplete}
                  saleID={sSale?.id || ""}
                  customerID={sSale?.customerID || zCustomer?.id || ""}
                  customerEmail={zCustomer?.email || ""}
                  onCardProcessingStart={(amount) => _setCardProcessingAmount(amount)}
                  onCardProcessingEnd={() => _setCardProcessingAmount(0)}
                  onSwitchToReader={() => _setCardMode("reader")}
                  lockAmount={isDepositMode}
                  transactionId={prefetchedTxnIdRef.current}
                  onTransactionIdUsed={handleTransactionIdUsed}
                />
              ) : (
                <CardReaderPayment
                  amountLeftToPay={amountLeftToPay}
                  onPaymentCapture={handlePaymentCapture}
                  onPaymentStarted={handlePaymentStarted}
                    stripeReaders={zStripeReaders}
                    settings={zSettings}
                    saleComplete={saleComplete}
                    readerError={sReaderError}
                    saleID={sSale?.id || ""}
                    customerID={sSale?.customerID || zCustomer?.id || ""}
                    customerEmail={zCustomer?.email || ""}
                    saleSalesTax={sSale?.salesTax || 0}
                    saleTotal={sSale?.total || 0}
                    onCardProcessingStart={(amount) => _setCardProcessingAmount(amount)}
                    onCardProcessingEnd={() => _setCardProcessingAmount(0)}
                    onSwitchToManual={() => _setCardMode("manual")}
                    lockAmount={isDepositMode}
                    transactionId={prefetchedTxnIdRef.current}
                    onTransactionIdUsed={handleTransactionIdUsed}
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

                {/* Deposit info banner */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: C.backgroundListWhite,
                    borderWidth: 1,
                    borderColor: C.orange,
                    borderRadius: 6,
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                    marginTop: 8,
                  }}
                >
                  <Image_
                    source={ICONS.info}
                    style={{ width: 18, height: 18, marginRight: 8, tintColor: C.orange }}
                  />
                  <Text style={{ fontSize: 13, color: C.orange, fontWeight: "500" }}>
                    {sSale?.depositType === "giftcard" ? "Gift card" : "Deposit"} requires full payment - partial payments are not allowed.
                  </Text>
                </View>

                <SaleTotals
                  sale={sSale}
                  cashChangeNeeded={sCashChangeNeeded}
                  settings={zSettings}
                />

                <View style={{ flex: 1, marginTop: 3 }}>
                  <PaymentsList
                    payments={sTransactions}
                    credits={sCredits}
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
                    enabled={saleComplete || !(sTransactions.length > 0 || sCredits.length > 0)}
                    colorGradientArr={COLOR_GRADIENTS.red}
                    text={saleComplete ? "CLOSE" : isStandalone ? "CANCEL SALE" : "CANCEL"}
                    onPress={closeModal}
                    textStyle={{ color: C.textWhite, fontSize: 13 }}
                    buttonStyle={{ width: 80, height: 30, borderRadius: 5, marginRight: 10 }}
                  />
                  {saleComplete && (
                    <Button_
                      colorGradientArr={COLOR_GRADIENTS.greenblue}
                      text="REPRINT"
                      onPress={handleReprint}
                      textStyle={{ color: C.textWhite }}
                      buttonStyle={{ width: 100, borderRadius: 5, marginRight: 10 }}
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
                flex: 1,
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
                      let appliedCreditIds = new Set(sCredits.map((c) => c.creditId));
                      let availableDeposits = (zCustomer?.deposits || []).filter((d) => (d.amountCents - (d.reservedCents || 0)) > 0 && !appliedCreditIds.has(d.id)).map((d) => ({ ...d, amountCents: d.amountCents - (d.reservedCents || 0), _type: d.type === "giftcard" ? "giftcard" : "deposit" }));
                      let availableCredits = (zCustomer?.credits || []).filter((d) => (d.amountCents - (d.reservedCents || 0)) > 0 && !appliedCreditIds.has(d.id)).map((d) => ({ ...d, amountCents: d.amountCents - (d.reservedCents || 0), _type: "credit" }));
                      let allAvailable = [...availableDeposits, ...availableCredits];
                let saleComplete = sSale?.paymentComplete;
                      if (allAvailable.length === 0 || saleComplete) return null;
                return (
                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: C.buttonLightGreenOutline,
                      borderRadius: 6,
                      backgroundColor: "#FFFACD",
                      marginTop: 5,
                      paddingHorizontal: 8,
                      paddingVertical: 5,
                    }}
                  >
                    <View style={{ borderRadius: 4, paddingVertical: 4, paddingHorizontal: 8, marginBottom: 5 }}>
                      <Text style={{ fontSize: 13, fontWeight: Fonts.weight.textHeavy, color: C.text }}>DEPOSITS, CREDITS & GIFT CARDS</Text>
                    </View>
                    {allAvailable.map((item) => {
                      let isCredit = item._type === "credit";
                      let isGiftCard = item._type === "giftcard";
                      let badgeColor = isGiftCard ? C.orange : isCredit ? C.blue : C.green;
                      let noteText = item.note || item.text || "";
                      let isExpanded = sExpandedCreditIds.includes(item.id);
                      return (
                        <View key={item.id} style={{ paddingVertical: 4 }}>
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                            }}
                          >
                            <CheckBox_
                              text=""
                              isChecked={false}
                              onCheck={() => handleApplyDeposit(item)}
                              buttonStyle={{ marginRight: 6 }}
                              iconSize={20}
                            />
                            <View
                              style={{
                                backgroundColor: lightenRGBByPercent(badgeColor, 70),
                                paddingHorizontal: 7,
                                paddingVertical: 2,
                                borderRadius: 6,
                                marginRight: 8,
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 13,
                                  fontWeight: "600",
                                  color: badgeColor,
                                }}
                              >
                                {isGiftCard ? "Gift Card" : isCredit ? "Credit" : "Deposit"}
                              </Text>
                            </View>
                            <Text style={{ fontSize: 16, fontWeight: "600", color: C.text, marginRight: 8 }}>
                              {"$" + formatCurrencyDisp(item.amountCents)}
                            </Text>
                            {(item.reservedCents || 0) > 0 && (
                              <Text style={{ fontSize: 11, color: C.orange, fontWeight: "600", marginRight: 8 }}>
                                {"$" + formatCurrencyDisp(item.reservedCents) + "/$" + formatCurrencyDisp(item.amountCents + item.reservedCents) + (item.amountCents <= 0 ? " Used" : " In use")}
                              </Text>
                            )}
                            {!isCredit && !isGiftCard && !!noteText && (
                              <Text numberOfLines={1} style={{ fontSize: 13, color: gray(0.5), flex: 1 }}>
                                {noteText}
                              </Text>
                            )}
                            {isCredit && !!noteText && (
                              <Text
                                onPress={() => {
                                  _setExpandedCreditIds(isExpanded
                                    ? sExpandedCreditIds.filter((id) => id !== item.id)
                                    : [...sExpandedCreditIds, item.id]
                                  );
                                }}
                                style={{ fontSize: 12, color: C.blue, fontWeight: "600" }}
                              >
                                {"Reason " + (isExpanded ? "▾" : "▸")}
                              </Text>
                            )}
                          </View>
                          {isCredit && isExpanded && !!noteText && (
                            <Text style={{ fontSize: 13, color: gray(0.5), marginLeft: 34, marginTop: 2 }}>
                              {noteText}
                            </Text>
                          )}
                        </View>
                      );
                    })}
                  </View>
                );
              })()}

              {/* Sale Totals (includes Amount Left To Pay + Change) */}
              <SaleTotals
                sale={sSale}
                cashChangeNeeded={sCashChangeNeeded}
                settings={zSettings}
              />

                    {/* Payments container */}
              <View
                style={{
                        flexShrink: 1,
                }}
              >
                <ScrollView style={{ flexShrink: 1 }}>
                      <PaymentsList
                          payments={sTransactions}
                          credits={sCredits}
                  onRefund={(payment) => { _setRefundPayment(payment); _setShowRefundModal(true); }}
                  onPrintReceipt={handlePrintReceipt}
                  onPrintDepositReceipt={handlePrintDepositReceipt}
                  onRemoveDeposit={!saleComplete ? (credit) => _setSplitDepositPayment(credit) : null}
                />
                </ScrollView>

                      {!!sSplitDepositPayment && (() => {
                        let isCredit = sSplitDepositPayment.type === "credit";
                        let customerArr = isCredit ? (zCustomer?.credits || []) : (zCustomer?.deposits || []);
                        let customerRemaining = customerArr
                          .filter((d) => d.id === sSplitDepositPayment.creditId)
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

              </View>

              <View style={{ flex: 1 }} />

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
                        borderRadius: 5,
                        paddingVertical: 4,
                  paddingHorizontal: 3,
                  marginTop: 5
                }}
              >
                {/* Tax-Free & Receipt Language */}

                      {sCombinedWorkorders.length > 0 && !saleComplete && !(sTransactions.length > 0 || sCredits.length > 0) && (
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
                      {!saleComplete && hasRealPayments && (
                  <Button_
                          colorGradientArr={COLOR_GRADIENTS.red}
                          text="EXIT PARTIAL PAYMENT"
                    onPress={handlePartialPayment}
                    textStyle={{ color: C.textWhite, fontSize: 13 }}
                          buttonStyle={{ height: 35, borderRadius: 5 }}
                  />
                )}
                      {(saleComplete || !hasRealPayments) && (
                        <Button_
                          colorGradientArr={COLOR_GRADIENTS.red}
                          text={saleComplete ? "CLOSE" : isStandalone ? "CANCEL SALE" : "CLOSE CHECKOUT"}
                          onPress={closeModal}
                          textStyle={{ color: C.textWhite, fontSize: 13 }}
                          buttonStyle={{ height: 30, borderRadius: 5 }}
                        />
                      )}
                {saleComplete && (
                  <Button_
                    colorGradientArr={COLOR_GRADIENTS.greenblue}
                    text="REPRINT"
                    onPress={handleReprint}
                    textStyle={{ color: C.textWhite }}
                          buttonStyle={{ width: 100, borderRadius: 5 }}
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
                      <View style={{ marginTop: 15 }} />
                      {(
                  <WorkorderCombiner
                    combinedWorkorders={sCombinedWorkorders}
                    otherCustomerWorkorders={getOtherCustomerWorkorders()}
                    onToggle={handleToggleWorkorder}
                    onLineChange={handleWorkorderLineChange}
                    primaryWorkorderID={zOpenWorkorder?.id}
                          saleHasPayments={hasRealPayments}
                    salesTaxPercent={zSettings?.salesTaxPercent || 0}
                          saleTotal={sSale?.total || 0}
                          amountCaptured={sSale?.amountCaptured || 0}
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
        sale={prepareSaleForPersist(sSale)}
        transactions={sTransactions}
        initialPayment={sRefundPayment}
        onClose={() => { _setShowRefundModal(false); _setRefundPayment(null); }}
        onSaleUpdated={(updatedSale, updatedTransactions) => {
          if (updatedSale?.voidedByRefund) {
            // Sale was fully voided - reset to fresh sale from workorders
            let currentUser = useLoginStore.getState().currentUser;
            let createdBy = currentUser?.first ? currentUser.first + " " + (currentUser.last || "") : "";
            let freshSale = createNewSale(zSettings, createdBy);
            if (sCombinedWorkorders.length > 0) {
              freshSale.customerID = sCombinedWorkorders[0]?.customerID || "";
              freshSale = updateSaleWithTotals(freshSale, sCombinedWorkorders, zSettings);
              freshSale.workorderIDs = sCombinedWorkorders.map((w) => w.id);
            }
            _setSale(freshSale);
            _setTransactions([]);
            _setCredits([]);
            salePersistedRef.current = false;
          } else {
            _setSale(updatedSale);
            if (updatedTransactions) _setTransactions(updatedTransactions);
          }
        }}
      />
    )}
  </>
  );
}

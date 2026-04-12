import { httpsCallable } from "firebase/functions";
import {
  firestoreWrite,
  firestoreRead,
  firestoreDelete,
  firestoreSubscribe,
  firestoreQuery,
  firestoreBatchWrite,
  firestoreCount,
} from "../../../../db_calls";
import { useSettingsStore, useOpenWorkordersStore } from "../../../../stores";
import { log, generateEAN13Barcode } from "../../../../utils";
import { ITEM_SALE_PROTO, CUSTOMER_DEPOSIT_PROTO } from "../../../../data";
import { recomputeSaleAmounts, getAllAppliedCredits } from "./newCheckoutUtils";
import { cloneDeep } from "lodash";
import { dlog, DCAT } from "./checkoutDebugLog";

// ─── Callable Function References ─────────────────────────────
// These are lazily initialized to avoid import-order issues with
// the Firebase functions instance.

let _functions = null;
async function getFunctionsInstance() {
  if (!_functions) {
    const { FUNCTIONS } = await import("../../../../db_calls");
    _functions = FUNCTIONS;
  }
  return _functions;
}

let _newCheckoutInitiatePaymentIntentCallable = null;
let _newCheckoutCreatePaymentIntentCallable = null;
let _newCheckoutCancelPaymentCallable = null;
let _newCheckoutProcessRefundCallable = null;
let _newCheckoutGetAvailableReadersCallable = null;
let _newCheckoutManualCardPaymentCallable = null;

async function getCallables() {
  if (!_newCheckoutInitiatePaymentIntentCallable) {
    const fns = await getFunctionsInstance();
    _newCheckoutInitiatePaymentIntentCallable = httpsCallable(fns, "newCheckoutInitiatePaymentIntentCallable");
    _newCheckoutCreatePaymentIntentCallable = httpsCallable(fns, "newCheckoutCreatePaymentIntentCallable");
    _newCheckoutCancelPaymentCallable = httpsCallable(fns, "newCheckoutCancelPaymentCallable");
    _newCheckoutProcessRefundCallable = httpsCallable(fns, "newCheckoutProcessRefundCallable");
    _newCheckoutGetAvailableReadersCallable = httpsCallable(fns, "newCheckoutGetAvailableReadersCallable");
    _newCheckoutManualCardPaymentCallable = httpsCallable(fns, "newCheckoutManualCardPaymentCallable");
  }
  return {
    initiatePayment: _newCheckoutInitiatePaymentIntentCallable,
    createPaymentIntent: _newCheckoutCreatePaymentIntentCallable,
    cancelPayment: _newCheckoutCancelPaymentCallable,
    processRefund: _newCheckoutProcessRefundCallable,
    getReaders: _newCheckoutGetAvailableReadersCallable,
    manualCardPayment: _newCheckoutManualCardPaymentCallable,
  };
}

// ─── Tenant/Store ─────────────────────────────────────────────

function getTenantAndStore() {
  const settings = useSettingsStore.getState().settings;
  return {
    tenantID: settings?.tenantID,
    storeID: settings?.storeID,
  };
}

// ─── Path Builders ────────────────────────────────────────────

function buildActiveSalePath(tenantID, storeID, saleID) {
  return `tenants/${tenantID}/stores/${storeID}/active-sales/${saleID}`;
}

function buildWorkorderPath(tenantID, storeID, workorderID) {
  return `tenants/${tenantID}/stores/${storeID}/open-workorders/${workorderID}`;
}

function buildCompletedWorkorderPath(tenantID, storeID, workorderID) {
  return `tenants/${tenantID}/stores/${storeID}/completed-workorders/${workorderID}`;
}

function buildPaymentUpdatesPath(tenantID, storeID, readerID, paymentIntentID) {
  return `tenants/${tenantID}/stores/${storeID}/payment-processing/${readerID}/payments/${paymentIntentID}/updates/current`;
}

function buildPaymentCompletionsPath(tenantID, storeID, readerID, paymentIntentID) {
  return `tenants/${tenantID}/stores/${storeID}/payment-processing/${readerID}/payments/${paymentIntentID}/completions/current`;
}

function buildTransactionPath(tenantID, storeID, txnID) {
  return `tenants/${tenantID}/stores/${storeID}/transactions/${txnID}`;
}

function buildCompletedSalePath(tenantID, storeID, saleID) {
  return `tenants/${tenantID}/stores/${storeID}/completed-sales/${saleID}`;
}

// ─── Transactions (Firestore) ────────────────────────────────

export async function writeTransaction(transaction) {
  dlog(DCAT.FIREBASE_REQ, "writeTransaction", "FirebaseCalls", { transactionId: transaction?.id, method: transaction?.method, amount: transaction?.amountCaptured });
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID || !transaction?.id) {
      log("writeTransaction: missing tenantID/storeID/transaction.id");
      dlog(DCAT.FIREBASE_ERR, "writeTransaction", "FirebaseCalls", { reason: "missing params" });
      return { success: false };
    }
    const path = buildTransactionPath(tenantID, storeID, transaction.id);
    await firestoreWrite(path, transaction);
    dlog(DCAT.FIREBASE_RES, "writeTransaction", "FirebaseCalls", { success: true, path });
    return { success: true };
  } catch (error) {
    log("writeTransaction error:", error);
    dlog(DCAT.FIREBASE_ERR, "writeTransaction", "FirebaseCalls", { message: error?.message });
    return { success: false, error };
  }
}

export async function readTransaction(txnID) {
  dlog(DCAT.FIREBASE_REQ, "readTransaction", "FirebaseCalls", { txnID });
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID || !txnID) {
      log("readTransaction: missing tenantID/storeID/txnID");
      dlog(DCAT.FIREBASE_ERR, "readTransaction", "FirebaseCalls", { reason: "missing params" });
      return null;
    }
    const path = buildTransactionPath(tenantID, storeID, txnID);
    const result = await firestoreRead(path);
    dlog(DCAT.FIREBASE_RES, "readTransaction", "FirebaseCalls", { txnID, found: !!result });
    return result;
  } catch (error) {
    log("readTransaction error:", error);
    dlog(DCAT.FIREBASE_ERR, "readTransaction", "FirebaseCalls", { txnID, message: error?.message });
    return null;
  }
}

export async function readTransactions(txnIDs) {
  dlog(DCAT.FIREBASE_REQ, "readTransactions", "FirebaseCalls", { count: txnIDs?.length });
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID || !txnIDs?.length) return [];
    const results = await Promise.all(
      txnIDs.map((txnID) => {
        const path = buildTransactionPath(tenantID, storeID, txnID);
        return firestoreRead(path);
      })
    );
    const filtered = results.filter(Boolean);
    dlog(DCAT.FIREBASE_RES, "readTransactions", "FirebaseCalls", { requested: txnIDs.length, found: filtered.length });
    return filtered;
  } catch (error) {
    log("readTransactions error:", error);
    dlog(DCAT.FIREBASE_ERR, "readTransactions", "FirebaseCalls", { message: error?.message });
    return [];
  }
}

export async function deleteTransaction(txnID) {
  dlog(DCAT.FIREBASE_REQ, "deleteTransaction", "FirebaseCalls", { txnID });
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID || !txnID) {
      log("deleteTransaction: missing tenantID/storeID/txnID");
      dlog(DCAT.FIREBASE_ERR, "deleteTransaction", "FirebaseCalls", { reason: "missing params" });
      return { success: false };
    }
    const path = buildTransactionPath(tenantID, storeID, txnID);
    await firestoreDelete(path);
    dlog(DCAT.FIREBASE_RES, "deleteTransaction", "FirebaseCalls", { success: true, path });
    return { success: true };
  } catch (error) {
    log("deleteTransaction error:", error);
    dlog(DCAT.FIREBASE_ERR, "deleteTransaction", "FirebaseCalls", { message: error?.message });
    return { success: false, error };
  }
}

// ─── Thin Sale (Firestore) ───────────────────────────────────

export async function writeActiveSale(sale) {
  dlog(DCAT.FIREBASE_REQ, "writeActiveSale", "FirebaseCalls", { saleId: sale?.id, total: sale?.total, paymentComplete: sale?.paymentComplete });
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID || !sale?.id) {
      log("writeActiveSale: missing tenantID/storeID/sale.id");
      dlog(DCAT.FIREBASE_ERR, "writeActiveSale", "FirebaseCalls", { reason: "missing params" });
      return { success: false };
    }
    const path = buildActiveSalePath(tenantID, storeID, sale.id);
    await firestoreWrite(path, sale);
    dlog(DCAT.FIREBASE_RES, "writeActiveSale", "FirebaseCalls", { success: true, path });
    return { success: true };
  } catch (error) {
    log("writeActiveSale error:", error);
    dlog(DCAT.FIREBASE_ERR, "writeActiveSale", "FirebaseCalls", { message: error?.message });
    return { success: false, error };
  }
}

export async function readActiveSale(saleID) {
  dlog(DCAT.FIREBASE_REQ, "readActiveSale", "FirebaseCalls", { saleID });
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID || !saleID) {
      log("readActiveSale: missing tenantID/storeID/saleID");
      dlog(DCAT.FIREBASE_ERR, "readActiveSale", "FirebaseCalls", { reason: "missing params" });
      return null;
    }
    const path = buildActiveSalePath(tenantID, storeID, saleID);
    const result = await firestoreRead(path);
    dlog(DCAT.FIREBASE_RES, "readActiveSale", "FirebaseCalls", { saleID, found: !!result });
    return result;
  } catch (error) {
    log("readActiveSale error:", error);
    dlog(DCAT.FIREBASE_ERR, "readActiveSale", "FirebaseCalls", { saleID, message: error?.message });
    return null;
  }
}

export async function deleteActiveSale(saleID) {
  dlog(DCAT.FIREBASE_REQ, "deleteActiveSale", "FirebaseCalls", { saleID });
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID || !saleID) {
      log("deleteActiveSale: missing tenantID/storeID/saleID");
      dlog(DCAT.FIREBASE_ERR, "deleteActiveSale", "FirebaseCalls", { reason: "missing params" });
      return { success: false };
    }
    const path = buildActiveSalePath(tenantID, storeID, saleID);
    await firestoreDelete(path);
    dlog(DCAT.FIREBASE_RES, "deleteActiveSale", "FirebaseCalls", { success: true, path });
    return { success: true };
  } catch (error) {
    log("deleteActiveSale error:", error);
    dlog(DCAT.FIREBASE_ERR, "deleteActiveSale", "FirebaseCalls", { message: error?.message });
    return { success: false, error };
  }
}

export async function writeCompletedSale(sale) {
  dlog(DCAT.FIREBASE_REQ, "writeCompletedSale", "FirebaseCalls", { saleId: sale?.id, total: sale?.total, paymentComplete: sale?.paymentComplete });
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID || !sale?.id) {
      log("writeCompletedSale: missing tenantID/storeID/sale.id");
      dlog(DCAT.FIREBASE_ERR, "writeCompletedSale", "FirebaseCalls", { reason: "missing params" });
      return { success: false };
    }
    const path = buildCompletedSalePath(tenantID, storeID, sale.id);
    await firestoreWrite(path, sale);
    dlog(DCAT.FIREBASE_RES, "writeCompletedSale", "FirebaseCalls", { success: true, path });
    return { success: true };
  } catch (error) {
    log("writeCompletedSale error:", error);
    dlog(DCAT.FIREBASE_ERR, "writeCompletedSale", "FirebaseCalls", { message: error?.message });
    return { success: false, error };
  }
}

export async function readCompletedSale(saleID) {
  dlog(DCAT.FIREBASE_REQ, "readCompletedSale", "FirebaseCalls", { saleID });
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID || !saleID) {
      log("readCompletedSale: missing tenantID/storeID/saleID");
      dlog(DCAT.FIREBASE_ERR, "readCompletedSale", "FirebaseCalls", { reason: "missing params" });
      return null;
    }
    const path = buildCompletedSalePath(tenantID, storeID, saleID);
    const result = await firestoreRead(path);
    dlog(DCAT.FIREBASE_RES, "readCompletedSale", "FirebaseCalls", { saleID, found: !!result });
    return result;
  } catch (error) {
    log("readCompletedSale error:", error);
    dlog(DCAT.FIREBASE_ERR, "readCompletedSale", "FirebaseCalls", { saleID, message: error?.message });
    return null;
  }
}

// ─── Find Sale by Transaction ID ─────────────────────────────

export async function findSaleByTransactionID(transactionID) {
  dlog(DCAT.FIREBASE_REQ, "findSaleByTransactionID", "FirebaseCalls", { transactionID });
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID || !transactionID) {
      log("findSaleByTransactionID: missing tenantID/storeID/transactionID");
      dlog(DCAT.FIREBASE_ERR, "findSaleByTransactionID", "FirebaseCalls", { reason: "missing params" });
      return null;
    }
    // Check completed-sales first
    const completedPath = `tenants/${tenantID}/stores/${storeID}/completed-sales`;
    let results = await firestoreQuery(completedPath, [
      { field: "transactionIDs", operator: "array-contains", value: transactionID },
    ], { limit: 1 });
    if (results?.length > 0) {
      dlog(DCAT.FIREBASE_RES, "findSaleByTransactionID", "FirebaseCalls", { transactionID, foundIn: "completed-sales", saleId: results[0]?.id });
      return results[0];
    }
    // Fallback to active-sales
    const activePath = `tenants/${tenantID}/stores/${storeID}/active-sales`;
    results = await firestoreQuery(activePath, [
      { field: "transactionIDs", operator: "array-contains", value: transactionID },
    ], { limit: 1 });
    if (results?.length > 0) {
      dlog(DCAT.FIREBASE_RES, "findSaleByTransactionID", "FirebaseCalls", { transactionID, foundIn: "active-sales", saleId: results[0]?.id });
      return results[0];
    }
    dlog(DCAT.FIREBASE_RES, "findSaleByTransactionID", "FirebaseCalls", { transactionID, found: false });
    return null;
  } catch (error) {
    log("findSaleByTransactionID error:", error);
    dlog(DCAT.FIREBASE_ERR, "findSaleByTransactionID", "FirebaseCalls", { transactionID, message: error?.message });
    return null;
  }
}

// ─── Cash Refund (Firestore) ─────────────────────────────────

export async function writeCashRefund(transactionID, refundObj) {
  dlog(DCAT.FIREBASE_REQ, "writeCashRefund", "FirebaseCalls", { transactionID, refundAmount: refundObj?.amount, refundId: refundObj?.id });
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID || !transactionID || !refundObj) {
      log("writeCashRefund: missing tenantID/storeID/transactionID/refundObj");
      dlog(DCAT.FIREBASE_ERR, "writeCashRefund", "FirebaseCalls", { reason: "missing params" });
      return { success: false };
    }
    const path = buildTransactionPath(tenantID, storeID, transactionID);
    const transaction = await firestoreRead(path);
    if (!transaction) {
      log("writeCashRefund: transaction not found");
      dlog(DCAT.FIREBASE_ERR, "writeCashRefund", "FirebaseCalls", { reason: "transaction not found", transactionID });
      return { success: false };
    }
    const refunds = transaction.refunds || [];
    refunds.push(refundObj);
    await firestoreWrite(path, { ...transaction, refunds });
    dlog(DCAT.FIREBASE_RES, "writeCashRefund", "FirebaseCalls", { success: true, transactionID, totalRefunds: refunds.length });
    return { success: true };
  } catch (error) {
    log("writeCashRefund error:", error);
    dlog(DCAT.FIREBASE_ERR, "writeCashRefund", "FirebaseCalls", { message: error?.message });
    return { success: false, error };
  }
}

// ─── Workorders ───────────────────────────────────────────────

export async function newCheckoutSaveWorkorder(workorder) {
  dlog(DCAT.FIREBASE_REQ, "newCheckoutSaveWorkorder", "FirebaseCalls", { workorderId: workorder?.id });
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID || !workorder?.id) {
      log("newCheckoutSaveWorkorder: missing tenantID/storeID/workorder.id");
      dlog(DCAT.FIREBASE_ERR, "newCheckoutSaveWorkorder", "FirebaseCalls", { reason: "missing params" });
      return { success: false };
    }
    const path = buildWorkorderPath(tenantID, storeID, workorder.id);
    await firestoreWrite(path, workorder);
    dlog(DCAT.FIREBASE_RES, "newCheckoutSaveWorkorder", "FirebaseCalls", { success: true, path });
    return { success: true };
  } catch (error) {
    log("newCheckoutSaveWorkorder error:", error);
    dlog(DCAT.FIREBASE_ERR, "newCheckoutSaveWorkorder", "FirebaseCalls", { message: error?.message });
    return { success: false, error };
  }
}

export async function newCheckoutCompleteWorkorder(workorder) {
  dlog(DCAT.FIREBASE_REQ, "newCheckoutCompleteWorkorder", "FirebaseCalls", { workorderId: workorder?.id });
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID || !workorder?.id) {
      log("newCheckoutCompleteWorkorder: missing tenantID/storeID/workorder.id");
      dlog(DCAT.FIREBASE_ERR, "newCheckoutCompleteWorkorder", "FirebaseCalls", { reason: "missing params" });
      return { success: false };
    }

    // Write to completed-workorders in Firestore
    const completedPath = buildCompletedWorkorderPath(tenantID, storeID, workorder.id);
    await firestoreWrite(completedPath, workorder);
    dlog(DCAT.FIREBASE_RES, "newCheckoutCompleteWorkorder_write", "FirebaseCalls", { completedPath });

    // Delete from open-workorders
    const openPath = buildWorkorderPath(tenantID, storeID, workorder.id);
    await firestoreDelete(openPath);
    dlog(DCAT.FIREBASE_RES, "newCheckoutCompleteWorkorder_delete", "FirebaseCalls", { openPath });

    return { success: true };
  } catch (error) {
    log("newCheckoutCompleteWorkorder error:", error);
    dlog(DCAT.FIREBASE_ERR, "newCheckoutCompleteWorkorder", "FirebaseCalls", { message: error?.message });
    return { success: false, error };
  }
}

export async function newCheckoutUpdateCompletedWorkorder(workorder) {
  dlog(DCAT.FIREBASE_REQ, "newCheckoutUpdateCompletedWorkorder", "FirebaseCalls", { workorderId: workorder?.id });
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID || !workorder?.id) {
      log("newCheckoutUpdateCompletedWorkorder: missing tenantID/storeID/workorder.id");
      dlog(DCAT.FIREBASE_ERR, "newCheckoutUpdateCompletedWorkorder", "FirebaseCalls", { reason: "missing params" });
      return { success: false };
    }
    const path = buildCompletedWorkorderPath(tenantID, storeID, workorder.id);
    await firestoreWrite(path, workorder);
    dlog(DCAT.FIREBASE_RES, "newCheckoutUpdateCompletedWorkorder", "FirebaseCalls", { success: true, path });
    return { success: true };
  } catch (error) {
    log("newCheckoutUpdateCompletedWorkorder error:", error);
    dlog(DCAT.FIREBASE_ERR, "newCheckoutUpdateCompletedWorkorder", "FirebaseCalls", { message: error?.message });
    return { success: false, error };
  }
}

export async function newCheckoutFetchWorkordersForSale(workorderIDs) {
  dlog(DCAT.FIREBASE_REQ, "newCheckoutFetchWorkordersForSale", "FirebaseCalls", { count: workorderIDs?.length, ids: workorderIDs });
  if (!workorderIDs || workorderIDs.length === 0) return [];

  // Check local store first (always has fresh open workorders)
  const openWorkorders = useOpenWorkordersStore.getState().getWorkorders() || [];

  const { tenantID, storeID } = getTenantAndStore();

  let workorders = [];
  let localCount = 0;
  let fetchedCount = 0;
  for (let i = 0; i < workorderIDs.length; i++) {
    let woID = workorderIDs[i];

    // Local store lookup — no network call
    let localMatch = openWorkorders.find((w) => w.id === woID);
    if (localMatch) {
      workorders.push(localMatch);
      localCount++;
      continue;
    }

    // Not in local store — must be completed, fetch from Firestore
    if (!tenantID || !storeID) continue;
    try {
      const completedPath = buildCompletedWorkorderPath(tenantID, storeID, woID);
      let wo = await firestoreRead(completedPath);
      if (wo) { workorders.push(wo); fetchedCount++; }
    } catch (error) {
      log("newCheckoutFetchWorkordersForSale error for " + woID, error);
      dlog(DCAT.FIREBASE_ERR, "newCheckoutFetchWorkordersForSale", "FirebaseCalls", { woID, message: error?.message });
    }
  }
  dlog(DCAT.FIREBASE_RES, "newCheckoutFetchWorkordersForSale", "FirebaseCalls", { total: workorders.length, fromLocal: localCount, fromFirestore: fetchedCount });
  return workorders;
}

// ─── Payment Listener (Firestore Real-time) ───────────────────

export function newCheckoutListenToPaymentUpdates(readerID, paymentIntentID, onUpdate) {
  dlog(DCAT.LISTENER, "subscribe", "FirebaseCalls", { readerID, paymentIntentID });
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID || !readerID || !paymentIntentID) {
      log("newCheckoutListenToPaymentUpdates: missing required params — tenantID:", tenantID, "storeID:", storeID, "readerID:", readerID, "piID:", paymentIntentID);
      dlog(DCAT.FIREBASE_ERR, "listenToPaymentUpdates", "FirebaseCalls", { reason: "missing params" });
      return null;
    }

    const updatesPath = buildPaymentUpdatesPath(tenantID, storeID, readerID, paymentIntentID);
    log("newCheckoutListenToPaymentUpdates: subscribing to", updatesPath);
    dlog(DCAT.LISTENER, "subscribing", "FirebaseCalls", { path: updatesPath });

    const unsubscribe = firestoreSubscribe(updatesPath, (data, error) => {
      if (error) {
        log("Payment updates listener error:", error);
        dlog(DCAT.LISTENER_DATA, "paymentUpdate_error", "FirebaseCalls", { message: error?.message });
        return;
      }
      dlog(DCAT.LISTENER_DATA, "paymentUpdate", "FirebaseCalls", { status: data?.status, action: data?.action, amount: data?.amount_captured });
      if (onUpdate) onUpdate(data);
    });

    return {
      unsubscribe: () => {
        dlog(DCAT.LISTENER, "unsubscribe", "FirebaseCalls", { readerID, paymentIntentID });
        if (unsubscribe) unsubscribe();
      },
    };
  } catch (error) {
    log("newCheckoutListenToPaymentUpdates error:", error);
    dlog(DCAT.FIREBASE_ERR, "listenToPaymentUpdates", "FirebaseCalls", { message: error?.message });
    return null;
  }
}

// ─── Stripe Callable Wrappers ─────────────────────────────────

export async function newCheckoutProcessStripePayment(amount, readerID, paymentIntentID, saleID, customerID, customerEmail, transactionID, salesTax) {
  dlog(DCAT.STRIPE_REQ, "processStripePayment", "FirebaseCalls", { amount, readerID, saleID, transactionID, salesTax });
  try {
    const { tenantID, storeID } = getTenantAndStore();
    const callables = await getCallables();
    const result = await callables.initiatePayment({
      amount: Number(amount),
      readerID,
      paymentIntentID: paymentIntentID || null,
      tenantID,
      storeID,
      saleID: saleID || "",
      customerID: customerID || "",
      customerEmail: customerEmail || "",
      transactionID: transactionID || "",
      salesTax: salesTax || 0,
    });
    log("newCheckout payment initiated:", result.data);
    dlog(DCAT.STRIPE_RES, "processStripePayment", "FirebaseCalls", { success: true, paymentIntentID: result.data?.paymentIntentID });
    return result.data;
  } catch (error) {
    log("newCheckoutProcessStripePayment error:", error);
    dlog(DCAT.STRIPE_ERR, "processStripePayment", "FirebaseCalls", { message: error?.message, code: error?.code });
    throw error;
  }
}

/**
 * Creates a PaymentIntent and returns clientSecret for client-driven Terminal SDK flow.
 * Does NOT send the PI to a reader — the client SDK handles reader interaction directly.
 */
export async function newCheckoutCreatePaymentIntent(amount, saleID, customerID, customerEmail, transactionID, salesTax) {
  dlog(DCAT.STRIPE_REQ, "createPaymentIntent", "FirebaseCalls", { amount, saleID, transactionID, salesTax });
  try {
    const { tenantID, storeID } = getTenantAndStore();
    const callables = await getCallables();
    const result = await callables.createPaymentIntent({
      amount: Number(amount),
      tenantID,
      storeID,
      saleID: saleID || "",
      customerID: customerID || "",
      customerEmail: customerEmail || "",
      transactionID: transactionID || "",
      salesTax: salesTax || 0,
    });
    log("newCheckout payment intent created (client-driven):", result.data);
    dlog(DCAT.STRIPE_RES, "createPaymentIntent", "FirebaseCalls", { success: true, paymentIntentID: result.data?.data?.paymentIntentID });
    return result.data;
  } catch (error) {
    log("newCheckoutCreatePaymentIntent error:", error);
    dlog(DCAT.STRIPE_ERR, "createPaymentIntent", "FirebaseCalls", { message: error?.message, code: error?.code });
    throw error;
  }
}

export async function newCheckoutCancelStripePayment(readerID) {
  dlog(DCAT.STRIPE_REQ, "cancelStripePayment", "FirebaseCalls", { readerID });
  try {
    const callables = await getCallables();
    const result = await callables.cancelPayment({ readerID });
    log("newCheckout payment cancelled:", result.data);
    dlog(DCAT.STRIPE_RES, "cancelStripePayment", "FirebaseCalls", { success: true });
    return result.data;
  } catch (error) {
    log("newCheckoutCancelStripePayment error:", error);
    dlog(DCAT.STRIPE_ERR, "cancelStripePayment", "FirebaseCalls", { message: error?.message, code: error?.code });
    throw error;
  }
}

export async function newCheckoutProcessStripeRefund(amount, chargeID, transactionFields) {
  dlog(DCAT.STRIPE_REQ, "processStripeRefund", "FirebaseCalls", { amount, chargeID, transactionID: transactionFields?.transactionID });
  try {
    const callables = await getCallables();
    const result = await callables.processRefund({
      amount: Number(amount),
      chargeID,
      ...(transactionFields || {}),
    });
    log("newCheckout refund processed:", result.data);
    dlog(DCAT.STRIPE_RES, "processStripeRefund", "FirebaseCalls", { success: true, refundID: result.data?.refundID });
    return result.data;
  } catch (error) {
    log("newCheckoutProcessStripeRefund error:", error);
    dlog(DCAT.STRIPE_ERR, "processStripeRefund", "FirebaseCalls", { message: error?.message, code: error?.code });
    throw error;
  }
}

export async function newCheckoutGetStripeReaders() {
  dlog(DCAT.STRIPE_REQ, "getStripeReaders", "FirebaseCalls", {});
  try {
    const callables = await getCallables();
    const result = await callables.getReaders({});
    // log("newCheckout readers fetched:", result.data);
    dlog(DCAT.STRIPE_RES, "getStripeReaders", "FirebaseCalls", { readerCount: result.data?.readers?.length });
    return result.data;
  } catch (error) {
    log("newCheckoutGetStripeReaders error:", error);
    dlog(DCAT.STRIPE_ERR, "getStripeReaders", "FirebaseCalls", { message: error?.message, code: error?.code });
    throw error;
  }
}

export async function newCheckoutProcessManualCardPayment(amount, paymentMethodID, saleID, customerID, customerEmail, transactionID) {
  dlog(DCAT.STRIPE_REQ, "processManualCardPayment", "FirebaseCalls", { amount, saleID, transactionID });
  try {
    const { tenantID, storeID } = getTenantAndStore();
    const callables = await getCallables();
    const result = await callables.manualCardPayment({
      amount: Number(amount),
      paymentMethodID,
      tenantID,
      storeID,
      saleID: saleID || "",
      customerID: customerID || "",
      customerEmail: customerEmail || "",
      transactionID: transactionID || "",
    });
    log("newCheckout manual card payment:", result.data);
    dlog(DCAT.STRIPE_RES, "processManualCardPayment", "FirebaseCalls", { success: true, chargeID: result.data?.chargeID, amountCaptured: result.data?.amount_captured });
    return result.data;
  } catch (error) {
    log("newCheckoutProcessManualCardPayment error:", error);
    dlog(DCAT.STRIPE_ERR, "processManualCardPayment", "FirebaseCalls", { message: error?.message, code: error?.code });
    throw error;
  }
}

// ─── Deposit Void (Remove from Customer) ────────────────────────────

export async function voidCustomerDeposit(saleID, customerID) {
  dlog(DCAT.FIREBASE_REQ, "voidCustomerDeposit", "FirebaseCalls", { saleID, customerID });
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID || !saleID || !customerID) {
      log("voidCustomerDeposit: missing tenantID/storeID/saleID/customerID");
      dlog(DCAT.FIREBASE_ERR, "voidCustomerDeposit", "FirebaseCalls", { reason: "missing params" });
      return { success: false };
    }

    // Fetch the customer
    const customerPath = `tenants/${tenantID}/stores/${storeID}/customers/${customerID}`;
    const customer = await firestoreRead(customerPath);
    if (!customer) {
      log("voidCustomerDeposit: customer not found", customerID);
      dlog(DCAT.FIREBASE_ERR, "voidCustomerDeposit", "FirebaseCalls", { reason: "customer not found", customerID });
      return { success: false };
    }

    // Remove the deposit entry matching this saleID
    const deposits = customer.deposits || [];
    const filtered = deposits.filter((d) => d.id !== saleID);
    if (filtered.length === deposits.length) {
      log("voidCustomerDeposit: no matching deposit found for saleID", saleID);
      dlog(DCAT.FIREBASE_RES, "voidCustomerDeposit", "FirebaseCalls", { success: true, noDepositFound: true });
      return { success: true }; // nothing to remove
    }

    customer.deposits = filtered;
    await firestoreWrite(customerPath, customer);
    dlog(DCAT.FIREBASE_RES, "voidCustomerDeposit", "FirebaseCalls", { success: true, depositsRemoved: deposits.length - filtered.length });
    return { success: true };
  } catch (error) {
    log("voidCustomerDeposit error:", error);
    dlog(DCAT.FIREBASE_ERR, "voidCustomerDeposit", "FirebaseCalls", { message: error?.message });
    return { success: false, error };
  }
}

// ─── Item Sales Tracking ─────────────────────────────────────────────

export async function saveItemSales(sale, workorderLines) {
  dlog(DCAT.FIREBASE_REQ, "saveItemSales", "FirebaseCalls", { saleId: sale?.id, lineCount: workorderLines?.length });
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID || !sale?.id) {
      log("saveItemSales: missing tenantID/storeID/sale.id");
      dlog(DCAT.FIREBASE_ERR, "saveItemSales", "FirebaseCalls", { reason: "missing params" });
      return { success: false };
    }

    const items = [];
    for (const line of (workorderLines || [])) {
      const inv = line.inventoryItem || {};
      const qty = Number(line.qty) || 1;
      const docID = crypto.randomUUID();

      let entry = cloneDeep(ITEM_SALE_PROTO);
      entry.id = docID;
      entry.saleID = sale.id;
      entry.millis = Number(sale.millis) || Date.now();
      entry.itemID = line.id || "";
      entry.inventoryItemID = inv.customPart || inv.customLabor ? "" : (inv.id || "");
      entry.name = inv.formalName || inv.informalName || "";
      entry.category = inv.category || "";
      entry.customPart = !!inv.customPart;
      entry.customLabor = !!inv.customLabor;
      entry.minutes = inv.customLabor ? (Number(inv.minutes) || 0) : 0;
      entry.qty = qty;
      entry.price = inv.price || 0;
      entry.salePrice = inv.salePrice || 0;
      entry.discountObj = line.discountObj || null;

      items.push({
        path: `tenants/${tenantID}/stores/${storeID}/item-sales/${docID}`,
        data: entry,
      });
    }

    if (items.length === 0) return { success: true };
    await firestoreBatchWrite(items);
    dlog(DCAT.FIREBASE_RES, "saveItemSales", "FirebaseCalls", { success: true, itemsWritten: items.length });
    return { success: true };
  } catch (error) {
    log("saveItemSales error:", error);
    dlog(DCAT.FIREBASE_ERR, "saveItemSales", "FirebaseCalls", { message: error?.message });
    return { success: false, error };
  }
}

export async function markItemSalesRefunded(saleID, refundedLines) {
  dlog(DCAT.FIREBASE_REQ, "markItemSalesRefunded", "FirebaseCalls", { saleID, refundedLineCount: refundedLines?.length });
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID || !saleID) {
      log("markItemSalesRefunded: missing tenantID/storeID/saleID");
      dlog(DCAT.FIREBASE_ERR, "markItemSalesRefunded", "FirebaseCalls", { reason: "missing params" });
      return { success: false };
    }

    const collectionPath = `tenants/${tenantID}/stores/${storeID}/item-sales`;
    const docs = await firestoreQuery(collectionPath, [
      { field: "saleID", operator: "==", value: saleID },
    ]);
    if (!docs || docs.length === 0) return { success: true };

    const refundedItemIDs = new Set(
      (refundedLines || []).map((l) => l._originalLineId || l.id).filter(Boolean)
    );
    const toUpdate = docs.filter((d) => !d.refunded && refundedItemIDs.has(d.itemID));
    if (toUpdate.length === 0) return { success: true };

    const updates = toUpdate.map((d) => ({
      path: `${collectionPath}/${d.id}`,
      data: { ...d, refunded: true },
    }));

    await firestoreBatchWrite(updates);
    dlog(DCAT.FIREBASE_RES, "markItemSalesRefunded", "FirebaseCalls", { success: true, markedCount: updates.length });
    return { success: true };
  } catch (error) {
    log("markItemSalesRefunded error:", error);
    dlog(DCAT.FIREBASE_ERR, "markItemSalesRefunded", "FirebaseCalls", { message: error?.message });
    return { success: false, error };
  }
}

// ─── Sales Report Query ─────────────────────────────────────────

async function readCustomersBatch(customerIDs) {
  const { tenantID, storeID } = getTenantAndStore();
  if (!tenantID || !storeID || !customerIDs?.length) return {};
  let map = {};
  for (let i = 0; i < customerIDs.length; i += 50) {
    let chunk = customerIDs.slice(i, i + 50);
    let results = await Promise.all(
      chunk.map((id) => {
        let path = `tenants/${tenantID}/stores/${storeID}/customers/${id}`;
        return firestoreRead(path).catch(() => null);
      })
    );
    results.forEach((cust, idx) => {
      if (cust) map[chunk[idx]] = cust;
    });
  }
  return map;
}

export async function queryCompletedSalesReport(startMillis, endMillis) {
  dlog(DCAT.FIREBASE_REQ, "queryCompletedSalesReport", "FirebaseCalls", { startMillis, endMillis });
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) {
      log("queryCompletedSalesReport: missing tenantID/storeID");
      dlog(DCAT.FIREBASE_ERR, "queryCompletedSalesReport", "FirebaseCalls", { reason: "missing params" });
      return [];
    }

    // Phase 1: Query completed-sales by millis range
    const salesPath = `tenants/${tenantID}/stores/${storeID}/completed-sales`;
    const sales = await firestoreQuery(salesPath, [
      { field: "millis", operator: ">=", value: startMillis },
      { field: "millis", operator: "<=", value: endMillis },
    ], {
      orderBy: { field: "millis", direction: "desc" },
      limit: 2000,
    });

    if (!sales || sales.length === 0) return [];

    // Collect unique transaction IDs and customer IDs
    let allTxnIDs = [];
    let txnIDSet = new Set();
    let uniqueCustomerIDs = [];
    let custIDSet = new Set();

    sales.forEach((sale) => {
      (sale.transactionIDs || []).forEach((id) => {
        if (!txnIDSet.has(id)) { txnIDSet.add(id); allTxnIDs.push(id); }
      });
      if (sale.customerID && !custIDSet.has(sale.customerID)) {
        custIDSet.add(sale.customerID);
        uniqueCustomerIDs.push(sale.customerID);
      }
    });

    // Phase 2 + 3: Fetch transactions and customers in parallel
    let txnMapPromise = (async () => {
      let map = {};
      for (let i = 0; i < allTxnIDs.length; i += 50) {
        let chunk = allTxnIDs.slice(i, i + 50);
        let results = await readTransactions(chunk);
        results.forEach((txn) => { map[txn.id] = txn; });
      }
      return map;
    })();

    let [txnMap, customerMap] = await Promise.all([
      txnMapPromise,
      readCustomersBatch(uniqueCustomerIDs),
    ]);

    // Phase 4: Flatten into report rows
    let flatRows = [];
    for (let sale of sales) {
      let customer = customerMap[sale.customerID] || {};
      let custFirst = customer.first || "";
      let custLast = customer.last || "";
      let custCell = customer.customerCell || "";
      let custEmail = customer.email || "";

      for (let txnID of (sale.transactionIDs || [])) {
        let txn = txnMap[txnID];
        if (!txn) continue;

        // Payment row
        flatRows.push({
          saleID: sale.id,
          customerFirst: custFirst,
          customerLast: custLast,
          customerCell: custCell,
          customerEmail: custEmail,
          type: "payment",
          method: txn.method || "",
          amountCaptured: txn.amountCaptured || 0,
          salesTax: txn.salesTax || 0,
          millis: txn.millis || sale.millis,
          id: txn.id,
        });

        // Refund rows from this transaction
        (txn.refunds || []).forEach((refund) => {
          flatRows.push({
            saleID: sale.id,
            customerFirst: custFirst,
            customerLast: custLast,
            customerCell: custCell,
            customerEmail: custEmail,
            type: "refund",
            method: refund.method || txn.method || "",
            amountCaptured: refund.amount || 0,
            salesTax: refund.salesTax || 0,
            millis: refund.millis || txn.millis,
            id: refund.id || (txn.id + "-refund"),
          });
        });
      }
    }

    dlog(DCAT.FIREBASE_RES, "queryCompletedSalesReport", "FirebaseCalls", { salesCount: sales.length, rowCount: flatRows.length });
    return flatRows;
  } catch (error) {
    log("queryCompletedSalesReport error:", error);
    dlog(DCAT.FIREBASE_ERR, "queryCompletedSalesReport", "FirebaseCalls", { message: error?.message });
    return [];
  }
}

// ─── Active Sales Report ─────────────────────────────────────────
// Takes a pre-filtered array of active sale objects (already filtered
// by date range by the caller) and returns flat report rows in the
// same shape as queryCompletedSalesReport, tagged with source: "active".

export async function queryActiveSalesForReport(sales) {
  if (!sales || sales.length === 0) return [];
  try {
    let allTxnIDs = [];
    let txnIDSet = new Set();
    let uniqueCustomerIDs = [];
    let custIDSet = new Set();

    sales.forEach((sale) => {
      (sale.transactionIDs || []).forEach((id) => {
        if (!txnIDSet.has(id)) { txnIDSet.add(id); allTxnIDs.push(id); }
      });
      if (sale.customerID && !custIDSet.has(sale.customerID)) {
        custIDSet.add(sale.customerID);
        uniqueCustomerIDs.push(sale.customerID);
      }
    });

    let txnMapPromise = (async () => {
      let map = {};
      for (let i = 0; i < allTxnIDs.length; i += 50) {
        let chunk = allTxnIDs.slice(i, i + 50);
        let results = await readTransactions(chunk);
        results.forEach((txn) => { map[txn.id] = txn; });
      }
      return map;
    })();

    let [txnMap, customerMap] = await Promise.all([
      txnMapPromise,
      readCustomersBatch(uniqueCustomerIDs),
    ]);

    let flatRows = [];
    for (let sale of sales) {
      let customer = customerMap[sale.customerID] || {};
      let custFirst = customer.first || "";
      let custLast = customer.last || "";
      let custCell = customer.customerCell || "";
      let custEmail = customer.email || "";

      if ((sale.transactionIDs || []).length === 0) {
        flatRows.push({
          saleID: sale.id,
          customerFirst: custFirst,
          customerLast: custLast,
          customerCell: custCell,
          customerEmail: custEmail,
          type: "pending",
          method: "",
          amountCaptured: 0,
          salesTax: 0,
          millis: sale.millis,
          id: sale.id + "-pending",
          source: "active",
        });
        continue;
      }

      for (let txnID of (sale.transactionIDs || [])) {
        let txn = txnMap[txnID];
        if (!txn) continue;

        flatRows.push({
          saleID: sale.id,
          customerFirst: custFirst,
          customerLast: custLast,
          customerCell: custCell,
          customerEmail: custEmail,
          type: "payment",
          method: txn.method || "",
          amountCaptured: txn.amountCaptured || 0,
          salesTax: txn.salesTax || 0,
          millis: txn.millis || sale.millis,
          id: txn.id,
          source: "active",
        });

        (txn.refunds || []).forEach((refund) => {
          flatRows.push({
            saleID: sale.id,
            customerFirst: custFirst,
            customerLast: custLast,
            customerCell: custCell,
            customerEmail: custEmail,
            type: "refund",
            method: refund.method || txn.method || "",
            amountCaptured: refund.amount || 0,
            salesTax: refund.salesTax || 0,
            millis: refund.millis || txn.millis,
            id: refund.id || (txn.id + "-refund"),
            source: "active",
          });
        });
      }
    }
    return flatRows;
  } catch (error) {
    log("queryActiveSalesForReport error:", error);
    return [];
  }
}

// ─── Pending Transaction Recovery (App Init) ─────────────────────
// Runs once on first active-sales snapshot. Reconciles sales that have
// pendingTransactionIDs left over from a page reload or network drop
// while a card payment was in flight. The Stripe webhook writes the
// transaction doc to Firestore independently, so if it exists we can
// promote the pending ID and complete the sale client-side.

export async function recoverPendingActiveSales(activeSales) {
  if (!activeSales?.length) return;

  let salesToRecover = activeSales.filter((s) => s.pendingTransactionIDs?.length > 0);
  if (!salesToRecover.length) return;

  log("recoverPendingActiveSales: found", salesToRecover.length, "sale(s) with pending transactions");
  dlog(DCAT.FIREBASE_REQ, "recoverPendingActiveSales", "FirebaseCalls", { count: salesToRecover.length });

  for (let sale of salesToRecover) {
    try {
      // Load existing confirmed transactions
      let loadedTxns = [];
      if (sale.transactionIDs?.length > 0) {
        loadedTxns = (await readTransactions(sale.transactionIDs)).filter(Boolean);
      }

      // Check pending transactions — did the webhook write them?
      let pendingResults = await readTransactions(sale.pendingTransactionIDs);
      for (let i = 0; i < sale.pendingTransactionIDs.length; i++) {
        let txn = pendingResults[i];
        if (txn) {
          loadedTxns.push(txn);
          if (!(sale.transactionIDs || []).includes(txn.id)) {
            sale.transactionIDs = [...(sale.transactionIDs || []), txn.id];
          }
          log("recoverPendingActiveSales: recovered transaction", txn.id, "for sale", sale.id);
        }
      }
      sale.pendingTransactionIDs = [];

      // Recompute amounts with reconciled transactions
      let credits = getAllAppliedCredits(sale);
      recomputeSaleAmounts(sale, loadedTxns, credits);

      // Deposit sale fully paid → complete the deposit on the customer
      if (sale.isDepositSale && sale.paymentComplete && sale.customerID) {
        await _completeRecoveredDeposit(sale, loadedTxns);
      } else {
        // Persist the reconciled state (clears ghost pending IDs)
        await writeActiveSale(sale);
      }
    } catch (e) {
      log("recoverPendingActiveSales error for sale", sale.id, ":", e?.message || e);
    }
  }
}

async function _completeRecoveredDeposit(sale, transactions) {
  const { tenantID, storeID } = getTenantAndStore();
  if (!tenantID || !storeID || !sale.customerID) return;

  // Read the customer
  let customerPath = `tenants/${tenantID}/stores/${storeID}/customers/${sale.customerID}`;
  let customer = await firestoreRead(customerPath);
  if (!customer) {
    log("_completeRecoveredDeposit: customer not found", sale.customerID);
    await writeActiveSale(sale); // at least persist the reconciled state
    return;
  }

  // Build deposit from sale + transaction data
  let primaryTxn = transactions[0];
  let newDeposit = { ...CUSTOMER_DEPOSIT_PROTO };
  newDeposit.id = generateEAN13Barcode();
  newDeposit.transactionId = primaryTxn?.id || "";
  newDeposit.amountCents = sale.subtotal || 0;
  newDeposit.millis = Date.now();
  newDeposit.method = primaryTxn?.method || "card";
  newDeposit.note = sale.depositNote || "";
  newDeposit.last4 = primaryTxn?.last4 || "";
  newDeposit.type = sale.depositType === "giftcard" ? "giftcard" : "deposit";

  // Add deposit to customer and persist
  customer.deposits = [...(customer.deposits || []), newDeposit];
  await firestoreWrite(customerPath, customer);

  // Write all transactions (idempotent — webhook may have already written them)
  await Promise.all(transactions.map((t) => writeTransaction(t)));

  // Delete the active sale
  await deleteActiveSale(sale.id);

  log("_completeRecoveredDeposit: deposit added to customer", sale.customerID,
    "amount:", sale.subtotal, "method:", newDeposit.method, "sale deleted:", sale.id);
}

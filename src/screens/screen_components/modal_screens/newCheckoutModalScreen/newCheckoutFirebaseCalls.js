import { httpsCallable } from "firebase/functions";
import {
  firestoreWrite,
  firestoreRead,
  firestoreDelete,
  firestoreSubscribe,
  firestoreQuery,
} from "../../../../db_calls";
import { useSettingsStore, useOpenWorkordersStore } from "../../../../stores";
import { log } from "../../../../utils";
import { SALE_INDEX_PROTO } from "../../../../data";
import { cloneDeep } from "lodash";

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
let _newCheckoutCancelPaymentCallable = null;
let _newCheckoutProcessRefundCallable = null;
let _newCheckoutGetAvailableReadersCallable = null;

async function getCallables() {
  if (!_newCheckoutInitiatePaymentIntentCallable) {
    const fns = await getFunctionsInstance();
    _newCheckoutInitiatePaymentIntentCallable = httpsCallable(fns, "newCheckoutInitiatePaymentIntentCallable");
    _newCheckoutCancelPaymentCallable = httpsCallable(fns, "newCheckoutCancelPaymentCallable");
    _newCheckoutProcessRefundCallable = httpsCallable(fns, "newCheckoutProcessRefundCallable");
    _newCheckoutGetAvailableReadersCallable = httpsCallable(fns, "newCheckoutGetAvailableReadersCallable");
  }
  return {
    initiatePayment: _newCheckoutInitiatePaymentIntentCallable,
    cancelPayment: _newCheckoutCancelPaymentCallable,
    processRefund: _newCheckoutProcessRefundCallable,
    getReaders: _newCheckoutGetAvailableReadersCallable,
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

// ─── Active Sale (In-Progress, Firestore) ─────────────────────

export async function newCheckoutSaveActiveSale(sale) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) {
      log("newCheckoutSaveActiveSale: missing tenantID/storeID");
      return { success: false };
    }
    const path = buildActiveSalePath(tenantID, storeID, sale.id);
    await firestoreWrite(path, sale);
    return { success: true };
  } catch (error) {
    log("newCheckoutSaveActiveSale error:", error);
    return { success: false, error };
  }
}

export async function newCheckoutGetActiveSale(saleID) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) {
      log("newCheckoutGetActiveSale: missing tenantID/storeID");
      return null;
    }
    const path = buildActiveSalePath(tenantID, storeID, saleID);
    return await firestoreRead(path);
  } catch (error) {
    log("newCheckoutGetActiveSale error:", error);
    return null;
  }
}

export async function newCheckoutDeleteActiveSale(saleID) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) return;
    const path = buildActiveSalePath(tenantID, storeID, saleID);
    await firestoreDelete(path);
  } catch (error) {
    log("newCheckoutDeleteActiveSale error:", error);
  }
}

// ─── Completed Sale (Firestore) ───────────────────────────────

export async function newCheckoutCompleteSale(sale) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) {
      log("newCheckoutCompleteSale: missing tenantID/storeID");
      return { success: false };
    }
    const path = `tenants/${tenantID}/stores/${storeID}/completed-sales/${sale.id}`;
    await firestoreWrite(path, sale);

    // Clean up active-sale from Firestore
    await newCheckoutDeleteActiveSale(sale.id);

    return { success: true };
  } catch (error) {
    log("newCheckoutCompleteSale error:", error);
    return { success: false, error };
  }
}

export async function newCheckoutFetchCompletedSale(saleID) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) {
      log("newCheckoutFetchCompletedSale: missing tenantID/storeID");
      return null;
    }
    const path = `tenants/${tenantID}/stores/${storeID}/completed-sales/${saleID}`;
    return await firestoreRead(path);
  } catch (error) {
    log("newCheckoutFetchCompletedSale error:", error);
    return null;
  }
}

// ─── Workorders ───────────────────────────────────────────────

export async function newCheckoutSaveWorkorder(workorder) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID || !workorder?.id) {
      log("newCheckoutSaveWorkorder: missing tenantID/storeID/workorder.id");
      return { success: false };
    }
    const path = buildWorkorderPath(tenantID, storeID, workorder.id);
    await firestoreWrite(path, workorder);
    return { success: true };
  } catch (error) {
    log("newCheckoutSaveWorkorder error:", error);
    return { success: false, error };
  }
}

export async function newCheckoutCompleteWorkorder(workorder) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID || !workorder?.id) {
      log("newCheckoutCompleteWorkorder: missing tenantID/storeID/workorder.id");
      return { success: false };
    }

    // Write to completed-workorders in Firestore
    const completedPath = buildCompletedWorkorderPath(tenantID, storeID, workorder.id);
    await firestoreWrite(completedPath, workorder);

    // Delete from open-workorders
    const openPath = buildWorkorderPath(tenantID, storeID, workorder.id);
    await firestoreDelete(openPath);

    return { success: true };
  } catch (error) {
    log("newCheckoutCompleteWorkorder error:", error);
    return { success: false, error };
  }
}

export async function newCheckoutFetchWorkordersForSale(workorderIDs) {
  if (!workorderIDs || workorderIDs.length === 0) return [];

  // Check local store first (always has fresh open workorders)
  const openWorkorders = useOpenWorkordersStore.getState().getWorkorders() || [];

  const { tenantID, storeID } = getTenantAndStore();

  let workorders = [];
  for (let i = 0; i < workorderIDs.length; i++) {
    let woID = workorderIDs[i];

    // Local store lookup — no network call
    let localMatch = openWorkorders.find((w) => w.id === woID);
    if (localMatch) {
      workorders.push(localMatch);
      continue;
    }

    // Not in local store — must be completed, fetch from Firestore
    if (!tenantID || !storeID) continue;
    try {
      const completedPath = buildCompletedWorkorderPath(tenantID, storeID, woID);
      let wo = await firestoreRead(completedPath);
      if (wo) workorders.push(wo);
    } catch (error) {
      log("newCheckoutFetchWorkordersForSale error for " + woID, error);
    }
  }
  return workorders;
}

// ─── Payment Listener (Firestore Real-time) ───────────────────

export function newCheckoutListenToPaymentUpdates(readerID, paymentIntentID, onUpdate, onCompletion) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID || !readerID || !paymentIntentID) {
      log("newCheckoutListenToPaymentUpdates: missing required params");
      return null;
    }

    const updatesPath = buildPaymentUpdatesPath(tenantID, storeID, readerID, paymentIntentID);
    const completionsPath = buildPaymentCompletionsPath(tenantID, storeID, readerID, paymentIntentID);

    const unsubscribeUpdates = firestoreSubscribe(updatesPath, (data, error) => {
      if (error) {
        log("Payment updates listener error:", error);
        return;
      }
      if (onUpdate) onUpdate(data);
    });

    const unsubscribeCompletions = firestoreSubscribe(completionsPath, (data, error) => {
      if (error) {
        log("Payment completions listener error:", error);
        return;
      }
      if (onCompletion) onCompletion(data);
    });

    return {
      unsubscribeUpdates,
      unsubscribeCompletions,
      unsubscribe: () => {
        if (unsubscribeUpdates) unsubscribeUpdates();
        if (unsubscribeCompletions) unsubscribeCompletions();
      },
    };
  } catch (error) {
    log("newCheckoutListenToPaymentUpdates error:", error);
    return null;
  }
}

// ─── Stripe Callable Wrappers ─────────────────────────────────

export async function newCheckoutProcessStripePayment(amount, readerID, paymentIntentID) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    const callables = await getCallables();
    const result = await callables.initiatePayment({
      amount: Number(amount),
      readerID,
      paymentIntentID: paymentIntentID || null,
      tenantID,
      storeID,
    });
    log("newCheckout payment initiated:", result.data);
    return result.data;
  } catch (error) {
    log("newCheckoutProcessStripePayment error:", error);
    throw error;
  }
}

export async function newCheckoutCancelStripePayment(readerID) {
  try {
    const callables = await getCallables();
    const result = await callables.cancelPayment({ readerID });
    log("newCheckout payment cancelled:", result.data);
    return result.data;
  } catch (error) {
    log("newCheckoutCancelStripePayment error:", error);
    throw error;
  }
}

export async function newCheckoutProcessStripeRefund(amount, paymentIntentID) {
  try {
    const callables = await getCallables();
    const result = await callables.processRefund({
      amount: Number(amount),
      paymentIntentID,
    });
    log("newCheckout refund processed:", result.data);
    return result.data;
  } catch (error) {
    log("newCheckoutProcessStripeRefund error:", error);
    throw error;
  }
}

export async function newCheckoutGetStripeReaders() {
  try {
    const callables = await getCallables();
    const result = await callables.getReaders({});
    log("newCheckout readers fetched:", result.data);
    return result.data;
  } catch (error) {
    log("newCheckoutGetStripeReaders error:", error);
    throw error;
  }
}

// ─── Sales Index (Firestore) ──────────────────────────────────

function buildSalesIndexPath(tenantID, storeID, docID) {
  return `tenants/${tenantID}/stores/${storeID}/sales-index/${docID}`;
}

function findHighestItem(workorderLines) {
  let highestName = "";
  let highestPrice = 0;
  (workorderLines || []).forEach((line) => {
    const qty = Number(line.qty) || 1;
    const price = Number(line.inventoryItem?.price) || 0;
    const lineTotal = qty * price;
    if (lineTotal > highestPrice) {
      highestPrice = lineTotal;
      highestName = line.inventoryItem?.formalName || line.inventoryItem?.informalName || "";
    }
  });
  return { highestName, highestPrice };
}

export async function saveSaleIndex(sale, customerInfo, workorderLines, isStandaloneSale) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID || !sale?.id) {
      log("saveSaleIndex: missing tenantID/storeID/sale.id");
      return { success: false };
    }

    const { highestName, highestPrice } = findHighestItem(workorderLines);

    let indexDoc = cloneDeep(SALE_INDEX_PROTO);
    indexDoc.id = sale.id;
    indexDoc.type = "sale";
    indexDoc.saleID = sale.id;
    indexDoc.millis = Number(sale.millis) || Date.now();
    indexDoc.customerFirst = customerInfo?.first || "";
    indexDoc.customerLast = customerInfo?.last || "";
    indexDoc.customerPhone = customerInfo?.phone || "";
    indexDoc.customerID = customerInfo?.id || "";
    indexDoc.total = sale.total || 0;
    indexDoc.subtotal = sale.subtotal || 0;
    indexDoc.tax = sale.tax || 0;
    indexDoc.salesTaxPercent = sale.salesTaxPercent || 0;
    indexDoc.discount = sale.discount || 0;
    indexDoc.amountRefunded = sale.amountRefunded || 0;
    indexDoc.itemCount = (workorderLines || []).length;
    indexDoc.highestItemName = highestName;
    indexDoc.highestItemPrice = highestPrice;
    indexDoc.isStandaloneSale = !!isStandaloneSale;
    indexDoc.workorderIDs = sale.workorderIDs || [];

    let payments = sale.payments || [];
    let hasCash = payments.some((p) => p.cash && !p.isRefund);
    let hasCard = payments.some((p) => !p.cash && !p.isRefund);
    if (hasCash && hasCard) indexDoc.paymentType = "Split";
    else if (hasCash) indexDoc.paymentType = "Cash";
    else if (hasCard) indexDoc.paymentType = "Card";
    else indexDoc.paymentType = "";

    const path = buildSalesIndexPath(tenantID, storeID, sale.id);
    await firestoreWrite(path, indexDoc);
    return { success: true };
  } catch (error) {
    log("saveSaleIndex error:", error);
    return { success: false, error };
  }
}

export async function saveRefundIndex(sale, refund, customerInfo) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID || !refund?.id) {
      log("saveRefundIndex: missing tenantID/storeID/refund.id");
      return { success: false };
    }

    const { highestName, highestPrice } = findHighestItem(refund.workorderLines);

    let indexDoc = cloneDeep(SALE_INDEX_PROTO);
    indexDoc.id = refund.id;
    indexDoc.type = "refund";
    indexDoc.saleID = sale.id;
    indexDoc.millis = Number(refund.millis) || Date.now();
    indexDoc.customerFirst = customerInfo?.first || "";
    indexDoc.customerLast = customerInfo?.last || "";
    indexDoc.customerPhone = customerInfo?.phone || "";
    indexDoc.customerID = customerInfo?.id || "";
    indexDoc.total = 0;
    indexDoc.subtotal = 0;
    indexDoc.tax = 0;
    indexDoc.salesTaxPercent = sale.salesTaxPercent || 0;
    indexDoc.discount = 0;
    indexDoc.amountRefunded = refund.amountRefunded || 0;
    indexDoc.itemCount = (refund.workorderLines || []).length;
    indexDoc.highestItemName = highestName;
    indexDoc.highestItemPrice = highestPrice;
    indexDoc.isStandaloneSale = false;
    indexDoc.workorderIDs = sale.workorderIDs || [];
    indexDoc.paymentType = "Refund";

    const path = buildSalesIndexPath(tenantID, storeID, refund.id);
    await firestoreWrite(path, indexDoc);
    return { success: true };
  } catch (error) {
    log("saveRefundIndex error:", error);
    return { success: false, error };
  }
}

export async function querySalesIndex(startMillis, endMillis) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) {
      log("querySalesIndex: missing tenantID/storeID");
      return [];
    }
    const collectionPath = `tenants/${tenantID}/stores/${storeID}/sales-index`;
    return await firestoreQuery(
      collectionPath,
      [
        { field: "millis", operator: ">=", value: startMillis },
        { field: "millis", operator: "<=", value: endMillis },
      ],
      { orderBy: { field: "millis", direction: "desc" } }
    );
  } catch (error) {
    log("querySalesIndex error:", error);
    return [];
  }
}

import { httpsCallable } from "firebase/functions";
import {
  firestoreWrite,
  firestoreRead,
  firestoreDelete,
  firestoreSubscribe,
  storageUploadString,
  storageGetDownloadURL,
} from "../../../../db_calls";
import { useSettingsStore, useOpenWorkordersStore } from "../../../../stores";
import { log } from "../../../../utils";

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

// ─── Completed Sale (Cloud Storage) ───────────────────────────

export async function newCheckoutCompleteSale(sale) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) {
      log("newCheckoutCompleteSale: missing tenantID/storeID");
      return { success: false };
    }
    const storagePath = `closed-sales/${tenantID}/${storeID}/${sale.id}.json`;
    const saleJson = JSON.stringify(sale, null, 2);
    await storageUploadString(storagePath, saleJson, "raw");

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
    const storagePath = `closed-sales/${tenantID}/${storeID}/${saleID}.json`;
    const downloadURL = await storageGetDownloadURL(storagePath);
    if (!downloadURL) return null;

    const response = await fetch(downloadURL);
    if (!response.ok) return null;

    return await response.json();
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
    const callables = await getCallables();
    const result = await callables.initiatePayment({
      amount: Number(amount),
      readerID,
      paymentIntentID: paymentIntentID || null,
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

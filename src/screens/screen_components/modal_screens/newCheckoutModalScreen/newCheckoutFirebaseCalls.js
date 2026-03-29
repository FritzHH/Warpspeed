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
import { log } from "../../../../utils";
import { ITEM_SALE_PROTO } from "../../../../data";
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
let _newCheckoutManualCardPaymentCallable = null;

async function getCallables() {
  if (!_newCheckoutInitiatePaymentIntentCallable) {
    const fns = await getFunctionsInstance();
    _newCheckoutInitiatePaymentIntentCallable = httpsCallable(fns, "newCheckoutInitiatePaymentIntentCallable");
    _newCheckoutCancelPaymentCallable = httpsCallable(fns, "newCheckoutCancelPaymentCallable");
    _newCheckoutProcessRefundCallable = httpsCallable(fns, "newCheckoutProcessRefundCallable");
    _newCheckoutGetAvailableReadersCallable = httpsCallable(fns, "newCheckoutGetAvailableReadersCallable");
    _newCheckoutManualCardPaymentCallable = httpsCallable(fns, "newCheckoutManualCardPaymentCallable");
  }
  return {
    initiatePayment: _newCheckoutInitiatePaymentIntentCallable,
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
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID || !transaction?.id) {
      log("writeTransaction: missing tenantID/storeID/transaction.id");
      return { success: false };
    }
    const path = buildTransactionPath(tenantID, storeID, transaction.id);
    await firestoreWrite(path, transaction);
    return { success: true };
  } catch (error) {
    log("writeTransaction error:", error);
    return { success: false, error };
  }
}

export async function readTransaction(txnID) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID || !txnID) {
      log("readTransaction: missing tenantID/storeID/txnID");
      return null;
    }
    const path = buildTransactionPath(tenantID, storeID, txnID);
    return await firestoreRead(path);
  } catch (error) {
    log("readTransaction error:", error);
    return null;
  }
}

export async function readTransactions(txnIDs) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID || !txnIDs?.length) return [];
    const results = await Promise.all(
      txnIDs.map((txnID) => {
        const path = buildTransactionPath(tenantID, storeID, txnID);
        return firestoreRead(path);
      })
    );
    return results.filter(Boolean);
  } catch (error) {
    log("readTransactions error:", error);
    return [];
  }
}

export async function deleteTransaction(txnID) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID || !txnID) {
      log("deleteTransaction: missing tenantID/storeID/txnID");
      return { success: false };
    }
    const path = buildTransactionPath(tenantID, storeID, txnID);
    await firestoreDelete(path);
    return { success: true };
  } catch (error) {
    log("deleteTransaction error:", error);
    return { success: false, error };
  }
}

// ─── Thin Sale (Firestore) ───────────────────────────────────

export async function writeActiveSale(sale) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID || !sale?.id) {
      log("writeActiveSale: missing tenantID/storeID/sale.id");
      return { success: false };
    }
    const path = buildActiveSalePath(tenantID, storeID, sale.id);
    await firestoreWrite(path, sale);
    return { success: true };
  } catch (error) {
    log("writeActiveSale error:", error);
    return { success: false, error };
  }
}

export async function readActiveSale(saleID) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID || !saleID) {
      log("readActiveSale: missing tenantID/storeID/saleID");
      return null;
    }
    const path = buildActiveSalePath(tenantID, storeID, saleID);
    return await firestoreRead(path);
  } catch (error) {
    log("readActiveSale error:", error);
    return null;
  }
}

export async function deleteActiveSale(saleID) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID || !saleID) {
      log("deleteActiveSale: missing tenantID/storeID/saleID");
      return { success: false };
    }
    const path = buildActiveSalePath(tenantID, storeID, saleID);
    await firestoreDelete(path);
    return { success: true };
  } catch (error) {
    log("deleteActiveSale error:", error);
    return { success: false, error };
  }
}

export async function writeCompletedSale(sale) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID || !sale?.id) {
      log("writeCompletedSale: missing tenantID/storeID/sale.id");
      return { success: false };
    }
    const path = buildCompletedSalePath(tenantID, storeID, sale.id);
    await firestoreWrite(path, sale);
    return { success: true };
  } catch (error) {
    log("writeCompletedSale error:", error);
    return { success: false, error };
  }
}

export async function readCompletedSale(saleID) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID || !saleID) {
      log("readCompletedSale: missing tenantID/storeID/saleID");
      return null;
    }
    const path = buildCompletedSalePath(tenantID, storeID, saleID);
    return await firestoreRead(path);
  } catch (error) {
    log("readCompletedSale error:", error);
    return null;
  }
}

// ─── Cash Refund (Firestore) ─────────────────────────────────

export async function writeCashRefund(transactionID, refundObj) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID || !transactionID || !refundObj) {
      log("writeCashRefund: missing tenantID/storeID/transactionID/refundObj");
      return { success: false };
    }
    const path = buildTransactionPath(tenantID, storeID, transactionID);
    const transaction = await firestoreRead(path);
    if (!transaction) {
      log("writeCashRefund: transaction not found");
      return { success: false };
    }
    const refunds = transaction.refunds || [];
    refunds.push(refundObj);
    await firestoreWrite(path, { ...transaction, refunds });
    return { success: true };
  } catch (error) {
    log("writeCashRefund error:", error);
    return { success: false, error };
  }
}

// ─── DEPRECATED — use new thin sale functions above ──────────

// DEPRECATED — use writeActiveSale
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

// DEPRECATED — use readActiveSale
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

// DEPRECATED — use deleteActiveSale
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

// DEPRECATED — use writeCompletedSale + deleteActiveSale
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

// DEPRECATED — use writeCompletedSale
export async function newCheckoutUpdateCompletedSale(sale) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) {
      log("newCheckoutUpdateCompletedSale: missing tenantID/storeID");
      return { success: false };
    }
    const path = `tenants/${tenantID}/stores/${storeID}/completed-sales/${sale.id}`;
    await firestoreWrite(path, sale);
    return { success: true };
  } catch (error) {
    log("newCheckoutUpdateCompletedSale error:", error);
    return { success: false, error };
  }
}

// DEPRECATED — use readCompletedSale
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

export async function newCheckoutUpdateCompletedWorkorder(workorder) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID || !workorder?.id) {
      log("newCheckoutUpdateCompletedWorkorder: missing tenantID/storeID/workorder.id");
      return { success: false };
    }
    const path = buildCompletedWorkorderPath(tenantID, storeID, workorder.id);
    await firestoreWrite(path, workorder);
    return { success: true };
  } catch (error) {
    log("newCheckoutUpdateCompletedWorkorder error:", error);
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

export function newCheckoutListenToPaymentUpdates(readerID, paymentIntentID, onUpdate) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID || !readerID || !paymentIntentID) {
      log("newCheckoutListenToPaymentUpdates: missing required params — tenantID:", tenantID, "storeID:", storeID, "readerID:", readerID, "piID:", paymentIntentID);
      return null;
    }

    const updatesPath = buildPaymentUpdatesPath(tenantID, storeID, readerID, paymentIntentID);
    log("newCheckoutListenToPaymentUpdates: subscribing to", updatesPath);

    const unsubscribe = firestoreSubscribe(updatesPath, (data, error) => {
      if (error) {
        log("Payment updates listener error:", error);
        return;
      }
      if (onUpdate) onUpdate(data);
    });

    return {
      unsubscribe: () => {
        if (unsubscribe) unsubscribe();
      },
    };
  } catch (error) {
    log("newCheckoutListenToPaymentUpdates error:", error);
    return null;
  }
}

// ─── Stripe Callable Wrappers ─────────────────────────────────

export async function newCheckoutProcessStripePayment(amount, readerID, paymentIntentID, saleID, customerID, customerEmail) {
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

export async function newCheckoutProcessStripeRefund(amount, chargeID) {
  try {
    const callables = await getCallables();
    const result = await callables.processRefund({
      amount: Number(amount),
      chargeID,
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

export async function newCheckoutProcessManualCardPayment(amount, paymentMethodID, saleID, customerID, customerEmail) {
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
    });
    log("newCheckout manual card payment:", result.data);
    return result.data;
  } catch (error) {
    log("newCheckoutProcessManualCardPayment error:", error);
    throw error;
  }
}

// ─── Deposit Void (Remove from Customer) ────────────────────────────

export async function voidCustomerDeposit(saleID, customerID) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID || !saleID || !customerID) {
      log("voidCustomerDeposit: missing tenantID/storeID/saleID/customerID");
      return { success: false };
    }

    // Fetch the customer
    const customerPath = `tenants/${tenantID}/stores/${storeID}/customers/${customerID}`;
    const customer = await firestoreRead(customerPath);
    if (!customer) {
      log("voidCustomerDeposit: customer not found", customerID);
      return { success: false };
    }

    // Remove the deposit entry matching this saleID
    const deposits = customer.deposits || [];
    const filtered = deposits.filter((d) => d.id !== saleID);
    if (filtered.length === deposits.length) {
      log("voidCustomerDeposit: no matching deposit found for saleID", saleID);
      return { success: true }; // nothing to remove
    }

    customer.deposits = filtered;
    await firestoreWrite(customerPath, customer);
    return { success: true };
  } catch (error) {
    log("voidCustomerDeposit error:", error);
    return { success: false, error };
  }
}

// ─── Item Sales Tracking ─────────────────────────────────────────────

export async function saveItemSales(sale, workorderLines) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID || !sale?.id) {
      log("saveItemSales: missing tenantID/storeID/sale.id");
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
    return { success: true };
  } catch (error) {
    log("saveItemSales error:", error);
    return { success: false, error };
  }
}

export async function markItemSalesRefunded(saleID, refundedLines) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID || !saleID) {
      log("markItemSalesRefunded: missing tenantID/storeID/saleID");
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
    return { success: true };
  } catch (error) {
    log("markItemSalesRefunded error:", error);
    return { success: false, error };
  }
}

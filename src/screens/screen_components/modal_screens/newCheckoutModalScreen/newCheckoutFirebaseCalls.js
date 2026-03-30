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

export async function newCheckoutProcessStripePayment(amount, readerID, paymentIntentID, saleID, customerID, customerEmail, transactionID, salesTax) {
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

export async function newCheckoutProcessStripeRefund(amount, chargeID, transactionFields) {
  try {
    const callables = await getCallables();
    const result = await callables.processRefund({
      amount: Number(amount),
      chargeID,
      ...(transactionFields || {}),
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

export async function newCheckoutProcessManualCardPayment(amount, paymentMethodID, saleID, customerID, customerEmail, transactionID) {
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
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) {
      log("queryCompletedSalesReport: missing tenantID/storeID");
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

    return flatRows;
  } catch (error) {
    log("queryCompletedSalesReport error:", error);
    return [];
  }
}

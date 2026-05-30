/* eslint-disable */

import React, { useState, useEffect } from "react";
import { C } from "../styles";
import { copyToClipboard } from "../utils";
import styles from "./DatabaseViewerScreen.module.css";
import { useSettingsStore } from "../stores";
import { firestoreSubscribeCollection, firestoreDelete, firestoreWrite, firestoreRead } from "../db_calls";
import { DB_NODES } from "../constants";
import { ROUTES } from "../routes";
import cloneDeep from "lodash/cloneDeep";
import { formatCurrencyDisp } from "../utils";

const COLLECTIONS = [
  { key: "activeSales", label: "active-sales", node: DB_NODES.FIRESTORE.ACTIVE_SALES },
  { key: "completedSales", label: "completed-sales", node: DB_NODES.FIRESTORE.COMPLETED_SALES },
  { key: "openWorkorders", label: "open-workorders", node: DB_NODES.FIRESTORE.OPEN_WORKORDERS },
  { key: "completedWorkorders", label: "completed-workorders", node: DB_NODES.FIRESTORE.COMPLETED_WORKORDERS },
  { key: "customers", label: "customers", node: DB_NODES.FIRESTORE.CUSTOMERS },
  { key: "transactions", label: "transactions", node: DB_NODES.FIRESTORE.TRANSACTIONS },
];

const NOTIFY_HINT = " ";

const FRESH_WORKORDERS_DATA = {
  activeSales: [],
  completedSales: [],
  completedWorkorders: [],
  transactions: [],
  openWorkorders: [],
  customers: [],
};

const START_HERE_DATA = {
  activeSales: [],
  completedSales: [],
  completedWorkorders: [],
  openWorkorders: [],
  customers: [],
  transactions: [],
};

export function DatabaseViewerScreen() {
  const settings = useSettingsStore((state) => state.settings);
  const tenantID = settings?.tenantID || "";
  const storeID = settings?.storeID || "";

  const [sData, _setData] = useState({
    activeSales: [],
    completedSales: [],
    openWorkorders: [],
    completedWorkorders: [],
    customers: [],
    transactions: [],
  });

  useEffect(() => {
    if (!tenantID || !storeID) return;
    let unsubscribes = [];
    COLLECTIONS.forEach((col) => {
      let path = `tenants/${tenantID}/stores/${storeID}/${col.node}`;
      let unsub = firestoreSubscribeCollection(path, (docs) => {
        _setData((prev) => ({ ...prev, [col.key]: docs }));
      });
      unsubscribes.push(unsub);
    });
    return () => {
      unsubscribes.forEach((unsub) => { if (unsub) unsub(); });
    };
  }, [tenantID, storeID]);

  async function handleRefreshState() {
    _setReopenStatus("Refreshing state...");
    let basePath = `tenants/${tenantID}/stores/${storeID}`;
    try {
      // 1. Identify deposit-sale transaction IDs to preserve
      let depositTxnIDs = new Set();
      for (let sale of [...sData.completedSales, ...sData.activeSales]) {
        if (sale.isDepositSale) {
          for (let txnID of (sale.transactionIDs || [])) depositTxnIDs.add(txnID);
        }
      }

      // 2. Delete all active sales and completed sales
      for (let sale of sData.activeSales) {
        await firestoreDelete(`${basePath}/${DB_NODES.FIRESTORE.ACTIVE_SALES}/${sale.id}`);
      }
      for (let sale of sData.completedSales) {
        await firestoreDelete(`${basePath}/${DB_NODES.FIRESTORE.COMPLETED_SALES}/${sale.id}`);
      }

      // 3. Move first completed workorder back to open (cleaned), delete the rest
      let firstCompleted = sData.completedWorkorders[0];
      for (let i = 0; i < sData.completedWorkorders.length; i++) {
        let wo = sData.completedWorkorders[i];
        if (i === 0) {
          let cleaned = cleanWOForReopen(wo);
          cleaned.amountPaid = "";
          await firestoreWrite(`${basePath}/${DB_NODES.FIRESTORE.OPEN_WORKORDERS}/${cleaned.id}`, cleaned);
        }
        await firestoreDelete(`${basePath}/${DB_NODES.FIRESTORE.COMPLETED_WORKORDERS}/${wo.id}`);
      }

      // 4. Clean all open workorders of payment activity and sale links
      for (let wo of sData.openWorkorders) {
        if (wo.activeSaleID || wo.saleID || wo.paymentComplete || wo.amountPaid) {
          let cleaned = cleanWOForReopen(wo);
          cleaned.amountPaid = "";
          await firestoreWrite(`${basePath}/${DB_NODES.FIRESTORE.OPEN_WORKORDERS}/${cleaned.id}`, cleaned);
        }
      }

      // 5. Delete non-deposit transactions, preserve deposit ones
      let deletedTxns = 0;
      for (let txn of sData.transactions) {
        if (!depositTxnIDs.has(txn.id)) {
          await firestoreDelete(`${basePath}/${DB_NODES.FIRESTORE.TRANSACTIONS}/${txn.id}`);
          deletedTxns++;
        }
      }

      // 6. Reconcile customers - fix workorder refs, clear sales, restore credits/deposits
      let allOpenWOIDs = new Set(sData.openWorkorders.map((w) => w.id));
      if (firstCompleted) allOpenWOIDs.add(firstCompleted.id);

      for (let customer of sData.customers) {
        let updated = cloneDeep(customer);
        updated.workorders = (updated.workorders || []).filter((id) => allOpenWOIDs.has(id));
        updated.sales = [];
        for (let cred of (updated.credits || [])) cred.reservedCents = 0;
        for (let dep of (updated.deposits || [])) dep.reservedCents = 0;
        await firestoreWrite(`${basePath}/${DB_NODES.FIRESTORE.CUSTOMERS}/${customer.id}`, updated);
      }

      let reopened = firstCompleted ? 1 : 0;
      let deletedWOs = Math.max(0, sData.completedWorkorders.length - 1);
      _setReopenStatus(
        `Refreshed - ${reopened} WO reopened, ${deletedWOs} WO(s) deleted, ` +
        `${sData.activeSales.length + sData.completedSales.length} sale(s) deleted, ${deletedTxns} txn(s) deleted`
      );
    } catch (err) {
      _setReopenStatus("Error: " + (err.message || err));
    }
  }

  async function handleFreshWorkorders() {
    _setReopenStatus("Resetting to fresh...");
    let basePath = `tenants/${tenantID}/stores/${storeID}`;
    try {
      // 1. Clear all 6 collections
      for (let col of COLLECTIONS) {
        let docs = sData[col.key];
        for (let d of docs) {
          await firestoreDelete(`${basePath}/${col.node}/${d.id}`);
        }
      }
      // 2. Write fresh data
      let freshMap = {
        activeSales: FRESH_WORKORDERS_DATA.activeSales,
        completedSales: FRESH_WORKORDERS_DATA.completedSales,
        openWorkorders: FRESH_WORKORDERS_DATA.openWorkorders,
        completedWorkorders: FRESH_WORKORDERS_DATA.completedWorkorders,
        customers: FRESH_WORKORDERS_DATA.customers,
        transactions: FRESH_WORKORDERS_DATA.transactions,
      };
      for (let col of COLLECTIONS) {
        let docs = freshMap[col.key] || [];
        for (let doc of docs) {
          await firestoreWrite(`${basePath}/${col.node}/${doc.id}`, doc);
        }
      }
      let total = Object.values(freshMap).reduce((sum, arr) => sum + arr.length, 0);
      _setReopenStatus(`Fresh - ${total} doc(s) written`);
    } catch (err) {
      _setReopenStatus("Error: " + (err.message || err));
    }
  }

  async function handleStartHere() {
    _setReopenStatus("Resetting to Start Here...");
    let basePath = `tenants/${tenantID}/stores/${storeID}`;
    try {
      for (let col of COLLECTIONS) {
        let docs = sData[col.key];
        for (let d of docs) {
          await firestoreDelete(`${basePath}/${col.node}/${d.id}`);
        }
      }
      let freshMap = {
        activeSales: START_HERE_DATA.activeSales,
        completedSales: START_HERE_DATA.completedSales,
        openWorkorders: START_HERE_DATA.openWorkorders,
        completedWorkorders: START_HERE_DATA.completedWorkorders,
        customers: START_HERE_DATA.customers,
        transactions: START_HERE_DATA.transactions,
      };
      for (let col of COLLECTIONS) {
        let docs = freshMap[col.key] || [];
        for (let doc of docs) {
          await firestoreWrite(`${basePath}/${col.node}/${doc.id}`, doc);
        }
      }
      let total = Object.values(freshMap).reduce((sum, arr) => sum + arr.length, 0);
      _setReopenStatus(`Start Here - ${total} doc(s) written`);
    } catch (err) {
      _setReopenStatus("Error: " + (err.message || err));
    }
  }

  async function handleClearAll() {
    await Promise.all(COLLECTIONS.flatMap((col) => {
      let basePath = `tenants/${tenantID}/stores/${storeID}/${col.node}`;
      return sData[col.key].map((d) => firestoreDelete(`${basePath}/${d.id}`));
    }));
  }

  async function handleClearCollection(col) {
    let docs = sData[col.key];
    if (!docs.length) return;
    let basePath = `tenants/${tenantID}/stores/${storeID}/${col.node}`;
    await Promise.all(docs.map((d) => firestoreDelete(`${basePath}/${d.id}`)));
  }

  const [sReopenStatus, _setReopenStatus] = useState("");

  function cleanWOForReopen(wo) {
    let cleaned = cloneDeep(wo);
    cleaned.paymentComplete = false;
    cleaned.paidOnMillis = "";
    cleaned.saleID = "";
    cleaned.activeSaleID = "";
    cleaned.status = "newly_created";
    cleaned.changeLog = (cleaned.changeLog || []).filter(
      (e) => !(e.field === "payment") &&
        !(e.action === "changed" && e.field === "status" && (e.to || "").toLowerCase().includes("paid"))
    );
    return cleaned;
  }

  async function restoreCreditsAndCleanCustomer(linkedSale, basePath) {
    let creditsApplied = [...(linkedSale.creditsApplied || []), ...(linkedSale.depositsApplied || [])];
    let customerID = linkedSale.customerID || "";
    if (!customerID) return;
    let customerPath = `${basePath}/${DB_NODES.FIRESTORE.CUSTOMERS}/${customerID}`;
    let customer = await firestoreRead(customerPath);
    if (!customer) return;
    let updated = cloneDeep(customer);
    for (let cred of creditsApplied) {
      let isCredit = cred.type === "credit";
      let arrKey = isCredit ? "credits" : "deposits";
      let arr = updated[arrKey] || [];
      let existing = arr.find((d) => d.id === cred.id);
      if (existing) {
        existing.amountCents = (existing.amountCents || 0) + cred.amount;
        existing.reservedCents = 0;
      } else {
        arr.push({
          id: cred.id, amountCents: cred.amount, reservedCents: 0,
          millis: Date.now(), method: "", note: "Restored by reopen",
          type: cred.type === "giftcard" ? "giftcard" : (isCredit ? "credit" : "deposit"),
          last4: "", text: isCredit ? "Restored by reopen" : "",
        });
        updated[arrKey] = arr;
      }
    }
    for (let dep of (updated.deposits || [])) {
      if ((dep.reservedCents || 0) > 0) dep.reservedCents = 0;
    }
    for (let cred of (updated.credits || [])) {
      if ((cred.reservedCents || 0) > 0) cred.reservedCents = 0;
    }
    updated.sales = (updated.sales || []).filter((sid) => sid !== linkedSale.id);
    await firestoreWrite(customerPath, updated);
  }

  async function handleCleanLogs() {
    _setReopenStatus("Cleaning...");
    let basePath = `tenants/${tenantID}/stores/${storeID}`;
    try {
      // 1. Delete all active sales
      for (let sale of sData.activeSales) {
        await firestoreDelete(`${basePath}/${DB_NODES.FIRESTORE.ACTIVE_SALES}/${sale.id}`);
      }
      // 2. Delete all completed sales
      for (let sale of sData.completedSales) {
        await firestoreDelete(`${basePath}/${DB_NODES.FIRESTORE.COMPLETED_SALES}/${sale.id}`);
      }
      // 3. Delete all completed workorders
      for (let wo of sData.completedWorkorders) {
        await firestoreDelete(`${basePath}/${DB_NODES.FIRESTORE.COMPLETED_WORKORDERS}/${wo.id}`);
      }
      // 4. Delete all transactions
      for (let txn of sData.transactions) {
        await firestoreDelete(`${basePath}/${DB_NODES.FIRESTORE.TRANSACTIONS}/${txn.id}`);
      }
      // 5. Clean open workorders (remove activeSaleID, saleID, payment fields)
      for (let wo of sData.openWorkorders) {
        if (wo.activeSaleID || wo.saleID || wo.paymentComplete) {
          let cleaned = cleanWOForReopen(wo);
          await firestoreWrite(`${basePath}/${DB_NODES.FIRESTORE.OPEN_WORKORDERS}/${cleaned.id}`, cleaned);
        }
      }
      // 6. Reconcile customers
      let openWOsByCustomer = {};
      for (let wo of sData.openWorkorders) {
        if (wo.customerID) {
          if (!openWOsByCustomer[wo.customerID]) openWOsByCustomer[wo.customerID] = [];
          openWOsByCustomer[wo.customerID].push(wo.id);
        }
      }
      let custUpdated = 0;
      for (let customer of sData.customers) {
        let updated = cloneDeep(customer);
        updated.workorders = openWOsByCustomer[customer.id] || [];
        updated.sales = [];
        updated.deposits = [];
        for (let cred of (updated.credits || [])) {
          if ((cred.reservedCents || 0) > 0) cred.reservedCents = 0;
        }
        await firestoreWrite(`${basePath}/${DB_NODES.FIRESTORE.CUSTOMERS}/${customer.id}`, updated);
        custUpdated++;
      }

      _setReopenStatus(
        `Done - ${sData.activeSales.length} active sale(s), ${sData.completedSales.length} closed sale(s), ` +
        `${sData.completedWorkorders.length} closed WO(s), ${sData.transactions.length} txn(s) removed, ` +
        `${custUpdated} customer(s) reconciled`
      );
    } catch (err) {
      _setReopenStatus("Error: " + (err.message || err));
    }
  }

  async function handleReopenFirst() {
    let firstWO = sData.completedWorkorders[0];
    if (!firstWO) {
      _setReopenStatus("No completed workorders");
      return;
    }
    _setReopenStatus("Reopening first...");
    let basePath = `tenants/${tenantID}/stores/${storeID}`;
    try {
      // Find the completed sale linked to this workorder via workorderIDs array or WO's saleID
      let linkedSale = sData.completedSales.find((s) => (s.workorderIDs || []).includes(firstWO.id));
      if (!linkedSale && firstWO.saleID) {
        linkedSale = sData.completedSales.find((s) => s.id === firstWO.saleID);
      }

      // 1. Restore deposits/credits and clean sale ID from customer
      if (linkedSale) {
        await restoreCreditsAndCleanCustomer(linkedSale, basePath);
      }

      // 2. Move the first completed workorder back to open-workorders (cleaned)
      let cleaned = cleanWOForReopen(firstWO);
      await firestoreWrite(`${basePath}/${DB_NODES.FIRESTORE.OPEN_WORKORDERS}/${cleaned.id}`, cleaned);
      await firestoreDelete(`${basePath}/${DB_NODES.FIRESTORE.COMPLETED_WORKORDERS}/${firstWO.id}`);
      let reopenedCount = 1;

      // 3. If sale is a combined sale, also reopen all sibling WOs
      if (linkedSale) {
        let siblingIDs = (linkedSale.workorderIDs || []).filter((id) => id !== firstWO.id);
        for (let sibID of siblingIDs) {
          let sibWO = sData.completedWorkorders.find((w) => w.id === sibID);
          if (sibWO) {
            let sibCleaned = cleanWOForReopen(sibWO);
            await firestoreWrite(`${basePath}/${DB_NODES.FIRESTORE.OPEN_WORKORDERS}/${sibCleaned.id}`, sibCleaned);
            await firestoreDelete(`${basePath}/${DB_NODES.FIRESTORE.COMPLETED_WORKORDERS}/${sibWO.id}`);
            reopenedCount++;
          }
        }
      }

      // 4. Delete linked sale and its transactions (looked up via sale.transactionIDs)
      let deletedTxnCount = 0;
      if (linkedSale) {
        await firestoreDelete(`${basePath}/${DB_NODES.FIRESTORE.COMPLETED_SALES}/${linkedSale.id}`);
        let activeSale = sData.activeSales.find((s) => s.id === linkedSale.id);
        if (activeSale) await firestoreDelete(`${basePath}/${DB_NODES.FIRESTORE.ACTIVE_SALES}/${activeSale.id}`);
        // Delete transactions using the sale's transactionIDs array
        let txnIDs = linkedSale.transactionIDs || [];
        for (let txnID of txnIDs) {
          await firestoreDelete(`${basePath}/${DB_NODES.FIRESTORE.TRANSACTIONS}/${txnID}`);
          deletedTxnCount++;
        }
        _setReopenStatus(`Done - ${reopenedCount} WO(s) reopened, 1 sale removed, ${deletedTxnCount} txn(s) deleted`);
      } else {
        _setReopenStatus("Done - 1 WO reopened (no linked sale found)");
      }
    } catch (err) {
      _setReopenStatus("Error: " + (err.message || err));
    }
  }

  async function handleReopenAll() {
    let completedWOs = sData.completedWorkorders;
    let completedSales = sData.completedSales;
    let transactions = sData.transactions;
    if (completedWOs.length === 0 && completedSales.length === 0) {
      _setReopenStatus("Nothing to reopen");
      return;
    }
    _setReopenStatus("Reopening...");
    let basePath = `tenants/${tenantID}/stores/${storeID}`;

    try {
      // 1. Restore deposits/credits and clean sale ID from customer
      for (let sale of completedSales) {
        await restoreCreditsAndCleanCustomer(sale, basePath);
      }

      // 2. Clear any remaining deposit reservations on all customers (from active sales)
      for (let customer of sData.customers) {
        let needsUpdate = false;
        let updated = cloneDeep(customer);
        for (let dep of (updated.deposits || [])) {
          if ((dep.reservedCents || 0) > 0) { dep.reservedCents = 0; needsUpdate = true; }
        }
        for (let cred of (updated.credits || [])) {
          if ((cred.reservedCents || 0) > 0) { cred.reservedCents = 0; needsUpdate = true; }
        }
        if (needsUpdate) {
          await firestoreWrite(`${basePath}/${DB_NODES.FIRESTORE.CUSTOMERS}/${customer.id}`, updated);
        }
      }

      // 3. Move completed workorders back to open-workorders (cleaned)
      for (let wo of completedWOs) {
        let cleaned = cleanWOForReopen(wo);
        await firestoreWrite(`${basePath}/${DB_NODES.FIRESTORE.OPEN_WORKORDERS}/${cleaned.id}`, cleaned);
        await firestoreDelete(`${basePath}/${DB_NODES.FIRESTORE.COMPLETED_WORKORDERS}/${wo.id}`);
      }

      // 4. Also clean any open workorders that have stale sale references
      for (let wo of sData.openWorkorders) {
        if (wo.activeSaleID || wo.saleID || wo.paymentComplete) {
          let cleaned = cleanWOForReopen(wo);
          await firestoreWrite(`${basePath}/${DB_NODES.FIRESTORE.OPEN_WORKORDERS}/${cleaned.id}`, cleaned);
        }
      }

      // 5. Delete all completed sales, active sales, and transactions
      for (let sale of completedSales) {
        await firestoreDelete(`${basePath}/${DB_NODES.FIRESTORE.COMPLETED_SALES}/${sale.id}`);
      }
      for (let sale of sData.activeSales) {
        await firestoreDelete(`${basePath}/${DB_NODES.FIRESTORE.ACTIVE_SALES}/${sale.id}`);
      }
      for (let txn of transactions) {
        await firestoreDelete(`${basePath}/${DB_NODES.FIRESTORE.TRANSACTIONS}/${txn.id}`);
      }

      let totalWOs = completedWOs.length + sData.openWorkorders.filter((w) => w.activeSaleID || w.saleID).length;
      _setReopenStatus(`Done - ${totalWOs} WO(s) cleaned, ${completedSales.length} sale(s) removed, ${transactions.length} txn(s) deleted`);
    } catch (err) {
      _setReopenStatus("Error: " + (err.message || err));
    }
  }

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <button
          type="button"
          onClick={() => { window.location.href = ROUTES.home; }}
          className={styles.toolbarBtnBack}
          style={{ color: C.text }}
        >
          Back
        </button>
        <button
          type="button"
          onClick={handleReopenFirst}
          className={styles.toolbarBtn}
          style={{ backgroundColor: C.orange }}
        >
          Reopen First
        </button>
        <button
          type="button"
          onClick={handleReopenAll}
          className={styles.toolbarBtn}
          style={{ backgroundColor: C.orange }}
        >
          Reopen All
        </button>
        <button
          type="button"
          onClick={handleCleanLogs}
          className={styles.toolbarBtn}
          style={{ backgroundColor: "rgb(103, 124, 231)" }}
        >
          Clean Logs
        </button>
        <button
          type="button"
          onClick={handleRefreshState}
          className={styles.toolbarBtn}
          style={{ backgroundColor: "rgb(0, 128, 128)" }}
        >
          Refresh State
        </button>
        <button
          type="button"
          onClick={handleFreshWorkorders}
          className={styles.toolbarBtn}
          style={{ backgroundColor: "rgb(34, 139, 34)" }}
        >
          Fresh workorders
        </button>
        <button
          type="button"
          onClick={handleStartHere}
          className={styles.toolbarBtn}
          style={{ backgroundColor: "rgb(75, 0, 130)" }}
        >
          Start Here
        </button>
        <p className={styles.title} style={{ color: C.text }}>Database Viewer</p>
        <button
          type="button"
          onClick={() => {
            let output = COLLECTIONS.map((col) => {
              return `=== ${col.label} (${sData[col.key].length}) ===\n${JSON.stringify(sData[col.key], null, 2)}`;
            }).join("\n\n");
            copyToClipboard(NOTIFY_HINT + "Examine the objects from the database after the transaction. Ignore change logs. summarize what happened, cross-check fields for errors, and make sure that any fields that were supposed to move or delete or change did so: " + output);
          }}
          className={styles.toolbarBtn}
          style={{ backgroundColor: C.blue }}
        >
          Summarize
        </button>
        <button
          type="button"
          onClick={() => {
            let output = COLLECTIONS.map((col) => {
              return `=== ${col.label} (${sData[col.key].length}) ===\n${JSON.stringify(sData[col.key], null, 2)}`;
            }).join("\n\n");
            copyToClipboard(NOTIFY_HINT + "Examine the db contents. Cross-check for errors in math and field updates. You must cross-reference every field pre and post-operation, across every object. Summarize the action you saw take place and report any errors. for errors, provide a numbered list of each error accompanied with the best possible solution for us to discuss. " + output);
          }}
          className={styles.toolbarBtn}
          style={{ backgroundColor: C.purple }}
        >
          Compare
        </button>
        <button
          type="button"
          onClick={() => {
            let output = COLLECTIONS.map((col) => `=== ${col.label} ===\n${JSON.stringify(sData[col.key], null, 2)}`).join("\n\n");
            copyToClipboard(NOTIFY_HINT + output);
          }}
          className={styles.toolbarBtn}
          style={{ backgroundColor: C.green }}
        >
          Contents Only
        </button>
        <button
          type="button"
          onClick={() => {
            let output = COLLECTIONS.map((col) => `=== ${col.label} (${sData[col.key].length}) ===\n${JSON.stringify(sData[col.key], null, 2)}`).join("\n\n");
            copyToClipboard(NOTIFY_HINT + "This is the current state of the database. Use it as a starting point for the upcoming tests of workorder changes, checkout screen and refund screen as well as any and other other changes to any object field. Ignore any logging issues you find, but check the logging moving forward against the logs at this point in time. Analyze it and report any inconsistencies or relics from previous delete operations, and summarize what has transpired." + output);
          }}
          className={styles.toolbarBtn}
          style={{ backgroundColor: C.orange }}
        >
          Starting Point
        </button>
        <button
          type="button"
          onClick={handleClearAll}
          className={styles.toolbarBtn}
          style={{ backgroundColor: C.red, marginRight: 0 }}
        >
          Clear All
        </button>
      </div>
      <div className={styles.gridArea}>
        {[0, 1].map((row) => (
          <div key={row} className={styles.gridRow}>
            {COLLECTIONS.slice(row * 3, row * 3 + 3).map((col) => {
              let docs = sData[col.key];
              return (
                <div key={col.key} className={styles.collectionCard}>
                  <div className={styles.collectionHeader} style={{ backgroundColor: C.surfaceAlt }}>
                    <p className={styles.collectionTitle} style={{ color: C.text }}>{col.label} ({docs.length})</p>
                    <div className={styles.headerBtnRow}>
                      <button
                        type="button"
                        onClick={() => {
                          let output = `=== ${col.label} (${docs.length}) ===\n${JSON.stringify(docs, null, 2)}`;
                          copyToClipboard(NOTIFY_HINT + output);
                        }}
                        className={styles.smallBtn}
                        style={{ backgroundColor: C.blue }}
                      >
                        Copy
                      </button>
                      <button
                        type="button"
                        onClick={() => handleClearCollection(col)}
                        className={styles.smallBtn}
                        style={{ backgroundColor: C.red }}
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  <div className={styles.scrollArea}>
                    <pre className={styles.jsonText} style={{ color: C.text }}>
                      {JSON.stringify(docs, null, 2)}
                    </pre>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/* eslint-disable */

import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native-web";
import { C } from "../styles";
import { gray } from "../utils";
import { useSettingsStore } from "../stores";
import { firestoreSubscribeCollection, firestoreDelete, firestoreWrite, firestoreRead } from "../db_calls";
import { DB_NODES } from "../constants";
import { ROUTES } from "../routes";
import { cloneDeep } from "lodash";
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
    cleaned.endedOnMillis = "";
    cleaned.status = "newly_created";
    cleaned.changeLog = (cleaned.changeLog || []).filter(
      (e) => !(e.field === "payment") &&
        !(e.action === "changed" && e.field === "status" && (e.to || "").toLowerCase().includes("paid"))
    );
    return cleaned;
  }

  async function restoreCreditsAndCleanCustomer(linkedSale, basePath) {
    let creditsApplied = linkedSale.creditsApplied || [];
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
      let existing = arr.find((d) => d.id === cred.creditId);
      if (existing) {
        existing.amountCents = (existing.amountCents || 0) + cred.amount;
        existing.reservedCents = 0;
      } else {
        arr.push({
          id: cred.creditId, amountCents: cred.amount, reservedCents: 0,
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
    let openWOs = sData.openWorkorders;
    if (!openWOs.length) { _setReopenStatus("No open workorders"); return; }
    _setReopenStatus("Cleaning logs...");
    let basePath = `tenants/${tenantID}/stores/${storeID}`;
    try {
      let cleaned = 0;
      for (let wo of openWOs) {
        let original = wo.changeLog || [];
        let filtered = original.filter(
          (e) => !(e.field === "payment") &&
            !(e.action === "changed" && e.field === "status" && (e.to || "").toLowerCase().includes("paid"))
        );
        if (filtered.length !== original.length) {
          let updated = cloneDeep(wo);
          updated.changeLog = filtered;
          await firestoreWrite(`${basePath}/${DB_NODES.FIRESTORE.OPEN_WORKORDERS}/${wo.id}`, updated);
          cleaned++;
        }
      }
      _setReopenStatus(cleaned ? `Done - cleaned logs on ${cleaned} WO(s)` : "No financial logs found");
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
    <View style={{ height: "100vh", overflow: "hidden", backgroundColor: C.backgroundWhite }}>
      <View style={{ flexDirection: "row", alignItems: "center", padding: 10, borderBottomWidth: 1, borderBottomColor: gray(0.15) }}>
        <TouchableOpacity
          onPress={() => { window.location.href = ROUTES.home; }}
          style={{ paddingVertical: 6, paddingHorizontal: 14, borderRadius: 5, borderWidth: 1, borderColor: gray(0.3), marginRight: 16 }}
        >
          <Text style={{ fontSize: 14, color: C.text }}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleReopenFirst}
          style={{ paddingVertical: 6, paddingHorizontal: 14, borderRadius: 5, backgroundColor: C.orange, marginRight: 8 }}
        >
          <Text style={{ fontSize: 14, color: "white", fontWeight: "600" }}>Reopen First</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleReopenAll}
          style={{ paddingVertical: 6, paddingHorizontal: 14, borderRadius: 5, backgroundColor: C.orange, marginRight: 8 }}
        >
          <Text style={{ fontSize: 14, color: "white", fontWeight: "600" }}>Reopen All</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleCleanLogs}
          style={{ paddingVertical: 6, paddingHorizontal: 14, borderRadius: 5, backgroundColor: "rgb(103, 124, 231)", marginRight: 8 }}
        >
          <Text style={{ fontSize: 14, color: "white", fontWeight: "600" }}>Clean Logs</Text>
        </TouchableOpacity>
        {!!sReopenStatus && (
          <Text style={{ fontSize: 12, color: sReopenStatus.startsWith("Error") ? C.red : C.green, fontWeight: "600", marginRight: 8 }}>
            {sReopenStatus}
          </Text>
        )}
        <Text style={{ fontSize: 18, fontWeight: "700", color: C.text, flex: 1 }}>Database Viewer</Text>
        <TouchableOpacity
          onPress={() => {
            let output = COLLECTIONS.map((col) => {
              return `=== ${col.label} (${sData[col.key].length}) ===\n${JSON.stringify(sData[col.key], null, 2)}`;
            }).join("\n\n");
            navigator.clipboard.writeText(NOTIFY_HINT + "Examine the objects from the database after the transaction. Ignore change logs. summarize what happened, cross-check fields for errors, and make sure that any fields that were supposed to move or delete or change did so: " + output);
          }}
          style={{ paddingVertical: 6, paddingHorizontal: 14, borderRadius: 5, backgroundColor: C.blue, marginRight: 8 }}
        >
          <Text style={{ fontSize: 14, color: "white", fontWeight: "600" }}>Summarize</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            let output = COLLECTIONS.map((col) => {
              return `=== ${col.label} (${sData[col.key].length}) ===\n${JSON.stringify(sData[col.key], null, 2)}`;
            }).join("\n\n");
            navigator.clipboard.writeText(NOTIFY_HINT + "Examine the db contents. Cross-check for errors in math and field updates. You must cross-reference every field pre and post-operation, across every object. Summarize the action you saw take place and report any errors. for errors, provide a numbered list of each error accompanied with the best possible solution for us to discuss. " + output);
          }}
          style={{ paddingVertical: 6, paddingHorizontal: 14, borderRadius: 5, backgroundColor: C.purple, marginRight: 8 }}
        >
          <Text style={{ fontSize: 14, color: "white", fontWeight: "600", backgroundColor: 'green' }}>Compare</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            let output = COLLECTIONS.map((col) => `=== ${col.label} ===\n${JSON.stringify(sData[col.key], null, 2)}`).join("\n\n");
            navigator.clipboard.writeText(NOTIFY_HINT + output);
          }}
          style={{ paddingVertical: 6, paddingHorizontal: 14, borderRadius: 5, backgroundColor: C.green, marginRight: 8 }}
        >
          <Text style={{ fontSize: 14, color: "white", fontWeight: "600" }}>Contents Only</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            let output = COLLECTIONS.map((col) => `=== ${col.label} (${sData[col.key].length}) ===\n${JSON.stringify(sData[col.key], null, 2)}`).join("\n\n");
            navigator.clipboard.writeText(NOTIFY_HINT + "This is the current state of the database. Use it as a starting point for the upcoming tests of workorder changes, checkout screen and refund screen as well as any and other other changes to any object field. Analyze it and report any inconsistencies or relics from previous delete operations, and summarize what has transpired." + output);
          }}
          style={{ paddingVertical: 6, paddingHorizontal: 14, borderRadius: 5, backgroundColor: C.orange, marginRight: 8 }}
        >
          <Text style={{ fontSize: 14, color: "white", fontWeight: "600" }}>Starting Point</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleClearAll}
          style={{ paddingVertical: 6, paddingHorizontal: 14, borderRadius: 5, backgroundColor: C.red }}
        >
          <Text style={{ fontSize: 14, color: "white", fontWeight: "600" }}>Clear All</Text>
        </TouchableOpacity>
      </View>
      <View style={{ flex: 1, padding: 8 }}>
        {[0, 1].map((row) => (
          <View key={row} style={{ flex: 1, flexDirection: "row" }}>
            {COLLECTIONS.slice(row * 3, row * 3 + 3).map((col) => {
              let docs = sData[col.key];
              return (
                <View key={col.key} style={{ flex: 1, margin: 4, borderWidth: 1, borderColor: gray(0.2), borderRadius: 6, overflow: "hidden" }}>
                  <View style={{ backgroundColor: gray(0.08), paddingVertical: 6, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: gray(0.2), flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={{ fontSize: 13, fontWeight: "600", color: C.text }}>{col.label} ({docs.length})</Text>
                    <View style={{ flexDirection: "row", gap: 4 }}>
                      <TouchableOpacity
                        onPress={() => {
                          let output = `=== ${col.label} (${docs.length}) ===\n${JSON.stringify(docs, null, 2)}`;
                          navigator.clipboard.writeText(NOTIFY_HINT + output);
                        }}
                        style={{ paddingVertical: 2, paddingHorizontal: 8, borderRadius: 4, backgroundColor: C.blue }}
                      >
                        <Text style={{ fontSize: 11, color: "white" }}>Copy</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleClearCollection(col)}
                        style={{ paddingVertical: 2, paddingHorizontal: 8, borderRadius: 4, backgroundColor: C.red }}
                      >
                        <Text style={{ fontSize: 11, color: "white" }}>Clear</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <ScrollView style={{ flex: 1, padding: 6 }}>
                    <Text style={{ fontSize: 11, fontFamily: "monospace", color: C.text, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                      {JSON.stringify(docs, null, 2)}
                    </Text>
                  </ScrollView>
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

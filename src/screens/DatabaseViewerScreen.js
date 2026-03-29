/* eslint-disable */

import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native-web";
import { C } from "../styles";
import { gray } from "../utils";
import { useSettingsStore } from "../stores";
import { firestoreSubscribeCollection, firestoreDelete } from "../db_calls";
import { DB_NODES } from "../constants";
import { ROUTES } from "../routes";

const COLLECTIONS = [
  { key: "activeSales", label: "active-sales", node: DB_NODES.FIRESTORE.ACTIVE_SALES },
  { key: "completedSales", label: "completed-sales", node: DB_NODES.FIRESTORE.COMPLETED_SALES },
  { key: "openWorkorders", label: "open-workorders", node: DB_NODES.FIRESTORE.OPEN_WORKORDERS },
  { key: "completedWorkorders", label: "completed-workorders", node: DB_NODES.FIRESTORE.COMPLETED_WORKORDERS },
  { key: "customers", label: "customers", node: DB_NODES.FIRESTORE.CUSTOMERS },
];

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

  return (
    <View style={{ height: "100vh", overflow: "hidden", backgroundColor: C.backgroundWhite }}>
      <View style={{ flexDirection: "row", alignItems: "center", padding: 10, borderBottomWidth: 1, borderBottomColor: gray(0.15) }}>
        <TouchableOpacity
          onPress={() => { window.location.href = ROUTES.home; }}
          style={{ paddingVertical: 6, paddingHorizontal: 14, borderRadius: 5, borderWidth: 1, borderColor: gray(0.3), marginRight: 16 }}
        >
          <Text style={{ fontSize: 14, color: C.text }}>Back</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: "700", color: C.text, flex: 1 }}>Database Viewer</Text>
        <TouchableOpacity
          onPress={() => {
            let output = COLLECTIONS.map((col) => {
              return `=== ${col.label} (${sData[col.key].length}) ===\n${JSON.stringify(sData[col.key], null, 2)}`;
            }).join("\n\n");
            navigator.clipboard.writeText("Examine the objects from the database after the transaction. summarize what happened, cross-check fields for errors, and make sure that any fields that were supposed to move or delete or change did so: " + output);
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
            navigator.clipboard.writeText("Examine the db contents. Cross-check for errors in math and field updates. summarize the action you saw take place. then cross-check with the previous object to find an errors from one db state to the next for the transaction. " + output);
          }}
          style={{ paddingVertical: 6, paddingHorizontal: 14, borderRadius: 5, backgroundColor: C.purple, marginRight: 8 }}
        >
          <Text style={{ fontSize: 14, color: "white", fontWeight: "600", backgroundColor: 'green' }}>Compare</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            let output = COLLECTIONS.map((col) => `=== ${col.label} ===\n${JSON.stringify(sData[col.key], null, 2)}`).join("\n\n");
            navigator.clipboard.writeText(output);
          }}
          style={{ paddingVertical: 6, paddingHorizontal: 14, borderRadius: 5, backgroundColor: C.green, marginRight: 8 }}
        >
          <Text style={{ fontSize: 14, color: "white", fontWeight: "600" }}>Contents Only</Text>
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
                          navigator.clipboard.writeText(output);
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

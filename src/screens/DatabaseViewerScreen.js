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

const FRESH_WORKORDERS_DATA = {
  activeSales: [],
  completedSales: [],
  completedWorkorders: [],
  transactions: [],
  openWorkorders: [
    {"id":"1250000000008","hasNewSMS":false,"customerID":"b3cffc73-e0c0-4540-b1ad-1eb0578f88b5","customerContactRestriction":"email","partToBeOrdered":false,"customerLast":"Hieb","endedOnMillis":"","workorderLines":[{"warranty":false,"inventoryItem":{"cost":919,"salePrice":0,"customLabor":false,"primaryBarcode":"0727746323980","informalName":"","minutes":0,"category":"Part","brand":"","barcodes":[],"price":1878,"customPart":false,"id":"0727746323980","formalName":"TUBE SUNLT 26x2.75-3.00 SV32 FFW73mm"},"qty":1,"id":"ed6341b5-9dad-4dc6-a352-5065e0048f55","intakeNotes":"","useSalePrice":false,"receiptNotes":"","discountObj":""},{"inventoryItem":{"barcodes":[],"price":939,"customPart":false,"id":"0609149894831","formalName":"TUBE SUNLT 700x35-43 SV48mm FFW33mm","minutes":0,"category":"Part","brand":"","cost":289,"customLabor":false,"salePrice":0,"primaryBarcode":"0609149894831","informalName":""},"warranty":false,"intakeNotes":"","id":"83f308f3-ffe0-448b-90f6-68a34d461137","useSalePrice":false,"qty":1,"discountObj":"","receiptNotes":""},{"receiptNotes":"","discountObj":"","qty":2,"id":"d371a46d-5cbc-4167-802d-a83da807f07e","useSalePrice":false,"intakeNotes":"","warranty":false,"inventoryItem":{"minutes":0,"category":"Part","brand":"","barcodes":[],"customPart":false,"price":4000,"id":"0047853643756","formalName":"TIRE KEN KWICK TRAX 700x28 BK/BK/REF SRC/ICAP/60 WIRE 100psi","cost":2149,"salePrice":0,"customLabor":false,"primaryBarcode":"0047853643756","informalName":""}},{"receiptNotes":"","discountObj":{"name":"50% Off Item","type":"%","id":"1333k","newPrice":2500,"savings":2500,"value":"50"},"qty":2,"useSalePrice":false,"id":"efa92d35-1d94-4cd9-b0b6-8903f0313d52","intakeNotes":"","warranty":false,"inventoryItem":{"cost":1850,"customLabor":false,"salePrice":0,"informalName":"","primaryBarcode":"0072774596072","price":2500,"customPart":false,"barcodes":[],"id":"0072774596072","formalName":"TIRE SUNLT 26x2.25 BK/BK CRUISER K912 w/SUN LOGO WIRE","minutes":0,"brand":"","category":"Part"}},{"discountObj":"","receiptNotes":"","id":"5799981c-741b-45c5-8572-3c60706d5a8a","intakeNotes":"","useSalePrice":false,"qty":1,"inventoryItem":{"cost":1089,"customLabor":false,"salePrice":0,"primaryBarcode":"0072774600083","informalName":"","barcodes":[],"customPart":false,"price":3000,"id":"0072774600083","formalName":"TIRE SUNLT 700x38 BK/BK HYBRID K189 WIRE","minutes":0,"category":"Part","brand":""},"warranty":false},{"qty":1,"intakeNotes":"","id":"73ae3784-0fe0-4e72-899f-13578d9ab295","useSalePrice":false,"receiptNotes":"","discountObj":"","warranty":false,"inventoryItem":{"cost":249,"customLabor":false,"salePrice":0,"primaryBarcode":"0727740637890","informalName":"","barcodes":[],"customPart":false,"price":939,"id":"0727740637890","formalName":"TUBE SUNLT 700x28-35 (27x1-1/8x1-1/4) SV32 FFW30mm","minutes":0,"category":"Part","brand":""}},{"inventoryItem":{"primaryBarcode":"0330312449090","informalName":"","customLabor":false,"salePrice":0,"cost":249,"formalName":"TUBE SUNLT UTILIT 20x1.50-1.95 SV48 FFW 39mm","id":"0330312449090","barcodes":[],"customPart":false,"price":939,"category":"Part","brand":"","minutes":0},"warranty":false,"intakeNotes":"","id":"f7dcc26e-e209-4ddd-a352-4921c8f9727d","useSalePrice":false,"qty":1,"discountObj":"","receiptNotes":""}],"brand":"","description":"","activeSaleID":"","customerLandline":"","saleID":"","customerFirst":"Fritz","taxFreeReceiptNote":"","customerNotes":[],"partOrderEstimateMillis":"","waitTimeEstimateLabel":"","workorderNumber":"W12500APR26","startedOnMillis":1775268823968,"customerEmail":"hieb.fritz@gmail.com","internalNotes":[],"status":"finished","partOrderedMillis":"","color2":{"textColor":"","backgroundColor":"","label":""},"waitTime":"","media":[],"customerLanguage":"English","customerPin":"908","paidOnMillis":"","taxFree":false,"customerCell":"2393369177","paymentComplete":false,"changeLog":["Started by: Fritz Hieb",{"field":"status","to":"Finished","timestamp":1775268828419,"from":"Newly Created","user":"System","action":"changed"},{"to":"TUBE SUNLT 26x2.75-3.00 SV32 FFW73mm","field":"workorderLines","timestamp":1775268833697,"user":"Fritz","action":"added"},{"to":"TUBE SUNLT 700x35-43 SV48mm FFW33mm","field":"workorderLines","timestamp":1775268836136,"user":"Fritz","action":"added"},{"timestamp":1775268841923,"field":"workorderLines","to":"TIRE KEN KWICK TRAX 700x28 BK/BK/REF SRC/ICAP/60 WIRE 100psi","action":"added","user":"Fritz"},{"user":"Fritz","action":"added","field":"workorderLines","to":"TIRE SUNLT 26x2.25 BK/BK CRUISER K912 w/SUN LOGO WIRE","timestamp":1775268845473},{"field":"workorderLines","to":"TIRE SUNLT 700x38 BK/BK HYBRID K189 WIRE","timestamp":1775268850058,"user":"Fritz","action":"added"},{"to":"TUBE SUNLT 700x28-35 (27x1-1/8x1-1/4) SV32 FFW30mm","field":"workorderLines","timestamp":1775268856563,"user":"Fritz","action":"added"},{"user":"Fritz","action":"added","field":"workorderLines","to":"TUBE SUNLT UTILIT 20x1.50-1.95 SV48 FFW 39mm","timestamp":1775268861661},{"user":"Fritz","action":"changed","from":"1","detail":"qty","to":"2","field":"workorderLines","item":"TIRE SUNLT 26x2.25 BK/BK CRUISER K912 w/SUN LOGO WIRE","timestamp":1775269215353},{"user":"Fritz","action":"changed","from":"1","detail":"qty","to":"2","item":"TIRE KEN KWICK TRAX 700x28 BK/BK/REF SRC/ICAP/60 WIRE 100psi","field":"workorderLines","timestamp":1775269223605},{"user":"Fritz","action":"changed","to":"50% Off Item","item":"TIRE SUNLT 26x2.25 BK/BK CRUISER K912 w/SUN LOGO WIRE","field":"workorderLines","timestamp":1775269232910,"from":"none","detail":"discount"}],"archived":false,"partOrdered":"","startedBy":"Fritz Hieb","color1":{"textColor":"","label":"","backgroundColor":""},"partSource":""},
    {"id":"1350000000005","archived":false,"partOrdered":"","partSource":"","color1":{"backgroundColor":"","label":"","textColor":""},"startedBy":"Fritz Hieb","partOrderedMillis":"","status":"newly_created","internalNotes":[],"media":[],"color2":{"textColor":"","label":"","backgroundColor":""},"waitTime":"","changeLog":["Started by: Fritz Hieb",{"action":"added","user":"Fritz","timestamp":1775269035868,"field":"workorderLines","to":"TUBE SUNLT 26x2.75-3.00 SV32 FFW73mm"},{"user":"Fritz","action":"added","field":"workorderLines","to":"TUBE SUNLT 700x35-43 SV48mm FFW33mm","timestamp":1775269039069},{"user":"Fritz","action":"added","field":"workorderLines","to":"TIRE KEN KWICK TRAX 700x28 BK/BK/REF SRC/ICAP/60 WIRE 100psi","timestamp":1775269042864},{"field":"workorderLines","to":"TIRE SUNLT 26x2.25 BK/BK CRUISER K912 w/SUN LOGO WIRE","timestamp":1775269046941,"user":"Fritz","action":"added"},{"to":"TIRE SUNLT 700x38 BK/BK HYBRID K189 WIRE","field":"workorderLines","timestamp":1775269052526,"user":"Fritz","action":"added"},{"user":"Fritz","action":"changed","to":"2","item":"TIRE SUNLT 26x2.25 BK/BK CRUISER K912 w/SUN LOGO WIRE","field":"workorderLines","timestamp":1775269057872,"from":"1","detail":"qty"},{"timestamp":1775269065284,"field":"workorderLines","to":"TUBE SUNLT 700x28-35 (27x1-1/8x1-1/4) SV32 FFW30mm","action":"added","user":"Fritz"},{"to":"TUBE SUNLT UTILIT 20x1.50-1.95 SV48 FFW 39mm","field":"workorderLines","timestamp":1775269070444,"user":"Fritz","action":"added"},{"item":"TUBE SUNLT 700x28-35 (27x1-1/8x1-1/4) SV32 FFW30mm","field":"workorderLines","to":"40% Off Item","timestamp":1775269077799,"from":"none","detail":"discount","user":"Fritz","action":"changed"},{"action":"changed","user":"Fritz","timestamp":1775269085133,"to":"2","field":"workorderLines","item":"TUBE SUNLT 700x28-35 (27x1-1/8x1-1/4) SV32 FFW30mm","detail":"qty","from":"1"}],"paymentComplete":false,"customerCell":"2393369177","taxFree":false,"customerLanguage":"English","paidOnMillis":"","customerPin":"776","customerFirst":"Fritz","saleID":"","customerLandline":"","customerNotes":[],"taxFreeReceiptNote":"","workorderNumber":"W13500APR26","waitTimeEstimateLabel":"","partOrderEstimateMillis":"","startedOnMillis":1775269024302,"customerEmail":"hieb.fritz@gmail.com","customerContactRestriction":"email","customerID":"b3cffc73-e0c0-4540-b1ad-1eb0578f88b5","hasNewSMS":false,"workorderLines":[{"qty":1,"id":"954a31fe-aea2-467a-b61a-bba9d0784dcb","intakeNotes":"","useSalePrice":false,"receiptNotes":"","discountObj":"","warranty":false,"inventoryItem":{"primaryBarcode":"0727746323980","informalName":"","customLabor":false,"salePrice":0,"cost":919,"formalName":"TUBE SUNLT 26x2.75-3.00 SV32 FFW73mm","id":"0727746323980","barcodes":[],"customPart":false,"price":1878,"brand":"","category":"Part","minutes":0}},{"receiptNotes":"","discountObj":"","qty":1,"intakeNotes":"","useSalePrice":false,"id":"e8a519dd-8ec1-4ce8-806f-6316c0daec33","warranty":false,"inventoryItem":{"customLabor":false,"salePrice":0,"cost":289,"primaryBarcode":"0609149894831","informalName":"","minutes":0,"brand":"","category":"Part","id":"0609149894831","barcodes":[],"customPart":false,"price":939,"formalName":"TUBE SUNLT 700x35-43 SV48mm FFW33mm"}},{"warranty":false,"inventoryItem":{"barcodes":[],"price":4000,"customPart":false,"id":"0047853643756","formalName":"TIRE KEN KWICK TRAX 700x28 BK/BK/REF SRC/ICAP/60 WIRE 100psi","minutes":0,"category":"Part","brand":"","cost":2149,"salePrice":0,"customLabor":false,"primaryBarcode":"0047853643756","informalName":""},"qty":1,"useSalePrice":false,"id":"05bf69b7-119c-4941-87ba-8f6920395602","intakeNotes":"","receiptNotes":"","discountObj":""},{"warranty":false,"inventoryItem":{"brand":"","category":"Part","minutes":0,"formalName":"TIRE SUNLT 26x2.25 BK/BK CRUISER K912 w/SUN LOGO WIRE","barcodes":[],"price":2500,"customPart":false,"id":"0072774596072","primaryBarcode":"0072774596072","informalName":"","cost":1850,"salePrice":0,"customLabor":false},"receiptNotes":"","discountObj":"","qty":2,"useSalePrice":false,"intakeNotes":"","id":"fb20949c-4bc3-4e04-86bb-18ad1ec9042e"},{"qty":1,"id":"41fafa82-a78c-4363-b99f-a2d79e5a5f73","useSalePrice":false,"intakeNotes":"","receiptNotes":"","discountObj":"","warranty":false,"inventoryItem":{"cost":1089,"customLabor":false,"salePrice":0,"primaryBarcode":"0072774600083","informalName":"","minutes":0,"category":"Part","brand":"","barcodes":[],"customPart":false,"price":3000,"id":"0072774600083","formalName":"TIRE SUNLT 700x38 BK/BK HYBRID K189 WIRE"}},{"warranty":false,"inventoryItem":{"minutes":0,"brand":"","category":"Part","id":"0727740637890","customPart":false,"price":939,"barcodes":[],"formalName":"TUBE SUNLT 700x28-35 (27x1-1/8x1-1/4) SV32 FFW30mm","salePrice":0,"customLabor":false,"cost":249,"informalName":"","primaryBarcode":"0727740637890"},"qty":2,"intakeNotes":"","id":"2530388d-2176-40f4-b0c2-6654edd13b37","useSalePrice":false,"receiptNotes":"","discountObj":{"value":"40","name":"40% Off Item","newPrice":1127,"type":"%","id":"3943933","savings":751}},{"inventoryItem":{"minutes":0,"category":"Part","brand":"","id":"0330312449090","barcodes":[],"customPart":false,"price":939,"formalName":"TUBE SUNLT UTILIT 20x1.50-1.95 SV48 FFW 39mm","salePrice":0,"customLabor":false,"cost":249,"primaryBarcode":"0330312449090","informalName":""},"warranty":false,"discountObj":"","receiptNotes":"","intakeNotes":"","useSalePrice":false,"id":"d9c0bd0a-5d2f-4de4-9c38-9c8024514c47","qty":1}],"endedOnMillis":"","partToBeOrdered":false,"customerLast":"Hieb","description":"","brand":"","activeSaleID":""},
  ],
  customers: [
    {"id":"b3cffc73-e0c0-4540-b1ad-1eb0578f88b5","deposits":[],"unit":"#101","first":"Fritz","sales":[],"payments":[],"state":"FL","contactRestriction":"email","customerCell":"2393369177","last":"Hieb","gatedCommunity":true,"millisCreated":1774882480742,"interactionRating":"","language":"English","addressNotes":"","workorders":["1250000000008","1350000000005"],"previousBikes":[],"customerLandline":"","credits":[{"text":"test credit","amountCents":1500,"reservedCents":0,"id":"3587818371920","millis":1775178911702}],"city":"Bonita Springs","notes":"Bonita Bay","streetAddress":"13660 Bonita Beach Rd SE","email":"hieb.fritz@gmail.com","zip":"34135"},
  ],
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
        <TouchableOpacity
          onPress={handleFreshWorkorders}
          style={{ paddingVertical: 6, paddingHorizontal: 14, borderRadius: 5, backgroundColor: "rgb(34, 139, 34)", marginRight: 8 }}
        >
          <Text style={{ fontSize: 14, color: "white", fontWeight: "600" }}>Fresh workorders</Text>
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

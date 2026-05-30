/*eslint-disable*/
import React, { useState, useRef } from "react";
import styles from "./ImportComponent.module.css";
import cloneDeep from "lodash/cloneDeep";
import { log, localStorageWrapper, capitalizeFirstLetterOfString, generateEAN13Barcode, normalizeBarcode } from "../../../../../utils";
import {
  useSettingsStore,
  useMigrationStore,
  useAlertScreenStore,
  useOpenWorkordersStore,
  useInventoryStore,
} from "../../../../../stores";
import { Image } from "../../../../../dom_components";
import { C, ICONS } from "../../../../../styles";
import { SETTINGS_OBJ, TIME_PUNCH_PROTO } from "../../../../../data";
import {
  dbSaveCustomer,
  dbSaveOpenWorkorder,
  dbSaveCompletedWorkorder,
  dbSaveCompletedSale,
  dbSaveSettings,
  dbSavePrintObj,
  dbSavePunchObject,
  dbListenToDevLogs,
  dbClearCollection,
  dbBatchWrite,
} from "../../../../../db_calls_wrapper";
import {
  firestoreRead,
  firestoreWrite,
  firestoreDelete,
  lightspeedInitiateAuthCallable,
  lightspeedImportDataCallable,
} from "../../../../../db_calls";
import {
  mapCustomers,
  mapWorkorders,
  mapSales,
  mapStatuses,
  mapEmployees,
  mapPunchHistory,
  parseCSV,
} from "../../../../../lightspeed_import";
import { disableListener } from "../../../../../listenerManager";

let _lsConnectionCache = null;
let _lsCsvData = null;

// Wide-net labor detection. Better to over-match labor than under-match —
// labor is tax-free, so false-positives cost nothing while false-negatives
// charge tax on something that should be exempt.
const LABOR_WORDS = /\b(labor|install|installation|replace|repair|tune|tuneup|service|adjust|diagnostic|cleaning|assembly|bleed|overhaul|true|truing|build|swap|mount|fit|fitting|setup|set-up|removal|remove|inspection|inspect|charge)\b/i;

const ImportComponent = () => {
  const [sLsConnected, _setLsConnected] = useState(_lsConnectionCache?.connected || false);
  const [sLsImporting, _setLsImporting] = useState("");
  const [sLsResult, _setLsResult] = useState("");
  const [sWoLookup, _setWoLookup] = useState("2949");
  const [sCustLookup, _setCustLookup] = useState("");
  const [sLookupLoading, _setLookupLoading] = useState(false);

  // --- Lightspeed handlers ---

  const lsConnectionPollRef = useRef(null);
  const lsConnectionTimeoutRef = useRef(null);
  const inventoryCsvFileInputRef = useRef(null);
  const inventoryUploadCsvFileInputRef = useRef(null);

  function stopLsConnectionPoll() {
    if (lsConnectionPollRef.current) {
      clearInterval(lsConnectionPollRef.current);
      lsConnectionPollRef.current = null;
    }
    if (lsConnectionTimeoutRef.current) {
      clearTimeout(lsConnectionTimeoutRef.current);
      lsConnectionTimeoutRef.current = null;
    }
  }

  async function checkLsConnection() {
    const settings = useSettingsStore.getState().settings;
    const tenantID = settings?.tenantID;
    const storeID = settings?.storeID;
    if (!tenantID || !storeID) return;
    try {
      const path = `tenants/${tenantID}/stores/${storeID}/integrations/lightspeed`;
      const lsDoc = await firestoreRead(path);
      if (lsDoc?.accessToken) {
        _lsConnectionCache = { connected: true, accountName: lsDoc.accountID || "" };
        _setLsConnected(true);
        _setLsResult("Connected to Lightspeed" + (lsDoc.accountID ? ": " + lsDoc.accountID : ""));
        _setLsImporting("");
        stopLsConnectionPoll();
      }
    } catch (e) {
      // silently fail
    }
  }

  // Check Lightspeed connection once per session (reads Firestore doc directly, no Cloud Function)
  if (!_lsConnectionCache) { checkLsConnection(); }

  async function handleLsConnect() {
    try {
      _setLsImporting("connecting");
      _setLsResult("");
      const settings = useSettingsStore.getState().settings;
      const tenantID = settings?.tenantID;
      const storeID = settings?.storeID;
      if (!tenantID || !storeID) {
        _setLsResult("Error: tenantID or storeID not found in settings");
        _setLsImporting("");
        return;
      }
      const res = await lightspeedInitiateAuthCallable({ tenantID, storeID });
      if (res.data?.authUrl) {
        window.open(res.data.authUrl, "_blank");
        _setLsResult("Waiting for authorization...");
        _setLsImporting("checking");
        // Auto-poll for connection every 5 seconds, give up after 1 minute
        stopLsConnectionPoll();
        lsConnectionPollRef.current = setInterval(checkLsConnection, 5000);
        lsConnectionTimeoutRef.current = setTimeout(() => {
          stopLsConnectionPoll();
          _setLsResult("Authorization timed out — try again");
          _setLsImporting("");
        }, 60000);
      } else {
        _setLsResult("Error: No auth URL returned");
        _setLsImporting("");
      }
    } catch (e) {
      _setLsResult("Error: " + (e.message || "Connection failed"));
      _setLsImporting("");
    }
  }

  const CSV_EXPORT_TYPES = [
    { type: "csv-workorders", label: "Workorders" },
    { type: "csv-workorderitems", label: "Workorder Items" },
    { type: "csv-serialized", label: "Serialized" },
    { type: "csv-items", label: "Items" },
    { type: "csv-customers", label: "Customers" },
    { type: "csv-sales", label: "Sales" },
    { type: "csv-salelines", label: "Sale Lines" },
    { type: "csv-salepayments", label: "Sale Payments" },
    { type: "csv-employees", label: "Employees" },
    { type: "csv-employeehours", label: "Employee Hours" },
    { type: "csv-cccharges", label: "CC Charges" },
  ];

  async function handleExportAllCsvs() {
    _setLsImporting("all-csvs");
    _setLsResult("");
    const settings = useSettingsStore.getState().settings;
    const tenantID = settings?.tenantID;
    const storeID = settings?.storeID;
    let completed = 0;
    let failed = 0;

    for (const btn of CSV_EXPORT_TYPES) {
      console.log("[Export All] " + (completed + failed + 1) + "/" + CSV_EXPORT_TYPES.length + " — " + btn.label + "...");
      _setLsResult("Exporting " + (completed + failed + 1) + "/" + CSV_EXPORT_TYPES.length + ": " + btn.label + "...");
      let unsubDevLog = null;
      try {
        let logsDone = null;
        const logsFinished = new Promise((resolve) => { logsDone = resolve; });
        let lastLogCount = -1;
        unsubDevLog = dbListenToDevLogs("lightspeed-import", (data) => {
          if (!data?.logs) return;
          if (lastLogCount === -1) {
            lastLogCount = data.logs.length;
            if (data.status === "complete" || data.status === "error") logsDone();
            return;
          }
          let newEntries = data.logs.slice(lastLogCount);
          for (let entry of newEntries) {
            if (entry.type === "csv-download") {
              try {
                let csvInfo = JSON.parse(entry.msg);
                let link = document.createElement("a");
                link.href = csvInfo.url;
                link.download = csvInfo.filename || "download.csv";
                link.target = "_blank";
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              } catch (e) {}
              continue;
            }
            let prefix = entry.type === "error" ? "[ERROR]" : entry.type === "success" ? "[OK]" : entry.type === "warn" ? "[WARN]" : "[INFO]";
            console.log("[Export All] " + btn.label + " " + prefix + " " + entry.msg);
          }
          lastLogCount = data.logs.length;
          if (data.status === "complete" || data.status === "error") {
            logsDone();
          }
        });

        const res = await lightspeedImportDataCallable({ tenantID, storeID, importType: btn.type, saveToDB: false });
        await logsFinished;
        if (unsubDevLog) { unsubDevLog(); unsubDevLog = null; }

        if (res.data?.success) {
          completed++;
          console.log("[Export All] " + btn.label + " — done");
        } else {
          failed++;
          console.error("[Export All] " + btn.label + " — no success flag");
        }
      } catch (e) {
        if (unsubDevLog) unsubDevLog();
        failed++;
        console.error("[Export All] " + btn.label + " — error: " + e.message);
      }
    }

    _setLsResult("Export All: " + completed + " completed, " + failed + " failed");
    _setLsImporting("");
    console.log("[Export All] Finished: " + completed + " completed, " + failed + " failed");
  }

  async function handleLsImportType(importType, saveToDB) {
    let unsubDevLog = null;
    try {
      _setLsImporting(importType);
      _setLsResult("");
      const settings = useSettingsStore.getState().settings;
      const tenantID = settings?.tenantID;
      const storeID = settings?.storeID;

      // Start dev log listener for real-time console output
      let lastLogCount = -1;
      let logsDone = null;
      const logsFinished = new Promise((resolve) => { logsDone = resolve; });
      unsubDevLog = dbListenToDevLogs("lightspeed-import", (data) => {
        if (!data?.logs) return;
        // On first callback, skip existing logs so we don't replay previous exports
        if (lastLogCount === -1) {
          lastLogCount = data.logs.length;
          // If status is already terminal (fast function), resolve immediately
          if (data.status === "complete" || data.status === "error") logsDone();
          return;
        }
        let newEntries = data.logs.slice(lastLogCount);
        for (let entry of newEntries) {
          if (entry.type === "csv-download") {
            try {
              let csvInfo = JSON.parse(entry.msg);
              let link = document.createElement("a");
              link.href = csvInfo.url;
              link.download = csvInfo.filename || "download.csv";
              link.target = "_blank";
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            } catch (e) {
            }
            continue;
          }
          let prefix = entry.type === "error" ? "[ERROR]" : entry.type === "success" ? "[OK]" : entry.type === "warn" ? "[WARN]" : "[INFO]";
          console.log("[LS Export] " + prefix + " " + entry.msg);
        }
        lastLogCount = data.logs.length;
        if (newEntries.length > 0) {
          _setLsResult(newEntries[newEntries.length - 1].msg);
        }
        if (data.status === "complete" || data.status === "error") {
          logsDone();
        }
      });

      const res = await lightspeedImportDataCallable({
        tenantID,
        storeID,
        importType,
        saveToDB,
      });

      await logsFinished;
      if (unsubDevLog) { unsubDevLog(); unsubDevLog = null; }

      if (res.data?.success) {
        let msg = importType.charAt(0).toUpperCase() + importType.slice(1) + " import complete.";
        if (res.data.customerCount != null) msg += ` Customers: ${res.data.customerCount}.`;
        if (res.data.saleCount != null) msg += ` Sales: ${res.data.saleCount}.`;
        if (res.data.workorderCount != null) msg += ` Workorders: ${res.data.workorderCount} (${res.data.linked || 0} linked).`;
        _setLsResult(msg);
      } else {
        _setLsResult("Import returned no success flag");
      }
    } catch (e) {
      _setLsResult("Error: " + (e.message || "Import failed"));
    }
    if (unsubDevLog) unsubDevLog();
    _setLsImporting("");
  }

  // --- Mapping lookup handlers ---

  async function loadAndCacheLightspeedData() {
    if (_lsCsvData) return _lsCsvData;
    const [custText, woText, wiText, serText, itemsText, slText, salesText, spText, paymentsText, empText] = await Promise.all([
      fetch("/lightspeed/customers.csv").then(r => r.text()),
      fetch("/lightspeed/workorders.csv").then(r => r.text()),
      fetch("/lightspeed/workorderItems.csv").then(r => r.text()),
      fetch("/lightspeed/serialized.csv").then(r => r.text()),
      fetch("/lightspeed/items.csv").then(r => r.text()),
      fetch("/lightspeed/salesLines.csv").then(r => r.text()),
      fetch("/lightspeed/sales.csv").then(r => r.text()),
      fetch("/lightspeed/salesPayments.csv").then(r => r.text()),
      fetch("/lightspeed/payments.csv").then(r => r.ok ? r.text() : "").catch(() => ""),
      fetch("/lightspeed/employees.csv").then(r => r.ok ? r.text() : "").catch(() => ""),
    ]);
    const { customers, customerRedirectMap } = mapCustomers(custText);
    const customerMap = {};
    for (const c of customers) customerMap[c.id] = c;
    const settings = useSettingsStore.getState().settings;
    const statuses = settings?.statuses || [];
    const workorders = mapWorkorders(woText, wiText, serText, itemsText, slText, customerMap, statuses, empText, salesText, customerRedirectMap, settings);
    // Build workorderMap: lsSaleID → [mapped workorder objects]
    const workorderMap = {};
    for (const wo of workorders) {
      const lsSaleID = wo._lsSaleID;
      if (lsSaleID && lsSaleID !== "0") {
        if (!workorderMap[lsSaleID]) workorderMap[lsSaleID] = [];
        workorderMap[lsSaleID].push(wo);
      }
    }
    const { sales, transactions } = mapSales(salesText, spText, paymentsText, workorderMap, customerMap, customerRedirectMap);
    _lsCsvData = { customers, customerMap, customerRedirectMap, workorders, sales, transactions, itemsText };
    return _lsCsvData;
  }

  async function handleWoLookup() {
    if (!sWoLookup.trim()) return;
    _setLookupLoading(true);
    try {
      const data = await loadAndCacheLightspeedData();
      const wo = data.workorders.find(w => w.workorderNumber === sWoLookup.trim());
      if (wo) {
        const linkedSale = wo.saleID ? data.sales.find(s => s.id === wo.saleID) : null;
        await dbSaveOpenWorkorder(wo);
        useOpenWorkordersStore.getState().setOpenWorkorders([wo]);
        useOpenWorkordersStore.getState().setOpenWorkorderID(wo.id);
        _setLsResult("Workorder " + sWoLookup.trim() + " saved to DB");
      } else {
        _setLsResult("Workorder " + sWoLookup.trim() + " not found");
      }
    } catch (e) {
      _setLsResult("Error: " + e.message);
    }
    _setLookupLoading(false);
  }

  async function handleCustLookup() {
    if (!sCustLookup.trim()) return;
    _setLookupLoading(true);
    try {
      const data = await loadAndCacheLightspeedData();
      const digits = sCustLookup.trim().replace(/\D/g, "");
      const cust = data.customers.find(c => {
        const cellDigits = c.customerCell.replace(/\D/g, "");
        const landlineDigits = c.customerLandline.replace(/\D/g, "");
        return cellDigits === digits || landlineDigits === digits;
      });
      if (cust) {
        _setLsResult("Customer " + capitalizeFirstLetterOfString(cust.first) + " " + capitalizeFirstLetterOfString(cust.last) + " found");
      } else {
        _setLsResult("No customer with phone " + sCustLookup.trim());
      }
    } catch (e) {
      _setLsResult("Error: " + e.message);
    }
    _setLookupLoading(false);
  }

  async function handleDevImport() {
    _setLookupLoading(true);
    _setLsResult("");
    try {
      const data = await loadAndCacheLightspeedData();
      const settings = useSettingsStore.getState().settings;
      const statuses = settings?.statuses || [];

      // Build set of valid status IDs from settings
      const validStatusIDs = new Set(statuses.map(s => s.id));

      // Build status label lookup for "done & paid" detection
      const statusByLabel = {};
      for (const s of statuses) statusByLabel[s.label.toLowerCase()] = s;
      const doneAndPaidID = statusByLabel["finished & paid"]?.id;

      // Sale lookup for linked sales
      const saleByID = {};
      for (const s of data.sales) saleByID[s.id] = s;

      // Grab all workorders whose status matches any status in settings, limit 40
      const allWorkorders = data.workorders
        .filter(wo => validStatusIDs.has(wo.status))
        .slice(0, 40);

      // Collect unique customers from all workorders
      const customersSaved = new Set();
      for (const wo of allWorkorders) {
        if (wo.customerID && !customersSaved.has(wo.customerID)) {
          const cust = data.customerMap[wo.customerID];
          if (cust) {
            await dbSaveCustomer(cust);
            customersSaved.add(wo.customerID);
          }
        }
      }

      // Save workorders + sales to correct Firestore collections
      const openWorkorders = [];
      const completedWorkorders = [];
      const salesSaved = new Set();

      for (const wo of allWorkorders) {
        if (wo.status === doneAndPaidID) {
          await dbSaveCompletedWorkorder(wo);
          completedWorkorders.push(wo);
          if (wo.saleID && !salesSaved.has(wo.saleID)) {
            const sale = saleByID[wo.saleID];
            if (sale) {
              await dbSaveCompletedSale(sale);
              salesSaved.add(wo.saleID);
            }
          }
        } else {
          await dbSaveOpenWorkorder(wo);
          openWorkorders.push(wo);
        }
      }

      // Update local store with open workorders only
      useOpenWorkordersStore.getState().setOpenWorkorders(openWorkorders);

      _setLsResult(
        "Dev Import: " + allWorkorders.length + " workorders (" +
        completedWorkorders.length + " completed, " + openWorkorders.length + " open), " +
        salesSaved.size + " sales, " + customersSaved.size + " customers"
      );
    } catch (e) {
      console.error("[Dev Import] Error:", e);
      _setLsResult("Error: " + e.message);
    }
    _setLookupLoading(false);
  }

  function parseInventoryCSVRows(rows) {
    const toBool = (v) => v === true || v === "true" || v === "TRUE" || v === "1";
    const toNum = (v) => {
      if (v === null || v === undefined || v === "") return 0;
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };
    return rows.map((r) => ({
      id: (r.id || "").trim(),
      formalName: r.formalName || "",
      informalName: r.informalName || "",
      brand: r.brand || "",
      category: r.category || "Item",
      price: toNum(r.price),
      salePrice: toNum(r.salePrice),
      cost: toNum(r.cost),
      primaryBarcode: (r.primaryBarcode || "").trim(),
      barcodes: r.barcodes ? r.barcodes.split("|").filter(Boolean) : [],
      minutes: toNum(r.minutes),
      customPart: toBool(r.customPart),
      customLabor: toBool(r.customLabor),
      receiptNoteRequired: toBool(r.receiptNoteRequired),
    }));
  }

  function handleUploadInventoryFromCSVClick() {
    if (inventoryUploadCsvFileInputRef.current) inventoryUploadCsvFileInputRef.current.click();
  }

  async function handleInventoryUploadCSVFileChosen(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;

    if (!window.confirm(
      "Upload \"" + file.name + "\" to Firestore inventory collection?\n\n" +
      "This will OVERWRITE inventory items in the live database (matched by id).\n" +
      "Quick-button references are preserved as long as ids are unchanged.\n\n" +
      "Click OK to proceed."
    )) {
      return;
    }

    _setLookupLoading(true);
    _setLsResult("");
    try {
      console.log("[Upload Inventory CSV] reading file:", file.name);
      const text = await file.text();
      const rows = parseCSV(text);
      console.log("[Upload Inventory CSV] parsed rows:", rows.length);
      if (!rows.length) {
        _setLsResult("CSV had no rows.");
        return;
      }
      const items = parseInventoryCSVRows(rows).filter((it) => it.id);
      const skipped = rows.length - items.length;
      if (skipped > 0) console.warn("[Upload Inventory CSV] skipped " + skipped + " rows without id");
      console.log("[Upload Inventory CSV] writing " + items.length + " items to Firestore...");
      _setLsResult("Uploading " + items.length + " items to Firestore...");

      await dbBatchWrite(items, "inventory", (done, total) => {
        console.log("[Upload Inventory CSV] " + done + "/" + total + " written");
        _setLsResult("Uploading " + done + "/" + total + "...");
      });

      console.log("[Upload Inventory CSV] complete");
      _setLsResult("Uploaded " + items.length + " inventory items to Firestore.");
      alert("Uploaded " + items.length + " inventory items to Firestore.");
    } catch (err) {
      console.error("[Upload Inventory CSV] Error:", err);
      _setLsResult("Upload error: " + err.message);
      alert("Upload error: " + err.message);
    } finally {
      _setLookupLoading(false);
    }
  }

  function handleLoadInventoryFromCSVClick() {
    console.log("[Load Inventory CSV] button clicked, opening file picker...");
    if (inventoryCsvFileInputRef.current) inventoryCsvFileInputRef.current.click();
    else console.warn("[Load Inventory CSV] file input ref is null");
  }

  async function handleInventoryCSVFileChosen(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) {
      console.log("[Load Inventory CSV] no file selected (dialog cancelled)");
      return;
    }
    console.log("[Load Inventory CSV] file chosen:", file.name, file.size, "bytes");
    try {
      _setLsResult("Loading " + file.name + "...");
      // Stop the live Firestore inventory listener so it doesn't overwrite the local data
      console.log("[Load Inventory CSV] disabling inventory listener...");
      disableListener("inventory");

      console.log("[Load Inventory CSV] reading file text...");
      const text = await file.text();
      console.log("[Load Inventory CSV] file text length:", text.length);

      console.log("[Load Inventory CSV] parsing CSV...");
      const rows = parseCSV(text);
      console.log("[Load Inventory CSV] parsed rows:", rows.length);
      if (rows.length) console.log("[Load Inventory CSV] first row:", rows[0]);
      if (!rows.length) {
        _setLsResult("CSV had no rows.");
        console.warn("[Load Inventory CSV] CSV had no rows");
        return;
      }
      const items = parseInventoryCSVRows(rows);
      console.log("[Load Inventory CSV] mapped items:", items.length);
      if (items.length) console.log("[Load Inventory CSV] sample mapped item:", items[0]);
      console.log("[Load Inventory CSV] writing to useInventoryStore...");
      useInventoryStore.getState().setItems(items);
      console.log("[Load Inventory CSV] done. inventoryArr length now:",
        useInventoryStore.getState().getInventoryArr().length);
      _setLsResult(
        "Loaded " + items.length + " items into Zustand (local only). " +
        "Inventory listener disabled — refresh page to restore live sync."
      );
      alert("Loaded " + items.length + " items into local store. Inventory listener disabled. Refresh to restore.");
    } catch (err) {
      console.error("[Load Inventory CSV] Error:", err);
      _setLsResult("Load error: " + err.message);
      alert("Load error: " + err.message);
    }
  }

  function handleDownloadInventoryCSV() {
    try {
      const inv = useInventoryStore.getState().getInventoryArr() || [];
      if (!inv.length) {
        _setLsResult("No inventory in store to download.");
        return;
      }
      const cols = [
        "id",
        "formalName",
        "informalName",
        "brand",
        "category",
        "price",
        "salePrice",
        "cost",
        "primaryBarcode",
        "barcodes",
        "minutes",
        "customPart",
        "customLabor",
        "receiptNoteRequired",
      ];
      const esc = (v) => {
        if (v === null || v === undefined) return "";
        const s = Array.isArray(v) ? v.join("|") : String(v);
        return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      };
      const lines = [cols.join(",")];
      for (const item of inv) lines.push(cols.map((c) => esc(item[c])).join(","));
      const csv = lines.join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      a.download = "inventory_" + stamp + ".csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      _setLsResult("Downloaded " + inv.length + " inventory items.");
    } catch (e) {
      console.error("[Inventory CSV Download] Error:", e);
      _setLsResult("Download error: " + e.message);
    }
  }

  async function handleInventoryImport() {
    _setLookupLoading(true);
    _setLsResult("");
    try {
      console.log("[Inventory Import] Loading inventory.csv...");
      const invText = await fetch("/lightspeed/inventory.csv").then(r => r.text());
      const itemRows = parseCSV(invText);
      const activeItems = itemRows.filter(row => row["Description"]);
      console.log("[Inventory Import] Parsed " + itemRows.length + " rows, " + activeItems.length + " active items.");

      const stripDollar = (val) => (val || "").replace(/[$,]/g, "");

      const toImport = [];
      const skipped = [];
      let missingCodes = 0;
      for (const item of activeItems) {
        const desc = item["Description"] || "";
        if (desc.includes("Discontinued")) continue;
        const isLabor = LABOR_WORDS.test(desc);
        const rawUpc = (item["UPC"] || "").trim();
        const rawEan = (item["EAN"] || "").trim();
        // Store raw codes verbatim — what LS has is what's on the shelf label.
        // No normalization, no check-digit validation, no fabricated fallback.
        const primaryBarcode = rawUpc || rawEan || "";
        const barcodes = [];
        for (const code of [rawUpc, rawEan]) {
          if (code && code !== primaryBarcode && !barcodes.includes(code)) barcodes.push(code);
        }
        if (!primaryBarcode) missingCodes++;
        // Use barcode as id when present; otherwise generate a stable UUID-style id
        // so the item is still uniquely addressable without claiming a fake barcode.
        const id = primaryBarcode || generateEAN13Barcode();
        const isTube = desc.includes("TUBE ");
        const tubeCost = dollarsToCents(stripDollar(item["Default Cost"]));
        const price = isTube ? (tubeCost > 600 ? 1878 : 939) : dollarsToCents(stripDollar(item["Price"]));
        const mapped = {
          id,
          formalName: desc,
          informalName: "",
          brand: "",
          price,
          salePrice: 0,
          cost: dollarsToCents(stripDollar(item["Default Cost"])),
          category: isLabor ? "Labor" : "Item",
          primaryBarcode,
          barcodes,
          minutes: 0,
          customPart: false,
          customLabor: false,
        };
        if (price > 0) {
          toImport.push(mapped);
        } else {
          skipped.push(mapped);
        }
      }
      skipped.sort((a, b) => {
        const aName = a.formalName.toLowerCase();
        const bName = b.formalName.toLowerCase();
        const aIsLabor = aName.includes("labor");
        const bIsLabor = bName.includes("labor");
        const aIsPart = aName.includes("part");
        const bIsPart = bName.includes("part");
        // Group: Labor first, Part second, Other last
        const aGroup = aIsLabor ? 0 : aIsPart ? 1 : 2;
        const bGroup = bIsLabor ? 0 : bIsPart ? 1 : 2;
        if (aGroup !== bGroup) return aGroup - bGroup;
        return a.formalName.localeCompare(b.formalName);
      });
      console.log("[Inventory Import] " + toImport.length + " items to import, " + skipped.length + " skipped (no price), " + missingCodes + " items with no UPC/EAN in source.");

      await dbBatchWrite(toImport, "inventory", (done, total) => {
        console.log("[Inventory Import] inventory: " + done + "/" + total + " written.");
      });

      // // Download inventory_imported.csv
      // {
      //   toImport.sort((a, b) => {
      //     const aName = a.formalName.toLowerCase();
      //     const bName = b.formalName.toLowerCase();
      //     const aGroup = aName.includes("labor") ? 0 : aName.includes("part") ? 1 : 2;
      //     const bGroup = bName.includes("labor") ? 0 : bName.includes("part") ? 1 : 2;
      //     if (aGroup !== bGroup) return aGroup - bGroup;
      //     return a.formalName.localeCompare(b.formalName);
      //   });
      //   const esc = (v) => '"' + String(v || "").replace(/"/g, '""') + '"';
      //   const csvHeader = "Category,Description,Price,Cost,Primary Barcode,Other Barcodes";
      //   const csvRows = toImport.map(item =>
      //     [item.category, esc(item.formalName), (item.price / 100).toFixed(2), (item.cost / 100).toFixed(2), esc(item.primaryBarcode), esc(item.barcodes.join("; "))].join(",")
      //   );
      //   const csvContent = csvHeader + "\n" + csvRows.join("\n");
      //   const blob = new Blob([csvContent], { type: "text/csv" });
      //   const url = URL.createObjectURL(blob);
      //   const a = document.createElement("a");
      //   a.href = url;
      //   a.download = "inventory_imported.csv";
      //   a.click();
      //   URL.revokeObjectURL(url);
      //   console.log("[Inventory Import] inventory_imported.csv downloaded (" + toImport.length + " items).");
      // }

      // if (skipped.length > 0) {
      //   console.log("[Inventory Import] Generating CSV for " + skipped.length + " skipped items...");
      //   const csvHeader = "Group,Description,Price,Cost,Primary Barcode,Other Barcodes";
      //   const csvRows = skipped.map(item => {
      //     const group = item.formalName.toLowerCase().includes("labor") ? "Labor" : item.formalName.toLowerCase().includes("item") ? "Item" : "Other";
      //     const esc = (v) => '"' + String(v || "").replace(/"/g, '""') + '"';
      //     return [group, esc(item.formalName), item.price, item.cost, esc(item.primaryBarcode), esc((item.barcodes || []).join("; "))].join(",");
      //   });
      //   const csvContent = csvHeader + "\n" + csvRows.join("\n");
      //   const blob = new Blob([csvContent], { type: "text/csv" });
      //   const url = URL.createObjectURL(blob);
      //   const a = document.createElement("a");
      //   a.href = url;
      //   a.download = "inventory_skipped_items.csv";
      //   a.click();
      //   URL.revokeObjectURL(url);
      //   console.log("[Inventory Import] Skipped items CSV downloaded.");
      // }

      console.log("[Inventory Import] Complete. " + toImport.length + " imported, " + skipped.length + " skipped.");
      _setLsResult("Inventory Import: " + toImport.length + " imported, " + skipped.length + " skipped (no price)");
    } catch (e) {
      console.error("[Inventory Import] Error:", e);
      _setLsResult("Error: " + e.message);
    }
    _setLookupLoading(false);
  }

  const sMigrating = useMigrationStore((s) => s.getMigrating());
  const sDevMigrating = useMigrationStore((s) => s.getDevMigrating());
  const sMigrationStep = useMigrationStore((s) => s.getStep());
  const sMigrationProgress = useMigrationStore((s) => s.getProgress());
  const _setMigrating = useMigrationStore((s) => s.setMigrating);
  const _setDevMigrating = useMigrationStore((s) => s.setDevMigrating);
  const _setMigrationStep = useMigrationStore((s) => s.setStep);
  const _setMigrationProgress = useMigrationStore((s) => s.setProgress);

  async function handleFullMigration() {
    _setMigrating(true);
    _setMigrationStep("Loading & mapping CSVs...");
    _setMigrationProgress({ done: 0, total: 0 });
    _setLsResult("");
    const migrationStart = Date.now();

    try {
      // Invalidate cached CSV data so fresh files are always used
      _lsCsvData = null;

      // Clear existing collections before writing
      _setMigrationStep("Clearing collections...");
      console.log("[Migration] Clearing collections...");
      await Promise.all([
        dbClearCollection("open-workorders"),
        dbClearCollection("completed-workorders"),
        dbClearCollection("customers"),
        dbClearCollection("completed-sales"),
        dbClearCollection("active-sales"),
        dbClearCollection("inventory"),
        dbClearCollection("punches"),
        dbClearCollection("transactions"),
      ]);
      console.log("[Migration] Collections cleared.");

      // Extract statuses first so the mapping resolves status IDs correctly
      const settings = cloneDeep(useSettingsStore.getState().settings || {});
      _setMigrationStep("Extracting statuses...");
      console.log("[Migration] Extracting statuses...");
      const statusesText = await fetch("/import_data/statuses.csv").then(r => r.text());
      const mergedStatuses = mapStatuses(statusesText);
      settings.statuses = mergedStatuses;
      await dbSaveSettings(settings);
      useSettingsStore.getState().setSettings(settings);

      // Load & map all CSV data with correct statuses
      _setMigrationStep("Loading & mapping CSVs...");
      console.log("[Migration] Loading & mapping CSVs...");
      _lsCsvData = null;
      const freshData = await loadAndCacheLightspeedData();

      // Save customers
      _setMigrationStep("Saving customers...");
      console.log("[Migration] Saving " + freshData.customers.length + " customers...");
      _setMigrationProgress({ done: 0, total: freshData.customers.length });
      await dbBatchWrite(freshData.customers, "customers", (done, total) => {
        _setMigrationProgress({ done, total });
      });
      console.log("[Migration] Customers done.");

      // Save inventory — load inventory.csv for retail prices (items.csv has no price column)
      _setMigrationStep("Saving inventory...");
      const invCsvText = await fetch("/lightspeed/inventory.csv").then(r => r.text());
      const invPriceMap = {};
      const stripDollar = (val) => (val || "").replace(/[$,]/g, "");
      for (const invRow of parseCSV(invCsvText)) {
        const desc = (invRow["Description"] || "").toLowerCase().trim();
        if (desc) invPriceMap[desc] = stripDollar(invRow["Price"]);
      }
      console.log("[Migration] Built inventory price lookup: " + Object.keys(invPriceMap).length + " entries.");
      const itemRows = parseCSV(freshData.itemsText);
      const activeItems = itemRows.filter(row => row.archived !== "true" && row.description);
      const mappedItems = activeItems.map(item => {
        const isLabor = (item.description || "").toLowerCase().includes("labor");
        const descKey = (item.description || "").toLowerCase().trim();
        const retailPrice = invPriceMap[descKey];
        return {
          id: generateEAN13Barcode(),
          formalName: item.description || "",
          informalName: "",
          brand: "",
          price: retailPrice ? dollarsToCents(retailPrice) : dollarsToCents(item.defaultCost),
          salePrice: 0,
          cost: dollarsToCents(item.avgCost || item.defaultCost),
          category: isLabor ? "Labor" : "Item",
          primaryBarcode: normalizeBarcode(item.upc) || normalizeBarcode(item.ean) || generateEAN13Barcode(),
          barcodes: [normalizeBarcode(item.upc), normalizeBarcode(item.ean)].filter(Boolean),
          minutes: 0,
          customPart: false,
          customLabor: false,
        };
      });
      const pricedItems = mappedItems.filter(item => item.price > 0);
      console.log("[Migration] Saving " + pricedItems.length + " inventory items (" + (mappedItems.length - pricedItems.length) + " skipped with $0 price)...");
      _setMigrationProgress({ done: 0, total: pricedItems.length });
      await dbBatchWrite(pricedItems, "inventory", (done, total) => {
        _setMigrationProgress({ done, total });
      });
      console.log("[Migration] Inventory done.");

      // Route & save workorders
      _setMigrationStep("Saving workorders...");
      const statusByLabel = {};
      for (const s of (settings.statuses || [])) statusByLabel[s.label.toLowerCase()] = s;
      const doneAndPaidID = statusByLabel["finished & paid"]?.id;

      const openWorkorders = freshData.workorders.filter(wo => wo.status !== doneAndPaidID);
      const completedWorkorders = freshData.workorders.filter(wo => wo.status === doneAndPaidID);
      const allWOs = [...openWorkorders, ...completedWorkorders];
      console.log("[Migration] Saving " + openWorkorders.length + " open WOs + " + completedWorkorders.length + " completed WOs...");
      _setMigrationProgress({ done: 0, total: allWOs.length });
      let woDone = 0;
      await dbBatchWrite(openWorkorders, "open-workorders", (done) => {
        woDone = done;
        _setMigrationProgress({ done: woDone, total: allWOs.length });
      });
      await dbBatchWrite(completedWorkorders, "completed-workorders", (done) => {
        _setMigrationProgress({ done: woDone + done, total: allWOs.length });
      });
      console.log("[Migration] Workorders done.");

      // Route & save sales — completed go to completed-sales, incomplete only if linked to a workorder go to active-sales
      _setMigrationStep("Saving sales...");
      const completedSales = freshData.sales.filter(s => s.paymentComplete);
      const linkedIncompleteSales = freshData.sales.filter(s => !s.paymentComplete && s.workorderIDs && s.workorderIDs.length > 0);
      const skippedCount = freshData.sales.length - completedSales.length - linkedIncompleteSales.length;
      console.log("[Migration] Saving " + completedSales.length + " completed sales + " + linkedIncompleteSales.length + " linked incomplete sales (skipping " + skippedCount + " unlinked incomplete)...");
      _setMigrationProgress({ done: 0, total: completedSales.length + linkedIncompleteSales.length });
      let salesDone = 0;
      await dbBatchWrite(completedSales, "completed-sales", (done) => {
        salesDone = done;
        _setMigrationProgress({ done: salesDone, total: completedSales.length + linkedIncompleteSales.length });
      });
      if (linkedIncompleteSales.length > 0) {
        await dbBatchWrite(linkedIncompleteSales, "active-sales", (done) => {
          _setMigrationProgress({ done: salesDone + done, total: completedSales.length + linkedIncompleteSales.length });
        });
      }
      console.log("[Migration] Sales done.");

      // Save transactions
      _setMigrationStep("Saving transactions...");
      console.log("[Migration] Saving " + freshData.transactions.length + " transactions...");
      _setMigrationProgress({ done: 0, total: freshData.transactions.length });
      await dbBatchWrite(freshData.transactions, "transactions", (done) => {
        _setMigrationProgress({ done, total: freshData.transactions.length });
      });
      console.log("[Migration] Transactions done.");

      // Map & save employees and punch history
      _setMigrationStep("Mapping employees...");
      const empCsvText = await fetch("/lightspeed/employees.csv").then(r => r.ok ? r.text() : "").catch(() => "");
      const empHoursCsvText = await fetch("/lightspeed/employeeHours.csv").then(r => r.ok ? r.text() : "").catch(() => "");
      let employeeCount = 0;
      let punchCount = 0;
      if (empCsvText) {
        const { users: newUsers, employeeIDMap } = mapEmployees(empCsvText);
        employeeCount = newUsers.length;
        console.log("[Migration] Mapped " + newUsers.length + " employees.");

        // Add new users to settings alongside existing users (Fritz)
        const updatedSettings = cloneDeep(useSettingsStore.getState().settings || {});
        if (!updatedSettings.users) updatedSettings.users = [];
        const existingByLsID = {};
        updatedSettings.users.forEach(function (u) { if (u.lightspeed_id) existingByLsID[u.lightspeed_id] = u; });
        for (const u of newUsers) {
          if (!existingByLsID[u.lightspeed_id]) updatedSettings.users.push(u);
        }
        await dbSaveSettings(updatedSettings);
        useSettingsStore.getState().setSettings(updatedSettings);
        console.log("[Migration] Users saved to settings (" + updatedSettings.users.length + " total).");

        // Map & save punch history
        if (empHoursCsvText) {
          _setMigrationStep("Saving punch history...");
          const punches = mapPunchHistory(empHoursCsvText, employeeIDMap);
          punchCount = punches.length;
          console.log("[Migration] Saving " + punches.length + " punch records...");
          _setMigrationProgress({ done: 0, total: punches.length });
          await dbBatchWrite(punches, "punches", (done, total) => {
            _setMigrationProgress({ done, total });
          });
          console.log("[Migration] Punch history done.");
        }
      }

      // Update local store with open workorders
      useOpenWorkordersStore.getState().setOpenWorkorders(openWorkorders);

      // Summary
      const elapsed = ((Date.now() - migrationStart) / 1000).toFixed(1);
      const summary = "Full Migration Complete in " + elapsed + "s: " +
        freshData.customers.length + " customers, " +
        pricedItems.length + " inventory, " +
        openWorkorders.length + " open WOs, " +
        completedWorkorders.length + " completed WOs, " +
        completedSales.length + " completed sales, " +
        linkedIncompleteSales.length + " active sales, " +
        freshData.transactions.length + " transactions, " +
        employeeCount + " employees, " +
        punchCount + " punches";
      console.log("[Migration] " + summary);
      _setMigrationStep("Complete!");
      _setMigrationProgress({ done: 0, total: 0 });
      _setLsResult(summary);
    } catch (e) {
      console.error("[Migration] Error:", e);
      _setMigrationStep("Error");
      _setLsResult("Migration Error: " + e.message);
    }
    _setMigrating(false);
  }

  function buildCsvString(headers, rows) {
    const escape = (val) => {
      const str = val == null ? "" : String(val);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) return '"' + str.replace(/"/g, '""') + '"';
      return str;
    };
    return headers.map(escape).join(",") + "\n" + rows.map(r => r.map(escape).join(",")).join("\n");
  }

  async function writeCsvToDir(dirHandle, filename, csvString) {
    const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(csvString);
    await writable.close();
  }

  async function handleDevMigration() {
    _setDevMigrating(true);
    _setMigrationStep("Running full mapping pipeline...");
    _setMigrationProgress({ done: 0, total: 0 });
    _setLsResult("");
    const migrationStart = Date.now();

    try {
      // 1. Run full mapping pipeline (identical to full migration)
      _lsCsvData = null;

      _setMigrationStep("Mapping statuses...");
      console.log("[Dev Migration] Mapping statuses...");
      const statusesText = await fetch("/import_data/statuses.csv").then(r => r.text());
      const mergedStatuses = mapStatuses(statusesText);
      const settings = cloneDeep(useSettingsStore.getState().settings || {});
      settings.statuses = mergedStatuses;
      useSettingsStore.getState().setSettings(settings);

      _setMigrationStep("Loading & mapping CSVs...");
      console.log("[Dev Migration] Loading & mapping CSVs...");
      _lsCsvData = null;
      const freshData = await loadAndCacheLightspeedData();

      // Map employees
      const empCsvText = await fetch("/lightspeed/employees.csv").then(r => r.ok ? r.text() : "").catch(() => "");
      const empHoursCsvText = await fetch("/lightspeed/employeeHours.csv").then(r => r.ok ? r.text() : "").catch(() => "");
      const { users: allEmployees, employeeIDMap } = empCsvText ? mapEmployees(empCsvText) : { users: [], employeeIDMap: {} };
      const allPunches = empHoursCsvText ? mapPunchHistory(empHoursCsvText, employeeIDMap) : [];
      console.log("[Dev Migration] Full mapping complete: " + freshData.workorders.length + " WOs, " + freshData.customers.length + " customers, " + freshData.sales.length + " sales, " + freshData.transactions.length + " transactions, " + allEmployees.length + " employees, " + allPunches.length + " punches.");

      // 2. Pick 20 most recent workorders + pinned WO 12497
      _setMigrationStep("Filtering to 20 most recent WOs...");
      const DEV_PINNED_WO_IDS = ["12497"];
      const sorted = [...freshData.workorders]
        .filter(wo => wo.startedOnMillis)
        .sort((a, b) => b.startedOnMillis - a.startedOnMillis);
      const selectedWOs = sorted.slice(0, 20);
      for (const pinnedID of DEV_PINNED_WO_IDS) {
        const alreadyIncluded = selectedWOs.some(wo => wo.lightspeed_id === pinnedID);
        if (!alreadyIncluded) {
          const pinned = freshData.workorders.find(wo => wo.lightspeed_id === pinnedID);
          if (pinned) {
            selectedWOs.push(pinned);
            console.log("[Dev Migration] Pinned WO " + pinnedID + " added.");
          } else {
            console.warn("[Dev Migration] Pinned WO " + pinnedID + " not found in mapped data — skipping.");
          }
        }
      }
      console.log("[Dev Migration] Selected " + selectedWOs.length + " workorders.");

      // 3. Collect referenced IDs from those 50 workorders
      const customerIDSet = new Set();
      const saleIDSet = new Set();
      const inventoryIDSet = new Set();
      const employeeUserIDSet = new Set();

      for (const wo of selectedWOs) {
        if (wo.customerID) customerIDSet.add(wo.customerID);
        if (wo.saleID) saleIDSet.add(wo.saleID);
        if (wo._lsSaleID) saleIDSet.add(wo._lsSaleID);
        if (wo.startedBy) {
          const appUserID = employeeIDMap[wo.startedBy];
          if (appUserID) employeeUserIDSet.add(appUserID);
        }
        for (const line of (wo.workorderLines || [])) {
          if (line.inventoryItem?.id) inventoryIDSet.add(line.inventoryItem.id);
        }
      }

      // Filter each collection to only referenced items
      const filteredCustomers = freshData.customers.filter(c => customerIDSet.has(c.id));
      const filteredSales = freshData.sales.filter(s => saleIDSet.has(s.id) || saleIDSet.has(s.lightspeed_id));
      const filteredSaleIDSet = new Set(filteredSales.map(s => s.id));
      const filteredTransactions = freshData.transactions.filter(t => filteredSaleIDSet.has(t.saleID));
      const filteredEmployees = allEmployees.filter(u => employeeUserIDSet.has(u.id));
      const filteredPunches = allPunches.filter(p => employeeUserIDSet.has(p.userID));

      // Inventory: the mapped items from handleFullMigration use itemID as id - collect from workorder lines
      // Since workorder lines use custom inline items, we include ALL inventory for dev (small set)
      // but filter to only items whose id appears in workorderLines
      const invCsvText = await fetch("/lightspeed/inventory.csv").then(r => r.text());
      const invPriceMap = {};
      const stripDollar = (val) => (val || "").replace(/[$,]/g, "");
      for (const invRow of parseCSV(invCsvText)) {
        const desc = (invRow["Description"] || "").toLowerCase().trim();
        if (desc) invPriceMap[desc] = stripDollar(invRow["Price"]);
      }
      const itemRows = parseCSV(freshData.itemsText);
      const activeItems = itemRows.filter(row => row.archived !== "true" && row.description);
      const allMappedItems = activeItems.map(item => {
        const isLabor = (item.description || "").toLowerCase().includes("labor");
        const descKey = (item.description || "").toLowerCase().trim();
        const retailPrice = invPriceMap[descKey];
        return {
          id: generateEAN13Barcode(),
          formalName: item.description || "",
          informalName: "",
          brand: "",
          price: retailPrice ? dollarsToCents(retailPrice) : dollarsToCents(item.defaultCost),
          salePrice: 0,
          cost: dollarsToCents(item.avgCost || item.defaultCost),
          category: isLabor ? "Labor" : "Item",
          primaryBarcode: normalizeBarcode(item.upc) || normalizeBarcode(item.ean) || generateEAN13Barcode(),
          barcodes: [normalizeBarcode(item.upc), normalizeBarcode(item.ean)].filter(Boolean),
          minutes: 0,
          customPart: false,
          customLabor: false,
        };
      }).filter(item => item.price > 0);
      // Workorder lines use inline custom items, not inventory IDs - include full inventory for dev
      const filteredInventory = allMappedItems;

      console.log("[Dev Migration] Filtered: " + selectedWOs.length + " WOs, " + filteredCustomers.length + " customers, " + filteredSales.length + " sales, " + filteredTransactions.length + " transactions, " + filteredInventory.length + " inventory, " + filteredEmployees.length + " employees, " + filteredPunches.length + " punches.");

      // 4. Clear collections and write filtered data to DB (same as full migration)
      _setMigrationStep("Clearing collections...");
      console.log("[Dev Migration] Clearing collections...");
      await Promise.all([
        dbClearCollection("open-workorders"),
        dbClearCollection("completed-workorders"),
        dbClearCollection("customers"),
        dbClearCollection("completed-sales"),
        dbClearCollection("active-sales"),
        dbClearCollection("inventory"),
        dbClearCollection("punches"),
        dbClearCollection("transactions"),
      ]);
      console.log("[Dev Migration] Collections cleared.");

      // Save statuses to settings
      await dbSaveSettings(settings);
      useSettingsStore.getState().setSettings(settings);

      // Save customers
      _setMigrationStep("Saving customers...");
      console.log("[Dev Migration] Saving " + filteredCustomers.length + " customers...");
      _setMigrationProgress({ done: 0, total: filteredCustomers.length });
      await dbBatchWrite(filteredCustomers, "customers", (done, total) => {
        _setMigrationProgress({ done, total });
      });

      // Save inventory
      _setMigrationStep("Saving inventory...");
      console.log("[Dev Migration] Saving " + filteredInventory.length + " inventory items...");
      _setMigrationProgress({ done: 0, total: filteredInventory.length });
      await dbBatchWrite(filteredInventory, "inventory", (done, total) => {
        _setMigrationProgress({ done, total });
      });

      // Route & save workorders by status
      _setMigrationStep("Saving workorders...");
      const statusByLabel = {};
      for (const s of (settings.statuses || [])) statusByLabel[s.label.toLowerCase()] = s;
      const doneAndPaidID = statusByLabel["finished & paid"]?.id;

      const openWorkorders = selectedWOs.filter(wo => wo.status !== doneAndPaidID);
      const completedWorkorders = selectedWOs.filter(wo => wo.status === doneAndPaidID);
      const allWOs = [...openWorkorders, ...completedWorkorders];
      console.log("[Dev Migration] Saving " + openWorkorders.length + " open WOs + " + completedWorkorders.length + " completed WOs...");
      _setMigrationProgress({ done: 0, total: allWOs.length });
      let woDone = 0;
      await dbBatchWrite(openWorkorders, "open-workorders", (done) => {
        woDone = done;
        _setMigrationProgress({ done: woDone, total: allWOs.length });
      });
      await dbBatchWrite(completedWorkorders, "completed-workorders", (done) => {
        _setMigrationProgress({ done: woDone + done, total: allWOs.length });
      });

      // Route & save sales
      _setMigrationStep("Saving sales...");
      const completedSales = filteredSales.filter(s => s.paymentComplete);
      const linkedIncompleteSales = filteredSales.filter(s => !s.paymentComplete && s.workorderIDs && s.workorderIDs.length > 0);
      console.log("[Dev Migration] Saving " + completedSales.length + " completed sales + " + linkedIncompleteSales.length + " linked incomplete sales...");
      _setMigrationProgress({ done: 0, total: completedSales.length + linkedIncompleteSales.length });
      let salesDone = 0;
      await dbBatchWrite(completedSales, "completed-sales", (done) => {
        salesDone = done;
        _setMigrationProgress({ done: salesDone, total: completedSales.length + linkedIncompleteSales.length });
      });
      if (linkedIncompleteSales.length > 0) {
        await dbBatchWrite(linkedIncompleteSales, "active-sales", (done) => {
          _setMigrationProgress({ done: salesDone + done, total: completedSales.length + linkedIncompleteSales.length });
        });
      }

      // Save transactions
      _setMigrationStep("Saving transactions...");
      console.log("[Dev Migration] Saving " + filteredTransactions.length + " transactions...");
      _setMigrationProgress({ done: 0, total: filteredTransactions.length });
      await dbBatchWrite(filteredTransactions, "transactions", (done, total) => {
        _setMigrationProgress({ done, total });
      });

      // Save employees to settings + punch history
      if (filteredEmployees.length > 0) {
        _setMigrationStep("Saving employees...");
        const updatedSettings = cloneDeep(useSettingsStore.getState().settings || {});
        if (!updatedSettings.users) updatedSettings.users = [];
        const existingByLsID = {};
        updatedSettings.users.forEach(function (u) { if (u.lightspeed_id) existingByLsID[u.lightspeed_id] = u; });
        for (const u of filteredEmployees) {
          if (!existingByLsID[u.lightspeed_id]) updatedSettings.users.push(u);
        }
        await dbSaveSettings(updatedSettings);
        useSettingsStore.getState().setSettings(updatedSettings);
        console.log("[Dev Migration] Users saved to settings (" + updatedSettings.users.length + " total).");
      }
      if (filteredPunches.length > 0) {
        _setMigrationStep("Saving punch history...");
        console.log("[Dev Migration] Saving " + filteredPunches.length + " punch records...");
        _setMigrationProgress({ done: 0, total: filteredPunches.length });
        await dbBatchWrite(filteredPunches, "punches", (done, total) => {
          _setMigrationProgress({ done, total });
        });
      }

      // Update local store with open workorders
      useOpenWorkordersStore.getState().setOpenWorkorders(openWorkorders);

      const elapsed = ((Date.now() - migrationStart) / 1000).toFixed(1);
      const summary = "Dev Migration Complete in " + elapsed + "s: " +
        selectedWOs.length + "/" + freshData.workorders.length + " workorders (" + openWorkorders.length + " open, " + completedWorkorders.length + " completed), " +
        filteredCustomers.length + " customers, " +
        filteredInventory.length + " inventory, " +
        completedSales.length + " completed sales, " +
        linkedIncompleteSales.length + " active sales, " +
        filteredTransactions.length + " transactions, " +
        filteredEmployees.length + " employees, " +
        filteredPunches.length + " punches";
      console.log("[Dev Migration] " + summary);
      _setMigrationStep("Complete!");
      _setMigrationProgress({ done: 0, total: 0 });
      _setLsResult(summary);
    } catch (e) {
      console.error("[Dev Migration] Error:", e);
      _setMigrationStep("Error");
      _setLsResult("Dev Migration Error: " + e.message);
    }
    _setDevMigrating(false);
  }

  async function handleValidateExport() {
    _setDevMigrating(true);
    _setMigrationStep("Select folder with _import_ CSVs...");
    _setLsResult("");
    const errors = [];
    const warnings = [];
    const info = [];

    try {
      const dirHandle = await window.showDirectoryPicker({ mode: "read" });

      // --- Read all 8 CSV files ---
      _setMigrationStep("Reading CSV files...");
      const readFile = async (name) => {
        try {
          const fh = await dirHandle.getFileHandle(name);
          const file = await fh.getFile();
          return await file.text();
        } catch (e) {
          return null;
        }
      };

      const [statusesTxt, customersTxt, workordersTxt, salesTxt, transactionsTxt, inventoryTxt, employeesTxt, punchesTxt] = await Promise.all([
        readFile("_import_statuses.csv"),
        readFile("_import_customers.csv"),
        readFile("_import_workorders.csv"),
        readFile("_import_sales.csv"),
        readFile("_import_transactions.csv"),
        readFile("_import_inventory.csv"),
        readFile("_import_employees.csv"),
        readFile("_import_punches.csv"),
      ]);

      const missing = [];
      if (!statusesTxt) missing.push("_import_statuses.csv");
      if (!customersTxt) missing.push("_import_customers.csv");
      if (!workordersTxt) missing.push("_import_workorders.csv");
      if (!salesTxt) missing.push("_import_sales.csv");
      if (!transactionsTxt) missing.push("_import_transactions.csv");
      if (!inventoryTxt) missing.push("_import_inventory.csv");
      if (!employeesTxt) missing.push("_import_employees.csv");
      if (!punchesTxt) missing.push("_import_punches.csv");
      if (missing.length > 0) {
        errors.push("MISSING FILES: " + missing.join(", "));
      }

      // --- Parse CSVs ---
      _setMigrationStep("Parsing CSVs...");
      const statuses = statusesTxt ? parseCSV(statusesTxt) : [];
      const customers = customersTxt ? parseCSV(customersTxt) : [];
      const workorders = workordersTxt ? parseCSV(workordersTxt) : [];
      const sales = salesTxt ? parseCSV(salesTxt) : [];
      const transactions = transactionsTxt ? parseCSV(transactionsTxt) : [];
      const inventory = inventoryTxt ? parseCSV(inventoryTxt) : [];
      const employees = employeesTxt ? parseCSV(employeesTxt) : [];
      const punches = punchesTxt ? parseCSV(punchesTxt) : [];

      info.push("Parsed: " + statuses.length + " statuses, " + customers.length + " customers, " + workorders.length + " workorders, " + sales.length + " sales, " + transactions.length + " transactions, " + inventory.length + " inventory, " + employees.length + " employees, " + punches.length + " punches");

      // --- Build ID sets for lookups ---
      const statusIDSet = new Set(statuses.map(s => s.id));
      const customerIDSet = new Set(customers.map(c => c.id));
      const saleIDSet = new Set(sales.map(s => s.id));
      const saleLsIDSet = new Set(sales.map(s => s.lightspeed_id).filter(Boolean));
      const transactionIDSet = new Set(transactions.map(t => t.id));
      const inventoryIDSet = new Set(inventory.map(i => i.id));
      const employeeIDSet = new Set(employees.map(e => e.id));
      const workorderIDSet = new Set(workorders.map(w => w.id));

      // ================================================================
      // 1. DUPLICATE ID CHECKS
      // ================================================================
      _setMigrationStep("Checking for duplicate IDs...");
      const checkDuplicates = (arr, label) => {
        const seen = new Set();
        const dupes = [];
        for (const item of arr) {
          if (!item.id) { errors.push(label + ": row with empty ID"); continue; }
          if (seen.has(item.id)) dupes.push(item.id);
          seen.add(item.id);
        }
        if (dupes.length > 0) errors.push(label + ": " + dupes.length + " duplicate IDs — " + dupes.slice(0, 5).join(", ") + (dupes.length > 5 ? "..." : ""));
      };
      checkDuplicates(statuses, "Statuses");
      checkDuplicates(customers, "Customers");
      checkDuplicates(workorders, "Workorders");
      checkDuplicates(sales, "Sales");
      checkDuplicates(transactions, "Transactions");
      checkDuplicates(inventory, "Inventory");
      checkDuplicates(employees, "Employees");
      checkDuplicates(punches, "Punches");

      // ================================================================
      // 2. WORKORDER → STATUS
      // ================================================================
      _setMigrationStep("Validating workorder → status...");
      let woMissingStatus = 0;
      const unknownStatuses = new Set();
      for (const wo of workorders) {
        if (!wo.status) { woMissingStatus++; continue; }
        if (!statusIDSet.has(wo.status)) {
          unknownStatuses.add(wo.status);
          woMissingStatus++;
        }
      }
      if (woMissingStatus > 0) errors.push("Workorder → Status: " + woMissingStatus + " workorders reference missing/empty status IDs" + (unknownStatuses.size > 0 ? " — unknown: " + [...unknownStatuses].slice(0, 5).join(", ") : ""));
      else info.push("Workorder → Status: all " + workorders.length + " OK");

      // ================================================================
      // 3. WORKORDER → CUSTOMER
      // ================================================================
      _setMigrationStep("Validating workorder → customer...");
      let woMissingCust = 0;
      let woStandalone = 0;
      const missingCustIDs = new Set();
      for (const wo of workorders) {
        if (!wo.customerID) { woStandalone++; continue; }
        if (!customerIDSet.has(wo.customerID)) {
          woMissingCust++;
          missingCustIDs.add(wo.customerID);
        }
      }
      if (woMissingCust > 0) errors.push("Workorder → Customer: " + woMissingCust + " workorders reference missing customers — " + [...missingCustIDs].slice(0, 5).join(", ") + (missingCustIDs.size > 5 ? "..." : ""));
      else info.push("Workorder → Customer: all OK (" + woStandalone + " standalone)");

      // ================================================================
      // 4. WORKORDER → SALE (saleID and _lsSaleID)
      // ================================================================
      _setMigrationStep("Validating workorder → sale...");
      let woMissingSale = 0;
      let woHasSale = 0;
      const missingSaleIDs = new Set();
      for (const wo of workorders) {
        const hasSaleRef = wo.saleID || wo._lsSaleID;
        if (!hasSaleRef) continue;
        woHasSale++;
        // saleID should match a sale.id; _lsSaleID should match a sale.lightspeed_id
        const saleFound = (wo.saleID && saleIDSet.has(wo.saleID)) || (wo._lsSaleID && saleLsIDSet.has(wo._lsSaleID));
        if (!saleFound) {
          woMissingSale++;
          missingSaleIDs.add(wo.saleID || wo._lsSaleID);
        }
      }
      if (woMissingSale > 0) errors.push("Workorder → Sale: " + woMissingSale + "/" + woHasSale + " workorders reference missing sales — " + [...missingSaleIDs].slice(0, 5).join(", "));
      else info.push("Workorder → Sale: all " + woHasSale + " linked WOs OK");

      // ================================================================
      // 5. SALE → WORKORDER (workorderIDs array)
      // ================================================================
      _setMigrationStep("Validating sale → workorder...");
      let saleMissingWo = 0;
      let saleWoLinks = 0;
      for (const sale of sales) {
        let woIDs = [];
        try { woIDs = JSON.parse(sale.workorderIDs || "[]"); } catch (e) { errors.push("Sale " + sale.id + ": invalid workorderIDs JSON"); continue; }
        if (!Array.isArray(woIDs)) { errors.push("Sale " + sale.id + ": workorderIDs is not an array"); continue; }
        for (const woID of woIDs) {
          saleWoLinks++;
          if (!workorderIDSet.has(woID)) saleMissingWo++;
        }
      }
      if (saleMissingWo > 0) warnings.push("Sale → Workorder: " + saleMissingWo + "/" + saleWoLinks + " links reference workorders not in export (may be outside 50-WO window)");
      else info.push("Sale → Workorder: all " + saleWoLinks + " links OK");

      // ================================================================
      // 6. CUSTOMER → WORKORDER back-references
      // ================================================================
      _setMigrationStep("Validating customer → workorder...");
      let custWoMissing = 0;
      let custWoLinks = 0;
      for (const cust of customers) {
        let woIDs = [];
        try { woIDs = JSON.parse(cust.workorders || "[]"); } catch (e) { errors.push("Customer " + cust.id + ": invalid workorders JSON"); continue; }
        if (!Array.isArray(woIDs)) continue;
        for (const woID of woIDs) {
          custWoLinks++;
          if (!workorderIDSet.has(woID)) custWoMissing++;
        }
      }
      if (custWoMissing > 0) warnings.push("Customer → Workorder: " + custWoMissing + "/" + custWoLinks + " back-references point to workorders not in export (expected for 50-WO filter)");
      else info.push("Customer → Workorder: all " + custWoLinks + " back-refs OK");

      // ================================================================
      // 7. CUSTOMER → SALE back-references
      // ================================================================
      _setMigrationStep("Validating customer → sale...");
      let custSaleMissing = 0;
      let custSaleLinks = 0;
      for (const cust of customers) {
        let saleIDs = [];
        try { saleIDs = JSON.parse(cust.sales || "[]"); } catch (e) { continue; }
        if (!Array.isArray(saleIDs)) continue;
        for (const sid of saleIDs) {
          custSaleLinks++;
          if (!saleIDSet.has(sid)) custSaleMissing++;
        }
      }
      if (custSaleMissing > 0) warnings.push("Customer → Sale: " + custSaleMissing + "/" + custSaleLinks + " back-references point to sales not in export (expected for 50-WO filter)");
      else info.push("Customer → Sale: all " + custSaleLinks + " back-refs OK");

      // ================================================================
      // 8. PUNCH → EMPLOYEE
      // ================================================================
      _setMigrationStep("Validating punch → employee...");
      let punchMissingEmp = 0;
      const missingEmpIDs = new Set();
      for (const punch of punches) {
        if (!punch.userID) { errors.push("Punch " + punch.id + ": empty userID"); continue; }
        if (!employeeIDSet.has(punch.userID)) {
          punchMissingEmp++;
          missingEmpIDs.add(punch.userID);
        }
      }
      if (punchMissingEmp > 0) errors.push("Punch → Employee: " + punchMissingEmp + " punches reference missing employees — " + [...missingEmpIDs].slice(0, 3).join(", "));
      else info.push("Punch → Employee: all " + punches.length + " OK");

      // ================================================================
      // 9. PUNCH PAIRING (in/out balance per employee)
      // ================================================================
      _setMigrationStep("Checking punch in/out pairing...");
      const punchByUser = {};
      for (const p of punches) {
        if (!punchByUser[p.userID]) punchByUser[p.userID] = { in: 0, out: 0 };
        if (p.option === "in") punchByUser[p.userID].in++;
        else if (p.option === "out") punchByUser[p.userID].out++;
      }
      let punchImbalance = 0;
      for (const [uid, counts] of Object.entries(punchByUser)) {
        const diff = Math.abs(counts.in - counts.out);
        if (diff > 1) {
          const emp = employees.find(e => e.id === uid);
          const name = emp ? (emp.first + " " + emp.last).trim() : uid;
          warnings.push("Punch pairing: " + name + " has " + counts.in + " ins, " + counts.out + " outs (diff: " + diff + ")");
          punchImbalance++;
        }
      }
      if (punchImbalance === 0) info.push("Punch pairing: all employees balanced (within 1)");

      // ================================================================
      // 10. PUNCH TIMESTAMPS
      // ================================================================
      let invalidPunchMillis = 0;
      for (const p of punches) {
        const ms = Number(p.millis);
        if (!ms || isNaN(ms) || ms < 0) invalidPunchMillis++;
      }
      if (invalidPunchMillis > 0) errors.push("Punch timestamps: " + invalidPunchMillis + " punches with invalid millis");
      else info.push("Punch timestamps: all " + punches.length + " valid");

      // ================================================================
      // 11. WORKORDER LINE ITEMS → INVENTORY
      // ================================================================
      _setMigrationStep("Validating workorder lines → inventory...");
      let lineItemCount = 0;
      let lineItemMissing = 0;
      let lineItemCustom = 0;
      for (const wo of workorders) {
        let lines = [];
        try { lines = JSON.parse(wo.workorderLines || "[]"); } catch (e) { errors.push("Workorder " + wo.id + ": invalid workorderLines JSON"); continue; }
        if (!Array.isArray(lines)) continue;
        for (const line of lines) {
          lineItemCount++;
          const invItem = line.inventoryItem;
          if (!invItem || !invItem.id) { lineItemMissing++; continue; }
          if (invItem.customPart || invItem.customLabor) { lineItemCustom++; continue; }
          // Non-custom items: check if ID exists in inventory
          if (!inventoryIDSet.has(invItem.id)) {
            // Workorder lines embed the full item inline, so this is info not error
            lineItemMissing++;
          }
        }
      }
      info.push("Workorder lines: " + lineItemCount + " total, " + lineItemCustom + " custom, " + lineItemMissing + " not in inventory CSV (inline items, expected)");

      // ================================================================
      // 12. SALE FINANCIAL INTEGRITY
      // ================================================================
      _setMigrationStep("Validating sale financials...");
      let saleFinancialIssues = 0;
      for (const sale of sales) {
        const subtotal = Number(sale.subtotal) || 0;
        const discount = Number(sale.discount) || 0;
        const tax = Number(sale.salesTax) || 0;
        const total = Number(sale.total) || 0;
        const captured = Number(sale.amountCaptured) || 0;

        // total should ≈ subtotal - discount + tax (allow 2 cent tolerance for rounding)
        const expectedTotal = subtotal - discount + tax;
        if (Math.abs(total - expectedTotal) > 2) {
          saleFinancialIssues++;
          if (saleFinancialIssues <= 3) warnings.push("Sale " + sale.id + " math: subtotal(" + subtotal + ") - discount(" + discount + ") + tax(" + tax + ") = " + expectedTotal + " but total = " + total);
        }

        // paymentComplete should match captured ≥ total
        if (sale.paymentComplete === "true" && captured < total && total > 0) {
          warnings.push("Sale " + sale.id + ": marked complete but captured(" + captured + ") < total(" + total + ")");
        }

      }
      if (saleFinancialIssues === 0) info.push("Sale financials: all " + sales.length + " sales check out");
      else if (saleFinancialIssues > 6) warnings.push("...and " + (saleFinancialIssues - 6) + " more sale financial issues");

      // ================================================================
      // 12b. SALE → TRANSACTION (transactionIDs reference check)
      // ================================================================
      _setMigrationStep("Validating sale → transaction...");
      let saleTxnMissing = 0;
      let saleTxnLinks = 0;
      for (const sale of sales) {
        let txnIDs = [];
        try { txnIDs = JSON.parse(sale.transactionIDs || "[]"); } catch (e) { errors.push("Sale " + sale.id + ": invalid transactionIDs JSON"); continue; }
        if (!Array.isArray(txnIDs)) { errors.push("Sale " + sale.id + ": transactionIDs is not an array"); continue; }
        for (const txnID of txnIDs) {
          saleTxnLinks++;
          if (!transactionIDSet.has(txnID)) saleTxnMissing++;
        }
      }
      if (saleTxnMissing > 0) errors.push("Sale → Transaction: " + saleTxnMissing + "/" + saleTxnLinks + " transactionIDs reference missing transactions");
      else info.push("Sale → Transaction: all " + saleTxnLinks + " links OK");

      // ================================================================
      // 12c. TRANSACTION → SALE (saleID back-reference check)
      // ================================================================
      _setMigrationStep("Validating transaction → sale...");
      let txnSaleMissing = 0;
      for (const txn of transactions) {
        if (!txn.saleID) { errors.push("Transaction " + txn.id + ": empty saleID"); continue; }
        if (!saleIDSet.has(txn.saleID)) txnSaleMissing++;
      }
      if (txnSaleMissing > 0) warnings.push("Transaction → Sale: " + txnSaleMissing + "/" + transactions.length + " transactions reference sales not in export (may be outside 50-WO window)");
      else info.push("Transaction → Sale: all " + transactions.length + " OK");

      // ================================================================
      // 13. WORKORDER TIMESTAMP SANITY
      // ================================================================
      _setMigrationStep("Validating workorder timestamps...");
      let woTimestampIssues = 0;
      for (const wo of workorders) {
        const started = Number(wo.startedOnMillis) || 0;
        const finished = Number(wo.finishedOnMillis) || 0;
        const paid = Number(wo.paidOnMillis) || 0;
        if (!started) { woTimestampIssues++; continue; }
        if (finished && finished < started) {
          woTimestampIssues++;
          if (woTimestampIssues <= 3) warnings.push("Workorder " + wo.id + ": finished(" + new Date(finished).toLocaleDateString() + ") before started(" + new Date(started).toLocaleDateString() + ")");
        }
        if (paid && started && paid < started) {
          woTimestampIssues++;
          if (woTimestampIssues <= 3) warnings.push("Workorder " + wo.id + ": paid before started");
        }
      }
      if (woTimestampIssues === 0) info.push("Workorder timestamps: all " + workorders.length + " valid");
      else warnings.push("Workorder timestamps: " + woTimestampIssues + " issues total");

      // ================================================================
      // 14. BIDIRECTIONAL SALE ↔ WORKORDER CONSISTENCY
      // ================================================================
      _setMigrationStep("Checking sale ↔ workorder bidirectional links...");
      let biDirIssues = 0;
      for (const wo of workorders) {
        if (!wo.saleID && !wo._lsSaleID) continue;
        // Find the sale this WO claims to be linked to
        const linkedSale = sales.find(s => s.id === wo.saleID || s.lightspeed_id === wo._lsSaleID);
        if (!linkedSale) continue; // Already caught in check 4
        // Does the sale's workorderIDs include this WO?
        let saleWoIDs = [];
        try { saleWoIDs = JSON.parse(linkedSale.workorderIDs || "[]"); } catch (e) { continue; }
        if (!saleWoIDs.includes(wo.id)) {
          biDirIssues++;
          if (biDirIssues <= 3) warnings.push("Bidirectional: WO " + wo.id + " links to sale " + (wo.saleID || wo._lsSaleID) + " but sale doesn't list WO in workorderIDs");
        }
      }
      if (biDirIssues === 0) info.push("Sale ↔ Workorder bidirectional: all consistent");
      else if (biDirIssues > 3) warnings.push("...and " + (biDirIssues - 3) + " more bidirectional issues");

      // ================================================================
      // 15. CUSTOMER DATA QUALITY
      // ================================================================
      _setMigrationStep("Checking customer data quality...");
      let custNoName = 0;
      let custNoContact = 0;
      for (const c of customers) {
        if (!c.first && !c.last) custNoName++;
        if (!c.customerCell && !c.customerLandline && !c.email) custNoContact++;
      }
      if (custNoName > 0) warnings.push("Customer quality: " + custNoName + "/" + customers.length + " customers with no name");
      if (custNoContact > 0) warnings.push("Customer quality: " + custNoContact + "/" + customers.length + " customers with no phone or email");
      if (custNoName === 0 && custNoContact === 0) info.push("Customer quality: all have name + contact info");

      // ================================================================
      // 16. EMPLOYEE SKIPPED CHECK (Fritz, Support User, Office User)
      // ================================================================
      for (const emp of employees) {
        const name = ((emp.first || "") + " " + (emp.last || "")).trim().toLowerCase();
        if (name === "support user" || name === "office user") errors.push("Employee: system account \"" + name + "\" was not filtered out");
        if (emp.lightspeed_id === "1") errors.push("Employee: Fritz (LS ID 1) was not filtered out");
      }

      // ================================================================
      // 17. INVENTORY PRICE SANITY
      // ================================================================
      let invZeroPrice = 0;
      let invNegPrice = 0;
      for (const item of inventory) {
        const price = Number(item.price) || 0;
        if (price === 0) invZeroPrice++;
        if (price < 0) invNegPrice++;
      }
      if (invNegPrice > 0) errors.push("Inventory: " + invNegPrice + " items with negative price");
      if (invZeroPrice > 0) warnings.push("Inventory: " + invZeroPrice + "/" + inventory.length + " items with zero price");
      if (invNegPrice === 0 && invZeroPrice === 0) info.push("Inventory prices: all " + inventory.length + " positive");

      // ================================================================
      // REPORT
      // ================================================================
      _setMigrationStep("Validation complete");
      console.log("\n========================================");
      console.log("  IMPORT CSV VALIDATION REPORT");
      console.log("========================================\n");

      if (errors.length > 0) {
        console.log("ERRORS (" + errors.length + "):");
        for (const e of errors) console.log("  [ERROR] " + e);
        console.log("");
      }
      if (warnings.length > 0) {
        console.log("WARNINGS (" + warnings.length + "):");
        for (const w of warnings) console.log("  [WARN]  " + w);
        console.log("");
      }
      console.log("INFO (" + info.length + "):");
      for (const i of info) console.log("  [OK]    " + i);
      console.log("\n========================================");
      console.log("  " + errors.length + " errors, " + warnings.length + " warnings, " + info.length + " passed");
      console.log("========================================\n");

      const resultSummary = errors.length + " errors, " + warnings.length + " warnings, " + info.length + " checks passed";
      _setLsResult((errors.length > 0 ? "FAIL: " : "PASS: ") + resultSummary);

    } catch (e) {
      if (e.name === "AbortError") {
        _setMigrationStep("");
        _setLsResult("Folder selection cancelled");
      } else {
        console.error("[Validate] Error:", e);
        _setMigrationStep("Error");
        _setLsResult("Validation error: " + e.message);
      }
    }
    _setDevMigrating(false);
  }

  async function handleDevUploadMigration() {
    if (!window.confirm("This will CLEAR all collections and upload 20 most recent workorders + all associated data to the database. Continue?")) return;
    _setDevMigrating(true);
    _setMigrationStep("Loading & mapping CSVs...");
    _setMigrationProgress({ done: 0, total: 0 });
    _setLsResult("");
    const migrationStart = Date.now();

    try {
      // Invalidate cached CSV data so fresh files are always used
      _lsCsvData = null;

      // Clear existing collections before writing
      _setMigrationStep("Clearing collections...");
      console.log("[Dev Upload] Clearing collections...");
      await Promise.all([
        dbClearCollection("open-workorders"),
        dbClearCollection("completed-workorders"),
        dbClearCollection("customers"),
        dbClearCollection("completed-sales"),
        dbClearCollection("active-sales"),
        dbClearCollection("inventory"),
        dbClearCollection("punches"),
        dbClearCollection("transactions"),
      ]);
      console.log("[Dev Upload] Collections cleared.");

      // Extract statuses first so the mapping resolves status IDs correctly
      const settings = cloneDeep(useSettingsStore.getState().settings || {});
      _setMigrationStep("Extracting statuses...");
      console.log("[Dev Upload] Extracting statuses...");
      const statusesText = await fetch("/import_data/statuses.csv").then(r => r.text());
      const mergedStatuses = mapStatuses(statusesText);
      settings.statuses = mergedStatuses;
      await dbSaveSettings(settings);
      useSettingsStore.getState().setSettings(settings);

      // Load & map all CSV data with correct statuses
      _setMigrationStep("Loading & mapping CSVs...");
      console.log("[Dev Upload] Loading & mapping CSVs...");
      _lsCsvData = null;
      const freshData = await loadAndCacheLightspeedData();

      // Pick 20 most recent workorders
      const sorted = [...freshData.workorders]
        .filter(wo => wo.startedOnMillis)
        .sort((a, b) => b.startedOnMillis - a.startedOnMillis);
      const selectedWOs = sorted.slice(0, 20);
      console.log("[Dev Upload] Selected " + selectedWOs.length + " most recent workorders.");

      // Collect referenced IDs from those 20 workorders
      const customerIDSet = new Set();
      const saleIDSet = new Set();
      for (const wo of selectedWOs) {
        if (wo.customerID) customerIDSet.add(wo.customerID);
        if (wo.saleID) saleIDSet.add(wo.saleID);
      }

      // Filter associated data
      const filteredCustomers = freshData.customers.filter(c => customerIDSet.has(c.id));
      const filteredSales = freshData.sales.filter(s => saleIDSet.has(s.id));
      const filteredSaleIDSet = new Set(filteredSales.map(s => s.id));
      const filteredTransactions = freshData.transactions.filter(t => filteredSaleIDSet.has(t.saleID));

      // Build inventory (same as full migration)
      const invCsvText = await fetch("/lightspeed/inventory.csv").then(r => r.text());
      const invPriceMap = {};
      const stripDollar = (val) => (val || "").replace(/[$,]/g, "");
      for (const invRow of parseCSV(invCsvText)) {
        const desc = (invRow["Description"] || "").toLowerCase().trim();
        if (desc) invPriceMap[desc] = stripDollar(invRow["Price"]);
      }
      const itemRows = parseCSV(freshData.itemsText);
      const activeItems = itemRows.filter(row => row.archived !== "true" && row.description);
      const mappedItems = activeItems.map(item => {
        const isLabor = (item.description || "").toLowerCase().includes("labor");
        const descKey = (item.description || "").toLowerCase().trim();
        const retailPrice = invPriceMap[descKey];
        return {
          id: generateEAN13Barcode(),
          formalName: item.description || "",
          informalName: "",
          brand: "",
          price: retailPrice ? dollarsToCents(retailPrice) : dollarsToCents(item.defaultCost),
          salePrice: 0,
          cost: dollarsToCents(item.avgCost || item.defaultCost),
          category: isLabor ? "Labor" : "Item",
          primaryBarcode: normalizeBarcode(item.upc) || normalizeBarcode(item.ean) || generateEAN13Barcode(),
          barcodes: [normalizeBarcode(item.upc), normalizeBarcode(item.ean)].filter(Boolean),
          minutes: 0,
          customPart: false,
          customLabor: false,
        };
      });
      const pricedItems = mappedItems.filter(item => item.price > 0);

      // Map employees
      const empCsvText = await fetch("/lightspeed/employees.csv").then(r => r.ok ? r.text() : "").catch(() => "");
      const empHoursCsvText = await fetch("/lightspeed/employeeHours.csv").then(r => r.ok ? r.text() : "").catch(() => "");
      let employeeCount = 0;
      let punchCount = 0;

      console.log("[Dev Upload] Filtered: " + selectedWOs.length + " WOs, " + filteredCustomers.length + " customers, " + filteredSales.length + " sales, " + filteredTransactions.length + " transactions, " + pricedItems.length + " inventory.");

      // Save customers
      _setMigrationStep("Saving customers...");
      console.log("[Dev Upload] Saving " + filteredCustomers.length + " customers...");
      _setMigrationProgress({ done: 0, total: filteredCustomers.length });
      await dbBatchWrite(filteredCustomers, "customers", (done) => {
        _setMigrationProgress({ done, total: filteredCustomers.length });
      });
      console.log("[Dev Upload] Customers done.");

      // Save inventory
      _setMigrationStep("Saving inventory...");
      console.log("[Dev Upload] Saving " + pricedItems.length + " inventory items...");
      _setMigrationProgress({ done: 0, total: pricedItems.length });
      await dbBatchWrite(pricedItems, "inventory", (done) => {
        _setMigrationProgress({ done, total: pricedItems.length });
      });
      console.log("[Dev Upload] Inventory done.");

      // Route & save workorders (same logic as full migration)
      _setMigrationStep("Saving workorders...");
      const statusByLabel = {};
      for (const s of (settings.statuses || [])) statusByLabel[s.label.toLowerCase()] = s;
      const doneAndPaidID = statusByLabel["finished & paid"]?.id;

      const openWorkorders = selectedWOs.filter(wo => wo.status !== doneAndPaidID);
      const completedWorkorders = selectedWOs.filter(wo => wo.status === doneAndPaidID);
      const allWOs = [...openWorkorders, ...completedWorkorders];
      console.log("[Dev Upload] Saving " + openWorkorders.length + " open WOs + " + completedWorkorders.length + " completed WOs...");
      _setMigrationProgress({ done: 0, total: allWOs.length });
      let woDone = 0;
      await dbBatchWrite(openWorkorders, "open-workorders", (done) => {
        woDone = done;
        _setMigrationProgress({ done: woDone, total: allWOs.length });
      });
      await dbBatchWrite(completedWorkorders, "completed-workorders", (done) => {
        _setMigrationProgress({ done: woDone + done, total: allWOs.length });
      });
      console.log("[Dev Upload] Workorders done.");

      // Route & save sales (same logic as full migration)
      _setMigrationStep("Saving sales...");
      const completedSales = filteredSales.filter(s => s.paymentComplete);
      const linkedIncompleteSales = filteredSales.filter(s => !s.paymentComplete && s.workorderIDs && s.workorderIDs.length > 0);
      console.log("[Dev Upload] Saving " + completedSales.length + " completed sales + " + linkedIncompleteSales.length + " linked incomplete sales...");
      _setMigrationProgress({ done: 0, total: completedSales.length + linkedIncompleteSales.length });
      let salesDone = 0;
      await dbBatchWrite(completedSales, "completed-sales", (done) => {
        salesDone = done;
        _setMigrationProgress({ done: salesDone, total: completedSales.length + linkedIncompleteSales.length });
      });
      if (linkedIncompleteSales.length > 0) {
        await dbBatchWrite(linkedIncompleteSales, "active-sales", (done) => {
          _setMigrationProgress({ done: salesDone + done, total: completedSales.length + linkedIncompleteSales.length });
        });
      }
      console.log("[Dev Upload] Sales done.");

      // Save transactions
      _setMigrationStep("Saving transactions...");
      console.log("[Dev Upload] Saving " + filteredTransactions.length + " transactions...");
      _setMigrationProgress({ done: 0, total: filteredTransactions.length });
      await dbBatchWrite(filteredTransactions, "transactions", (done) => {
        _setMigrationProgress({ done, total: filteredTransactions.length });
      });
      console.log("[Dev Upload] Transactions done.");

      // Map & save employees and punch history
      if (empCsvText) {
        _setMigrationStep("Mapping employees...");
        const { users: newUsers, employeeIDMap } = mapEmployees(empCsvText);
        employeeCount = newUsers.length;
        console.log("[Dev Upload] Mapped " + newUsers.length + " employees.");

        const updatedSettings = cloneDeep(useSettingsStore.getState().settings || {});
        if (!updatedSettings.users) updatedSettings.users = [];
        const existingByLsID = {};
        updatedSettings.users.forEach(function (u) { if (u.lightspeed_id) existingByLsID[u.lightspeed_id] = u; });
        for (const u of newUsers) {
          if (!existingByLsID[u.lightspeed_id]) updatedSettings.users.push(u);
        }
        await dbSaveSettings(updatedSettings);
        useSettingsStore.getState().setSettings(updatedSettings);
        console.log("[Dev Upload] Users saved to settings (" + updatedSettings.users.length + " total).");

        if (empHoursCsvText) {
          _setMigrationStep("Saving punch history...");
          const punches = mapPunchHistory(empHoursCsvText, employeeIDMap);
          punchCount = punches.length;
          console.log("[Dev Upload] Saving " + punches.length + " punch records...");
          _setMigrationProgress({ done: 0, total: punches.length });
          await dbBatchWrite(punches, "punches", (done, total) => {
            _setMigrationProgress({ done, total });
          });
          console.log("[Dev Upload] Punch history done.");
        }
      }

      // Update local store with open workorders
      useOpenWorkordersStore.getState().setOpenWorkorders(openWorkorders);

      // Summary
      const elapsed = ((Date.now() - migrationStart) / 1000).toFixed(1);
      const summary = "Dev Upload Complete in " + elapsed + "s: " +
        filteredCustomers.length + " customers, " +
        pricedItems.length + " inventory, " +
        openWorkorders.length + " open WOs, " +
        completedWorkorders.length + " completed WOs, " +
        completedSales.length + " completed sales, " +
        linkedIncompleteSales.length + " active sales, " +
        filteredTransactions.length + " transactions, " +
        employeeCount + " employees, " +
        punchCount + " punches";
      console.log("[Dev Upload] " + summary);
      _setMigrationStep("Complete!");
      _setMigrationProgress({ done: 0, total: 0 });
      _setLsResult(summary);
    } catch (e) {
      console.error("[Dev Upload] Error:", e);
      _setMigrationStep("Error");
      _setLsResult("Dev Upload Error: " + e.message);
    }
    _setDevMigrating(false);
  }

  const migrationDisabled = sLookupLoading || sMigrating || sDevMigrating;

  function renderProgress() {
    if (!sMigrationStep) return null;
    const pct = sMigrationProgress.total > 0
      ? Math.round((sMigrationProgress.done / sMigrationProgress.total) * 100)
      : 0;
    return (
      <div className={styles.progressWrap}>
        <span className={styles.progressStep} style={{ color: C.text }}>
          {sMigrationStep}
        </span>
        {sMigrationProgress.total > 0 ? (
          <div className={styles.progressTrack} style={{ backgroundColor: C.surfaceAlt }}>
            <div className={styles.progressFill} style={{ width: pct + "%", backgroundColor: C.green }} />
          </div>
        ) : null}
        {sMigrationProgress.total > 0 ? (
          <span className={styles.progressCount} style={{ color: C.textMuted }}>
            {sMigrationProgress.done} / {sMigrationProgress.total}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className={styles.outerBox}>
      <div className={styles.innerBox}>
        {/* --- Full Migration --- */}
        <button
          type="button"
          onClick={handleFullMigration}
          disabled={migrationDisabled}
          className={styles.cardButton}
          style={{
            borderColor: C.red,
            backgroundColor: sMigrating ? C.surfaceAlt : C.listItemWhite,
            opacity: migrationDisabled ? 0.5 : 1,
          }}
        >
          <span className={styles.cardButtonTitle} style={{ color: C.red }}>
            {sMigrating ? "Migrating..." : "Full Migration"}
          </span>
          <span className={styles.cardButtonSubtitle} style={{ color: C.textMuted }}>
            All customers, inventory, workorders, sales
          </span>
        </button>
        {sMigrating ? renderProgress() : null}
        {/* --- Dev Migration --- */}
        <button
          type="button"
          onClick={handleDevMigration}
          disabled={migrationDisabled}
          className={styles.cardButton}
          style={{
            borderColor: C.orange,
            backgroundColor: sDevMigrating ? C.surfaceAlt : C.listItemWhite,
            opacity: migrationDisabled ? 0.5 : 1,
          }}
        >
          <span className={styles.cardButtonTitle} style={{ color: C.orange }}>
            {sDevMigrating ? "Migrating..." : "Dev Migration (20 WOs)"}
          </span>
          <span className={styles.cardButtonSubtitle} style={{ color: C.textMuted }}>
            Full mapping, 50 most recent WOs + dependencies, 7 CSVs
          </span>
        </button>
        {sDevMigrating ? renderProgress() : null}
        {/* --- Validate Export --- */}
        <button
          type="button"
          onClick={handleValidateExport}
          disabled={migrationDisabled}
          className={styles.cardButton}
          style={{
            borderColor: C.blue,
            backgroundColor: C.listItemWhite,
            opacity: migrationDisabled ? 0.5 : 1,
          }}
        >
          <span className={styles.cardButtonTitle} style={{ color: C.blue }}>
            Validate Export CSVs
          </span>
          <span className={styles.cardButtonSubtitle} style={{ color: C.textMuted }}>
            Cross-check all 7 _import_ files
          </span>
        </button>
        {/* --- Dev Upload Migration --- */}
        <button
          type="button"
          onClick={handleDevUploadMigration}
          disabled={migrationDisabled}
          className={styles.cardButton}
          style={{
            borderColor: "rgb(115, 83, 173)",
            backgroundColor: sDevMigrating ? C.surfaceAlt : C.listItemWhite,
            opacity: migrationDisabled ? 0.5 : 1,
          }}
        >
          <span className={styles.cardButtonTitle} style={{ color: "rgb(115, 83, 173)" }}>
            {sDevMigrating ? "Uploading..." : "Dev Upload Migration"}
          </span>
          <span className={styles.cardButtonSubtitle} style={{ color: C.textMuted }}>
            Clear DB + upload 20 most recent WOs + all dependencies
          </span>
        </button>
        <div className={styles.divider} style={{ backgroundColor: C.buttonLightGreenOutline }} />
        {/* --- Dev Import --- */}
        <button
          type="button"
          onClick={handleDevImport}
          disabled={sLookupLoading}
          className={styles.cardButton}
          style={{
            borderColor: C.buttonLightGreenOutline,
            backgroundColor: sLookupLoading ? C.surfaceAlt : C.listItemWhite,
            opacity: sLookupLoading ? 0.5 : 1,
          }}
        >
          <span className={styles.cardButtonTitle} style={{ color: C.text }}>
            {sLookupLoading ? "Importing..." : "Dev Import"}
          </span>
          <span className={styles.cardButtonSubtitle} style={{ color: C.textMuted }}>
            Up to 40 workorders (matching statuses)
          </span>
        </button>
        {/* --- Inventory Import --- */}
        <button
          type="button"
          onClick={handleInventoryImport}
          disabled={sLookupLoading}
          className={styles.cardButton}
          style={{
            borderColor: C.buttonLightGreenOutline,
            backgroundColor: sLookupLoading ? C.surfaceAlt : C.listItemWhite,
            opacity: sLookupLoading ? 0.5 : 1,
            marginBottom: 20,
          }}
        >
          <span className={styles.cardButtonTitle} style={{ color: C.text }}>
            {sLookupLoading ? "Importing..." : "Inventory Import"}
          </span>
          <span className={styles.cardButtonSubtitle} style={{ color: C.textMuted }}>
            All items from Lightspeed CSV
          </span>
        </button>
        {/* --- Download Inventory CSV --- */}
        <button
          type="button"
          onClick={handleDownloadInventoryCSV}
          className={styles.cardButton}
          style={{
            borderColor: C.blue,
            backgroundColor: C.listItemWhite,
            marginBottom: 20,
          }}
        >
          <span className={styles.cardButtonTitle} style={{ color: C.blue }}>
            Download Inventory CSV
          </span>
          <span className={styles.cardButtonSubtitle} style={{ color: C.textMuted }}>
            Export current inventory store to CSV
          </span>
        </button>
        {/* --- Load Inventory CSV → Zustand (local only) --- */}
        <input
          ref={inventoryCsvFileInputRef}
          type="file"
          accept=".csv,text/csv"
          style={{ display: "none" }}
          onChange={handleInventoryCSVFileChosen}
        />
        <button
          type="button"
          onClick={handleLoadInventoryFromCSVClick}
          className={styles.cardButton}
          style={{
            borderColor: C.orange,
            backgroundColor: C.listItemWhite,
            marginBottom: 20,
          }}
        >
          <span className={styles.cardButtonTitle} style={{ color: C.orange }}>
            Load Inventory CSV → Zustand (local only)
          </span>
          <span className={styles.cardButtonSubtitle} style={{ color: C.textMuted }}>
            Disables inventory listener, no DB writes. Refresh to restore.
          </span>
        </button>
        {/* --- Upload Inventory CSV → Firestore --- */}
        <input
          ref={inventoryUploadCsvFileInputRef}
          type="file"
          accept=".csv,text/csv"
          style={{ display: "none" }}
          onChange={handleInventoryUploadCSVFileChosen}
        />
        <button
          type="button"
          onClick={handleUploadInventoryFromCSVClick}
          disabled={sLookupLoading}
          className={styles.cardButton}
          style={{
            borderColor: C.red,
            backgroundColor: sLookupLoading ? C.surfaceAlt : C.listItemWhite,
            opacity: sLookupLoading ? 0.5 : 1,
            marginBottom: 20,
          }}
        >
          <span className={styles.cardButtonTitle} style={{ color: C.red }}>
            {sLookupLoading ? "Uploading..." : "Upload Inventory CSV → Firestore"}
          </span>
          <span className={styles.cardButtonSubtitle} style={{ color: C.textMuted }}>
            Overwrite live inventory by id. Quick buttons preserved.
          </span>
        </button>
        {/* --- Clear DB --- */}
        <button
          type="button"
          onClick={async () => {
            if (!window.confirm("Clear ALL customers, workorders, and sales from the database? This cannot be undone.")) return;
            _setLookupLoading(true);
            _setLsResult("");
            try {
              console.log("[Clear DB] Clearing collections...");
              const results = await Promise.all([
                dbClearCollection("customers"),
                dbClearCollection("open-workorders"),
                dbClearCollection("completed-workorders"),
                dbClearCollection("completed-sales"),
                dbClearCollection("active-sales"),
                dbClearCollection("inventory"),
              ]);
              const total = results.reduce((sum, r) => sum + (r.deletedCount || 0), 0);
              console.log("[Clear DB] Done. Deleted " + total + " documents.");
              _setLsResult("Cleared " + total + " documents (customers, workorders, sales)");
            } catch (e) {
              console.error("[Clear DB] Error:", e);
              _setLsResult("Clear DB error: " + e.message);
            } finally {
              _setLookupLoading(false);
            }
          }}
          disabled={sLookupLoading}
          className={styles.cardButton}
          style={{
            borderColor: C.lightred,
            backgroundColor: sLookupLoading ? C.surfaceAlt : C.listItemWhite,
            opacity: sLookupLoading ? 0.5 : 1,
          }}
        >
          <span className={styles.cardButtonTitle} style={{ color: C.lightred }}>
            {sLookupLoading ? "Clearing..." : "Clear DB"}
          </span>
          <span className={styles.cardButtonSubtitle} style={{ color: C.textMuted }}>
            Customers, workorders, sales
          </span>
        </button>
        {/* --- Clear Inventory --- */}
        <button
          type="button"
          onClick={async () => {
            if (!window.confirm("Clear ALL inventory items from the database? This cannot be undone.")) return;
            _setLookupLoading(true);
            _setLsResult("");
            try {
              console.log("[Clear Inventory] Clearing...");
              const result = await dbClearCollection("inventory");
              console.log("[Clear Inventory] Done. Deleted " + (result.deletedCount || 0) + " items.");
              _setLsResult("Cleared " + (result.deletedCount || 0) + " inventory items");
            } catch (e) {
              console.error("[Clear Inventory] Error:", e);
              _setLsResult("Clear Inventory error: " + e.message);
            } finally {
              _setLookupLoading(false);
            }
          }}
          disabled={sLookupLoading}
          className={styles.cardButton}
          style={{
            borderColor: C.lightred,
            backgroundColor: sLookupLoading ? C.surfaceAlt : C.listItemWhite,
            opacity: sLookupLoading ? 0.5 : 1,
            marginBottom: 20,
          }}
        >
          <span className={styles.cardButtonTitle} style={{ color: C.lightred }}>
            {sLookupLoading ? "Clearing..." : "Clear Inventory"}
          </span>
          <span className={styles.cardButtonSubtitle} style={{ color: C.textMuted }}>
            All inventory items
          </span>
        </button>
        <div className={styles.divider} style={{ backgroundColor: C.buttonLightGreenOutline }} />
        {/* --- Lightspeed Connection --- */}
        <span className={styles.sectionTitle} style={{ color: C.text }}>
          Lightspeed
        </span>
        <div className={styles.csvGrid}>
          <div className={styles.gridCell}>
            <button
              type="button"
              onClick={handleLsConnect}
              disabled={!!sLsImporting || sLsConnected}
              className={styles.gridButton}
              style={{
                borderColor: C.buttonLightGreenOutline,
                backgroundColor: sLsConnected ? C.green : C.listItemWhite,
                opacity: sLsImporting || sLsConnected ? 0.5 : 1,
              }}
            >
              <Image icon={ICONS.importIcon} size={30} />
              <span
                className={styles.gridButtonLabel}
                style={{ color: sLsConnected ? "white" : C.text }}
              >
                {sLsImporting === "connecting"
                  ? "Connecting..."
                  : sLsImporting === "checking"
                  ? "Checking..."
                  : sLsConnected
                  ? "Connected"
                  : "Connect to Lightspeed"}
              </span>
            </button>
          </div>
        </div>
        {/* --- Lightspeed CSV Exports --- */}
        <div className={`${styles.divider} ${styles.dividerSpaced}`} style={{ backgroundColor: C.buttonLightGreenOutline }} />
        <span className={styles.sectionTitle} style={{ color: C.text }}>
          Lightspeed CSV Exports
        </span>
        <button
          type="button"
          onClick={handleExportAllCsvs}
          disabled={!!sLsImporting || !sLsConnected}
          className={styles.cardButton}
          style={{
            borderColor: C.buttonLightGreenOutline,
            backgroundColor: sLsImporting === "all-csvs" ? C.surfaceAlt : C.listItemWhite,
            opacity: !sLsConnected ? 0.5 : sLsImporting === "all-csvs" ? 0.5 : 1,
            marginBottom: 15,
          }}
        >
          <span className={styles.cardButtonTitle} style={{ color: C.text }}>
            {sLsImporting === "all-csvs" ? "Exporting..." : "Export All CSVs"}
          </span>
          <span className={styles.cardButtonSubtitle} style={{ color: C.textMuted }}>
            All {CSV_EXPORT_TYPES.length} exports, sequentially
          </span>
        </button>
        <div className={styles.csvGrid}>
          {CSV_EXPORT_TYPES.map((btn) => (
            <div key={btn.type} className={styles.gridCell}>
              <button
                type="button"
                onClick={() => handleLsImportType(btn.type, false)}
                disabled={!!sLsImporting || !sLsConnected}
                className={styles.gridButton}
                style={{
                  borderColor: C.buttonLightGreenOutline,
                  backgroundColor: C.listItemWhite,
                  opacity: !sLsConnected ? 0.5 : sLsImporting === btn.type ? 0.5 : 1,
                }}
              >
                <Image icon={ICONS.importIcon} size={30} />
                <span className={styles.gridButtonLabel} style={{ color: C.text }}>
                  {sLsImporting === btn.type ? "Exporting..." : "Export " + btn.label}
                </span>
              </button>
            </div>
          ))}
        </div>

        {/* --- Mapping Preview --- */}
        <div className={`${styles.divider} ${styles.dividerSpaced}`} style={{ backgroundColor: C.buttonLightGreenOutline }} />
        <span className={styles.sectionTitle} style={{ color: C.text }}>
          Mapping Preview
        </span>
        <div className={styles.lookupBlock}>
          {/* Workorder lookup */}
          <div className={styles.lookupRow}>
            <span className={styles.lookupLabel} style={{ color: C.text }}>Workorder #</span>
            <input
              type="text"
              value={sWoLookup}
              onChange={(e) => _setWoLookup(e.target.value)}
              placeholder="e.g. 12345"
              className={styles.lookupInput}
              style={{
                borderColor: C.buttonLightGreenOutline,
                backgroundColor: C.listItemWhite,
                color: C.text,
              }}
              onKeyDown={(e) => { if (e.key === "Enter") handleWoLookup(); }}
            />
            <button
              type="button"
              onClick={handleWoLookup}
              disabled={sLookupLoading || !sWoLookup.trim()}
              className={styles.goButton}
              style={{
                backgroundColor: sLookupLoading || !sWoLookup.trim() ? C.borderStrong : C.green,
                opacity: sLookupLoading || !sWoLookup.trim() ? 0.5 : 1,
              }}
            >
              <span className={styles.goButtonText}>
                {sLookupLoading ? "..." : "Go"}
              </span>
            </button>
          </div>
          {/* Customer lookup */}
          <div className={styles.lookupRow}>
            <span className={styles.lookupLabel} style={{ color: C.text }}>Customer Ph</span>
            <input
              type="text"
              value={sCustLookup}
              onChange={(e) => _setCustLookup(e.target.value)}
              placeholder="e.g. 239-291-9396"
              className={styles.lookupInput}
              style={{
                borderColor: C.buttonLightGreenOutline,
                backgroundColor: C.listItemWhite,
                color: C.text,
              }}
              onKeyDown={(e) => { if (e.key === "Enter") handleCustLookup(); }}
            />
            <button
              type="button"
              onClick={handleCustLookup}
              disabled={sLookupLoading || !sCustLookup.trim()}
              className={styles.goButton}
              style={{
                backgroundColor: sLookupLoading || !sCustLookup.trim() ? C.borderStrong : C.green,
                opacity: sLookupLoading || !sCustLookup.trim() ? 0.5 : 1,
              }}
            >
              <span className={styles.goButtonText}>
                {sLookupLoading ? "..." : "Go"}
              </span>
            </button>
          </div>
        </div>

        {sLsResult ? (
          <span
            className={styles.resultText}
            style={{ color: sLsResult.startsWith("Error") ? C.red : C.green }}
          >
            {sLsResult}
          </span>
        ) : null}

        {/***************** dev tools **************************/}
        <div className={styles.devToolsBlock} style={{ borderTopColor: C.buttonLightGreenOutline }}>
          <span className={styles.devToolsHeader} style={{ color: C.textMuted }}>
            Dev Tools
          </span>
          <button
            type="button"
            onClick={async () => {
              const statusesText = await fetch("/import_data/statuses.csv").then(r => r.text());
              const statuses = mapStatuses(statusesText);
              const settings = { ...cloneDeep(SETTINGS_OBJ), statuses };
              await dbSaveSettings(settings);
              useSettingsStore.getState().setSettings(settings);
            }}
            className={styles.devButton}
            style={{ borderColor: C.buttonLightGreenOutline, backgroundColor: C.listItemWhite }}
          >
            <span className={styles.devButtonText} style={{ color: C.text }}>
              Inject Raw Settings
            </span>
          </button>
          <button
            type="button"
            onClick={async () => {
              const settings = useSettingsStore.getState().getSettings();
              await dbSaveSettings(settings);
              alert("Settings saved to Firestore.");
            }}
            className={styles.devButton}
            style={{ borderColor: C.buttonLightGreenOutline, backgroundColor: C.listItemWhite }}
          >
            <span className={styles.devButtonText} style={{ color: C.text }}>
              Save Settings
            </span>
          </button>
          <button
            type="button"
            onClick={async () => {
              const liveSettings = useSettingsStore.getState().getSettings();
              const defaults = cloneDeep(SETTINGS_OBJ);
              const merged = { ...defaults, ...liveSettings };
              await dbSaveSettings(merged);
              useSettingsStore.getState().setSettings(merged);
              alert("Settings merged and saved. New fields from defaults injected, existing values preserved.");
            }}
            className={styles.devButton}
            style={{ borderColor: C.buttonLightGreenOutline, backgroundColor: C.listItemWhite }}
          >
            <span className={styles.devButtonText} style={{ color: C.text }}>
              Merge Settings
            </span>
          </button>
          <button
            type="button"
            onClick={async () => {
              const { dbGetSettings } = await import("../../../../../db_calls_wrapper");
              const { tenantID, storeID } = useSettingsStore.getState().getSettings();
              const settings = await dbGetSettings(tenantID, storeID);
              if (settings) {
                useSettingsStore.getState().setSettings(settings);
                alert("Settings rehydrated from Firestore.");
              } else {
                alert("No settings found in Firestore.");
              }
            }}
            className={styles.devButton}
            style={{ borderColor: C.buttonLightGreenOutline, backgroundColor: C.listItemWhite }}
          >
            <span className={styles.devButtonText} style={{ color: C.text }}>
              Rehydrate Settings
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              let printObj = {
                id: crypto.randomUUID(),
                receiptType: "Workorder",
                barcode: "100000000001",
                workorderNumber: "WO-10001",
                customerFirstName: "John",
                customerLastName: "Smith",
                customerCell: "239-555-1234",
                customerEmail: "john.smith@email.com",
                customerAddress: "123 Main St, Bonita Springs, FL 34135",
                brand: "Trek",
                description: "Domane SL 5",
                color1: "Matte Black",
                color2: "Red",
                status: "In Progress",
                startedBy: "Mike",
                startedOnDate: "03/20/2026",
                finishedOnDate: "",
                subtotal: "$185.00",
                discount: "$10.00",
                tax: "$12.25",
                total: "$187.25",
                salesTaxPercent: "7%",
                labor: "$75.00",
                parts: "$110.00",
                shopName: "Bonita Bikes LLC",
                shopContactBlurb: "239-555-0000 | bonitabikes@email.com",
                thankYouBlurb: "Thank you for choosing Bonita Bikes!",
                workorderLines: [
                  { qty: 1, inventoryItem: { formalName: "Brake Pad Set - Shimano 105", price: 3500 }, id: "line1" },
                  { qty: 2, inventoryItem: { formalName: "Inner Tube 700x25c", price: 800 }, id: "line2" },
                  { qty: 1, inventoryItem: { formalName: "Chain - KMC X11 Silver", price: 3500 }, id: "line3" },
                  { qty: 1, inventoryItem: { formalName: "Labor - Full Tune Up", price: 7500 }, id: "line4" },
                ],
                customerNotes: ["Customer requested rush service", "Pickup after 5pm"],
                internalNotes: ["Rear derailleur cable frayed — replaced"],
              };
              dbSavePrintObj(printObj, localStorageWrapper.getItem("selectedPrinterID") || "");
            }}
            className={`${styles.devButton} ${styles.devButtonSpaced}`}
            style={{ borderColor: C.buttonLightGreenOutline, backgroundColor: C.listItemWhite }}
          >
            <span className={styles.devButtonText} style={{ color: C.text }}>
              Test Print
            </span>
          </button>
          <button
            type="button"
            onClick={async () => {
              let dayjs = (await import("dayjs")).default;
              let userID = "1234";
              let now = dayjs();
              let startDate = now.subtract(3, "month").startOf("day");
              let endDate = now.startOf("day");
              let current = startDate;
              let allPunches = [];

              while (current.isBefore(endDate) || current.isSame(endDate, "day")) {
                let pairCount = 3 + Math.floor(Math.random() * 5);
                let windowStart = 600;
                let windowEnd = 1140;
                let slotSize = Math.floor((windowEnd - windowStart) / pairCount);

                for (let i = 0; i < pairCount; i++) {
                  let slotStart = windowStart + (i * slotSize);
                  let slotEnd = slotStart + slotSize;
                  let inMinutes = slotStart + Math.floor(Math.random() * (slotSize * 0.5));
                  let outMinutes = Math.min(
                    inMinutes + 10 + Math.floor(Math.random() * (slotSize * 0.4)),
                    slotEnd - 1
                  );
                  if (outMinutes > windowEnd) outMinutes = windowEnd;
                  if (outMinutes <= inMinutes) outMinutes = inMinutes + 10;

                  let inMillis = current.add(inMinutes, "minute").valueOf();
                  let outMillis = current.add(outMinutes, "minute").valueOf();

                  allPunches.push({
                    ...TIME_PUNCH_PROTO,
                    userID,
                    id: crypto.randomUUID(),
                    millis: inMillis,
                    option: "in",
                  });
                  allPunches.push({
                    ...TIME_PUNCH_PROTO,
                    userID,
                    id: crypto.randomUUID(),
                    millis: outMillis,
                    option: "out",
                  });
                }
                current = current.add(1, "day");
              }

              log("Injecting " + allPunches.length + " punches for user 1234...");
              let batchSize = 20;
              for (let i = 0; i < allPunches.length; i += batchSize) {
                let batch = allPunches.slice(i, i + batchSize);
                await Promise.all(batch.map((p) => dbSavePunchObject(p)));
              }
              log("Done! Injected " + allPunches.length + " punches.");
              alert("Injected " + allPunches.length + " punches for user 1234 (3 months).");
            }}
            className={styles.devButton}
            style={{ borderColor: C.orange, backgroundColor: C.listItemWhite }}
          >
            <span className={styles.devButtonText} style={{ color: C.orange }}>
              Inject Test Punches (1234)
            </span>
          </button>
          <button
            type="button"
            onClick={async () => {
              const WO_IDS = ["1000000000245", "1000000000252"];
              try {
                const settings = useSettingsStore.getState().getSettings();
                const { tenantID, storeID } = settings;
                if (!tenantID || !storeID) { log("Revert: missing tenantID/storeID"); return; }

                const basePath = `tenants/${tenantID}/stores/${storeID}`;
                let results = [];

                for (let WO_ID of WO_IDS) {
                  let wo = null;
                  let wasCompleted = false;
                  const openPath = `${basePath}/open-workorders/${WO_ID}`;
                  wo = await firestoreRead(openPath);
                  if (!wo) {
                    const completedPath = `${basePath}/completed-workorders/${WO_ID}`;
                    wo = await firestoreRead(completedPath);
                    if (wo) wasCompleted = true;
                  }
                  if (!wo) {
                    results.push(WO_ID + ": not found");
                    continue;
                  }

                  let saleIDs = [wo.activeSaleID, wo.saleID].filter(Boolean);
                  let uniqueSaleIDs = [...new Set(saleIDs)];

                  for (let sid of uniqueSaleIDs) {
                    await firestoreDelete(`${basePath}/active-sales/${sid}`).catch(() => {});
                    await firestoreDelete(`${basePath}/completed-sales/${sid}`).catch(() => {});
                  }

                  wo.paymentComplete = false;
                  wo.activeSaleID = "";
                  wo.saleID = "";
                  wo.paidOnMillis = "";
                  wo.status = "finished";
                  wo.changeLog = (wo.changeLog || []).filter((e) => e.field !== "payment");

                  await firestoreWrite(openPath, wo);

                  if (wasCompleted) {
                    await firestoreDelete(`${basePath}/completed-workorders/${WO_ID}`);
                  }

                  useOpenWorkordersStore.getState().setWorkorder(wo, false);
                  results.push(WO_ID + ": reverted");
                }

                log("Revert complete:", results);
                useAlertScreenStore.getState().setValues({ title: "Reverted", message: results.join("\n"), btn1Text: "OK", handleBtn1Press: () => useAlertScreenStore.getState().setShowAlert(false), canExitOnOuterClick: true });
              } catch (e) {
                log("Revert error:", e);
                useAlertScreenStore.getState().setValues({ title: "Revert Error", message: e.message, btn1Text: "OK", handleBtn1Press: () => useAlertScreenStore.getState().setShowAlert(false), canExitOnOuterClick: true });
              }
            }}
            className={styles.devButton}
            style={{ borderColor: C.red, backgroundColor: C.listItemWhite }}
          >
            <span className={styles.devButtonText} style={{ color: C.red }}>
              Revert Sales (245 + 252)
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

export { ImportComponent };

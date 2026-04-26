/* eslint-disable */
/**
 * Standalone Lightspeed → Warpspeed Import Script
 *
 * Reads CSV files from ./csv/ and writes to Firestore using firebase-admin.
 * Full migration capabilities matching the browser-based migration.
 * Run: cd scripts && npm install && node lightspeed-import.js
 */

const admin = require("firebase-admin");
const { cloneDeep } = require("lodash");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const readline = require("readline");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

// ============================================================================
// CONFIG — Reads from scripts/.env (copy .env.example to .env and fill in)
// ============================================================================

const CONFIG = {
  tenantID: process.env.TENANT_ID || "",
  storeID: process.env.STORE_ID || "",

  // Path to Firebase service account JSON
  serviceAccountPath: path.resolve(__dirname, "serviceAccountKey.json"),

  // Firebase database URL (for Realtime DB if needed)
  databaseURL: "https://warpspeed-bonitabikes-default-rtdb.firebaseio.com",

  // CSV files directory
  csvDir: path.resolve(__dirname, "csv"),

  // Firestore batch size (max 500 per Firestore batch)
  BATCH_SIZE: 450,
};

// ============================================================================
// Firebase Admin Init
// ============================================================================

let db;

function initFirebase() {
  if (!fs.existsSync(CONFIG.serviceAccountPath)) {
    console.error("\n  Service account file not found: " + CONFIG.serviceAccountPath);
    console.error("  Download from: Firebase Console -> Project Settings -> Service Accounts -> Generate New Private Key");
    console.error("  Save it as: scripts/serviceAccountKey.json\n");
    process.exit(1);
  }

  const serviceAccount = JSON.parse(fs.readFileSync(CONFIG.serviceAccountPath, "utf8"));
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: CONFIG.databaseURL,
  });
  db = admin.firestore();
}

// ============================================================================
// Status Logger
// ============================================================================

function timestamp() {
  return new Date().toLocaleTimeString("en-US", { hour12: false });
}

function logStage(stageNum, totalStages, title) {
  console.log("\n[" + timestamp() + "] ---- STAGE " + stageNum + "/" + totalStages + ": " + title + " ----");
}

function logInfo(msg) {
  console.log("[" + timestamp() + "]   " + msg);
}

function logSuccess(msg) {
  console.log("[" + timestamp() + "]   + " + msg);
}

function logError(msg) {
  console.error("[" + timestamp() + "]   x " + msg);
}

// ============================================================================
// Utility Functions (from src/utils.js — browser-free copies)
// ============================================================================

function ean13CheckDigit(first12) {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += parseInt(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

function buildLightspeedEAN13(prefix2digit, lsID) {
  let padded = String(lsID).padStart(10, "0");
  return prefix2digit + padded;
}

function buildWorkorderNumberFromId(ean13) {
  const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  const date = new Date();
  const month = MONTHS[date.getMonth()];
  const year = String(date.getFullYear()).slice(-2);
  const digits = String(ean13).slice(0, 5);
  return "W" + digits + month + year;
}

function calculateCheckDigit(digits) {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    sum += Number(digits[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return String((10 - (sum % 10)) % 10);
}

function isValidCheckDigit(barcode) {
  let body = barcode.slice(0, -1);
  let expected = calculateCheckDigit(body);
  return barcode[barcode.length - 1] === expected;
}

function normalizeBarcode(input) {
  if (!input) return null;
  let stripped = input.replace(/\s/g, "");
  if (/\D/.test(stripped)) return null;
  let len = stripped.length;
  if (len < 11 || len > 13) return null;
  if (len === 11) {
    let check = calculateCheckDigit(stripped);
    let upc12 = stripped + check;
    return "0" + upc12;
  }
  if (len === 12) {
    if (!isValidCheckDigit(stripped)) return null;
    return "0" + stripped;
  }
  if (!isValidCheckDigit(stripped)) return null;
  return stripped;
}

function generateEAN13Barcode() {
  const arr = crypto.randomBytes(12);
  const digits = Array.from(arr, function (b) { return b % 10; });
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += digits[i] * (i % 2 === 0 ? 1 : 3);
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return digits.join("") + String(checkDigit);
}

function hexToRgb(hex) {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h.split("").map(function (c) { return c + c; }).join("");
  const int = parseInt(h, 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

function luminance(r, g, b) {
  const srgb = [r, g, b].map(function (v) {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

function contrastRatio(l1, l2) {
  const L1 = Math.max(l1, l2);
  const L2 = Math.min(l1, l2);
  return (L1 + 0.05) / (L2 + 0.05);
}

function gray(u) {
  let x = Number(u);
  if (!Number.isFinite(x)) x = 0;
  x = Math.min(1, Math.max(0, x));
  const v = Math.round((1 - x) * 255);
  return "rgb(" + v + "," + v + "," + v + ")";
}

function bestForegroundHex(bgHex) {
  const { r, g, b } = hexToRgb(bgHex);
  const bgLum = luminance(r, g, b);
  const contrastWithWhite = contrastRatio(bgLum, 1.0);
  const contrastWithBlack = contrastRatio(bgLum, 0.0);
  return contrastWithWhite >= contrastWithBlack ? "white" : gray(0.85);
}

function dollarsToCents(val) {
  if (!val && val !== 0) return 0;
  return Math.round(parseFloat(val) * 100) || 0;
}

// ============================================================================
// Data Constants (from src/data.js — browser-free copies)
// ============================================================================

const COLORS = [
  { textColor: "black", backgroundColor: "whitesmoke", label: "White" },
  { textColor: "white", backgroundColor: "blue", label: "Blue" },
  { textColor: "black", backgroundColor: "lightblue", label: "Light-blue" },
  { textColor: "white", backgroundColor: "red", label: "Red" },
  { textColor: "white", backgroundColor: "green", label: "Green" },
  { textColor: "whitesmoke", backgroundColor: "black", label: "Black" },
  { textColor: "black", backgroundColor: "yellow", label: "Yellow" },
  { textColor: "white", backgroundColor: "orange", label: "Orange" },
  { textColor: "white", backgroundColor: "maroon", label: "Maroon" },
  { textColor: "white", backgroundColor: "rgb(139,69,19)", label: "Brown" },
  { textColor: "black", backgroundColor: "rgb(192,192,192)", label: "Silver" },
  { textColor: "black", backgroundColor: "tan", label: "Tan" },
  { textColor: "black", backgroundColor: "beige", label: "Beige" },
  { textColor: "white", backgroundColor: "darkgray", label: "Gray" },
  { textColor: "black", backgroundColor: "lightgray", label: "Light-gray" },
  { textColor: "black", backgroundColor: "pink", label: "Pink" },
];

const NONREMOVABLE_STATUSES = [
  { id: "newly_created", label: "Newly Created", textColor: "white", backgroundColor: "red", removable: false, requireWaitTime: false },
  { id: "sale_in_progress", label: "Sale in Progress", textColor: "yellow", backgroundColor: "black", removable: false, requireWaitTime: false, systemOwned: true },
  { id: "finished_and_paid", label: "Finished & Paid", textColor: "white", backgroundColor: "green", removable: false, requireWaitTime: false, systemOwned: true },
  { id: "on_the_stand", label: "On the Stand", textColor: "white", backgroundColor: "pink", removable: false, requireWaitTime: false },
  { id: "service", textColor: "black", backgroundColor: "rgb(192,192,192)", label: "Service", removable: false, requireWaitTime: false },
  { id: "finished", textColor: "white", backgroundColor: "green", label: "Finished", removable: false, requireWaitTime: false },
  { id: "part_ordered", textColor: "white", backgroundColor: "orange", label: "Item Ordered", removable: false },
  { id: "is_order_part_for_customer", textColor: "rgb(38,38,38)", backgroundColor: "rgb(226,126,56)", label: "Order Item for Customer", removable: false },
  { id: "pickup", textColor: "white", backgroundColor: "purple", label: "Pickup", removable: false },
  { id: "delivery", textColor: "orange", backgroundColor: "purple", label: "Delivery", removable: false },
];

const CUSTOMER_LANGUAGES = {
  english: "English",
  spanish: "Spanish",
  french: "French",
  german: "German",
  creole: "Creole",
  arabic: "Arabic",
};

const APP_USER = {
  first: "",
  last: "",
  id: "",
  permissions: "",
  phone: "",
  email: "",
  pin: "",
  faceDescriptor: "",
  hourlyWage: "",
  preview: true,
  forwardSMS: false,
  statuses: [],
  pendingWorkorderIDs: [],
};

const TIME_PUNCH_PROTO = {
  userID: "",
  millis: "",
  id: "",
  option: "",
};

const STATUS_ALIASES = {
  "done & paid": "finished & paid",
  "bicycle ordered": "item ordered",
  "part ordered": "item ordered",
  "battery ordered": "item ordered",
  "accessory ordered": "item ordered",
  "order this item": "order item for customer",
  "order part for customer": "order item for customer",
  "order bicycle for customer": "order item for customer",
  "pickup/delivery today": "pickup",
  "pickup/delivery upcoming": "pickup",
};

const SKIP_EMPLOYEE_IDS = ["1"]; // Fritz - already in system
const SKIP_EMPLOYEE_NAMES = ["support user", "office user"]; // system accounts

// ============================================================================
// CSV Parsing (from src/lightspeed_import.js)
// ============================================================================

function parseCSVLine(line) {
  let result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    let ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) { result.push(current); current = ""; }
    else { current += ch; }
  }
  result.push(current);
  return result;
}

function splitCSVRows(text) {
  let rows = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    let ch = text[i];
    if (ch === '"') { inQuotes = !inQuotes; current += ch; }
    else if (ch === '\n' && !inQuotes) {
      if (current.trim()) rows.push(current);
      current = "";
    } else if (ch === '\r') { /* skip */ }
    else { current += ch; }
  }
  if (current.trim()) rows.push(current);
  return rows;
}

function parseCSV(text) {
  if (!text || !text.trim()) return [];
  let rows = splitCSVRows(text);
  if (rows.length === 0) return [];
  let headers = parseCSVLine(rows[0]);
  return rows.slice(1).map(function (row) {
    let values = parseCSVLine(row);
    let obj = {};
    headers.forEach(function (h, i) { obj[h.trim()] = (values[i] || "").trim(); });
    return obj;
  });
}

// ============================================================================
// Lightspeed Import Helpers
// ============================================================================

function sanitize(str) {
  return str.replace(/\\'/g, "'");
}

function cleanItemDescription(item) {
  if (!item) return "";
  let cleaned = item.trim();
  cleaned = cleaned.replace(/\s+[-\/][A-Z][A-Z0-9]*\s*$/, "");
  cleaned = cleaned.replace(/\s+\d+\/\d+\s*$/, "");
  let words = cleaned.split(/\s+/);
  while (words.length > 1) {
    let last = words[words.length - 1];
    if (last.length >= 2 && /[A-Z]/.test(last) && !/[a-z]/.test(last)) words.pop();
    else break;
  }
  return words.join(" ").trim();
}

// Color lookup map
const COLOR_MAP = {};
for (const c of COLORS) {
  const key = c.label.toLowerCase();
  COLOR_MAP[key] = { textColor: c.textColor || "", backgroundColor: c.backgroundColor || "", label: c.label || "" };
}
COLOR_MAP["grey"] = COLOR_MAP["gray"] || { textColor: "white", backgroundColor: "darkgray", label: "Gray" };
COLOR_MAP["light blue"] = COLOR_MAP["light-blue"];
COLOR_MAP["lightblue"] = COLOR_MAP["light-blue"];
COLOR_MAP["light gray"] = COLOR_MAP["light-gray"];
COLOR_MAP["lightgray"] = COLOR_MAP["light-gray"];

const EMPTY_COLOR = { textColor: "", backgroundColor: "", label: "" };

function mapColor(colorName) {
  if (!colorName) return { ...EMPTY_COLOR };
  let primary = colorName.split("/")[0].trim().toLowerCase();
  return COLOR_MAP[primary] ? { ...COLOR_MAP[primary] } : { ...EMPTY_COLOR };
}

function extractBrandModel(description) {
  if (!description) return { brand: "", model: "" };
  let working = cleanItemDescription(description);
  const colorKeywords = Object.keys(COLOR_MAP);
  for (const keyword of colorKeywords) {
    const regex = new RegExp("\\b" + keyword + "\\b", "i");
    working = working.replace(regex, "").replace(/\s{2,}/g, " ").trim();
  }
  let segment = working.split(/[,.]/)[0].trim();
  let words = segment.split(/\s+/).filter(function (w) { return w; });
  if (words.length > 1) return { brand: words.slice(0, -1).join(" "), model: words[words.length - 1] };
  if (words.length === 1) return { brand: words[0], model: "" };
  return { brand: "", model: "" };
}

function formatPhone(raw) {
  if (!raw) return "";
  return raw.replace(/\D/g, "");
}

function buildDiscountObj(saleLine, priceCents) {
  if (!saleLine) return null;
  const pct = parseFloat(saleLine.discountPercent) || 0;
  const amt = parseFloat(saleLine.discountAmount) || 0;
  if (pct === 0 && amt === 0) return null;

  let savings, discountType, discountValue;
  if (pct > 0) {
    discountType = "%";
    discountValue = Math.round(pct * 100);
    savings = Math.round(priceCents * pct);
  } else {
    discountType = "$";
    discountValue = dollarsToCents(amt);
    savings = dollarsToCents(amt);
  }

  return {
    id: crypto.randomUUID(),
    discountName: pct > 0 ? Math.round(pct * 100) + "% Off" : "$" + amt + " Off",
    discountValue,
    discountType,
    newPrice: priceCents - savings,
    savings,
  };
}

// ============================================================================
// Mapping Functions (ported from src/lightspeed_import.js)
// ============================================================================

function extractStatusesFromWorkorders(workorderCSVText, statusCSVText) {
  // Build color + sortOrder lookups from Lightspeed WorkorderStatus CSV
  const lsColorMap = {};
  const lsSortMap = {};
  if (statusCSVText) {
    const statusRows = parseCSV(statusCSVText);
    for (const row of statusRows) {
      const name = (row.name || "").trim().toLowerCase();
      const color = (row.htmlColor || "").trim();
      const sort = (row.sortOrder || "").trim();
      if (name && color) lsColorMap[name] = color;
      if (name && sort) lsSortMap[name] = parseInt(sort, 10) || 0;
    }
  }

  const rows = parseCSV(workorderCSVText);
  const seen = new Set();
  const extracted = [];
  for (const row of rows) {
    const name = (row.statusName || "").trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    extracted.push(name);
  }
  const nonremovableLabels = new Set(NONREMOVABLE_STATUSES.map(function (s) { return s.label.toLowerCase(); }));
  const csvStatuses = extracted
    .filter(function (name) {
      const lower = name.toLowerCase();
      if (nonremovableLabels.has(lower)) return false;
      if (STATUS_ALIASES[lower]) return false;
      return true;
    })
    .map(function (name) {
      const lsHex = lsColorMap[name.toLowerCase()];
      const bgHex = lsHex || "#B8B8B8";
      const textColor = bestForegroundHex(bgHex);
      const { r, g, b } = hexToRgb(bgHex);
      return {
        id: "ls_" + name.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
        label: name,
        textColor,
        backgroundColor: "rgb(" + r + "," + g + "," + b + ")",
        removable: true,
      };
    });
  csvStatuses.sort(function (a, b) {
    const aSort = lsSortMap[a.label.toLowerCase()] ?? Infinity;
    const bSort = lsSortMap[b.label.toLowerCase()] ?? Infinity;
    return aSort - bSort;
  });
  return [...NONREMOVABLE_STATUSES, ...csvStatuses];
}

function mapCustomers(customerCSVText) {
  const rows = parseCSV(customerCSVText);
  const customers = [];
  const phoneMap = {}; // phone -> customer index for deduplication
  const customerRedirectMap = {}; // discardedEAN -> survivingEAN

  for (const row of rows) {
    if (row.archived === "true") continue;

    const cell = formatPhone(row.phone1);
    const customer = {
      id: row.customerID ? buildLightspeedEAN13("20", row.customerID) : "",
      first: (row.firstName || "").toLowerCase().trim(),
      last: (row.lastName || "").toLowerCase().trim(),
      customerCell: cell,
      customerLandline: formatPhone(row.phone2),
      contactRestriction: "",
      email: (row.email || "").toLowerCase().trim(),
      streetAddress: (row.address1 || "").trim(),
      unit: (row.address2 || "").trim(),
      city: (row.city || "").trim(),
      state: (row.state || "").trim(),
      zip: (row.zip || "").trim(),
      addressNotes: "",
      interactionRating: "",
      workorders: [],
      previousBikes: [],
      sales: [],
      millisCreated: row.createTime ? String(new Date(row.createTime).getTime()) : "",
      gatedCommunity: false,
      deposits: [],
      credits: [],
      language: CUSTOMER_LANGUAGES.english,
      _importSource: "lightspeed",
      lightspeed_id: row.customerID || "",
    };

    // Deduplicate by phone
    if (cell && phoneMap[cell] !== undefined) {
      const existing = customers[phoneMap[cell]];
      const existingScore = (existing.first ? 1 : 0) + (existing.email ? 1 : 0) + (existing.streetAddress ? 1 : 0);
      const newScore = (customer.first ? 1 : 0) + (customer.email ? 1 : 0) + (customer.streetAddress ? 1 : 0);
      const keepID = existing.id;
      if (newScore > existingScore) {
        customers[phoneMap[cell]] = { ...customer, id: keepID };
      }
      customerRedirectMap[customer.id] = keepID;
      console.log("[Migration] Deduplicated customer phone " + cell + ": merged " + customer.id + " -> " + keepID);
      continue;
    }

    if (cell) phoneMap[cell] = customers.length;
    customers.push(customer);
  }

  return { customers, customerRedirectMap };
}

function mapWorkorders(
  workorderCSVText, workorderItemsCSVText, serializedCSVText,
  itemsCSVText, salesLinesCSVText, customerMap, warpspeedStatuses,
  employeesCSVText, salesCSVText, customerRedirectMap, settings
) {
  if (!customerRedirectMap) customerRedirectMap = {};
  if (!settings) settings = {};

  const woRows = parseCSV(workorderCSVText);
  const wiRows = parseCSV(workorderItemsCSVText);
  const serRows = parseCSV(serializedCSVText);
  const itemRows = parseCSV(itemsCSVText);
  const slRows = parseCSV(salesLinesCSVText);

  // Employee map
  const employeeMap = {};
  if (employeesCSVText) {
    const empRows = parseCSV(employeesCSVText);
    for (const row of empRows) {
      if (row.employeeID) {
        const first = (row.firstName || "").trim();
        const last = (row.lastName || "").trim();
        employeeMap[row.employeeID] = (first + (last ? " " + last[0] : "")).trim() || "Lightspeed Import";
      }
    }
  }

  // Sale map for taxFree detection
  const saleMap = {};
  if (salesCSVText) {
    const saleRows = parseCSV(salesCSVText);
    for (const row of saleRows) {
      if (row.saleID) saleMap[row.saleID] = row;
    }
  }

  // Lookup maps
  const serializedMap = {};
  for (const row of serRows) { if (row.serializedID) serializedMap[row.serializedID] = row; }

  const itemMap = {};
  for (const row of itemRows) { if (row.itemID) itemMap[row.itemID] = row; }

  const saleLineMap = {};
  for (const row of slRows) { if (row.saleLineID) saleLineMap[row.saleLineID] = row; }

  const workorderItemsMap = {};
  for (const row of wiRows) {
    if (!row.workorderID) continue;
    if (!workorderItemsMap[row.workorderID]) workorderItemsMap[row.workorderID] = [];
    workorderItemsMap[row.workorderID].push(row);
  }

  // Status map
  const statusMap = {};
  let fallbackStatus = null;
  for (const s of warpspeedStatuses) {
    statusMap[s.label.toLowerCase()] = s;
    if (s.label.toLowerCase() === "service") fallbackStatus = s;
  }
  if (!fallbackStatus && warpspeedStatuses.length > 0) fallbackStatus = warpspeedStatuses[0];

  const workorders = [];

  for (const wo of woRows) {
    const woID = wo.workorderID;
    if (!woID) continue;
    if (wo.archived === "true") continue;

    // Customer lookup (apply redirect for deduplicated customers)
    const woCustomerEAN = wo.customerID ? buildLightspeedEAN13("20", wo.customerID) : "";
    const resolvedCustomerID = customerRedirectMap[woCustomerEAN] || woCustomerEAN;
    const customer = customerMap[resolvedCustomerID] || null;
    const customerFirst = (wo.customerFirstName || "").toLowerCase().trim();
    const customerLast = (wo.customerLastName || "").toLowerCase().trim();
    const customerCell = customer ? customer.customerCell : "";

    // Status (resolve aliases first)
    const rawLabel = (wo.statusName || "").toLowerCase();
    const statusLabel = STATUS_ALIASES[rawLabel] || rawLabel;
    let status = statusMap[statusLabel] || fallbackStatus;
    if (!statusMap[statusLabel]) {
      console.warn("[Migration] Unknown status \"" + wo.statusName + "\" for WO " + woID + " - assigned \"" + (status ? status.label : "Unknown Status") + "\"");
    }
    if (!status) status = { backgroundColor: "", id: crypto.randomUUID(), label: "Unknown Status", removable: true, textColor: "" };

    // Bike details from serialized
    const ser = wo.serializedID ? serializedMap[wo.serializedID] : null;
    const serDescription = ser ? (ser.description || "") : "";
    const { brand } = extractBrandModel(serDescription);
    const cleaned = cleanItemDescription(serDescription);
    const description = brand && cleaned.toLowerCase().startsWith(brand.toLowerCase())
      ? cleaned.slice(brand.length).trim() : cleaned;
    const color1 = ser ? mapColor(ser.colorName) : { ...EMPTY_COLOR };

    // Timestamps
    const startedOnMillis = wo.timeIn ? new Date(wo.timeIn).getTime() : "";
    const isFinished = statusLabel.includes("finished") || statusLabel === "done & paid" || statusLabel === "sales bonus";
    let finishedOnMillis = isFinished && wo.timeStamp ? new Date(wo.timeStamp).getTime() : "";
    if (isFinished && !finishedOnMillis) console.warn("[Migration] Finished WO " + woID + " missing timeStamp, finishedOnMillis is empty");

    // paidOnMillis from linked sale
    const linkedSale = wo.saleID ? saleMap[wo.saleID] : null;
    const paidOnMillis = linkedSale && linkedSale.completeTime ? new Date(linkedSale.completeTime).getTime() : "";

    // Notes
    const noteName = employeeMap[wo.employeeID] || "Lightspeed Import";
    const customerNotes = [];
    if (wo.note && wo.note.trim()) {
      customerNotes.push({ id: crypto.randomUUID(), name: noteName, userID: "", value: sanitize(wo.note.trim()) });
    }
    const internalNotes = [];
    if (wo.internalNote && wo.internalNote.trim()) {
      internalNotes.push({ id: crypto.randomUUID(), name: noteName, userID: "", value: sanitize(wo.internalNote.trim()) });
    }

    // Catalog items from workorderItems
    const woItems = workorderItemsMap[woID] || [];
    const workorderLines = woItems.map(function (wi) {
      const item = itemMap[wi.itemID] || null;

      const rawUpc = item ? (item.upc || "") : "";
      const rawEan = item ? (item.ean || "") : "";
      const normUpc = normalizeBarcode(rawUpc);
      const normEan = normalizeBarcode(rawEan);
      const isNativeEan = normEan && !normEan.startsWith("0");
      const primaryBarcode = (isNativeEan ? normEan : null) || normUpc || generateEAN13Barcode();
      const barcodes = [normEan, normUpc].filter(function (c) { return c && c !== primaryBarcode; });

      const inventoryItem = {
        id: item ? item.itemID : crypto.randomUUID(),
        formalName: item ? (item.description || "Unknown Item") : "Unknown Item",
        informalName: "",
        brand: "",
        price: dollarsToCents(wi.unitPrice),
        salePrice: 0,
        cost: item ? dollarsToCents(item.avgCost || item.defaultCost) : 0,
        category: item && item.itemType === "non_inventory" ? "Labor" : "Item",
        primaryBarcode,
        barcodes,
        customPart: false,
        customLabor: false,
        minutes: 0,
      };

      const wiSaleLine = wi.saleLineID ? saleLineMap[wi.saleLineID] : null;
      return {
        id: crypto.randomUUID(),
        qty: parseInt(wi.unitQuantity) || 1,
        intakeNotes: sanitize((wi.note || "").trim()),
        receiptNotes: "",
        inventoryItem,
        discountObj: buildDiscountObj(wiSaleLine, inventoryItem.price),
        useSalePrice: false,
        warranty: wi.warranty === "true",
      };
    });

    // Custom lines from workorderLinesJSON
    let woLinesParsed = [];
    try {
      if (wo.workorderLinesJSON) woLinesParsed = JSON.parse(wo.workorderLinesJSON);
    } catch (e) {
      console.error("[LS Mapping] Failed to parse workorderLinesJSON for WO " + woID + ":", e.message);
    }
    if (!Array.isArray(woLinesParsed)) woLinesParsed = [];

    for (const wl of woLinesParsed) {
      const totalMinutes = (parseInt(wl.hours) || 0) * 60 + (parseInt(wl.minutes) || 0);
      const isLabor = totalMinutes > 0;
      const wlSaleLine = wl.saleLineID ? saleLineMap[wl.saleLineID] : null;
      const price = wlSaleLine ? dollarsToCents(wlSaleLine.unitPrice) : dollarsToCents(wl.unitPriceOverride);

      workorderLines.push({
        id: crypto.randomUUID(),
        qty: parseInt(wl.unitQuantity) || 1,
        intakeNotes: "",
        receiptNotes: "",
        inventoryItem: {
          id: crypto.randomUUID(),
          formalName: sanitize((wl.note || "").trim()) || (isLabor ? "Custom Labor" : "Custom Item"),
          informalName: "",
          brand: "",
          price,
          salePrice: 0,
          cost: dollarsToCents(wl.unitCost),
          category: isLabor ? "Labor" : "Item",
          customPart: !isLabor,
          customLabor: isLabor,
          minutes: totalMinutes,
        },
        discountObj: buildDiscountObj(wlSaleLine, price),
        useSalePrice: false,
        warranty: wl.warranty === "true",
      });
    }

    const ean13 = buildLightspeedEAN13("25", woID);
    const isTaxFree = wo.saleID && saleMap[wo.saleID]
      ? (parseFloat(saleMap[wo.saleID].calcTax1 || "0") + parseFloat(saleMap[wo.saleID].calcTax2 || "0")) === 0
      : false;

    const mappedWo = {
      workorderNumber: buildWorkorderNumberFromId(ean13),
      id: ean13,
      lightspeed_id: woID,
      customerID: resolvedCustomerID || "",
      customerFirst,
      customerLast,
      customerCell,
      customerLandline: customer ? (customer.customerLandline || "") : "",
      customerEmail: customer ? (customer.email || "") : "",
      customerContactRestriction: "",
      customerLanguage: "",
      customerPin: "",
      brand,
      description,
      color1,
      color2: { ...EMPTY_COLOR },
      status: status.id,
      taxFree: isTaxFree,
      taxFreeReceiptNote: isTaxFree ? (settings.taxFreeReceiptNote || "") : "",
      archived: wo.archived === "true",
      startedBy: employeeMap[wo.employeeID] || wo.employeeID || "",
      startedOnMillis,
      finishedOnMillis,
      paidOnMillis,
      workorderLines,
      customerNotes,
      internalNotes,
      changeLog: [],
      hasNewSMS: false,
      waitTime: "",
      waitTimeEstimateLabel: "",
      partOrdered: "",
      partSource: "",
      partToBeOrdered: false,
      partOrderEstimateMillis: "",
      partOrderedMillis: "",
      paymentComplete: false,
      amountPaid: 0,
      activeSaleID: "",
      endedOnMillis: "",
      saleID: "",
      media: [],
      _lsSaleID: (wo.saleID && wo.saleID !== "0") ? wo.saleID : "",
      _importSource: "lightspeed",
    };

    workorders.push(mappedWo);

    // Backfill customer workorders array
    if (customer) {
      customer.workorders.push(mappedWo.id);
    }
  }

  return workorders;
}

function mapSales(salesCSVText, salesPaymentsCSVText, stripePaymentsCSVText, workorderMap, customerMap, customerRedirectMap) {
  if (!customerRedirectMap) customerRedirectMap = {};
  const saleRows = parseCSV(salesCSVText);
  const spRows = parseCSV(salesPaymentsCSVText);
  const stripeRows = stripePaymentsCSVText ? parseCSV(stripePaymentsCSVText) : [];

  const paymentsMap = {};
  for (const sp of spRows) {
    if (!sp.saleID) continue;
    if (!paymentsMap[sp.saleID]) paymentsMap[sp.saleID] = [];
    paymentsMap[sp.saleID].push(sp);
  }

  const stripeByOrderID = {};
  for (const sr of stripeRows) {
    const orderID = sr["Order ID"];
    if (!orderID) continue;
    if (!stripeByOrderID[orderID]) stripeByOrderID[orderID] = [];
    stripeByOrderID[orderID].push(sr);
  }

  const sales = [];
  const allTransactions = [];

  for (const row of saleRows) {
    const lsSaleID = row.saleID;
    if (!lsSaleID) continue;
    if (row.voided === "true") continue;

    const completed = row.completed === "true";
    const subtotal = dollarsToCents(row.calcSubtotal);
    const total = dollarsToCents(row.calcTotal);
    const tax = dollarsToCents(row.calcTax1) + dollarsToCents(row.calcTax2);
    const discount = dollarsToCents(row.calcDiscount);

    const taxableAmount = subtotal - discount;
    const salesTaxPercent = taxableAmount > 0 ? Math.round((tax / taxableAmount) * 10000) / 10000 : 0;

    const millis = row.completeTime
      ? new Date(row.completeTime).getTime()
      : row.createTime ? new Date(row.createTime).getTime() : "";

    const linkedWorkorders = workorderMap[lsSaleID] || [];
    const workorderIDs = linkedWorkorders.map(function (wo) { return wo.id; });

    // Customer linkage (apply redirect for deduplicated customers)
    const saleCustEAN = row.customerID && row.customerID !== "0"
      ? buildLightspeedEAN13("20", row.customerID) : "";
    const resolvedCustID = saleCustEAN ? (customerRedirectMap[saleCustEAN] || saleCustEAN) : "";
    const customer = resolvedCustID ? customerMap[resolvedCustID] || null : null;

    const paymentRows = paymentsMap[lsSaleID] || [];
    const saleID = buildLightspeedEAN13("22", lsSaleID);

    const stripeForSale = stripeByOrderID[lsSaleID] || [];
    const stripeUsed = new Set();

    const payments = paymentRows.map(function (sp) {
      const isCash = sp.paymentTypeType === "cash";
      const isCheck = sp.paymentTypeName === "Check";
      const isCard = sp.paymentTypeType === "credit card";
      const amount = dollarsToCents(sp.amount);

      let stripeMatch = null;
      if (isCard && stripeForSale.length > 0) {
        for (let i = 0; i < stripeForSale.length; i++) {
          if (stripeUsed.has(i)) continue;
          if (dollarsToCents(stripeForSale[i]["Amount"]) === amount) {
            stripeMatch = stripeForSale[i]; stripeUsed.add(i); break;
          }
        }
        if (!stripeMatch) {
          for (let i = 0; i < stripeForSale.length; i++) {
            if (stripeUsed.has(i)) continue;
            stripeMatch = stripeForSale[i]; stripeUsed.add(i);
            console.warn("[Migration] Stripe fallback match for sale " + lsSaleID + ": payment $" + (amount / 100).toFixed(2) + " matched to Stripe $" + stripeForSale[i]["Amount"] + " (inexact)");
            break;
          }
        }
      }

      return {
        id: sp.salePaymentID || crypto.randomUUID(),
        saleID,
        type: amount < 0 ? "refund" : "payment",
        method: isCash ? "cash" : isCheck ? "check" : "card",
        amountCaptured: amount,
        amountTendered: (isCash && amount >= 0) ? amount : 0,
        salesTax: 0,
        cardType: stripeMatch ? stripeMatch["Card type"] : (sp.cardType || ""),
        cardIssuer: isCard ? sp.paymentTypeName : "",
        last4: stripeMatch ? stripeMatch["Card last 4"] : (sp.cardLast4 || ""),
        authorizationCode: sp.authCode || "",
        millis: sp.createTime ? new Date(sp.createTime).getTime() : 0,
        paymentProcessor: isCard ? "Stripe" : "",
        chargeID: stripeMatch ? stripeMatch["ID"] : (sp.ccChargeID && sp.ccChargeID !== "0" ? sp.ccChargeID : ""),
        paymentIntentID: stripeMatch ? (stripeMatch["Payment ID"] || "") : "",
        receiptURL: "",
        expMonth: "",
        expYear: "",
        networkTransactionID: "",
        amountRefunded: stripeMatch ? dollarsToCents(stripeMatch["Refunded amount"]) : 0,
        depositType: "",
        depositId: "",
        depositOriginalAmount: 0,
        _cardFundingSource: stripeMatch ? (stripeMatch["Card funding source"] || "") : "",
        _entryMode: stripeMatch ? (stripeMatch["Entry mode"] || "") : "",
        refunds: [],
      };
    });

    // Compute amounts from actual payments
    const computedAmountCaptured = payments.reduce(function (sum, p) { return p.type === "payment" ? sum + p.amountCaptured : sum; }, 0);
    const computedAmountRefunded = payments.reduce(function (sum, p) { return p.type === "refund" ? sum + Math.abs(p.amountCaptured) : sum; }, 0);

    const mappedSale = {
      id: saleID,
      lightspeed_id: lsSaleID,
      millis,
      subtotal,
      discount,
      salesTax: tax,
      salesTaxPercent,
      total,
      amountCaptured: computedAmountCaptured,
      amountRefunded: computedAmountRefunded,
      paymentComplete: completed,
      workorderIDs,
      transactionIDs: payments.map(function (p) { return p.id; }),
      pendingTransactionIDs: [],
      pendingRefundIDs: [],
      creditsApplied: [],
      depositsApplied: [],
      customerID: resolvedCustID,
      refunds: [],
      textToPay: false,
      checkoutSessionID: "",
      depositType: "",
      voidedByRefund: false,
      _importSource: "lightspeed",
    };

    sales.push(mappedSale);
    allTransactions.push(...payments);

    // Backfill workorder saleID
    for (const wo of linkedWorkorders) {
      wo.saleID = saleID;
      if (completed) {
        wo.paymentComplete = true;
        wo.amountPaid = computedAmountCaptured;
      }
    }

    // Backfill customer sales array
    if (customer) {
      customer.sales.push(saleID);
    }
  }

  return { sales, transactions: allTransactions };
}

function mapInventory(itemsCSVText) {
  const itemRows = parseCSV(itemsCSVText);
  const activeItems = itemRows.filter(function (row) { return row.archived !== "true" && row.description; });
  const items = [];

  for (const item of activeItems) {
    const isLabor = (item.description || "").toLowerCase().includes("labor");

    const rawUpc = (item.upc || "").trim();
    const rawEan = (item.ean || "").trim();
    const normUpc = normalizeBarcode(rawUpc);
    const normEan = normalizeBarcode(rawEan);
    const isNativeEan = normEan && !normEan.startsWith("0");
    const primaryBarcode = (isNativeEan ? normEan : null) || normUpc || generateEAN13Barcode();
    const barcodes = [normEan, normUpc].filter(function (c) { return c && c !== primaryBarcode; });

    items.push({
      id: generateEAN13Barcode(),
      formalName: (item.description || "").trim(),
      informalName: "",
      brand: (item.brand || "").trim(),
      price: dollarsToCents(item.price || "0"),
      salePrice: 0,
      cost: dollarsToCents(item.avgCost || item.defaultCost),
      category: isLabor ? "Labor" : "Item",
      primaryBarcode,
      barcodes,
      minutes: 0,
      customPart: false,
      customLabor: false,
    });
  }

  return items;
}

function mapEmployees(employeesCSVText) {
  const rows = parseCSV(employeesCSVText);
  const users = [];
  const employeeIDMap = {};

  for (const row of rows) {
    const lsID = (row.employeeID || "").trim();
    if (!lsID) continue;
    if (SKIP_EMPLOYEE_IDS.includes(lsID)) continue;

    const first = (row.firstName || "").trim();
    const last = (row.lastName || "").trim();
    const fullName = (first + " " + last).trim().toLowerCase();
    if (SKIP_EMPLOYEE_NAMES.includes(fullName)) continue;

    const appUserID = crypto.randomUUID();
    employeeIDMap[lsID] = appUserID;

    users.push({
      ...APP_USER,
      first,
      last,
      id: appUserID,
      permissions: { name: "User", level: 1 },
      _importSource: "lightspeed",
      lightspeed_id: lsID,
    });
  }

  return { users, employeeIDMap };
}

function mapPunchHistory(employeeHoursCSVText, employeeIDMap) {
  const rows = parseCSV(employeeHoursCSVText);
  const punches = [];

  for (const row of rows) {
    const lsEmployeeID = (row.employeeID || "").trim();
    const appUserID = employeeIDMap[lsEmployeeID];
    if (!appUserID) continue;

    const checkIn = (row.checkIn || "").trim();
    const checkOut = (row.checkOut || "").trim();

    if (checkIn) {
      punches.push({
        ...TIME_PUNCH_PROTO,
        id: crypto.randomUUID(),
        userID: appUserID,
        millis: new Date(checkIn).getTime(),
        option: "in",
        _importSource: "lightspeed",
      });
    }

    if (checkOut) {
      punches.push({
        ...TIME_PUNCH_PROTO,
        id: crypto.randomUUID(),
        userID: appUserID,
        millis: new Date(checkOut).getTime(),
        option: "out",
        _importSource: "lightspeed",
      });
    }
  }

  return punches;
}

// ============================================================================
// Firestore Batch Writer
// ============================================================================

async function batchWrite(collectionPath, docs, label) {
  if (docs.length === 0) {
    logInfo(label + ": 0 docs - skipping");
    return;
  }

  logInfo("Writing " + label + "... (" + docs.length.toLocaleString() + " docs)");
  const startTime = Date.now();
  let totalBatches = Math.ceil(docs.length / CONFIG.BATCH_SIZE);

  for (let i = 0; i < docs.length; i += CONFIG.BATCH_SIZE) {
    const chunk = docs.slice(i, i + CONFIG.BATCH_SIZE);
    const batch = db.batch();
    for (const doc of chunk) {
      const ref = db.doc(collectionPath + "/" + doc.id);
      batch.set(ref, doc);
    }
    await batch.commit();

    const batchNum = Math.floor(i / CONFIG.BATCH_SIZE) + 1;
    if (totalBatches > 1) {
      process.stdout.write("\r[" + timestamp() + "]   ... batch " + batchNum + "/" + totalBatches);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  if (totalBatches > 1) process.stdout.write("\r" + " ".repeat(80) + "\r");
  logSuccess(label + " written (" + totalBatches + " batch" + (totalBatches > 1 ? "es" : "") + ", " + elapsed + "s)");
}

// ============================================================================
// Clear Collection (for idempotent re-runs)
// ============================================================================

async function clearCollection(collectionPath, label) {
  logInfo("Clearing " + label + "...");
  const snapshot = await db.collection(collectionPath).get();
  if (snapshot.empty) {
    logInfo(label + ": already empty");
    return;
  }
  let totalDeleted = 0;
  const docs = snapshot.docs;
  for (let i = 0; i < docs.length; i += CONFIG.BATCH_SIZE) {
    const chunk = docs.slice(i, i + CONFIG.BATCH_SIZE);
    const batch = db.batch();
    for (const doc of chunk) batch.delete(doc.ref);
    await batch.commit();
    totalDeleted += chunk.length;
  }
  logSuccess(label + " cleared (" + totalDeleted + " docs)");
}

// ============================================================================
// CSV File Reader
// ============================================================================

const CSV_FILES = [
  "customers.csv",
  "workorders.csv",
  "workorderItems.csv",
  "serialized.csv",
  "items.csv",
  "salesLines.csv",
  "sales.csv",
  "salesPayments.csv",
  "stripePayments.csv",
  "employees.csv",
  "employeeHours.csv",
  "workorderStatuses.csv",
];

const OPTIONAL_CSV_FILES = new Set(["stripePayments.csv", "employeeHours.csv", "workorderStatuses.csv"]);

function readCSVFiles() {
  const csvData = {};
  const missing = [];

  for (const file of CSV_FILES) {
    const filePath = path.join(CONFIG.csvDir, file);
    if (fs.existsSync(filePath)) {
      const text = fs.readFileSync(filePath, "utf8");
      const rows = parseCSV(text);
      csvData[file] = text;
      logSuccess(file.padEnd(25) + " (" + rows.length.toLocaleString() + " rows)");
    } else {
      if (OPTIONAL_CSV_FILES.has(file)) {
        csvData[file] = "";
        logInfo(file.padEnd(25) + " (not found - optional, skipping)");
      } else {
        missing.push(file);
        logError(file.padEnd(25) + " - MISSING");
      }
    }
  }

  if (missing.length > 0) {
    console.error("\n  Missing required CSV files. Place them in: " + CONFIG.csvDir + "\n");
    process.exit(1);
  }

  return csvData;
}

// ============================================================================
// Interactive Prompt
// ============================================================================

function askQuestion(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(function (resolve) {
    rl.question(prompt, function (answer) {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ============================================================================
// Main Orchestrator
// ============================================================================

async function main() {
  const globalStart = Date.now();

  console.log("");
  console.log("+=================================================+");
  console.log("|  Lightspeed -> Warpspeed Import Script           |");
  console.log("+=================================================+");
  console.log("  Tenant: " + CONFIG.tenantID);
  console.log("  Store:  " + CONFIG.storeID);

  // Validate config
  if (!CONFIG.tenantID || !CONFIG.storeID) {
    console.error("\n  x TENANT_ID and STORE_ID missing. Set them in scripts/.env");
    console.error("  Copy .env.example to .env and fill in your values.\n");
    process.exit(1);
  }

  // Mode selection
  console.log("");
  console.log("  full - All workorders, customers, sales, inventory, employees");
  console.log("  dev  - 20 most recent WOs + associated data only");
  console.log("");
  let choice = "";
  while (choice !== "full" && choice !== "dev") {
    choice = (await askQuestion("  Type 'full' or 'dev': ")).toLowerCase();
  }
  const devMode = choice === "dev";

  console.log("\n  -> " + (devMode ? "Dev" : "Full") + " Migration selected\n");

  const TOTAL_STAGES = 10;

  // Init Firebase
  initFirebase();
  const basePath = "tenants/" + CONFIG.tenantID + "/stores/" + CONFIG.storeID;

  // -- STAGE 1: Read CSV files --
  logStage(1, TOTAL_STAGES, "Reading CSV files");
  const csv = readCSVFiles();

  // -- STAGE 2: Clear existing collections --
  logStage(2, TOTAL_STAGES, "Clearing existing collections");
  await clearCollection(basePath + "/open-workorders", "open workorders");
  await clearCollection(basePath + "/completed-workorders", "completed workorders");
  await clearCollection(basePath + "/customers", "customers");
  await clearCollection(basePath + "/completed-sales", "completed sales");
  await clearCollection(basePath + "/active-sales", "active sales");
  await clearCollection(basePath + "/inventory", "inventory");
  await clearCollection(basePath + "/transactions", "transactions");
  await clearCollection(basePath + "/punches", "punches");

  // -- STAGE 3: Map statuses --
  logStage(3, TOTAL_STAGES, "Mapping statuses");
  const statuses = extractStatusesFromWorkorders(csv["workorders.csv"], csv["workorderStatuses.csv"]);
  const builtIn = NONREMOVABLE_STATUSES.length;
  const fromCSV = statuses.length - builtIn;
  logSuccess(statuses.length + " statuses (" + builtIn + " built-in + " + fromCSV + " from CSV)");

  // -- STAGE 4: Map inventory --
  logStage(4, TOTAL_STAGES, "Mapping inventory");
  const inventoryItems = mapInventory(csv["items.csv"]);
  logSuccess(inventoryItems.length.toLocaleString() + " items mapped");

  // -- STAGE 5: Map customers --
  logStage(5, TOTAL_STAGES, "Mapping customers");
  const { customers: allCustomers, customerRedirectMap } = mapCustomers(csv["customers.csv"]);
  const redirectCount = Object.keys(customerRedirectMap).length;
  logSuccess(allCustomers.length.toLocaleString() + " customers mapped (" + redirectCount + " duplicates merged)");

  // Build customerMap: EAN-13 ID -> customer object
  const customerMap = {};
  for (const c of allCustomers) { if (c.id) customerMap[c.id] = c; }

  // -- STAGE 6: Map workorders --
  logStage(6, TOTAL_STAGES, "Mapping workorders");
  const allWorkorders = mapWorkorders(
    csv["workorders.csv"], csv["workorderItems.csv"], csv["serialized.csv"],
    csv["items.csv"], csv["salesLines.csv"], customerMap, statuses,
    csv["employees.csv"], csv["sales.csv"], customerRedirectMap, {}
  );
  logSuccess(allWorkorders.length.toLocaleString() + " workorders mapped (full set)");

  // Build workorderMap: lsSaleID -> [workorder objects]
  const workorderMap = {};
  for (const wo of allWorkorders) {
    if (wo._lsSaleID && wo._lsSaleID !== "0") {
      if (!workorderMap[wo._lsSaleID]) workorderMap[wo._lsSaleID] = [];
      workorderMap[wo._lsSaleID].push(wo);
    }
  }

  // -- STAGE 7: Map sales --
  logStage(7, TOTAL_STAGES, "Mapping sales");
  const { sales: allSales, transactions: allTransactions } = mapSales(
    csv["sales.csv"], csv["salesPayments.csv"], csv["stripePayments.csv"],
    workorderMap, customerMap, customerRedirectMap
  );
  logSuccess(allSales.length.toLocaleString() + " sales mapped (" + allTransactions.length.toLocaleString() + " transactions)");

  // -- STAGE 8: Map employees + punch history --
  logStage(8, TOTAL_STAGES, "Mapping employees + punch history");
  let newUsers = [];
  let allPunches = [];
  if (csv["employees.csv"]) {
    const empResult = mapEmployees(csv["employees.csv"]);
    newUsers = empResult.users;
    logSuccess(newUsers.length + " employees mapped (skipped system accounts)");

    if (csv["employeeHours.csv"]) {
      allPunches = mapPunchHistory(csv["employeeHours.csv"], empResult.employeeIDMap);
      logSuccess(allPunches.length.toLocaleString() + " punch records mapped");
    } else {
      logInfo("No employeeHours.csv - skipping punch history");
    }
  } else {
    logInfo("No employees.csv - skipping employee + punch mapping");
  }

  // -----------------------------------------------------------------------
  // Dev mode: filter down to 20 most recent WOs + their dependencies
  // -----------------------------------------------------------------------
  let workorders, customers, sales, transactions, punches;

  if (devMode) {
    logInfo("");
    logInfo("DEV MODE: Filtering to 20 most recent workorders + dependencies...");

    // Pick 20 most recent workorders by startedOnMillis
    const sorted = [...allWorkorders]
      .filter(function (wo) { return wo.startedOnMillis; })
      .sort(function (a, b) { return b.startedOnMillis - a.startedOnMillis; });
    workorders = sorted.slice(0, 20);
    logInfo("Selected " + workorders.length + " most recent workorders");

    // Collect referenced customer and sale IDs from those workorders
    const customerIDSet = new Set();
    const saleIDSet = new Set();
    for (const wo of workorders) {
      if (wo.customerID) customerIDSet.add(wo.customerID);
      if (wo.saleID) saleIDSet.add(wo.saleID);
    }

    // Filter associated data
    customers = allCustomers.filter(function (c) { return customerIDSet.has(c.id); });
    sales = allSales.filter(function (s) { return saleIDSet.has(s.id); });
    const filteredSaleIDSet = new Set(sales.map(function (s) { return s.id; }));
    transactions = allTransactions.filter(function (t) { return filteredSaleIDSet.has(t.saleID); });
    punches = allPunches; // keep all punches like the browser dev migration

    logInfo("Filtered: " + customers.length + " customers, " + sales.length + " sales, " + transactions.length + " transactions");
  } else {
    workorders = allWorkorders;
    customers = allCustomers;
    sales = allSales;
    transactions = allTransactions;
    punches = allPunches;
  }

  // Split workorders into open vs completed
  const finishedAndPaidID = statuses.find(function (s) { return s.label.toLowerCase() === "finished & paid"; });
  const doneID = finishedAndPaidID ? finishedAndPaidID.id : null;
  const openWorkorders = workorders.filter(function (wo) { return wo.status !== doneID; });
  const completedWorkorders = workorders.filter(function (wo) { return wo.status === doneID; });
  logInfo("  -> " + openWorkorders.length.toLocaleString() + " open | " + completedWorkorders.length.toLocaleString() + " completed");

  // Split sales
  const completedSales = sales.filter(function (s) { return s.paymentComplete; });
  const activeSales = sales.filter(function (s) { return !s.paymentComplete && s.workorderIDs && s.workorderIDs.length > 0; });
  logInfo("  -> " + completedSales.length.toLocaleString() + " completed sales | " + activeSales.length.toLocaleString() + " active sales");

  // -- STAGE 9: Write to Firestore --
  logStage(9, TOTAL_STAGES, "Writing to Firestore");

  // 9a: Merge statuses + employees into settings
  logInfo("Merging statuses and employees into settings...");
  const settingsRef = db.doc(basePath + "/settings/settings");
  const settingsDoc = await settingsRef.get();
  const existingSettings = settingsDoc.exists ? settingsDoc.data() : {};
  const existingUsers = existingSettings.users || [];
  const existingIDs = new Set(existingUsers.map(function (u) { return u.id; }));
  for (const u of newUsers) {
    if (!existingIDs.has(u.id)) existingUsers.push(u);
  }
  await settingsRef.set({ statuses, users: existingUsers }, { merge: true });
  logSuccess("Settings updated (statuses + " + existingUsers.length + " users)");

  // 9b: Inventory (always full set, even in dev mode)
  await batchWrite(basePath + "/inventory", inventoryItems, "inventory");

  // 9c: Customers
  await batchWrite(basePath + "/customers", customers, "customers");

  // 9d: Open workorders
  await batchWrite(basePath + "/open-workorders", openWorkorders, "open workorders");

  // 9e: Completed workorders
  await batchWrite(basePath + "/completed-workorders", completedWorkorders, "completed workorders");

  // 9f: Completed sales
  await batchWrite(basePath + "/completed-sales", completedSales, "completed sales");

  // 9g: Active sales
  await batchWrite(basePath + "/active-sales", activeSales, "active sales");

  // 9h: Transactions
  await batchWrite(basePath + "/transactions", transactions, "transactions");

  // 9i: Punch history
  await batchWrite(basePath + "/punches", punches, "punch history");

  // -- STAGE 10: Summary --
  logStage(10, TOTAL_STAGES, "Summary");
  const modeLabel = devMode ? "DEV MIGRATION" : "FULL MIGRATION";
  const totalTime = ((Date.now() - globalStart) / 1000).toFixed(1);
  const minutes = Math.floor(totalTime / 60);
  const seconds = (totalTime % 60).toFixed(0);

  console.log("[" + timestamp() + "]   Mode:                  " + modeLabel);
  console.log("[" + timestamp() + "]   Statuses:              " + statuses.length);
  console.log("[" + timestamp() + "]   Inventory items:       " + inventoryItems.length.toLocaleString());
  console.log("[" + timestamp() + "]   Customers:             " + customers.length.toLocaleString());
  console.log("[" + timestamp() + "]   Open workorders:       " + openWorkorders.length.toLocaleString());
  console.log("[" + timestamp() + "]   Completed workorders:  " + completedWorkorders.length.toLocaleString());
  console.log("[" + timestamp() + "]   Completed sales:       " + completedSales.length.toLocaleString());
  console.log("[" + timestamp() + "]   Active sales:          " + activeSales.length.toLocaleString());
  console.log("[" + timestamp() + "]   Transactions:          " + transactions.length.toLocaleString());
  console.log("[" + timestamp() + "]   Employees:             " + newUsers.length);
  console.log("[" + timestamp() + "]   Punch records:         " + punches.length.toLocaleString());
  console.log("[" + timestamp() + "]   Total time:            " + (minutes > 0 ? minutes + "m " : "") + seconds + "s");
  console.log("[" + timestamp() + "]   + " + modeLabel + " COMPLETE\n");

  process.exit(0);
}

// Run
main().catch(function (err) {
  console.error("\n[" + timestamp() + "] x FATAL ERROR: " + (err.message || err));
  console.error(err.stack);
  process.exit(1);
});

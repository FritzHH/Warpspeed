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
  { id: "intake", label: "Intake", textColor: "white", backgroundColor: "pink", removable: false, requireWaitTime: false },
  { id: "work_in_progress", textColor: "black", backgroundColor: "rgb(192,192,192)", label: "Work in Progress", removable: false },
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
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') { current += '""'; i++; }
      else { inQuotes = !inQuotes; }
      current += ch;
    } else if (ch === '\n' && !inQuotes) {
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
  COLOR_MAP[key] = { textColor: c.textColor || "", backgroundColor: c.backgroundColor || "", label: (c.label || "").toLowerCase() };
}
COLOR_MAP["grey"] = COLOR_MAP["gray"] || { textColor: "white", backgroundColor: "darkgray", label: "Gray" };
COLOR_MAP["light blue"] = COLOR_MAP["light-blue"];
COLOR_MAP["lightblue"] = COLOR_MAP["light-blue"];
COLOR_MAP["light gray"] = COLOR_MAP["light-gray"];
COLOR_MAP["lightgray"] = COLOR_MAP["light-gray"];

// Color search keywords sorted longest-first so "light-blue" matches before "blue"
const COLOR_KEYWORDS = Object.keys(COLOR_MAP).sort(function (a, b) { return b.length - a.length; });

const EMPTY_COLOR = { textColor: "", backgroundColor: "", label: "" };

// Search a string for color words. Each word is checked for substring matches
// so "reddish" matches "red", "greenish" matches "green", etc.
// Splits on "/" to handle "blue/green" or "blue / green".
function findColorsInText(text) {
  if (!text) return [];
  var found = [];
  var foundLabels = {};
  // Split on "/" first, then split each segment into words
  var segments = text.toLowerCase().split("/");
  for (var s = 0; s < segments.length; s++) {
    var words = segments[s].trim().split(/\s+/);
    for (var w = 0; w < words.length; w++) {
      var word = words[w];
      if (!word) continue;
      // Check multi-word keywords first (e.g. "light blue") by joining with next word
      if (w + 1 < words.length) {
        var pair = word + " " + words[w + 1];
        for (var k = 0; k < COLOR_KEYWORDS.length; k++) {
          if (COLOR_KEYWORDS[k].indexOf(" ") === -1) continue;
          if (pair.indexOf(COLOR_KEYWORDS[k]) !== -1 && !foundLabels[COLOR_MAP[COLOR_KEYWORDS[k]].label]) {
            foundLabels[COLOR_MAP[COLOR_KEYWORDS[k]].label] = true;
            found.push({ ...COLOR_MAP[COLOR_KEYWORDS[k]] });
            w++; // skip next word, it was part of the pair
            break;
          }
        }
        if (found.length >= 2) return found;
      }
      // Check single-word keywords
      for (var k = 0; k < COLOR_KEYWORDS.length; k++) {
        if (COLOR_KEYWORDS[k].indexOf(" ") !== -1) continue;
        if (word.indexOf(COLOR_KEYWORDS[k]) !== -1 && !foundLabels[COLOR_MAP[COLOR_KEYWORDS[k]].label]) {
          foundLabels[COLOR_MAP[COLOR_KEYWORDS[k]].label] = true;
          found.push({ ...COLOR_MAP[COLOR_KEYWORDS[k]] });
          break;
        }
      }
      if (found.length >= 2) return found;
    }
  }
  return found;
}

// Extract up to 2 colors from colorName + description combined
function extractColors(colorName, description) {
  // Search colorName first (more reliable), then description for additional colors
  var colors = findColorsInText(colorName);
  if (colors.length < 2 && description) {
    var fromDesc = findColorsInText(description);
    for (var i = 0; i < fromDesc.length && colors.length < 2; i++) {
      // Don't duplicate a color already found
      var isDupe = false;
      for (var j = 0; j < colors.length; j++) {
        if (colors[j].label === fromDesc[i].label) { isDupe = true; break; }
      }
      if (!isDupe) colors.push(fromDesc[i]);
    }
  }
  return {
    color1: colors.length > 0 ? colors[0] : { ...EMPTY_COLOR },
    color2: colors.length > 1 ? colors[1] : { ...EMPTY_COLOR },
  };
}

// First non-color word = brand. Remaining non-color words before the first comma = description.
// Everything lowercased for searchability.
function extractBrandDescription(rawDescription) {
  if (!rawDescription) return { brand: "", description: "" };
  var cleaned = cleanItemDescription(rawDescription);
  // Take only the first segment (before comma/period) - the rest is usually service notes
  var segment = cleaned.split(/[,.]/)[0].trim();
  var words = segment.split(/\s+/).filter(function (w) { return w; });
  if (words.length === 0) return { brand: "", description: "" };

  function isColorWord(word) {
    var lower = word.toLowerCase();
    for (var k = 0; k < COLOR_KEYWORDS.length; k++) {
      if (lower.indexOf(COLOR_KEYWORDS[k]) !== -1) return true;
    }
    return false;
  }

  // Skip leading color words to find the brand
  var brandIndex = -1;
  for (var i = 0; i < words.length; i++) {
    if (!isColorWord(words[i])) { brandIndex = i; break; }
  }
  if (brandIndex === -1) return { brand: "", description: "" };

  var brand = words[brandIndex].toLowerCase();

  // Remaining words after brand: keep only non-color words
  var descWords = [];
  for (var i = brandIndex + 1; i < words.length; i++) {
    if (!isColorWord(words[i])) descWords.push(words[i].toLowerCase());
  }

  return { brand: brand, description: descWords.join(" ") };
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
  // Build reverse alias map: nonremovable label -> [LS names that alias to it]
  var reverseAliases = {};
  for (var alias in STATUS_ALIASES) {
    var target = STATUS_ALIASES[alias];
    if (!reverseAliases[target]) reverseAliases[target] = [];
    reverseAliases[target].push(alias);
  }

  // Resolve sortOrder for any status (nonremovable or CSV)
  function getSortOrder(label) {
    var lower = label.toLowerCase();
    // Direct match in LS sortOrder map
    if (lsSortMap[lower] !== undefined) return lsSortMap[lower];
    // Reverse alias: find LS names that alias to this label, take minimum sortOrder
    var aliases = reverseAliases[lower] || [];
    var minSort = Infinity;
    for (var i = 0; i < aliases.length; i++) {
      if (lsSortMap[aliases[i]] !== undefined && lsSortMap[aliases[i]] < minSort) {
        minSort = lsSortMap[aliases[i]];
      }
    }
    if (minSort < Infinity) return minSort;
    // Hardcoded defaults for statuses with no LS equivalent
    if (lower === "newly created") return -2;
    if (lower === "sale in progress") return -1;
    if (lower === "on the stand") return 15;
    if (lower === "delivery") return 5;
    return Infinity;
  }

  // Combine and sort ALL statuses by LS sortOrder
  var combined = [].concat(NONREMOVABLE_STATUSES, csvStatuses);
  combined.sort(function (a, b) {
    return getSortOrder(a.label) - getSortOrder(b.label);
  });
  return combined;
}

function mapCustomers(customerCSVText) {
  const rows = parseCSV(customerCSVText);
  const customers = [];
  const phoneMap = {}; // phone -> customer index for deduplication
  const customerRedirectMap = {}; // discardedEAN -> survivingEAN

  for (const row of rows) {
    if (row.archived === "true") continue;
    if (!row.customerID || row.customerID === "0") continue;

    const cell = formatPhone(row.phone1);
    const customer = {
      id: buildLightspeedEAN13("20", row.customerID),
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

    // Skip empty shell workorders (no customer, no timeIn, no sale — junk Lightspeed entries)
    if ((!wo.customerID || wo.customerID === "0") && !wo.timeIn && (!wo.saleID || wo.saleID === "0")) {
      console.log("[Migration] Skipping empty shell WO " + woID + " (no customer, no timeIn, no sale)");
      continue;
    }

    // Customer lookup (apply redirect for deduplicated customers)
    const woCustomerEAN = wo.customerID && wo.customerID !== "0"
      ? buildLightspeedEAN13("20", wo.customerID) : "";
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
    const { brand, description } = extractBrandDescription(serDescription);
    const { color1, color2 } = ser ? extractColors(ser.colorName, serDescription) : { color1: { ...EMPTY_COLOR }, color2: { ...EMPTY_COLOR } };

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
    if (ser) {
      const parts = [];
      if (ser.description) parts.push(ser.description.trim());
      if (ser.colorName) parts.push(ser.colorName.trim());
      if (ser.sizeName) parts.push(ser.sizeName.trim());
      if (ser.serial) parts.push(ser.serial.trim());
      if (parts.length > 0) {
        internalNotes.push({ id: crypto.randomUUID(), name: "Lightspeed", userID: "", value: parts.join("\n") });
      }
    }
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
    if (!Array.isArray(woLinesParsed)) woLinesParsed = woLinesParsed ? [woLinesParsed] : [];

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
      color2,
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
      partToBeOrdered: statusLabel === "item ordered" ? false : true,
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

function mapSales(salesCSVText, salesPaymentsCSVText, paymentsCSVText, workorderMap, customerMap, customerRedirectMap) {
  if (!customerRedirectMap) customerRedirectMap = {};
  const saleRows = parseCSV(salesCSVText);
  const spRows = parseCSV(salesPaymentsCSVText);
  const paymentReportRows = paymentsCSVText ? parseCSV(paymentsCSVText) : [];

  const paymentsMap = {};
  for (const sp of spRows) {
    if (!sp.saleID) continue;
    if (!paymentsMap[sp.saleID]) paymentsMap[sp.saleID] = [];
    paymentsMap[sp.saleID].push(sp);
  }

  // paymentsByOrderID: LS saleID → [Lightspeed Payments report rows]
  const paymentsByOrderID = {};
  for (const pr of paymentReportRows) {
    const orderID = pr["Order ID"];
    if (!orderID) continue;
    if (pr.Status !== "CAPTURED" && pr.Status !== "REFUNDED" && pr.Status !== "PARTIALLY_REFUNDED") continue;
    if (!paymentsByOrderID[orderID]) paymentsByOrderID[orderID] = [];
    paymentsByOrderID[orderID].push(pr);
  }

  // Build refund charge lookup: for return sales, link to the original sale's chargeID
  // Key: customerID_absAmountCents → [{ chargeID, last4, cardType, paymentID }]
  const refundChargesByCustomer = {};
  for (const pr of paymentReportRows) {
    if (pr.Status !== "REFUNDED" && pr.Status !== "PARTIALLY_REFUNDED") continue;
    const orderID = pr["Order ID"];
    if (!orderID) continue;
    const origSaleRow = saleRows.find(function (r) { return r.saleID === orderID; });
    if (!origSaleRow || !origSaleRow.customerID || origSaleRow.customerID === "0") continue;
    const custID = origSaleRow.customerID;
    const refundedCents = dollarsToCents(pr["Refunded amount"]);
    if (refundedCents <= 0) continue;
    var key = custID + "_" + refundedCents;
    if (!refundChargesByCustomer[key]) refundChargesByCustomer[key] = [];
    refundChargesByCustomer[key].push({
      chargeID: (pr.ID || "").replace(/^st-/, ""),
      last4: pr["Card last 4"] || "",
      cardType: pr["Card type"] || "",
      _entryMode: pr["Entry mode"] || "",
      _cardFundingSource: pr["Card funding source"] || "",
    });
  }
  const refundChargesUsed = new Set();

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

    const prForSale = paymentsByOrderID[lsSaleID] || [];
    const prUsed = new Set();

    // Detect deposit pattern: a negative "credit account" payment paired with a positive payment
    const creditAccountRows = paymentRows.filter(function (sp) { return sp.paymentTypeType === "credit account" && dollarsToCents(sp.amount) < 0; });
    const isDepositSale = creditAccountRows.length > 0;
    const depositAmountCents = creditAccountRows.reduce(function (sum, sp) { return sum + Math.abs(dollarsToCents(sp.amount)); }, 0);

    // For deposit sales, exclude "credit account" rows — they aren't real transactions
    const transactionRows = isDepositSale
      ? paymentRows.filter(function (sp) { return sp.paymentTypeType !== "credit account"; })
      : paymentRows;

    const payments = transactionRows.map(function (sp) {
      const isCash = sp.paymentTypeType === "cash";
      const isCheck = sp.paymentTypeName === "Check";
      const isCard = sp.paymentTypeType === "credit card";
      const isCredit = sp.paymentTypeType === "credit account";
      const isEcom = sp.paymentTypeType === "ecom";
      const amount = dollarsToCents(sp.amount);

      // Match card payment to Lightspeed Payments report by amount
      let prMatch = null;
      if (isCard && prForSale.length > 0) {
        for (let i = 0; i < prForSale.length; i++) {
          if (prUsed.has(i)) continue;
          if (dollarsToCents(prForSale[i].Amount) === amount) {
            prMatch = prForSale[i]; prUsed.add(i); break;
          }
        }
        if (!prMatch) {
          for (let i = 0; i < prForSale.length; i++) {
            if (prUsed.has(i)) continue;
            prMatch = prForSale[i]; prUsed.add(i); break;
          }
        }
      }

      // For return/refund card transactions, link to the original sale's chargeID
      let refundMatch = null;
      if (isCard && !prMatch && amount < 0 && row.customerID && row.customerID !== "0") {
        var refKey = row.customerID + "_" + Math.abs(amount);
        var candidates = refundChargesByCustomer[refKey] || [];
        for (var ri = 0; ri < candidates.length; ri++) {
          var cid = candidates[ri].chargeID;
          if (!refundChargesUsed.has(cid)) {
            refundMatch = candidates[ri];
            refundChargesUsed.add(cid);
            break;
          }
        }
      }

      // Fallback to salesPayments.csv card fields (e.g., May 2025 gap)
      var spLast4 = isCard && sp.cardLast4 ? sp.cardLast4 : "";
      var spCardType = isCard && sp.cardType ? sp.cardType : "";
      var spAuthCode = isCard && sp.authCode ? sp.authCode : "";

      return {
        id: sp.salePaymentID || crypto.randomUUID(),
        saleID,
        type: amount < 0 ? "refund" : "payment",
        method: isCash ? "cash" : isCheck ? "check" : isCard ? "card" : isCredit ? "credit" : isEcom ? "ecom" : "other",
        amountCaptured: amount,
        amountTendered: (isCash && amount >= 0) ? amount : 0,
        salesTax: 0,
        cardType: prMatch ? (prMatch["Card type"] || "") : refundMatch ? refundMatch.cardType : spCardType,
        cardIssuer: isCard ? sp.paymentTypeName : "",
        last4: prMatch ? (prMatch["Card last 4"] || "") : refundMatch ? refundMatch.last4 : spLast4,
        authorizationCode: spAuthCode,
        millis: sp.createTime ? new Date(sp.createTime).getTime() : 0,
        paymentProcessor: isCard ? "Stripe" : "",
        chargeID: prMatch ? (prMatch.ID || "").replace(/^st-/, "") : refundMatch ? refundMatch.chargeID : "",
        paymentIntentID: "",
        receiptURL: "",
        expMonth: "",
        expYear: "",
        networkTransactionID: "",
        amountRefunded: prMatch ? dollarsToCents(prMatch["Refunded amount"]) : 0,
        depositType: isDepositSale ? "deposit" : "",
        _entryMode: prMatch ? (prMatch["Entry mode"] || "") : refundMatch ? refundMatch._entryMode : "",
        _cardFundingSource: prMatch ? (prMatch["Card funding source"] || "") : refundMatch ? refundMatch._cardFundingSource : "",
        refunds: [],
      };
    });

    // Assign sale tax to the first payment transaction
    if (tax > 0) {
      const firstPayment = payments.find(function (p) { return p.type === "payment"; });
      if (firstPayment) firstPayment.salesTax = tax;
    }

    // Compute amounts from actual payments
    const computedAmountCaptured = payments.reduce(function (sum, p) { return p.type === "payment" ? sum + p.amountCaptured : sum; }, 0);
    const computedAmountRefunded = payments.reduce(function (sum, p) { return p.type === "refund" ? sum + Math.abs(p.amountCaptured) : sum; }, 0);

    const mappedSale = {
      id: saleID,
      lightspeed_id: lsSaleID,
      millis,
      subtotal: isDepositSale ? depositAmountCents : subtotal,
      discount,
      salesTax: tax,
      salesTaxPercent,
      total: isDepositSale ? depositAmountCents : total,
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
      isDepositSale,
      depositType: isDepositSale ? "deposit" : "",
      depositNote: "",
      voidedByRefund: false,
      _importSource: "lightspeed",
    };

    // Deposit sales don't create a completed-sales doc — only transactions + customer.deposits[]
    if (!isDepositSale) {
      sales.push(mappedSale);
    }
    allTransactions.push(...payments);

    // For deposit sales, add deposit to customer
    if (isDepositSale && customer && completed) {
      const primaryTxn = payments.find(function (p) { return p.type === "payment"; });
      const deposit = {
        id: saleID,
        transactionId: primaryTxn ? primaryTxn.id : "",
        amountCents: depositAmountCents,
        reservedCents: 0,
        millis: millis || Date.now(),
        method: primaryTxn ? primaryTxn.method : "",
        note: "",
        last4: primaryTxn ? (primaryTxn.last4 || "") : "",
        type: "deposit",
      };
      customer.deposits = customer.deposits || [];
      customer.deposits.push(deposit);
    }

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

function buildStandaloneWorkorders(sales, salesLinesCSVText, itemsCSVText, customerMap, statuses) {
  const slRows = parseCSV(salesLinesCSVText);
  const itemRows = parseCSV(itemsCSVText);

  // Group sale lines by Lightspeed saleID
  const saleLinesBySaleID = {};
  for (const row of slRows) {
    if (!row.saleID) continue;
    if (!saleLinesBySaleID[row.saleID]) saleLinesBySaleID[row.saleID] = [];
    saleLinesBySaleID[row.saleID].push(row);
  }

  // Item lookup
  const itemMap = {};
  for (const row of itemRows) { if (row.itemID) itemMap[row.itemID] = row; }

  // Find "Finished & Paid" status for completed standalone sales
  const finishedPaidStatus = statuses.find(function (s) { return s.label.toLowerCase() === "finished & paid"; });

  const standaloneWorkorders = [];

  for (const sale of sales) {
    if (sale.workorderIDs.length > 0) continue; // already linked to workorders

    const lsSaleID = sale.lightspeed_id;
    const saleLines = saleLinesBySaleID[lsSaleID] || [];
    if (saleLines.length === 0) continue; // no items — nothing to build

    // Build workorderLines from salesLines
    var workorderLines = saleLines.map(function (sl) {
      var item = sl.itemID ? itemMap[sl.itemID] : null;

      var rawUpc = item ? (item.upc || "") : "";
      var rawEan = item ? (item.ean || "") : "";
      var normUpc = normalizeBarcode(rawUpc);
      var normEan = normalizeBarcode(rawEan);
      var isNativeEan = normEan && !normEan.startsWith("0");
      var primaryBarcode = (isNativeEan ? normEan : null) || normUpc || generateEAN13Barcode();
      var barcodes = [normEan, normUpc].filter(function (c) { return c && c !== primaryBarcode; });

      var priceCents = dollarsToCents(sl.unitPrice);

      var inventoryItem = {
        id: item ? item.itemID : crypto.randomUUID(),
        formalName: item ? (item.description || "Unknown Item") : "Unknown Item",
        informalName: "",
        brand: "",
        price: priceCents,
        salePrice: 0,
        cost: item ? dollarsToCents(item.avgCost || item.defaultCost) : 0,
        category: item && item.itemType === "non_inventory" ? "Labor" : "Item",
        primaryBarcode,
        barcodes,
        customPart: false,
        customLabor: false,
        minutes: 0,
      };

      return {
        id: crypto.randomUUID(),
        qty: parseInt(sl.unitQuantity) || 1,
        intakeNotes: sanitize((sl.note || "").trim()),
        receiptNotes: "",
        inventoryItem,
        discountObj: buildDiscountObj(sl, priceCents),
        useSalePrice: false,
        warranty: false,
      };
    });

    // Create standalone workorder
    var woID = generateEAN13Barcode();
    var customer = sale.customerID ? customerMap[sale.customerID] : null;

    var wo = {
      workorderNumber: buildWorkorderNumberFromId(woID),
      id: woID,
      lightspeed_id: "",
      customerID: sale.customerID || "",
      customerFirst: customer ? (customer.first || "") : "",
      customerLast: customer ? (customer.last || "") : "",
      customerCell: customer ? (customer.customerCell || "") : "",
      customerLandline: customer ? (customer.customerLandline || "") : "",
      customerEmail: customer ? (customer.email || "") : "",
      customerContactRestriction: "",
      customerLanguage: "",
      customerPin: "",
      brand: "",
      description: "",
      color1: { ...EMPTY_COLOR },
      color2: { ...EMPTY_COLOR },
      status: finishedPaidStatus ? finishedPaidStatus.id : "",
      taxFree: false,
      taxFreeReceiptNote: "",
      archived: false,
      startedBy: "Lightspeed Import",
      startedOnMillis: sale.millis || "",
      finishedOnMillis: sale.millis || "",
      paidOnMillis: sale.millis || "",
      workorderLines: workorderLines,
      customerNotes: [],
      internalNotes: [],
      changeLog: [],
      hasNewSMS: false,
      waitTime: "",
      waitTimeEstimateLabel: "",
      partOrdered: "",
      partSource: "",
      partToBeOrdered: false,
      partOrderEstimateMillis: "",
      partOrderedMillis: "",
      paymentComplete: sale.paymentComplete,
      amountPaid: sale.amountCaptured,
      activeSaleID: "",
      endedOnMillis: "",
      saleID: sale.id,
      media: [],
      _lsSaleID: lsSaleID,
      _importSource: "lightspeed",
    };

    standaloneWorkorders.push(wo);

    // Link the sale back to this workorder
    sale.workorderIDs.push(woID);

    // Backfill customer workorders array
    if (customer) {
      customer.workorders.push(woID);
    }
  }

  return standaloneWorkorders;
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
  "payments.csv",
  "employees.csv",
  "employeeHours.csv",
  "workorderStatuses.csv",
];

const OPTIONAL_CSV_FILES = new Set(["payments.csv", "employeeHours.csv", "workorderStatuses.csv"]);

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
// CSV Export — write mapped objects to scripts/output/ for verification
// ============================================================================

function escapeCSV(val) {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function writeCSVFile(filename, headers, rows) {
  const outputDir = path.resolve(__dirname, "output");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(row.map(escapeCSV).join(","));
  }
  const filePath = path.join(outputDir, filename);
  fs.writeFileSync(filePath, lines.join("\n"), "utf8");
  logSuccess("Wrote " + rows.length + " rows to output/" + filename);
}

function exportWorkordersCSV(openWorkorders, completedWorkorders) {
  const headers = [
    "id", "lightspeed_id", "workorderNumber", "collection",
    "customerID", "customerFirst", "customerLast",
    "brand", "description", "color1_label", "color2_label",
    "status", "saleID", "activeSaleID", "_lsSaleID",
    "paymentComplete", "amountPaid",
    "partToBeOrdered", "partOrdered",
    "startedOnMillis", "finishedOnMillis", "paidOnMillis",
    "workorderLines_count", "changeLog_count",
    "_importSource"
  ];
  const rows = [];
  for (const wo of openWorkorders) {
    rows.push([
      wo.id, wo.lightspeed_id, wo.workorderNumber, "open-workorders",
      wo.customerID, wo.customerFirst, wo.customerLast,
      wo.brand, wo.description, wo.color1?.label || "", wo.color2?.label || "",
      wo.status, wo.saleID, wo.activeSaleID, wo._lsSaleID,
      wo.paymentComplete, wo.amountPaid,
      wo.partToBeOrdered, wo.partOrdered,
      wo.startedOnMillis, wo.finishedOnMillis, wo.paidOnMillis,
      (wo.workorderLines || []).length, (wo.changeLog || []).length,
      wo._importSource
    ]);
  }
  for (const wo of completedWorkorders) {
    rows.push([
      wo.id, wo.lightspeed_id, wo.workorderNumber, "completed-workorders",
      wo.customerID, wo.customerFirst, wo.customerLast,
      wo.brand, wo.description, wo.color1?.label || "", wo.color2?.label || "",
      wo.status, wo.saleID, wo.activeSaleID, wo._lsSaleID,
      wo.paymentComplete, wo.amountPaid,
      wo.partToBeOrdered, wo.partOrdered,
      wo.startedOnMillis, wo.finishedOnMillis, wo.paidOnMillis,
      (wo.workorderLines || []).length, (wo.changeLog || []).length,
      wo._importSource
    ]);
  }
  writeCSVFile("workorders.csv", headers, rows);
}

function exportSalesCSV(completedSales, activeSales) {
  const headers = [
    "id", "lightspeed_id", "collection",
    "customerID", "subtotal", "discount", "salesTax", "salesTaxPercent",
    "total", "amountCaptured", "amountRefunded",
    "paymentComplete", "depositType",
    "workorderIDs", "transactionIDs",
    "millis", "_importSource"
  ];
  const rows = [];
  for (const s of completedSales) {
    rows.push([
      s.id, s.lightspeed_id, "completed-sales",
      s.customerID, s.subtotal, s.discount, s.salesTax, s.salesTaxPercent,
      s.total, s.amountCaptured, s.amountRefunded,
      s.paymentComplete, s.depositType,
      (s.workorderIDs || []).join(";"), (s.transactionIDs || []).join(";"),
      s.millis, s._importSource
    ]);
  }
  for (const s of activeSales) {
    rows.push([
      s.id, s.lightspeed_id, "active-sales",
      s.customerID, s.subtotal, s.discount, s.salesTax, s.salesTaxPercent,
      s.total, s.amountCaptured, s.amountRefunded,
      s.paymentComplete, s.depositType,
      (s.workorderIDs || []).join(";"), (s.transactionIDs || []).join(";"),
      s.millis, s._importSource
    ]);
  }
  writeCSVFile("sales.csv", headers, rows);
}

function exportTransactionsCSV(transactions) {
  const headers = [
    "id", "saleID", "type", "method",
    "amountCaptured", "amountTendered", "amountRefunded",
    "chargeID", "paymentIntentID", "last4", "cardType", "cardIssuer",
    "depositType", "paymentProcessor",
    "authorizationCode", "millis",
    "_cardFundingSource", "_entryMode"
  ];
  const rows = [];
  for (const t of transactions) {
    rows.push([
      t.id, t.saleID, t.type, t.method,
      t.amountCaptured, t.amountTendered, t.amountRefunded,
      t.chargeID, t.paymentIntentID, t.last4, t.cardType, t.cardIssuer,
      t.depositType, t.paymentProcessor,
      t.authorizationCode, t.millis,
      t._cardFundingSource, t._entryMode
    ]);
  }
  writeCSVFile("transactions.csv", headers, rows);
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
  console.log("  full  - All workorders, customers, sales, inventory, employees");
  console.log("  sales - Sales + transactions only (clears and rewrites sales/transactions)");
  console.log("");
  let choice = "";
  while (choice !== "full" && choice !== "sales") {
    choice = (await askQuestion("  Type 'full' or 'sales': ")).toLowerCase();
  }
  const salesOnly = choice === "sales";

  console.log("\n  -> " + (salesOnly ? "Sales-only" : "Full") + " Migration selected\n");

  const TOTAL_STAGES = 10;

  // Init Firebase
  initFirebase();
  const basePath = "tenants/" + CONFIG.tenantID + "/stores/" + CONFIG.storeID;

  // -- STAGE 1: Read CSV files --
  logStage(1, TOTAL_STAGES, "Reading CSV files");
  const csv = readCSVFiles();

  // -- STAGE 2: Clear existing collections --
  logStage(2, TOTAL_STAGES, "Clearing existing collections");
  if (!salesOnly) {
    await clearCollection(basePath + "/open-workorders", "open workorders");
    await clearCollection(basePath + "/completed-workorders", "completed workorders");
    await clearCollection(basePath + "/customers", "customers");
    await clearCollection(basePath + "/inventory", "inventory");
    await clearCollection(basePath + "/punches", "punches");
  } else {
    logInfo("Sales-only mode: skipping workorders, customers, inventory, punches");
  }
  await clearCollection(basePath + "/completed-sales", "completed sales");
  await clearCollection(basePath + "/active-sales", "active sales");
  await clearCollection(basePath + "/transactions", "transactions");

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
    csv["sales.csv"], csv["salesPayments.csv"], csv["payments.csv"],
    workorderMap, customerMap, customerRedirectMap
  );
  logSuccess(allSales.length.toLocaleString() + " sales mapped (" + allTransactions.length.toLocaleString() + " transactions)");

  // Build standalone workorders for sales that have no linked workorder
  const standaloneWOs = buildStandaloneWorkorders(
    allSales, csv["salesLines.csv"], csv["items.csv"], customerMap, statuses
  );
  if (standaloneWOs.length > 0) {
    allWorkorders.push(...standaloneWOs);
    logSuccess(standaloneWOs.length.toLocaleString() + " standalone sale workorders created (from salesLines)");
  }

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

  const workorders = allWorkorders;
  const customers = allCustomers;
  const sales = allSales;
  const transactions = allTransactions;
  const punches = allPunches;

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

  // Export CSVs to scripts/output/ for verification
  logInfo("Exporting CSV verification files...");
  exportWorkordersCSV(openWorkorders, completedWorkorders);
  exportSalesCSV(completedSales, activeSales);
  exportTransactionsCSV(transactions);

  // -- STAGE 9: Write to Firestore --
  logStage(9, TOTAL_STAGES, "Writing to Firestore");

  if (!salesOnly) {
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

    // 9b: Inventory
    await batchWrite(basePath + "/inventory", inventoryItems, "inventory");

    // 9c: Customers
    await batchWrite(basePath + "/customers", customers, "customers");

    // 9d: Open workorders
    await batchWrite(basePath + "/open-workorders", openWorkorders, "open workorders");

    // 9e: Completed workorders
    await batchWrite(basePath + "/completed-workorders", completedWorkorders, "completed workorders");

    // 9i: Punch history
    await batchWrite(basePath + "/punches", punches, "punch history");
  } else {
    logInfo("Sales-only mode: skipping settings, inventory, customers, workorders, punches");
  }

  // Sales + transactions always written
  await batchWrite(basePath + "/completed-sales", completedSales, "completed sales");
  await batchWrite(basePath + "/active-sales", activeSales, "active sales");
  await batchWrite(basePath + "/transactions", transactions, "transactions");

  // -- STAGE 10: Summary --
  logStage(10, TOTAL_STAGES, "Summary");
  const modeLabel = salesOnly ? "SALES-ONLY MIGRATION" : "FULL MIGRATION";
  const totalTime = ((Date.now() - globalStart) / 1000).toFixed(1);
  const minutes = Math.floor(totalTime / 60);
  const seconds = (totalTime % 60).toFixed(0);

  console.log("[" + timestamp() + "]   Mode:                  " + modeLabel);
  console.log("[" + timestamp() + "]   Statuses:              " + statuses.length);
  console.log("[" + timestamp() + "]   Inventory items:       " + inventoryItems.length.toLocaleString());
  console.log("[" + timestamp() + "]   Customers:             " + customers.length.toLocaleString());
  console.log("[" + timestamp() + "]   Open workorders:       " + openWorkorders.length.toLocaleString());
  console.log("[" + timestamp() + "]   Completed workorders:  " + completedWorkorders.length.toLocaleString());
  console.log("[" + timestamp() + "]   Standalone sale WOs:   " + standaloneWOs.length.toLocaleString());
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

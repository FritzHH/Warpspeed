/* eslint-disable */
/**
 * Standalone Lightspeed → Warpspeed Import Script
 *
 * Reads CSV files from ./csv/ and writes to Firestore using firebase-admin.
 * Run: cd scripts && npm install && node lightspeed-import.js
 */

const admin = require("firebase-admin");
const { cloneDeep } = require("lodash");
const fs = require("fs");
const path = require("path");

// ============================================================================
// CONFIG — Edit these before running
// ============================================================================

const CONFIG = {
  // Firestore tenant/store path: tenants/{tenantID}/stores/{storeID}/
  tenantID: "YOUR_TENANT_ID",
  storeID: "YOUR_STORE_ID",

  // Path to Firebase service account JSON
  // Download from: Firebase Console → Project Settings → Service Accounts → Generate New Private Key
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
    console.error(`\n  Service account file not found: ${CONFIG.serviceAccountPath}`);
    console.error(`  Download from: Firebase Console → Project Settings → Service Accounts → Generate New Private Key`);
    console.error(`  Save it as: scripts/serviceAccountKey.json\n`);
    process.exit(1);
  }

  const serviceAccount = JSON.parse(fs.readFileSync(CONFIG.serviceAccountPath, "utf8"));
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: CONFIG.databaseURL,
  });
  db = admin.firestore();
}

// Removed — using crypto.randomUUID() instead

// ============================================================================
// Status Logger
// ============================================================================

function timestamp() {
  return new Date().toLocaleTimeString("en-US", { hour12: false });
}

function logStage(stageNum, totalStages, title) {
  console.log(`\n[${timestamp()}] ──── STAGE ${stageNum}/${totalStages}: ${title} ────`);
}

function logInfo(msg) {
  console.log(`[${timestamp()}]   ${msg}`);
}

function logSuccess(msg) {
  console.log(`[${timestamp()}]   ✓ ${msg}`);
}

function logError(msg) {
  console.error(`[${timestamp()}]   ✗ ${msg}`);
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

function generateWorkorderNumber(barcodeNumber) {
  const numStr = String(barcodeNumber);
  if (!numStr || !/^\d{12,13}$/.test(numStr)) {
    throw new Error("Input must be 12 or 13 digits");
  }
  const indexes = [];
  while (indexes.length < 5) {
    const randomIndex = Math.floor(Math.random() * numStr.length);
    if (!indexes.includes(randomIndex)) indexes.push(randomIndex);
  }
  return indexes.map((index) => numStr[index]).join("");
}

function hexToRgb(hex) {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const int = parseInt(h, 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

function luminance(r, g, b) {
  const srgb = [r, g, b].map((v) => {
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
  return `rgb(${v},${v},${v})`;
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
  { id: "34kttekj", label: "Newly Created", textColor: "white", backgroundColor: "red", removable: false, requireWaitTime: false },
  { id: "34kttdkfekj", label: "On the Stand", textColor: "white", backgroundColor: "pink", removable: false, requireWaitTime: false },
  { id: "383rne3kj", textColor: "black", backgroundColor: "rgb(192,192,192)", label: "Service", removable: false, requireWaitTime: false },
  { id: "33knktg", textColor: "white", backgroundColor: "green", label: "Finished", removable: false, requireWaitTime: false },
  { id: "33knkdkanctg", textColor: "white", backgroundColor: "green", label: "Finished - No Auto Text", removable: false, requireWaitTime: false },
];

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
  return rows.slice(1).map(row => {
    let values = parseCSVLine(row);
    let obj = {};
    headers.forEach((h, i) => obj[h.trim()] = (values[i] || "").trim());
    return obj;
  });
}

// ============================================================================
// Lightspeed Import Helpers
// ============================================================================

function sanitize(str) {
  return str.replace(/'\//g, "'");
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
  COLOR_MAP[key] = { textColor: c.textColor || "", backgroundColor: c.backgroundColor || "", label: c.label || "", altTextColor: c.altTextColor || "dimgray" };
}
COLOR_MAP["grey"] = COLOR_MAP["gray"] || { textColor: "white", backgroundColor: "darkgray", label: "Gray", altTextColor: "dimgray" };
COLOR_MAP["light blue"] = COLOR_MAP["light-blue"];
COLOR_MAP["lightblue"] = COLOR_MAP["light-blue"];
COLOR_MAP["light gray"] = COLOR_MAP["light-gray"];
COLOR_MAP["lightgray"] = COLOR_MAP["light-gray"];

const EMPTY_COLOR = { textColor: "", backgroundColor: "", label: "", altTextColor: "" };

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
    const regex = new RegExp(`\\b${keyword}\\b`, "i");
    working = working.replace(regex, "").replace(/\s{2,}/g, " ").trim();
  }
  let segment = working.split(/[,.]/)[0].trim();
  let words = segment.split(/\s+/).filter(w => w);
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
    discountName: pct > 0 ? `${Math.round(pct * 100)}% Off` : `$${amt} Off`,
    discountValue,
    discountType,
    newPrice: priceCents - savings,
    savings,
  };
}

// ============================================================================
// Mapping Functions (from src/lightspeed_import.js)
// ============================================================================

function extractStatusesFromWorkorders(workorderCSVText) {
  const rows = parseCSV(workorderCSVText);
  const seen = new Set();
  const extracted = [];
  for (const row of rows) {
    const name = (row.statusName || "").trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    extracted.push(name);
  }
  const nonremovableLabels = new Set(NONREMOVABLE_STATUSES.map(s => s.label.toLowerCase()));
  const csvStatuses = extracted
    .filter(name => !nonremovableLabels.has(name.toLowerCase()))
    .map(name => {
      const bgColor = "#B8B8B8";
      return {
        id: "ls_" + name.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
        label: name,
        textColor: bestForegroundHex(bgColor),
        backgroundColor: bgColor,
        removable: true,
      };
    });
  return [...NONREMOVABLE_STATUSES, ...csvStatuses];
}

function mapCustomers(customerCSVText) {
  const rows = parseCSV(customerCSVText);
  const customers = [];
  let skipped = 0;

  for (const row of rows) {
    if (row.archived === "true") { skipped++; continue; }

    customers.push({
      id: row.customerID || "",
      first: (row.firstName || "").toLowerCase().trim(),
      last: (row.lastName || "").toLowerCase().trim(),
      customerCell: formatPhone(row.phone1),
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
      gatedCommunity: false,
      workorders: [],
      previousBikes: [],
      sales: [],
      deposits: [],
      millisCreated: row.createTime ? String(new Date(row.createTime).getTime()) : "",
      language: "english",
    });
  }

  return { customers, skipped };
}

function mapWorkorders(
  workorderCSVText, workorderItemsCSVText, serializedCSVText,
  itemsCSVText, salesLinesCSVText, customerMap, warpspeedStatuses,
  employeesCSVText, salesCSVText
) {
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
        employeeMap[row.employeeID] = (first + " " + last).trim() || "Lightspeed Import";
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
  let skipped = 0;

  for (const wo of woRows) {
    const woID = wo.workorderID;
    if (!woID) continue;
    if (wo.archived === "true") { skipped++; continue; }

    const customer = customerMap[wo.customerID] || null;
    const customerFirst = (wo.customerFirstName || "").toLowerCase().trim();
    const customerLast = (wo.customerLastName || "").toLowerCase().trim();
    const customerCell = customer ? customer.customerCell : "";

    const statusLabel = (wo.statusName || "").toLowerCase();
    const status = statusMap[statusLabel] || fallbackStatus || { id: "", label: "" };

    const ser = wo.serializedID ? serializedMap[wo.serializedID] : null;
    const serDescription = ser ? (ser.description || "") : "";
    const { brand } = extractBrandModel(serDescription);
    const cleaned = cleanItemDescription(serDescription);
    const description = brand && cleaned.toLowerCase().startsWith(brand.toLowerCase())
      ? cleaned.slice(brand.length).trim() : cleaned;
    const color1 = ser ? mapColor(ser.colorName) : { ...EMPTY_COLOR };

    const startedOnMillis = wo.timeIn ? new Date(wo.timeIn).getTime() : "";
    const isFinished = statusLabel.includes("finished") || statusLabel === "done & paid" || statusLabel === "sales bonus";
    const finishedOnMillis = isFinished && wo.timeStamp ? new Date(wo.timeStamp).getTime() : "";

    const noteName = employeeMap[wo.employeeID] || "Lightspeed Import";
    const customerNotes = [];
    if (wo.note && wo.note.trim()) {
      customerNotes.push({ id: crypto.randomUUID(), name: noteName, userID: "", value: sanitize(wo.note.trim()) });
    }
    const internalNotes = [];
    if (wo.internalNote && wo.internalNote.trim()) {
      internalNotes.push({ id: crypto.randomUUID(), name: noteName, userID: "", value: sanitize(wo.internalNote.trim()) });
    }

    // Catalog items
    const woItems = workorderItemsMap[woID] || [];
    const workorderLines = woItems.map(wi => {
      const item = itemMap[wi.itemID] || null;
      const inventoryItem = {
        id: item ? item.itemID : crypto.randomUUID(),
        formalName: item ? (item.description || "Unknown Item") : "Unknown Item",
        informalName: "",
        brand: "",
        price: dollarsToCents(wi.unitPrice),
        salePrice: 0,
        cost: item ? dollarsToCents(item.avgCost || item.defaultCost) : 0,
        category: item && item.itemType === "non_inventory" ? "Labor" : "Part",
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
    } catch (e) { /* skip unparseable */ }
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
          formalName: sanitize((wl.note || "").trim()) || (isLabor ? "Custom Labor" : "Custom Part"),
          informalName: "",
          brand: "",
          price,
          salePrice: 0,
          cost: dollarsToCents(wl.unitCost),
          category: isLabor ? "Labor" : "Part",
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
    const mappedWo = {
      workorderNumber: generateWorkorderNumber(ean13),
      hasNewSMS: false,
      paymentComplete: false,
      amountPaid: 0,
      activeSaleID: "",
      sales: [],
      endedOnMillis: "",
      saleID: "",
      id: ean13,
      lightspeed_id: woID,
      customerID: wo.customerID || "",
      customerFirst,
      customerLast,
      customerCell,
      customerLandline: customer ? (customer.customerLandline || "") : "",
      customerEmail: "",
      customerContactRestriction: "",
      model: "",
      brand,
      description,
      color1,
      color2: { ...EMPTY_COLOR },
      waitTime: "",
      waitTimeEstimateLabel: "",
      changeLog: [],
      startedBy: wo.employeeID || "",
      startedOnMillis,
      finishedOnMillis,
      partOrdered: "",
      partSource: "",
      partOrderEstimateMillis: "",
      partOrderedMillis: "",
      workorderLines,
      internalNotes,
      customerNotes,
      status: status.id,
      taxFree: wo.saleID && saleMap[wo.saleID]
        ? (parseFloat(saleMap[wo.saleID].calcTax1 || "0") + parseFloat(saleMap[wo.saleID].calcTax2 || "0")) === 0
        : false,
      archived: false,
      media: [],
      customerPin: "",
      _lsSaleID: wo.saleID || "",
      _importSource: "lightspeed",
    };

    workorders.push(mappedWo);

    // Backfill customer workorders array
    if (customer) customer.workorders.push(mappedWo.id);
  }

  return { workorders, skipped };
}

function mapSales(salesCSVText, salesPaymentsCSVText, stripePaymentsCSVText, workorderMap, customerMap) {
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
  let skipped = 0;

  for (const row of saleRows) {
    const lsSaleID = row.saleID;
    if (!lsSaleID) continue;
    if (row.voided === "true") { skipped++; continue; }

    const completed = row.completed === "true";
    const subtotal = dollarsToCents(row.calcSubtotal);
    const total = dollarsToCents(row.calcTotal);
    const tax = dollarsToCents(row.calcTax1) + dollarsToCents(row.calcTax2);
    const discount = dollarsToCents(row.calcDiscount);
    const amountCaptured = dollarsToCents(row.calcPayments);

    const taxableAmount = subtotal - discount;
    const salesTaxPercent = taxableAmount > 0 ? Math.round((tax / taxableAmount) * 10000) / 10000 : 0;

    const millis = row.completeTime
      ? new Date(row.completeTime).getTime()
      : row.createTime ? new Date(row.createTime).getTime() : "";

    const linkedWorkorders = workorderMap[lsSaleID] || [];
    const workorderIDs = linkedWorkorders.map(wo => wo.id);

    const customer = row.customerID && row.customerID !== "0"
      ? customerMap[row.customerID] || null : null;

    const paymentRows = paymentsMap[lsSaleID] || [];
    const saleID = buildLightspeedEAN13("22", lsSaleID);

    const stripeForSale = stripeByOrderID[lsSaleID] || [];
    const stripeUsed = new Set();

    const payments = paymentRows.map(sp => {
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
            stripeMatch = stripeForSale[i]; stripeUsed.add(i); break;
          }
        }
      }

      return {
        id: sp.salePaymentID || crypto.randomUUID(),
        type: amount < 0 ? "refund" : "payment",
        method: isCash ? "cash" : isCheck ? "check" : "card",
        saleID,
        amountCaptured: amount,
        amountTendered: isCash ? amount : "",
        salesTax: 0,
        cardType: stripeMatch ? stripeMatch["Card type"] : (sp.cardType || ""),
        cardIssuer: isCard ? sp.paymentTypeName : "",
        last4: stripeMatch ? stripeMatch["Card last 4"] : (sp.cardLast4 || ""),
        authorizationCode: sp.authCode || "",
        millis: sp.createTime ? new Date(sp.createTime).getTime() : "",
        paymentProcessor: "Stripe",
        chargeID: stripeMatch ? stripeMatch["ID"] : (sp.ccChargeID && sp.ccChargeID !== "0" ? sp.ccChargeID : ""),
        paymentIntentID: stripeMatch ? (stripeMatch["Payment ID"] || "") : "",
        receiptURL: "",
        expMonth: "",
        expYear: "",
        networkTransactionID: "",
        amountRefunded: stripeMatch ? dollarsToCents(stripeMatch["Refunded amount"]) : 0,
        depositType: "",
        _cardFundingSource: stripeMatch ? (stripeMatch["Card funding source"] || "") : "",
        _entryMode: stripeMatch ? (stripeMatch["Entry mode"] || "") : "",
      };
    });

    const mappedSale = {
      id: saleID,
      lightspeed_id: lsSaleID,
      millis,
      subtotal,
      discount,
      tax,
      salesTaxPercent,
      total,
      amountCaptured,
      amountRefunded: 0,
      paymentComplete: completed,
      workorderIDs,
      transactions: payments,
      refunds: [],
      _importSource: "lightspeed",
    };

    sales.push(mappedSale);

    // Backfill workorder sales arrays
    for (const wo of linkedWorkorders) {
      wo.sales.push(saleID);
      wo.saleID = saleID;
      if (completed) {
        wo.paymentComplete = true;
        wo.amountPaid = amountCaptured;
      }
    }

    // Backfill customer sales array
    if (customer) customer.sales.push(saleID);
  }

  return { sales, skipped };
}

function mapInventory(itemsCSVText) {
  const rows = parseCSV(itemsCSVText);
  const items = [];

  for (const row of rows) {
    if (!row.itemID) continue;

    items.push({
      id: row.itemID,
      formalName: (row.description || "").trim(),
      informalName: "",
      brand: (row.brand || "").trim(),
      price: dollarsToCents(row.defaultCost),
      salePrice: 0,
      cost: dollarsToCents(row.avgCost || row.defaultCost),
      category: row.itemType === "non_inventory" ? "Labor" : "Part",
      upc: (row.upc || "").trim(),
      ean: (row.ean || "").trim(),
      customSku: (row.customSku || "").trim(),
      manufacturerSku: (row.manufacturerSku || "").trim(),
      minutes: 0,
      customPart: false,
      customLabor: false,
    });
  }

  return items;
}

// ============================================================================
// Firestore Batch Writer
// ============================================================================

async function batchWrite(collectionPath, docs, label) {
  if (docs.length === 0) {
    logInfo(`${label}: 0 docs — skipping`);
    return;
  }

  logInfo(`Writing ${label}... (${docs.length.toLocaleString()} docs)`);
  const startTime = Date.now();
  let totalBatches = Math.ceil(docs.length / CONFIG.BATCH_SIZE);

  for (let i = 0; i < docs.length; i += CONFIG.BATCH_SIZE) {
    const chunk = docs.slice(i, i + CONFIG.BATCH_SIZE);
    const batch = db.batch();
    for (const doc of chunk) {
      const ref = db.doc(`${collectionPath}/${doc.id}`);
      batch.set(ref, doc);
    }
    await batch.commit();

    const batchNum = Math.floor(i / CONFIG.BATCH_SIZE) + 1;
    if (totalBatches > 1) {
      process.stdout.write(`\r[${timestamp()}]   ... batch ${batchNum}/${totalBatches}`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  if (totalBatches > 1) process.stdout.write("\r" + " ".repeat(80) + "\r");
  logSuccess(`${label} written (${totalBatches} batch${totalBatches > 1 ? "es" : ""}, ${elapsed}s)`);
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
];

function readCSVFiles() {
  const csvData = {};
  const missing = [];

  for (const file of CSV_FILES) {
    const filePath = path.join(CONFIG.csvDir, file);
    if (fs.existsSync(filePath)) {
      const text = fs.readFileSync(filePath, "utf8");
      const rows = parseCSV(text);
      csvData[file] = text;
      logSuccess(`${file.padEnd(25)} (${rows.length.toLocaleString()} rows)`);
    } else {
      // stripePayments.csv is optional
      if (file === "stripePayments.csv") {
        csvData[file] = "";
        logInfo(`${file.padEnd(25)} (not found — optional, skipping)`);
      } else {
        missing.push(file);
        logError(`${file.padEnd(25)} — MISSING`);
      }
    }
  }

  if (missing.length > 0) {
    console.error(`\n  Missing required CSV files. Place them in: ${CONFIG.csvDir}\n`);
    process.exit(1);
  }

  return csvData;
}

// ============================================================================
// Main Orchestrator
// ============================================================================

async function main() {
  const TOTAL_STAGES = 8;
  const globalStart = Date.now();

  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║  Lightspeed → Warpspeed Import Script        ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log(`  Tenant: ${CONFIG.tenantID}`);
  console.log(`  Store:  ${CONFIG.storeID}`);

  // Validate config
  if (CONFIG.tenantID === "YOUR_TENANT_ID" || CONFIG.storeID === "YOUR_STORE_ID") {
    console.error("\n  ✗ Please set tenantID and storeID in the CONFIG section at the top of this script.\n");
    process.exit(1);
  }

  // Init Firebase
  initFirebase();
  const basePath = `tenants/${CONFIG.tenantID}/stores/${CONFIG.storeID}`;

  // ── STAGE 1: Read CSV files ──
  logStage(1, TOTAL_STAGES, "Reading CSV files");
  const csv = readCSVFiles();

  // ── STAGE 2: Map statuses ──
  logStage(2, TOTAL_STAGES, "Mapping statuses");
  const statuses = extractStatusesFromWorkorders(csv["workorders.csv"]);
  const builtIn = NONREMOVABLE_STATUSES.length;
  const fromCSV = statuses.length - builtIn;
  logSuccess(`${statuses.length} statuses (${builtIn} built-in + ${fromCSV} from CSV)`);

  // ── STAGE 3: Map inventory ──
  logStage(3, TOTAL_STAGES, "Mapping inventory");
  const inventoryItems = mapInventory(csv["items.csv"]);
  logSuccess(`${inventoryItems.length.toLocaleString()} items mapped`);

  // ── STAGE 4: Map customers ──
  logStage(4, TOTAL_STAGES, "Mapping customers");
  const { customers, skipped: custSkipped } = mapCustomers(csv["customers.csv"]);
  logSuccess(`${customers.length.toLocaleString()} customers mapped (${custSkipped} archived skipped)`);

  // Build customerMap: lsCustomerID → customer object
  const customerMap = {};
  for (const c of customers) { if (c.id) customerMap[c.id] = c; }

  // ── STAGE 5: Map workorders ──
  logStage(5, TOTAL_STAGES, "Mapping workorders");
  const { workorders, skipped: woSkipped } = mapWorkorders(
    csv["workorders.csv"], csv["workorderItems.csv"], csv["serialized.csv"],
    csv["items.csv"], csv["salesLines.csv"], customerMap, statuses,
    csv["employees.csv"], csv["sales.csv"]
  );
  // Split into open vs completed
  const finishedLabels = new Set();
  for (const s of statuses) {
    const l = s.label.toLowerCase();
    if (l.includes("finished") || l === "done & paid" || l === "sales bonus") {
      finishedLabels.add(s.id);
    }
  }
  const openWorkorders = workorders.filter(wo => !finishedLabels.has(wo.status));
  const completedWorkorders = workorders.filter(wo => finishedLabels.has(wo.status));
  logSuccess(`${workorders.length.toLocaleString()} workorders mapped (${woSkipped} archived skipped)`);
  logInfo(`  → ${openWorkorders.length.toLocaleString()} open | ${completedWorkorders.length.toLocaleString()} completed`);

  // Build workorderMap: lsSaleID → [workorder objects]
  const workorderMap = {};
  for (const wo of workorders) {
    if (wo._lsSaleID && wo._lsSaleID !== "0") {
      if (!workorderMap[wo._lsSaleID]) workorderMap[wo._lsSaleID] = [];
      workorderMap[wo._lsSaleID].push(wo);
    }
  }

  // ── STAGE 6: Map sales ──
  logStage(6, TOTAL_STAGES, "Mapping sales");
  const { sales, skipped: saleSkipped } = mapSales(
    csv["sales.csv"], csv["salesPayments.csv"], csv["stripePayments.csv"],
    workorderMap, customerMap
  );
  const completedSales = sales.filter(s => s.paymentComplete);
  const activeSales = sales.filter(s => !s.paymentComplete);
  logSuccess(`${sales.length.toLocaleString()} sales mapped (${saleSkipped} voided skipped)`);
  logInfo(`  → ${completedSales.length.toLocaleString()} completed | ${activeSales.length.toLocaleString()} active`);

  // ── STAGE 7: Write to Firestore ──
  logStage(7, TOTAL_STAGES, "Writing to Firestore");

  // 7a: Merge statuses into settings
  logInfo("Merging statuses into settings...");
  const settingsRef = db.doc(`${basePath}/settings/settings`);
  await settingsRef.set({ statuses }, { merge: true });
  logSuccess("Settings updated (statuses merged)");

  // 7b: Inventory
  await batchWrite(`${basePath}/inventory`, inventoryItems, "inventory");

  // 7c: Customers
  await batchWrite(`${basePath}/customers`, customers, "customers");

  // 7d: Open workorders
  await batchWrite(`${basePath}/open-workorders`, openWorkorders, "open workorders");

  // 7e: Completed workorders
  await batchWrite(`${basePath}/completed-workorders`, completedWorkorders, "completed workorders");

  // 7f: Completed sales
  await batchWrite(`${basePath}/completed-sales`, completedSales, "completed sales");

  // 7g: Active sales
  await batchWrite(`${basePath}/active-sales`, activeSales, "active sales");

  // ── STAGE 8: Summary ──
  logStage(8, TOTAL_STAGES, "Summary");
  const totalTime = ((Date.now() - globalStart) / 1000).toFixed(1);
  const minutes = Math.floor(totalTime / 60);
  const seconds = (totalTime % 60).toFixed(0);

  console.log(`[${timestamp()}]   Statuses:              ${statuses.length}`);
  console.log(`[${timestamp()}]   Inventory items:       ${inventoryItems.length.toLocaleString()}`);
  console.log(`[${timestamp()}]   Customers:             ${customers.length.toLocaleString()}`);
  console.log(`[${timestamp()}]   Open workorders:       ${openWorkorders.length.toLocaleString()}`);
  console.log(`[${timestamp()}]   Completed workorders:  ${completedWorkorders.length.toLocaleString()}`);
  console.log(`[${timestamp()}]   Completed sales:       ${completedSales.length.toLocaleString()}`);
  console.log(`[${timestamp()}]   Active sales:          ${activeSales.length.toLocaleString()}`);
  console.log(`[${timestamp()}]   Total time:            ${minutes > 0 ? minutes + "m " : ""}${seconds}s`);
  console.log(`[${timestamp()}]   ✓ IMPORT COMPLETE\n`);

  process.exit(0);
}

// Run
main().catch(err => {
  console.error(`\n[${timestamp()}] ✗ FATAL ERROR:`, err.message || err);
  console.error(err.stack);
  process.exit(1);
});

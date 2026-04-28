import { buildLightspeedEAN13, buildWorkorderNumberFromId, bestForegroundHex, hexToRgb, normalizeBarcode, generateEAN13Barcode } from "./utils";
import { COLORS, NONREMOVABLE_STATUSES, CUSTOMER_LANGUAGES, APP_USER, TIME_PUNCH_PROTO } from "./data";

// ============================================================================
// Status Aliases — map common Lightspeed labels to existing nonremovable labels
// ============================================================================
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

// ============================================================================
// CSV Parsing
// ============================================================================

function parseCSVLine(line) {
  let result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    let ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // "" inside quotes = escaped literal quote
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function splitCSVRows(text) {
  // Split CSV into rows, respecting newlines inside quoted fields
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

function sanitize(str) {
  return str.replace(/\\'/g, "'");
}

export function parseCSV(text) {
  let rows = splitCSVRows(text);
  let headers = parseCSVLine(rows[0]);
  return rows.slice(1).map(row => {
    let values = parseCSVLine(row);
    let obj = {};
    headers.forEach((h, i) => obj[h.trim()] = (values[i] || "").trim());
    return obj;
  });
}

// ============================================================================
// Status Mapping
// ============================================================================

/**
 * Parse statuses.csv and merge with NONREMOVABLE_STATUSES.
 * NONREMOVABLE_STATUSES come first; CSV statuses are added if their label
 * doesn't already exist in the nonremovable list.
 */
export function mapStatuses(statusesCSVText) {
  const rows = parseCSV(statusesCSVText);
  const nonremovableLabels = new Set(
    NONREMOVABLE_STATUSES.map(s => s.label.toLowerCase())
  );
  const aliasedLabels = new Set(Object.keys(STATUS_ALIASES));

  const csvStatuses = [];
  for (var i = 0; i < rows.length; i++) {
    var name = (rows[i].Status || rows[i].name || "").trim();
    var lower = name.toLowerCase();
    if (!name) continue;
    if (nonremovableLabels.has(lower)) continue;
    if (aliasedLabels.has(lower)) continue;
    var bgHex = (rows[i].Color || rows[i].htmlColor || "").trim() || "#B8B8B8";
    var textColor = bestForegroundHex(bgHex);
    var rgb = hexToRgb(bgHex);
    var sortOrder = parseInt(rows[i].sortOrder || rows[i].SortOrder || "0", 10) || 0;
    csvStatuses.push({
      id: "ls_" + lower.replace(/[^a-z0-9]+/g, "_"),
      label: name,
      textColor: textColor,
      backgroundColor: "rgb(" + rgb.r + "," + rgb.g + "," + rgb.b + ")",
      removable: true,
      hidden: false,
      _sortOrder: sortOrder,
    });
  }
  csvStatuses.sort(function (a, b) { return a._sortOrder - b._sortOrder; });
  csvStatuses.forEach(function (s) { delete s._sortOrder; });

  return [...NONREMOVABLE_STATUSES, ...csvStatuses];
}

// ============================================================================
// Color Mapping
// ============================================================================

// Build color lookup from COLORS array in data.js
// Keys: lowercase label → { textColor, backgroundColor, label }
const COLOR_MAP = {};
for (const c of COLORS) {
  const key = c.label.toLowerCase();
  COLOR_MAP[key] = {
    textColor: c.textColor || "",
    backgroundColor: c.backgroundColor || "",
    label: c.label || "",
  };
}
// Add aliases
COLOR_MAP["grey"] = COLOR_MAP["gray"] || { textColor: "white", backgroundColor: "darkgray", label: "Gray" };
COLOR_MAP["light blue"] = COLOR_MAP["light-blue"];
COLOR_MAP["lightblue"] = COLOR_MAP["light-blue"];
COLOR_MAP["light gray"] = COLOR_MAP["light-gray"];
COLOR_MAP["lightgray"] = COLOR_MAP["light-gray"];

const EMPTY_COLOR = { textColor: "", backgroundColor: "", label: "" };

function mapColor(colorName) {
  if (!colorName) return { ...EMPTY_COLOR };
  // Split on "/" for multi-color (e.g. "grey/black") — use first
  let primary = colorName.split("/")[0].trim().toLowerCase();
  return COLOR_MAP[primary] ? { ...COLOR_MAP[primary] } : { ...EMPTY_COLOR };
}

// ============================================================================
// Description Cleaning (from existing import pattern)
// ============================================================================

function cleanItemDescription(item) {
  if (!item) return "";
  let cleaned = item.trim();
  // Remove trailing -SOURCE or /SOURCE annotations (e.g., "-EBAY", "/AMAZON", "-JBI")
  cleaned = cleaned.replace(/\s+[-\/][A-Z][A-Z0-9]*\s*$/, "");
  // Remove trailing N/N batch numbers (e.g., "1/2", "2/2")
  cleaned = cleaned.replace(/\s+\d+\/\d+\s*$/, "");
  // Remove trailing ALL-CAPS words (no lowercase, has uppercase, 2+ chars)
  let words = cleaned.split(/\s+/);
  while (words.length > 1) {
    let last = words[words.length - 1];
    if (last.length >= 2 && /[A-Z]/.test(last) && !/[a-z]/.test(last)) {
      words.pop();
    } else {
      break;
    }
  }
  return words.join(" ").trim();
}

// ============================================================================
// Brand / Model Extraction
// ============================================================================

function extractBrandModel(description) {
  if (!description) return { brand: "", model: "" };

  let working = cleanItemDescription(description);

  // Remove color keywords from the working string
  const colorKeywords = Object.keys(COLOR_MAP);
  for (const keyword of colorKeywords) {
    const regex = new RegExp(`\\b${keyword}\\b`, "i");
    working = working.replace(regex, "").replace(/\s{2,}/g, " ").trim();
  }

  // Split on comma/period — take first segment as brand+model
  let segment = working.split(/[,.]/)[ 0].trim();

  let words = segment.split(/\s+/).filter(w => w);
  if (words.length > 1) {
    return { brand: words.slice(0, -1).join(" "), model: words[words.length - 1] };
  } else if (words.length === 1) {
    return { brand: words[0], model: "" };
  }
  return { brand: "", model: "" };
}

// ============================================================================
// Phone Formatting
// ============================================================================

function formatPhone(raw) {
  if (!raw) return "";
  let digits = raw.replace(/\D/g, "");
  return digits;
}

// ============================================================================
// Dollar → Cents
// ============================================================================

export function dollarsToCents(val) {
  if (!val && val !== 0) return 0;
  return Math.round(parseFloat(val) * 100) || 0;
}

// ============================================================================
// Discount Mapping
// ============================================================================

function buildDiscountObj(saleLine, priceCents) {
  if (!saleLine) return null;
  const pct = parseFloat(saleLine.discountPercent) || 0;
  const amt = parseFloat(saleLine.discountAmount) || 0;
  if (pct === 0 && amt === 0) return null;

  let savings;
  let discountType;
  let discountValue;

  if (pct > 0) {
    discountType = "%";
    discountValue = Math.round(pct * 100); // 0.15 → 15
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
// mapCustomers
// ============================================================================

export function mapCustomers(customerCSVText) {
  const rows = parseCSV(customerCSVText);
  const customers = [];
  const phoneMap = {}; // phone → customer index for deduplication
  const customerRedirectMap = {}; // discardedLsID → survivingLsID

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

    // Deduplicate by phone — merge into existing customer if same phone
    if (cell && phoneMap[cell] !== undefined) {
      const existing = customers[phoneMap[cell]];
      // Keep the record with more data (prefer one with name + email)
      const existingScore = (existing.first ? 1 : 0) + (existing.email ? 1 : 0) + (existing.streetAddress ? 1 : 0);
      const newScore = (customer.first ? 1 : 0) + (customer.email ? 1 : 0) + (customer.streetAddress ? 1 : 0);
      const keepID = existing.id;
      if (newScore > existingScore) {
        // Replace with richer record but keep the original ID (workorder/sale backfills use it)
        customers[phoneMap[cell]] = { ...customer, id: keepID };
      }
      // Redirect the discarded LS customer ID to the surviving one
      customerRedirectMap[customer.id] = keepID;
      console.log("[Migration] Deduplicated customer phone " + cell + ": merged " + customer.id + " -> " + keepID);
      continue;
    }

    if (cell) phoneMap[cell] = customers.length;
    customers.push(customer);
  }

  return { customers, customerRedirectMap };
}

// ============================================================================
// mapWorkorders
// ============================================================================

export function mapWorkorders(
  workorderCSVText,
  workorderItemsCSVText,
  serializedCSVText,
  itemsCSVText,
  salesLinesCSVText,
  customerMap,            // { lsCustomerID → customer object } (from mapCustomers output)
  warpspeedStatuses,      // array of status objects from settings
  employeesCSVText,       // optional — employees.csv text for note author names
  salesCSVText,           // optional — sales.csv text for taxFree detection
  customerRedirectMap = {}, // { discardedLsID → survivingLsID } (from mapCustomers)
  settings = {}           // settings object (for taxFreeReceiptNote)
) {
  const woRows = parseCSV(workorderCSVText);
  const wiRows = parseCSV(workorderItemsCSVText);
  const serRows = parseCSV(serializedCSVText);
  const itemRows = parseCSV(itemsCSVText);
  const slRows = parseCSV(salesLinesCSVText);

  // employeeMap: employeeID → "First Last"
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

  // saleMap: saleID → sale row (for taxFree detection via calcTax1/calcTax2)
  const saleMap = {};
  if (salesCSVText) {
    const saleRows = parseCSV(salesCSVText);
    for (const row of saleRows) {
      if (row.saleID) saleMap[row.saleID] = row;
    }
  }

  // --- Build lookup maps ---

  // serializedMap: serializedID → row
  const serializedMap = {};
  for (const row of serRows) {
    if (row.serializedID) serializedMap[row.serializedID] = row;
  }

  // itemMap: itemID → row
  const itemMap = {};
  for (const row of itemRows) {
    if (row.itemID) itemMap[row.itemID] = row;
  }

  // saleLineMap: saleLineID → row
  const saleLineMap = {};
  for (const row of slRows) {
    if (row.saleLineID) saleLineMap[row.saleLineID] = row;
  }

  // workorderItemsMap: workorderID → [rows]
  const workorderItemsMap = {};
  for (const row of wiRows) {
    if (!row.workorderID) continue;
    if (!workorderItemsMap[row.workorderID]) workorderItemsMap[row.workorderID] = [];
    workorderItemsMap[row.workorderID].push(row);
  }

  // statusMap: lowercase label → full status object
  const statusMap = {};
  let fallbackStatus = null;
  for (const s of warpspeedStatuses) {
    statusMap[s.label.toLowerCase()] = s;
    if (s.label.toLowerCase() === "service") fallbackStatus = s;
  }
  // If no "Service" status found, use first status as fallback
  if (!fallbackStatus && warpspeedStatuses.length > 0) fallbackStatus = warpspeedStatuses[0];

  // --- Map workorders ---
  const workorders = [];

  for (const wo of woRows) {
    const woID = wo.workorderID;
    if (!woID) continue;

    // Skip archived
    if (wo.archived === "true") continue;

    // Customer lookup (apply redirect for deduplicated customers)
    const woCustomerEAN = wo.customerID ? buildLightspeedEAN13("20", wo.customerID) : "";
    const resolvedCustomerID = customerRedirectMap[woCustomerEAN] || woCustomerEAN;
    const customer = customerMap[resolvedCustomerID] || null;
    const customerFirst = (wo.customerFirstName || "").toLowerCase().trim();
    const customerLast = (wo.customerLastName || "").toLowerCase().trim();
    const customerCell = customer ? customer.customerCell : "";

    // Status — match by label (resolve aliases first), log + assign "Unknown Status" if unmatched
    const rawLabel = (wo.statusName || "").toLowerCase();
    const statusLabel = STATUS_ALIASES[rawLabel] || rawLabel;
    let status = statusMap[statusLabel] || fallbackStatus;
    if (!statusMap[statusLabel]) {
      console.warn("[Migration] Unknown status \"" + wo.statusName + "\" for WO " + woID + " — assigned \"" + (status ? status.label : "Unknown Status") + "\"");
    }
    if (!status) status = { backgroundColor: "", id: crypto.randomUUID(), label: "Unknown Status", removable: true, textColor: "" };

    // Bike details from serialized
    const ser = wo.serializedID ? serializedMap[wo.serializedID] : null;
    const serDescription = ser ? (ser.description || "") : "";
    const { brand } = extractBrandModel(serDescription);
    const cleaned = cleanItemDescription(serDescription);
    // Strip brand from description, leave the rest
    const description = brand && cleaned.toLowerCase().startsWith(brand.toLowerCase())
      ? cleaned.slice(brand.length).trim()
      : cleaned;
    const color1 = ser ? mapColor(ser.colorName) : { ...EMPTY_COLOR };

    // Timestamps
    const startedOnMillis = wo.timeIn ? new Date(wo.timeIn).getTime() : "";
    const isFinished = statusLabel.includes("finished") || statusLabel === "done & paid" || statusLabel === "sales bonus";
    let finishedOnMillis = isFinished && wo.timeStamp ? new Date(wo.timeStamp).getTime() : "";
    if (isFinished && !finishedOnMillis) console.warn("[Migration] Finished WO " + woID + " missing timeStamp, finishedOnMillis is empty");

    // paidOnMillis — use linked sale's completeTime (available for 100% of Done & Paid WOs)
    const linkedSale = wo.saleID ? saleMap[wo.saleID] : null;
    const paidOnMillis = linkedSale && linkedSale.completeTime ? new Date(linkedSale.completeTime).getTime() : "";

    // Notes — use employee name if available, otherwise fall back to "Lightspeed Import"
    const noteName = employeeMap[wo.employeeID] || "Lightspeed Import";
    const customerNotes = [];
    if (wo.note && wo.note.trim()) {
      customerNotes.push({
        id: crypto.randomUUID(),
        name: noteName,
        userID: "",
        value: sanitize(wo.note.trim()),
      });
    }

    const internalNotes = [];
    if (wo.internalNote && wo.internalNote.trim()) {
      internalNotes.push({
        id: crypto.randomUUID(),
        name: noteName,
        userID: "",
        value: sanitize(wo.internalNote.trim()),
      });
    }

    // Workorder lines from workorderItems (catalog items)
    const woItems = workorderItemsMap[woID] || [];
    const workorderLines = woItems.map(wi => {
      const item = itemMap[wi.itemID] || null;

      const rawUpc = item ? (item.upc || "") : "";
      const rawEan = item ? (item.ean || "") : "";
      const normUpc = normalizeBarcode(rawUpc);
      const normEan = normalizeBarcode(rawEan);
      const isNativeEan = normEan && !normEan.startsWith("0");
      const primaryBarcode = (isNativeEan ? normEan : null) || normUpc || generateEAN13Barcode();
      const barcodes = [normEan, normUpc].filter(c => c && c !== primaryBarcode);
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
      const discountObj = buildDiscountObj(wiSaleLine, inventoryItem.price);

      return {
        id: crypto.randomUUID(),
        qty: parseInt(wi.unitQuantity) || 1,
        intakeNotes: sanitize((wi.note || "").trim()),
        receiptNotes: "",
        inventoryItem,
        discountObj,
        useSalePrice: false,
        warranty: wi.warranty === "true",
      };
    });

    // Custom lines from workorderLinesJSON (custom part/labor entries)
    let woLinesParsed = [];
    try {
      if (wo.workorderLinesJSON) woLinesParsed = JSON.parse(wo.workorderLinesJSON);
    } catch (e) {
      console.error("[LS Mapping] Failed to parse workorderLinesJSON for WO " + woID + ":", e.message, "| Raw:", wo.workorderLinesJSON?.substring(0, 200));
    }
    if (!Array.isArray(woLinesParsed)) woLinesParsed = [];

    for (const wl of woLinesParsed) {
      const totalMinutes = (parseInt(wl.hours) || 0) * 60 + (parseInt(wl.minutes) || 0);
      const isLabor = totalMinutes > 0;

      // Get actual charged price from salesLines
      const wlSaleLine = wl.saleLineID ? saleLineMap[wl.saleLineID] : null;
      const price = wlSaleLine
        ? dollarsToCents(wlSaleLine.unitPrice)
        : dollarsToCents(wl.unitPriceOverride);
      const wlDiscountObj = buildDiscountObj(wlSaleLine, price);

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
        discountObj: wlDiscountObj,
        useSalePrice: false,
        warranty: wl.warranty === "true",
      });
    }

    const ean13 = buildLightspeedEAN13("25", woID);
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
      taxFree: wo.saleID && saleMap[wo.saleID]
        ? (parseFloat(saleMap[wo.saleID].calcTax1 || "0") + parseFloat(saleMap[wo.saleID].calcTax2 || "0")) === 0
        : false,
      taxFreeReceiptNote: (wo.saleID && saleMap[wo.saleID]
        && (parseFloat(saleMap[wo.saleID].calcTax1 || "0") + parseFloat(saleMap[wo.saleID].calcTax2 || "0")) === 0)
        ? (settings?.taxFreeReceiptNote || "") : "",
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

// ============================================================================
// mapSales
// ============================================================================

export function mapSales(
  salesCSVText,
  salesPaymentsCSVText,
  paymentsCSVText,
  workorderMap,            // { lsSaleID → mapped workorder object(s) }
  customerMap,             // { lsCustomerID → customer object }
  customerRedirectMap = {} // { discardedLsID → survivingLsID } (from mapCustomers)
) {
  const saleRows = parseCSV(salesCSVText);
  const spRows = parseCSV(salesPaymentsCSVText);
  const paymentReportRows = paymentsCSVText ? parseCSV(paymentsCSVText) : [];

  // --- Build lookup maps ---

  // paymentsMap: saleID → [salePayment rows]
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
  const refundChargesByCustomer = {};
  for (const pr of paymentReportRows) {
    if (pr.Status !== "REFUNDED" && pr.Status !== "PARTIALLY_REFUNDED") continue;
    const orderID = pr["Order ID"];
    if (!orderID) continue;
    const origSaleRow = saleRows.find(r => r.saleID === orderID);
    if (!origSaleRow || !origSaleRow.customerID || origSaleRow.customerID === "0") continue;
    const custID = origSaleRow.customerID;
    const refundedCents = dollarsToCents(pr["Refunded amount"]);
    if (refundedCents <= 0) continue;
    const key = custID + "_" + refundedCents;
    if (!refundChargesByCustomer[key]) refundChargesByCustomer[key] = [];
    refundChargesByCustomer[key].push({
      chargeID: (pr.ID || "").replace(/^st-/, ""),
      last4: pr["Card last 4"] || "",
      cardType: pr["Card type"] || "",
    });
  }
  const refundChargesUsed = new Set();

  // --- Map sales ---
  const sales = [];
  const allTransactions = [];

  for (const row of saleRows) {
    const lsSaleID = row.saleID;
    if (!lsSaleID) continue;

    // Skip voided
    if (row.voided === "true") continue;

    const completed = row.completed === "true";
    const subtotal = dollarsToCents(row.calcSubtotal);
    const total = dollarsToCents(row.calcTotal);
    const tax = dollarsToCents(row.calcTax1) + dollarsToCents(row.calcTax2);
    const discount = dollarsToCents(row.calcDiscount);

    // Tax percent: derive from subtotal if possible
    const taxableAmount = subtotal - discount;
    const salesTaxPercent = taxableAmount > 0 ? Math.round((tax / taxableAmount) * 10000) / 10000 : 0;

    // Timestamp
    const millis = row.completeTime
      ? new Date(row.completeTime).getTime()
      : row.createTime
        ? new Date(row.createTime).getTime()
        : "";

    // Workorder linkage
    const linkedWorkorders = workorderMap[lsSaleID] || [];
    const workorderIDs = linkedWorkorders.map(wo => wo.id);

    // Customer linkage (apply redirect for deduplicated customers)
    const saleCustEAN = row.customerID && row.customerID !== "0"
      ? buildLightspeedEAN13("20", row.customerID)
      : "";
    const resolvedCustID = saleCustEAN
      ? (customerRedirectMap[saleCustEAN] || saleCustEAN)
      : "";
    const customer = resolvedCustID ? customerMap[resolvedCustID] || null : null;

    // Map payments
    const paymentRows = paymentsMap[lsSaleID] || [];
    const saleID = buildLightspeedEAN13("22", lsSaleID);

    // Detect deposit sale: any payment with "Credit Account" type and negative amount (money into account)
    const isDepositSale = paymentRows.some(sp => sp.paymentTypeName === "Credit Account" && parseFloat(sp.amount) < 0);

    // Separate payment rows into real transactions (cash/card/check) vs deposit redemptions (credit account positive)
    const transactionRows = paymentRows.filter(sp => {
      if (sp.paymentTypeType === "credit account") return false;
      if (sp.paymentTypeType === "ecom") return false;
      return true;
    });

    // Collect deposit redemptions (positive credit account on non-deposit sales)
    const depositRedemptionRows = isDepositSale ? [] : paymentRows.filter(sp =>
      sp.paymentTypeType === "credit account" && dollarsToCents(sp.amount) > 0
    );

    // Lightspeed Payments report records for this sale (matched by Order ID)
    const prForSale = paymentsByOrderID[lsSaleID] || [];
    const prUsed = new Set();

    const payments = transactionRows.map(sp => {
      const isCash = sp.paymentTypeType === "cash";
      const isCheck = sp.paymentTypeName === "Check";
      const isCard = sp.paymentTypeType === "credit card";
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
        const refKey = row.customerID + "_" + Math.abs(amount);
        const candidates = refundChargesByCustomer[refKey] || [];
        for (let ri = 0; ri < candidates.length; ri++) {
          const cid = candidates[ri].chargeID;
          if (!refundChargesUsed.has(cid)) {
            refundMatch = candidates[ri];
            refundChargesUsed.add(cid);
            break;
          }
        }
      }

      // Fallback to salesPayments.csv card fields (e.g., May 2025 gap)
      const spLast4 = isCard && sp.cardLast4 ? sp.cardLast4 : "";
      const spCardType = isCard && sp.cardType ? sp.cardType : "";
      const spAuthCode = isCard && sp.authCode ? sp.authCode : "";

      return {
        id: sp.salePaymentID || crypto.randomUUID(),
        method: isCash ? "cash" : isCheck ? "check" : "card",
        amountCaptured: amount,
        amountTendered: (isCash && amount >= 0) ? amount : 0,
        salesTax: 0,
        millis: sp.createTime ? new Date(sp.createTime).getTime() : 0,
        last4: prMatch ? (prMatch["Card last 4"] || "") : refundMatch ? refundMatch.last4 : spLast4,
        expMonth: "",
        expYear: "",
        cardType: prMatch ? (prMatch["Card type"] || "") : refundMatch ? refundMatch.cardType : spCardType,
        cardIssuer: isCard ? sp.paymentTypeName : "",
        paymentProcessor: isCard ? "stripe" : isCash ? "cash" : "check",
        paymentIntentID: "",
        chargeID: prMatch ? (prMatch.ID || "").replace(/^st-/, "") : refundMatch ? refundMatch.chargeID : "",
        authorizationCode: spAuthCode,
        networkTransactionID: "",
        receiptURL: "",
        depositType: isDepositSale ? "deposit" : "",
        refunds: [],
        items: [],
      };
    });

    // Build depositsApplied entries for credit account redemptions
    const depositsApplied = depositRedemptionRows.map(sp => ({
      id: sp.salePaymentID || crypto.randomUUID(),
      transactionId: "",
      amount: dollarsToCents(sp.amount),
      type: "deposit",
    }));

    // Assign sale tax to the first payment transaction
    if (tax > 0 && payments.length > 0) {
      payments[0].salesTax = tax;
    }

    // Compute amounts: transactions + deposit redemptions
    const txnTotal = payments.reduce((sum, p) => sum + p.amountCaptured, 0);
    const depositRedemptionTotal = depositsApplied.reduce((sum, d) => sum + d.amount, 0);

    const mappedSale = {
      id: saleID,
      lightspeed_id: lsSaleID,
      millis,
      subtotal,
      discount,
      salesTax: tax,
      salesTaxPercent,
      total,
      amountCaptured: txnTotal + depositRedemptionTotal,
      paymentComplete: completed || (txnTotal + depositRedemptionTotal >= total && total > 0),
      workorderIDs,
      transactionIDs: payments.map(p => p.id),
      pendingTransactionIDs: [],
      pendingRefundIDs: [],
      creditsApplied: [],
      depositsApplied,
      customerID: resolvedCustID,
      isDepositSale,
      depositType: isDepositSale ? "deposit" : "",
      depositNote: "",
      _importSource: "lightspeed",
    };

    // Deposit sales do not create sale objects — only transaction docs
    if (!isDepositSale) {
      sales.push(mappedSale);

      // Backfill workorder saleID
      for (const wo of linkedWorkorders) {
        wo.saleID = saleID;
        if (completed) {
          wo.paymentComplete = true;
          wo.amountPaid = txnTotal + depositRedemptionTotal;
        }
      }

      // Backfill customer sales array
      if (customer) {
        customer.sales.push(saleID);
      }
    }

    allTransactions.push(...payments);
  }

  return { sales, transactions: allTransactions };
}

// ============================================================================
// Employee Mapping
// ============================================================================

const SKIP_EMPLOYEE_IDS = ["1"]; // Fritz - already in system
const SKIP_EMPLOYEE_NAMES = ["support user", "office user"]; // system accounts

/**
 * Map Lightspeed employees CSV to APP_USER objects.
 * Returns { users: APP_USER[], employeeIDMap: { lsEmployeeID → appUserID } }
 */
export function mapEmployees(employeesCSVText) {
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

    const appUserID = "ls_emp_" + lsID;
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

// ============================================================================
// Punch History Mapping
// ============================================================================

/**
 * Map Lightspeed employeeHours CSV to TIME_PUNCH_PROTO objects.
 * Each row with a valid checkIn/checkOut becomes 2 punch objects ("in" + "out").
 * Skips rows where employeeID is not in employeeIDMap.
 */
export function mapPunchHistory(employeeHoursCSVText, employeeIDMap) {
  const rows = parseCSV(employeeHoursCSVText);
  const punches = [];

  for (const row of rows) {
    const lsEmployeeID = (row.employeeID || "").trim();
    const appUserID = employeeIDMap[lsEmployeeID];
    if (!appUserID) continue;

    const checkIn = (row.checkIn || "").trim();
    const checkOut = (row.checkOut || "").trim();

    if (checkIn) {
      const inMillis = new Date(checkIn).getTime();
      punches.push({
        ...TIME_PUNCH_PROTO,
        id: "ls_punch_" + lsEmployeeID + "_in_" + inMillis,
        userID: appUserID,
        millis: inMillis,
        option: "in",
        _importSource: "lightspeed",
      });
    }

    if (checkOut) {
      const outMillis = new Date(checkOut).getTime();
      punches.push({
        ...TIME_PUNCH_PROTO,
        id: "ls_punch_" + lsEmployeeID + "_out_" + outMillis,
        userID: appUserID,
        millis: outMillis,
        option: "out",
        _importSource: "lightspeed",
      });
    }
  }

  return punches;
}

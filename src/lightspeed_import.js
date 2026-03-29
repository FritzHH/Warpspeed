import { buildLightspeedEAN13, generateWorkorderNumber, bestForegroundHex } from "./utils";
import { COLORS, NONREMOVABLE_STATUSES } from "./data";

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
  return str.replace(/'\//g, "'");
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

  const csvStatuses = rows
    .filter(row => row.Status && !nonremovableLabels.has(row.Status.toLowerCase()))
    .map(row => {
      const bgColor = row.Color || "#B8B8B8";
      const textColor = bestForegroundHex(bgColor);
      return {
        id: "ls_" + row.Status.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_"),
        label: row.Status.trim(),
        textColor,
        backgroundColor: bgColor,
        removable: true,
      };
    });

  return [...NONREMOVABLE_STATUSES, ...csvStatuses];
}

/**
 * Extract unique status names from workorders.csv and merge with NONREMOVABLE_STATUSES.
 * Use this when statuses.csv is not available.
 */
export function extractStatusesFromWorkorders(workorderCSVText) {
  const rows = parseCSV(workorderCSVText);
  const seen = new Set();
  const extracted = [];
  for (const row of rows) {
    const name = (row.statusName || "").trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    extracted.push(name);
  }
  const nonremovableLabels = new Set(
    NONREMOVABLE_STATUSES.map(s => s.label.toLowerCase())
  );
  const csvStatuses = extracted
    .filter(name => !nonremovableLabels.has(name.toLowerCase()))
    .map(name => {
      const bgColor = "#B8B8B8";
      const textColor = bestForegroundHex(bgColor);
      return {
        id: "ls_" + name.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
        label: name,
        textColor,
        backgroundColor: bgColor,
        removable: true,
      };
    });
  return [...NONREMOVABLE_STATUSES, ...csvStatuses];
}

// ============================================================================
// Color Mapping
// ============================================================================

// Build color lookup from COLORS array in data.js
// Keys: lowercase label → { textColor, backgroundColor, label, altTextColor }
const COLOR_MAP = {};
for (const c of COLORS) {
  const key = c.label.toLowerCase();
  COLOR_MAP[key] = {
    textColor: c.textColor || "",
    backgroundColor: c.backgroundColor || "",
    label: c.label || "",
    altTextColor: c.altTextColor || "dimgray",
  };
}
// Add aliases
COLOR_MAP["grey"] = COLOR_MAP["gray"] || { textColor: "white", backgroundColor: "darkgray", label: "Gray", altTextColor: "dimgray" };
COLOR_MAP["light blue"] = COLOR_MAP["light-blue"];
COLOR_MAP["lightblue"] = COLOR_MAP["light-blue"];
COLOR_MAP["light gray"] = COLOR_MAP["light-gray"];
COLOR_MAP["lightgray"] = COLOR_MAP["light-gray"];

const EMPTY_COLOR = { textColor: "", backgroundColor: "", label: "", altTextColor: "" };

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

  for (const row of rows) {
    if (row.archived === "true") continue;

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
      workorders: [],
      previousBikes: [],
      sales: [],
      millisCreated: row.createTime ? String(new Date(row.createTime).getTime()) : "",
    });
  }

  return customers;
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
  customerMap,       // { lsCustomerID → customer object } (from mapCustomers output)
  warpspeedStatuses, // array of status objects from settings
  employeesCSVText,  // optional — employees.csv text for note author names
  salesCSVText       // optional — sales.csv text for taxFree detection
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

    // Customer lookup
    const customer = customerMap[wo.customerID] || null;
    const customerFirst = (wo.customerFirstName || "").toLowerCase().trim();
    const customerLast = (wo.customerLastName || "").toLowerCase().trim();
    const customerCell = customer ? customer.customerCell : "";

    // Status — match by label
    const statusLabel = (wo.statusName || "").toLowerCase();
    const status = statusMap[statusLabel] || fallbackStatus || { altTextColor: "", backgroundColor: "", id: "", label: "", removable: true, textColor: "" };

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
    const finishedOnMillis = isFinished && wo.timeStamp ? new Date(wo.timeStamp).getTime() : "";

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
        discountObj: wlDiscountObj,
        useSalePrice: false,
        warranty: wl.warranty === "true",
      });
    }

    const ean13 = buildLightspeedEAN13("25", woID);
    const mappedWo = {
      workorderNumber: generateWorkorderNumber(ean13),
      id: ean13,
      lightspeed_id: woID,
      customerID: wo.customerID || "",
      customerFirst,
      customerLast,
      customerCell,
      model: "",
      brand,
      description,
      color1,
      color2: { ...EMPTY_COLOR },
      status: status.id,
      taxFree: wo.saleID && saleMap[wo.saleID]
        ? (parseFloat(saleMap[wo.saleID].calcTax1 || "0") + parseFloat(saleMap[wo.saleID].calcTax2 || "0")) === 0
        : false,
      archived: wo.archived === "true",
      startedBy: wo.employeeID || "",
      startedOnMillis,
      finishedOnMillis,
      workorderLines,
      customerNotes,
      internalNotes,
      changeLog: [],
      waitTime: "",
      partOrdered: "",
      partSource: "",
      paymentComplete: false,
      amountPaid: 0,
      activeSaleID: "",
      sales: [],
      endedOnMillis: "",
      saleID: "",
      media: [],
      _lsSaleID: wo.saleID || "",
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
  stripePaymentsCSVText,
  workorderMap,   // { lsSaleID → mapped workorder object(s) }
  customerMap     // { lsCustomerID → customer object }
) {
  const saleRows = parseCSV(salesCSVText);
  const spRows = parseCSV(salesPaymentsCSVText);
  const stripeRows = stripePaymentsCSVText ? parseCSV(stripePaymentsCSVText) : [];

  // --- Build lookup maps ---

  // paymentsMap: saleID → [salePayment rows]
  const paymentsMap = {};
  for (const sp of spRows) {
    if (!sp.saleID) continue;
    if (!paymentsMap[sp.saleID]) paymentsMap[sp.saleID] = [];
    paymentsMap[sp.saleID].push(sp);
  }

  // stripeByOrderID: Order ID (= LS saleID) → [stripe rows]
  const stripeByOrderID = {};
  for (const sr of stripeRows) {
    const orderID = sr["Order ID"];
    if (!orderID) continue;
    if (!stripeByOrderID[orderID]) stripeByOrderID[orderID] = [];
    stripeByOrderID[orderID].push(sr);
  }

  // --- Map sales ---
  const sales = [];

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
    const amountCaptured = dollarsToCents(row.calcPayments);

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

    // Customer linkage
    const customer = row.customerID && row.customerID !== "0"
      ? customerMap[row.customerID] || null
      : null;

    // Map payments
    const paymentRows = paymentsMap[lsSaleID] || [];
    const saleID = buildLightspeedEAN13("22", lsSaleID);

    // Stripe records for this sale (matched by Order ID = saleID)
    const stripeForSale = stripeByOrderID[lsSaleID] || [];
    // Track which Stripe rows are consumed (for multi-payment matching)
    const stripeUsed = new Set();

    const payments = paymentRows.map(sp => {
      const isCash = sp.paymentTypeType === "cash";
      const isCheck = sp.paymentTypeName === "Check";
      const isCard = sp.paymentTypeType === "credit card";
      const amount = dollarsToCents(sp.amount);

      // For card payments, try to match a Stripe record for card details
      let stripeMatch = null;
      if (isCard && stripeForSale.length > 0) {
        // Try exact amount match first (Stripe Amount is in dollars)
        for (let i = 0; i < stripeForSale.length; i++) {
          if (stripeUsed.has(i)) continue;
          const stripeAmountCents = dollarsToCents(stripeForSale[i]["Amount"]);
          if (stripeAmountCents === amount) {
            stripeMatch = stripeForSale[i];
            stripeUsed.add(i);
            break;
          }
        }
        // Fallback: take first unused Stripe record for this sale
        if (!stripeMatch) {
          for (let i = 0; i < stripeForSale.length; i++) {
            if (stripeUsed.has(i)) continue;
            stripeMatch = stripeForSale[i];
            stripeUsed.add(i);
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
        depositId: "",
        depositOriginalAmount: 0,
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

    // Backfill workorder saleID
    for (const wo of linkedWorkorders) {
      wo.saleID = saleID;
      if (completed) {
        wo.paymentComplete = true;
        wo.amountPaid = amountCaptured;
      }
    }

    // Backfill customer sales array
    if (customer) {
      customer.sales.push(saleID);
    }
  }

  return sales;
}

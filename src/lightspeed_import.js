import { generateRandomID, formatPhoneWithDashes } from "./utils";
import { COLORS } from "./data";

// ============================================================================
// CSV Parsing
// ============================================================================

function parseCSVLine(line) {
  let result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    let ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { result.push(current); current = ""; }
    else { current += ch; }
  }
  result.push(current);
  return result;
}

function parseCSV(text) {
  let lines = text.split("\n").filter(l => l.trim());
  let headers = parseCSVLine(lines[0]);
  return lines.slice(1).map(line => {
    let values = parseCSVLine(line);
    let obj = {};
    headers.forEach((h, i) => obj[h.trim()] = (values[i] || "").trim());
    return obj;
  });
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
  if (!digits) return "";
  return formatPhoneWithDashes(digits);
}

// ============================================================================
// Dollar → Cents
// ============================================================================

function dollarsToCents(val) {
  if (!val && val !== 0) return 0;
  return Math.round(parseFloat(val) * 100) || 0;
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
      cell: formatPhone(row.phone1),
      landline: formatPhone(row.phone2),
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
  customerMap,       // { lsCustomerID → customer object } (from mapCustomers output)
  warpspeedStatuses  // array of status objects from settings
) {
  const woRows = parseCSV(workorderCSVText);
  const wiRows = parseCSV(workorderItemsCSVText);
  const serRows = parseCSV(serializedCSVText);
  const itemRows = parseCSV(itemsCSVText);

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
    const customerPhone = customer ? customer.cell : "";

    // Status — match by label
    const statusLabel = (wo.statusName || "").toLowerCase();
    const status = statusMap[statusLabel] || fallbackStatus || { altTextColor: "", backgroundColor: "", id: "", label: "", removable: true, textColor: "" };

    // Bike details from serialized
    const ser = wo.serializedID ? serializedMap[wo.serializedID] : null;
    const serDescription = ser ? (ser.description || "") : "";
    const { brand, model } = extractBrandModel(serDescription);
    const description = cleanItemDescription(serDescription);
    const color1 = ser ? mapColor(ser.colorName) : { ...EMPTY_COLOR };

    // Timestamps
    const startedOnMillis = wo.timeIn ? new Date(wo.timeIn).getTime() : "";
    const isFinished = statusLabel.includes("finished") || statusLabel === "done & paid" || statusLabel === "sales bonus";
    const finishedOnMillis = isFinished && wo.timeStamp ? new Date(wo.timeStamp).getTime() : "";

    // Notes
    const customerNotes = [];
    if (wo.note && wo.note.trim()) {
      customerNotes.push({
        id: generateRandomID(),
        name: "Lightspeed Import",
        userID: "",
        value: wo.note.trim(),
      });
    }

    const internalNotes = [];
    if (wo.internalNote && wo.internalNote.trim()) {
      internalNotes.push({
        id: generateRandomID(),
        name: "Lightspeed Import",
        userID: "",
        value: wo.internalNote.trim(),
      });
    }

    // Workorder lines from workorderItems
    const woItems = workorderItemsMap[woID] || [];
    const workorderLines = woItems.map(wi => {
      const item = itemMap[wi.itemID] || null;

      const inventoryItem = {
        id: item ? item.itemID : generateRandomID(),
        formalName: item ? (item.description || "Unknown Item") : "Unknown Item",
        informalName: "",
        brand: "",
        price: dollarsToCents(wi.unitPrice),
        salePrice: 0,
        cost: item ? dollarsToCents(item.avgCost || item.defaultCost) : 0,
        category: item && item.itemType === "non_inventory" ? "Labor" : "Part",
      };

      return {
        id: generateRandomID(),
        qty: parseInt(wi.unitQuantity) || 1,
        intakeNotes: (wi.note || "").trim(),
        receiptNotes: "",
        inventoryItem,
        discountObj: null,
        useSalePrice: false,
        warranty: wi.warranty === "true",
      };
    });

    const mappedWo = {
      workorderNumber: woID,
      id: generateRandomID(),
      customerID: wo.customerID || "",
      customerFirst,
      customerLast,
      customerPhone,
      model,
      brand,
      description,
      color1,
      color2: { ...EMPTY_COLOR },
      status,
      taxFree: wo.tax === "false",
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
      isStandaloneSale: false,
      media: [],
    };

    workorders.push(mappedWo);

    // Backfill customer workorders array
    if (customer) {
      customer.workorders.push(mappedWo.id);
    }
  }

  return workorders;
}

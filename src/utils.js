/* eslint-disable */
import { useEffect, useInsertionEffect, useRef } from "react";
import { getNewCollectionRef, dbSendSMS, dbSendEmail } from "./db_calls_wrapper";
import {
  CONTACT_RESTRICTIONS,
  CUSTOMER_PROTO,
  RECEIPT_PROTO,
  RECEIPT_TYPES,
  SALE_PROTO,
  SETTINGS_OBJ,
  WORKORDER_ITEM_PROTO,
  WORKORDER_PROTO,
} from "./data";
import { generate } from "random-words";
import { cloneDeep } from "lodash";
import dayjs from "dayjs";
import { C } from "./styles";
import { useAlertScreenStore, useLoginStore, useSettingsStore } from "./stores";
import { DISCOUNT_TYPES, MILLIS_IN_MINUTE } from "./constants";
const _shared = require("./shared/printBuilder");

// const fs = require("node:fs");
export const dim = {
  windowWidth: window.innerWidth,
  windowHeight: window.innerHeight,
};

export const LETTERS = "qwertyuioplkjhgfdsazxcvbnm-";
export const NUMS = "1234567890-";

export function clog(one, two) {
  // console.log("hdfkjdkjfak");
  let str = "";

  if (typeof one === "object") {
    console.log(str + JSON.stringify(one) + two);
    return;
  }

  if (typeof two === "object") {
    console.log(str + one + " : " + JSON.stringify(two));
    return;
  }

  if (one) {
    str += one;
  }
  if (two) {
    str += "  :  ";
    str += two;
  } else {
    // str = "log: " + str;
  }
  console.log(str);
}

export function log(one, two) {
  if (!two) two = "";
  let spacer = "";
  if (two) spacer = "  ---------->  ";
  console.log(one, spacer);
  if (two) console.log(two);
}

export function logs(one, two) {
  if (!two) two = "";
  let spacer = "";
  if (two) spacer = "  ---------->  ";
  const expandedOne =
    typeof one === "object" && one !== null
      ? JSON.stringify(one, null, 2)
      : one;
  console.log(expandedOne, spacer);
  if (two) {
    const expandedTwo =
      typeof two === "object" && two !== null
        ? JSON.stringify(two, null, 2)
        : two;
    console.log(expandedTwo);
  }
}

export function applyLineItemDiscounts(wo, zInventoryArr) {
  // let wo = cloneDeep(openWorkorderObj);
  wo.workorderLines.forEach((line, idx) => {
    // clog("lin", line);
    let newWOLine = cloneDeep(line);
    let discountObj = line.discountObj;
    let inventoryItem = zInventoryArr.find(
      (item) => item.id === line.invItemID
    );

    //EDGE CASE if we cannot find the inventory item, that means its been removed from inventory. use the price that was in the system originally.
    newWOLine.price = inventoryItem?.price || newWOLine.price;

    if (discountObj.name) {
      let newDiscountObj = applyDiscountToWorkorderItem(newWOLine);
      // clog(newDiscountObj);
      if (newDiscountObj.newPrice != null) {
        newWOLine.discountObj = cloneDeep(newDiscountObj);
        // log("here");
      }
      // clog(newWOLine);
    }
    // clog(newWOLine);
    // if (newWOLine.discountObj.discountValue > 0) clog(newWOLine);
    wo.workorderLines[idx] = newWOLine;
    // log(wo.workorderLines[idx]);
  });

  return wo;
}

export function calculateRunningTotals(
  workorders,
  salesTaxRatePercent,
  workorderlinesArr = [],
  isRefund,
  taxFree = false
) {
  let runningTotal = 0;
  let runningDiscount = 0;
  let runningSubtotal = 0;
  let runningQty = 0;
  // log("input", workorders);

  // log(workorderlinesArr);

  if (!Array.isArray(workorders)) workorders = [workorders];
  workorders.forEach((workorderObj) => {
    // log(workorderObj)
    let arrToIterate = isRefund
      ? workorderlinesArr
      : workorderObj.workorderLines;
    arrToIterate.forEach((line, idx) => {
      if (
        isRefund &&
        !arrHasItem(
          workorderObj.workorderLines.map((o) => o.inventoryItem),
          line.inventoryItem
        )
      )
        return;
      let qty = line.qty;
      // clog("line", line.discountObj);
      runningSubtotal = runningSubtotal + line.inventoryItem.price * qty;
      if (line.discountObj?.value) {
        let recalc = applyDiscountToWorkorderItem(line, true);
        runningTotal = runningTotal + Number(recalc.newPrice);
        runningDiscount = runningDiscount + Number(recalc.savings);
      } else {
        runningTotal = runningTotal + line.inventoryItem.price * qty;
      }
      runningQty += qty;
    });
  });
  // log(salesTaxRatePercent);
  // log("run", runningDiscount);
  let runningTax = taxFree ? 0 : runningTotal * (salesTaxRatePercent / 100);
  let obj = {
    finalTotal: runningTotal + runningTax,
    runningTotal,
    runningSubtotal, // total before discounts, so can be more than running total
    runningDiscount,
    runningTax,
    runningQty,
  };
  // clog(obj);
  return obj;
}

export function calculateTaxes(totalAmount, workorderObj, settingsObj) {
  let returnObj = {
    totalAmount: 0,
    totalTax: 0,
  };
  if (workorderObj.taxFree) return returnObj;
  // log("total", totalAmount * zSettingsObj.salesTaxPercent);
  let tax = Number(totalAmount) * Number(settingsObj.salesTaxPercent);
  let total = tax + Number(totalAmount);
  return {
    totalAmount: total,
    tax: tax,
  };
}

export const FileInputComponent = ({
  handleBinaryString,
  buttonStyle = {},
  textStyle = {},
  text,
}) => {
  const fileInputRef = useRef(null);
  const onDrop = useCallback((acceptedFiles) => {
    acceptedFiles.forEach((file) => {
      const reader = new FileReader();

      reader.onabort = () => console.log("file reading was aborted");
      reader.onerror = () => console.log("file reading has failed");
      reader.onload = () => {
        const binaryStr = reader.result;
        handleBinaryString(binaryStr);
      };
      reader.readAsArrayBuffer(file);
    });
  }, []);

  const handleFileUpload = (e) => {
    // const file = e.target.files[0];
    // e.target.value = null;
    clog("files", e.target);
    return file;
    const binaryStr = readAsBinaryString(file);
    handleBinaryString(binaryStr);
  };

  return (
    <TouchableOpacity onPress={() => fileInputRef.current.open()}>
      <View
        style={{
          width: 170,
          height: 30,
          backgroundColor: null,
          alignItems: "center",
          justifyContent: "center",
          ...SHADOW_RADIUS_PROTO,
          ...buttonStyle,
        }}
      >
        <Text style={{ ...textStyle }}>{text || "Drag File / Click Here"}</Text>
        <Dropzone onDrop={onDrop} ref={fileInputRef}>
          {({ getInputProps }) => (
            <section>
              <input {...getInputProps()} />
            </section>
          )}
        </Dropzone>
      </View>
    </TouchableOpacity>
  );
  return (
    <TouchableOpacity onClick={() => openFilePicker()}>
      <View
        style={{
          width: 200,
          height: 30,
          backgroundColor: null,
          ...buttonStyle,
        }}
      >
        <input
          ref={fileInputRef}
          // style={{ display: "none" }}
          type="file"
          onChange={(e) => handleFileUpload(e)}
        />
        <Text style={{ ...textStyle }}>Upload File</Text>
      </View>
    </TouchableOpacity>
  );
};

/**
 * searchInventory(query, items)
 *
 * Multi-algorithm inventory search combining exact, substring, and fuzzy
 * matching with field-weighted scoring. Accepts a query string and an array
 * of inventory item objects. Returns results sorted by relevance with _score.
 *
 * Scoring tiers:
 *   Tier 1 — Exact field match                          → 1.0
 *   Tier 2 — Field starts with term                     → 0.92
 *   Tier 3 — Word-boundary substring (term matches a word start) → 0.85
 *   Tier 4 — General substring (includes)               → 0.75
 *   Tier 5 — Fuzzy (Levenshtein + Jaro-Winkler + Dice)  → 0–0.65
 *
 * Field weights:
 *   formalName: 1.0 | brand: 0.7 | category: 0.5 | informalName: 0.4
 *   upc/ean/customSku/manufacturerSku: exact-only at 0.95
 */
export function searchInventory(query, items) {
  if (!query || !items || !items.length) return [];
  const queryNorm = query.toString().toLowerCase().trim();
  if (!queryNorm) return [];

  // Normalize common patterns so variations match consistently
  function normalizePatterns(str) {
    return str
      // Tire sizes: "700 x 38", "700X38", "700 X 38" → "700x38"
      .replace(/(\d+)\s*[xX×]\s*(\d)/g, "$1x$2")
      // Fractions with spaces: "1 / 2" → "1/2"
      .replace(/(\d+)\s*\/\s*(\d)/g, "$1/$2")
      // Hyphenated compounds: "tune-up" / "tune up" → "tuneup"
      .replace(/\b(\w+)[\s-]+(up|in|on|out|off|over)\b/g, "$1$2")
      // Collapse multiple spaces
      .replace(/\s{2,}/g, " ");
  }

  const normalizedQuery = normalizePatterns(queryNorm);
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  if (!terms.length) return [];

  // --- Helpers ---
  function norm(str) {
    return str ? normalizePatterns(str.toString().toLowerCase().trim()) : "";
  }

  function levenshteinSim(a, b) {
    if (a === b) return 1;
    const al = a.length, bl = b.length;
    if (!al || !bl) return 0;
    if (Math.abs(al - bl) > Math.max(al, bl) * 0.6) return 0;
    const m = [];
    for (let i = 0; i <= bl; i++) m[i] = [i];
    for (let j = 0; j <= al; j++) m[0][j] = j;
    for (let i = 1; i <= bl; i++) {
      for (let j = 1; j <= al; j++) {
        m[i][j] = b[i - 1] === a[j - 1]
          ? m[i - 1][j - 1]
          : Math.min(m[i - 1][j - 1] + 1, m[i][j - 1] + 1, m[i - 1][j] + 1);
      }
    }
    return 1 - m[bl][al] / Math.max(al, bl);
  }

  function jaroWinklerSim(s1, s2) {
    if (s1 === s2) return 1;
    const l1 = s1.length, l2 = s2.length;
    if (!l1 || !l2) return 0;
    const window = Math.floor(Math.max(l1, l2) / 2) - 1;
    const f1 = Array(l1).fill(false);
    const f2 = Array(l2).fill(false);
    let matches = 0, transpositions = 0;
    for (let i = 0; i < l1; i++) {
      const lo = Math.max(0, i - window);
      const hi = Math.min(i + window + 1, l2);
      for (let j = lo; j < hi; j++) {
        if (!f2[j] && s1[i] === s2[j]) { f1[i] = true; f2[j] = true; matches++; break; }
      }
    }
    if (!matches) return 0;
    let k = 0;
    for (let i = 0; i < l1; i++) {
      if (!f1[i]) continue;
      while (!f2[k]) k++;
      if (s1[i] !== s2[k]) transpositions++;
      k++;
    }
    const jaro = (matches / l1 + matches / l2 + (matches - transpositions / 2) / matches) / 3;
    let prefix = 0;
    for (let i = 0; i < Math.min(4, l1, l2); i++) {
      if (s1[i] === s2[i]) prefix++; else break;
    }
    return jaro + prefix * 0.1 * (1 - jaro);
  }

  function diceCoefficient(a, b) {
    if (a === b) return 1;
    if (a.length < 2 || b.length < 2) return 0;
    const bigramsA = {};
    for (let i = 0; i < a.length - 1; i++) {
      const bg = a.slice(i, i + 2);
      bigramsA[bg] = (bigramsA[bg] || 0) + 1;
    }
    let intersection = 0;
    for (let i = 0; i < b.length - 1; i++) {
      const bg = b.slice(i, i + 2);
      if (bigramsA[bg] > 0) { intersection++; bigramsA[bg]--; }
    }
    return (2 * intersection) / (a.length - 1 + b.length - 1);
  }

  // Weighted fields for text matching
  const FIELDS = [
    { key: "formalName", weight: 1.0 },
    { key: "brand", weight: 1.0 },
    { key: "category", weight: 1.0 },
    { key: "informalName", weight: 1.0 },
  ];

  // Identifier fields — exact match only
  const ID_FIELDS = ["upc", "ean", "customSku", "manufacturerSku"];

  // Score a single term against a single field value
  function scoreTerm(term, fieldVal) {
    if (!fieldVal) return 0;

    // Tier 1: exact match
    if (term === fieldVal) return 1.0;

    // Tier 2: field starts with term
    if (fieldVal.startsWith(term)) return 0.92;

    // Tier 3: word-boundary match (term matches start of any word)
    // Earlier position = higher score (0.89 for word 1, down to 0.81 for later words)
    const words = fieldVal.split(/[\s\-\/\(\)]+/);
    for (let wi = 0; wi < words.length; wi++) {
      if (words[wi].startsWith(term)) {
        let positionBonus = Math.max(0, 0.04 - wi * 0.01);
        return 0.85 + positionBonus;
      }
    }

    // Tier 4: general substring — earlier position scores higher
    const subIdx = fieldVal.indexOf(term);
    if (subIdx >= 0) {
      let positionBonus = Math.max(0, 0.04 * (1 - subIdx / fieldVal.length));
      return 0.75 + positionBonus;
    }

    // Tier 5: fuzzy — only for terms 3+ chars
    if (term.length >= 3) {
      let bestFuzzy = 0;
      for (const word of words) {
        if (word.length < 2) continue;
        const lev = levenshteinSim(term, word);
        const jw = jaroWinklerSim(term, word);
        const dice = diceCoefficient(term, word);
        const fuzzy = lev * 0.4 + jw * 0.35 + dice * 0.25;
        if (fuzzy > bestFuzzy) bestFuzzy = fuzzy;
      }
      // Also score against full field for multi-word names
      const levFull = levenshteinSim(term, fieldVal);
      const jwFull = jaroWinklerSim(term, fieldVal);
      const diceFull = diceCoefficient(term, fieldVal);
      const fuzzyFull = levFull * 0.4 + jwFull * 0.35 + diceFull * 0.25;
      if (fuzzyFull > bestFuzzy) bestFuzzy = fuzzyFull;

      // Cap fuzzy at 0.55 so it never outranks substring matches
      return Math.min(bestFuzzy, 0.55);
    }

    return 0;
  }

  // Score an entire item
  function scoreItem(item) {
    // Check identifier fields first — exact match is an instant high score
    const queryNoSpaces = queryNorm.replace(/\s/g, "");
    for (const key of ID_FIELDS) {
      const val = norm(item[key]);
      if (val && val === queryNoSpaces) return 0.95;
    }

    // Score each term across weighted fields
    let totalScore = 0;
    for (const term of terms) {
      let bestWeightedScore = 0;
      for (const { key, weight } of FIELDS) {
        const val = norm(item[key]);
        const raw = scoreTerm(term, val);
        const weighted = raw * weight;
        if (weighted > bestWeightedScore) bestWeightedScore = weighted;
      }
      totalScore += bestWeightedScore;
    }

    return totalScore / terms.length;
  }

  // Score all items, filter, sort
  const scored = [];
  for (let i = 0; i < items.length; i++) {
    const score = scoreItem(items[i]);
    if (score > 0.4) scored.push({ idx: i, score });
  }
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, 50).map(s => ({ ...items[s.idx], _score: s.score }));
}

// Legacy wrapper
export function fuzzySearch(searchTerms, items) {
  const query = Array.isArray(searchTerms) ? searchTerms.join(" ") : searchTerms;
  return searchInventory(query, items);
}

export function getRgbFromNamedColor(colorName) {
  // log(colorName);
  const el = document.createElement("div");
  el.style.color = colorName;
  document.body.appendChild(el);
  let rgb = getComputedStyle(el).color; // yields 'rgb(r,g,b)'
  // log("rgb", rgb);
  document.body.removeChild(el);
  rgb = rgb.toString();

  // log(rgb);
  const match = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  // log("match", match[0]);

  return match[0];
}

// string ops ///////////////////////////////////////////////////////
export function stringifyAllObjectFields(obj) {
  if (obj === null || obj === undefined) return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => stringifyAllObjectFields(item));
  }

  if (typeof obj === 'object') {
    const result = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        result[key] = stringifyAllObjectFields(obj[key]);
      }
    }
    return result;
  }

  // Convert primitives to strings
  return String(obj);
}

// numbers /////////////////////////////////////////////////////////
export function generateWorkorderNumber(barcodeNumber) {
  const numStr = String(barcodeNumber);

  if (!numStr || !/^\d{12,13}$/.test(numStr)) {
    throw new Error("Input must be 12 or 13 digits");
  }

  // Generate 5 unique random indexes
  const indexes = [];
  while (indexes.length < 5) {
    const randomIndex = Math.floor(Math.random() * numStr.length);
    if (!indexes.includes(randomIndex)) {
      indexes.push(randomIndex);
    }
  }

  const result = indexes.map((index) => numStr[index]).join("");
  return result;
}

export function stringIsNumeric(str) {
  return /^\d+$/.test(str);
}

export function checkInputForNumbersOnly(valString, includeDecimal = true) {
  let isGood = true;
  let nums = NUMS;
  if (includeDecimal) nums += ".";
  valString
    .toString()
    .split("")
    .forEach((val) => {
      if (!nums.includes(val)) isGood = false;
    });
  return isGood;
}

export function formatCurrencyDisp(value, withCurrency = false) {
  let locale = "en-US";
  let currency = "USD";
  const cents = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(cents)) return "";
  const amount = cents / 100;
  const opts = withCurrency
    ? {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }
    : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  return amount.toLocaleString(locale, opts);
  // log(input);
}

export function usdTypeMask(raw, { withDollar = false } = {}) {
  if (raw == null) return { display: withDollar ? "$0.00" : "0.00", cents: 0 };

  let s = String(raw)
    .trim()
    .replace(/[,$\s]/g, "");
  let neg = false;

  // Accounting negatives "(123.45)"
  const parens = /^\((.*)\)$/.exec(s);
  if (parens) {
    neg = true;
    s = parens[1];
  }
  if (s.startsWith("-")) {
    neg = !neg;
    s = s.slice(1);
  }

  // Keep only digits — we'll force the decimal position ourselves
  const digits = s.replace(/\D/g, "");
  if (digits.length === 0) {
    const display = `${neg ? "-" : ""}${withDollar ? "$" : ""}0.00`;
    return { display, cents: 0 };
  }

  // Split into dollars & cents (last two digits are cents)
  const len = digits.length;
  const rawDollars =
    (digits.slice(0, Math.max(0, len - 2)) || "0").replace(/^0+(?=\d)/, "") ||
    "0";
  const centsStr = digits.slice(-2).padStart(2, "0");

  // Add commas to dollars
  const dollarsWithCommas = rawDollars.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  // Compute integer cents (BigInt for very large inputs)
  let centsVal;
  try {
    centsVal = Number(BigInt(rawDollars) * 100n + BigInt(centsStr));
  } catch {
    centsVal = parseInt(rawDollars, 10) * 100 + parseInt(centsStr, 10);
  }
  if (neg) centsVal = -centsVal;

  const display = `${neg ? "-" : ""}${withDollar ? "$" : ""
    }${dollarsWithCommas}.${centsStr}`;
  return { display, cents: centsVal };
}

export function dollarsToCents(input) {
  if (input == null) return NaN;

  // Normalize to a clean numeric string
  let s = String(input)
    .trim()
    .replace(/[,$\s]/g, "") // drop $, commas, spaces
    .replace(/^\((.*)\)$/, "-$1"); // (123.45) -> -123.45 (accounting negatives)

  const m = s.match(/^([+-])?\s*(?:(\d+)(?:\.(\d*))?|\.(\d+))$/);
  if (!m) return NaN;

  const neg = m[1] === "-";
  const intPart = m[2] || "0";
  let frac = m[3] ?? m[4] ?? ""; // digits after decimal (may be empty)

  // Round to 2 decimals using string digits (no floating point pitfalls)
  while (frac.length < 3) frac += "0"; // ensure at least 3 digits to decide rounding
  let cents =
    parseInt(intPart, 10) * 100 + parseInt(frac.slice(0, 2) || "0", 10);
  if (frac[2] >= "5") cents += 1; // round up if 3rd frac digit >= 5

  return neg ? -cents : cents;
}

export function convertMillisToHoursMins(millis) {
  const totalMinutes = Math.floor(millis / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const formattedHoursMin = hours + ":" + minutes;
  return { hours, minutes, totalMinutes, formattedHoursMin };
}

export function removeDashesFromPhone(str) {
  return str.replaceAll("-", "");
}

export function formatPhoneWithDashes(num) {
  if (!num) return "";
  let phone = num.toString();
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length <= 10)
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  // If longer than 10 digits, format first 10, append rest
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(
    6,
    10
  )} ${digits.slice(10)}`;
}

export function formatPhoneForDisplay(num) {
  if (!num) return "";
  let phone = num.toString();
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  if (digits.length <= 10)
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  // If longer than 10 digits, format first 10, append rest
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(
    6,
    10
  )} ${digits.slice(10)}`;
}

export function unformatPhoneForDisplay(formattedPhone) {
  if (!formattedPhone) return "";
  // Remove all non-digit characters and return first 10 digits
  const digits = formattedPhone.replace(/\D/g, "");
  return digits.slice(0, 10);
}

export function formatDecimal(value) {
  // log("incoming", val);
  // Remove all non-digit characters
  if (!value) return "0.00";
  value = value.toString();
  // log("val", value);
  const cleaned = value.replace(/\D/g, "");
  // Parse as cents, so pad or cut to two decimal places
  let num = parseFloat(cleaned);
  if (isNaN(num)) num = 0;
  // Always treat input as cents
  num = num / 100;
  // Format to USD currency
  num = num.toLocaleString("en-US", { style: "currency", currency: "USD" });
  return num.slice(1);
}

export function roundToTwoDecimals(n) {
  if (!Number.isFinite(n)) return n;
  const f = 1e2;
  return Math.round((n + Number.EPSILON) * f) / f;
}

export function trimToTwoDecimals(num) {
  // log("incoming num to trim to 2 decimals", num);

  let strNum = num.toString();

  return Number(num).toFixed(2);
  let res;

  // old code
  if (strNum.includes(".")) {
    let split = strNum.split(".");
    // log("split", split);
    let countOnRight = split[1].length;
    if (countOnRight == 2) {
      // have decimal with 2 on right
      // log("one");
      if (split[0] == "") {
        // no leading 0, add
        strNum = "0" + strNum;
      }
      res = strNum;
    } else if (countOnRight == 1) {
      // 1 character on right, add another
      // log("two");
      res = strNum + "0";
      if (split[0] == "") {
        res = "0" + res;
      }
    } else if (countOnRight == 0 && split[1] != "") {
      // log("three");
      res = strNum + "00";
    } else {
      // log("four");
      let last2 = split[1].slice(0, 2);
      res = split[0] + "." + last2;
    }
  } else {
    // log("five");
    res = strNum + ".00";
  }
  // log("trim 2 decimals val", res);
  return res;
}

export function trimToThreeDecimals(n) {
  if (!Number.isFinite(n)) return n;
  return Math.trunc(n * 1e3) / 1e3;
}

export function ifNumIsOdd(num) {
  return num % 2 !== 0;
}

export function numberIsEven(num) {
  return num % 2 === 0;
}

export function generateRandomNumber({ min, max }) {
  if (!min) {
    min = 1;
    max = 10;
  }

  min = Math.ceil(min);
  max = Math.floor(max);
  // The maximum and minimum are inclusive
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function incrementNumByFive(input) {
  let currentValue = parseInt(input, 10) || 0;
  if (currentValue % 5 !== 0) {
    // Find the next highest multiple of 5
    currentValue = currentValue + (5 - (currentValue % 5));
  } else {
    currentValue += 5;
  }
  return currentValue;
}

export function decrementNumByFive(input) {
  let currentValue = parseInt(input, 10) || 0;
  if (currentValue % 5 !== 0) {
    // Go to the next lowest multiple of 5
    currentValue = currentValue - (currentValue % 5);
  } else {
    currentValue -= 5;
  }

  if (currentValue <= 0) {
    currentValue = 0;
  }
  return currentValue;
}

export function generateTimesForListDisplay() {
  const times = [];
  const startMinutes = 0; // 12:00 AM → 0 minutes
  const endMinutes = 12 * 60; // 12:00 PM → 720 minutes
  const step = 30; // step size in minutes (adjust as needed)

  for (let m = startMinutes; m <= endMinutes; m += step) {
    let hours24 = Math.floor(m / 60);
    let minutes = m % 60;

    // Convert 24h → 12h format
    let period = hours24 < 12 ? "AM" : "PM";
    let hours12 = hours24 % 12;
    if (hours12 === 0) hours12 = 12;

    // Format as hh:mm
    const label = `${hours12}:${minutes.toString().padStart(2, "0")} ${period}`;

    times.push({ label, minutes: m });
  }

  return times;
}

// searching and filters ////////////////////////////////////////
export function searchPhoneNum(searchTerm, customerArrToSearch) {
  let resObj = {};
  for (let i = 0; i <= customerArrToSearch.length - 1; i++) {
    let customerObj = customerArrToSearch[i];
    if (customerObj.customerCell.startsWith(searchTerm))
      resObj[customerObj.id] = customerObj;
    if (customerObj.customerLandline.startsWith(searchTerm))
      resObj[customerObj.id] = customerObj;

    if (searchTerm.length === 4) {
      if (customerObj.customerCell.endsWith(searchTerm))
        resObj[customerObj.id] = customerObj;
      if (customerObj.customerLandline.endsWith(searchTerm))
        resObj[customerObj.id] = customerObj;
    }
  }
  return Object.values(resObj);
}

export function searchCustomerNames(first, last, searchArr = [CUSTOMER_PROTO]) {
  let res = {};
  searchArr.forEach((customerObj) => {
    if (
      first &&
      customerObj.first.toLowerCase().startsWith(first.toLowerCase())
    )
      res[customerObj.id] = customerObj;
    if (last && customerObj.last.toLowerCase().startsWith(last.toLowerCase()))
      res[customerObj.id] = customerObj;
  });
  return Object.values(res);
}

/**
 * Comprehensive customer search function that uses input type detection
 * to determine the appropriate search method
 * @param {string} searchInput - The user's search input
 * @param {string} tenantID - Tenant ID for database queries
 * @param {string} storeID - Store ID for database queries
 * @param {Object} options - Optional parameters for search
 * @returns {Promise<Object>} Search results with metadata
 */
export async function searchCustomers(
  searchInput,
  tenantID,
  storeID,
  options = {}
) {
  try {
    // First determine what type of input this is
    const inputAnalysis = determineSearchInputType(searchInput);

    // If input is too short, return early
    if (inputAnalysis.type === "unknown") {
      return {
        success: false,
        error: "Input too short",
        message: "Please enter at least 4 characters to search",
        inputAnalysis,
      };
    }

    let searchResults = [];
    let searchMethod = "";

    // Import the database search functions
    const {
      dbSearchCustomersByPhone,
      dbSearchCustomersByEmail,
      dbSearchCustomersByName,
    } = await import("./db_calls_wrapper.js");

    // Perform search based on detected input type
    switch (inputAnalysis.type) {
      case "phone":
        searchMethod = "phone";
        const phoneResults = await dbSearchCustomersByPhone(
          searchInput,
          tenantID,
          storeID,
          options
        );
        searchResults = phoneResults.customers || [];
        break;

      case "email":
        searchMethod = "email";
        const emailResults = await dbSearchCustomersByEmail(
          searchInput,
          tenantID,
          storeID,
          options
        );
        searchResults = emailResults.customers || [];
        break;

      case "name":
        searchMethod = "name";
        const nameResults = await dbSearchCustomersByName(
          searchInput,
          tenantID,
          storeID,
          options
        );
        searchResults = nameResults.customers || [];
        break;

      default:
        // Fallback to name search if type is unclear
        searchMethod = "name_fallback";
        const fallbackResults = await dbSearchCustomersByName(
          searchInput,
          tenantID,
          storeID,
          options
        );
        searchResults = fallbackResults.customers || [];
    }

    return {
      success: true,
      customers: searchResults,
      count: searchResults.length,
      searchMethod,
      inputAnalysis,
      searchInput,
      tenantID,
      storeID,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Error in searchCustomers:", error);
    return {
      success: false,
      error: error.message,
      customers: [],
      count: 0,
      inputAnalysis: determineSearchInputType(searchInput),
      searchInput,
      tenantID,
      storeID,
    };
  }
}

export function isChromiumBased() {
  // Check for Chromium features and user agent
  const ua = navigator.userAgent;
  const isChromium =
    // Chromium features
    (!!window.chrome &&
      // Not old Edge (EdgeHTML)
      !window.StyleMedia &&
      // Not Firefox
      ua.indexOf("Firefox") === -1 &&
      // Not Safari
      ua.indexOf("Safari") === -1) ||
    ua.indexOf("Chrome") !== -1;

  return isChromium;
}

export function checkInternetConnection() {
  // Attempt to fetch a lightweight, CORS-friendly resource (Google favicon)
  const url = "https://www.google.com/favicon.ico?_=" + Date.now();

  return fetch(url, { method: "HEAD", mode: "no-cors", cache: "no-cache" })
    .then(() => true)
    .catch(() => false);
}

export function getConnectionStrength() {
  if ("connection" in navigator) {
    const connection =
      navigator.connection ||
      navigator.mozConnection ||
      navigator.webkitConnection;
    const downlink = connection.downlink; // Mbps
    const effectiveType = connection.effectiveType; // '4g', '3g', etc.

    let strength;
    if (downlink >= 10) {
      strength = "Excellent";
    } else if (downlink >= 5) {
      strength = "Good";
    } else if (downlink >= 2) {
      strength = "Fair";
    } else {
      strength = "Poor";
    }

    return {
      downlink,
      effectiveType,
      strength,
    };
  } else {
    return {
      downlink: null,
      effectiveType: "unknown",
      strength: "Cannot determine (API not supported)",
    };
  }
}

export function gray(u, alpha = 1) {
  // u in [0,1]: 0 -> white (255), 1 -> black (0)
  let x = Number(u);
  if (!Number.isFinite(x)) x = 0;
  x = Math.min(1, Math.max(0, x));
  const v = Math.round((1 - x) * 255);

  alpha = Math.min(1, Math.max(0, Number(alpha)));
  return alpha === 1 ? `rgb(${v},${v},${v})` : `rgba(${v},${v},${v},${alpha})`;
  return "rgba(0,0,0," + opacity + ")";
}

// text formatting
export function capitalizeFirstLetterOfString(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function capitalizeAllWordsInSentence(sentence) {
  if (!sentence) return "";

  // If string contains '@', uncapitalize the first letter (likely an email)
  if (sentence.includes("." || sentence.includes("@"))) {
    return sentence.charAt(0).toLowerCase() + sentence.slice(1);
  }

  // Split by periods to handle each sentence separately
  return sentence
    .split(".")
    .map((part, index) => {
      // Skip capitalization for parts after the first period
      if (index > 0) {
        return part; // Return as-is for parts after periods
      }

      // Capitalize only the first part (before any period)
      return part.replace(/\b\w/g, function (char) {
        return char.toUpperCase();
      });
    })
    .join(".");
}

export function useInterval(callback, delay) {
  const savedCallback = useRef();
  // Remember the latest callback.
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  // Set up the interval.`
  useEffect(() => {
    function tick() {
      savedCallback.current();
    }
    if (delay !== null) {
      let id = setInterval(tick, delay);
      return () => clearInterval(id);
    }
  }, [delay]);
}

export function deepEqual(obj1, obj2) {
  if (obj1 === obj2) return true;
  if (
    typeof obj1 !== "object" ||
    obj1 === null ||
    typeof obj2 !== "object" ||
    obj2 === null
  )
    return false;

  const stack = [[obj1, obj2]];

  while (stack.length) {
    const [a, b] = stack.pop();

    if (a === b) continue;
    if (
      typeof a !== "object" ||
      a === null ||
      typeof b !== "object" ||
      b === null
    )
      return false;

    const keysA = Object.keys(a).sort();
    const keysB = Object.keys(b).sort();

    // Compare field names
    if (keysA.length !== keysB.length) return false;
    for (let i = 0; i < keysA.length; i++) {
      if (keysA[i] !== keysB[i]) return false;
    }

    // Compare field values
    for (let key of keysA) {
      stack.push([a[key], b[key]]);
    }
  }
  return true;
}

export function applyDiscountToWorkorderItem(
  workorderLineObj,
  returnAsDiscountObj
) {
  let discountObj = workorderLineObj.discountObj;
  if (!discountObj || !discountObj.value) return workorderLineObj;

  let newPrice;
  let savings;

  if (discountObj.type === DISCOUNT_TYPES.percent) {
    let multiplier = 1 - Number(discountObj.value) / 100;
    newPrice =
      workorderLineObj.inventoryItem.price * workorderLineObj.qty * multiplier;
    savings =
      workorderLineObj.inventoryItem.price * workorderLineObj.qty - newPrice;
    // log("newprice", trimToTwoDecimals(newPrice));
    // log("savings", savings);
  } else {
    newPrice =
      workorderLineObj.inventoryItem.price * workorderLineObj.qty -
      workorderLineObj.qty * discountObj.value;
    savings =
      workorderLineObj.inventoryItem.price * workorderLineObj.qty - newPrice;
  }
  // log("newprice", newPrice);
  let newDiscountObj = {
    ...discountObj,
    newPrice: Math.round(newPrice),
    savings: Math.round(savings),
  };

  if (returnAsDiscountObj) {
    return newDiscountObj;
  }
  workorderLineObj.discountObj = newDiscountObj;
  return workorderLineObj;
}

export function insertOpacityIntoRGBString(rgbString, opacity) {
  const match = rgbString.match(/^rgb\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})\)$/);
  if (!match) throw new Error("Invalid RGB string format");
  const [_, r, g, b] = match;
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export function lightenRGBByPercent(rgb, percent) {
  // log("rgb", rgb);
  const match = rgb.match(/^rgb\s*\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\)$/i);
  if (!match) throw new Error("Invalid RGB format");
  let [r, g, b] = match.slice(1, 4).map(Number);

  // Calculate lightened values
  r = Math.round(r + (255 - r) * (percent / 100));
  g = Math.round(g + (255 - g) * (percent / 100));
  b = Math.round(b + (255 - b) * (percent / 100));

  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Compute EAN-13 check digit from first 12 digits.
 * @param {string} first12 - 12-digit string
 * @returns {number}
 */
export function ean13CheckDigit(first12) {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += parseInt(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

/**
 * Generate a 12-digit crypto-random numeric ID.
 * @returns {string} 12-digit numeric string
 */
export function generateEAN13Barcode() {
  const arr = crypto.getRandomValues(new Uint8Array(12));
  const digits = Array.from(arr, b => b % 10);
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += digits[i] * (i % 2 === 0 ? 1 : 3);
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return digits.join('') + String(checkDigit);
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

export function normalizeBarcode(input) {
  if (!input) return null;
  let stripped = input.replace(/\s/g, "");
  if (/\D/.test(stripped)) {
    console.log("[normalizeBarcode] contains non-numeric characters — input: " + input);
    return null;
  }
  let len = stripped.length;
  if (len < 11 || len > 13) {
    console.log("[normalizeBarcode] invalid length (" + len + ") — input: " + input);
    return null;
  }
  if (len === 11) {
    let check = calculateCheckDigit(stripped);
    let upc12 = stripped + check;
    return "0" + upc12;
  }
  if (len === 12) {
    if (!isValidCheckDigit(stripped)) {
      console.log("[normalizeBarcode] invalid check digit — input: " + input);
      return null;
    }
    return "0" + stripped;
  }
  // len === 13
  if (!isValidCheckDigit(stripped)) {
    console.log("[normalizeBarcode] invalid check digit — input: " + input);
    return null;
  }
  return stripped;
}

export function toUPCA(ean13) {
  if (!ean13 || ean13.length !== 13) return ean13;
  return ean13.slice(0, 11) + String(Math.floor(Math.random() * 10));
}

/**
 * Generate a 36-character UUID (32 hex digits + 4 hyphens).
 * @returns {string} UUID string (e.g. "550e8400-e29b-41d4-a716-446655440000")
 */
export function generate36CharUUID() {
  return crypto.randomUUID();
}

/**
 * Decode a Lightspeed barcode into type and original LS ID.
 * LS uses prefix 22 for sales, 25 for workorders.
 * @param {string} barcode - 12-digit barcode string
 * @returns {{ type: 'sale'|'workorder', lsID: string } | null}
 */
export function decodeLightspeedBarcode(barcode) {
  if (!barcode || barcode.length !== 12 || !/^\d{12}$/.test(barcode)) return null;
  let prefix = barcode.slice(0, 2);
  let type = prefix === "22" ? "sale" : prefix === "25" ? "workorder" : null;
  if (!type) return null;
  let lsID = barcode.slice(2, 12).replace(/^0+/, "") || "0";
  return { type, lsID };
}

/**
 * Build a Lightspeed-format 12-digit barcode from a 2-digit prefix and LS ID.
 * @param {string} prefix2digit - "22" for sale, "25" for workorder
 * @param {string|number} lsID - Lightspeed sequential ID
 * @returns {string} 12-digit barcode
 */
export function buildLightspeedEAN13(prefix2digit, lsID) {
  let padded = String(lsID).padStart(10, "0");
  return prefix2digit + padded;
}

/**
 * @param {string} barcode - 13-digit EAN-13 barcode
 * @returns {'workorder'|'sale'|'lightspeed'|'customer'|undefined}
 */
export function getReceiptType(barcode) {
  if (!barcode || barcode.length < 1) return undefined;
  if (barcode.startsWith("1")) return "workorder";
  if (barcode.startsWith("3")) return "sale";
  if (barcode.startsWith("2")) return "lightspeed";
  if (barcode.startsWith("4")) return "customer";
  return undefined;
}

export async function randomWordGenerator() {
  return generate({ minLength: 4, maxLength: 8 });
}

// OBJECT operations /////////////////////////////////////////////////
/**
 * Recursively removes empty, undefined, or null fields from an object
 * - Removes fields with null or undefined values
 * - Removes empty strings
 * - Removes empty arrays
 * - Recursively processes nested objects and arrays
 * - Preserves fields with value 0 or false (as they may be intentional)
 * @param {any} obj - The object to clean
 * @returns {any} - The cleaned object
 */
export function removeEmptyFields(obj) {
  // Handle null, undefined, or empty string
  if (obj === null || obj === undefined || obj === '') {
    return undefined;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    // Recursively clean each item in the array
    const cleaned = obj
      .map(item => removeEmptyFields(item))
      .filter(item => item !== undefined);

    // Return undefined if array is empty after cleaning
    return cleaned.length === 0 ? undefined : cleaned;
  }

  // Handle objects
  if (typeof obj === 'object') {
    const result = {};

    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];

        // Recursively clean the value
        const cleanedValue = removeEmptyFields(value);

        // Only include if not undefined
        if (cleanedValue !== undefined) {
          result[key] = cleanedValue;
        }
      }
    }

    // Return undefined if object is empty after cleaning
    return Object.keys(result).length === 0 ? undefined : result;
  }

  // Return primitive values as-is (including 0 and false)
  return obj;
}

export function removeUnusedFields(obj) {
  if (!isObject(obj)) return obj;
  let newObj = {};
  Object.keys(obj).forEach((key) => {
    if (obj[key]) newObj[key] = obj[key];
  });
  return newObj;
}

export function resetObject(obj) {
  const result = {};
  for (const key in obj) {
    if (Object.hasOwn(obj, key)) {
      const val = obj[key];
      if (typeof val === "string") {
        result[key] = "";
      } else if (typeof val === "number") {
        result[key] = 0;
      } else if (typeof val === "boolean") {
        result[key] = false;
      } else if (Array.isArray(val)) {
        result[key] = [];
      } else if (val && typeof val === "object") {
        result[key] = resetObject(val); // recurse for nested objects
      } else {
        result[key] = null;
      }
    }
  }
  return result;
}
export function removeFieldFromObj(obj, key) {
  if (obj == null) return obj;
  const out = {};
  for (const k in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, k) && k !== key) {
      out[k] = obj[k];
    }
  }
  return out;
}

function isObject(v) {
  return v != null && Object.prototype.toString.call(v) === "[object Object]";
}
// ARRAY operations ///////////////////////////////////////////////////
export function checkArr(arr, obj) {
  return arr.find((o) => o.id === obj.id);
}

export function moveItemInArr(arr, index, direction) {
  const newArr = cloneDeep(arr); // copy so original isn’t mutated

  if (direction === "up" && index > 0) {
    [newArr[index - 1], newArr[index]] = [newArr[index], newArr[index - 1]];
  } else if (direction === "down" && index < arr.length - 1) {
    [newArr[index + 1], newArr[index]] = [newArr[index], newArr[index + 1]];
  }

  return newArr;
}

export function searchArray(
  searchTerms = [],
  arrOfObjToSearch = [],
  keysToSearch = [],
  resKey = "id"
) {
  let resObj = {};
  searchTerms.forEach((searchTerm) => {
    arrOfObjToSearch.forEach((objToSearch) => {
      keysToSearch.forEach((key) => {
        let target = objToSearch[key];
        if (target) {
          let res = target.includes(searchTerm);
          if (res) {
            let key = objToSearch[resKey];
            resObj[key] = objToSearch;
          }
        }
      });
    });
  });
}

export function combine2ArraysOrderByMillis(arr1, arr2) {
  let newArr = [...arr1, ...arr2];
  newArr.sort((a, b) => {
    if (a.millis > b.millis) return 1;
    if (a.millis <= b.millis) return -1;
  });
  return newArr;
}

export function arrayAddObjCheckForDupes(arr, arrKey, obj, objKey) {
  let found = arr.find((o) => o[arrKey] === obj[objKey]);
  if (!found) {
    arr.push(obj);
  }
  return arr;
}

export function getItemFromArr(value, arrKey, arr) {
  return arr.find((obj) => obj[arrKey] === value);
}

export function arrHasItem(arr, item, fieldName = "id") {
  // log("arr", arr);
  // log("item", item);
  if (!arr || item == null) return false;

  // Determine the type of item
  const itemType = typeof item;

  if (itemType === "string" || itemType === "number") {
    // Handle primitive values (string or number)
    return arr.find((arrItem) => arrItem === item) !== undefined;
  }

  if (itemType === "object" && item !== null) {
    // Handle objects - search by the specified field
    return (
      arr.find(
        (arrItem) =>
          typeof arrItem === "object" &&
          arrItem !== null &&
          arrItem[fieldName] === item[fieldName]
      ) !== undefined
    );
  }

  // Fallback for other types
  return false;
}

export function removeArrItem(arr, item, fieldID = "id") {
  return arr.filter((o) => o[fieldID] !== item[fieldID]);
}

// takes an array of objects or strings or numbers. optional input fieldName defaulted to "id"
export function addOrRemoveFromArr(arr, input, fieldName = "id") {
  if (!arr) return [];
  if (input == null) return arr;

  // Handle empty array
  if (arr.length === 0) return [input];

  // Determine the type of input
  const inputType = typeof input;

  if (inputType === "string" || inputType === "number") {
    // Handle primitive values (string or number)
    const found = arr.find((item) => item === input);
    if (found !== undefined) {
      return arr.filter((item) => item !== input);
    }
    return [...arr, input];
  }

  if (inputType === "object" && input !== null) {
    // Handle objects - search by the specified field
    const found = arr.find(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        item[fieldName] === input[fieldName]
    );

    if (found !== undefined) {
      return arr.filter(
        (item) =>
          typeof item !== "object" ||
          item === null ||
          item[fieldName] !== input[fieldName]
      );
    }
    return [...arr, input];
  }

  // Fallback for other types
  return [...arr, input];
}

export function replaceOrAddToArr(arr, input, fieldName = "id") {
  if (!arr) arr = [];
  if (!input) return arr;
  let isObj = isObject(input);
  let copy = cloneDeep(arr);
  if (isObj) {
    let idx = copy.findIndex((o) => o[fieldName] === input[fieldName]);
    if (idx >= 0) {
      copy[idx] = input;
    } else {
      copy.push(input);
    }
  } else {
    // log("arr", copy);
    // log("input", input);
    let idx = copy.findIndex((str) => str === input);
    if (idx < 0) copy.push(input);
    // log("copy", copy);
  }

  return copy;
}

// date & time //////////////////////////////////////////////////////////
export function getDayOfWeekFrom0To7Input(n, startSunday = false) {
  const daysSundayStart = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday", // allow 7 → Sunday
  ];

  const daysMondayStart = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
    "Monday", // allow 7 → Monday
  ];

  if (n < 0 || n > 7) return null;
  return startSunday ? daysSundayStart[n] : daysMondayStart[n];
}

export function formatMillisForDisplay(
  millis,
  includeYear,
  returnAsObject,
  abbreviateYear
) {
  let wordDayOfWeek = getWordDayOfWeek(millis, true);
  let dateObj = new Date(millis);
  let dayOfMonth = dateObj.getDate();
  let wordDayOfMonth = getWordMonth(millis);
  let year = dateObj.getFullYear().toString();

  let str = wordDayOfWeek + ", " + wordDayOfMonth + " " + dayOfMonth;
  if (!includeYear) return str;

  let hour = dateObj.getHours();
  let amPM = "AM";
  if (hour >= 12) amPM = "PM";
  hour = hour % 12 || 12;

  if (returnAsObject) {
    return {
      wordDayOfWeek: wordDayOfWeek,
      dayOfMonth: dayOfMonth,
      wordDayOfMonth: wordDayOfMonth,
      year: abbreviateYear ? year.substring(2, 4) : year,
      minutes: dateObj.getMinutes(),
      hour: hour,
      amPM: amPM,
    };
  }

  str = str + ` '` + year.substring(2, 4);
  return str;
}

export function getPreviousMondayDayJS(date) {
  if (!date) date = dayjs();
  const dayOfWeek = date.day() === 0 ? 7 : date.day();
  return date.subtract(dayOfWeek - 1, "day");
}

export function getWordDayOfWeek(millies, abbreviated) {
  let date = new Date();
  if (millies) date = new Date(millies);
  let numDay = date.getDay();
  switch (numDay) {
    case 0:
      if (abbreviated) return "Sun";
      return "Sunday";
    case 1:
      if (abbreviated) return "Mon";
      return "Monday";
    case 2:
      if (abbreviated) return "Tues";
      return "Tuesday";
    case 3:
      if (abbreviated) return "Weds";
      return "Wednesday";
    case 4:
      if (abbreviated) return "Thurs";
      return "Thursday";
    case 5:
      if (abbreviated) return "Fri";
      return "Friday";
    case 6:
      if (abbreviated) return "Sat";
      return "Saturday";
  }
}

export function getWordMonth(millis) {
  let date = new Date(millis);
  let val = date.toLocaleDateString("en-US", { month: "short" });
  return val;
}

export function convert12to24Hour(time12h) {
  const [time, modifier] = time12h.split(" ");
  let [hours, minutes] = time.split(":");

  if (hours === "12") {
    hours = "00"; // Handle midnight (12 AM)
  }

  if (modifier === "PM") {
    hours = parseInt(hours, 10) + 12; // Add 12 for PM hours (except 12 PM)
  }

  // Ensure hours and minutes are always two digits
  hours = String(hours).padStart(2, "0");
  minutes = String(minutes).padStart(2, "0");

  return `${hours}:${minutes}`;
}

export function formatDateTimeForReceipt(dateObj, millis) {
  let now = dateObj;
  if (!dateObj) {
    now = new Date();
    now.setTime(millis);
  }

  // log("now", now);
  const dateOptions = { year: "numeric", month: "long", day: "numeric" };
  const timeOptions = { hour: "2-digit", minute: "2-digit" };

  let formattedDate = now.toLocaleDateString("en-US", dateOptions);
  let formattedTime = now.toLocaleTimeString("en-US", timeOptions);

  if (formattedTime.startsWith("0")) {
    formattedTime = formattedTime.slice(1, formattedTime.length - 1);
  }

  let endSliced = formattedTime.slice(0, formattedTime.length - 2);
  if (formattedTime.endsWith("P")) {
    endSliced += " pm";
    formattedTime = endSliced;
  } else if (formattedTime.endsWith("A")) {
    endSliced += " am";
    formattedTime = endSliced;
  }

  let dayOfWeek = now.getDay();
  switch (dayOfWeek) {
    case 0:
      dayOfWeek = "Sunday";
      break;
    case 1:
      dayOfWeek = "Monday";
      break;
    case 2:
      dayOfWeek = "Tuesday";
      break;
    case 3:
      dayOfWeek = "Wednesday";
      break;
    case 4:
      dayOfWeek = "Thursday";
      break;
    case 5:
      dayOfWeek = "Friday";
      break;
    case 6:
      dayOfWeek = "Saturday";
  }
  let topTicketDateTimeString = "";
  topTicketDateTimeString += formattedDate;
  topTicketDateTimeString += " --> ";
  topTicketDateTimeString += formattedTime;

  return {
    date: formattedDate,
    time: formattedTime,
    topTicketDateTimeString,
    dayOfWeek,
  };
}

// colors
export function hexToRgb(hex) {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const int = parseInt(h, 16);
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
}

export function rgbToHex(r, g, b) {
  const toHex = (n) => {
    const clamped = Math.max(0, Math.min(255, n)); // ensure in range
    return clamped.toString(16).padStart(2, "0");
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

// Relative luminance (WCAG)
function luminance(r, g, b) {
  const srgb = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

// Contrast ratio
function contrastRatio(l1, l2) {
  const L1 = Math.max(l1, l2);
  const L2 = Math.min(l1, l2);
  return (L1 + 0.05) / (L2 + 0.05);
}

// Main: pick black or white for best contrast
export function bestForegroundHex(bgHex) {
  const { r, g, b } = hexToRgb(bgHex);
  const bgLum = luminance(r, g, b);

  const whiteLum = 1.0;
  const blackLum = 0.0;
  const contrastWithWhite = contrastRatio(bgLum, whiteLum);
  const contrastWithBlack = contrastRatio(bgLum, blackLum);

  return contrastWithWhite >= contrastWithBlack ? C.textWhite : gray(0.85);
}
// utils
export const localStorageWrapper = {
  setItem: (key, item) => {
    localStorage.setItem(key, JSON.stringify(item));
  },
  getItem: (key) => {
    return JSON.parse(localStorage.getItem(key));
  },
  removeItem: (key) => {
    localStorage.removeItem(key);
  },
  clearLocalStorage: () => {
    localStorage.clear();
  },
};

export function lightenRGB(r, g, b, amount) {
  // Ensure amount is within a reasonable range (e.g., 0-100)
  amount = Math.max(0, Math.min(100, amount));

  // Increase each color component, capping at 255
  r = Math.min(255, r + amount);
  g = Math.min(255, g + amount);
  b = Math.min(255, b + amount);

  return { r, g, b };
}

export function showAlert({
  title,
  message,
  subMessage,
  btn1Text,
  btn2Text,
  btn3Text,
  btn1Icon,
  btn2Icon,
  btn3Icon,
  icon1Size,
  icon2Size,
  icon3Size,
  handleBtn1Press = () => { },
  handleBtn2Press,
  handleBtn3Press,
  canExitOnOuterClick,
  alertBoxStyle,
  showAlert = true,
}) {
  useAlertScreenStore.setState({
    title,
    message,
    subMessage,
    btn1Text,
    btn2Text,
    btn3Text,
    btn1Icon,
    btn2Icon,
    btn3Icon,
    icon1Size,
    icon2Size,
    icon3Size,
    handleBtn1Press,
    handleBtn2Press,
    handleBtn3Press,
    canExitOnOuterClick,
    alertBoxStyle,
    showAlert,
  });
}

export function startTimer(
  duration = MILLIS_IN_MINUTE,
  intervalMs = 500,
  onTick,
  onComplete = () => { }
) {
  let remaining = duration;
  const interval = setInterval(() => {
    if (duration !== Infinity) {
      remaining -= intervalMs / 1000; // decrease in seconds
      if (typeof onTick === "function") {
        onTick(remaining);
      }
      if (remaining <= 0) {
        clearInterval(interval);
        if (typeof onComplete === "function") {
          onComplete();
        }
      }
    } else {
      if (typeof onTick === "function") {
        onTick(Infinity);
      }
    }
  }, intervalMs);
  return () => clearInterval(interval); // cancel function
}

export function extractStripeErrorMessage(data, response = null) {
  const type = data?.type;
  const code = data?.code;
  const apiMsg = data?.message;

  switch (type) {
    case "StripeCardError":
      return apiMsg || "Card error during refund.";
    case "StripeInvalidRequestError":
      return apiMsg || "Invalid request to Stripe.";
    case "StripeAPIError":
      return apiMsg || "Stripe API error.";
    case "StripeConnectionError":
      return "Network error communicating with Stripe.";
    case "StripeAuthenticationError":
      return "Authentication with Stripe API failed.";
    case "StripePermissionError":
      return apiMsg || "Permission denied by Stripe.";
    case "StripeRateLimitError":
      return "Rate limit exceeded. Please try again later.";
    default:
      if (apiMsg) return apiMsg;
      if (response) {
        return (
          `HTTP ${response.status} ${response.statusText}` ||
          "Refund request failed."
        );
      }
      return `Unexpected error${code ? ` (${code})` : ""}.`;
  }
}

export function createNewWorkorder({
  customerID,
  customerFirst,
  customerLast,
  customerCell,
  customerLandline,
  customerEmail,
  customerContactRestriction,
  customerLanguage,
  startedByFirst,
  startedByLast,
  status,
}) {
  let wo = cloneDeep(WORKORDER_PROTO);
  wo.id = generateEAN13Barcode();
  wo.workorderNumber = generateWorkorderNumber(wo.id);
  wo.status = status || SETTINGS_OBJ.statuses[0]?.id || "";
  wo.customerFirst = customerFirst || "";
  wo.customerLast = customerLast || "";
  wo.customerCell = customerCell || "";
  wo.customerLandline = customerLandline || "";
  wo.customerEmail = customerEmail || "";
  wo.customerContactRestriction = customerContactRestriction || "";
  wo.customerLanguage = customerLanguage || "";
  wo.customerID = customerID || "";
  wo.startedBy = (startedByFirst || "") + " " + (startedByLast || "");
  wo.changeLog.push("Started by: " + (startedByFirst || "") + " " + (startedByLast || ""));
  wo.startedOnMillis = new Date().getTime();
  wo.customerPin = String(Math.floor(100 + Math.random() * 900));
  return wo;
}

export function resolveStatus(statusId, statuses) {
  if (!statusId || !statuses?.length)
    return { id: "", label: "", textColor: "black", backgroundColor: "whitesmoke" };
  return statuses.find(s => s.id === statusId)
    || { id: statusId, label: "Unknown", textColor: "black", backgroundColor: "gray" };
}

export function findTemplateByType(templates, type) {
  if (!templates || !type) return null;
  return templates.find((t) => t.type === type) || null;
}

/// RECEIPT PRINTING — delegated to shared module (src/shared/printBuilder.js) ///
// Re-export calculateWaitEstimateLabel so existing imports keep working
export const calculateWaitEstimateLabel = _shared.calculateWaitEstimateLabel;

export const printBuilder = {
  ..._shared.printBuilder,
  test: () => ({
    ...RECEIPT_PROTO,
    id: crypto.randomUUID(),
    receiptType: RECEIPT_TYPES.test,
  }),
};

// ============================================================================
// EMAIL TEMPLATE UTILITIES
// ============================================================================

export function resolveEmailTemplate(templateStr, data) {
  if (!templateStr || !data) return templateStr || "";
  let result = templateStr;
  Object.keys(data).forEach((key) => {
    let regex = new RegExp("\\{" + key + "\\}", "g");
    result = result.replace(regex, data[key] != null ? data[key] : "");
  });
  return result;
}

export function formatStoreHours(storeHours) {
  if (!storeHours?.standard || storeHours.standard.length === 0) return "";
  let days = storeHours.standard;
  let shortNames = { Monday: "Mon", Tuesday: "Tues", Wednesday: "Wed", Thursday: "Thurs", Friday: "Fri", Saturday: "Sat", Sunday: "Sun" };
  let groups = [];
  let currentGroup = null;
  for (let i = 0; i < days.length; i++) {
    let day = days[i];
    let key = day.isOpen ? day.open + "-" + day.close : "closed";
    if (currentGroup && currentGroup.key === key) {
      currentGroup.end = day.name;
    } else {
      currentGroup = { key, start: day.name, end: day.name, isOpen: day.isOpen, open: day.open, close: day.close };
      groups.push(currentGroup);
    }
  }
  return groups.map((g) => {
    let label = g.start === g.end ? shortNames[g.start] || g.start : (shortNames[g.start] || g.start) + "-" + (shortNames[g.end] || g.end);
    return g.isOpen ? label + " " + g.open + " - " + g.close : "Closed " + label;
  }).join(", ");
}

export function buildPayrollEmailData(punches, userObj, payPeriodLabel) {
  if (!punches || !punches.length) {
    return {
      employeeName: (userObj?.first || "") + " " + (userObj?.last || ""),
      payPeriod: payPeriodLabel || "",
      dailyBreakdown: "No punches found for this period.",
      totalHours: "0:00",
      payRate: "$0.00",
      totalPay: "$0.00",
    };
  }

  // Group punches by date
  let dayMap = {};
  punches.forEach((p) => {
    let dateStr = new Date(p.millis).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    if (!dayMap[dateStr]) dayMap[dateStr] = [];
    dayMap[dateStr].push(p);
  });

  let totalMinutes = 0;
  let rows = [];

  Object.keys(dayMap).forEach((dateStr) => {
    let dayPunches = dayMap[dateStr].sort((a, b) => a.millis - b.millis);

    // Pair in/out punches (same logic as UserClockHistoryModalScreen)
    let pairs = [];
    let resObj = {};
    let lastWasIn = false;
    let counter = 0;

    dayPunches.forEach((obj) => {
      if (counter === 0 && obj.option === "out") {
        resObj.out = obj;
        pairs.push(resObj);
        resObj = {};
        lastWasIn = false;
        counter++;
        return;
      }
      if (counter === dayPunches.length - 1 && obj.option === "in") {
        resObj.in = obj;
        pairs.push(resObj);
        lastWasIn = true;
        counter++;
        return;
      }
      if (obj.option === "in" && lastWasIn) {
        resObj.in = obj;
        pairs.push(resObj);
        counter++;
        return;
      }
      if (obj.option === "in") {
        lastWasIn = true;
        resObj.in = obj;
      } else if (obj.option === "out") {
        lastWasIn = false;
        resObj.out = obj;
        pairs.push(resObj);
        resObj = {};
      }
      counter++;
    });

    // Build punch strings and compute hours
    let punchStrs = [];
    let dayMinutes = 0;
    pairs.forEach((pair) => {
      let inTime = pair.in ? new Date(pair.in.millis).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "?";
      let outTime = pair.out ? new Date(pair.out.millis).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "?";
      punchStrs.push(inTime + " - " + outTime);
      if (pair.in && pair.out) {
        dayMinutes += Math.floor((pair.out.millis - pair.in.millis) / 60000);
      }
    });

    totalMinutes += dayMinutes;
    let hrs = Math.floor(dayMinutes / 60);
    let mins = dayMinutes % 60;
    rows.push({ date: dateStr, punches: punchStrs.join(", "), hours: hrs + ":" + (mins < 10 ? "0" : "") + mins });
  });

  // Build HTML table
  let tableHtml = "<table style='border-collapse:collapse;width:100%;font-family:sans-serif;'>";
  tableHtml += "<tr style='background:#f0f0f0;'><th style='padding:8px;border:1px solid #ddd;text-align:left;'>Date</th><th style='padding:8px;border:1px solid #ddd;text-align:left;'>Punches</th><th style='padding:8px;border:1px solid #ddd;text-align:right;'>Hours</th></tr>";
  rows.forEach((r) => {
    tableHtml += "<tr><td style='padding:8px;border:1px solid #ddd;'>" + r.date + "</td><td style='padding:8px;border:1px solid #ddd;'>" + r.punches + "</td><td style='padding:8px;border:1px solid #ddd;text-align:right;'>" + r.hours + "</td></tr>";
  });
  tableHtml += "</table>";

  let totalHrs = Math.floor(totalMinutes / 60);
  let totalMins = totalMinutes % 60;
  let totalHoursStr = totalHrs + ":" + (totalMins < 10 ? "0" : "") + totalMins;
  let wage = Number(userObj?.hourlyWage) || 0;
  let totalPayNum = trimToTwoDecimals((totalMinutes / 60) * wage);

  return {
    employeeName: (userObj?.first || "") + " " + (userObj?.last || ""),
    payPeriod: payPeriodLabel || "",
    dailyBreakdown: tableHtml,
    totalHours: totalHoursStr,
    payRate: "$" + wage.toFixed(2),
    totalPay: "$" + totalPayNum.toFixed(2),
  };
}

export function compressImage(file, maxDimension = 400, quality = 0.7) {
  return new Promise((resolve) => {
    if (!file.type.startsWith("image")) return resolve(null);
    if (file.size < 100000) return resolve(null);
    let img = new window.Image();
    img.onload = () => {
      let { width, height } = img;
      if (width <= maxDimension && height <= maxDimension) {
        URL.revokeObjectURL(img.src);
        return resolve(null);
      }
      let ratio = Math.min(maxDimension / width, maxDimension / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
      let canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(img.src);
          resolve(blob);
        },
        "image/jpeg",
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      resolve(null);
    };
    img.src = URL.createObjectURL(file);
  });
}

// ==================== EMAIL TEMPLATE ====================

export function populateEmailTemplate(templateStr, data) {
  if (!templateStr || typeof templateStr !== "string") return "";
  return templateStr.replace(/\{(\w+)\}/g, (match, key) => {
    return data[key] !== undefined && data[key] !== null ? String(data[key]) : match;
  });
}

// ==================== STATUS AUTO-TEXT ====================

export function resolveTemplateStandalone(templateStr, workorder, customer, settings) {
  if (!templateStr) return "";
  let totalAmount = "";
  try {
    let totals = calculateRunningTotals(workorder, settings?.salesTaxPercent, [], false, !!workorder?.taxFree);
    totalAmount = "$" + (totals.finalTotal / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch (e) {
    totalAmount = "$0.00";
  }
  let lineItems = "";
  try {
    lineItems = (workorder?.workorderLines || [])
      .map((line) => {
        let name = line.inventoryItem?.informalName || line.inventoryItem?.formalName || "";
        return line.qty + "x " + name;
      })
      .join(", ");
  } catch (e) {}
  let storeHoursText = "";
  try {
    storeHoursText = formatStoreHours(settings?.storeHours);
  } catch (e) {}
  let firstName = customer?.first || workorder?.customerFirst || "";
  let lastName = customer?.last || workorder?.customerLast || "";
  let storeName = settings?.storeInfo?.displayName || settings?.storeInfo?.name || "";
  let storePhone = settings?.storeInfo?.phone || "";
  let formattedPhone = storePhone.length === 10
    ? "(" + storePhone.slice(0, 3) + ") " + storePhone.slice(3, 6) + "-" + storePhone.slice(6)
    : storePhone;
  return templateStr
    .replace(/\{firstName\}/g, capitalizeFirstLetterOfString(firstName) || "")
    .replace(/\{lastName\}/g, capitalizeFirstLetterOfString(lastName) || "")
    .replace(/\{brand\}/g, workorder?.brand || "")
    .replace(/\{description\}/g, workorder?.description || "")
    .replace(/\{totalAmount\}/g, totalAmount)
    .replace(/\{total\}/g, totalAmount)
    .replace(/\{lineItems\}/g, lineItems)
    .replace(/\{partOrdered\}/g, workorder?.partOrdered || "")
    .replace(/\{partSource\}/g, workorder?.partSource || "")
    .replace(/\{storeHours\}/g, storeHoursText)
    .replace(/\{storePhone\}/g, formattedPhone)
    .replace(/\{storeName\}/g, storeName)
    .replace(/\{storeAddress\}/g, settings?.storeInfo?.address || "")
    .replace(/\{customerNotes\}/g, (workorder?.customerNotes || []).map(n => n.value || n.text || n.note || "").filter(Boolean).join("\n") || "");
}

const PENDING_AUTO_TEXT_KEY = "warpspeed_pending_auto_texts";

function persistPendingAutoText(msg) {
  try {
    let arr = JSON.parse(localStorage.getItem(PENDING_AUTO_TEXT_KEY) || "[]");
    arr.push(msg);
    localStorage.setItem(PENDING_AUTO_TEXT_KEY, JSON.stringify(arr));
  } catch (e) {
    console.log("Error persisting pending auto-text:", e);
  }
}

function removePendingAutoText(id) {
  try {
    let arr = JSON.parse(localStorage.getItem(PENDING_AUTO_TEXT_KEY) || "[]");
    arr = arr.filter((m) => m.id !== id);
    localStorage.setItem(PENDING_AUTO_TEXT_KEY, JSON.stringify(arr));
  } catch (e) {
    console.log("Error removing pending auto-text:", e);
  }
}

async function executeAutoText(msg) {
  try {
    if (msg.smsMessage && msg.customerCell) {
      await dbSendSMS({
        message: msg.smsMessage,
        phoneNumber: msg.customerCell,
        customerID: msg.customerID || "",
        id: crypto.randomUUID(),
      });
    }
    if (msg.emailSubject && msg.emailBody && msg.customerEmail) {
      await dbSendEmail(msg.customerEmail, msg.emailSubject, msg.emailBody);
    }
  } catch (e) {
    console.log("Error executing auto-text:", e);
  }
}

export function scheduleAutoText(rule, workorder, settings) {
  let cell = workorder?.customerCell || "";
  let email = workorder?.customerEmail || "";
  if (!cell && !email) return;
  if (!rule.smsTemplateID && !rule.emailTemplateID) return;

  let smsMessage = "";
  if (rule.smsTemplateID && cell) {
    let tpl = (settings?.smsTemplates || []).find((t) => t.id === rule.smsTemplateID);
    if (tpl) smsMessage = resolveTemplateStandalone(tpl.content, workorder, null, settings);
  }
  let emailSubject = "";
  let emailBody = "";
  if (rule.emailTemplateID && email) {
    let tpl = (settings?.emailTemplates || []).find((t) => t.id === rule.emailTemplateID);
    if (tpl) {
      emailSubject = resolveTemplateStandalone(tpl.subject || "", workorder, null, settings);
      emailBody = resolveTemplateStandalone(tpl.content || "", workorder, null, settings);
    }
  }

  if (!smsMessage && !emailSubject) return;

  let delayMs = ((rule.delayMinutes || 0) * 60 + (rule.delaySeconds || 0)) * 1000;
  let sendAtMillis = Date.now() + delayMs;
  let pendingMsg = {
    id: crypto.randomUUID(),
    workorderID: workorder?.id || "",
    customerCell: cell,
    customerEmail: email,
    customerID: workorder?.customerID || "",
    smsMessage,
    emailSubject,
    emailBody,
    sendAtMillis,
    createdAtMillis: Date.now(),
  };

  if (delayMs <= 0) {
    executeAutoText(pendingMsg);
  } else {
    persistPendingAutoText(pendingMsg);
    setTimeout(() => {
      executeAutoText(pendingMsg);
      removePendingAutoText(pendingMsg.id);
    }, delayMs);
  }
}

export function recoverPendingAutoTexts() {
  try {
    let arr = JSON.parse(localStorage.getItem(PENDING_AUTO_TEXT_KEY) || "[]");
    if (!arr.length) return;
    let now = Date.now();
    arr.forEach((msg) => {
      let remaining = msg.sendAtMillis - now;
      if (remaining <= 0) {
        executeAutoText(msg);
        removePendingAutoText(msg.id);
      } else {
        setTimeout(() => {
          executeAutoText(msg);
          removePendingAutoText(msg.id);
        }, remaining);
      }
    });
  } catch (e) {
    console.log("Error recovering pending auto-texts:", e);
  }
}

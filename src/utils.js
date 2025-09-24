/* eslint-disable */
import { useEffect, useInsertionEffect, useRef } from "react";
import { getNewCollectionRef, setInventoryItem } from "./db";
import { CUSTOMER_PROTO, INVENTORY_ITEM_PROTO } from "./data";
import { generate } from "random-words";
import { cloneDeep } from "lodash";
import dayjs from "dayjs";
import { C } from "./styles";
import { useAlertScreenStore } from "./stores";
import { DISCOUNT_TYPES, MILLIS_IN_MINUTE } from "./constants";

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
      if (Number(newDiscountObj.newPrice) > 0) {
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
  workorderArr,
  salesTaxRatePercent,
  workorderlinesArr = [],
  isRefund
) {
  let runningTotal = 0;
  let runningDiscount = 0;
  let runningSubtotal = 0;
  let runningQty = 0;
  // clog("input", input);

  // log(workorderlinesArr);

  if (!Array.isArray(workorderArr)) workorderArr = [workorderArr];
  workorderArr.forEach((workorderObj) => {
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
      let discountPrice = line.discountObj.newPrice;
      let discountSavings = line.discountObj.savings;
      runningSubtotal =
        runningSubtotal + Number(line.inventoryItem.price) * qty;
      if (discountPrice) {
        runningTotal = runningTotal + Number(discountPrice);
        runningDiscount = runningDiscount + Number(discountSavings);
      } else {
        runningTotal = runningTotal + line.inventoryItem.price * qty;
      }
      runningQty += qty;
    });
  });

  let obj = {
    runningTotal: runningTotal,
    runningSubtotal: runningSubtotal,
    runningDiscount: runningDiscount,
    runningTax: (runningTotal * salesTaxRatePercent) / 100,
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
  // log("total", totalAmount * zSettingsObj.salesTax);
  let tax = Number(totalAmount) * Number(settingsObj.salesTax);
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

export function fuzzySearch(searchTerms, items) {
  // --- Helpers ---
  function normalize(str) {
    return str ? str.toString().toLowerCase().trim() : "";
  }

  // Levenshtein distance similarity
  function levenshteinSim(a, b) {
    const m = [];
    for (let i = 0; i <= b.length; i++) m[i] = [i];
    for (let j = 0; j <= a.length; j++) m[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          m[i][j] = m[i - 1][j - 1];
        } else {
          m[i][j] = Math.min(
            m[i - 1][j - 1] + 1,
            m[i][j - 1] + 1,
            m[i - 1][j] + 1
          );
        }
      }
    }
    const distance = m[b.length][a.length];
    const maxLen = Math.max(a.length, b.length);
    return maxLen ? 1 - distance / maxLen : 1;
  }

  // Jaro–Winkler similarity
  function jaroWinklerSim(s1, s2) {
    s1 = normalize(s1);
    s2 = normalize(s2);
    const m = getMatchingCharacters(s1, s2);
    if (!m.matches) return 0;
    let t = 0;
    for (let i = 0; i < m.matches; i++) {
      if (m.s1Matches[i] !== m.s2Matches[i]) t++;
    }
    t = t / 2;
    const jaro =
      (m.matches / s1.length +
        m.matches / s2.length +
        (m.matches - t) / m.matches) /
      3;
    // Winkler adjustment
    let prefix = 0;
    for (let i = 0; i < Math.min(4, s1.length, s2.length); i++) {
      if (s1[i] === s2[i]) prefix++;
      else break;
    }
    return jaro + prefix * 0.1 * (1 - jaro);
  }

  function getMatchingCharacters(s1, s2) {
    const matchWindow = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
    const s1Matches = [];
    const s2Matches = [];
    const s1Flags = Array(s1.length).fill(false);
    const s2Flags = Array(s2.length).fill(false);

    let matches = 0;
    for (let i = 0; i < s1.length; i++) {
      const start = Math.max(0, i - matchWindow);
      const end = Math.min(i + matchWindow + 1, s2.length);
      for (let j = start; j < end; j++) {
        if (!s2Flags[j] && s1[i] === s2[j]) {
          s1Flags[i] = true;
          s2Flags[j] = true;
          s1Matches.push(s1[i]);
          s2Matches.push(s2[j]);
          matches++;
          break;
        }
      }
    }
    return { matches, s1Matches, s2Matches };
  }

  // Dice coefficient (bigram similarity)
  function diceCoefficient(a, b) {
    a = normalize(a);
    b = normalize(b);
    if (!a.length || !b.length) return 0;
    if (a === b) return 1;
    const bigrams = (str) => {
      const res = [];
      for (let i = 0; i < str.length - 1; i++) {
        res.push(str.slice(i, i + 2));
      }
      return res;
    };
    const aBigrams = bigrams(a);
    const bBigrams = bigrams(b);
    const aMap = {};
    aBigrams.forEach((bg) => (aMap[bg] = (aMap[bg] || 0) + 1));
    let intersection = 0;
    bBigrams.forEach((bg) => {
      if (aMap[bg]) {
        intersection++;
        aMap[bg]--;
      }
    });
    return (2.0 * intersection) / (aBigrams.length + bBigrams.length);
  }

  // Combined match score
  function matchScore(term, field) {
    const t = normalize(term);
    const f = normalize(field);
    if (!t || !f) return 0;

    // Direct equality or includes
    if (t === f) return 1;
    if (f.includes(t)) return 0.9;

    // Combine three algorithms
    const lev = levenshteinSim(t, f);
    const jw = jaroWinklerSim(t, f);
    const dice = diceCoefficient(t, f);
    return (lev + jw + dice) / 3; // average score
  }

  // Score an item
  function itemScore(item) {
    let totalScore = 0;
    for (let term of searchTerms) {
      const fields = [item.formalName, item["informal name"], item.brand];
      let bestFieldScore = 0;
      for (let field of fields) {
        const score = matchScore(term, field);
        if (score > bestFieldScore) bestFieldScore = score;
      }
      totalScore += bestFieldScore; // accumulate for each term
    }
    // Normalize by number of terms
    return totalScore / searchTerms.length;
  }

  // Compute and sort
  const scoredItems = items.map((item) => ({
    item,
    score: itemScore(item),
  }));
  const filtered = scoredItems.filter((s) => s.score > 0.25); // threshold
  filtered.sort((a, b) => b.score - a.score);

  return filtered.map((s) => ({
    ...s.item,
    _score: s.score,
  }));
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

// numbers /////////////////////////////////////////////////////////
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

  const display = `${neg ? "-" : ""}${
    withDollar ? "$" : ""
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

export function removeDashesFromPhone(num = "") {
  let split = num.split("-");
  let newVal = "";
  split.forEach((s) => (newVal += s));
  return newVal;
}

export function addDashesToPhone(num) {
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
    if (customerObj.cell.startsWith(searchTerm))
      resObj[customerObj.id] = customerObj;
    if (customerObj.landline.startsWith(searchTerm))
      resObj[customerObj.id] = customerObj;

    if (searchTerm.length === 4) {
      if (customerObj.cell.endsWith(searchTerm))
        resObj[customerObj.id] = customerObj;
      if (customerObj.landline.endsWith(searchTerm))
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
  return sentence.replace(/\b\w/g, function (char) {
    return char.toUpperCase();
  });
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
  workorderLineObj = cloneDeep(workorderLineObj);
  let discountObj = workorderLineObj.discountObj;
  if (!discountObj.value) return workorderLineObj;

  let newPrice;
  let savings;

  if (discountObj.type === DISCOUNT_TYPES.percent) {
    let multiplier = discountObj.value;
    multiplier = 1 - Number("." + multiplier);
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
    newPrice: roundToTwoDecimals(newPrice),
    savings: roundToTwoDecimals(savings),
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

export function generateRandomID(collectionPath) {
  let ref = getNewCollectionRef(collectionPath || "CUSTOMERS");
  return ref.id;
}

/**
 * Create a barcode record for a specific type.
 * @param {'workorder'|'sale'|'customer'} barcodeType - The barcode category.
 * @returns {string}
 */
export function generateUPCBarcode(barcodeType) {
  // Get current millis since epoch
  let begins = "0";
  switch (barcodeType) {
    case "workorder":
      begins = "1";
      break;
    case "sale":
      begins = "2";
      break;
    case "customer":
      begins = "3";
  }
  const millis = Date.now().toString();
  const timePart = millis.slice(-8);
  const randomPart = Math.floor(1000 + Math.random() * 9000).toString();
  let upc = timePart + randomPart;
  upc = upc.replace(/^./, begins);
  return upc;
}

/**
 * @param {string} upcBarcode
 * @returns {'workorder'|'sale'|'customer'}
 */
export function getReceiptType(upcBarcode) {
  switch (upcBarcode) {
    case upcBarcode.beginsWith("1"):
      return "workorder";
    case upcBarcode.beginsWith("2"):
      return "sale";
    case upcBarcode.beginsWith("3"):
      return "customer";
  }
}

export async function randomWordGenerator() {
  return generate({ minLength: 4, maxLength: 8 });
}


// OBJECT operations /////////////////////////////////////////////////
export function removeUnusedFields(obj) {
  if (!isObject(obj)) return obj;

  let usedFields = [];
  let keys = Object.keys(obj);
  keys.forEach((key) => {
    if (obj[key]) usedFields.push(key);
  });
  // log("sed", usedFields);
  let newObj = {};
  usedFields.forEach((field) => (newObj[field] = obj[field]));
  log(newObj);
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

export function arrHasItem(arr, item) {
  // log("arr", arr);
  // log("item", item);
  if (!arr || !item) return false;
  return arr.find((o) => o.id === item.id);
}

export function removeArrItem(arr, item, fieldID = "id") {
  return arr.filter((o) => o[fieldID] !== item[fieldID]);
}

export function addOrRemoveFromArr(arr, input, fieldName = "id") {
  if (!arr) arr = [];
  if (!input) return arr;
  let found = arr.find((o) => o[fieldName] === input[fieldName]);
  // log("found", found);
  if (found) return arr.filter((o) => o[fieldName] !== input[fieldName]);
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
  handleBtn1Press = () => {},
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
  onComplete = () => {}
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
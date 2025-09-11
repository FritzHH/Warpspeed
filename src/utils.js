/* eslint-disable */
import { useEffect, useInsertionEffect, useRef } from "react";
import { getNewCollectionRef, setInventoryItem } from "./db";
import { CUSTOMER_PROTO, INVENTORY_ITEM_PROTO } from "./data";
import { generate } from "random-words";
import { cloneDeep } from "lodash";
import dayjs from "dayjs";
import { C } from "./styles";
import { useAlertScreenStore } from "./stores";
import { DISCOUNT_TYPES } from "./constants";

// const fs = require("node:fs");
export const dim = {
  windowWidth: window.innerWidth,
  windowHeight: window.innerHeight,
};

export const LETTERS = "qwertyuioplkjhgfdsazxcvbnm-";
export const NUMS = "1234567890-";

export function log(one, two) {
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

export function clog(one, two) {
  console.log(one);
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

export function calculateRunningTotals(input, salesTaxRatePercent) {
  let runningTotal = 0;
  let runningDiscount = 0;
  let runningSubtotal = 0;
  let runningQty = 0;
  clog("input", input);
  if (!Array.isArray(input)) input = [input];

  input.forEach((workorderObj) => {
    workorderObj.workorderLines?.forEach((line, idx) => {
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
    runningTotal: roundToTwoDecimals(runningTotal),
    runningSubtotal: roundToTwoDecimals(runningSubtotal),
    runningDiscount: roundToTwoDecimals(runningDiscount),
    runningTax: roundToTwoDecimals((runningTotal * salesTaxRatePercent) / 100),
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
    totalAmount: trimToTwoDecimals(total),
    tax: trimToTwoDecimals(tax),
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

// array ops
export function moveItemInArr(arr, index, direction) {
  const newArr = cloneDeep(arr); // copy so original isn’t mutated

  if (direction === "up" && index > 0) {
    [newArr[index - 1], newArr[index]] = [newArr[index], newArr[index - 1]];
  } else if (direction === "down" && index < arr.length - 1) {
    [newArr[index + 1], newArr[index]] = [newArr[index], newArr[index + 1]];
  }

  return newArr;
}

// numbers
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

export function formatNumberForCurrencyDisplay(input, dollarSign = false) {
  // log(input);
  const num = parseFloat(input);
  if (isNaN(num)) return "";

  let obj = num.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (dollarSign) {
    return obj;
  } else {
    return obj.toString().slice(1);
  }
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

export function roundToTwoDecimals(num) {
  return parseFloat(num.toFixed(2));
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

export function removeDashesFromPhone(num = "") {
  let split = num.split("-");
  let newVal = "";
  split.forEach((s) => (newVal += s));
  return newVal;
}

export function addDashesToPhone(num) {
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

export function makeGrey(opacity) {
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
  const match = rgb.match(/^rgb\s*\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\)$/i);
  if (!match) throw new Error("Invalid RGB format");
  let [r, g, b] = match.slice(1, 4).map(Number);

  // Calculate lightened values
  r = Math.round(r + (255 - r) * (percent / 100));
  g = Math.round(g + (255 - g) * (percent / 100));
  b = Math.round(b + (255 - b) * (percent / 100));

  return `rgb(${r}, ${g}, ${b})`;
}

export function getItemFromArr(value, arrKey, arr) {
  return arr.find((obj) => obj[arrKey] === value);
}

export function generateRandomID(collectionPath) {
  let ref = getNewCollectionRef(collectionPath || "CUSTOMERS");
  return ref.id;
}

export function generateUPCBarcode() {
  // Get current millis since epoch
  const millis = Date.now().toString();

  // Take the last 8 digits of millis
  const timePart = millis.slice(-8);

  // Add a 4-digit random number
  const randomPart = Math.floor(1000 + Math.random() * 9000).toString();

  // Combine → 12 digits
  const upc = timePart + randomPart;

  return upc;
}

export async function randomWordGenerator() {
  return generate({ minLength: 4, maxLength: 8 });
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

export function arrayAddObjCheckForDupes(arr, arrKey, obj, objKey) {
  let found = arr.find((o) => o[arrKey] === obj[objKey]);
  if (!found) {
    arr.push(obj);
  }
  return arr;
}

export function checkArr(arr, obj) {
  return arr.find((o) => o.id === obj.id);
}

export function combine2ArraysOrderByMillis(arr1, arr2) {
  let newArr = [...arr1, ...arr2];
  newArr.sort((a, b) => {
    if (a.millis > b.millis) return 1;
    if (a.millis <= b.millis) return -1;
  });
  return newArr;
}

// date & time
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

export function convertMillisToHoursMins(millis) {
  const totalMinutes = Math.floor(millis / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const formattedHoursMin = hours + ":" + minutes;
  return { hours, minutes, totalMinutes, formattedHoursMin };
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

  return contrastWithWhite >= contrastWithBlack ? C.textWhite : makeGrey(0.85);
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

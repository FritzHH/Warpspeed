/* eslint-disable */
import { useEffect, useInsertionEffect, useRef } from "react";
import { getNewCollectionRef, setInventoryItem } from "./db";
import { CUSTOMER_PROTO, INVENTORY_ITEM_PROTO } from "./data";
import { generate } from "random-words";
import { cloneDeep } from "lodash";

// const fs = require("node:fs");
export const dim = {
  windowWidth: window.innerWidth,
  windowHeight: window.innerHeight,
};

export const LETTERS = "qwertyuioplkjhgfdsazxcvbnm-";
export const NUMS = "1234567890-";

export function log(one, two) {
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

export function calculateRunningTotals(workorderObj, inventoryArr) {
  let runningTotal = 0;
  let runningDiscount = 0;
  let runningQty = 0;
  let runningTax = 0;
  // log("inv", workorderObj);
  // log("items", workorderObj.workorderLines);
  workorderObj.workorderLines.forEach((line, idx) => {
    // log("line", inventoryArr.length);
    let invItem = inventoryArr?.find((o) => o.id == line.invItemID);
    if (!invItem) return;
    let qty = line.qty;
    let discountObj = line.discountObj;
    // log("discount obj", discountObj);
    let discountPrice = line.discountObj.newPrice;
    let price = invItem.price;
    let discountSavings = line.discountObj.savings;
    // log("price", price);
    if (discountPrice) {
      runningTotal = runningTotal + Number(discountPrice);
      runningDiscount = runningDiscount + Number(discountSavings);
    } else {
      runningTotal = runningTotal + Number(price) * qty;
    }
    runningQty += qty;
  });
  // log(workorderObj);
  // log("total", trimToTwoDecimals(runningDiscount));
  let obj = {
    runningTotal: trimToTwoDecimals(runningTotal),
    runningDiscount: trimToTwoDecimals(runningDiscount),
    runningQty,
  };
  // clog(obj);
  return obj;
}

export function formatDateTime(dateObj, millis) {
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

export function trimToTwoDecimals(num) {
  // log("incoming num to trim to 2 decimals", num);

  let strNum = num.toString();
  let res;
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

// takes text input and inserts the decimal at the correct place as the user types numbers for correct currency display without having to press the decimal button
export function formatDecimal(value) {
  // log("incoming", val);
  // Remove all non-digit characters
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

export function applyDiscountToWorkorderItem(
  discountObj,
  workorderLineObj,
  inventoryObj
) {
  let newPrice;
  let savings;

  if (discountObj.type === "Percent") {
    let multiplier = discountObj.value;
    multiplier = 1 - Number("." + multiplier);
    newPrice = inventoryObj.price * workorderLineObj.qty * multiplier;
    savings = inventoryObj.price * workorderLineObj.qty - newPrice;
    // log("newprice", trimToTwoDecimals(newPrice));
    // log("savings", savings);
  } else {
    newPrice =
      inventoryObj.price * workorderLineObj.qty -
      workorderLineObj.qty * discountObj.value;
    savings = inventoryObj.price * workorderLineObj.qty - newPrice;
  }
  // log("newprice", newPrice);
  return {
    type: discountObj.type,
    value: discountObj.value,
    newPrice: trimToTwoDecimals(newPrice),
    savings: trimToTwoDecimals(savings),
    name: discountObj.name,
  };
}

export function getItemFromArr(value, arrKey, arr) {
  return arr.find((obj) => obj[arrKey] === value);
}

export function generateRandomID(collectionPath) {
  let ref = getNewCollectionRef(collectionPath || "CUSTOMERS");
  return ref.id;
}

export function generateBarcode() {
  let num = Math.random().toString();
  num = num.split(".")[1];
  num = num.slice(0, 8);
  let barcode = "0000" + num;
  return barcode;
  // log(barcode.length, barcode);
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

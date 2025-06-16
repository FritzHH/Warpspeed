/* eslint-disable */
import { useEffect, useInsertionEffect, useRef } from "react";
import { getNewCollectionRef } from "./db";
import { CUSTOMER_PROTO } from "./data";
import { generate } from "random-words";

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
  // num = "4";
  // log("trimming", num);
  let strNum = num.toString();
  let split = strNum.split(".");

  // log("split", split);
  if (split.length == 1 || split[0] == "") {
    if (split.length == 1) {
      // no trailing numbers
      strNum = strNum + ".00";
    } else {
      // no leading numbers
      // log(split);
      if (split[1].length == 1) {
        strNum = "0." + split[1] + "0";
      } else {
        strNum = "0." + split[1];
      }
    }
  }

  let split1 = strNum.split(".")[1];
  split1 = split1 + "233434";
  if (split1.length > 2) {
    let newval = split1[0] + split1[1];
    strNum = split[0] + "." + newval;
  }

  // log(strNum);
  return strNum;

  let val = Math.floor(num * 100) / 100;
  let valString = val.toString();
  // log("fresh val", valString);

  let hasDecimal = valString.includes(".");
  if (!hasDecimal) {
    valString = valString + ".00";
  } else {
    let position = valString[valString.length - 3];
    if (position != ".") {
      let arr = valString.split(".");
      valString = arr[0];
      valString = valString += ".00";
    }
  }
  // log("valstrin finished", valString);
  return valString;
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

export const dim = {
  windowWidth: window.innerWidth,
  windowHeight: window.innerHeight,
};

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

// export function jclone(item = {}) {
//   return structuredClone(item);
// }

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

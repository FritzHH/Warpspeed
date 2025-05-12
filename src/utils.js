import { useEffect, useInsertionEffect, useRef } from "react";
import { getNewCollectionRef } from "./dbCalls";
import { COLLECTION_NAMES, CUSTOMER_PROTO } from "./data";

export function log(one, two) {
  let str = "";
  if (one) {
    str += one;
  }
  if (two) {
    str += "  :  ";
    str += two;
  } else {
    // str = "log: " + str;
  }
  console.log(one, two);
}

export function fetchIt(url) {
  // log("fetching this url", url);
  return fetch(url).then((res) => {
    // log("fetch url result", res);
    return res.json().then((json) => json);
  });
}

export function trimToTwoDecimals(num) {
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
    if (customerObj.phone.cell.startsWith(searchTerm))
      resObj[customerObj.id] = customerObj;
    if (customerObj.phone.landline.startsWith(searchTerm))
      resObj[customerObj.id] = customerObj;

    if (searchTerm.length === 4) {
      if (customerObj.phone.cell.endsWith(searchTerm))
        resObj[customerObj.id] = customerObj;
      if (customerObj.phone.landline.endsWith(searchTerm))
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

  // Set up the interval.
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

  if (discountObj.type === "percent") {
    let multiplier = discountObj.value;
    multiplier = 1 - Number("." + multiplier);
    newPrice = inventoryObj.price * workorderLineObj.qty * multiplier;
    savings = inventoryObj.price * workorderLineObj.qty - newPrice;
  } else {
    newPrice =
      inventoryObj.price * workorderLineObj.qty -
      workorderLineObj.qty * discountObj.value;
    savings = inventoryObj.price * workorderLineObj.qty - newPrice;
  }

  return {
    newPrice: trimToTwoDecimals(newPrice),
    savings: trimToTwoDecimals(savings),
    discountName: discountObj.name,
  };
}

export function getItemFromArr(value, arrKey, arr) {
  return arr.find((obj) => obj[arrKey] === value);
}

export function generateRandomID(collectionPath) {
  let ref = getNewCollectionRef(collectionPath || COLLECTION_NAMES.customers);
  return ref.id;
}

export function generateBarcode() {
  let millis = new Date().getTime().toString();
  let last8 = millis.slice(millis.length - 9, millis.length - 1);
  let barcode = "0000" + last8;
  return barcode;
  // log(barcode.length, barcode);
}

export function jclone(item = {}) {
  return structuredClone(item);
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

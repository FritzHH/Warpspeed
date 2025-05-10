import { useEffect, useInsertionEffect, useRef } from "react";
import { getNewCollectionRef } from "./dbCalls";
import { COLLECTION_NAMES } from "./data";

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
  log("fetching this url", url);
  return fetch(url).then((res) => {
    log("fetch url result", res);
    return res.json().then((json) => json);
  });
}

export function trimToTwoDecimals(num) {
  let val = Math.floor(num * 100) / 100;
  return val;
}

export function searchPhoneNum(searchTerm, searchArr) {
  let resObj = {};
  for (let i = 0; i <= searchArr.length - 1; i++) {
    let customer = searchArr[i];
    if (customer.phone.cell.startsWith(searchTerm))
      resObj[customer.id] = customer;
    if (customer.phone.landline.startsWith(searchTerm))
      resObj[customer.id] = customer;
    if (customer.phone.cell.endsWith(searchTerm))
      resObj[customer.id] = customer;
    if (customer.phone.landline.endsWith(searchTerm))
      resObj[customer.id] = customer;
  }
  return Object.values(resObj);
}

export function removeDashesFromPhone(num = "") {
  let split = num.split("-");
  log(split);
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

export function generateRandomID() {
  return getNewCollectionRef(COLLECTION_NAMES.customers);
}

/* eslint-disable */
import { cloneDeep } from "lodash";
import {
  generateBarcode,
  generateRandomID,
  generateUPCBarcode,
  trimToTwoDecimals,
} from "./utils";
import { dbSetInventoryItem } from "./db_call_wrapper";
import { INVENTORY_ITEM_PROTO } from "./data";
import * as XLSX from "xlsx";

function readXLSXBinaryReturnRows(binaryStr) {
  let readedData = XLSX.read(binaryStr, { type: "binary" });
  const wsname = readedData.SheetNames[0];
  const ws = readedData.Sheets[wsname];

  let sheet = XLSX.utils.sheet_to_json(ws, { header: 1 });
  sheet = sheet.slice(1, sheet.length - 1);
  return sheet;
}

export function readLightspeedInventoryBinary(binaryStr) {
  // log("here");
  let rows = readXLSXBinaryReturnRows(binaryStr);
  let res = [];
  let resObj = {
    upc: "",
    description: "",
    price: "",
    cost: "",
  };
  rows.forEach((row) => {
    let o = { ...resObj };
    o.upc = row[1] || generateBarcode();
    o.description = row[6];
    o.price = row[7];
    o.cost = row[8];
    res.push(o);
  });
  return res;
}

export function readJBIOrderBinary(binaryStr) {
  let rows = readXLSXBinaryReturnRows(binaryStr);
  let res = [];
  let resObj = {
    upc: "",
    description: "",
    cost: "",
    qty: "",
  };
  rows.forEach((row) => {
    let o = { ...resObj };
    o.upc = row[9] || generateBarcode();
    o.description = row[2];
    o.cost = row[8];
    o.qty = row[4];
    res.push(o);
  });
  return res;
}

export function fillInventoryFromLightspeedObjArr(lightspeedObjArr) {
  for (let i = 0; i <= lightspeedObjArr.length - 1; i++) {
    let obj = lightspeedObjArr[i];
    let inv = cloneDeep(INVENTORY_ITEM_PROTO);
    inv.id = generateUPCBarcode();
    inv.formalName = obj.description;
    inv.upc = obj.upc;
    inv.cost = trimToTwoDecimals(obj.cost);
    inv.price = trimToTwoDecimals(obj.cost * 2);
    dbSetInventoryItem(inv);
  }
}

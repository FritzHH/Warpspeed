/* eslint-disable */

import { cloneDeep, last } from "lodash";
import {
  COLORS,
  CUSTOMER_PROTO,
  INVENTORY_CATEGORY_NAMES,
  INVENTORY_ITEM_PROTO,
  PRINTER_NAMES,
  RECEIPT_LINE_ITEM_OBJ_PROTO,
  RECEIPT_TYPES,
  SETTINGS_OBJ,
  SMS_PROTO,
  WORKORDER_ITEM_PROTO,
  WORKORDER_PROTO,
} from "./data";
import {
  generate12DigitBarcode,
  randomWordGenerator,
  roundToTwoDecimals,
} from "./utils";

import { MILLIS_IN_DAY, MILLIS_IN_MINUTE } from "./constants";
import { dbSaveInventoryItem, dbSaveSettings } from "./db_calls_wrapper";

export function testPayment() {}

export function sendTestMessage() {
  let message = { ...SMS_PROTO };
  message.firstName = "Billy";
  message.lastName = "Jones";
  message.millis = new Date().getTime();
  message.phoneNumber = "2393369177";
  message.message = "Here is the last message sent number 18";
  message.customerID = "testid";
  message.id = crypto.randomUUID();
  message.canRespond = false;

  // sendSMS(message);
}

export async function fillInventory() {
  function generate() {
    return Math.floor(Math.random() * (100000 - 500 + 1)) + 500;
  }

  for (let i = 1; i <= 1; i++) {
    let lastDigit = new Date().getTime().toString();
    lastDigit = lastDigit.slice(lastDigit.length - 1);
    if (lastDigit == 0) lastDigit = 2;
    if (lastDigit == 9) lastDigit = 8;
    let inv = { ...INVENTORY_ITEM_PROTO, id: generate12DigitBarcode() };
    inv.formalName =
      (await randomWordGenerator()) +
      " " +
      (await randomWordGenerator()) +
      " " +
      (await randomWordGenerator());
    inv.informalName =
      "(informal name)" +
      (await randomWordGenerator()) +
      " " +
      (await randomWordGenerator());
    inv.price = generate();

    inv.category = INVENTORY_CATEGORY_NAMES.parts;
    inv.brand = "Brand " + (await randomWordGenerator());
    inv.cost = roundToTwoDecimals(inv.price / 2);
    // inv.category = INVENTORY_CATEGORY_NAMES.labor;
    // inv.upc = generateBarcode();
    // setInventoryItem(inv);
    // clog(inv);
    // clog(inv);
    // return;
    dbSaveInventoryItem(inv, inv.id, "1234", "999");
    // dbSetInventoryItem(inv, false);
  }
}

export async function fillOpenWorkorders(zInventoryArr) {
  let arr = [];
  for (let i = 1; i <= 1; i++) {
    let wo = cloneDeep(WORKORDER_PROTO);
    wo.id = generate12DigitBarcode();
    wo.brand = SETTINGS_OBJ.bikeBrands[Math.floor(Math.random() * 4)];
    wo.color1 = COLORS[Math.floor(Math.random() * 6)];
    wo.color2 = COLORS[Math.floor(Math.random() * 6)];
    wo.description =
      SETTINGS_OBJ.bikeDescriptions[Math.floor(Math.random() * 4)];
    wo.status = SETTINGS_OBJ.statuses[Math.floor(Math.random() * 5)]?.id || "";
    wo.customerFirst = "Ricky";
    wo.customerLast = "Bobby";
    wo.customerCell = "2393369177";
    wo.customerID = "1236";
    wo.startedBy = "Fritz Hieb";
    wo.changeLog.push("Started by: " + "Fritz" + " " + "Hieb");
    wo.startedOnMillis = new Date().getTime();
    wo.partSource = SETTINGS_OBJ.partSources[Math.floor(Math.random() * 2)];
    wo.partOrdered = "Part: " + (await randomWordGenerator());
    wo.waitTime = SETTINGS_OBJ.waitTimes[Math.floor(Math.random() * 9)];

    for (let i = 1; i <= 5; i++) {
      let val = Math.round(Math.random() * 8);
      let line = cloneDeep(WORKORDER_ITEM_PROTO);
      line.id = crypto.randomUUID();
      line.inventoryItem = zInventoryArr[val];
      line.qty = Math.ceil(i / 2);
      wo.workorderLines.push(line);
      // clog(line, i);
    }


}

export function fillCustomers() {
  for (let i = 5; i <= 8; i++) {
    let cust = { ...CUSTOMER_PROTO };
    cust.id = crypto.randomUUID();
    cust.first = "test first" + i;
    cust.last = "test last " + i;
    cust.customerCell = "111111111" + i;
    cust.city = "test city " + i;
  }
}

export function fillSettings() {
  // log(SETTINGS_PROTO);
  dbSaveSettings(SETTINGS_OBJ);
}



export function fillPrinterNames() {
  // setRealtimeNodeItem("PRINTERS/printer_names", PRINTER_NAMES);
}

export function fillPunchHistory() {
  // log("here");
  let userID = "1234";
  let option = true;
  let ref = new Date().getTime();
  let running = ref;
  // running = running - MILLIS_IN_DAY * 1;
  for (let i = 2; i <= 60; i++) {
    let num = Math.round(MILLIS_IN_MINUTE * i * 120);
    running += num;
    // log(formatMillisForDisplay(val, true, true));
    // log(val);
    let obj = {
      userID,
      millis: running,
      id: crypto.randomUUID(),
      option: option ? "in" : "out",
    };
    // log(formatMillisForDisplay(obj.millis));
    // setDBItem(build_db_path.punchClock(userID), obj);
    option = !option;
  }
}

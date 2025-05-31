/* eslint-disable */

import { cloneDeep } from "lodash";
import {
  bike_brands_db,
  bike_colors_arr_db,
  bike_descriptions_db,
  CUSTOMER_PROTO,
  INVENTORY_CATEGORIES,
  INVENTORY_ITEM_PROTO,
  SETTINGS_PROTO,
  SMS_PROTO,
  WORKORDER_PROTO,
} from "./data";
import { setInventoryItem, setOpenWorkorder } from "./db";
import {
  formatDateTime,
  generateBarcode,
  generateRandomID,
  log,
  randomWordGenerator,
} from "./utils";
import { dbSetCustomerObj, dbSetSettings } from "./db_calls";

export function testPayment() {}

export function sendTestMessage() {
  let message = { ...SMS_PROTO };
  message.firstName = "Billy";
  message.lastName = "Jones";
  message.millis = new Date().getTime();
  message.phoneNumber = "2393369177";
  message.message = "Here is the last message sent number 18";
  message.customerID = "testid";
  message.id = generateRandomID();
  message.canRespond = false;

  // sendSMS(message);
}

export async function fillInventory() {
  let keys = Object.keys(INVENTORY_CATEGORIES);
  for (let i = 1; i <= 5; i++) {
    let inv = { ...INVENTORY_ITEM_PROTO, id: generateRandomID() };
    inv.formalName =
      (await randomWordGenerator()) +
      " " +
      (await randomWordGenerator()) +
      " " +
      (await randomWordGenerator());
    inv.informalName =
      "Informal " +
      (await randomWordGenerator()) +
      " " +
      (await randomWordGenerator());
    inv.price = i * 4 + "." + i + i * 2;
    if (i === 1 || i === 3) inv.salePrice = i * 2 + "." + i + i * 2;
    inv.category = INVENTORY_CATEGORIES[keys[i - 1]];
    inv.upc = generateBarcode();
    setInventoryItem(inv);
  }
}

export function fillOpenWorkorders() {
  for (let i = 0; i <= 0; i++) {
    let wo = { ...WORKORDER_PROTO, id: generateRandomID() };
    wo.brand = bike_brands_db.brands1[i];
    wo.color = bike_colors_arr_db[i];
    wo.description = bike_descriptions_db[i];
    wo.startedBy = "Test User";
    wo.status = { name: "Newly Created", color: "red", position: 0 };
    wo.customerFirst = "Test";
    wo.customerLast = "Customer";
    wo.customerPhone = "1111111111";
    wo.customerID = "BZb60oVQWhZ7g3cufwp4";
    wo.startedBy = "Test User";
    wo.changeLog.push("Started by: " + "Test" + " " + "User");
    setOpenWorkorder(wo);
  }
}

export function fillCustomers() {
  for (let i = 5; i <= 8; i++) {
    let cust = { ...CUSTOMER_PROTO };
    cust.id = generateRandomID();
    cust.first = "test first" + i;
    cust.last = "test last " + i;
    cust.cell = "111111111" + i;
    cust.city = "test city " + i;
    dbSetCustomerObj(cust);
  }
}

export function fillPreferences() {
  // log(SETTINGS_PROTO);
  dbSetSettings(SETTINGS_PROTO);
  // getRealtimeNodeItem("SETTINGS").then((res) => log("res", res));
}

export function initWorkorder() {}

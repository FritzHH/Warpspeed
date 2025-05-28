/* eslint-disable */

import { cloneDeep } from "lodash";
import {
  bike_brands_db,
  bike_colors_db,
  bike_descriptions_db,
  COLLECTION_NAMES,
  CUSTOMER_PROTO,
  INVENTORY_ITEM_PROTO,
  printer_names,
  RECEIPT_TYPES,
  RECEIPT_WORKORDER_PROTO,
  SMS_PROTO,
  WORKORDER_PROTO,
} from "./data";
import {
  sendSMS,
  setFirestoreCollectionItem,
  setCustomer,
  setInventoryItem,
  setOpenWorkorder,
  setPreferences,
  subscribeToInventory,
} from "./db";
import { formatDateTime, generateRandomID, log } from "./utils";
import { customerSubscribe } from "./db_subscriptions";
import { dbSetCustomerObj } from "./db_calls";

export let TEST_CUSTOMER = cloneDeep(CUSTOMER_PROTO);
TEST_CUSTOMER.first = "Jim";
TEST_CUSTOMER.last = "Jones";
TEST_CUSTOMER.cell = "123-434-5456";

export function testPayment() {}

export function sendTestCollectionItem() {
  let proto = cloneDeep(RECEIPT_WORKORDER_PROTO);
  proto.dateTime = formatDateTime(new Date()).topTicketDateTimeString;
  proto.workorderNumber = "1234";
  proto.customerContactBlurb =
    "Customer Name \n(239) 336 9177 \n123 Bonita Beach Rd \nNaples, FL";
  proto.workorderItem = "Trek Hybrid";
  proto.startedOnStr = formatDateTime(new Date()).topTicketDateTimeString;
  proto.itemArr = [
    { item: "Brake cable", price: "2.00", qty: 2, discount: "" },
  ];
  proto.laborCharges = "22.90";
  proto.partsCharges = "43.45";
  proto.taxCharges = "4.34";
  proto.total = "76.56";
  proto.customerNotes =
    "please was the damn bike and shit also \nclean the chain";
  proto.internalNotes =
    "The chain is falling off and so on and so forth so keep an eye on that or else bad shit will happen";
  proto.barcode = "123432756456";
  proto.id = generateRandomID();
  proto.receiptType = RECEIPT_TYPES.workorder;
  proto.location = printer_names.left;
  // log("proto", proto);
  setFirestoreCollectionItem(COLLECTION_NAMES.printers, proto, true);
}

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

export function fillInventory() {
  for (let i = 0; i <= 5; i++) {
    let inv = { ...INVENTORY_ITEM_PROTO, id: generateRandomID() };
    inv.name = "Test Item Name";
    (inv.price = 2.49), (inv.catLocation = "Sales Floor");
    setInventoryItem(inv);
  }
}

export function fillOpenWorkorders() {
  for (let i = 0; i <= 3; i++) {
    let wo = { ...WORKORDER_PROTO, id: generateRandomID() };
    wo.brand = bike_brands_db.brands1[i];
    wo.color = bike_colors_db[i];
    wo.customerID = i.toString();
    wo.description = bike_descriptions_db[i];
    wo.startedBy = "Test User";
    wo.status = { name: "Service", id: "343343", position: 0 };
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

export function testNode() {
  // subscribeToInventory((changeType, val) => {
  //   log("here is the changed val", val);
  // });
  // let wo = { ...WORKORDER_PROTO };
  // wo.brand = "trek nvvvy";
  // wo.id = "3434";
  // setOpenWorkorder(wo);

  // let invObj = { ...INVENTORY_ITEM_PROTO };
  // invObj.id = "13dddfddsaddddddfdddf3d4adfsdfadfae3";
  // invObj.name = "cablsfe";
  // setInventoryItem(invObj);

  let cust1 = { ...CUSTOMER_PROTO };
  cust1.first = "fritz";
  cust1.last = "hieb";
  cust1.cell = "1111111114";
  cust1.id = "vpgJGrwyer1lJYmwUDPM";
  // setCustomer(cust1).then((res) => log("result", res));
  // customerSubscribe(cust1, (obj) => log("obj", obj));
}

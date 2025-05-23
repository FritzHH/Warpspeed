import { cloneDeep } from "lodash";
import {
  COLLECTION_NAMES,
  CUSTOMER_PROTO,
  printer_names,
  RECEIPT_TYPES,
  RECEIPT_WORKORDER_PROTO,
  SMS_PROTO,
} from "./data";
import { sendSMS, setCollectionItem } from "./dbCalls";
import { formatDateTime, generateRandomID, log } from "./utils";

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
  setCollectionItem(COLLECTION_NAMES.printers, proto, true);
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

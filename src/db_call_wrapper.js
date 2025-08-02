import {
  cancelServerDrivenStripePayment,
  cancelStripeActivePaymentIntents,
  getCollectionItem,
  getPaymentIntent,
  getRealtimeNodeItem,
  getStripeActivePaymentIntents,
  getStripeConnectionToken,
  processPaymentIntent,
  processServerDrivenStripePayment,
  retrieveAvailableStripeReaders,
  sendSMS,
  setFirestoreCollectionItem,
  setRealtimeNodeItem,
} from "./db";
import { log } from "./utils";

// setters ///////////////////////////////////////////////////////
export function dbSetCustomerObj(customerObj, removeOption = false) {
  let id = customerObj.id;
  let previewObj = {};
  previewObj.cell = customerObj.cell;
  previewObj.first = customerObj.first;
  previewObj.id = customerObj.id;
  previewObj.landline = customerObj.landline;
  previewObj.last = customerObj.last;
  if (removeOption) {
    previewObj = null;
    customerObj = null;
  }
  setRealtimeNodeItem("CUSTOMER-PREVIEWS/" + id, previewObj);
  return setFirestoreCollectionItem("CUSTOMERS", id, customerObj);
}

export function dbSetSettings(settingsObj) {
  return setRealtimeNodeItem("SETTINGS", settingsObj);
}

export function dbSetOpenWorkorderItem(item, removeOption = false) {
  let path = "OPEN-WORKORDERS/" + item.id;
  if (removeOption) item = null;
  return setRealtimeNodeItem(path, item);
}

export function dbSetClosedWorkorderItem(item, removeOption = false) {
  let id = item.id;
  if (removeOption) item = null;
  return setFirestoreCollectionItem("CLOSED-WORKORDERS", id, item);
}

export function dbSetInventoryItem(item, remove = false) {
  let path = "INVENTORY/" + item.id;
  if (remove) item = null;
  return setRealtimeNodeItem(path, item);
}

export function dbSetSaleItem(item, removeOption = false) {
  let id = item.id;
  if (removeOption) item = null;
  return setFirestoreCollectionItem("SALES", id, item);
}

// getters ///////////////////////////////////////////////////////////
export function dbGetClosedWorkorderItem(id) {
  return getCollectionItem("CLOSED-WORKORDERS", id);
}

export function dbGetOpenWorkorderItem(id) {
  return getRealtimeNodeItem("OPEN-WORKORDERS/" + id);
}

export function dbGetSaleItem(id) {
  return getCollectionItem("SALES", id);
}

export function dbGetCustomerObj(id) {
  return getCollectionItem("CUSTOMERS", id);
}

// firebase functions ///////////////////////////////////////////////

export function dbSendMessageToCustomer(messageObj) {
  return sendSMS(messageObj);
}

// server driven Stripe payment processing (new)
export function dbProcessServerDrivenStripePayment(
  saleAmount,
  terminalID,
  warmUp,
  paymentIntentID
) {
  return processServerDrivenStripePayment(
    saleAmount,
    terminalID,
    warmUp,
    paymentIntentID
  );
}

export function dbCancelServerDrivenStripePayment(readerID, paymentIntentID) {
  return cancelServerDrivenStripePayment(readerID, paymentIntentID);
}

export function dbRetrieveAvailableStripeReaders() {
  return retrieveAvailableStripeReaders();
}

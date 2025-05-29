import { CUSTOMER_PREVIEW_PROTO } from "./data";
import {
  getCollectionItem,
  getNodeObject,
  getRealtimeNodeItem,
  setFirestoreCollectionItem,
  setRealtimeNodeItem,
} from "./db";
import { log } from "./utils";

// setters ///////////////////////////////////////////////////////
export function dbSetCustomerObj(customerObj) {
  let previewObj = {};
  previewObj.cell = customerObj.cell;
  previewObj.first = customerObj.first;
  previewObj.id = customerObj.id;
  previewObj.landline = customerObj.landline;
  previewObj.last = customerObj.last;
  setRealtimeNodeItem("CUSTOMER-PREVIEWS/" + customerObj.id, previewObj);
  return setFirestoreCollectionItem("CUSTOMERS", customerObj.id, customerObj);
}

export function dbSetSettings(settingsObj) {
  return setRealtimeNodeItem("SETTINGS", settingsObj);
}

export function dbSetOpenWorkorderItem(item) {
  let path = "OPEN-WORKORDERS/" + item.id;
  return setRealtimeNodeItem(path, item);
}

export function dbSetClosedWorkorderItem(item) {
  return setFirestoreCollectionItem("CLOSED-WORKORDERS", item.id, item);
}

export function dbSetInventoryItem(item, remove = false) {
  let path = "INVENTORY/" + item.id;
  if (remove) item = null;
  return setRealtimeNodeItem(path, item);
}

export function dbSetSaleItem(item) {
  return setFirestoreCollectionItem("SALES", item.id, item);
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

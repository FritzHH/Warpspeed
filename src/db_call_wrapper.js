/*eslint-disable*/
import {
  build_db_path,
  FIRESTORE_COLLECTION_NAMES,
  // FIRESTORE_DATABASE_NODE_NAMES,
  MILLIS_IN_MINUTE,
  REALTIME_DATABASE_NODE_NAMES,
  // REALTIME_DATABASE_PATHS,
} from "./constants";
import {
  addToFirestoreCollectionItem,
  cancelServerDrivenStripePayment,
  cancelStripeActivePaymentIntents,
  remove_firestore_field,
  filterFirestoreCollectionByNumber,
  get_firestore_field,
  getCollection,
  getDocument,
  getPaymentIntent,
  getRealtimeNodeItem,
  getStripeActivePaymentIntents,
  getStripeConnectionToken,
  set_firestore_field,
  processPaymentIntent,
  processServerDrivenStripePayment,
  retrieveAvailableStripeReaders,
  searchCollection,
  sendSMS,
  SET_FIRESTORE_FIELD,
  setFirestoreCollectionItem,
  setFirestoreSubCollectionItem,
  setRealtimeNodeItem,
  newSetDatabaseField,
  getFirestoreDoc,
} from "./db";
import { useDatabaseBatchStore } from "./stores";
import { clog, generateRandomID, log } from "./utils";

// new shi+++++++++++++++++++++++++++++++++++++++++++++++++

// write batching

function clearDBBatch() {
  localStorage.removeItem("batch");
}

function batchDBCallOLD(fieldName, fieldValue, remove) {
  // localStorage.clear();
  let batch = JSON.parse(localStorage.getItem("batch"));
  if (!batch) batch = {};
  batch[fieldName] = { fieldName, fieldValue, remove };
  // clog("batch", batch);
  localStorage.setItem("batch", JSON.stringify(batch));
  useDatabaseBatchStore.getState().setLastWriteMillis();
}

function batchDBCall(path, item, remove) {
  // localStorage.clear();
  let batch = JSON.parse(localStorage.getItem("batch"));
  if (!batch) batch = [];
  batch.push({ path, item, remove });
  // clog("batch", batch);
  localStorage.setItem("batch", JSON.stringify(batch));
  useDatabaseBatchStore.getState().setLastWriteMillis();
}

export function executeDBBatch() {
  let batch = JSON.parse(localStorage.getItem("batch"));
  // log("batch", batch);
  if (!batch) return;
  batch.forEach((batchItem) =>
    newSetDatabaseField(batchItem.path, batchItem.item, batchItem.remove)
  );
  useDatabaseBatchStore.getState().resetLastWriteMillis();
  clearDBBatch();
}

export function executeDBBatchOLD() {
  let batch = JSON.parse(localStorage.getItem("batch"));
  // log("batch", batch);
  if (!batch) return;

  Object.values(batch).forEach((o) => newSetDatabaseField(o));
  let pathNames = Object.keys(batch);
  pathNames.forEach((path) => {
    setDBField(path, batch[path]);
  });

  useDatabaseBatchStore.getState().resetLastWriteMillis();
  clearDBBatch();
}

// intermediate database path checker to determine which database to use
function checkDBPath(path) {
  if (
    Object.values(FIRESTORE_COLLECTION_NAMES).find((str) => path.includes(str))
  ) {
    return "firestore";
  } else {
    return "realtime";
  }
}

// internal db read/write operations
function setDBField(path, item, remove) {
  // if (checkDBPath(path) === "firestore") {
  //   if (remove) return remove_firestore_field(path, item.id);
  //   return set_firestore_field(path, item);
  // } else if (checkDBPath(path) === "realtime") {
  // }
}

////////////////////////////////////////////////////////////////////////////////
// setters /////////////////////////////////////////////////////////////////////

export function dbGetSettings() {
  let path = build_db_path.settings();
  try {
    return get_firestore_field(path);
  } catch (e) {
    log(e);
  }
}

export function dbSetSettings(settingsObj, batch) {
  let path = build_db_path.settings();
  if (batch) return batchDBCall(path, settingsObj);
  return newSetDatabaseField(path, settingsObj);
}

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
  return setFirestoreCollectionItem("CUSTOMERS", id, customerObj);
}

export function dbSetWorkorder(item, batch = true, remove = false) {
  let path = build_db_path.openWorkorders(item.id);
  if (batch) return batchDBCall(path, item, remove);
  return setRealtimeNodeItem(path, item);
}

export function dbSetClosedWorkorderItem(item, removeOption = false) {
  let id = item.id;
  if (removeOption) item = null;
  return setFirestoreCollectionItem("CLOSED-WORKORDERS", id, item);
}

export function dbSetInventoryItem(item, batch = true, remove = false) {
  let path = build_db_path.inventory(item.id);
  if (batch) return batchDBCall(path, item, remove);
  return newSetDatabaseField(path, item, remove);
}

export function dbSetSaleItem(item, batch = true, removeOption = false) {
  let id = item.id;
  if (removeOption) item = null;
  return setFirestoreCollectionItem("SALES", id, item);
}

export function dbSetPunchClockObj(obj, remove = false) {
  let path = build_db_path.punchClock(obj.id);
  return newSetDatabaseField(path, obj, remove);
}

export function dbSetOrUpdateUserPunchObj(punchObj, remove = false) {
  let punchClockPath = build_db_path.punchHistory(punchObj.id);
  setDBField(punchClockPath, punchObj, remove);
}

export function dbSetPunchClockArr(arr) {
  let clockArrPath = build_db_path.punchClock();
  // log("setting arr", arr);
  newSetDatabaseField(clockArrPath, arr);
}

export function dbSetAppUserObj(userObj, remove = false) {
  let path = "SETTINGS/" + userObj.id;
  if (remove) userObj = null;
  return setRealtimeNodeItem(path, userObj);
}

// database getters ///////////////////////////////////////////////////////////
export function dbGetClosedWorkorderItem(id) {
  return getDocument("CLOSED-WORKORDERS", id);
}

export function dbGetOpenWorkorderItem(id) {
  return getRealtimeNodeItem("OPEN-WORKORDERS/" + id);
}

export function dbGetSaleItem(id) {
  return getDocument("SALES", id);
}

export function dbGetCustomerObj(customerID) {
  let path = build_db_path.customer(customerID);
  return getFirestoreDoc(path);
}

// database filters //////////////////////////////////////////////////
export function _dbFindPunchHistoryByMillisRange(userID, start, end) {
  let path = build_db_path.punchHistory(userID);
  // log(path);
  // return getCollection(path);
  return filterFirestoreCollectionByNumber(path, "millis", start, end);
}

export function dbFindPreviousEntryByTimestamp() {}

// database searchers /////////////////////////////////////////////////

export function dbSearchForPhoneNumber(searchTerm) {
  return new Promise((resolve, reject) => {
    let resObj = {};
    let cellQueryRes = null;
    let landlineQueryRes = null;
    searchCollection("CUSTOMERS", "cell", searchTerm).then((res) => {
      cellQueryRes = true;
      res.forEach((obj) => {
        resObj[obj.id] = obj;
      });
      if (landlineQueryRes) resolve(Object.values(resObj));
    });
    searchCollection("CUSTOMERS", "landline", searchTerm).then((res) => {
      landlineQueryRes = true;
      res.forEach((obj) => {
        // log("obj", obj);
        resObj[obj.id] = obj;
      });
      if (cellQueryRes) resolve(Object.values(resObj));
    });
  });
}

export function dbSearchForName(searchTerm) {
  // log("db search term", searchTerm);
  return new Promise((resolve, reject) => {
    let resObj = {};
    let firstNameQueryRes = null;
    let lastNameQueryRes = null;
    searchCollection("CUSTOMERS", "first", searchTerm).then((res) => {
      firstNameQueryRes = true;
      res.forEach((obj) => {
        // log("obj", obj);
        resObj[obj.id] = obj;
      });
      if (lastNameQueryRes) resolve(Object.values(resObj));
    });

    searchCollection("CUSTOMERS", "last", searchTerm).then((res) => {
      lastNameQueryRes = true;
      res.forEach((obj) => {
        // log("obj", obj);
        resObj[obj.id] = obj;
      });
      if (firstNameQueryRes) resolve(Object.values(resObj));
    });
  });
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

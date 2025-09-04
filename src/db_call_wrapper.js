/*eslint-disable*/
import {
  FIRESTORE_DATABASE_NODE_NAMES,
  // FIRESTORE_DATABASE_NODE_NAMES,
  MILLIS_IN_MINUTE,
  REALTIME_DATABASE_NODE_NAMES,
  // REALTIME_DATABASE_PATHS,
} from "./constants";
import {
  addToFirestoreCollectionItem,
  cancelServerDrivenStripePayment,
  cancelStripeActivePaymentIntents,
  DELETE_FIRESTORE_FIELD,
  filterFirestoreCollectionByNumber,
  get_firestore_doc,
  getCollection,
  getDocument,
  getPaymentIntent,
  getRealtimeNodeItem,
  getStripeActivePaymentIntents,
  getStripeConnectionToken,
  set_firestore_doc,
  processPaymentIntent,
  processServerDrivenStripePayment,
  retrieveAvailableStripeReaders,
  searchCollection,
  sendSMS,
  SET_FIRESTORE_FIELD,
  setFirestoreCollectionItem,
  setFirestoreSubCollectionItem,
  setRealtimeNodeItem,
} from "./db";
import { useDatabaseBatchStore } from "./stores";
import { clog, generateRandomID, log } from "./utils";

// new shi+++++++++++++++++++++++++++++++++++++++++++++++++

// write batching

function clearDBBatch() {
  localStorage.removeItem("batch");
}

function batchDBCall(fieldName, fieldValue) {
  // localStorage.clear();
  let batch = JSON.parse(localStorage.getItem("batch"));
  if (!batch) batch = {};
  batch[fieldName] = fieldValue;
  // clog("batch", batch);
  localStorage.setItem("batch", JSON.stringify(batch));
}

export function executeDBBatch() {
  let batch = JSON.parse(localStorage.getItem("batch"));
  // log("batch", batch);
  if (!batch) return;
  let pathNames = Object.keys(batch);
  pathNames.forEach((path) => {
    setDBItem(path, batch[path]);
  });

  useDatabaseBatchStore.getState().resetLastWriteMillis();
  clearDBBatch();
}

// intermediate database path checker to determine which database to use
function checkDBPath(path) {
  if (
    Object.values(FIRESTORE_DATABASE_NODE_NAMES).find((str) =>
      path.includes(str)
    )
  ) {
    return "firestore";
  } else {
    return "realtime";
  }
}

// internal db read/write operations
function setDBItem(path, item) {
  if (checkDBPath(path) === "firestore") {
    return set_firestore_doc(path, item);
  } else if (checkDBPath(path) === "realtime") {
  }
}

function deleteField(path, fieldID) {
  if (checkDBPath(path) === "firestore") {
    // log('field id', )
    return DELETE_FIRESTORE_FIELD(path, fieldID);
  } else if (checkDBPath(path) === "realtime") {
  }
}

// exposed setters ///////////////////////////////////////////////////////

// exposed getters ///////////////////////////////////////////////////////
export function dbGetSettings() {
  let path = build_db_path.settings();
  try {
    return get_firestore_doc(path);
  } catch (e) {
    log(e);
  }
}

// end new shit ++++++++++++++++++++++++++++++++++++++++++++++++++++++

export function dbSetSettings(settingsObj, batch, fieldName, fieldVal) {
  let path = build_db_path.settings();
  if (batch) {
    batchDBCall(path, settingsObj);
    useDatabaseBatchStore.getState().setLastWriteMillis();
  } else {
    return setDBItem(path, settingsObj);
  }
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

export function dbUpdateUserPunchAction(userID, punchObj) {
  let punchClockPath = build_db_path.punchClock(userID);
  setDBItem(punchClockPath, punchObj);
}

export function dbCreateUserPunchAction({ userID, millisIn, millisOut }) {
  let id = generateRandomID();
  let obj = {
    millis: millisIn || millisOut,
    option: millisIn ? "in" : "out",
    id,
    userID,
  };

  let punchClockPath =
    FIRESTORE_DATABASE_NODE_NAMES.appUsers +
    userID +
    "/" +
    FIRESTORE_DATABASE_NODE_NAMES.punchClock;
  let activeClockPath = REALTIME_DATABASE_NODE_NAMES.loggedInUsers + userID;

  // add the user to the currently clocked-in node of Realtime Database
  if (millisOut) {
    setRealtimeNodeItem(activeClockPath, null);
  } else {
    setRealtimeNodeItem(activeClockPath, millisIn);
  }

  // add the new punch object to the Firestore database for record keeping
  addToFirestoreCollectionItem(punchClockPath, obj);
}

export function dbDeleteUserPunchAction(userID, punchID) {
  let punchClockPath = build_db_path.punchClock(userID);
  // log(punchClockPath);
  deleteField(punchClockPath, punchID);
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

export function dbGetCustomerObj(id) {
  return getDocument("CUSTOMERS", id);
}

// database filters //////////////////////////////////////////////////
export function _dbFindPunchHistoryByMillisRange(userID, start, end) {
  let path = build_db_path.punchClock(userID);
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

// database path builder /////////////////////////////////////////////////
export const build_db_path = {
  punchClock: (userID) =>
    FIRESTORE_DATABASE_NODE_NAMES.appUsers +
    userID +
    "/" +
    FIRESTORE_DATABASE_NODE_NAMES.punchClock,
  settings: (fieldName) => {
    let path = FIRESTORE_DATABASE_NODE_NAMES.settings + "settings/";
    if (fieldName) path += fieldName + "/";
    return path;
  },
};

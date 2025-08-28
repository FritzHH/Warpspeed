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
  getCollectionItem,
  getPaymentIntent,
  getRealtimeNodeItem,
  getStripeActivePaymentIntents,
  getStripeConnectionToken,
  processPaymentIntent,
  processServerDrivenStripePayment,
  retrieveAvailableStripeReaders,
  searchCollection,
  sendSMS,
  setFirestoreCollectionItem,
  setFirestoreSubCollectionItem,
  setRealtimeNodeItem,
} from "./db";
import { generateRandomID, log } from "./utils";

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

export function dbSetUserPunchAction({ userID, millisIn, millisOut }) {
  let id = generateRandomID();
  let obj = {
    millis: millisIn || millisOut,
    option: millisIn ? "in" : "out",
    id,
    userID,
  };
  // log("obj", obj);
  let punchClockPath =
    "APP-USERS/" + userID + "/" + FIRESTORE_DATABASE_NODE_NAMES.punchClock;
  let activeClockPath = REALTIME_DATABASE_NODE_NAMES.loggedInUsers + userID;
  if (millisOut) {
    setRealtimeNodeItem(activeClockPath, null);
  } else {
    setRealtimeNodeItem(activeClockPath, millisIn);
  }
  addToFirestoreCollectionItem(punchClockPath, obj);
  // setRealtimeNodeItem(historyPath, obj);
}

// database getters ///////////////////////////////////////////////////////////
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

// database filters //////////////////////////////////////////////////
export function dbFindPunchHistoryByMillisRange(userID, start, end) {
  // let path =
}

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

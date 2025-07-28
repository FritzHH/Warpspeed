/* eslint-disable */

const endpoint =
  "https://us-central1-warpspeed-original.cloudfunctions.net/sendSMS";

import {
  getFirestore,
  collection,
  addDoc,
  doc,
  setDoc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  arrayRemove,
} from "firebase/firestore";

import {
  get,
  getDatabase,
  onChildAdded,
  onChildChanged,
  onChildRemoved,
  onValue,
  ref,
  set,
} from "firebase/database";
import { initializeApp } from "firebase/app";
import { log } from "./utils";
import {
  CUSTOMER_PREVIEW_PROTO,
  CUSTOMER_PROTO,
  INVENTORY_ITEM_PROTO,
  WORKORDER_PROTO,
} from "./data";
import { isArray } from "lodash";
import { useRef } from "react";
// import { isArray } from "lodash";
const SMS_URL =
  "https://us-central1-warpspeed-bonitabikes.cloudfunctions.net/sendSMS";
const STRIPE_CREATE_PAYMENT_INTENT_URL =
  "https://us-central1-warpspeed-bonitabikes.cloudfunctions.net/createPaymentIntent";
const STRIPE_CONNECTION_TOKEN_FIREBASE_URL =
  "https://us-central1-warpspeed-bonitabikes.cloudfunctions.net/createStripeConnectionToken";
const STRIPE_ACTIVE_PAYMENT_INTENTS_URL =
  "https://us-central1-warpspeed-bonitabikes.cloudfunctions.net/getActivePaymentIntents";
const STRIPE_CANCEL_PAYMENT_INTENT_URL = "";
("https://us-central1-warpspeed-bonitabikes.cloudfunctions.net/cancelPaymentIntent");
const STRIPE_PROCESS_SERVER_DRIVEN_PAYMENT =
  "https://us-central1-warpspeed-bonitabikes.cloudfunctions.net/processServerDrivenStripePayment";

const firebaseConfig = {
  apiKey: "AIzaSyCUjRH7Yi9fNNDAUTyYzD-P-tUGGMvfPPM",
  authDomain: "warpspeed-bonitabikes.firebaseapp.com",
  databaseURL: "https://warpspeed-bonitabikes-default-rtdb.firebaseio.com",
  projectId: "warpspeed-bonitabikes",
  storageBucket: "warpspeed-bonitabikes.firebasestorage.app",
  messagingSenderId: "357992532514",
  appId: "1:357992532514:web:dc7d8f6408ea96ea72187b",
  measurementId: "G-HE8GCTBEEK",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const DB = getFirestore(app);
const RDB = getDatabase();

export function getNewCollectionRef(collectionName) {
  let ref = doc(collection(DB, collectionName));
  return ref;
}

export function getCollection(collectionName) {
  let arr = [];
  return getDocs(collection(DB, collectionName)).then((res) => {
    res.forEach((doc) => {
      arr.push(doc.data());
    });
    return arr;
  });
}

export function setFirestoreCollectionItem(
  collectionName,
  collectionId,
  item,
  stringify
) {
  // let id = item.id;
  if (stringify) item = { item: JSON.stringify(item) };

  let docRef = doc(DB, collectionName, collectionId);
  return setDoc(docRef, item)
    .then(() => {})
    .catch((err) => log("err", err));
}

export async function setSubCollectionItem(
  collectionName,
  documentId,
  subCollectionName,
  subDocumentId,
  data
) {
  // log(collectionName, documentId);
  try {
    const subCollectionRef = collection(
      DB,
      collectionName,
      documentId,
      subCollectionName
    );
    await setDoc(doc(subCollectionRef, subDocumentId), data);
    console.log("Document successfully written!");
  } catch (e) {
    console.error("Error adding document: ", e);
  }
}

export async function setCustomer(customerObj) {
  setFirestoreCollectionItem("CUSTOMERS", customerObj);
}

export function getCollectionItem(collectionName, itemID) {
  let ref = doc(DB, collectionName, itemID);
  return getDoc(ref).then((res) => {
    if (res.exists()) {
      return res.data();
    } else {
      return null;
    }
  });
}

export function subscribeToDocument(collectionName, documentID, callback) {
  let ref = doc(DB, collectionName, documentID);
  return onSnapshot(ref, (snap) => {
    callback(snap.data());
  });
}

export function subscribeToCollectionNode(collectionName, callback) {
  let q = query(collection(DB, collectionName));
  return onSnapshot(q, (querySnapshot) => {
    let arr = [];
    querySnapshot.forEach((query) => {
      // log(count, query.data());
      try {
        arr.push(query.data());
      } catch (e) {
        callback(arr);
      }
    });
    callback(arr);
  });
}

///////////////////////////////////////////////////////////////////////
////// Realtime Database calls ////////////////////////////////////////
///////////////////////////////////////////////////////////////////////
function createRealtimeRef(path) {
  return ref(RDB, path);
}

// getters
function getNodeObject(dbRef) {
  return get(dbRef).then((snap) => {
    // log("snap", snap.val());
    if (snap.exists) return snap.val();
    return null;
  });
}

export function getCustomerMessages(customerPhone) {
  let returnObj = {
    incomingMessages: null,
    outgoingMessages: null,
  };
  let incomingRef = ref(RDB, "MESSAGES/INCOMING/" + customerPhone);
  let outgoingRef = ref(RDB, "MESSAGES/OUTGOING/" + customerPhone);

  return new Promise((resolve, reject) => {
    get(incomingRef)
      .then((snap) => {
        if (snap.exists) {
          returnObj.incomingMessages = snap.val();
        } else {
          returnObj.incomingMessages = [];
        }
        if (isArray(returnObj.outgoingMessages)) {
          resolve(returnObj);
        }
      })
      .catch((e) => {
        log(
          "ERROR RETRIEVING INCOMING CUSTOMER MESSAGES IN getCustomerMessages()",
          e
        );
        reject(
          "ERROR RETRIEVING INCOMING CUSTOMER MESSAGES IN getCustomerMessages() :: " +
            e
        );
      });

    get(outgoingRef)
      .then((snap) => {
        if (snap.exists) {
          returnObj.outgoingMessages = snap.val();
        } else {
          returnObj.outgoingMessages = [];
        }
        if (isArray(returnObj.incomingMessages)) {
          resolve(returnObj);
        }
      })
      .catch((e) => {
        log(
          "ERROR RETRIEVING OUTGOING CUSTOMER MESSAGES IN getCustomerMessages()",
          e
        );
        reject(
          "ERROR RETRIEVING OUTGOING CUSTOMER MESSAGES IN getCustomerMessages() :: " +
            e
        );
      });
  });
}

export async function getInventory() {
  let dbRef = ref(RDB, "INVENTORY");
  return getNodeObject(dbRef);
}

// setters
export function setPreferences(key, prefObj) {
  let dbRef = ref(RDB, "PREFERENCES/" + key);
  return set(dbRef, prefObj);
}

export function setOpenWorkorder(workorderObj = WORKORDER_PROTO) {
  let dbRef = ref(RDB, "OPEN-WORKORDERS/" + workorderObj.id);
  return set(dbRef, workorderObj);
}

export function setClosedWorkorder(workorder = WORKORDER_PROTO) {
  let dbRef = ref(RDB, "CLOSED-WORKORDERS/" + workorder.id);
  return set(dbRef, workorder);
}

export function setRealtimeNodeItem(path, item) {
  return set(createRealtimeRef(path), item);
}

export function getRealtimeNodeItem(path) {
  let dbRef = ref(RDB, path);
  return getNodeObject(dbRef);
}

export function setInventoryItem(inventoryObj = INVENTORY_ITEM_PROTO) {
  let dbRef = ref(RDB, "INVENTORY/" + inventoryObj.id);
  return set(dbRef, inventoryObj);
}

function concurrentDBSet(dbref1, obj1, dbref2, obj2) {
  let ref1Complete = false;
  let ref2Complete = false;
  return new Promise((resolve, reject) => {
    set(dbref1, obj1)
      .then((res) => {
        ref1Complete = true;
        if (ref2Complete) resolve("first");
      })
      .catch((e) => {
        log("ERROR IN CONCURRENT DBSET", e);
        resolve(null);
      });
    set(dbref2, obj2)
      .then((res) => {
        ref2Complete = true;
        if (ref1Complete) resolve("second");
      })
      .catch((e) => {
        log("ERROR IN CONCURRENT DBSET", e);
        resolve(null);
      });
  });
}

// subscriptions /////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////
export function subscribeToNodeChange(
  nodePath,
  callback,
  targetData,
  targetSetter
) {
  let dbRef = ref(RDB, nodePath);
  return onChildChanged(dbRef, (snap) => {
    if (snap.val()) {
      callback("changed", snap.key, snap.val(), targetData, targetSetter);
    }
  });
}

export function subscribeToNodeRemoval(
  nodePath,
  callback,
  targetData,
  targetSetter
) {
  let dbRef = ref(RDB, nodePath);
  return onChildRemoved(dbRef, (snap) => {
    if (snap.val()) {
      callback("removed", snap.key, snap.val(), targetData, targetSetter);
    }
  });
}

export function subscribeToNodeAddition(
  nodePath,
  callback
  // targetData,
  // targetSetter
) {
  let dbRef = ref(RDB, nodePath);
  return onChildAdded(dbRef, (snap) => {
    if (snap.val()) {
      // log("added", snap.val());
      callback("added", snap.key, snap.val());
    }
  });
}

////// Firebase Function calls ///////////////////////////////////////

export function sendSMS(messageBody) {
  fetch(SMS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify(messageBody),
  })
    .then((res) => {
      if (!res.ok) {
        log("FETCH FAILURE IN SENDSMS HERE IS THE REASON ==> ", res);
        return null;
      } else {
        res.json().then((res) => {
          log("COMPLETE!", res);
          return res;
        });
      }
      return res;
    })

    .catch((e) => {
      log("error in Fetch sendSMS", e);
    });
}

// client driven (old)
export function getPaymentIntent(amount) {
  return fetch(STRIPE_CREATE_PAYMENT_INTENT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify({
      amount: Number(amount),
    }),
  })
    .then((res) => {
      if (!res.ok) {
        log(
          "FETCH FAILURE IN STRIPE GET PAYMENT INTENT HERE IS THE REASON ==> ",
          res
        );
        return null;
      } else {
        return res.json().then((res) => {
          log("STRIPE FETCH PAYMENT COMPLETE!");
          return res;
        });
      }
    })
    .catch((e) => {
      log("error in Stripe GET PAYMENT INTENT call", e);
    });
}

export function getStripeConnectionToken() {
  return fetch(STRIPE_CONNECTION_TOKEN_FIREBASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    // body: JSON.stringify({
    //   amount: Number(amount),
    // }),
  })
    .then((res) => {
      if (!res.ok) {
        log(
          "FETCH FAILURE IN STRIPE CONNECTION TOKEN HERE IS THE REASON ==> ",
          res
        );
        return null;
      } else {
        return res.json().then((res) => {
          log("STRIPE CONNECTION TOKEN COMPLETE!");
          return res;
        });
      }
    })
    .catch((e) => {
      log("error in Stripe CONECTION TOKEN call", e);
    });
}

export function getStripeActivePaymentIntents() {
  return fetch(STRIPE_ACTIVE_PAYMENT_INTENTS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    // body: JSON.stringify({
    //   amount: Number(amount),
    // }),
  })
    .then((res) => {
      if (!res.ok) {
        log(
          "FETCH FAILURE IN STRIPE GET ACTIVE PAYMENT INTENTS HERE IS THE REASON ==> ",
          res
        );
        return null;
      } else {
        return res.json().then((res) => {
          log("STRIPE GETTING ACTIVE PAYMENT INTENTS COMPLETE!");
          return res;
        });
      }
    })
    .catch((e) => {
      log("error in Stripe GET ACTIVE PAYMENT INTENTS call", e);
    });
}

export function cancelStripeActivePaymentIntents(paymentIntentSecretArr) {
  return fetch(STRIPE_CANCEL_PAYMENT_INTENT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: paymentIntentSecretArr
      ? JSON.stringify({
          intentList: paymentIntentSecretArr,
        })
      : null,
  })
    .then((res) => {
      if (!res.ok) {
        log(
          "FETCH FAILURE IN STRIPE CANCEL ACTIVE PAYMENT INTENTS HERE IS THE REASON ==> ",
          res
        );
        return res;
      } else {
        return res.json().then((res) => {
          log("STRIPE CANCEL ACTIVE PAYMENTS INTENTS COMPLETE!");
          return res;
        });
      }
    })
    .catch((e) => {
      log("error in Stripe CANCEL ACTIVE PAYMENT INTENTS call", e);
    });
}

// server driven (new)
export function processServerDrivenStripePayment(saleAmount, terminalID) {
  return fetch(STRIPE_PROCESS_SERVER_DRIVEN_PAYMENT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify({
      amount: Number(saleAmount),
      readerID: terminalID,
    }),
  })
    .then((res) => {
      if (!res.ok) {
        log(
          "FETCH FAILURE IN STRIPE PROCESS SERVER DRIVEN PAYMENT HERE IS THE REASON ==> ",
          res
        );
        return null;
      } else {
        return res.json().then((reader) => {
          log("STRIPE SERVER DRIVEN PAYMENT PROCESS COMPLETE!", reader);
          return reader;
        });
      }
    })
    .catch((e) => {
      log("error in Stripe processServerDrivenStripePayment() call", e);
    });
}

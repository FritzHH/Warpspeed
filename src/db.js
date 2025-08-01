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
  off,
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
import {
  FCM_MESSAGING_URL,
  firebaseConfig,
  STRIPE_EVENT_WEBHOOK_URL,
} from "./app_user_constants";
import { firebaseApp } from "./init";
import { isArray } from "lodash";

//todo move these to database and call on page load
import {
  SMS_URL,
  STRIPE_CONNECTION_TOKEN_FIREBASE_URL,
  STRIPE_SERVER_DRIVEN_CANCEL_PAYMENT_INTENT_URL,
  STRIPE_SERVER_DRIVEN_INITIATE_PAYMENT_INTENT_URL,
  STRIPE_SERVER_DRIVEN_GET_AVAIALABLE_STRIPE_READERS_URL,
} from "./app_user_constants";

// Initialize Firebase
const DB = getFirestore(firebaseApp);
const RDB = getDatabase();

////////////////////////////////////////////////////////////////////////
//////// Firestore calls ///////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////

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
  try {
    return get(dbRef).then((snap) => {
      // log("snap", snap.val());
      if (snap.exists) return snap.val();
      return null;
    });
  } catch (e) {
    log("db error", e);
  }
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

export function subscriptionManualRemove(path) {
  let ref1 = ref(RDB, path);
  off(ref1, "value", (res) => {
    log("result of manual removal", res);
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

/////////////////////////////////////////////////////////////////////////////////
// server driven (new)
export function processServerDrivenStripePayment(
  saleAmount,
  readerID,
  warmUp,
  paymentIntentID
) {
  return fetch(STRIPE_SERVER_DRIVEN_INITIATE_PAYMENT_INTENT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: Number(saleAmount),
      readerID,
      warmUp,
      paymentIntentID,
    }),
  })
    .then((res) => {
      if (!res.ok) {
        return null;
      } else {
        return res.json();
      }
    })
    .catch((e) => {
      log("error in Stripe processServerDrivenStripePayment() call", e);
    });
}

export function cancelServerDrivenStripePayment(readerID, paymentIntentID) {
  return fetch(STRIPE_SERVER_DRIVEN_CANCEL_PAYMENT_INTENT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      readerID,
      paymentIntentID,
    }),
  })
    .then((res) => {
      if (!res.ok) {
        return null;
      } else {
        return res.json();
      }
    })
    .catch((e) => {
      log("error in Stripe cancelServerDrivenStripePayment() call", e);
    });
}

export function retrieveAvailableStripeReaders(readerID) {
  return fetch(STRIPE_SERVER_DRIVEN_GET_AVAIALABLE_STRIPE_READERS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      readerID,
    }),
  })
    .then((res) => {
      if (!res.ok) {
        return null;
      } else {
        return res.json();
      }
    })
    .catch((e) => {
      log("error in Stripe retrieveAvailableStripeReaders() call", e);
    });
}

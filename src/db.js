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
  where,
  updateDoc,
  FieldValue,
  deleteDoc,
  initializeFirestore,
  memoryLocalCache,
  Firestore,
  CACHE_SIZE_UNLIMITED,
  disableNetwork,
  persistentLocalCache,
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
import { clog, formatMillisForDisplay, log, numberIsEven } from "./utils";
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
import { FIRESTORE_COLLECTION_NAMES } from "./constants";

// Initialize Firebase
const FIRESTORE = getFirestore(firebaseApp);
// const FIRESTORE = getFirestore(initializeApp(firebaseConfig));
// const FIRESTORE = initializeFirestore(initializeApp(firebaseConfig), {
//   localCache: persistentLocalCache(/*settings*/ {}),
// });
// disableNetwork(FIRESTORE);
const RDB = getDatabase();

///**************************************************************
// NEW *////////////////////////////////////////////////////////////

// internal ////////////////////////////
function createRealtimeRef(path) {
  return ref(RDB, path);
}

function checkDBPath(path) {
  if (
    Object.values(FIRESTORE_COLLECTION_NAMES).find((str) => path.includes(str))
  ) {
    return "firestore";
  } else {
    return "realtime";
  }
}

async function remove_firestore_field(path, fieldID) {
  let docRef = doc(FIRESTORE, path, fieldID);
  return await deleteDoc(docRef);
}

async function set_firestore_field(path, obj, remove) {
  // log(path, item);
  let docRef = doc(FIRESTORE, path);
  // return await setDoc(docRef, { ...obj });
  updateDoc(docRef, obj);
}

export function setRealtimeNodeItem(path, item, remove) {
  return set(createRealtimeRef(path), item);
}

export function getRealtimeNodeItem(path) {
  let dbRef = ref(RDB, path);
  return getNodeObject(dbRef);
}

// exposed subscriptions ////////////////////////////////////////
export function subscribeToNodeChange(path, callback) {
  let dbRef = ref(RDB, path);
  return onChildChanged(dbRef, (snap) => {
    // log(snap);
    if (snap.val()) {
      // log("subscription change", snap.val());
      callback(snap.key, snap.val());
    }
  });
}

export function subscribeToNodeRemoval(nodePath, callback) {
  let dbRef = ref(RDB, nodePath);
  return onChildRemoved(dbRef, (snap) => {
    if (snap.val()) {
      callback(snap.key, snap.val());
    }
  });
}

export function subscribeToNodeAddition(path, callback) {
  let dbRef = ref(RDB, path);
  return onChildAdded(dbRef, (snap) => {
    if (snap.val()) {
      // clog("added", snap.val());
      callback(snap.key, snap.val());
    }
  });
}

// exposed db calls ////////////////////////////////

export function newSetDatabaseField(path, item, remove) {
  if (checkDBPath(path) === "firestore") {
    // log(path, item);
    if (remove) return remove_firestore_field(path, item.id);
    return set_firestore_field(path, item);
  }
  // log(path, item);
  if (remove) return setRealtimeNodeItem(path, null);
  return setRealtimeNodeItem(path, item);
}

// END NEW **********************************************************

////////////////////////////////////////////////////////////////////////
//////// //////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////

// getters
export function getNewCollectionRef(collectionName) {
  let ref = doc(collection(FIRESTORE, collectionName));
  return ref;
}

export function getCollection(collectionName) {
  let arr = [];
  return getDocs(collection(FIRESTORE, collectionName)).then((res) => {
    res.forEach((doc) => {
      arr.push(doc.data());
    });
    return arr;
  });
}

export function getDocument(collectionName, itemID) {
  let ref = doc(FIRESTORE, collectionName, itemID);
  return getDoc(ref).then((res) => {
    if (res.exists()) {
      return res.data();
    } else {
      return null;
    }
  });
}

// export async function set_firestore_field2(path, obj, remove) {
//   // log(path, item);
//   let docRef = doc(FIRESTORE, path);
//   // return await setDoc(docRef, { ...obj });
//   setDoc(docRef, { ...obj });
// }

export async function get_firestore_field(path) {
  let docRef = doc(FIRESTORE, path);
  return (await getDoc(docRef)).data();
}

// export async function get_firestore_field2(path) {
//   let docRef = doc(FIRESTORE, path);
//   return (await getDoc(docRef)).data();
// }

//////////////////////////////////////////////////////////////////////
// subscriptions /////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////

// new firestore calls ///////////////////

function countSlashes(str) {
  return (str.match(/\//g) || []).length;
}

export function subscribeToFirestorePath(path, callback) {
  if (!numberIsEven(countSlashes(path)))
    return onSnapshot(collection(FIRESTORE, path), (snapshot) => {
      // log("incoming collection");
      // log(doc.docs());
      snapshot.forEach((item) => callback(item.data()));
      // callback(snapshot.docs());
    });

  return onSnapshot(doc(FIRESTORE, path), (doc) => {
    // log("incoming snapshot");
    // log(doc.data());
    callback(doc.data());
  });
}

//// end new /////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////

// sort of new???????????

export async function SET_FIRESTORE_FIELD(path, item) {
  if (item.id) {
    // is document
    let docRef = doc(FIRESTORE, path, item.id);
    return await setDoc(docRef, item);
  } else {
  }
}

export async function ADD_FIRESTORE_FIELD(path, item) {
  let docRef = doc(FIRESTORE, path, item.id);
  return await addDoc(docRef, item);
}

export function setFirestoreCollectionItem(
  collectionName,
  collectionId,
  item,
  stringify
) {
  // let id = item.id;
  if (stringify) item = { item: JSON.stringify(item) };

  let docRef = doc(FIRESTORE, collectionName, collectionId);
  // log(collectionName, collectionId);
  // log(item);
  return setDoc(docRef, item)
    .then(() => {
      // log("finished setting firestore collection");
    })
    .catch((err) => log("error setting Firestore collection", err));
}

export async function setFirestoreSubCollectionItem(
  collectionName,
  documentId,
  subCollectionName,
  subDocumentId,
  data
) {
  // log(collectionName, documentId);
  try {
    const subCollectionRef = collection(
      FIRESTORE,
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

// adders

export function addToFirestoreCollectionItem(path, item, stringify) {
  if (stringify) item = { item: JSON.stringify(item) };

  let docRef = collection(FIRESTORE, path);
  // log(path);
  return addDoc(docRef, item)
    .then(() => {
      log("finished adding firestore collection");
    })
    .catch((err) => log("error setting Firestore collection", err));
}

// subscribers
export function subscribeToDocument(collectionName, documentID, callback) {
  let ref = doc(FIRESTORE, collectionName, documentID);
  return onSnapshot(ref, (snap) => {
    callback(snap.data());
  });
}

export function subscribeToCollectionNode(collectionName, callback) {
  let q = query(collection(FIRESTORE, collectionName));
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

// search and filters
export async function searchCollection(
  collectionPath,
  fieldName,
  searchTerm,
  isText
) {
  let text = isText ? searchTerm.toString() : searchTerm;
  // log("search term", text);
  let q = query(
    collection(FIRESTORE, collectionPath),
    where(fieldName, ">=", text),
    where(fieldName, "<=", text + "\uf8ff")
  );

  let queryRes = [];
  let querySnapshot = await getDocs(q);
  // log("snap empty", querySnapshot.empty.toString());
  querySnapshot.forEach((doc) => {
    // log("doc", doc.data());
    queryRes.push(doc.data());
  });
  return queryRes;
}

export async function filterFirestoreCollectionByNumber(
  collectionPath,
  fieldName,
  startVal,
  endVal
) {
  // log(formatMillisForDisplay(startVal), formatMillisForDisplay(endVal));
  // log(collectionPath);
  let q = query(
    collection(FIRESTORE, collectionPath),
    where(fieldName, ">=", startVal),
    where(fieldName, "<=", endVal)
  );

  let queryRes = [];
  let querySnapshot = await getDocs(q);
  // log("snap empty", querySnapshot.empty.toString());
  querySnapshot.forEach((doc) => {
    // log("doc", doc.data());
    queryRes.push(doc.data());
  });
  return queryRes;
}

///////////////////////////////////////////////////////////////////////
////// Realtime Database calls ////////////////////////////////////////
///////////////////////////////////////////////////////////////////////

// getters //////////////////////////////////////////////////////////
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

// setters ///////////////////////////////////////////////////////////
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

export function setInventoryItem(inventoryObj = INVENTORY_ITEM_PROTO) {
  let dbRef = ref(RDB, "INVENTORY/" + inventoryObj.id);
  return set(dbRef, inventoryObj);
}

// end new firestore calls /////////////

export function subscriptionManualRemove(path) {
  let ref1 = ref(RDB, path);
  off(ref1, "value", (res) => {
    // log("result of manual removal", res);
  });
}

//////////////////////////////////////////////////////////////////////
////// Firebase Function calls ///////////////////////////////////////
//////////////////////////////////////////////////////////////////////
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

// server driven Stripe payments ////////////////////////////////////////////////
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

// export function retrieveAvailableStripeReaders(readerID) {
//   const functions = getFunctions(firebaseApp);
// }

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

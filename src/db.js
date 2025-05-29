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
  COLLECTION_NAMES,
  CUSTOMER_PREVIEW_PROTO,
  CUSTOMER_PROTO,
  INVENTORY_ITEM_PROTO,
  WORKORDER_ITEM_PROTO,
  WORKORDER_PROTO,
} from "./data";
import { isArray } from "lodash";
import { useRef } from "react";
// import { isArray } from "lodash";

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
  fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify(messageBody),
  })
    .then((res) => {
      if (!res.ok) {
        log("FETCH FAILURE HERE IS THE REASON ==> ", res.status);
        return null;
      }
      return res;
    })
    .then((res) => {
      if (res) {
        res.json().then((res) => {
          log("COMPLETE!", res);
          return res;
        });
      }
      log("no res to exist for .json operation");
      return null;
    });
}

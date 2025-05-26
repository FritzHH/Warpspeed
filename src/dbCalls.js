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

export function setCollectionItem(collectionName, item, stringify) {
  let id = item.id;
  if (stringify) item = { item: JSON.stringify(item) };

  let docRef = doc(DB, collectionName, id);
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

// Example Usage
const collectionName = "users";
const documentId = "user123";
const subCollectionName = "orders";
const subDocumentId = "order456";
const data = {
  product: "Laptop",
  quantity: 1,
  price: 1200,
};

// async call
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

// getters
export function getNodeObject(dbRef) {
  get(dbRef).then((snap) => {
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

export function setCustomer(customerObj = CUSTOMER_PROTO) {
  let custPreview = { ...CUSTOMER_PREVIEW_PROTO };
  custPreview.cell = customerObj.cell;
  custPreview.landline = customerObj.landline;
  custPreview.first = customerObj.first;
  custPreview.last = customerObj.last;
  custPreview.id = customerObj.id;

  let id = customerObj.id;
  let previewRef = ref(RDB, "CUSTOMER-PREVIEWS/" + id);
  let dbRef = ref(RDB, "CUSTOMERS/" + id);
  return concurrentDBSet(previewRef, custPreview, dbRef, customerObj);
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
export function subscribeToNode(nodePath, callback) {
  let dbRef = ref(RDB, nodePath);
  let childChanged, childAdded, childRemoved;
  return new Promise(async (resolve, reject) => {
    childChanged = await subscribeToNodeChange(dbRef, callback);
    childAdded = await subscribeToNodeAddition(dbRef, callback);
    childRemoved = await subscribeToNodeRemoval(dbRef, callback);
    resolve({
      childChanged,
      childAdded,
      childRemoved,
    });
  });
}

function subscribeToNodeChange(dbRef, callback) {
  onChildChanged(dbRef, (snap) => {
    // log("incoming child CHANGED event", snap.val());
    if (snap.val()) {
      callback("changed", snap.key, snap.val());
    } else {
      log("incoming child changed event nothing in it", snap);
    }
  });
}

function subscribeToNodeRemoval(dbRef, callback) {
  onChildRemoved(dbRef, (snap) => {
    // log("incoming child REMOVED event", snap.val());
    if (snap.val()) {
      callback("removed", snap.key, snap.val());
    }
  });
}

function subscribeToNodeAddition(dbRef, callback) {
  onChildAdded(dbRef, (snap) => {
    // log("incoming child ADDED event", snap.val());
    if (snap.val()) {
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

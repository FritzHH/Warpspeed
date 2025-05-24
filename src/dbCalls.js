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

import { getDatabase, onValue, ref, set } from "firebase/database";
import { initializeApp } from "firebase/app";
import { log } from "./utils";
import { COLLECTION_NAMES } from "./data";
import { isArray } from "lodash";
// import { isArray } from "lodash";

const firebaseConfig = {
  apiKey: "AIzaSyBcDa03BacWhVaUaNokgqHCJLkUqkv2gM8",
  authDomain: "ftl-bonitabikes.firebaseapp.com",
  databaseURL: "https://ftl-bonitabikes-default-rtdb.firebaseio.com",
  projectId: "ftl-bonitabikes",
  storageBucket: "ftl-bonitabikes.firebasestorage.app",
  messagingSenderId: "229464948114",
  appId: "1:229464948114:web:e76caf7d57cfa1840b154b",
  measurementId: "G-8W4VJBGDY1",
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

////// Realtime Database calls ////////////////////////////////////////

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

export function subscribeToCustomerMessageNode(customerPhone, callback) {
  let dbRef = ref(RDB, "MESSAGES/" + customerPhone);
  onValue(
    dbRef,
    (snap) => {
      callback(snap.val());
    },
    (e) => {
      log("ERROR WATCHING REALTIME NODE subscribeToCustomerMessageNode()", e);
    }
  );
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

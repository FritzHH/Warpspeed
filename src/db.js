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
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from "firebase/auth";

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

import { getFunctions, httpsCallable } from "firebase/functions";

import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  uploadString,
  getDownloadURL,
  deleteObject,
  listAll,
} from "firebase/storage";

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
  STRIPE_INITIATE_REFUND_URL,
} from "./private_user_constants";
import { firebaseApp } from "./init";
import { isArray } from "lodash";

//todo move these to database and call on page load
import {
  SMS_URL,
  STRIPE_CONNECTION_TOKEN_FIREBASE_URL,
  STRIPE_CANCEL_PAYMENT_INTENT_URL,
  STRIPE_INITIATE_PAYMENT_INTENT_URL,
  STRIPE_GET_AVAIALABLE_STRIPE_READERS_URL,
} from "./private_user_constants";
import { FIRESTORE_COLLECTION_NAMES } from "./constants";

// Initialize Firebase
const FIRESTORE = getFirestore(firebaseApp);
// const FIRESTORE = getFirestore(initializeApp(firebaseConfig));
// const FIRESTORE = initializeFirestore(initializeApp(firebaseConfig), {
//   localCache: persistentLocalCache(/*settings*/ {}),
// });
// disableNetwork(FIRESTORE);
export const RDB = getDatabase();

// Initialize Firebase Auth
export const AUTH = getAuth(firebaseApp);

// Initialize Firebase Functions
const functions = getFunctions(firebaseApp);

// Initialize Firebase Storage
const storage = getStorage(firebaseApp);

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

async function set_firestore_field(path, obj, merge) {
  // log(path, item);
  let docRef = doc(FIRESTORE, path);
  // return await setDoc(docRef, { ...obj });
  setDoc(docRef, obj, { merge });
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
  // log("path2 ", path);

  let dbRef = ref(RDB, path);
  return onChildChanged(dbRef, (snap) => {
    // log("snap", snap);
    if (snap.val()) {
      // log("node change", snap.val());
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
  // log("path", path);
  // log(callback);
  let dbRef = ref(RDB, path);
  return onChildAdded(dbRef, (snap) => {
    // log("raw db snap", snap);
    if (snap.val()) {
      // clog("node addition", snap.val());
      callback(snap.key, snap.val());
    }
  });
}

// exposed db calls ////////////////////////////////

export function newSetDatabaseField(path, item, remove, merge) {
  if (checkDBPath(path) === "firestore") {
    // log(item, merge.toString());
    if (remove) return remove_firestore_field(path, item.id);
    return set_firestore_field(path, item, merge);
  }
  // log(path, item);
  if (remove) return setRealtimeNodeItem(path, null);
  return setRealtimeNodeItem(path, item);
}

export async function getFirestoreDoc(path) {
  let ref = doc(FIRESTORE, path);
  return (await getDoc(ref)).data();
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

export async function SET_FIRESTORE_FIELD(path, item, merge) {
  if (item.id) {
    // is document
    let docRef = doc(FIRESTORE, path, item.id);
    return await setDoc(docRef, item, { merge });
  } else {
    let docRef = doc(FIRESTORE, path);
    return await setDoc(docRef, item, { merge });
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

// Create callable functions
const sendSMSCallable = httpsCallable(functions, "sendSMS");
const processServerDrivenStripePaymentCallable = httpsCallable(
  functions,
  "initiatePaymentIntent"
);
const processServerDrivenStripeRefundCallable = httpsCallable(
  functions,
  "initiateRefund"
);
const cancelServerDrivenStripePaymentCallable = httpsCallable(
  functions,
  "cancelServerDrivenStripePayment"
);
const retrieveAvailableStripeReadersCallable = httpsCallable(
  functions,
  "getAvailableStripeReaders"
);

export function sendSMS(messageBody) {
  return sendSMSCallable(messageBody)
    .then((result) => {
      log("SMS sent successfully:", result.data);
      return result.data;
    })
    .catch((error) => {
      log("Error sending SMS:", error);
      throw error;
    });
}

// server driven Stripe payments ////////////////////////////////////////////////
export function processServerDrivenStripePayment(
  saleAmount,
  readerID,
  paymentIntentID
) {
  log(readerID);
  return processServerDrivenStripePaymentCallable({
    amount: Number(saleAmount),
    readerID,
    paymentIntentID,
  })
    .then((result) => {
      log("Payment initiated successfully:", result.data);
      return result.data;
    })
    .catch((error) => {
      log("Error initiating payment:", error);
      throw error;
    });
}

export function processServerDrivenStripeRefund(amount, paymentIntentID) {
  return processServerDrivenStripeRefundCallable({
    amount,
    paymentIntentID,
  })
    .then((result) => {
      log("Refund initiated successfully:", result.data);
      return result.data;
    })
    .catch((error) => {
      log("Error initiating refund:", error);
      throw error;
    });
}

export function cancelServerDrivenStripePayment(readerID) {
  return cancelServerDrivenStripePaymentCallable({
    readerID,
  })
    .then((result) => {
      log("Payment cancelled successfully:", result.data);
      return result.data;
    })
    .catch((error) => {
      log("Error cancelling payment:", error);
      throw error;
    });
}

export function retrieveAvailableStripeReaders(readerID) {
  return retrieveAvailableStripeReadersCallable({
    readerID,
  })
    .then((result) => {
      log("Stripe readers retrieved successfully:", result.data);
      return result.data;
    })
    .catch((error) => {
      log("Error retrieving Stripe readers:", error);
      throw error;
    });
}

//////////////////////////////////////////////////////////////////////
////// Firebase Authentication Functions /////////////////////////////
//////////////////////////////////////////////////////////////////////

/**
 * Sign in with email and password
 * @param {string} email - User's email
 * @param {string} password - User's password
 * @returns {Promise<Object>} - Returns user object on success
 */
export async function signInWithEmail(email, password) {
  try {
    const userCredential = await signInWithEmailAndPassword(
      AUTH,
      email,
      password
    );
    const user = userCredential.user;

    log("User signed in successfully:", user.email);
    return {
      success: true,
      user: {
        uid: user.uid,
        email: user.email,
        emailVerified: user.emailVerified,
        displayName: user.displayName,
        phoneNumber: user.phoneNumber,
        photoURL: user.photoURL,
        isAnonymous: user.isAnonymous,
        metadata: {
          creationTime: user.metadata.creationTime,
          lastSignInTime: user.metadata.lastSignInTime,
        },
      },
    };
  } catch (error) {
    log("Error signing in:", error);
    throw error;
  }
}

/**
 * Create a new user account with email and password
 * @param {string} email - User's email
 * @param {string} password - User's password
 * @returns {Promise<Object>} - Returns user object on success
 */
export async function createUserWithEmail(email, password) {
  try {
    const userCredential = await createUserWithEmailAndPassword(
      AUTH,
      email,
      password
    );
    const user = userCredential.user;

    // Send email verification
    await sendEmailVerification(user);

    log("User created successfully:", user.email);
    return {
      success: true,
      user: {
        uid: user.uid,
        email: user.email,
        emailVerified: user.emailVerified,
        displayName: user.displayName,
        phoneNumber: user.phoneNumber,
        photoURL: user.photoURL,
        isAnonymous: user.isAnonymous,
        metadata: {
          creationTime: user.metadata.creationTime,
          lastSignInTime: user.metadata.lastSignInTime,
        },
      },
    };
  } catch (error) {
    log("Error creating user:", error);
    throw error;
  }
}

/**
 * Sign out the current user
 * @returns {Promise<Object>} - Returns success status
 */
export async function signOutUser() {
  try {
    await signOut(AUTH);
    log("User signed out successfully");
    return { success: true };
  } catch (error) {
    log("Error signing out:", error);
    throw error;
  }
}

/**
 * Send password reset email
 * @param {string} email - User's email
 * @returns {Promise<Object>} - Returns success status
 */
export async function sendPasswordReset(email) {
  try {
    await sendPasswordResetEmail(AUTH, email);
    log("Password reset email sent to:", email);
    return { success: true };
  } catch (error) {
    log("Error sending password reset email:", error);
    throw error;
  }
}

/**
 * Update user password
 * @param {string} newPassword - New password
 * @returns {Promise<Object>} - Returns success status
 */
export async function updateUserPassword(newPassword) {
  try {
    const user = AUTH.currentUser;
    if (!user) {
      throw new Error("No user is currently signed in");
    }

    await updatePassword(user, newPassword);
    log("Password updated successfully");
    return { success: true };
  } catch (error) {
    log("Error updating password:", error);
    throw error;
  }
}

/**
 * Listen to authentication state changes
 * @param {Function} callback - Callback function to handle auth state changes
 * @returns {Function} - Unsubscribe function
 */
export function onAuthStateChange(callback) {
  return onAuthStateChanged(AUTH, callback);
}

//////////////////////////////////////////////////////////////////////
////// Google Cloud Storage Functions ///////////////////////////////
//////////////////////////////////////////////////////////////////////

/**
 * Upload a file to Google Cloud Storage bucket
 * @param {File|Blob} file - The file to upload
 * @param {string} path - The path in the bucket (e.g., 'images/profile.jpg')
 * @param {Object} metadata - Optional metadata for the file
 * @returns {Promise<Object>} - Returns { success: true, downloadURL: string, path: string }
 */
export async function uploadFileToStorage(file, path, metadata = {}) {
  try {
    // Create a reference to the file location in storage
    const fileRef = storageRef(storage, path);

    // Upload the file
    const snapshot = await uploadBytes(fileRef, file, metadata);

    // Get the download URL
    const downloadURL = await getDownloadURL(snapshot.ref);

    log(`File uploaded successfully: ${path}`);
    return {
      success: true,
      downloadURL,
      path: snapshot.ref.fullPath,
      metadata: snapshot.metadata,
    };
  } catch (error) {
    log("Error uploading file to storage:", error);
    throw error;
  }
}

/**
 * Upload a string (JSON, text, etc.) to Google Cloud Storage bucket
 * @param {string} content - The string content to upload
 * @param {string} path - The path in the bucket (e.g., 'data/config.json')
 * @param {string} format - The format type ('raw' or 'base64')
 * @returns {Promise<Object>} - Returns { success: true, downloadURL: string, path: string }
 */
export async function uploadStringToStorage(content, path, format = "raw") {
  try {
    // Create a reference to the file location in storage
    const fileRef = storageRef(storage, path);

    // Upload the string
    const snapshot = await uploadString(fileRef, content, format);

    // Get the download URL
    const downloadURL = await getDownloadURL(snapshot.ref);

    log(`String uploaded successfully: ${path}`);
    return {
      success: true,
      downloadURL,
      path: snapshot.ref.fullPath,
    };
  } catch (error) {
    log("Error uploading string to storage:", error);
    throw error;
  }
}

/**
 * Get the download URL for a file in storage
 * @param {string} path - The path to the file in storage
 * @returns {Promise<string>} - The download URL
 */
export async function getFileDownloadURL(path) {
  try {
    const fileRef = storageRef(storage, path);
    const downloadURL = await getDownloadURL(fileRef);
    return downloadURL;
  } catch (error) {
    log("Error getting download URL:", error);
    throw error;
  }
}

/**
 * Delete a file from Google Cloud Storage bucket
 * @param {string} path - The path to the file in storage
 * @returns {Promise<Object>} - Returns { success: true, path: string }
 */
export async function deleteFileFromStorage(path) {
  try {
    const fileRef = storageRef(storage, path);
    await deleteObject(fileRef);

    log(`File deleted successfully: ${path}`);
    return {
      success: true,
      path,
    };
  } catch (error) {
    log("Error deleting file from storage:", error);
    throw error;
  }
}

/**
 * List all files in a storage folder
 * @param {string} folderPath - The folder path in storage (e.g., 'images/')
 * @returns {Promise<Array>} - Array of file references and metadata
 */
export async function listFilesInStorage(folderPath = "") {
  try {
    const folderRef = storageRef(storage, folderPath);
    const result = await listAll(folderRef);

    const files = result.items.map((itemRef) => ({
      name: itemRef.name,
      fullPath: itemRef.fullPath,
      bucket: itemRef.bucket,
    }));

    const folders = result.prefixes.map((prefixRef) => ({
      name: prefixRef.name,
      fullPath: prefixRef.fullPath,
    }));

    log(`Listed files in folder: ${folderPath}`);
    return {
      files,
      folders,
      totalFiles: files.length,
      totalFolders: folders.length,
    };
  } catch (error) {
    log("Error listing files in storage:", error);
    throw error;
  }
}


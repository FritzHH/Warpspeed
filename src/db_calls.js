// Firebase configuration and "dumb" database operations
// This file contains only Firebase SDK operations - no business logic

import { initializeApp } from "firebase/app";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  serverTimestamp,
  onSnapshot,
} from "firebase/firestore";
import {
  getDatabase,
  ref,
  set,
  get,
  update,
  remove,
  onValue,
  off,
} from "firebase/database";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
} from "firebase/auth";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  uploadString,
  getDownloadURL,
  deleteObject,
  listAll,
} from "firebase/storage";
import { getFunctions, httpsCallable } from "firebase/functions";
import { log } from "./utils";

// Firebase configuration
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
const firebaseApp = initializeApp(firebaseConfig);

// Initialize services
export const DB = getFirestore(firebaseApp);
export const RDB = getDatabase(firebaseApp);
export const AUTH = getAuth(firebaseApp);
export const STORAGE = getStorage(firebaseApp);
export const FUNCTIONS = getFunctions(firebaseApp);
// Initialize Firebase Functions
const functions = getFunctions(firebaseApp);
// Initialize Firebase Storage
const storage = getStorage(firebaseApp);

// ============================================================================
// FIRESTORE OPERATIONS (Dumb functions - no business logic)
// ============================================================================

/**
 * Write a document to Firestore
 * @param {string} path - Document path (e.g., "tenants/123/users/456")
 * @param {Object} data - Document data
 * @returns {Promise<void>}
 */
export async function firestoreWrite(path, data) {
  try {
    const docRef = doc(DB, ...path.split("/"));
    await setDoc(docRef, data);
    return {
      success: true,
      message: "Document written successfully",
      path: path,
    };
  } catch (error) {
    log("Error in firestoreWrite:", error);
    return {
      success: false,
      error: error.message,
      message: "Failed to write document",
      path: path,
    };
  }
}

/**
 * Read a document from Firestore
 * @param {string} path - Document path
 * @returns {Promise<Object|null>} Document data or null if not found
 */
export async function firestoreRead(path) {
  const docRef = doc(DB, ...path.split("/"));
  const docSnap = await getDoc(docRef);
  return docSnap.exists() ? docSnap.data() : null;
}

/**
 * Update a document in Firestore
 * @param {string} path - Document path
 * @param {Object} data - Update data
 * @returns {Promise<void>}
 */
export async function firestoreUpdate(path, data) {
  const docRef = doc(DB, ...path.split("/"));
  await updateDoc(docRef, data);
}

/**
 * Delete a document from Firestore
 * @param {string} path - Document path
 * @returns {Promise<void>}
 */
export async function firestoreDelete(path) {
  const docRef = doc(DB, ...path.split("/"));
  await deleteDoc(docRef);
}

/**
 * Query Firestore collection
 * @param {string} collectionPath - Collection path
 * @param {Array} whereClauses - Array of where clauses
 * @param {Object} options - Query options (orderBy, limit, etc.)
 * @returns {Promise<Array>} Query results
 */
export async function firestoreQuery(
  collectionPath,
  whereClauses = [],
  options = {}
) {
  const collectionRef = collection(DB, ...collectionPath.split("/"));
  let q = collectionRef;

  // Apply where clauses
  whereClauses.forEach((clause) => {
    q = query(q, where(clause.field, clause.operator, clause.value));
  });

  // Apply options
  if (options.orderBy) {
    q = query(
      q,
      orderBy(options.orderBy.field, options.orderBy.direction || "asc")
    );
  }
  if (options.limit) {
    q = query(q, limit(options.limit));
  }

  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

/**
 * Subscribe to a Firestore document for real-time updates
 * @param {string} path - Document path (e.g., "tenants/123/stores/456/settings/settings")
 * @param {Function} callback - Callback function called with document data
 * @returns {Function} Unsubscribe function to stop listening
 */
export function firestoreSubscribe(path, callback) {
  const docRef = doc(DB, ...path.split("/"));

  // Set up the snapshot listener
  const unsubscribe = onSnapshot(
    docRef,
    (docSnap) => {
      if (docSnap.exists()) {
        callback(docSnap.data());
      } else {
        callback(null); // Document doesn't exist
      }
    },
    (error) => {
      console.error("Firestore subscription error:", error);
      callback(null, error);
    }
  );

  return unsubscribe;
}

/**
 * Subscribe to a Firestore collection for real-time updates
 * @param {string} path - Collection path (e.g., "tenants/123/stores/456/open-workorders")
 * @param {Function} callback - Callback function called with array of documents
 * @returns {Function} Unsubscribe function to stop listening
 */
export function firestoreSubscribeCollection(path, callback) {
  const collectionRef = collection(DB, ...path.split("/"));

  // Set up the snapshot listener
  const unsubscribe = onSnapshot(
    collectionRef,
    (querySnapshot) => {
      const documents = [];
      querySnapshot.forEach((doc) => {
        documents.push({ id: doc.id, ...doc.data() });
      });
      callback(documents);
    },
    (error) => {
      console.error("Firestore collection subscription error:", error);
      callback([], error);
    }
  );

  return unsubscribe;
}

// ============================================================================
// REALTIME DATABASE OPERATIONS (Dumb functions)
// ============================================================================

/**
 * Write data to Realtime Database
 * @param {string} path - Database path
 * @param {Object} data - Data to write
 * @returns {Promise<void>}
 */
export async function rdbWrite(path, data) {
  const dbRef = ref(RDB, path);
  await set(dbRef, data);
}

/**
 * Read data from Realtime Database
 * @param {string} path - Database path
 * @returns {Promise<Object|null>} Data or null if not found
 */
export async function rdbRead(path) {
  const dbRef = ref(RDB, path);
  const snapshot = await get(dbRef);
  return snapshot.exists() ? snapshot.val() : null;
}

/**
 * Update data in Realtime Database
 * @param {string} path - Database path
 * @param {Object} data - Update data
 * @returns {Promise<void>}
 */
export async function rdbUpdate(path, data) {
  const dbRef = ref(RDB, path);
  await update(dbRef, data);
}

/**
 * Delete data from Realtime Database
 * @param {string} path - Database path
 * @returns {Promise<void>}
 */
export async function rdbDelete(path) {
  const dbRef = ref(RDB, path);
  await remove(dbRef);
}

/**
 * Subscribe to Realtime Database changes
 * @param {string} path - Database path
 * @param {Function} callback - Callback function
 * @returns {Function} Unsubscribe function
 */
export function rdbSubscribe(path, callback) {
  const dbRef = ref(RDB, path);
  onValue(dbRef, callback);
  return () => off(dbRef, callback);
}

// ============================================================================
// CLOUD STORAGE OPERATIONS (Dumb functions)
// ============================================================================

/**
 * Upload file to Cloud Storage
 * @param {string} path - Storage path
 * @param {File|Blob} file - File to upload
 * @param {Object} metadata - File metadata
 * @returns {Promise<string>} Download URL
 */
export async function storageUpload(path, file, metadata = {}) {
  const fileRef = storageRef(STORAGE, path);
  const snapshot = await uploadBytes(fileRef, file, metadata);
  return await getDownloadURL(snapshot.ref);
}

/**
 * Upload string to Cloud Storage
 * @param {string} path - Storage path
 * @param {string} content - String content
 * @param {string} format - Content format (raw, base64, etc.)
 * @returns {Promise<string>} Download URL
 */
export async function storageUploadString(path, content, format = "raw") {
  const fileRef = storageRef(STORAGE, path);
  const snapshot = await uploadString(fileRef, content, format);
  return await getDownloadURL(snapshot.ref);
}

/**
 * Get download URL from Cloud Storage
 * @param {string} path - Storage path
 * @returns {Promise<string>} Download URL
 */
export async function storageGetDownloadURL(path) {
  const fileRef = storageRef(STORAGE, path);
  return await getDownloadURL(fileRef);
}

/**
 * Delete file from Cloud Storage
 * @param {string} path - Storage path
 * @returns {Promise<void>}
 */
export async function storageDelete(path) {
  const fileRef = storageRef(STORAGE, path);
  await deleteObject(fileRef);
}

/**
 * List files in Cloud Storage
 * @param {string} path - Storage path
 * @returns {Promise<Array>} List of files
 */
export async function storageList(path) {
  const fileRef = storageRef(STORAGE, path);
  const result = await listAll(fileRef);
  return result.items.map((item) => ({
    name: item.name,
    fullPath: item.fullPath,
    size: item.size,
    timeCreated: item.timeCreated,
    updated: item.updated,
  }));
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

// ============================================================================
// AUTHENTICATION OPERATIONS (Dumb functions)
// ============================================================================

/**
 * Sign in with email and password
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<Object>} User credential
 */
export async function authSignIn(email, password) {
  return await signInWithEmailAndPassword(AUTH, email, password);
}

/**
 * Sign out current user
 * @returns {Promise<void>}
 */
export async function authSignOut() {
  return await signOut(AUTH);
}

/**
 * Send password reset email
 * @param {string} email - User email
 * @returns {Promise<void>}
 */
export async function authSendPasswordReset(email) {
  return await sendPasswordResetEmail(AUTH, email);
}

/**
 * Listen to authentication state changes
 * @param {Function} callback - Callback function
 * @returns {Function} Unsubscribe function
 */
export function authOnStateChange(callback) {
  return onAuthStateChanged(AUTH, callback);
}

// ============================================================================
// CLOUD FUNCTIONS OPERATIONS (Dumb functions)
// ============================================================================

/**
 * Call a Cloud Function
 * @param {string} functionName - Function name
 * @param {Object} data - Function data
 * @returns {Promise<Object>} Function result
 */
export async function callCloudFunction(functionName, data) {
  const callable = httpsCallable(FUNCTIONS, functionName);
  const result = await callable(data);
  return result.data;
}

// Create callable functions
const sendSMSCallable = httpsCallable(functions, "sendSMS");
const sendSMSEnhancedCallable = httpsCallable(functions, "sendSMSEnhanced");

export const processServerDrivenStripePaymentCallable = httpsCallable(
  functions,
  "initiatePaymentIntentCallable"
);
export const processServerDrivenStripeRefundCallable = httpsCallable(
  functions,
  "initiateRefundCallable"
);
export const cancelServerDrivenStripePaymentCallable = httpsCallable(
  functions,
  "cancelServerDrivenStripePaymentCallable"
);
export const retrieveAvailableStripeReadersCallable = httpsCallable(
  functions,
  "getAvailableStripeReadersCallable"
);
export const loginAppUserCallable = httpsCallable(
  functions,
  "loginAppUserCallable"
);
export const createAppUserCallable = httpsCallable(
  functions,
  "createAppUserCallable"
);
export const createStoreCallable = httpsCallable(
  functions,
  "createStoreCallable"
);
export const createTenantCallable = httpsCallable(
  functions,
  "createTenantCallable"
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

/**
 * Send SMS using enhanced function with comprehensive error handling
 * @param {Object} smsData - SMS data object
 * @param {string} smsData.message - Message content
 * @param {string} smsData.phoneNumber - Phone number (10 digits, US format)
 * @param {string} smsData.tenantID - Tenant ID
 * @param {string} smsData.storeID - Store ID
 * @param {string} [smsData.customerID] - Customer ID (optional)
 * @param {string} [smsData.messageID] - Message ID (optional)
 * @param {string} [smsData.fromNumber] - From phone number (optional, defaults to +12393171234)
 * @returns {Promise<Object>} Result object with success status and data
 */
export function sendSMSEnhanced(smsData) {
  return sendSMSEnhancedCallable(smsData)
    .then((result) => {
      log("Enhanced SMS sent successfully", result.data);
      return {
        success: true,
        data: result.data,
        message: "SMS sent successfully",
      };
    })
    .catch((error) => {
      log("Error sending enhanced SMS", error);

      // Handle Firebase Functions errors
      let errorMessage = "Failed to send SMS";
      let errorCode = "UNKNOWN_ERROR";

      if (error.code) {
        switch (error.code) {
          case "functions/invalid-argument":
            errorMessage = error.message || "Invalid arguments provided";
            errorCode = "INVALID_ARGUMENTS";
            break;
          case "functions/permission-denied":
            errorMessage = error.message || "Permission denied";
            errorCode = "PERMISSION_DENIED";
            break;
          case "functions/resource-exhausted":
            errorMessage = error.message || "Service temporarily unavailable";
            errorCode = "SERVICE_UNAVAILABLE";
            break;
          case "functions/internal":
            errorMessage = error.message || "Internal server error";
            errorCode = "INTERNAL_ERROR";
            break;
          default:
            errorMessage = error.message || "Unknown error occurred";
            errorCode = error.code || "UNKNOWN_ERROR";
        }
      }

      return {
        success: false,
        error: errorMessage,
        code: errorCode,
        details: {
          originalError: error,
          timestamp: new Date().toISOString(),
        },
      };
    });
}

// old functions need to update to use callable

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get server timestamp
 * @returns {Object} Server timestamp
 */
export function getServerTimestamp() {
  return serverTimestamp();
}



// Firebase configuration and "dumb" database operations
// This file contains only Firebase SDK operations - no business logic

import { initializeApp } from "firebase/app";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
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
  writeBatch as firestoreWriteBatch,
  getCountFromServer,
  deleteField,
  documentId,
  connectFirestoreEmulator,
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
  connectDatabaseEmulator,
} from "firebase/database";
import {
  initializeAuth,
  browserLocalPersistence,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  connectAuthEmulator,
} from "firebase/auth";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  uploadString,
  getDownloadURL,
  deleteObject,
  listAll,
  connectStorageEmulator,
} from "firebase/storage";
import { getFunctions, httpsCallable, connectFunctionsEmulator } from "firebase/functions";
import { log } from "./utils";
import { firebaseApp, cadenceCatalogApp } from "./init";
import { APP_BRAND } from "./private_user_constants";

// Initialize services using the existing Firebase app
export const DB = initializeFirestore(firebaseApp, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
  experimentalAutoDetectLongPolling: true,
});

export const RDB = getDatabase(firebaseApp);
// Read-only handle to cadence-pos RTDB for vendor catalogs (cross-project
// when Bonita is on warpspeed-bonitabikes; same as RDB when running on
// cadence-pos itself). Use only via rdbCatalogRead — no writes.
export const CATALOG_RDB = getDatabase(cadenceCatalogApp);
export const AUTH = initializeAuth(firebaseApp, { persistence: browserLocalPersistence });
export const STORAGE = getStorage(firebaseApp);
// Initialize Firebase Functions with region
export const FUNCTIONS = getFunctions(firebaseApp, "us-central1");
const functions = FUNCTIONS;
// Initialize Firebase Storage
const storage = getStorage(firebaseApp);

// Connect to local emulators when running in dev mode with the emulator flag set.
// Production builds (yarn build) never enter this branch because import.meta.env.DEV
// is false. The flag is set by the `yarn start:emulator` script via cross-env.
const USING_EMULATORS =
  import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === "true";

if (USING_EMULATORS) {
  connectFirestoreEmulator(DB, "localhost", 8080);
  connectDatabaseEmulator(RDB, "localhost", 9000);
  connectAuthEmulator(AUTH, "http://localhost:9099", { disableWarnings: true });
  connectStorageEmulator(STORAGE, "localhost", 9199);
  connectFunctionsEmulator(FUNCTIONS, "localhost", 5001);
  console.log(
    `%c[${APP_BRAND}] 🔧 EMULATOR MODE — connected to local Firebase emulators (no production data)`,
    "background:#d97706;color:white;font-weight:bold;padding:4px 8px;border-radius:4px;",
  );
  console.log(
    `[${APP_BRAND}] Emulator ports → Firestore:8080  RTDB:9000  Auth:9099  Storage:9199  Functions:5001  UI:http://localhost:4000`,
  );
} else {
  console.log(
    `%c[${APP_BRAND}] ☁️  PRODUCTION FIREBASE — connected to real project (reads are billed)`,
    "background:#0369a1;color:white;font-weight:bold;padding:4px 8px;border-radius:4px;",
  );
}

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
    let undefinedPaths = [];
    (function scan(obj, prefix) {
      if (obj == null || typeof obj !== "object") return;
      (Array.isArray(obj) ? obj.forEach((v, i) => {
        let fp = prefix + "[" + i + "]";
        if (v === undefined) undefinedPaths.push(fp);
        else if (typeof v === "object" && v !== null) scan(v, fp);
      }) : Object.keys(obj).forEach((k) => {
        let fp = prefix ? prefix + "." + k : k;
        if (obj[k] === undefined) undefinedPaths.push(fp);
        else if (typeof obj[k] === "object" && obj[k] !== null) scan(obj[k], fp);
      }));
    })(data, "");
    if (undefinedPaths.length > 0) {
      let msg = "firestoreWrite UNDEFINED ERROR (pre-flight)\n\n" +
        "Path: " + path + "\n\n" +
        "Undefined fields (" + undefinedPaths.length + "):\n" + undefinedPaths.join("\n") +
        "\n\nStack:\n" + new Error().stack;
      console.error(msg);
      window.alert(msg);
    }
    const docRef = doc(DB, ...path.split("/"));
    await setDoc(docRef, data);
    return {
      success: true,
      message: "Document written successfully",
      path: path,
    };
  } catch (error) {
    log("Error in firestoreWrite:", error);
    if (error.message && error.message.includes("undefined")) {
      window.alert("firestoreWrite FIREBASE ERROR\n\nPath: " + path + "\n\n" + error.message);
    }
    return {
      success: false,
      error: error.message,
      message: "Failed to write document",
      path: path,
    };
  }
}

/**
 * Write multiple documents in a single Firestore batch (max 500 per batch).
 * @param {Array<{path: string, data: Object}>} items - Array of { path, data } objects
 * @returns {Promise<{success: boolean, count: number}>}
 */
export async function firestoreBatchWrite(items) {
  const batch = firestoreWriteBatch(DB);
  for (const item of items) {
    const docRef = doc(DB, ...item.path.split("/"));
    batch.set(docRef, item.data);
  }
  await batch.commit();
  return { success: true, count: items.length };
}

/**
 * Delete multiple documents in Firestore batches (max 500 per batch).
 * @param {string} collectionPath - Full collection path
 * @param {Array<{id: string}>} docs - Array of doc objects with id field
 * @returns {Promise<{success: boolean, count: number}>}
 */
export async function firestoreBatchDelete(collectionPath, docs) {
  const BATCH_LIMIT = 500;
  let deleted = 0;
  for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
    const chunk = docs.slice(i, i + BATCH_LIMIT);
    const batch = firestoreWriteBatch(DB);
    for (const d of chunk) {
      const docRef = doc(DB, ...`${collectionPath}/${d.id}`.split("/"));
      batch.delete(docRef);
    }
    await batch.commit();
    deleted += chunk.length;
  }
  return { success: true, count: deleted };
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

// Batched read by document id. Firestore caps `in` queries at 30 values, so
// callers can pass any-size id arrays and we chunk transparently. Returns a
// Map<id, data> with one entry per doc that EXISTS — missing ids are absent
// from the Map (callers handle "no entry = zero/empty" themselves).
export async function firestoreReadDocsByIds(collectionPath, ids) {
  const out = new Map();
  if (!Array.isArray(ids) || ids.length === 0) return out;
  const unique = Array.from(new Set(ids.filter(Boolean).map(String)));
  if (unique.length === 0) return out;
  const collectionRef = collection(DB, ...collectionPath.split("/"));
  const CHUNK = 30;
  const chunks = [];
  for (let i = 0; i < unique.length; i += CHUNK) {
    chunks.push(unique.slice(i, i + CHUNK));
  }
  const snapshots = await Promise.all(
    chunks.map((chunk) => getDocs(query(collectionRef, where(documentId(), "in", chunk)))),
  );
  snapshots.forEach((snap) => {
    snap.docs.forEach((d) => out.set(d.id, d.data()));
  });
  return out;
}

export async function firestoreCount(collectionPath, field, operator, value) {
  const collectionRef = collection(DB, ...collectionPath.split("/"));
  const q = query(collectionRef, where(field, operator, value));
  const snapshot = await getCountFromServer(q);
  return snapshot.data().count;
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
      const meta = {
        fromCache: docSnap.metadata.fromCache,
        hasPendingWrites: docSnap.metadata.hasPendingWrites,
        changes: 1,
        total: docSnap.exists() ? 1 : 0,
      };
      if (docSnap.exists()) {
        callback(docSnap.data(), null, meta);
      } else {
        callback(null, null, meta); // Document doesn't exist
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
      const meta = {
        fromCache: querySnapshot.metadata.fromCache,
        hasPendingWrites: querySnapshot.metadata.hasPendingWrites,
        changes: querySnapshot.docChanges().length,
        total: querySnapshot.size,
      };
      callback(documents, null, meta);
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
 * Read data from the cadence-pos vendor-catalog Realtime Database.
 * Use for paths under `vendor_catalogs/*`. Cross-project on Bonita; same
 * as rdbRead when the app runs on cadence-pos itself.
 * @param {string} path - Database path (e.g., `vendor_catalogs/jbi/items/<id>`)
 * @returns {Promise<Object|null>} Data or null if not found
 */
export async function rdbCatalogRead(path) {
  const dbRef = ref(CATALOG_RDB, path);
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
const sendEmailCallable = httpsCallable(functions, "sendEmailCallable");
const uploadPDFAndSendSMSCallableRef = httpsCallable(functions, "uploadPDFAndSendSMSCallable");
const generateReceiptPDFCallableRef = httpsCallable(functions, "generateReceiptPDFCallable");
const sendReceiptCallableRef = httpsCallable(functions, "sendReceiptCallable");
const translateTextCallableRef = httpsCallable(functions, "translateTextCallable");

// Gmail callable references
const gmailInitiateAuthCallable = httpsCallable(functions, "gmailInitiateAuth");
const gmailSyncEmailsCallable = httpsCallable(functions, "gmailSyncEmails");
const gmailSendEmailCallable = httpsCallable(functions, "gmailSendEmail");
const gmailModifyLabelsCallable = httpsCallable(functions, "gmailModifyLabels");
const gmailGetAttachmentCallable = httpsCallable(functions, "gmailGetAttachment");
const gmailDisconnectCallable = httpsCallable(functions, "gmailDisconnect");
const gmailReconnectWatchCallable = httpsCallable(functions, "gmailReconnectWatch");


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
export const lightspeedInitiateAuthCallable = httpsCallable(
  functions,
  "lightspeedInitiateAuth"
);
export const lightspeedCheckConnectionCallable = httpsCallable(
  functions,
  "lightspeedCheckConnection"
);
export const lightspeedImportDataCallable = httpsCallable(
  functions,
  "lightspeedImportData"
);
export const rehydrateFromArchiveCallable = httpsCallable(
  functions,
  "rehydrateFromArchive"
);
export const manualArchiveAndCleanupCallable = httpsCallable(
  functions,
  "manualArchiveAndCleanup"
);
export const createTextToPayInvoiceCallable = httpsCallable(
  functions,
  "createTextToPayInvoice"
);
export const generateIdCallable = httpsCallable(functions, "generateId");
export const migrateCustomerPhoneCallable = httpsCallable(functions, "migrateCustomerPhone");

// SaaS Twilio — outbound SMS/MMS (deployed to cadence-pos project only)
export const sendTwilioMessageCallable = httpsCallable(
  functions,
  "sendTwilioMessage"
);

// Stripe Connect — SaaS onboarding (deployed to cadence-pos project only)
export const stripeConnectAccountCreateCallable = httpsCallable(
  functions,
  "stripeConnectAccountCreate"
);
export const stripeConnectAccountLinkCreateCallable = httpsCallable(
  functions,
  "stripeConnectAccountLinkCreate"
);
export const stripeConnectAccountStatusCallable = httpsCallable(
  functions,
  "stripeConnectAccountStatusCallable"
);
export const stripeConnectCreateTerminalLocationCallable = httpsCallable(
  functions,
  "stripeConnectCreateTerminalLocationCallable"
);
export const stripeConnectRegisterReaderCallable = httpsCallable(
  functions,
  "stripeConnectRegisterReaderCallable"
);
export const stripeConnectListReadersCallable = httpsCallable(
  functions,
  "stripeConnectListReadersCallable"
);
export const stripeConnectConnectionTokenCallable = httpsCallable(
  functions,
  "stripeConnectConnectionTokenCallable"
);
export const stripeConnectCreateTapToPayPaymentIntentCallable = httpsCallable(
  functions,
  "stripeConnectCreateTapToPayPaymentIntentCallable"
);

// SaaS tenant user management — Auth + tenant identity doc + per-store entry
// (deployed to cadence-pos project only)
export const tenantCreateUserCallable = httpsCallable(
  functions,
  "tenantCreateUserCallable"
);
export const tenantUpdateUserCallable = httpsCallable(
  functions,
  "tenantUpdateUserCallable"
);
export const tenantDeleteUserCallable = httpsCallable(
  functions,
  "tenantDeleteUserCallable"
);

// SaaS passwordless sign-in — request a 6-digit code via email, verify back
// to mint a custom sign-in token (deployed to cadence-pos project only)
export const requestSignInCodeCallable = httpsCallable(
  functions,
  "requestSignInCodeCallable"
);
export const verifySignInCodeCallable = httpsCallable(
  functions,
  "verifySignInCodeCallable"
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

export function uploadPDFAndSendSMS(data) {
  return uploadPDFAndSendSMSCallableRef(data)
    .then((result) => {
      log("PDF upload + SMS sent successfully", result.data);
      return { success: true, data: result.data };
    })
    .catch((error) => {
      log("Error in uploadPDFAndSendSMS", error);
      return {
        success: false,
        error: error.message || "Failed to upload PDF and send SMS",
        code: error.code || "UNKNOWN_ERROR",
      };
    });
}

export function generateReceiptPDF(data) {
  return generateReceiptPDFCallableRef(data)
    .then((result) => {
      return { success: true, data: result.data };
    })
    .catch((error) => {
      log("Error in generateReceiptPDF", error);
      return {
        success: false,
        error: error.message || "Failed to generate receipt PDF",
      };
    });
}

export function sendReceipt(data) {
  return sendReceiptCallableRef(data)
    .then((result) => {
      return { success: true, data: result.data };
    })
    .catch((error) => {
      log("Error in sendReceipt", error);
      return {
        success: false,
        error: error.message || "Failed to send receipt",
      };
    });
}

export function sendEmail(emailData) {
  return sendEmailCallable(emailData)
    .then((result) => {
      log("Email sent successfully", result.data);
      return {
        success: true,
        data: result.data,
        message: "Email sent successfully",
      };
    })
    .catch((error) => {
      log("Error sending email", error);

      let errorMessage = "Failed to send email";
      let errorCode = "UNKNOWN_ERROR";

      if (error.code) {
        switch (error.code) {
          case "functions/invalid-argument":
            errorMessage = error.message || "Invalid arguments provided";
            errorCode = "INVALID_ARGUMENTS";
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

export function translateText(translateData) {
  return translateTextCallableRef(translateData)
    .then((result) => {
      log("Translation successful", result.data);
      return { success: true, data: result.data };
    })
    .catch((error) => {
      log("Error translating text", error);

      let errorMessage = "Failed to translate text";
      let errorCode = "UNKNOWN_ERROR";

      if (error.code) {
        switch (error.code) {
          case "functions/invalid-argument":
            errorMessage = error.message || "Invalid arguments provided";
            errorCode = "INVALID_ARGUMENTS";
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

// ============================================================================
// GMAIL API FUNCTIONS
// ============================================================================

export function gmailInitiateAuth(data) {
  return gmailInitiateAuthCallable(data)
    .then((result) => ({ success: true, data: result.data }))
    .catch((error) => {
      log("Error initiating Gmail auth", error);
      return { success: false, error: error.message || "Failed to initiate Gmail auth" };
    });
}

export function gmailSyncEmails(data) {
  return gmailSyncEmailsCallable(data)
    .then((result) => ({ success: true, data: result.data }))
    .catch((error) => {
      log("Error syncing Gmail emails", error);
      return { success: false, error: error.message || "Failed to sync emails" };
    });
}

export function gmailReconnectWatch(data) {
  return gmailReconnectWatchCallable(data)
    .then((result) => ({ success: true, data: result.data }))
    .catch((error) => {
      log("Error reconnecting Gmail watch", error);
      return { success: false, error: error.message || "Failed to reconnect watch" };
    });
}

export function gmailSendNewEmail(data) {
  return gmailSendEmailCallable(data)
    .then((result) => ({ success: true, data: result.data }))
    .catch((error) => {
      log("Error sending Gmail email", error);
      return { success: false, error: error.message || "Failed to send email" };
    });
}

export function gmailModifyLabels(data) {
  return gmailModifyLabelsCallable(data)
    .then((result) => ({ success: true, data: result.data }))
    .catch((error) => {
      log("Error modifying Gmail labels", error);
      return { success: false, error: error.message || "Failed to modify labels" };
    });
}

export function gmailGetAttachment(data) {
  return gmailGetAttachmentCallable(data)
    .then((result) => ({ success: true, data: result.data }))
    .catch((error) => {
      log("Error getting Gmail attachment", error);
      return { success: false, error: error.message || "Failed to get attachment" };
    });
}

export function gmailDisconnect(data) {
  return gmailDisconnectCallable(data)
    .then((result) => ({ success: true, data: result.data }))
    .catch((error) => {
      log("Error disconnecting Gmail", error);
      return { success: false, error: error.message || "Failed to disconnect Gmail" };
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



// Smart database wrapper - handles path building, validation, and business logic
// This file contains all business logic and calls the "dumb" db.js functions

import { log, removeEmptyFields, stringifyAllObjectFields, compressImage, localStorageWrapper, capitalizeFirstLetterOfString } from "./utils";
import * as _storesModule from "./stores";
import { takeId, getId } from "./idPool";
import {
  DB_NODES,
  MILLIS_IN_MINUTE,
  PRINT_JOB_TIMEOUT_MS,
  build_db_path,
} from "./constants";
import {
  firestoreWrite,
  firestoreRead,
  firestoreUpdate,
  firestoreQuery,
  firestoreReadDocsByIds,
  rdbRead,
  rdbCatalogRead,
  firestoreCatalogQuery,
  firestoreCatalogRead,
  firestoreSubscribe,
  firestoreSubscribeCollection,
  firestoreDelete,
  authSignIn,
  authSignOut,
  getServerTimestamp,
  AUTH,
  DB,
  processServerDrivenStripePaymentCallable,
  processServerDrivenStripeRefundCallable,
  cancelServerDrivenStripePaymentCallable,
  retrieveAvailableStripeReadersCallable,
  loginAppUserCallable,
  sendSMSEnhanced,
  sendEmail,
  uploadFileToStorage,
  storageDelete,
  uploadPDFAndSendSMS,
  generateReceiptPDF,
  sendReceipt,
  rehydrateFromArchiveCallable,
  manualArchiveAndCleanupCallable,
  createTextToPayInvoiceCallable,
  sendTwilioMessageCallable,
  firestoreBatchWrite,
  firestoreBatchDelete,
  migrateCustomerPhoneCallable,
  gmailInitiateAuth,
  gmailSyncEmails,
  gmailSendNewEmail,
  gmailModifyLabels,
  gmailGetAttachment,
  gmailDisconnect,
  gmailReconnectWatch,
  roadCallInitiate,
  roadCallCancel,
} from "./db_calls";
import { removeUnusedFields, createNewWorkorder, buildWorkorderNumberFromId } from "./utils";
import { useSettingsStore, useLoginStore, useOpenWorkordersStore, useInventoryStore, clearPersistedStores } from "./stores";
import { VENDOR_CATALOGS } from "./data";
import {
  onAuthStateChanged,
  sendPasswordResetEmail,
  updatePassword,
} from "firebase/auth";
import { collection, doc, query, orderBy, where, onSnapshot, deleteField } from "firebase/firestore";

function __logListenerAttach() {}
function __logListenerDetach() {}
function __logListenerEmit() {}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get tenantID and storeID from Zustand store
 * @returns {Object} Object with tenantID and storeID
 */
function getTenantAndStore() {
  const state = useSettingsStore.getState();
  // log("Full settings state:", state);

  const settings = state.settings;
  // log("Settings object:", settings);

  const tenantID = settings?.tenantID;
  const storeID = settings?.storeID;

  // log("tenantID:", tenantID);
  // log("storeID:", storeID);

  return { tenantID, storeID };
}

// ============================================================================
// PATH BUILDING UTILITIES
// ============================================================================

/**
 * Build Firestore path for settings (ensures even number of segments)
 * @param {string} tenantID - Tenant ID
 * @param {string} storeID - Store ID
 * @returns {string} Full Firestore path for settings document
 */
function buildSettingsPath(tenantID, storeID) {
  // Firestore path for settings document (separate settings document)
  // Format: tenants/{tenantID}/stores/{storeID}/settings/settings
  return `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/${DB_NODES.FIRESTORE.SETTINGS}/${DB_NODES.FIRESTORE.SETTINGS}`;
}

/**
 * Build Firestore path for phone-config document
 * Format: tenants/{tenantID}/stores/{storeID}/phone-config/main
 */
function buildPhoneConfigPath(tenantID, storeID) {
  return `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/${DB_NODES.FIRESTORE.PHONE_CONFIG}/main`;
}

// Path: tenants/{tenantID}/stores/{storeID}/call-expectations
function buildCallExpectationsCollectionPath(tenantID, storeID) {
  return `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/call-expectations`;
}

function buildCallExpectationPath(tenantID, storeID, customerE164) {
  return `${buildCallExpectationsCollectionPath(tenantID, storeID)}/${customerE164}`;
}

// Same E.164 normalization used server-side in road-voice.js so the doc IDs
// stay aligned between client writes and the inbound webhook lookup.
function normalizeToE164ForRoadCall(raw) {
  let s = String(raw || "").trim();
  const hasPlus = s.startsWith("+");
  s = s.replace(/\D/g, "");
  if (!s) return "";
  if (hasPlus) return `+${s}`;
  if (s.length === 11 && s.startsWith("1")) return `+${s}`;
  if (s.length === 10) return `+1${s}`;
  return "";
}

/**
 * Build Firestore path for customer document (ensures even number of segments)
 * @param {string} tenantID - Tenant ID
 * @param {string} storeID - Store ID
 * @param {string} customerID - Customer ID
 * @returns {string} Full Firestore path for customer document
 */
function buildCustomerPath(tenantID, storeID, customerID) {
  // Firestore paths must have even number of segments (collection/document/collection/document...)
  // Format: tenants/{tenantID}/stores/{storeID}/customers/{customerID}
  return `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/${DB_NODES.FIRESTORE.CUSTOMERS}/${customerID}`;
}

/**
 * Build Firestore path for open workorder document (ensures even number of segments)
 * @param {string} tenantID - Tenant ID
 * @param {string} storeID - Store ID
 * @param {string} workorderID - Workorder ID
 * @returns {string} Full Firestore path for workorder document
 */
function buildWorkorderPath(tenantID, storeID, workorderID) {
  // Firestore paths must have even number of segments (collection/document/collection/document...)
  // Format: tenants/{tenantID}/stores/{storeID}/open-workorders/{workorderID}
  return `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/${DB_NODES.FIRESTORE.OPEN_WORKORDERS}/${workorderID}`;
}

function buildCompletedWorkorderPath(tenantID, storeID, workorderID) {
  return `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/${DB_NODES.FIRESTORE.COMPLETED_WORKORDERS}/${workorderID}`;
}

function buildDeletedWorkorderPath(tenantID, storeID, workorderID) {
  return `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/${DB_NODES.FIRESTORE.DELETED_WORKORDERS}/${workorderID}`;
}

function buildDeletedWorkordersCollectionPath(tenantID, storeID) {
  return `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/${DB_NODES.FIRESTORE.DELETED_WORKORDERS}`;
}

function buildCompletedSalePath(tenantID, storeID, saleID) {
  return `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/${DB_NODES.FIRESTORE.COMPLETED_SALES}/${saleID}`;
}

// Tenant-level user identity collection. Holds canonical identity (name,
// phone, email, PIN, permissions, faceDescriptor, hourlyWage, stores[]).
// Per-store presence + ephemera + the disabled flag live on
// settings.users[i]; the settings listener hydrates per-store entries with
// identity from these docs so readers see the merged APP_USER shape.
// Keyed by the user's Firebase Auth UID.
function buildTenantUserPath(tenantID, userID) {
  return `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.USERS}/${userID}`;
}

function buildTenantUsersCollectionPath(tenantID) {
  return `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.USERS}`;
}

/**
 * Build Firestore path for inventory item document (ensures even number of segments)
 * @param {string} tenantID - Tenant ID
 * @param {string} storeID - Store ID
 * @param {string} itemID - Item ID
 * @returns {string} Full Firestore path for inventory item document
 */
function buildInventoryPath(tenantID, storeID, itemID) {
  // Firestore paths must have even number of segments (collection/document/collection/document...)
  // Format: tenants/{tenantID}/stores/{storeID}/inventory/{itemID}
  return `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/${DB_NODES.FIRESTORE.INVENTORY}/${itemID}`;
}

/**
 * Build Firestore path for punch clock document (ensures even number of segments)
 * @param {string} tenantID - Tenant ID
 * @param {string} storeID - Store ID
 * @param {string} punchID - Punch ID
 * @returns {string} Full Firestore path for punch clock document
 */
function buildPunchPath(tenantID, storeID, punchID) {
  // Firestore paths must have even number of segments (collection/document/collection/document...)
  // Format: tenants/{tenantID}/stores/{storeID}/punches/{punchID}
  return `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/${DB_NODES.FIRESTORE.PUNCHES}/${punchID}`;
}

/**
 * Build Firestore path for current punch clock document (single object node)
 * @param {string} tenantID - Tenant ID
 * @param {string} storeID - Store ID
 * @returns {string} Full Firestore path for current punch clock document
 */
function buildCurrentPunchClockPath(tenantID, storeID) {
  // Firestore paths must have even number of segments (collection/document/collection/document...)
  // Format: tenants/{tenantID}/stores/{storeID}/punch_clock/current
  return `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/${DB_NODES.FIRESTORE.PUNCH_CLOCK}/current`;
}

function buildCurrentMessagesPath(tenantID, storeID) {
  // Format: tenants/{tenantID}/stores/{storeID}/messages/current
  return `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/${DB_NODES.FIRESTORE.MESSAGES}/current`;
}

/**
 * Build Firestore path for printer document (ensures even number of segments)
 * @param {string} tenantID - Tenant ID
 * @param {string} storeID - Store ID
 * @param {string} printerID - Printer ID
 * @returns {string} Full Firestore path for printer document
 */
function buildPrinterPath(tenantID, storeID, printerID) {
  // Firestore paths must have even number of segments (collection/document/collection/document...)
  // Format: tenants/{tenantID}/stores/{storeID}/printers/{printerID}
  return `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/${DB_NODES.FIRESTORE.PRINTERS}/${printerID}`;
}

/**
 * Build Firestore path for print object in to_print subcollection
 * @param {string} tenantID - Tenant ID
 * @param {string} storeID - Store ID
 * @param {string} printerID - Printer ID
 * @param {string} objectID - Print object ID
 * @returns {string} Full Firestore path for print object document
 */
function buildPrintObjectPath(tenantID, storeID, printerID, objectID) {
  // Format: tenants/{tenantID}/stores/{storeID}/printers/{printerID}/to_print/{objectID}
  return `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/${DB_NODES.FIRESTORE.PRINTERS}/${printerID}/to_print/${objectID}`;
}

/**
 * Build Firestore path for user document
 * @param {string} tenantID - Tenant ID
 * @param {string} storeID - Store ID
 * @param {string} userID - User ID
 * @returns {string} Full Firestore path for user document
 */
function buildUserPath(tenantID, storeID, userID) {
  // Format: tenants/{tenantID}/stores/{storeID}/users/{userID}
  return `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/users/${userID}`;
}

/**
 * Build Firestore path for payment processing update
 * @param {string} tenantID - Tenant ID
 * @param {string} storeID - Store ID
 * @param {string} readerID - Reader ID
 * @param {string} paymentIntentID - Payment Intent ID
 * @returns {string} Full Firestore path for payment update
 */
function buildPaymentUpdatePath(tenantID, storeID, readerID, paymentIntentID) {
  // Format: tenants/{tenantID}/stores/{storeID}/payment-processing/{readerID}/payments/{paymentIntentID}/updates/current
  return `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/${DB_NODES.FIRESTORE.PAYMENT_PROCESSING}/${readerID}/payments/${paymentIntentID}/updates/current`;
}

/**
 * Build Firestore path for payment processing completion
 * @param {string} tenantID - Tenant ID
 * @param {string} storeID - Store ID
 * @param {string} readerID - Reader ID
 * @param {string} paymentIntentID - Payment Intent ID
 * @returns {string} Full Firestore path for payment completion
 */
function buildPaymentCompletionPath(
  tenantID,
  storeID,
  readerID,
  paymentIntentID
) {
  // Format: tenants/{tenantID}/stores/{storeID}/payment-processing/{readerID}/payments/{paymentIntentID}/completions/current
  return `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/${DB_NODES.FIRESTORE.PAYMENT_PROCESSING}/${readerID}/payments/${paymentIntentID}/completions/current`;
}

/**
 * Build Firestore collection path for customers
 * @param {string} tenantID - Tenant ID
 * @param {string} storeID - Store ID
 * @returns {string} Full Firestore collection path for customers
 */
function buildCustomerCollectionPath(tenantID, storeID) {
  // Format: tenants/{tenantID}/stores/{storeID}/customers
  return `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/${DB_NODES.FIRESTORE.CUSTOMERS}`;
}

/**
 * Build Firestore collection path for inventory
 * @param {string} tenantID - Tenant ID
 * @param {string} storeID - Store ID
 * @returns {string} Full Firestore collection path for inventory
 */
function buildInventoryCollectionPath(tenantID, storeID) {
  // Format: tenants/{tenantID}/stores/{storeID}/inventory
  return `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/${DB_NODES.FIRESTORE.INVENTORY}`;
}

/**
 * Build Firestore collection path for open workorders
 * @param {string} tenantID - Tenant ID
 * @param {string} storeID - Store ID
 * @returns {string} Full Firestore collection path for open workorders
 */
function buildOpenWorkordersCollectionPath(tenantID, storeID) {
  // Format: tenants/{tenantID}/stores/{storeID}/open-workorders
  return `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/${DB_NODES.FIRESTORE.OPEN_WORKORDERS}`;
}

/**
 * Build Firestore collection path for punches
 * @param {string} tenantID - Tenant ID
 * @param {string} storeID - Store ID
 * @returns {string} Full Firestore collection path for punches
 */
function buildPunchesCollectionPath(tenantID, storeID) {
  // Format: tenants/{tenantID}/stores/{storeID}/punches
  return `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/${DB_NODES.FIRESTORE.PUNCHES}`;
}

/**
 * Build Firestore path for payment processing reader updates
 * @param {string} tenantID - Tenant ID
 * @param {string} storeID - Store ID
 * @param {string} readerID - Reader ID
 * @param {string} paymentIntentID - Payment Intent ID
 * @returns {string} Full Firestore path for payment updates
 */
function buildPaymentReaderUpdatesPath(
  tenantID,
  storeID,
  readerID,
  paymentIntentID
) {
  // Format: tenants/{tenantID}/stores/{storeID}/payment-processing/{readerID}/payments/{paymentIntentID}/updates/current
  return `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/${DB_NODES.FIRESTORE.PAYMENT_PROCESSING}/${readerID}/payments/${paymentIntentID}/updates/current`;
}

/**
 * Build Firestore path for payment processing reader completions
 * @param {string} tenantID - Tenant ID
 * @param {string} storeID - Store ID
 * @param {string} readerID - Reader ID
 * @param {string} paymentIntentID - Payment Intent ID
 * @returns {string} Full Firestore path for payment completions
 */
function buildPaymentReaderCompletionsPath(
  tenantID,
  storeID,
  readerID,
  paymentIntentID
) {
  // Format: tenants/{tenantID}/stores/{storeID}/payment-processing/{readerID}/payments/{paymentIntentID}/completions/current
  return `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/${DB_NODES.FIRESTORE.PAYMENT_PROCESSING}/${readerID}/payments/${paymentIntentID}/completions/current`;
}

// ============================================================================
// DATABASE WRAPPER FUNCTIONS
// ============================================================================

/**
 * Write an array of items to a Firestore collection using native batch writes (500 per batch).
 * @param {Array<Object>} items - Array of objects, each must have an `id` field
 * @param {string} collectionName - "customers"|"inventory"|"open-workorders"|"completed-workorders"|"completed-sales"|"active-sales"
 * @param {function} [onProgress] - Optional callback(done, total)
 * @returns {Promise<{success: boolean, count: number}>}
 */
export async function dbBatchWrite(items, collectionName, onProgress) {
  const { tenantID, storeID } = getTenantAndStore();
  if (!tenantID || !storeID) return { success: false, count: 0 };
  const BATCH_SIZE = 200;
  const base = `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/${collectionName}`;
  let done = 0;
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const chunk = items.slice(i, i + BATCH_SIZE);
    await firestoreBatchWrite(chunk.map(item => ({ path: `${base}/${item.id}`, data: item })));
    done += chunk.length;
    if (onProgress) onProgress(done, items.length);
    if (i + BATCH_SIZE < items.length) await new Promise(r => setTimeout(r, 500));
  }
  return { success: true, count: items.length };
}

// setters /////////////////////////////////////////////////////////////////////

/**
 * Delete all documents in a Firestore collection.
 * @param {"inventory"|"customers"|"open-workorders"|"completed-workorders"|"completed-sales"|"active-sales"} collectionName
 * @returns {Promise<Object>} { success, deletedCount }
 */
export async function dbClearCollection(collectionName) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) {
      return { success: false, error: "Configuration Error", deletedCount: 0 };
    }
    const base = `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}`;
    const collectionMap = {
      "inventory": DB_NODES.FIRESTORE.INVENTORY,
      "customers": DB_NODES.FIRESTORE.CUSTOMERS,
      "open-workorders": DB_NODES.FIRESTORE.OPEN_WORKORDERS,
      "completed-workorders": DB_NODES.FIRESTORE.COMPLETED_WORKORDERS,
      "completed-sales": DB_NODES.FIRESTORE.COMPLETED_SALES,
      "active-sales": DB_NODES.FIRESTORE.ACTIVE_SALES,
      "punches": DB_NODES.FIRESTORE.PUNCHES,
      "transactions": DB_NODES.FIRESTORE.TRANSACTIONS,
    };
    const node = collectionMap[collectionName];
    if (!node) {
      return { success: false, error: "Unknown collection: " + collectionName, deletedCount: 0 };
    }
    const collectionPath = `${base}/${node}`;
    let docs = await firestoreQuery(collectionPath);
    if (docs.length > 0) {
      await firestoreBatchDelete(collectionPath, docs);
    }
    return { success: true, deletedCount: docs.length };
  } catch (error) {
    log("Error clearing collection:", error);
    return { success: false, error: error.message, deletedCount: 0 };
  }
}

/**
 * Save a single field to the settings object in the database
 * @param {string} fieldName - Name of the field to update
 * @param {*} value - Value to set for the field
 * @returns {Promise<Object>} Save result
 */
export async function dbSaveSettingsField(fieldName, value) {
  try {
    const { tenantID, storeID } = getTenantAndStore();

    if (!tenantID || !storeID) {
      log(
        "Error: tenantID and storeID are not configured for dbSaveSettingsField"
      );
      return {
        success: false,
        error: "Configuration Error",
        message:
          "tenantID and storeID are not configured. Please check your settings.",
        fieldName,
        value,
        tenantID,
        storeID,
      };
    }

    if (!fieldName || typeof fieldName !== "string") {
      log(
        "Error: fieldName must be a non-empty string for dbSaveSettingsField"
      );
      return {
        success: false,
        error: "Invalid Parameter",
        message: "fieldName must be a non-empty string",
        fieldName,
        value,
        tenantID,
        storeID,
      };
    }

    // Get current settings
    const currentSettings = await firestoreRead(
      buildSettingsPath(tenantID, storeID)
    );

    if (!currentSettings) {
      log("Error: Settings not found for dbSaveSettingsField");
      return {
        success: false,
        error: "Not Found",
        message: "Settings not found in database",
        fieldName,
        value,
        tenantID,
        storeID,
      };
    }

    // Update the specific field
    const updatedSettings = {
      ...currentSettings,
      [fieldName]: value,
    };

    // Save the updated settings
    await firestoreWrite(buildSettingsPath(tenantID, storeID), updatedSettings);

    return {
      success: true,
      fieldName,
      value,
      settings: updatedSettings,
      tenantID,
      storeID,
    };
  } catch (error) {
    log("Error saving settings field:", error);
    return {
      success: false,
      error: "Database Error",
      message: error.message,
      fieldName,
      value,
      tenantID: null,
      storeID: null,
    };
  }
}

/**
 * Save a single field in the settings document without reading/rewriting the entire doc.
 * Uses Firestore updateDoc so only the specified field is touched.
 * @param {string} fieldName - Top-level field name (e.g. "printers", "acceptChecks")
 * @param {*} value - Value to set
 * @returns {Promise<Object>} Save result
 */
export async function dbSaveSettingsNode(fieldName, value) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) {
      log("Error: tenantID and storeID are not configured for dbSaveSettingsNode");
      return { success: false, error: "Configuration Error", message: "tenantID and storeID are not configured." };
    }
    if (!fieldName || typeof fieldName !== "string") {
      log("Error: fieldName must be a non-empty string for dbSaveSettingsNode");
      return { success: false, error: "Invalid Parameter", message: "fieldName must be a non-empty string" };
    }
    const path = buildSettingsPath(tenantID, storeID);
    await firestoreUpdate(path, { [fieldName]: value });
    return { success: true, fieldName, value };
  } catch (error) {
    log("Error saving settings node:", error);
    return { success: false, error: "Database Error", message: error.message };
  }
}

/**
 * Save a single field in the phone-config document.
 * Uses Firestore updateDoc so only the specified field is touched.
 * @param {string} fieldName - Top-level field name (e.g. "sipEndpoints", "manualOverride")
 * @param {*} value - Value to set
 * @returns {Promise<Object>} Save result
 */
export async function dbSavePhoneConfigField(fieldName, value) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) {
      log("Error: tenantID and storeID are not configured for dbSavePhoneConfigField");
      return { success: false, error: "Configuration Error", message: "tenantID and storeID are not configured." };
    }
    if (!fieldName || typeof fieldName !== "string") {
      log("Error: fieldName must be a non-empty string for dbSavePhoneConfigField");
      return { success: false, error: "Invalid Parameter", message: "fieldName must be a non-empty string" };
    }
    const path = buildPhoneConfigPath(tenantID, storeID);
    // Read-modify-write so the doc is created on first save (updateDoc would fail
    // if the doc didn't exist yet).
    const current = (await firestoreRead(path)) || {};
    await firestoreWrite(path, { ...current, [fieldName]: value });
    return { success: true, fieldName, value };
  } catch (error) {
    log("Error saving phone-config field:", error);
    return { success: false, error: "Database Error", message: error.message };
  }
}

/**
 * Save the full phone-config doc (used on first init or full overwrite).
 */
export async function dbSavePhoneConfig(phoneConfig) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) {
      log("Error: tenantID and storeID are not configured for dbSavePhoneConfig");
      return { success: false, error: "Configuration Error" };
    }
    const path = buildPhoneConfigPath(tenantID, storeID);
    await firestoreWrite(path, phoneConfig);
    return { success: true };
  } catch (error) {
    log("Error saving phone-config:", error);
    return { success: false, error: "Database Error", message: error.message };
  }
}

// ============================================================================
// ROAD CALLING (Bonita on-the-road number)
// ============================================================================

// Initiate an outbound bridged call: Twilio rings the logged-in user's
// personal cell, then dials the customer with caller ID set to the road
// number. Server also writes the call-expectations doc so a callback
// within the window routes back to the same user.
export async function dbInitiateRoadCall({ customerPhone, customerName, customerID } = {}) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) {
      return { success: false, error: "tenantID/storeID not configured" };
    }
    const currentUser = useLoginStore.getState().currentUser;
    const userID = currentUser?.id;
    if (!userID) {
      return { success: false, error: "No user logged in" };
    }
    const customerE164 = normalizeToE164ForRoadCall(customerPhone);
    if (!customerE164) {
      return { success: false, error: "Invalid customer phone" };
    }
    const result = await roadCallInitiate({
      tenantID,
      storeID,
      userID,
      customerPhone: customerE164,
      customerName: customerName || "",
      customerID: customerID || "",
    });
    return result;
  } catch (error) {
    log("Error in dbInitiateRoadCall:", error);
    return { success: false, error: error.message };
  }
}

// Abort an in-flight outbound road call by SID (Twilio API "canceled"
// status update). Also clears the matching call-expectation doc.
export async function dbCancelRoadCall({ callSid, customerPhone } = {}) {
  try {
    if (!callSid) return { success: false, error: "callSid required" };
    const { tenantID, storeID } = getTenantAndStore();
    const result = await roadCallCancel({
      tenantID: tenantID || "",
      storeID: storeID || "",
      callSid,
      customerPhone: customerPhone || "",
    });
    return result;
  } catch (error) {
    log("Error in dbCancelRoadCall:", error);
    return { success: false, error: error.message };
  }
}

// Manual "EXPECT CALLBACK" — write an expectation doc directly so an
// unsolicited inbound from this customer routes to the current user.
export async function dbSetCallExpectation({ customerPhone, customerName, customerID, durationMs } = {}) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) {
      return { success: false, error: "tenantID/storeID not configured" };
    }
    const currentUser = useLoginStore.getState().currentUser;
    const userID = currentUser?.id;
    const userCell = normalizeToE164ForRoadCall(currentUser?.phone);
    if (!userID || !userCell) {
      return { success: false, error: "Current user has no cell on file" };
    }
    const customerE164 = normalizeToE164ForRoadCall(customerPhone);
    if (!customerE164) {
      return { success: false, error: "Invalid customer phone" };
    }
    const now = Date.now();
    const window = Number.isFinite(durationMs) ? durationMs : 30 * 60 * 1000;
    const expectation = {
      userID,
      userCell,
      customerPhone: customerE164,
      customerName: customerName || "",
      customerID: customerID || "",
      setBy: "manual",
      setAt: now,
      expiresAt: now + window,
    };
    const path = buildCallExpectationPath(tenantID, storeID, customerE164);
    await firestoreWrite(path, expectation);
    return { success: true, expectation };
  } catch (error) {
    log("Error in dbSetCallExpectation:", error);
    return { success: false, error: error.message };
  }
}

// Cancel an expectation (manual clear from the banner).
export async function dbClearCallExpectation(customerPhone) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) {
      return { success: false, error: "tenantID/storeID not configured" };
    }
    const customerE164 = normalizeToE164ForRoadCall(customerPhone);
    if (!customerE164) {
      return { success: false, error: "Invalid customer phone" };
    }
    const path = buildCallExpectationPath(tenantID, storeID, customerE164);
    await firestoreDelete(path);
    return { success: true };
  } catch (error) {
    log("Error in dbClearCallExpectation:", error);
    return { success: false, error: error.message };
  }
}

// Live listener for the whole call-expectations collection. Caller filters
// expired/own-user client-side (collection is small — at most a handful
// of active docs at a time).
export function dbListenToCallExpectations(onSnapshot, onError) {
  const name = "callExpectations";
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) {
      log("Error: tenantID and storeID are not configured for dbListenToCallExpectations");
      return null;
    }
    if (!onSnapshot || typeof onSnapshot !== "function") {
      log("Error: onSnapshot callback function is required for dbListenToCallExpectations");
      return null;
    }
    const collectionPath = buildCallExpectationsCollectionPath(tenantID, storeID);
    __logListenerAttach(name);
    const unsubscribe = firestoreSubscribeCollection(
      collectionPath,
      (data, error, meta) => {
        if (error) {
          log("Call-expectations listener error", { tenantID, storeID, error });
          if (onError) onError(error);
          return;
        }
        __logListenerEmit(name, meta);
        onSnapshot(data || []);
      }
    );
    return () => {
      __logListenerDetach(name);
      unsubscribe();
    };
  } catch (error) {
    log("Error setting up call-expectations listener:", error);
    if (onError) onError(error);
    return null;
  }
}

/**
 * Save settings object
 * @param {Object} settings - Settings object to save
 * @returns {Promise<Object>} Save result
 */
export async function dbSaveSettings(settings) {
  try {
    const { tenantID, storeID } = getTenantAndStore();

    if (!tenantID || !storeID) {
      log("Error: tenantID and storeID are not configured for dbSaveSettings");
      return {
        success: false,
        error: "Configuration Error",
        message:
          "tenantID and storeID are not configured. Please check your settings.",
        settings: null,
        tenantID,
        storeID,
      };
    }

    if (!settings || typeof settings !== "object") {
      log("Error: settings object is required for dbSaveSettings");
      return {
        success: false,
        error: "Invalid Parameter",
        message: "settings object is required",
        settings: null,
        tenantID,
        storeID,
      };
    }

    let settingsToSave = settings;
    await firestoreWrite(buildSettingsPath(tenantID, storeID), settingsToSave);

    return {
      success: true,
      settings: settingsToSave,
      tenantID,
      storeID,
    };
  } catch (error) {
    log("Error saving settings:", error);
    return {
      success: false,
      error: "Database Error",
      message: error.message,
      settings: null,
      tenantID: null,
      storeID: null,
    };
  }
}

// ============================================================================
// TENANT-LEVEL USER IDENTITY
// ============================================================================
// Canonical identity for each user (name, phone, email, PIN, permissions,
// faceDescriptor, hourlyWage, stores[]) lives at
// tenants/{tenantID}/users/{userID}. Per-store presence + ephemera + the
// disabled flag stay on settings.users[i] inside each store's settings doc.
// The settings listener in BaseScreen hydrates per-store entries with
// identity from these tenant-level docs, exposing the merged APP_USER shape
// to readers via useSettingsStore.settings.users[]. Writes that mutate
// identity (name/phone/email/PIN/permissions/stores) must go through
// dbSaveTenantUser; writes that mutate per-store ephemera (disabled,
// pendingWorkorderIDs, etc.) keep going through the settings path.

export async function dbSaveTenantUser(user, userID = null) {
  try {
    const { tenantID } = getTenantAndStore();
    if (!tenantID) {
      log("Error: tenantID is not configured for dbSaveTenantUser");
      return { success: false, error: "Missing tenantID", user: null };
    }
    const id = userID || user?.id;
    if (!id) {
      log("Error: userID is required for dbSaveTenantUser");
      return { success: false, error: "Missing userID", user: null };
    }
    const userToSave = { ...user, id };
    await firestoreWrite(buildTenantUserPath(tenantID, id), userToSave);
    return { success: true, user: userToSave, tenantID };
  } catch (error) {
    log("Error saving tenant user:", error);
    return {
      success: false,
      error: "Database Error",
      message: error.message,
      user: null,
    };
  }
}

export async function dbDeleteTenantUser(userID) {
  try {
    const { tenantID } = getTenantAndStore();
    if (!tenantID) {
      log("Error: tenantID is not configured for dbDeleteTenantUser");
      return { success: false, error: "Missing tenantID" };
    }
    if (!userID) {
      log("Error: userID is required for dbDeleteTenantUser");
      return { success: false, error: "Missing userID" };
    }
    await firestoreDelete(buildTenantUserPath(tenantID, userID));
    return { success: true, tenantID, userID };
  } catch (error) {
    log("Error deleting tenant user:", error);
    return {
      success: false,
      error: "Database Error",
      message: error.message,
    };
  }
}

export function dbListenToTenantUsers(onChange, onError) {
  const name = "tenantUsers";
  try {
    const { tenantID } = getTenantAndStore();
    if (!tenantID) {
      log("Error: tenantID is not configured for dbListenToTenantUsers");
      return null;
    }
    if (!onChange || typeof onChange !== "function") {
      log("Error: onChange callback required for dbListenToTenantUsers");
      return null;
    }
    const collectionPath = buildTenantUsersCollectionPath(tenantID);
    __logListenerAttach(name);
    const unsubscribe = firestoreSubscribeCollection(
      collectionPath,
      (usersData, error, meta) => {
        if (error) {
          log("Tenant users listener error", { tenantID, error });
          if (onError) onError(error);
          return;
        }
        __logListenerEmit(name, meta);
        onChange(usersData);
      }
    );
    return () => {
      __logListenerDetach(name);
      unsubscribe();
    };
  } catch (error) {
    log("Error setting up tenant users listener:", error);
    if (onError) onError(error);
    return null;
  }
}

/**
 * Save open workorder object to Firestore
 * @param {Object} workorder - Workorder object to save
 * @param {string} workorderID - Workorder ID (optional, will use workorder.id if not provided)
 * @returns {Promise<Object>} Save result
 */
export async function dbSaveOpenWorkorder(workorder, workorderID = null, isFirstSave = false) {
  try {
    const { tenantID, storeID } = getTenantAndStore();

    if (!tenantID || !storeID) {
      log(
        "Error: tenantID and storeID are not configured for dbSaveOpenWorkorder"
      );
      return {
        success: false,
        error: "Configuration Error",
        message:
          "tenantID and storeID are not configured. Please check your settings.",
        workorder: null,
        workorderID: null,
        tenantID,
        storeID,
      };
    }

    if (!workorder || typeof workorder !== "object") {
      log("Error: workorder object is required for dbSaveOpenWorkorder");
      return {
        success: false,
        error: "Invalid Parameter",
        message: "workorder object is required",
        workorder: null,
        workorderID: null,
        tenantID,
        storeID,
      };
    }

    // Get workorder ID from parameter or workorder object
    const id = workorderID || workorder.id || workorder["id"];
    if (!id) {
      log(
        "Error: workorderID must be provided either as parameter, workorder.id, or workorder['id'] for dbSaveOpenWorkorder"
      );
      return {
        success: false,
        error: "Invalid Parameter",
        message:
          "workorderID must be provided either as parameter, workorder.id, or workorder['id']",
        workorder: null,
        workorderID: null,
        tenantID,
        storeID,
      };
    }

    let workorderToSave = { ...workorder };
    delete workorderToSave._tmpKey;

    // Build path: tenants/{tenantID}/stores/{storeID}/open-workorders/{workorderID}
    const path = buildWorkorderPath(tenantID, storeID, id);

    await firestoreWrite(path, workorderToSave);

    return {
      success: true,
      workorder: workorderToSave,
      workorderID: id,
      tenantID,
      storeID,
      path,
    };
  } catch (error) {
    log("Error saving open workorder:", error);
    return {
      success: false,
      error: "Database Error",
      message: error.message,
      workorder: null,
      workorderID: null,
      tenantID: null,
      storeID: null,
    };
  }
}

/**
 * Get completed workorder from Cloud Storage by ID
 * @param {string} id - Workorder ID (required)
 * @returns {Promise<Object>} Completed workorder object or null
 */
export async function dbGetCompletedWorkorder(id) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) {
      log("Error: tenantID and storeID are not configured for dbGetCompletedWorkorder");
      return null;
    }
    if (!id) {
      log("Error: id is required for dbGetCompletedWorkorder");
      return null;
    }
    const path = buildCompletedWorkorderPath(tenantID, storeID, id);
    const workorder = await firestoreRead(path);
    if (!workorder) {
      log("Error: Completed workorder not found for dbGetCompletedWorkorder");
      return null;
    }
    return workorder;
  } catch (error) {
    log("Error retrieving completed workorder:", error);
    return null;
  }
}

export async function dbSearchCompletedWorkorders(field, value) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) return [];
    const collectionPath = `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/${DB_NODES.FIRESTORE.COMPLETED_WORKORDERS}`;
    const results = await firestoreQuery(collectionPath, [
      { field, operator: "==", value },
    ], { limit: 5 });
    return results;
  } catch (error) {
    log("Error searching completed workorders:", error);
    return [];
  }
}

export async function dbSearchCompletedWorkordersByNumber(numberPrefix) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) return [];
    const prefix = "WO" + numberPrefix;
    const collectionPath = `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/${DB_NODES.FIRESTORE.COMPLETED_WORKORDERS}`;
    const results = await firestoreQuery(collectionPath, [
      { field: "workorderNumber", operator: ">=", value: prefix },
      { field: "workorderNumber", operator: "<=", value: prefix + "\uf8ff" },
    ], { limit: 10 });
    return results;
  } catch (error) {
    log("Error searching completed workorders by number:", error);
    return [];
  }
}

export async function dbSearchWorkordersByIdPrefix(prefix) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) return [];

    // local open workorders
    const openWOs = useOpenWorkordersStore.getState().getWorkorders() || [];
    const localMatches = openWOs
      .filter((w) => w.id && w.id.startsWith(prefix))
      .map((w) => ({ type: "workorder", data: w, isCompleted: false }));

    // firestore completed workorders — range query on document ID field
    const collectionPath = `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/${DB_NODES.FIRESTORE.COMPLETED_WORKORDERS}`;
    const completedResults = await firestoreQuery(
      collectionPath,
      [
        { field: "id", operator: ">=", value: prefix },
        { field: "id", operator: "<=", value: prefix + "\uf8ff" },
      ],
      { limit: 20 }
    );
    const completedMatches = completedResults
      .filter((w) => w.id && w.id.startsWith(prefix))
      .map((w) => ({ type: "workorder", data: w, isCompleted: true }));

    return [...localMatches, ...completedMatches];
  } catch (error) {
    log("Error searching workorders by ID prefix:", error);
    return [];
  }
}

export async function dbSearchSalesByIdPrefix(prefix) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) return [];

    const activePath = `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/active-sales`;
    const completedPath = `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/${DB_NODES.FIRESTORE.COMPLETED_SALES}`;

    const whereClauses = [
      { field: "id", operator: ">=", value: prefix },
      { field: "id", operator: "<=", value: prefix + "\uf8ff" },
    ];

    const [activeResults, completedResults] = await Promise.all([
      firestoreQuery(activePath, whereClauses, { limit: 20 }),
      firestoreQuery(completedPath, whereClauses, { limit: 20 }),
    ]);

    const activeMatches = activeResults
      .filter((s) => s.id && s.id.startsWith(prefix))
      .map((s) => ({ type: "sale", data: s, isCompleted: false }));
    const completedMatches = completedResults
      .filter((s) => s.id && s.id.startsWith(prefix))
      .map((s) => ({ type: "sale", data: s, isCompleted: true }));

    return [...activeMatches, ...completedMatches];
  } catch (error) {
    log("Error searching sales by ID prefix:", error);
    return [];
  }
}

export async function dbSearchTransactionsByIdPrefix(prefix) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) return [];

    const txnPath = `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/${DB_NODES.FIRESTORE.TRANSACTIONS}`;

    const results = await firestoreQuery(
      txnPath,
      [
        { field: "id", operator: ">=", value: prefix },
        { field: "id", operator: "<=", value: prefix + "\uf8ff" },
      ],
      { limit: 20 }
    );

    return results
      .filter((t) => t.id && t.id.startsWith(prefix))
      .map((t) => ({ type: "transaction", data: t, isCompleted: true }));
  } catch (error) {
    log("Error searching transactions by ID prefix:", error);
    return [];
  }
}

export async function dbGetStandaloneActiveSales() {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) return [];
    const path = `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/active-sales`;
    const results = await firestoreQuery(path, [
      { field: "customerID", operator: "==", value: "" },
    ]);
    return results.filter((s) => !s.paymentComplete);
  } catch (error) {
    log("Error fetching standalone active sales:", error);
    return [];
  }
}

/**
 * Get all store IDs under the current tenant, excluding the current store.
 * @returns {Promise<string[]>} Array of other store IDs
 */
export async function dbGetTenantStoreIDs() {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID) return [];
    const path = `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}`;
    const stores = await firestoreQuery(path);
    return stores.map((s) => s.id).filter((id) => id !== storeID);
  } catch (error) {
    log("Error fetching tenant store IDs:", error);
    return [];
  }
}

/**
 * Cross-store search by ID. Fan out to all other stores under the tenant.
 * Searches completed-workorders, completed-sales, open-workorders, and active-sales.
 * @param {string} id - 12-digit barcode ID
 * @returns {Promise<{ type: 'workorder'|'sale', data: Object, storeID: string, isCompleted: boolean }|null>}
 */
export async function dbCrossStoreSearchByID(id) {
  try {
    const { tenantID } = getTenantAndStore();
    if (!tenantID || !id) return null;
    const otherStoreIDs = await dbGetTenantStoreIDs();
    if (!otherStoreIDs.length) return null;

    const results = await Promise.all(
      otherStoreIDs.map(async (sid) => {
        const base = `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${sid}`;
        const [completedWo, completedSale, openWo, activeSale] = await Promise.all([
          firestoreRead(`${base}/${DB_NODES.FIRESTORE.COMPLETED_WORKORDERS}/${id}`),
          firestoreRead(`${base}/${DB_NODES.FIRESTORE.COMPLETED_SALES}/${id}`),
          firestoreRead(`${base}/${DB_NODES.FIRESTORE.OPEN_WORKORDERS}/${id}`),
          firestoreRead(`${base}/active-sales/${id}`),
        ]);
        if (completedWo) return { type: "workorder", data: { id, ...completedWo }, storeID: sid, isCompleted: true };
        if (openWo) return { type: "workorder", data: { id, ...openWo }, storeID: sid, isCompleted: false };
        if (completedSale) return { type: "sale", data: { id, ...completedSale }, storeID: sid, isCompleted: true };
        if (activeSale) return { type: "sale", data: { id, ...activeSale }, storeID: sid, isCompleted: false };
        return null;
      })
    );
    return results.find((r) => r !== null) || null;
  } catch (error) {
    log("Error in cross-store search:", error);
    return null;
  }
}

export async function dbSaveCompletedWorkorder(workorder) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) {
      log("Error: tenantID and storeID are not configured for dbSaveCompletedWorkorder");
      return { success: false };
    }
    if (!workorder || !workorder.id) {
      log("Error: workorder object with id is required for dbSaveCompletedWorkorder");
      return { success: false };
    }
    const path = buildCompletedWorkorderPath(tenantID, storeID, workorder.id);
    await firestoreWrite(path, workorder);
    return { success: true };
  } catch (error) {
    log("Error saving completed workorder:", error);
    return { success: false };
  }
}

export async function dbSaveCompletedSale(sale) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) {
      log("Error: tenantID and storeID are not configured for dbSaveCompletedSale");
      return { success: false };
    }
    if (!sale || !sale.id) {
      log("Error: sale object with id is required for dbSaveCompletedSale");
      return { success: false };
    }
    const path = buildCompletedSalePath(tenantID, storeID, sale.id);
    await firestoreWrite(path, sale);
    return { success: true };
  } catch (error) {
    log("Error saving completed sale:", error);
    return { success: false };
  }
}

export async function dbSaveActiveSale(sale) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) {
      log("Error: tenantID and storeID are not configured for dbSaveActiveSale");
      return { success: false };
    }
    if (!sale || !sale.id) {
      log("Error: sale object with id is required for dbSaveActiveSale");
      return { success: false };
    }
    const path = `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/active-sales/${sale.id}`;
    await firestoreWrite(path, sale);
    return { success: true };
  } catch (error) {
    log("Error saving active sale:", error);
    return { success: false };
  }
}

/**
 * Save customer object to Firestore
 * @param {Object} customer - Customer object to save
 * @param {string} customerID - Customer ID (optional, will use customer.id if not provided)
 * @returns {Promise<Object>} Save result
 */
export async function dbSaveCustomer(customer) {
  try {
    const { tenantID, storeID } = getTenantAndStore();

    if (!tenantID || !storeID) {
      log("Error: tenantID and storeID are not configured for dbSaveCustomer");
      return {
        success: false,
        error: "Configuration Error",
        message:
          "tenantID and storeID are not configured. Please check your settings.",
        customer: null,
        customerID: null,
        tenantID,
        storeID,
      };
    }

    if (!customer || typeof customer !== "object") {
      log("Error: customer object is required for dbSaveCustomer");
      return {
        success: false,
        error: "Invalid Parameter",
        message: "customer object is required",
        customer: null,
        customerID: null,
        tenantID,
        storeID,
      };
    }

    // Convert typed arrays to regular arrays for Firestore compatibility
    let customerToSave = { ...customer };

    // Handle faceDescriptor typed array
    if (
      customerToSave.faceDescriptor &&
      customerToSave.faceDescriptor.constructor.name.includes("Array") &&
      customerToSave.faceDescriptor.constructor !== Array
    ) {
      customerToSave.faceDescriptor = Array.from(customerToSave.faceDescriptor);
    }

    await firestoreWrite(
      buildCustomerPath(tenantID, storeID, customer.id),
      customerToSave
    );


    return {
      success: true,
      customer: customerToSave,
      customerID: customer.id,
      tenantID,
      storeID,
    };
  } catch (error) {
    log("Error saving customer:", error);
    return {
      success: false,
      error: "Database Error",
      message: error.message,
      customer: null,
      customerID: null,
      tenantID: null,
      storeID: null,
    };
  }
}

/**
 * Save inventory item to Firestore
 * @param {Object} item - Inventory item object to save
 * @param {string} itemID - Item ID (optional, will use item.id if not provided)
 * @returns {Promise<Object>} Save result
 */
export async function dbSaveInventoryItem(item, itemID = null) {
  try {
    const { tenantID, storeID } = getTenantAndStore();

    if (!tenantID || !storeID) {
      log(
        "Error: tenantID and storeID are not configured for dbSaveInventoryItem"
      );
      return {
        success: false,
        error: "Configuration Error",
        message:
          "tenantID and storeID are not configured. Please check your settings.",
        item: null,
        itemID: null,
        tenantID,
        storeID,
      };
    }

    if (!item || typeof item !== "object") {
      log("Error: item object is required for dbSaveInventoryItem");
      return {
        success: false,
        error: "Invalid Parameter",
        message: "item object is required",
        item: null,
        itemID: null,
        tenantID,
        storeID,
      };
    }

    // Get item ID from parameter or item object
    const id = itemID || item.id || item["id"];
    if (!id) {
      log(
        "Error: itemID must be provided either as parameter, item.id, or item['id'] for dbSaveInventoryItem"
      );
      return {
        success: false,
        error: "Invalid Parameter",
        message:
          "itemID must be provided either as parameter, item.id, or item['id']",
        item: null,
        itemID: null,
        tenantID,
        storeID,
      };
    }

    let itemToSave = item;

    // Build path: tenants/{tenantID}/stores/{storeID}/inventory/{itemID}
    const path = buildInventoryPath(tenantID, storeID, id);

    await firestoreWrite(path, itemToSave);

    return {
      success: true,
      item: itemToSave,
      itemID: id,
      tenantID,
      storeID,
      path,
    };
  } catch (error) {
    log("Error saving inventory item:", error);
    return {
      success: false,
      error: "Database Error",
      message: error.message,
      item: null,
      itemID: null,
      tenantID: null,
      storeID: null,
    };
  }
}

/**
 * Save punch clock object to Firestore
 * @param {Object} punch - Punch clock object to save
 * @param {string} punchID - Punch ID (optional, will use punch.id if not provided)
 * @returns {Promise<Object>} Save result
 */
export async function dbSavePunchObject(punch, punchID = null) {
  try {
    const { tenantID, storeID } = getTenantAndStore();

    if (!tenantID || !storeID) {
      log(
        "Error: tenantID and storeID are not configured for dbSavePunchObject"
      );
      return {
        success: false,
        error: "Configuration Error",
        message:
          "tenantID and storeID are not configured. Please check your settings.",
        punch: null,
        punchID: null,
        tenantID,
        storeID,
      };
    }

    if (!punch || typeof punch !== "object") {
      log("Error: punch object is required for dbSavePunchObject");
      return {
        success: false,
        error: "Invalid Parameter",
        message: "punch object is required",
        punch: null,
        punchID: null,
        tenantID,
        storeID,
      };
    }

    // Get punch ID from parameter or punch object
    const id = punchID || punch.id || punch["id"];
    if (!id) {
      log(
        "Error: punchID must be provided either as parameter, punch.id, or punch['id'] for dbSavePunchObject"
      );
      return {
        success: false,
        error: "Invalid Parameter",
        message:
          "punchID must be provided either as parameter, punch.id, or punch['id']",
        punch: null,
        punchID: null,
        tenantID,
        storeID,
      };
    }

    let punchToSave = punch;

    const path = buildPunchPath(tenantID, storeID, id);

    await firestoreWrite(path, punchToSave);

    return {
      success: true,
      punch: punchToSave,
      punchID: id,
      tenantID,
      storeID,
      path,
    };
  } catch (error) {
    log("Error saving punch clock:", error);
    return {
      success: false,
      error: "Database Error",
      message: error.message,
      punch: null,
      punchID: null,
      tenantID: null,
      storeID: null,
    };
  }
}

/**
 * Delete a single punch document from Firestore by punch ID.
 */
export async function dbDeletePunch(punchID) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) {
      log("Error: tenantID and storeID are not configured for dbDeletePunch");
      return { success: false, error: "Configuration Error" };
    }
    if (!punchID) {
      log("Error: punchID is required for dbDeletePunch");
      return { success: false, error: "Invalid Parameter" };
    }
    const path = buildPunchPath(tenantID, storeID, punchID);
    await firestoreDelete(path);
    return { success: true, punchID, path };
  } catch (error) {
    log("Error deleting punch:", error);
    return { success: false, error: "Database Error", message: error.message };
  }
}

/**
 * Set a single user's punch slot in punch_clock/current via field-level update.
 * Safe against concurrent clock-ins from multiple terminals.
 */
export async function dbSetUserPunchSlot(userID, punchObj) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID || !userID || !punchObj) return { success: false };
    const path = buildCurrentPunchClockPath(tenantID, storeID);
    await firestoreUpdate(path, { [userID]: punchObj });
    return { success: true };
  } catch (error) {
    log("Error in dbSetUserPunchSlot:", error);
    if (error?.code === "not-found") {
      try {
        const { tenantID, storeID } = getTenantAndStore();
        const path = buildCurrentPunchClockPath(tenantID, storeID);
        await firestoreWrite(path, { [userID]: punchObj });
        return { success: true };
      } catch (e2) {
        log("Error fallback dbSetUserPunchSlot create:", e2);
        return { success: false, error: e2.message };
      }
    }
    return { success: false, error: error.message };
  }
}

/**
 * Clear a single user's punch slot in punch_clock/current via deleteField().
 */
export async function dbClearUserPunchSlot(userID) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID || !userID) return { success: false };
    const path = buildCurrentPunchClockPath(tenantID, storeID);
    await firestoreUpdate(path, { [userID]: deleteField() });
    return { success: true };
  } catch (error) {
    log("Error in dbClearUserPunchSlot:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Add a manager note to punch_clock/current under notes.{noteID}.
 * noteObj shape: { id, userID, authorName, message, createdMillis, resolved, type }
 */
export async function dbAddManagerNote(noteObj) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID || !noteObj?.id) return { success: false };
    const path = buildCurrentPunchClockPath(tenantID, storeID);
    await firestoreUpdate(path, { [`notes.${noteObj.id}`]: noteObj });
    return { success: true };
  } catch (error) {
    log("Error in dbAddManagerNote:", error);
    if (error?.code === "not-found") {
      try {
        const { tenantID, storeID } = getTenantAndStore();
        const path = buildCurrentPunchClockPath(tenantID, storeID);
        await firestoreWrite(path, { notes: { [noteObj.id]: noteObj } });
        return { success: true };
      } catch (e2) {
        log("Error fallback dbAddManagerNote create:", e2);
        return { success: false, error: e2.message };
      }
    }
    return { success: false, error: error.message };
  }
}

/**
 * Update a manager note in punch_clock/current. Overwrites the note object at notes.{id}.
 */
export async function dbUpdateManagerNote(noteObj) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID || !noteObj?.id) return { success: false };
    const path = buildCurrentPunchClockPath(tenantID, storeID);
    await firestoreUpdate(path, { [`notes.${noteObj.id}`]: noteObj });
    return { success: true };
  } catch (error) {
    log("Error in dbUpdateManagerNote:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Resolve (delete) a manager note in punch_clock/current.
 */
export async function dbResolveManagerNote(noteID) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID || !noteID) return { success: false };
    const path = buildCurrentPunchClockPath(tenantID, storeID);
    await firestoreUpdate(path, { [`notes.${noteID}`]: deleteField() });
    return { success: true };
  } catch (error) {
    log("Error in dbResolveManagerNote:", error);
    return { success: false, error: error.message };
  }
}

/**
 * In-app messaging: write a new message into messages/current at messages.{id}.
 * Has not-found fallback to create the doc if missing.
 */
export async function dbAddInAppMessage(messageObj) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID || !messageObj?.id) return { success: false };
    const path = buildCurrentMessagesPath(tenantID, storeID);
    await firestoreUpdate(path, { [`messages.${messageObj.id}`]: messageObj });
    return { success: true };
  } catch (error) {
    log("Error in dbAddInAppMessage:", error);
    if (error?.code === "not-found") {
      try {
        const { tenantID, storeID } = getTenantAndStore();
        const path = buildCurrentMessagesPath(tenantID, storeID);
        await firestoreWrite(path, { messages: { [messageObj.id]: messageObj } });
        return { success: true };
      } catch (e2) {
        log("Error fallback dbAddInAppMessage create:", e2);
        return { success: false, error: e2.message };
      }
    }
    return { success: false, error: error.message };
  }
}

/**
 * Mark an in-app message as read by a specific user.
 * Sets messages.{id}.readBy.{userID} = millis.
 */
export async function dbMarkInAppMessageReadByUser(messageID, userID) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID || !messageID || !userID) return { success: false };
    const path = buildCurrentMessagesPath(tenantID, storeID);
    await firestoreUpdate(path, { [`messages.${messageID}.readBy.${userID}`]: Date.now() });
    return { success: true };
  } catch (error) {
    log("Error in dbMarkInAppMessageReadByUser:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Mark an in-app message as unread for a specific user (delete their readBy entry).
 */
export async function dbMarkInAppMessageUnreadByUser(messageID, userID) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID || !messageID || !userID) return { success: false };
    const path = buildCurrentMessagesPath(tenantID, storeID);
    await firestoreUpdate(path, { [`messages.${messageID}.readBy.${userID}`]: deleteField() });
    return { success: true };
  } catch (error) {
    log("Error in dbMarkInAppMessageUnreadByUser:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Hard delete: removes messages.{id} for everyone (sender-initiated delete).
 */
export async function dbHardDeleteInAppMessage(messageID) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID || !messageID) return { success: false };
    const path = buildCurrentMessagesPath(tenantID, storeID);
    await firestoreUpdate(path, { [`messages.${messageID}`]: deleteField() });
    return { success: true };
  } catch (error) {
    log("Error in dbHardDeleteInAppMessage:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Per-user delete: marks messages.{id}.deletedBy.{userID} = true.
 * Other recipients still see the message.
 */
export async function dbDeleteInAppMessageForUser(messageID, userID) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID || !messageID || !userID) return { success: false };
    const path = buildCurrentMessagesPath(tenantID, storeID);
    await firestoreUpdate(path, { [`messages.${messageID}.deletedBy.${userID}`]: true });
    return { success: true };
  } catch (error) {
    log("Error in dbDeleteInAppMessageForUser:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Listen to changes in messages/current doc.
 */
export function dbListenToInAppMessages(onChange, onError) {
  const name = "inAppMessages";
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) {
      log("Error: tenantID/storeID not configured for dbListenToInAppMessages");
      return null;
    }
    if (!onChange || typeof onChange !== "function") {
      log("Error: onChange callback required for dbListenToInAppMessages");
      return null;
    }
    const path = buildCurrentMessagesPath(tenantID, storeID);
    __logListenerAttach(name);
    const unsubscribe = firestoreSubscribe(path, (data, error, meta) => {
      if (error) {
        log("In-app messages listener error", { tenantID, storeID, error });
        if (onError) onError(error);
        return;
      }
      if (!data) data = {};
      __logListenerEmit(name, meta);
      onChange(data);
    });
    return () => {
      __logListenerDetach(name);
      unsubscribe();
    };
  } catch (error) {
    log("Error setting up in-app messages listener:", error);
    if (onError) onError(error);
    return null;
  }
}

/**
 * Set loginMessageSuppressUntil (millis) on a user in settings.users.
 * Read-modify-write the users array, then persist with field-level updateDoc.
 */
export async function dbSetUserLoginMessageSuppress(userID, untilMillis) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID || !userID) return { success: false };
    const path = buildSettingsPath(tenantID, storeID);
    const currentSettings = await firestoreRead(path);
    if (!currentSettings) return { success: false, error: "Not Found" };
    const updatedUsers = (currentSettings.users || []).map((u) =>
      u?.id === userID ? { ...u, loginMessageSuppressUntil: untilMillis || 0 } : u
    );
    await firestoreUpdate(path, { users: updatedUsers });
    return { success: true };
  } catch (error) {
    log("Error in dbSetUserLoginMessageSuppress:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Set personalNotes array on a user in settings.users.
 * Read-modify-write the users array, then persist with field-level updateDoc.
 */
export async function dbSetUserPersonalNotes(userID, notes) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID || !userID) return { success: false };
    const path = buildSettingsPath(tenantID, storeID);
    const currentSettings = await firestoreRead(path);
    if (!currentSettings) return { success: false, error: "Not Found" };
    const updatedUsers = (currentSettings.users || []).map((u) =>
      u?.id === userID ? { ...u, personalNotes: notes || [] } : u
    );
    await firestoreUpdate(path, { users: updatedUsers });
    return { success: true };
  } catch (error) {
    log("Error in dbSetUserPersonalNotes:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Save current punch clock object to Firestore (overwrites entire punch_clock node)
 * @param {Object} punchClockData - Current punch clock object to save (required)
 * @returns {Promise<Object>} Save result
 */
export async function dbSaveCurrentPunchClock(punchClockData) {
  try {
    const { tenantID, storeID } = getTenantAndStore();

    if (!tenantID || !storeID) {
      log(
        "Error: tenantID and storeID are not configured for dbSaveCurrentPunchClock"
      );
      return {
        success: false,
        error: "Configuration Error",
        message:
          "tenantID and storeID are not configured. Please check your settings.",
        punchClock: null,
        tenantID,
        storeID,
      };
    }

    if (!punchClockData || typeof punchClockData !== "object") {
      log(
        "Error: punchClockData object is required for dbSaveCurrentPunchClock"
      );
      return {
        success: false,
        error: "Invalid Parameter",
        message: "punchClockData object is required",
        punchClock: null,
        tenantID,
        storeID,
      };
    }

    let punchClockToSave = punchClockData;

    // Build path: tenants/{tenantID}/stores/{storeID}/punch_clock/current
    const path = buildCurrentPunchClockPath(tenantID, storeID);

    await firestoreWrite(path, punchClockToSave);
    log("success saving current punch clock");
    return {
      success: true,
      punchClock: punchClockToSave,
      tenantID,
      storeID,
      path,
    };
  } catch (error) {
    log("Error saving current punch clock:", error);
    return {
      success: false,
      error: "Database Error",
      message: error.message,
      punchClock: null,
      tenantID: null,
      storeID: null,
    };
  }
}

/**
 * Save print object to Firestore to_print subcollection
 * @param {Object} printObj - Print object with "id" field
 * @param {string} printerID - Required printer ID for the path
 * @returns {Promise<Object>} Save result
 */
export async function dbSavePrintObj(printObj, printerID) {
  try {
    const { tenantID, storeID } = getTenantAndStore();

    if (!tenantID || !storeID) {
      log("Error: tenantID and storeID are not configured for dbSavePrintObj");
      return {
        success: false,
        error: "Configuration Error",
        message:
          "tenantID and storeID are not configured. Please check your settings.",
        printObj: null,
        printerID: null,
        tenantID,
        storeID,
      };
    }

    if (!printObj || typeof printObj !== "object") {
      log("Error: print object is required for dbSavePrintObj");
      return {
        success: false,
        error: "Validation Error",
        message: "print object is required for dbSavePrintObj",
        printObj: null,
        printerID: null,
        tenantID,
        storeID,
      };
    }

    if (!printerID) {
      log("Error: printerID is required for dbSavePrintObj");
      return {
        success: false,
        error: "Validation Error",
        message: "printerID is required for dbSavePrintObj",
        printObj: null,
        printerID: null,
        tenantID,
        storeID,
      };
    }

    if (!printObj.id) {
      log("Error: print object must have an 'id' field for dbSavePrintObj");
      return {
        success: false,
        error: "Validation Error",
        message: "print object must have an 'id' field",
        printObj: null,
        printerID,
        tenantID,
        storeID,
      };
    }

    printObj.timestamp = Date.now();
    printObj.status = "pending";
    const path = buildPrintObjectPath(
      tenantID,
      storeID,
      printerID,
      printObj.id
    );
    let cleanedPrintObj = removeEmptyFields(printObj);

    let stringifiedPrintObj = stringifyAllObjectFields(cleanedPrintObj);

    const result = await firestoreWrite(path, stringifiedPrintObj);

    if (!result || !result.success) {
      log(`Error saving print object: ${result && result.error}`);
      return {
        success: false,
        error: result && result.error,
        message: "Failed to save print object",
        printObj: null,
        printerID: null,
        tenantID,
        storeID,
        path,
      };
    }

    // Wait for the print agent's verdict. Contract:
    //   success → agent deletes the doc (doc-gone is the success signal)
    //   failure → agent sets status: "failed" + error
    //   timeout → we delete and treat as failure (agent offline / no response)
    const outcome = await new Promise((resolve) => {
      let settled = false;
      const unsubscribe = firestoreSubscribe(path, (data) => {
        if (settled) return;
        if (data === null) {
          settled = true;
          clearTimeout(timeoutHandle);
          unsubscribe();
          resolve({ success: true });
        } else if (data.status === "failed") {
          settled = true;
          clearTimeout(timeoutHandle);
          unsubscribe();
          firestoreDelete(path);
          resolve({ success: false, error: data.error || "Print failed" });
        }
      });
      const timeoutHandle = setTimeout(() => {
        if (settled) return;
        settled = true;
        unsubscribe();
        firestoreDelete(path);
        resolve({ success: false, error: "Print job timed out" });
      }, PRINT_JOB_TIMEOUT_MS);
    });

    return {
      success: outcome.success,
      error: outcome.error,
      message: outcome.success
        ? "Print job completed"
        : `Print job failed: ${outcome.error}`,
      printObj,
      printerID,
      tenantID,
      storeID,
      path,
    };
  } catch (error) {
    log("Error in dbSavePrintObj:", error.message);

    return {
      success: false,
      error: "Database Error",
      message: `An error occurred while saving the print object: ${error.message}`,
      printObj: null,
      printerID: null,
      tenantID: null,
      storeID: null,
    };
  }
}

// getters ///////////////////////////////////////////////////////////////////////////
export async function dbGetCompletedSale(id) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) {
      log("Error: tenantID and storeID are not configured for dbGetCompletedSale");
      return null;
    }
    if (!id) {
      log("Error: id is required for dbGetCompletedSale");
      return null;
    }
    const path = buildCompletedSalePath(tenantID, storeID, id);
    const sale = await firestoreRead(path);
    if (!sale) {
      log("Error: Completed sale not found for dbGetCompletedSale");
      return null;
    }
    return sale;
  } catch (error) {
    log("Error retrieving completed sale:", error);
    return null;
  }
}

/**
 * Get settings object
 * @returns {Promise<Object>} Settings object or null
 */
export async function dbGetSettings(tenantID, storeID) {
  try {
    if (!tenantID || !storeID) {
      log("Error: tenantID and storeID are not configured for dbGetSettings");
      return null;
    }

    const settings = await firestoreRead(buildSettingsPath(tenantID, storeID));

    if (!settings) {
      log("Error: Settings not found for dbGetSettings");
      return null;
    }

    return settings;
  } catch (error) {
    log("Error retrieving settings:", error);
    return null;
  }
}

/**
 * Get customer object from Firestore
 * @param {string} customerID - Customer ID (required)
 * @returns {Promise<Object>} Customer object or null
 */
export async function dbGetCustomer(customerID) {
  try {
    const { tenantID, storeID } = getTenantAndStore();

    if (!tenantID || !storeID) {
      log("Error: tenantID and storeID are not configured for dbGetCustomer");
      return null;
    }

    if (!customerID) {
      log("Error: customerID is required for dbGetCustomer");
      return null;
    }

    const customer = await firestoreRead(
      buildCustomerPath(tenantID, storeID, customerID)
    );

    if (!customer) {
      log("Error: Customer not found for dbGetCustomer");
      return null;
    }

    return customer;
  } catch (error) {
    log("Error retrieving customer:", error);
    return null;
  }
}

/**
 * Get open workorders from Firestore
 * @returns {Promise<Array>} Open workorders array or null
 */
export async function dbGetOpenWorkorders() {
  try {
    const { tenantID, storeID } = getTenantAndStore();

    if (!tenantID || !storeID) {
      log(
        "Error: tenantID and storeID are not configured for dbGetOpenWorkorders"
      );
      return null;
    }

    // Build collection path: tenants/{tenantID}/stores/{storeID}/open-workorders
    const collectionPath = buildOpenWorkordersCollectionPath(tenantID, storeID);

    const workorders = await firestoreQuery(collectionPath, []);

    return workorders || [];
  } catch (error) {
    log("Error retrieving open workorders:", error);
    return null;
  }
}

/**
 * Get all inventory items from Firestore
 * @returns {Promise<Array>} Inventory items array or null
 */
export async function dbGetInventoryItems() {
  try {
    const { tenantID, storeID } = getTenantAndStore();

    if (!tenantID || !storeID) {
      log(
        "Error: tenantID and storeID are not configured for dbGetInventoryItems"
      );
      return null;
    }

    // Build collection path: tenants/{tenantID}/stores/{storeID}/inventory
    const collectionPath = buildInventoryCollectionPath(tenantID, storeID);

    const items = await firestoreQuery(collectionPath, []);

    return items || [];
  } catch (error) {
    log("Error retrieving inventory items:", error);
    return null;
  }
}

/**
 * Get single workorder by ID from Firestore
 * @param {string} workorderID - Workorder ID (required)
 * @returns {Promise<Object>} Workorder object or null
 */
export async function dbGetWorkorder(workorderID) {
  try {
    const { tenantID, storeID } = getTenantAndStore();

    if (!tenantID || !storeID) {
      log("Error: tenantID and storeID are not configured for dbGetWorkorder");
      return null;
    }

    if (!workorderID) {
      log("Error: workorderID is required for dbGetWorkorder");
      return null;
    }

    const path = buildWorkorderPath(tenantID, storeID, workorderID);
    const workorder = await firestoreRead(path);

    if (!workorder) {
      log("Error: Workorder not found for dbGetWorkorder");
      return null;
    }

    return workorder;
  } catch (error) {
    log("Error retrieving workorder:", error);
    return null;
  }
}

// deleters ////////////////////////////////////////////////////////////////////

export async function dbSoftDeleteWorkorder(workorderID) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID || !workorderID) {
      return { success: false, error: "Validation Error", message: "tenantID, storeID, and workorderID are required" };
    }

    const openPath = buildWorkorderPath(tenantID, storeID, workorderID);
    const workorder = await firestoreRead(openPath);
    if (!workorder) {
      log(`dbSoftDeleteWorkorder: workorder ${workorderID} not found at ${openPath}`);
      return { success: false, error: "Not Found", message: "Workorder not found" };
    }

    const currentUser = useLoginStore.getState().getCurrentUser?.() || useLoginStore.getState().currentUser || null;
    const userID = currentUser?.id || "";
    const userName = [currentUser?.firstName, currentUser?.lastName].filter(Boolean).join(" ").trim() || currentUser?.email || "";
    const deletedDoc = {
      ...workorder,
      _deletedAt: Date.now(),
      _deletedBy: userName || userID,
      _deletedByUserID: userID,
      _deletedActiveSaleID: workorder.activeSaleID || "",
      _deletedCustomerID: workorder.customerID || "",
    };

    const deletedPath = buildDeletedWorkorderPath(tenantID, storeID, workorderID);
    const writeResult = await firestoreWrite(deletedPath, deletedDoc);
    if (!writeResult || writeResult.success === false) {
      return { success: false, error: "Write Failed", message: writeResult?.error || "Failed to write soft-delete record" };
    }
    await firestoreDelete(openPath);

    return { success: true, workorderID, tenantID, storeID };
  } catch (error) {
    log("Error in dbSoftDeleteWorkorder:", error);
    return { success: false, error: "Database Error", message: "An error occurred while soft-deleting the workorder" };
  }
}

export async function dbRehydrateWorkorder(workorderID) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID || !workorderID) {
      return { success: false, error: "Validation Error", message: "tenantID, storeID, and workorderID are required" };
    }

    const deletedPath = buildDeletedWorkorderPath(tenantID, storeID, workorderID);
    const deletedDoc = await firestoreRead(deletedPath);
    if (!deletedDoc) {
      return { success: false, error: "Not Found", message: "Deleted workorder not found (may have been purged)" };
    }

    const { _deletedAt, _deletedBy, _deletedActiveSaleID, _deletedCustomerID, ...restored } = deletedDoc;
    // Clear sale linkage on restore — captured money/credits/deposits stayed with the sale, not the WO.
    restored.activeSaleID = "";
    restored.saleID = "";

    const openPath = buildWorkorderPath(tenantID, storeID, workorderID);
    await firestoreWrite(openPath, restored);
    await firestoreDelete(deletedPath);

    // Re-link to customer.workorders array if customerID present
    if (restored.customerID) {
      try {
        const customer = await dbGetCustomer(restored.customerID);
        if (customer && !(customer.workorders || []).includes(workorderID)) {
          const updated = { ...customer, workorders: [...(customer.workorders || []), workorderID] };
          await dbSaveCustomer(updated);
        }
      } catch (linkErr) {
        log("Warning: failed to re-link rehydrated workorder to customer:", linkErr);
      }
    }

    log(`Rehydrated workorder ${workorderID}`);
    return { success: true, workorderID, workorder: restored };
  } catch (error) {
    log("Error in dbRehydrateWorkorder:", error);
    return { success: false, error: "Database Error", message: "An error occurred while rehydrating the workorder" };
  }
}

export async function dbListDeletedWorkorders(sinceMillis = 0) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) {
      return { success: false, error: "Validation Error", message: "tenantID and storeID are required", workorders: [] };
    }

    const collectionPath = buildDeletedWorkordersCollectionPath(tenantID, storeID);
    // No where/orderBy — orderBy would exclude docs missing `_deletedAt`, and the
    // collection is small (nightly cleanup). Filter + sort in JS.
    const results = await firestoreQuery(collectionPath, [], {});
    const filtered = (results || []).filter((wo) => !sinceMillis || (wo._deletedAt || 0) >= sinceMillis);
    filtered.sort((a, b) => (b._deletedAt || 0) - (a._deletedAt || 0));
    return { success: true, workorders: filtered };
  } catch (error) {
    log("Error in dbListDeletedWorkorders:", error);
    return { success: false, error: "Database Error", message: "An error occurred while listing deleted workorders", workorders: [] };
  }
}

export async function dbListCompletedSalesSince(sinceMillis) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) {
      return { success: false, error: "Validation Error", sales: [] };
    }
    const path = `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/${DB_NODES.FIRESTORE.COMPLETED_SALES}`;
    const results = await firestoreQuery(
      path,
      [{ field: "millis", operator: ">=", value: sinceMillis }],
      { orderBy: { field: "millis", direction: "desc" }, limit: 500 }
    );
    return { success: true, sales: results || [] };
  } catch (error) {
    log("Error in dbListCompletedSalesSince:", error);
    return { success: false, error: "Database Error", sales: [] };
  }
}

export async function dbListCompletedWorkordersSince(sinceMillis) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) {
      return { success: false, error: "Validation Error", workorders: [] };
    }
    const path = `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/${DB_NODES.FIRESTORE.COMPLETED_WORKORDERS}`;
    const results = await firestoreQuery(
      path,
      [{ field: "paidOnMillis", operator: ">=", value: sinceMillis }],
      { orderBy: { field: "paidOnMillis", direction: "desc" }, limit: 500 }
    );
    return { success: true, workorders: results || [] };
  } catch (error) {
    log("Error in dbListCompletedWorkordersSince:", error);
    return { success: false, error: "Database Error", workorders: [] };
  }
}

/**
 * Delete inventory item from Firestore by ID
 * @param {string} itemID - Inventory item ID (required)
 * @returns {Promise<Object>} Delete result
 */
export async function dbDeleteInventoryItem(itemID) {
  try {
    const { tenantID, storeID } = getTenantAndStore();

    if (!tenantID || !storeID) {
      log(
        "Error: tenantID and storeID are not configured for dbDeleteInventoryItem"
      );
      return {
        success: false,
        error: "Configuration Error",
        message:
          "tenantID and storeID are not configured. Please check your settings.",
        itemID: null,
        tenantID,
        storeID,
      };
    }

    if (!itemID) {
      log("Error: itemID is required for dbDeleteInventoryItem");
      return {
        success: false,
        error: "Validation Error",
        message: "itemID is required for dbDeleteInventoryItem",
        itemID: null,
        tenantID,
        storeID,
      };
    }

    const path = buildInventoryPath(tenantID, storeID, itemID);
    log(`Deleting inventory item from path: ${path}`);

    const result = await firestoreDelete(path);

    if (result.success) {
      log(`Successfully deleted inventory item with ID: ${itemID}`);
      return {
        success: true,
        message: "Inventory item deleted successfully",
        itemID,
        tenantID,
        storeID,
        path,
      };
    } else {
      log(`Error deleting inventory item: ${result.error}`);
      return {
        success: false,
        error: result.error,
        message: "Failed to delete inventory item",
        itemID: null,
        tenantID,
        storeID,
        path,
      };
    }
  } catch (error) {
    log("Error in dbDeleteInventoryItem:", error);
    return {
      success: false,
      error: "Database Error",
      message: "An error occurred while deleting the inventory item",
      itemID: null,
      tenantID: null,
      storeID: null,
    };
  }
}

// filters /////////////////////////////////////////////////////////////////////////////

/**
 * Get punch objects by time frame with optional userID filtering
 * @param {number} startTimeMillis - Start time in milliseconds (required)
 * @param {number} endTimeMillis - End time in milliseconds (required)
 * @param {Object} options - Optional parameters
 * @param {string} options.userID - User ID to filter by (optional)
 * @param {string} options.timestampField - Field name for timestamp (default: "timestamp")
 * @returns {Promise<Array>} Array of punch objects or null
 */
export async function dbGetPunchesByTimeFrame(
  startTimeMillis,
  endTimeMillis,
  options = {}
) {
  const { userID, timestampField = "timestamp" } = options;

  try {
    const { tenantID, storeID } = getTenantAndStore();

    if (!tenantID || !storeID) {
      log(
        "Error: tenantID and storeID are not configured for dbGetPunchesByTimeFrame"
      );
      return null;
    }

    if (!startTimeMillis || !endTimeMillis) {
      log(
        "Error: startTimeMillis and endTimeMillis are required for dbGetPunchesByTimeFrame"
      );
      return null;
    }

    if (startTimeMillis >= endTimeMillis) {
      log(
        "Error: startTimeMillis must be less than endTimeMillis for dbGetPunchesByTimeFrame"
      );
      return null;
    }

    // Build collection path: tenants/{tenantID}/stores/{storeID}/punches
    const collectionPath = buildPunchesCollectionPath(tenantID, storeID);

    // Build where clauses for time range
    const whereClauses = [
      { field: timestampField, operator: ">=", value: startTimeMillis },
      { field: timestampField, operator: "<=", value: endTimeMillis },
    ];

    // Add userID filter if provided
    if (userID) {
      whereClauses.push({ field: "userID", operator: "==", value: userID });
    }

    // Query with time range and optional userID filter
    const punches = await firestoreQuery(collectionPath, whereClauses, {
      orderBy: { field: timestampField, direction: "asc" },
    });

    return punches || [];
  } catch (error) {
    log("Error retrieving punches by time frame:", error);
    return null;
  }
}

/**
 * Search customers by phone number in Firestore (supports partial matching for real-time search)
 * Searches in "cell" and "landline" phone number fields
 * @param {string} phoneNumber - Phone number (up to 10 digits, supports partial matches)
 * @returns {Promise<Object>} Object with success status and array of matching customers
 */
export async function dbSearchCustomersByPhone(phoneNumber) {
  try {
    const { tenantID, storeID } = getTenantAndStore();

    if (!tenantID || !storeID) {
      log("Error: tenantID and storeID are not configured for dbSearchCustomersByPhone");
      return [];
    }

    if (!phoneNumber || typeof phoneNumber !== "string") {
      log("Error: phoneNumber is required and must be a string for dbSearchCustomersByPhone");
      return [];
    }

    // Clean and validate phone number (remove non-digits, limit to 10 digits)
    const cleanPhone = phoneNumber.replace(/\D/g, "").substring(0, 10);

    if (cleanPhone.length === 0) {
      log("Error: Phone number must contain at least one digit for dbSearchCustomersByPhone");
      return [];
    }

    // Build collection path for customers
    const collectionPath = buildCustomerCollectionPath(tenantID, storeID);

    // Create queries for phone number search (partial match for real-time typing)
    // Each field gets a range query to find partial matches
    // Query both new and old field names for backward compatibility with existing Firestore documents
    const fieldQueries = [{ field: "customerCell" }, { field: "customerLandline" }, { field: "cell" }, { field: "landline" }];

    // Execute multiple queries and combine results
    const allResults = [];
    const seenIds = new Set();

    for (const fieldQuery of fieldQueries) {
      try {
        // Use range query to find partial matches (starts-with behavior)
        const whereClauses = [
          { field: fieldQuery.field, operator: ">=", value: cleanPhone },
          {
            field: fieldQuery.field,
            operator: "<=",
            value: cleanPhone + "\uf8ff",
          },
        ];

        const results = await firestoreQuery(collectionPath, whereClauses);

        // Filter results to ensure they actually start with the phone number
        // (Firestore range queries can return results that don't start with the value)
        const filteredResults = results.filter((customer) => {
          const phoneValue = customer[fieldQuery.field];
          return phoneValue && phoneValue.toString().startsWith(cleanPhone);
        });

        // Add unique results to the combined array
        for (const customer of filteredResults) {
          if (!seenIds.has(customer.id)) {
            allResults.push(customer);
            seenIds.add(customer.id);
          }
        }
      } catch (queryError) {
        // Continue with other queries if one fails (e.g., field doesn't exist)
        log(`Query failed for field ${fieldQuery.field}:`, queryError);
      }
    }
    return allResults;
  } catch (error) {
    log("Error searching customers by phone:", error);
    return [];
  }
}

/**
 * Check if a cell phone number already exists on another customer.
 * Unlike dbSearchCustomersByPhone, this function THROWS on network/query errors
 * so the caller can distinguish "no match" from "network failure".
 * @param {string} phone - 10-digit cell phone number
 * @param {string} [excludeCustomerID] - Customer ID to exclude (for editing existing customers)
 * @returns {Promise<{exists: boolean, customer: object|null}>}
 * @throws {Error} On network or query failure
 */
export async function dbCheckCellPhoneExists(phone, excludeCustomerID) {
  const { tenantID, storeID } = getTenantAndStore();
  if (!tenantID || !storeID) throw new Error("Tenant/store not configured");

  const cleanPhone = (phone || "").replace(/\D/g, "");
  if (cleanPhone.length !== 10) return { exists: false, customer: null };

  const collectionPath = buildCustomerCollectionPath(tenantID, storeID);

  // Query both current and legacy field names
  for (const field of ["customerCell", "cell"]) {
    const results = await firestoreQuery(collectionPath, [
      { field, operator: "==", value: cleanPhone },
    ]);
    const match = excludeCustomerID
      ? results.find((c) => c.id !== excludeCustomerID)
      : results[0];
    if (match) return { exists: true, customer: match };
  }

  return { exists: false, customer: null };
}

/**
 * Search customers by email in Firestore (supports partial matching for real-time search)
 * @param {string} email - Email address (supports partial matches)
 * @returns {Promise<Object>} Object with success status and array of matching customers
 */
export async function dbSearchCustomersByEmail(email) {
  try {
    const { tenantID, storeID } = getTenantAndStore();

    if (!tenantID || !storeID) {
      log("Error: tenantID and storeID are not configured for dbSearchCustomersByEmail");
      return [];
    }

    if (!email || typeof email !== "string") {
      log("Error: email is required and must be a string for dbSearchCustomersByEmail");
      return [];
    }

    // Clean and validate email (trim whitespace, convert to lowercase)
    const cleanEmail = email.trim().toLowerCase();

    if (cleanEmail.length === 0) {
      log("Error: Email must contain at least one character for dbSearchCustomersByEmail");
      return [];
    }

    // Build collection path for customers
    const collectionPath = buildCustomerCollectionPath(tenantID, storeID);

    // Create query for email search (partial match for real-time typing)
    const whereClauses = [
      { field: "email", operator: ">=", value: cleanEmail },
      { field: "email", operator: "<=", value: cleanEmail + "\uf8ff" },
    ];

    const results = await firestoreQuery(collectionPath, whereClauses);

    // Filter results to ensure they actually start with the email
    // (Firestore range queries can return results that don't start with the value)
    const filteredResults = results.filter((customer) => {
      const emailValue = customer.email;
      return (
        emailValue && emailValue.toString().toLowerCase().startsWith(cleanEmail)
      );
    });

    return filteredResults;
  } catch (error) {
    log("Error searching customers by email:", error);
    return [];
  }
}

/**
 * Search customers by first and last name in Firestore (supports partial matching for real-time search)
 * Searches in "first" and "last" name fields
 * @param {string} name - Name to search for (supports partial matches)
 * @returns {Promise<Object>} Object with success status and array of matching customers
 */
export async function dbSearchCustomersByName(name) {
  try {
    const { tenantID, storeID } = getTenantAndStore();

    if (!tenantID || !storeID) {
      log("Error: tenantID and storeID are not configured for dbSearchCustomersByName");
      return [];
    }

    if (!name || typeof name !== "string") {
      log("Error: name is required and must be a string for dbSearchCustomersByName");
      return [];
    }

    // Canonicalize to match storage form (capitalize-first; see CLAUDE.md customer-fields rule).
    const cleanName = capitalizeFirstLetterOfString(name.trim());

    if (cleanName.length === 0) {
      log("Error: Name must contain at least one character for dbSearchCustomersByName");
      return [];
    }

    const collectionPath = buildCustomerCollectionPath(tenantID, storeID);

    const fieldQueries = [{ field: "first" }, { field: "last" }];

    const allResults = [];
    const seenIds = new Set();

    for (const fieldQuery of fieldQueries) {
      try {
        const whereClauses = [
          { field: fieldQuery.field, operator: ">=", value: cleanName },
          {
            field: fieldQuery.field,
            operator: "<=",
            value: cleanName + "\uf8ff",
          },
        ];

        const results = await firestoreQuery(collectionPath, whereClauses);

        const filteredResults = results.filter((customer) => {
          const nameValue = customer[fieldQuery.field];
          return nameValue && nameValue.toString().startsWith(cleanName);
        });

        // Add unique results to the combined array
        for (const customer of filteredResults) {
          if (!seenIds.has(customer.id)) {
            allResults.push(customer);
            seenIds.add(customer.id);
          }
        }
      } catch (queryError) {
        // Continue with other queries if one fails (e.g., field doesn't exist)
        log(`Query failed for field ${fieldQuery.field}:`, queryError);
      }
    }

    return allResults;
  } catch (error) {
    log("Error searching customers by name:", error);
    return [];
  }
}

// database change listeners ///////////////////////////////////////////////////////////

/**
 * Listen to changes in open workorders collection for a tenant/store
 * @param {Function} onSnapshot - Callback function called when workorders change
 * @returns {Function} Unsubscribe function to stop listening
 */
export function dbListenToOpenWorkorders(onSnapshot, onError) {
  const name = "workorders";
  try {
    const { tenantID, storeID } = getTenantAndStore();

    if (!tenantID || !storeID) {
      log(
        "Error: tenantID and storeID are not configured for dbListenToOpenWorkorders"
      );
      return null;
    }

    if (!onSnapshot || typeof onSnapshot !== "function") {
      log(
        "Error: onSnapshot callback function is required for dbListenToOpenWorkorders"
      );
      return null;
    }

    // Build collection path: tenants/{tenantID}/stores/{storeID}/open-workorders
    const collectionPath = buildOpenWorkordersCollectionPath(tenantID, storeID);

    __logListenerAttach(name);
    // Subscribe to collection changes
    const unsubscribe = firestoreSubscribeCollection(
      collectionPath,
      (workordersData, error, meta) => {
        if (error) {
          log("Workorder listener error", { tenantID, storeID, error });
          if (onError) onError(error);
          return;
        }

        __logListenerEmit(name, meta);
        onSnapshot(workordersData);
      }
    );

    return () => {
      __logListenerDetach(name);
      unsubscribe();
    };
  } catch (error) {
    log("Error setting up workorder listener:", error);
    if (onError) onError(error);
    return null;
  }
}

export function dbListenToActiveSales(onSnapshot, onError) {
  const name = "activeSales";
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) {
      log("Error: tenantID and storeID are not configured for dbListenToActiveSales");
      return null;
    }
    if (!onSnapshot || typeof onSnapshot !== "function") {
      log("Error: onSnapshot callback function is required for dbListenToActiveSales");
      return null;
    }
    const collectionPath = `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/${DB_NODES.FIRESTORE.ACTIVE_SALES}`;
    __logListenerAttach(name);
    const unsubscribe = firestoreSubscribeCollection(
      collectionPath,
      (salesData, error, meta) => {
        if (error) {
          log("Active sales listener error", { tenantID, storeID, error });
          if (onError) onError(error);
          return;
        }
        __logListenerEmit(name, meta);
        onSnapshot(salesData);
      }
    );
    return () => {
      __logListenerDetach(name);
      unsubscribe();
    };
  } catch (error) {
    log("Error setting up active sales listener:", error);
    if (onError) onError(error);
    return null;
  }
}

/**
 * Listen to the SaaS per-store inbound messages collection
 * (tenants/{tid}/stores/{sid}/incoming-messages).
 *
 * Docs are keyed by Twilio MessageSid and written by the inbound Pub/Sub
 * subscriber on the SaaS Functions deploy target. SaaS-only — for Bonita
 * builds, this listener will simply return an empty collection.
 *
 * @param {Function} onSnapshot - called with array of inbound message docs
 * @param {Function} onError - optional error callback
 * @returns {Function} unsubscribe function (or null if pre-conditions fail)
 */
export function dbListenToSaasIncomingMessages(onSnapshot, onError) {
  const name = "saasIncomingMessages";
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) {
      log("Error: tenantID/storeID not configured for dbListenToSaasIncomingMessages");
      return null;
    }
    if (!onSnapshot || typeof onSnapshot !== "function") {
      log("Error: onSnapshot callback required for dbListenToSaasIncomingMessages");
      return null;
    }
    const collectionPath = `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/${DB_NODES.FIRESTORE.INCOMING_MESSAGES}`;
    __logListenerAttach(name);
    const unsubscribe = firestoreSubscribeCollection(
      collectionPath,
      (messages, error, meta) => {
        if (error) {
          log("SaaS incoming messages listener error", { tenantID, storeID, error });
          if (onError) onError(error);
          return;
        }
        __logListenerEmit(name, meta);
        const normalized = (messages || [])
          .map(normalizeSaasMessageToBonita)
          .filter(Boolean);
        onSnapshot(normalized);
      }
    );
    return () => {
      __logListenerDetach(name);
      unsubscribe();
    };
  } catch (error) {
    log("Error setting up SaaS incoming messages listener:", error);
    if (onError) onError(error);
    return null;
  }
}

// Convert a SaaS message doc (incoming-messages or outgoing-messages) to the
// Bonita-shape object the existing messaging UI expects. Lets us reuse
// Options_Messages.jsx across both backends without per-component branching.
function normalizeSaasMessageToBonita(saasMsg) {
  if (!saasMsg || typeof saasMsg !== "object") return null;
  const isInbound = saasMsg.direction === "inbound";
  const phoneRaw = isInbound ? saasMsg.from : saasMsg.to;
  const phoneNumber = String(phoneRaw || "").replace(/\D/g, "").slice(-10);

  let millis = 0;
  if (typeof saasMsg.twilioReceivedAt === "string") {
    const parsed = Date.parse(saasMsg.twilioReceivedAt);
    if (!isNaN(parsed)) millis = parsed;
  }
  if (!millis && saasMsg.sentAt && typeof saasMsg.sentAt.toMillis === "function") {
    millis = saasMsg.sentAt.toMillis();
  }
  if (!millis && saasMsg.receivedAt && typeof saasMsg.receivedAt.toMillis === "function") {
    millis = saasMsg.receivedAt.toMillis();
  }
  if (!millis) millis = Date.now();

  const mediaUrls = isInbound
    ? (saasMsg.media || []).map((m) => m && (m.signedUrl || m.gcsUri || m.storagePath)).filter(Boolean)
    : (saasMsg.mediaUrlsOriginal || []);

  return {
    id: saasMsg.messageSid || saasMsg.id || "",
    messageSid: saasMsg.messageSid || "",
    primaryMessageSid: saasMsg.primaryMessageSid || saasMsg.messageSid || "",
    sequenceIndex: saasMsg.sequenceIndex || 0,
    message: saasMsg.body || "",
    phoneNumber,
    type: isInbound ? "incoming" : "outgoing",
    millis,
    status: saasMsg.latestStatus || (isInbound ? "received" : "sent"),
    hasMedia: (saasMsg.numMedia || 0) > 0,
    numMedia: saasMsg.numMedia || 0,
    mediaUrls,
    read: !!saasMsg.read,
    customerID: saasMsg.customerID || "",
    workorderID: saasMsg.workorderID || "",
    sentByUser: saasMsg.sentByUserID || "",
    senderUserObj: saasMsg.sentByUserID
      ? { id: saasMsg.sentByUserID, first: saasMsg.sentByName || "" }
      : null,
    canRespond: true,
    forwardTo: null,
    threadStatus: "active",
    firstName: "",
    lastName: "",
  };
}

/**
 * Listen to the SaaS per-store outbound messages collection
 * (tenants/{tid}/stores/{sid}/outgoing-messages).
 *
 * Docs are keyed by Twilio MessageSid. Multi-image MMS produces N docs
 * sharing a primaryMessageSid + sequenceIndex — group on primaryMessageSid
 * in UI to display them as a single user-level message.
 *
 * @param {Function} onSnapshot - called with array of outbound message docs
 * @param {Function} onError - optional error callback
 * @returns {Function} unsubscribe function (or null if pre-conditions fail)
 */
export function dbListenToSaasOutgoingMessages(onSnapshot, onError) {
  const name = "saasOutgoingMessages";
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) {
      log("Error: tenantID/storeID not configured for dbListenToSaasOutgoingMessages");
      return null;
    }
    if (!onSnapshot || typeof onSnapshot !== "function") {
      log("Error: onSnapshot callback required for dbListenToSaasOutgoingMessages");
      return null;
    }
    const collectionPath = `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/${DB_NODES.FIRESTORE.OUTGOING_MESSAGES}`;
    __logListenerAttach(name);
    const unsubscribe = firestoreSubscribeCollection(
      collectionPath,
      (messages, error, meta) => {
        if (error) {
          log("SaaS outgoing messages listener error", { tenantID, storeID, error });
          if (onError) onError(error);
          return;
        }
        __logListenerEmit(name, meta);
        const normalized = (messages || [])
          .map(normalizeSaasMessageToBonita)
          .filter(Boolean);
        onSnapshot(normalized);
      }
    );
    return () => {
      __logListenerDetach(name);
      unsubscribe();
    };
  } catch (error) {
    log("Error setting up SaaS outgoing messages listener:", error);
    if (onError) onError(error);
    return null;
  }
}

/**
 * Listen to changes on a single workorder document
 * @param {string} workorderID
 * @param {Function} callback - called with workorder data (or null)
 * @returns {Function} unsubscribe function
 */
export function dbListenToSingleWorkorder(workorderID, callback) {
  const name = `singleWorkorder:${workorderID}`;
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID || !workorderID) return null;
    const path = buildOpenWorkordersCollectionPath(tenantID, storeID) + "/" + workorderID;
    __logListenerAttach(name);
    const unsubscribe = firestoreSubscribe(path, (data, error, meta) => {
      __logListenerEmit(name, meta);
      callback(data ? { ...data, id: workorderID } : null);
    });
    return () => {
      __logListenerDetach(name);
      unsubscribe();
    };
  } catch (error) {
    log("Error setting up single workorder listener:", error);
    return null;
  }
}

/**
 * Listen to changes in settings document for a tenant/store
 * @param {Function} onChange - Callback function called when settings change
 * @returns {Function} Unsubscribe function to stop listening
 */
export function dbListenToSettings(onChange, onError) {
  const name = "settings";
  try {
    const { tenantID, storeID } = getTenantAndStore();

    if (!tenantID || !storeID) {
      log(
        "Error: tenantID and storeID are not configured for dbListenToSettings"
      );
      return null;
    }

    if (!onChange || typeof onChange !== "function") {
      log(
        "Error: onChange callback function is required for dbListenToSettings"
      );
      return null;
    }

    // Build path: tenants/{tenantID}/stores/{storeID}/settings/settings
    const path = buildSettingsPath(tenantID, storeID);

    __logListenerAttach(name);
    // Subscribe to document changes
    const unsubscribe = firestoreSubscribe(path, (settingsData, error, meta) => {
      if (error) {
        log("Settings listener error", { tenantID, storeID, error });
        if (onError) onError(error);
        return;
      }

      __logListenerEmit(name, meta);
      onChange(settingsData, tenantID, storeID);
    });

    return () => {
      __logListenerDetach(name);
      unsubscribe();
    };
  } catch (error) {
    log("Error setting up settings listener:", error);
    if (onError) onError(error);
    return null;
  }
}

/**
 * Listen to changes in the phone-config document for a tenant/store.
 * Path: tenants/{tenantID}/stores/{storeID}/phone-config/main
 */
export function dbListenToPhoneConfig(onChange, onError) {
  const name = "phoneConfig";
  try {
    const { tenantID, storeID } = getTenantAndStore();

    if (!tenantID || !storeID) {
      log("Error: tenantID and storeID are not configured for dbListenToPhoneConfig");
      return null;
    }

    if (!onChange || typeof onChange !== "function") {
      log("Error: onChange callback function is required for dbListenToPhoneConfig");
      return null;
    }

    const path = buildPhoneConfigPath(tenantID, storeID);

    __logListenerAttach(name);
    const unsubscribe = firestoreSubscribe(path, (data, error, meta) => {
      if (error) {
        log("Phone-config listener error", { tenantID, storeID, error });
        if (onError) onError(error);
        return;
      }
      __logListenerEmit(name, meta);
      onChange(data, tenantID, storeID);
    });

    return () => {
      __logListenerDetach(name);
      unsubscribe();
    };
  } catch (error) {
    log("Error setting up phone-config listener:", error);
    if (onError) onError(error);
    return null;
  }
}

/**
 * Listen to changes in current punch clock document for a tenant/store
 * @param {Function} onChange - Callback function called when punch clock changes
 * @returns {Function} Unsubscribe function to stop listening
 */
export function dbListenToCurrentPunchClock(onChange, onError) {
  const name = "punchClock";
  try {
    const { tenantID, storeID } = getTenantAndStore();

    if (!tenantID || !storeID) {
      log(
        "Error: tenantID and storeID are not configured for dbListenToCurrentPunchClock"
      );
      return null;
    }

    if (!onChange || typeof onChange !== "function") {
      log(
        "Error: onChange callback function is required for dbListenToCurrentPunchClock"
      );
      return null;
    }

    // Build path: tenants/{tenantID}/stores/{storeID}/punch_clock/current
    const path = buildCurrentPunchClockPath(tenantID, storeID);

    __logListenerAttach(name);
    // Subscribe to document changes
    const unsubscribe = firestoreSubscribe(path, (punchClockData, error, meta) => {
      if (error) {
        log("Current punch clock listener error", { tenantID, storeID, error });
        if (onError) onError(error);
        return;
      }
      if (!punchClockData) punchClockData = {};
      __logListenerEmit(name, meta);
      onChange(punchClockData);
    });

    return () => {
      __logListenerDetach(name);
      unsubscribe();
    };
  } catch (error) {
    log("Error setting up current punch clock listener:", error);
    if (onError) onError(error);
    return null;
  }
}

/**
 * Listen to changes in inventory collection for a tenant/store
 * @param {Function} onSnapshot - Callback function called when inventory changes
 * @returns {Function} Unsubscribe function to stop listening
 */
export function dbListenToInventory(onSnapshot, onError) {
  const name = "inventory";
  try {
    const { tenantID, storeID } = getTenantAndStore();

    if (!tenantID || !storeID) {
      log(
        "Error: tenantID and storeID are not configured for dbListenToInventory"
      );
      return null;
    }

    if (!onSnapshot || typeof onSnapshot !== "function") {
      log(
        "Error: onSnapshot callback function is required for dbListenToInventory"
      );
      return null;
    }

    // Build collection path: tenants/{tenantID}/stores/{storeID}/inventory
    const collectionPath = buildInventoryCollectionPath(tenantID, storeID);

    __logListenerAttach(name);
    // Subscribe to collection changes
    const unsubscribe = firestoreSubscribeCollection(
      collectionPath,
      (inventoryData, error, meta) => {
        if (error) {
          log("Inventory listener error", { tenantID, storeID, error });
          if (onError) onError(error);
          return;
        }

        __logListenerEmit(name, meta);
        onSnapshot(inventoryData);
      }
    );

    return () => {
      __logListenerDetach(name);
      unsubscribe();
    };
  } catch (error) {
    log("Error setting up inventory listener:", error);
    if (onError) onError(error);
    return null;
  }
}

export function dbListenToDevLogs(docName, callback) {
  const name = `devLogs:${docName}`;
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) return null;
    const path = `tenants/${tenantID}/stores/${storeID}/dev-logs/${docName}`;
    __logListenerAttach(name);
    const unsubscribe = firestoreSubscribe(path, (data, error, meta) => {
      __logListenerEmit(name, meta);
      callback(data, error);
    });
    return () => {
      __logListenerDetach(name);
      unsubscribe();
    };
  } catch (error) {
    log("Error setting up dev log listener:", error);
    return null;
  }
}

/**
 * Listen to payment processing reader updates for a specific reader and payment intent
 * @param {string} readerID - Reader ID
 * @param {string} paymentIntentID - Payment Intent ID
 * @param {Function} onUpdate - Callback function called with update data
 * @param {Function} onCompletion - Callback function called with completion data
 * @returns {Object} Object with unsubscribe functions for both listeners
 */
export function dbListenToPaymentReaderUpdates(
  readerID,
  paymentIntentID,
  onUpdate,
  onCompletion
) {
  try {
    const { tenantID, storeID } = getTenantAndStore();

    if (!tenantID || !storeID) {
      log(
        "Error: tenantID and storeID are not configured for dbListenToPaymentReaderUpdates"
      );
      return null;
    }

    if (!readerID || typeof readerID !== "string") {
      log(
        "Error: readerID is required and must be a string for dbListenToPaymentReaderUpdates"
      );
      return null;
    }

    if (!paymentIntentID || typeof paymentIntentID !== "string") {
      log(
        "Error: paymentIntentID is required and must be a string for dbListenToPaymentReaderUpdates"
      );
      return null;
    }

    if (!onUpdate || typeof onUpdate !== "function") {
      log(
        "Error: onUpdate callback function is required for dbListenToPaymentReaderUpdates"
      );
      return null;
    }

    if (!onCompletion || typeof onCompletion !== "function") {
      log(
        "Error: onCompletion callback function is required for dbListenToPaymentReaderUpdates"
      );
      return null;
    }

    // Build paths for updates and completions
    const updatesPath = buildPaymentReaderUpdatesPath(
      tenantID,
      storeID,
      readerID,
      paymentIntentID
    );
    const completionsPath = buildPaymentReaderCompletionsPath(
      tenantID,
      storeID,
      readerID,
      paymentIntentID
    );

    const updatesName = `paymentReaderUpdates:${readerID}:${paymentIntentID}`;
    const completionsName = `paymentReaderCompletions:${readerID}:${paymentIntentID}`;

    __logListenerAttach(updatesName);
    // Subscribe to updates
    const unsubscribeUpdates = firestoreSubscribe(
      updatesPath,
      (updateData, error, meta) => {
        if (error) {
          log("Payment reader updates listener error", {
            tenantID,
            storeID,
            readerID,
            paymentIntentID,
            error,
          });
          return;
        }

        __logListenerEmit(updatesName, meta);
        onUpdate(updateData);
      }
    );

    __logListenerAttach(completionsName);
    // Subscribe to completions
    const unsubscribeCompletions = firestoreSubscribe(
      completionsPath,
      (completionData, error, meta) => {
        if (error) {
          log("Payment reader completions listener error", {
            tenantID,
            storeID,
            readerID,
            paymentIntentID,
            error,
          });
          return;
        }

        __logListenerEmit(completionsName, meta);
        onCompletion(completionData);
      }
    );

    const unsubscribeUpdatesWrapped = () => {
      __logListenerDetach(updatesName);
      unsubscribeUpdates();
    };
    const unsubscribeCompletionsWrapped = () => {
      __logListenerDetach(completionsName);
      unsubscribeCompletions();
    };

    // Return object with both unsubscribe functions
    return {
      unsubscribeUpdates: unsubscribeUpdatesWrapped,
      unsubscribeCompletions: unsubscribeCompletionsWrapped,
      unsubscribe: () => {
        unsubscribeUpdatesWrapped();
        unsubscribeCompletionsWrapped();
      },
    };
  } catch (error) {
    log("Error setting up payment reader listener:", error);
    return null;
  }
}

// auth /////////////////////////////////////////////////////////////////////////////////

const TENANT_CACHE_KEY = "warpspeed_tenant";

/**
 * Load tenant info and settings for a Firebase user.
 * @param {string} tenantID - Tenant ID (from claims or cache)
 * @param {string} storeID - Store ID (from claims or cache)
 * @param {Object} [preloadedSettings] - Settings already fetched server-side (skips Firestore read)
 * @returns {Promise<Object>} { tenantID, storeID, settings }
 */
export async function loadTenantAndSettings(tenantID, storeID, preloadedSettings) {
  if (!tenantID || !storeID) {
    throw new Error("User is not associated with any tenant/store");
  }

  // 1. Try Zustand persisted settings first (instant)
  const persisted = useSettingsStore.getState().settings;
  if (persisted?.tenantID === tenantID && persisted?.storeID === storeID) {
    return { tenantID, storeID, settings: persisted };
  }

  // 2. Use preloaded settings if available, otherwise fetch from Firestore
  const settings = preloadedSettings || await dbGetSettings(tenantID, storeID);
  if (!settings) {
    throw new Error("Settings not found for tenant/store");
  }

  // 3. Cache & populate store
  localStorageWrapper.setItem(TENANT_CACHE_KEY, { tenantID, storeID });
  useSettingsStore.getState().setSettings(settings, false, false);

  return { tenantID, storeID, settings };
}

/**
 * Login user with email and password using Firebase Cloud Function
 * @param {string} email - User email
 * @param {string} password - User password
 * @param {Object} options - Optional parameters
 * @param {boolean} options.isAutoLogin - Whether this is an auto-login (for logging purposes)
 * @returns {Promise<Object>} Login result with authentication data only
 */
export async function dbLoginUser(email, password, options = {}) {
  const isAutoLogin = options.isAutoLogin || false;

  try {
    // Use Firebase Auth directly for login
    const { signInWithEmailAndPassword } = await import("firebase/auth");
    const { AUTH } = await import("./db_calls");

    const userCredential = await signInWithEmailAndPassword(
      AUTH,
      email,
      password
    );
    const user = userCredential.user;

    if (!user) {
      throw new Error("Login failed - no user data returned");
    }

    // SaaS users already carry {tenantID, privilege, stores[]} claims from
    // bootstrap / invite redemption. The legacy loginAppUserCallable is a
    // Bonita-only helper that (a) looks up the caller in the top-level
    // `email_users` index that SaaS tenants don't populate, and (b) backfills
    // legacy {tenantID, storeID} claims that would clobber the SaaS shape.
    // Detect SaaS via the presence of the `privilege` claim and skip it.
    const initialClaims =
      (await user.getIdTokenResult()).claims || {};
    const isSaasUser = Boolean(initialClaims.privilege);

    let tenantID;
    let storeID;
    let settings = null;

    if (isSaasUser) {
      tenantID = initialClaims.tenantID || null;
      const claimStores = Array.isArray(initialClaims.stores)
        ? initialClaims.stores
        : [];
      storeID = claimStores[0] || null;
      log("SaaS sign-in claims:", { tenantID, storeID, privilege: initialClaims.privilege });
    } else {
      const callableResult = await loginAppUserCallable({ email, password });
      ({ tenantID, storeID, settings } = callableResult.data);
      await user.getIdToken(true);
      log("Token claims after refresh:", (await user.getIdTokenResult()).claims);
    }

    return {
      success: true,
      user: {
        uid: user.uid,
        email: user.email,
        emailVerified: user.emailVerified,
        displayName: user.displayName,
      },
      tenantID,
      storeID,
      settings,
    };
  } catch (error) {
    const logPrefix = isAutoLogin ? "Auto-login" : "Login";
    log(`${logPrefix} failed:`, error);
    throw error;
  }
}

/**
 * Sign out user from Firebase Auth
 * @param {Object} options - Optional parameters
 * @param {boolean} options.signOutFromAuth - Whether to sign out from Firebase Auth (default: true)
 * @returns {Promise<Object>} Sign out result
 */
export async function dbLogout(options = {}) {
  try {
    log("Starting sign out process");
    localStorageWrapper.removeItem(TENANT_CACHE_KEY);
    clearPersistedStores();
    await authSignOut();
    log("Sign out successful");
    return { success: true, message: "User signed out successfully" };
  } catch (error) {
    log("Sign out failed:", error);
    throw error;
  }
}

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
 * Request a one-time 6-digit sign-in code for the given identifier
 * (email or E.164 phone). Server looks up the matching Auth user,
 * persists the code at tenants/{tenantID}/sign_in_codes/{uid}, and
 * emails it to the user. Resolves to { success, delivery: { method, to } }.
 */
export async function dbRequestSignInCode(identifier) {
  const { requestSignInCodeCallable } = await import("./db_calls");
  const result = await requestSignInCodeCallable({ identifier });
  return result.data;
}

/**
 * Verify a sign-in code. On success the server mints a custom token
 * scoped to the matched user and returns the per-store enabled/disabled
 * split so the UI can show a picker for multi-store users.
 * Resolves to { success, token, tenantID, stores, enabledStores, disabledStores }.
 */
export async function dbVerifySignInCode(identifier, code) {
  const { verifySignInCodeCallable } = await import("./db_calls");
  const result = await verifySignInCodeCallable({ identifier, code });
  return result.data;
}

/**
 * Sign in with a custom token minted by verifySignInCodeCallable.
 * The auth state listener in App.jsx picks up the new user and runs
 * loadTenantAndSettings + claim hydration.
 */
export async function dbSignInWithCustomToken(token) {
  const { signInWithCustomToken } = await import("firebase/auth");
  const userCredential = await signInWithCustomToken(AUTH, token);
  return userCredential.user;
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

// creates a random ID using firestore utility
export function getNewCollectionRef(collectionName) {
  let ref = doc(collection(DB, collectionName));
  return ref;
}

// server driven Stripe payments ////////////////////////////////////////////////
export function createPaymentPollingFallback(
  pollingConfig,
  onUpdate,
  onComplete,
  onError,
  onTimeout
) {
  const {
    firestorePaths,
    pollingInterval = 3000,
    maxPollingTime = MILLIS_IN_MINUTE * 2,
    timeoutMessage = "Payment processing timeout",
  } = pollingConfig;

  let pollingTimer = null;
  let timeoutTimer = null;
  let isPolling = false;
  let lastUpdateTime = Date.now();

  const startPolling = () => {
    if (isPolling) return;

    isPolling = true;
    log(
      `Starting payment polling fallback for Firestore paths:`,
      firestorePaths
    );

    // Set up timeout timer
    timeoutTimer = setTimeout(() => {
      stopPolling();
      onTimeout && onTimeout(timeoutMessage);
      log(`Payment polling timeout reached for Firestore paths`);
    }, maxPollingTime);

    // Start polling
    pollingTimer = setInterval(async () => {
      try {
        // Check for updates in Firestore
        const updateData = await firestoreRead(firestorePaths.update);
        const completeData = await firestoreRead(firestorePaths.complete);

        // Check for completion
        if (completeData) {
          log("Payment completed via polling fallback", completeData);
          stopPolling();
          onComplete && onComplete(completeData);
          return;
        }

        // Check for updates
        if (updateData) {
          const updateTime =
            updateData.timestamp?.toMillis?.() ||
            updateData.timestamp ||
            Date.now();

          // Only process if this is a new update
          if (updateTime > lastUpdateTime) {
            lastUpdateTime = updateTime;
            log("Payment update received via polling fallback", updateData);
            onUpdate && onUpdate(updateData);

            // Check if this is a final status (success/failure)
            if (
              updateData.status === "succeeded" ||
              updateData.status === "failed" ||
              updateData.status === "canceled"
            ) {
              stopPolling();
            }
          }
        }

        // Check for stale data (no updates for too long)
        const timeSinceLastUpdate = Date.now() - lastUpdateTime;
        if (timeSinceLastUpdate > 60000) {
          // 1 minute without updates
          log(
            `Stale data detected for Firestore paths, no updates for ${timeSinceLastUpdate}ms`
          );
          onError &&
            onError("Payment processing appears stalled - no updates received");
        }
      } catch (error) {
        log("Error in payment polling fallback:", error);
        onError && onError(`Polling error: ${error.message}`);
      }
    }, pollingInterval);
  };

  const stopPolling = () => {
    if (!isPolling) return;

    isPolling = false;

    if (pollingTimer) {
      clearInterval(pollingTimer);
      pollingTimer = null;
    }

    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
      timeoutTimer = null;
    }

    log(`Stopped payment polling fallback for Firestore paths`);
  };

  const isActive = () => isPolling;

  return {
    start: startPolling,
    stop: stopPolling,
    isActive,
  };
}

export async function dbProcessServerDrivenStripePayment(
  saleAmount,
  terminalID,
  paymentIntentID
) {
  return processServerDrivenStripePayment(
    saleAmount,
    terminalID,
    paymentIntentID
  );
}

export function dbCancelServerDrivenStripePayment(readerID) {
  return cancelServerDrivenStripePayment(readerID);
}

export function dbRetrieveAvailableStripeReaders() {
  return retrieveAvailableStripeReaders();
}

export function processServerDrivenStripePayment(
  saleAmount,
  readerID,
  paymentIntentID
) {
  return processServerDrivenStripePaymentCallable({
    amount: Number(saleAmount),
    readerID,
    paymentIntentID,
  })
    .then((result) => {
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
      return result.data;
    })
    .catch((error) => {
      log("Error retrieving Stripe readers:", error);
      throw error;
    });
}

/**
 * Send SMS using enhanced function with comprehensive error handling
 * @param {Object} params - SMS parameters object
 * @param {string} params.message - Message content to send
 * @param {string} params.phoneNumber - Phone number (10 digits, US format)
 * @param {string} params.tenantID - Tenant ID (required)
 * @param {string} params.storeID - Store ID (required)
 * @param {string} [params.customerID] - Customer ID (optional)
 * @param {string} [params.messageID] - Message ID (optional)
 * @param {string} [params.fromNumber] - From phone number (optional, defaults to +12393171234)
 * @returns {Promise<Object>} Result object with success status and data
 */

export async function dbSendSMS(
  message,
) {
  const { tenantID, storeID } = getTenantAndStore();

  try {
    if (!message || typeof message !== "object") {
      throw new Error("Message object is required");
    }

    if ((!message.message || typeof message.message !== "string") && !message.imageUrl && !(message.mediaUrls?.length > 0)) {
      throw new Error("Message text or image URL is required");
    }

    if (!message.phoneNumber || typeof message.phoneNumber !== "string") {
      throw new Error("Phone number is required and must be a string");
    }

    if (!tenantID || typeof tenantID !== "string") {
      throw new Error("Tenant ID is required and must be a string");
    }

    if (!storeID || typeof storeID !== "string") {
      throw new Error("Store ID is required and must be a string");
    }

    // Prepare SMS data object
    let settings = useSettingsStore.getState().getSettings();
    let textingNumber = settings?.storeInfo?.textingNumber?.replace(/\D/g, "") || "";
    let fromNumber = textingNumber.length === 10 ? `+1${textingNumber}` : undefined;
    const smsData = {
      message: (message.message || "").trim(),
      phoneNumber: message.phoneNumber,
      tenantID: tenantID,
      storeID: storeID,
      customerID: message.customerID || "",
      messageID: message.id || "",
      workorderID: message.workorderID || "",
      saleID: message.saleID || "",
      imageUrl: message.imageUrl || "",
      mediaUrls: message.mediaUrls || [],
      canRespond: message.canRespond || null,
      forwardTo: message.forwardTo || null,
      customerFirst: message.customerFirst || "",
      customerLast: message.customerLast || "",
      senderID: message.senderUserObj?.id || "",
      ...(fromNumber ? { fromNumber } : {}),
      ...(message.originalMessage ? { originalMessage: message.originalMessage } : {}),
      ...(message.translatedFrom ? { translatedFrom: message.translatedFrom } : {}),
      ...(message.translatedTo ? { translatedTo: message.translatedTo } : {}),
    };

    // Call the enhanced SMS function
    let result = await sendSMSEnhanced(smsData);

    if (result.success) {
      return {
        success: true,
        message: result.message,
        data: result.data,
        timestamp: new Date().toISOString(),
      };
    } else {
      log("SMS failed:", result.error);
      return {
        success: false,
        error: result.error,
        code: result.code,
        details: result.details,
        timestamp: new Date().toISOString(),
      };
    }
  } catch (error) {
    log("Error in dbSendSMSEnhanced:", error);

    return {
      success: false,
      error: error.message || "Unknown error occurred",
      code: "WRAPPER_ERROR",
      details: {
        originalError: error,
        timestamp: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// SaaS Twilio send — Bonita-shape `message` in, sendTwilioMessage callable out.
// The callable writes the outgoing-messages doc and tracks usage. Caller is
// the smsService layer, which keeps the Bonita send path untouched.
// ─────────────────────────────────────────────────────────────────────────
export async function dbSendTwilioMessage(message) {
  try {
    if (!message || typeof message !== "object") {
      throw new Error("Message object is required");
    }
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) {
      throw new Error("Missing tenantID/storeID");
    }

    const settings = useSettingsStore.getState().getSettings() || {};
    const fromRaw = (settings?.storeInfo?.textingNumber || "").replace(/\D/g, "");
    if (fromRaw.length !== 10) {
      throw new Error("Store texting number not configured (storeInfo.textingNumber must be 10 digits)");
    }
    const fromPhoneNumber = `+1${fromRaw}`;

    const toRaw = (message.phoneNumber || "").replace(/\D/g, "");
    if (toRaw.length !== 10) {
      throw new Error("Recipient phone must be 10 digits");
    }
    const to = `+1${toRaw}`;

    const body = (message.message || "").trim();
    const mediaUrls = Array.isArray(message.mediaUrls)
      ? message.mediaUrls.filter(Boolean)
      : (message.imageUrl ? [message.imageUrl] : []);
    if (!body && mediaUrls.length === 0) {
      throw new Error("Message body or media is required");
    }

    const senderUser = message.senderUserObj || {};
    const sentByName = [senderUser.first, senderUser.last].filter(Boolean).join(" ") || null;

    const args = {
      tenantID,
      storeID,
      fromPhoneNumber,
      to,
      body,
      mediaUrls,
      sentByName,
      workorderID: message.workorderID || null,
      customerID: message.customerID || null,
    };

    const result = await sendTwilioMessageCallable(args);
    return {
      success: true,
      message: "SMS sent",
      data: result?.data || {},
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    log("Error in dbSendTwilioMessage:", error);
    return {
      success: false,
      error: error.message || "Send failed",
      code: error.code || "TWILIO_SEND_ERROR",
      timestamp: new Date().toISOString(),
    };
  }
}

// SaaS analog of dbGetCustomerMessages — paginated history fetch from the
// flat incoming-messages + outgoing-messages collections, filtered to one
// phone and merged in millis-desc order. Mirrors the Bonita return shape.
export async function dbGetSaasCustomerMessages(
  customerPhone,
  startAfterMillis = null,
  pageSize = 10
) {
  try {
    if (!customerPhone || typeof customerPhone !== "string") {
      throw new Error("Customer phone number is required and must be a string");
    }
    const cleanPhone = customerPhone.replace(/\D/g, "");
    if (cleanPhone.length !== 10) throw new Error("Phone number must be 10 digits");
    const e164 = `+1${cleanPhone}`;

    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) throw new Error("Missing tenantID or storeID");

    const { getDocs } = await import("firebase/firestore");

    const inboundCol = collection(
      DB, "tenants", tenantID, "stores", storeID, DB_NODES.FIRESTORE.INCOMING_MESSAGES
    );
    const outboundCol = collection(
      DB, "tenants", tenantID, "stores", storeID, DB_NODES.FIRESTORE.OUTGOING_MESSAGES
    );

    const [inSnap, outSnap] = await Promise.all([
      getDocs(query(inboundCol, where("from", "==", e164))),
      getDocs(query(outboundCol, where("to", "==", e164))),
    ]);

    const raw = [];
    inSnap.forEach((d) => raw.push(d.data()));
    outSnap.forEach((d) => raw.push(d.data()));

    let merged = raw
      .map(normalizeSaasMessageToBonita)
      .filter(Boolean);
    merged.sort((a, b) => b.millis - a.millis);
    if (typeof startAfterMillis === "number" && startAfterMillis > 0) {
      merged = merged.filter((m) => m.millis < startAfterMillis);
    }
    const page = merged.slice(0, pageSize);
    const lastMillis = page.length ? page[page.length - 1].millis : null;

    return {
      success: true,
      messages: page,
      hasMore: merged.length > pageSize,
      count: page.length,
      customerPhone: cleanPhone,
      nextPageTimestamp: lastMillis,
    };
  } catch (error) {
    log("Error retrieving SaaS customer messages", {
      error: error.message,
      phone: customerPhone,
    });
    return {
      success: false,
      error: error.message || "Failed to retrieve messages",
      messages: [],
      hasMore: false,
      count: 0,
      customerPhone,
    };
  }
}

// SaaS analog of dbListenToNewMessages — listens to incoming-messages and
// outgoing-messages, filters to one phone, emits Bonita-shape messages with
// millis > afterMillis. Returns a combined unsubscribe.
export function dbListenToSaasNewMessages(customerPhone, afterMillis, callback) {
  try {
    const cleanPhone = (customerPhone || "").replace(/\D/g, "");
    if (cleanPhone.length !== 10) return null;
    const e164 = `+1${cleanPhone}`;
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) return null;

    const inboundCol = collection(
      DB, "tenants", tenantID, "stores", storeID, DB_NODES.FIRESTORE.INCOMING_MESSAGES
    );
    const outboundCol = collection(
      DB, "tenants", tenantID, "stores", storeID, DB_NODES.FIRESTORE.OUTGOING_MESSAGES
    );

    const emit = (docs) => {
      const normalized = docs
        .map(normalizeSaasMessageToBonita)
        .filter((m) => m && (typeof afterMillis !== "number" || m.millis > afterMillis));
      if (normalized.length) callback(normalized);
    };

    const unsubIn = onSnapshot(
      query(inboundCol, where("from", "==", e164)),
      (snap) => emit(snap.docs.map((d) => d.data())),
      (err) => log("SaaS new-messages inbound listener error", err)
    );
    const unsubOut = onSnapshot(
      query(outboundCol, where("to", "==", e164)),
      (snap) => emit(snap.docs.map((d) => d.data())),
      (err) => log("SaaS new-messages outbound listener error", err)
    );

    return () => {
      try { unsubIn && unsubIn(); } catch (_) {}
      try { unsubOut && unsubOut(); } catch (_) {}
    };
  } catch (error) {
    log("Error setting up SaaS new-messages listener:", error);
    return null;
  }
}

export async function dbSetSMSForwardTo(phone, forwardToArray) {
  try {
    const cleanPhone = (phone || "").replace(/\D/g, "");
    if (cleanPhone.length !== 10) return { success: false, error: "Invalid phone" };
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) return { success: false, error: "Missing tenant/store" };
    const path = `tenants/${tenantID}/stores/${storeID}/sms-messages/${cleanPhone}`;
    const clean = (Array.isArray(forwardToArray) ? forwardToArray : [])
      .filter((f) => f && f.userID && f.phone)
      .map((f) => ({ userID: f.userID, phone: f.phone, first: f.first || "" }));
    await firestoreUpdate(path, { forwardTo: clean });
    log("SMS forwardTo set", { phone: cleanPhone, count: clean.length });
    return { success: true };
  } catch (error) {
    log("Error setting SMS forwardTo", { error: error.message, phone });
    return { success: false, error: error.message };
  }
}

export async function dbToggleSMSForwarding(phone, userID, enable, userPhone, userFirst) {
  try {
    const cleanPhone = (phone || "").replace(/\D/g, "");
    if (cleanPhone.length !== 10) return { success: false, error: "Invalid phone" };
    if (!userID) return { success: false, error: "No user ID" };
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) return { success: false, error: "Missing tenant/store" };
    const path = `tenants/${tenantID}/stores/${storeID}/sms-messages/${cleanPhone}`;
    const data = await firestoreRead(path);
    let current = Array.isArray(data?.forwardTo) ? data.forwardTo : [];
    let next;
    if (enable) {
      if (!userPhone) return { success: false, error: "No user phone" };
      next = current.filter((f) => f.userID !== userID);
      next.push({ userID, phone: userPhone, first: userFirst || "" });
    } else {
      next = current.filter((f) => f.userID !== userID);
    }
    await firestoreUpdate(path, { forwardTo: next });
    log("SMS forwarding toggled", { phone: cleanPhone, userID, enable });
    return { success: true };
  } catch (error) {
    log("Error toggling SMS forwarding", { error: error.message, phone, userID });
    return { success: false, error: error.message };
  }
}

export async function dbGetConversationForwardState(phone, userID) {
  try {
    const cleanPhone = (phone || "").replace(/\D/g, "");
    if (cleanPhone.length !== 10 || !userID) return false;
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) return false;
    const data = await firestoreRead(`tenants/${tenantID}/stores/${storeID}/sms-messages/${cleanPhone}`);
    let arr = Array.isArray(data?.forwardTo) ? data.forwardTo : [];
    return arr.some((f) => f.userID === userID);
  } catch (error) {
    log("Error reading forward state", { error: error.message, phone });
    return false;
  }
}

export async function dbUpdateMessageCanRespond(phone, messageId, canRespond) {
  try {
    const cleanPhone = (phone || "").replace(/\D/g, "");
    if (cleanPhone.length !== 10) return { success: false, error: "Invalid phone" };
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) return { success: false, error: "Missing tenant/store" };
    // Write canRespond to thread parent doc (canonical source of truth)
    const parentPath = `tenants/${tenantID}/stores/${storeID}/sms-messages/${cleanPhone}`;
    let updateData = { canRespond: canRespond };
    // Reset the timeout window when unblocking so the thread doesn't auto-close immediately
    if (canRespond) updateData.lastOutgoingMillis = Date.now();
    await firestoreUpdate(parentPath, updateData);
    log("Updated thread canRespond", { phone: cleanPhone, canRespond });
    return { success: true };
  } catch (error) {
    log("Error updating thread canRespond", { error: error.message, phone });
    return { success: false, error: error.message };
  }
}

export async function dbSaveMessageTranslation(phone, messageId, translated) {
  try {
    const cleanPhone = (phone || "").replace(/\D/g, "");
    if (cleanPhone.length !== 10) return;
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) return;
    const path = `tenants/${tenantID}/stores/${storeID}/sms-messages/${cleanPhone}/messages/${messageId}`;
    await firestoreUpdate(path, { translated });
  } catch (error) {
    log("Error saving message translation", { error: error.message, phone, messageId });
  }
}

export async function dbMarkSmsThreadRead(phone, lastMillis) {
  try {
    const cleanPhone = (phone || "").replace(/\D/g, "");
    if (cleanPhone.length !== 10) return { success: false, error: "Invalid phone" };
    if (!lastMillis || typeof lastMillis !== "number") return { success: false, error: "Missing lastMillis" };
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) return { success: false, error: "Missing tenant/store" };
    const path = `tenants/${tenantID}/stores/${storeID}/sms-messages/${cleanPhone}`;
    await firestoreUpdate(path, { lastReadMillis: lastMillis });
    return { success: true };
  } catch (error) {
    log("Error marking SMS thread read", { error: error.message, phone });
    return { success: false, error: error.message };
  }
}

export async function dbSendEmail(to, subject, htmlBody, attachments, opts = {}) {
  const { tenantID, storeID } = getTenantAndStore();

  try {
    if (!to || typeof to !== "string" || !to.includes("@")) {
      throw new Error("Valid email address is required");
    }
    if (!subject || typeof subject !== "string") {
      throw new Error("Email subject is required");
    }
    if (!htmlBody || typeof htmlBody !== "string") {
      throw new Error("Email body is required");
    }

    const emailData = {
      to,
      subject,
      htmlBody,
      tenantID,
      storeID,
      workorderID: opts?.workorderID || "",
      saleID: opts?.saleID || "",
      customerID: opts?.customerID || "",
    };
    if (attachments && Array.isArray(attachments) && attachments.length > 0) {
      emailData.attachments = attachments;
    }

    let result = await sendEmail(emailData);

    if (result.success) {
      return {
        success: true,
        message: result.message,
        data: result.data,
        timestamp: new Date().toISOString(),
      };
    } else {
      log("Email failed:", result.error);
      return {
        success: false,
        error: result.error,
        code: result.code,
        timestamp: new Date().toISOString(),
      };
    }
  } catch (error) {
    log("Error in dbSendEmail:", error);

    return {
      success: false,
      error: error.message || "Unknown error occurred",
      code: "WRAPPER_ERROR",
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Retrieve all SMS conversation threads from denormalized parent docs.
 * Single collection read - no subcollection fan-out.
 * @returns {Promise<Object>} { success, threads: [{ phone, customerInfo, lastMessage, lastMillis, lastType, hasMedia, canRespond, threadStatus }] }
 */
export async function dbGetAllMessageThreads() {
  try {
    const { getDocs } = await import("firebase/firestore");
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) throw new Error("Missing tenantID or storeID");

    const smsRef = collection(DB, "tenants", tenantID, "stores", storeID, "sms-messages");
    const snap = await getDocs(smsRef);
    const threads = snap.docs
      .filter((d) => d.data().lastMillis)
      .map((d) => ({ phone: d.id, ...d.data() }))
      .sort((a, b) => b.lastMillis - a.lastMillis);

    return { success: true, threads };
  } catch (error) {
    log("Error fetching message threads", { error: error.message });
    return { success: false, threads: [], error: error.message };
  }
}

/**
 * Real-time listener for active SMS threads (canRespond == true).
 * Returns docChanges (added/modified/removed) so the caller can incrementally update state.
 * @param {Function} callback - receives array of { type, phone, ...threadData }
 * @returns {Function} unsubscribe function
 */
export function dbListenToActiveMessageThreads(callback, onError) {
  const name = "messageThreads";
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) return null;
    const smsRef = collection(DB, "tenants", tenantID, "stores", storeID, "sms-messages");
    __logListenerAttach(name);
    const unsub = onSnapshot(
      smsRef,
      (snapshot) => {
        __logListenerEmit(name, {
          fromCache: snapshot.metadata.fromCache,
          changes: snapshot.docChanges().length,
          total: snapshot.size,
        });
        const changes = [];
        snapshot.docChanges().forEach((change) => {
          changes.push({ type: change.type, phone: change.doc.id, ...change.doc.data() });
        });
        callback(changes);
      },
      (error) => {
        log("Active threads listener error", { error });
        if (onError) onError(error);
      }
    );
    return () => {
      __logListenerDetach(name);
      unsub();
    };
  } catch (error) {
    log("Error setting up active threads listener", { error });
    if (onError) onError(error);
    return null;
  }
}

/**
 * Fetch thread cards (parent docs from sms-messages) ordered by lastMillis desc.
 * Used for initial IndexedDB seed when no local cache exists.
 * @param {number} maxCount - Maximum number of thread cards to fetch (default 500)
 * @returns {Promise<Array>} Array of thread card objects with phone field
 */
export async function dbGetSmsThreadCards(maxCount = 500) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) return [];
    const { collection, query, orderBy, limit, getDocs } = await import("firebase/firestore");
    const smsRef = collection(DB, "tenants", tenantID, "stores", storeID, "sms-messages");
    const q = query(smsRef, orderBy("lastMillis", "desc"), limit(maxCount));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ phone: d.id, ...d.data() }));
  } catch (error) {
    log("Error fetching SMS thread cards", error);
    return [];
  }
}

/**
 * Retrieve customer's last 10 messages with pagination support
 * @param {string} customerPhone - Customer's phone number (10 digits)
 * @param {Timestamp|null} startAfterTimestamp - Firestore timestamp to paginate from (optional)
 * @returns {Promise<Object>} Result with messages array and pagination info
 *
 * Usage:
 * - First page: dbGetCustomerMessages("2393369177", null)
 * - Next page: dbGetCustomerMessages("2393369177", lastMessage.timestamp)
 */
export async function dbGetCustomerMessages(
  customerPhone,
  startAfterTimestamp = null,
  pageSize = 10
) {
  try {
    // Validate phone number
    if (!customerPhone || typeof customerPhone !== "string") {
      throw new Error("Customer phone number is required and must be a string");
    }

    const cleanPhone = customerPhone.replace(/\D/g, "");
    if (cleanPhone.length !== 10) {
      throw new Error("Phone number must be 10 digits");
    }

    // Import Firestore functions directly
    const { collection, query, orderBy, limit, startAfter, getDocs } =
      await import("firebase/firestore");
    const { DB } = await import("./db_calls");

    // Build collection reference
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) {
      throw new Error("Missing tenantID or storeID");
    }
    const messagesRef = collection(
      DB,
      "tenants", tenantID,
      "stores", storeID,
      "sms-messages", cleanPhone,
      "messages"
    );

    // Build query - order by millis descending (newest first)
    let q;
    if (startAfterTimestamp) {
      q = query(
        messagesRef,
        orderBy("millis", "desc"),
        startAfter(startAfterTimestamp),
        limit(pageSize)
      );
    } else {
      q = query(messagesRef, orderBy("millis", "desc"), limit(pageSize));
    }

    // Execute query
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      log("No messages found for customer", { phone: cleanPhone });
      return {
        success: true,
        messages: [],
        hasMore: false,
        count: 0,
        customerPhone: cleanPhone,
      };
    }

    // Map messages to clean format
    const messages = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      messages.push({
        id: doc.id,
        customerID: data.customerID,
        firstName: data.firstName,
        lastName: data.lastName,
        phoneNumber: data.phoneNumber,
        message: data.message,
        type: data.type, // "incoming" or "outgoing"
        millis: data.millis,
        timestamp: data.timestamp,
        threadStatus: data.threadStatus,
        read: data.read,
        tenantID: data.tenantID,
        storeID: data.storeID,
        messageSid: data.messageSid || data.metadata?.twilioMessageSid,
        status: data.status || data.messageStatus,
        hasMedia: data.hasMedia || false,
        mediaUrls: data.mediaUrls || [],
        autoResponseSent: data.autoResponseSent || false,
        canRespond: data.canRespond,
        forwardTo: data.forwardTo || null,
        senderUserObj: data.senderUserObj || null,
      });
    });

    // Get the last message timestamp for pagination
    const lastMessage = messages[messages.length - 1];
    const nextPageMillis = lastMessage ? lastMessage.millis : null;

    return {
      success: true,
      messages: messages,
      hasMore: messages.length === pageSize,
      count: messages.length,
      customerPhone: cleanPhone,
      nextPageTimestamp: nextPageMillis,
    };
  } catch (error) {
    log("Error retrieving customer messages", {
      error: error.message,
      phone: customerPhone,
    });

    return {
      success: false,
      error: error.message || "Failed to retrieve messages",
      messages: [],
      hasMore: false,
      count: 0,
      customerPhone: customerPhone,
    };
  }
}

export function dbListenToCustomerMessages(customerPhone, callback) {
  const cleanPhone = (customerPhone || "").replace(/\D/g, "");
  const name = `customerMessages:${cleanPhone}`;
  try {
    if (!customerPhone || typeof customerPhone !== "string") {
      log("Error: customerPhone is required for dbListenToCustomerMessages");
      return null;
    }
    if (cleanPhone.length !== 10) {
      log("Error: phone must be 10 digits for dbListenToCustomerMessages");
      return null;
    }
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) {
      log("Error: missing tenantID/storeID for dbListenToCustomerMessages");
      return null;
    }
    const messagesRef = collection(DB, "tenants", tenantID, "stores", storeID, "sms-messages", cleanPhone, "messages");
    const messagesQuery = query(messagesRef, orderBy("millis", "asc"));
    __logListenerAttach(name);
    const unsubscribe = onSnapshot(
      messagesQuery,
      (querySnapshot) => {
        __logListenerEmit(name, {
          fromCache: querySnapshot.metadata.fromCache,
          changes: querySnapshot.docChanges().length,
          total: querySnapshot.size,
        });
        const messages = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          messages.push({
            id: doc.id,
            customerID: data.customerID,
            firstName: data.firstName,
            lastName: data.lastName,
            phoneNumber: data.phoneNumber,
            message: data.message,
            type: data.type,
            millis: data.millis,
            timestamp: data.timestamp,
            threadStatus: data.threadStatus,
            read: data.read,
            tenantID: data.tenantID,
            storeID: data.storeID,
            messageSid: data.messageSid,
            status: data.status || data.messageStatus,
            hasMedia: data.hasMedia || false,
            mediaUrls: data.mediaUrls || [],
            autoResponseSent: data.autoResponseSent || false,
            canRespond: data.canRespond,
            forwardTo: data.forwardTo || null,
            senderUserObj: data.senderUserObj || null,
          });
        });
        callback(messages);
      },
      (error) => {
        log("Customer messages listener error", { phone: cleanPhone, error });
        callback([]);
      }
    );
    return () => {
      __logListenerDetach(name);
      unsubscribe();
    };
  } catch (error) {
    log("Error setting up customer messages listener:", error);
    return null;
  }
}

export function dbListenToNewMessages(customerPhone, afterMillis, callback) {
  const cleanPhone = (customerPhone || "").replace(/\D/g, "");
  const name = `newMessages:${cleanPhone}`;
  try {
    if (!customerPhone || typeof customerPhone !== "string") return null;
    if (cleanPhone.length !== 10) return null;
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) return null;
    const messagesRef = collection(DB, "tenants", tenantID, "stores", storeID, "sms-messages", cleanPhone, "messages");
    const messagesQuery = query(messagesRef, orderBy("millis", "asc"), where("millis", ">", afterMillis));
    __logListenerAttach(name);
    const unsubscribe = onSnapshot(
      messagesQuery,
      (querySnapshot) => {
        __logListenerEmit(name, {
          fromCache: querySnapshot.metadata.fromCache,
          changes: querySnapshot.docChanges().length,
          total: querySnapshot.size,
        });
        const messages = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          messages.push({
            id: doc.id,
            customerID: data.customerID,
            firstName: data.firstName,
            lastName: data.lastName,
            phoneNumber: data.phoneNumber,
            message: data.message,
            type: data.type,
            millis: data.millis,
            timestamp: data.timestamp,
            threadStatus: data.threadStatus,
            read: data.read,
            tenantID: data.tenantID,
            storeID: data.storeID,
            messageSid: data.messageSid,
            status: data.status || data.messageStatus,
            hasMedia: data.hasMedia || false,
            mediaUrls: data.mediaUrls || [],
            autoResponseSent: data.autoResponseSent || false,
            canRespond: data.canRespond,
            forwardTo: data.forwardTo || null,
            senderUserObj: data.senderUserObj || null,
          });
        });
        callback(messages);
      },
      (error) => {
        log("New messages listener error", { phone: cleanPhone, error });
      }
    );
    return () => {
      __logListenerDetach(name);
      unsubscribe();
    };
  } catch (error) {
    log("Error setting up new messages listener:", error);
    return null;
  }
}

// ============================================================================
// WORKORDER MEDIA
// ============================================================================

export async function dbUploadWorkorderMedia(workorderID, file, extraMeta = {}) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    const currentUser = useLoginStore.getState().currentUser;
    const storagePath = build_db_path.cloudStorage.workorderAttachment(
      workorderID,
      "media",
      tenantID,
      storeID,
      file.name
    );

    const result = await uploadFileToStorage(file, storagePath);

    if (!result.success) {
      return { success: false, error: "Upload failed" };
    }

    let thumbnailUrl = null;
    let thumbnailStoragePath = null;
    const thumbBlob = await compressImage(file, 300, 0.5);
    if (thumbBlob) {
      const thumbPath = build_db_path.cloudStorage.workorderAttachment(
        workorderID, "thumbnails", tenantID, storeID, file.name
      );
      const thumbResult = await uploadFileToStorage(thumbBlob, thumbPath);
      if (thumbResult.success) {
        thumbnailUrl = thumbResult.downloadURL;
        thumbnailStoragePath = thumbResult.path;
      }
    }

    const mediaItem = {
      id: crypto.randomUUID(),
      url: result.downloadURL,
      storagePath: result.path,
      thumbnailUrl,
      thumbnailStoragePath,
      type: file.type.startsWith("video") ? "video" : "image",
      filename: file.name,
      fileSize: file.size || 0,
      originalFilename: extraMeta.originalFilename || file.name,
      originalFileSize: extraMeta.originalFileSize || file.size || 0,
      uploadedAt: Date.now(),
      uploadedBy: currentUser?.id || null,
    };

    return { success: true, mediaItem };
  } catch (error) {
    log("Error in dbUploadWorkorderMedia:", error);
    return { success: false, error: error.message };
  }
}

export async function dbDeleteWorkorderMedia(mediaItem) {
  try {
    await storageDelete(mediaItem.storagePath || mediaItem);
    if (mediaItem.thumbnailStoragePath) {
      try { await storageDelete(mediaItem.thumbnailStoragePath); } catch (e) {}
    }
    return { success: true };
  } catch (error) {
    log("Error in dbDeleteWorkorderMedia:", error);
    return { success: false, error: error.message };
  }
}

export async function dbUploadPDFAndSendSMS({ base64, storagePath, message, phoneNumber, customerID, messageID, canRespond, forwardTo, workorderID, saleID }) {
  const { tenantID, storeID } = getTenantAndStore();
  try {
    let result = await uploadPDFAndSendSMS({
      base64,
      storagePath,
      message,
      phoneNumber,
      tenantID,
      storeID,
      customerID,
      messageID,
      canRespond,
      forwardTo: forwardTo || null,
      workorderID: workorderID || "",
      saleID: saleID || "",
    });
    return result;
  } catch (error) {
    log("Error in dbUploadPDFAndSendSMS:", error);
    return { success: false, error: error.message || "Failed to upload PDF and send SMS" };
  }
}

export async function dbGenerateReceiptPDF(params) {
  const { tenantID, storeID } = getTenantAndStore();
  try {
    let result = await generateReceiptPDF({ ...params, tenantID, storeID });
    return result;
  } catch (error) {
    log("Error in dbGenerateReceiptPDF:", error);
    return { success: false, error: error.message || "Failed to generate receipt PDF" };
  }
}

export async function dbSendReceipt(params) {
  const { tenantID, storeID } = getTenantAndStore();
  try {
    return await sendReceipt({ ...params, tenantID, storeID });
  } catch (error) {
    log("Error in dbSendReceipt:", error);
    return { success: false, error: error.message || "Failed to send receipt" };
  }
}

export async function dbCreateTextToPayInvoice(workorderID, channel = "sms", { phone, email, amountCents } = {}) {
  const { tenantID, storeID } = getTenantAndStore();
  try {
    const payload = { workorderID, channel, tenantID, storeID };
    if (phone) payload.phone = phone;
    if (email) payload.email = email;
    if (amountCents !== undefined && amountCents !== null) payload.amountCents = amountCents;
    const result = await createTextToPayInvoiceCallable(payload);
    return result.data;
  } catch (error) {
    log("Error in dbCreateTextToPayInvoice:", error);
    return { success: false, error: error.message || "Failed to send payment link" };
  }
}

export async function dbRehydrateFromArchive(collections) {
  const { tenantID, storeID } = getTenantAndStore();
  try {
    const result = await rehydrateFromArchiveCallable({
      tenantID,
      storeID,
      collections,
    });
    return result.data;
  } catch (error) {
    log("Error in dbRehydrateFromArchive:", error);
    return { success: false, error: error.message || "Rehydration failed" };
  }
}

export async function dbManualArchiveAndCleanup() {
  const { tenantID, storeID } = getTenantAndStore();
  try {
    const result = await manualArchiveAndCleanupCallable({ tenantID, storeID });
    return result.data;
  } catch (error) {
    log("Error in dbManualArchiveAndCleanup:", error);
    return { success: false, error: error.message || "Manual archive failed" };
  }
}

export async function dbMigrateCustomerPhone(oldPhone, newPhone, customerID, first, last) {
  const { tenantID, storeID } = getTenantAndStore();
  try {
    const result = await migrateCustomerPhoneCallable({ tenantID, storeID, oldPhone, newPhone, customerID, first, last });
    return result.data;
  } catch (error) {
    log("Error in dbMigrateCustomerPhone:", error);
    return { success: false, error: error.message || "Phone migration failed" };
  }
}

export async function startNewWorkorder(customer, { status } = {}) {
  let _currentUser = useLoginStore.getState().currentUser;
  let id = takeId("workorders") || await getId("workorders");
  let wo = createNewWorkorder({
    id,
    customerID: customer?.id || "",
    customerFirst: customer?.first || "",
    customerLast: customer?.last || "",
    customerCell: customer?.customerCell || customer?.customerLandline || "",
    customerLandline: customer?.customerLandline || "",
    customerEmail: customer?.email || "",
    customerContactRestriction: customer?.contactRestriction || "",
    customerLanguage: customer?.language || "",
    startedByFirst: _currentUser?.first,
    startedByLast: _currentUser?.last,
    status: status || undefined,
  });
  wo.workorderNumber = buildWorkorderNumberFromId(id, wo.startedOnMillis);
  let store = useOpenWorkordersStore.getState();
  store.setWorkorder(wo, false);
  store.setOpenWorkorderID(wo.id);
  if (customer?.id) store.addPendingCustomerLink(wo.id, customer.id);
  return wo;
}

// ============================================================================
// GMAIL EMAIL FUNCTIONS
// ============================================================================
// Tenant-scoped (not store-scoped). Inboxes can be "shared" across all stores
// in a tenant or assigned to one store via the assignedStoreID field on the
// email-accounts doc. Callables enforce tenantID match via auth-guards on the
// SaaS deploy; Bonita is a single-tenant pass-through.

function buildEmailsCollectionPath(tenantID) {
  return `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.EMAILS}`;
}

function buildEmailAuthCollectionPath(tenantID) {
  return `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.EMAIL_AUTH}`;
}

function buildEmailAccountsCollectionPath(tenantID) {
  return `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.EMAIL_ACCOUNTS}`;
}

function buildEmailAccountDocPath(tenantID, accountKey) {
  return `${buildEmailAccountsCollectionPath(tenantID)}/${accountKey}`;
}

export function dbListenToEmails(onSnapshot, onError) {
  const name = "emails";
  try {
    const { tenantID } = getTenantAndStore();
    if (!tenantID) {
      log("Error: tenantID is not configured for dbListenToEmails");
      return null;
    }
    if (!onSnapshot || typeof onSnapshot !== "function") {
      log("Error: onSnapshot callback function is required for dbListenToEmails");
      return null;
    }
    const collectionPath = buildEmailsCollectionPath(tenantID);
    __logListenerAttach(name);
    const unsubscribe = firestoreSubscribeCollection(collectionPath, (data, error, meta) => {
      if (error) {
        log("Email listener error", { tenantID, error });
        if (onError) onError(error);
        return;
      }
      __logListenerEmit(name, meta);
      onSnapshot(data);
    });
    return () => {
      __logListenerDetach(name);
      unsubscribe();
    };
  } catch (error) {
    log("Error setting up email listener:", error);
    if (onError) onError(error);
    return null;
  }
}

export function dbListenToEmailAuth(onSnapshot, onError) {
  const name = "emailAuth";
  try {
    const { tenantID } = getTenantAndStore();
    if (!tenantID) {
      log("Error: tenantID is not configured for dbListenToEmailAuth");
      return null;
    }
    if (!onSnapshot || typeof onSnapshot !== "function") {
      log("Error: onSnapshot callback function is required for dbListenToEmailAuth");
      return null;
    }
    const collectionPath = buildEmailAuthCollectionPath(tenantID);
    __logListenerAttach(name);
    const unsubscribe = firestoreSubscribeCollection(collectionPath, (data, error, meta) => {
      if (error) {
        log("Email auth listener error", { tenantID, error });
        if (onError) onError(error);
        return;
      }
      __logListenerEmit(name, meta);
      onSnapshot(data);
    });
    return () => {
      __logListenerDetach(name);
      unsubscribe();
    };
  } catch (error) {
    log("Error setting up email auth listener:", error);
    if (onError) onError(error);
    return null;
  }
}

export function dbListenToEmailAccounts(onSnapshot, onError) {
  const name = "emailAccounts";
  try {
    const { tenantID } = getTenantAndStore();
    if (!tenantID) {
      log("Error: tenantID is not configured for dbListenToEmailAccounts");
      return null;
    }
    if (!onSnapshot || typeof onSnapshot !== "function") {
      log("Error: onSnapshot callback function is required for dbListenToEmailAccounts");
      return null;
    }
    const collectionPath = buildEmailAccountsCollectionPath(tenantID);
    __logListenerAttach(name);
    const unsubscribe = firestoreSubscribeCollection(collectionPath, (data, error, meta) => {
      if (error) {
        log("Email accounts listener error", { tenantID, error });
        if (onError) onError(error);
        return;
      }
      __logListenerEmit(name, meta);
      onSnapshot(data);
    });
    return () => {
      __logListenerDetach(name);
      unsubscribe();
    };
  } catch (error) {
    log("Error setting up email accounts listener:", error);
    if (onError) onError(error);
    return null;
  }
}

// CRUD for the tenant-scoped email-accounts collection. accountKey is the
// stable per-inbox identifier (we use the email address lowercased, but the
// callers don't need to know that — they just pass it through).
export async function dbCreateEmailAccount(accountKey, accountData) {
  const { tenantID } = getTenantAndStore();
  if (!tenantID) return { success: false, error: "Missing tenantID" };
  if (!accountKey) return { success: false, error: "accountKey required" };
  const path = buildEmailAccountDocPath(tenantID, accountKey);
  const toWrite = {
    accountKey,
    email: accountData.email || "",
    displayName: accountData.displayName || "",
    signature: accountData.signature || "",
    assignedStoreID: accountData.assignedStoreID || null,
    createdAt: Date.now(),
    ...accountData,
  };
  await firestoreWrite(path, toWrite);
  return { success: true, account: toWrite };
}

export async function dbUpdateEmailAccount(accountKey, partial) {
  const { tenantID } = getTenantAndStore();
  if (!tenantID) return { success: false, error: "Missing tenantID" };
  if (!accountKey) return { success: false, error: "accountKey required" };
  const path = buildEmailAccountDocPath(tenantID, accountKey);
  await firestoreUpdate(path, partial);
  return { success: true };
}

export async function dbDeleteEmailAccount(accountKey) {
  const { tenantID } = getTenantAndStore();
  if (!tenantID) return { success: false, error: "Missing tenantID" };
  if (!accountKey) return { success: false, error: "accountKey required" };
  const path = buildEmailAccountDocPath(tenantID, accountKey);
  await firestoreDelete(path);
  return { success: true };
}

export async function dbGmailInitiateAuth(accountKey, opts = {}) {
  const { tenantID } = getTenantAndStore();
  if (!tenantID) return { success: false, error: "Missing tenantID" };
  // assignedStoreID === null  → shared across all tenant stores
  // assignedStoreID === "xyz" → restricted to that store
  return gmailInitiateAuth({
    tenantID,
    accountKey,
    assignedStoreID: opts.assignedStoreID || null,
  });
}

export async function dbGmailSyncEmails(accountKey, fullSync = false) {
  const { tenantID } = getTenantAndStore();
  log("dbGmailSyncEmails called", { tenantID, accountKey, fullSync });
  if (!tenantID) {
    log("dbGmailSyncEmails - missing tenantID");
    return { success: false, error: "Missing tenantID" };
  }
  const result = await gmailSyncEmails({ tenantID, accountKey, fullSync });
  log("dbGmailSyncEmails result", JSON.stringify(result));
  return result;
}

export async function dbGmailReconnectWatch(accountKey) {
  const { tenantID } = getTenantAndStore();
  log("dbGmailReconnectWatch called", { tenantID, accountKey });
  if (!tenantID) {
    return { success: false, error: "Missing tenantID" };
  }
  if (!accountKey) {
    return { success: false, error: "accountKey required" };
  }
  const result = await gmailReconnectWatch({ tenantID, accountKey });
  log("dbGmailReconnectWatch result", JSON.stringify(result));
  return result;
}

export async function dbGmailSendEmail(emailData) {
  const { tenantID } = getTenantAndStore();
  if (!tenantID) return { success: false, error: "Missing tenantID" };
  if (!emailData.to || emailData.to.length === 0) return { success: false, error: "Recipient required" };
  if (!emailData.subject && !emailData.threadId) return { success: false, error: "Subject required for new emails" };
  return gmailSendNewEmail({
    tenantID,
    accountKey: emailData.accountKey || getEmailStoreState().activeAccountKey,
    ...emailData,
  });
}

export async function dbGmailModifyLabels(messageIds, addLabelIds, removeLabelIds, accountKeyOverride) {
  const { tenantID } = getTenantAndStore();
  if (!tenantID) return { success: false, error: "Missing tenantID" };
  const accountKey = accountKeyOverride || getEmailStoreState().activeAccountKey;
  return gmailModifyLabels({ tenantID, accountKey, messageIds, addLabelIds, removeLabelIds });
}

export async function dbGmailGetAttachment(messageId, attachmentId, filename) {
  const { tenantID } = getTenantAndStore();
  if (!tenantID) return { success: false, error: "Missing tenantID" };
  const accountKey = getEmailStoreState().activeAccountKey;
  return gmailGetAttachment({ tenantID, accountKey, messageId, attachmentId, filename });
}

export async function dbGmailDisconnect(accountKey) {
  const { tenantID } = getTenantAndStore();
  if (!tenantID) return { success: false, error: "Missing tenantID" };
  return gmailDisconnect({ tenantID, accountKey });
}


function getEmailStoreState() {
  // Circular dep with stores.js — accessed at call time via ESM live binding
  return _storesModule.useEmailStore.getState();
}

// ============================================================================
// TENANT SUBSCRIPTION
// ============================================================================

export function dbListenToSubscription(onChange, onError) {
  const name = "subscription";
  try {
    const { tenantID } = getTenantAndStore();
    if (!tenantID) {
      log("Error: tenantID not configured for dbListenToSubscription");
      return null;
    }
    if (!onChange || typeof onChange !== "function") {
      log("Error: onChange callback required for dbListenToSubscription");
      return null;
    }
    const path = `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.SUBSCRIPTION}/${DB_NODES.FIRESTORE.SUBSCRIPTION}`;
    __logListenerAttach(name);
    const unsubscribe = firestoreSubscribe(path, (data, error, meta) => {
      if (error) {
        log("Subscription listener error", { tenantID, error });
        if (onError) onError(error);
        return;
      }
      __logListenerEmit(name, meta);
      onChange(data);
    });
    return () => {
      __logListenerDetach(name);
      unsubscribe();
    };
  } catch (error) {
    log("Error setting up subscription listener:", error);
    if (onError) onError(error);
    return null;
  }
}

export async function dbSaveSubscription(subscription) {
  try {
    const { tenantID } = getTenantAndStore();
    if (!tenantID) return { success: false, error: "Missing tenantID" };
    const path = `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.SUBSCRIPTION}/${DB_NODES.FIRESTORE.SUBSCRIPTION}`;
    await firestoreWrite(path, subscription);
    return { success: true };
  } catch (error) {
    log("Error saving subscription:", error);
    return { success: false, error };
  }
}

export async function dbSaveSubscriptionField(fieldName, fieldVal) {
  try {
    const { tenantID } = getTenantAndStore();
    if (!tenantID) return { success: false, error: "Missing tenantID" };
    const path = `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.SUBSCRIPTION}/${DB_NODES.FIRESTORE.SUBSCRIPTION}`;
    await firestoreUpdate(path, { [fieldName]: fieldVal });
    return { success: true };
  } catch (error) {
    log("Error saving subscription field:", error);
    return { success: false, error };
  }
}

// ============================================================================
// VENDOR ORDERS — purchase orders built by phone scanner, polished on desktop
// ============================================================================
// Data layout:
//   tenants/{tenantID}/stores/{storeID}/vendor-orders/{orderID}      ← order doc
//   tenants/{tenantID}/stores/{storeID}/vendor-orders/{orderID}/items/{itemID}
//     └── one doc per scan, written granularly (no full-order rewrite per scan)
//
// Catalogs are hosted on cadence-pos at the GLOBAL root (not tenant-scoped):
//   Firestore  vendor_catalogs/{vendorID}/items_by_id/{vendorPartId} ← master
//              doc, keyed by the vendor's own SKU.
//              └── canonical item; barcodes[] holds every UPC. UPC lookups use
//                  array-contains over barcodes; no separate reverse-index
//                  collection.
//   RTDB       vendor_catalogs/{vendorID}/inventory_by_item/{itemId}: { WH: qty }
//              └── per-item warehouse map; sparse — missing key = zero stock at
//                  that warehouse, missing item node = no inventory data at all.
//
// Items refresh nightly via Cloud Run Job (diff baseline → Firestore batches).
// Inventory refreshes every 15 min via separate RTDB writer job. Two different
// data stores, two different cadences — chosen for cost & write fan-out shape.
//
// Resolver flow (dbResolveOrderItem): local inventory first (Zustand); on miss,
// parallel array-contains queries across VENDOR_CATALOGS (Firestore). Result
// writes back to the order item doc; the desktop's items listener picks it up.
// ----------------------------------------------------------------------------

function buildVendorInventoryItemPath(vendorId, itemId) {
  return `vendor_catalogs/${vendorId}/inventory_by_item/${itemId}`;
}

// Read on-hand qty for a single (vendor, warehouse, item). Returns a finite
// number when the RTDB endpoint actually has a value (including a real 0), or
// `null` when the path is missing/non-finite/errored. Callers should treat
// `null` as "unknown" and render accordingly — a 0 must only mean a 0 came
// from the source.
export async function readInventoryQty(vendorId, warehouseCode, itemId) {
  if (!vendorId || !warehouseCode || !itemId) return null;
  try {
    const qty = await rdbCatalogRead(`${buildVendorInventoryItemPath(vendorId, itemId)}/${warehouseCode}`);
    if (qty === null || qty === undefined) return null;
    const n = Number(qty);
    return Number.isFinite(n) ? n : null;
  } catch (e) {
    log("readInventoryQty failed", { vendorId, warehouseCode, itemId, error: e?.message });
    return null;
  }
}

// Batch variant for an order's full line-item list. Returns Map<itemId, qty>.
// Items absent from the result Map get 0 at the call site (per missing-node semantic).
export async function readInventoryQtyMap(vendorId, warehouseCode, itemIds) {
  const out = new Map();
  if (!vendorId || !warehouseCode || !Array.isArray(itemIds) || itemIds.length === 0) {
    return out;
  }
  try {
    await Promise.all(
      itemIds.map(async (id) => {
        const qty = await readInventoryQty(vendorId, warehouseCode, id);
        out.set(id, qty);
      }),
    );
    return out;
  } catch (e) {
    log("readInventoryQtyMap failed", { vendorId, warehouseCode, count: itemIds.length, error: e?.message });
    return out;
  }
}

// Fan out across every warehouse for a vendor for a single item. Used by the
// "check elsewhere" popover when the home warehouse is out. One RTDB read
// returns the full warehouse map; we slice it locally per warehouse. `onResult`
// fires synchronously for each warehouse so the existing streaming UI keeps
// its hook (all entries arrive in one tick rather than trickling in). Returned
// array is sorted: in-stock first by qty desc, home pinned to top.
export async function checkInventoryAcrossWarehouses(
  vendorId,
  itemId,
  { homeWarehouseCode = "", onResult } = {},
) {
  if (!vendorId || !itemId) return [];
  const vendor = VENDOR_CATALOGS.find((v) => v.id === vendorId);
  const warehouses = vendor?.warehouses || [];
  if (warehouses.length === 0) return [];

  let qtyMap = {};
  try {
    qtyMap = (await rdbCatalogRead(buildVendorInventoryItemPath(vendorId, itemId))) || {};
  } catch (e) {
    log("checkInventoryAcrossWarehouses read failed", { vendorId, itemId, error: e?.message });
  }

  const results = warehouses.map((wh) => {
    const raw = Number(qtyMap[wh.code]);
    const qty = Number.isFinite(raw) ? raw : 0;
    const entry = {
      code: wh.code,
      name: wh.name || wh.code,
      state: wh.state || "",
      qty,
      isHome: wh.code === homeWarehouseCode,
    };
    if (typeof onResult === "function") {
      try { onResult(entry); } catch (e) { log("onResult callback threw", e?.message); }
    }
    return entry;
  });

  results.sort((a, b) => {
    if (a.isHome !== b.isHome) return a.isHome ? -1 : 1;
    if ((a.qty > 0) !== (b.qty > 0)) return a.qty > 0 ? -1 : 1;
    return b.qty - a.qty;
  });
  return results;
}

// Read a small sample of items from a vendor catalog. Diagnostic-only;
// used to inspect catalog field shape before wiring it into reconciliation /
// resolver code. Canonical catalog shape no longer carries specs (dropped
// from the master mappers 2026-06).
export async function dbSampleVendorCatalog(vendorId, count = 3) {
  if (!vendorId) return [];
  const vendor = VENDOR_CATALOGS.find((v) => v.id === vendorId);
  if (!vendor?.catalogPath) return [];

  const items = await firestoreCatalogQuery(
    `${vendor.catalogPath}/items_by_id`,
    [],
    { limit: count },
  );
  return items.map((item) => ({ itemId: item.id, item }));
}

function buildVendorOrderPath(tenantID, storeID, orderID) {
  return `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/${DB_NODES.FIRESTORE.VENDOR_ORDERS}/${orderID}`;
}

function buildVendorOrdersCollectionPath(tenantID, storeID) {
  return `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/${DB_NODES.FIRESTORE.VENDOR_ORDERS}`;
}

function buildVendorOrderItemPath(tenantID, storeID, orderID, itemID) {
  return `${buildVendorOrderPath(tenantID, storeID, orderID)}/items/${itemID}`;
}

function buildVendorOrderItemsCollectionPath(tenantID, storeID, orderID) {
  return `${buildVendorOrderPath(tenantID, storeID, orderID)}/items`;
}

// Full write of the parent order doc. Use for create + status / notes /
// finalize updates that touch most of the document. For one-field patches
// (e.g. flipping status), prefer dbUpdateVendorOrderFields.
export async function dbSaveVendorOrder(order) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) {
      log("Error: tenantID/storeID not configured for dbSaveVendorOrder");
      return { success: false };
    }
    if (!order || !order.id) {
      log("Error: order with id is required for dbSaveVendorOrder");
      return { success: false };
    }
    await firestoreWrite(buildVendorOrderPath(tenantID, storeID, order.id), order);
    return { success: true };
  } catch (error) {
    log("Error saving vendor order:", error);
    return { success: false, error };
  }
}

// Partial patch of the parent order doc (status flips, notes edits, finalize).
export async function dbUpdateVendorOrderFields(orderID, fields) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) return { success: false };
    if (!orderID || !fields) return { success: false };
    await firestoreUpdate(buildVendorOrderPath(tenantID, storeID, orderID), fields);
    return { success: true };
  } catch (error) {
    log("Error updating vendor order fields:", error);
    return { success: false, error };
  }
}

// GRANULAR PER-SCAN WRITE PATH. Writes one item doc into the order's
// `items` sub-collection. Parent order is untouched, so concurrent scans
// don't race on the same document.
export async function dbSaveVendorOrderItem(orderID, item) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) return { success: false };
    if (!orderID || !item || !item.id) return { success: false };
    await firestoreWrite(
      buildVendorOrderItemPath(tenantID, storeID, orderID, item.id),
      item
    );
    return { success: true };
  } catch (error) {
    log("Error saving vendor order item:", error);
    return { success: false, error };
  }
}

// Partial item patch — used by the resolver to write lookupStatus +
// resolution fields, and by the desktop to update qty / pick a vendor on
// ambiguous items.
export async function dbUpdateVendorOrderItemFields(orderID, itemID, fields) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) return { success: false };
    if (!orderID || !itemID || !fields) return { success: false };
    await firestoreUpdate(
      buildVendorOrderItemPath(tenantID, storeID, orderID, itemID),
      fields
    );
    return { success: true };
  } catch (error) {
    log("Error updating vendor order item fields:", error);
    return { success: false, error };
  }
}

export async function dbDeleteVendorOrderItem(orderID, itemID) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) return { success: false };
    if (!orderID || !itemID) return { success: false };
    await firestoreDelete(buildVendorOrderItemPath(tenantID, storeID, orderID, itemID));
    return { success: true };
  } catch (error) {
    log("Error deleting vendor order item:", error);
    return { success: false, error };
  }
}

export async function dbDeleteVendorOrder(orderID) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) return { success: false };
    if (!orderID) return { success: false };
    const itemsPath = buildVendorOrderItemsCollectionPath(tenantID, storeID, orderID);
    const items = await firestoreQuery(itemsPath);
    await Promise.all(
      (items || []).map((item) =>
        firestoreDelete(buildVendorOrderItemPath(tenantID, storeID, orderID, item.id)),
      ),
    );
    await firestoreDelete(buildVendorOrderPath(tenantID, storeID, orderID));
    return { success: true };
  } catch (error) {
    log("Error deleting vendor order:", error);
    return { success: false, error };
  }
}

export async function dbGetVendorOrder(orderID) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) return null;
    if (!orderID) return null;
    return await firestoreRead(buildVendorOrderPath(tenantID, storeID, orderID));
  } catch (error) {
    log("Error reading vendor order:", error);
    return null;
  }
}

export function dbListenToVendorOrders(onChange, onError) {
  const name = "vendorOrders";
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) {
      log("Error: tenantID/storeID not configured for dbListenToVendorOrders");
      return null;
    }
    if (typeof onChange !== "function") return null;
    const path = buildVendorOrdersCollectionPath(tenantID, storeID);
    __logListenerAttach(name);
    const unsubscribe = firestoreSubscribeCollection(path, (data, error, meta) => {
      if (error) {
        log("Vendor orders listener error", { error });
        if (onError) onError(error);
        return;
      }
      __logListenerEmit(name, meta);
      onChange(data);
    });
    return () => {
      __logListenerDetach(name);
      unsubscribe();
    };
  } catch (error) {
    log("Error setting up vendor orders listener:", error);
    if (onError) onError(error);
    return null;
  }
}

export function dbListenToVendorOrderItems(orderID, onChange, onError) {
  const name = "vendorOrderItems:" + orderID;
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID || !orderID) return null;
    if (typeof onChange !== "function") return null;
    const path = buildVendorOrderItemsCollectionPath(tenantID, storeID, orderID);
    __logListenerAttach(name);
    const unsubscribe = firestoreSubscribeCollection(path, (data, error, meta) => {
      if (error) {
        log("Vendor order items listener error", { orderID, error });
        if (onError) onError(error);
        return;
      }
      __logListenerEmit(name, meta);
      onChange(data);
    });
    return () => {
      __logListenerDetach(name);
      unsubscribe();
    };
  } catch (error) {
    log("Error setting up vendor order items listener:", error);
    if (onError) onError(error);
    return null;
  }
}

// Async resolver. Caller writes the item with lookupStatus: "pending" then
// fires this (don't await on the UI thread — the resolver writes back to
// the item doc, the listener delivers the update).
//
// Order of attempts:
//   1. Local inventory match (Zustand). If hit and the local item is
//      mapped to a known vendor (vendorName matches a VENDOR_CATALOGS
//      displayName), short-circuit — write matched + local description.
//   2. Parallel Firestore queries across every VENDOR_CATALOGS entry with
//      a catalogPath, filtered by upc_ean == scannedBarcode.
//   3. Resolve:
//        0 hits → no_match
//        1 hit  → matched; snapshot the catalog doc
//        2+     → ambiguous; record candidateVendorIDs for desktop picker
//
// Note: `localItem.vendorId` is the VENDOR'S catalog item_id (their own
// item identifier), NOT a vendor-slug. The vendor slug is derived from
// `localItem.vendorName` via VENDOR_CATALOGS.displayName matching.
export async function dbResolveOrderItem(orderID, item) {
  try {
    if (!orderID || !item || !item.id || !item.scannedBarcode) {
      return { success: false, error: "missing args" };
    }
    const scanned = String(item.scannedBarcode);

    // 1. Local inventory short-circuit
    const inventory = useInventoryStore.getState().getInventoryArr?.() || [];
    const localMatch = inventory.find((inv) => {
      if (!inv) return false;
      if (inv.primaryBarcode === scanned) return true;
      const codes = Array.isArray(inv.barcodes) ? inv.barcodes : [];
      return codes.includes(scanned);
    });
    const hintVendor = localMatch
      ? VENDOR_CATALOGS.find((v) => v.displayName === localMatch.vendorName)
      : null;
    if (localMatch && hintVendor) {
      const localDisplay = localMatch.catalogName || localMatch.formalName || "";
      await dbUpdateVendorOrderItemFields(orderID, item.id, {
        lookupStatus: "matched",
        vendorCatalogID: hintVendor.id,
        vendorItemID: localMatch.vendorId || "",
        catalogSnapshot: {
          source: "local-inventory",
          description: localDisplay,
          cost: localMatch.cost || "",
          brand: localMatch.brand || "",
          catalogName: localMatch.catalogName || "",
        },
      });
      return { success: true, via: "local", displayName: localDisplay };
    }

    // 2. Parallel catalog queries. If local had a vendor hint (vendorName
    // matched a known catalog), narrow the search to that vendor.
    const queryable = VENDOR_CATALOGS.filter((v) => v.catalogPath);
    const targets = hintVendor ? queryable.filter((v) => v.id === hintVendor.id) : queryable;
    if (targets.length === 0) {
      await dbUpdateVendorOrderItemFields(orderID, item.id, { lookupStatus: "no_match" });
      return { success: true, via: "no-catalogs" };
    }

    const results = await Promise.all(
      targets.map(async (vendor) => {
        try {
          const hits = await firestoreCatalogQuery(
            `${vendor.catalogPath}/items_by_id`,
            [{ field: "barcodes", operator: "array-contains", value: scanned }],
            { limit: 1 },
          );
          if (hits.length === 0) return { vendor, match: null };
          const match = hits[0];
          return { vendor, match: { ...match, item_id: match.id } };
        } catch (e) {
          log("Catalog query failed for vendor " + vendor.id, e?.message);
          return { vendor, match: null };
        }
      })
    );

    const hits = results.filter((r) => r.match);

    // Catalog now ships catalogName (was `name` pre-2026-06). Fall back so
    // already-resolved-but-not-yet-displayed line items still render.
    const pickName = (m) => String(m?.catalogName || m?.name || "");

    // 3. Resolve
    let update;
    let displayName = "";
    if (hits.length === 0) {
      update = { lookupStatus: "no_match" };
    } else if (hits.length === 1) {
      const { vendor, match } = hits[0];
      displayName = pickName(match);
      update = {
        lookupStatus: "matched",
        vendorCatalogID: vendor.id,
        vendorItemID: match.item_id || match.id || "",
        catalogSnapshot: { ...match, source: vendor.id },
      };
    } else {
      displayName = pickName(hits[0].match);
      update = {
        lookupStatus: "ambiguous",
        candidateVendorIDs: hits.map((h) => h.vendor.id),
      };
    }

    await dbUpdateVendorOrderItemFields(orderID, item.id, update);
    return { success: true, via: "catalog", hits: hits.length, displayName };
  } catch (error) {
    log("Error resolving order item:", error);
    return { success: false, error };
  }
}

// Read-only catalog lookup by single barcode. No DB writes, no side effects.
// Used by Price Check on local-inventory miss to decide whether the scanned
// code maps to a vendor catalog item we could import. Returns the first hit
// across queryable VENDOR_CATALOGS (parallel array-contains queries), or
// null when no vendor knows the code.
export async function dbLookupCatalogByBarcode(scannedBarcode) {
  try {
    const scanned = String(scannedBarcode || "").trim();
    if (!scanned) return null;

    const queryable = VENDOR_CATALOGS.filter((v) => v.catalogPath);
    if (queryable.length === 0) return null;

    const results = await Promise.all(
      queryable.map(async (vendor) => {
        try {
          const hits = await firestoreCatalogQuery(
            `${vendor.catalogPath}/items_by_id`,
            [{ field: "barcodes", operator: "array-contains", value: scanned }],
            { limit: 1 },
          );
          if (hits.length === 0) return null;
          const { id: _id, ...catalogItem } = hits[0];
          return { vendor, catalogItem };
        } catch (e) {
          log("Catalog lookup failed for vendor " + vendor.id, e?.message);
          return null;
        }
      }),
    );

    return results.find(Boolean) || null;
  } catch (error) {
    log("Error looking up catalog by barcode:", error);
    return null;
  }
}

// Read-only catalog lookup by vendor SKU, vendor known. Direct doc-get on
// `vendor_catalogs/{vendor}/items_by_id/{vendorPartId}` (doc ID IS the SKU,
// so no index needed). Returns { vendor, catalogItem } or null.
export async function dbLookupCatalogByVendorPartId(vendorID, vendorPartId) {
  try {
    const sku = String(vendorPartId || "").trim();
    if (!sku) return null;

    const vendor = VENDOR_CATALOGS.find((v) => v.id === vendorID);
    if (!vendor?.catalogPath) return null;

    const raw = await firestoreCatalogRead(
      `${vendor.catalogPath}/items_by_id/${sku}`,
    );
    if (!raw) return null;
    const { id: _id, ...catalogItem } = raw;
    return { vendor, catalogItem };
  } catch (error) {
    log("Error looking up catalog by vendor part id:", error);
    return null;
  }
}

// Read-only catalog lookup by vendor SKU when the owning vendor is unknown.
// Fans out parallel direct doc-gets across every queryable VENDOR_CATALOGS
// entry. Returns the first { vendor, catalogItem } hit, or null. SKU
// collisions across vendors are rare but possible; first responder wins —
// callers that need disambiguation should use the single-vendor variant.
export async function dbLookupCatalogByVendorPartIdAnyVendor(vendorPartId) {
  try {
    const sku = String(vendorPartId || "").trim();
    if (!sku) return null;

    const queryable = VENDOR_CATALOGS.filter((v) => v.catalogPath);
    if (queryable.length === 0) return null;

    const results = await Promise.all(
      queryable.map(async (vendor) => {
        try {
          const raw = await firestoreCatalogRead(
            `${vendor.catalogPath}/items_by_id/${sku}`,
          );
          if (!raw) return null;
          const { id: _id, ...catalogItem } = raw;
          return { vendor, catalogItem };
        } catch (e) {
          log("Catalog SKU lookup failed for vendor " + vendor.id, e?.message);
          return null;
        }
      }),
    );

    return results.find(Boolean) || null;
  } catch (error) {
    log("Error looking up catalog by vendor part id (any vendor):", error);
    return null;
  }
}

// ============================================================================
// INVENTORY RECONCILIATION
// ============================================================================
//
// Maps an existing local inventory item (which may lack vendorId / cost /
// msrp / etc.) onto vendor-catalog records on cadence-pos Firestore by UPC
// match.
//
// Search key = primaryBarcode plus every entry in barcodes[], deduped.
// For each queryable VENDOR_CATALOGS entry (catalogPath set), one Firestore
// `array-contains-any` query over the local codes returns every catalog item
// whose barcodes intersect ours.
//
// Buckets returned to the caller:
//   • matched   — exactly one vendor has any hit. Auto-applicable.
//   • ambiguous — two or more vendors have hits. User picks which one
//                 "owns" the item for future ordering.
//   • no_match  — zero vendors hit; nothing to do.
//
// This function does NOT write. Use buildReconciliationUpdate() + apply via
// dbSaveInventoryItem() to commit a chosen candidate.

// Canonical catalog shape (post 2026-06): catalogName / barcodes / image_url.
// Legacy fallbacks (name / allUpcs / imageUrl) kept so the helpers stay
// correct against any docs that haven't been re-ingested yet.
function pickCatalogName(catalogItem) {
  return String(catalogItem?.catalogName || catalogItem?.name || "");
}

function pickCatalogBrand(catalogItem) {
  return String(catalogItem?.brand || "");
}

// Canonical catalog cost is already CENTS (vendor-catalog-*/modes/master.js
// does the dollars->cents conversion at write time). No money math here.
function pickCatalogCost(catalogItem) {
  const v = catalogItem?.cost;
  return Number.isFinite(v) ? v : 0;
}

// Canonical catalog msrp is already CENTS - see pickCatalogCost.
function pickCatalogMsrp(catalogItem) {
  const v = catalogItem?.msrp;
  return Number.isFinite(v) ? v : 0;
}

function pickCatalogImageUrl(catalogItem) {
  const raw = catalogItem?.image_url ?? catalogItem?.imageUrl;
  return typeof raw === "string" ? raw.trim() : "";
}

function pickCatalogPrimaryBarcode(catalogItem) {
  const raw = catalogItem?.primaryBarcode ?? catalogItem?.primaryUpc;
  return typeof raw === "string" ? raw.trim() : "";
}

function pickCatalogVendorPartId(catalogItem) {
  const raw =
    catalogItem?.vendorPartId ?? catalogItem?.item_id ?? catalogItem?.id;
  return typeof raw === "string" ? raw.trim() : raw != null ? String(raw) : "";
}

function extractCatalogBarcodes(catalogItem) {
  if (Array.isArray(catalogItem?.barcodes)) return catalogItem.barcodes;
  if (Array.isArray(catalogItem?.allUpcs)) return catalogItem.allUpcs;
  return [];
}

function normalizeBarcodeKey(code) {
  if (typeof code !== "string") return "";
  return code.trim();
}

export async function dbProbeInventoryAgainstCatalogs(localItem) {
  try {
    if (!localItem || typeof localItem !== "object") {
      return { status: "no_match", candidates: [], searchedCodes: [] };
    }

    const codes = [];
    const seen = new Set();
    const push = (raw) => {
      const k = normalizeBarcodeKey(raw);
      if (!k || seen.has(k)) return;
      seen.add(k);
      codes.push(k);
    };
    push(localItem.primaryBarcode);
    if (Array.isArray(localItem.barcodes)) {
      localItem.barcodes.forEach(push);
    }

    if (codes.length === 0) {
      return { status: "no_match", candidates: [], searchedCodes: [] };
    }

    const vendors = VENDOR_CATALOGS.filter((v) => v.catalogPath);
    if (vendors.length === 0) {
      return { status: "no_match", candidates: [], searchedCodes: codes };
    }

    // For each vendor, one Firestore array-contains-any query over the local
    // codes returns every catalog item whose barcodes intersects ours. Cap at
    // 30 values per query (Firestore limit); reconciliation rarely sees >5.
    // Intersect each match's barcodes with our local codes to recover which
    // codes matched.
    const perVendor = await Promise.all(
      vendors.map(async (vendor) => {
        const codeChunks = [];
        for (let i = 0; i < codes.length; i += 30) {
          codeChunks.push(codes.slice(i, i + 30));
        }
        const matches = [];
        try {
          const seen = new Set();
          for (const chunk of codeChunks) {
            const hits = await firestoreCatalogQuery(
              `${vendor.catalogPath}/items_by_id`,
              [{ field: "barcodes", operator: "array-contains-any", value: chunk }],
            );
            for (const h of hits) {
              if (seen.has(h.id)) continue;
              seen.add(h.id);
              matches.push(h);
            }
          }
        } catch (e) {
          log(
            `Reconciliation probe failed: ${vendor.id}`,
            e?.message,
          );
          return null;
        }

        if (matches.length === 0) return null;

        const codeSet = new Set(codes);
        const fetched = matches.map((catalogItem) => {
          const vendorCodes = extractCatalogBarcodes(catalogItem);
          const matchedCodes = vendorCodes.filter((c) => codeSet.has(c));
          return {
            vendorID: vendor.id,
            vendorName: vendor.displayName,
            itemId: pickCatalogVendorPartId(catalogItem) || catalogItem.id,
            catalogItem,
            matchedCodes,
            vendorCodes,
          };
        });

        return fetched;
      }),
    );

    const candidates = perVendor.filter(Boolean).flat();

    let status;
    if (candidates.length === 0) {
      status = "no_match";
    } else {
      const vendorIDs = new Set(candidates.map((c) => c.vendorID));
      status = vendorIDs.size === 1 ? "matched" : "ambiguous";
    }

    return { status, candidates, searchedCodes: codes };
  } catch (error) {
    log("Error probing inventory against catalogs:", error);
    return { status: "no_match", candidates: [], searchedCodes: [] };
  }
}

// Given a local item, a chosen candidate, and any other candidates from
// dbProbeInventoryAgainstCatalogs(), return the shallow-merge object to
// write back. primaryBarcode and price are intentionally absent so the
// caller can `{...local, ...payload}` without clobbering them.
//
//   catalogName      ← catalog catalogName (canonical display field)
//   brand            ← catalog brand (only written when catalog has one)
//   cost             ← catalog dealer cost in cents (number)
//   msrp             ← catalog msrp in cents (number)
//   image_url        ← catalog image_url (only written when catalog has one)
//   vendorId         ← vendor SLUG ("jbi" / "qbp") — the canonical pointer
//                       to a VENDOR_CATALOGS row
//   vendorPartId     ← vendor's own SKU; used to refetch / reorder from
//                       the vendor catalog
//   category         ← "Item"
//   alternateVendors ← thin pointers [{ vendorId, vendorPartId }] for each
//                       OTHER candidate (different vendorID than chosen).
//                       Lets the order screen surface cross-vendor stock
//                       without resurrecting multi-vendor data per item.
//   barcodes[]       ← union(local.barcodes, vendor barcodes) minus
//                       primaryBarcode
export function buildReconciliationUpdate(localItem, candidate, alternates = []) {
  if (!candidate || !candidate.catalogItem) return {};

  const catalogName = pickCatalogName(candidate.catalogItem);
  const catalogBrand = pickCatalogBrand(candidate.catalogItem);
  const cost = pickCatalogCost(candidate.catalogItem);
  const msrp = pickCatalogMsrp(candidate.catalogItem);
  const imageUrl = pickCatalogImageUrl(candidate.catalogItem);

  const primary = normalizeBarcodeKey(localItem?.primaryBarcode);
  const merged = new Set();
  if (Array.isArray(localItem?.barcodes)) {
    localItem.barcodes.forEach((b) => {
      const k = normalizeBarcodeKey(b);
      if (k && k !== primary) merged.add(k);
    });
  }
  if (Array.isArray(candidate.vendorCodes)) {
    candidate.vendorCodes.forEach((b) => {
      const k = normalizeBarcodeKey(b);
      if (k && k !== primary) merged.add(k);
    });
  }

  // Dedupe by vendorId — if multiple SKUs from the same alt vendor match the
  // same UPC, the first one wins (rare but possible).
  const altSeen = new Set();
  altSeen.add(candidate.vendorID);
  const alternateVendors = [];
  for (const a of alternates) {
    if (!a || altSeen.has(a.vendorID)) continue;
    altSeen.add(a.vendorID);
    alternateVendors.push({
      vendorId: a.vendorID,
      vendorPartId: String(a.itemId || ""),
    });
  }

  const payload = {
    catalogName: catalogName || localItem?.catalogName || localItem?.formalName || "",
    cost,
    msrp,
    vendorId: candidate.vendorID,
    vendorPartId: String(candidate.itemId || ""),
    category: "Item",
    alternateVendors,
    barcodes: Array.from(merged),
  };
  if (catalogBrand) payload.brand = catalogBrand;
  if (imageUrl) payload.image_url = imageUrl;
  return payload;
}

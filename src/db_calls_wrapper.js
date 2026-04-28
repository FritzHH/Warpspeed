// Smart database wrapper - handles path building, validation, and business logic
// This file contains all business logic and calls the "dumb" db.js functions

import { log, removeEmptyFields, stringifyAllObjectFields, stringifyObject, compressImage, localStorageWrapper } from "./utils";
import { takeId, getId } from "./idPool";
import {
  DB_NODES,
  MILLIS_IN_MINUTE,
  PRINT_OBJECT_REMOVAL_DELAY,
  build_db_path,
} from "./constants";
import {
  firestoreWrite,
  firestoreRead,
  firestoreUpdate,
  firestoreQuery,
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
  rehydrateFromArchiveCallable,
  manualArchiveAndCleanupCallable,
  createTextToPayInvoiceCallable,
  firestoreBatchWrite,
  firestoreBatchDelete,
} from "./db_calls";
import { removeUnusedFields, createNewWorkorder, buildWorkorderNumberFromId } from "./utils";
import { useSettingsStore, useLoginStore, useOpenWorkordersStore, clearPersistedStores } from "./stores";
import {
  onAuthStateChanged,
  sendPasswordResetEmail,
  updatePassword,
} from "firebase/auth";
import { collection, doc, query, orderBy, where, onSnapshot, deleteField } from "firebase/firestore";

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

function buildCompletedSalePath(tenantID, storeID, saleID) {
  return `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/${DB_NODES.FIRESTORE.COMPLETED_SALES}/${saleID}`;
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

    // Auto-create customer PIN doc for the customer-facing workorder screen (only on first save)
    if (workorderToSave.customerPin && isFirstSave) {
      const pinPath = `workorder-pins/${workorderToSave.customerPin}`;
      firestoreWrite(pinPath, {
        pin: workorderToSave.customerPin,
        workorderID: id,
        tenantID,
        storeID,
        customerID: workorderToSave.customerID || "",
        createdAt: Date.now(),
        createdBy: workorderToSave.startedBy || "",
      }).catch(() => {}); // fire-and-forget
    }

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
    const path = buildPrintObjectPath(
      tenantID,
      storeID,
      printerID,
      printObj.id
    );
    let cleanedPrintObj = removeEmptyFields(printObj);

    let stringifiedPrintObj = stringifyAllObjectFields(cleanedPrintObj);
    log("dbSavePrintObj:", JSON.stringify(stringifiedPrintObj, null, 2));

    const result = await firestoreWrite(path, stringifiedPrintObj);

    if (result && result.success) {
      // Set timer to remove the print object after 100ms
      setTimeout(async () => {
        try {
          let deleteResult;
          // if (!printObj.persistFlag) {
          deleteResult = await firestoreDelete(path);
          // }

          if (deleteResult.success) {
          } else {
          }
        } catch (error) {
          log(
            `Error in timer removal of print object with ID: ${printObj.id}:`,
            error
          );
        }
      }, PRINT_OBJECT_REMOVAL_DELAY);

      return {
        success: true,
        message: "Print object saved successfully",
        printObj: printObj,
        printerID: printerID,
        tenantID,
        storeID,
        path,
      };
    } else {
      log(`Error saving print object: ${result.error}`);
      return {
        success: false,
        error: result.error,
        message: "Failed to save print object",
        printObj: null,
        printerID: null,
        tenantID,
        storeID,
        path,
      };
    }
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
 * Get tenant info from email_users collection by id field
 * @param {string} id - Tenant ID to search for
 * @returns {Promise<Object>} Tenant info data or null
 */
export async function dbGetTenantById(id) {
  try {
    if (!id) {
      log("Error: id is required for dbGetTenantById");
      return null;
    }

    // Build collection path: email_users
    const collectionPath = DB_NODES.FIRESTORE.EMAIL_USERS;

    // Query by id field
    const whereClauses = [{ field: "id", operator: "==", value: id }];

    const results = await firestoreQuery(collectionPath, whereClauses);

    // Should return exactly one result
    const tenant = results && results.length > 0 ? results[0] : null;

    return tenant;
  } catch (error) {
    log("Error retrieving tenant by id:", error);
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

/**
 * Delete workorder from Firestore by ID
 * @param {string} workorderID - Workorder ID (required)
 * @returns {Promise<Object>} Delete result
 */
export async function dbDeleteWorkorder(workorderID) {
  try {
    const { tenantID, storeID } = getTenantAndStore();

    if (!tenantID || !storeID) {
      log(
        "Error: tenantID and storeID are not configured for dbDeleteWorkorder"
      );
      return {
        success: false,
        error: "Configuration Error",
        message:
          "tenantID and storeID are not configured. Please check your settings.",
        workorderID: null,
        tenantID,
        storeID,
      };
    }

    if (!workorderID) {
      log("Error: workorderID is required for dbDeleteWorkorder");
      return {
        success: false,
        error: "Validation Error",
        message: "workorderID is required for dbDeleteWorkorder",
        workorderID: null,
        tenantID,
        storeID,
      };
    }

    const path = buildWorkorderPath(tenantID, storeID, workorderID);
    log(`Deleting workorder from path: ${path}`);

    await firestoreDelete(path);

    log(`Successfully deleted workorder with ID: ${workorderID}`);
    return {
      success: true,
      message: "Workorder deleted successfully",
      workorderID,
      tenantID,
      storeID,
      path,
    };
  } catch (error) {
    log("Error in dbDeleteWorkorder:", error);
    return {
      success: false,
      error: "Database Error",
      message: "An error occurred while deleting the workorder",
      workorderID: null,
      tenantID: null,
      storeID: null,
    };
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

    // Clean and validate name (trim whitespace, convert to lowercase)
    const cleanName = name.trim().toLowerCase();

    if (cleanName.length === 0) {
      log("Error: Name must contain at least one character for dbSearchCustomersByName");
      return [];
    }

    // Build collection path for customers
    const collectionPath = buildCustomerCollectionPath(tenantID, storeID);

    // Create queries for name search (partial match for real-time typing)
    // Each field gets a range query to find partial matches
    const fieldQueries = [{ field: "first" }, { field: "last" }];

    // Execute multiple queries and combine results
    const allResults = [];
    const seenIds = new Set();

    for (const fieldQuery of fieldQueries) {
      try {
        // Use range query to find partial matches (starts-with behavior)
        const whereClauses = [
          { field: fieldQuery.field, operator: ">=", value: cleanName },
          {
            field: fieldQuery.field,
            operator: "<=",
            value: cleanName + "\uf8ff",
          },
        ];

        const results = await firestoreQuery(collectionPath, whereClauses);

        // Filter results to ensure they actually start with the name
        // (Firestore range queries can return results that don't start with the value)
        const filteredResults = results.filter((customer) => {
          const nameValue = customer[fieldQuery.field];
          return (
            nameValue &&
            nameValue.toString().toLowerCase().startsWith(cleanName)
          );
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
export function dbListenToOpenWorkorders(onSnapshot) {
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

    // Subscribe to collection changes
    const unsubscribe = firestoreSubscribeCollection(
      collectionPath,
      (workordersData, error) => {
        if (error) {
          log("Workorder listener error", { tenantID, storeID, error });
          return;
        }

        onSnapshot(workordersData);
      }
    );

    return unsubscribe;
  } catch (error) {
    log("Error setting up workorder listener:", error);
    return null;
  }
}

export function dbListenToActiveSales(onSnapshot) {
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
    const unsubscribe = firestoreSubscribeCollection(
      collectionPath,
      (salesData, error) => {
        if (error) {
          log("Active sales listener error", { tenantID, storeID, error });
          return;
        }
        onSnapshot(salesData);
      }
    );
    return unsubscribe;
  } catch (error) {
    log("Error setting up active sales listener:", error);
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
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID || !workorderID) return null;
    const path = buildOpenWorkordersCollectionPath(tenantID, storeID) + "/" + workorderID;
    const unsubscribe = firestoreSubscribe(path, (data) => {
      callback(data ? { ...data, id: workorderID } : null);
    });
    return unsubscribe;
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
export function dbListenToSettings(onChange) {
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

    // Subscribe to document changes
    const unsubscribe = firestoreSubscribe(path, (settingsData, error) => {
      if (error) {
        log("Settings listener error", { tenantID, storeID, error });
        return; // Don't call onChange on error
      }

      onChange(settingsData, tenantID, storeID);
    });

    return unsubscribe;
  } catch (error) {
    log("Error setting up settings listener:", error);
    return null;
  }
}

/**
 * Listen to changes in current punch clock document for a tenant/store
 * @param {Function} onChange - Callback function called when punch clock changes
 * @returns {Function} Unsubscribe function to stop listening
 */
export function dbListenToCurrentPunchClock(onChange) {
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

    // Subscribe to document changes
    const unsubscribe = firestoreSubscribe(path, (punchClockData, error) => {
      if (error) {
        log("Current punch clock listener error", { tenantID, storeID, error });
        return; // Don't call onChange on error
      }
      if (!punchClockData) punchClockData = {};
      onChange(punchClockData);
    });

    return unsubscribe;
  } catch (error) {
    log("Error setting up current punch clock listener:", error);
    return null;
  }
}

/**
 * Listen to changes in inventory collection for a tenant/store
 * @param {Function} onSnapshot - Callback function called when inventory changes
 * @returns {Function} Unsubscribe function to stop listening
 */
export function dbListenToInventory(onSnapshot) {
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

    // Subscribe to collection changes
    const unsubscribe = firestoreSubscribeCollection(
      collectionPath,
      (inventoryData, error) => {
        if (error) {
          log("Inventory listener error", { tenantID, storeID, error });
          return;
        }

        onSnapshot(inventoryData);
      }
    );

    return unsubscribe;
  } catch (error) {
    log("Error setting up inventory listener:", error);
    return null;
  }
}

export function dbListenToDevLogs(docName, callback) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) return null;
    const path = `tenants/${tenantID}/stores/${storeID}/dev-logs/${docName}`;
    return firestoreSubscribe(path, callback);
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

    // Subscribe to updates
    const unsubscribeUpdates = firestoreSubscribe(
      updatesPath,
      (updateData, error) => {
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

        onUpdate(updateData);
      }
    );

    // Subscribe to completions
    const unsubscribeCompletions = firestoreSubscribe(
      completionsPath,
      (completionData, error) => {
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

        onCompletion(completionData);
      }
    );

    // Return object with both unsubscribe functions
    return {
      unsubscribeUpdates,
      unsubscribeCompletions,
      unsubscribe: () => {
        unsubscribeUpdates();
        unsubscribeCompletions();
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
 * Uses localStorage cache for instant restore on persisted sessions,
 * falls back to Firestore query on cache miss.
 * @param {string} uid - Firebase Auth user UID
 * @returns {Promise<Object>} { tenantID, storeID, settings }
 */
export async function loadTenantAndSettings(uid) {
  // 1. Try Zustand persisted settings first (instant from localStorage)
  const cached = localStorageWrapper.getItem(TENANT_CACHE_KEY);
  if (cached?.tenantID && cached?.storeID) {
    const persisted = useSettingsStore.getState().settings;
    if (persisted?.tenantID === cached.tenantID && persisted?.storeID === cached.storeID) {
      // Settings already rehydrated from Zustand persist — skip network call
      return { tenantID: cached.tenantID, storeID: cached.storeID, settings: persisted };
    }
    // Zustand cache miss — fetch from Firestore
    const settings = await dbGetSettings(cached.tenantID, cached.storeID);
    if (settings) {
      useSettingsStore.getState().setSettings(settings, false, false);
      return { tenantID: cached.tenantID, storeID: cached.storeID, settings };
    }
  }

  // 2. Cache miss or stale — fetch tenant from Firestore
  const tenant = await dbGetTenantById(uid);
  if (!tenant?.tenantID || !tenant?.storeID) {
    throw new Error("User is not associated with any tenant/store");
  }

  const settings = await dbGetSettings(tenant.tenantID, tenant.storeID);
  if (!settings) {
    throw new Error("Settings not found for tenant/store");
  }

  // 3. Cache for next restore & populate store
  localStorageWrapper.setItem(TENANT_CACHE_KEY, {
    tenantID: tenant.tenantID,
    storeID: tenant.storeID,
  });
  useSettingsStore.getState().setSettings(settings, false, false);

  return { tenantID: tenant.tenantID, storeID: tenant.storeID, settings };
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

    return {
      success: true,
      user: {
        uid: user.uid,
        email: user.email,
        emailVerified: user.emailVerified,
        displayName: user.displayName,
      },
      auth: userCredential,
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
    const smsData = {
      message: (message.message || "").trim(),
      phoneNumber: message.phoneNumber,
      tenantID: tenantID,
      storeID: storeID,
      customerID: message.customerID || "",
      messageID: message.id || "",
      imageUrl: message.imageUrl || "",
      mediaUrls: message.mediaUrls || [],
      canRespond: message.canRespond || null,
      forwardTo: message.forwardTo || null,
      customerFirst: message.customerFirst || "",
      customerLast: message.customerLast || "",
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

export async function dbToggleSMSForwarding(phone, userID, enable, userPhone, userFirst) {
  try {
    const cleanPhone = (phone || "").replace(/\D/g, "");
    if (cleanPhone.length !== 10) return { success: false, error: "Invalid phone" };
    if (!userID) return { success: false, error: "No user ID" };
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) return { success: false, error: "Missing tenant/store" };
    const path = `tenants/${tenantID}/stores/${storeID}/sms-messages/${cleanPhone}`;
    const fieldKey = `forwardTo.${userID}`;
    if (enable) {
      if (!userPhone) return { success: false, error: "No user phone" };
      await firestoreUpdate(path, { [fieldKey]: { phone: userPhone, first: userFirst || "" } });
    } else {
      await firestoreUpdate(path, { [fieldKey]: deleteField() });
    }
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
    return !!(data?.forwardTo?.[userID]);
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

export async function dbSendEmail(to, subject, htmlBody, attachments) {
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
export function dbListenToActiveMessageThreads(callback) {
  try {
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) return null;
    const smsRef = collection(DB, "tenants", tenantID, "stores", storeID, "sms-messages");
    const unsub = onSnapshot(
      smsRef,
      (snapshot) => {
        const changes = [];
        snapshot.docChanges().forEach((change) => {
          changes.push({ type: change.type, phone: change.doc.id, ...change.doc.data() });
        });
        callback(changes);
      },
      (error) => {
        log("Active threads listener error", { error });
      }
    );
    return unsub;
  } catch (error) {
    log("Error setting up active threads listener", { error });
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
  try {
    if (!customerPhone || typeof customerPhone !== "string") {
      log("Error: customerPhone is required for dbListenToCustomerMessages");
      return null;
    }
    const cleanPhone = customerPhone.replace(/\D/g, "");
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
    const unsubscribe = onSnapshot(
      messagesQuery,
      (querySnapshot) => {
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
    return unsubscribe;
  } catch (error) {
    log("Error setting up customer messages listener:", error);
    return null;
  }
}

export function dbListenToNewMessages(customerPhone, afterMillis, callback) {
  try {
    if (!customerPhone || typeof customerPhone !== "string") return null;
    const cleanPhone = customerPhone.replace(/\D/g, "");
    if (cleanPhone.length !== 10) return null;
    const { tenantID, storeID } = getTenantAndStore();
    if (!tenantID || !storeID) return null;
    const messagesRef = collection(DB, "tenants", tenantID, "stores", storeID, "sms-messages", cleanPhone, "messages");
    const messagesQuery = query(messagesRef, orderBy("millis", "asc"), where("millis", ">", afterMillis));
    const unsubscribe = onSnapshot(
      messagesQuery,
      (querySnapshot) => {
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
    return unsubscribe;
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

export async function dbUploadPDFAndSendSMS({ base64, storagePath, message, phoneNumber, customerID, messageID, canRespond, forwardTo }) {
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
    });
    return result;
  } catch (error) {
    log("Error in dbUploadPDFAndSendSMS:", error);
    return { success: false, error: error.message || "Failed to upload PDF and send SMS" };
  }
}

/**
 * Emergency rehydration — restores Firestore collections from Cloud Storage archives.
 * @param {string[]} collections - Array of collection names to restore
 * @returns {Promise<Object>} { success, results: { collectionName: { success, docCount } } }
 */
export async function dbCreateTextToPayInvoice(workorderID, channel = "sms") {
  const { tenantID, storeID } = getTenantAndStore();
  try {
    const result = await createTextToPayInvoiceCallable({
      workorderID,
      channel,
      tenantID,
      storeID,
    });
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



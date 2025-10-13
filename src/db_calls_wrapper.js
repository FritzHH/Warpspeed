// Smart database wrapper - handles path building, validation, and business logic
// This file contains all business logic and calls the "dumb" db.js functions

import { generateRandomID, log, stringifyObject } from "./utils";
import {
  DB_NODES,
  MILLIS_IN_MINUTE,
  PRINT_OBJECT_REMOVAL_DELAY,
} from "./constants";
import {
  firestoreWrite,
  firestoreRead,
  firestoreQuery,
  firestoreSubscribe,
  firestoreSubscribeCollection,
  firestoreDelete,
  storageUploadString,
  storageGetDownloadURL,
  authSignIn,
  authSignOut,
  getServerTimestamp,
  AUTH,
  DB,
  processServerDrivenStripePaymentCallable,
  processServerDrivenStripeRefundCallable,
  cancelServerDrivenStripePaymentCallable,
  retrieveAvailableStripeReadersCallable,
  sendSMSEnhanced,
} from "./db_calls";
import { removeUnusedFields } from "./utils";
import { useSettingsStore } from "./stores";
import {
  onAuthStateChanged,
  sendPasswordResetEmail,
  updatePassword,
} from "firebase/auth";
import { collection, doc } from "firebase/firestore";

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
 * Build Firestore path for outgoing message
 * @param {string} tenantID - Tenant ID
 * @param {string} storeID - Store ID
 * @param {string} customerID - Customer ID
 * @param {string} messageID - Message ID
 * @returns {string} Full Firestore path for outgoing message
 */
function buildOutgoingMessagePath(tenantID, storeID, customerID, messageID) {
  // Format: tenants/{tenantID}/stores/{storeID}/outgoing-messages/{customerID}/messages/{messageID}
  return `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/${DB_NODES.FIRESTORE.OUTGOING_MESSAGES}/${customerID}/messages/${messageID}`;
}

/**
 * Build Firestore path for incoming message
 * @param {string} tenantID - Tenant ID
 * @param {string} storeID - Store ID
 * @param {string} customerID - Customer ID
 * @param {string} messageID - Message ID
 * @returns {string} Full Firestore path for incoming message
 */
function buildIncomingMessagePath(tenantID, storeID, customerID, messageID) {
  // Format: tenants/{tenantID}/stores/{storeID}/incoming-messages/{customerID}/messages/{messageID}
  return `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/${DB_NODES.FIRESTORE.INCOMING_MESSAGES}/${customerID}/messages/${messageID}`;
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

// setters /////////////////////////////////////////////////////////////////////

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

    log("Settings field saved", {
      fieldName,
      value,
      tenantID,
      storeID,
    });

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

    log("Settings saved", { tenantID, storeID });

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
export async function dbSaveOpenWorkorder(workorder, workorderID = null) {
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

    let workorderToSave = workorder;

    // Build path: tenants/{tenantID}/stores/{storeID}/open-workorders/{workorderID}
    const path = buildWorkorderPath(tenantID, storeID, id);

    await firestoreWrite(path, workorderToSave);

    // log("Open workorder saved", {
    //   workorderID: id,
    //   tenantID,
    //   storeID,
    //   path,
    // });

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
      log(
        "Error: tenantID and storeID are not configured for dbGetCompletedWorkorder"
      );
      return null;
    }

    if (!id) {
      log("Error: id is required for dbGetCompletedWorkorder");
      return null;
    }

    // Build storage path: closed-workorders/{tenantID}/{storeID}/{workorderID}.json
    const storagePath = `${DB_NODES.STORAGE.CLOSED_WORKORDERS}/${tenantID}/${storeID}/${id}.json`;

    // Get the download URL for the file
    const downloadURL = await storageGetDownloadURL(storagePath);

    if (!downloadURL) {
      log("Error: Completed workorder not found for dbGetCompletedWorkorder");
      return null;
    }

    // Fetch the JSON content from the download URL
    const response = await fetch(downloadURL);

    if (!response.ok) {
      log("Error: Failed to fetch completed workorder content");
      return null;
    }

    // Parse the JSON string back to an object
    const workorder = await response.json();

    return workorder;
  } catch (error) {
    log("Error retrieving completed workorder:", error);
    return null;
  }
}

/**
 * Complete a sale by saving it to Cloud Storage
 * @param {Object} sale - Sale object to complete
 * @param {string} saleID - Sale ID (optional, will use sale.id if not provided)
 * @returns {Promise<Object>} Completion result
 */
export async function dbCompleteSale(sale, saleID = null) {
  try {
    const { tenantID, storeID } = getTenantAndStore();

    if (!tenantID || !storeID) {
      log("Error: tenantID and storeID are not configured for dbCompleteSale");
      return {
        success: false,
        error: "Configuration Error",
        message:
          "tenantID and storeID are not configured. Please check your settings.",
        sale: null,
        saleID: null,
        tenantID,
        storeID,
      };
    }

    if (!sale || typeof sale !== "object") {
      log("Error: sale object is required for dbCompleteSale");
      return {
        success: false,
        error: "Invalid Parameter",
        message: "sale object is required",
        sale: null,
        saleID: null,
        tenantID,
        storeID,
      };
    }

    // Get sale ID from parameter or sale object
    const id = saleID || sale.id || sale["id"];
    if (!id) {
      log(
        "Error: saleID must be provided either as parameter, sale.id, or sale['id'] for dbCompleteSale"
      );
      return {
        success: false,
        error: "Invalid Parameter",
        message:
          "saleID must be provided either as parameter, sale.id, or sale['id']",
        sale: null,
        saleID: null,
        tenantID,
        storeID,
      };
    }

    let saleToComplete = sale;

    // 1. Save to Cloud Storage as JSON
    const storagePath = `${DB_NODES.STORAGE.CLOSED_SALES}/${tenantID}/${storeID}/${id}.json`;
    const saleJson = JSON.stringify(saleToComplete, null, 2);

    await storageUploadString(storagePath, saleJson, "application/json");

    log("Sale completed", {
      saleID: id,
      tenantID,
      storeID,
      storagePath,
    });

    return {
      success: true,
      sale: saleToComplete,
      saleID: id,
      tenantID,
      storeID,
      storagePath,
    };
  } catch (error) {
    log("Error completing sale:", error);
    return {
      success: false,
      error: "Database Error",
      message: error.message,
      sale: null,
      saleID: null,
      tenantID: null,
      storeID: null,
    };
  }
}

/**
 * Complete a workorder by moving it from Realtime Database to Cloud Storage
 * @param {Object} workorder - Workorder object to complete
 * @returns {Promise<Object>} Completion result
 */
export async function dbCompleteWorkorder(workorder) {
  try {
    const { tenantID, storeID } = getTenantAndStore();

    if (!tenantID || !storeID) {
      log(
        "Error: tenantID and storeID are not configured for dbCompleteWorkorder"
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

    if (!workorder || !workorder.id) {
      log(
        "Error: workorder object with id is required for dbCompleteWorkorder"
      );
      return {
        success: false,
        error: "Invalid Parameter",
        message: "workorder object with id is required",
        workorder: null,
        workorderID: null,
        tenantID,
        storeID,
      };
    }

    let workorderToComplete = workorder;

    // 1. Save to Cloud Storage as JSON
    const storagePath = `${DB_NODES.STORAGE.CLOSED_WORKORDERS}/${tenantID}/${storeID}/${workorder.id}.json`;
    const workorderJson = JSON.stringify(workorderToComplete, null, 2);

    await storageUploadString(storagePath, workorderJson, "application/json");

    // 2. Remove from Firestore open workorders
    const firestorePath = buildWorkorderPath(tenantID, storeID, workorder.id);
    await firestoreDelete(firestorePath);

    log("Workorder completed", {
      workorderID: workorder.id,
      tenantID,
      storeID,
      storagePath,
      firestorePath,
    });

    return {
      success: true,
      workorder: workorderToComplete,
      workorderID: workorder.id,
      tenantID,
      storeID,
      storagePath,
      firestorePath,
    };
  } catch (error) {
    log("Error completing workorder:", error);
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
 * Save customer object to Firestore
 * @param {Object} customer - Customer object to save
 * @param {string} customerID - Customer ID (optional, will use customer.id if not provided)
 * @returns {Promise<Object>} Save result
 */
export async function dbSaveCustomer(customer, customerID = null) {
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

    // Get customer ID from parameter or customer object
    const id = customerID || customer.id || customer["id"];
    if (!id) {
      log(
        "Error: customerID must be provided either as parameter, customer.id, or customer['id'] for dbSaveCustomer"
      );
      return {
        success: false,
        error: "Invalid Parameter",
        message:
          "customerID must be provided either as parameter, customer.id, or customer['id']",
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
      buildCustomerPath(tenantID, storeID, id),
      customerToSave
    );

    return {
      success: true,
      customer: customerToSave,
      customerID: id,
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

    log("Inventory item saved", {
      itemID: id,
      tenantID,
      storeID,
      path,
    });

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

    printObj.id = generateRandomID();
    const path = buildPrintObjectPath(
      tenantID,
      storeID,
      printerID,
      printObj.id
    );
    // log(`Saving print object to path: ${path}`);

    // Clean and process fields before saving to Firestore
    // Fields to preserve unchanged: internalNotes, customerNotes, workorderLines, paymentsSet
    const PRESERVE_FIELDS = [
      "internalNotes",
      "customerNotes",
      "workorderLines",
      "paymentsSet",
    ];

    function cleanPrintObject(obj) {
      if (obj === null || typeof obj !== "object") {
        return obj;
      }

      const cleaned = {};

      for (const [key, value] of Object.entries(obj)) {
        // Preserve specific fields unchanged
        if (PRESERVE_FIELDS.includes(key)) {
          cleaned[key] = value;
          continue;
        }

        // Handle arrays (non-preserved fields)
        if (Array.isArray(value)) {
          if (value.length === 0) {
            // Empty array - remove the field
            continue;
          }
          // Convert array items to strings
          const stringArray = value
            .map((item) => {
              if (typeof item === "object" && item !== null) {
                return cleanPrintObject(item); // Recursively clean nested objects
              }
              return String(item);
            })
            .filter(
              (item) => item !== "" && item !== "undefined" && item !== "null"
            );

          if (stringArray.length > 0) {
            cleaned[key] = stringArray;
          }
          continue;
        }

        // Handle objects (non-preserved fields)
        if (typeof value === "object" && value !== null) {
          const cleanedObject = cleanPrintObject(value);
          // Check if object has any valid fields
          if (Object.keys(cleanedObject).length > 0) {
            cleaned[key] = cleanedObject;
          }
          continue;
        }

        // Handle primitive values
        if (value === undefined || value === null) {
          continue; // Remove undefined/null fields
        }

        if (typeof value === "string") {
          const trimmed = value.trim();
          if (trimmed === "") {
            continue; // Remove empty strings
          }
          cleaned[key] = trimmed;
          continue;
        }

        if (typeof value === "boolean") {
          cleaned[key] = value.toString();
          continue;
        }

        if (typeof value === "number") {
          cleaned[key] = value.toString();
          continue;
        }

        // Convert any other type to string
        cleaned[key] = String(value);
      }

      return cleaned;
    }

    let cleanedPrintObj = cleanPrintObject(printObj);

    // Final safety check for any remaining undefined values
    const undefinedFields = [];
    function findUndefined(obj, path = "") {
      if (obj === undefined) {
        undefinedFields.push(path || "root");
        return;
      }
      if (obj === null || typeof obj !== "object") return;

      for (const [key, value] of Object.entries(obj)) {
        findUndefined(value, path ? `${path}.${key}` : key);
      }
    }

    findUndefined(cleanedPrintObj);

    if (undefinedFields.length > 0) {
      log(
        "CRITICAL: Found undefined fields after all cleaning:",
        undefinedFields
      );
      throw new Error(
        `Undefined fields found after cleaning: ${undefinedFields.join(", ")}`
      );
    }

    // log("=== SAVING TO FIRESTORE ===");
    // log("Path:", path);
    log("Final object to save:", cleanedPrintObj);
    // now stringify all fields 
    cleanedPrintObject = stringifyAllObjectFields(cleanPrintObject);
    const result = await firestoreWrite(path, cleanedPrintObj);
    // log("firestoreWrite result:", result);
    // log("result type:", typeof result);
    // log("result.success:", result?.success);

    if (result && result.success) {
      // log(
      //   `Successfully saved print object with ID: ${cleanedPrintObj.id} to printer: ${printerID}`
      // );

      // Set timer to remove the print object after 100ms
      setTimeout(async () => {
        try {
          log(
            `Removing print object with ID: ${printObj.id} after ${PRINT_OBJECT_REMOVAL_DELAY}ms`
          );
          let deleteResult;
          // if (!printObj.persistFlag) {
          deleteResult = await firestoreDelete(path);
          // }

          if (deleteResult.success) {
            // log(`Successfully removed print object with ID: ${printObj.id}`);
          } else {
            // log(
            //   `Error removing print object with ID: ${printObj.id}:`,
            //   deleteResult.error
            // );
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
    log("=== ERROR IN dbSavePrintObj ===");
    log("Error details:", error);
    log("Error message:", error.message);
    log("Error stack:", error.stack);
    log("Error code:", error.code);
    log("Error name:", error.name);
    log("Full error object:", JSON.stringify(error, null, 2));
    log("=== END ERROR LOGGING ===");

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
/**
 * Get completed sale from Cloud Storage by ID
 * @param {string} id - Sale ID (required)
 * @returns {Promise<Object>} Completed sale object or null
 */
export async function dbGetCompletedSale(id) {
  try {
    const { tenantID, storeID } = getTenantAndStore();

    if (!tenantID || !storeID) {
      log(
        "Error: tenantID and storeID are not configured for dbGetCompletedSale"
      );
      return null;
    }

    if (!id) {
      log("Error: id is required for dbGetCompletedSale");
      return null;
    }

    // Build storage path: closed-sales/{tenantID}/{storeID}/{saleID}.json
    const storagePath = `${DB_NODES.STORAGE.CLOSED_SALES}/${tenantID}/${storeID}/${id}.json`;

    // Get the download URL for the file
    const downloadURL = await storageGetDownloadURL(storagePath);

    if (!downloadURL) {
      log("Error: Completed sale not found for dbGetCompletedSale");
      return null;
    }

    // Fetch the JSON content from the download URL
    const response = await fetch(downloadURL);

    if (!response.ok) {
      log("Error: Failed to fetch completed sale content");
      return null;
    }

    // Parse the JSON string back to an object
    const sale = await response.json();

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

    log(tenantID, storeID);
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

    const result = await firestoreDelete(path);

    if (result.success) {
      log(`Successfully deleted workorder with ID: ${workorderID}`);
      return {
        success: true,
        message: "Workorder deleted successfully",
        workorderID,
        tenantID,
        storeID,
        path,
      };
    } else {
      log(`Error deleting workorder: ${result.error}`);
      return {
        success: false,
        error: result.error,
        message: "Failed to delete workorder",
        workorderID: null,
        tenantID,
        storeID,
        path,
      };
    }
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
      log(
        "Error: tenantID and storeID are not configured for dbSearchCustomersByPhone"
      );
      return [];
      return {
        success: false,
        error: "Configuration Error",
        message:
          "tenantID and storeID are not configured. Please check your settings.",
        customers: [],
        count: 0,
        phoneNumber: phoneNumber || "",
        tenantID,
        storeID,
      };
    }

    if (!phoneNumber || typeof phoneNumber !== "string") {
      log(
        "Error: phoneNumber is required and must be a string for dbSearchCustomersByPhone"
      );
      return [];
      return {
        success: false,
        error: "Invalid Parameter",
        message: "phoneNumber is required and must be a string",
        customers: [],
        count: 0,
        phoneNumber: phoneNumber || "",
        tenantID,
        storeID,
      };
    }

    // Clean and validate phone number (remove non-digits, limit to 10 digits)
    const cleanPhone = phoneNumber.replace(/\D/g, "").substring(0, 10);

    if (cleanPhone.length === 0) {
      log(
        "Error: Phone number must contain at least one digit for dbSearchCustomersByPhone"
      );
      return [];
      return {
        success: false,
        error: "Invalid Parameter",
        message: "Phone number must contain at least one digit",
        customers: [],
        count: 0,
        phoneNumber: cleanPhone,
        tenantID,
        storeID,
      };
    }

    // Build collection path for customers
    const collectionPath = buildCustomerCollectionPath(tenantID, storeID);

    // Create queries for phone number search (partial match for real-time typing)
    // Each field gets a range query to find partial matches
    const fieldQueries = [{ field: "cell" }, { field: "landline" }];

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
    return {
      success: false,
      error: "Database Error",
      message: error.message,
      customers: [],
      count: 0,
      phoneNumber: phoneNumber || "",
      tenantID: null,
      storeID: null,
    };
  }
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
      log(
        "Error: tenantID and storeID are not configured for dbSearchCustomersByEmail"
      );
      return {
        success: false,
        error: "Configuration Error",
        message:
          "tenantID and storeID are not configured. Please check your settings.",
        customers: [],
        count: 0,
        email: email || "",
        tenantID,
        storeID,
      };
    }

    if (!email || typeof email !== "string") {
      log(
        "Error: email is required and must be a string for dbSearchCustomersByEmail"
      );
      return {
        success: false,
        error: "Invalid Parameter",
        message: "email is required and must be a string",
        customers: [],
        count: 0,
        email: email || "",
        tenantID,
        storeID,
      };
    }

    // Clean and validate email (trim whitespace, convert to lowercase)
    const cleanEmail = email.trim().toLowerCase();

    if (cleanEmail.length === 0) {
      log(
        "Error: Email must contain at least one character for dbSearchCustomersByEmail"
      );
      return {
        success: false,
        error: "Invalid Parameter",
        message: "Email must contain at least one character",
        customers: [],
        count: 0,
        email: cleanEmail,
        tenantID,
        storeID,
      };
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
    return {
      success: false,
      error: "Database Error",
      message: error.message,
      customers: [],
      count: 0,
      email: email || "",
      tenantID: null,
      storeID: null,
    };
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
      log(
        "Error: tenantID and storeID are not configured for dbSearchCustomersByName"
      );
      return {
        success: false,
        error: "Configuration Error",
        message:
          "tenantID and storeID are not configured. Please check your settings.",
        customers: [],
        count: 0,
        name: name || "",
        tenantID,
        storeID,
      };
    }

    if (!name || typeof name !== "string") {
      log(
        "Error: name is required and must be a string for dbSearchCustomersByName"
      );
      return {
        success: false,
        error: "Invalid Parameter",
        message: "name is required and must be a string",
        customers: [],
        count: 0,
        name: name || "",
        tenantID,
        storeID,
      };
    }

    // Clean and validate name (trim whitespace, convert to lowercase)
    const cleanName = name.trim().toLowerCase();

    if (cleanName.length === 0) {
      log(
        "Error: Name must contain at least one character for dbSearchCustomersByName"
      );
      return {
        success: false,
        error: "Invalid Parameter",
        message: "Name must contain at least one character",
        customers: [],
        count: 0,
        name: cleanName,
        tenantID,
        storeID,
      };
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
    return {
      success: false,
      error: "Database Error",
      message: error.message,
      customers: [],
      count: 0,
      name: name || "",
      tenantID: null,
      storeID: null,
    };
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
/**
 * Login user with email and password - handles only authentication
 * @param {string} email - User email
 * @param {string} password - User password
 * @param {Object} options - Optional parameters
 * @param {boolean} options.isAutoLogin - Whether this is an auto-login (for logging purposes)
 * @returns {Promise<Object>} Login result with authentication data only
 */
export async function dbLoginUser(email, password, options = {}) {
  const isAutoLogin = false;

  try {
    // Use the existing authSignIn function from db_calls.js
    const authResult = await authSignIn(email, password);

    if (!authResult.user) {
      throw new Error("Authentication failed - no user returned");
    }

    return {
      success: true,
      user: authResult.user,
      auth: authResult,
    };
  } catch (error) {
    const logPrefix = isAutoLogin ? "Auto-login" : "Login";
    log(`${logPrefix} failed:`, error);
    throw error;
  }
}

/**
 * Auto-login for development purposes - convenience wrapper around dbLoginUser
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<Object>} Login result with user data and settings
 */
export async function dbAutoLogin(email, password) {
  return dbLoginUser(email, password, { isAutoLogin: true });
}

/**
 * Sign out user from Firebase Auth
 * @param {Object} options - Optional parameters
 * @param {boolean} options.signOutFromAuth - Whether to sign out from Firebase Auth (default: true)
 * @returns {Promise<Object>} Sign out result
 */
export async function dbLogout(options = {}) {
  const signOutFromAuth = true;

  try {
    log("Starting sign out process");

    // Sign out from Firebase Auth if requested
    if (signOutFromAuth) {
      await authSignOut();
    }

    log("Sign out successful");

    return {
      success: true,
      message: "User signed out successfully",
    };
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
  // log(readerID);
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

export async function dbSendSMSEnhanced({
  message,
  phoneNumber,
  tenantID,
  storeID,
  customerID,
  messageID,
  fromNumber,
}) {
  try {
    if (!message || typeof message !== "string") {
      throw new Error("Message is required and must be a string");
    }

    if (!phoneNumber || typeof phoneNumber !== "string") {
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
      message: message.trim(),
      phoneNumber: phoneNumber,
      tenantID: tenantID,
      storeID: storeID,
    };

    // Add optional parameters if provided
    if (customerID) {
      smsData.customerID = customerID;
    }

    if (messageID) {
      smsData.messageID = messageID;
    }

    if (fromNumber) {
      smsData.fromNumber = fromNumber;
    }

    log("Sending enhanced SMS with data:", smsData);

    // Call the enhanced SMS function
    const result = await sendSMSEnhanced(smsData);

    if (result.success) {
      log("Enhanced SMS sent successfully:", result.data);
      return {
        success: true,
        message: result.message,
        data: result.data,
        timestamp: new Date().toISOString(),
      };
    } else {
      log("Enhanced SMS failed:", result.error);
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

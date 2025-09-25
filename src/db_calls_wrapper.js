// Smart database wrapper - handles path building, validation, and business logic
// This file contains all business logic and calls the "dumb" db.js functions

import { log } from "./utils";
import { DB_NODES } from "./constants";
import { useSettingsStore } from "./stores";
import {
  firestoreWrite,
  firestoreRead,
  firestoreQuery,
  firestoreSubscribe,
  firestoreSubscribeCollection,
  firestoreDelete,
  storageUploadString,
  authSignIn,
  authSignOut,
} from "./db_calls";

// ============================================================================
// STORE UTILITIES
// ============================================================================

/**
 * Get tenantID and storeID from settings store
 * @returns {Object} Object with tenantID and storeID
 */
function getTenantAndStore() {
  const settings = useSettingsStore.getState().settings;
  // log("settings", settings);
  const tenantID = settings?.tenantID;
  const storeID = settings?.storeID;
  // log("tenantID", tenantID);
  // log("storeID", storeID);
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
  // Firestore paths must have even number of segments (collection/document/collection/document...)
  // Format: tenants/{tenantID}/stores/{storeID}/settings/{settingsDoc}
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

// ============================================================================
// DATABASE WRAPPER FUNCTIONS
// ============================================================================

// setters /////////////////////////////////////////////////////////////////////

/**
 * Save settings object
 * @param {Object} settings - Settings object to save
 * @param {string} tenantID - Tenant ID (required)
 * @param {string} storeID - Store ID (required)
 * @param {Object} options - Optional parameters
 * @param {boolean} options.addMetadata - Whether to add metadata (default: true)
 * @param {string} options.updatedBy - Who is updating the settings (default: "system")
 * @returns {Promise<Object>} Save result
 */
export async function dbSaveSettings(settings) {
  try {
    // Get tenantID and storeID from settings store
    const { tenantID, storeID } = getTenantAndStore();

    // Validate required parameters - return error response instead of throwing
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

    await firestoreWrite(buildSettingsPath(tenantID, storeID), settings);

    log("Settings saved", { tenantID, storeID });

    return {
      success: true,
      settings,
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
 * @param {string} tenantID - Tenant ID (required)
 * @param {string} storeID - Store ID (required)
 * @param {Object} options - Optional parameters
 * @param {boolean} options.addMetadata - Whether to add metadata (default: true)
 * @param {string} options.updatedBy - Who is updating the workorder (default: "system")
 * @returns {Promise<Object>} Save result
 */
export async function dbSaveOpenWorkorder(workorder) {
  try {
    // Get tenantID and storeID from settings store
    const { tenantID, storeID } = getTenantAndStore();

    // Validate required parameters - return error response instead of throwing
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

    if (!workorder) {
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

    // Get workorder ID from workorder object or workorder['id']
    const id = workorder.id || workorder["id"];
    if (!id) {
      log(
        "Error: workorderID must be provided in workorder.id or workorder['id'] for dbSaveOpenWorkorder"
      );
      return {
        success: false,
        error: "Invalid Parameter",
        message:
          "workorderID must be provided in workorder.id or workorder['id']",
        workorder: null,
        workorderID: null,
        tenantID,
        storeID,
      };
    }

    // Build path: tenants/{tenantID}/stores/{storeID}/open-workorders/{workorderID}
    const path = buildWorkorderPath(tenantID, storeID, id);

    await firestoreWrite(path, workorder);

    log("Open workorder saved", {
      workorderID: id,
      tenantID,
      storeID,
      path,
    });

    return {
      success: true,
      workorder,
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
 * Complete a workorder by moving it from Realtime Database to Cloud Storage
 * @param {Object} workorder - Workorder object to complete
 * @param {string} tenantID - Tenant ID (required)
 * @param {string} storeID - Store ID (required)
 * @param {Object} options - Optional parameters
 * @param {boolean} options.addMetadata - Whether to add metadata (default: true)
 * @param {string} options.completedBy - Who completed the workorder (default: "system")
 * @returns {Promise<Object>} Completion result
 */
export async function dbCompleteWorkorder(workorder, tenantID, storeID) {
  try {
    // Validate required parameters
    if (!tenantID || !storeID) {
      throw new Error("tenantID and storeID are required parameters");
    }

    if (!workorder || !workorder.id) {
      throw new Error("workorder object with id is required");
    }

    // 1. Save to Cloud Storage as JSON
    const storagePath = `${DB_NODES.STORAGE.CLOSED_WORKORDERS}/${tenantID}/${storeID}/${workorder.id}.json`;
    const workorderJson = JSON.stringify(workorder, null, 2);

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
      workorder,
      workorderID: workorder.id,
      tenantID,
      storeID,
      storagePath,
      firestorePath,
    };
  } catch (error) {
    log("Error completing workorder:", error);
    throw error;
  }
}

/**
 * Save customer object to Firestore
 * @param {Object} customer - Customer object to save
 * @param {string} customerID - Customer ID (required)
 * @param {string} tenantID - Tenant ID (required)
 * @param {string} storeID - Store ID (required)
 * @param {Object} options - Optional parameters
 * @param {boolean} options.addMetadata - Whether to add metadata (default: true)
 * @param {string} options.updatedBy - Who is updating the customer (default: "system")
 * @returns {Promise<Object>} Save result
 */
export async function dbSaveCustomer(customer, customerID = null) {
  try {
    // Get tenantID and storeID from settings store
    const { tenantID, storeID } = getTenantAndStore();

    // Validate required parameters - return error response instead of throwing
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

    // Get customer ID from parameter, customer object, or customer['id']
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

    log("Customer saved", {
      customerID: id,
      tenantID,
      storeID,
    });

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
      customerID,
      tenantID: null,
      storeID: null,
    };
  }
}

/**
 * Save inventory item to Firestore
 * @param {Object} item - Inventory item object to save
 * @param {string} itemID - Item ID (required)
 * @param {string} tenantID - Tenant ID (required)
 * @param {string} storeID - Store ID (required)
 * @param {Object} options - Optional parameters
 * @param {boolean} options.addMetadata - Whether to add metadata (default: true)
 * @param {string} options.updatedBy - Who is updating the item (default: "system")
 * @returns {Promise<Object>} Save result
 */
export async function dbSaveInventoryItem(item, itemID = null) {
  try {
    // Get tenantID and storeID from settings store
    const { tenantID, storeID } = getTenantAndStore();

    // Validate required parameters - return error response instead of throwing
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

    // Get item ID from parameter, item object, or item['id']
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

    // Build path: tenants/{tenantID}/stores/{storeID}/inventory/{itemID}
    const path = buildInventoryPath(tenantID, storeID, id);

    await firestoreWrite(path, item);

    log("Inventory item saved", {
      itemID: id,
      tenantID,
      storeID,
      path,
    });

    return {
      success: true,
      item,
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
      itemID,
      tenantID: null,
      storeID: null,
    };
  }
}

/**
 * Save punch clock object to Firestore
 * @param {Object} punch - Punch clock object to save
 * @param {string} punchID - Punch ID (required)
 * @param {string} tenantID - Tenant ID (required)
 * @param {string} storeID - Store ID (required)
 * @param {Object} options - Optional parameters
 * @param {boolean} options.addMetadata - Whether to add metadata (default: true)
 * @param {string} options.updatedBy - Who is updating the punch (default: "system")
 * @returns {Promise<Object>} Save result
 */
export async function dbSavePunchObject(punch, punchID = null) {
  try {
    // Get tenantID and storeID from settings store
    const { tenantID, storeID } = getTenantAndStore();

    // Validate required parameters - return error response instead of throwing
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

    // Get punch ID from parameter, punch object, or punch['id']
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
      punchID,
      tenantID: null,
      storeID: null,
    };
  }
}

/**
 * Save current punch clock object to Firestore (overwrites entire punch_clock node)
 * @param {Object} punchClockData - Current punch clock object to save (required)
 * @param {string} tenantID - Tenant ID (required)
 * @param {string} storeID - Store ID (required)
 * @param {Object} options - Optional parameters
 * @param {boolean} options.addMetadata - Whether to add metadata (default: true)
 * @param {string} options.updatedBy - Who is updating the punch clock (default: "system")
 * @returns {Promise<Object>} Save result
 */
export async function dbSaveCurrentPunchClock(punchClockData) {
  try {
    // Get tenantID and storeID from settings store
    const { tenantID, storeID } = getTenantAndStore();

    // Validate required parameters - return error response instead of throwing
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

// getters ///////////////////////////////////////////////////////////////////////////

/**
 * Get settings object
 * @param {Object} options - Optional parameters
 * @param {boolean} options.includeMetadata - Whether to include metadata in response (default: true)
 * @returns {Promise<Object>} Settings object
 */
export async function dbGetSettings(tenantID, storeID) {
  try {
    // Validate required parameters - return error response instead of throwing
    if (!tenantID || !storeID) {
      log("Error: tenantID and storeID are not configured for dbGetSettings");
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

    const settings = await firestoreRead(buildSettingsPath(tenantID, storeID));

    if (!settings) {
      log("Error: Settings not found for dbGetSettings");
      return {
        success: false,
        error: "Not Found",
        message: "Settings not found",
        settings: null,
        tenantID,
        storeID,
      };
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
 * @param {string} tenantID - Tenant ID (required)
 * @param {string} storeID - Store ID (required)
 * @param {Object} options - Optional parameters
 * @param {boolean} options.includeMetadata - Whether to include metadata in response (default: true)
 * @returns {Promise<Object>} Customer object
 */
export async function dbGetCustomer(customerID) {
  try {
    // Get tenantID and storeID from settings store
    const { tenantID, storeID } = getTenantAndStore();

    // Validate required parameters
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

    return customer;
  } catch (error) {
    log("Error retrieving customer:", error);
    return null;
  }
}

/**
 * Get open workorders from Firestore
 * @param {string} tenantID - Tenant ID (required)
 * @param {string} storeID - Store ID (required)
 * @param {Object} options - Optional parameters
 * @param {boolean} options.includeMetadata - Whether to include metadata in response (default: true)
 * @returns {Promise<Object>} Open workorders data
 */
export async function dbGetOpenWorkorders() {
  try {
    // Get tenantID and storeID from settings store
    const { tenantID, storeID } = getTenantAndStore();

    // Validate required parameters
    if (!tenantID || !storeID) {
      log(
        "Error: tenantID and storeID are not configured for dbGetOpenWorkorders"
      );
      return null;
    }

    // Build collection path: tenants/{tenantID}/stores/{storeID}/open-workorders
    const collectionPath = `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/${DB_NODES.FIRESTORE.OPEN_WORKORDERS}`;

    const workorders = await firestoreQuery(collectionPath, []);
    return workorders;
  } catch (error) {
    log("Error retrieving open workorders:", error);
    return null;
  }
}

/**
 * Get all inventory items from Firestore
 * @param {string} tenantID - Tenant ID (required)
 * @param {string} storeID - Store ID (required)
 * @param {Object} options - Optional parameters
 * @param {boolean} options.includeMetadata - Whether to include metadata in response (default: true)
 * @returns {Promise<Object>} Inventory items data
 */
export async function dbGetInventoryItems() {
  try {
    // Get tenantID and storeID from settings store
    const { tenantID, storeID } = getTenantAndStore();

    // Validate required parameters
    if (!tenantID || !storeID) {
      log(
        "Error: tenantID and storeID are not configured for dbGetInventoryItems"
      );
      return null;
    }

    // Build collection path: tenants/{tenantID}/stores/{storeID}/inventory
    const collectionPath = `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/${DB_NODES.FIRESTORE.INVENTORY}`;

    const items = await firestoreQuery(collectionPath, []);
    return items;
  } catch (error) {
    log("Error retrieving inventory items:", error);
    return null;
  }
}

/**
 * Get tenant info from email_users collection by id field
 * @param {string} id - Tenant ID to search for
 * @param {Object} options - Optional parameters
 * @returns {Promise<Object>} Tenant info data
 */
export async function dbGetTenantById(id) {
  try {
    // Validate required parameters
    if (!id) {
      throw new Error("id is required parameter");
    }

    // Build collection path: email_users
    const collectionPath = DB_NODES.FIRESTORE.EMAIL_USERS;

    // Query by id field
    const whereClauses = [{ field: "id", operator: "==", value: id }];

    const results = await firestoreQuery(collectionPath, whereClauses);

    // Should return exactly one result
    const tenant = results && results.length > 0 ? results[0] : null;

    // log("Tenant retrieved by id", {
    //   id,
    //   path: collectionPath,
    //   found: !!tenant
    // });

    return tenant;
  } catch (error) {
    log("Error retrieving tenant by id:", error);
    throw error;
  }
}

// filters /////////////////////////////////////////////////////////////////////////////

/**
 * Get punch objects by time frame with optional userID filtering
 * @param {string} tenantID - Tenant ID (required)
 * @param {string} storeID - Store ID (required)
 * @param {number} startTimeMillis - Start time in milliseconds (required)
 * @param {number} endTimeMillis - End time in milliseconds (required)
 * @param {Object} options - Optional parameters
 * @param {string} options.userID - User ID to filter by (optional)
 * @param {string} options.timestampField - Field name for timestamp (default: "timestamp")
 * @returns {Promise<Array>} Array of punch objects
 */
export async function dbGetPunchesByTimeFrame(
  tenantID,
  storeID,
  startTimeMillis,
  endTimeMillis
) {
  const userID = null;
  const timestampField = "timestamp";

  try {
    // Validate required parameters
    if (!tenantID || !storeID) {
      throw new Error("tenantID and storeID are required parameters");
    }

    if (!startTimeMillis || !endTimeMillis) {
      throw new Error(
        "startTimeMillis and endTimeMillis are required parameters"
      );
    }

    if (startTimeMillis >= endTimeMillis) {
      throw new Error("startTimeMillis must be less than endTimeMillis");
    }

    // Build collection path: tenants/{tenantID}/stores/{storeID}/punches
    const collectionPath = `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/${DB_NODES.FIRESTORE.PUNCHES}`;

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
    throw error;
  }
}

/**
 * Search customers by phone number in Firestore (supports partial matching for real-time search)
 * Searches in "cell" and "landline" phone number fields
 * @param {string} phoneNumber - Phone number (up to 10 digits, supports partial matches)
 * @param {Object} options - Optional parameters
 * @returns {Promise<Object>} Object with success status and array of matching customers
 */
export async function dbSearchCustomersByPhone(phoneNumber) {
  try {
    // Get tenantID and storeID from settings store
    const { tenantID, storeID } = getTenantAndStore();

    // Validate required parameters - return error response instead of throwing
    if (!tenantID || !storeID) {
      log(
        "Error: tenantID and storeID are not configured for dbSearchCustomersByPhone"
      );
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
      throw new Error("phoneNumber is required and must be a string");
    }

    // Clean and validate phone number (remove non-digits, limit to 10 digits)
    const cleanPhone = phoneNumber.replace(/\D/g, "").substring(0, 10);

    if (cleanPhone.length === 0) {
      throw new Error("Phone number must contain at least one digit");
    }

    // Build collection path for customers
    const collectionPath = `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/${DB_NODES.FIRESTORE.CUSTOMERS}`;

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

    // log("Customer search completed", {
    //   phoneNumber: cleanPhone,
    //   tenantID,
    //   storeID,
    //   resultsCount: allResults.length,
    // });

    return  allResults
  } catch (error) {
    log("Error searching customers by phone:", error);
    throw error;
  }
}

/**
 * Search customers by email in Firestore (supports partial matching for real-time search)
 * @param {string} email - Email address (supports partial matches)
 * @param {string} tenantID - Tenant ID (required)
 * @param {string} storeID - Store ID (required)
 * @param {Object} options - Optional parameters
 * @returns {Promise<Object>} Object with success status and array of matching customers
 */
export async function dbSearchCustomersByEmail(email) {
  try {
    // Get tenantID and storeID from settings store
    const { tenantID, storeID } = getTenantAndStore();

    // Validate required parameters - return error response instead of throwing
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
    const collectionPath = `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/${DB_NODES.FIRESTORE.CUSTOMERS}`;

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

return filteredResults
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
 * @param {string} tenantID - Tenant ID (required)
 * @param {string} storeID - Store ID (required)
 * @param {Object} options - Optional parameters
 * @returns {Promise<Object>} Object with success status and array of matching customers
 */
export async function dbSearchCustomersByName(name) {
  try {
    // Get tenantID and storeID from settings store
    const { tenantID, storeID } = getTenantAndStore();

    // Validate required parameters - return error response instead of throwing
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
    const collectionPath = `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/${DB_NODES.FIRESTORE.CUSTOMERS}`;

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

    return allResults

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
 * @param {string} tenantID - Tenant ID (required)
 * @param {string} storeID - Store ID (required)
 * @param {Function} onSnapshot - Callback function called when workorders change
 * @returns {Function} Unsubscribe function to stop listening
 */
export function dbListenToOpenWorkorders(onSnapshot) {
  try {
    // Get tenantID and storeID from settings store
    const { tenantID, storeID } = getTenantAndStore();

    // Validate required parameters - return error response instead of throwing
    if (!tenantID || !storeID) {
      log("Error: tenantID and storeID are not configured");
      return null;
    }

    if (!onSnapshot || typeof onSnapshot !== "function") {
      log("Error: onSnapshot callback function is required");
      return null;
    }

    // Build collection path: tenants/{tenantID}/stores/{storeID}/open-workorders
    const collectionPath = `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/${DB_NODES.FIRESTORE.OPEN_WORKORDERS}`;

    // log("Starting workorder listener", { tenantID, storeID, path: collectionPath });

    // Subscribe to collection changes
    const unsubscribe = firestoreSubscribeCollection(
      collectionPath,
      (workordersData, error) => {
        if (error) {
          log("Workorder listener error", { tenantID, storeID, error });
          return;
        }

        // log("Workorders changed", { tenantID, storeID, count: workordersData ? workordersData.length : 0 });
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
 * @param {string} tenantID - Tenant ID (required)
 * @param {string} storeID - Store ID (required)
 * @param {Function} onChange - Callback function called when settings change
 * @returns {Function} Unsubscribe function to stop listening
 */
export function dbListenToSettings(onChange) {
  try {
    // Get tenantID and storeID from settings store
    const { tenantID, storeID } = getTenantAndStore();

    // Validate required parameters - return error response instead of throwing
    if (!tenantID || !storeID) {
      log("Error: tenantID and storeID are not configured");
      return null;
    }

    if (!onChange || typeof onChange !== "function") {
      log("Error: onChange callback function is required");
      return null;
    }

    // Build path: tenants/{tenantID}/stores/{storeID}/settings/settings
    const path = buildSettingsPath(tenantID, storeID);

    // log("Starting settings listener", { tenantID, storeID, path });

    // Subscribe to document changes
    const unsubscribe = firestoreSubscribe(path, (settingsData, error) => {
      if (error) {
        log("Settings listener error", { tenantID, storeID, error });
        return; // Don't call onChange on error
      }

      // log("Settings changed", { tenantID, storeID });
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
 * @param {string} tenantID - Tenant ID (required)
 * @param {string} storeID - Store ID (required)
 * @param {Function} onChange - Callback function called when punch clock changes
 * @returns {Function} Unsubscribe function to stop listening
 */
export function dbListenToCurrentPunchClock(onChange) {
  try {
    // Get tenantID and storeID from settings store
    const { tenantID, storeID } = getTenantAndStore();

    // Validate required parameters - return error response instead of throwing
    if (!tenantID || !storeID) {
      log("Error: tenantID and storeID are not configured");
      return null;
    }

    if (!onChange || typeof onChange !== "function") {
      log("Error: onChange callback function is required");
      return null;
    }

    // Build path: tenants/{tenantID}/stores/{storeID}/punch_clock/current
    const path = buildCurrentPunchClockPath(tenantID, storeID);

    // log("Starting current punch clock listener", { tenantID, storeID, path });

    // Subscribe to document changes
    const unsubscribe = firestoreSubscribe(path, (punchClockData, error) => {
      if (error) {
        log("Current punch clock listener error", { tenantID, storeID, error });
        return; // Don't call onChange on error
      }
      if (!punchClockData) punchClockData = {};
      // log("Current punch clock changed", { tenantID, storeID });
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
 * @param {string} tenantID - Tenant ID (required)
 * @param {string} storeID - Store ID (required)
 * @param {Function} onSnapshot - Callback function called when inventory changes
 * @returns {Function} Unsubscribe function to stop listening
 */
export function dbListenToInventory(onSnapshot) {
  try {
    // Get tenantID and storeID from settings store
    const { tenantID, storeID } = getTenantAndStore();

    // Validate required parameters - return error response instead of throwing
    if (!tenantID || !storeID) {
      log("Error: tenantID and storeID are not configured");
      return null;
    }

    if (!onSnapshot || typeof onSnapshot !== "function") {
      log("Error: onSnapshot callback function is required");
      return null;
    }

    // Build collection path: tenants/{tenantID}/stores/{storeID}/inventory
    const collectionPath = `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/${DB_NODES.FIRESTORE.INVENTORY}`;

    // log("Starting inventory listener", { tenantID, storeID, path: collectionPath });

    // Subscribe to collection changes
    const unsubscribe = firestoreSubscribeCollection(
      collectionPath,
      (inventoryData, error) => {
        if (error) {
          log("Inventory listener error", { tenantID, storeID, error });
          return;
        }

        // log("Inventory changed", { tenantID, storeID, count: inventoryData ? inventoryData.length : 0 });
        onSnapshot(inventoryData);
      }
    );

    return unsubscribe;
  } catch (error) {
    log("Error setting up inventory listener:", error);
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
export async function dbLoginUser(email, password) {
  const isAutoLogin = false;

  try {
    // log(`Starting ${isAutoLogin ? "auto-login" : "login"} process`, { email });

    // Use the existing authSignIn function from db_calls.js
    const authResult = await authSignIn(email, password);

    if (!authResult.user) {
      throw new Error("Authentication failed - no user returned");
    }

    // log(`${isAutoLogin ? "auto-login" : "login"} successful`, {
    //   userID: authResult.user.uid,
    //   email: authResult.user.email,
    // });

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
export async function dbLogout() {
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
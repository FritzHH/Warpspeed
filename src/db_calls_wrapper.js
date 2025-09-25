// Smart database wrapper - handles path building, validation, and business logic
// This file contains all business logic and calls the "dumb" db.js functions

import { log } from "./utils";
import { DB_NODES } from "./constants";
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
  getServerTimestamp,
} from "./db_calls";

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

/**
 * Convert faceDescriptor from Firestore map back to Float32Array
 * @param {Object} customer - Customer object
 * @returns {Object} Customer object with converted faceDescriptor
 */
function convertCustomerFaceDescriptor(customer) {
  if (customer && customer.faceDescriptor && typeof customer.faceDescriptor === 'object') {
    const keys = Object.keys(customer.faceDescriptor);
    if (keys.length > 0 && keys.every(key => !isNaN(Number(key)))) {
      // It's a map (converted from typed array), convert back to Float32Array
      const maxIndex = Math.max(...keys.map(Number));
      const descriptorArray = Array.from({ length: maxIndex + 1 }, (_, i) => customer.faceDescriptor[i]);
      customer.faceDescriptor = new Float32Array(descriptorArray);
    }
  }
  return customer;
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
export async function dbSaveSettings(settings, tenantID, storeID, options = {}) {
  const { addMetadata = true, updatedBy = "system" } = options;
  
  try {
    // Validate required parameters
    if (!tenantID || !storeID) {
      throw new Error("tenantID and storeID are required parameters");
    }
    
    let settingsToSave = settings;
    await firestoreWrite(buildSettingsPath(tenantID, storeID), settingsToSave);
    
    log("Settings saved", { updatedBy, tenantID, storeID });

    return {
      success: true,
      settings: settingsToSave,
    };

  } catch (error) {
    log("Error saving settings:", error);
    throw error;
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
export async function dbSaveOpenWorkorder(workorder, tenantID, storeID, options = {}) {
  const { addMetadata = true, updatedBy = "system", workorderID } = options;

  try {
    // Validate required parameters
    if (!tenantID || !storeID) {
      throw new Error("tenantID and storeID are required parameters");
    }

    if (!workorder) {
      throw new Error("workorder object is required");
    }

    // Get workorder ID from options or workorder object
    const id = workorderID || workorder.id;
    if (!id) {
      throw new Error("workorderID must be provided either in options or workorder.id");
    }

    let workorderToSave = workorder;

    // Add metadata if requested
    if (addMetadata) {
      workorderToSave = {
        ...workorder,
        updatedAt: getServerTimestamp(),
        updatedBy,
      };
    }

    // Build path: tenants/{tenantID}/stores/{storeID}/open-workorders/{workorderID}
    const path = buildWorkorderPath(tenantID, storeID, id);

    await firestoreWrite(path, workorderToSave);

    log("Open workorder saved", {
      workorderID: id,
      updatedBy,
      tenantID,
      storeID,
      path
    });

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
    throw error;
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
export async function dbCompleteWorkorder(workorder, tenantID, storeID, options = {}) {
  const { addMetadata = true, completedBy = "system" } = options;

  try {
    // Validate required parameters
  if (!tenantID || !storeID) {
      throw new Error("tenantID and storeID are required parameters");
    }

    if (!workorder || !workorder.id) {
      throw new Error("workorder object with id is required");
    }

    let workorderToComplete = workorder;

    // Add completion metadata if requested
    if (addMetadata) {
      workorderToComplete = {
        ...workorder,
        completedAt: getServerTimestamp(),
        completedBy,
        status: "completed"
      };
    }

    // 1. Save to Cloud Storage as JSON
    const storagePath = `${DB_NODES.STORAGE.CLOSED_WORKORDERS}/${tenantID}/${storeID}/${workorder.id}.json`;
    const workorderJson = JSON.stringify(workorderToComplete, null, 2);
    
    await storageUploadString(storagePath, workorderJson, "application/json");

    // 2. Remove from Firestore open workorders
    const firestorePath = buildWorkorderPath(tenantID, storeID, workorder.id);
    await firestoreDelete(firestorePath);

    log("Workorder completed", {
      workorderID: workorder.id,
      completedBy,
      tenantID,
      storeID,
      storagePath,
      firestorePath
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
export async function dbSaveCustomer(customer, customerID, tenantID, storeID, options = {}) {
  const { addMetadata = true, updatedBy = "system" } = options;

  try {
    // Validate required parameters
    if (!tenantID || !storeID || !customerID) {
      throw new Error("tenantID, storeID, and customerID are required parameters");
    }

    if (!customer || typeof customer !== 'object') {
      throw new Error("customer object is required");
    }

    // Convert typed arrays to regular arrays for Firestore compatibility
    let customerToSave = { ...customer };
    
    // Handle faceDescriptor typed array
    if (customerToSave.faceDescriptor && customerToSave.faceDescriptor.constructor.name.includes('Array') && customerToSave.faceDescriptor.constructor !== Array) {
      customerToSave.faceDescriptor = Array.from(customerToSave.faceDescriptor);
    }

    // Add metadata if requested
    if (addMetadata) {
      customerToSave = {
        ...customerToSave,
        updatedAt: getServerTimestamp(),
        updatedBy,
      };
    }

    await firestoreWrite(buildCustomerPath(tenantID, storeID, customerID), customerToSave);

    log("Customer saved", { 
      customerID, 
      updatedBy, 
      tenantID, 
      storeID 
    });

    return {
      success: true,
      customer: customerToSave,
      customerID,
      tenantID,
      storeID,
    };

  } catch (error) {
    log("Error saving customer:", error);
    throw error;
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
export async function dbSaveInventoryItem(item, itemID, tenantID, storeID, options = {}) {
  const { addMetadata = true, updatedBy = "system" } = options;

  try {
    // Validate required parameters
    if (!tenantID || !storeID || !itemID) {
      throw new Error("tenantID, storeID, and itemID are required parameters");
    }

    if (!item || typeof item !== 'object') {
      throw new Error("item object is required");
    }

    let itemToSave = item;

    // Add metadata if requested
    if (addMetadata) {
      itemToSave = {
        ...item,
      updatedAt: getServerTimestamp(),
        updatedBy,
      };
    }

    // Build path: tenants/{tenantID}/stores/{storeID}/inventory/{itemID}
    const path = buildInventoryPath(tenantID, storeID, itemID);

    await firestoreWrite(path, itemToSave);

    log("Inventory item saved", { 
      itemID, 
      updatedBy, 
      tenantID, 
      storeID,
      path
    });

    return {
      success: true,
      item: itemToSave,
      itemID,
      tenantID,
      storeID,
      path,
    };

  } catch (error) {
    log("Error saving inventory item:", error);
    throw error;
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
export async function dbSavePunchObject(punch, punchID, tenantID, storeID, options = {}) {

  try {
    // Validate required parameters
    if (!tenantID || !storeID || !punchID) {
      throw new Error("tenantID, storeID, and punchID are required parameters");
    }

    if (!punch || typeof punch !== 'object') {
      throw new Error("punch object is required");
    }

    let punchToSave = punch;

    const path = buildPunchPath(tenantID, storeID, punchID);

    await firestoreWrite(path, punchToSave);

    // log('success saving punch clock')
    return {
      success: true,
      punch: punchToSave,
      punchID,
      tenantID,
      storeID,
      path,
    };

  } catch (error) {
    log("Error saving punch clock:", error);
    throw error;
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
export async function dbSaveCurrentPunchClock(punchClockData, tenantID, storeID, options = {}) {

  try {
    // Validate required parameters
    if (!tenantID || !storeID) {
      throw new Error("tenantID and storeID are required parameters");
    }

    if (!punchClockData || typeof punchClockData !== 'object') {
      throw new Error("punchClockData object is required");
    }

    let punchClockToSave = punchClockData;

    // Build path: tenants/{tenantID}/stores/{storeID}/punch_clock/current
    const path = buildCurrentPunchClockPath(tenantID, storeID);

    await firestoreWrite(path, punchClockToSave);
    log('success saving current punch clock')
    return {
      success: true,
      punchClock: punchClockToSave,
      tenantID,
      storeID,
      path,
    };

  } catch (error) {
    log("Error saving current punch clock:", error);
    throw error;
  }
}


// getters ///////////////////////////////////////////////////////////////////////////

/**
 * Get settings object
 * @param {string} tenantID - Tenant ID (required)
 * @param {string} storeID - Store ID (required)
 * @param {Object} options - Optional parameters
 * @param {boolean} options.includeMetadata - Whether to include metadata in response (default: true)
 * @returns {Promise<Object>} Settings object
 */
export async function dbGetSettings(tenantID, storeID, options = {}) {
  
  try {
    // Validate required parameters
    if (!tenantID || !storeID) {
      throw new Error("tenantID and storeID are required parameters");
    }

    const settings = await firestoreRead(buildSettingsPath(tenantID, storeID));
    
    if (!settings) {
      throw new Error("Settings not found");
    }
    
    return settings;

  } catch (error) {
    log("Error retrieving settings:", error);
    throw error;
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
export async function dbGetCustomer(customerID, tenantID, storeID, options = {}) {
  
  try {
    // Validate required parameters
    if (!tenantID || !storeID || !customerID) {
      throw new Error("tenantID, storeID, and customerID are required parameters");
    }

    const customer = await firestoreRead(buildCustomerPath(tenantID, storeID, customerID));
    
    if (!customer) {
      throw new Error("Customer not found");
    }

    // Convert faceDescriptor back to Float32Array if it was stored as a map
    convertCustomerFaceDescriptor(customer);
    
    return customer;

  } catch (error) {
    log("Error retrieving customer:", error);
    throw error;
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
export async function dbGetOpenWorkorders(tenantID, storeID, options = {}) {
  
  try {
    // Validate required parameters
  if (!tenantID || !storeID) {
      throw new Error("tenantID and storeID are required parameters");
    }

    // Build collection path: tenants/{tenantID}/stores/{storeID}/open-workorders
    const collectionPath = `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/${DB_NODES.FIRESTORE.OPEN_WORKORDERS}`;
    
    const workorders = await firestoreQuery(collectionPath, [], options);
    
    return workorders || []

  } catch (error) {
    log("Error retrieving open workorders:", error);
    throw error;
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
export async function dbGetInventoryItems(tenantID, storeID, options = {}) {
  
  try {
    // Validate required parameters
    if (!tenantID || !storeID) {
      throw new Error("tenantID and storeID are required parameters");
    }

    // Build collection path: tenants/{tenantID}/stores/{storeID}/inventory
    const collectionPath = `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/${DB_NODES.FIRESTORE.INVENTORY}`;
    
    const items = await firestoreQuery(collectionPath, [], options);
    
    return items || []

  } catch (error) {
    log("Error retrieving inventory items:", error);
    throw error;
  }
}

/**
 * Get tenant info from email_users collection by id field
 * @param {string} id - Tenant ID to search for
 * @param {Object} options - Optional parameters
 * @returns {Promise<Object>} Tenant info data
 */
export async function dbGetTenantById(id, options = {}) {
  
  try {
    // Validate required parameters
    if (!id) {
      throw new Error("id is required parameter");
    }

    // Build collection path: email_users
    const collectionPath = DB_NODES.FIRESTORE.EMAIL_USERS;
    
    // Query by id field
    const whereClauses = [
      { field: 'id', operator: '==', value: id }
    ];
    
    const results = await firestoreQuery(collectionPath, whereClauses, options);
    
    // Should return exactly one result
    const tenant = results && results.length > 0 ? results[0] : null;
    
    // log("Tenant retrieved by id", { 
    //   id,
    //   path: collectionPath,
    //   found: !!tenant
    // });

    return tenant

  } catch (error) {
    log("Error retrieving tenant by id:", error);
    throw error;
  }
}

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
export async function dbGetPunchesByTimeFrame(tenantID, storeID, startTimeMillis, endTimeMillis, options = {}) {
  const { userID, timestampField = "timestamp" } = options;
  
  try {
    // Validate required parameters
    if (!tenantID || !storeID) {
      throw new Error("tenantID and storeID are required parameters");
    }

    if (!startTimeMillis || !endTimeMillis) {
      throw new Error("startTimeMillis and endTimeMillis are required parameters");
    }

    if (startTimeMillis >= endTimeMillis) {
      throw new Error("startTimeMillis must be less than endTimeMillis");
    }

    // Build collection path: tenants/{tenantID}/stores/{storeID}/punches
    const collectionPath = `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/${DB_NODES.FIRESTORE.PUNCHES}`;

    // Build where clauses for time range
    const whereClauses = [
      { field: timestampField, operator: '>=', value: startTimeMillis },
      { field: timestampField, operator: '<=', value: endTimeMillis }
    ];

    // Add userID filter if provided
    if (userID) {
      whereClauses.push({ field: 'userID', operator: '==', value: userID });
    }

    // Query with time range and optional userID filter
    const punches = await firestoreQuery(collectionPath, whereClauses, {
      orderBy: { field: timestampField, direction: 'asc' }
    });

    return punches || [];

  } catch (error) {
    log("Error retrieving punches by time frame:", error);
    throw error;
  }
}

// filters /////////////////////////////////////////////////////////////////////////////

/**
 * Search customers by phone number in Firestore (supports partial matching for real-time search)
 * Searches in "cell" and "landline" phone number fields
 * @param {string} phoneNumber - Phone number (up to 10 digits, supports partial matches)
 * @param {string} tenantID - Tenant ID (required)
 * @param {string} storeID - Store ID (required)
 * @param {Object} options - Optional parameters
 * @returns {Promise<Object>} Object with success status and array of matching customers
 */
export async function dbSearchCustomersByPhone(phoneNumber, tenantID, storeID, options = {}) {
  try {
    // Validate required parameters
    if (!tenantID || !storeID) {
      throw new Error("tenantID and storeID are required parameters");
    }

    if (!phoneNumber || typeof phoneNumber !== 'string') {
      throw new Error("phoneNumber is required and must be a string");
    }

    // Clean and validate phone number (remove non-digits, limit to 10 digits)
    const cleanPhone = phoneNumber.replace(/\D/g, '').substring(0, 10);
    
    if (cleanPhone.length === 0) {
      throw new Error("Phone number must contain at least one digit");
    }

    // Build collection path for customers
    const collectionPath = `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/${DB_NODES.FIRESTORE.CUSTOMERS}`;

    // Create queries for phone number search (partial match for real-time typing)
    // Each field gets a range query to find partial matches
    const fieldQueries = [
      { field: 'cell' },
      { field: 'landline' }
    ];

    // Execute multiple queries and combine results
    const allResults = [];
    const seenIds = new Set();

    for (const fieldQuery of fieldQueries) {
      try {
        // Use range query to find partial matches (starts-with behavior)
        const whereClauses = [
          { field: fieldQuery.field, operator: '>=', value: cleanPhone },
          { field: fieldQuery.field, operator: '<=', value: cleanPhone + '\uf8ff' }
        ];
        
        const results = await firestoreQuery(collectionPath, whereClauses, options);
        
        // Filter results to ensure they actually start with the phone number
        // (Firestore range queries can return results that don't start with the value)
        const filteredResults = results.filter(customer => {
          const phoneValue = customer[fieldQuery.field];
          return phoneValue && phoneValue.toString().startsWith(cleanPhone);
        });
        
        // Add unique results to the combined array
        for (const customer of filteredResults) {
          if (!seenIds.has(customer.id)) {
            // Convert faceDescriptor back to Float32Array if needed
            convertCustomerFaceDescriptor(customer);
            allResults.push(customer);
            seenIds.add(customer.id);
          }
        }
      } catch (queryError) {
        // Continue with other queries if one fails (e.g., field doesn't exist)
        log(`Query failed for field ${fieldQuery.field}:`, queryError);
      }
    }

    log("Customer search completed", {
      phoneNumber: cleanPhone,
      tenantID,
      storeID,
      resultsCount: allResults.length
    });

    return {
      success: true,
      customers: allResults,
      phoneNumber: cleanPhone,
      tenantID,
      storeID,
      count: allResults.length
    };

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
export async function dbSearchCustomersByEmail(email, tenantID, storeID, options = {}) {
  try {
    // Validate required parameters
    if (!tenantID || !storeID) {
      throw new Error("tenantID and storeID are required parameters");
    }

    if (!email || typeof email !== 'string') {
      throw new Error("email is required and must be a string");
    }

    // Clean and validate email (trim whitespace, convert to lowercase)
    const cleanEmail = email.trim().toLowerCase();
    
    if (cleanEmail.length === 0) {
      throw new Error("Email must contain at least one character");
    }

    // Build collection path for customers
    const collectionPath = `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/${DB_NODES.FIRESTORE.CUSTOMERS}`;

    // Create query for email search (partial match for real-time typing)
    const whereClauses = [
      { field: 'email', operator: '>=', value: cleanEmail },
      { field: 'email', operator: '<=', value: cleanEmail + '\uf8ff' }
    ];
    
    const results = await firestoreQuery(collectionPath, whereClauses, options);
    
    // Filter results to ensure they actually start with the email
    // (Firestore range queries can return results that don't start with the value)
    const filteredResults = results.filter(customer => {
      const emailValue = customer.email;
      return emailValue && emailValue.toString().toLowerCase().startsWith(cleanEmail);
    });

    // Convert faceDescriptor back to Float32Array for each result
    filteredResults.forEach(convertCustomerFaceDescriptor);

    log("Customer email search completed", {
      email: cleanEmail,
      tenantID,
      storeID,
      resultsCount: filteredResults.length
    });

    return {
      success: true,
      customers: filteredResults,
      email: cleanEmail,
      tenantID,
      storeID,
      count: filteredResults.length
    };

  } catch (error) {
    log("Error searching customers by email:", error);
    throw error;
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
export async function dbSearchCustomersByName(name, tenantID, storeID, options = {}) {
  try {
    // Validate required parameters
    if (!tenantID || !storeID) {
      throw new Error("tenantID and storeID are required parameters");
    }

    if (!name || typeof name !== 'string') {
      throw new Error("name is required and must be a string");
    }

    // Clean and validate name (trim whitespace, convert to lowercase)
    const cleanName = name.trim().toLowerCase();
    
    if (cleanName.length === 0) {
      throw new Error("Name must contain at least one character");
    }

    // Build collection path for customers
    const collectionPath = `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/${DB_NODES.FIRESTORE.CUSTOMERS}`;

    // Create queries for name search (partial match for real-time typing)
    // Each field gets a range query to find partial matches
    const fieldQueries = [
      { field: 'first' },
      { field: 'last' }
    ];

    // Execute multiple queries and combine results
    const allResults = [];
    const seenIds = new Set();

    for (const fieldQuery of fieldQueries) {
      try {
        // Use range query to find partial matches (starts-with behavior)
        const whereClauses = [
          { field: fieldQuery.field, operator: '>=', value: cleanName },
          { field: fieldQuery.field, operator: '<=', value: cleanName + '\uf8ff' }
        ];
        
        const results = await firestoreQuery(collectionPath, whereClauses, options);
        
        // Filter results to ensure they actually start with the name
        // (Firestore range queries can return results that don't start with the value)
        const filteredResults = results.filter(customer => {
          const nameValue = customer[fieldQuery.field];
          return nameValue && nameValue.toString().toLowerCase().startsWith(cleanName);
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

    log("Customer name search completed", {
      name: cleanName,
      tenantID,
      storeID,
      resultsCount: allResults.length
    });

    return {
      success: true,
      customers: allResults,
      name: cleanName,
      tenantID,
      storeID,
      count: allResults.length
    };

  } catch (error) {
    log("Error searching customers by name:", error);
    throw error;
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
export function dbListenToOpenWorkorders(tenantID, storeID, onSnapshot) {
  try {
    // Validate required parameters
    if (!tenantID || !storeID) {
      throw new Error("tenantID and storeID are required parameters");
    }

    if (!onSnapshot || typeof onSnapshot !== 'function') {
      throw new Error("onSnapshot callback function is required");
    }

    // Build collection path: tenants/{tenantID}/stores/{storeID}/open-workorders
    const collectionPath = `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/${DB_NODES.FIRESTORE.OPEN_WORKORDERS}`;

    // log("Starting workorder listener", { tenantID, storeID, path: collectionPath });

    // Subscribe to collection changes
    const unsubscribe = firestoreSubscribeCollection(collectionPath, (workordersData, error) => {
      if (error) {
        log("Workorder listener error", { tenantID, storeID, error });
        return;
      }
      
      // log("Workorders changed", { tenantID, storeID, count: workordersData ? workordersData.length : 0 });
      onSnapshot(workordersData);
    });

    return unsubscribe;

  } catch (error) {
    log("Error setting up workorder listener:", error);
    throw error;
  }
}

/**
 * Listen to changes in settings document for a tenant/store
 * @param {string} tenantID - Tenant ID (required)
 * @param {string} storeID - Store ID (required)
 * @param {Function} onChange - Callback function called when settings change
 * @returns {Function} Unsubscribe function to stop listening
 */
export function dbListenToSettings(tenantID, storeID, onChange) {
  try {
    // Validate required parameters
    if (!tenantID || !storeID) {
      throw new Error("tenantID and storeID are required parameters");
    }

    if (!onChange || typeof onChange !== 'function') {
      throw new Error("onChange callback function is required");
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
      
      log("Settings changed", { tenantID, storeID });
      onChange(settingsData, tenantID, storeID);
    });

    return unsubscribe;

  } catch (error) {
    log("Error setting up settings listener:", error);
    throw error;
  }
}

/**
 * Listen to changes in current punch clock document for a tenant/store
 * @param {string} tenantID - Tenant ID (required)
 * @param {string} storeID - Store ID (required)
 * @param {Function} onChange - Callback function called when punch clock changes
 * @returns {Function} Unsubscribe function to stop listening
 */
export function dbListenToCurrentPunchClock(tenantID, storeID, onChange) {
  try {
    // Validate required parameters
    if (!tenantID || !storeID) {
      throw new Error("tenantID and storeID are required parameters");
    }

    if (!onChange || typeof onChange !== 'function') {
      throw new Error("onChange callback function is required");
    }

    // Build path: tenants/{tenantID}/stores/{storeID}/punch_clock/current
    const path = buildCurrentPunchClockPath(tenantID, storeID);
    
    log("Starting current punch clock listener", { tenantID, storeID, path });

    // Subscribe to document changes
    const unsubscribe = firestoreSubscribe(path, (punchClockData, error) => {
      if (error) {
        log("Current punch clock listener error", { tenantID, storeID, error });
        return; // Don't call onChange on error
      }
      if (!punchClockData) punchClockData = {}
      // log("Current punch clock changed", { tenantID, storeID });
      onChange(punchClockData);
    });

    return unsubscribe;

  } catch (error) {
    log("Error setting up current punch clock listener:", error);
    throw error;
  }
}

/**
 * Listen to changes in inventory collection for a tenant/store
 * @param {string} tenantID - Tenant ID (required)
 * @param {string} storeID - Store ID (required)
 * @param {Function} onSnapshot - Callback function called when inventory changes
 * @returns {Function} Unsubscribe function to stop listening
 */
export function dbListenToInventory(tenantID, storeID, onSnapshot) {
  try {
    // Validate required parameters
    if (!tenantID || !storeID) {
      throw new Error("tenantID and storeID are required parameters");
    }

    if (!onSnapshot || typeof onSnapshot !== 'function') {
      throw new Error("onSnapshot callback function is required");
    }

    // Build collection path: tenants/{tenantID}/stores/{storeID}/inventory
    const collectionPath = `${DB_NODES.FIRESTORE.TENANTS}/${tenantID}/${DB_NODES.FIRESTORE.STORES}/${storeID}/${DB_NODES.FIRESTORE.INVENTORY}`;

    // log("Starting inventory listener", { tenantID, storeID, path: collectionPath });

    // Subscribe to collection changes
    const unsubscribe = firestoreSubscribeCollection(collectionPath, (inventoryData, error) => {
      if (error) {
        log("Inventory listener error", { tenantID, storeID, error });
        return;
      }
      
      // log("Inventory changed", { tenantID, storeID, count: inventoryData ? inventoryData.length : 0 });
      onSnapshot(inventoryData);
    });

    return unsubscribe;

  } catch (error) {
    log("Error setting up inventory listener:", error);
    throw error;
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
  const { isAutoLogin = false } = options;
  
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
export async function dbLogout(options = {}) {
  const { signOutFromAuth = true } = options;
  
  try {
    log("Starting sign out process");

    // Sign out from Firebase Auth if requested
    if (signOutFromAuth) {
      await authSignOut();
    }

    log("Sign out successful");

    return {
      success: true,
      message: "User signed out successfully"
    };

  } catch (error) {
    log("Sign out failed:", error);
    throw error;
  }
}
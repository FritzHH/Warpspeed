/*eslint-disable*/
import {
  build_db_path,
  FIRESTORE_COLLECTION_NAMES,
  // FIRESTORE_DATABASE_NODE_NAMES,
  MILLIS_IN_MINUTE,
  REALTIME_DATABASE_NODE_NAMES,
  // REALTIME_DATABASE_PATHS,
} from "./constants";
import {
  addToFirestoreCollectionItem,
  cancelServerDrivenStripePayment,
  cancelStripeActivePaymentIntents,
  remove_firestore_field,
  filterFirestoreCollectionByNumber,
  get_firestore_field,
  getCollection,
  getDocument,
  getPaymentIntent,
  getRealtimeNodeItem,
  getStripeActivePaymentIntents,
  getStripeConnectionToken,
  set_firestore_field,
  processPaymentIntent,
  processServerDrivenStripePayment,
  retrieveAvailableStripeReaders,
  searchCollection,
  sendSMS,
  SET_FIRESTORE_FIELD,
  setFirestoreCollectionItem,
  setFirestoreSubCollectionItem,
  setRealtimeNodeItem,
  newSetDatabaseField,
  getFirestoreDoc,
  subscribeToNodeAddition,
  subscribeToNodeChange,
  processServerDrivenStripeRefund,
} from "./db";
import { get, ref } from "firebase/database";
import { RDB } from "./db";
import { useDatabaseBatchStore, useSettingsStore } from "./stores";
import { clog, generateRandomID, log } from "./utils";

// new shi+++++++++++++++++++++++++++++++++++++++++++++++++

// write batching

function clearDBBatch() {
  localStorage.removeItem("batch");
}

function batchDBCallOLD(fieldName, fieldValue, remove) {
  // localStorage.clear();
  let batch = JSON.parse(localStorage.getItem("batch"));
  if (!batch) batch = {};
  batch[fieldName] = { fieldName, fieldValue, remove };
  // clog("batch", batch);
  localStorage.setItem("batch", JSON.stringify(batch));
  useDatabaseBatchStore.getState().setLastWriteMillis();
}

function batchDBCall(path, item, remove) {
  // localStorage.clear();
  let batch = JSON.parse(localStorage.getItem("batch"));
  if (!batch) batch = [];
  batch.push({ path, item, remove });
  // clog("batch", batch);
  localStorage.setItem("batch", JSON.stringify(batch));
  useDatabaseBatchStore.getState().setLastWriteMillis();
}

export function executeDBBatch() {
  let batch = JSON.parse(localStorage.getItem("batch"));
  // log("batch", batch);
  if (!batch) return;
  batch.forEach((batchItem) =>
    newSetDatabaseField(batchItem.path, batchItem.item, batchItem.remove)
  );
  useDatabaseBatchStore.getState().resetLastWriteMillis();
  clearDBBatch();
}

export function executeDBBatchOLD() {
  let batch = JSON.parse(localStorage.getItem("batch"));
  // log("batch", batch);
  if (!batch) return;

  Object.values(batch).forEach((o) => newSetDatabaseField(o));
  let pathNames = Object.keys(batch);
  pathNames.forEach((path) => {
    setDBField(path, batch[path]);
  });

  useDatabaseBatchStore.getState().resetLastWriteMillis();
  clearDBBatch();
}

// intermediate database path checker to determine which database to use
function checkDBPath(path) {
  if (
    Object.values(FIRESTORE_COLLECTION_NAMES).find((str) => path.includes(str))
  ) {
    return "firestore";
  } else {
    return "realtime";
  }
}

// internal db read/write operations
function setDBField(path, item, remove) {
  // if (checkDBPath(path) === "firestore") {
  //   if (remove) return remove_firestore_field(path, item.id);
  //   return set_firestore_field(path, item);
  // } else if (checkDBPath(path) === "realtime") {
  // }
}

////////////////////////////////////////////////////////////////////////////////
// setters /////////////////////////////////////////////////////////////////////

export function dbGetSettings() {
  // Get tenantID and storeID from settings store
  const settingsObj = useSettingsStore.getState().settingsObj;
  const tenantID = settingsObj?.tenantID;
  const storeID = settingsObj?.storeID;

  if (!tenantID || !storeID) {
    throw new Error("tenantID and storeID must be configured in settings");
  }

  let path = build_db_path.settings(null, tenantID, storeID);
  try {
    return get_firestore_field(path);
  } catch (e) {
    log(e);
  }
}

export function dbSetSettings(settingsObj, batch) {
  // Get tenantID and storeID from settings store
  // const currentSettingsObj = useSettingsStore.getState().settingsObj;
  // // const tenantID = currentSettingsObj?.tenantID;
  // // const storeID = currentSettingsObj?.storeID;
  // if (!tenantID || !storeID) {
  //   throw new Error("tenantID and storeID must be configured in settings");
  // }
  // let path = build_db_path.settings(null, tenantID, storeID);
  // if (batch) return batchDBCall(path, settingsObj);
  // return newSetDatabaseField(path, settingsObj);
}

export function dbSetCustomerObj(customerObj, removeOption = false) {
  log("you need to fix dbSetCustomerObj");
  // fix this
  // let id = customerObj.id;
  // let previewObj = {};
  // previewObj.cell = customerObj.cell;
  // previewObj.first = customerObj.first;
  // previewObj.id = customerObj.id;
  // previewObj.landline = customerObj.landline;
  // previewObj.last = customerObj.last;
  // if (removeOption) {
  //   previewObj = null;
  //   customerObj = null;
  // }
  // return setFirestoreCollectionItem("CUSTOMERS", id, customerObj);
}

export function dbSetCustomerField(
  customerID,
  fieldObj = { fieldName: "fieldValue" },
  batch = true
) {
  // Get tenantID and storeID from settings store
  const settingsObj = useSettingsStore.getState().settingsObj;
  const tenantID = settingsObj?.tenantID;
  const storeID = settingsObj?.storeID;

  if (!tenantID || !storeID) {
    throw new Error("tenantID and storeID must be configured in settings");
  }

  let path = build_db_path.customer(customerID, tenantID, storeID);
  // log("path", path);
  log("need to fix batch for Firestore, its only written for Realtime");
  // if (batch) batch
  return newSetDatabaseField(path, fieldObj, false, true);
}

export function dbSetWorkorder(item, batch = true, remove = false) {
  // Get tenantID and storeID from settings store
  const settingsObj = useSettingsStore.getState().settingsObj;
  const tenantID = settingsObj?.tenantID;
  const storeID = settingsObj?.storeID;

  if (!tenantID || !storeID) {
    throw new Error("tenantID and storeID must be configured in settings");
  }

  let path = build_db_path.openWorkorders(item.id, tenantID, storeID);
  if (batch) return batchDBCall(path, item, remove);
  return setRealtimeNodeItem(path, item);
}

export function dbSetClosedWorkorderItem(item, removeOption = false) {
  // Get tenantID and storeID from settings store
  const settingsObj = useSettingsStore.getState().settingsObj;
  const tenantID = settingsObj?.tenantID;
  const storeID = settingsObj?.storeID;

  if (!tenantID || !storeID) {
    throw new Error("tenantID and storeID must be configured in settings");
  }

  let id = item.id;
  if (removeOption) item = null;
  let path = build_db_path.closedWorkorders(id, tenantID, storeID);
  return setFirestoreCollectionItem(path, id, item);
}

export function dbSetInventoryItem(item, batch = true, remove = false) {
  // Get tenantID and storeID from settings store
  const settingsObj = useSettingsStore.getState().settingsObj;
  const tenantID = settingsObj?.tenantID;
  const storeID = settingsObj?.storeID;

  if (!tenantID || !storeID) {
    throw new Error("tenantID and storeID must be configured in settings");
  }

  let path = build_db_path.inventory(item.id, tenantID, storeID);
  if (batch) return batchDBCall(path, item, remove);
  return newSetDatabaseField(path, item, remove);
}

// export function dbSetSaleItem(item, removeOption = false) {
//   let id = item.id;
//   if (removeOption) item = null;
//   return setFirestoreCollectionItem("SALES", id, item);
// }

export function dbSetPunchClockObj(obj, remove = false) {
  // Get tenantID and storeID from settings store
  const settingsObj = useSettingsStore.getState().settingsObj;
  const tenantID = settingsObj?.tenantID;
  const storeID = settingsObj?.storeID;

  if (!tenantID || !storeID) {
    throw new Error("tenantID and storeID must be configured in settings");
  }

  let path = build_db_path.punchClock(tenantID, storeID);
  return newSetDatabaseField(path, obj, remove);
}

export function dbSetOrUpdateUserPunchObj(punchObj, remove = false) {
  // Get tenantID and storeID from settings store
  const settingsObj = useSettingsStore.getState().settingsObj;
  const tenantID = settingsObj?.tenantID;
  const storeID = settingsObj?.storeID;

  if (!tenantID || !storeID) {
    throw new Error("tenantID and storeID must be configured in settings");
  }

  let punchClockPath = build_db_path.punchHistory(
    punchObj.id,
    tenantID,
    storeID
  );
  setDBField(punchClockPath, punchObj, remove);
}

export function dbSetSalesObj(salesObj, updatedCustomerObj) {
  // Get tenantID and storeID from settings store
  const settingsObj = useSettingsStore.getState().settingsObj;
  const tenantID = settingsObj?.tenantID;
  const storeID = settingsObj?.storeID;

  if (!tenantID || !storeID) {
    throw new Error("tenantID and storeID must be configured in settings");
  }

  let path = build_db_path.sales(salesObj.id, tenantID, storeID);
  newSetDatabaseField(path, salesObj);
}

export function dbSetPunchClockArr(arr) {
  // Get tenantID and storeID from settings store
  const settingsObj = useSettingsStore.getState().settingsObj;
  const tenantID = settingsObj?.tenantID;
  const storeID = settingsObj?.storeID;

  if (!tenantID || !storeID) {
    throw new Error("tenantID and storeID must be configured in settings");
  }

  let clockArrPath = build_db_path.punchClock(tenantID, storeID);
  // log("setting arr", arr);
  newSetDatabaseField(clockArrPath, arr);
}

export function dbSetAppUserObj(userObj, remove = false) {
  // Get tenantID and storeID from settings store
  const settingsObj = useSettingsStore.getState().settingsObj;
  const tenantID = settingsObj?.tenantID;
  const storeID = settingsObj?.storeID;

  if (!tenantID || !storeID) {
    throw new Error("tenantID and storeID must be configured in settings");
  }

  let path = `${tenantID}/${storeID}/SETTINGS/` + userObj.id;
  if (remove) userObj = null;
  return setRealtimeNodeItem(path, userObj);
}

// database getters ///////////////////////////////////////////////////////////
export function dbGetClosedWorkorderItem(id) {
  // Get tenantID and storeID from settings store
  const settingsObj = useSettingsStore.getState().settingsObj;
  const tenantID = settingsObj?.tenantID;
  const storeID = settingsObj?.storeID;

  if (!tenantID || !storeID) {
    throw new Error("tenantID and storeID must be configured in settings");
  }

  let path = build_db_path.closedWorkorders(id, tenantID, storeID);
  return getDocument(path, id);
}

export function dbGetOpenWorkorderItem(id) {
  // Get tenantID and storeID from settings store
  const settingsObj = useSettingsStore.getState().settingsObj;
  const tenantID = settingsObj?.tenantID;
  const storeID = settingsObj?.storeID;

  if (!tenantID || !storeID) {
    throw new Error("tenantID and storeID must be configured in settings");
  }

  let path = build_db_path.openWorkorders(id, tenantID, storeID);
  return getRealtimeNodeItem(path);
}

export function dbGetSaleItem(id) {
  // Get tenantID and storeID from settings store
  const settingsObj = useSettingsStore.getState().settingsObj;
  const tenantID = settingsObj?.tenantID;
  const storeID = settingsObj?.storeID;

  if (!tenantID || !storeID) {
    throw new Error("tenantID and storeID must be configured in settings");
  }

  let path = build_db_path.sales(id, tenantID, storeID);
  return getFirestoreDoc(path);
}

export function dbGetCustomerObj(customerID) {
  // Get tenantID and storeID from settings store
  const settingsObj = useSettingsStore.getState().settingsObj;
  const tenantID = settingsObj?.tenantID;
  const storeID = settingsObj?.storeID;

  if (!tenantID || !storeID) {
    throw new Error("tenantID and storeID must be configured in settings");
  }

  let path = build_db_path.customer(customerID, tenantID, storeID);
  return getFirestoreDoc(path);
}

// database filters //////////////////////////////////////////////////
export function _dbFindPunchHistoryByMillisRange(userID, start, end) {
  // Get tenantID and storeID from settings store
  const settingsObj = useSettingsStore.getState().settingsObj;
  const tenantID = settingsObj?.tenantID;
  const storeID = settingsObj?.storeID;

  if (!tenantID || !storeID) {
    throw new Error("tenantID and storeID must be configured in settings");
  }

  let path = build_db_path.punchHistory(userID, tenantID, storeID);
  // log(path);
  // return getCollection(path);
  return filterFirestoreCollectionByNumber(path, "millis", start, end);
}

export function dbFindPreviousEntryByTimestamp() {}

// database searchers /////////////////////////////////////////////////

export function dbSearchForPhoneNumber(searchTerm) {
  // Get tenantID and storeID from settings store
  const settingsObj = useSettingsStore.getState().settingsObj;
  const tenantID = settingsObj?.tenantID;
  const storeID = settingsObj?.storeID;

  if (!tenantID || !storeID) {
    throw new Error("tenantID and storeID must be configured in settings");
  }

  const customersPath = `${tenantID}/${storeID}/CUSTOMERS`;

  return new Promise((resolve, reject) => {
    let resObj = {};
    let cellQueryRes = null;
    let landlineQueryRes = null;
    searchCollection(customersPath, "cell", searchTerm).then((res) => {
      cellQueryRes = true;
      res.forEach((obj) => {
        resObj[obj.id] = obj;
      });
      if (landlineQueryRes) resolve(Object.values(resObj));
    });
    searchCollection(customersPath, "landline", searchTerm).then((res) => {
      landlineQueryRes = true;
      res.forEach((obj) => {
        // log("obj", obj);
        resObj[obj.id] = obj;
      });
      if (cellQueryRes) resolve(Object.values(resObj));
    });
  });
}

export function dbSearchForName(searchTerm) {
  // Get tenantID and storeID from settings store
  const settingsObj = useSettingsStore.getState().settingsObj;
  const tenantID = settingsObj?.tenantID;
  const storeID = settingsObj?.storeID;

  if (!tenantID || !storeID) {
    throw new Error("tenantID and storeID must be configured in settings");
  }

  const customersPath = `${tenantID}/${storeID}/CUSTOMERS`;

  // log("db search term", searchTerm);
  return new Promise((resolve, reject) => {
    let resObj = {};
    let firstNameQueryRes = null;
    let lastNameQueryRes = null;
    searchCollection(customersPath, "first", searchTerm).then((res) => {
      firstNameQueryRes = true;
      res.forEach((obj) => {
        // log("obj", obj);
        resObj[obj.id] = obj;
      });
      if (lastNameQueryRes) resolve(Object.values(resObj));
    });

    searchCollection(customersPath, "last", searchTerm).then((res) => {
      lastNameQueryRes = true;
      res.forEach((obj) => {
        // log("obj", obj);
        resObj[obj.id] = obj;
      });
      if (firstNameQueryRes) resolve(Object.values(resObj));
    });
  });
}

// firebase functions ///////////////////////////////////////////////

export function dbSendMessageToCustomer(messageObj) {
  return sendSMS(messageObj);
}

// server driven Stripe payment processing (new)

export function dbSubscribeToStripePaymentProcess(
  readerID,
  paymentIntentID,
  callback
) {
  // Get tenantID and storeID from settings store
  const settingsObj = useSettingsStore.getState().settingsObj;
  const tenantID = settingsObj?.tenantID;
  const storeID = settingsObj?.storeID;

  if (!tenantID || !storeID) {
    throw new Error("tenantID and storeID must be configured in settings");
  }

  let path = build_db_path.cardPaymentFlow(
    readerID,
    paymentIntentID,
    tenantID,
    storeID
  );
  // subscribeToNodeChange(path, (key, val) => callback(key, val, paymentIntentID));
  return subscribeToNodeAddition(path, (key, val) =>
    callback(key, val, paymentIntentID)
  );
}

export async function dbProcessStripeRefund(paymentAmount, paymentIntentID) {
  return processServerDrivenStripeRefund(paymentAmount, paymentIntentID);
}

// Client-side polling fallback for payment processing
export function createPaymentPollingFallback(
  pollingConfig,
  onUpdate,
  onComplete,
  onError,
  onTimeout
) {
  const {
    databasePath,
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
    log(`Starting payment polling fallback for path: ${databasePath}`);

    // Set up timeout timer
    timeoutTimer = setTimeout(() => {
      stopPolling();
      onTimeout && onTimeout(timeoutMessage);
      log(`Payment polling timeout reached for ${databasePath}`);
    }, maxPollingTime);

    // Start polling
    pollingTimer = setInterval(async () => {
      try {
        // Check for updates in the database
        const updateRef = ref(RDB, `${databasePath}/update`);
        const completeRef = ref(RDB, `${databasePath}/complete`);

        const [updateSnapshot, completeSnapshot] = await Promise.all([
          get(updateRef),
          get(completeRef),
        ]);

        const updateData = updateSnapshot.val();
        const completeData = completeSnapshot.val();

        // Check for completion
        if (completeData) {
          log("Payment completed via polling fallback", completeData);
          stopPolling();
          onComplete && onComplete(completeData);
          return;
        }

        // Check for updates
        if (updateData) {
          const updateTime = updateData.timestamp || Date.now();

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
            `Stale data detected for ${databasePath}, no updates for ${timeSinceLastUpdate}ms`
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

    log(`Stopped payment polling fallback for ${databasePath}`);
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

//////////////////////////////////////////////////////////////////////
////// Completed Workorder Wrapper Functions ///////////////////////
//////////////////////////////////////////////////////////////////////

/**
 * Save a completed workorder object to Google Cloud Storage
 * @param {Object} workorderObj - The workorder object to save
 * @param {string} workorderID - The workorder ID
 * @param {string} status - The completion status (e.g., 'completed', 'cancelled', 'archived')
 * @returns {Promise<Object>} - Returns save result with workorder-specific path
 */
export async function dbSaveCompletedWorkorder(
  workorderObj,
  workorderID,
  status = "completed"
) {
  try {
    // Get tenantID and storeID from settings store
    const settingsObj = useSettingsStore.getState().settingsObj;
    const tenantID = settingsObj?.tenantID;
    const storeID = settingsObj?.storeID;

    if (!tenantID || !storeID) {
      throw new Error("tenantID and storeID must be configured in settings");
    }

    // Generate path using path generator with tenantID/storeID
    const path = build_db_path.cloudStorage.completedWorkorder(
      workorderID,
      tenantID,
      storeID,
      status
    );

    // Add metadata to the workorder object
    const workorderWithMetadata = {
      ...workorderObj,
      _storageMetadata: {
        workorderID,
        tenantID,
        storeID,
        status,
        savedAt: Date.now(),
        savedDate: new Date().toISOString(),
        year: new Date().getFullYear(),
        month: String(new Date().getMonth() + 1).padStart(2, "0"),
        version: "1.0",
      },
    };

    // Convert workorder object to JSON string
    const workorderJSON = JSON.stringify(workorderWithMetadata, null, 2);

    // Upload as string to storage using the generated path
    const result = await uploadStringToStorage(workorderJSON, path, "raw");

    log(`Completed workorder saved: ${path}`);
    return {
      ...result,
      workorderID,
      tenantID,
      storeID,
      status,
      timestamp: workorderWithMetadata._storageMetadata.savedAt,
      year: workorderWithMetadata._storageMetadata.year,
      month: workorderWithMetadata._storageMetadata.month,
      metadata: workorderWithMetadata._storageMetadata,
    };
  } catch (error) {
    log("Error saving completed workorder:", error);
    throw error;
  }
}

/**
 * Retrieve a completed workorder from Google Cloud Storage
 * @param {string} workorderID - The workorder ID
 * @param {string} status - The completion status (e.g., 'completed', 'cancelled', 'archived')
 * @param {string} year - The year (optional, defaults to current year)
 * @param {string} month - The month (optional, defaults to current month)
 * @returns {Promise<Object>} - Returns the workorder object with metadata
 */
export async function dbRetrieveCompletedWorkorder(
  workorderID,
  status = "completed",
  year = null,
  month = null
) {
  try {
    // Get tenantID and storeID from settings store
    const settingsObj = useSettingsStore.getState().settingsObj;
    const tenantID = settingsObj?.tenantID;
    const storeID = settingsObj?.storeID;

    if (!tenantID || !storeID) {
      throw new Error("tenantID and storeID must be configured in settings");
    }

    // Use current date if not provided
    const currentDate = new Date();
    const targetYear = year || currentDate.getFullYear();
    const targetMonth =
      month || String(currentDate.getMonth() + 1).padStart(2, "0");

    // Create the folder path for listing files with tenantID/storeID
    const folderPath = `${tenantID}/${storeID}/completed-workorders/${status}/${targetYear}/${targetMonth}/`;
    const folderContents = await listFilesInStorage(folderPath);

    // Find the workorder file by ID
    const workorderFile = folderContents.files.find(
      (file) =>
        file.name.startsWith(`${workorderID}_`) && file.name.endsWith(".json")
    );

    if (!workorderFile) {
      throw new Error(
        `Workorder ${workorderID} not found in ${status} workorders for tenant ${tenantID}, store ${storeID}, ${targetYear}/${targetMonth}`
      );
    }

    // Get the download URL and fetch the content
    const downloadURL = await getFileDownloadURL(workorderFile.fullPath);

    // Fetch the JSON content
    const response = await fetch(downloadURL);
    if (!response.ok) {
      throw new Error(`Failed to fetch workorder: ${response.statusText}`);
    }

    const workorderData = await response.json();

    log(`Completed workorder retrieved: ${workorderFile.fullPath}`);
    return {
      success: true,
      workorder: workorderData,
      workorderID,
      tenantID,
      storeID,
      status,
      year: targetYear,
      month: targetMonth,
      downloadURL,
      filePath: workorderFile.fullPath,
      metadata: workorderData._storageMetadata,
    };
  } catch (error) {
    log("Error retrieving completed workorder:", error);
    throw error;
  }
}

/**
 * List all completed workorders for a specific status and time period
 * @param {string} status - The completion status (e.g., 'completed', 'cancelled', 'archived')
 * @param {string} year - The year (optional, defaults to current year)
 * @param {string} month - The month (optional, defaults to current month)
 * @returns {Promise<Array>} - Returns array of workorder file information
 */
export async function dbListCompletedWorkorders(
  status = "completed",
  year = null,
  month = null
) {
  try {
    // Get tenantID and storeID from settings store
    const settingsObj = useSettingsStore.getState().settingsObj;
    const tenantID = settingsObj?.tenantID;
    const storeID = settingsObj?.storeID;

    if (!tenantID || !storeID) {
      throw new Error("tenantID and storeID must be configured in settings");
    }

    // Use current date if not provided
    const currentDate = new Date();
    const targetYear = year || currentDate.getFullYear();
    const targetMonth =
      month || String(currentDate.getMonth() + 1).padStart(2, "0");

    // Create the folder path for listing files with tenantID/storeID
    const folderPath = `${tenantID}/${storeID}/completed-workorders/${status}/${targetYear}/${targetMonth}/`;
    const folderContents = await listFilesInStorage(folderPath);

    // Filter for workorder JSON files and extract workorder IDs
    const workorderFiles = folderContents.files
      .filter((file) => file.name.endsWith(".json"))
      .map((file) => {
        // Extract workorder ID from filename (format: workorderID_timestamp.json)
        const workorderID = file.name.split("_")[0];
        return {
          workorderID,
          fileName: file.name,
          fullPath: file.fullPath,
          tenantID,
          storeID,
          status,
          year: targetYear,
          month: targetMonth,
        };
      });

    log(
      `Listed ${workorderFiles.length} completed workorders for tenant ${tenantID}, store ${storeID}, ${status}/${targetYear}/${targetMonth}`
    );
    return {
      success: true,
      workorders: workorderFiles,
      totalCount: workorderFiles.length,
      tenantID,
      storeID,
      status,
      year: targetYear,
      month: targetMonth,
      folderPath,
    };
  } catch (error) {
    log("Error listing completed workorders:", error);
    throw error;
  }
}

/**
 * Delete a completed workorder from Google Cloud Storage
 * @param {string} workorderID - The workorder ID
 * @param {string} status - The completion status (e.g., 'completed', 'cancelled', 'archived')
 * @param {string} year - The year (optional, defaults to current year)
 * @param {string} month - The month (optional, defaults to current month)
 * @returns {Promise<Object>} - Returns deletion result
 */
export async function dbDeleteCompletedWorkorder(
  workorderID,
  status = "completed",
  year = null,
  month = null
) {
  try {
    // Get tenantID and storeID from settings store
    const settingsObj = useSettingsStore.getState().settingsObj;
    const tenantID = settingsObj?.tenantID;
    const storeID = settingsObj?.storeID;

    if (!tenantID || !storeID) {
      throw new Error("tenantID and storeID must be configured in settings");
    }

    // Use current date if not provided
    const currentDate = new Date();
    const targetYear = year || currentDate.getFullYear();
    const targetMonth =
      month || String(currentDate.getMonth() + 1).padStart(2, "0");

    // Create the folder path for listing files with tenantID/storeID
    const folderPath = `${tenantID}/${storeID}/completed-workorders/${status}/${targetYear}/${targetMonth}/`;
    const folderContents = await listFilesInStorage(folderPath);

    // Find the workorder file by ID
    const workorderFile = folderContents.files.find(
      (file) =>
        file.name.startsWith(`${workorderID}_`) && file.name.endsWith(".json")
    );

    if (!workorderFile) {
      throw new Error(
        `Workorder ${workorderID} not found in ${status} workorders for tenant ${tenantID}, store ${storeID}, ${targetYear}/${targetMonth}`
      );
    }

    // Delete the file using the full path
    const result = await deleteFileFromStorage(workorderFile.fullPath);

    log(`Completed workorder deleted: ${workorderFile.fullPath}`);
    return {
      ...result,
      workorderID,
      tenantID,
      storeID,
      status,
      year: targetYear,
      month: targetMonth,
      deletedFilePath: workorderFile.fullPath,
    };
  } catch (error) {
    log("Error deleting completed workorder:", error);
    throw error;
  }
}

/**
 * Retrieve all completed workorders within a specific time range
 * @param {number} fromMillis - Start time in milliseconds
 * @param {number} toMillis - End time in milliseconds
 * @returns {Promise<Object>} - Returns all workorder records within the time range
 */
export async function dbRetrieveCompletedWorkordersByTimeRange(
  fromMillis,
  toMillis
) {
  try {
    // Get tenantID and storeID from settings store
    const settingsObj = useSettingsStore.getState().settingsObj;
    const tenantID = settingsObj?.tenantID;
    const storeID = settingsObj?.storeID;

    if (!tenantID || !storeID) {
      throw new Error("tenantID and storeID must be configured in settings");
    }

    const { listFilesInStorage, getFileDownloadURL } = await import("./db");

    // Convert milliseconds to date objects for folder structure
    const fromDate = new Date(fromMillis);
    const toDate = new Date(toMillis);

    const fromYear = fromDate.getFullYear();
    const fromMonth = String(fromDate.getMonth() + 1).padStart(2, "0");
    const toYear = toDate.getFullYear();
    const toMonth = String(toDate.getMonth() + 1).padStart(2, "0");

    log(
      `Searching completed workorders for tenant ${tenantID}, store ${storeID} from ${fromYear}/${fromMonth} to ${toYear}/${toMonth}`
    );

    const allWorkorderRecords = [];
    const statuses = ["completed", "cancelled", "archived"];

    // Helper function to check if a file was created within the time range
    const isWithinTimeRange = (timestamp) => {
      return timestamp >= fromMillis && timestamp <= toMillis;
    };

    // Search through all status folders
    for (const status of statuses) {
      const statusPath = `${tenantID}/${storeID}/completed-workorders/${status}/`;

      try {
        // List all years in this status folder
        const statusContents = await listFilesInStorage(statusPath);

        // Get all year folders (prefixes)
        const yearFolders = statusContents.folders || [];

        for (const yearFolder of yearFolders) {
          const year = yearFolder.name;

          // Check if this year is within our range
          if (year < fromYear || year > toYear) {
            continue;
          }

          log(
            `Searching year ${year} in status ${status} for tenant ${tenantID}, store ${storeID}`
          );

          // Search through months in this year
          const currentDate = new Date(fromDate);
          while (currentDate <= toDate) {
            const currentYear = currentDate.getFullYear();
            const month = String(currentDate.getMonth() + 1).padStart(2, "0");

            // Only search this year's months
            if (currentYear.toString() !== year) {
              currentDate.setMonth(currentDate.getMonth() + 1);
              continue;
            }

            const yearMonthPath = `${tenantID}/${storeID}/completed-workorders/${status}/${year}/${month}/`;

            try {
              const yearMonthContents = await listFilesInStorage(yearMonthPath);

              // Process all JSON files in this folder
              for (const file of yearMonthContents.files) {
                if (file.name.endsWith(".json")) {
                  try {
                    // Extract timestamp from filename (format: workorderID_timestamp.json)
                    const timestampMatch = file.name.match(/_(\d+)\.json$/);
                    if (timestampMatch) {
                      const fileTimestamp = parseInt(timestampMatch[1]);

                      // Check if this file was created within our time range
                      if (isWithinTimeRange(fileTimestamp)) {
                        // Get the download URL and fetch the content
                        const downloadURL = await getFileDownloadURL(
                          file.fullPath
                        );
                        const response = await fetch(downloadURL);

                        if (response.ok) {
                          const workorderData = await response.json();

                          // Add file metadata
                          const recordWithMetadata = {
                            ...workorderData,
                            _fileMetadata: {
                              fileName: file.name,
                              fullPath: file.fullPath,
                              downloadURL,
                              tenantID,
                              storeID,
                              status,
                              year,
                              month,
                              fileTimestamp,
                              retrievedAt: Date.now(),
                            },
                          };

                          allWorkorderRecords.push(recordWithMetadata);
                        }
                      }
                    }
                  } catch (fileError) {
                    log(`Error processing file ${file.name}:`, fileError);
                  }
                }
              }
            } catch (pathError) {
              log(`Path ${yearMonthPath} not found, continuing...`);
            }

            // Move to next month
            currentDate.setMonth(currentDate.getMonth() + 1);
          }
        }
      } catch (statusError) {
        log(
          `Error searching status ${status} for tenant ${tenantID}, store ${storeID}:`,
          statusError
        );
      }
    }

    // Sort by timestamp (most recent first)
    allWorkorderRecords.sort((a, b) => {
      const aTime = a._fileMetadata?.fileTimestamp || 0;
      const bTime = b._fileMetadata?.fileTimestamp || 0;
      return bTime - aTime;
    });

    log(
      `Found ${
        allWorkorderRecords.length
      } completed workorders for tenant ${tenantID}, store ${storeID} between ${new Date(
        fromMillis
      ).toISOString()} and ${new Date(toMillis).toISOString()}`
    );

    return {
      success: true,
      workorderRecords: allWorkorderRecords,
      totalCount: allWorkorderRecords.length,
      tenantID,
      storeID,
      timeRange: {
        from: fromMillis,
        to: toMillis,
        fromDate: new Date(fromMillis).toISOString(),
        toDate: new Date(toMillis).toISOString(),
      },
      searchCriteria: {
        fromYear,
        fromMonth,
        toYear,
        toMonth,
      },
    };
  } catch (error) {
    log("Error retrieving completed workorders by time range:", error);
    throw error;
  }
}

//////////////////////////////////////////////////////////////////////
////// Completed Sale Wrapper Functions /////////////////////////////
//////////////////////////////////////////////////////////////////////

/**
 * Save a completed sale object to Google Cloud Storage
 * @param {Object} saleObj - The sale object to save
 * @param {string} saleID - The sale ID
 * @param {string} status - The completion status (e.g., 'completed', 'cancelled', 'refunded')
 * @returns {Promise<Object>} - Returns save result with sale-specific path
 */
export async function dbSaveCompletedSale(
  saleObj,
  saleID,
  status = "completed"
) {
  try {
    // Get tenantID and storeID from settings store
    const settingsObj = useSettingsStore.getState().settingsObj;
    const tenantID = settingsObj?.tenantID;
    const storeID = settingsObj?.storeID;

    if (!tenantID || !storeID) {
      throw new Error("tenantID and storeID must be configured in settings");
    }

    // Generate path using path generator with tenantID/storeID
    const path = build_db_path.cloudStorage.completedSale(
      saleID,
      tenantID,
      storeID,
      status
    );

    // Add metadata to the sale object
    const saleWithMetadata = {
      ...saleObj,
      _storageMetadata: {
        saleID,
        tenantID,
        storeID,
        status,
        savedAt: Date.now(),
        savedDate: new Date().toISOString(),
        year: new Date().getFullYear(),
        month: String(new Date().getMonth() + 1).padStart(2, "0"),
        version: "1.0",
      },
    };

    // Convert sale object to JSON string
    const saleJSON = JSON.stringify(saleWithMetadata, null, 2);

    // Upload as string to storage using the generated path
    const result = await uploadStringToStorage(saleJSON, path, "raw");

    log(`Completed sale saved: ${path}`);
    return {
      ...result,
      saleID,
      tenantID,
      storeID,
      status,
      timestamp: saleWithMetadata._storageMetadata.savedAt,
      year: saleWithMetadata._storageMetadata.year,
      month: saleWithMetadata._storageMetadata.month,
      metadata: saleWithMetadata._storageMetadata,
    };
  } catch (error) {
    log("Error saving completed sale:", error);
    throw error;
  }
}

/**
 * Retrieve a completed sale from Google Cloud Storage
 * @param {string} saleID - The sale ID
 * @param {string} status - The completion status (e.g., 'completed', 'cancelled', 'refunded')
 * @param {string} year - The year (optional, defaults to current year)
 * @param {string} month - The month (optional, defaults to current month)
 * @returns {Promise<Object>} - Returns the sale object with metadata
 */
export async function dbRetrieveCompletedSale(
  saleID,
  status = "completed",
  year = null,
  month = null
) {
  try {
    // Get tenantID and storeID from settings store
    const settingsObj = useSettingsStore.getState().settingsObj;
    const tenantID = settingsObj?.tenantID;
    const storeID = settingsObj?.storeID;

    if (!tenantID || !storeID) {
      throw new Error("tenantID and storeID must be configured in settings");
    }

    // Use current date if not provided
    const currentDate = new Date();
    const targetYear = year || currentDate.getFullYear();
    const targetMonth =
      month || String(currentDate.getMonth() + 1).padStart(2, "0");

    // Create the folder path for listing files with tenantID/storeID
    const folderPath = `${tenantID}/${storeID}/completed-sales/${status}/${targetYear}/${targetMonth}/`;
    const folderContents = await listFilesInStorage(folderPath);

    // Find the sale file by ID
    const saleFile = folderContents.files.find(
      (file) =>
        file.name.startsWith(`${saleID}_`) && file.name.endsWith(".json")
    );

    if (!saleFile) {
      throw new Error(
        `Sale ${saleID} not found in ${status} sales for tenant ${tenantID}, store ${storeID}, ${targetYear}/${targetMonth}`
      );
    }

    // Get the download URL and fetch the content
    const downloadURL = await getFileDownloadURL(saleFile.fullPath);

    // Fetch the JSON content
    const response = await fetch(downloadURL);
    if (!response.ok) {
      throw new Error(`Failed to fetch sale: ${response.statusText}`);
    }

    const saleData = await response.json();

    log(`Completed sale retrieved: ${saleFile.fullPath}`);
    return {
      success: true,
      sale: saleData,
      saleID,
      tenantID,
      storeID,
      status,
      year: targetYear,
      month: targetMonth,
      downloadURL,
      filePath: saleFile.fullPath,
      metadata: saleData._storageMetadata,
    };
  } catch (error) {
    log("Error retrieving completed sale:", error);
    throw error;
  }
}

/**
 * List all completed sales for a specific status and time period
 * @param {string} status - The completion status (e.g., 'completed', 'cancelled', 'refunded')
 * @param {string} year - The year (optional, defaults to current year)
 * @param {string} month - The month (optional, defaults to current month)
 * @returns {Promise<Array>} - Returns array of sale file information
 */
export async function dbListCompletedSales(
  status = "completed",
  year = null,
  month = null
) {
  try {
    // Get tenantID and storeID from settings store
    const settingsObj = useSettingsStore.getState().settingsObj;
    const tenantID = settingsObj?.tenantID;
    const storeID = settingsObj?.storeID;

    if (!tenantID || !storeID) {
      throw new Error("tenantID and storeID must be configured in settings");
    }

    // Use current date if not provided
    const currentDate = new Date();
    const targetYear = year || currentDate.getFullYear();
    const targetMonth =
      month || String(currentDate.getMonth() + 1).padStart(2, "0");

    // Create the folder path for listing files with tenantID/storeID
    const folderPath = `${tenantID}/${storeID}/completed-sales/${status}/${targetYear}/${targetMonth}/`;
    const folderContents = await listFilesInStorage(folderPath);

    // Filter for sale JSON files and extract sale IDs
    const saleFiles = folderContents.files
      .filter((file) => file.name.endsWith(".json"))
      .map((file) => {
        // Extract sale ID from filename (format: saleID_timestamp.json)
        const saleID = file.name.split("_")[0];
        return {
          saleID,
          fileName: file.name,
          fullPath: file.fullPath,
          tenantID,
          storeID,
          status,
          year: targetYear,
          month: targetMonth,
        };
      });

    log(
      `Listed ${saleFiles.length} completed sales for tenant ${tenantID}, store ${storeID}, ${status}/${targetYear}/${targetMonth}`
    );
    return {
      success: true,
      sales: saleFiles,
      totalCount: saleFiles.length,
      tenantID,
      storeID,
      status,
      year: targetYear,
      month: targetMonth,
      folderPath,
    };
  } catch (error) {
    log("Error listing completed sales:", error);
    throw error;
  }
}

/**
 * Delete a completed sale from Google Cloud Storage
 * @param {string} saleID - The sale ID
 * @param {string} status - The completion status (e.g., 'completed', 'cancelled', 'refunded')
 * @param {string} year - The year (optional, defaults to current year)
 * @param {string} month - The month (optional, defaults to current month)
 * @returns {Promise<Object>} - Returns deletion result
 */
export async function dbDeleteCompletedSale(
  saleID,
  status = "completed",
  year = null,
  month = null
) {
  try {
    // Get tenantID and storeID from settings store
    const settingsObj = useSettingsStore.getState().settingsObj;
    const tenantID = settingsObj?.tenantID;
    const storeID = settingsObj?.storeID;

    if (!tenantID || !storeID) {
      throw new Error("tenantID and storeID must be configured in settings");
    }

    // Use current date if not provided
    const currentDate = new Date();
    const targetYear = year || currentDate.getFullYear();
    const targetMonth =
      month || String(currentDate.getMonth() + 1).padStart(2, "0");

    // Create the folder path for listing files with tenantID/storeID
    const folderPath = `${tenantID}/${storeID}/completed-sales/${status}/${targetYear}/${targetMonth}/`;
    const folderContents = await listFilesInStorage(folderPath);

    // Find the sale file by ID
    const saleFile = folderContents.files.find(
      (file) =>
        file.name.startsWith(`${saleID}_`) && file.name.endsWith(".json")
    );

    if (!saleFile) {
      throw new Error(
        `Sale ${saleID} not found in ${status} sales for tenant ${tenantID}, store ${storeID}, ${targetYear}/${targetMonth}`
      );
    }

    // Delete the file using the full path
    const result = await deleteFileFromStorage(saleFile.fullPath);

    log(`Completed sale deleted: ${saleFile.fullPath}`);
    return {
      ...result,
      saleID,
      tenantID,
      storeID,
      status,
      year: targetYear,
      month: targetMonth,
      deletedFilePath: saleFile.fullPath,
    };
  } catch (error) {
    log("Error deleting completed sale:", error);
    throw error;
  }
}

/**
 * Retrieve all completed sales within a specific time range
 * @param {number} fromMillis - Start time in milliseconds
 * @param {number} toMillis - End time in milliseconds
 * @returns {Promise<Object>} - Returns all sale records within the time range
 */
export async function dbRetrieveCompletedSalesByTimeRange(
  fromMillis,
  toMillis
) {
  try {
    // Get tenantID and storeID from settings store
    const settingsObj = useSettingsStore.getState().settingsObj;
    const tenantID = settingsObj?.tenantID;
    const storeID = settingsObj?.storeID;

    if (!tenantID || !storeID) {
      throw new Error("tenantID and storeID must be configured in settings");
    }

    const { listFilesInStorage, getFileDownloadURL } = await import("./db");

    // Convert milliseconds to date objects for folder structure
    const fromDate = new Date(fromMillis);
    const toDate = new Date(toMillis);

    const fromYear = fromDate.getFullYear();
    const fromMonth = String(fromDate.getMonth() + 1).padStart(2, "0");
    const toYear = toDate.getFullYear();
    const toMonth = String(toDate.getMonth() + 1).padStart(2, "0");

    log(
      `Searching completed sales for tenant ${tenantID}, store ${storeID} from ${fromYear}/${fromMonth} to ${toYear}/${toMonth}`
    );

    const allSaleRecords = [];
    const statuses = ["completed", "cancelled", "refunded"];

    // Helper function to check if a file was created within the time range
    const isWithinTimeRange = (timestamp) => {
      return timestamp >= fromMillis && timestamp <= toMillis;
    };

    // Search through all status folders
    for (const status of statuses) {
      const statusPath = `${tenantID}/${storeID}/completed-sales/${status}/`;

      try {
        // List all years in this status folder
        const statusContents = await listFilesInStorage(statusPath);

        // Get all year folders (prefixes)
        const yearFolders = statusContents.folders || [];

        for (const yearFolder of yearFolders) {
          const year = yearFolder.name;

          // Check if this year is within our range
          if (year < fromYear || year > toYear) {
            continue;
          }

          log(
            `Searching year ${year} in status ${status} for tenant ${tenantID}, store ${storeID}`
          );

          // Search through months in this year
          const currentDate = new Date(fromDate);
          while (currentDate <= toDate) {
            const currentYear = currentDate.getFullYear();
            const month = String(currentDate.getMonth() + 1).padStart(2, "0");

            // Only search this year's months
            if (currentYear.toString() !== year) {
              currentDate.setMonth(currentDate.getMonth() + 1);
              continue;
            }

            const yearMonthPath = `${tenantID}/${storeID}/completed-sales/${status}/${year}/${month}/`;

            try {
              const yearMonthContents = await listFilesInStorage(yearMonthPath);

              // Process all JSON files in this folder
              for (const file of yearMonthContents.files) {
                if (file.name.endsWith(".json")) {
                  try {
                    // Extract timestamp from filename (format: saleID_timestamp.json)
                    const timestampMatch = file.name.match(/_(\d+)\.json$/);
                    if (timestampMatch) {
                      const fileTimestamp = parseInt(timestampMatch[1]);

                      // Check if this file was created within our time range
                      if (isWithinTimeRange(fileTimestamp)) {
                        // Get the download URL and fetch the content
                        const downloadURL = await getFileDownloadURL(
                          file.fullPath
                        );
                        const response = await fetch(downloadURL);

                        if (response.ok) {
                          const saleData = await response.json();

                          // Add file metadata
                          const recordWithMetadata = {
                            ...saleData,
                            _fileMetadata: {
                              fileName: file.name,
                              fullPath: file.fullPath,
                              downloadURL,
                              tenantID,
                              storeID,
                              status,
                              year,
                              month,
                              fileTimestamp,
                              retrievedAt: Date.now(),
                            },
                          };

                          allSaleRecords.push(recordWithMetadata);
                        }
                      }
                    }
                  } catch (fileError) {
                    log(`Error processing file ${file.name}:`, fileError);
                  }
                }
              }
            } catch (pathError) {
              log(`Path ${yearMonthPath} not found, continuing...`);
            }

            // Move to next month
            currentDate.setMonth(currentDate.getMonth() + 1);
          }
        }
      } catch (statusError) {
        log(
          `Error searching status ${status} for tenant ${tenantID}, store ${storeID}:`,
          statusError
        );
      }
    }

    // Sort by timestamp (most recent first)
    allSaleRecords.sort((a, b) => {
      const aTime = a._fileMetadata?.fileTimestamp || 0;
      const bTime = b._fileMetadata?.fileTimestamp || 0;
      return bTime - aTime;
    });

    log(
      `Found ${
        allSaleRecords.length
      } completed sales for tenant ${tenantID}, store ${storeID} between ${new Date(
        fromMillis
      ).toISOString()} and ${new Date(toMillis).toISOString()}`
    );

    return {
      success: true,
      saleRecords: allSaleRecords,
      totalCount: allSaleRecords.length,
      tenantID,
      storeID,
      timeRange: {
        from: fromMillis,
        to: toMillis,
        fromDate: new Date(fromMillis).toISOString(),
        toDate: new Date(toMillis).toISOString(),
      },
      searchCriteria: {
        fromYear,
        fromMonth,
        toYear,
        toMonth,
      },
    };
  } catch (error) {
    log("Error retrieving completed sales by time range:", error);
    throw error;
  }
}

//////////////////////////////////////////////////////////////////////
////// Punch History Wrapper Functions //////////////////////////////
//////////////////////////////////////////////////////////////////////

/**
 * Save a punch history object to Google Cloud Storage
 * @param {Object} punchHistoryObj - The punch history object to save
 * @param {string} punchHistoryID - The punch history ID
 * @param {string} userID - The user ID to group by
 * @param {string} status - The status (e.g., 'active', 'archived', 'deleted')
 * @returns {Promise<Object>} - Returns save result with punch history-specific path
 */
export async function dbSavePunchHistory(
  punchHistoryObj,
  punchHistoryID,
  userID,
  status = "active"
) {
  try {
    // Get tenantID and storeID from settings store
    const settingsObj = useSettingsStore.getState().settingsObj;
    const tenantID = settingsObj?.tenantID;
    const storeID = settingsObj?.storeID;

    if (!tenantID || !storeID) {
      throw new Error("tenantID and storeID must be configured in settings");
    }

    // Generate path using path generator with tenantID/storeID
    const path = build_db_path.cloudStorage.punchHistory(
      punchHistoryID,
      userID,
      tenantID,
      storeID,
      status
    );

    // Add metadata to the punch history object
    const punchHistoryWithMetadata = {
      ...punchHistoryObj,
      _storageMetadata: {
        punchHistoryID,
        userID,
        tenantID,
        storeID,
        status,
        savedAt: Date.now(),
        savedDate: new Date().toISOString(),
        year: new Date().getFullYear(),
        month: String(new Date().getMonth() + 1).padStart(2, "0"),
        version: "1.0",
      },
    };

    // Convert punch history object to JSON string
    const punchHistoryJSON = JSON.stringify(punchHistoryWithMetadata, null, 2);

    // Upload as string to storage using the generated path
    const result = await uploadStringToStorage(punchHistoryJSON, path, "raw");

    log(`Punch history saved: ${path}`);
    return {
      ...result,
      punchHistoryID,
      userID,
      tenantID,
      storeID,
      status,
      timestamp: punchHistoryWithMetadata._storageMetadata.savedAt,
      year: punchHistoryWithMetadata._storageMetadata.year,
      month: punchHistoryWithMetadata._storageMetadata.month,
      metadata: punchHistoryWithMetadata._storageMetadata,
    };
  } catch (error) {
    log("Error saving punch history:", error);
    throw error;
  }
}

/**
 * Retrieve a punch history from Google Cloud Storage
 * @param {string} punchHistoryID - The punch history ID
 * @param {string} userID - The user ID to search within
 * @param {string} status - The status (e.g., 'active', 'archived', 'deleted')
 * @param {string} year - The year (optional, defaults to current year)
 * @param {string} month - The month (optional, defaults to current month)
 * @returns {Promise<Object>} - Returns the punch history object with metadata
 */
export async function dbRetrievePunchHistory(
  punchHistoryID,
  userID,
  status = "active",
  year = null,
  month = null
) {
  try {
    // Get tenantID and storeID from settings store
    const settingsObj = useSettingsStore.getState().settingsObj;
    const tenantID = settingsObj?.tenantID;
    const storeID = settingsObj?.storeID;

    if (!tenantID || !storeID) {
      throw new Error("tenantID and storeID must be configured in settings");
    }

    // Use current date if not provided
    const currentDate = new Date();
    const targetYear = year || currentDate.getFullYear();
    const targetMonth =
      month || String(currentDate.getMonth() + 1).padStart(2, "0");

    // Create the folder path for listing files with tenantID/storeID
    const folderPath = `${tenantID}/${storeID}/punch-history/${status}/${userID}/${targetYear}/${targetMonth}/`;
    const folderContents = await listFilesInStorage(folderPath);

    // Find the punch history file by ID
    const punchHistoryFile = folderContents.files.find(
      (file) =>
        file.name.startsWith(`${punchHistoryID}_`) &&
        file.name.endsWith(".json")
    );

    if (!punchHistoryFile) {
      throw new Error(
        `Punch history ${punchHistoryID} not found for user ${userID} in ${status} punch history for tenant ${tenantID}, store ${storeID}, ${targetYear}/${targetMonth}`
      );
    }

    // Get the download URL and fetch the content
    const downloadURL = await getFileDownloadURL(punchHistoryFile.fullPath);

    // Fetch the JSON content
    const response = await fetch(downloadURL);
    if (!response.ok) {
      throw new Error(`Failed to fetch punch history: ${response.statusText}`);
    }

    const punchHistoryData = await response.json();

    log(`Punch history retrieved: ${punchHistoryFile.fullPath}`);
    return {
      success: true,
      punchHistory: punchHistoryData,
      punchHistoryID,
      userID,
      tenantID,
      storeID,
      status,
      year: targetYear,
      month: targetMonth,
      downloadURL,
      filePath: punchHistoryFile.fullPath,
      metadata: punchHistoryData._storageMetadata,
    };
  } catch (error) {
    log("Error retrieving punch history:", error);
    throw error;
  }
}

/**
 * List all punch history records for a specific user, status and time period
 * @param {string} userID - The user ID to list punch history for
 * @param {string} status - The status (e.g., 'active', 'archived', 'deleted')
 * @param {string} year - The year (optional, defaults to current year)
 * @param {string} month - The month (optional, defaults to current month)
 * @returns {Promise<Array>} - Returns array of punch history file information
 */
export async function dbListPunchHistory(
  userID,
  status = "active",
  year = null,
  month = null
) {
  try {
    // Get tenantID and storeID from settings store
    const settingsObj = useSettingsStore.getState().settingsObj;
    const tenantID = settingsObj?.tenantID;
    const storeID = settingsObj?.storeID;

    if (!tenantID || !storeID) {
      throw new Error("tenantID and storeID must be configured in settings");
    }

    // Use current date if not provided
    const currentDate = new Date();
    const targetYear = year || currentDate.getFullYear();
    const targetMonth =
      month || String(currentDate.getMonth() + 1).padStart(2, "0");

    // Create the folder path for listing files with tenantID/storeID
    const folderPath = `${tenantID}/${storeID}/punch-history/${status}/${userID}/${targetYear}/${targetMonth}/`;
    const folderContents = await listFilesInStorage(folderPath);

    // Filter for punch history JSON files and extract punch history IDs
    const punchHistoryFiles = folderContents.files
      .filter((file) => file.name.endsWith(".json"))
      .map((file) => {
        // Extract punch history ID from filename (format: punchHistoryID_timestamp.json)
        const punchHistoryID = file.name.split("_")[0];
        return {
          punchHistoryID,
          fileName: file.name,
          fullPath: file.fullPath,
          userID,
          tenantID,
          storeID,
          status,
          year: targetYear,
          month: targetMonth,
        };
      });

    log(
      `Listed ${punchHistoryFiles.length} punch history records for user ${userID} in tenant ${tenantID}, store ${storeID}, ${status}/${targetYear}/${targetMonth}`
    );
    return {
      success: true,
      punchHistoryRecords: punchHistoryFiles,
      totalCount: punchHistoryFiles.length,
      userID,
      tenantID,
      storeID,
      status,
      year: targetYear,
      month: targetMonth,
      folderPath,
    };
  } catch (error) {
    log("Error listing punch history:", error);
    throw error;
  }
}

/**
 * Delete a punch history from Google Cloud Storage
 * @param {string} punchHistoryID - The punch history ID
 * @param {string} userID - The user ID to search within
 * @param {string} status - The status (e.g., 'active', 'archived', 'deleted')
 * @param {string} year - The year (optional, defaults to current year)
 * @param {string} month - The month (optional, defaults to current month)
 * @returns {Promise<Object>} - Returns deletion result
 */
export async function dbDeletePunchHistory(
  punchHistoryID,
  userID,
  status = "active",
  year = null,
  month = null
) {
  try {
    // Get tenantID and storeID from settings store
    const settingsObj = useSettingsStore.getState().settingsObj;
    const tenantID = settingsObj?.tenantID;
    const storeID = settingsObj?.storeID;

    if (!tenantID || !storeID) {
      throw new Error("tenantID and storeID must be configured in settings");
    }

    // Use current date if not provided
    const currentDate = new Date();
    const targetYear = year || currentDate.getFullYear();
    const targetMonth =
      month || String(currentDate.getMonth() + 1).padStart(2, "0");

    // Create the folder path for listing files with tenantID/storeID
    const folderPath = `${tenantID}/${storeID}/punch-history/${status}/${userID}/${targetYear}/${targetMonth}/`;
    const folderContents = await listFilesInStorage(folderPath);

    // Find the punch history file by ID
    const punchHistoryFile = folderContents.files.find(
      (file) =>
        file.name.startsWith(`${punchHistoryID}_`) &&
        file.name.endsWith(".json")
    );

    if (!punchHistoryFile) {
      throw new Error(
        `Punch history ${punchHistoryID} not found for user ${userID} in ${status} punch history for tenant ${tenantID}, store ${storeID}, ${targetYear}/${targetMonth}`
      );
    }

    // Delete the file using the full path
    const result = await deleteFileFromStorage(punchHistoryFile.fullPath);

    log(`Punch history deleted: ${punchHistoryFile.fullPath}`);
    return {
      ...result,
      punchHistoryID,
      userID,
      tenantID,
      storeID,
      status,
      year: targetYear,
      month: targetMonth,
      deletedFilePath: punchHistoryFile.fullPath,
    };
  } catch (error) {
    log("Error deleting punch history:", error);
    throw error;
  }
}

/**
 * Retrieve all punch history records within a specific time range
 * @param {number} fromMillis - Start time in milliseconds
 * @param {number} toMillis - End time in milliseconds
 * @returns {Promise<Object>} - Returns all punch history records within the time range
 */
export async function dbRetrievePunchHistoryByTimeRange(fromMillis, toMillis) {
  try {
    // Get tenantID and storeID from settings store
    const settingsObj = useSettingsStore.getState().settingsObj;
    const tenantID = settingsObj?.tenantID;
    const storeID = settingsObj?.storeID;

    if (!tenantID || !storeID) {
      throw new Error("tenantID and storeID must be configured in settings");
    }

    const { listFilesInStorage, getFileDownloadURL } = await import("./db");

    // Convert milliseconds to date objects for folder structure
    const fromDate = new Date(fromMillis);
    const toDate = new Date(toMillis);

    const fromYear = fromDate.getFullYear();
    const fromMonth = String(fromDate.getMonth() + 1).padStart(2, "0");
    const toYear = toDate.getFullYear();
    const toMonth = String(toDate.getMonth() + 1).padStart(2, "0");

    log(
      `Searching punch history for tenant ${tenantID}, store ${storeID} from ${fromYear}/${fromMonth} to ${toYear}/${toMonth}`
    );

    const allPunchHistoryRecords = [];
    const statuses = ["active", "archived", "deleted"];

    // Helper function to check if a file was created within the time range
    const isWithinTimeRange = (timestamp) => {
      return timestamp >= fromMillis && timestamp <= toMillis;
    };

    // Search through all status folders
    for (const status of statuses) {
      const statusPath = `${tenantID}/${storeID}/punch-history/${status}/`;

      try {
        // List all users in this status folder
        const statusContents = await listFilesInStorage(statusPath);

        // Get all user folders (prefixes)
        const userFolders = statusContents.folders || [];

        for (const userFolder of userFolders) {
          const userID = userFolder.name;
          log(
            `Searching user ${userID} in status ${status} for tenant ${tenantID}, store ${storeID}`
          );

          // Search through years and months
          const currentDate = new Date(fromDate);
          while (currentDate <= toDate) {
            const year = currentDate.getFullYear();
            const month = String(currentDate.getMonth() + 1).padStart(2, "0");

            const userYearMonthPath = `${tenantID}/${storeID}/punch-history/${status}/${userID}/${year}/${month}/`;

            try {
              const userYearMonthContents = await listFilesInStorage(
                userYearMonthPath
              );

              // Process all JSON files in this folder
              for (const file of userYearMonthContents.files) {
                if (file.name.endsWith(".json")) {
                  try {
                    // Extract timestamp from filename (format: punchHistoryID_timestamp.json)
                    const timestampMatch = file.name.match(/_(\d+)\.json$/);
                    if (timestampMatch) {
                      const fileTimestamp = parseInt(timestampMatch[1]);

                      // Check if this file was created within our time range
                      if (isWithinTimeRange(fileTimestamp)) {
                        // Get the download URL and fetch the content
                        const downloadURL = await getFileDownloadURL(
                          file.fullPath
                        );
                        const response = await fetch(downloadURL);

                        if (response.ok) {
                          const punchHistoryData = await response.json();

                          // Add file metadata
                          const recordWithMetadata = {
                            ...punchHistoryData,
                            _fileMetadata: {
                              fileName: file.name,
                              fullPath: file.fullPath,
                              downloadURL,
                              userID,
                              tenantID,
                              storeID,
                              status,
                              year,
                              month,
                              fileTimestamp,
                              retrievedAt: Date.now(),
                            },
                          };

                          allPunchHistoryRecords.push(recordWithMetadata);
                        }
                      }
                    }
                  } catch (fileError) {
                    log(`Error processing file ${file.name}:`, fileError);
                  }
                }
              }
            } catch (pathError) {
              log(`Path ${userYearMonthPath} not found, continuing...`);
            }

            // Move to next month
            currentDate.setMonth(currentDate.getMonth() + 1);
          }
        }
      } catch (statusError) {
        log(
          `Error searching status ${status} for tenant ${tenantID}, store ${storeID}:`,
          statusError
        );
      }
    }

    // Sort by timestamp (most recent first)
    allPunchHistoryRecords.sort((a, b) => {
      const aTime = a._fileMetadata?.fileTimestamp || 0;
      const bTime = b._fileMetadata?.fileTimestamp || 0;
      return bTime - aTime;
    });

    log(
      `Found ${
        allPunchHistoryRecords.length
      } punch history records for tenant ${tenantID}, store ${storeID} between ${new Date(
        fromMillis
      ).toISOString()} and ${new Date(toMillis).toISOString()}`
    );

    return {
      success: true,
      punchHistoryRecords: allPunchHistoryRecords,
      totalCount: allPunchHistoryRecords.length,
      tenantID,
      storeID,
      timeRange: {
        from: fromMillis,
        to: toMillis,
        fromDate: new Date(fromMillis).toISOString(),
        toDate: new Date(toMillis).toISOString(),
      },
      searchCriteria: {
        fromYear,
        fromMonth,
        toYear,
        toMonth,
      },
    };
  } catch (error) {
    log("Error retrieving punch history by time range:", error);
    throw error;
  }
}

/**
 * Login app user and set up settings with tenantID and storeID
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<Object>} - Returns login result with user, tenant, and settings
 */
export async function dbLoginAppUser(email, password) {
  try {
    const { loginAppUser } = await import("./db");
    const result = await loginAppUser(email, password);

    if (result.success) {
      // Extract tenantID and storeID from the login response
      const { tenantID, storeID } = result.user;

      // Get settings using the retrieved tenantID and storeID
      const settings = await dbGetSettings();

      // Update the settings with tenantID and storeID
      const updatedSettings = {
        ...settings,
        tenantID,
        storeID,
        user: result.user,
        tenant: result.tenant,
        auth: result.auth,
      };



      log("Login successful and settings updated", {
        tenantID,
        storeID,
        user: result.user,
      });

      return {
        success: true,
        user: result.user,
        tenant: result.tenant,
        auth: result.auth,
        settings: updatedSettings,
      };
    } else {
      throw new Error(result.message || "Login failed");
    }
  } catch (error) {
    log("Error during login process:", error);
    throw error;
  }
}


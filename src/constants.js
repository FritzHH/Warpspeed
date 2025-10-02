/* eslint-disable */
// various constants from the world
export const MILLIS_IN_MINUTE = 60000;
export const MILLIS_IN_HOUR = MILLIS_IN_MINUTE * 60;
export const MILLIS_IN_DAY = MILLIS_IN_HOUR * 24;

// numbers
export const FACE_DESCRIPTOR_CONFIDENCE_DISTANCE = 0.55;
export const DB_BATCH_INTERVAL_MILLIS = 500;

export const DISCOUNT_TYPES = {
  percent: "%",
  dollar: "$",
};

// timing
export const INTERNET_CHECK_DELAY = 1000;
export const FACIAL_RECOGNITION_INTERVAL_MILLIS = 1500;
export const PAUSE_USER_CLOCK_IN_CHECK_MILLIS = MILLIS_IN_MINUTE * 10;
export const DEBOUNCE_DELAY = 300;

// keys
export const LOCAL_DB_KEYS = {
  userClockCheckPauseObj: "user-clock-check-pause-obj",
};

export const REALTIME_DATABASE_NODE_NAMES = {
  settings: "SETTINGS/",
  inventory: "INVENTORY/",
  openWorkorders: "OPEN-WORKORDERS/",
  paymentProcessing: "PAYMENT-PROCESSING/",
  printing: "PRINTING/",
  punchClock: "PUNCH-CLOCK/",
};

export const FIRESTORE_COLLECTION_NAMES = {
  punchHistory: "PUNCH-HISTORY/",
  closedWorkorders: "CLOSED-WORKORDERS/",
  customers: "CUSTOMERS/",
  sales: "SALES/",
};

// dimensions
export const TAB_MENU_HEIGHT = 40;

// words

// objects & functions
export const PERMISSION_LEVELS = {
  superUser: {
    name: "Super-User",
    level: 4,
    id: "dkfnkd",
  },
  admin: {
    name: "Admin",
    level: 3,
    id: "dkfngggdkn",
  },
  editor: {
    name: "Editor",
    level: 2,
    id: "dnfkddnj",
  },
  user: {
    name: "User",
    level: 1,
    id: "andkfjdi",
  },
};

// database path builder /////////////////////////////////////////////////
export const build_db_path = {
  punchHistory: (punchID, tenantID, storeID) => {
    let str =
      `${tenantID}/${storeID}/` + FIRESTORE_COLLECTION_NAMES.punchHistory;
    if (punchID) str += "/" + punchID + "/";
    return str;
  },
  settings: (fieldName, tenantID, storeID) => {
    let path =
      `${tenantID}/${storeID}/` + REALTIME_DATABASE_NODE_NAMES.settings;
    if (fieldName) path += fieldName + "/";
    return path;
  },
  punchClock: (tenantID, storeID) =>
    `${tenantID}/${storeID}/` + REALTIME_DATABASE_NODE_NAMES.punchClock,
  inventory: (fieldID, tenantID, storeID) => {
    let str =
      `${tenantID}/${storeID}/` + REALTIME_DATABASE_NODE_NAMES.inventory;
    if (fieldID) str += fieldID + "/";
    return str;
  },
  openWorkorders: (fieldID, tenantID, storeID) => {
    let str =
      `${tenantID}/${storeID}/` + REALTIME_DATABASE_NODE_NAMES.openWorkorders;
    if (fieldID) str += fieldID + "/";
    return str;
  },
  closedWorkorders: (fieldID, tenantID, storeID) => {
    let str =
      `${tenantID}/${storeID}/` +
      FIRESTORE_COLLECTION_NAMES.closedWorkorders +
      "closed-workorders-obj/";
    if (fieldID) str += fieldID + "/";
    return str;
  },
  customer: (customerID, tenantID, storeID) => {
    return (
      `${tenantID}/${storeID}/` +
      FIRESTORE_COLLECTION_NAMES.customers +
      customerID +
      "/"
    );
  },
  sales: (salesObjID, tenantID, storeID) => {
    return (
      `${tenantID}/${storeID}/` +
      FIRESTORE_COLLECTION_NAMES.sales +
      salesObjID +
      "/"
    );
  },
  cardPaymentFlow: (readerID, paymentIntentID, tenantID, storeID) => {
    return (
      `${tenantID}/${storeID}/` +
      REALTIME_DATABASE_NODE_NAMES.paymentProcessing +
      readerID +
      "/" +
      paymentIntentID +
      "/"
    );
  },
  // Cloud Storage path generators
  cloudStorage: {
    // Basic file paths
    file: (path) => path,
    folder: (folderPath) => folderPath,

    // Completed workorder paths with tenantID/storeID structure
    completedWorkorder: (
      workorderID,
      tenantID,
      storeID,
      status = "completed",
      year = null,
      month = null
    ) => {
      const date = new Date();
      const targetYear = year || date.getFullYear();
      const targetMonth = month || String(date.getMonth() + 1).padStart(2, "0");
      const timestamp = Date.now();
      return `${tenantID}/${storeID}/completed-workorders/${status}/${targetYear}/${targetMonth}/${workorderID}_${timestamp}.json`;
    },

    // Completed sale paths with tenantID/storeID structure
    completedSale: (
      saleID,
      tenantID,
      storeID,
      status = "completed",
      year = null,
      month = null
    ) => {
      const date = new Date();
      const targetYear = year || date.getFullYear();
      const targetMonth = month || String(date.getMonth() + 1).padStart(2, "0");
      const timestamp = Date.now();
      return `${tenantID}/${storeID}/completed-sales/${status}/${targetYear}/${targetMonth}/${saleID}_${timestamp}.json`;
    },

    // Punch history paths with tenantID/storeID structure
    punchHistory: (
      punchHistoryID,
      userID,
      tenantID,
      storeID,
      status = "active",
      year = null,
      month = null
    ) => {
      const date = new Date();
      const targetYear = year || date.getFullYear();
      const targetMonth = month || String(date.getMonth() + 1).padStart(2, "0");
      const timestamp = Date.now();
      return `${tenantID}/${storeID}/punch-history/${status}/${userID}/${targetYear}/${targetMonth}/${punchHistoryID}_${timestamp}.json`;
    },

    // Customer document paths with tenantID/storeID structure
    customerDocument: (
      customerID,
      documentType,
      tenantID,
      storeID,
      fileName = null
    ) => {
      const timestamp = Date.now();
      const finalFileName = fileName || `${documentType}_${timestamp}`;
      return `${tenantID}/${storeID}/customers/${customerID}/documents/${documentType}/${timestamp}_${finalFileName}`;
    },

    // Workorder attachment paths with tenantID/storeID structure
    workorderAttachment: (
      workorderID,
      attachmentType,
      tenantID,
      storeID,
      fileName = null
    ) => {
      const timestamp = Date.now();
      const finalFileName = fileName || `${attachmentType}_${timestamp}`;
      return `${tenantID}/${storeID}/workorders/${workorderID}/attachments/${attachmentType}/${timestamp}_${finalFileName}`;
    },
  },
};

// ============================================================================
// NEW DATABASE SYSTEM CONSTANTS (to replace old system)
// ============================================================================

// Database node/folder names for the new wrapper system
export const DB_NODES = {
  // Firestore collections
  FIRESTORE: {
    TENANTS: "tenants",
    STORES: "stores",
    SETTINGS: "settings",
    CUSTOMERS: "customers",
    OPEN_WORKORDERS: "open-workorders",
    INVENTORY: "inventory",
    EMAIL_USERS: "email_users",
    PUNCHES: "punches",
    PUNCH_CLOCK: "punch_clock",
    PRINTERS: "printers",
    PAYMENT_PROCESSING: "payment-processing",
    OUTGOING_MESSAGES: "outgoing-messages",
    INCOMING_MESSAGES: "incoming-messages",
  },

  // Realtime Database nodes
  REALTIME: {},

  STORAGE: {
    CLOSED_WORKORDERS: "closed-workorders",
  },
};


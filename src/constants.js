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
export const FACIAL_RECOGNITION_INTERVAL_MILLIS = 500;
export const PAUSE_USER_CLOCK_IN_CHECK_MILLIS = MILLIS_IN_MINUTE * 10;

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
  punchHistory: (punchID) => {
    let str = FIRESTORE_COLLECTION_NAMES.punchHistory;
    if (punchID) str += "/" + punchID + "/";
    return str;
  },
  settings: (fieldName) => {
    let path = REALTIME_DATABASE_NODE_NAMES.settings;
    if (fieldName) path += fieldName + "/";
    return path;
  },
  punchClock: () => REALTIME_DATABASE_NODE_NAMES.punchClock,
  inventory: (fieldID) => {
    let str = REALTIME_DATABASE_NODE_NAMES.inventory;
    if (fieldID) str += fieldID + "/";
    return str;
  },
  openWorkorders: (fieldID) => {
    let str = REALTIME_DATABASE_NODE_NAMES.openWorkorders;
    if (fieldID) str += fieldID + "/";
    return str;
  },
  closedWorkorders: (fieldID) => {
    let str =
      FIRESTORE_COLLECTION_NAMES.closedWorkorders + "closed-workorders-obj/";
    if (fieldID) str += fieldID + "/";
    return str;
  },
  customer: (customerID) => {
    return FIRESTORE_COLLECTION_NAMES.customers + customerID + "/";
  },
  sales: (salesObjID) => {
    return FIRESTORE_COLLECTION_NAMES.sales + salesObjID + "/";
  },
  cardPaymentFlow: (readerID, paymentIntentID) => {
    return (
      REALTIME_DATABASE_NODE_NAMES.paymentProcessing +
      readerID +
      "/" +
      paymentIntentID +
      "/"
    );
  },
};

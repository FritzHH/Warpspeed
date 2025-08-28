// numbers
export const FACE_DESCRIPTOR_CONFIDENCE_DISTANCE = 0.55;
export const MILLIS_IN_MINUTE = 60000;

// timing and interval
export const FACIAL_RECOGNITION_INTERVAL_MILLIS = 500;
export const PAUSE_USER_CLOCK_IN_CHECK_MILLIS = MILLIS_IN_MINUTE * 1;

// keys
export const LOCAL_DB_KEYS = {
  userClockCheckPauseObj: "user-clock-check-pause-obj",
};
export const REALTIME_DATABASE_NODE_NAMES = {
  settings: "SETTINGS/",
  inventory: "INVENTORY/",
  openWorkorders: "OPEN-WORKORDERS/",
  paymentProcessing: "PAYMENT-PROCESSSING/",
  printing: "PRINTING/",
  loggedInUsers: "LOGGED-IN-USERS/",
  // punchClock: "PUNCH-CLOCK/",
};

export const FIRESTORE_DATABASE_NODE_NAMES = {
  punchClock: "PUNCH-CLOCK/",
};

// dimensions
export const TAB_MENU_HEIGHT = 40;

// words

// objects & functions
export const PERMISSION_LEVELS = [
  {
    name: "Owner",
    level: 4,
  },
  {
    name: "Admin",
    level: 3,
  },
  {
    name: "Editor",
    level: 2,
  },
  {
    name: "User",
    level: 1,
  },
];

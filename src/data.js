/* eslint-disable */

import { DISCOUNT_TYPES, MILLIS_IN_HOUR, PERMISSION_LEVELS } from "./constants";
import { getRgbFromNamedColor } from "./utils";
import { C } from "./styles";
import { NONREMOVABLE_STATUSES, SETTINGS_OBJ } from "./shared/data";

// Re-exports so existing tenant-app imports (`import { SETTINGS_OBJ } from
// "./data"`) keep working after the move to src/shared/.
export { NONREMOVABLE_STATUSES, SETTINGS_OBJ };

////////// hardcoded settings and options ///////
export const SHADOW_RADIUS_NOTHING = {
  shadowOffset: { width: 0, height: 0 },
  shadowRadius: 0,
  shadowColor: "transparent",
};

const DARK_TEXT = "rgb(20, 20, 20)";

export const COLORS = [
  {
    textColor: DARK_TEXT,

    backgroundColor: "whitesmoke",
    label: "White",
  },
  {
    textColor: "white",

    backgroundColor: "blue",
    label: "Blue",
  },
  {
    textColor: DARK_TEXT,

    backgroundColor: "lightblue",
    label: "Light-blue",
  },
  {
    textColor: "white",

    backgroundColor: "red",
    label: "Red",
  },
  {
    textColor: "white",

    backgroundColor: "green",
    label: "Green",
  },

  {
    textColor: "whitesmoke",
    backgroundColor: "black",


    label: "Black",
  },
  {
    textColor: DARK_TEXT,

    backgroundColor: "yellow",
    label: "Yellow",
  },
  {
    textColor: "white",

    backgroundColor: "orange",
    label: "Orange",
  },
  {
    textColor: "white",

    backgroundColor: "maroon",
    label: "Maroon",
  },
  {
    textColor: "white",

    backgroundColor: "rgb(139,69,19)",
    label: "Brown",
  },
  {
    textColor: DARK_TEXT,

    backgroundColor: "rgb(192,192,192)",
    label: "Silver",
  },
  {
    textColor: DARK_TEXT,

    backgroundColor: "tan",
    label: "Tan",
  },
  {
    textColor: DARK_TEXT,

    backgroundColor: "beige",
    label: "Beige",
  },
  {
    textColor: "white",


    backgroundColor: "purple",
    label: "Purple",
  },
  {
    textColor: "white",

    backgroundColor: "darkgray",
    label: "Gray",
  },

  {
    textColor: DARK_TEXT,

    backgroundColor: "pink",
    label: "Pink",
  },
];

// NONREMOVABLE_STATUSES moved to src/shared/data.js — re-exported above.

export const CONTACT_RESTRICTIONS = {
  call: "call",
  email: "email",
};

export const WAIT_TIME_INCREMENTS = {
  day: "Days",
  week: "Weeks",
};


export const CUSTOMER_DEPOST_TYPES = {
  deposit: 'deposit',
  credit: 'credit',
  giftcard: 'giftcard',
}
export const CUSTOMER_DEPOSIT_PROTO = {
  id: "",              // deposit ID
  transactionId: "",   // ID of the transaction that funded this deposit
  amountCents: 0,      // current remaining balance (decremented on sale completion)
  reservedCents: 0,    // amount held by an in-progress checkout (not yet consumed)
  millis: 0,           // creation timestamp
  method: "",          // "cash" | "card" | "check"
  note: "",            // user-entered note
  last4: "",           // card last 4 digits (card deposits only, for display)
  type: "",            // "deposit" = regular deposit, "giftcard" = gift card
}



////////// names of stuff ////////////////////////////
export const INVENTORY_CATEGORY_NAMES = {
  parts: "Item",
  labor: "Labor",
};


export const TAB_NAMES = {
  infoTab: {
    customer: "Customer Entry",
    workorder: "Workorder View",
    checkout: "Checkout Screen",
  },
  itemsTab: {
    workorderItems: "Workorder Items",
    changeLog: "Change Log",
    dashboard: "Dashboard",
    customerList: "Customer List",
    ticketSearchResults: "Ticket Search Results",
    workorderSearchResults: "Workorder Search Results",
    empty: "Empty",
    emailView: "Email View",
    recentCustomers: "Recent Customers",
  },
  optionsTab: {
    // quickItems: "Quick Items",
    workorders: "Workorders",
    inventory: "Inventory",
    messages: "Messages",
    email: "Email",
  },
};

export const FOCUS_NAMES = {
  customerCell: "customerCell",
  customerLandline: "customerLandline",
  first: "first",
  last: "last",
  email: "email",
  street: "street",
  unit: "unit",
  city: "city",
  state: "state",
  zip: "zip",
  notes: "notes",
};

// Merged user shape exposed in-memory in useSettingsStore.settings.users[].
// Storage is split:
//   - Identity fields live on tenants/{tenantID}/users/{userID} (canonical).
//   - Per-store presence + ephemera live on settings.users[i] in each store.
// The settings listener hydrates per-store entries with identity from the
// tenant-level user docs so reader components see this merged shape.
//
// stores[]    = list of storeIDs this user is assigned to (tenant-level).
// disabled    = per-store soft-disable; true forces auto-logout for this store.
export const APP_USER = {
  first: "",
  last: "",
  id: "",
  permissions: "",
  phone: "",
  email: "",
  pin: "",
  faceDescriptor: "",
  linkedUserID: "",
  hourlyWage: "",
  preview: true,
  forwardSMS: false,
  hidden: false,
  disabled: false,
  stores: [],
  statuses: [/*status id's go in here*/],
  emailInboxes: [],
  pendingWorkorderIDs: [],
  loginMessageSuppressUntil: 0,
  personalNotes: [],
  showNewUserHelp: true,
};

export const TIME_PUNCH_PROTO = {
  userID: "",
  millis: "",
  id: "",
  option: "",
};

export const ALERT_SCREEN_PROTO = {
  showAlert: true,
  title: "Alert",
  message: "",
  alertBoxStyle: {},
  subMessage: "",
  btn1Text: "",
  btn2Text: "",
  btn3Text: "",
  btn1Icon: null,
  btn2Icon: null,
  btn3Icon: null,
  icon1Size: null,
  icon2Size: null,
  icon3Size: null,
  handleBtn1Press: null,
  handleBtn2Press: null,
  handleBtn3Press: null,
  canExitOnOuterClick: false,
  pauseOnBaseComponent: false,
};

export const SMS_PROTO = {
  phoneNumber: "",
  canRespond: false,
  millis: "",
  message: "",
  imageUrl: "",
  mediaUrls: [],
  hasMedia: false,
  customerID: "",
  read: false,
  id: "",
  type: "",
  deliverySuccess: false,
  senderUserObj: "",
  sentByUser: "",
  status: "",
  errorMessage: "",
  originalMessage: "",
  translatedFrom: "",
  translatedTo: "",
  translated: null, // { text, langCode, detectedFrom } — cached translation to avoid re-translating on every thread load
};

// payments stuff ///////////////////////////////////////////////////////////
export const DISCOUNT_OBJ_PROTO = {
  discountName: "",
  discountValue: 0,
  discountType: "",
  id: "",
  newPrice: 0,
  savings: 0,
  custom: false
};

export const TRANSACTION_PROTO = {
  id: "",
  method: "",                   // "cash" | "card"
  millis: 0,
  amountCaptured: 0,
  amountTendered: 0,
  salesTax: 0,

  // Card-specific
  last4: "",
  expMonth: "",
  expYear: "",
  cardType: "",
  cardIssuer: "",
  paymentProcessor: "",
  paymentIntentID: "",
  chargeID: "",
  authorizationCode: "",
  networkTransactionID: "",
  receiptURL: "",

  // Deposit/gift card
  depositType: "",              // "deposit" | "giftcard" | "" (empty = regular payment)

  refunds: [],
  items: [],
};

export const REFUND_PROTO = {
  id: "",
  transactionID: "",
  amount: 0,
  method: "",
  millis: 0,
  salesTax: 0,
  stripeRefundID: "",
  workorderLines: [],
  notes: null,
};

export const THIN_DEPOSIT_PROTO = {
  id: "",
  amountCents: 0,
}

export const SALE_PROTO = {
  id: "",
  millis: "",
  workorderIDs: [],
  transactionIDs: [],
  pendingTransactionIDs: [],
  pendingRefundIDs: [],
  amountCaptured: 0,
  creditsApplied: [],
  depositsApplied: [],
  subtotal: 0,
  discount: 0,
  salesTax: 0,
  salesTaxPercent: 0,
  total: 0,

};

export const CREDIT_APPLIED_PROTO = {
  id: "",
  transactionId: "",
  amount: 0,
  type: "",           // "deposit" | "giftcard" | "credit"
  ownerPhone: "",
  remainingBalance: 0,
  appliedMillis: 0,
};

export const ITEM_SALE_PROTO = {
  id: "",
  saleID: "",
  millis: 0,
  itemID: "",
  inventoryItemID: "",
  name: "",
  category: "",
  customPart: false,
  customLabor: false,
  minutes: 0,
  qty: 1,
  price: 0,
  salePrice: 0,
  discountObj: null,
  refunded: false,
};

// workorder stuff ////////////////////////////////////////////////////
export const WORKORDER_PROTO = {
  workorderNumber: "",
  hasNewSMS: false,
  paymentComplete: false,
  activeSaleID: "",
  paidOnMillis: "",
  saleID: "",
  id: "",
  customerID: "",
  customerFirst: "",
  customerLast: "",
  customerCell: "",
  customerLandline: "",
  customerEmail: "",
  customerContactRestriction: "",
  customerLanguage: "",
  brand: "",
  description: "",
  color1: {
    textColor: "",
    backgroundColor: "",
    label: "",
  },
  color2: {
    textColor: "",
    backgroundColor: "",
    label: "",
  },
  waitTime: "",
  waitTimeEstimateLabel: "",
  changeLog: [],
  startedBy: "",
  startedOnMillis: "",
  orderedItems: [],
  workorderLines: [],
  internalNotes: [],
  customerNotes: [],
  status: "newly_created",
  taxFree: false,
  itemNotHere: false,
  contacted: false,
  archived: false,
  media: [],
  customerPin: "",
  taxFreeReceiptNote: "",
  salesTax: "",
  pickupDelivery: {
    month: "",
    day: "",
    startTime: "",
    endTime: "",
  },
};

export const ITEM_ORDERED_PROTO = {
  id: "",
  partOrdered: "",
  partSource: "",
  partToBeOrdered: true,
  trackingNumber: "",
  partOrderEstimateMillis: "",
  partOrderedMillis: "",
};

export const WORKORDER_ITEM_PROTO = {
  qty: 1,
  intakeNotes: "",
  receiptNotes: "",
  inventoryItem: "",
  discountObj: "",
  id: "",
  useSalePrice: false,
  warranty: false,
};

export const CUSTOMER_PREVIOUS_BIKE_PROTO = {
  brand: "",
  description: "",
  color1: "",
  color2: "",
};

export const CUSTOMER_LANGUAGES = {
  english: "English",
  spanish: "Spanish",
  french: "French",
  german: "German",
  creole: "Creole",
  arabic: "Arabic",
}

export const CUSTOMER_CREDIT_PROTO = {
  id: "",
  text: "",
  amountCents: 0,
  reservedCents: 0,    // amount held by an in-progress checkout (not yet consumed)
  millis: "",
}

export const CUSTOMER_PROTO = {
  first: "",
  last: "",
  customerCell: "",
  customerLandline: "",
  contactRestriction: "",
  email: "",
  streetAddress: "",
  unit: "",
  city: "",
  state: "",
  zip: "",
  addressNotes: "",
  id: "",
  interactionRating: "",
  gatedCommunity: false,
  notes: "",
  workorders: [],
  previousBikes: [],
  sales: [],
  millisCreated: "",
  deposits: [],
  credits: [],
  language: CUSTOMER_LANGUAGES.english
};

export const CUSTOMER_PREVIEW_PROTO = {
  customerCell: "",
  customerLandline: "",
  first: "",
  last: "",
  id: "",
};

export const INVENTORY_ITEM_PROTO = {
  formalName: "",
  informalName: "",
  brand: "",
  price: 0,
  salePrice: 0,
  category: "Item",
  id: "",
  cost: "",
  primaryBarcode: "",
  barcodes: [],
  minutes: 0,
  customPart: false,
  customLabor: false,
  receiptNoteRequired: false,
};


export const MENU_BUTTON_PROTO = {
  type: "",
  name: "",
  items: [],
  buttons: [],
};

export const INTAKE_BUTTON_PROTO = {
  id: "",
  label: "",
  itemsToAdd: [/*inventory item IDs*/],
};

export const INTAKE_QUICK_BUTTON_PROTO = {
  id: "",
  label: "",
  inventoryItemID: "",
  x: 0,
  y: 0,
  w: 90,
  h: 40,
  fontSize: 11,
};

export const AUTO_CUSTOMER_NOTE_PROTO = {
  inventoryItemID: "",
  text: "",
  quickNoteIDs: [],
}

export const AUTO_CUSTOMER_NOTE_TEXTS = [
]

export const QUICK_TEXT_PROTO = {
  id: "",
  buttonLabel: "",
  text: "",
}

export const QUICK_CUSTOMER_NOTE_PROTO = {
  id: '',
  label: '',
  items: [
  ]
}

export const QUICK_CUSTOMER_NOTE_ITEM_PROTO = {
  id: "",
  buttonLabel: "",
  text: ""
}

export const PRINTER_PROTO = {
  id: "",
  printerName: "",
  printerInfo: "",
  label: "",
  active: false,
}

export const WAIT_TIMES_PROTO = {
  id: "",
  label: "",
  maxWaitTimeDays: "",
  removable: true,
}

export const CUSTOM_WAIT_TIME = {
  id: "custom_wait_time",
  label: "",
  maxWaitTimeDays: "",
  removable: true,
}

export const NONREMOVABLE_WAIT_TIMES = [
  {
    id: "34j3kj3vnkd",
    label: "No Estimate",
    maxWaitTimeDays: null,
    removable: false,
  }
]

export const QB_DEFAULT_W = 20;
export const QB_DEFAULT_H = 8;
export const QB_SNAP_PCT = 1;

export const QUICK_BUTTON_ITEM_PROTO = {
  inventoryItemID: "",
  label: "",
  x: 0,
  y: 0,
  w: QB_DEFAULT_W,
  h: QB_DEFAULT_H,
  fontSize: 10,
  backgroundColor: "",
  textColor: "",
}

export const QUICK_ITEM_BUTTON_PROTO = {
  id: "",
  name: "",
  parentID: null,
  items: [/*QUICK_BUTTON_ITEM_PROTO objects (or legacy string IDs)*/],
  removable: true,
}



export const SUBSCRIPTION_PROTO = {
  plan: "free",
  features: {
    texting: false,
    email: false,
    faceRecognition: false,
    multiStore: false,
    customBranding: false,
  },
  maxUsers: 3,
  stripeSubscriptionID: "",
  trialEndsAt: null,
  expiresAt: null,
  millisCreated: "",
};

export const SUBSCRIPTION_PLANS = {
  free: "free",
  basic: "basic",
  pro: "pro",
  enterprise: "enterprise",
};

export const SMS_TEMPLATE_PROTO = {
  id: "",
  label: "",
  content: "",
  type: "", // "" = general, "saleReceipt", "intakeReceipt"
  order: 0,
  showInChat: true,
}

export const EMAIL_TEMPLATE_PROTO = {
  id: "",
  label: "",
  subject: "",
  content: "",
  type: "", // "" = general, "saleReceipt", "intakeReceipt"
}

export const TEMPLATE_TYPES = {
  general: "",
  saleReceipt: "saleReceipt",
  intakeReceipt: "intakeReceipt",
};

export const TEMPLATE_TYPE_LABELS = {
  "": "General",
  saleReceipt: "Sale Receipt",
  intakeReceipt: "Intake Receipt",
};

export const STATUS_AUTO_TEXT_PROTO = {
  id: "",
  statusID: "",
  smsTemplateID: "",
  emailTemplateID: "",
  delayMinutes: 0,
  delaySeconds: 0,
};

export const NOTE_HELPER_PROTO = {
  id: "",
  label: "",
  items: [],
  intakeNotes: true,
  receiptNotes: true,
};

export const NOTE_HELPER_ITEM_PROTO = {
  id: "",
  buttonLabel: "",
  text: "",
};

// RECEIPT STUFF ////////////////////////////////////////////////////

// DB CONNECETED DO NOT CHANGE
export const RECEIPT_TYPES = {
  workorder: "Workorder",
  sales: "Sale",
  intake: "Intake",
  register: "pop-register",
  test: "Test",
  transaction: 'Transaction'
};

export const RECEIPT_PROTO = {
  customerContact: "",
  workorderNumber: "",
  customerFirstName: "",
  customerLastName: "",
  customerCell: "",
  customerLandline: "",
  customerEmail: "",
  customerAddress: "",
  customerContactRestriction: "",
  barcode: "",
  id: "",
  startedBy: "",
  receiptType: "",
  dateTime: "",
  brand: "",
  color1: "",
  color2: "",
  description: "",
  partSource: "",
  partOrdered: "",
  waitTime: "",
  amountPaid: "",
  startedOnDate: "",
  finishedOnDate: "",
  status: "",
  labor: "",
  parts: "",
  discount: "",
  subtotal: "",
  tax: "",
  salesTaxPercent: "",
  total: "",
  shopName: "Bonita Bikes LLC",
  shopContactBlurb: "",
  thankYouBlurb: "",
  taxFree: false,
  popCashRegister: false,
  persistFlag: false,
  intakeBlurb: "",
  workorderLines: [],
  customerNotes: [],
  internalNotes: [],
  payments: [],
};

// END RECEIPT STUFF /////////////////////////////////////////////

export const PRIVILEDGE_LEVELS = {
  admin: "Manager",
  superUser: "Admin",
  owner: "Owner",
  user: "User",
};

export function permissionToLevel(perm) {
  if (perm == null) return 0;
  if (typeof perm === "number") return perm;
  if (typeof perm === "object" && typeof perm.level === "number") return perm.level;
  if (typeof perm === "string") {
    switch (perm) {
      case "Owner": return 5;
      case "Admin": return 4;
      case "Super-User": return 4; // legacy
      case "Manager": return 3;
      case "Editor": return 2;
      case "User": return 1;
    }
  }
  return 0;
}

export function levelToPrivilegeName(level) {
  if (level >= 5) return "Owner";
  if (level >= 4) return "Admin";
  if (level >= 3) return "Manager";
  if (level >= 2) return "Editor";
  return "User";
}

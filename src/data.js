/* eslint-disable */

import { identity } from "lodash";
import { DISCOUNT_TYPES, MILLIS_IN_HOUR, PERMISSION_LEVELS } from "./constants";
import { getRgbFromNamedColor, lightenRGBByPercent } from "./utils";

////////// hardcoded settings and options ///////
export const SHADOW_RADIUS_NOTHING = {
  shadowOffset: { width: 0, height: 0 },
  shadowRadius: 0,
  shadowColor: "transparent",
};

export const COLORS = [
  {
    textColor: "black",

    backgroundColor: "whitesmoke",
    label: "White",
  },
  {
    textColor: "white",

    backgroundColor: "blue",
    label: "Blue",
  },
  {
    textColor: "black",

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
    textColor: "black",

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
    textColor: "black",

    backgroundColor: "rgb(192,192,192)",
    label: "Silver",
  },
  {
    textColor: "black",

    backgroundColor: "tan",
    label: "Tan",
  },
  {
    textColor: "black",

    backgroundColor: "beige",
    label: "Beige",
  },
  {
    textColor: "white",

    backgroundColor: "darkgray",
    label: "Gray",
  },
  {
    textColor: "black",


    backgroundColor: "lightgray",
    label: "Light-gray",
  },
  {
    textColor: "black",

    backgroundColor: "pink",
    label: "Pink",
  },
];

export const NONREMOVABLE_STATUSES = [
  {
    id: "newly_created",
    label: "Newly Created",
    textColor: "white",
    backgroundColor: "red",
    removable: false,
    requireWaitTime: false,
  },
  {
    id: "sale_in_progress",
    label: "Sale in Progress",
    textColor: "yellow",
    backgroundColor: "black",
    removable: false,
    requireWaitTime: false,
    systemOwned: true
  },
  {
    id: "finished_and_paid",
    label: "Finished & Paid",
    textColor: "white",
    backgroundColor: "green",
    removable: false,
    requireWaitTime: false,
    systemOwned: true
  },
  {
    id: "on_the_stand",
    label: "On the Stand",
    textColor: "white",
    backgroundColor: "pink",
    removable: false,
    requireWaitTime: false,
  },
  {
    id: "service",
    textColor: "black",
    backgroundColor: "rgb(192,192,192)",
    label: "Service",
    removable: false,
    requireWaitTime: false,
  },
  {
    id: "finished",
    textColor: "white",
    backgroundColor: "green",
    label: "Finished",
    removable: false,
    requireWaitTime: false,
  },
  {
    id: "part_ordered",

    textColor: "white",
    backgroundColor: "orange",
    label: "Part Ordered",
    removable: false,
  },

];

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
  parts: "Parts",
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
    preview: "Preview",
    empty: "Empty",
  },
  optionsTab: {
    // quickItems: "Quick Items",
    workorders: "Workorders",
    inventory: "Inventory",
    messages: "Messages",
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

export const APP_USER = {
  first: "",
  last: "",
  id: "",
  permissions: "",
  phone: "",
  email: "",
  pin: "",
  faceDescriptor: "",
  hourlyWage: "",
  preview: true,
  forwardSMS: false,
  statuses: [/*status id's go in here*/],
  pendingWorkorderIDs: [],
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
  status: "",
  errorMessage: "",
  originalMessage: "",
  translatedFrom: "",
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
  notes: "",
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
  endedOnMillis: "",
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
  partOrdered: "",
  partSource: "",
  partToBeOrdered: false,
  partOrderEstimateMillis: "",
  partOrderedMillis: "",
  workorderLines: [],
  internalNotes: [],
  customerNotes: [],
  status: "",
  taxFree: false,
  archived: false,
  media: [],
  customerPin: "",
  taxFreeReceiptNote: "",
  salesTax: ""
};

export const TAX_FREE_RECEIPT_NOTE = "No items on this workorder were taxable under Florida law. All items are labor-only, and no shop parts or material left the shop with the customer."

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
  category: "Part",
  id: "",
  cost: "",
  primaryBarcode: "",
  barcodes: [],
  minutes: 0,
  customPart: false,
  customLabor: false,
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
}

export const AUTO_CUSTOMER_NOTE_TEXTS = [
]

export const QUICK_TEXT_PROTO = {
  id: "",
  buttonLabel: "",
  text: "",
}

export const PRINTER_PROTO = {
  id: "",
  printerName: "",
  printerInfo: "",
  label: "",
  online: "",
  lastSeen: "",
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

export const QB_DEFAULT_W = 10;
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
}

export const QUICK_ITEM_BUTTON_PROTO = {
  id: "",
  name: "",
  parentID: null,
  items: [/*QUICK_BUTTON_ITEM_PROTO objects (or legacy string IDs)*/],
  removable: true,
}

// // fill in this proto
// export const QUICK_BUTTON_PROTO = {
//   id: "",
//   label: "",
//   inventoryItemIDs: "",
//   removable: true,
// }


// Objects with initial data /////////////////////////////////////////
export const FRITZ_USER_OBJ = {
  first: "Fritz",
  last: "Hieb",
  id: "1234",
  permissions: {
    name: "Owner",
    level: 4,
  },
  phone: "2393369177",
  pin: "33",
  hourlyWage: 25,
  faceDescriptor: {
    0: -0.08356249332427979,
    1: 0.030545273795723915,
    2: 0.05588621273636818,
    3: -0.06060313060879707,
    4: -0.05359653756022453,
    5: -0.01939350925385952,
    6: 0.0012631339486688375,
    7: 0.0018589537357911468,
    8: 0.08268243819475174,
    9: -0.055229537189006805,
    10: 0.19013765454292297,
    11: -0.0012440045829862356,
    12: -0.2986530661582947,
    13: -0.12361864000558853,
    14: -0.0713139995932579,
    15: 0.10426091402769089,
    16: -0.058700911700725555,
    17: -0.07068075984716415,
    18: -0.13894975185394287,
    19: -0.1962697058916092,
    20: 0.07163803279399872,
    21: 0.07829409837722778,
    22: -0.0598553791642189,
    23: -0.04281605780124664,
    24: -0.16501425206661224,
    25: -0.20128032565116882,
    26: -0.026499086990952492,
    27: -0.08199058473110199,
    28: 0.0372474268078804,
    29: -0.12906157970428467,
    30: 0.02821650356054306,
    31: 0.05682585388422012,
    32: -0.12148132920265198,
    33: -0.037803083658218384,
    34: 0.009363692253828049,
    35: 0.116693876683712,
    36: -0.05069110915064812,
    37: -0.1288541704416275,
    38: 0.1894485205411911,
    39: -0.012517704628407955,
    40: -0.0801064595580101,
    41: 0.018130779266357422,
    42: 0.03912799060344696,
    43: 0.28346168994903564,
    44: 0.1993083357810974,
    45: -0.08222067356109619,
    46: 0.06975080817937851,
    47: -0.03273903205990791,
    48: 0.11776532232761383,
    49: -0.23213298618793488,
    50: 0.019247712567448616,
    51: 0.1364879012107849,
    52: 0.0709308460354805,
    53: 0.08922133594751358,
    54: 0.14629285037517548,
    55: -0.175067737698555,
    56: -0.017330007627606392,
    57: 0.1788560152053833,
    58: -0.20333710312843323,
    59: 0.012148668058216572,
    60: -0.05681969225406647,
    61: -0.051024388521909714,
    62: -0.12820537388324738,
    63: -0.13195288181304932,
    64: 0.11997037380933762,
    65: 0.05090988054871559,
    66: -0.14829449355602264,
    67: -0.16311560571193695,
    68: 0.25104212760925293,
    69: -0.14402611553668976,
    70: -0.030522281304001808,
    71: 0.09613391011953354,
    72: -0.12035930901765823,
    73: -0.12393686175346375,
    74: -0.23255887627601624,
    75: 0.12333190441131592,
    76: 0.3730975091457367,
    77: 0.1611321121454239,
    78: -0.1548864245414734,
    79: 0.10769917070865631,
    80: -0.030401846393942833,
    81: -0.06165820360183716,
    82: 0.03774119168519974,
    83: 0.025813637301325798,
    84: -0.03088284656405449,
    85: 0.035763490945100784,
    86: -0.022360308095812798,
    87: 0.08113954961299896,
    88: 0.11537189781665802,
    89: 0.012981901876628399,
    90: -0.07502690702676773,
    91: 0.12572041153907776,
    92: 0.021844938397407532,
    93: -0.05626436322927475,
    94: 0.06164783611893654,
    95: 0.00508253974840045,
    96: -0.10819776356220245,
    97: -0.004912760574370623,
    98: -0.09380382299423218,
    99: -0.00370375020429492,
    100: 0.126202791929245,
    101: -0.21794623136520386,
    102: 0.035878147929906845,
    103: 0.0736437663435936,
    104: -0.09861690551042557,
    105: 0.1964632123708725,
    106: 0.005048724822700024,
    107: -0.0019016065634787083,
    108: -0.05217141658067703,
    109: -0.06180668622255325,
    110: -0.09843076765537262,
    111: 0.1388702392578125,
    112: 0.20397984981536865,
    113: -0.2914722263813019,
    114: 0.22066673636436462,
    115: 0.13160794973373413,
    116: 0.023659158498048782,
    117: 0.14717306196689606,
    118: 0.10679502785205841,
    119: 0.046776700764894485,
    120: 0.02814277820289135,
    121: -0.024327382445335388,
    122: -0.16715092957019806,
    123: -0.13745740056037903,
    124: -0.021991413086652756,
    125: -0.02324635162949562,
    126: 0.09107036888599396,
    127: 0.048106178641319275,
  },
  // role: PERMISSION_LEVELS.superUser,
};

export const SETTINGS_OBJ = {
  laborRateByHour: 9000,
  statuses: [
    ...NONREMOVABLE_STATUSES,
    {
      id: "finished",
      textColor: "white",
      backgroundColor: "green",
      label: "Finished - No Auto Text",
      removable: true,
      requireWaitTime: false,
    },
    {
      id: "1334453",
      textColor: "white",
      backgroundColor: "orange",
  
      label: "Order Part for Customer",
      removable: true,
    },

    {
      id: "ek3rkeng",
      textColor: "white",
      backgroundColor: "blue",
  
      label: "Messaging Customer",
      removable: true,
    },
  ],
  quickItemButtons: [
    { id: "38trrneg", name: "Tune-Up", parentID: null, items: [], removable: true },
    { id: "38trrdfdneg", name: "Tube", parentID: null, items: ["3Rh6JaP75v1esbywt18E", "9xCMXA89wZeAt1IBfLoU"], removable: true },
    { id: "38trrsdfneg", name: "Tire", parentID: null, items: [], removable: true },
    { id: "38trdfdrneg", name: "Tube & Tire", parentID: null, items: [], removable: true },
    { id: "38trdfadrneg", name: "Brakes", parentID: null, items: [], removable: true },
    { id: "38tradfdrneg", name: "Cable", parentID: null, items: ["Rcr7QgWyNPapdoYVuS7P", "9xCMXA89wZeAt1IBfLoU"], removable: true },
    { id: "38trrnebfdgdg", name: "Shifting", parentID: null, items: ["iBFklersI6UmzR8x1ADn", "Rcr7QgWyNPapdoYVuS7P"], removable: true },
    { id: "38trrnadfvceg", name: "Drivetrain", parentID: null, items: [], removable: true },
    { id: "38trsadgdvdrneg", name: "Spoke", parentID: null, items: [], removable: true },
    { id: "38trerfedgbdrneg", name: "Cleaning", parentID: null, items: [], removable: true },
    { id: "38trrfrdggdneg", name: "Scooter", parentID: null, items: [], removable: true },
    { id: "bnfdeqw", name: "Pickup/Delivery", parentID: null, items: [], removable: true },
    { id: "34trhrg", name: "Diagnostics", parentID: null, items: [], removable: true },
    { id: "labor", name: "$Labor", parentID: null, items: [], removable: false },
    { id: "part", name: "$Part", parentID: null, items: [], removable: false },
    { id: "common", name: "Common", parentID: null, items: [], removable: false },
  ],
  // quickButtons: [],
  // colors:
  bikeBrands: ["Trek", "Specialized", "Sun", "Marin", "Cannondale", "Jamis"],
  bikeBrandsName: "Bikes",
  bikeOptionalBrands: ["Euphree", "Lectric", "Hiboy", "Ridstar", "Velowave"],
  bikeOptionalBrandsName: "E-bikes",
  discounts: [
    {
      id: "1333k",
      name: "50% Off Item",
      value: "50",
      type: DISCOUNT_TYPES.percent,
    },
    {
      id: "193j3k",
      name: "10% Off Item",
      value: "10",
      type: DISCOUNT_TYPES.percent,
    },
    {
      id: "394393",
      name: "20% Off Item",
      value: "20",
      type: DISCOUNT_TYPES.percent,
    },
    {
      id: "394393d",
      name: "30% Off Item",
      value: "30",
      type: DISCOUNT_TYPES.percent,
    },
    {
      id: "3943933",
      name: "40% Off Item",
      value: "40",
      type: DISCOUNT_TYPES.percent,
    },
    {
      id: "394393343",
      name: "50% Off Item",
      value: "50",
      type: DISCOUNT_TYPES.percent,
    },
    {
      id: "3k3nh",
      name: "2-bike purchase, $100 Off Each Bike",
      value: "10000",
      type: DISCOUNT_TYPES.dollar,
    },
    {
      id: "343gfg",
      name: "$10 Off",
      value: "1000",
      type: DISCOUNT_TYPES.dollar,
    },
  ],
  waitTimeLinkedStatus: {},
  waitTimeLabelCategories: [
    {
      id: 'dkfjdk',
      label: "First half {weekDayName}"
    },
    { id: 'ndfkdaj', label: 'Second half {weekDayName}' }
  ],
  waitTimes: [
    {
      id: "34j3kj3dfdfgfkj3",
      label: "Waiting",
      maxWaitTimeDays: 0,
    },
    {
      id: "34jngfedde3kj3kj3",
      label: "Today",
      maxWaitTimeDays: 0, removable: true,
    },
    {
      id: "34j3kjdww3kj3",
      label: "Tomorrow",
      maxWaitTimeDays: 1, removable: true,
    },
    {
      id: "34j3kj3",
      label: "1-2 Days",
      maxWaitTimeDays: 2, removable: true,
    },
    {
      id: "34j3kj33",
      label: "2-3 Days",
      maxWaitTimeDays: 3, removable: true,
    },
    {
      id: "34j3kj3kj3",
      label: "3-5 Days",
      maxWaitTimeDays: 5, removable: true,
    },
    {
      id: "34j3kj33kj3n",
      label: "1 Week",
      maxWaitTimeDays: 7, removable: true,
    },
    {
      id: "34j3kj3,rkjk",
      label: "1-2 Weeks",
      maxWaitTimeDays: 14, removable: true,

    },
    {
      id: "34j3kj3vnkd",
      label: "No Estimate",
      maxWaitTimeDays: 0,
      removable: false,
    },
  ],
  storeHours: {
    standard: [
      {
        name: "Monday",
        id: "dkfjdkfn",
        open: "10:00 AM",
        close: "6:00 PM",
        isOpen: true,
      },
      {
        name: "Tuesday",
        id: "dkfjdkf3r3n",
        open: "10:00 AM",
        close: "6:00 PM",
        isOpen: true,
      },
      {
        name: "Wednesday",
        id: "dkfjdkfdkfjdkn",
        open: "10:00 AM",
        close: "6:00 PM",
        isOpen: true,
      },
      {
        name: "Thursday",
        id: "dkfjdkf34rjk3n",
        open: "10:00 AM",
        close: "6:00 PM",
        isOpen: true,
      },
      {
        name: "Friday",
        id: "dkfjdkfkenjrken",
        open: "10:00 AM",
        close: "6:00 PM",
        isOpen: true,
      },
      {
        name: "Saturday",
        id: "dkfjdk3krjfn",
        open: "10:00 AM",
        close: "6:00 PM",
        isOpen: true,
      },
      {
        name: "Sunday",
        id: "dkfjdkf3nrkejn",
        open: "10:00 AM",
        close: "6:00 PM",
        isOpen: true,
      },
    ],
    special: [
      {
        name: "4th of July",
        dateMillies: 123434455544,
        id: "dkfjdkf3nrk333ejn",
        open: "10:00 AM",
        close: "6:00 PM",
        isOpen: false,
      },
    ],
  },
  storeInfo: {
    displayName: "Bonita Bikes LLC",
    street: "9102 Bonita Beach Rd SE",
    unit: "",
    city: "Bonita Springs",
    state: "Florida",
    zip: "34135",
    phone: "2393369177",
  },
  receiptSetup: {
    includeFieldsInReceipt: ["displayName", "street", "city", "state", "phone"],
  },
  printers: {

  },
  labelLayouts: [],
  quickPrintLayouts: [],
  defaultLabelSize: { name: '2.25" x 1.25"', width: 464, height: 254 },
  autoSMSIntakeReceipt: true,
  autoEmailIntakeReceipt: true,
  autoPrintIntakeReceipt: true,
  autoSMSSalesReceipt: true,
  autoEmailSalesReceipt: true,
  autoPrintSalesReceipt: true,
  shopContactBlurb: "9102 Bonita Beach Rd SE\nBonita Springs, FL\n(239) 291-9396\nsupport@bonitabikes.com\nwww.bonitabikes.com",
  intakeBlurb: "This ticket is an estimate only. We will contact you with any major additions or changes. Minor additions or changes will be made at our discretion.",
  thankYouBlurb: "Thanks you for visiting Bonita Bikes! \nWe value your business and satisfaction with our services. \n\nPlease call or email anytime, we look forward to seeing you again.",
  bikeDescriptions: ["Hybrid", "E-Bike", "Cruiser", "Road Bike"],
  partSources: ["JBI", "QBP", "Amazon", "Ebay", "Customer"],
  smsConversationLockTimeout: 2, //days
  smsBlockedNumbers: [], // array of 10-digit phone strings
  activeLoginTimeoutSeconds: 7,
  userInactivityTimeout: 120,
  idleLoginTimeoutHours: 24,
  salesTaxPercent: 6.5,
  acceptChecks: true,
  userPinStrength: 2,
  cardRefundFeePercent: 3,
  useCardFee: false,
  cardFeePercent: 3,
  cardFeeRefund: false,
  lockScreenWhenUserLogsOut: false,
  autoSMSSalesReceipt: true,
  autoEmailSalesReceipt: true,
  autoSMSIntakeReceipt: true,
  autoEmailIntakeReceipt: true,
  tenantID: "1234",
  storeID: "999",
  users: [FRITZ_USER_OBJ],
  cardReaders: [],
  selectedCardReaderObj: {
    label: "",
    id: "",
  },
  defaultPayrollTimeFrame: {
    "begin": 'lastFriday',
    "end": 'thisThursday',
  },
  autoConnectToCardReader: "true",
  amazonExtension: {
    enabled: true,
    storeId: 999, // Will be auto-generated from tenantID_storeID
    shippingAddress: {
      fullName: "",
      addressLine1: "",
      addressLine2: "",
      city: "",
      state: "",
      zipCode: "",
      phoneNumber: "",
    },
    lastSync: null,
    extensionVersion: "1.0.0",
    autoSync: true,
    features: {
      autoFill: true,
      simplifyUI: true,
      hideAds: true,
      quickSearch: true,
    },
  },
  smsTemplates: [
    {
      id: "dfdas",
      label: "Finished",
      content: "Hi {firstName}, your {brand} {description} is ready for pickup! Your total is {totalAmount}. We're open {storeHours}. Call us at {storePhone} with any questions.",
      type: "",
      order: 0,
      showInChat: true,
    },
    {
      id: "fkdnfdfd",
      label: "Part Ordered",
      content: "Hi {firstName}, we've ordered a part for your {brand} {description}. As soon as we get the part we will proceed with the requested service. Call us at {storePhone} with any questions.",
      type: "",
      order: 0,
      showInChat: true,
    },
    {
      id: "default_sms_sale_receipt",
      label: "Sale Receipt",
      content: "🎉 Thanks for your purchase, {firstName}! Your total was {total}. Here's your receipt: {link}\n\nWe appreciate your business! — {storeName} 🚲",
      type: "saleReceipt",
      order: 0,
      showInChat: false,
    },
    {
      id: "default_sms_intake_receipt",
      label: "Intake Receipt",
      content: "🔧 Hey {firstName}! Your {brand} {description} is checked in and in good hands. Here's your receipt: {link}\n\nTrack your workorder: {workorderLink}\n\nWe'll keep you posted! — {storeName} 🚲",
      type: "intakeReceipt",
      order: 0,
      showInChat: false,
    },
  ],
  autoCustomerNoteTexts: [],
  translateStarters: [
    {
      id: "greeting_1",
      label: "Greeting",
      text: "Hello, welcome to our store. If you have a translation app on your phone, we can use it together to help you with whatever you need. Please show us your screen and we will type here.",
      language: "en",
    },
  ],
  emailTemplates: [
    {
      id: "default_workorder_complete",
      label: "Workorder Complete",
      subject: "Your bike is ready! — {storeName}",
      content: "Hi {firstName},\n\nGreat news — your {brand} {description} is ready for pickup!\n\nItems completed:\n{lineItems}\n\n{customerNotes}\n\nTotal: {totalAmount}\n\n---\n{storeName}\n{storeAddress}\n{storeHours}\n{storePhone}\n\nPlease note: we do not monitor this inbox during the day, so responses may be delayed. You are better off calling the shop directly at {storePhone}.",
      type: "",
    },
    {
      id: "default_payroll_summary",
      label: "Payroll Summary",
      subject: "Payroll Summary — {employeeName} — {payPeriod}",
      content: "Hi {employeeName},\n\nHere is your work summary for {payPeriod}:\n\n{dailyBreakdown}\n\nTotal Hours: {totalHours}\nPay Rate: {payRate}\nTotal Pay: {totalPay}\n\n---\n{storeName}",
      type: "",
    },
    {
      id: "default_email_sale_receipt",
      label: "Sale Receipt",
      subject: "Your receipt from {storeName}",
      content: "Hi {firstName},\n\nThank you for your purchase! Your total was {total}.\n\n{receiptLink}\n\nWe appreciate your business and hope to see you again soon!\n\n---\n{storeName}",
      type: "saleReceipt",
    },
    {
      id: "default_email_intake_receipt",
      label: "Intake Receipt",
      subject: "Your {brand} is checked in — {storeName}",
      content: "Hi {firstName},\n\nYour {brand} {description} has been checked in and is in good hands. Here's a copy of your intake receipt for your records.\n\n{receiptLink}\n\n{workorderLink}\n\nWe'll keep you updated on the progress. If you have any questions in the meantime, don't hesitate to reach out!\n\n---\n{storeName}",
      type: "intakeReceipt",
    },
  ],
  statusAutoText: [],
  nextWorkorderCounter: 1,
  nextSaleCounter: 1,
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
  admin: "Admin",
  superUser: "Editor",
  owner: "Owner",
  user: "User",
};

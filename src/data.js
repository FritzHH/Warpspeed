/* eslint-disable */

import { DISCOUNT_TYPES, MILLIS_IN_HOUR, PERMISSION_LEVELS } from "./constants";
import { getRgbFromNamedColor, lightenRGBByPercent } from "./utils";
import { C } from "./styles";

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

export const NONREMOVABLE_STATUSES = [

  {
    id: "newly_created",
    label: "Newly Created",
    textColor: "white",
    backgroundColor: "red",
    removable: false,
    requireWaitTime: false,
    hidden: false,
  },

  {
    id: "work_in_progress",
    textColor: DARK_TEXT,
    backgroundColor: "rgb(192,192,192)",
    label: "Work in Progress",
    removable: false,
    hidden: false,
  },
  {
    id: "pickup",
    textColor: "white",
    backgroundColor: "purple",
    label: "Pickup",
    removable: false,
    hidden: false,
  },
  {
    id: "delivery",
    textColor: "white",
    backgroundColor: "purple",
    label: "Delivery",
    removable: false,
    hidden: false,
  },
  {
    id: "service",
    textColor: lightenRGBByPercent("rgb(0,0,0)", 28),
    backgroundColor: "rgb(192,192,192)",
    label: "Service",
    removable: false,
    requireWaitTime: false,
    hidden: false,
  },
  {
    id: "is_order_part_for_customer",
    textColor: "rgb(38,38,38)",
    backgroundColor: "red",
    label: "Order Item for Customer",
    removable: false,
    hidden: false,
  },
  {
    id: "finished",
    textColor: "white",
    backgroundColor: "green",
    label: "Finished",
    removable: false,
    requireWaitTime: false,
    hidden: false,
  },
  {
    id: "part_ordered",
    textColor: "white",
    backgroundColor: "orange",
    label: "Item Ordered",
    removable: false,
    hidden: true,
  },



  {
    id: "finished_and_paid",
    label: "Finished & Paid",
    textColor: "white",
    backgroundColor: "green",
    removable: false,
    requireWaitTime: false,
    systemOwned: true,
    hidden: false,
  },
  // {
  //   id: "finished_paid_",
  //   label: "Finished & Paid",
  //   textColor: "white",
  //   backgroundColor: "green",
  //   removable: false,
  //   requireWaitTime: false,
  //   systemOwned: true,
  //   hidden: false,
  // },
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
  emailInboxes: [],
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
  
      label: "Order Item for Customer",
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
    { id: "item", name: "$Item", parentID: null, items: [], removable: false },
    { id: "common", name: "Common", parentID: null, items: [], removable: false },
  ],
  // quickButtons: [],
  // colors:
  bikeBrands: ["Trek", "Specialized", "Sun", "Marin", "Cannondale", "Jamis"],
  bikeBrandsName: "Bikes",
  bikeOptionalBrands: ["Euphree", "Lectric", "Hiboy", "Ridstar", "Velowave"],
  bikeOptionalBrandsName: "E-bikes",
  allBrands: ["Cannondale", "Euphree", "Hiboy", "Jamis", "Lectric", "Marin", "Ridstar", "Specialized", "Sun", "Trek", "Velowave"],
  allDescriptions: ["Cruiser", "E-Bike", "Hybrid", "Road Bike"],
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
    supportEmail: "",
    officeEmail: "",
    textingNumber: "",
    storeLogo: "",
  },
  receiptSetup: {
    includeFieldsInReceipt: ["displayName", "street", "city", "state", "phone"],
  },
  printers: {

  },
  labelLayouts: [],
  labelTemplates: {},
  quickPrintLayouts: [],
  defaultLabelSize: { name: '2.25" x 1.25"', width: 464, height: 254 },
  autoSMSIntakeReceipt: true,
  autoEmailIntakeReceipt: true,
  autoPrintIntakeReceipt: true,
  autoSMSSalesReceipt: true,
  autoEmailSalesReceipt: true,
  autoPrintSalesReceipt: true,
  shopContactBlurb: "9102 Bonita Beach Rd SE\nBonita Springs, FL\n(239) 291-9396\nsupport@bonitabikes.com\nwww.bonitabikes.com",
  intakeBlurb: "This ticket is an estimate, and MAY NOT INCLUDE ALL ITEMS FOR THE SERVICE. We will add items as discussed, and call for unforseen major additions.",
  thankYouBlurb: "Thanks you for visiting Bonita Bikes! \nWe value your business and satisfaction with our services. \n\nPlease call or email anytime, we look forward to seeing you again.",
  waitTimeBlurbWithEstimate: "Wait times are a BEST ESTIMATE only; We will call/text/email when service is complete!",
  waitTimeBlurbWithoutEstimate: "We do not currently have an estimate. We will call/text/email when service is complete!",
  bikeDescriptions: ["Hybrid", "E-Bike", "Cruiser", "Road Bike"],
  partSources: ["JBI", "QBP", "Amazon", "Ebay", "Customer"],
  allPartSources: ["JBI", "QBP", "Amazon", "Ebay", "Customer"],
  smsConversationLockTimeout: 2, //days
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
  useFacialRecognition: true,
  faceRecognitionThreshold: 0.55,
  tenantID: "1234",
  storeID: "999",
  users: [],
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
      id: "finished_sms",
      label: "Finished",
      content: "Hi {firstName}, your {brand} {description} is ready for pickup! Your total is {totalAmount}. We're open {storeHours}. Call us at {storePhone} with any questions.",
      type: "",
      order: 0,
      showInChat: true,
      removable: false,
    },
    {
      id: "finished_multiple_items_sms",
      label: "Finished - Multiple Items",
      content: "Hi {firstName}, your {brands} are ready for pickup! Your total is {totalAmount}. We're open {storeHours}. Call us at {storePhone} with any questions.",
      type: "",
      order: 0,
      showInChat: true,
      removable: false,
    },
    {
      id: "fkdnfdfd",
      label: "Part Ordered",
      content: "Hi {firstName}, we've ordered a part for your {brand} {description}. As soon as we get the part we will proceed with the requested service. Call us at {storePhone} with any questions.",
      type: "",
      order: 0,
      showInChat: true,
      removable: true,
    },
    {
      id: "default_sms_sale_receipt",
      label: "Sale Receipt",
      content: "🎉 Thanks for your purchase, {firstName}! Your total was {total}. Here's your receipt: {link}\n\nWe appreciate your business! — {storeName} 🚲",
      type: "saleReceipt",
      order: 0,
      showInChat: false,
      removable: false,
    },
    {
      id: "default_sms_refund_receipt",
      label: "Refund Receipt",
      content: "Hey {firstName}, your refund of {total} has been processed. Here's your receipt: {link}\n\nThank you! — {storeName}",
      type: "refundReceipt",
      order: 0,
      showInChat: false,
      removable: false,
    },
    {
      id: "default_sms_intake_receipt",
      label: "Intake Receipt",
      content: "🔧 Hey {firstName}! Your {brand} {description} is checked in and in good hands. Here's your receipt: {link}\n\nTrack your workorder: {workorderLink}\n\nWe'll keep you posted! — {storeName} 🚲",
      type: "intakeReceipt",
    },
    {
      id: "default_sms_credit_receipt",
      label: "Credit Receipt",
      content: "💰 Hey {firstName}! A store credit of {amount} has been added to your account. Here's your receipt: {link}\n\nThank you! — {storeName}",
      type: "creditReceipt",
      removable: false,
    },
    {
      id: "default_sms_giftcard_receipt",
      label: "Gift Card Receipt",
      content: "🎁 Hey {firstName}! A gift card of {amount} has been loaded to your account. Here's your receipt: {link}\n\nThank you! — {storeName}",
      type: "giftCardReceipt",
      removable: false,
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
  emailGreeting: "{storeLogo}\nHi {firstName}, thanks for choosing {storeDisplayName}!",
  emailFooter: "{storeDisplayName}\n{storeStreet}, {storeCity}, {storeState} {storeZip}\n{storePhone}",
  emailGreetingAlign: "center",
  emailFooterAlign: "center",
  emailLogoWidth: 180,
  emailGreetingColorObj: { textColor: "white", backgroundColor: "#2E7D32", label: "Green" },
  emailSignature: { segments: [], imageUrl: "" },
  emailAccounts: [],
  emailTemplates: [
    {
      id: "finished_email",
      label: "Finished",
      subject: "Your bike is ready! - {storeName}",
      message: "Great news - your {brand} {description} is ready for pickup!\n\nItems completed:\n{lineItems}\n\n{customerNotes}\n\nTotal: {totalAmount}\n\nPlease note: we do not monitor this inbox during the day, so responses may be delayed. You are better off calling the shop directly at {storePhone}.",
      action: "",
      actionColorObj: { textColor: "white", backgroundColor: "green", label: "Green" },
      type: "",
      removable: false,
    },
    {
      id: "finished_multiple_items_email",
      label: "Finished - Multiple Items",
      subject: "Your bikes are ready! - {storeName}",
      message: "Great news - your {brands} are ready for pickup!\n\nTotal: {totalAmount}\n\nPlease note: we do not monitor this inbox during the day, so responses may be delayed. You are better off calling the shop directly at {storePhone}.",
      action: "",
      actionColorObj: { textColor: "white", backgroundColor: "green", label: "Green" },
      type: "",
      removable: false,
    },
    {
      id: "default_workorder_complete",
      label: "Workorder Complete",
      subject: "Your bike is ready! - {storeName}",
      message: "Great news - your {brand} {description} is ready for pickup!\n\nItems completed:\n{lineItems}\n\n{customerNotes}\n\nTotal: {totalAmount}\n\nPlease note: we do not monitor this inbox during the day, so responses may be delayed. You are better off calling the shop directly at {storePhone}.",
      action: "",
      actionColorObj: { textColor: "white", backgroundColor: "green", label: "Green" },
      type: "",
    },
    {
      id: "default_payroll_summary",
      label: "Payroll Summary",
      subject: "Payroll Summary - {employeeName} - {payPeriod}",
      message: "Here is your work summary for {payPeriod}:\n\n{dailyBreakdown}\n\nTotal Hours: {totalHours}\nPay Rate: {payRate}\nTotal Pay: {totalPay}",
      action: "",
      actionColorObj: { textColor: "white", backgroundColor: "green", label: "Green" },
      type: "",
    },
    {
      id: "default_email_sale_receipt",
      label: "Sale Receipt",
      subject: "Your receipt from {storeName}",
      message: "Thank you for your purchase! Your total was {total}.\n\nWe appreciate your business and hope to see you again soon!",
      action: "View Receipt",
      actionColorObj: { textColor: "white", backgroundColor: "green", label: "Green" },
      type: "saleReceipt",
    },
    {
      id: "default_email_refund_receipt",
      label: "Refund Receipt",
      subject: "Your refund from {storeName}",
      message: "Your refund of {total} has been processed.\n\nIf you have any questions, please don't hesitate to reach out.",
      action: "View Refund Receipt",
      actionColorObj: { textColor: "white", backgroundColor: "green", label: "Green" },
      type: "refundReceipt",
    },
    {
      id: "default_email_intake_receipt",
      label: "Intake Receipt",
      subject: "Your {brand} is checked in - {storeName}",
      message: "Your {brand} {description} has been checked in and is in good hands. Here's a copy of your intake receipt for your records.\n\nWe'll keep you updated on the progress. If you have any questions in the meantime, don't hesitate to reach out!",
      action: "View Intake Receipt",
      actionColorObj: { textColor: "white", backgroundColor: "green", label: "Green" },
      type: "intakeReceipt",
    },
    {
      id: "default_email_credit_receipt",
      label: "Credit Receipt",
      subject: "Store credit added - {storeName}",
      message: "A store credit of {amount} has been added to your account.\n\nThank you for your business!",
      action: "View Credit Receipt",
      actionColorObj: { textColor: "white", backgroundColor: "green", label: "Green" },
      type: "creditReceipt",
    },
    {
      id: "default_email_giftcard_receipt",
      label: "Gift Card Receipt",
      subject: "Gift card loaded - {storeName}",
      message: "A gift card of {amount} has been loaded to your account.\n\nThank you!",
      action: "View Gift Card Receipt",
      actionColorObj: { textColor: "white", backgroundColor: "green", label: "Green" },
      type: "giftCardReceipt",
    },
  ],
  statusAutoText: [],
  noteHelpers: [{
    id: 'position',
    label: 'Position',
    items: [
      { id: 'pos1', buttonLabel: 'Front', text: '' },
      { id: 'pos2', buttonLabel: 'Rear', text: '' },
    ]
  },
  {
    id: 'brakes',
    label: 'Brakes',
    items: [
      { id: 'brk1', buttonLabel: 'Squealing', text: '' },
      { id: 'brk2', buttonLabel: 'Broken', text: '' },
      { id: 'brk3', buttonLabel: 'Very contaminated', text: '' },
    ]
  },
  {
    id: 'tires',
    label: 'Tires',
    items: [
      { id: 'tir1', buttonLabel: 'Worn', text: '' },
      { id: 'tir2', buttonLabel: 'Broken', text: '' },
    ]
  },
  {
    id: 'tube',
    label: 'Tube',
    items: [
      { id: 'tub1', buttonLabel: 'Slow leak', text: '' },
    ]
  },
  {
    id: 'cable',
    label: 'Cables',
    items: [
      { id: 'cab1', buttonLabel: 'Brake', text: '' },
      { id: 'cab2', buttonLabel: 'Shifter', text: '' },
      { id: 'cab3', buttonLabel: 'Corroded', text: '' },
      { id: 'cab4', buttonLabel: 'Kinked', text: '' },
    ]
  },
  {
    id: 'chain',
    label: 'Chain',
    items: [
      { id: 'chn1', buttonLabel: 'Stretched', text: '' },
      { id: 'chn2', buttonLabel: 'Corroded', text: '' },
      { id: 'chn3', buttonLabel: 'Twisted', text: '' },
    ]
  },
  {
    id: 'gears',
    label: 'Gears',
    items: [
      { id: 'ger1', buttonLabel: 'Worn', text: '' },
      { id: 'ger2', buttonLabel: 'Corroded', text: '' },
    ]
  },
  {
    id: 'wheels',
    label: 'Wheels',
    items: [
      { id: 'whl1', buttonLabel: 'Spokes', text: '' },
      { id: 'whl2', buttonLabel: 'Damaged', text: '' },
    ]
  },
  {
    id: 'shifter',
    label: 'Shifter',
    items: [
      { id: 'shf1', buttonLabel: 'Gummed', text: '' },
      { id: 'shf2', buttonLabel: 'Broken', text: '' },
      { id: 'shf3', buttonLabel: 'Try to recover', text: '' },
    ]
  },
  {
    id: 'customer',
    label: 'Customer Request',
    items: [
      { id: 'cst1', buttonLabel: 'Customer Request', text: '' },
    ]
  },
  ],
  noteHelpersTarget: "intakeNotes",
  customerQuickNotes: [{
    id: 'tune',
    label: 'Tune-up',
    items: [ // usese QUICK_CUSTOMER_NOTE_ITEM_PROTO
      {
        id: 'dndkjk',
        buttonLabel: "Standard",
        text: `- tuned shifting
      - tuned/adjusted brakes
      - cleaned & lubed chain
      - cleaned frame`
      }
    ]
  },
  {
    id: 'tube',
    label: 'Tubes',
    items: [
      {
        id: "dknfdk",
        buttonLabel: "Small sharp",
        text: `Did some stuff`
      }
    ]
  }
  ],
  nextWorkorderCounter: 1,
  nextSaleCounter: 1,
};

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
  admin: "Admin",
  superUser: "Editor",
  owner: "Owner",
  user: "User",
};

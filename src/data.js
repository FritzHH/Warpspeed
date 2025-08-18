/* eslint-disable */

////////// hardcoded settings and options ///////
export const SHADOW_RADIUS_NOTHING = {
  shadowOffset: { width: 0, height: 0 },
  shadowRadius: 0,
  shadowColor: "transparent",
};

export const COLORS = [
  {
    textColor: "black",
    altTextColor: "dimgray",
    backgroundColor: "whitesmoke",
    label: "White",
  },
  {
    textColor: "white",
    altTextColor: "gray",
    backgroundColor: "blue",
    label: "Blue",
  },
  {
    textColor: "black",
    altTextColor: "gray",
    backgroundColor: "lightblue",
    label: "Light-blue",
  },
  {
    textColor: "white",
    altTextColor: "gray",
    backgroundColor: "red",
    label: "Red",
  },
  {
    textColor: "white",
    altTextColor: "lightgray",
    backgroundColor: "green",
    label: "Green",
  },

  {
    textColor: "whitesmoke",
    backgroundColor: "black",
    altTextColor: "lightgray",

    label: "Black",
  },
  {
    textColor: "black",
    altTextColor: "gray",
    backgroundColor: "yellow",
    label: "Yellow",
  },
  {
    textColor: "white",
    altTextColor: "dimgray",
    backgroundColor: "orange",
    label: "Orange",
  },
  {
    textColor: "white",
    altTextColor: "lightgray",
    backgroundColor: "maroon",
    label: "Maroon",
  },
  {
    textColor: "white",
    altTextColor: "lightgray",
    backgroundColor: "rgb(139,69,19)",
    label: "Brown",
  },
  {
    textColor: "black",
    altTextColor: "dimgray",
    backgroundColor: "rgb(192,192,192)",
    label: "Silver",
  },
  {
    textColor: "black",
    altTextColor: "gray",
    backgroundColor: "tan",
    label: "Tan",
  },
  {
    textColor: "black",
    altTextColor: "gray",
    backgroundColor: "beige",
    label: "Beige",
  },
  {
    textColor: "white",
    altTextColor: "dimgray",
    backgroundColor: "darkgray",
    label: "Gray",
  },
  {
    textColor: "black",
    altTextColor: "dimgray",

    backgroundColor: "lightgray",
    label: "Light-gray",
  },
  {
    textColor: "black",
    altTextColor: "dimgray",
    backgroundColor: "pink",
    label: "Pink",
  },
];

export const NONREMOVABLE_STATUSES = [
  {
    label: "Newly Created",
    textColor: "white",
    altTextColor: "black",
    backgroundColor: "red",
    removable: false,
  },
  {
    altTextColor: "dimgray",
    textColor: "black",
    backgroundColor: "rgb(192,192,192)",
    label: "Service",
    removable: false,
  },
  {
    altTextColor: "black",
    textColor: "white",
    backgroundColor: "green",
    label: "Finished",
    removable: false,
  },
];

export const WAIT_TIME_INCREMENTS = {
  day: "Days",
  week: "Weeks",
};

export const NONREMOVABLE_WAIT_TIMES = [
  {
    label: "Waiting",
    maxWaitTimeDays: 0,
  },
  {
    label: "Today",
    maxWaitTimeDays: 0,
  },
  {
    label: "Tomorrow",
    maxWaitTimeDays: 1,
  },
];

////////// names of stuff ////////////////////////////
export const INVENTORY_CATEGORY_NAMES = {
  parts: "Parts",
  labor: "Labor",
  bikes: "Bikes",
  accessories: "Accessories",
  other: "Other",
};

export const DISCOUNT_TYPES = {
  percent: "Percent",
  dollar: "Dollar Amount",
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
    preview: "Preview",
    empty: "Empty",
  },
  optionsTab: {
    quickItems: "Quick Items",
    workorders: "Workorders",
    inventory: "Inventory",
    messages: "Messages",
  },
};

export const FOCUS_NAMES = {
  cell: "cell",
  land: "land",
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

/////////// object prototypes ///////////////////////////////////////////////////
export const APP_USER = {
  first: "",
  last: "",
  id: "",
  permissions: "",
  phone: "",
  pin: "",
  alternatePin: "",
};

export const TIME_PUNCH_PROTO = {
  millis: "",
  userID: "",
  id: "",
  punchType: "",
};

export const ALERT_BOX_PROTO = {
  message: "",
  btnText1: "",
  btnText2: "",
  btnText3: "",
  handleBtn1Press: () => {},
  handleBtn2Press: () => {},
  handleBtn3Press: () => {},
  showBox: false,
  onModalDismiss: () => {},
  canExitOnOuterClick: true,
};

export const SMS_PROTO = {
  firstName: "",
  lastName: "",
  phoneNumber: "",
  canRespond: false,
  millis: "",
  message: "",
  customerID: "",
  read: false,
  id: "",
  type: "",
  deliverySuccess: false,
  senderUserObj: "",
};

export const DISCOUNT_OBJ_PROTO = {
  discountName: "",
  discountValue: "",
  discountType: "",
};

export const WORKORDER_PROTO = {
  isStandaloneSale: false,
  id: "",
  customerID: "",
  customerFirst: "",
  customerLast: "",
  customerPhone: "",
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
  changeLog: [],
  startedBy: "",
  startedOnMillis: "",
  partOrdered: "",
  partSource: "",
  itemIdArr: [],
  workorderLines: [],
  internalNotes: [],
  customerNotes: [],
  status: "",
  taxFree: false,
};

export const WORKORDER_ITEM_PROTO = {
  // itemName: "",
  qty: 1,
  notes: "",
  invItemID: "",
  discountObj: { ...DISCOUNT_OBJ_PROTO },
  id: "",
  // priceOverride: "",
};

export const CUSTOMER_PROTO = {
  first: "",
  last: "",
  cell: "",
  landline: "",
  contactRestriction: "",
  email: "",
  streetAddress: "",
  unit: "",
  city: "",
  state: "",
  zip: "",
  notes: "",
  id: "",
  interactionRating: "",
  workorders: [],
  payments: [],
  dateCreated: "",
};

export const CUSTOMER_PREVIEW_PROTO = {
  cell: "",
  landline: "",
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
  // category: ,
  id: "",
  upc: "",
  cost: "",
};

export const LABOR_ITEM_PROTO = {
  formalName: "",
  informalName: "",
  options: [],
  price: "",
};

export const MENU_BUTTON_PROTO = {
  type: "",
  name: "",
  items: [],
};

// Objects with initial data /////////////////////////////////////////
export const SETTINGS_OBJ = {
  statuses: [
    ...NONREMOVABLE_STATUSES,
    {
      textColor: "white",
      backgroundColor: "orange",
      altTextColor: "dimgray",
      label: "Order Part for Customer",
      removable: true,
    },
    {
      altTextColor: "dimgray",
      textColor: "white",
      backgroundColor: "orange",
      label: "Part Ordered",
      removable: true,
    },
    {
      textColor: "white",
      backgroundColor: "blue",
      altTextColor: "gray",
      label: "Messaging Customer",
      removable: true,
    },
  ],

  quickItemButtonNames: [
    {
      name: "Tune-Up",
      type: "menu",
      items: [],
    },
    {
      name: "Tube & Tire",
      type: "supermenu",
      items: [
        {
          name: "Tube",
          type: "menu",
          items: [],
        },
        {
          name: "Tire",
          type: "menu",
          items: [],
        },
      ],
    },
    {
      name: "Brakes",
      type: "submenu",
      items: [],
    },
    {
      name: "Cable",
      type: "menu",
      items: [],
    },
    {
      name: "Shifting",
      type: "menu",
      items: [],
    },
    {
      name: "Drivetrain",
      type: "menu",
      items: [],
    },

    {
      name: "Spoke",
      type: "menu",
      items: [],
    },
    {
      name: "Cleaning",
      type: "menu",
      items: [],
    },
    {
      name: "Scooter",
      type: "menu",
      items: [],
    },
    {
      name: "Pickup/Delivery",
      type: "menu",
      items: [],
    },
    {
      name: "Diagnostics",
      type: "menu",
      items: [],
    },
    {
      name: "$Labor",
      type: "menu",

      items: [],
    },

    {
      name: "$Part",
      type: "menu",
      items: [],
    },
  ],
  // colors:
  bikeBrands: ["Trek", "Specialized", "Sun", "Marin", "Cannondale", "Jamis"],
  bikeBrandsName: "Bikes",
  bikeOptionalBrands: ["Euphree", "Lectric", "Hiboy", "Ridstar", "Velowave"],
  bikeOptionalBrandsName: "E-bikes",
  discounts: [
    { name: "50% Off Item", value: "50", type: DISCOUNT_TYPES.percent },
    { name: "10% Off Item", value: "10", type: DISCOUNT_TYPES.percent },
    { name: "20% Off Item", value: "20", type: DISCOUNT_TYPES.percent },
    { name: "30% Off Item", value: "30", type: DISCOUNT_TYPES.percent },
    { name: "40% Off Item", value: "40", type: DISCOUNT_TYPES.percent },
    { name: "50% Off Item", value: "50", type: DISCOUNT_TYPES.percent },
    {
      name: "2-bike purchase, $100 Off Each Bike",
      value: "100",
      type: DISCOUNT_TYPES.dollar,
    },
    { name: "$10 Off", value: "10", type: DISCOUNT_TYPES.dollar },
  ],
  waitTimes: [
    ...NONREMOVABLE_WAIT_TIMES,
    {
      label: "1-2 Days",
      maxWaitTimeDays: 2,
    },
    {
      label: "2-3 Days",
      maxWaitTimeDays: 3,
    },
    {
      label: "3-5 Days",
      maxWaitTimeDays: 5,
    },
    {
      label: "1 Week",
      maxWaitTimeDays: 7,
    },
    {
      label: "1-2 Weeks",
      maxWaitTimeDays: 14,
    },
    {
      label: "No Estimate",
    },
  ],
  storeHours: {
    Monday: {
      open: "10:00 AM",
      close: "6:00 PM",
      isOpen: true,
    },
    Tuesday: {
      open: "10:00 AM",
      close: "6:00 PM",
      isOpen: true,
    },
    Wednesday: {
      open: "10:00 AM",
      close: "6:00 PM",
      isOpen: true,
    },
    Thursday: {
      open: "10:00 AM",
      close: "6:00 PM",
      isOpen: true,
    },
    Friday: {
      open: "10:00 AM",
      close: "6:00 PM",
      isOpen: true,
    },
    Saturday: {
      open: "10:00 AM",
      close: "6:00 PM",
      isOpen: true,
    },
    Sunday: {
      open: "10:00 AM",
      close: "6:00 PM",
      isOpen: true,
    },
  },
  specialStoreHours: [{ name: "4th of July", dateMillies: 123434455544 }],
  bikeDescriptions: ["Hybrid", "E-Bike", "Cruiser", "Road Bike"],
  partSources: ["JBI", "QBP", "Amazon", "Ebay", "Customer"],
  loginTimeout: 15,
  salesTax: 0.065,
  acceptChecks: true,
  users: [
    {
      first: "Fritz",
      last: "Hieb",
      id: "1234",
      permissions: "owner",
      phone: "2393369177",
      pin: "33",
      alternatePin: "jj",
    },
  ],
  cardReaders: [
    { label: "Front Right Desk", id: "tmr_GFKNEgYkwcsIFF" },
    { label: "Front Left Desk", id: "" },
  ],
  selectedCardReaderObj: {
    label: "Front Right Desk",
    id: "tmr_GFKNEgYkwcsIFF",
  },
  stripeBusinessLocationCode: "tml_GCsldAwakkr9vM",
  autoConnectToCardReader: "true",
};

// RECEIPT STUFF ////////////////////////////////////////////////////
export const RECEIPT_TYPES = {
  workorder: "Workorder",
  sales: "Sales",
  intake: "Intake",
  estimate: "Estimate",
  register: "pop-register",
};

export const PRINTER_NAMES = ["Left Printer", "Right Printer", "Back Printer"];

export const RECEIPT_LINE_ITEM_OBJ_PROTO = {
  itemName: "Brake Pads - Standard - BB Brand",
  notes: "Front and back",
  discountName: "10% Off",
  discountSavings: "-$1.22",
  totalPrice: "$3.23",
  itemPrice: "1.24",
  qty: "2",
};

export const SALES_TRANSACTION_TYPES = {
  cash: "Cash",
  card: "Card",
  check: "Check",
};

export const RECEIPT_PROTO = {
  salesTransactionBlurb: "",
  salesTransactionType: SALES_TRANSACTION_TYPES.card,
  heading: "",
  dateTime: "",
  numSalesReceipts: "2",
  receiptNumber: "1",
  workorderNumber: "",
  workorderItemBrand: "",
  workorderItemType: "",
  workorderItemColor: "",
  workorderNumber: "",
  customerFirstName: "",
  customerLastName: "",
  customerCell: "",
  customerLandline: "",
  customerEmail: "",
  customerAddress: "",
  customerContactRestriction: "",
  startedOnStr: "",
  lineItemArr: [],
  laborCharges: "",
  partsCharges: "",
  taxCharges: "",
  discountTotal: "",
  totalPrice: "",
  customerNotes: [],
  internalNotes: [],
  workorderBarcode: "",
  id: "",
  receiptType: "",
  location: "",
  printerName: "",
  barcode: "",
  shopContactBlurb:
    "9102 Bonita Beach Rd SE\n Bonita Springs, FL\n" +
    "(239) 291-9396\n" +
    "support@bonitabikes.com\n" +
    "www.bonitabikes.com",
  shopName: "Bonita Bikes LLC",
  thankYouBlurb:
    "Thanks you for visiting Bonita Bikes! \nWe value your business and satisfaction with our services. \n\nPlease call or email anytime, we look forward to seeing you again.",
};
// END RECEIPT STUFF /////////////////////////////////////////////

export const PRIVILEDGE_LEVELS = {
  admin: "Admin",
  superUser: "Editor",
  owner: "Owner",
  user: "User",
};

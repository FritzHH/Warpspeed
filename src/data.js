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
    label: "Newly Created",
    textColor: "white",
    backgroundColor: "red",
    removable: false,
    order: 1,
  },
  {
    textColor: "black",
    backgroundColor: "lightgray",
    label: "Service",
    removable: false,
    order: 2,
  },
  {
    textColor: "white",
    backgroundColor: "green",
    label: "Finished",
    removable: false,
    order: 3,
  },
];

export const WAIT_TIME_INCREMENTS = {
  day: "Days",
  week: "Weeks",
};

export const NONREMOVABLE_WAIT_TIMES = [
  {
    label: "Waiting",
    min: 1,
    max: 1,
    waitTimeValue: WAIT_TIME_INCREMENTS.day,
  },
  {
    label: "Today",
    min: 1,
    max: 1,
    waitTimeValue: WAIT_TIME_INCREMENTS.day,
  },
  {
    label: "Tomorrow",
    min: 1,
    max: 2,
    waitTimeValue: WAIT_TIME_INCREMENTS.day,
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
  itemName: "",
  qty: 1,
  notes: "",
  invItemID: "",
  discountObj: { ...DISCOUNT_OBJ_PROTO },
  id: "",
  price: "",
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
  price: 0,
  salePrice: 0,
  // category: ,
  id: "",
  upc: "",
  cost: "",
};

export const WAIT_TIME_PROTO = {
  label: "",
  time1: "",
  time2: "",
  waitTimeValue: "",
};

// Objects with initial data
export const SETTINGS_OBJ = {
  statuses: [
    ...NONREMOVABLE_STATUSES,
    {
      textColor: "white",
      backgroundColor: "orange",
      label: "Order Part for Customer",
      removable: true,
      order: 4,
    },
    {
      textColor: "white",
      backgroundColor: "orange",
      label: "Part Ordered",
      removable: true,
      order: 5,
    },
    {
      textColor: "white",
      backgroundColor: "blue",
      label: "Messaging Customer",
      removable: true,

      order: 6,
    },
  ],
  statusGroups: [
    {
      color: "gray",
      textColor: "black",
      name: "Work in Progress",
      members: ["Work in Progress", "Work in Progress - Waiting"],
    },
    {
      color: "whitesmoke",
      textColor: "dimgray",
      name: "Open Service",
      members: ["Newly Created", "Service"],
    },
    {
      color: "green",
      textColor: "white",
      name: "Finished",
      members: [
        "Finished",
        "Finished, Waiting to Contact",
        "Finished, Customer Away",
      ],
    },
    {
      color: "orange",
      textColor: "white",
      name: "Communication",
      members: ["Messaging With Customer", "Emailing With Company"],
    },
    {
      color: "lightblue",
      textColor: "dimgray",
      name: "Ordering",
      members: [
        "Part Ordered",
        "Bicycle Ordered",
        "Customer Bringing Part",
        "Order for Customer",
      ],
    },
    {
      color: "lightgray",
      textColor: "black",
      name: "Waiting",
      members: ["Customer Not Responding"],
    },
  ],

  quickItemButtonNames: [
    {
      name: "Tune-Up",
      position: "1",
      items: [],
    },
    {
      name: "Tube & Tire",
      position: "1",
      items: [],
    },
    {
      name: "Brakes",
      position: "1",
      items: [],
    },
    {
      name: "Cable",
      position: "1",
      items: [],
    },
    {
      name: "Shifting",
      position: "1",
      items: [],
    },
    {
      name: "Drivetrain",
      position: "1",
      items: [],
    },

    {
      name: "Spoke",
      position: "1",
      items: [],
    },
    {
      name: "Cleaning",
      position: "1",
      items: [],
    },
    {
      name: "Scooter",
      position: "1",
      items: [],
    },
    {
      name: "Pickup/Delivery",
      position: "1",
      items: [],
    },
    {
      name: "Diagnostics",
      position: "1",
      items: [],
    },
    {
      name: "$Labor",
      position: "999",
      items: [],
    },

    {
      name: "$Part",
      position: "1000",
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
      min: 1,
      max: 2,
      waitTimeValue: WAIT_TIME_INCREMENTS.day,
    },
    {
      label: "2-3 Days",
      min: 2,
      max: 3,
      waitTimeValue: WAIT_TIME_INCREMENTS.day,
    },
    {
      label: "3-5 Days",
      min: 3,
      max: 5,
      waitTimeValue: WAIT_TIME_INCREMENTS.day,
    },
    {
      label: "1 Week",
      min: 1,
      max: 1,
      waitTimeValue: WAIT_TIME_INCREMENTS.day,
    },
    {
      label: "1-2 Weeks",
      min: 1,
      max: 2,
      waitTimeValue: WAIT_TIME_INCREMENTS.week,
    },
    {
      label: "No Estimate",
      min: null,
      max: null,
      waitTimeValue: WAIT_TIME_INCREMENTS.week,
    },
  ],
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

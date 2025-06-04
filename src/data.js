/* eslint-disable */

// import { getNewCollectionRef } from "./dbCalls";
import { formatDateTime, generateRandomID, log } from "./utils";

////////// data types
export const DISCOUNT_TYPES = {
  percent: "Percent",
  dollar: "Dollar Amount",
};

////////// names ////////////////////////////
export const INVENTORY_CATEGORIES = {
  parts: "Parts",
  labor: "Labor",
  bikes: "Bikes",
  accessories: "Accessories",
  other: "Other",
};

export const COLLECTION_NAMES = {
  customers: "CUSTOMERS",
  openWorkorders: "OPEN-WORKORDERS",
  closedWorkorders: "CLOSED-WORKORDERS",
  preferences: "PREFERENCES",
  sales: "SALES",
  inventory: "INVENTORY",
  printers: "PRINTERS",
};
export const WORKORDER_STATUS_NAMES = Object.freeze({
  open: "open",
  finished: "finished",
});

export const TAB_NAMES = {
  infoTab: {
    customer: "Customer Entry",
    workorder: "Workorder View",
  },
  itemsTab: {
    workorderItems: "Workorder Items",
    changeLog: "Change Log",
    dashboard: "Dashboard",
    customerList: "",
    preview: "Preview",
  },
  optionsTab: {
    quickItems: "Quick Items",
    workorders: "Workorders",
    inventory: "Inventory",
    messages: "Messages",
  },
};

export const QUICK_BUTTON_NAMES = [
  {
    name: "Tune-Up",
    id: "1234",
    position: "1",
    items: [],
  },
  {
    name: "Tube & Tire",
    id: "58349",
    position: "1",
    items: [],
  },
  {
    name: "Brakes",
    id: "5834fg9",
    position: "1",
    items: [],
  },
  {
    name: "Shifting",
    id: "583r49",
    position: "1",
    items: [],
  },
  {
    name: "Drivetrain",
    id: "58trt349",
    position: "1",
    items: [],
  },
  {
    name: "Cable",
    id: "583sfg49",
    position: "1",
    items: [],
  },
  {
    name: "Spoke",
    id: "58349",
    position: "1",
    items: [],
  },
  {
    name: "Cleaning",
    id: "583fgs49",
    position: "1",
    items: [],
  },
  {
    name: "Scooter",
    id: "5834nh9",
    position: "1",
    items: [],
  },
  {
    name: "Pickup",
    id: "5855r349",
    position: "1",
    items: [],
  },
  {
    name: "Diagnostics",
    id: "58fgs349",
    position: "1",
    items: [],
  },
  {
    name: "$Labor",
    id: "58sgf349",
    position: "999",
    items: [],
  },
  {
    name: "Brakes",
    id: "5854t349",
    position: "1",
    items: [],
  },
  {
    name: "$Part",
    id: "583t54t49",
    position: "1000",
    items: [],
  },
];
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

/////////// object prototypes
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
export const WORKORDER_PROTO = {
  id: "",
  customerID: "",
  customerFirst: "",
  customerLast: "",
  customerPhone: "",
  brand: "",
  description: "",
  color: {
    textColor: "",
    backgroundColor: "",
    label: "",
  },
  changeLog: [],
  startedBy: "",
  partOrdered: "",
  partSource: "",
  itemIdArr: [],
  workorderLines: [],
  internalNotes: [],
  customerNotes: [],
  dueBy: "",
  status: "Newly Created",
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
  name: "",
  value: "",
  type: "",
};
export const WORKORDER_ITEM_PROTO = {
  qty: 1,
  intakeNotes: "",
  serviceNotes: "",
  invItemID: "",
  discountObj: { ...DISCOUNT_OBJ_PROTO },
  id: "",
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

export const RECEIPT_TYPES = {
  workorder: "Workorder",
  sales: "Sales",
};

export const RECEIPT_WORKORDER_PROTO = {
  heading: "",
  dateTime: "",
  workorderNumber: "",
  customerContactBlurb: "",
  workorderItem: "",
  workorderNumber: "",
  customerContactBlurb: "",
  startedOnStr: "",
  itemArr: [{ item: "", qty: "", price: "", discount: "" }],
  laborCharges: "",
  partsCharges: "",
  taxCharges: "",
  discountTotal: "",
  total: "",
  customerNotes: "",
  internalNotes: "",
  barcode: "",
  id: "",
  receiptType: "",
  location: "",
};

const receiptHeading = () => {
  let str = "";
  str += "9102 Bonita Beach Rd SE\n";
  str += "Bonita Springs, FL 34135\n";
  str += "(239) 281 9396\n";
  str += "support@bonitabikes.com\n";
  str += "www.bonitabikes.com";
};

export const RECEIPT_PROTO = {
  heading: {
    title: "Bonita Bikes LLC",
    subHeading: receiptHeading,
  },
  dateTime: "",
  workorderNumber: "",
  customerName: "",
  customerContactBlurb: "",
  workorderItem: "",
  startedOnStr: "",
  itemArr: [{ item: "", qty: "", price: "", discount: "" }],
  laborCharges: "",
  partsCharges: "",
  taxCharges: "",
  discountTotal: "",
  total: "",
  customerNotes: "",
  paymentDetails: "",
  footer: "",
  barcode: "",
};

export const INVENTORY_ITEM_PROTO = {
  formalName: "",
  informalName: "",
  price: 0,
  salePrice: "",
  category: INVENTORY_CATEGORIES.other,
  id: "",
  upc: "",
};

export const SETTINGS_PROTO = {
  statuses: [
    "Work in Progress",
    "Work in Progress - Waiting",
    "Newly Created",
    "Service",
    "Finished",
    "Finished, Waiting to Contact",
    "Finished, Customer Away",
    "Part Ordered",
    "Bicycle Ordered",
    "Customer Bringing Part",
    "Order for Customer",
    "Messaging With Customer",
    "Emailing With Company",
    "Customer Not Responding",
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
    // { color: "orange", name: "Ordering" },
    // { color: "whitesmoke", name: "Communication" },
    // { color: "lightblue", name: "Waiting" },
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
      name: "Cable",
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
      name: "Pickup",
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
      name: "Brakes",
      position: "1",
      items: [],
    },
    {
      name: "$Part",
      position: "1000",
      items: [],
    },
  ],
  bikeColors: [
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
  ],
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
  bikeDescriptions: ["Hybrid", "E-Bike", "Cruiser", "Road Bike"],
  partSources: ["JBI", "QBP", "Amazon", "Ebay", "Customer"],
  printerNames: [],
  loginTimeout: 15,
  users: [
    {
      first: "Fritz",
      last: "Hieb",
      id: "1234",
      permissions: "owner",
      phone: "2393369177",
      pin: "33",
    },
  ],
};

////////// hardcoded settings and options ///////

export const SHADOW_RADIUS_NOTHING = {
  shadowOffset: { width: 0, height: 0 },
  shadowRadius: 0,
  shadowColor: "transparent",
};

///////// variables to import from DB ///////////////////////////////
export const workorder_status = [
  { name: "Service", position: 0 },
  { name: "Finished", position: 1 },
];
export const printer_names = {
  left: "Left Desk Printer",
  right: "Right Desk Printer",
};
export const bike_brands_db = {
  brands1: ["Trek", "Specialized", "Sun", "Marin"],
  brands1Title: "Pedal Bikes",
  brands2: ["Euphree", "Lectric", "Hiboy"],
  brands2Title: "E-Bikes",
};
export const discounts_db = [
  { name: "50% Off Item", value: "50", type: "percent" },
  { name: "10% Off Item", value: "10", type: "percent" },
  { name: "20% Off Item", value: "20", type: "percent" },
  { name: "30% Off Item", value: "30", type: "percent" },
  { name: "40% Off Item", value: "40", type: "percent" },
  { name: "50% Off Item", value: "50", type: "percent" },
  { name: "2-bike purchase, $100 Off Each Bike", value: "100", type: "dollar" },
  { name: "$10 Off", value: "10", type: "dollar" },
];

export const system_users_db = {
  1389343: {
    first: "Fritz",
    last: "Hieb",
    pin: 44,
    startedOn: new Date().getTime(),
    id: "1389343",
  },
};
export const bike_descriptions_db = [
  "Hybrid",
  "E-Bike",
  "Cruiser",
  "Road Bike",
];
export const part_sources_db = ["JBI", "QBP", "Amazon", "Ebay", "Customer"];

export let bike_colors_arr_db = [
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
    backgroundColor: "rgb(255,165,0)",
    label: "Orange",
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

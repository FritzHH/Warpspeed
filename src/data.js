/* eslint-disable */

import { getNewCollectionRef } from "./dbCalls";
import { formatDateTime, generateRandomID, log } from "./utils";

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
  brand: "",
  description: "",
  color: "",
  changes: {
    startedBy: "",
    changeLog: [],
  },
  partOrdered: "",
  partSource: "",
  itemIdArr: [],
  workorderLines: [],
  notes: {
    internalNotes: [],
    customerNotes: [],
  },
  dueBy: "",
  status: "",
};
export const DISCOUNT_OBJ_PROTO = {
  name: "",
  value: "",
  type: "",
};
export const WORKORDER_ITEM_PROTO = {
  qty: 0,
  intakeNotes: "",
  serviceNotes: "",
  itemID: "",
  discountObj: { ...DISCOUNT_OBJ_PROTO },
};
export const CUSTOMER_PROTO = {
  first: "",
  last: "",
  phone: {
    cell: "",
    landline: "",
    emailOnlyOption: false,
    callOnlyOption: false,
  },
  email: "",
  address: {
    streetAddress: "",
    unit: "",
    city: "",
    state: "",
    zip: "",
    notes: "",
  },
  id: "",
  interactionRating: "",
  workorders: [],
  payments: [],
  dateCreated: "",
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
  name: "",
  price: 0,
  salePrice: 0,
  catMain: "",
  catDescrip: "",
  catLocation: "",
  id: "",
};

////////// hardcoded settings and options ///////
export const ADJUSTABLE_BUTTON_SIZE_OPTIONS_ARR = [
  { text: { fontSize: 17 }, view: { height: 45 } },
  { text: { fontSize: 16 }, view: { height: 42 } },
  { text: { fontSize: 15 }, view: { height: 37 } },
  { text: { fontSize: 15 }, view: { height: 33 } },
];

////////// default settings ////////////////////
export const DEFAULT_USER_PREFERENCES = {
  optionsTabButtonSizes: {
    view: { ...ADJUSTABLE_BUTTON_SIZE_OPTIONS_ARR[0].view },
    text: { ...ADJUSTABLE_BUTTON_SIZE_OPTIONS_ARR[0].text },
  },
};

////////// names ////////////////////////////
export const INVENTORY_CATEGORIES = {
  main: {
    parts: "Parts",
    labor: "Labor",
    bikes: "Bikes",
    accessories: "Accessories",
    other: "Other",
  },
  // partsDescriptions: {
  //   accessories: "Accessories",
  //   brakes: "Brakes",
  //   cable_housing: "Cables/Housing",
  //   drivetrain: "Drivetrain",
  //   shifting: "Shifting",
  //   tubes: "Tubes",
  //   tires: "Tires",
  //   suspension: "Suspension",
  //   frame: "Frame",
  //   miscParts: "Misc. Parts",
  // },
  // laborDescriptions: {
  //   brakes: "Brakes",
  //   cable_housing: "Cables/Housing",
  //   drivetrain: "Drivetrain",
  //   shifting: "Shifting",
  //   tubes: "Tubes",
  //   tires: "Tires",
  //   frame: "Frame",
  //   assembly: "Assembly",
  //   miscLabor: "Misc. Labor",
  // },
  // machineDescriptions: {
  //   pedal: "Pedal",
  //   electric: "Electric",
  //   trike: "Trike",
  //   scooter: "Scooter",
  //   other: "Other",
  // },
  // accessoryDescriptions: {
  //   parts: 'parts',
  //   luggage: 'bags',

  // },
  // descriptions: {
  //   accessories: "Accessories",
  //   brakes: "Brakes",
  //   cable_housing: "Cables/Housing",
  //   drivetrain: "Drivetrain",
  //   shifting: "Shifting",
  //   tubes: "Tubes",
  //   tires: "Tires",
  //   bikeElectric: "Electric Bikes",
  //   bikePedal: "Pedal Bikes",
  //   otherMachines: "Other Machines",
  //   miscLabor: "Misc. Labor",
  //   miscParts: "Misc. Parts",
  // },
  location: {
    service: "Service Bay",
    retail: "Retail",
  },
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
  },
};

export const INFO_COMPONENT_NAMES = {
  workorder: "workorder",
  phoneNumberEntry: "phoneEntry",
  nameAddressEntry: "nameAddressEntry",
};
export const QUICK_BUTTON_NAMES = [
  {
    name: "Tune-Up",
    id: "1234",
    items: [
      "Tune-Up - Pedal Bike - Standard",
      "Tune-Up - Pedal Bike - Single Speed",
    ],
  },
  {
    name: "Tube & Tire",
    id: "58349",
    items: [
      "Tune-Up - Pedal Bike - Standard",
      "Tune-Up - Pedal Bike - Single Speed",
    ],
  },
  {
    name: "Brakes",
    id: "5834fg9",
    items: [
      "Tune-Up - Pedal Bike - Standard",
      "Tune-Up - Pedal Bike - Single Speed",
    ],
  },
  {
    name: "Shifting",
    id: "583r49",
    items: [
      "Tune-Up - Pedal Bike - Standard",
      "Tune-Up - Pedal Bike - Single Speed",
    ],
  },
  {
    name: "Drivetrain",
    id: "58trt349",
    items: [
      "Tune-Up - Pedal Bike - Standard",
      "Tune-Up - Pedal Bike - Single Speed",
    ],
  },
  {
    name: "Cable",
    id: "583sfg49",
    items: [
      "Tune-Up - Pedal Bike - Standard",
      "Tune-Up - Pedal Bike - Single Speed",
    ],
  },
  {
    name: "Spoke",
    id: "58349",
    items: [
      "Tune-Up - Pedal Bike - Standard",
      "Tune-Up - Pedal Bike - Single Speed",
    ],
  },
  {
    name: "Cleaning",
    id: "583fgs49",
    items: [
      "Tune-Up - Pedal Bike - Standard",
      "Tune-Up - Pedal Bike - Single Speed",
    ],
  },
  {
    name: "Scooter",
    id: "5834nh9",
    items: [
      "Tune-Up - Pedal Bike - Standard",
      "Tune-Up - Pedal Bike - Single Speed",
    ],
  },
  {
    name: "Pickup",
    id: "5855r349",
    items: [
      "Tune-Up - Pedal Bike - Standard",
      "Tune-Up - Pedal Bike - Single Speed",
    ],
  },
  {
    name: "Diagnostics",
    id: "58fgs349",
    items: [
      "Tune-Up - Pedal Bike - Standard",
      "Tune-Up - Pedal Bike - Single Speed",
    ],
  },
  {
    name: "Labor",
    id: "58sgf349",
    items: [
      "Tune-Up - Pedal Bike - Standard",
      "Tune-Up - Pedal Bike - Single Speed",
    ],
  },
  {
    name: "Brakes",
    id: "5854t349",
    items: [
      "Tune-Up - Pedal Bike - Standard",
      "Tune-Up - Pedal Bike - Single Speed",
    ],
  },
  {
    name: "Part",
    id: "583t54t49",
    items: [
      { name: "Tune-Up - Pedal Bike - Standard", id: "583t54t49" },
      {
        name: "Tune-Up - Pedal Bike - Single Speedvdfgagfasgafgfas",
        id: "5854t349",
      },
    ],
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

///////// variables to import from DB ////////
export const workorder_status = [
  { name: "Service", id: generateRandomID() },
  { name: "Finished", id: generateRandomID() },
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
export const bike_colors_db = [
  "White",
  "Blue",
  "Green",
  "Black",
  "Yellow",
  "Brown",
  "Silver",
  "Tan",
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
export const part_sources_db = ["JBI", "QBP", "Amazon", "Ebay"];

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

/////////// testing///////////////////////////
//////////////////////////////////////////////
//////////////////////////////////////////////
export let brakeHandle = {
  ...INVENTORY_ITEM_PROTO,
  name: "Tune-Up - Pedal Bike - Standard",
  price: 20,
  // catMain: INVENTORY_CATEGORIES.main.parts,
  // catDescrip: INVENTORY_CATEGORIES.partsDescriptions.brakes,
  // catLocation: INVENTORY_CATEGORIES.location.service,
  id: "583t54t49",
};

export let shiftCable = {
  ...INVENTORY_ITEM_PROTO,
  name: "Tune-Up - Pedal Bike - Single Speedvdfgagfasgafgfas",
  price: 5,
  // catMain: INVENTORY_CATEGORIES.main.parts,
  // catDescrip: INVENTORY_CATEGORIES.descriptions.shifting,
  // catLocation: INVENTORY_CATEGORIES.location.service,
  id: "5854t349",
};

export let fixSomething = {
  ...INVENTORY_ITEM_PROTO,
  name: "fixing some shit",
  price: 30.43,
  // catMain: INVENTORY_CATEGORIES.main.labor,
  // catDescrip: INVENTORY_CATEGORIES.descriptions.drivetrain,
  // catLocation: INVENTORY_CATEGORIES.location.service,
  id: "585444t349",
};
export let bikeBag = {
  ...INVENTORY_ITEM_PROTO,
  name: "West biking bag",
  price: 34.39,
  // catMain: INVENTORY_CATEGORIES.main.accessories,
  // catDescrip: INVENTORY_CATEGORIES..accessories,
  // catLocation: INVENTORY_CATEGORIES.location.retail,
  id: "58544dfd4t349",
};
export let bike = {
  ...INVENTORY_ITEM_PROTO,
  name: "Euphree city robinz",
  price: 2000,
  salePrice: "",
  brand: "",
  // catMain: INVENTORY_CATEGORIES.main.bikes,
  // catDescrip: INVENTORY_CATEGORIES.machineDescriptions.electric,
  // catLocation: INVENTORY_CATEGORIES.location.retail,
  id: "58544dfddfd4t349",
};

export const test_inventory = [
  { ...brakeHandle },
  { ...shiftCable },
  { ...fixSomething },
  { ...bikeBag },
  { ...bike },
];

import { log } from "./utils";

export const COLLECTION_NAMES = {
  customers: "CUSTOMERS",
  workorders: "WORKORDERS",
  preferences: "PREFERENCES",
  sales: "SALES",
  inventory: "INVENTORY",
};

export const CUSTOMER = {
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

export const DISCOUNTS = [
  { name: "50% Off Item", value: "10%" },
  { name: "2-bike purchase, $100 Off Each Bike", value: "100" },
];

export const WORKORDER_ITEM = {
  name: "",
  qty: 1,
  price: 0,
  intakeNotes: "",
  serviceNotes: "",
  id: 123,
};

export const TAB_NAMES = {
  itemsTab: {
    workorderItems: "Workorder Items",
    changeLog: "Change Log",
    dashboard: "Dashboard",
    creatingNewWorkorder: "Create New Workorder",
  },
  optionsTab: {
    quickItems: "Quick Items",
    workorders: "Workorders",
  },
};

export const INFO_COMPONENT_NAMES = {
  workorder: "workorder",
  phoneNumberEntry: "phoneEntry",
  nameAddressEntry: "nameAddressEntry",
};

export const ALERT_BOX_PROTOTYPE = {
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

export const BIKE_COLORS_ARR = [
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

export const WORKORDER = {
  id: "",
  customerID: "",
  brand: "",
  description: "",
  color: BIKE_COLORS_ARR[0],
  changes: {
    startedBy: "",
    changeLog: [],
  },
  partOrdered: "",
  partSource: "",
  items: [],
  notes: {
    internalNotes: "",
    customerNotes: "",
  },
  dueBy: "",
};

export const BRANDS = {
  brands1: ["Trek", "Specialized", "Sun", "Marin"],
  brands1Title: "Pedal Bikes",
  brands2: ["Euphree", "Lectric", "Hiboy"],
  brands2Title: "E-Bikes",
};

export const BIKE_COLORS = [
  "White",
  "Blue",
  "Green",
  "Black",
  "Yellow",
  "Brown",
  "Silver",
  "Tan",
];

export const BIKE_DESCRIPTIONS = ["Hybrid", "E-Bike", "Cruiser", "Road Bike"];

export const PART_SOURCES = ["JBI", "QBP", "Amazon", "Ebay"];

export const INVENTORY_CATEGORIES = {
  main: {
    parts: "Parts & Accessories",
    labor: "Labor",
    bikes: "Bikes",
  },
  descrip: {
    brakes: "Brakes",
    cable_housing: "Cables/Housing",
    drivetrain: "Drivetrain",
    shifting: "Shifting",
    tubes: "Tubes",
    tires: "Tires",
    accessories: "Accessories",
    bikeElectric: "Electric Bikes",
    bikePedal: "Pedal Bikes",
    miscLabor: "Misc. Labor",
    miscParts: "Misc. Parts",
  },
  location: {
    service: "Service Bay",
    retail: "Retail",
  },
};

export const INVENTORY_ITEM = {
  name: "brake handle",
  price: 20,
  catMain: INVENTORY_CATEGORIES.main.parts,
  catDescrip: INVENTORY_CATEGORIES.descrip.brakes,
  catLocation: INVENTORY_CATEGORIES.location.service,
  id: "122",
};

export const INVENTORY_STRUCTURE = {
  parts: [],
  labor: [],
  accessories: [],
  bikes: {},
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

export let brakeHandle = {
  ...INVENTORY_ITEM,
  name: "Tune-Up - Pedal Bike - Standard",
  price: 20,
  catMain: INVENTORY_CATEGORIES.main.parts,
  catDescrip: INVENTORY_CATEGORIES.descrip.brakes,
  catLocation: INVENTORY_CATEGORIES.location.service,
  id: "583t54t49",
};
export let shiftCable = {
  ...INVENTORY_ITEM,
  name: "Tune-Up - Pedal Bike - Single Speedvdfgagfasgafgfas",
  price: 5,
  catMain: INVENTORY_CATEGORIES.main.parts,
  catDescrip: INVENTORY_CATEGORIES.descrip.shifting,
  catLocation: INVENTORY_CATEGORIES.location.service,
  id: "5854t349",
};
// export let helmet = {
//   ...inventory_item,
//   name: "helmet",
//   price: 35,
//   catMain: inventory_cats.main.parts,
//   catDescrip: inventory_cats.descrip.accessories,
//   catLocation: inventory_cats.location.retail,
//   id: "9439",
// };
// export let mirror = {
//   ...inventory_item,
//   name: "mirror",
//   price: 30,
//   catMain: inventory_cats.main.parts,
//   catDescrip: inventory_cats.descrip.accessories,
//   catLocation: inventory_cats.location.retail,
//   id: "93483",
// };
export const test_inventory = [brakeHandle, shiftCable];

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

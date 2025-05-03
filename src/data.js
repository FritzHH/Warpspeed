import { log } from "./utils";

export const Customer = {
  first: "Test",
  last: "Customer",
  phone: {
    cell: "123-456-7899",
    landline: "123-456-2345",
    // callOnlyOption: true,
    emailOnlyOption: true,
  },

  address: {
    streetAddress: "",
    unit: "",
    city: "",
    state: "",
    zip: "",
    notes: "",
  },
  id: "334739",
  comments: "",
  interactionRating: "",
  workorders: "",
  payments: "",
};

export const Discounts = [
  { name: "50% Off Item", value: "10%" },
  { name: "2-bike purchase, $100 Off Each Bike", value: "100" },
];

export const WorkorderItem = {
  name: "Change tube",
  qty: 1,
  price: 4.99,
  intakeNotes: "Front",
  serviceNotes: "this is a piece of shit lugnut missing",
  id: 123,
};

export const Workorder = {
  id: "399439",
  customerID: "12232",
  brand: "Trek",
  description: "Hybrid",
  color: "Yellow",
  changes: {
    startedBy: "Fritz",
    changeLog: [],
  },
  partOrdered: "Derailler",
  partSource: "Amazon",
  items: [
    {
      name: "Ebike",
      qty: 3,
      price: 44556.99,
      intakeNotes: "Front",
      serviceNotes: "this is a piece of shit lugnut missing",
      id: "123",
    },
    {
      name: "Change tube",
      qty: 1,
      price: 4.99,
      intakeNotes: "Rear",
      id: "1233",
    },
    {
      name: "Change tube",
      qty: 1,
      price: 33.99,
      intakeNotes: "top",
      id: "1233345",
    },
    {
      name: "Change tube",
      qty: 3,
      price: 8.99,
      intakeNotes: "middle",
      id: "1233655",
    },
  ],
  notes: {
    internalNotes: "",
    customerNotes: "",
  },
};

export const Brands = {
  brands1: ["Trek", "Specialized", "Sun", "Marin"],
  brands1Title: "Pedal Bikes",
  brands2: ["Euphree", "Lectric", "Hiboy"],
  brands2Title: "E-Bikes",
};

export const BikeColors = [
  "White",
  "Blue",
  "Green",
  "Black",
  "Yellow",
  "Brown",
  "Silver",
  "Tan",
];

export const Descriptions = ["Hybrid", "E-Bike", "Cruiser", "Road Bike"];

export const PartSources = ["JBI", "QBP", "Amazon", "Ebay"];

export const inventory_cats = {
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

export const inventory_item = {
  name: "brake handle",
  price: 20,
  catMain: inventory_cats.main.parts,
  catDescrip: inventory_cats.descrip.brakes,
  catLocation: inventory_cats.location.service,
  id: "122",
};

export const inventory = {
  parts: [],
  labor: [],
  accessories: [],
  bikes: {},
};

export const quick_button_names = [
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
  ...inventory_item,
  name: "Tune-Up - Pedal Bike - Standard",
  price: 20,
  catMain: inventory_cats.main.parts,
  catDescrip: inventory_cats.descrip.brakes,
  catLocation: inventory_cats.location.service,
  id: "583t54t49",
};
export let shiftCable = {
  ...inventory_item,
  name: "Tune-Up - Pedal Bike - Single Speedvdfgagfasgafgfas",
  price: 5,
  catMain: inventory_cats.main.parts,
  catDescrip: inventory_cats.descrip.shifting,
  catLocation: inventory_cats.location.service,
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

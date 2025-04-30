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
  color: "Green",
  changes: {
    startedBy: "Fritz",
    changeLog: [],
  },
  partOrdered: "",
  partSource: "",
  items: [
    {
      name: "Change tube",
      qty: 1,
      price: 4.99,
      intakeNotes: "Front",
      serviceNotes: "this is a piece of shit lugnut missing",
      id: 123,
    },
  ],
  notes: {
    internalNotes: "",
    customerNotes: "",
  },
};

export const Brands = {
  brands1: [],
  brands1Title: "Pedal Bikes",
  brands2: [],
  brands2Title: "Ebikes",
};

export const Colors = [
  "White",
  "Blue",
  "Green",
  "Black",
  "Yellow",
  "Brown",
  "Silver",
];

export const PartSources = ["JBI", "QBP", "Amazon", "Ebay"];

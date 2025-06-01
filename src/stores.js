/* eslint-disable */

import { create } from "zustand";
import { CUSTOMER_PROTO, INVENTORY_ITEM_PROTO, TAB_NAMES } from "./data";
import { checkArr, log, searchPhoneNum } from "./utils";

// components /////////////////////////////////////////////////////
export const useInvModalStore = create((set, get) => ({
  currentFocusName: null,
  item: { ...INVENTORY_ITEM_PROTO },
  setFocus: (focusName) => {
    // log("setting focus", focusName);
    set((state) => ({
      currentFocusName: focusName,
    }));
  },
  setItem: (item) => {
    // log("setting item in zStore", item);
    set((state) => ({ item: { ...item } }));
  },
  getItem: () => {
    let val = get().item;
    // log("getting item", val);
    return val;
  },
  getFocus: () => {
    let focusName = get().currentFocusName;
    // log("getting focus", focusName);
    return focusName;
  },
  reset: () => {
    set(() => ({
      currentFocusName: null,
      item: INVENTORY_ITEM_PROTO,
    }));
  },
}));

export const useTabNamesStore = create((set, get) => ({
  itemsTabName: TAB_NAMES.itemsTab.dashboard,
  optionsTabName: TAB_NAMES.optionsTab.messages,
  infoTabName: TAB_NAMES.infoTab.customer,
  getItemsTabName: () => get().itemsTabName,
  getOptionsTabName: () => get().optionsTabName,
  getInfoTabName: () => get().infoTabName,
  setInfoTabName: (name) => {
    set((state) => ({ infoTabName: name }));
  },
  setItemsTabName: (name) => {
    set((state) => ({ itemsTabName: name }));
  },
  setOptionsTabName: (name) => {
    set((state) => ({ optionsTabName: name }));
  },
}));

export const useCustomerSearchStore = create((set, get) => ({
  // searchTerm: "",
  selectedItem: null,
  searchResultsArr: [],
  // getSearchTerm: () => get().searchTerm,
  getSearchResultsArr: () => get().searchResultsArr,
  getSelectedItem: () => get().selectedItem,
  setSelectedItem: (item) => {
    set((state) => ({
      selectedItem: item,
    }));
  },
  // setSearchTerm: (term) => {
  //   set((state) => ({ searchTerm: term }));
  // },
  setSearchResultsArr: (arr) => {
    set((state) => ({ searchResultsArr: arr }));
  },
  reset: () => {
    // set((state) => ({ searchTerm: "" }));
    set((state) => ({ searchResultsArr: [] }));
    set((state) => ({ selectedItem: null }));
  },
}));

export const useCurrentUserStore = create((set, get) => ({
  currentUser: {
    first: "Test User",
    last: "Last Name Here",
    pin: "1",
    id: "dkfjdkfk",
  },
  getCurrentUser: () => get().currentUser,
  setCurrentUser: (user) => {
    set((state) => ({ currentUser: user }));
  },
}));

// from database //////////////////////////////////////////////////
export const useCustomerPreviewStore = create((set, get) => ({
  previewArr: [],
  getCustPreviewArr: () => get().previewArr,
  modItem: (item, option) => {
    if (option === "change")
      return set((state) => ({
        previewArr: changeItem(get().previewArr, item),
      }));
    if (option === "add")
      return set((state) => ({
        previewArr: addItem(get().previewArr, item),
      }));
    if (option === "remove")
      return set((state) => ({
        previewArr: removeItem(get().previewArr, item),
      }));
  },
}));

export const useCurrentCustomerStore = create((set, get) => ({
  customerObj: { ...CUSTOMER_PROTO },
  getCustomerObj: () => get().customerObj,
  setCustomerObj: (obj) => {
    set((state) => ({ customerObj: obj }));
  },
}));

export const useInventoryStore = create((set, get) => ({
  inventoryArr: [],
  getInventoryArr: () => get().inventoryArr,
  modItem: (item, option) => {
    if (option === "change")
      return set((state) => ({
        inventoryArr: changeItem(get().inventoryArr, item),
      }));
    if (option === "add")
      return set((state) => ({
        inventoryArr: addItem(get().inventoryArr, item),
      }));
    if (option === "remove")
      return set((state) => ({
        inventoryArr: removeItem(get().inventoryArr, item),
      }));
  },
}));

export const useOpenWorkordersStore = create((set, get) => ({
  workorderArr: [],
  getWorkorderArr: () => get().workorderArr,
  setEntireArr: (arr) => set((state) => ({ workorderArr: arr })),
  modItem: (item, option) => {
    if (option === "change")
      return set((state) => ({
        workorderArr: changeItem(get().workorderArr, item),
      }));
    if (option === "add")
      return set((state) => ({
        workorderArr: addItem(get().workorderArr, item),
      }));
    if (option === "remove")
      return set((state) => ({
        workorderArr: removeItem(get().workorderArr, item),
      }));
  },
}));

export const useCurrentWorkorderStore = create((set, get) => ({
  workorderObj: {},
  getWorkorderObj: () => get().workorderObj,
  setWorkorderObj: (obj) => {
    set((state) => ({ workorderObj: obj }));
  },
}));

export const useCustMessagesStore = create((set, get) => ({
  incomingMessagesArr: [],
  outgoingMessagesArr: [],
  getIncomingMessagesArr: () => get().incomingMessagesArr,
  getOutgoingMessagesArr: () => get().outgoingMessagesArr,
  setIncomingMessage: (obj) => {
    let messages = get().incomingMessagesArr;
    if (checkArr(messages, obj)) return;
    set((state) => ({
      incomingMessagesArr: [...state.incomingMessagesArr, obj],
    }));
  },
  setOutgoingMessage: (obj) => {
    let messages = get().outgoingMessagesArr;
    if (checkArr(messages, obj)) return;
    // log("out", obj);
    set((state) => ({
      outgoingMessagesArr: [...state.outgoingMessagesArr, obj],
    }));
  },
}));

export const useWorkorderPreviewStore = create((set, get) => ({
  previewObj: null,
  getPreviewObj: () => get().previewObj,
  // setPreviewObj: (obj) => log("setting", obj),
  setPreviewObj: (obj) => set((state) => ({ previewObj: obj })),
}));

export const useSettingsStore = create((set, get) => ({
  settings: {},
  getSettingsObj: () => get().settings,
  setSettingsObj: (obj) => set((state) => ({ settings: obj })),
  setSettingsItem: (key, val) =>
    set((state) => ({ ...get().setttings, [key]: val })),
}));

/// internal functions ///////////////////////////////////////////
function changeItem(arr, item) {
  return arr.map((o) => (o.id === item.id ? item : o));
}

function addItem(arr, item) {
  let foundItem = arr.find((o) => o.id === item.id);
  if (foundItem) return arr;
  return [...arr, item];

  // return arr.find((o) => o.id === item.id);
}

function removeItem(arr, item) {
  return arr.filter((o) => o.id !== item.id);
}

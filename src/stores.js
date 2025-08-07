/* eslint-disable */

import { create } from "zustand";
import {
  CUSTOMER_PROTO,
  INVENTORY_ITEM_PROTO,
  PRIVILEDGE_LEVELS,
  TAB_NAMES,
  WORKORDER_PROTO,
} from "./data";
import { checkArr, log } from "./utils";
import { cloneDeep } from "lodash";

// internal use  /////////////////////////////////////////////////////
export const useLoginStore = create((set, get) => ({
  adminPrivilege: "",
  loginTimeout: 0,
  currentUserObj: null,
  modalVisible: false,
  lastActionMillis: 0,
  postLoginFunctionCallback: () => {},
  showLoginScreen: false,

  getLoginFunctionCallback: () => get().loginFunctionCallback,
  getShowLoginScreen: () => get().showLoginScreen,
  getLastActionMillis: () => get().lastActionMillis,
  getCurrentUserObj: () => get().currentUserObj,
  getAdminPrivilege: () => get().adminPrivilege,
  getModalVisible: () => get().modalVisible,

  setModalVisible: (modalVisible) => set((state) => ({ modalVisible })),
  setLoginTimeout: (loginTimeout) => set((state) => ({ loginTimeout })),
  setCurrentUserObj: (currentUserObj) => {
    // log("user", currentUserObj);
    set((state) => ({ currentUserObj: currentUserObj }));
  },
  setLastActionMillis: () =>
    set((state) => ({ lastActionMillis: new Date().getTime() })),
  setShowLoginScreen: (showLoginScreen) => {
    set((state) => ({ showLoginScreen }));
  },

  execute: (postLoginFunctionCallback, priviledgeLevel) => {
    let lastMillis = get().lastActionMillis;
    let cur = new Date().getTime();
    let diff = (cur - lastMillis) / 1000;
    let userObj = get().currentUserObj;
    // log("diff", diff);
    let hasAccess = true;
    if (priviledgeLevel && userObj) {
      hasAccess = false;
      if (
        priviledgeLevel == PRIVILEDGE_LEVELS.owner &&
        userObj.permissions == PRIVILEDGE_LEVELS.owner
      ) {
      }
      hasAccess = true;
      if (
        priviledgeLevel == PRIVILEDGE_LEVELS.admin &&
        (userObj.permissions == PRIVILEDGE_LEVELS.owner ||
          userObj.permissions == PRIVILEDGE_LEVELS.admin)
      )
        hasAccess = true;
      if (
        priviledgeLevel == PRIVILEDGE_LEVELS.superUser &&
        (userObj.permissions == PRIVILEDGE_LEVELS.owner ||
          userObj.permissions == PRIVILEDGE_LEVELS.admin ||
          userObj.permissions == PRIVILEDGE_LEVELS.superUser)
      )
        hasAccess = true;
    }
    // log("user in login store", userObj);
    // log("diff", diff);
    // log(get().loginTimeout);
    if (diff > get().loginTimeout || !hasAccess || !userObj) {
      set((state) => ({ postLoginFunctionCallback }));
      set((state) => ({ showLoginScreen: true }));
      set((state) => ({ adminPrivilege: priviledgeLevel }));
      return;
    } else if (hasAccess) {
      postLoginFunctionCallback();
    }
  },
  runPostLoginFunction: () => get().postLoginFunctionCallback(),
}));

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
  itemsTabName: TAB_NAMES.itemsTab.empty,
  optionsTabName: TAB_NAMES.optionsTab.quickItems,
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

export const useAppCurrentUserStore = create((set, get) => ({
  userObj: {
    first: "Fritz",
    last: "Hieb",
    id: "1234",
    permissions: "owner",
    phone: "2393369177",
    pin: "33",
    alternatePin: "jj",
  },
  getCurrentUserObj: () => get().userObj,
  setCurrentUserObj: (obj) => set((state) => ({ userObj: obj })),
}));

export const useCurrentWorkorderStore = create((set, get) => ({
  workorderObj: null,
  getWorkorderObj: () => get().workorderObj,
  setWorkorderObj: (workorderObj) => {
    // log("here");
    set((state) => ({ workorderObj }));
  },
  startStandaloneSale: () => {
    set((state) => ({
      workorderObj: { ...cloneDeep(WORKORDER_PROTO), isStandaloneSale: true },
    }));
  },
}));

export const useCheckoutStore = create((set, get) => ({
  // isCheckingOut: false,
  splitPayment: false,
  paymentArr: [],
  splitPayment: false,
  totalAmount: null,
  isRefund: false,
  getIsRefund: () => get().isRefund,
  getTotalAmount: () => get().totalAmount,
  getSplitPayment: () => get().splitPayment,
  getPaymentArr: () => get().paymentArr,
  // getIsCheckingOut: () => get().isCheckingOut,
  setSplitPayment: (splitPayment) => {
    set(() => ({ splitPayment }));
  },
  setIsRefund: (isRefund) => {
    set(() => ({ isRefund }));
  },
  setTotalAmount: (totalAmount) => {
    set(() => ({ totalAmount }));
  },
  setPaymentArr: (paymentArr) => {
    set(() => ({ paymentArr }));
  },
  // setIsCheckingOut: (isCheckingOut) => {
  //   set((state) => ({
  //     isCheckingOut,
  //   }));
  // },
  setSplitPayment: (splitPayment) => {
    set(() => ({ splitPayment }));
  },
  reset: () => {
    set(() => ({
      splitPayment: false,
      paymentArr: [],
      isRefund: false,
      totalAmount: 0,
    }));
  },
}));

export const useStripePaymentStore = create((set, get) => ({
  paymentIntentID: null,
  reader: null,
  readersArr: null,
  paymentAmount: 0.53,
  getReadersArr: () => get().readersArr,
  getPaymentAmount: () => get().paymentAmount,
  getPaymentIntentID: () => get().paymentIntentID,
  getReader: () => get().reader,
  //

  setReadersArr: (readersArr) => {
    set(() => ({
      readersArr,
    }));
  },
  setPaymentIntentID: (paymentIntentID) => {
    log("setting pi id in zustand", paymentIntentID);
    set(() => ({
      paymentIntentID,
    }));
  },
  setPaymentAmount: (paymentAmount) => {
    set(() => ({ paymentAmount }));
  },
  setReader: (reader) => {
    set(() => ({ reader }));
  },
  reset: () => {
    set(() => ({
      paymentIntentID: null,
      paymentAmount: 0,
    }));
  },
}));

// database  //////////////////////////////////////////////////
export const usePunchClockStore = create((set, get) => ({
  loggedInUsers: [],
  userClockArr: [],
  getLoggedInUser: () => get().loggedInUsers,
  getUserClockArr: () => get().userClockArr,
  setUserClockArr: (userClockArr) => {
    set((state) => ({ userClockArr }));
  },
  setLoggedInUser: (userObj) => {
    let loggedInUsers1 = get().loggedInUsers;
    if (!loggedInUsers1.find((o) => o.id === user.id)) {
      loggedInUsers1.push(userObj);
      set((state) => ({ loggedInUsers: loggedInUsers1 }));
    }
  },
}));

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

export const useListenersStore = create((set, get) => ({
  inventoryChangeSub: "",
  inventoryAddSub: "",
  inventoryRemoveSub: "",
  workorderChangeSub: "",
  workorderAddSub: "",
  workorderRemoveSub: "",
  incomingMessagesSub: "",
  outgoingMessagesSub: "",
  custPreviewChangeSub: "",
  custPreviewAddSub: "",
  custPreviewRemoveSub: "",
  customerObjSub: "",
  settingsSub: "",
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

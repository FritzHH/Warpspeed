/* eslint-disable */

import { create } from "zustand";
import {
  CUSTOMER_PROTO,
  INVENTORY_ITEM_PROTO,
  PRIVILEDGE_LEVELS,
  TAB_NAMES,
  WORKORDER_PROTO,
} from "./data";
import { checkArr, clog, generateRandomID, log } from "./utils";
import { cloneDeep } from "lodash";
import { dbSetOpenWorkorderItem } from "./db_call_wrapper";

// internal use  /////////////////////////////////////////////////////
export const useLoginStore = create((set, get) => ({
  webcamDetected: false,
  adminPrivilege: "",
  loginTimeout: 0,
  // currentUserObj: {
  //   first: "Fritz",
  //   last: "Hieb",
  //   id: "1234",
  //   permissions: "owner",
  //   phone: "2393369177",
  //   pin: "33",
  //   faceDescriptor: "",
  // },
  currentUserObj: null,
  clockedInUsers: [],
  modalVisible: false,
  lastActionMillis: 0,
  postLoginFunctionCallback: () => {},
  showLoginScreen: false,

  // face login
  runBackgroundRecognition: true,

  getClockedInUsers: () => get().clockedInUsers,
  getWebcamDetected: () => get().webcamDetected,
  getRunBackgroundRecognition: () => get().runBackgroundRecognition,
  getLoginFunctionCallback: () => get().loginFunctionCallback,
  getShowLoginScreen: () => get().showLoginScreen,
  getLastActionMillis: () => get().lastActionMillis,
  getCurrentUserObj: () => get().currentUserObj,
  getAdminPrivilege: () => get().adminPrivilege,
  getModalVisible: () => get().modalVisible,

  setClockedInUser: (userObj) =>
    set(() => {
      // log("userobj", userObj);
      let userArr = cloneDeep(get().clockedInUsers);
      if (userArr.find((o) => o.id == userObj.id)) {
        userArr = userArr.filter((o) => o.id == userObj.id);
      } else {
        userArr.push(userObj);
      }
      return {
        clockedInUsers: userArr,
      };
    }),
  setWebcamDetected: (webcamDetected) => set(() => ({ webcamDetected })),
  setRunBackgroundRecognition: (runBackgroundRecognition) =>
    set(() => ({ runBackgroundRecognition })),
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
  optionsTabName: TAB_NAMES.optionsTab.workorders,
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
  selectedItem: null,
  searchResultsArr: [],
  getSearchResultsArr: () => get().searchResultsArr,
  getSelectedItem: () => get().selectedItem,
  setSelectedItem: (item) => {
    set((state) => ({
      selectedItem: item,
    }));
  },
  setSearchResultsArr: (arr) => {
    set((state) => ({ searchResultsArr: arr }));
  },
  reset: () => {
    set((state) => ({ searchResultsArr: [] }));
    set((state) => ({ selectedItem: null }));
  },
}));

export const useCheckoutStore = create((set, get) => ({
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

export const useAlertScreenStore = create((set, get) => ({
  showAlert: false,
  title: "Alert",
  message: "",
  subMessage: "",
  btn1Text: "",
  btn2Text: "",
  btn1Icon: null,
  btn2Icon: null,
  icon1Size: null,
  icon2Size: null,
  handleBtn1Press: null,
  handleBtn2Press: null,
  canExitOnOuterClick: true,

  getMessage: () => get().message,
  getSubMessage: () => get().subMessage,
  getCanExitOnOuterClick: () => get().canExitOnOuterClick,
  getTitle: () => get().title,
  getShowAlert: () => get().showAlert,
  getButton1Text: () => get().btn1Text,
  getButton2Text: () => get().btn2Text,
  getButton1Handler: () => get().handleBtn1Press,
  getButton2Handler: () => get().handleBtn2Press,
  getButton1Icon: () => get().btn1Icon,
  getButton2Icon: () => get().btn2Icon,
  getIcon1Size: () => get().icon1Size,
  getIcon2Size: () => get().icon2Size,

  setMessage: (message) => {
    set(() => ({ message }));
  },
  setSubMessage: (subMessage) => {
    set(() => ({ subMessage }));
  },
  setCanExitOnOuterClick: (canExitOnOuterClick) => {
    set(() => ({ canExitOnOuterClick }));
  },
  setTitle: (title) => {
    set(() => ({ title }));
  },
  setShowAlert: (showAlert) => {
    set(() => ({ showAlert }));
  },
  setButton1Text: (btn1Text) => {
    set(() => ({ btn1Text }));
  },
  setButton2Text: (btn2Text) => {
    set(() => ({ btn2Text }));
  },
  setButton1Handler: (handleBtn1Press) => {
    set(() => ({ handleBtn1Press }));
  },
  setButton2Handler: (handleBtn2Press) => {
    set(() => ({ handleBtn2Press }));
  },
  setButton1Icon: (btn1Icon) => {
    set(() => ({ btn1Icon }));
  },
  setButton2Icon: (btn2Icon) => {
    set(() => ({ btn2Icon }));
  },
  setIcon1Size: (icon1Size) => {
    set(() => ({ icon1Size }));
  },
  setIcon2Size: (icon2Size) => {
    set(() => ({ icon2Size }));
  },

  resetAll: () => {
    set(() => ({
      showAlert: false,
      title: "",
      message: "",
      subMessage: "",
      btn1Text: "",
      btn2Text: "",
      btn1Icon: null,
      btn2Icon: null,
      icon1Size: null,
      icon2Size: null,
      handleBtn1Press: null,
      handleBtn2Press: null,
      canExitOnOuterClick: true,
    }));
  },
}));

// internal & database //////////////////////////////////////////////
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
  openWorkorderObj: null,

  getOpenWorkorderIdx: () => get().openWorkorderIdx,
  getWorkorderObj: () => get().openWorkorderObj,
  getWorkorderArr: () => get().workorderArr,

  setWorkorderObj: (wo, saveToDB = true) => {
    // clog("setting", wo);
    if (wo == null) {
      set((state) => ({ openWorkorderObj: null }));
      return;
    }

    if (wo.isStandaloneSale) {
      set((state) => ({ openWorkorderObj: wo }));
      return;
    }

    let openWorkorderIdx = get().workorderArr.findIndex((o) => o.id == wo?.id);
    let workorderArr = cloneDeep(get().workorderArr);
    if (openWorkorderIdx >= 0) {
      // log("here 1");
      workorderArr[openWorkorderIdx] = wo;
      if (saveToDB && !wo.isStandaloneSale) dbSetOpenWorkorderItem(wo);
    } else {
      workorderArr.push(wo);
    }

    set((state) => ({
      workorderArr,
      openWorkorderObj: wo,
    }));
  },
  setEntireArr: (arr) => set((state) => ({ workorderArr: arr })),

  // handles live DB subscription changes
  modItem: (item, option) => {
    // log(item, option);
    if (option === "change")
      set((state) => ({
        workorderArr: changeItem(get().workorderArr, item),
      }));
    if (option === "add")
      set((state) => ({
        workorderArr: addItem(get().workorderArr, item),
      }));
    if (option === "remove")
      set((state) => ({
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
  settings: null,
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

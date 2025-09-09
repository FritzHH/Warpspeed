/* eslint-disable */

import { create } from "zustand";
import {
  CUSTOMER_PROTO,
  INVENTORY_ITEM_PROTO,
  PRIVILEDGE_LEVELS,
  TAB_NAMES,
  TIME_PUNCH_PROTO,
  WORKORDER_PROTO,
} from "./data";
import { checkArr, clog, generateRandomID, log } from "./utils";
import { cloneDeep } from "lodash";
import {
  batchDBCall,
  dbSetPunchClockArr,
  dbSetOrUpdateUserPunchObj,
  dbSetSettings,
  dbSetInventoryItem,
  dbSetWorkorder,
} from "./db_call_wrapper";

// internal use  /////////////////////////////////////////////////////

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
  alertBoxStyle: {},
  subMessage: "",
  btn1Text: "",
  btn2Text: "",
  btn3Text: "",
  btn1Icon: null,
  btn2Icon: null,
  btn3Icon: null,
  icon1Size: null,
  icon2Size: null,
  icon3Size: null,
  handleBtn1Press: null,
  handleBtn2Press: null,
  handleBtn3Press: null,
  canExitOnOuterClick: true,

  getMessage: () => get().message,
  getSubMessage: () => get().subMessage,
  getCanExitOnOuterClick: () => get().canExitOnOuterClick,
  getTitle: () => get().title,
  getShowAlert: () => get().showAlert,
  getButton1Text: () => get().btn1Text,
  getButton2Text: () => get().btn2Text,
  getButton3Text: () => get().btn3Text,
  getButton1Handler: () => get().handleBtn1Press,
  getButton2Handler: () => get().handleBtn2Press,
  getButton3Handler: () => get().handleBtn3Press,
  getButton1Icon: () => get().btn1Icon,
  getButton2Icon: () => get().btn2Icon,
  getButton3Icon: () => get().btn3Icon,
  getIcon1Size: () => get().icon1Size,
  getIcon2Size: () => get().icon2Size,
  getIcon3Size: () => get().icon3Size,
  getAlertBoxStyle: () => get().alertBoxStyle,

  setValues: ({
    title,
    message,
    subMessage,
    btn1Text,
    btn2Text,
    btn3Text,
    btn1Icon,
    btn2Icon,
    btn3Icon,
    icon1Size,
    icon2Size,
    icon3Size,
    handleBtn1Press,
    handleBtn2Press,
    handleBtn3Press,
    canExitOnOuterClick = true,
    alertBoxStyle = {},
  }) => {
    set(() => ({
      title,
      message,
      subMessage,
      btn1Text,
      btn2Text,
      btn3Text,
      btn1Icon,
      btn2Icon,
      btn3Icon,
      icon1Size,
      icon2Size,
      icon3Size,
      handleBtn1Press,
      handleBtn2Press,
      handleBtn3Press,
      canExitOnOuterClick,
      alertBoxStyle,
    }));
  },
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
      btn3Text: "",
      btn1Icon: null,
      btn2Icon: null,
      btn3Icon: null,
      icon1Size: null,
      icon2Size: null,
      icon3Size: null,
      handleBtn1Press: null,
      handleBtn2Press: null,
      handleBtn3Press: null,
      canExitOnOuterClick: true,
      alertBoxStyle: {},
    }));
  },
}));

export const useDatabaseBatchStore = create((set, get) => ({
  lastBatchMillis: 9999999999999999999999999,
  lastWriteMillis: 9999999999999999999999999,

  getLastWriteMillis: () => get().lastWriteMillis,
  getLastBatchMillis: () => get().lastBatchMillis,

  setLastBatchMillis: (lastBatchMillis) => set({ lastBatchMillis }),
  setLastWriteMillis: (lastWriteMillis) => set({ lastWriteMillis }),
  setLastWriteMillis: () => {
    let lastWriteMillis = new Date().getTime();
    set({ lastWriteMillis });
  },
  resetLastWriteMillis: () =>
    set({ lastWriteMillis: 9999999999999999999999999 }),
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

export const useLoginStore = create((set, get) => ({
  webcamDetected: false,
  adminPrivilege: "",
  loginTimeout: 0,
  // currentUserObj: { first: "Fritz", last: "Hieb", id: "1234" }, //testing
  currentUserObj: null,
  punchClockArr: [],
  modalVisible: false,
  lastActionMillis: 0,
  postLoginFunctionCallback: () => {},
  showLoginScreen: false,

  // face login
  runBackgroundRecognition: true,

  getPunchClockArr: () => get().punchClockArr,
  getWebcamDetected: () => get().webcamDetected,
  getRunBackgroundRecognition: () => get().runBackgroundRecognition,
  getLoginFunctionCallback: () => get().loginFunctionCallback,
  getShowLoginScreen: () => get().showLoginScreen,
  getLastActionMillis: () => get().lastActionMillis,
  getCurrentUserObj: () => get().currentUserObj,
  getAdminPrivilege: () => get().adminPrivilege,
  getModalVisible: () => get().modalVisible,
  getUserHasEditRole: () => {},
  getUserHasAdminRole: () => {
    let user = get().currentUserObj;
    if (!user) return;
  },

  // local app user
  setCurrentUserObj: (currentUserObj) => {
    set({ currentUserObj });
  },

  // create new punch obj, log user in locally and send punch obj to DB
  setCreateUserClockObj: (userID, millis, option) =>
    set(() => {
      let punchObj = { ...TIME_PUNCH_PROTO };
      punchObj.id = generateRandomID();
      punchObj.userID = userID;
      punchObj.option = option;
      punchObj.millis = millis;
      // dbSetOrUpdateUserPunchObj(punchObj);

      let punchClockArr = cloneDeep(get().punchClockArr);
      if (option === "out") {
        punchClockArr = punchClockArr.filter((o) => o.userID != userID);
        return dbSetOrUpdateUserPunchObj(punchObj, true);
      } else {
        if (!punchClockArr.find((o) => o.userID === userID)) {
          punchClockArr.push(punchObj);
          return dbSetOrUpdateUserPunchObj(punchObj);
        }
      }
    }),

  setSinglePunchObjInPunchArr: (punchObj, option, sendToDB = false) => {
    let punchClockArr = cloneDeep(get().punchClockArr);
    if (option === "add") {
      if (!punchClockArr.find((obj) => obj.id === punchObj.id))
        punchClockArr.push(punchObj);
    } else if (option === "change") {
      punchClockArr = punchClockArr.map((obj) => {
        if (obj.id === punchObj.id) return punchObj;
        return obj;
      });
    } else {
      punchClockArr = punchClockArr.filter((obj) => obj.id != punchObj.id);
    }
    // clog(punchClockArr);
    set({ punchClockArr });
    // if (sendToDB)
  },
  setPunchClockArr: (punchClockArr) => set({ punchClockArr }),
  setWebcamDetected: (webcamDetected) => set(() => ({ webcamDetected })),
  setRunBackgroundRecognition: (runBackgroundRecognition) =>
    set(() => ({ runBackgroundRecognition })),
  setModalVisible: (modalVisible) => set((state) => ({ modalVisible })),
  setLoginTimeout: (loginTimeout) => set((state) => ({ loginTimeout })),

  setLastActionMillis: () => set({ lastActionMillis: new Date().getTime() }),
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
  // modItem: (item, option) => {
  //   if (option === "change")
  //     return set((state) => ({
  //       inventoryArr: changeItem(get().inventoryArr, item),
  //     }));
  //   if (option === "add")
  //     return set((state) => ({
  //       inventoryArr: addItem(get().inventoryArr, item),
  //     }));
  //   if (option === "remove")
  //     return set((state) => ({
  //       inventoryArr: removeItem(get().inventoryArr, item),
  //     }));
  // },

  removeItem: (item, sendToDB = true, batch = true) => {
    let inventoryArr = cloneDeep(get().inventoryArr);
    let invItemIdx = inventoryArr.findIndex((obj) => obj.id === item.id);
    inventoryArr = inventoryArr.filter((o) => o.id === item.id);
    set({ inventoryArr });

    if (sendToDB) dbSetInventoryItem(item, batch, true);
  },
  setItem: (item, sendToDB = true, batch = true) => {
    // clog("item", item);
    let inventoryArr = cloneDeep(get().inventoryArr);
    let invItemIdx = inventoryArr.findIndex((obj) => obj.id === item.id);
    if (invItemIdx >= 0) {
      inventoryArr[invItemIdx] = item;
    } else {
      inventoryArr.push(item);
    }
    set({ inventoryArr });
    if (sendToDB) dbSetInventoryItem(item, batch);
  },
  // setEntireArr: ()
}));

export const useOpenWorkordersStore = create((set, get) => ({
  workorderArr: [],
  openWorkorderObj: null,
  openWorkorderObj: null,

  // getOpenWorkorderObj: () => {
  //   let openWorkorderID = get().openWorkorderObjID;
  //   let arr = get().workorderArr;
  //   let openWorkorderObj = arr.find((o) => o.id === openWorkorderID);
  //   // clog("wo", openWorkorderObj);
  //   return openWorkorderObj;
  // },
  getOpenWorkorderObj: () => get().openWorkorderObj,
  getWorkorderArr: () => get().workorderArr,

  // setters
  setOpenWorkorderObj: (openWorkorderObj) => {
    set({ openWorkorderObj });
  },

  setWorkorder: (wo, saveToDB = true, batch = true) => {
    let workorderArr = cloneDeep(get().workorderArr);
    let foundWOIdx = workorderArr.findIndex((o) => o.id === wo.id) >= 0;
    if (foundWOIdx) {
      workorderArr[foundWOIdx] = wo;
    } else {
      workorderArr.push(wo);
    }
    set({ workorderArr });

    if (get().openWorkorderObj?.id === wo.id) set({ openWorkorderObj: wo });

    if (saveToDB) {
      dbSetWorkorder(wo, batch, false);
    } // need db fun
  },

  removeWorkorder: (wo, saveToDB = true, batch = true) => {
    let workorderArr = cloneDeep(get().workorderArr);
    workorderArr = workorderArr.filter((o) => o.id != wo.id);
    set({ workorderArr });

    if (get().openWorkorderObj?.id === wo.id) set({ openWorkorderObj: null });

    if (saveToDB) {
      dbSetWorkorder(wo, batch, true);
    }
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
  setPreviewObj: (obj) => set((state) => ({ previewObj: obj })),
}));

export const useSettingsStore = create((set, get) => ({
  settingsObj: null,

  getSettingsObj: () => get().settingsObj,

  setSettingsObj: (settingsObj, batch = true, sendToDB = true) => {
    // clog(settingsObj);
    set({ settingsObj });
    if (sendToDB) {
      dbSetSettings(settingsObj, batch);
    }
  },

  setField: (fieldName, fieldVal, sendToDB = true, batch = true) => {
    let settingsObj = get().settingsObj || {};
    settingsObj = cloneDeep(settingsObj);
    settingsObj[fieldName] = fieldVal;
    // log(fieldName, fieldVal);
    set({ settingsObj });
    if (sendToDB) dbSetSettings(settingsObj, batch);
  },
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

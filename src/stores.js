/* eslint-disable */

import { create } from "zustand";
import {
  CUSTOMER_PROTO,
  INVENTORY_ITEM_PROTO,
  PRIVILEDGE_LEVELS,
  TAB_NAMES,
  TIME_PUNCH_PROTO,
} from "./data";
import {
  addOrRemoveFromArr,
  arrHasItem,
  checkArr,
  generateUPCBarcode,
  log,
  removeFieldFromObj,
  replaceOrAddToArr,
} from "./utils";
import { cloneDeep } from "lodash";
import {
  dbSetInventoryItem,
  dbSetCustomerField,
  dbGetOpenWorkorderItem,
  dbGetClosedWorkorderItem,
  dbGetSaleItem,
} from "./db_call_wrapper";
import {
  dbGetCompletedSale,
  dbGetCompletedWorkorder,
  dbSaveCurrentPunchClock,
  dbSaveCustomer,
  dbSaveOpenWorkorder,
  dbSavePunchObject,
  dbSaveSettings,
  dbSaveSettingsField,
} from "./db_calls_wrapper";

// internal use  /////////////////////////////////////////////////////

export const useTabNamesStore = create((set, get) => ({
  infoTabName: TAB_NAMES.infoTab.customer,
  itemsTabName: TAB_NAMES.itemsTab.workorderItems,
  optionsTabName: TAB_NAMES.optionsTab.workorders,

  getItemsTabName: () => get().itemsTabName,
  getOptionsTabName: () => get().optionsTabName,
  getInfoTabName: () => get().infoTabName,

  setItems: (obj) => set({ ...obj }),
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

export const useCustomerSearchStore = create((set, get) => ({
  selectedItem: null,
  searchResults: [],
  getSearchResults: () => get().searchResults,
  getSelectedItem: () => get().selectedItem,
  setSelectedItem: (item) =>
    set({
      selectedItem: item,
    }),
  setSearchResults: (searchResults) => set({ searchResults }),
  addToSearchResults: (searchResults) => {
    let storeSearchResults = get().searchResults;
    searchResults.forEach((searchResult) => {
      if (arrHasItem(storeSearchResults, searchResult)) return;
      storeSearchResults = [...storeSearchResults, searchResult];
    });
    set({ searchResults: storeSearchResults });
  },
  reset: () => set({ searchResults: [], selectedItem: null }),
}));

export const useCheckoutStore = create((set, get) => ({
  isCheckingOut: false,
  saleObj: null,
  receiptScan: "",
  message: "",
  loading: false,

  getMessage: () => get().message,
  getLoading: () => get().loading,
  getSaleObj: () => get().saleObj,
  getIsCheckingOut: () => get().isCheckingOut,
  getReceiptScan: () => get().receiptScan,

  setStringOnly: (receiptScan) => set({ receiptScan }),
  setLoading: (loading) => set({ loading }),
  // setSaleObj: (saleObj) => set({ saleObj }),
  setIsCheckingOut: (isCheckingOut) => set({ isCheckingOut }),
  setReceiptScan: (receiptScan, callback) => {
    set({ receiptScan });
    if (receiptScan?.length === 12) {
      set({
        message: "Searching for transaction...",
      });

      dbGetSaleItem(receiptScan)
        .then((sale) => {
          if (sale) {
            set({
              message: "Transaction Found! Gathering details...",
            });

            let count = 0;
            let workorders = [];
            sale.workorderIDs.forEach((workorderID) => {
              dbGetOpenWorkorderItem(workorderID).then((workorder) => {
                count++;
                // if (workorder) addToCombinedArr(workorder);
                if (workorder) workorders.push(workorder);
                // log(workorder);
                if (count === sale.workorderIDs.length) {
                  callback ? callback(workorders, sale) : null;
                  set({
                    message: "Sale found!",
                  });
                  // splitIncomingRefundWorkorderLines(workorders, sale);
                  // _setCombinedWorkorders(workorders);
                }
                // addToCombinedArr(workorders, sale);
              });

              dbGetClosedWorkorderItem(workorderID).then((workorder) => {
                count++;
                // if (res) addToCombinedArr(res);
                if (workorder) workorders.push(workorder);
                if (count === sale.workorderIDs.length)
                  callback ? callback(workorders, sale) : null;
                set({
                  message: "Sale found!",
                });
                // splitIncomingRefundWorkorderLines(workorders, sale);
              });
            });
          } else {
            // todo message does not exist
            set({ message: "This 12-digit sale ID does not exist" });
          }
        })
        .catch((e) => log("refund error", e));
    } else if (receiptScan.length > 0 && receiptScan.length < 12) {
      set({ message: receiptScan.length + "/12   " });
    } else {
      // _setRefundScanMessage("");
    }
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
  pauseOnBaseComponent: false,

  getPauseOnBaseComponent: () => get().pauseOnBaseComponent,
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
    canExitOnOuterClick = false,
    alertBoxStyle = {},
    showAlert = true,
    pauseOnBaseComponent = false,
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
      showAlert,
      pauseOnBaseComponent,
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
  setShowAlert: (showAlert) => set({ showAlert }),

  resetAll: () => {
    set(() => ({
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
      pauseOnBaseComponent: false,
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
  // currentUser: cloneDeep(FRITZ_USER_OBJ), //testing
  currentUser: null,
  punchClock: {}, // object of current user punches showing who is currently logged in
  modalVisible: false,
  lastActionMillis: 0,
  postLoginFunctionCallback: () => {},
  showLoginScreen: false,

  // face login
  runBackgroundRecognition: true,

  getPunchClock: () => get().punchClock,
  getWebcamDetected: () => get().webcamDetected,
  getRunBackgroundRecognition: () => get().runBackgroundRecognition,
  getLoginFunctionCallback: () => get().loginFunctionCallback,
  getShowLoginScreen: () => get().showLoginScreen,
  getLastActionMillis: () => get().lastActionMillis,
  getCurrentUser: () => get().currentUser,
  getAdminPrivilege: () => get().adminPrivilege,
  getModalVisible: () => get().modalVisible,
  getUserHasEditRole: () => {},
  getUserHasAdminRole: () => {
    let user = get().currentUserObj;
    if (!user) return;
  },

  // local app user
  setCurrentUser: (currentUser) => {
    set({ currentUser });
  },

  // create new punch obj, log user in locally and send punch obj to DB
  setCreateUserClock: (userID, millis, option) => {
    let punch = { ...TIME_PUNCH_PROTO };
    punch.id = generateUPCBarcode();
    punch.userID = userID;
    punch.option = option;
    punch.millis = millis;

    let punchClock = get().punchClock;

    if (option === "in") {
      punchClock[userID] = punch;
    } else {
      punchClock = removeFieldFromObj(punchClock, userID);
    }

    set({
      punchClock,
    });
    dbSaveCurrentPunchClock(punchClock, "1234", "999");
    dbSavePunchObject(punch, punch.id, "1234", "999");
  },

  setPunchClock: (punchClock) => set({ punchClock }),
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
  getInventoryItem: (itemID) => {
    return get().inventoryArr.find((o) => o.id === itemID);
  },
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
  setItems: (inventoryArr) => set({ inventoryArr }),
}));

export const useCurrentCustomerStore = create((set, get) => ({
  customer: { ...CUSTOMER_PROTO },
  sales: [],
  workorders: [],
  salesLoading: false,
  workordersLoading: false,
  getCustomer: () => get().customer,
  getWorkorders: () => get().workorders,
  getSales: () => get().sales,
  getSalesLoading: () => get().salesLoading,
  getWorkordersLoading: () => get().workordersLoading,

  setCustomerField: (fieldName, value, saveToDB = true) => {
    set({ customer: { ...get().customer, [fieldName]: value } });
    if (saveToDB) dbSaveSettingsField(fieldName, value);
  },
  setCustomer: (customer, sendToDB = true) => {
    set({ customer });
    if (sendToDB) dbSaveCustomer(customer);
  },

  loadWorkorders: () => {
    // testing
    // log(useOpenWorkordersStore.getState().getWorkorders());
    // set({
    //   workorders: [...useOpenWorkordersStore.getState().getWorkorders()],
    // });

    // return;

    set({ workordersLoading: true });
    let target = get().customer.workorders?.length;
    let count = 0;
    let workorders = useOpenWorkordersStore.getState().getWorkorders();
    get().customer.workorders?.forEach((workorderID) => {
      if (workorders.find((wo) => wo.id === workorderID)) {
        count++;
        set({
          workorders: replaceOrAddToArr(
            get().workorders,
            workorders.find((wo) => wo.id === workorderID)
          ),
        });
      } else {
        dbGetCompletedWorkorder(workorderID).then((workorder) => {
          count++;
          set({ workorders: replaceOrAddToArr(get().workorders, workorder) });
          if (count === target) set({ workordersLoading: false });
        });
      }
    });
  },

  loadSales: () => {
    // let sale = {
    //   amountCaptured: "45654",
    //   id: 125425652125,
    //   millis: new Date().getTime(),
    //   workorderIDs: ["018609309556", "068688807311"],
    //   payments: [
    //     {
    //       amountCaptured: "45434",
    //       last4: "3454",
    //       cardType: "Visa (traditional)",
    //       expMonth: 10,
    //       expYear: 28,
    //       millis: new Date().getTime(),
    //       isRefund: false,
    //       amountRefunded: 0,
    //       id: "123652145256",
    //     },
    //   ],
    // };

    // return [sale, sale, sale, sale];

    set({ salesLoading: true });
    let target = get().customer.sales?.length;
    let count = 0;
    get().customer.sales?.forEach((salesID) => {
      dbGetCompletedSale(salesID).then((sale) => {
        count++;
        set({ sales: replaceOrAddToArr(get().sales, sale) });
        if (count === target) set({ salesLoading: false });
      });
    });
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

export const useOpenWorkordersStore = create((set, get) => ({
  workorders: [],
  openWorkorder: null,

  getOpenWorkorder: () => get().openWorkorder,
  getWorkorders: () => get().workorders,

  // setters
  setOpenWorkorder: (openWorkorder) => {
    // log(openWorkorderObj);
    set({ openWorkorder });
  },
  // setOpenWorkorders: (workorders) => {
  //   log('workorders', workorders[0])
  //   let custID = workorders[0].id;
  //   dbGetCustomer(custID, '1236', '999').then(cust => useCurrentCustomerStore.getState().setCustomer(cust))
  //   set({openWorkorderObj: workorders[0], workorders })
  // }, // testing
  setOpenWorkorders: (workorders) => set({ workorders }), // real one
  setWorkorder: (wo, saveToDB = true, batch = true) => {
    if (wo.isStandaloneSale) {
      set({ openWorkorder: wo });
      return;
    }

    // dev*************************************************
    // if (wo.id === "812140743019") {
    //   // clog("setting", wo);
    //   set({ openWorkorderObj: wo });
    // }

    // ****************************************************

    let workorders = cloneDeep(get().workorders);
    let foundWOIdx = workorders.findIndex((o) => o.id === wo.id) >= 0;
    if (foundWOIdx) {
      workorders[foundWOIdx] = wo;
    } else {
      workorders.push(wo);
    }
    set({ workorderArr: addOrRemoveFromArr(wo) });

    // not set it as open workorder if it is such
    if (get().openWorkorder?.id === wo.id) {
      set({ openWorkorder: wo });
    }

    if (saveToDB) {
      dbSaveOpenWorkorder(wo, "1234", "999");
      // dbSetWorkorder(wo, batch, false);
    } // need db fun
  },

  removeWorkorder: (wo, saveToDB = true, batch = true) => {
    let workorders = cloneDeep(get().workorders);
    workorders = workorders.filter((o) => o.id != wo.id);
    set({ workorderArr: workorders });

    if (get().openWorkorder?.id === wo.id) set({ openWorkorder: null });

    if (saveToDB) {
      dbSaveOpenWorkorder(wo, "1234", "999");
    }
  },

  // handles live DB subscription changes
  // modItem: (item, option) => {
  //   // log(item, option);
  //   if (option === "change")
  //     set((state) => ({
  //       workorderArr: changeItem(get().workorderArr, item),
  //     }));
  //   if (option === "add")
  //     set((state) => ({
  //       workorderArr: addItem(get().workorderArr, item),
  //     }));
  //   if (option === "remove")
  //     set((state) => ({
  //       workorderArr: removeItem(get().workorderArr, item),
  //     }));
  // },
}));

export const useWorkorderPreviewStore = create((set, get) => ({
  previewObj: null,
  getPreviewObj: () => get().previewObj,
  setPreviewObj: (obj) => set((state) => ({ previewObj: obj })),
}));

export const useSettingsStore = create((set, get) => ({
  // settingsObj: null,
  settings: null,

  // getSettingsObj: () => get().settingsObj,
  getSettings: () => get().settings,

  setSettings: (settings, batch = true, sendToDB = true) => {
    // clog(settingsObj);
    // set({ settingsObj: settings });
    set({ settings });

    if (sendToDB) {
      // log("savingsetting");
      dbSaveSettings(settings);
    }
  },

  setField: (fieldName, fieldVal, sendToDB = true, batch = true) => {
    let settings = get().settings || {};
    settings = cloneDeep(settings);
    settings[fieldName] = fieldVal;
    // log(fieldName, fieldVal);
    set({ settings: settings });
    // if (sendToDB) dbSetSettings(settings, batch);
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

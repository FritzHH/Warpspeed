/* eslint-disable */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  CUSTOMER_PROTO,
  FRITZ_USER_OBJ,
  INVENTORY_ITEM_PROTO,
  PRIVILEDGE_LEVELS,
  TAB_NAMES,
  TIME_PUNCH_PROTO,
} from "./data";
import {
  addOrRemoveFromArr,
  arrHasItem,
  checkArr,
  log,
  removeFieldFromObj,
  replaceOrAddToArr,
  resolveStatus,
} from "./utils";
import { cloneDeep, debounce } from "lodash";
import { broadcastToDisplay, broadcastClear, DISPLAY_MSG_TYPES } from "./broadcastChannel";
import { calculateRunningTotals } from "./utils";

import {
  dbDeleteWorkorder,
  dbGetCompletedSale,
  dbGetCompletedWorkorder,
  dbGetWorkorder,
  dbSaveCurrentPunchClock,
  dbSaveCustomer,
  dbSaveInventoryItem,
  dbSaveOpenWorkorder,
  dbSavePunchObject,
  dbSaveSettings,
  dbSaveSettingsField,
  dbSendSMS,
  dbGetCustomer,
} from "./db_calls_wrapper";

// IndexedDB storage adapter for Zustand persist (used by inventory — too large for localStorage)
const idbStorage = (() => {
  const DB_NAME = "warpspeed_persist";
  const STORE_NAME = "keyval";
  const open = () => new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return {
    getItem: async (key) => {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const req = tx.objectStore(STORE_NAME).get(key);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error);
      });
    },
    setItem: async (key, value) => {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },
    removeItem: async (key) => {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },
  };
})();

// internal use  /////////////////////////////////////////////////////

export const useLayoutStore = create((set, get) => ({
  width: 0,
  height: 0,
  simWidth: 390,
  simHeight: 844,
  useSimulator: false,
  isMobile: false,
  deviceType: "desktop", // "mobile" | "tablet" | "desktop"

  getDeviceType: () => get().deviceType,
  setDeviceType: (deviceType) => set({ deviceType }),
  getDimensions: () => {
    let width = get().width;
    let height = get().height;

    if (get().useSimulator) {
      width = get().simWidth;
      height = get().simHeight;
    }
    return { width, height }
  },
  setWindow: (window) => set({ width: window.innerWidth, height: window.innerHeight }),
  setUseSimulator: (useSimulator) => set({ useSimulator }),
  setIsMobile: (isMobile) => set({ isMobile }),
}));

export const useTabNamesStore = create(
  persist(
    (set, get) => ({
      infoTabName: TAB_NAMES.infoTab.customer,
      itemsTabName: TAB_NAMES.itemsTab.empty,
      optionsTabName: TAB_NAMES.optionsTab.workorders,

      getItemsTabName: () => get().itemsTabName,
      getOptionsTabName: () => get().optionsTabName,
      getInfoTabName: () => get().infoTabName,

      setItems: (obj) => { set({ ...obj }); },
      setInfoTabName: (name) => {
        set((state) => ({ infoTabName: name }));
      },
      setItemsTabName: (name) => {
        set((state) => ({ itemsTabName: name }));
      },
      setOptionsTabName: (name) => {
        set((state) => ({ optionsTabName: name }));
      },

      // Dashboard_Admin persistent navigation state
      dashboardExpand: null,
      getDashboardExpand: () => get().dashboardExpand,
      setDashboardExpand: (val) => set({ dashboardExpand: val }),

      dashboardQBParentID: null,
      getDashboardQBParentID: () => get().dashboardQBParentID,
      setDashboardQBParentID: (val) => set({ dashboardQBParentID: val }),

      dashboardQBMenuPath: [],
      getDashboardQBMenuPath: () => get().dashboardQBMenuPath,
      setDashboardQBMenuPath: (val) => set({ dashboardQBMenuPath: val }),
    }),
    {
      name: "warpspeed_tabs",
      partialize: (s) => ({
        infoTabName: s.infoTabName,
        itemsTabName: s.itemsTabName,
        optionsTabName: s.optionsTabName,
      }),
    }
  )
);

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
  searchQuery: "",
  searchType: "phone", // "phone" | "name" | "email"
  isSearching: false,
  getSearchResults: () => get().searchResults,
  getSelectedItem: () => get().selectedItem,
  getSearchQuery: () => get().searchQuery,
  getSearchType: () => get().searchType,
  getIsSearching: () => get().isSearching,
  setIsSearching: (isSearching) => set({ isSearching }),
  setSelectedItem: (item) =>
    set({
      selectedItem: item,
    }),
  setSearchResults: (searchResults) => set({ searchResults }),
  setSearchQuery: (searchQuery, searchType) => set({ searchQuery, searchType }),
  addToSearchResults: (searchResults) => {
    let storeSearchResults = get().searchResults;
    searchResults.forEach((searchResult) => {
      if (arrHasItem(storeSearchResults, searchResult)) return;
      storeSearchResults = [...storeSearchResults, searchResult];
    });
    set({ searchResults: storeSearchResults });
  },
  reset: () => set({ searchResults: [], selectedItem: null, searchQuery: "", searchType: "phone", isSearching: false }),
}));

export const useCheckoutStore = create((set, get) => ({
  isCheckingOut: false,
  saleObj: null,
  receiptScan: "",
  message: "",
  loading: false,
  viewOnlySale: null,
  isViewOnly: false,
  depositInfo: null,

  getMessage: () => get().message,
  getLoading: () => get().loading,
  getSaleObj: () => get().saleObj,
  getIsCheckingOut: () => get().isCheckingOut,
  getReceiptScan: () => get().receiptScan,

  setStringOnly: (receiptScan) => set({ receiptScan }),
  setLoading: (loading) => set({ loading }),
  // setSaleObj: (saleObj) => set({ saleObj }),
  setIsCheckingOut: (isCheckingOut) => set({ isCheckingOut }),
  setDepositInfo: (depositInfo) => set({ depositInfo }),
  setViewOnlySale: (sale) => set({ viewOnlySale: sale, isViewOnly: !!sale?.paymentComplete }),
  setReceiptScan: (receiptScan, callback) => {
    set({ receiptScan });
    if (receiptScan?.length === 12) {
      set({
        message: "Searching for transaction...",
      });

      dbGetCompletedSale(receiptScan)
        .then((sale) => {
          if (sale) {
            set({
              message: "Transaction Found! Gathering details...",
            });

            let count = 0;
            let workorders = [];
            sale.workorderIDs.forEach((workorderID) => {
              dbGetWorkorder(workorderID).then((workorder) => {
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

              dbGetCompletedWorkorder(workorderID).then((workorder) => {
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

export const useTicketSearchStore = create((set, get) => ({
  results: [],
  isSearching: false,
  getResults: () => get().results,
  getIsSearching: () => get().isSearching,
  setResults: (results) => set({ results }),
  setIsSearching: (isSearching) => set({ isSearching }),
  reset: () => set({ results: [], isSearching: false }),
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
  useCancelButton: false,
  fullScreen: true,

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
    useCancelButton,
    fullScreen = false,
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
      useCancelButton,
      fullScreen,
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
      useCancelButton: false,
      fullScreen: true,
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

  // ── Card transaction state (persists across CardPayment re-mounts) ──
  cardStatus: "idle", // "idle" | "initiating" | "waitingForCard" | "processingPayment" | "succeeded" | "failed" | "readerBusy" | "clearing"
  cardError: "",
  cardMessage: "",

  getCardStatus: () => get().cardStatus,
  getCardError: () => get().cardError,
  getCardMessage: () => get().cardMessage,

  setCardStatus: (cardStatus) => set({ cardStatus }),
  setCardError: (cardError) => set({ cardError }),
  setCardMessage: (cardMessage) => set({ cardMessage }),

  resetCardTransaction: () =>
    set({
      cardStatus: "idle",
      cardError: "",
      cardMessage: "",
      paymentIntentID: null,
    }),

  // Non-reactive refs (set via getState(), not in set())
  // _cardListeners: null   — Firestore listener { unsubscribe }
  // _cardTimeout: null      — payment timeout ID
}));

export const useLoginStore = create(
  persist(
    (set, get) => ({
  webcamDetected: false,
  adminPrivilege: "",
  loginTimeout: 0,
  currentUser: cloneDeep(FRITZ_USER_OBJ), //testing
  // currentUser: null,
  punchClock: {}, // object of current user punches showing who is currently logged in
  modalVisible: false,
  lastActionMillis: Date.now(), //testing
  postLoginFunctionCallback: null,
  showLoginScreen: false,
  cameraStatus: "loading", // "loading" | "ready" | "failed" | "idle" | "matched"
  cameraError: null,

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
    punch.id = crypto.randomUUID();
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
    let tenantID = useSettingsStore.getState().getSettings()?.tenantID;
    let storeID = useSettingsStore.getState().getSettings()?.storeID;
    dbSaveCurrentPunchClock(punchClock, tenantID, storeID);
    dbSavePunchObject(punch, punch.id, tenantID, storeID);
  },

  setPunchClock: (punchClock) => set({ punchClock }),
  setWebcamDetected: (webcamDetected) => set(() => ({ webcamDetected })),
  setCameraStatus: (cameraStatus) => set({ cameraStatus }),
  setCameraError: (cameraError) => set({ cameraError }),
  setPostLoginFunctionCallback: (postLoginFunctionCallback) => set({ postLoginFunctionCallback }),
  setRunBackgroundRecognition: (runBackgroundRecognition) =>
    set(() => ({ runBackgroundRecognition })),
  setModalVisible: (modalVisible) => set((state) => ({ modalVisible })),
  setLoginTimeout: (loginTimeout) => set((state) => ({ loginTimeout })),

  setLastActionMillis: () => set({ lastActionMillis: new Date().getTime() }),
  setShowLoginScreen: (showLoginScreen) => {
    set((state) => ({ showLoginScreen }));
  },

  requireLogin: (callback) => {
    let lastAction = get().lastActionMillis;
    let now = new Date().getTime();
    let diffSeconds = (now - lastAction) / 1000;
    let timeout = useSettingsStore.getState().getSettings()?.activeLoginTimeoutSeconds || 60;
    let userObj = get().currentUser;

    // DEV: skip timeout for testing user
    if (userObj?.id === FRITZ_USER_OBJ.id) {
      set({ lastActionMillis: now });
      diffSeconds = 0;
    }

    if (!userObj || diffSeconds > timeout) {
      // If we know who the user is (face recognized) but they're not clocked in,
      // offer clock-in as a way to authenticate — clocking in counts as logging in
      if (userObj && !get().punchClock[userObj.id]) {
        useAlertScreenStore.getState().setValues({
          title: "PUNCH CLOCK",
          message: "Hi " + userObj.first + ", you are not clocked in. Would you like to punch in now?",
          btn1Text: "CLOCK IN",
          btn2Text: "CANCEL",
          handleBtn1Press: () => {
            get().setCreateUserClock(userObj.id, new Date().getTime(), "in");
            get().setLastActionMillis();
            callback();
          },
          handleBtn2Press: () => {
            // Declined clock-in, show regular login modal
            set({
              postLoginFunctionCallback: () => { callback(); },
              showLoginScreen: true,
              adminPrivilege: "",
            });
          },
          showAlert: true,
        });
        return;
      }

      set({
        postLoginFunctionCallback: () => {
          callback();
        },
        showLoginScreen: true,
        adminPrivilege: "",
      });
      return;
    }
    callback();
  },

  execute: (postLoginFunctionCallback, priviledgeLevel) => {
    let lastMillis = get().lastActionMillis;
    let cur = new Date().getTime();
    let diff = (cur - lastMillis) / 1000;
    let userObj = get().currentUser;

    // DEV: skip timeout for testing user
    if (userObj?.id === FRITZ_USER_OBJ.id) {
      set({ lastActionMillis: cur });
      diff = 0;
    }

    let hasAccess = true;

    if (priviledgeLevel && userObj) {
      let perm = userObj.permissions?.name || userObj.permissions;
      hasAccess = false;
      if (priviledgeLevel === PRIVILEDGE_LEVELS.user) hasAccess = true;
      if (priviledgeLevel === PRIVILEDGE_LEVELS.superUser &&
        (perm === PRIVILEDGE_LEVELS.superUser || perm === PRIVILEDGE_LEVELS.admin || perm === PRIVILEDGE_LEVELS.owner))
        hasAccess = true;
      if (priviledgeLevel === PRIVILEDGE_LEVELS.admin &&
        (perm === PRIVILEDGE_LEVELS.admin || perm === PRIVILEDGE_LEVELS.owner))
        hasAccess = true;
      if (priviledgeLevel === PRIVILEDGE_LEVELS.owner && perm === PRIVILEDGE_LEVELS.owner)
        hasAccess = true;
    }

    let timeout = useSettingsStore.getState().getSettings()?.activeLoginTimeoutSeconds || 60;
    if (diff > timeout || !hasAccess || !userObj) {
      set({ postLoginFunctionCallback, showLoginScreen: true, adminPrivilege: priviledgeLevel || "" });
      return;
    } else if (hasAccess) {
      postLoginFunctionCallback();
    }
  },
  runPostLoginFunction: () => {
    const cb = get().postLoginFunctionCallback;
    if (cb) {
      cb();
      set({ postLoginFunctionCallback: null });
    }
  },
    }),
    {
      name: "warpspeed_punch_clock",
      partialize: (s) => ({ punchClock: s.punchClock }),
    }
  )
);

export const useInventoryStore = create(
  persist(
    (set, get) => ({
      inventoryArr: [],
      getInventoryArr: () => get().inventoryArr,
      getInventoryItem: (itemID) => {
        return get().inventoryArr.find((o) => o.id === itemID);
      },
      removeItem: (item, sendToDB = true, batch = true) => {
        let inventoryArr = cloneDeep(get().inventoryArr);
        let invItemIdx = inventoryArr.findIndex((obj) => obj.id === item.id);
        inventoryArr = inventoryArr.filter((o) => o.id === item.id);
        set({ inventoryArr });

        if (sendToDB) dbSaveInventoryItem(item);
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
        if (sendToDB) dbSaveInventoryItem(item, batch);
      },
      setItems: (inventoryArr) => set({ inventoryArr }),
    }),
    {
      name: "warpspeed_inventory",
      storage: idbStorage,
      partialize: (s) => ({ inventoryArr: s.inventoryArr }),
    }
  )
);

export const useCurrentCustomerStore = create(
  persist(
    (set, get) => ({
      customer: { ...CUSTOMER_PROTO },
      customerRefreshed: false,
      sales: [],
      workorders: [],
      salesLoading: false,
      workordersLoading: false,
      getCustomer: () => get().customer,
      getCustomerRefreshed: () => get().customerRefreshed,
      getWorkorders: () => get().workorders,
      getSales: () => get().sales,
      getSalesLoading: () => get().salesLoading,
      getWorkordersLoading: () => get().workordersLoading,

      setCustomerField: (fieldName, value, saveToDB = true) => {
        // log({ ...get().customer, [fieldName]: value });
        set({ customer: { ...get().customer, [fieldName]: value } });
        if (saveToDB) dbSaveCustomer({ ...get().customer, [fieldName]: value });
      },
      setCustomer: (customer, sendToDB = true) => {
        set({ customer, customerRefreshed: true });
        // log(get().customer, customer)
        if (sendToDB) dbSaveCustomer(customer);
      },

      loadWorkorders: () => {
        set({ workordersLoading: true });
        const woIDs = get().customer.workorders || [];
        if (woIDs.length === 0) { set({ workordersLoading: false }); return; }
        let target = woIDs.length;
        let count = 0;
        const openWorkorders = useOpenWorkordersStore.getState().getWorkorders();
        const done = () => { count++; if (count >= target) set({ workordersLoading: false }); };
        woIDs.forEach((workorderID) => {
          const local = openWorkorders.find((wo) => wo.id === workorderID);
          if (local) {
            set({ workorders: replaceOrAddToArr(get().workorders, local) });
            done();
          } else {
            dbGetCompletedWorkorder(workorderID)
              .then((workorder) => {
                if (workorder) set({ workorders: replaceOrAddToArr(get().workorders, workorder) });
                done();
              })
              .catch(() => { done(); });
          }
        });
      },

      loadSales: () => {
        set({ salesLoading: true });
        const saleIDs = get().customer.sales || [];
        if (saleIDs.length === 0) { set({ salesLoading: false }); return; }
        let target = saleIDs.length;
        let count = 0;
        const done = () => { count++; if (count >= target) set({ salesLoading: false }); };
        saleIDs.forEach((salesID) => {
          dbGetCompletedSale(salesID)
            .then((sale) => {
              if (sale) set({ sales: replaceOrAddToArr(get().sales, sale) });
              done();
            })
            .catch(() => { done(); });
        });
      },
    }),
    {
      name: "warpspeed_customer",
      partialize: (s) => ({ customer: s.customer }),
      onRehydrateStorage: () => (state, error) => {
        if (error || !state) return;
        const cachedCustomer = state.customer;
        if (cachedCustomer?.id) {
          dbGetCustomer(cachedCustomer.id).then((freshCustomer) => {
            if (freshCustomer) {
              useCurrentCustomerStore.setState({ customer: freshCustomer, customerRefreshed: true });
            } else {
              useCurrentCustomerStore.setState({ customerRefreshed: true });
            }
          }).catch(() => {
            useCurrentCustomerStore.setState({ customerRefreshed: true });
          });
        } else {
          useCurrentCustomerStore.setState({ customerRefreshed: true });
        }
      },
    }
  )
);

export const useCustMessagesStore = create((set, get) => ({
  incomingMessages: [],
  outgoingMessages: [],
  messagesLoading: false,
  getIncomingMessages: () => get().incomingMessages,
  getOutgoingMessages: () => get().outgoingMessages,
  getMessagesLoading: () => get().messagesLoading,
  setMessagesLoading: (messagesLoading) => set({ messagesLoading }),
  setOutgoingMessages: (outgoingMessages) => set({ outgoingMessages }),
  setIncomingMessages: (incomingMessages) => set({ incomingMessages }),
  setIncomingMessage: (obj) => {
    let messages = get().incomingMessages;
    if (checkArr(messages, obj)) return;
    set((state) => ({
      incomingMessages: [...state.incomingMessages, obj],
    }));
  },
  setOutgoingMessage: (message) => {
    let messages = get().outgoingMessages;
    if (checkArr(messages, message)) return;
    set((state) => ({
      outgoingMessages: [...state.outgoingMessages, message],
    }));
  },
  updateMessageStatus: (messageId, status, errorMessage) => {
    set((state) => ({
      outgoingMessages: state.outgoingMessages.map((msg) =>
        msg.id === messageId ? { ...msg, status, errorMessage: errorMessage || "" } : msg
      ),
    }));
  },
  clearMessages: () => set({ incomingMessages: [], outgoingMessages: [] }),
}));

const debouncedSaveWorkorder = debounce((workorder) => {
  dbSaveOpenWorkorder(workorder);
}, 500);

export function broadcastWorkorderToDisplay(wo) {
  if (!wo) return;

  if (!wo.workorderLines || wo.workorderLines.length === 0) {
    broadcastClear();
    return;
  }

  let lines = (wo.workorderLines || []).map((line) => ({
    id: line.id,
    qty: line.qty,
    inventoryItem: {
      formalName: line.inventoryItem?.formalName || "",
      price: line.inventoryItem?.price || 0,
    },
    discountObj: line.discountObj
      ? { name: line.discountObj.name, savings: line.discountObj.savings || 0, newPrice: line.discountObj.newPrice || 0 }
      : null,
  }));

  let salesTaxPercent = useSettingsStore.getState().getSettings()?.salesTaxPercent || 0;

  // Standalone sales broadcast as SALE/Checkout type
  if (wo.isStandaloneSale) {
    let totals = calculateRunningTotals(wo, salesTaxPercent, [], false, !!wo.taxFree);
    broadcastToDisplay(DISPLAY_MSG_TYPES.SALE, {
      customerFirst: wo.customerFirst || "",
      customerLast: wo.customerLast || "",
      combinedWorkorders: [],
      addedItems: lines,
      sale: {
        subtotal: totals.runningSubtotal,
        discount: totals.runningDiscount,
        tax: totals.runningTax,
        taxRate: salesTaxPercent,
        total: totals.finalTotal,
        amountCaptured: 0,
        paymentComplete: false,
      },
    });
    return;
  }

  // Regular workorders — only show if created within last 5 minutes
  let startedOn = Number(wo.startedOnMillis) || 0;
  if (startedOn && Date.now() - startedOn > 300000) return;

  let totals = calculateRunningTotals(wo, salesTaxPercent, [], false, !!wo.taxFree);
  broadcastToDisplay(DISPLAY_MSG_TYPES.WORKORDER, {
    customerFirst: wo.customerFirst || "",
    customerLast: wo.customerLast || "",
    brand: wo.brand || "",
    model: wo.model || "",
    description: wo.description || "",
    workorderLines: lines,
    customer: {
      first: wo.customerFirst || "",
      last: wo.customerLast || "",
      customerCell: wo.customerCell || "",
      customerLandline: wo.customerLandline || "",
      email: wo.customerEmail || "",
    },
    totals: {
      runningSubtotal: totals.runningSubtotal,
      runningDiscount: totals.runningDiscount,
      runningTax: totals.runningTax,
      runningTotal: totals.finalTotal,
      runningQty: totals.runningQty,
      salesTaxPercent: salesTaxPercent,
    },
  });
}

// Manual broadcast — sends full workorder data to customer display (no 5-min filter)
export function broadcastFullWorkorderToDisplay(wo) {
  if (!wo || !wo.workorderLines || wo.workorderLines.length === 0) {
    broadcastClear();
    return;
  }

  let settings = useSettingsStore.getState().getSettings();
  let salesTaxPercent = settings?.salesTaxPercent || 0;

  let lines = (wo.workorderLines || []).map((line) => ({
    id: line.id,
    qty: line.qty,
    inventoryItem: {
      formalName: line.inventoryItem?.formalName || "",
      price: line.inventoryItem?.price || 0,
    },
    discountObj: line.discountObj
      ? { name: line.discountObj.name, savings: line.discountObj.savings || 0, newPrice: line.discountObj.newPrice || 0 }
      : null,
  }));

  let totals = calculateRunningTotals(wo, salesTaxPercent, [], false, !!wo.taxFree);

  broadcastToDisplay(DISPLAY_MSG_TYPES.WORKORDER, {
    customerFirst: wo.customerFirst || "",
    customerLast: wo.customerLast || "",
    brand: wo.brand || "",
    model: wo.model || "",
    description: wo.description || "",
    workorderLines: lines,
    customer: {
      first: wo.customerFirst || "",
      last: wo.customerLast || "",
      customerCell: wo.customerCell || "",
      customerLandline: wo.customerLandline || "",
      email: wo.customerEmail || "",
    },
    totals: {
      runningSubtotal: totals.runningSubtotal,
      runningDiscount: totals.runningDiscount,
      runningTax: totals.runningTax,
      runningTotal: totals.finalTotal,
      runningQty: totals.runningQty,
      salesTaxPercent: salesTaxPercent,
    },
    // Extended fields for rich display
    status: resolveStatus(wo.status, settings?.statuses || []),
    color1: wo.color1 || null,
    color2: wo.color2 || null,
    waitTime: wo.waitTime || "",
    waitTimeEstimateLabel: wo.waitTimeEstimateLabel || "",
    startedOnMillis: wo.startedOnMillis || "",
    workorderNumber: wo.workorderNumber || "",
    amountPaid: wo.amountPaid || 0,
    paymentComplete: wo.paymentComplete || false,
  });
}

// changelog helpers /////////////////////////////////////////////////////
const NEWLY_CREATED_STATUS_ID = "34kttekj";
const CHANGELOG_TEXT_FIELDS = ["brand", "description", "partOrdered", "partSource"];
const CHANGELOG_DISCRETE_FIELDS = ["status", "color1", "color2", "waitTime", "workorderLines", "taxFree"];
const CHANGELOG_TRACKED_FIELDS = [...CHANGELOG_TEXT_FIELDS, ...CHANGELOG_DISCRETE_FIELDS];
const changeLogDebounceMap = {};

function getChangeLogUser() {
  return useLoginStore.getState().currentUser?.first || "System";
}

function getItemName(item) {
  return item?.formalName || item?.informalName || "item";
}

function diffWorkorderLines(oldLines, newLines) {
  let entries = [];
  let oldMap = {};
  let newMap = {};
  (oldLines || []).forEach((l) => { oldMap[l.id] = l; });
  (newLines || []).forEach((l) => { newMap[l.id] = l; });

  // added
  for (let id in newMap) {
    if (!oldMap[id]) {
      entries.push({ action: "added", field: "workorderLines", to: getItemName(newMap[id].inventoryItem || newMap[id]) });
    }
  }
  // removed
  for (let id in oldMap) {
    if (!newMap[id]) {
      entries.push({ action: "removed", field: "workorderLines", from: getItemName(oldMap[id].inventoryItem || oldMap[id]) });
    }
  }
  // changed qty or discount
  for (let id in newMap) {
    if (oldMap[id]) {
      let oldL = oldMap[id];
      let newL = newMap[id];
      let name = getItemName(newL.inventoryItem || newL);
      if (oldL.qty !== newL.qty) {
        entries.push({ action: "changed", field: "workorderLines", detail: "qty", item: name, from: String(oldL.qty), to: String(newL.qty) });
      }
      if (oldL.discountObj?.name !== newL.discountObj?.name || oldL.discountObj?.value !== newL.discountObj?.value) {
        let oldDisc = oldL.discountObj?.name || "none";
        let newDisc = newL.discountObj?.name || "none";
        entries.push({ action: "changed", field: "workorderLines", detail: "discount", item: name, from: oldDisc, to: newDisc });
      }
    }
  }
  return entries;
}

function formatFieldValue(fieldName, value) {
  if (fieldName === "color1" || fieldName === "color2") return value?.label || "";
  if (fieldName === "status") {
    let statuses = useSettingsStore.getState().settings?.statuses || [];
    return resolveStatus(value, statuses)?.label || value || "";
  }
  if (fieldName === "waitTime") return value?.label || "";
  if (fieldName === "taxFree") return value ? "Yes" : "No";
  if (value && typeof value === "object") return value.label || value.name || "";
  return String(value ?? "");
}

function buildChangeLogEntries(workorder, fieldName, oldVal, newVal) {
  // skip if not tracked or workorder is in Newly Created status
  if (!CHANGELOG_TRACKED_FIELDS.includes(fieldName)) return [];

  // special case: when status changes FROM Newly Created, we DO log it
  // but skip all other fields while status IS Newly Created
  if (fieldName === "status" && oldVal === NEWLY_CREATED_STATUS_ID) {
    // log the status change away from Newly Created
  } else if (workorder.status === NEWLY_CREATED_STATUS_ID) {
    return [];
  }

  let user = getChangeLogUser();
  let timestamp = Date.now();

  if (fieldName === "workorderLines") {
    let lineEntries = diffWorkorderLines(oldVal, newVal);
    return lineEntries.map((e) => ({ ...e, timestamp, user }));
  }

  let fromStr = formatFieldValue(fieldName, oldVal);
  let toStr = formatFieldValue(fieldName, newVal);
  if (fromStr === toStr) return [];

  return [{ timestamp, user, field: fieldName, action: "changed", from: fromStr, to: toStr }];
}

function appendToChangeLog(workorder, fieldName, oldVal, newVal) {
  if (!workorder || fieldName === "changeLog") return null; // prevent recursion / null guard

  if (CHANGELOG_TEXT_FIELDS.includes(fieldName)) {
    // debounced — capture original value, log after 2s of inactivity
    let key = workorder.id + "::" + fieldName;
    let existing = changeLogDebounceMap[key];
    if (existing) {
      clearTimeout(existing.timer);
    } else {
      // first keystroke — capture original value
      changeLogDebounceMap[key] = { originalValue: oldVal };
      existing = changeLogDebounceMap[key];
    }
    existing.timer = setTimeout(() => {
      let currentWo = useOpenWorkordersStore.getState().workorders.find((o) => o.id === workorder.id);
      if (!currentWo) { delete changeLogDebounceMap[key]; return; }
      let currentVal = currentWo[fieldName];
      let entries = buildChangeLogEntries(
        { ...currentWo, status: currentWo.status },
        fieldName,
        existing.originalValue,
        currentVal
      );
      delete changeLogDebounceMap[key];
      if (entries.length === 0) return;
      let updatedLog = [...(currentWo.changeLog || []), ...entries];
      let updatedWo = { ...currentWo, changeLog: updatedLog };
      useOpenWorkordersStore.getState().setWorkorder(updatedWo);
    }, 2000);
    return null; // don't append immediately
  }

  // discrete fields — log immediately
  let entries = buildChangeLogEntries(workorder, fieldName, oldVal, newVal);
  if (entries.length === 0) return null;
  return entries;
}

export const useOpenWorkordersStore = create(
  persist(
    (set, get) => ({
      workorders: [],
      workordersLoaded: false,
      openWorkorder: null,
      openWorkorderID: null,
      workorderPreviewID: null,
      lockedWorkorderID: null,
      saleModalObj: null,

      getOpenWorkorder: () => {
        let id = get().openWorkorderID;
        return get().workorders.find((o) => o.id === id);
      },
      getWorkorders: () => get().workorders,
      getPreviewWorkorder: () => {
        let id = get().workorderPreviewID;
        return get().workorders.find((o) => o.id === id)
      },
      getWorkorderPreviewID: () => get().workorderPreviewID,

      setWorkorderPreviewID: (workorderPreviewID) => set({ workorderPreviewID }),
      getLockedWorkorderID: () => get().lockedWorkorderID,
      setLockedWorkorderID: (lockedWorkorderID) => set({ lockedWorkorderID }),
      getSaleModalObj: () => get().saleModalObj,
      setSaleModalObj: (saleModalObj) => set({ saleModalObj }),
      setOpenWorkorderID: (openWorkorderID) => {
        set({ openWorkorderID, workorderPreviewID: null });
        if (openWorkorderID) {
          let wo = get().workorders.find((o) => o.id === openWorkorderID);
          if (wo) broadcastWorkorderToDisplay(wo);
        } else {
          broadcastClear();
        }
      },
      setOpenWorkorders: (workorders) => {
        let incomingIDs = new Set(workorders.map((wo) => wo.id));
        // Keep local-only workorders that haven't made it to DB yet
        let localOnly = get().workorders.filter(
          (wo) => (wo.isStandaloneSale || wo._unsaved) && !incomingIDs.has(wo.id)
        );
        set({ workorders: [...workorders, ...localOnly], workordersLoaded: true });
      },
      setWorkorder: (wo, saveToDB = true, batch = true) => {
        if (wo.isStandaloneSale) wo = { ...wo, lastInteractionMillis: Date.now() };
        set({ workorders: addOrRemoveFromArr(get().workorders, wo) });
        if (saveToDB && !wo.isStandaloneSale) dbSaveOpenWorkorder(wo);
        if (wo.id === get().openWorkorderID) broadcastWorkorderToDisplay(wo);
      },
      setField: (fieldName, fieldVal, workorderID, saveToDB = true) => {
        if (!workorderID) workorderID = get().openWorkorderID;
        if (get().lockedWorkorderID === workorderID) return;
        let workorder = get().workorders.find((o) => o.id === workorderID);

        // changelog: append entries for discrete fields, debounce text fields
        let logEntries = appendToChangeLog(workorder, fieldName, workorder[fieldName], fieldVal);

        workorder = { ...workorder, [fieldName]: fieldVal };
        if (logEntries && logEntries.length > 0) {
          workorder.changeLog = [...(workorder.changeLog || []), ...logEntries];
        }
        if (workorder.isStandaloneSale) workorder.lastInteractionMillis = Date.now();
        let wasUnsaved = workorder._unsaved;
        if (workorder._unsaved) delete workorder._unsaved;

        set({ workorders: replaceOrAddToArr(get().workorders, workorder) });
        if (saveToDB && !workorder.isStandaloneSale) {
          if (wasUnsaved) {
            // First save — write immediately so Firestore listener includes it
            // before the debounce window allows setOpenWorkorders to wipe it
            dbSaveOpenWorkorder(workorder, null, true);
          } else {
            debouncedSaveWorkorder(workorder);
          }
        }
        if (workorderID === get().openWorkorderID) broadcastWorkorderToDisplay(workorder);
      },

      removeWorkorder: (workorderID, saveToDB = true, batch = true) => {
        let workorder = get().workorders.find((o) => o.id === workorderID);
        let workorders = get().workorders.filter((o) => o.id !== workorderID);
        set({ workorders });

        if (get().openWorkorderID === workorderID) {
          set({ openWorkorderID: null });
        }

        if (saveToDB && !workorderID.isStandaloneSale) {
          dbDeleteWorkorder(workorderID);

          // Remove workorder ID from customer's workorders array
          if (workorder?.customerID) {
            let customer = useCurrentCustomerStore.getState().getCustomer();
            if (customer?.id === workorder.customerID && customer.workorders) {
              let updated = { ...customer, workorders: customer.workorders.filter((id) => id !== workorderID) };
              useCurrentCustomerStore.getState().setCustomer(updated, true);
            }
          }
        }
      },
    }),
    {
      name: "warpspeed_workorders",
      partialize: (s) => ({
        workorders: s.workorders,
        openWorkorderID: s.openWorkorderID,
      }),
    }
  )
);

export const useWorkorderPreviewStore = create((set, get) => ({
  previewObj: null,
  getPreviewObj: () => get().previewObj,
  setPreviewObj: (obj) => set((state) => ({ previewObj: obj })),
}));

export const useSettingsStore = create(
  persist(
    (set, get) => ({
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

      setField: (fieldName, fieldVal, sendToDB = true) => {
        set({ settings: { ...get().settings, [fieldName]: fieldVal } });
        if (sendToDB) dbSaveSettingsField(fieldName, fieldVal);
      },
    }),
    {
      name: "warpspeed_settings",
      partialize: (s) => ({ settings: s.settings }),
    }
  )
);

export const useUploadProgressStore = create((set, get) => ({
  // null | { completed, total, failed, done }
  progress: null,
  setProgress: (progress) => set({ progress }),
  clearProgress: () => set({ progress: null }),
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

export const useMigrationStore = create((set, get) => ({
  migrating: false,
  devMigrating: false,
  step: "",
  progress: { done: 0, total: 0 },
  result: "",

  getMigrating: () => get().migrating,
  getDevMigrating: () => get().devMigrating,
  getStep: () => get().step,
  getProgress: () => get().progress,
  getResult: () => get().result,

  setMigrating: (migrating) => set({ migrating }),
  setDevMigrating: (devMigrating) => set({ devMigrating }),
  setStep: (step) => set({ step }),
  setProgress: (progress) => set({ progress }),
  setResult: (result) => set({ result }),
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

// Clear all persisted Zustand stores (called on logout)
export function clearPersistedStores() {
  useOpenWorkordersStore.persist.clearStorage();
  useCurrentCustomerStore.persist.clearStorage();
  useTabNamesStore.persist.clearStorage();
  useInventoryStore.persist.clearStorage();
  useSettingsStore.persist.clearStorage();
  useLoginStore.persist.clearStorage();
}

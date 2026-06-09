/* eslint-disable */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { clearIdPool } from "./idPool";
import {
  CUSTOMER_PROTO,
  INVENTORY_ITEM_PROTO,
  TAB_NAMES,
  TIME_PUNCH_PROTO,
  permissionToLevel,
} from "./data";
import {
  addOrRemoveFromArr,
  arrHasItem,
  checkArr,
  log,
  localStorageWrapper,
  removeFieldFromObj,
  replaceOrAddToArr,
  resolveStatus,
} from "./utils";
import debounce from "lodash/debounce";
import { broadcastToDisplay, broadcastClear, DISPLAY_MSG_TYPES } from "./broadcastChannel";
import { calculateRunningTotals } from "./utils";

import {
  dbSoftDeleteWorkorder,
  dbGetCompletedSale,
  dbGetCompletedWorkorder,
  dbGetWorkorder,
  dbSetUserPunchSlot,
  dbClearUserPunchSlot,
  dbAddManagerNote,
  dbUpdateManagerNote,
  dbResolveManagerNote,
  dbAddInAppMessage,
  dbMarkInAppMessageReadByUser,
  dbMarkInAppMessageUnreadByUser,
  dbDeleteInAppMessageForUser,
  dbHardDeleteInAppMessage,
  dbSetUserLoginMessageSuppress,
  dbSaveCustomer,
  dbSaveInventoryItem,
  dbSaveOpenWorkorder,
  dbSavePunchObject,
  dbSaveSettings,
  dbSaveSettingsField,
  dbSavePhoneConfigField,
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

export const useKeypadScaleStore = create((set, get) => ({
  scale: (() => {
    try {
      let v = parseFloat(window.localStorage.getItem("standKeypadScale"));
      return v && v > 0 ? v : 1;
    } catch { return 1; }
  })(),
  getScale: () => get().scale,
  setScale: (scale) => {
    let next = Math.max(0.7, Math.min(1.6, Math.round(scale * 10) / 10));
    try { window.localStorage.setItem("standKeypadScale", String(next)); } catch {}
    set({ scale: next });
  },
  adjustScale: (delta) => {
    get().setScale(get().scale + delta);
  },
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

      dashboardScrollTarget: null,
      getDashboardScrollTarget: () => get().dashboardScrollTarget,
      setDashboardScrollTarget: (val) => set({ dashboardScrollTarget: val }),

      dashboardQBParentID: null,
      getDashboardQBParentID: () => get().dashboardQBParentID,
      setDashboardQBParentID: (val) => set({ dashboardQBParentID: val }),

      dashboardQBMenuPath: [],
      getDashboardQBMenuPath: () => get().dashboardQBMenuPath,
      setDashboardQBMenuPath: (val) => set({ dashboardQBMenuPath: val }),

      // Messages Hub persistent state
      messagesHubMode: false,
      getMessagesHubMode: () => get().messagesHubMode,
      setMessagesHubMode: (val) => set({ messagesHubMode: val }),

      messagesHubPhone: "",
      getMessagesHubPhone: () => get().messagesHubPhone,
      setMessagesHubPhone: (val) => set({ messagesHubPhone: val }),
    }),
    {
      name: "warpspeed_tabs",
      partialize: (s) => ({
        infoTabName: s.infoTabName,
        itemsTabName: s.itemsTabName,
        optionsTabName: s.optionsTabName,
        messagesHubMode: s.messagesHubMode,
        messagesHubPhone: s.messagesHubPhone,
      }),
      merge: (persisted, current) => {
        let merged = { ...current, ...persisted };
        try {
          let raw = JSON.parse(localStorage.getItem("warpspeed_workorders") || "{}");
          let woState = raw.state || {};
          let wo = (woState.workorders || []).find((o) => o.id === woState.openWorkorderID);
          if (wo && wo.customerID) {
            merged.infoTabName = TAB_NAMES.infoTab.workorder;
            merged.itemsTabName = TAB_NAMES.itemsTab.workorderItems;
          } else if (wo && !wo.customerID && wo.workorderLines?.length > 0) {
            merged.infoTabName = TAB_NAMES.infoTab.checkout;
            merged.itemsTabName = TAB_NAMES.itemsTab.workorderItems;
          } else {
            merged.infoTabName = TAB_NAMES.infoTab.customer;
            merged.itemsTabName = TAB_NAMES.itemsTab.empty;
          }
        } catch (e) {}
        return merged;
      },
    }
  )
);

export const useOrderingModalStore = create((set, get) => ({
  visible: false,
  show: () => set({ visible: true }),
  hide: () => set({ visible: false }),
  getVisible: () => get().visible,
}));

export const useInventoryReconciliationModalStore = create((set, get) => ({
  visible: false,
  show: () => set({ visible: true }),
  hide: () => set({ visible: false }),
  getVisible: () => get().visible,
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
  // Map of customer id -> millis when they last appeared in a search result.
  // Kept in a side-map so the customer objects themselves stay clean (they
  // flow through to dbSaveCustomer on selection).
  searchResultTimestamps: {},
  searchQuery: "",
  searchType: "phone", // "phone" | "name" | "email"
  isSearching: false,
  getSearchResults: () => get().searchResults,
  getSearchResultTimestamps: () => get().searchResultTimestamps,
  getSelectedItem: () => get().selectedItem,
  getSearchQuery: () => get().searchQuery,
  getSearchType: () => get().searchType,
  getIsSearching: () => get().isSearching,
  setIsSearching: (isSearching) => set({ isSearching }),
  setSelectedItem: (item) =>
    set({
      selectedItem: item,
    }),
  setSearchResults: (searchResults) => {
    const now = Date.now();
    const next = {};
    searchResults.forEach((r) => {
      if (r?.id) next[r.id] = now;
    });
    set({ searchResults, searchResultTimestamps: next });
  },
  setSearchQuery: (searchQuery, searchType) => set({ searchQuery, searchType }),
  addToSearchResults: (searchResults) => {
    let storeSearchResults = get().searchResults;
    const timestamps = { ...get().searchResultTimestamps };
    const now = Date.now();
    searchResults.forEach((searchResult) => {
      if (searchResult?.id) timestamps[searchResult.id] = now;
      if (arrHasItem(storeSearchResults, searchResult)) return;
      storeSearchResults = [...storeSearchResults, searchResult];
    });
    set({ searchResults: storeSearchResults, searchResultTimestamps: timestamps });
  },
  reset: () => set({ searchResults: [], searchResultTimestamps: {}, selectedItem: null, searchQuery: "", searchType: "phone", isSearching: false }),
}));

export const useRecentCustomersStore = create(
  persist(
    (set, get) => ({
      recentCustomers: [],
      getRecentCustomers: () => get().recentCustomers,
      addRecentCustomer: (customer) => {
        if (!customer?.id) return;
        const cutoff = Date.now() - 2 * 60 * 60 * 1000;
        let recent = get()
          .recentCustomers.filter((c) => c.id !== customer.id)
          .filter((c) => (c.addedAt || 0) > cutoff);
        let slim = {
          id: customer.id,
          first: customer.first || "",
          last: customer.last || "",
          customerCell: customer.customerCell || "",
          addedAt: Date.now(),
        };
        recent = [slim, ...recent].slice(0, 10);
        set({ recentCustomers: recent });
      },
    }),
    {
      name: "warpspeed_recent_customers",
      partialize: (s) => ({ recentCustomers: s.recentCustomers }),
    }
  )
);

export const useWorkorderSearchStore = create((set, get) => ({
  searchResults: [],
  isSearching: false,
  searchQuery: "",
  getSearchResults: () => get().searchResults,
  getIsSearching: () => get().isSearching,
  getSearchQuery: () => get().searchQuery,
  setSearchResults: (searchResults) => set({ searchResults }),
  setIsSearching: (isSearching) => set({ isSearching }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  reset: () => set({ searchResults: [], isSearching: false, searchQuery: "" }),
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
  pendingRefundSaleID: "",

  getMessage: () => get().message,
  getLoading: () => get().loading,
  getSaleObj: () => get().saleObj,
  getIsCheckingOut: () => get().isCheckingOut,
  getReceiptScan: () => get().receiptScan,

  setStringOnly: (receiptScan) => set({ receiptScan }),
  setPendingRefundSaleID: (pendingRefundSaleID) => set({ pendingRefundSaleID }),
  setLoading: (loading) => set({ loading }),
  // setSaleObj: (saleObj) => set({ saleObj }),
  setIsCheckingOut: (isCheckingOut) => {
    if (isCheckingOut && useBillingStore.getState().isPaymentBlocked()) {
      useAlertScreenStore.getState().setValues({
        title: "Billing Suspended",
        severity: "warning",
        message:
          "Payment processing is disabled while your Cadence billing is past due.",
        subMessage:
          "Open Subscription from the admin menu to update your payment method.",
        btn1Text: "OK",
        handleBtn1Press: () =>
          useAlertScreenStore.getState().setShowAlert(false),
      });
      return;
    }
    set({ isCheckingOut });
  },
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

// Alert store — array-backed stack. Newest pushed is on top (LIFO).
// Caller API: setValues(config) -> id, dismissAlert(id), dismissTop(), setShowAlert(false), resetAll().
// Hard cap of 20 stacked alerts; pushing #21 throws.
const _MAX_ALERTS = 20;
let _alertIdCounter = 0;

function _normalizeSeverity(severity) {
  if (severity === "danger") return "warning";
  if (severity === "info" || severity === "warning") return severity;
  return "warning";
}

export const useAlertScreenStore = create((set, get) => ({
  alerts: [],
  showAlert: false,

  getAlerts: () => get().alerts,
  getShowAlert: () => get().showAlert,
  getTopAlert: () => {
    const arr = get().alerts;
    return arr.length > 0 ? arr[arr.length - 1] : null;
  },

  setValues: (config = {}) => {
    const state = get();
    if (state.alerts.length >= _MAX_ALERTS) {
      throw new Error(
        `useAlertScreenStore: alert stack at hard cap of ${_MAX_ALERTS}; cannot push another`
      );
    }
    if (!config.title && !config.message && !config.subMessage) {
      console.warn(
        "[AlertBox] EMPTY ALERT pushed",
        JSON.stringify(
          {
            config,
            stack: new Error().stack,
          },
          null,
          2
        )
      );
    }
    _alertIdCounter += 1;
    const id = `alert-${_alertIdCounter}`;
    const alert = {
      id,
      title: config.title ?? "",
      severity: _normalizeSeverity(config.severity),
      message: config.message ?? "",
      subMessage: config.subMessage ?? "",
      btn1Text: config.btn1Text ?? "",
      btn2Text: config.btn2Text ?? "",
      btn3Text: config.btn3Text ?? "",
      btn1Icon: config.btn1Icon ?? null,
      btn2Icon: config.btn2Icon ?? null,
      btn3Icon: config.btn3Icon ?? null,
      icon1Size: config.icon1Size ?? null,
      icon2Size: config.icon2Size ?? null,
      icon3Size: config.icon3Size ?? null,
      handleBtn1Press: config.handleBtn1Press ?? null,
      handleBtn2Press: config.handleBtn2Press ?? null,
      handleBtn3Press: config.handleBtn3Press ?? null,
      btn1Disabled: config.btn1Disabled ?? false,
      btn2Disabled: config.btn2Disabled ?? false,
      btn3Disabled: config.btn3Disabled ?? false,
      btn1Tooltip: config.btn1Tooltip ?? null,
      btn2Tooltip: config.btn2Tooltip ?? null,
      btn3Tooltip: config.btn3Tooltip ?? null,
      canExitOnOuterClick: config.canExitOnOuterClick ?? false,
      pauseOnBaseComponent: config.pauseOnBaseComponent ?? false,
      useCancelButton: config.useCancelButton ?? false,
      fullScreen: config.fullScreen ?? false,
      autoDismiss: config.autoDismiss ?? false,
      autoDismissMs: config.autoDismissMs ?? 4000,
      alertBoxStyle: config.alertBoxStyle ?? {},
    };
    set((s) => ({ alerts: [...s.alerts, alert], showAlert: true }));
    return id;
  },

  dismissAlert: (id) => {
    set((s) => {
      const next = s.alerts.filter((a) => a.id !== id);
      return { alerts: next, showAlert: next.length > 0 };
    });
  },

  dismissTop: () => {
    set((s) => {
      if (s.alerts.length === 0) return s;
      const next = s.alerts.slice(0, -1);
      return { alerts: next, showAlert: next.length > 0 };
    });
  },

  // Backward-compat: setShowAlert(false) dismisses the top alert.
  // setShowAlert(true) is a no-op — alerts only exist when pushed.
  setShowAlert: (showAlert) => {
    if (!showAlert) get().dismissTop();
  },

  // Backward-compat: existing callers use resetAll() inside button handlers
  // to close "their" alert. In the stack model that's the top alert.
  resetAll: () => {
    get().dismissTop();
  },

  // True "wipe everything" — use when no specific alert is in mind.
  clearAllAlerts: () => {
    set({ alerts: [], showAlert: false });
  },
}));

export const useDatabaseBatchStore = create((set, get) => ({
  lastBatchMillis: 9999999999999999999999999,
  lastWriteMillis: 9999999999999999999999999,

  getLastWriteMillis: () => get().lastWriteMillis,
  getLastBatchMillis: () => get().lastBatchMillis,

  setLastBatchMillis: (lastBatchMillis) => set({ lastBatchMillis }),
  setLastWriteMillis: (lastWriteMillis) => set({ lastWriteMillis }),
  resetLastWriteMillis: () =>
    set({ lastWriteMillis: 9999999999999999999999999 }),
}));

export const useStripePaymentStore = create((set, get) => ({
  paymentIntentID: null,
  reader: null,
  readersArr: null,
  paymentAmount: 0.53,
  // Connect-mode context. null for Bonita / non-Connect tenants. When set, the
  // checkout flow routes card payments through the Connect callables and TTPi
  // readers can hand off to the JS SDK directly.
  connectAccountID: null,
  terminalLocationID: null,
  isConnectMode: false,
  getReadersArr: () => get().readersArr,
  getPaymentAmount: () => get().paymentAmount,
  getPaymentIntentID: () => get().paymentIntentID,
  getReader: () => get().reader,
  getConnectAccountID: () => get().connectAccountID,
  getTerminalLocationID: () => get().terminalLocationID,
  getIsConnectMode: () => get().isConnectMode,
  //

  setReadersArr: (readersArr) => {
    set(() => ({
      readersArr,
    }));
  },
  setConnectContext: ({ connectAccountID, terminalLocationID, isConnectMode }) => {
    set(() => ({
      connectAccountID: connectAccountID ?? null,
      terminalLocationID: terminalLocationID ?? null,
      isConnectMode: !!isConnectMode,
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
}));

export const useLoginStore = create(
  persist(
    (set, get) => ({
  webcamDetected: false,
  adminPrivilege: "",
  loginTimeout: 0,
  currentUser: null,
  punchClock: {}, // object of current user punches showing who is currently logged in
  modalVisible: false,
  lastActionMillis: 0,
  _loginPromptResolver: null,
  showLoginScreen: false,
  cameraStatus: "loading", // "loading" | "ready" | "failed" | "idle" | "matched"
  cameraError: null,
  cameraRetryTrigger: 0,
  cameraStream: null,

  // SaaS auth claims pulled from the Firebase ID token. Populated by
  // App.jsx onAuthStateChange. Shape: { tenantID, privilege, stores: [],
  // platformAdmin: false } — null when signed out.
  authClaims: null,

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
  getAuthClaims: () => get().authClaims,
  setAuthClaims: (authClaims) => set({ authClaims }),
  getUserHasEditRole: () => {},
  getUserHasAdminRole: () => {
    let user = get().currentUserObj;
    if (!user) return;
  },

  // local app user
  setCurrentUser: (currentUser) => {
    set({ currentUser });
  },

  // create new punch obj, log user in locally and send punch obj to DB.
  // async + awaited writes: local state only flips on confirmed Firestore write
  // so a silent network failure can't leave the UI showing "clocked in" when
  // the punch never saved. Returns { success, error }. On failure, pushes an
  // error alert and leaves local state untouched.
  setCreateUserClock: async (userID, millis, option) => {
    let punch = { ...TIME_PUNCH_PROTO };
    punch.id = crypto.randomUUID();
    punch.userID = userID;
    punch.option = option;
    punch.millis = millis;

    let slotPromise =
      option === "in"
        ? dbSetUserPunchSlot(userID, punch)
        : dbClearUserPunchSlot(userID);
    let savePromise = dbSavePunchObject(punch, punch.id);

    let timeoutPromise = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("Timed out after 6 seconds")),
        6000
      )
    );

    try {
      let [slotRes, saveRes] = await Promise.race([
        Promise.all([slotPromise, savePromise]),
        timeoutPromise,
      ]);
      if (!slotRes?.success || !saveRes?.success) {
        let msg =
          slotRes?.message ||
          slotRes?.error ||
          saveRes?.message ||
          saveRes?.error ||
          "Unknown error";
        throw new Error(msg);
      }

      let punchClock = { ...get().punchClock };
      if (option === "in") {
        punchClock[userID] = punch;
      } else {
        punchClock = removeFieldFromObj(punchClock, userID);
      }
      set({ punchClock });

      return { success: true, punch };
    } catch (error) {
      let errMsg = error?.message || String(error);
      log("setCreateUserClock failed:", errMsg);
      useAlertScreenStore.getState().setValues({
        title: "Punch Failed",
        severity: "danger",
        message:
          "Could not save the " +
          (option === "in" ? "clock-in" : "clock-out") +
          ". Please check your connection and try again.",
        subMessage: errMsg,
        btn1Text: "OK",
        handleBtn1Press: () => {},
      });
      return { success: false, error: errMsg };
    }
  },

  setPunchClock: (punchClock) => set({ punchClock }),

  managerNotes: {},
  getManagerNotes: () => get().managerNotes,
  setManagerNotes: (managerNotes) => set({ managerNotes }),
  setAddManagerNote: (userID, message, authorName, type = "punch_forgot") => {
    let note = {
      id: crypto.randomUUID(),
      userID,
      authorName: authorName || "",
      message: message || "",
      createdMillis: Date.now(),
      read: false,
      readAt: null,
      readByUserID: null,
      type,
    };
    let next = { ...get().managerNotes, [note.id]: note };
    set({ managerNotes: next });
    dbAddManagerNote(note);
    return note;
  },
  setMarkManagerNoteRead: (noteID, managerUserID) => {
    let current = get().managerNotes[noteID];
    if (!current) return;
    let updated = {
      ...current,
      read: !current.read,
      readAt: !current.read ? Date.now() : null,
      readByUserID: !current.read ? (managerUserID || null) : null,
    };
    let next = { ...get().managerNotes, [noteID]: updated };
    set({ managerNotes: next });
    dbUpdateManagerNote(updated);
  },
  setResolveManagerNote: (noteID) => {
    let next = { ...get().managerNotes };
    delete next[noteID];
    set({ managerNotes: next });
    dbResolveManagerNote(noteID);
  },

  /////////////////////////////////////////////////////////////
  // In-app messages (user-to-user, threaded)
  /////////////////////////////////////////////////////////////
  inAppMessages: {},
  getInAppMessages: () => get().inAppMessages,
  setInAppMessages: (inAppMessages) => set({ inAppMessages }),
  setSendInAppMessage: ({ message, toUserIDs, workorderID = null, workorderCustomerName = null, workorderStatus = null, replyToID = null }) => {
    let fromUser = get().currentUser;
    if (!fromUser?.id) return null;
    let fromAuthorName = ((fromUser.first || "") + " " + (fromUser.last || "")).trim();
    let id = crypto.randomUUID();
    let threadID = id;
    if (replyToID) {
      let parent = get().inAppMessages?.[replyToID];
      if (parent) threadID = parent.threadID || parent.id;
    }
    let msg = {
      id,
      threadID,
      replyToID,
      fromUserID: fromUser.id,
      fromAuthorName,
      toUserIDs: Array.isArray(toUserIDs) ? toUserIDs : [],
      message: message || "",
      workorderID: workorderID || null,
      workorderCustomerName: workorderCustomerName || null,
      workorderStatus: workorderStatus || null,
      createdMillis: Date.now(),
      readBy: { [fromUser.id]: Date.now() },
      deletedBy: {},
    };
    let next = { ...get().inAppMessages, [id]: msg };
    set({ inAppMessages: next });
    dbAddInAppMessage(msg);
    return msg;
  },
  setMarkInAppMessageRead: (messageID) => {
    let user = get().currentUser;
    if (!user?.id) return;
    let cur = get().inAppMessages?.[messageID];
    if (!cur) return;
    let updated = { ...cur, readBy: { ...(cur.readBy || {}), [user.id]: Date.now() } };
    let next = { ...get().inAppMessages, [messageID]: updated };
    set({ inAppMessages: next });
    dbMarkInAppMessageReadByUser(messageID, user.id);
  },
  setMarkInAppMessageUnread: (messageID) => {
    let user = get().currentUser;
    if (!user?.id) return;
    let cur = get().inAppMessages?.[messageID];
    if (!cur) return;
    let nextReadBy = { ...(cur.readBy || {}) };
    delete nextReadBy[user.id];
    let updated = { ...cur, readBy: nextReadBy };
    let next = { ...get().inAppMessages, [messageID]: updated };
    set({ inAppMessages: next });
    dbMarkInAppMessageUnreadByUser(messageID, user.id);
  },
  setDeleteInAppMessageForCurrentUser: (messageID) => {
    let user = get().currentUser;
    if (!user?.id) return;
    let cur = get().inAppMessages?.[messageID];
    if (!cur) return;
    let updated = { ...cur, deletedBy: { ...(cur.deletedBy || {}), [user.id]: true } };
    let next = { ...get().inAppMessages, [messageID]: updated };
    set({ inAppMessages: next });
    dbDeleteInAppMessageForUser(messageID, user.id);
  },
  setHardDeleteInAppMessage: (messageID) => {
    let cur = get().inAppMessages?.[messageID];
    if (!cur) return;
    let next = { ...get().inAppMessages };
    delete next[messageID];
    set({ inAppMessages: next });
    dbHardDeleteInAppMessage(messageID);
  },

  // Login-time auto-open of the UserMessagesModal
  loginMessagesShowForUserID: null,
  loginMessagesShowTab: null,
  loginMessagesOnDismiss: null,
  getLoginMessagesShowForUserID: () => get().loginMessagesShowForUserID,
  setLoginMessagesShowForUserID: (loginMessagesShowForUserID, tab = "inbox", onDismiss = null) =>
    set({ loginMessagesShowForUserID, loginMessagesShowTab: tab, loginMessagesOnDismiss: onDismiss }),
  consumeLoginMessagesOnDismiss: () => {
    let cb = get().loginMessagesOnDismiss;
    set({ loginMessagesShowForUserID: null, loginMessagesShowTab: null, loginMessagesOnDismiss: null });
    if (typeof cb === "function") cb();
  },
  setSendWelcomeMessageToUser: (toUserObj) => {
    if (!toUserObj?.id) return null;
    let rawFirst = (toUserObj.first || "").trim();
    let first = rawFirst ? rawFirst.charAt(0).toUpperCase() + rawFirst.slice(1).toLowerCase() : "there";
    let level = toUserObj.permissions?.level || 0;
    let isManager = level >= 3;
    let lines = [
      "Hello " + first + ", welcome to Cadence Point of Sale!",
      "",
      "Quick guide to your Messages tab (Options > User > APP MESSAGING):",
      "",
      "INBOX - Messages from your coworkers appear here. Anyone on the team can compose a message to one or more users. Replies stay together as a thread, so a back-and-forth conversation reads top to bottom.",
      "",
      "ATTACH A WORKORDER - When composing, you can attach an open workorder. The recipient sees a chip on the message and can click it to jump straight to that workorder.",
    ];
    if (isManager) {
      lines.push(
        "",
        "MANAGER TAB - Because your account is set to manager (level 3+), you'll also see a Manager tab. Staff can send you notes from the punch-clock screen (for example, when they forget to clock in or out). Mark them read or remove them as you handle each one.",
      );
    }
    lines.push(
      "",
      "SUPPRESS - The top-left of the Messages modal has a SUPPRESS dropdown. If you don't want the modal popping up at every login, set it for 30 minutes, 1 hour, up to 8 hours. After the time runs out, the modal will resume opening on login when you have unread items.",
      "",
      "AUTO-OPEN - When you log in" + (isManager ? " and have unread messages or manager notes" : " and have unread messages") + ", this modal opens automatically so nothing slips through.",
      "",
      "You can delete this welcome message any time using the DELETE button below it.",
    );
    let body = lines.join("\n");
    let id = crypto.randomUUID();
    let msg = {
      id,
      threadID: id,
      replyToID: null,
      fromUserID: "system",
      fromAuthorName: "Cadence POS",
      toUserIDs: [toUserObj.id],
      message: body,
      workorderID: null,
      workorderCustomerName: null,
      workorderStatus: null,
      createdMillis: Date.now(),
      readBy: {},
      deletedBy: {},
    };
    let next = { ...get().inAppMessages, [id]: msg };
    set({ inAppMessages: next });
    dbAddInAppMessage(msg);
    return msg;
  },
  triggerLoginMessagesAutoOpen: (userObj, onDismiss = null) => {
    let userID = userObj?.id;
    if (!userID) {
      if (typeof onDismiss === "function") onDismiss();
      return;
    }
    let suppressUntil = userObj?.loginMessageSuppressUntil || 0;
    if (suppressUntil && Date.now() < suppressUntil) {
      if (typeof onDismiss === "function") onDismiss();
      return;
    }
    let level = userObj?.permissions?.level || 0;
    let msgs = get().inAppMessages || {};
    let unreadMessages = Object.values(msgs).filter((m) => {
      if (!m) return false;
      if (m.fromUserID === userID) return false;
      if (m.deletedBy?.[userID]) return false;
      if (!(m.toUserIDs || []).includes(userID)) return false;
      return !m.readBy?.[userID];
    });
    let unreadManagerCount = 0;
    if (level >= 3) {
      let notes = get().managerNotes || {};
      unreadManagerCount = Object.values(notes).filter((n) => n && !n.read).length;
    }
    if (unreadMessages.length === 0 && unreadManagerCount === 0) {
      if (typeof onDismiss === "function") onDismiss();
      return;
    }
    let tab = (level >= 3 && unreadManagerCount > 0) ? "manager" : "inbox";
    set({
      loginMessagesShowForUserID: userID,
      loginMessagesShowTab: tab,
      loginMessagesOnDismiss: onDismiss,
    });
  },
  setSuppressLoginMessagesForUser: (userID, durationMillis) => {
    if (!userID) return;
    let untilMillis = durationMillis > 0 ? Date.now() + durationMillis : 0;
    // Optimistically update local currentUser if it matches
    let cur = get().currentUser;
    if (cur?.id === userID) {
      set({ currentUser: { ...cur, loginMessageSuppressUntil: untilMillis } });
    }
    dbSetUserLoginMessageSuppress(userID, untilMillis);
  },
  setWebcamDetected: (webcamDetected) => set(() => ({ webcamDetected })),
  setCameraStatus: (cameraStatus) => set({ cameraStatus }),
  setCameraError: (cameraError) => set({ cameraError }),
  setCameraStream: (cameraStream) => set({ cameraStream }),
  triggerCameraRetry: () => set((state) => ({ cameraRetryTrigger: state.cameraRetryTrigger + 1, cameraStatus: "loading", cameraError: null })),
  setRunBackgroundRecognition: (runBackgroundRecognition) =>
    set(() => ({ runBackgroundRecognition })),
  setModalVisible: (modalVisible) => set((state) => ({ modalVisible })),
  setLoginTimeout: (loginTimeout) => set((state) => ({ loginTimeout })),

  setLastActionMillis: () => set((state) => state.lastActionMillis === Infinity ? {} : { lastActionMillis: new Date().getTime() }),
  setShowLoginScreen: (showLoginScreen) => {
    if (showLoginScreen && import.meta.env.DEV) {
      const devUser = useSettingsStore.getState().getSettings()?.users
        ?.find((u) => u.id == "1234");
      if (devUser) {
        set({ currentUser: devUser, lastActionMillis: Infinity, showLoginScreen: false });
        return;
      }
    }
    set((state) => ({ showLoginScreen }));
  },

  isSessionValid: ({ level } = {}) => {
    let userObj = get().currentUser;
    if (!userObj) return false;
    let lastAction = get().lastActionMillis;
    let now = new Date().getTime();
    let diffSeconds = (now - lastAction) / 1000;
    let timeout = useSettingsStore.getState().getSettings()?.activeLoginTimeoutSeconds || 60;
    if (diffSeconds > timeout) return false;
    if (level) {
      if (permissionToLevel(userObj.permissions) < permissionToLevel(level)) return false;
    }
    return true;
  },

  promptLogin: ({ level } = {}) => {
    if (get().isSessionValid({ level })) return Promise.resolve(true);

    let prev = get()._loginPromptResolver;
    if (prev) prev(false);

    return new Promise((resolve) => {
      let userObj = get().currentUser;
      // Face-recognized but not clocked in: offer punch-in as an auth path.
      // Only when no privilege level is required (clock-in doesn't elevate).
      if (!level && userObj && !get().punchClock[userObj.id]) {
        set({ _loginPromptResolver: resolve, adminPrivilege: "" });
        useAlertScreenStore.getState().setValues({
          title: "PUNCH CLOCK",
          message: "Hi " + userObj.first + ", you are not clocked in. Would you like to punch in now?",
          btn1Text: "CLOCK IN",
          btn2Text: "CANCEL",
          handleBtn1Press: async () => {
            let result = await get().setCreateUserClock(
              userObj.id,
              new Date().getTime(),
              "in"
            );
            if (!result?.success) throw new Error(result?.error || "Punch failed");
            get().setLastActionMillis();
            get().resolveLoginPrompt(true);
          },
          handleBtn2Press: () => {
            set({ showLoginScreen: true, adminPrivilege: "" });
          },
          showAlert: true,
        });
        return;
      }

      set({
        _loginPromptResolver: resolve,
        showLoginScreen: true,
        adminPrivilege: level || "",
      });
    });
  },

  resolveLoginPrompt: (success) => {
    let resolver = get()._loginPromptResolver;
    if (!resolver) return;
    let ok = !!success;
    if (ok) {
      let requiredLevel = get().adminPrivilege || undefined;
      if (!get().isSessionValid({ level: requiredLevel })) ok = false;
    }
    set({ _loginPromptResolver: null });
    resolver(ok);
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
        let inventoryArr = get().inventoryArr.filter((o) => o.id !== item.id);
        set({ inventoryArr });

        if (sendToDB) dbSaveInventoryItem(item);
      },
      setItem: (item, sendToDB = true, batch = true) => {
        let inventoryArr = get().inventoryArr;
        let invItemIdx = inventoryArr.findIndex((obj) => obj.id === item.id);
        if (invItemIdx >= 0) {
          inventoryArr = inventoryArr.map((o, i) => i === invItemIdx ? item : o);
        } else {
          inventoryArr = [...inventoryArr, item];
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
    }
  )
);

// Run after store is fully created to avoid "cannot access before initialization" error
function _initCustomerRefresh() {
  const cachedCustomer = useCurrentCustomerStore.getState().customer;
  if (cachedCustomer?.id) {
    const fetchFreshCustomer = () => {
      dbGetCustomer(cachedCustomer.id).then((freshCustomer) => {
        if (freshCustomer) {
          useCurrentCustomerStore.setState({ customer: freshCustomer, customerRefreshed: true });
        } else {
          useCurrentCustomerStore.setState({ customerRefreshed: true });
        }
      }).catch(() => {
        useCurrentCustomerStore.setState({ customerRefreshed: true });
      });
    };
    if (useSettingsStore.persist.hasHydrated()) {
      fetchFreshCustomer();
    } else {
      useSettingsStore.persist.onFinishHydration(fetchFreshCustomer);
    }
  } else {
    useCurrentCustomerStore.setState({ customerRefreshed: true });
  }
}
// Defer to next microtask so all stores are initialized
Promise.resolve().then(() => {
  if (useCurrentCustomerStore.persist.hasHydrated()) {
    _initCustomerRefresh();
  } else {
    useCurrentCustomerStore.persist.onFinishHydration(_initCustomerRefresh);
  }
});

export const useCustMessagesStore = create((set, get) => ({
  messages: [],
  messagesLoading: false,
  messagesHasMore: false,
  messagesNextCursor: null,
  messagesLoadingMore: false,
  messagesPhone: null,
  _messagesUnsub: null,

  smsThreads: [],
  _threadsUnsub: null,
  getSmsThreads: () => get().smsThreads,
  setSmsThreads: (smsThreads) => set({ smsThreads }),
  setThreadsUnsub: (unsub) => set({ _threadsUnsub: unsub }),
  // Optimistic thread patch. patch: { canRespond?, forwardToArray?: [{ userID, phone, first }] }
  // Listener-driven thread updates will overwrite this on the next snapshot.
  patchSmsThread: (phone, patch) => {
    if (!phone) return;
    set((state) => {
      let threads = state.smsThreads;
      let idx = threads.findIndex((t) => t.phone === phone);
      let current = idx >= 0 ? threads[idx] : { phone, forwardTo: [] };
      let next = { ...current };
      if (patch.canRespond !== undefined) next.canRespond = patch.canRespond;
      if (Array.isArray(patch.forwardToArray)) {
        next.forwardTo = patch.forwardToArray.map((f) => ({
          userID: f.userID,
          phone: f.phone || "",
          first: f.first || "",
        }));
      }
      let updated = idx >= 0
        ? threads.map((t, i) => (i === idx ? next : t))
        : [...threads, next];
      return { smsThreads: updated };
    });
  },

  // In-memory hub conversation cache (backed by IndexedDB, NOT localStorage)
  hubConversationCache: {},
  getHubCachedThread: (phone) => get().hubConversationCache[phone] || null,
  setHubCachedThread: (phone, messages, noMoreHistory) => {
    set((state) => ({
      hubConversationCache: {
        ...state.hubConversationCache,
        [phone]: { messages, noMoreHistory },
      },
    }));
    // Async write to IndexedDB (fire-and-forget)
    import("./hubMessageDB").then(({ putMessages, capMessages }) => {
      putMessages(phone, messages).then(() => capMessages(phone, 20));
    }).catch(() => {});
  },
  // Batch-set multiple threads at once (single state update, NO IndexedDB write-back)
  // Used during init when data already comes from IndexedDB
  batchSetHubCachedThreads: (entries) => {
    set((state) => ({
      hubConversationCache: { ...state.hubConversationCache, ...entries },
    }));
  },
  clearHubConversationCache: () => {
    set({ hubConversationCache: {} });
  },

  getMessages: () => get().messages,
  getMessagesLoading: () => get().messagesLoading,
  getMessagesHasMore: () => get().messagesHasMore,
  getMessagesNextCursor: () => get().messagesNextCursor,
  getMessagesLoadingMore: () => get().messagesLoadingMore,
  getMessagesPhone: () => get().messagesPhone,

  setMessages: (messages) => set({ messages }),
  setMessagesLoading: (messagesLoading) => set({ messagesLoading }),
  setMessagesHasMore: (messagesHasMore) => set({ messagesHasMore }),
  setMessagesNextCursor: (messagesNextCursor) => set({ messagesNextCursor }),
  setMessagesLoadingMore: (messagesLoadingMore) => set({ messagesLoadingMore }),
  setMessagesPhone: (messagesPhone) => set({ messagesPhone }),
  // Add single message with dedup (used by smsService.send and handleSendWorkorderTicket)
  setOutgoingMessage: (message) => {
    set((state) => {
      if (state.messages.find(m => m.id === message.id)) return state;
      let merged = [...state.messages, message].sort((a, b) => (a.millis || 0) - (b.millis || 0));
      return { messages: merged };
    });
  },
  // Atomic merge with dedup (used by listener)
  // Incoming messages replace existing ones with the same ID (e.g. placeholder → real message from Firestore)
  mergeMessages: (newMsgs) => {
    set((state) => {
      let incomingById = new Map(newMsgs.map(m => [m.id, m]));
      let existingIds = new Set(state.messages.map(m => m.id));
      let updated = state.messages.map(m => incomingById.get(m.id) || m);
      let fresh = newMsgs.filter(m => !existingIds.has(m.id));
      if (!fresh.length && !newMsgs.some(m => existingIds.has(m.id))) return state;
      let merged = [...updated, ...fresh].sort((a, b) => (a.millis || 0) - (b.millis || 0));
      return { messages: merged };
    });
  },
  updateMessageStatus: (messageId, status, errorMessage) => {
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === messageId ? { ...msg, status, errorMessage: errorMessage || "" } : msg
      ),
    }));
  },
  updateMessageField: (messageId, field, value) => {
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === messageId ? { ...msg, [field]: value } : msg
      ),
    }));
  },
  // Atomic prepend with dedup (used by pagination)
  prependMessages: (newMessages) => {
    set((state) => {
      let ids = new Set(state.messages.map(m => m.id));
      let fresh = newMessages.filter(m => !ids.has(m.id));
      if (!fresh.length) return state;
      let merged = [...fresh, ...state.messages].sort((a, b) => (a.millis || 0) - (b.millis || 0));
      return { messages: merged };
    });
  },
  setMessagesUnsub: (unsub) => {
    let prev = get()._messagesUnsub;
    if (prev) prev();
    set({ _messagesUnsub: unsub });
  },
  clearMessages: () => {
    let prev = get()._messagesUnsub;
    if (prev) prev();
    set({
      messages: [],
      messagesLoading: false,
      messagesHasMore: false,
      messagesNextCursor: null,
      messagesLoadingMore: false,
      messagesPhone: null,
      _messagesUnsub: null,
    });
  },
}));


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
      formalName: line.inventoryItem?.catalogName || line.inventoryItem?.formalName || "",
      price: line.inventoryItem?.price || 0,
    },
    discountObj: line.discountObj
      ? { name: line.discountObj.name, savings: line.discountObj.savings || 0, newPrice: line.discountObj.newPrice || 0 }
      : null,
  }));

  let _settings = useSettingsStore.getState().getSettings();
  let salesTaxPercent = _settings?.salesTaxPercent || 0;
  let _storeName = _settings?.storeInfo?.displayName || "";

  // Quick sales (no customer) broadcast as SALE/Checkout type
  if (!wo.customerID) {
    let totals = calculateRunningTotals(wo, salesTaxPercent, [], false, !!wo.taxFree);
    broadcastToDisplay(DISPLAY_MSG_TYPES.SALE, {
      storeName: _storeName,
      customerFirst: wo.customerFirst || "",
      customerLast: wo.customerLast || "",
      customerLanguage: wo.customerLanguage || "",
      combinedWorkorders: [{ workorderLines: lines }],
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
    storeName: _storeName,
    customerFirst: wo.customerFirst || "",
    customerLast: wo.customerLast || "",
    customerLanguage: wo.customerLanguage || "",
    brand: wo.brand || "",
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
  let _storeName = settings?.storeInfo?.displayName || "";

  let lines = (wo.workorderLines || []).map((line) => ({
    id: line.id,
    qty: line.qty,
    inventoryItem: {
      formalName: line.inventoryItem?.catalogName || line.inventoryItem?.formalName || "",
      price: line.inventoryItem?.price || 0,
    },
    discountObj: line.discountObj
      ? { name: line.discountObj.name, savings: line.discountObj.savings || 0, newPrice: line.discountObj.newPrice || 0 }
      : null,
    receiptNotes: line.receiptNotes || "",
  }));

  let totals = calculateRunningTotals(wo, salesTaxPercent, [], false, !!wo.taxFree);

  broadcastToDisplay(DISPLAY_MSG_TYPES.WORKORDER, {
    storeName: _storeName,
    customerFirst: wo.customerFirst || "",
    customerLast: wo.customerLast || "",
    customerLanguage: wo.customerLanguage || "",
    brand: wo.brand || "",
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
    amountPaid: (() => {
      if (!wo.activeSaleID) return 0;
      let sale = useActiveSalesStore.getState().getActiveSale(wo.activeSaleID);
      return sale ? (sale.amountCaptured || 0) - (sale.amountRefunded || 0) : 0;
    })(),
    paymentComplete: wo.paymentComplete || false,
    customerNotes: (wo.customerNotes || []).map((n) => ({ name: n.name || "", value: n.value || "" })),
    receiptNotes: wo.receiptNotes || "",
  });
}

// changelog helpers /////////////////////////////////////////////////////
const NEWLY_CREATED_STATUS_ID = "34kttekj";
const CHANGELOG_TEXT_FIELDS = ["brand", "description", "partOrdered", "partSource"];
const CHANGELOG_DISCRETE_FIELDS = ["status", "color1", "color2", "waitTime", "workorderLines", "taxFree"];
const CHANGELOG_TRACKED_FIELDS = [...CHANGELOG_TEXT_FIELDS, ...CHANGELOG_DISCRETE_FIELDS];
const changeLogDebounceMap = {};

export function getChangeLogUser() {
  let u = useLoginStore.getState().currentUser;
  if (!u?.first) return "System";
  let last = u.last ? " " + u.last.charAt(0) : "";
  return u.first + last;
}

function getItemName(item) {
  return item?.catalogName || item?.formalName || "item";
}

export function diffWorkorderLines(oldLines, newLines) {
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
      const woID = workorder.id;
      // Mark changeLog dirty so the Firestore echo doesn't overwrite it
      const dirtyFields = useOpenWorkordersStore.getState()._dirtyFields;
      const ts = Date.now();
      const woDirty = { ...dirtyFields[woID], changeLog: ts };
      const dirtySnapshot = { ...woDirty };
      useOpenWorkordersStore.setState({ _dirtyFields: { ...dirtyFields, [woID]: woDirty } });
      // Update store locally, skip DB (we handle the write + dirty cleanup below)
      useOpenWorkordersStore.getState().setWorkorder(updatedWo, false);
      dbSaveOpenWorkorder(updatedWo).then(() => {
        const currentDirty = useOpenWorkordersStore.getState()._dirtyFields[woID];
        if (!currentDirty) return;
        const cleaned = { ...currentDirty };
        for (const k of Object.keys(dirtySnapshot)) {
          if (cleaned[k] === dirtySnapshot[k]) delete cleaned[k];
        }
        if (Object.keys(cleaned).length === 0) {
          const { [woID]: _, ...rest } = useOpenWorkordersStore.getState()._dirtyFields;
          useOpenWorkordersStore.setState({ _dirtyFields: rest });
        } else {
          useOpenWorkordersStore.setState({ _dirtyFields: { ...useOpenWorkordersStore.getState()._dirtyFields, [woID]: cleaned } });
        }
      });
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
      castingToDisplay: false,
      placeholderReplaceLineID: null,
      _pendingCustomerLinks: {},
      _dirtyFields: {},
      _sendStatuses: {},

      getSendStatus: (workorderID) => get()._sendStatuses[workorderID] || null,
      setSendStatus: (workorderID, status) => set({ _sendStatuses: { ...get()._sendStatuses, [workorderID]: status } }),
      clearSendStatus: (workorderID) => {
        let { [workorderID]: _, ...rest } = get()._sendStatuses;
        set({ _sendStatuses: rest });
      },

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
      addPendingCustomerLink: (workorderID, customerID) => {
        set({ _pendingCustomerLinks: { ...get()._pendingCustomerLinks, [workorderID]: customerID } });
      },
      removePendingCustomerLink: (workorderID) => {
        let links = get()._pendingCustomerLinks;
        if (!links[workorderID]) return;
        let { [workorderID]: _, ...rest } = links;
        set({ _pendingCustomerLinks: rest });
      },
      _flushPendingCustomerLink: (workorderID) => {
        let links = get()._pendingCustomerLinks;
        let customerID = links[workorderID];
        if (!customerID) return;
        let { [workorderID]: _, ...rest } = links;
        set({ _pendingCustomerLinks: rest });
        let customer = useCurrentCustomerStore.getState().getCustomer();
        if (customer?.id === customerID) {
          let updatedCustomer = { ...customer, workorders: [...(customer.workorders || []), workorderID] };
          useCurrentCustomerStore.getState().setCustomer(updatedCustomer);
        }
      },
      setOpenWorkorderID: (openWorkorderID) => {
        set({ openWorkorderID, workorderPreviewID: null });
        if (openWorkorderID) {
          let wo = get().workorders.find((o) => o.id === openWorkorderID);
          if (wo) broadcastWorkorderToDisplay(wo);
        } else {
          broadcastClear();
          useCustMessagesStore.getState().clearMessages();
        }
      },
      setOpenWorkorders: (incomingWorkorders) => {
        const localWorkorders = get().workorders;
        const incomingIds = new Set(incomingWorkorders.map((w) => w.id));
        const localOnly = localWorkorders.filter((w) => !w.customerID && !incomingIds.has(w.id));

        const dirtyFields = get()._dirtyFields;
        const merged = incomingWorkorders.map((incoming) => {
          const local = localWorkorders.find((w) => w.id === incoming.id);
          if (!local) return incoming;
          const woDirty = dirtyFields[incoming.id];
          let changed = false;
          const result = { ...local };
          for (const key of Object.keys(incoming)) {
            if (woDirty && woDirty[key]) continue; // skip dirty fields
            if (local[key] !== incoming[key]) {
              result[key] = incoming[key];
              changed = true;
            }
          }
          return changed ? result : local;
        });

        set({ workorders: [...merged, ...localOnly], workordersLoaded: true });
        // If the active workorder was deleted externally, reset to customer screen
        let openId = get().openWorkorderID;
        if (openId && !merged.find((w) => w.id === openId)) {
          set({ openWorkorderID: null });
          useTabNamesStore.getState().setItems({
            infoTabName: TAB_NAMES.infoTab.customer,
            itemsTabName: TAB_NAMES.itemsTab.empty,
            optionsTabName: TAB_NAMES.optionsTab.workorders,
          });
        }
      },
      setWorkorder: (wo, saveToDB = true, batch = true) => {
        set({ workorders: replaceOrAddToArr(get().workorders, wo) });
        // Standalone workorders are local-only — saved explicitly by checkout on first payment
        if (saveToDB && wo.customerID) dbSaveOpenWorkorder(wo);
        if (wo.id === get().openWorkorderID) broadcastWorkorderToDisplay(wo);
      },
      setField: (fieldName, fieldVal, workorderID, saveToDB = true) => {
        const doSet = () => {
          if (!workorderID) workorderID = get().openWorkorderID;
          if (get().lockedWorkorderID === workorderID) return;
          let workorder = get().workorders.find((o) => o.id === workorderID);

          // changelog: append entries for discrete fields, debounce text fields
          let logEntries = appendToChangeLog(workorder, fieldName, workorder[fieldName], fieldVal);

          workorder = { ...workorder, [fieldName]: fieldVal };
          if (logEntries && logEntries.length > 0) {
            workorder.changeLog = [...(workorder.changeLog || []), ...logEntries];
          }

          set({ workorders: replaceOrAddToArr(get().workorders, workorder) });
          // No-customer workorders stay local — saved explicitly by checkout or intake
          if (saveToDB && workorder.customerID) {
            // Mark field dirty before write
            const dirtyFields = get()._dirtyFields;
            const ts = Date.now();
            const woDirty = { ...dirtyFields[workorderID], [fieldName]: ts };
            set({ _dirtyFields: { ...dirtyFields, [workorderID]: woDirty } });

            // Capture snapshot of dirty timestamps at write time
            const dirtySnapshot = { ...woDirty };
            dbSaveOpenWorkorder(workorder).then(() => {
              const currentDirty = get()._dirtyFields[workorderID];
              if (!currentDirty) return;
              const updated = { ...currentDirty };
              for (const key of Object.keys(dirtySnapshot)) {
                if (updated[key] === dirtySnapshot[key]) delete updated[key];
              }
              if (Object.keys(updated).length === 0) {
                const { [workorderID]: _, ...rest } = get()._dirtyFields;
                set({ _dirtyFields: rest });
              } else {
                set({ _dirtyFields: { ...get()._dirtyFields, [workorderID]: updated } });
              }
            });
            get()._flushPendingCustomerLink(workorderID);
          }
          if (workorderID === get().openWorkorderID) broadcastWorkorderToDisplay(workorder);
        };

        doSet();
      },

      removeWorkorder: (workorderID, saveToDB = true, batch = true) => {
        let workorder = get().workorders.find((o) => o.id === workorderID);
        let workorders = get().workorders.filter((o) => o.id !== workorderID);
        set({ workorders });

        if (get().openWorkorderID === workorderID) {
          set({ openWorkorderID: null });
        }

        if (saveToDB) {
          dbSoftDeleteWorkorder(workorderID);

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
      merge: (persisted, current) => {
        let merged = { ...current, ...persisted };
        let wo = (merged.workorders || []).find((o) => o.id === merged.openWorkorderID);
        if (wo && !wo.customerID && !(wo.workorderLines?.length > 0)) {
          merged.openWorkorderID = null;
          merged.workorders = (merged.workorders || []).filter((o) => o.id !== wo.id);
        }
        return merged;
      },
    }
  )
);

export const useWorkorderPreviewStore = create((set, get) => ({
  previewObj: null,
  getPreviewObj: () => get().previewObj,
  setPreviewObj: (obj) => set((state) => ({ previewObj: obj })),
}));

// Identity fields hydrated from tenants/{tenantID}/users/{userID} docs into
// per-store settings.users[i] entries. Per-store entries always own
// `disabled` + ephemera; identity (name, phone, email, PIN, permissions,
// faceDescriptor, hourlyWage, stores[], linkedUserID) lives canonically on
// the tenant doc and is merged in on every settings/tenantUsers update.
const TENANT_USER_IDENTITY_FIELDS = [
  "first",
  "last",
  "permissions",
  "phone",
  "email",
  "pin",
  "faceDescriptor",
  "linkedUserID",
  "hourlyWage",
  "stores",
];

function mergeTenantIdentityIntoUsers(rawUsers, tenantUsers) {
  if (!Array.isArray(rawUsers)) return rawUsers;
  const tenantMap = new Map(
    (Array.isArray(tenantUsers) ? tenantUsers : []).map((u) => [u.id, u])
  );
  return rawUsers.map((perStore) => {
    if (!perStore || !perStore.id) return perStore;
    const tenant = tenantMap.get(perStore.id);
    if (!tenant) return perStore;
    const merged = { ...perStore };
    for (const field of TENANT_USER_IDENTITY_FIELDS) {
      if (tenant[field] !== undefined) merged[field] = tenant[field];
    }
    return merged;
  });
}

export const useSettingsStore = create(
  persist(
    (set, get) => ({
      settings: null,
      tenantUsers: [],

      getSettings: () => get().settings,
      getTenantUsers: () => get().tenantUsers,

      setSettings: (settings, batch = true, sendToDB = true) => {
        const hydrated = settings
          ? {
              ...settings,
              users: mergeTenantIdentityIntoUsers(
                settings.users,
                get().tenantUsers
              ),
            }
          : settings;
        set({ settings: hydrated });

        if (sendToDB) {
          dbSaveSettings(settings);
        }
      },

      setField: (fieldName, fieldVal, sendToDB = true) => {
        const current = get().settings || {};
        const nextValue =
          fieldName === "users"
            ? mergeTenantIdentityIntoUsers(fieldVal, get().tenantUsers)
            : fieldVal;
        set({ settings: { ...current, [fieldName]: nextValue } });
        if (sendToDB) dbSaveSettingsField(fieldName, fieldVal);
      },

      setTenantUsers: (tenantUsers) => {
        const current = get().settings;
        if (current && Array.isArray(current.users)) {
          set({
            tenantUsers,
            settings: {
              ...current,
              users: mergeTenantIdentityIntoUsers(current.users, tenantUsers),
            },
          });
        } else {
          set({ tenantUsers });
        }
      },
    }),
    {
      name: "warpspeed_settings",
      partialize: (s) => ({ settings: s.settings, tenantUsers: s.tenantUsers }),
    }
  )
);

export const usePhoneConfigStore = create(
  persist(
    (set, get) => ({
      phoneConfig: null,

      getPhoneConfig: () => get().phoneConfig,

      setPhoneConfig: (phoneConfig) => set({ phoneConfig }),

      setField: (fieldName, fieldVal, sendToDB = true) => {
        const current = get().phoneConfig || {};
        set({ phoneConfig: { ...current, [fieldName]: fieldVal } });
        if (sendToDB) dbSavePhoneConfigField(fieldName, fieldVal);
      },
    }),
    {
      name: "warpspeed_phone_config",
      partialize: (s) => ({ phoneConfig: s.phoneConfig }),
    }
  )
);

export const useUploadProgressStore = create((set, get) => ({
  // null | { completed, total, failed, done }
  progress: null,
  setProgress: (progress) => set({ progress }),
  clearProgress: () => set({ progress: null }),
}));

export const useActiveSalesStore = create((set, get) => ({
  activeSales: [],
  getActiveSales: () => get().activeSales,
  setActiveSales: (activeSales) => set({ activeSales }),
  getActiveSale: (saleID) => get().activeSales.find((s) => s.id === saleID) || null,
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

// ============================================================================
// EMAIL STORE
// ============================================================================

export const useEmailStore = create(
  persist(
  (set, get) => ({
  activeAccountKey: "support",
  getActiveAccountKey: () => get().activeAccountKey,
  setActiveAccountKey: (activeAccountKey) => set({ activeAccountKey }),

  emailAuth: null,
  getEmailAuth: () => get().emailAuth,
  setEmailAuth: (emailAuth) => set({ emailAuth }),
  setEmailAuthForAccount: (accountKey, data) => {
    set((state) => ({
      emailAuth: { ...state.emailAuth, [accountKey]: data },
    }));
  },

  // Tenant-scoped inbox roster (was settings.emailAccounts). Each item:
  //   { accountKey, email, displayName, signature, assignedStoreID, ... }
  // assignedStoreID === null → shared across all stores in the tenant.
  // Populated by BaseScreen's dbListenToEmailAccounts listener.
  emailAccounts: [],
  getEmailAccounts: () => get().emailAccounts,
  setEmailAccounts: (emailAccounts) => set({ emailAccounts }),
  getEmailAccountByKey: (accountKey) =>
    (get().emailAccounts || []).find((a) => a.accountKey === accountKey || a.id === accountKey),
  getEmailAccountsForStore: (storeID) =>
    (get().emailAccounts || []).filter(
      (a) => !a.assignedStoreID || a.assignedStoreID === storeID
    ),

  activeFolder: "INBOX",
  getActiveFolder: () => get().activeFolder,
  setActiveFolder: (activeFolder) => set({ activeFolder }),

  emails: [],
  getEmails: () => get().emails,
  setEmails: (emails) => set({ emails }),

  // Runtime-only map of in-flight optimistic label mutations, keyed by
  // messageId: { add: string[], remove: string[], expiresAt: number }.
  // Lets the Firestore listener re-apply pending changes on top of stale
  // snapshots so optimistic updates don't get clobbered before the server
  // catches up. Not persisted.
  pendingLabelMods: {},
  addPendingLabelMods: (messageIds, addLabelIds, removeLabelIds) => {
    if (!messageIds || messageIds.length === 0) return;
    const add = addLabelIds || [];
    const remove = removeLabelIds || [];
    const expiresAt = Date.now() + 15000;
    set((state) => {
      const next = { ...state.pendingLabelMods };
      messageIds.forEach((id) => {
        const prev = next[id] || { add: [], remove: [], expiresAt };
        const mergedAdd = Array.from(new Set([
          ...prev.add.filter((l) => !remove.includes(l)),
          ...add,
        ]));
        const mergedRemove = Array.from(new Set([
          ...prev.remove.filter((l) => !add.includes(l)),
          ...remove,
        ]));
        next[id] = { add: mergedAdd, remove: mergedRemove, expiresAt };
      });
      return { pendingLabelMods: next };
    });
  },
  reconcilePendingLabelMods: (incomingEmails) => {
    const pending = get().pendingLabelMods;
    const pendingIds = Object.keys(pending);
    if (pendingIds.length === 0) return incomingEmails;
    const now = Date.now();
    const nextPending = {};
    const reconciled = incomingEmails.map((email) => {
      const mod = pending[email.id];
      if (!mod) return email;
      if (mod.expiresAt <= now) return email; // expired, drop
      const labels = email.labelIds || [];
      const satisfied =
        mod.add.every((l) => labels.includes(l)) &&
        mod.remove.every((l) => !labels.includes(l));
      if (satisfied) return email; // server caught up, drop entry
      nextPending[email.id] = mod;
      let nextLabels = [...labels];
      mod.remove.forEach((l) => {
        nextLabels = nextLabels.filter((x) => x !== l);
      });
      mod.add.forEach((l) => {
        if (!nextLabels.includes(l)) nextLabels.push(l);
      });
      return {
        ...email,
        labelIds: nextLabels,
        isUnread: nextLabels.includes("UNREAD"),
      };
    });
    // Carry forward any pending entries whose email wasn't in the snapshot
    // yet (rare, but possible) — drop only ones we explicitly resolved.
    const incomingIds = new Set(incomingEmails.map((e) => e.id));
    pendingIds.forEach((id) => {
      if (incomingIds.has(id)) return;
      if (pending[id].expiresAt <= now) return;
      nextPending[id] = pending[id];
    });
    set({ pendingLabelMods: nextPending });
    return reconciled;
  },

  getFilteredEmails: () => {
    const folder = get().activeFolder;
    const accountKey = get().activeAccountKey;
    let emails = get().emails.filter((e) => e.accountKey === accountKey);
    switch (folder) {
      case "INBOX":
        return emails.filter((e) => e.labelIds?.includes("INBOX"));
      case "SENT":
        return emails.filter((e) => e.labelIds?.includes("SENT"));
      case "TRASH":
        return emails.filter((e) => e.labelIds?.includes("TRASH"));
      case "SPAM":
        return emails.filter((e) => e.labelIds?.includes("SPAM"));
      case "DRAFT":
        return emails.filter((e) => e.labelIds?.includes("DRAFT"));
      case "ALL":
        return emails;
      default:
        return emails.filter((e) => e.labelIds?.includes("INBOX"));
    }
  },

  getThreadedEmails: () => {
    const filtered = get().getFilteredEmails();
    const threadMap = {};
    filtered.forEach((email) => {
      const tid = email.threadId || email.id;
      if (!threadMap[tid]) {
        threadMap[tid] = {
          threadId: tid,
          subject: email.subject,
          from: email.from,
          fromName: email.fromName,
          snippet: email.snippet,
          internalDate: email.internalDate,
          isUnread: email.isUnread,
          messageCount: 1,
          latestMessage: email,
        };
      } else {
        threadMap[tid].messageCount++;
        if (email.isUnread) threadMap[tid].isUnread = true;
        if (email.internalDate > threadMap[tid].internalDate) {
          threadMap[tid].internalDate = email.internalDate;
          threadMap[tid].snippet = email.snippet;
          threadMap[tid].from = email.from;
          threadMap[tid].fromName = email.fromName;
          threadMap[tid].latestMessage = email;
        }
      }
    });
    return Object.values(threadMap).sort(
      (a, b) => (b.internalDate || 0) - (a.internalDate || 0)
    );
  },

  selectedThreadId: null,
  getSelectedThreadId: () => get().selectedThreadId,
  setSelectedThreadId: (selectedThreadId) => set({ selectedThreadId }),

  getThreadMessages: () => {
    const threadId = get().selectedThreadId;
    if (!threadId) return [];
    const accountKey = get().activeAccountKey;
    return get()
      .emails.filter(
        (e) => e.threadId === threadId && e.accountKey === accountKey
      )
      .sort((a, b) => (a.internalDate || 0) - (b.internalDate || 0));
  },

  composeMode: null,
  getComposeMode: () => get().composeMode,
  setComposeMode: (composeMode) => set({ composeMode }),

  // "hidden" | "open" | "minimized" — thread-inspector modal that overlays
  // the Options column while user composes a reply.
  threadInspectorState: "hidden",
  getThreadInspectorState: () => get().threadInspectorState,
  setThreadInspectorState: (threadInspectorState) => set({ threadInspectorState }),

  composeDraft: {
    to: [],
    cc: [],
    bcc: [],
    subject: "",
    bodyHtml: "",
    bodyText: "",
    threadId: null,
    inReplyTo: "",
    references: "",
    attachments: [],
  },
  getComposeDraft: () => get().composeDraft,
  setComposeDraft: (composeDraft) => set({ composeDraft }),
  updateComposeDraft: (fields) =>
    set((state) => ({
      composeDraft: { ...state.composeDraft, ...fields },
    })),
  clearComposeDraft: () =>
    set({
      composeDraft: {
        to: [],
        cc: [],
        bcc: [],
        subject: "",
        bodyHtml: "",
        bodyText: "",
        threadId: null,
        inReplyTo: "",
        references: "",
        attachments: [],
      },
      composeMode: null,
      threadInspectorState: "hidden",
    }),

  emailsLoading: false,
  getEmailsLoading: () => get().emailsLoading,
  setEmailsLoading: (emailsLoading) => set({ emailsLoading }),

  sendingEmail: false,
  getSendingEmail: () => get().sendingEmail,
  setSendingEmail: (sendingEmail) => set({ sendingEmail }),

  syncError: null,
  getSyncError: () => get().syncError,
  setSyncError: (syncError) => set({ syncError }),

  _emailsUnsub: null,
  setEmailsUnsub: (unsub) => set({ _emailsUnsub: unsub }),

  _authUnsub: null,
  setAuthUnsub: (unsub) => set({ _authUnsub: unsub }),

  _accountsUnsub: null,
  setAccountsUnsub: (unsub) => set({ _accountsUnsub: unsub }),

  getTotalUnreadCount: () => {
    const auth = get().emailAuth;
    if (!auth) return 0;
    let count = 0;
    Object.values(auth).forEach((acct) => {
      if (acct?.unreadCount) count += acct.unreadCount;
    });
    return count;
  },

  clearEmailStore: () => {
    let prevEmails = get()._emailsUnsub;
    if (prevEmails) prevEmails();
    let prevAuth = get()._authUnsub;
    if (prevAuth) prevAuth();
    let prevAccounts = get()._accountsUnsub;
    if (prevAccounts) prevAccounts();
    set({
      emails: [],
      emailAuth: null,
      emailAccounts: [],
      selectedThreadId: null,
      composeMode: null,
      threadInspectorState: "hidden",
      emailsLoading: false,
      sendingEmail: false,
      syncError: null,
      _emailsUnsub: null,
      _authUnsub: null,
      _accountsUnsub: null,
    });
  },
}),
    {
      name: "warpspeed_email",
      storage: idbStorage,
      partialize: (state) => ({
        emails: state.emails,
        emailAuth: state.emailAuth,
        emailAccounts: state.emailAccounts,
        activeAccountKey: state.activeAccountKey,
        activeFolder: state.activeFolder,
      }),
      merge: (persisted, current) => ({ ...current, ...persisted }),
    }
  )
);

export const useSubscriptionStore = create((set, get) => ({
  subscription: null,
  getSubscription: () => get().subscription,
  setSubscription: (subscription) => set({ subscription }),
  hasFeature: (featureName) => get().subscription?.features?.[featureName] === true,
}));

// ─── useBillingStore ────────────────────────────────────────────────────
// Tenant-level billing snapshot. Populated by an onSnapshot in App.jsx for
// monthly_sub SaaS tenants; derived flags drive client-side suspend gating
// in checkout. Per-sale / Bonita / signed-out → tenantDoc stays null, all
// selectors return safe defaults so existing flows are unchanged.
export const useBillingStore = create((set, get) => ({
  tenantDoc: null,
  _unsub: null,

  getTenantDoc: () => get().tenantDoc,
  setTenantDoc: (tenantDoc) => set({ tenantDoc }),

  setUnsub: (_unsub) => set({ _unsub }),
  teardown: () => {
    const u = get()._unsub;
    if (typeof u === "function") u();
    set({ tenantDoc: null, _unsub: null });
  },

  getBillingModel: () => get().tenantDoc?.billingModel || null,
  getSubscriptionStatus: () => get().tenantDoc?.subscriptionStatus || null,
  getSubscriptionGraceUntil: () => get().tenantDoc?.subscriptionGraceUntil || null,
  getPlatformFeePercent: () => {
    const v = get().tenantDoc?.platformFeePercent;
    return typeof v === "number" ? v : null;
  },

  // True when the grace window has expired while past_due, regardless of
  // billing model. Used as a hard gate at the checkout entry. Both
  // monthly_sub (failed subscription invoice) and per_sale (failed fee
  // accumulation invoice) route through the same webhook and land on the
  // same subscriptionStatus field, so one gate covers both.
  isPaymentBlocked: () => {
    const t = get().tenantDoc;
    if (!t) return false;
    const status = t.subscriptionStatus;
    if (status === "canceled" || status === "unpaid") return true;
    if (status !== "past_due") return false;
    const grace = t.subscriptionGraceUntil;
    if (typeof grace !== "number") return true;
    return Date.now() > grace;
  },

  // True for tenants past_due but still inside the grace window. Surfaces
  // the warning banner; does NOT block payment flows. Applies to both
  // monthly_sub and per_sale — same field, same semantics.
  isInGracePeriod: () => {
    const t = get().tenantDoc;
    if (!t) return false;
    if (t.subscriptionStatus !== "past_due") return false;
    const grace = t.subscriptionGraceUntil;
    if (typeof grace !== "number") return false;
    return Date.now() <= grace;
  },
}));

// Clear all persisted Zustand stores (called on logout)
export function clearPersistedStores() {
  useOpenWorkordersStore.persist.clearStorage();
  useCurrentCustomerStore.persist.clearStorage();
  useTabNamesStore.persist.clearStorage();
  useInventoryStore.persist.clearStorage();
  useSettingsStore.persist.clearStorage();
  useLoginStore.persist.clearStorage();
  useRecentCustomersStore.persist.clearStorage();
  useCustMessagesStore.getState()._threadsUnsub?.();
  useCustMessagesStore.getState().setSmsThreads([]);
  useCustMessagesStore.setState({ hubConversationCache: {} });
  useEmailStore.persist.clearStorage();
  useEmailStore.getState().clearEmailStore();
  // Clear IndexedDB hub cache (async, fire-and-forget)
  import("./hubMessageDB").then((hubDB) => hubDB.clearAll()).catch(() => {});
  clearIdPool();
}

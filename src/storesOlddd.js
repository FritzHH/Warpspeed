/* eslint-disable */

import { create } from "zustand";
import {
  CUSTOMER_PROTO,
  FRITZ_USER_OBJ,
  INVENTORY_ITEM_PROTO,
  PRIVILEDGE_LEVELS,
  TAB_NAMES,
  TIME_PUNCH_PROTO,
  WORKORDER_PROTO,
} from "./data";
import {
  checkArr,
  clog,
  generateRandomID,
  generateUPCBarcode,
  log,
} from "./utils";
import { cloneDeep } from "lodash";
import {
  batchDBCall,
  dbSetPunchClockArr,
  dbSetOrUpdateUserPunchObj,
  dbSetSettings,
  dbSetInventoryItem,
  dbSetWorkorder,
  dbSetCustomerField,
  dbSetCustomerObj,
  dbGetOpenWorkorderItem,
  dbGetClosedWorkorderItem,
  dbGetSaleItem,
} from "./db_call_wrapper";

// internal use  /////////////////////////////////////////////////////
/**
 * @typedef {Object} AlertScreenConfig
 * @property {boolean} showAlert - Whether to show the alert screen
 * @property {string} title - Alert title text
 * @property {string} message - Main alert message
 * @property {Object} alertBoxStyle - Custom styles for the alert box
 * @property {string} subMessage - Additional message text
 * @property {string} btn1Text - Text for first button
 * @property {string} btn2Text - Text for second button
 * @property {string} btn3Text - Text for third button
 * @property {*} btn1Icon - Icon for first button
 * @property {*} btn2Icon - Icon for second button
 * @property {*} btn3Icon - Icon for third button
 * @property {*} icon1Size - Size for first icon
 * @property {*} icon2Size - Size for second icon
 * @property {*} icon3Size - Size for third icon
 * @property {Function} handleBtn1Press - Handler for first button press
 * @property {Function} handleBtn2Press - Handler for second button press
 * @property {Function} handleBtn3Press - Handler for third button press
 * @property {boolean} canExitOnOuterClick - Whether alert can be closed by clicking outside
 * @property {boolean} pauseOnBaseComponent - Whether to pause base component
 */
// export const ALERT_SCREEN_PROTO = {
//   showAlert: true,
//   title: "Alert",
//   message: "",
//   alertBoxStyle: {},
//   subMessage: "",
//   btn1Text: "",
//   btn2Text: "",
//   btn3Text: "",
//   btn1Icon: null,
//   btn2Icon: null,
//   btn3Icon: null,
//   icon1Size: null,
//   icon2Size: null,
//   icon3Size: null,
//   handleBtn1Press: null,
//   handleBtn2Press: null,
//   handleBtn3Press: null,
//   canExitOnOuterClick: false,
//   pauseOnBaseComponent: false,
// };

/**
 * Inventory Modal Store - Manages inventory item modal state
 * @typedef {Object} InvModalStore
 * @property {string|null} currentFocusName - Currently focused field name
 * @property {Object} item - Current inventory item object
 * @property {Function} setFocus - Set the focused field name
 * @property {Function} setItem - Set the current inventory item
 * @property {Function} getItem - Get the current inventory item
 * @property {Function} getFocus - Get the currently focused field name
 * @property {Function} reset - Reset store to initial state
 */
export const useInvModalStore = create((set, get) => ({
  currentFocusName: null,
  item: { ...INVENTORY_ITEM_PROTO },
  /**
   * Set the focused field name
   * @param {string} focusName - Name of the field to focus
   */
  setFocus: (focusName) => {
    // log("setting focus", focusName);
    set((state) => ({
      currentFocusName: focusName,
    }));
  },
  /**
   * Set the current inventory item
   * @param {Object} item - Inventory item object to set
   */
  setItem: (item) => {
    // log("setting item in zStore", item);
    set((state) => ({ item: { ...item } }));
  },
  /**
   * Get the current inventory item
   * @returns {Object} Current inventory item
   */
  getItem: () => {
    let val = get().item;
    // log("getting item", val);
    return val;
  },
  /**
   * Get the currently focused field name
   * @returns {string|null} Currently focused field name
   */
  getFocus: () => {
    let focusName = get().currentFocusName;
    // log("getting focus", focusName);
    return focusName;
  },
  /**
   * Reset store to initial state
   */
  reset: () => {
    set(() => ({
      currentFocusName: null,
      item: INVENTORY_ITEM_PROTO,
    }));
  },
}));

/**
 * Tab Names Store - Manages active tab names for different sections
 * @typedef {Object} TabNamesStore
 * @property {string} infoTabName - Current info tab name
 * @property {string} itemsTabName - Current items tab name
 * @property {string} optionsTabName - Current options tab name
 * @property {Function} getItemsTabName - Get current items tab name
 * @property {Function} getOptionsTabName - Get current options tab name
 * @property {Function} getInfoTabName - Get current info tab name
 * @property {Function} setInfoTabName - Set info tab name
 * @property {Function} setItemsTabName - Set items tab name
 * @property {Function} setOptionsTabName - Set options tab name
 */
export const useTabNamesStore = create((set, get) => ({
  infoTabName: TAB_NAMES.infoTab.workorder,
  itemsTabName: TAB_NAMES.itemsTab.workorderItems,
  optionsTabName: TAB_NAMES.optionsTab.quickItems,

  /**
   * Get current items tab name
   * @returns {string} Current items tab name
   */
  getItemsTabName: () => get().itemsTabName,
  /**
   * Get current options tab name
   * @returns {string} Current options tab name
   */
  getOptionsTabName: () => get().optionsTabName,
  /**
   * Get current info tab name
   * @returns {string} Current info tab name
   */
  getInfoTabName: () => get().infoTabName,

  /**
   * Set info tab name
   * @param {string} name - Tab name to set
   */
  setInfoTabName: (name) => {
    set((state) => ({ infoTabName: name }));
  },
  /**
   * Set items tab name
   * @param {string} name - Tab name to set
   */
  setItemsTabName: (name) => {
    set((state) => ({ itemsTabName: name }));
  },
  /**
   * Set options tab name
   * @param {string} name - Tab name to set
   */
  setOptionsTabName: (name) => {
    set((state) => ({ optionsTabName: name }));
  },
}));

/**
 * Customer Search Store - Manages customer search state and results
 * @typedef {Object} CustomerSearchStore
 * @property {Object|null} selectedItem - Currently selected customer item
 * @property {Array} searchResultsArr - Array of customer search results
 * @property {Function} getSearchResultsArr - Get search results array
 * @property {Function} getSelectedItem - Get selected customer item
 * @property {Function} setSelectedItem - Set selected customer item
 * @property {Function} setSearchResultsArr - Set search results array
 * @property {Function} reset - Reset store to initial state
 */
export const useCustomerSearchStore = create((set, get) => ({
  selectedItem: null,
  searchResultsArr: [],
  /**
   * Get search results array
   * @returns {Array} Array of customer search results
   */
  getSearchResultsArr: () => get().searchResultsArr,
  /**
   * Get selected customer item
   * @returns {Object|null} Currently selected customer item
   */
  getSelectedItem: () => get().selectedItem,
  /**
   * Set selected customer item
   * @param {Object|null} item - Customer item to select
   */
  setSelectedItem: (item) => {
    set((state) => ({
      selectedItem: item,
    }));
  },
  /**
   * Set search results array
   * @param {Array} arr - Array of customer search results
   */
  setSearchResultsArr: (arr) => {
    set((state) => ({ searchResultsArr: arr }));
  },
  /**
   * Reset store to initial state
   */
  reset: () => {
    set((state) => ({ searchResultsArr: [] }));
    set((state) => ({ selectedItem: null }));
  },
}));

/**
 * Checkout Store - Manages checkout process and receipt scanning
 * @typedef {Object} CheckoutStore
 * @property {boolean} isCheckingOut - Whether checkout is in progress
 * @property {Object|null} saleObj - Current sale object
 * @property {string} receiptScan - Receipt scan string
 * @property {string} message - Status message
 * @property {boolean} loading - Loading state
 * @property {Function} getMessage - Get status message
 * @property {Function} getLoading - Get loading state
 * @property {Function} getSaleObj - Get current sale object
 * @property {Function} getIsCheckingOut - Get checkout state
 * @property {Function} getReceiptScan - Get receipt scan string
 * @property {Function} setStringOnly - Set only the receipt scan string
 * @property {Function} setLoading - Set loading state
 * @property {Function} setIsCheckingOut - Set checkout state
 * @property {Function} setReceiptScan - Set receipt scan and process
 */
export const useCheckoutStore = create((set, get) => ({
  isCheckingOut: false,
  saleObj: null,
  receiptScan: "",
  message: "",
  loading: false,

  /**
   * Get status message
   * @returns {string} Current status message
   */
  getMessage: () => get().message,
  /**
   * Get loading state
   * @returns {boolean} Current loading state
   */
  getLoading: () => get().loading,
  /**
   * Get current sale object
   * @returns {Object|null} Current sale object
   */
  getSaleObj: () => get().saleObj,
  /**
   * Get checkout state
   * @returns {boolean} Whether checkout is in progress
   */
  getIsCheckingOut: () => get().isCheckingOut,
  /**
   * Get receipt scan string
   * @returns {string} Current receipt scan string
   */
  getReceiptScan: () => get().receiptScan,

  /**
   * Set only the receipt scan string
   * @param {string} receiptScan - Receipt scan string
   */
  setStringOnly: (receiptScan) => set({ receiptScan }),
  /**
   * Set loading state
   * @param {boolean} loading - Loading state
   */
  setLoading: (loading) => set({ loading }),
  // setSaleObj: (saleObj) => set({ saleObj }),
  /**
   * Set checkout state
   * @param {boolean} isCheckingOut - Whether checkout is in progress
   */
  setIsCheckingOut: (isCheckingOut) => set({ isCheckingOut }),
  /**
   * Set receipt scan and process the scan
   * @param {string} receiptScan - Receipt scan string
   * @param {Function} [callback] - Callback function to execute when scan is processed
   */
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


/**
 * Alert Screen Store - Manages alert screen state and configuration
 * @typedef {Object} AlertScreenStore
 * @property {boolean} showAlert - Whether alert is visible
 * @property {string} title - Alert title
 * @property {string} message - Alert message
 * @property {Object} alertBoxStyle - Custom alert box styles
 * @property {string} subMessage - Alert sub-message
 * @property {string} btn1Text - First button text
 * @property {string} btn2Text - Second button text
 * @property {string} btn3Text - Third button text
 * @property {*} btn1Icon - First button icon
 * @property {*} btn2Icon - Second button icon
 * @property {*} btn3Icon - Third button icon
 * @property {*} icon1Size - First icon size
 * @property {*} icon2Size - Second icon size
 * @property {*} icon3Size - Third icon size
 * @property {Function} handleBtn1Press - First button handler
 * @property {Function} handleBtn2Press - Second button handler
 * @property {Function} handleBtn3Press - Third button handler
 * @property {boolean} canExitOnOuterClick - Whether can exit on outer click
 * @property {boolean} pauseOnBaseComponent - Whether to pause base component
 */
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

  /**
   * Get pause on base component state
   * @returns {boolean} Whether to pause base component
   */
  getPauseOnBaseComponent: () => get().pauseOnBaseComponent,
  /**
   * Get alert message
   * @returns {string} Current alert message
   */
  getMessage: () => get().message,
  /**
   * Get alert sub-message
   * @returns {string} Current alert sub-message
   */
  getSubMessage: () => get().subMessage,
  /**
   * Get can exit on outer click state
   * @returns {boolean} Whether can exit on outer click
   */
  getCanExitOnOuterClick: () => get().canExitOnOuterClick,
  /**
   * Get alert title
   * @returns {string} Current alert title
   */
  getTitle: () => get().title,
  /**
   * Get show alert state
   * @returns {boolean} Whether alert is visible
   */
  getShowAlert: () => get().showAlert,
  /**
   * Get first button text
   * @returns {string} First button text
   */
  getButton1Text: () => get().btn1Text,
  /**
   * Get second button text
   * @returns {string} Second button text
   */
  getButton2Text: () => get().btn2Text,
  /**
   * Get third button text
   * @returns {string} Third button text
   */
  getButton3Text: () => get().btn3Text,
  /**
   * Get first button handler
   * @returns {Function} First button handler
   */
  getButton1Handler: () => get().handleBtn1Press,
  /**
   * Get second button handler
   * @returns {Function} Second button handler
   */
  getButton2Handler: () => get().handleBtn2Press,
  /**
   * Get third button handler
   * @returns {Function} Third button handler
   */
  getButton3Handler: () => get().handleBtn3Press,
  /**
   * Get first button icon
   * @returns {*} First button icon
   */
  getButton1Icon: () => get().btn1Icon,
  /**
   * Get second button icon
   * @returns {*} Second button icon
   */
  getButton2Icon: () => get().btn2Icon,
  /**
   * Get third button icon
   * @returns {*} Third button icon
   */
  getButton3Icon: () => get().btn3Icon,
  /**
   * Get first icon size
   * @returns {*} First icon size
   */
  getIcon1Size: () => get().icon1Size,
  /**
   * Get second icon size
   * @returns {*} Second icon size
   */
  getIcon2Size: () => get().icon2Size,
  /**
   * Get third icon size
   * @returns {*} Third icon size
   */
  getIcon3Size: () => get().icon3Size,
  /**
   * Get alert box style
   * @returns {Object} Alert box style object
   */
  getAlertBoxStyle: () => get().alertBoxStyle,

  /**
   * Set all alert values at once
   * @param {AlertScreenConfig} config - Alert configuration object
   */
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
  /**
   * Set alert message
   * @param {string} message - Alert message
   */
  setMessage: (message) => {
    set(() => ({ message }));
  },
  /**
   * Set alert sub-message
   * @param {string} subMessage - Alert sub-message
   */
  setSubMessage: (subMessage) => {
    set(() => ({ subMessage }));
  },
  /**
   * Set can exit on outer click
   * @param {boolean} canExitOnOuterClick - Whether can exit on outer click
   */
  setCanExitOnOuterClick: (canExitOnOuterClick) => {
    set(() => ({ canExitOnOuterClick }));
  },
  /**
   * Set alert title
   * @param {string} title - Alert title
   */
  setTitle: (title) => {
    set(() => ({ title }));
  },
  /**
   * Set show alert state
   * @param {boolean} showAlert - Whether to show alert
   */
  setShowAlert: (showAlert) => {
    set(() => ({ showAlert }));
  },
  /**
   * Set first button text
   * @param {string} btn1Text - First button text
   */
  setButton1Text: (btn1Text) => {
    set(() => ({ btn1Text }));
  },
  /**
   * Set second button text
   * @param {string} btn2Text - Second button text
   */
  setButton2Text: (btn2Text) => {
    set(() => ({ btn2Text }));
  },
  /**
   * Set first button handler
   * @param {Function} handleBtn1Press - First button handler
   */
  setButton1Handler: (handleBtn1Press) => {
    set(() => ({ handleBtn1Press }));
  },
  /**
   * Set second button handler
   * @param {Function} handleBtn2Press - Second button handler
   */
  setButton2Handler: (handleBtn2Press) => {
    set(() => ({ handleBtn2Press }));
  },
  /**
   * Set first button icon
   * @param {*} btn1Icon - First button icon
   */
  setButton1Icon: (btn1Icon) => {
    set(() => ({ btn1Icon }));
  },
  /**
   * Set second button icon
   * @param {*} btn2Icon - Second button icon
   */
  setButton2Icon: (btn2Icon) => {
    set(() => ({ btn2Icon }));
  },
  /**
   * Set first icon size
   * @param {*} icon1Size - First icon size
   */
  setIcon1Size: (icon1Size) => {
    set(() => ({ icon1Size }));
  },
  /**
   * Set second icon size
   * @param {*} icon2Size - Second icon size
   */
  setIcon2Size: (icon2Size) => {
    set(() => ({ icon2Size }));
  },
  setShowAlert: (showAlert) => set({ showAlert }),

  /**
   * Reset all alert values to default
   */
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

/**
 * Database Batch Store - Manages database batch timing and operations
 * @typedef {Object} DatabaseBatchStore
 * @property {number} lastBatchMillis - Timestamp of last batch operation
 * @property {number} lastWriteMillis - Timestamp of last write operation
 * @property {Function} getLastWriteMillis - Get last write timestamp
 * @property {Function} getLastBatchMillis - Get last batch timestamp
 * @property {Function} setLastBatchMillis - Set last batch timestamp
 * @property {Function} setLastWriteMillis - Set last write timestamp
 * @property {Function} resetLastWriteMillis - Reset last write timestamp to default
 */
export const useDatabaseBatchStore = create((set, get) => ({
  lastBatchMillis: 9999999999999999999999999,
  lastWriteMillis: 9999999999999999999999999,

  /**
   * Get last write timestamp
   * @returns {number} Last write timestamp in milliseconds
   */
  getLastWriteMillis: () => get().lastWriteMillis,
  /**
   * Get last batch timestamp
   * @returns {number} Last batch timestamp in milliseconds
   */
  getLastBatchMillis: () => get().lastBatchMillis,

  /**
   * Set last batch timestamp
   * @param {number} lastBatchMillis - Timestamp in milliseconds
   */
  setLastBatchMillis: (lastBatchMillis) => set({ lastBatchMillis }),
  /**
   * Set last write timestamp
   * @param {number} lastWriteMillis - Timestamp in milliseconds
   */
  setLastWriteMillis: (lastWriteMillis) => set({ lastWriteMillis }),
  /**
   * Set last write timestamp to current time
   */
  setLastWriteMillis: () => {
    let lastWriteMillis = new Date().getTime();
    set({ lastWriteMillis });
  },
  /**
   * Reset last write timestamp to default value
   */
  resetLastWriteMillis: () =>
    set({ lastWriteMillis: 9999999999999999999999999 }),
}));

/**
 * Stripe Payment Store - Manages Stripe payment processing state
 * @typedef {Object} StripePaymentStore
 * @property {string|null} paymentIntentID - Current payment intent ID
 * @property {Object|null} reader - Current payment reader
 * @property {Array|null} readersArr - Array of available readers
 * @property {number} paymentAmount - Payment amount
 * @property {Function} getReadersArr - Get readers array
 * @property {Function} getPaymentAmount - Get payment amount
 * @property {Function} getPaymentIntentID - Get payment intent ID
 * @property {Function} getReader - Get current reader
 * @property {Function} setReadersArr - Set readers array
 * @property {Function} setPaymentIntentID - Set payment intent ID
 * @property {Function} setPaymentAmount - Set payment amount
 * @property {Function} setReader - Set current reader
 * @property {Function} reset - Reset store to initial state
 */
export const useStripePaymentStore = create((set, get) => ({
  paymentIntentID: null,
  reader: null,
  readersArr: null,
  paymentAmount: 0.53,
  /**
   * Get readers array
   * @returns {Array|null} Array of available readers
   */
  getReadersArr: () => get().readersArr,
  /**
   * Get payment amount
   * @returns {number} Current payment amount
   */
  getPaymentAmount: () => get().paymentAmount,
  /**
   * Get payment intent ID
   * @returns {string|null} Current payment intent ID
   */
  getPaymentIntentID: () => get().paymentIntentID,
  /**
   * Get current reader
   * @returns {Object|null} Current payment reader
   */
  getReader: () => get().reader,
  //

  /**
   * Set readers array
   * @param {Array} readersArr - Array of available readers
   */
  setReadersArr: (readersArr) => {
    set(() => ({
      readersArr,
    }));
  },
  /**
   * Set payment intent ID
   * @param {string} paymentIntentID - Payment intent ID
   */
  setPaymentIntentID: (paymentIntentID) => {
    log("setting pi id in zustand", paymentIntentID);
    set(() => ({
      paymentIntentID,
    }));
  },
  /**
   * Set payment amount
   * @param {number} paymentAmount - Payment amount
   */
  setPaymentAmount: (paymentAmount) => {
    set(() => ({ paymentAmount }));
  },
  /**
   * Set current reader
   * @param {Object} reader - Payment reader object
   */
  setReader: (reader) => {
    set(() => ({ reader }));
  },
  /**
   * Reset store to initial state
   */
  reset: () => {
    set(() => ({
      paymentIntentID: null,
      paymentAmount: 0,
    }));
  },
}));

/**
 * Login Store - Manages user authentication and login state
 * @typedef {Object} LoginStore
 * @property {boolean} webcamDetected - Whether webcam is detected
 * @property {string} adminPrivilege - Current admin privilege level
 * @property {number} loginTimeout - Login timeout in seconds
 * @property {Object} currentUserObj - Current user object
 * @property {Array} punchClockArr - Array of punch clock entries
 * @property {boolean} modalVisible - Whether login modal is visible
 * @property {number} lastActionMillis - Timestamp of last action
 * @property {Function} postLoginFunctionCallback - Callback to run after login
 * @property {boolean} showLoginScreen - Whether to show login screen
 * @property {boolean} runBackgroundRecognition - Whether to run background face recognition
 */
export const useLoginStore = create((set, get) => ({
  webcamDetected: false,
  adminPrivilege: "",
  loginTimeout: 0,
  currentUserObj: cloneDeep(FRITZ_USER_OBJ), //testing
  // currentUserObj: null,
  punchClockArr: [],
  modalVisible: false,
  lastActionMillis: 0,
  postLoginFunctionCallback: () => {},
  showLoginScreen: false,

  // face login
  runBackgroundRecognition: true,

  /**
   * Get punch clock array
   * @returns {Array} Array of punch clock entries
   */
  getPunchClockArr: () => get().punchClockArr,
  /**
   * Get webcam detected state
   * @returns {boolean} Whether webcam is detected
   */
  getWebcamDetected: () => get().webcamDetected,
  /**
   * Get background recognition state
   * @returns {boolean} Whether background recognition is running
   */
  getRunBackgroundRecognition: () => get().runBackgroundRecognition,
  /**
   * Get login function callback
   * @returns {Function} Login function callback
   */
  getLoginFunctionCallback: () => get().loginFunctionCallback,
  /**
   * Get show login screen state
   * @returns {boolean} Whether to show login screen
   */
  getShowLoginScreen: () => get().showLoginScreen,
  /**
   * Get last action timestamp
   * @returns {number} Last action timestamp in milliseconds
   */
  getLastActionMillis: () => get().lastActionMillis,
  /**
   * Get current user object
   * @returns {Object} Current user object
   */
  getCurrentUserObj: () => get().currentUserObj,
  /**
   * Get admin privilege level
   * @returns {string} Current admin privilege level
   */
  getAdminPrivilege: () => get().adminPrivilege,
  /**
   * Get modal visible state
   * @returns {boolean} Whether login modal is visible
   */
  getModalVisible: () => get().modalVisible,
  /**
   * Get user has edit role (placeholder)
   * @returns {boolean} Whether user has edit role
   */
  getUserHasEditRole: () => {},
  /**
   * Get user has admin role
   * @returns {boolean} Whether user has admin role
   */
  getUserHasAdminRole: () => {
    let user = get().currentUserObj;
    if (!user) return;
  },

  // local app user
  /**
   * Set current user object
   * @param {Object} currentUserObj - User object to set
   */
  setCurrentUserObj: (currentUserObj) => {
    set({ currentUserObj });
  },

  /**
   * Create new punch clock object and log user in
   * @param {string} userID - User ID
   * @param {number} millis - Timestamp in milliseconds
   * @param {string} option - Punch option ("in" or "out")
   */
  setCreateUserClockObj: (userID, millis, option) =>
    set(() => {
      let punchObj = { ...TIME_PUNCH_PROTO };
      punchObj.id = generateUPCBarcode();
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

  /**
   * Set single punch object in punch array
   * @param {Object} punchObj - Punch object to add/modify/remove
   * @param {string} option - Operation type ("add", "change", or "remove")
   * @param {boolean} [sendToDB=false] - Whether to send to database
   */
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
  /**
   * Set punch clock array
   * @param {Array} punchClockArr - Array of punch clock entries
   */
  setPunchClockArr: (punchClockArr) => set({ punchClockArr }),
  /**
   * Set webcam detected state
   * @param {boolean} webcamDetected - Whether webcam is detected
   */
  setWebcamDetected: (webcamDetected) => set(() => ({ webcamDetected })),
  /**
   * Set background recognition state
   * @param {boolean} runBackgroundRecognition - Whether to run background recognition
   */
  setRunBackgroundRecognition: (runBackgroundRecognition) =>
    set(() => ({ runBackgroundRecognition })),
  /**
   * Set modal visible state
   * @param {boolean} modalVisible - Whether login modal is visible
   */
  setModalVisible: (modalVisible) => set((state) => ({ modalVisible })),
  /**
   * Set login timeout
   * @param {number} loginTimeout - Login timeout in seconds
   */
  setLoginTimeout: (loginTimeout) => set((state) => ({ loginTimeout })),

  /**
   * Set last action timestamp to current time
   */
  setLastActionMillis: () => set({ lastActionMillis: new Date().getTime() }),
  /**
   * Set show login screen state
   * @param {boolean} showLoginScreen - Whether to show login screen
   */
  setShowLoginScreen: (showLoginScreen) => {
    set((state) => ({ showLoginScreen }));
  },

  /**
   * Execute function with privilege check
   * @param {Function} postLoginFunctionCallback - Function to execute after login
   * @param {string} priviledgeLevel - Required privilege level
   */
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
  /**
   * Run post login function callback
   */
  runPostLoginFunction: () => get().postLoginFunctionCallback(),
}));

/**
 * Customer Preview Store - Manages customer preview array state
 * @typedef {Object} CustomerPreviewStore
 * @property {Array} previewArr - Array of preview items
 * @property {Function} getCustPreviewArr - Get preview array
 * @property {Function} modItem - Modify item in preview array
 */
export const useCustomerPreviewStore = create((set, get) => ({
  previewArr: [],
  /**
   * Get customer preview array
   * @returns {Array} Array of preview items
   */
  getCustPreviewArr: () => get().previewArr,
  /**
   * Modify item in preview array
   * @param {Object} item - Item to modify
   * @param {string} option - Operation type ("change", "add", or "remove")
   */
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

/**
 * Current Customer Store - Manages current customer object and database operations
 * @typedef {Object} CurrentCustomerStore
 * @property {Object} customerObj - Current customer object
 * @property {Function} getCustomerObj - Get current customer object
 * @property {Function} setCustomerField - Set specific customer field
 * @property {Function} setCustomerObj - Set entire customer object
 */
/// database also
export const useCurrentCustomerStore = create((set, get) => ({
  customerObj: { ...CUSTOMER_PROTO },
  /**
   * Get current customer object
   * @returns {Object} Current customer object
   */
  getCustomerObj: () => get().customerObj,

  /**
   * Set specific customer field
   * @param {string} fieldName - Field name to set
   * @param {*} value - Value to set
   */
  setCustomerField: (fieldName, value) => {
    let customerObj = cloneDeep(get().customerObj);
    if (fieldName && value) customerObj[fieldName] = value;
    set({ customerObj });
    dbSetCustomerField(customerObj.id, { [fieldName]: value });
  },
  /**
   * Set entire customer object
   * @param {Object} obj - Customer object to set
   * @param {boolean} [sendToDB=false] - Whether to send to database
   */
  setCustomerObj: (obj, sendToDB = false) => {
    set({ customerObj: obj });

    if (sendToDB) dbSetCustomerObj(obj);
  },
}));

/**
 * Inventory Store - Manages inventory items and database operations
 * @typedef {Object} InventoryStore
 * @property {Array} inventoryArr - Array of inventory items
 * @property {Function} getInventoryArr - Get inventory array
 * @property {Function} getInventoryItem - Get specific inventory item by ID
 * @property {Function} removeItem - Remove inventory item
 * @property {Function} setItem - Set/update inventory item
 */
export const useInventoryStore = create((set, get) => ({
  inventoryArr: [],
  /**
   * Get inventory array
   * @returns {Array} Array of inventory items
   */
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
  /**
   * Get specific inventory item by ID
   * @param {string} itemID - Item ID to find
   * @returns {Object|undefined} Found inventory item or undefined
   */
  getInventoryItem: (itemID) => {
    return get().inventoryArr.find((o) => o.id === itemID);
  },
  /**
   * Remove inventory item
   * @param {Object} item - Item to remove
   * @param {boolean} [sendToDB=true] - Whether to send to database
   * @param {boolean} [batch=true] - Whether to batch database operation
   */
  removeItem: (item, sendToDB = true, batch = true) => {
    let inventoryArr = cloneDeep(get().inventoryArr);
    let invItemIdx = inventoryArr.findIndex((obj) => obj.id === item.id);
    inventoryArr = inventoryArr.filter((o) => o.id === item.id);
    set({ inventoryArr });

    if (sendToDB) dbSetInventoryItem(item, batch, true);
  },
  /**
   * Set/update inventory item
   * @param {Object} item - Item to set/update
   * @param {boolean} [sendToDB=true] - Whether to send to database
   * @param {boolean} [batch=true] - Whether to batch database operation
   */
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

/**
 * Customer Messages Store - Manages customer messages (incoming and outgoing)
 * @typedef {Object} CustMessagesStore
 * @property {Array} incomingMessagesArr - Array of incoming messages
 * @property {Array} outgoingMessagesArr - Array of outgoing messages
 * @property {Function} getIncomingMessagesArr - Get incoming messages array
 * @property {Function} getOutgoingMessagesArr - Get outgoing messages array
 * @property {Function} setIncomingMessage - Add incoming message
 * @property {Function} setOutgoingMessage - Add outgoing message
 */
export const useCustMessagesStore = create((set, get) => ({
  incomingMessagesArr: [],
  outgoingMessagesArr: [],
  /**
   * Get incoming messages array
   * @returns {Array} Array of incoming messages
   */
  getIncomingMessagesArr: () => get().incomingMessagesArr,
  /**
   * Get outgoing messages array
   * @returns {Array} Array of outgoing messages
   */
  getOutgoingMessagesArr: () => get().outgoingMessagesArr,
  /**
   * Add incoming message
   * @param {Object} obj - Message object to add
   */
  setIncomingMessage: (obj) => {
    let messages = get().incomingMessagesArr;
    if (checkArr(messages, obj)) return;
    set((state) => ({
      incomingMessagesArr: [...state.incomingMessagesArr, obj],
    }));
  },
  /**
   * Add outgoing message
   * @param {Object} obj - Message object to add
   */
  setOutgoingMessage: (obj) => {
    let messages = get().outgoingMessagesArr;
    if (checkArr(messages, obj)) return;
    // log("out", obj);
    set((state) => ({
      outgoingMessagesArr: [...state.outgoingMessagesArr, obj],
    }));
  },
}));

/**
 * Open Workorders Store - Manages workorders and open workorder state
 * @typedef {Object} OpenWorkordersStore
 * @property {Array} workorderArr - Array of workorders
 * @property {Object|null} openWorkorderObj - Currently open workorder object
 * @property {Function} getOpenWorkorderObj - Get open workorder object
 * @property {Function} getWorkorderArr - Get workorder array
 * @property {Function} setInitialOpenWorkorderObj - Set initial open workorder
 * @property {Function} setWorkorder - Set/update workorder
 * @property {Function} removeWorkorder - Remove workorder
 * @property {Function} setEntireArr - Set entire workorder array
 */
export const useOpenWorkordersStore = create((set, get) => ({
  workorderArr: [],
  openWorkorderObj: null,

  /**
   * Get open workorder object
   * @returns {Object|null} Currently open workorder object
   */
  getOpenWorkorderObj: () => get().openWorkorderObj,
  /**
   * Get workorder array
   * @returns {Array} Array of workorders
   */
  getWorkorderArr: () => get().workorderArr,

  // setters
  /**
   * Set initial open workorder object
   * @param {Object} openWorkorderObj - Workorder object to set as open
   */
  setInitialOpenWorkorderObj: (openWorkorderObj) => {
    // log(openWorkorderObj);
    set({ openWorkorderObj });
  },

  /**
   * Set/update workorder
   * @param {Object} wo - Workorder object to set/update
   * @param {boolean} [saveToDB=true] - Whether to save to database
   * @param {boolean} [batch=true] - Whether to batch database operation
   */
  setWorkorder: (wo, saveToDB = true, batch = true) => {
    if (wo.isStandaloneSale) {
      set({ openWorkorderObj: wo });
      return;
    }

    // dev*************************************************
    if (wo.id === "812140743019") {
      // clog("setting", wo);
      set({ openWorkorderObj: wo });
    }

    // ****************************************************

    let workorderArr = cloneDeep(get().workorderArr);
    let foundWOIdx = workorderArr.findIndex((o) => o.id === wo.id) >= 0;
    if (foundWOIdx) {
      workorderArr[foundWOIdx] = wo;
    } else {
      workorderArr.push(wo);
    }
    set({ workorderArr });

    // not set it as open workorder if it is such
    if (get().openWorkorderObj?.id === wo.id) {
      set({ openWorkorderObj: wo });
    }

    if (saveToDB) {
      // log("dbb");
      // clog(wo);
      dbSetWorkorder(wo, batch, false);
    } // need db fun
  },

  /**
   * Remove workorder
   * @param {Object} wo - Workorder object to remove
   * @param {boolean} [saveToDB=true] - Whether to save to database
   * @param {boolean} [batch=true] - Whether to batch database operation
   */
  removeWorkorder: (wo, saveToDB = true, batch = true) => {
    let workorderArr = cloneDeep(get().workorderArr);
    workorderArr = workorderArr.filter((o) => o.id != wo.id);
    set({ workorderArr });

    if (get().openWorkorderObj?.id === wo.id) set({ openWorkorderObj: null });

    if (saveToDB) {
      dbSetWorkorder(wo, batch, true);
    }
  },

  /**
   * Set entire workorder array
   * @param {Array} arr - Array of workorders to set
   */
  setEntireArr: (arr) => set((state) => ({ workorderArr: arr })),

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

/**
 * Workorder Preview Store - Manages workorder preview state
 * @typedef {Object} WorkorderPreviewStore
 * @property {Object|null} previewObj - Current preview object
 * @property {Function} getPreviewObj - Get preview object
 * @property {Function} setPreviewObj - Set preview object
 */
export const useWorkorderPreviewStore = create((set, get) => ({
  previewObj: null,
  /**
   * Get preview object
   * @returns {Object|null} Current preview object
   */
  getPreviewObj: () => get().previewObj,
  /**
   * Set preview object
   * @param {Object} obj - Preview object to set
   */
  setPreviewObj: (obj) => set((state) => ({ previewObj: obj })),
}));

/**
 * Settings Store - Manages application settings and database operations
 * @typedef {Object} SettingsStore
 * @property {Object|null} settingsObj - Current settings object
 * @property {Function} getSettingsObj - Get settings object
 * @property {Function} setSettingsObj - Set entire settings object
 * @property {Function} setField - Set specific settings field
 */
export const useSettingsStore = create((set, get) => ({
  settingsObj: null,

  /**
   * Get settings object
   * @returns {Object|null} Current settings object
   */
  getSettingsObj: () => get().settingsObj,

  /**
   * Set entire settings object
   * @param {Object} settingsObj - Settings object to set
   * @param {boolean} [batch=true] - Whether to batch database operation
   * @param {boolean} [sendToDB=true] - Whether to send to database
   */
  setSettingsObj: (settingsObj, batch = true, sendToDB = true) => {
    // clog(settingsObj);
    set({ settingsObj });
    if (sendToDB) {
      dbSetSettings(settingsObj, batch);
    }
  },

  /**
   * Set specific settings field
   * @param {string} fieldName - Field name to set
   * @param {*} fieldVal - Field value to set
   * @param {boolean} [sendToDB=true] - Whether to send to database
   * @param {boolean} [batch=true] - Whether to batch database operation
   */
  setField: (fieldName, fieldVal, sendToDB = true, batch = true) => {
    let settingsObj = get().settingsObj || {};
    settingsObj = cloneDeep(settingsObj);
    settingsObj[fieldName] = fieldVal;
    // log(fieldName, fieldVal);
    set({ settingsObj });
    if (sendToDB) dbSetSettings(settingsObj, batch);
  },
}));

/**
 * Listeners Store - Manages database subscription listeners
 * @typedef {Object} ListenersStore
 * @property {string} inventoryChangeSub - Inventory change subscription
 * @property {string} inventoryAddSub - Inventory add subscription
 * @property {string} inventoryRemoveSub - Inventory remove subscription
 * @property {string} workorderChangeSub - Workorder change subscription
 * @property {string} workorderAddSub - Workorder add subscription
 * @property {string} workorderRemoveSub - Workorder remove subscription
 * @property {string} incomingMessagesSub - Incoming messages subscription
 * @property {string} outgoingMessagesSub - Outgoing messages subscription
 * @property {string} custPreviewChangeSub - Customer preview change subscription
 * @property {string} custPreviewAddSub - Customer preview add subscription
 * @property {string} custPreviewRemoveSub - Customer preview remove subscription
 * @property {string} customerObjSub - Customer object subscription
 * @property {string} settingsSub - Settings subscription
 */
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
/**
 * Change an item in an array by ID
 * @param {Array} arr - Array to modify
 * @param {Object} item - Item to change (must have id property)
 * @returns {Array} New array with item changed
 */
function changeItem(arr, item) {
  return arr.map((o) => (o.id === item.id ? item : o));
}

/**
 * Add an item to an array if it doesn't already exist
 * @param {Array} arr - Array to add to
 * @param {Object} item - Item to add (must have id property)
 * @returns {Array} New array with item added (or original array if item exists)
 */
function addItem(arr, item) {
  let foundItem = arr.find((o) => o.id === item.id);
  if (foundItem) return arr;
  return [...arr, item];

  // return arr.find((o) => o.id === item.id);
}

/**
 * Remove an item from an array by ID
 * @param {Array} arr - Array to remove from
 * @param {Object} item - Item to remove (must have id property)
 * @returns {Array} New array with item removed
 */
function removeItem(arr, item) {
  return arr.filter((o) => o.id !== item.id);
}

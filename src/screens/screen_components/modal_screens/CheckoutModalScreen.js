/* eslint-disable */
import { FlatList, View, Text, TextInput, ScrollView } from "react-native-web";
import {
  PAYMENT_OBJECT_PROTO,
  REFUND_PROTO,
  SALE_PROTO,
  TAB_NAMES,
  WORKORDER_ITEM_PROTO,
  ALERT_SCREEN_PROTO,
  WORKORDER_PROTO,
} from "../../../data";
import {
  useAlertScreenStore,
  useCheckoutStore,
  useCurrentCustomerStore,
  useInventoryStore,
  useOpenWorkordersStore,
  useSettingsStore,
  useStripePaymentStore,
  useTabNamesStore,
} from "../../../stores";
import * as XLSX from "xlsx";

import {
  BicycleSpinner,
  Button,
  CashSaleModalComponent,
  CheckBox_,
  StripeCreditCardModalComponent,
  FileInput,
  LoadingIndicator,
  PaymentComponent,
  ScreenModal,
  SHADOW_RADIUS_PROTO,
  Button_,
  DropdownMenu,
  SliderButton_,
  GradientView,
  AlertBox_,
} from "../../../components";
import { cloneDeep, initial } from "lodash";
import {
  formatPhoneWithDashes,
  arrHasItem,
  calculateRunningTotals,
  clog,
  formatDecimal,
  formatCurrencyDisp,
  fuzzySearch,
  generateRandomID,
  generateUPCBarcode,
  getRgbFromNamedColor,
  lightenRGBByPercent,
  log,
  gray,
  removeArrItem,
  removeUnusedFields,
  replaceOrAddToArr,
  roundToTwoDecimals,
  usdTypeMask,
  dollarsToCents,
  addOrRemoveFromArr,
  findInMultipleArrs,
  resetObject,
  extractStripeErrorMessage,
  startTimer,
} from "../../../utils";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { C, COLOR_GRADIENTS, Colors, Fonts, ICONS } from "../../../styles";
import {
  sendFCMMessage,
  SET_FIRESTORE_FIELD,
  setOpenWorkorder,
} from "../../../db";
import { dbSetSalesObj } from "../../../db_call_wrapper";
import { TouchableOpacity } from "react-native";
import {
  STRIPE_GET_AVAIALABLE_STRIPE_READERS_URL,
  STRIPE_INITIATE_PAYMENT_INTENT_URL,
} from "../../../private_user_constants";
import {
  FIRESTORE_COLLECTION_NAMES,
  MILLIS_IN_MINUTE,
} from "../../../constants";
import { isArray } from "lodash";
import { StripeCreditCardComponent } from "./CardSaleComponent";
import { CashSaleComponent } from "./CashSaleComponent";
import { MiddleItemComponent } from "./MiddleItemComponent";

export function CheckoutModalScreen({}) {
  // store setters ////////////////////////////////////////////////
  const _zSetIsCheckingOut = useCheckoutStore(
    (state) => state.setIsCheckingOut
  );
  const _zSetReceiptScan = useCheckoutStore((state) => state.setReceiptScan);

  const _zSetWorkorder = useOpenWorkordersStore((state) => state.setWorkorder);

  const _zSetCustomerField = useCurrentCustomerStore(
    (state) => state.setCustomerField
  );
  const _zSetReceiptScanOnly = useCheckoutStore((state) => state.setStringOnly);
  // store getters /////////////////////////////////////////////////////////
  const zReceiptScanMessage = useCheckoutStore((state) => state.getMessage());
  const zReceiptLoading = useCheckoutStore((state) => state.getLoading());
  const zReceiptScan = useCheckoutStore((state) => state.getReceiptScan());

  const zOpenWorkorder = useOpenWorkordersStore((state) =>
    state.getOpenWorkorder()
  );
  const zIsCheckingOut = useCheckoutStore((state) => state.getIsCheckingOut());
  const zCustomer = useCurrentCustomerStore((state) => state.getCustomer());
  const zOpenWorkorders = useOpenWorkordersStore((state) =>
    state.getWorkorders()
  );
  const zInventory = useInventoryStore((state) => state.getInventoryArr());
  const zGetInventoryItem = useInventoryStore(
    (state) => state.getInventoryItem
  );
  const zSettings = useSettingsStore((state) => state.getSettings());
  const zSale = useCheckoutStore((state) => state.saleObj);

  //////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////

  const [sRefundScan, _setRefundScan] = useState();
  const [sIsRefund, _setIsRefund] = useState(false);
  const [sRefundPaymentOverride, _setRefundPaymentOverride] = useState(false);
  // const [sRefundScanMessage, _setRefundScanMessage] = useState("");
  const [sRefund, _setRefund] = useState({
    refundedLines: [],
    requestedRefundLines: [],
    cashRefundRequested: 0,
    cardRefundRequested: 0,
    cardRefundPayment: null,
    totalRefundRequested: 0,
    totalCashRefundAllowed: 0,
    totalCardRefundAllowed: 0,
    cashAmountRefunded: 0,
    cardAmountRefunded: 0,
    cardTransactions: [],
    cashTransactions: [],
    sale: {},
    selectedCardPayment: null,
  });
  const [sAmountRefunded, _setAmountRefunded] = useState(0);
  const [sTotalAmount, _setTotalAmount] = useState(0);
  const [sCardRefundFee, _setCardRefundFee] = useState(0);
  const [sIsDeposit, _setIsDeposit] = useState(false);
  const [sApplyDeposit, _setApplyDeposit] = useState(false);

  const [sCombinedWorkorders, _setCombinedWorkorders] = useState([]);
  const [sAmountLeftToPay, _setAmountLeftToPay] = useState();
  const [sSale, _setSale] = useState();
  const [sSearchString, _setSearchString] = useState("");
  const [sInventorySearchRes, _setInventorySearchRes] = useState([]);
  const [sFocusedItem, _setFocusedItem] = useState("");
  const [sCashSaleActive, _setCashSaleActive] = useState(true);
  const [sCardSaleActive, _setCardSaleActive] = useState(true);
  const [sShouldChargeCardRefundFee, _setShouldChargeCardRefundFee] =
    useState(true);
  const [sCashChangeNeeded, _setCashChangeNeeded] = useState(null);
  const [sStripeCardReaders, _setStripeCardReaders] = useState([]);
  const [sStripeCardReaderErrorMessage, _setStripeCardReaderErrorMessage] =
    useState("");
  const [sStripeCardReaderSuccessMessage, _setStripeCardReaderSuccessMessage] =
    useState("");
  const [sIsCheckingForReaders, _setIsCheckingForReaders] = useState(false);

  // Use refs to track timer state to avoid closure issues
  const readerCheckIntervalRef = useRef(null);
  const readerCheckStartTimeRef = useRef(null);

  /**
   * Determines if a Stripe Terminal reader is truly ready for payment processing
   * @param {Object} reader - Stripe Terminal reader object
   * @returns {Object} - { isReady: boolean, reason: string, details: Object }
   */
  const isReaderReadyForPayment = (reader) => {
    if (!reader) {
      return { isReady: false, reason: "Reader not found", details: {} };
    }

    // Check basic connectivity
    if (reader.status !== "online") {
      return {
        isReady: false,
        reason: `Reader is ${reader.status}`,
        details: { status: reader.status },
      };
    }

    // Check if reader is busy with an action
    if (reader.action && reader.action.type) {
      return {
        isReady: false,
        reason: `Reader is busy (${reader.action.type})`,
        details: {
          actionType: reader.action.type,
          actionStatus: reader.action.status,
          isProcessingPayment: reader.action.type === "process_payment_intent",
        },
      };
    }

    // Check if reader has been seen recently (within last 5 minutes)
    const now = Date.now();
    const lastSeen = reader.last_seen_at;
    const fiveMinutesAgo = now - 5 * 60 * 1000;

    if (lastSeen && lastSeen < fiveMinutesAgo) {
      return {
        isReady: false,
        reason: "Reader hasn't been seen recently",
        details: {
          lastSeen: new Date(lastSeen).toISOString(),
          minutesAgo: Math.round((now - lastSeen) / (1000 * 60)),
        },
      };
    }

    // Check if reader has required properties
    if (!reader.device_sw_version) {
      return {
        isReady: false,
        reason: "Reader software version unknown",
        details: { device_sw_version: reader.device_sw_version },
      };
    }

    // Reader appears ready
    return {
      isReady: true,
      reason: "Reader is ready for payments",
      details: {
        status: reader.status,
        lastSeen: lastSeen ? new Date(lastSeen).toISOString() : "unknown",
        deviceType: reader.device_type,
        softwareVersion: reader.device_sw_version,
        ipAddress: reader.ip_address,
      },
    };
  };
  // watch the combined workorders array and adjust accordingly

  // 730921185148
  let refundScan = "670957054494"; // test

  // all startup stuff here
  useEffect(() => {
    // insert open workorder into combined workorders array
    if (sIsRefund) return;
    let combinedWorkorders = [];
    if (
      zOpenWorkorder &&
      !arrHasItem(sCombinedWorkorders, zOpenWorkorder) &&
      !sIsRefund
    ) {
      combinedWorkorders = replaceOrAddToArr(
        sCombinedWorkorders,
        zOpenWorkorder
      );

      // look for incoming sale object from scan
      if (zSale && !sSale) {
        _setSale(cloneDeep(zSale));
      } else if (!sSale) {
        // create new sale object to work with
        let sale = cloneDeep(SALE_PROTO);
        sale.id = generateUPCBarcode(); //////// dev
        sale.salesTaxPercent = zSettings.salesTax;
        sale.millis = new Date().getTime();
        setRunningSaleTotals(sale, combinedWorkorders);
        // setRefund(zOpenWorkorder, sale);
      }
      _setCombinedWorkorders(combinedWorkorders);
    }

    // testing /////////////////////////
    _zSetReceiptScanOnly(refundScan);
    // if (sCombinedWorkorders.length > 0) return;
    // handleRefundScan(refundScan);
  }, [zOpenWorkorder, sCombinedWorkorders, zSettings, sSale, sIsRefund]);

  // run the totals on combined workorders change
  useEffect(() => {
    if (sSale && sCombinedWorkorders && !sIsRefund)
      setRunningSaleTotals(sSale, sCombinedWorkorders);
    // log("running");
  }, [sCombinedWorkorders, sIsRefund]);

  useEffect(() => {
    fetchStripeReaders();

    // Cleanup timer on unmount
    return () => {
      if (readerCheckIntervalRef.current) {
        clearInterval(readerCheckIntervalRef.current);
        readerCheckIntervalRef.current = null;
        _setIsCheckingForReaders(false);
        readerCheckStartTimeRef.current = null;
      }
    };
  }, []);

  /////////////////// CARD READERS ////////////////////////////////////
  async function fetchStripeReaders() {
    let message = "";
    let error = false;
    let hasOfflineReader = false;

    try {
      const res = await fetch(STRIPE_GET_AVAIALABLE_STRIPE_READERS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      let data, readerArr;
      try {
        data = await res.json();
        readerArr = data.data;
      } catch (jsonErr) {
        log("[fetchStripeReaders] Failed to parse JSON:", jsonErr);
        data = null;
        return;
      }

      if (!res.ok) {
        message = extractStripeErrorMessage(data, res);
        error = true;
        log("[fetchStripeReaders] HTTP error:", message);
      }

      if (readerArr?.length > 0) {
        log("[fetchStripeReaders] Readers retrieved successfully:", readerArr);

        // Filter out offline readers for display
        const onlineReaders = readerArr.filter((o) => o.status !== "offline");
        _setStripeCardReaders(onlineReaders);

        // Check if selected reader exists and its status
        const selectedReader = readerArr.find(
          (o) => o.id === zSettings?.selectedCardReaderObj?.id
        );

        // Check if we have a selected reader configured
        if (zSettings?.selectedCardReaderObj?.id) {
          if (selectedReader) {
            // Use comprehensive readiness check
            const readinessCheck = isReaderReadyForPayment(selectedReader);
            log("[fetchStripeReaders] Reader readiness check:", readinessCheck);

            if (readinessCheck.isReady) {
              // Reader is truly ready, clear any existing timer
              if (readerCheckIntervalRef.current) {
                log("Reader is ready for payments, clearing timer");
                clearInterval(readerCheckIntervalRef.current);
                readerCheckIntervalRef.current = null;
                _setIsCheckingForReaders(false);
                readerCheckStartTimeRef.current = null;
              }
              message = "Payment terminal ready";
              error = false;
            } else {
              // Reader is not ready, show specific reason and start timer
              hasOfflineReader = true;
              error = true;
              message = `Selected card reader is not ready!\n${readinessCheck.reason}`;

              // Start timer to check for reader becoming ready
              if (!readerCheckIntervalRef.current) {
                log(
                  `Starting timer to check for reader becoming ready: ${readinessCheck.reason}`
                );
                _setIsCheckingForReaders(true);
                readerCheckStartTimeRef.current = Date.now();

                // Use setInterval for continuous polling
                readerCheckIntervalRef.current = setInterval(() => {
                  // Check if we've been checking for too long (10 minutes)
                  const now = Date.now();
                  const timeSinceStart = now - readerCheckStartTimeRef.current;
                  const maxCheckTime = MILLIS_IN_MINUTE * 10;

                  if (timeSinceStart > maxCheckTime) {
                    log("Reader check timeout reached, stopping timer");
                    clearInterval(readerCheckIntervalRef.current);
                    readerCheckIntervalRef.current = null;
                    _setIsCheckingForReaders(false);
                    readerCheckStartTimeRef.current = null;
                    return;
                  }

                  log("Timer tick: checking if reader is ready");
                  fetchStripeReaders();
                }, 2000);
              }
            }
          } else {
            // Selected reader is not found in response (powered down/disconnected)
            hasOfflineReader = true;
            error = true;
            message =
              "Selected card reader is not responding!\nCheck power and network connections";

            // Start timer to check for reader coming back online
            if (!readerCheckIntervalRef.current) {
              log(
                "Starting timer to check for missing reader coming back online"
              );
              _setIsCheckingForReaders(true);
              readerCheckStartTimeRef.current = Date.now();

              // Use setInterval for continuous polling
              readerCheckIntervalRef.current = setInterval(() => {
                // Check if we've been checking for too long (10 minutes)
                const now = Date.now();
                const timeSinceStart = now - readerCheckStartTimeRef.current;
                const maxCheckTime = MILLIS_IN_MINUTE * 10;

                if (timeSinceStart > maxCheckTime) {
                  log("Reader check timeout reached, stopping timer");
                  clearInterval(readerCheckIntervalRef.current);
                  readerCheckIntervalRef.current = null;
                  _setIsCheckingForReaders(false);
                  readerCheckStartTimeRef.current = null;
                  return;
                }

                log("Timer tick: checking if missing reader is back online");
                fetchStripeReaders();
              }, 2000);
            }
          }
        } else if (onlineReaders.length > 0) {
          // No selected reader configured, but we have online readers
          // Check if any of them are actually ready for payments
          const readyReaders = onlineReaders.filter((reader) => {
            const readinessCheck = isReaderReadyForPayment(reader);
            return readinessCheck.isReady;
          });

          if (readyReaders.length > 0) {
            message = "Payment terminal ready";
            error = false;
          } else {
            // All online readers are not ready for payments
            hasOfflineReader = true;
            error = true;
            message =
              "Card readers are online but not ready for payments!\nCheck reader status";
          }
        } else {
          // All readers are offline
          hasOfflineReader = true;
          error = true;
          message =
            "No online card readers found!\nCheck power and network connections";
        }
      } else if (data?.readerArr?.length === 0) {
        error = true;
        message = "No card readers found on this account!\nSee network admin";
      }
    } catch (err) {
      error = true;
      message =
        err instanceof Error
          ? `Client error: ${err.message}`
          : "Client error: An unknown error occurred.";
      log("[fetchStripeReaders] Exception caught:", err);
    }

    // Update UI messages
    if (error) {
      _setStripeCardReaderErrorMessage(message);
      _setStripeCardReaderSuccessMessage("");
    } else {
      _setStripeCardReaderSuccessMessage(message);
      _setStripeCardReaderErrorMessage("");
    }
  }

  // Manual function to stop the reader checking timer
  function stopReaderCheckingTimer() {
    if (readerCheckIntervalRef.current) {
      log("Manually stopping card reader timer");
      clearInterval(readerCheckIntervalRef.current);
      readerCheckIntervalRef.current = null;
      _setIsCheckingForReaders(false);
      readerCheckStartTimeRef.current = null;
    }
  }

  // Manual function to start checking for readers
  function startCheckingForReaders() {
    if (!readerCheckIntervalRef.current) {
      log("Manually starting reader check timer");
      _setIsCheckingForReaders(true);
      readerCheckStartTimeRef.current = Date.now();

      readerCheckIntervalRef.current = setInterval(() => {
        log("Manual timer tick: checking for readers");
        fetchStripeReaders();
      }, 2000);
    }
  }

  ///////////////////  SALES /////////////////////////////////////
  function handlePaymentCapture(payment = PAYMENT_OBJECT_PROTO) {
    // log(paymentObj);
    let sale = cloneDeep(sSale);
    payment.saleID = sale.id;
    payment.isDeposit = sIsDeposit;
    sale.payments.push(payment);
    sale.amountCaptured = sale.amountCaptured + payment.amountCaptured;

    //************************************************************** */
    // need to send print object here //////////////////////////////////

    // saleObj.amountCaptured = saleObj.amountCaptured + paymentObj.amountCaptured;
    let deposits = cloneDeep(zCustomer.depositArr);
    if (!Array.isArray(deposits)) deposits = [];

    if (!payment.isDeposit) {
      let workorderIDs = sCombinedWorkorders.map((o) => o.id);
      sale.workorderIDs = workorderIDs;
      cloneDeep(sCombinedWorkorders).forEach((wo) => {
        wo.sales.push(sale.id);
        _zSetWorkorder(wo); // db
        sale.workorderIDs = replaceOrAddToArr(sale.workorderIDs, wo.id);
        if (sale.amountCaptured === sTotalAmount) {
          wo.paymentComplete = true;
        }
        if (sale.amountCaptured === sale.total) {
          sale.paymentComplete = true;
        }
      });
    } else {
      deposits.push(sale);
    }

    let sales = cloneDeep(zCustomer.sales);
    if (!isArray(sales)) sales = [];
    sales = replaceOrAddToArr(sales, sale.id);

    // remove unused fields
    sale.payments = sale.payments.map((payment) => removeUnusedFields(payment));
    if (payment.cash)
      _setCashChangeNeeded(payment.amountTendered - payment.amountCaptured);

    // printReceipt(payment);
    _setSale(sale);
    dbSetSalesObj(removeUnusedFields(sale)); // db
    _zSetCustomerField("deposits", deposits); // db
    _zSetCustomerField("sales", sales); // db

    if (!sale.payments[sale.payments.length - 1].cash) {
      if (sIsDeposit || sale.paymentComplete) closeCheckoutScreenModal();
    }
  }

  function searchInventory(searchStr) {
    let split = searchStr.split(" ");
    if (searchStr.length < 3) return;
    _setSearchString(searchStr);
    let res = fuzzySearch(split, zInventory);
    // clog(res);
    _setInventorySearchRes(res);
  }

  function handleCombineWorkorderCheck(wo) {
    if (wo.id === zOpenWorkorder?.id) return;
    let newArr = [];
    if (sCombinedWorkorders.find((o) => o.id === wo.id)) {
      newArr = cloneDeep(sCombinedWorkorders).filter((o) => o.id !== wo.id);
    } else {
      newArr = [...cloneDeep(sCombinedWorkorders), wo];
    }

    // newArr = sortWorkorders(newArr);
    _setCombinedWorkorders(newArr);
  }

  function handleInventorySelect(invItem) {
    let wo = cloneDeep(zOpenWorkorder);
    let line = wo.workorderLines.find((o) => o.inventoryItem.id === invItem.id);

    if (!line) {
      line = cloneDeep(WORKORDER_ITEM_PROTO);
      line.id = generateUPCBarcode();
      line.qty = 1;
      line.inventoryItem = invItem;
      wo.workorderLines.push(line);
    } else {
      line.qty = line.qty + 1;
      wo.workorderLines.map((o) => (o.id === line.id ? line : o));
    }

    _setSearchString("");
    _zSetWorkorder(wo);
    let arr = sCombinedWorkorders.map((o) => (o.id === wo.id ? wo : o));
    // clog(arr);
    _setCombinedWorkorders(arr);
  }

  function setRunningSaleTotals(sale, combinedWorkorders) {
    // log("sale", sale);
    // log("combined", combinedWorkorders);
    if (sIsRefund) return;
    sale = cloneDeep(sale);
    let {
      runningQty,
      runningSubtotal,
      runningTotal,
      runningDiscount,
      runningTax,
    } = calculateRunningTotals(
      combinedWorkorders,
      zSettings?.salesTax
      // refundItems,
      // sIsRefund
    );

    sale.subtotal = runningSubtotal;
    sale.discount = runningDiscount;
    sale.total = runningTax + runningTotal;
    sale.tax = runningTax;
    // sale.cardRefundFee = runningTotal * (zSettings.cardRefundFeePercent / 100);
    // log("new sale", sale);
    _setSale(sale);
  }

  ////////////// REFUNDS ///////////////////////////////////////

  function handleRefundScan(refundScan) {
    _zSetReceiptScan(refundScan, (workorders, sale) => {
      splitIncomingRefundWorkorderLines(workorders, sale);
    });
  }

  function splitIncomingRefundWorkorderLines(workordersInSale, sale) {
    _setIsRefund(true);

    // split the incoming refund sale workorders by default so we can select one at a time for refunding. if a refund has already occurred, then these lines will already be split. once a refund occurs the workorder is stored in the DB as 1 qty per item in order to keep track of refunds
    let singleQtyWorkorders = [];
    // log(workordersInSale);
    workordersInSale.forEach((wo) => {
      let newWO = cloneDeep(wo);
      let workorderLines = [];
      wo.workorderLines.forEach((line) => {
        for (let i = 1; i <= line.qty; i++) {
          workorderLines.push({
            ...line,
            // discountSavings: line.discountObj.savings / line.qty || 0,
            // id: line.id + generateRandomID()
          });
        }
      });
      newWO.workorderLines = workorderLines;
      singleQtyWorkorders.push(newWO);
    });

    workordersInSale.forEach((workorderInSale) => {
      workorderInSale.workorderLines.forEach((workorderLine) => {
        // find previously refunded item if applicable
        let refundedItems = sSale.refunds.filter(
          (o) => o.id === workorderLine.id
        );
        if (!refundedItems.length > 0) return;
        refundedItems.forEach((refundedItem) => {
          // let pricePaid = item.discountObj.newPrice
          //         ? item.discountObj.newPrice
          //         : item.inventoryItem.salePrice
          //         ? item.inventoryItem.salePrice
          //     : item.inventoryItem.price
        });
      });
    });
    _setCombinedWorkorders(singleQtyWorkorders);
    setRefundRunningTotals(sale, workordersInSale);
  }

  function setRefundRunningTotals(sale, workordersInSale) {
    // look at previous refunds and calculate what has been done, what we can do still
    let refund = cloneDeep(sRefund);
    refund = resetObject(refund);
    refund.totalCardRefundAllowed = 0;

    // first find any previous refunds made on this sale
    let alreadyRefundedLines = [];
    workordersInSale.forEach((workorder) => {
      // log("comb", combinedWorkorder);
      workorder.workorderLines.forEach((line) => {
        let found = sSale?.refundedWorkorderLines?.find(
          (lineID) => lineID === line.id
        );
        if (found) alreadyRefundedLines.push(found);
      });
    });
    refund.refundedLines = alreadyRefundedLines;

    // split payments - now accumulate the card and cash transactions made on the sale
    sale.paymentComplete = false; // set this flag for other components
    sale.payments.forEach((payment) => {
      let cardRefundAllowedTotal = 0;
      let cashRefundAllowedTotal = 0;
      payment = cloneDeep(payment);

      if (payment.last4) {
        // CREDIT CARD

        // add to transaction arr
        refund.cardTransactions = replaceOrAddToArr(
          refund.cardTransactions,
          payment
        );

        // add the total card refund allowed, subtract what has already been refunded. card payments have individual refunds at the Payment object level, cash payments we keep track of at the Sale object level in the Refund object
        refund.totalCardRefundAllowed =
          refund.totalCardRefundAllowed + payment.amountCaptured;
        -payment.amountRefunded > 0 ? payment.amountRefunded : 0;

        // examine each card payment
      } else {
        // CASH PAYMENT
        refund.cashTransactions = replaceOrAddToArr(
          refund.cashTransactions,
          payment
        );

        // add to the total cash refund allowed
        cashRefundAllowedTotal =
          cardRefundAllowedTotal + payment.amountCaptured;
      }
      refund.totalCashRefundAllowed = cashRefundAllowedTotal;
    });

    // now look throught the previous refunds and see if there are any cash refunds, subtract them from the cash refund allowed
    let cashRefunded = 0;
    sale.refunds?.forEach(
      (refund) =>
        (cashRefunded += refund.cardPaymentID ? 0 : refund.amountRefunded)
    );
    refund.totalCashRefundAllowed =
      refund.totalCashRefundAllowed - cashRefunded;

    // auto-select the first card payment that still has a balance remaining to refund
    // refund.cardTransactions.forEach((cardTransaction) => {
    //   if (refund.selectedCardPayment) return;
    //   // log(Number(cardTransaction.amountRefunded));

    //   let amountAlreadyRefunded = cardTransaction.amountRefunded;
    //   if (!amountAlreadyRefunded) amountAlreadyRefunded = 0;
    //   if (cardTransaction.amountCaptured > amountAlreadyRefunded) {
    //     refund.selectedCardPayment = cardTransaction;
    //   }
    // });

    _setRefund(refund);
    _setSale(sale);
  }

  function handleRefundItemCheck(workorder, workorderLine) {
    let refund = cloneDeep(sRefund);
    workorder = cloneDeep(workorder);
    let salesTaxMultiplier = sSale.salesTaxPercent / 100 + 1;

    // add or remove the incoming checked item from requested refunds arr
    refund.requestedRefundLines = addOrRemoveFromArr(
      refund.requestedRefundLines,
      workorderLine
    );

    // calculate the running total refund requested
    let runningRefund = 0;
    refund.requestedRefundLines.forEach(
      (line) =>
        (runningRefund +=
          (line.inventoryItem.price - line.discountSavings) *
          salesTaxMultiplier)
    );
    refund.totalRefundRequested = runningRefund;

    refund.cashRefundRequested = 0;
    refund.cardRefundRequested = 0;
    if (!refund.totalCardRefundAllowed) {
      refund.cashRefundRequested = runningRefund;
    } else if (!refund.totalCashRefundAllowed) {
      refund.cardRefundRequested = runningRefund;
    } else if (runningRefund > refund.totalCardRefundAllowed) {
      refund.cardRefundRequested = refund.totalCardRefundAllowed;
      refund.cashRefundRequested =
        runningRefund - refund.totalCardRefundAllowed;
    } else {
      refund.cardRefundRequested = runningRefund;
    }

    // now grab a previous credit card payment, make sure there's enough refund left and activate the CC box. This is default activity, they can select a different card payment to use if more are available (if the last item was unchecked, skip this step and remove the CC )

    refund.cardTransactions.forEach((cardPayment) => {
      if (refund.selectedCardPayment || !refund.totalCardRefundAllowed > 0)
        return;

      let amountRefunded = cardPayment.amountRefunded
        ? cardPayment.amountRefunded
        : 0;
      let remainder = cardPayment.amountCaptured - amountRefunded;
      // log("rem", remainder);
      if (remainder > 0) refund.selectedCardPayment = cardPayment;
    });

    if (!refund.requestedRefundLines.length > 0)
      refund.selectedCardPayment = null;

    // log(refund.selectedCardPayment);
    _setRefund(refund);
  }

  function handleRefundPaymentCheck(payment) {
    let refund = cloneDeep(sRefund);

    refund.selectedCardPayment =
      refund.selectedCardPayment?.id === payment.id ? null : payment;
    // log(refund.selectedCardPayment);
    // setRefundRunningTotals(sSale, sCombinedWorkorders, refund);
    _setRefund(refund);
  }

  function handleRefund(incomingRefund = REFUND_PROTO) {
    // first go through the checked items in the refund list and add in the associated refund amount. we will take part of the total refund and apply it to each item individually until the total refund runs out. these items will therefore be marked as paid or partially paid, depending on the difference between refund paid and amount paid

    let amountOfRefundUsed = 0;
    sRefund.workorderLines.forEach((workorderLine) => {
      let pricePaid = workorderLine.discountObj?.newPrice
        ? workorderLine.discountObj?.newPrice
        : workorderLine.inventoryItem.salePrice
        ? workorderLine.inventoryItem.salePrice
        : workorderLine.inventoryItem.price;
      let amountRemainingToRefundOnItem =
        pricePaid - workorderLine.amountRefunded || 0;
      if (amountRemainingToRefundOnItem <= 0) return; // already refunded fully

      let amountAvailableFromThisRefund =
        incomingRefund.amountRefunded - amountOfRefundUsed;
      if (amountAvailableFromThisRefund <= 0) return; // incoming refund used up
      let diff = amountAvailableFromThisRefund - amountRemainingToRefundOnItem;
      let refundAmountToPostToLineItem;
      if (diff < 0) {
        // not enough incoming refund left; this is partial refund territory
        refundAmountToPostToLineItem = amountAvailableFromThisRefund;
      } else if (diff === 0) {
        refundAmountToPostToLineItem = pricePaid;
        // amount of incoming refund left exactly matches the item; full refund of item with nothing left over. the loop will just continue with no action from hereon
      } else {
        refundAmountToPostToLineItem = amountAvailableFromThisRefund;
        // amount of incoming refund exceeds item price. the loop will continue back to this if/then to refund more selected item until it runs out
      }
      // now set the new amount that has been used on this incoming refund
      amountOfRefundUsed += refundAmountToPostToLineItem;
      // set amount refunded on the workorder line
      workorderLine.amountRefunded = refundAmountToPostToLineItem;
      incomingRefund.workorderLines.push({ ...workorderLine });
    });

    log("refunded lines", incomingRefund);
  }

  ////////////// END REFUNDS ///////////////////////////////////////

  function closeCheckoutScreenModal() {
    _zSetIsCheckingOut(false);
  }

  function printReceipt(payment) {}
  return (
    <ScreenModal
      modalVisible={zIsCheckingOut}
      // handleOuterClick={() => log("here")}
      showOuterModal={true}
      outerModalStyle={{
        backgroundColor: "rgba(50,50,50,.65)",
      }}
      buttonVisible={false}
      Component={() => (
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            backgroundColor: lightenRGBByPercent(C.backgroundWhite, 35),
            width: "85%",
            height: sIsRefund ? "95%" : "90%",
            borderRadius: 15,
            ...SHADOW_RADIUS_PROTO,
            shadowColor: C.green,
            padding: 20,
          }}
        >
          <View
            style={{
              width: "29%",
              height: "100%",
              justifyContent: "space-between",
            }}
          >
            <CashSaleComponent
              sIsRefund={sIsRefund}
              handlePaymentCapture={handlePaymentCapture}
              acceptsChecks={zSettings?.acceptChecks}
              sCashSaleActive={sCashSaleActive}
              sRefund={sRefund}
              sIsDeposit={sIsDeposit}
              _setIsDeposit={_setIsDeposit}
              sSale={sSale}
              _setCashChangeNeeded={_setCashChangeNeeded}
              sRefundPaymentOverride={sRefundPaymentOverride}
              handleRefundCapture={handleRefund}
            />
            <StripeCreditCardComponent
              sCardSaleActive={sCardSaleActive}
              handleRefundCapture={handleRefund}
              sIsRefund={sIsRefund}
              handlePaymentCapture={handlePaymentCapture}
              onCancel={() => {}}
              sRefundPaymentOverride={sRefundPaymentOverride}
              zSettings={zSettings}
              sRefund={sRefund}
              sIsDeposit={sIsDeposit}
              _setIsDeposit={_setIsDeposit}
              sSale={sSale}
              sStripeCardReaders={sStripeCardReaders}
              sStripeCardReaderErrorMessage={sStripeCardReaderErrorMessage}
              sStripeCardReaderSuccessMessage={sStripeCardReaderSuccessMessage}
              sIsCheckingForReaders={sIsCheckingForReaders}
              _setStripeCardReaderSuccessMessage={
                _setStripeCardReaderSuccessMessage
              }
              _setStripeCardReaderErrorMessage={
                _setStripeCardReaderErrorMessage
              }
            />
          </View>

          <View
            style={{
              width: "29%",
              height: "100%",
              // padding: 20,
            }}
          >
            <MiddleItemComponent
              zCustomer={zCustomer}
              sIsRefund={sIsRefund}
              handleRefundScan={handleRefundScan}
              sRefundScan={zReceiptScan}
              sRefundScanMessage={zReceiptScanMessage}
              _zSetIsCheckingOut={_zSetIsCheckingOut}
              handleCancelPress={closeCheckoutScreenModal}
              payments={sSale?.payments}
              sAmountLeftToPay={sAmountLeftToPay}
              sFocusedItem={sFocusedItem}
              _setFocusedItem={_setFocusedItem}
              _setIsRefund={_setIsRefund}
              sCardRefundFee={sCardRefundFee}
              sShouldChargeCardRefundFee={sShouldChargeCardRefundFee}
              _setShouldChargeCardRefundFee={_setShouldChargeCardRefundFee}
              sAmountRefunded={sAmountRefunded}
              sRefund={sRefund}
              sApplyDeposit={sApplyDeposit}
              sSale={sSale}
              sCashChangeNeeded={sCashChangeNeeded}
              handleRefundPaymentCheck={handleRefundPaymentCheck}
            />
          </View>

          <View style={{ width: "39%" }}>
            {!sIsRefund ? (
              <View
                style={{
                  flexDirection: "row",
                  width: "100%",
                  paddingHorizontal: 10,
                }}
              >
                <TextInput
                  disabled={sSale?.paymentComplete || sIsRefund}
                  onFocus={() => _setFocusedItem("search")}
                  autoFocus={sFocusedItem === "search"}
                  style={{
                    borderBottomColor: gray(0.3),
                    borderBottomWidth: 1,
                    width: "100%",
                    marginBottom: 10,
                    fontSize: 16,
                    color: C.text,
                    outlineWidth: 0,
                  }}
                  value={sSearchString}
                  onChangeText={(val) => {
                    _setSearchString(val);
                    searchInventory(val);
                  }}
                  placeholder="Scan or search inventory..."
                  placeholderTextColor={gray(0.3)}
                />
              </View>
            ) : null}

            {/** workorders scrollview list element  ////////// */}
            {sSearchString.length > 1 ? (
              <InventoryListComponent
                inventoryObjArr={sInventorySearchRes}
                onSelect={handleInventorySelect}
                quickItemButtons={zSettings.quickItemButtons}
                _setSearchStr={_setSearchString}
                sSale={sSale}
              />
            ) : (
              <WorkorderListComponent
                sCombinedWorkorders={sCombinedWorkorders}
                zOpenWorkorder={zOpenWorkorder}
                zOpenWorkorders={zOpenWorkorders}
                zInventory={zInventory}
                zCustomer={zCustomer}
                zSettings={zSettings}
                _zGetInventoryItem={zGetInventoryItem}
                handleCombineWorkorderCheck={handleCombineWorkorderCheck}
                sAmountLeftToPay={sAmountLeftToPay}
                sIsRefund={sIsRefund}
                // _setRefundItem={_setRefundItems}
                handleRefundItemCheck={handleRefundItemCheck}
                _setCombinedWorkorders={_setCombinedWorkorders}
                sSale={sSale}
                sRefund={sRefund}
              />
            )}
          </View>
        </View>
      )}
    />
  );
}

const InventoryListComponent = ({
  inventoryItems,
  onSelect,
  quickItemButtons,
  _setSearchStr,
  sSale,
  sRefund = {
    cashRefundRequested: 0,
    cardRefundRequested: 0,
    totalCashRefundAllowed: 0,
    totalCardRefundAllowed: 0,
    cardRefunded: 0,
    cashRefunded: 0,
    cardTransactions: [],
    cashTransactions: [],
    refundedLines: [],
  },
}) => {
  return (
    <View
      pointerEvents={sSale?.paymentComplete ? "none" : "auto"}
      style={{ width: "100%" }}
    >
      <Button_
        text={"CLOSE INVENTORY"}
        onPress={() => _setSearchStr("")}
        textStyle={{ fontSize: 13, color: C.textWhite }}
        colorGradientArr={COLOR_GRADIENTS.lightBlue}
        buttonStyle={{ width: 150, marginBottom: 10 }}
      />
      <FlatList
        data={inventoryItems}
        renderItem={(obj) => {
          let idx = obj.index;
          let item = obj.item;
          return (
            <TouchableOpacity
              onPress={() => {
                _setSearchStr("");
                onSelect(item);
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  width: "100%",
                  marginBottom: 3,
                  borderWidth: 1,
                  borderColor: C.buttonLightGreenOutline,
                  borderRadius: 5,
                  padding: 5,
                  borderLeftWidth: 3,
                }}
              >
                <View>
                  <Text style={{ color: C.text }}>{item.formalName}</Text>
                  <Text style={{ color: C.text }}>{item.informalName}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ color: C.text }}>
                    <Text style={{ color: C.text, fontSize: 13 }}>{"$  "}</Text>
                    {item.price}
                  </Text>
                  {
                    !!item.salePrice(
                      <Text style={{ color: C.lightred }}>
                        <Text style={{ color: C.lightred, fontSize: 13 }}>
                          {"SALE PRICE $  "}
                        </Text>
                        {item.salePrice}
                      </Text>
                    )
                  }
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
};

const WorkorderListComponent = ({
  sCombinedWorkorders,
  zOpenWorkorders,
  zOpenWorkorder,
  zInventory,
  zCustomer,
  zSettings,
  _zGetInventoryItem,
  handleCombineWorkorderCheck,
  sIsRefund,
  handleRefundItemCheck,
  sSale,
  sRefund = {
    cashRefundRequested: 0,
    cardRefundRequested: 0,
    totalCashRefundAllowed: 0,
    totalCardRefundAllowed: 0,
    cardRefunded: 0,
    cashRefunded: 0,
    cardTransactions: [],
    cashTransactions: [],
    refundedLines: [],
    requestedRefundLines: [],
  },
}) => {
  if (!zInventory?.length > 0) return;

  function getWorkorderArr() {
    if (sIsRefund) {
      // log("here", sCombinedWorkordersArr);
      return sCombinedWorkorders;
    } else {
      // log("not refund");
      return [
        ...sCombinedWorkorders,
        ...zOpenWorkorders.filter(
          (o) =>
            o.customerID === zOpenWorkorder?.customerID &&
            !arrHasItem(sCombinedWorkorders, o)
        ),
      ];
    }
  }

  // log(sIsRefund.toString());
  function getOpacity() {
    if (sIsRefund) {
      // if ()
    } else {
      if (!sSale?.paymentComplete || sSale.payments.length > 0) return 0.5;
    }
    return 1;
  }

  // log(sRefund);
  return (
    <ScrollView
      style={{
        width: "100%",
        // opacity: getOpacity(),
      }}
    >
      {getWorkorderArr().map((workorder, idx) => {
        return (
          <View
            key={workorder.id}
            style={{
              width: "100%",
              borderColor: C.buttonLightGreenOutline,
              borderWidth: 1,
              borderRadius: 8,
              padding: 10,
              marginBottom: 7,
              backgroundColor: lightenRGBByPercent(C.backgroundWhite, 60),
            }}
          >
            {!sIsRefund && idx !== 0 ? (
              <CheckBox_
                enabled={!sSale?.payments.length > 0}
                // enabled={!sSale?.paymentComplete && !sSale?.payments.length > 0}
                buttonStyle={{
                  alignSelf: "flex-start",
                  marginTop: 5,
                  marginBottom: 5,
                }}
                isChecked={sCombinedWorkorders.find(
                  (o) => o.id === workorder.id
                )}
                textStyle={{ color: C.text }}
                text={"ADD TO SALE"}
                onCheck={() =>
                  zOpenWorkorder?.id === workorder.id ||
                  sIsRefund ||
                  sSale?.paymentComplete
                    ? null
                    : handleCombineWorkorderCheck(workorder)
                }
              />
            ) : null}
            <View
              style={{
                opacity:
                  idx === 0
                    ? 1
                    : sCombinedWorkorders.find((o) => o.id === workorder.id)
                    ? 1
                    : 0.4,
              }}
            >
              <View
                style={{
                  width: "100%",
                  flexDirection: "row",
                  justifyContent: "space-between",
                  padding: 10,
                  borderBottomWidth: 1,
                  borderBottomColor: gray(0.1),
                  marginBottom: 10,
                }}
              >
                <View style={{ flexDirection: "row" }}>
                  <Text
                    style={{
                      color: C.text,
                      fontSize: 16,
                      fontWeight: "500",
                    }}
                  >
                    {workorder.brand || ""}
                  </Text>
                  <Text
                    style={{
                      color: gray(0.6),
                      fontSize: 16,
                      fontWeight: "500",
                      fontStyle: "italic",
                      marginRight: 10,
                    }}
                  >
                    {workorder.model ? "     " + workorder.model : ""}
                  </Text>
                  <Text
                    style={{
                      color: C.text,
                      fontSize: 16,
                      fontWeight: "500",
                    }}
                  >
                    {workorder.description ? "   " + workorder.description : ""}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 100,
                      backgroundColor: workorder.color1?.backgroundColor,
                      color: workorder.color1?.textColor,
                    }}
                  >
                    {workorder.color1?.label || ""}
                  </Text>
                  <Text
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 100,
                      backgroundColor: workorder.color2?.backgroundColor,
                      color: workorder.color2?.textColor,
                    }}
                  >
                    {workorder.color2?.label || ""}
                  </Text>
                </View>
              </View>
              <FlatList
                data={workorder.workorderLines}
                // keyExtractor={(o) => o.id + generateRandomID()}
                renderItem={(obj) => {
                  let index = obj.index;
                  let workorderLine = obj.item;
                  let inventoryItem = _zGetInventoryItem(
                    workorderLine.inventoryItem.id
                  );
                  // log("item", workorderLine.qty);
                  return (
                    <View
                      style={{
                        flexDirection: "row",
                        width: "100%",
                        alignItems: "center",
                        backgroundColor: !arrHasItem(
                          sRefund.requestedRefundLines,
                          workorderLine
                        )
                          ? C.listItemWhite
                          : lightenRGBByPercent(C.blue, 60),
                        paddingVertical: 2,
                        marginBottom: 5,
                        borderColor: C.listItemBorder,
                        borderLeftColor: lightenRGBByPercent(C.green, 60),
                        borderLeftWidth: sIsRefund ? 0 : 2,
                        paddingLeft: 10,
                        borderRadius: 5,
                        paddingRight: 10,
                      }}
                    >
                      <View
                        style={{
                          width: "65%",
                          justifyContent: "flex-start",
                          alignItems: "center",
                          flexDirection: "row",
                          // backgroundColor: "green",
                        }}
                      >
                        {sIsRefund ? (
                          <CheckBox_
                            onCheck={() =>
                              handleRefundItemCheck(workorder, workorderLine)
                            }
                            isChecked={
                              arrHasItem(
                                sRefund.requestedRefundLines,
                                workorderLine
                              )
                                ? true
                                : false
                            }
                            buttonStyle={{
                              marginRight: 15,
                            }}
                          />
                        ) : null}

                        <View>
                          <Text style={{ color: C.lightred, fontSize: 12 }}>
                            {workorderLine.discountObj?.name}
                          </Text>

                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "flex-start",
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 14,
                                color: C.text,
                                fontWeight: "400",
                              }}
                            >
                              {inventoryItem.formalName}
                            </Text>
                          </View>
                          <Text
                            style={{
                              fontSize: 14,
                              color: gray(0.65),
                              fontWeight: "500",
                            }}
                          >
                            {workorderLine.notes}
                            {/* {inventoryItem?.formalName || "Item Not Found"} */}
                          </Text>
                        </View>
                      </View>
                      <View
                        style={{
                          width: "35%",
                          flexDirection: "row",
                          justifyContent: "flex-end",
                          alignItems: "center",
                          height: "100%",
                          paddingRight: 0,
                          // backgroundColor: C.red,
                        }}
                      >
                        {!sIsRefund ? (
                          <TextInput
                            disabled={true}
                            style={{
                              padding: 2,
                              fontSize: 16,
                              fontWeight: "500",
                              textAlign: "center",
                              color: C.text,
                              // backgroundColor: C.red,
                              outlineWidth: 0,
                              width: 30,
                              // width: "100%",
                            }}
                            value={workorderLine.qty}
                          />
                        ) : null}
                        <View
                          style={{
                            alignItems: "flex-end",
                            minWidth: 80,
                            // backgroundColor: "green",
                            // marginRight: 1,
                          }}
                        >
                          <Text
                            style={{
                              paddingHorizontal: 0,
                            }}
                          >
                            {"$ " +
                              formatCurrencyDisp(
                                workorderLine.inventoryItem.price
                              )}
                          </Text>
                          {workorderLine.discountObj?.savings ? (
                            <View style={{ alignItems: "flex-end" }}>
                              <Text
                                style={{
                                  paddingHorizontal: 0,
                                  minWidth: 30,
                                  color: C.lightred,
                                }}
                              >
                                {"$ -" +
                                  formatCurrencyDisp(
                                    workorderLine.discountObj?.savings
                                  )}
                              </Text>
                              <Text
                                style={{
                                  fontWeight: "600",
                                  minWidth: 30,
                                  marginTop: 0,
                                  paddingHorizontal: 0,
                                  color: Colors.darkText,
                                }}
                              >
                                {formatCurrencyDisp(
                                  workorderLine.discountObj?.newPrice
                                )}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                    </View>
                    // </View>
                  );
                }}
              />
              <View
                style={{
                  width: "100%",
                  flexDirection: "row",
                  justifyContent: "space-around",
                  alignItems: "center",
                  borderTopWidth: 1,
                  borderTopColor: gray(0.1),
                  marginTop: 5,
                  paddingTop: 5,
                }}
              >
                <Text style={{ fontSize: 13, color: "gray" }}>
                  {"SUBTOTAL: "}
                  <Text
                    style={{
                      marginRight: 10,
                      color: C.text,
                      fontWeight: "500",
                      fontSize: 14,
                    }}
                  >
                    {"$" +
                      formatCurrencyDisp(
                        calculateRunningTotals(workorder).runningSubtotal
                      )}
                  </Text>
                </Text>
                <View
                  style={{
                    width: 1,
                    height: "100%",
                    backgroundColor: C.buttonLightGreenOutline,
                  }}
                />
                {calculateRunningTotals(workorder).runningDiscount > 0 ? (
                  <View>
                    <Text style={{ fontSize: 13, color: C.lightred }}>
                      {"DISCOUNT: "}
                      <Text
                        style={{
                          marginRight: 10,
                          fontWeight: "500",
                          color: C.lightred,
                          fontSize: 14,
                        }}
                      >
                        {"$" +
                          formatCurrencyDisp(
                            calculateRunningTotals(workorder).runningDiscount
                          )}
                      </Text>
                    </Text>
                    <View
                      style={{
                        width: 1,
                        height: "100%",
                        backgroundColor: C.buttonLightGreenOutline,
                      }}
                    />
                  </View>
                ) : null}
                <Text style={{ fontSize: 13, color: "gray" }}>
                  {"TAX: "}
                  <Text
                    style={{
                      marginRight: 10,
                      fontWeight: "500",
                      color: C.text,
                      fontSize: 14,
                    }}
                  >
                    {"$" +
                      formatCurrencyDisp(
                        (calculateRunningTotals(workorder).runningTotal *
                          zSettings.salesTax) /
                          100
                      )}
                  </Text>
                </Text>
                <View
                  style={{
                    width: 1,
                    height: "100%",
                    backgroundColor: C.buttonLightGreenOutline,
                  }}
                />

                <Text
                  style={{
                    fontSize: 13,
                    borderColor: C.buttonLightGreenOutline,
                    borderRadius: 15,
                    borderWidth: 1,
                    paddingHorizontal: 14,
                    paddingVertical: 3,
                    color: "gray",
                  }}
                >
                  {"TOTAL: "}
                  <Text
                    style={{
                      marginRight: 10,
                      fontWeight: "700",
                      color: C.text,
                      fontSize: 15,
                    }}
                  >
                    {"$" +
                      formatCurrencyDisp(
                        calculateRunningTotals(workorder).runningTotal *
                          (zSettings.salesTax / 100) +
                          calculateRunningTotals(workorder).runningTotal
                      )}
                  </Text>
                </Text>
              </View>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
};

const checkoutScreenStyle = {
  base: {
    alignItems: "center",
    paddingTop: 20,
    width: "100%",
    height: "48%",
    // backgroundColor: C.listItemWhite,
    borderRadius: 15,
    ...SHADOW_RADIUS_PROTO,
  },
  titleText: {
    fontSize: 25,
    color: gray(0.6),
  },
  boxDollarSign: {
    fontSize: 15,
    // marginRight: 5,
  },
  totalText: {
    fontSize: 10,
  },
  boxText: {
    outlineWidth: 0,
    fontSize: 25,
    textAlign: "right",
    // placeholderTextColor: makeGrey,
    // backgroundColor: "green",
    color: C.text,
    width: "90%",
  },
  buttonText: {
    fontSize: 13,
    fontWeight: Fonts.weight.textRegular,
  },
  mainButtonStyle: {},
  boxStyle: {
    marginTop: 5,
    borderColor: C.buttonLightGreenOutline,
    borderRadius: 10,
    borderWidth: 2,
    backgroundColor: C.listItemWhite,
    paddingVertical: 10,
    paddingHorizontal: 10,
    // width: 120,
    alignItems: "space-between",
    justifyContent: "space-between",
    flexDirection: "row",
  },
  totalTextStyle: {
    marginTop: 15,
    color: gray(0.75),
  },
  titleStyle: {
    marginTop: 20,
  },
  buttonRowStyle: {
    marginTop: 20,
  },
  statusText: {
    width: "80%",
    textAlign: "center",
    marginTop: 15,
    color: "green",
    fontSize: 15,
    fontWeight: 600,
  },
  loadingIndicatorStyle: {
    marginTop: 10,
  },
};

/**
 *
 *
 *
 *
 *  cash sale obj
 *
 * sale : {"id":"730921185148","workorderIDs":[],"millis":1757977293182,"payments":[{"amountCaptured":1,"amountTendered":2.8755,"saleID":"730921185148","cash":true,"millis":1757977293182,"id":"nXaw9FsU6kOVgj2s60MR","workorderLinesRefundedIDs":[]}],"subtotal":2.7,"discount":0,"salesTaxPercent":6.5,"total":2.8755,"amountCaptured":1,"isDeposit":false,"amountRefunded":0,"workordersID":["540286345956"]}
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 */

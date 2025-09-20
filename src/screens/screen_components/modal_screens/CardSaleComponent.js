/* eslint-disable */
import { FlatList, View, Text, TextInput, ScrollView } from "react-native-web";
import {
  PAYMENT_OBJECT_PROTO,
  SALE_OBJECT_PROTO,
  TAB_NAMES,
  WORKORDER_ITEM_PROTO,
  WORKORDER_PROTO,
} from "../../../data";
import {
  ALERT_SCREEN_PROTO,
  useAlertScreenStore,
  useCheckoutStore,
  useCurrentCustomerStore,
  useInventoryStore,
  useOpenWorkordersStore,
  useSettingsStore,
  useStripePaymentStore,
  useTabNamesStore,
} from "../../../storesOld";
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
  addDashesToPhone,
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
  startTimer,
  extractStripeErrorMessage,
} from "../../../utils";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { C, COLOR_GRADIENTS, Colors, Fonts, ICONS } from "../../../styles";
import {
  sendFCMMessage,
  SET_FIRESTORE_FIELD,
  setOpenWorkorder,
} from "../../../db";
import {
  dbCancelServerDrivenStripePayment,
  dbGetClosedWorkorderItem,
  dbGetOpenWorkorderItem,
  dbGetSaleItem,
  dbProcessServerDrivenStripePayment,
  dbProcessStripeRefund,
  dbRetrieveAvailableStripeReaders,
  dbSetCustomerField,
  dbSetSalesObj,
  dbSubscribeToStripePaymentProcess,
  createPaymentPollingFallback,
} from "../../../db_call_wrapper";
import { TouchableOpacity } from "react-native";
import {
  STRIPE_GET_AVAIALABLE_STRIPE_READERS_URL,
  STRIPE_INITIATE_PAYMENT_INTENT_URL,
} from "../../../private_user_constants";
import {
  FIRESTORE_COLLECTION_NAMES,
  MILLIS_IN_HOUR,
  MILLIS_IN_MINUTE,
} from "../../../constants";
import { isArray } from "lodash";
import { DevSettings } from "react-native";
export const StripeCreditCardComponent = ({
  sSale,
  sIsDeposit,
  sAmountLeftToPay,
  handlePaymentCapture,
  zSettings,
  sIsRefund,
  refundPaymentIntentID,
  sCardSaleActive,
  _setIsDeposit,
  sRefundPaymentOverride,
  sStripeCardReaders,
  _setStripeCardReaderErrorMessage,
  _setStripeCardReaderSuccessMessage,
  sStripeCardReaderErrorMessage,
  sStripeCardReaderSuccessMessage,
  sIsCheckingForReaders = false,
  sRefund = {
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
  },
}) => {
  const getRefundAmountLeft = () => {
    let amountAlreadyRefunded = sRefund?.selectedCardPayment?.amountRefunded;
    if (!amountAlreadyRefunded) amountAlreadyRefunded = 0;
    let refundAmountLeft =
      sRefund?.selectedCardPayment?.amountCaptured - amountAlreadyRefunded;
    // log("left", refundAmountLeft);
    return refundAmountLeft;
  };

  const _zSetIsCheckingOut = useCheckoutStore(
    (state) => state.setIsCheckingOut
  );

  const _zSetWorkorder = useOpenWorkordersStore((state) => state.setWorkorder);

  const _zSetCustomerField = useCurrentCustomerStore(
    (state) => state.setCustomerField
  );
  // store getters
  const zOpenWorkorder = useOpenWorkordersStore((state) =>
    state.getOpenWorkorderObj()
  );
  const zIsCheckingOut = useCheckoutStore((state) => state.getIsCheckingOut());
  const zCustomer = useCurrentCustomerStore((state) => state.getCustomerObj());
  const zOpenWorkorders = useOpenWorkordersStore((state) =>
    state.getWorkorderArr()
  );
  const zInventory = useInventoryStore((state) => state.getInventoryArr());
  const zGetInventoryItem = useInventoryStore(
    (state) => state.getInventoryItem
  );
  const zSale = useCheckoutStore((state) => state.saleObj);
  const [sRequestedAmount, _setRequestedAmount] = useState(
    sIsRefund ? getRefundAmountLeft() : ""
  );
  const [sRequestedAmountDisp, _setRequestedAmountDisp] = useState(
    sIsRefund ? formatCurrencyDisp(getRefundAmountLeft()) : ""
  );
  const [sProcessButtonEnabled, _setProcessButtonEnabled] = useState(false);
  const [sFocusedItem, _setFocusedItem] = useState("");
  const [sCardReader, _setCardReader] = useState("");
  const [sListeners, _setListeners] = useState([]);
  const [sPaymentIntentID, _setPaymentIntentID] = useState("");
  const [sPollingFallback, _setPollingFallback] = useState(null);
  /////////////////////////////////////////////////////////////////////////

  // check incoming REFUND an populate fields
  useEffect(() => {
    // REFUNDS
    if (sIsRefund) {
      let amountAlreadyRefunded = sRefund?.selectedCardPayment?.amountRefunded;
      if (!amountAlreadyRefunded) amountAlreadyRefunded = 0;
      let refundAmountLeft =
        sRefund?.selectedCardPayment?.amountCaptured - amountAlreadyRefunded;
      if (sRequestedAmount >= 50 && sRequestedAmount <= refundAmountLeft) {
        _setProcessButtonEnabled(true);
        _setStripeCardReaderSuccessMessage("");
        _setStripeCardReaderErrorMessage("");
      }
      if (sRequestedAmount > refundAmountLeft) {
        _setStripeCardReaderErrorMessage(
          "Amount too large for remaining card charge balance"
        );
        _setStripeCardReaderSuccessMessage("");
        _setProcessButtonEnabled(false);
      }
      if (sRequestedAmount < 50) {
        _setStripeCardReaderErrorMessage("");
        _setStripeCardReaderSuccessMessage("");
        _setProcessButtonEnabled(false);
      }
      return;
    }

    // SALES
    if (
      sRequestedAmount > sSale?.total - sSale?.amountCaptured ||
      sRequestedAmount < 50
    ) {
      _setProcessButtonEnabled(false);
    } else {
      _setProcessButtonEnabled(true);
    }
  }, [sRequestedAmount, sIsRefund, sRefund]);

  // find all Stripe card readers on account
  useEffect(() => {
    if (sStripeCardReaders.length > 0 && !sCardReader) {
      let message;
      let error = false;
      let userSelectedReader = sStripeCardReaders.find(
        (o) => o.id === zSettings.selectedCardReaderObj.id
      );
      // log(zSettings.selectedCardReader);
      if (!userSelectedReader || userSelectedReader.status === "offline") {
        error = true;
        message =
          "Your selected reader is offline!\nCheck power and network connections";
        log("Selected card reader offline");
      } else {
        _setCardReader(userSelectedReader);
      }
      if (error && message) {
        _setStripeCardReaderErrorMessage(message);
        _setStripeCardReaderSuccessMessage("");
      }
    }

    return () => {
      try {
        sListeners.forEach((listener) => listener());
      } catch (e) {
        log("error canceling listener", e);
      }

      // Clean up polling fallback
      if (sPollingFallback) {
        sPollingFallback.stop();
        log("Cleaned up polling fallback");
      }
    };
  }, [sStripeCardReaders, zSettings, sCardReader]);

  function handleRequestedAmountTextChange(val) {
    let dollars = usdTypeMask(val).display;
    let cents = dollarsToCents(dollars);
    if (!cents) cents = 0;
    if (dollars === "0.00") dollars = "";
    _setRequestedAmount(cents);
    _setRequestedAmountDisp(dollars);
  }

  async function startRefund(paymentAmount, payment) {
    let message = "";
    let error = false;
    try {
      const res = await dbProcessStripeRefund(
        paymentAmount,
        payment.paymentIntentID
      );

      let data;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      // HTTP/network-level error
      if (!res.ok) {
        message = extractStripeErrorMessage(data, res);
        error = true;
      } else if (data?.success) {
        message = "Refund success!";
      } else {
        // Server responded with success = false
        error = true;
        message = extractStripeErrorMessage(data);
      }
    } catch (err) {
      error = true;
      message =
        err instanceof Error
          ? `Client error: ${err.message}`
          : "Client error: An unknown error occurred.";
    }
    if (error && message) {
      _setStripeCardReaderErrorMessage(message);
      _setStripeCardReaderSuccessMessage("");
    } else if (message) {
      _setStripeCardReaderSuccessMessage(message);
      _setStripeCardReaderErrorMessage("");
    }
  }

  async function startPayment(paymentAmount, readerID) {
    paymentAmount = 50;
    let message = "";
    let error = false;
    try {
      const res = await dbProcessServerDrivenStripePayment(
        paymentAmount,
        readerID,
        sPaymentIntentID
      );

      let readerResult;
      try {
        readerResult = await res.json();
      } catch {
        readerResult = null;
      }

      if (!res.ok) {
        error = true;
        message = extractStripeErrorMessage(readerResult, res);
      } else if (readerResult?.success) {
        // Payment succeeded
        message = "Waiting for customer...";
        _setPaymentIntentID(readerResult.paymentIntentID);

        // Set up realtime database listener
        let listenerArr = cloneDeep(sListeners);
        let listener = dbSubscribeToStripePaymentProcess(
          sCardReader.id,
          readerResult.paymentIntentID,
          handleStripeCardPaymentDBSubscriptionUpdate
        );
        listenerArr.push(listener);
        _setListeners(listenerArr);

        // Set up polling fallback if configured
        if (readerResult.pollingConfig?.enabled) {
          const pollingFallback = createPaymentPollingFallback(
            readerResult.pollingConfig,
            // onUpdate callback
            (updateData) => {
              log("Polling fallback received update:", updateData);
              handleStripeCardPaymentDBSubscriptionUpdate(
                "update",
                updateData,
                readerResult.paymentIntentID
              );
            },
            // onComplete callback
            (completeData) => {
              log("Polling fallback received completion:", completeData);
              handleStripeCardPaymentDBSubscriptionUpdate(
                "complete",
                completeData,
                readerResult.paymentIntentID
              );
            },
            // onError callback
            (errorMessage) => {
              log("Polling fallback error:", errorMessage);
              _setStripeCardReaderErrorMessage(
                `Polling error: ${errorMessage}`
              );
              _setStripeCardReaderSuccessMessage("");
            },
            // onTimeout callback
            (timeoutMessage) => {
              log("Polling fallback timeout:", timeoutMessage);
              _setStripeCardReaderErrorMessage(timeoutMessage);
              _setStripeCardReaderSuccessMessage("");
            }
          );

          _setPollingFallback(pollingFallback);
          pollingFallback.start();
          log("Started polling fallback for payment processing");
        }
      } else {
        // Server returned success: false with Stripe-style error
        error = true;
        message = extractStripeErrorMessage(readerResult);
      }
    } catch (err) {
      error = true;
      message =
        err instanceof Error
          ? `Client error: ${err.message}`
          : "Client error: An unknown error occurred.";
    }
    if (error && message) {
      _setStripeCardReaderErrorMessage(message);
      _setStripeCardReaderSuccessMessage("");
    } else if (message) {
      _setStripeCardReaderSuccessMessage(message);
      _setStripeCardReaderErrorMessage("");
    }
  }

  function handleStripeCardPaymentDBSubscriptionUpdate(
    key,
    val,
    paymentIntentID
  ) {
    let message = "";
    let error = false;

    try {
      // Input validation
      if (!val || typeof val !== "object") {
        log("Invalid payment update data received", val);
        return;
      }

      if (!paymentIntentID || typeof paymentIntentID !== "string") {
        log("Invalid payment intent ID received", paymentIntentID);
        return;
      }

      let failureCode = val?.failure_code;

      // Handle payment failure
      if (
        failureCode &&
        val?.process_payment_intent?.payment_intent === paymentIntentID
      ) {
        log("card failure code", failureCode);
        error = true;
        message = `Failure code: ${val.failure_code}`;
      }
      // Handle successful payment
      else if (
        val.status === "succeeded" &&
        val.payment_intent === paymentIntentID
      ) {
        message = "Payment complete!";
        log("Stripe payment complete!");

        // Stop polling fallback since payment completed
        if (sPollingFallback) {
          sPollingFallback.stop();
          _setPollingFallback(null);
          log("Stopped polling fallback - payment completed");
        }

        try {
          // Validate payment method details structure
          if (
            !val.payment_method_details ||
            !val.payment_method_details.card_present
          ) {
            throw new Error("Invalid payment method details structure");
          }

          let paymentMethodDetails = val.payment_method_details.card_present;
          let payment = cloneDeep(PAYMENT_OBJECT_PROTO);

          // Safely extract payment details with fallbacks
          payment.amountCaptured = val.amount_captured || 0;
          payment.cardIssuer =
            paymentMethodDetails?.receipt?.application_preferred_name ||
            "Unknown";
          payment.cardType =
            paymentMethodDetails?.description || "Unknown Card";
          payment.id = generateUPCBarcode();
          payment.isRefund = sIsRefund;
          payment.millis = new Date().getTime();
          payment.authorizationCode =
            paymentMethodDetails?.receipt?.authorization_code || "";
          payment.paymentIntentID = val.payment_intent;
          payment.chargeID = val.id;
          payment.paymentProcessor = "stripe";
          payment.receiptURL = val.receipt_url || "";
          payment.last4 = paymentMethodDetails?.last4 || "";
          payment.expMonth = paymentMethodDetails?.exp_month || "";
          payment.expYear = paymentMethodDetails?.exp_year || "";
          payment.networkTransactionID =
            paymentMethodDetails?.network_transaction_id || "";
          payment.amountRefunded = val.amount_refunded || 0;

          log("Successful Payment details obj", payment);
          handlePaymentCapture(payment);
        } catch (paymentError) {
          log("Error processing successful payment", paymentError);
          error = true;
          message =
            "Payment succeeded but failed to process details. Please check transaction.";
        }
      }
      // Handle other status updates (e.g., "requires_payment_method", "requires_confirmation")
      else if (val.status && val.payment_intent === paymentIntentID) {
        log("Payment status update", val.status);
        // Don't set error for status updates that aren't success/failure
        message = `Payment status: ${val.status}`;
      }
    } catch (err) {
      error = true;
      message =
        err instanceof Error
          ? `Payment processing error: ${err.message}`
          : "Payment processing error: An unknown error occurred.";
      log("Error in handleStripeCardPaymentDBSubscriptionUpdate", err);
    }

    // Update UI state based on error/success
    if (error && message) {
      _setStripeCardReaderErrorMessage(message);
      _setStripeCardReaderSuccessMessage("");
    } else if (message) {
      _setStripeCardReaderSuccessMessage(message);
      _setStripeCardReaderErrorMessage("");
    }
  }

  async function resetCardReader() {
    _setStripeCardReaderErrorMessage("Card reader reset in progress...");
    _setStripeCardReaderSuccessMessage("");
    _setPaymentIntentID(null);
    sListeners.forEach((listener) => listener());

    // Clean up polling fallback
    if (sPollingFallback) {
      sPollingFallback.stop();
      _setPollingFallback(null);
      log("Stopped polling fallback during reset");
    }

    _setProcessButtonEnabled(true);

    let message = "";
    let error = false;
    try {
      const res = await dbCancelServerDrivenStripePayment(sCardReader.id);

      let data;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      if (!res.ok) {
        error = true;
        message = extractStripeErrorMessage(data, res);
        _setStripeCardReaderErrorMessage(message);
        _setStripeCardReaderSuccessMessage("");
      }

      if (data?.success) {
        message = data.message || "✅ Reader reset complete.";
      } else {
        message = extractStripeErrorMessage(data);
        error = true;
      }
    } catch (err) {
      error = true;
      message =
        err instanceof Error
          ? `Client error: ${err.message}`
          : "Client error: An unknown error occurred.";
    }

    if (error && message) {
      _setStripeCardReaderErrorMessage(message);
      _setStripeCardReaderSuccessMessage("");
    } else if (message) {
      _setStripeCardReaderSuccessMessage(message);
      _setStripeCardReaderErrorMessage("");
    }
  }

  // unnecessary, DB will create it for us
  async function createPaymentIntent(reader) {
    log("creating payment intent");
    try {
      const res = await fetch(STRIPE_INITIATE_PAYMENT_INTENT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(sRequestedAmount),
          currency: "usd",
          readerID: reader?.id || sCardReader.id,
        }),
      });
      const data = await res.json();
      // clog("intent", data);
    } catch (e) {
      log("Error creating payment intent", e);
    }

    // setClientSecret(data.clientSecret);
  }

  const LOW_OPACITY = 0.2;
  function boxEventsEnabled() {
    if (sIsRefund) {
      if (sRefund?.selectedCardPayment?.last4) {
        return true;
      } else {
        return false;
      }
    } else {
      if (sSale?.paymentComplete) return true;
      return false;
    }
  }

  let boxEnabled = boxEventsEnabled();

  return (
    <View
      // pointerEvents={"none"}
      pointerEvents={boxEnabled ? "auto" : "none"}
      style={{
        ...checkoutScreenStyle.base,
        justifyContent: "space-between",
        paddingBottom: 20,
        opacity: boxEnabled ? 1 : LOW_OPACITY,
      }}
    >
      <View
        style={{
          width: "100%",
          alignItems: "flex-start",
          paddingBottom: 10,
          paddingHorizontal: 10,
        }}
      >
        <View
          style={{
            width: "100%",
            justifyContent: "space-between",
            alignItems: "center",
            flexDirection: "row",
          }}
        >
          <View style={{}}>
            <Text style={{ color: gray(0.6), fontSize: 11 }}>Card Readers</Text>
            <DropdownMenu
              enabled={boxEnabled}
              buttonIcon={ICONS.menu2}
              buttonIconSize={15}
              buttonTextStyle={{ fontSize: 13 }}
              buttonStyle={{
                cursor: sProcessButtonEnabled ? "inherit" : "default",
                borderRadius: 5,
                paddingVertical: 2,
                paddingHorizontal: 5,
                borderWidth: 1,
                borderColor: C.buttonLightGreenOutline,
              }}
              itemStyle={{ width: null }}
              dataArr={sStripeCardReaders || []}
              buttonText={sCardReader?.label || sCardReader?.id}
              onSelect={_setCardReader}
            />
          </View>
          <Button_
            text={"Reset Card Reader"}
            enabled={boxEnabled}
            buttonStyle={{
              cursor: boxEnabled ? "inherit" : "none",
              backgroundColor: gray(0.2),
              paddingHorizontal: 5,
              paddingVertical: 2,
              borderRadius: 5,
              borderColor: gray(0.23),
              borderWidth: 1,
            }}
            textStyle={{
              color: C.textMain,
              fontSize: 11,
            }}
            onPress={resetCardReader}
          />
        </View>
      </View>
      <Text
        style={{
          ...checkoutScreenStyle.titleText,
          color: sIsRefund ? C.red : checkoutScreenStyle.titleText.color,
          fontWeight: 500,
        }}
      >
        {sIsRefund ? "CARD REFUND" : "CARD SALE"}
      </Text>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "flex-end",
          alignItems: "center",
          marginTop: 10,
          backgroundColor: C.listItemWhite,
          padding: 10,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: C.buttonLightGreenOutline,
          // backgroundColor: "green",
          // ...checkoutScreenStyle.boxStyle,
          width: "70%",
        }}
      >
        <View
          style={{
            alignItems: "flex-end",
            justifyContent: "space-between",
            // backgroundColor: "green",
            height: "100%",
            paddingRight: 5,
          }}
        >
          <Text
            style={{
              color: sIsRefund ? gray(0.2) : C.textMain,
              marginTop: 10,
            }}
          >
            Balance
          </Text>
          <Text
            style={{
              marginBottom: 15,
              color: sIsRefund ? C.red : C.textMain,
            }}
          >
            {sIsRefund ? "Refund Amount" : "Pay Amount"}
          </Text>
        </View>
        <View
          style={{
            alignItems: "flex-end",
            marginLeft: 10,
            color: C.textMain,
            // width: "60%",
          }}
        >
          <Text
            style={{
              fontSize: 15,
              padding: 5,
              paddingRight: 1,
              color: sIsRefund ? gray(0.2) : C.textMain,
            }}
          >
            {"$ " + formatCurrencyDisp(sSale?.total - sSale?.amountCaptured)}
          </Text>
          <View
            style={{
              marginLeft: 10,
              ...checkoutScreenStyle.boxStyle,
              paddingBottom: 6,
              paddingRight: 7,
            }}
          >
            <Text style={{ ...checkoutScreenStyle.boxDollarSign }}>$</Text>
            <View
              style={{
                height: "100%",
                width: 100,
                alignItems: "flex-end",
                paddingRight: 5,
              }}
            >
              <TextInput
                onFocus={() => {
                  _setFocusedItem("amount");
                  _setRequestedAmountDisp("");
                  _setRequestedAmount(0);
                }}
                autoFocus={sFocusedItem === "amount"}
                disabled={!boxEnabled}
                style={{
                  fontSize: 20,
                  outlineWidth: 0,
                  color: sIsRefund ? C.red : C.textMain,
                  paddingRight: 2,
                  textAlign: "right",
                }}
                placeholder="0.00"
                placeholderTextColor={gray(0.3)}
                value={sRequestedAmountDisp}
                onChangeText={handleRequestedAmountTextChange}
              />
            </View>
          </View>
        </View>
      </View>
      <CheckBox_
        enabled={!sSale?.payments.length > 0}
        buttonStyle={{ marginTop: 10 }}
        textStyle={{ color: gray(0.6), fontWeight: 500 }}
        text={"DEPOSIT TO ACCOUNT"}
        isChecked={sIsDeposit}
        onCheck={() => _setIsDeposit(!sIsDeposit)}
      />
      {!!sRefund?.selectedCardPayment?.cardType ? (
        <View
          style={{
            width: "100%",
            justifyContent: "center",
            marginTop: 10,
            flexDirection: "row",
          }}
        >
          <Text style={{ fontSize: 12, color: gray(0.4), marginHorizontal: 5 }}>
            {sRefund.selectedCardPayment?.cardType}
          </Text>
          <Text style={{ fontSize: 12, color: gray(0.4), marginHorizontal: 5 }}>
            {"***" + sRefund.selectedCardPayment?.last4}
          </Text>
          <Text style={{ fontSize: 12, color: gray(0.4), marginHorizontal: 5 }}>
            {sRefund.selectedCardPayment.expMonth +
              "/" +
              sRefund.selectedCardPayment?.expYear}
          </Text>
        </View>
      ) : null}
      <View
        style={{
          width: "100%",
          alignItems: "center",
        }}
      >
        <Button_
          colorGradientArr={COLOR_GRADIENTS.green}
          textStyle={{ color: C.textWhite, fontSize: 16 }}
          enabled={
            sProcessButtonEnabled && !sSale?.paymentComplete && sCardSaleActive
          }
          onPress={() =>
            sIsRefund
              ? startRefund(sRequestedAmount, sRefund.selectedCardPayment)
              : startPayment(sRequestedAmount, sCardReader.id)
          }
          text={sIsRefund ? "PROCESS REFUND" : "START CARD SALE"}
          buttonStyle={{
            cursor: sProcessButtonEnabled ? "inherit" : "default",
          }}
        />
        <Text
          numberOfLines={2}
          style={{
            ...checkoutScreenStyle.statusText,
            fontSize: 15,
            color: sStripeCardReaderErrorMessage ? C.red : C.green,
            marginTop: 5,
            width: "80%",
          }}
        >
          {sStripeCardReaderErrorMessage || sStripeCardReaderSuccessMessage}
        </Text>
        {sIsCheckingForReaders && (
          <Text
            style={{
              fontSize: 12,
              color: gray(0.6),
              marginTop: 3,
              fontStyle: "italic",
            }}
          >
            🔄 Checking for card readers...
          </Text>
        )}
      </View>
    </View>
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
    color: C.textMain,
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

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
  sRefund = {
    refundedLines: [],
    cashRefundRequested: 0,
    cardRefundRequested: 0,
    totalCashRefundAllowed: 0,
    totalCardRefundAllowed: 0,
    cardTransactionArr: [],
    cashTransactionArr: [],
  },
}) => {
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
  const [sRequestedAmount, _setRequestedAmount] = useState(null);
  const [sRequestedAmountDisp, _setRequestedAmountDisp] = useState(0);
  const [sProcessButtonEnabled, _setProcessButtonEnabled] = useState(false);
  const [sFocusedItem, _setFocusedItem] = useState("");
  const [sCardReader, _setCardReader] = useState("");
  const [sListeners, _setListeners] = useState([]);
  const [sPaymentIntentID, _setPaymentIntentID] = useState("");
  /////////////////////////////////////////////////////////////////////////

  // check incoming REFUND an populate fields
  useEffect(() => {
    // REFUNDS
    if (sIsRefund) {
      let amountAlreadyRefunded = sRefund?.selectedCardPayment?.amountRefunded;
      if (!amountAlreadyRefunded) amountAlreadyRefunded = 0;
      let refundAmountLeft =
        sRefund?.selectedCardPayment?.amountCaptured - amountAlreadyRefunded;
      if (sRequestedAmount == null) {
        log("here");
        _setRequestedAmount(refundAmountLeft);
        _setRequestedAmountDisp(formatCurrencyDisp(refundAmountLeft));
      }
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

  // async function fetchStripeReaders() {
  //   let message = "";
  //   try {
  //     const res = await fetch(STRIPE_GET_AVAIALABLE_STRIPE_READERS_URL, {
  //       method: "POST",
  //       headers: { "Content-Type": "application/json" },
  //     });

  //     // const data = await res.json();
  //     // let readerArr = data.data;
  //     // log("data", data.data);

  //     // if (readerArr.length === 0) {
  //     //   _setStatusMessage(
  //     //     "No card readers found on this account!\nSee network admin"
  //     //   );
  //     //   return;
  //     // } else {
  //     //   _setCardReaders(readerArr);
  //     //   // log(readerArr);
  //     // }

  //     let data, readerArr;
  //     try {
  //       data = await res.json();
  //       readerArr = data.data;
  //       if (data.data) {
  //         log("reader arr", data.data);
  //       }
  //     } catch (jsonErr) {
  //       console.error("[fetchStripeReaders] Failed to parse JSON:", jsonErr);
  //       data = null;
  //     }

  //     if (!res.ok) {
  //       message = extractStripeErrorMessage(data, res);
  //       log("[fetchStripeReaders] HTTP error:", message);
  //       _setStatusMessage(message);
  //     }

  //     if (data?.readerArr?.length > 0) {
  //       log(
  //         "[fetchStripeReaders] Readers retrieved successfully:",
  //         data.readers
  //       );
  //       message = "Card readers found!";
  //       return;
  //     }

  //     message = extractStripeErrorMessage(data);
  //     log(
  //       "[fetchStripeReaders] Server responded with success = false:",
  //       message
  //     );
  //   } catch (err) {
  //     message =
  //       err instanceof Error
  //         ? `Client error: ${err.message}`
  //         : "Client error: An unknown error occurred.";
  //     log("[fetchStripeReaders] Exception caught:", err);
  //   }
  //   _setStatusMessage(message);
  // }

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
        let listenerArr = cloneDeep(sListeners);
        let listener = dbSubscribeToStripePaymentProcess(
          readerResult.paymentIntentID,
          handleStripeCardPaymentDBSubscriptionUpdate
        );
        listenerArr.push(listener);
        _setListeners(listenerArr);
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

  // async function startPaymen1t(paymentAmount, reader, update) {
  //   let readerID = reader.id;
  //   if (!(paymentAmount > 0)) return;
  //   _setStatusTextColor("green");
  //   _setStatusMessage("Retrieving card reader activation...");

  //   try {
  //     let readerResult;
  //     readerResult = await dbProcessServerDrivenStripePayment(
  //       paymentAmount,
  //       readerID,
  //       sPaymentIntentID
  //     );
  //   } catch (e) {}

  //   if (readerResult?.error?.code) {
  //     handleStripeReaderActivationError(readerResult.error.code);
  //   } else {
  //     _setStatusTextColor("green");
  //     _setStatusMessage("Waiting for customer...");
  //     // log("readerkdfjkdjf", readerResult.paymentIntentID);
  //     _setPaymentIntentID(readerResult.paymentIntentID);
  //     let listenerArr = cloneDeep(sListeners);
  //     let listener = dbSubscribeToStripePaymentProcess(
  //       readerResult.paymentIntentID,
  //       handleStripeCardPaymentDBSubscriptionUpdate
  //     );
  //     listenerArr.push(listener);
  //     _setListeners(listenerArr);
  //   }
  // }

  function handleStripeCardPaymentDBSubscriptionUpdate(
    key,
    val,
    paymentIntentID
  ) {
    let failureCode = val?.failure_code;
    let message;
    let error = false;
    if (
      failureCode &&
      val?.process_payment_intent?.payment_intent == paymentIntentID
    ) {
      log("card failure code", failureCode);
      error = true;
      message =
        "Failure code:  " + val.failure_code + "\n\nPayment Rejected by Stripe";
    } else if (
      val.status === "succeeded" &&
      val.payment_intent === paymentIntentID
    ) {
      message = "Payment complete!";
      log("Stripe payment complete!");
      // clog("Payment complete object", val);
      let paymentMethodDetails = val.payment_method_details.card_present;
      let payment = cloneDeep(PAYMENT_OBJECT_PROTO);
      payment.amountCaptured = val.amount_captured;
      payment.cardIssuer =
        paymentMethodDetails.receipt.application_preferred_name;
      payment.cardType = paymentMethodDetails.description;
      payment.id = generateUPCBarcode();
      payment.isRefund = sIsRefund;
      payment.millis = new Date().getTime();
      payment.authorizationCode =
        paymentMethodDetails.receipt.authorization_code;
      payment.paymentIntentID = val.payment_intent;
      payment.chargeID = val.id;
      payment.paymentProcessor = "stripe";
      payment.receiptURL = val.receipt_url;
      payment.last4 = val.payment_method_details.card_present.last4;
      payment.expMonth = val.payment_method_details.card_present.exp_month;
      payment.expYear = val.payment_method_details.card_present.exp_year;
      payment.networkTransactionID =
        val.payment_method_details.card_present.network_transaction_id;
      payment.amountRefunded = val.amount_refunded;
      // clog("Successful Payment details obj", paymentDetailsObj);
      handlePaymentCapture(payment);
    }

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
  // log("readers", sStripeCardReaders);
  return (
    <View
      pointerEvents={sSale?.paymentComplete ? "none" : "auto"}
      style={{
        ...checkoutScreenStyle.base,
        justifyContent: "space-between",
        paddingBottom: 20,
        opacity: sSale || sRefund ? 1 : 0.2,
      }}
    >
      <View
        style={{
          width: "100%",
          alignItems: "flex-start",
          paddingBottom: 10,
          paddingHorizontal: 10,
          // marginLeft: 20,
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
              enabled={sCardSaleActive && !sSale?.paymentComplete}
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
            enabled={sCardSaleActive && !sSale?.paymentComplete}
            buttonStyle={{
              cursor: sProcessButtonEnabled ? "inherit" : "default",
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
            style={{ color: sIsRefund ? gray(0.2) : C.textMain, marginTop: 10 }}
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
                disabled={!sCardSaleActive || sSale?.paymentComplete}
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
      {sIsRefund ? (
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
            {"**" + sRefund.selectedCardPayment?.last4}
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
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
} from "../../../utils";
import React, { useCallback, useEffect, useState } from "react";
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
  const [sRequestedAmount, _setRequestedAmount] = useState(
    sSale?.total - sSale?.amountCaptured
  );
  const [sRequestedAmountDisp, _setRequestedAmountDisp] = useState(
    formatCurrencyDisp(
      sRefund.cardRefundRequested || sSale?.total - sSale?.amountCaptured
    )
  );
  // const [sRefundAmountDisp, _setRefundAmountDisp] = useState(forma);
  const [sStatusMessage, _setStatusMessage] = useState("");
  const [sProcessButtonEnabled, _setProcessButtonEnabled] = useState(false);
  const [sFocusedItem, _setFocusedItem] = useState("");
  const [sCardReader, _setCardReader] = useState("");
  const [sCardReaders, _setCardReaders] = useState([]);
  const [sListeners, _setListeners] = useState([]);
  const [sPaymentIntentID, _setPaymentIntentID] = useState("");
  const [sStatusTextColor, _setStatusTextColor] = useState(C.green);
  const [sCancelCardReaderTimer, _setCancelCardReaderTimer] = useState();

  /////////////////////////////////////////////////////////////////////////
  useEffect(() => {
    if (sIsRefund) {
      if (
        sRequestedAmount <= sRefund.totalCardRefundAllowed &&
        sRequestedAmount >= 50
      )
        _setProcessButtonEnabled(true);
      return;
    }

    if (
      sRequestedAmount > sSale?.total - sSale?.amountCaptured ||
      sRequestedAmount < 50
    ) {
      _setProcessButtonEnabled(false);
    } else {
      _setProcessButtonEnabled(true);
    }
  }, [sRequestedAmount, sIsRefund]);

  useEffect(() => {
    // log(sRequestedAmount);
    // if (zSettings.)
    getAvailableStripeReaders();

    return () => {
      try {
        sListeners.forEach((listener) => listener());
      } catch (e) {
        log("error canceling listener", e);
      }
    };
  }, [sRefund, zSettings]);

  function handleRequestedAmountTextChange(val) {
    let dollars = usdTypeMask(val).display;
    let cents = dollarsToCents(dollars);
    if (!cents) cents = 0;
    if (dollars === "0.00") dollars = "";
    _setStatusMessage("");
    _setRequestedAmount(cents);
    _setRequestedAmountDisp(dollars);
  }

  async function getAvailableStripeReaders() {
    // log("getting available Stripe readers");
    const res = await fetch(STRIPE_GET_AVAIALABLE_STRIPE_READERS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json();
    let readerArr = data.data;
    // log("data", data.data);

    if (readerArr.length === 0) {
      _setStatusMessage(
        "No card readers found on this account!\nSee network admin"
      );
      return;
    } else {
      _setCardReaders(readerArr);
    }
    // log("arr", readerArr);
    _setStatusTextColor(C.red);
    _setCardReaders(readerArr.filter((o) => o.status !== "offline"));
    let timer;
    if (!sCancelCardReaderTimer) {
      timer = startTimer(MILLIS_IN_MINUTE * 10, 2000, () => {
        getAvailableStripeReaders();
      });
      _setCancelCardReaderTimer(timer);
    }
    if (readerArr.find((o) => o.id === zSettings?.selectedCardReaderObj.id)) {
      let reader = readerArr.find(
        (o) => o.id === zSettings?.selectedCardReaderObj.id
      );
      if (reader.status === "offline") {
        _setStatusMessage(
          "Selected card reader is offline!\nCheck power and network connections"
        );
      } else {
        _setStatusTextColor(C.green);
        _setCardReader(zSettings?.selectedCardReaderObj);
        if (timer || sCancelCardReaderTimer) {
          if (timer) timer();
          if (sCancelCardReaderTimer) sCancelCardReaderTimer();
        }
      }
    } else if (readerArr.find((o) => o.status != "offline")) {
      _setCardReader(readerArr.find((o) => o.status != "offline"));
    } else {
      _setStatusMessage(
        "No online card readers found!\nCheck power and network connections"
      );
    }
  }

  async function startPayment(paymentAmount, reader) {
    let readerID = reader.id;
    if (!(paymentAmount > 0)) return;
    _setStatusTextColor("green");
    _setStatusMessage("Retrieving card reader activation...");

    let readerResult;
    if (sIsRefund) {
      readerResult = await dbCancelServerDrivenStripePayment(
        readerID || sCardReader.id,
        refundPaymentIntentID
      );
    } else {
      readerResult = await dbProcessServerDrivenStripePayment(
        paymentAmount,
        readerID || sCardReader.id,
        false,
        sPaymentIntentID
      );
    }
    // log("reader result", readerResult);
    if (!readerResult || readerResult.code) {
      _setStatusMessage(
        "Error code: " +
          readerResult.code +
          "\n(check connections/start/restart)"
      );
      _setStatusTextColor(C.red);
      log("no result from start Stripe payment");
      return;
    }

    if (readerResult.error && readerResult.error.code) {
      handleStripeReaderActivationError(readerResult.error.code);
    } else {
      _setStatusTextColor("green");
      _setStatusMessage("Waiting for customer...");
      // log("readerkdfjkdjf", readerResult.paymentIntentID);
      _setPaymentIntentID(readerResult.paymentIntentID);
      let listenerArr = cloneDeep(sListeners);
      let listener = dbSubscribeToStripePaymentProcess(
        readerResult.paymentIntentID,
        handleStripeCardPaymentDBSubscriptionUpdate
      );
      listenerArr.push(listener);
      _setListeners(listenerArr);
    }
  }

  async function handleStripeReaderActivationError(error) {
    _setStatusTextColor(C.red);
    // log("Handling Stripe reader activation error", error);
    let message = "";
    if (error == "in_progress") {
      message =
        "error code: in_progress\n\nCard Reader in use. Please wait, use a different reader, or reset this reader";
    } else {
      switch (error.code) {
        case "terminal_reader_timeout":
          message =
            "error code: terminal_reader_timeout\n\nCould not connect to reader, possible network issue\n" +
            error.code;
          break;
        case "terminal_reader_offline":
          message =
            "error code: terminal_reader_offline\n\n Please check power and internet connection\n" +
            error.code;
          break;
        case "terminal_reader_busy":
          message =
            "error code: terminal_reader_busy\n\nPlease try a different reader or reset this reader\n" +
            error.code;
          break;
        case "intent_invalid_state":
          message =
            "error code: intent_invalid_state\n\nPlease clear the reader, refresh the page and try again";
          break;
        default:
        // message = "Unknown processing error: \n" + error.code;
      }
    }
    _setStatusMessage(message);
  }

  function handleStripeCardPaymentDBSubscriptionUpdate(
    key,
    val,
    paymentIntentID
  ) {
    // clog("Stripe webhook update Obj", val);

    let failureCode = val?.failure_code;
    if (
      failureCode &&
      val?.process_payment_intent?.payment_intent == paymentIntentID
    ) {
      log("card failure code", failureCode);
      _setStatusTextColor(C.red);
      _setStatusMessage(
        "Failure code:  " + val.failure_code + "\n\nPayment Rejected by Stripe"
      );
    } else if (
      val.status === "succeeded" &&
      val.payment_intent === paymentIntentID
    ) {
      _setStatusTextColor("green");
      _setStatusMessage("Payment Complete!");
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
  }

  function handleProcessButtonPress() {}

  async function resetCardReader() {
    _setStatusMessage(C.red);
    _setStatusMessage("\nCard reader reset in progress...");
    _setPaymentIntentID(null);
    sListeners.forEach((listener) => listener());
    _setProcessButtonEnabled(true);
    let readerResult = await dbCancelServerDrivenStripePayment(
      sCardReader.id,
      sPaymentIntentID
    );
    _setStatusTextColor("green");
    _setStatusMessage("\nReset complete!");
    clog("cancelation results", readerResult);
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

  // log(sProcessButtonEnabled.toString());
  let refundReady = true;
  // log(sRefund.totalCardRefundAllowed);
  // if (sIsRefund && !sRefundAmount) refundReady = false;
  // log("stripe sale", sSale?.paymentComplete.toString());
  return (
    <View
      pointerEvents={sSale?.paymentComplete ? "none" : "auto"}
      style={{
        ...checkoutScreenStyle.base,
        justifyContent: "space-between",
        paddingBottom: 20,
        opacity:
          sSale?.paymentComplete ||
          (sIsRefund && !sRefund.cardRefundRequested > 0)
            ? 0.2
            : 1,
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
              enabled={
                sCardSaleActive && !sSale?.paymentComplete && refundReady
              }
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
              dataArr={sCardReaders || []}
              buttonText={sCardReader?.label || sCardReader?.id}
              onSelect={_setCardReader}
            />
          </View>
          <Button_
            text={"Reset Card Reader"}
            enabled={sCardSaleActive && !sSale?.paymentComplete && refundReady}
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
                disabled={
                  !sCardSaleActive || sSale?.paymentComplete || !refundReady
                }
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
        <View style={{ width: "100%", alignItems: "center", marginTop: 10 }}>
          <Text style={{ fontSize: 12 }}>
            {"**" +
              sRefund.last4 +
              "exp: " +
              sRefund.cardExpMonth +
              " / " +
              sRefund.cardExpYear}
          </Text>
          <Text style={{ fontSize: 12 }}>{sRefund.cardType}</Text>
        </View>
      ) : null}
      <View
        style={{
          width: "100%",
          alignItems: "center",
        }}
      >
        {/* {!sPartialPaymentAlert ? ( */}
        <Button_
          colorGradientArr={COLOR_GRADIENTS.green}
          textStyle={{ color: C.textWhite, fontSize: 16 }}
          enabled={
            sProcessButtonEnabled && !sSale?.paymentComplete && sCardSaleActive
          }
          onPress={() => startPayment(sRequestedAmount, sCardReader)}
          text={sIsRefund ? "PROCESS REFUND" : "START CARD SALE"}
          buttonStyle={{
            cursor: sProcessButtonEnabled ? "inherit" : "default",
          }}
        />
        <Text
          style={{
            ...checkoutScreenStyle.statusText,
            fontSize: 15,
            color: sStatusTextColor,
            marginTop: 5,
            // maxHeight: 100,
            // backgroundColor: "blue",
          }}
        >
          {sStatusMessage}
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
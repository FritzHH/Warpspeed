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
import { FIRESTORE_COLLECTION_NAMES } from "../../../constants";
import { isArray } from "lodash";
import { PricingV1MessagingMessagingCountryInstanceInboundSmsPrices } from "twilio/lib/rest/pricing/v1/messaging/country";

export const CashSaleComponent = ({
  sSale,
  sAmountLeftToPay,
  handlePaymentCapture,
  handleRefundCapture,
  acceptsChecks,
  sIsRefund,
  sCashSaleActive,
  sIsDeposit,
  _setIsDeposit,
  // sCashChangeNeeded,
  _setCashChangeNeeded,
  sRefundPaymentOverride,
  sRefund = {
    cashRefundRequested: 0,
    cardRefundRequested: 0,
    totalCashRefundAllowed: 0,
    totalCardRefundAllowed: 0,
    totalRefundRequested: 0,
    cardRefunded: 0,
    cashRefunded: 0,
    cardTransactions: [],
    cashTransactions: [],
    refundedLines: [],
    requestedRefundLines: [],
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
  const zSettings = useSettingsStore((state) => state.getSettingsObj());
  const zSale = useCheckoutStore((state) => state.saleObj);
  // log(sAmountLeftToPay);
  const [sTenderAmount, _setTenderAmount] = useState(
    sIsRefund
      ? sRefund.cashRefundRequested - sRefund.cashAmountRefunded
      : sSale?.total - sSale?.amountCaptured
  );
  const [sTenderAmountDisp, _setTenderAmountDisp] = useState(
    formatCurrencyDisp(
      sIsRefund
        ? sRefund.cashRefundRequested - sRefund.cashAmountRefunded
        : sSale?.total - sSale?.amountCaptured
    )
  );
  const [sRequestedAmountDisp, _setRequestedAmountDisp] = useState(
    formatCurrencyDisp(
      sIsRefund
        ? sRefund.cashRefundRequested - sRefund.cashAmountRefunded
        : sSale?.total - sSale?.amountCaptured
    )
  ); // dev sAmountLeftToPay
  const [sRequestedAmount, _setRequestedAmount] = useState(
    sSale?.total - sSale?.amountCaptured
  );
  const [sStatusMessage, _setStatusMessage] = useState("");
  const [sProcessButtonEnabled, _setProcessButtonEnabled] = useState(false);
  const [sIsCheck, _setIsCheck] = useState(false);
  const [sInputBoxFocus, _setInputBoxFocus] = useState(null);
  // const [sCashChangeNeeded, _setCashChangeNeeded] = useState(0);
  const [sFocusedItem, _setFocusedItem] = useState("");

  useEffect(() => {
    if (sIsRefund) {
      if (
        sRequestedAmount <= sRefund.cashRefundRequested &&
        sRequestedAmount >= 100
      ) {
        _setProcessButtonEnabled(true);
      } else {
        _setProcessButtonEnabled(false);
      }
      return;
    }
    if (
      sTenderAmount < sRequestedAmount ||
      sRequestedAmount === 0 ||
      sTenderAmount === 0 ||
      sRequestedAmount > sSale?.total - sSale?.amountCaptured
    ) {
      _setProcessButtonEnabled(false);
    } else {
      _setProcessButtonEnabled(true);
    }
  }, [sTenderAmount, sRequestedAmount, sIsRefund]);

  function handleCancelPress() {
    _setTenderAmount(sSale?.total - sSale?.amountCaptured);
    _setTenderAmountDisp("");
    _setRequestedAmount(sSale?.total - sSale?.amountCaptured);
    _setRequestedAmountDisp(
      formatCurrencyDisp(
        sIsRefund
          ? sRefund.cashRefundRequested - sRefund.cashAmountRefunded
          : sSale?.total - sSale?.amountCaptured
      )
    );
    _setProcessButtonEnabled(false);
  }

  function handleProcessRefundPress() {
    let paymentObject = { ...PAYMENT_OBJECT_PROTO };

    let availableCashRefundObjArr = [];
    sRefund.cashTransactionArr.forEach((cashPaymentObj) => {
      availableCashRefundObjArr.push({
        id: cashPaymentObj.id,
        amount: cashPaymentObj.amountCaptured,
      });
    });

    let total = 0;
    let remain = 0;
    let arr = [];
    availableCashRefundObjArr.forEach((availableAmountObj) => {
      if (total >= sTenderAmount) return;
      let amountToUse = remain > 0 ? remain : sTenderAmount;
      let diff = availableAmountObj.amount - amountToUse;
      if (diff >= 0) {
        total += sTenderAmount;
        availableAmountObj.amountRefunded = amountToUse;
        arr.push({ ...availableAmountObj });
        return;
      }

      availableAmountObj.amountRefunded = availableAmountObj.amount;
      remain = diff * -1;
      arr.push(...availableAmountObj);
    });

    let arr1 = sRefund.cashTransactionArr.map((cashPaymentObj) => {
      cashPaymentObj = cloneDeep(cashPaymentObj);
      let amountObj = arr.find((o) => o.id === cashPaymentObj.id);
      cashPaymentObj.amountRefunded = amountObj?.amountRefunded;
      return cashPaymentObj;
    });

    // log("final arr", arr1);
    handleRefundCapture(arr1);
  }

  function handleProcessPaymentPress() {
    // log("process payment pressed");
    let paymentObject = { ...PAYMENT_OBJECT_PROTO };
    paymentObject.amountTendered = sTenderAmount;
    paymentObject.amountCaptured = sRequestedAmount;
    paymentObject.cash = !sIsCheck;
    paymentObject.check = sIsCheck;
    paymentObject.millis = new Date().getTime();
    paymentObject.id = generateUPCBarcode();
    handlePaymentCapture(paymentObject);

    let diff = sTenderAmount - sRequestedAmount;
    // log(diff);
    if (diff < 0) {
      // log("here1");
      _setCashChangeNeeded(formatCurrencyDisp(0));
    } else {
      // log("here2");
      _setCashChangeNeeded(formatCurrencyDisp(diff));
    }
  }

  function handleRequestedAmountTextChange(val) {
    // log("val", val);
    let dollars = usdTypeMask(val).display;
    let cents = dollarsToCents(dollars);
    if (!cents) cents = 0;
    if (dollars === "0.00") dollars = "";
    _setStatusMessage("");
    _setRequestedAmount(cents);
    _setRequestedAmountDisp(dollars);

    // log("dollars", formatCurrencyDisp(cents));
    // log("refund", formatCurrencyDisp(sRefund.totalCashRefundAllowed));
    if (sIsRefund) {
      _setTenderAmount(cents);
      _setTenderAmountDisp(dollars);
      // if (cents <= sRefund.totalCashRefundAllowed && cents >= 100) {
      // log("here1");
      // _setProcessButtonEnabled(true);
    }
  }

  function handleKeyPress(event) {
    if (event.nativeEvent.key == "Enter")
      sIsRefund ? handleProcessRefundPress() : handleProcessPaymentPress();
  }

  return (
    <View
      //   pointerEvents={sSale?.paymentComplete && !refundReady ? "none" : "auto"}
      style={{
        ...checkoutScreenStyle.base,
        justifyContent: "space-between",
        paddingBottom: 20,
        opacity:
          sSale?.paymentComplete ||
          (sIsRefund && !sRefund.cashRefundRequested > 0)
            ? 0.2
            : 1,
      }}
    >
      {acceptsChecks ? (
        <View
          style={{ width: "100%", alignItems: "flex-start", paddingLeft: 10 }}
        >
          {!sIsRefund ? (
            <CheckBox_
              enabled={!sSale?.payments.length > 0}
              textStyle={{ fontSize: 12 }}
              text={"Paper Check"}
              onCheck={() => {
                _setIsCheck(!sIsCheck);
                _setProcessButtonEnabled(sIsCheck ? false : true);
                _setTenderAmount(
                  sIsCheck ? "" : sSale?.total - sSale?.amountCaptured
                );
              }}
              isChecked={sIsCheck}
            />
          ) : null}
        </View>
      ) : null}
      <Text
        style={{
          ...checkoutScreenStyle.titleText,
          color: sIsRefund ? C.red : checkoutScreenStyle.titleText.color,
          fontWeight: 500,
        }}
      >
        {sIsRefund ? "CASH REFUND" : "CASH SALE"}
      </Text>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "flex-end",
          alignItems: "center",
          marginTop: 5,
          backgroundColor: C.listItemWhite,
          padding: 10,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: C.buttonLightGreenOutline,
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
            style={{ color: sIsRefund ? gray(0.2) : C.textMain, marginTop: 4 }}
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
              // marginTop: 10,
            }}
          >
            <Text style={{ ...checkoutScreenStyle.boxDollarSign }}>$</Text>
            <View
              style={{
                // width: "100%",
                height: "100%",
                width: 100,

                // backgroundColor: "green",
                alignItems: "flex-end",
                paddingRight: 5,
              }}
            >
              <TextInput
                onFocus={() => {
                  _setFocusedItem("amount");
                  _setRequestedAmountDisp("");
                  _setTenderAmountDisp("");
                  _setRequestedAmount(0);
                  _setTenderAmount(0);
                }}
                autoFocus={sFocusedItem === "amount"}
                disabled={
                  !sCashSaleActive &&
                  sSale?.paymentComplete &&
                  !sRefund.cashRefundRequested &&
                  sRefundPaymentOverride
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
        enabled={sSale?.payments.length === 0}
        buttonStyle={{ marginTop: 7 }}
        textStyle={{ color: gray(0.6), fontWeight: 500, fontSize: 14 }}
        text={"DEPOSIT TO ACCOUNT"}
        isChecked={sIsDeposit}
        onCheck={() => _setIsDeposit(!sIsDeposit)}
      />
      <View
        style={{
          width: "100%",
          alignItems: "center",
          marginVertical: 5,
        }}
      >
        <View
          style={{
            ...checkoutScreenStyle.boxStyle,
            width: "35%",
            paddingBottom: 6,
          }}
        >
          <Text
            style={{ ...checkoutScreenStyle.boxDollarSign, color: C.green }}
          >
            $
          </Text>
          <View
            style={{
              width: "100%",
              height: "100%",
              // backgroundColor: "green",
              alignItems: "flex-end",
              paddingRight: 5,
            }}
          >
            <TextInput
              disabled={
                !sCashSaleActive ||
                sSale?.paymentComplete ||
                (sRefund && sRefund.cashRefundRequested)
              }
              style={{
                ...checkoutScreenStyle.boxText,
                color: C.green,
                height: "70%",
                // backgroundColor: "blue",
              }}
              autoFocus={sFocusedItem === "tender"}
              placeholder="0.00"
              placeholderTextColor={gray(0.3)}
              value={sTenderAmountDisp}
              onChangeText={(val) => {
                val = usdTypeMask(val).display;
                let cents = dollarsToCents(val);
                if (!cents) cents = 0;
                if (val === "0.00") val = "";
                _setTenderAmount(cents);
                _setTenderAmountDisp(val);
              }}
              onKeyPress={handleKeyPress}
              onFocus={() => {
                _setFocusedItem("tender");
                _setTenderAmountDisp("");
                _setTenderAmount(0);
              }}
            />
            <Text
              style={{
                fontStyle: "italic",
                color: "darkgray",
                fontSize: 12,
              }}
            >
              {sIsRefund ? "Cash Refund Owed" : "Tender"}
            </Text>
          </View>
        </View>
      </View>
      {/* <View
        style={{
          flexDirection: "row",
          justifyContent: "space-around",
          width: "100%",
          alignItems: "center",
          marginTop: 10,
        }}
      > */}
      <Button_
        colorGradientArr={COLOR_GRADIENTS.green}
        textStyle={{ color: C.textWhite, fontSize: 16 }}
        enabled={sProcessButtonEnabled}
        onPress={handleProcessPaymentPress}
        text={sIsRefund ? "PROCESS REFUND" : "COMPLETE PAYMENT"}
        buttonStyle={{
          cursor: sProcessButtonEnabled ? "inherit" : "default",
          // width: 120,
        }}
      />

      {/* {!sIsRefund && (
          <Button_
            buttonStyle={
              {
                // cursor: sProcessButtonEnabled ? "inherit" : "default",
                // width: 120,
              }
            }
            textStyle={{ fontSize: 15, color: C.textMain }}
            colorGradientArr={COLOR_GRADIENTS.grey}
            enabled={!sSale?.paymentComplete && sCashSaleActive}
            onPress={handleCancelPress}
            text={"CANCEL"}
          />
        )} */}
      {/* <View
          style={{
            ...checkoutScreenStyle.boxStyle,
            width: "30%",
            // borderWidth: 1,
            // borderColor: C.buttonLightGreenOutline,
            // borderRadius: 10,
            paddingTop: 2,
            paddingBottom: 2,
            // paddingLeft: 2,
            // paddingRight: 10,
            flexDirection: "column",

            // marginTop: 16,
          }}
        >
          <Text
            style={{
              fontSize: 11,
              color: gray(0.3),
              // marginBottom: 10,
              width: "100%",
              textAlign: "left",
              paddingBottom: 3,
              // paddingHorizontal: 10,
            }}
          >
            CHANGE
          </Text>
          <Text
            placeholder={"0.00"}
            style={{
              // ...checkoutScreenStyle.statusText,
              textAlign: "right",
              fontSize: 25,
              color: sCashChangeNeeded > 0 ? C.green : gray(0.3),
            }}
          >
            <Text
              style={{
                fontSize: 15,
                // color: C.green,
                paddingRight: 7,
                height: "100%",
                textAlignVertical: "top",
              }}
            >
              $
            </Text>
            {sCashChangeNeeded}
          </Text>
        </View> */}
      {/* </View> */}
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
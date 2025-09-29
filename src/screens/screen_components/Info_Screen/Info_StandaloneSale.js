/* eslint-disable */
import { FlatList, View, Text, TextInput } from "react-native-web";
import {
  PAYMENT_OBJECT_PROTO,
  TAB_NAMES,
  WORKORDER_PROTO,
} from "../../../data";
import {
  useCheckoutStore,
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
} from "../../../components";
import { cloneDeep } from "lodash";
import {
  calculateRunningTotals,
  clog,
  generateRandomID,
  generateUPCBarcode,
  log,
  showAlert,
  trimToTwoDecimals,
} from "../../../utils";
import { useEffect, useState } from "react";
import { COLOR_GRADIENTS, Colors, Fonts, ICONS } from "../../../styles";
import { sendFCMMessage } from "../../../db";
import {
  dbProcessServerDrivenStripePayment,
  dbRetrieveAvailableStripeReaders,
} from "../../../db_call_wrapper";

export const StandaloneSaleComponent = ({}) => {
  // store setters
  const _zSetOpenWorkorderObj = useOpenWorkordersStore(
    (state) => state.setOpenWorkorderObj
  );
  const _zSetOptionsTabName = useTabNamesStore(
    (state) => state.setOptionsTabName
  );
  const _zSetItemsTabName = useTabNamesStore((state) => state.setItemsTabName);
  const _zSetInfoTabName = useTabNamesStore((state) => state.setInfoTabName);

  // store getters
  let zOpenWorkorder = WORKORDER_PROTO;
  zOpenWorkorder = useOpenWorkordersStore((state) => state.openWorkorder);
  const zOpenWorkordersArr = useOpenWorkordersStore(
    (state) => state.workorders
  );
  const zInventoryArr = useInventoryStore((state) => state.inventoryArr);
  const zSettingsObj = useSettingsStore((state) => state.settings);
  const [sCardReader, _setCardReader] = useState();
  //////////////////////////////////////////////////////////////////////

  const [sTotalAmountCaptured, _setTotalAmountCaptured] = useState(0);
  const [sPaymentComplete, _setPaymentComplete] = useState(false);
  const [sCashChangeNeeded, _setCashChangeNeeded] = useState(0);
  const [sRefundScan, _sSetRefundScan] = useState("");
  const [sIsRefund, _setIsRefund] = useState(false);
  const [sSplitPayment, _setSplitPayment] = useState(false);
  const [sTotalAmount, _setTotalAmount] = useState(0);

  // todo set reader available flag
  useEffect(() => {
    if (!zSettingsObj) return;
    getAllAvailableStripeReaders();
  }, []);

  // cleanup function
  useEffect(() => {
    return () => {
      // todo cleanup
    };
  }, []);

  // Stripe reader warm-up (not sure if this actually does anything, may need to grab an actual payment intent and then quickly cancel it)
  useEffect(() => {
    // if (sCardReader?.id) {
    //   // log("warming up Stripe reader");
    //   dbProcessServerDrivenStripePayment(0, sCardReader.id, true);
    // }
  }, [sCardReader]);

  // get total from open workorder/sale
  // TODO need to add in combined workorders after completed the next effect
  useEffect(() => {
    // log("z", zWorkorderObj);
    if (!zOpenWorkorder?.workorderLines || !zInventoryArr?.length > 0)
      return;
    const { runningQty, runningTotal, runningDiscount } =
      calculateRunningTotals(zOpenWorkorder, zInventoryArr);
    _sSetTotalsObj({ total: runningTotal, discount: runningDiscount });
  }, [zOpenWorkorder]);

  // TODO check for other open workorders and add them in a checklist to combine
  useEffect(() => {
    if (!zOpenWorkorder || zOpenWorkorder.isStandaloneSale) return;

    let otherWorkorders = zOpenWorkordersArr.find(
      (o) => o.customerID == zOpenWorkorder.customerID
    );
    // log("others", otherWorkorders);
  }, []);

  // server find all available stripe readers
  async function getAllAvailableStripeReaders() {
    let readers = await dbRetrieveAvailableStripeReaders();

    if (!readers) {
      log("no Stripe card readers returned");
      showAlert({
        message:
          "There are no Stripe card readers connected to account. Please check your settings.",
      });
      return;
    }

    log("connected card readers", readers.data);
    // _zSetReadersArr(readers?.data);
    let selectedCardReader = zSettingsObj.selectedCardReaderObj;
    let found = readers.data.find(
      (reader) => reader.id === selectedCardReader.id
    );
    // log("found", found);
    if (!found || found.status !== "online") {
      showAlert({
        message:
          "Your selected reader in Settings:   " +
          selectedCardReader.label +
          "    is currently offline, but connected.\n\nPlease power up device, connect to the network and try again.",
      });
      return;
    }
  }

  function getAllCustomerOpenWorkorders() {
    let workorders = [];
    zOpenWorkordersArr.forEach((openWO) => {
      if (
        openWO?.customerID == zOpenWorkorder?.customerID &&
        openWO.id != zOpenWorkorder?.id
      )
        workorders.push(openWO);
    });
    // clog("workorder", workorders);
    return workorders;
  }


  const handleRefundScan = async (text) => {
    log("incoming refund text", text);
    _sSetRefundScan(text);
  };

  const handleSplitPaymentPress = () => {
    if (zPaymentsArr.length > 0 && sSplitPayment) {
      log("fix later");
      // todo error message cannot unsplit payment box after a payment is made towards the total
    } else {
      _setSplitPayment(!sSplitPayment);
    }
  };

  function actionButtonPressed() {
    // _zSetIsCheckingOut(!zIsCheckingOut);
    if (zOpenWorkorder?.isStandaloneSale) {
      _zSetOpenWorkorderObj(null);
      _zSetOptionsTabName(TAB_NAMES.optionsTab.workorders);
      _zSetInfoTabName(TAB_NAMES.infoTab.customer);
      _zSetItemsTabName(TAB_NAMES.itemsTab.empty);
      return;
    }

    // let wo = cloneDeep(WORKORDER_PROTO);
    // wo.isStandaloneSale = true;
    // wo.id = generateRandomID();
    // _zSetOpenWorkorderObj(wo);
    // _zSetOptionsTabName(TAB_NAMES.optionsTab.quickItems);
    // _zSetItemsTabName(TAB_NAMES.itemsTab.workorderItems);
  }

  // function setComponent() {
  return (
    <View
      style={{
        width: "100%",
        height: "100%",
        justifyContent: "flex-start",
        alignItems: "center",
        // backgroundColor: "green",
      }}
    >
      <ScreenModal
        buttonVisible={false}
        showOuterModal={true}
        modalVisible={false}
        showShadow={true}
        shadowStyle={{ ...SHADOW_RADIUS_PROTO }}
        Component={() => SaleComponent()}
      />
      <View
        style={{
          width: "100%",
          flexDirection: "row",
          justifyContent: "space-between",
          height: 50,
          alignItems: "center",
          marginTop: "1%",
          paddingHorizontal: 8,
        }}
      >
        <View
          style={{
            width: "70%",
            flexDirection: "row",
            justifyContent: "flex-start",
            alignItems: "center",
          }}
        >
          <CheckBox_
            viewStyle={{ marginRight: 5 }}
            text={"Refund"}
            isChecked={sIsRefund}
            onCheck={() => {
              if (!sIsRefund) _setSplitPayment(false);
              sTotalAmountCaptured ? null : _setIsRefund(!sIsRefund);
            }}
          />
          {!!sIsRefund && (
            <TextInput
              style={{
                outlineWidth: 0,
                borderColor: "lightgray",
                borderWidth: 1,
                paddingHorizontal: 3,
                height: 30,
                marginLeft: 10,
                width: "70%",
              }}
              autoFocus={true}
              placeholder="Scan or enter workorder #"
              placeholderTextColor={"lightgray"}
              value={sRefundScan}
              onChangeText={(val) => handleRefundScan(val)}
            />
          )}
        </View>
        <CheckBox_
          text={"Split Payment"}
          isChecked={sSplitPayment}
          onCheck={() => {
            if (!sSplitPayment) _setIsRefund(false);
            handleSplitPaymentPress();
          }}
        />
      </View>
      <View
        style={{
          width: "100%",
        }}
      >
        <View
          style={{
            width: "100%",
            flexDirection: "row",
            justifyContent: "space-evenly",
          }}
        >
          <Button_
            textStyle={{ color: "white" }}
            icon={ICONS.cashBag}
            colorGradientArr={COLOR_GRADIENTS.green}
            buttonStyle={{
              width: 190,
              height: 40,

              // backgroundColor: Colors.tabMenuButton,
              // borderRadius: 0,
            }}
            visible={!sPaymentComplete}
            text={"Cash / Check"}
            onPress={() => _sSetShowCashSaleModal(true)}
          />
          <Button_
            colorGradientArr={COLOR_GRADIENTS.green}
            textStyle={{ color: "white" }}
            icon={ICONS.creditCard}
            buttonStyle={{
              width: 140,
              height: 40,
              // backgroundColor: Colors.tabMenuButton,
              // borderRadius: 0,
            }}
            visible={!sPaymentComplete}
            text={"Card"}
            onPress={() => _sSetShowCreditCardModal(true)}
          />
        </View>
      </View>
      <View
        style={{
          marginTop: 10,
          width: "100%",
          // height: 20,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-around",
            alignItems: "center",
          }}
        >
          {sTotalAmountCaptured == sTotalAmount && <Text>Sale Complete!</Text>}
          {!!sSplitPayment && (
            <View>
              {zPaymentsArr.map((item) => (
                <View
                  style={{ flexDirection: "row", justifyContent: "center" }}
                >
                  <Text>
                    {item.last4 ? "Card payment: $" : "Cash payment: $"}
                  </Text>
                  <Text>{trimToTwoDecimals(item.amount)}</Text>
                </View>
              ))}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "center",
                  marginVertical: 10,
                }}
              >
                <Text style={{ fontSize: 20, fontWeight: 500 }}>
                  {"Left to pay:"}
                </Text>
                <Text
                  style={{
                    fontSize: 20,
                    marginLeft: 10,
                    color: "red",
                    fontWeight: 500,
                  }}
                >
                  {trimToTwoDecimals(sTotalAmount - sTotalAmountCaptured)}
                </Text>
              </View>
            </View>
          )}
        </View>

        {!!sPaymentComplete && (
          <View
            style={{
              flexDirection: "row",
              width: "100%",
              justifyContent: "space-around",
              marginTop: 10,
            }}
          >
            <Button
              textStyle={{ color: "white" }}
              buttonStyle={{
                width: 100,
                height: 20,
                backgroundColor: "gray",
                borderRadius: 0,
              }}
              shadow={true}
              text={"Email"}
              onPress={() => {}}
            />
            <Button
              textStyle={{ color: "white" }}
              buttonStyle={{
                width: 100,
                height: 20,
                backgroundColor: "gray",
                borderRadius: 0,
                padding: 5,
              }}
              shadow={true}
              text={"Print"}
              onPress={() => {}}
            />
            <Button
              textStyle={{ color: "white" }}
              buttonStyle={{
                width: 100,
                height: 20,
                backgroundColor: "gray",
                borderRadius: 0,
              }}
              text={"Text"}
              onPress={() => {}}
            />
          </View>
        )}
        {!!sCashChangeNeeded && (
          <View
            style={{
              width: "100%",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontSize: 20, marginRight: 10, color: "" }}>
              Cash change needed:
            </Text>
            <Text style={{ fontSize: 20, fontWeight: 500, color: "green" }}>
              {trimToTwoDecimals(sCashChangeNeeded)}
            </Text>
          </View>
        )}
      </View>
      <View
        style={{
          height: "80%",
          backgroundColor: null,
          width: "100%",
          // flexDirection: "row",
        }}
      >
        <FlatList
          data={getAllCustomerOpenWorkorders()}
          renderItem={(item, index) => {
            item = item.item;
            let total = calculateRunningTotals(item, zInventoryArr);
            return (
              <View
                style={{
                  width: "100%",
                  flexDirection: "row",
                }}
              >
                <View style={{ width: "95%" }}>
                  <View style={{ flexDirection: "row" }}>
                    <Text style={{ marginRight: 10 }}>
                      {item.brand || "No brand..."}
                    </Text>
                    <Text>{item.description || "No description..."}</Text>
                  </View>
                  <View
                    style={{
                      width: "90%",
                      flexDirection: "row",
                      justifyContent: "space-between",
                    }}
                  >
                    <Text style={{ marginRight: 10, fontWeight: "bold" }}>
                      <Text style={{ fontWeight: 400 }}>Num. Items: </Text>
                      {total.runningQty}
                    </Text>
                    <Text style={{ marginRight: 10, fontWeight: "bold" }}>
                      <Text style={{ fontWeight: 400 }}>Discount: </Text>
                      {total.runningDiscount}
                    </Text>
                    <Text style={{ marginRight: 10, fontWeight: "bold" }}>
                      <Text style={{ fontWeight: 400 }}>Total: </Text>
                      {total.runningTotal}
                    </Text>
                  </View>
                </View>
                <View
                  style={{
                    width: "5%",
                    justifyContent: "center",
                    height: "100%",
                    alignItems: "center",
                    // backgroundColor: "green",
                  }}
                >
                  <CheckBox_
                    onCheck={() => {}}
                    buttonStyle={{ marginRight: 10 }}
                  />
                </View>
              </View>
            );
          }}
        />
        {/* </View> */}
        <View
          style={{
            width: "100%",
            flexDirection: "row",
            justifyContent: "space-around",
          }}
        >
          <Button_
            icon={ICONS.close1}
            iconSize={60}
            onPress={actionButtonPressed}
          />
        </View>
      </View>
      {/* ) : null} */}
    </View>
  );
};
//   try {
//     return setComponent();
//   } catch (e) {
//     log("Error returning CheckoutComponent", e);
//   }
// };

const SaleComponent = ({}) => {
  return (
    <View
      style={{
        width: "80%",
        height: "80%",
      }}
    >
      {!!acceptsChecks && (
        <View style={{ width: "100%" }}>
          <CheckBox_
            textStyle={{ fontSize: 12 }}
            boxStyle={{ width: 14, height: 14 }}
            text={"Paper Check"}
            onCheck={() => _setIsCheck(!sIsCheck)}
            isChecked={sIsCheck}
            viewStyle={{ alignSelf: "flex-end", marginRight: 20 }}
          />
        </View>
      )}
      <Text
        style={{
          ...checkoutScreenStyle.titleText,
        }}
      >
        Cash Sale
      </Text>

      <Text style={{ ...checkoutScreenStyle.totalTextStyle }}>
        {"Total: $ " + totalAmount}
      </Text>
      {!!splitPayment && (
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{ alignItems: "flex-end", marginRight: 10 }}>
            <Text
              style={{
                marginTop: 10,
                fontSize: 14,
                color: "gray",
              }}
            >
              {"Amount paid:"}
            </Text>

            <Text
              style={{
                marginTop: 10,
                fontSize: 14,
                color: "gray",
              }}
            >
              {"Amount left:"}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text
              style={{
                marginTop: 10,
                fontSize: 14,
                color: "",
              }}
            >
              {"$" + sSplitTotalPaidAlready}
            </Text>
            <Text
              style={{
                marginTop: 10,
                fontSize: 14,
                color: "red",
              }}
            >
              {"$" + sAmountLeftToPay}
            </Text>
          </View>
        </View>
      )}
      <View style={{ flexDirection: "row" }}>
        {!!splitPayment && (
          <View
            style={{
              ...checkoutScreenStyle.boxStyle,
              paddingBottom: 6,
              paddingRight: 7,
              marginTop: 10,
            }}
          >
            <Text style={{ ...checkoutScreenStyle.boxDollarSign }}>$</Text>

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
                style={{
                  ...checkoutScreenStyle.boxText,
                  height: "70%",
                  // backgroundColor: "blue",
                  color: sPaymentAmountTextColor,
                }}
                placeholder="0.00"
                placeholderTextColor={
                  checkoutScreenStyle.boxText.placeholderTextColor
                }
                value={sRequestedAmount}
                onChangeText={(val) => handleTextChange(val)}
                autoFocus={true}
                onKeyPress={handleKeyPress}
              />
              <Text
                style={{
                  fontStyle: "italic",
                  color: "darkgray",
                  fontSize: 12,
                }}
              >
                Pay Amount
              </Text>
            </View>
          </View>
        )}
        <View
          style={{
            marginLeft: 20,
            ...checkoutScreenStyle.boxStyle,
            paddingBottom: 6,
            paddingRight: 7,
            marginTop: 10,
          }}
        >
          <Text style={{ ...checkoutScreenStyle.boxDollarSign }}>$</Text>

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
              style={{
                ...checkoutScreenStyle.boxText,
                height: "70%",
                color: sPaymentAmountTextColor,
                // backgroundColor: "blue",
              }}
              placeholder="0.00"
              placeholderTextColor={
                checkoutScreenStyle.boxText.placeholderTextColor
              }
              value={sTenderAmount}
              onChangeText={(val) => handleTextChange(val, "tender")}
              autoFocus={sInputBoxFocus == "tender" || !splitPayment}
              onKeyPress={handleKeyPress}
              // onFocus={() => _zSetPaymentAmount("")}
            />
            <Text
              style={{
                fontStyle: "italic",
                color: "darkgray",
                fontSize: 12,
              }}
            >
              Tender
            </Text>
          </View>
        </View>
      </View>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-around",
          width: "100%",
          marginTop: checkoutScreenStyle.buttonRowStyle.marginTop,
        }}
      >
        <Button
          buttonStyle={{ backgroundColor: "green" }}
          textStyle={{ color: "white" }}
          visible={sProcessButtonLabel}
          onPress={handleProcessButtonPress}
          text={sProcessButtonLabel ? sProcessButtonLabel : ""}
        />
        <Button onPress={onCancel} text={"Cancel"} />
      </View>
      <Text
        style={{
          ...checkoutScreenStyle.statusText,
          color: "red",
        }}
      >
        {sStatusMessage}
      </Text>

      {/* <View style={{ ...checkoutScreenStyle.loadingIndicatorStyle }}>
        <LoadingIndicator visible={sStatus} />
      </View> */}
    </View>
  );
};

const CashSaleComponent = ({
  totalAmount,
  onCancel,
  isRefund,
  splitPayment,
  onComplete,
  acceptsChecks,
  paymentsArr,
}) => {
  const [sTenderAmount, _setTenderAmount] = useState("");
  const [sRequestedAmount, _setRequestedAmount] = useState("");
  const [sSplitTotalPaidAlready, _setSplitTotalPaidAlready] = useState("");
  const [sAmountLeftToPay, _setAmountLeftToPay] = useState("");
  const [sStatusMessage, _setStatusMessage] = useState("");
  const [sProcessButtonLabel, _setProcessButtonLabel] = useState("");
  const [sIsCheck, _setIsCheck] = useState(false);
  const [sInputBoxFocus, _setInputBoxFocus] = useState(null);
  const [sPaymentAmountTextColor, _setPaymentAmountTextColor] = useState(null);
  const [sTenderAmountTextColor, _setTenderAmountTextColor] = useState(null);

  useEffect(() => {
    let totalPaid = 0.0;
    paymentsArr.forEach((paymentObj) => {
      totalPaid += paymentObj.amount;
    });

    _setSplitTotalPaidAlready(trimToTwoDecimals(totalPaid));
    _setAmountLeftToPay(trimToTwoDecimals(totalAmount - totalPaid));
  }, []);

  function handleTextChange(val, boxName) {
    // log("text change val", val);
    if (LETTERS.includes(val[val.length - 1])) return;
    let formattedVal = val != "." ? formatDecimal(val) : "";

    let tendAmount = Number(sTenderAmount);
    let reqAmount = Number(sRequestedAmount);
    if (boxName == "tender") {
      tendAmount = formattedVal;
    } else {
      reqAmount = formattedVal;
    }

    if (boxName == "tender") {
      tendAmount = formattedVal;
    } else {
      reqAmount = formattedVal;
    }
    let buttonLabel = "Process";
    let textColor = null;

    const minVal = 0.5;
    if (
      splitPayment &&
      (reqAmount < minVal ||
        reqAmount > totalAmount ||
        reqAmount > sAmountLeftToPay ||
        reqAmount > tendAmount)
    ) {
      buttonLabel = null;
      textColor = "red";
    }
    if (
      tendAmount < minVal ||
      (splitPayment && tendAmount < reqAmount) ||
      (!splitPayment && tendAmount < Number(totalAmount))
    ) {
      // log("ten", tendAmount < Number(totalAmount));
      // log("total", totalAmount);
      // log("diff", tendAmount - Number(totalAmount));
      buttonLabel = null;
      textColor = "red";
    }

    boxName == "tender"
      ? _setTenderAmount(formattedVal)
      : _setRequestedAmount(formattedVal);

    _setProcessButtonLabel(buttonLabel);
    _setPaymentAmountTextColor(textColor);
    // _setTenderAmountTextColor(tenderTextColor);
  }

  function handleProcessButtonPress() {
    onComplete({
      amountTendered: Number(sTenderAmount),
      amount: Number(sRequestedAmount || totalAmount),
      isCheck: sIsCheck,
    });
    onCancel();
  }

  function handleKeyPress(event) {
    // log("event", event.nativeEvent.key);
    if (event.nativeEvent.key == "Enter") {
      if (!splitPayment) {
        handleProcessButtonPress();
      } else {
        if (sTenderAmount >= sRequestedAmount) {
          handleProcessButtonPress();
        } else {
          _setInputBoxFocus("tender");
        }
      }
    }
  }
  return (
    <View
      style={{
        ...checkoutScreenStyle.base,
      }}
    >
      {!!acceptsChecks && (
        <View style={{ width: "100%" }}>
          <CheckBox_
            textStyle={{ fontSize: 12 }}
            boxStyle={{ width: 14, height: 14 }}
            text={"Paper Check"}
            onCheck={() => _setIsCheck(!sIsCheck)}
            isChecked={sIsCheck}
            viewStyle={{ alignSelf: "flex-end", marginRight: 20 }}
          />
        </View>
      )}
      <Text
        style={{
          ...checkoutScreenStyle.titleText,
        }}
      >
        Cash Sale
      </Text>

      <Text style={{ ...checkoutScreenStyle.totalTextStyle }}>
        {"Total: $ " + totalAmount}
      </Text>
      {!!splitPayment && (
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{ alignItems: "flex-end", marginRight: 10 }}>
            <Text
              style={{
                marginTop: 10,
                fontSize: 14,
                color: "gray",
              }}
            >
              {"Amount paid:"}
            </Text>

            <Text
              style={{
                marginTop: 10,
                fontSize: 14,
                color: "gray",
              }}
            >
              {"Amount left:"}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text
              style={{
                marginTop: 10,
                fontSize: 14,
                color: "",
              }}
            >
              {"$" + sSplitTotalPaidAlready}
            </Text>
            <Text
              style={{
                marginTop: 10,
                fontSize: 14,
                color: "red",
              }}
            >
              {"$" + sAmountLeftToPay}
            </Text>
          </View>
        </View>
      )}
      <View style={{ flexDirection: "row" }}>
        {!!splitPayment && (
          <View
            style={{
              ...checkoutScreenStyle.boxStyle,
              paddingBottom: 6,
              paddingRight: 7,
              marginTop: 10,
            }}
          >
            <Text style={{ ...checkoutScreenStyle.boxDollarSign }}>$</Text>

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
                style={{
                  ...checkoutScreenStyle.boxText,
                  height: "70%",
                  // backgroundColor: "blue",
                  color: sPaymentAmountTextColor,
                }}
                placeholder="0.00"
                placeholderTextColor={
                  checkoutScreenStyle.boxText.placeholderTextColor
                }
                value={sRequestedAmount}
                onChangeText={(val) => handleTextChange(val)}
                autoFocus={true}
                onKeyPress={handleKeyPress}
              />
              <Text
                style={{
                  fontStyle: "italic",
                  color: "darkgray",
                  fontSize: 12,
                }}
              >
                Pay Amount
              </Text>
            </View>
          </View>
        )}
        <View
          style={{
            marginLeft: 20,
            ...checkoutScreenStyle.boxStyle,
            paddingBottom: 6,
            paddingRight: 7,
            marginTop: 10,
          }}
        >
          <Text style={{ ...checkoutScreenStyle.boxDollarSign }}>$</Text>

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
              style={{
                ...checkoutScreenStyle.boxText,
                height: "70%",
                color: sPaymentAmountTextColor,
                // backgroundColor: "blue",
              }}
              placeholder="0.00"
              placeholderTextColor={
                checkoutScreenStyle.boxText.placeholderTextColor
              }
              value={sTenderAmount}
              onChangeText={(val) => handleTextChange(val, "tender")}
              autoFocus={sInputBoxFocus == "tender" || !splitPayment}
              onKeyPress={handleKeyPress}
              // onFocus={() => _zSetPaymentAmount("")}
            />
            <Text
              style={{
                fontStyle: "italic",
                color: "darkgray",
                fontSize: 12,
              }}
            >
              Tender
            </Text>
          </View>
        </View>
      </View>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-around",
          width: "100%",
          marginTop: checkoutScreenStyle.buttonRowStyle.marginTop,
        }}
      >
        <Button
          buttonStyle={{ backgroundColor: "green" }}
          textStyle={{ color: "white" }}
          visible={sProcessButtonLabel}
          onPress={handleProcessButtonPress}
          text={sProcessButtonLabel ? sProcessButtonLabel : ""}
        />
        <Button onPress={onCancel} text={"Cancel"} />
      </View>
      <Text
        style={{
          ...checkoutScreenStyle.statusText,
          color: "red",
        }}
      >
        {sStatusMessage}
      </Text>

      {/* <View style={{ ...checkoutScreenStyle.loadingIndicatorStyle }}>
        <LoadingIndicator visible={sStatus} />
      </View> */}
    </View>
  );
};

const StripeCreditCardComponent = ({
  onCancel,
  isRefund,
  splitPayment,
  totalAmount,
  onComplete,
  paymentsArr,
}) => {
  // store setters
  const _zSetPaymentIntentID = useStripePaymentStore(
    (state) => state.setPaymentIntentID
  );
  const zResetStripeStore = useStripePaymentStore((state) => state.reset);

  // store getters
  const sCardReader = useStripePaymentStore((state) => state.getReader());
  const zReadersArr = useStripePaymentStore((state) => state.getReadersArr());
  const zPaymentIntentID = useStripePaymentStore((state) =>
    state.getPaymentIntentID()
  );

  /////////////////////////////////////////////////////////////////////////
  const [sStatus, _sSetStatus] = useState(false);
  const [sStatusMessage, _sSetStatusMessage] = useState(
    !splitPayment ? "Starting payment intent..." : "Reader ready"
  );
  const [sStatusTextColor, _sSetStatusTextColor] = useState("green");
  const [sListenerArr, _sSetListenerArr] = useState(null);
  const [sCardWasDeclined, _sSetCardWasDeclined] = useState(false);
  const [sReaderBusy, _sSetReaderBudy] = useState(false);
  const [sPaymentAmount, _setPaymentAmount] = useState(totalAmount);
  const [sSplitTotalPaidAlready, _setSplitTotalPaidAlready] = useState("");
  const [sAmountLeftToPay, _setAmountLeftToPay] = useState("");
  const [sProcessButtonLabel, _setProcessButtonLabel] = useState("");
  const [sTextColor, _setTextColor] = useState(null);
  const [sRunningReader, _setRunningReader] = useState(false);

  //////////////////////////////////////////////////////////////////

  // gather the previous payments made on a split payment
  useEffect(() => {
    if (!splitPayment) return;

    let totalPaid = 0.0;
    paymentsArr.forEach((paymentObj) => {
      totalPaid += paymentObj.amount;
    });

    log("running");
    _setSplitTotalPaidAlready(trimToTwoDecimals(totalPaid));
    _setAmountLeftToPay(trimToTwoDecimals(totalAmount - totalPaid));
  }, []);

  // automatically start card process if not split payment
  useEffect(() => {
    if (!splitPayment && !sRunningReader) {
      startServerDrivenStripePaymentIntent(totalAmount);
      _setRunningReader(true);
    }

    return () => {
      zResetStripeStore();
      if (sListenerArr) {
        sListenerArr.forEach((listener) => listener());
      }
    };
  }, []);

  function handleTextChange(val) {
    if (LETTERS.includes(val[val.length - 1])) return;
    let formattedVal = val != "." ? formatDecimal(val) : "";

    let num = Number(formattedVal);
    let amountLeftToPay = Number(sAmountLeftToPay);

    if (!splitPayment) amountLeftToPay = totalAmount;
    let buttonLabel = "";
    let textColor = "red";
    // log("amount", amountLeftToPay);
    // log("num", num);
    if (num <= amountLeftToPay && num >= 0.5) {
      buttonLabel = "Process";
      textColor = null;
    }

    _setProcessButtonLabel(buttonLabel);
    _setTextColor(textColor);
    _setPaymentAmount(formattedVal);
  }

  function handleKeyPress(event) {
    if (event.nativeEvent.key != "Enter") return;

    let amountLeftToPay = Number(sAmountLeftToPay);
    if (!splitPayment) amountLeftToPay = totalAmount;
    let paymentAmount = Number(sPaymentAmount);

    if (
      splitPayment &&
      paymentAmount >= 0.5 &&
      paymentAmount > amountLeftToPay &&
      paymentAmount <= totalAmount
    ) {
      startServerDrivenStripePaymentIntent(paymentAmount);
    } else if (!splitPayment) {
      startServerDrivenStripePaymentIntent(totalAmount);
    }
  }

  // todo
  function setCurrentReader(reader) {
    // log("cur", reader);
    if (reader?.id) _zSetReader(reader);
  }

  async function startServerDrivenStripePaymentIntent(paymentAmount) {
    log("payment amouint", paymentAmount);
    if (!(paymentAmount > 0)) return;
    _sSetStatus(true);
    _sSetStatusTextColor("red");
    _sSetStatusMessage("Retrieving card reader activation...");
    log("starting server driven payment attempt, amount", paymentAmount);
    // return;

    // readerResult obj contains readerResult object key/val and paymentIntentID key/val
    let paymentIntentID = zPaymentIntentID;
    let readerResult = await dbProcessServerDrivenStripePayment(
      paymentAmount,
      sCardReader.id,
      false,
      paymentIntentID
    );
    console.log("reader result", readerResult);

    if (readerResult == "in_progress") {
      handleStripeReaderActivationError(readerResult);
      _sSetReaderBudy(true);
    } else {
      _sSetReaderBudy(false);
      _sSetStatusTextColor("green");
      _sSetStatusMessage("Waiting for customer...");
      _zSetPaymentIntentID(readerResult.paymentIntentID);
      // log("pi id", readerResult.paymentIntentID);
      let listenerArr = await paymentIntentSubscribe(
        readerResult.paymentIntentID,
        handleStripeCardPaymentDBSubscriptionUpdate,
        readerResult.paymentIntentID
      );
      _sSetListenerArr(listenerArr);
    }
  }

  async function handleStripeReaderActivationError(error) {
    _sSetStatusTextColor("red");
    _sSetStatus(false);
    log("Handling Stripe reader activation error", error);
    let message = "";
    if (error == "in_progress") {
      message =
        "Card Reader in use. Please wait until screen clears, or use a different reader.\n\n If not in use, try resetting the card reader";
    } else {
      switch (error.code) {
        case "terminal_reader_timeout":
          message =
            "Could not connect to reader, possible network issue\n" +
            error.code;
          break;
        case "terminal_reader_offline":
          message =
            "Reader appears to be offline. Please check power and internet connection\n" +
            error.code;
          break;
        case "terminal_reader_busy":
          message = "Reader busy. Please try a different reader\n" + error.code;
          break;
        case "intent_invalid_state":
          message =
            "Invalid payment intent state. Please clear the reader and try again";
          break;
        default:
          message = "Unknown processing error: \n" + error.code;
      }
    }
    _sSetStatusMessage(message);
  }

  function handleStripeCardPaymentDBSubscriptionUpdate(
    type,
    key,
    val,
    zzPaymentIntentID
  ) {
    // log("Stripe webhook properties", type + " : " + key);
    clog("Stripe webhook update Obj", val);
    let failureCode = val?.failure_code;
    if (failureCode == "card_declined") {
      let paymentIntentID = val?.process_payment_intent?.payment_intent;
      log("CARD DECLINED");
      // log("payment intent id", paymentIntentID);
      // log("z payment intent id", zzPaymentIntentID);
      if (paymentIntentID == zzPaymentIntentID) {
        _sSetCardWasDeclined(true);
        _sSetStatusTextColor("red");
        _sSetStatusMessage("Card Declined");
        _sSetStatus(false);
      }
    } else if (key == "complete") {
      _sSetCardWasDeclined(false);
      _sSetStatusTextColor("green");
      _sSetStatusMessage("Payment Complete!");
      _sSetStatus(false);
      clog("Payment complete object", val);
      let paymentMethodDetails = val.payment_method_details.card_present;
      // log("trimming", trimToTwoDecimals(Number(val.amount_captured) / 100));
      // log("num", Number(val.amountCaptured));
      let paymentDetailsObj = {
        last4: paymentMethodDetails.last4,
        cardType: paymentMethodDetails.description,
        issuer: paymentMethodDetails.receipt.application_preferred_name,
        authorizationCode: paymentMethodDetails.receipt.authorization_code,
        paymentIntentID: val.payment_intent,
        chargeID: val.id,
        amount: trimToTwoDecimals(val.amount_captured / 100),
        paymentProcessor: "stripe",
        totalCaptured: trimToTwoDecimals(val.amount_captured / 100),
      };
      clog("Successful Payment details obj", paymentDetailsObj);
      onComplete(paymentDetailsObj);
      setTimeout(() => {
        onCancel();
      }, 1500);
    }
  }

  async function cancelServerDrivenStripePaymentIntent() {
    _sSetStatusTextColor("red");
    _sSetStatusMessage("Canceling payment request...");
    log("canceling server driven payment attempt", sCardReader);
    if (!zPaymentIntentID) {
      onCancel();
      return;
    }
    let readerResult = await dbCancelServerDrivenStripePayment(
      sCardReader?.id,
      zPaymentIntentID
    );

    onCancel();
  }

  async function resetCardReader() {
    let readerResult = await dbCancelServerDrivenStripePayment(
      sCardReader?.id,
      zPaymentIntentID
    );
    onCancel();
  }

  async function clearReader() {
    let readerResult = await dbCancelServerDrivenStripePayment(
      sCardReader?.id,
      zPaymentIntentID
    );

    onCancel();
  }

  return (
    <View
      style={{
        ...checkoutScreenStyle.base,
      }}
    >
      <Text
        style={{
          ...checkoutScreenStyle.titleText,
        }}
      >
        Credit Card Sale
      </Text>
      <Text style={{ ...checkoutScreenStyle.totalTextStyle }}>
        {"Total: $ " + totalAmount}
      </Text>
      {!!splitPayment && (
        <View style={{ alignItems: "center" }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={{ alignItems: "flex-end", marginRight: 10 }}>
              <Text
                style={{
                  marginTop: 10,
                  fontSize: 14,
                  color: "gray",
                }}
              >
                {"Amount paid:"}
              </Text>

              <Text
                style={{
                  marginTop: 10,
                  fontSize: 14,
                  color: "gray",
                }}
              >
                {"Amount left:"}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text
                style={{
                  marginTop: 10,
                  fontSize: 14,
                  color: "gray",
                }}
              >
                {"$" + sSplitTotalPaidAlready}
              </Text>
              <Text
                style={{
                  marginTop: 10,
                  fontSize: 14,
                  color: "red",
                  fontWeight: "500",
                }}
              >
                {"$" + sAmountLeftToPay}
              </Text>
            </View>
          </View>
          <View
            style={{
              ...checkoutScreenStyle.boxStyle,
            }}
          >
            <Text style={{ ...checkoutScreenStyle.boxDollarSign }}>$</Text>
            <TextInput
              style={{
                ...checkoutScreenStyle.boxText,
                color: sTextColor,
              }}
              placeholder="0.00"
              placeholderTextColor={
                checkoutScreenStyle.boxText.placeholderTextColor
              }
              value={sPaymentAmount}
              onChangeText={handleTextChange}
              autoFocus={true}
              onKeyPress={handleKeyPress}
            />
          </View>
        </View>
      )}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-around",
          width: "100%",
          marginTop: checkoutScreenStyle.buttonRowStyle.marginTop,
        }}
      >
        {!!splitPayment && (
          <Button
            onPress={() => startServerDrivenStripePaymentIntent(sPaymentAmount)}
            text={isRefund ? "Process Refund" : "Process Amount"}
            textStyle={{ color: "white" }}
            buttonStyle={{ backgroundColor: "green" }}
            visible={sProcessButtonLabel}
          />
        )}
        <Button
          onPress={cancelServerDrivenStripePaymentIntent}
          text={"Cancel"}
        />
      </View>
      <Text
        style={{
          // fontFamily: "Inter",
          ...checkoutScreenStyle.statusText,
          color: sStatusTextColor,
        }}
      >
        {sStatusMessage}
      </Text>

      <View style={{ ...checkoutScreenStyle.loadingIndicatorStyle }}>
        <LoadingIndicator visible={sStatus} />
      </View>
      <View style={{ width: "100%", alignItems: "flex-end", marginRight: 5 }}>
        <Button
          text={"Reset Reader"}
          textStyle={{ fontSize: 12 }}
          buttonStyle={{
            backgroundColor: "lightgray",
            height: null,
            width: null,
            padding: 5,
            marginRight: 15,
            marginTop: 20,
          }}
          onPress={resetCardReader}
        />
      </View>
    </View>
  );
};

const checkoutScreenStyle = {
  base: {
    alignItems: "center",
    paddingTop: 20,
    width: 500,
    height: 380,
    backgroundColor: "white",
  },
  titleText: {
    fontSize: 30,
    color: "dimgray",
  },
  boxDollarSign: {
    fontSize: 15,
    // marginRight: 5,
  },
  totalText: {
    fontSize: 10,
    color: "darkgray",
  },
  boxText: {
    outlineWidth: 0,
    fontSize: 25,
    textAlign: "right",
    placeholderTextColor: "lightgray",
    // backgroundColor: "green",
    width: "90%",
  },
  buttonText: {
    fontSize: 13,
    fontWeight: Fonts.weight.textRegular,
  },
  boxStyle: {
    marginTop: 5,
    borderColor: Colors.tabMenuButton,
    borderWidth: 2,
    backgroundColor: "whitesmoke",
    padding: 5,
    width: 100,
    height: 50,
    alignItems: "space-between",
    justifyContent: "space-between",
    flexDirection: "row",
  },
  totalTextStyle: {
    marginTop: 15,
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

/* eslint-disable */
import { FlatList, View, Text, TextInput } from "react-native-web";
import { PAYMENT_OBJECT, TAB_NAMES, WORKORDER_PROTO } from "../../../data";
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
  log,
  showAlert,
  trimToTwoDecimals,
} from "../../../utils";
import { useEffect, useState } from "react";
import { COLOR_GRADIENTS, Colors, ICONS } from "../../../styles";
import { sendFCMMessage } from "../../../db";
import {
  dbProcessServerDrivenStripePayment,
  dbRetrieveAvailableStripeReaders,
} from "../../../db_call_wrapper";

export const CheckoutComponent = ({}) => {
  // store setters
  const _zSetOpenWorkorderObj = useOpenWorkordersStore(
    (state) => state.setOpenWorkorderObj
  );
  const _zSetOptionsTabName = useTabNamesStore(
    (state) => state.setOptionsTabName
  );
  const _zSetItemsTabName = useTabNamesStore((state) => state.setItemsTabName);
  const _zSetIsCheckingOut = useCheckoutStore(
    (state) => state.setIsCheckingOut
  );
  const _zSetStripeReaderID = useStripePaymentStore(
    (state) => state.setReaderID
  );
  const _zSetReader = useStripePaymentStore((state) => state.setReader);
  const _zSetReadersArr = useStripePaymentStore((state) => state.setReadersArr);
  const _zSetSplitPayment = useCheckoutStore((state) => state.setSplitPayment);
  const _zSetPaymentArr = useCheckoutStore((state) => state.setPaymentArr);
  const _zSetTotalAmount = useCheckoutStore((state) => state.setTotalAmount);
  const _zSetIsRefund = useCheckoutStore((state) => state.setIsRefund);
  const _zSetInfoTabName = useTabNamesStore((state) => state.setInfoTabName);

  // store getters
  let zOpenWorkorderObj = WORKORDER_PROTO;
  zOpenWorkorderObj = useOpenWorkordersStore((state) =>
    state.getOpenWorkorderObj()
  );
  // const zIsCheckingOut = useCheckoutStore((state) => state.getIsCheckingOut());
  const zOpenWorkordersArr = useOpenWorkordersStore((state) =>
    state.getWorkorderArr()
  );
  const zInventoryArr = useInventoryStore((state) => state.getInventoryArr());
  const zStripeReader = useStripePaymentStore((state) => state.getReader());
  const zSettingsObj = useSettingsStore((state) => state.getSettingsObj());
  const zReadersArr = useStripePaymentStore((state) => state.getReadersArr());
  const zSplitPayment = useCheckoutStore((state) => state.getSplitPayment());
  const zReader = useStripePaymentStore((state) => state.getReader());
  const zPaymentsArr = useCheckoutStore((state) => state.getPaymentArr());
  const zTotalAmount = useCheckoutStore((state) => state.getTotalAmount());
  const zIsRefund = useCheckoutStore((state) => state.getIsRefund());

  //////////////////////////////////////////////////////////////////////
  const [sHasOtherOpenWorkorders, _sSetHasOtherOpenworkorders] = useState(null);
  const [sTotalsObj, _sSetTotalsObj] = useState({
    total: 0,
    discount: 0,
  });
  const [sTotalAmountCaptured, _setTotalAmountCaptured] = useState(0);
  const [sPaymentComplete, _setPaymentComplete] = useState(false);
  const [sCashChangeNeeded, _setCashChangeNeeded] = useState(0);
  const [sShowCreditCardModal, _sSetShowCreditCardModal] = useState(false);
  const [sShowCashSaleModal, _sSetShowCashSaleModal] = useState(false);
  const [sStripeTerminalReady, _sSetStripeTerminalReady] = useState(false);
  const [sCardPaymenDetailsObj, _sSetCardPaymentDetailsObj] = useState({
    cardType: "",
    lastFour: "",
    expMonth: "",
    expYear: "",
    issuer: "",
    transactionNum: "",
  });
  const [sRefundScan, _sSetRefundScan] = useState("");

  // todo set reader available flag
  useEffect(() => {
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
    if (zReader?.id) {
      // log("warming up Stripe reader");
      dbProcessServerDrivenStripePayment(0, zReader.id, true);
    }
  }, [zReader]);

  // get total from open workorder/sale
  // TODO need to add in combined workorders after completed the next effect
  useEffect(() => {
    // log("z", zWorkorderObj);
    if (!zOpenWorkorderObj?.workorderLines) return;
    const { runningQty, runningTotal, runningDiscount } =
      calculateRunningTotals(zOpenWorkorderObj, zInventoryArr);
    _sSetTotalsObj({ total: runningTotal, discount: runningDiscount });
  }, [zOpenWorkorderObj]);

  // TODO check for other open workorders and add them in a checklist to combine
  useEffect(() => {
    if (!zOpenWorkorderObj || zOpenWorkorderObj.isStandaloneSale) return;

    let otherWorkorders = zOpenWorkordersArr.find(
      (o) => o.customerID == zOpenWorkorderObj.customerID
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
    _zSetReadersArr(readers?.data);
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

    _zSetReader(readers.data[0]); // todo
    //todo the reader will return as connected but the status is "offline", handle this
  }

  function getAllCustomerOpenWorkorders() {
    let workorders = [];
    zOpenWorkordersArr.forEach((openWO) => {
      if (
        openWO?.customerID == zOpenWorkorderObj?.customerID &&
        openWO.id != zOpenWorkorderObj?.id
      )
        workorders.push(openWO);
    });
    // clog("workorder", workorders);
    return workorders;
  }

  const handlePaymentSuccess = async (
    incomingPayment = { amountTendered, amount, isCheck }
  ) => {
    log("incoming payment success obj in Checkout Component", paymentObj);
    let paymentObj = cloneDeep(PAYMENT_OBJECT);
    paymentObj.last4 = incomingPayment.last4; // check this, add more cc details below

    paymentObj.amountCaptured = incomingPayment.amount;
    paymentObj.amountTendered = incomingPayment.amountTendered;
    paymentObj.saleID = generateRandomID();
    paymentObj.cash = !incomingPayment.isCheck;
    paymentObj.check = incomingPayment.isCheck;
    let millis = new Date().getTime;
    paymentObj.millis = millis;

    // if (sSpli)

    // paymentObj.customerID = zCustomerObj.get // import this zustand object

    let paymentsArr = cloneDeep(zPaymentsArr);

    // move everthing to an un-cancelable modal for the duration of the sale

    paymentsArr.push(paymentObj);
    let totalCaptured = 0;
    paymentsArr.forEach(
      (paymentObj) => (totalCaptured += Number(paymentObj.amount))
    );
    // log("total captured", totalCaptured);

    let changeNeeded;
    if (!cardSale) {
      changeNeeded = trimToTwoDecimals(
        Number(paymentObj.amountTendered) - Number(paymentObj.amount)
      );
    }

    // log("total caputured", totalCaptured);
    if (Number(zTotalAmount) == totalCaptured) {
      _setPaymentComplete(true);
      log("Payment complete!");
    }

    let saleObj = _setCashChangeNeeded(changeNeeded);

    _setTotalAmountCaptured(totalCaptured);
    _zSetPaymentArr(paymentsArr);
  };

  const handleRefundSuccess = async (paymentObj) => {};

  const handleRefundScan = async (text) => {
    log("incoming refund text", text);
    _sSetRefundScan(text);
  };

  const handleSplitPaymentPress = () => {
    if (zPaymentsArr.length > 0 && zSplitPayment) {
      log("fix later");
      // todo error message cannot unsplit payment box after a payment is made towards the total
    } else {
      _zSetSplitPayment(!zSplitPayment);
    }
  };

  function actionButtonPressed() {
    // _zSetIsCheckingOut(!zIsCheckingOut);
    if (zOpenWorkorderObj?.isStandaloneSale) {
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

  function setComponent() {
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
          modalVisible={sShowCreditCardModal || sShowCashSaleModal}
          showShadow={true}
          shadowStyle={{ ...SHADOW_RADIUS_PROTO }}
          Component={() => {
            if (sShowCreditCardModal)
              return (
                <StripeCreditCardModalComponent
                  onCancel={() => {
                    _sSetShowCreditCardModal(false);
                    _zSetIsRefund(false);
                  }}
                  isRefund={zIsRefund}
                  totalAmount={sTotalsObj.total - sTotalsObj.discount}
                  splitPayment={zSplitPayment}
                  onComplete={handlePaymentSuccess}
                  paymentsArr={zPaymentsArr}
                />
              );
            return (
              <CashSaleModalComponent
                onCancel={() => _sSetShowCashSaleModal(false)}
                totalAmount={sTotalsObj.total - sTotalsObj.discount}
                onComplete={handlePaymentSuccess}
                isRefund={zIsRefund}
                splitPayment={zSplitPayment}
                acceptsChecks={zSettingsObj.acceptChecks}
                paymentsArr={zPaymentsArr}
              />
            );
          }}
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
              isChecked={zIsRefund}
              onCheck={() => {
                if (!zIsRefund) _zSetSplitPayment(false);
                sTotalAmountCaptured ? null : _zSetIsRefund(!zIsRefund);
              }}
            />
            {zIsRefund ? (
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
            ) : null}
          </View>
          <CheckBox_
            text={"Split Payment"}
            isChecked={zSplitPayment}
            onCheck={() => {
              if (!zSplitPayment) _zSetIsRefund(false);
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
            {sTotalAmountCaptured == zTotalAmount ? (
              <Text>Sale Complete!</Text>
            ) : null}
            {zSplitPayment ? (
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
                    {trimToTwoDecimals(zTotalAmount - sTotalAmountCaptured)}
                  </Text>
                </View>
              </View>
            ) : null}
          </View>

          {sPaymentComplete ? (
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
          ) : null}
          {sCashChangeNeeded ? (
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
          ) : null}
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
  }
  try {
    return setComponent();
  } catch (e) {
    log("Error returning CheckoutComponent", e);
  }
};

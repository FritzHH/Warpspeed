/* eslint-disable */
import { FlatList, View, Text, TextInput } from "react-native-web";
import { TAB_NAMES, WORKORDER_PROTO } from "../../data";
import {
  useCheckoutStore,
  useCurrentWorkorderStore,
  useInventoryStore,
  useOpenWorkordersStore,
  useSettingsStore,
  useStripePaymentStore,
  useTabNamesStore,
} from "../../stores";
import * as XLSX from "xlsx";

import {
  BicycleSpinner,
  Button,
  CashSaleModalComponent,
  CheckBox,
  StripeCreditCardModalComponent,
  FileInput,
  LoadingIndicator,
  PaymentComponent,
  ScreenModal,
  SHADOW_RADIUS_PROTO,
} from "../../components";
import { cloneDeep } from "lodash";
import {
  calculateRunningTotals,
  clog,
  generateRandomID,
  log,
} from "../../utils";
import { useEffect, useState } from "react";
import { Colors } from "../../styles";
import { sendFCMMessage } from "../../db";
import {
  dbProcessServerDrivenStripePayment,
  dbRetrieveAvailableStripeReaders,
} from "../../db_call_wrapper";

export const Info_CheckoutComponent = ({}) => {
  // store setters
  const _zSetOpenWorkorderObj = useCurrentWorkorderStore(
    (state) => state.setWorkorderObj
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

  // store getters
  let zWorkorderObj = WORKORDER_PROTO;
  zWorkorderObj = useCurrentWorkorderStore((state) => state.getWorkorderObj());
  const zIsCheckingOut = useCheckoutStore((state) => state.getIsCheckingOut());
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
  const zTotalCaptured = useCheckoutStore((state) => state.getTotalCaptured());

  //////////////////////////////////////////////////////////////////////
  const [sHasOtherOpenWorkorders, _sSetHasOtherOpenworkorders] = useState(null);
  const [sTotalsObj, _sSetTotalsObj] = useState({
    runningQty: "0.00",
    runningTotal: "0.00",
    runningDiscount: "0.00",
  });
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

  // when a card payment succeeds, check for split payment
  useEffect(() => {
    log("card details obj", sCardPaymenDetailsObj);
    if (sCardPaymenDetailsObj?.last4) {
      log("splitting payment");
    }
  }, [sCardPaymenDetailsObj]);

  useEffect(() => {
    if (zReader?.id) {
      // log("warming up Stripe reader");
      dbProcessServerDrivenStripePayment(0, zReader.id, true);
    }
  }, [zReader]);

  async function getAllAvailableStripeReaders() {
    let readers = await dbRetrieveAvailableStripeReaders();
    _zSetReadersArr(readers.data);
    _zSetReader(readers.data[0]); // dev
    log("connected card readers", readers.data);
  }

  useEffect(() => {
    // log("z", zWorkorderObj);
    if (!zWorkorderObj?.workorderLines) return;
    const { runningQty, runningTotal, runningDiscount } =
      calculateRunningTotals(zWorkorderObj, zInventoryArr);
    _sSetTotalsObj({ runningQty, runningTotal, runningDiscount });
  }, [zWorkorderObj]);

  // check for other open workorders
  useEffect(() => {
    if (!zWorkorderObj || zWorkorderObj.isStandaloneSale) return;

    let otherWorkorders = zOpenWorkordersArr.find(
      (o) => o.customerID == zWorkorderObj.customerID
    );
    // log("others", otherWorkorders);
  }, []);

  function actionButtonPressed() {
    _zSetIsCheckingOut(!zIsCheckingOut);
    if (zWorkorderObj?.isStandaloneSale) {
      _zSetOpenWorkorderObj(null);
      _zSetOptionsTabName(TAB_NAMES.optionsTab.workorders);
      return;
    }

    let wo = cloneDeep(WORKORDER_PROTO);
    wo.isStandaloneSale = true;
    wo.id = generateRandomID();
    _zSetOpenWorkorderObj(wo);
    _zSetOptionsTabName(TAB_NAMES.optionsTab.quickItems);
    _zSetItemsTabName(TAB_NAMES.itemsTab.workorderItems);
  }

  function getAllCustomerOpenWorkorders() {
    let workorders = [];
    zOpenWorkordersArr.forEach((openWO) => {
      if (
        openWO?.customerID == zWorkorderObj?.customerID &&
        openWO.id != zWorkorderObj?.id
      )
        workorders.push(openWO);
    });
    // clog("workorder", workorders);
    return workorders;
  }

  const handlePaymentSuccess = async ({ cardObj, cashObj }) => {
    let paymentObj = {
      cardObj,
      cashObj,
    };
    let paymentsArr = cloneDeep(zPaymentsArr);
    paymentsArr.push(paymentObj);
    clog(paymentsArr);
    let complete = false;
    let total = 0;
    paymentsArr.forEach((paymentObj) => {});
    _zSetPaymentArr(paymentsArr);
  };

  const handleRefundSuccess = async (amount, type) => {};

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
                cardDetailsObj={(val) => _sSetCardPaymentDetailsObj(val)}
                isRefund={zIsRefund}
                totalAmount={zTotalAmount}
                splitPayment={zSplitPayment}
                onComplete={handlePaymentSuccess}
                paymentsArr={zPaymentsArr}
              />
            );
          return (
            <CashSaleModalComponent
              onCancel={() => _sSetShowCashSaleModal(false)}
              totalAmount={zTotalAmount}
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
          <CheckBox
            viewStyle={{ marginRight: 5 }}
            text={"Refund"}
            isChecked={zIsRefund}
            onCheck={() => _zSetIsRefund(!zIsRefund)}
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
        <CheckBox
          text={"Split Payment"}
          isChecked={zSplitPayment}
          onCheck={handleSplitPaymentPress}
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
          <Button
            textStyle={{ color: "white" }}
            buttonStyle={{
              width: 150,
              height: 40,
              backgroundColor: "green",
              borderRadius: 2,
            }}
            text={"Cash / Check"}
            onPress={() => _sSetShowCashSaleModal(true)}
          />
          <Button
            textStyle={{ color: "white" }}
            buttonStyle={{
              width: 150,
              height: 40,
              backgroundColor: "green",
              borderRadius: 2,
            }}
            text={"Card"}
            onPress={() => _sSetShowCreditCardModal(true)}
          />
        </View>
      </View>
      <View
        style={{
          marginTop: 10,
          width: "100%",
          height: 20,
        }}
      >
        {zTotalAmount == zTotalCaptured ? (
          <View
            style={{
              flexDirection: "row",
              width: "100%",
              justifyContent: "space-around",
            }}
          >
            <Button
              textStyle={{ color: "white" }}
              buttonStyle={{
                width: 100,
                height: 20,
                backgroundColor: "gray",
                borderRadius: 2,
              }}
              text={"Email"}
              onPress={() => {}}
            />
            <Button
              textStyle={{ color: "white" }}
              buttonStyle={{
                width: 100,
                height: 20,
                backgroundColor: "gray",
                borderRadius: 2,
              }}
              text={"Print"}
              onPress={() => {}}
            />
            <Button
              textStyle={{ color: "white" }}
              buttonStyle={{
                width: 100,
                height: 20,
                backgroundColor: "gray",
                borderRadius: 2,
              }}
              text={"Text"}
              onPress={() => {}}
            />
          </View>
        ) : null}
      </View>
      {/* </View> */}
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
                  <CheckBox
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
          <Button
            textStyle={{ color: "white" }}
            buttonStyle={{
              backgroundColor: Colors.tabMenuButton,
              height: 35,
              width: 150,
            }}
            text={"Exit Checkout"}
            onPress={actionButtonPressed}
          />
          {/* <Button
          textStyle={{ color: "white" }}
          buttonStyle={{
            backgroundColor: Colors.tabMenuButton,
            height: 35,
            width: 150,
          }}
          text={!zWorkorderObj?.isStandaloneSale ? "New Sale" : "Cancel Sale"}
          onPress={actionButtonPressed}
        /> */}
        </View>
      </View>
      {/* ) : null} */}
    </View>
  );
};

/* eslint-disable */
import { FlatList, View, Text } from "react-native-web";
import { TAB_NAMES, WORKORDER_PROTO } from "../../data";
import {
  useCheckoutStore,
  useCurrentWorkorderStore,
  useInventoryStore,
  useOpenWorkordersStore,
  useTabNamesStore,
} from "../../stores";
import * as XLSX from "xlsx";

import {
  Button,
  CashSaleModalComponent,
  CheckBox,
  CreditCardModalComponent,
  FileInput,
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

export const Info_CheckoutComponent = ({}) => {
  // setters
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

  // getters
  let zWorkorderObj = WORKORDER_PROTO;
  zWorkorderObj = useCurrentWorkorderStore((state) => state.getWorkorderObj());
  const zIsCheckingOut = useCheckoutStore((state) => state.getIsCheckingOut());
  const zOpenWorkordersArr = useOpenWorkordersStore((state) =>
    state.getWorkorderArr()
  );
  const zInventoryArr = useInventoryStore((state) => state.getInventoryArr());
  //////////////////////////////////////////////////////////////////////
  const [sHasOtherOpenWorkorders, _sSetHasOtherOpenworkorders] = useState(null);
  const [sTotalsObj, _zSetTotalsObj] = useState({
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

  useEffect(() => {
    // log("z", zWorkorderObj);
    if (!zWorkorderObj?.workorderLines) return;
    const { runningQty, runningTotal, runningDiscount } =
      calculateRunningTotals(zWorkorderObj, zInventoryArr);
    _zSetTotalsObj({ runningQty, runningTotal, runningDiscount });
  }, [zWorkorderObj]);

  // check for other open workorders
  useEffect(() => {
    if (!zWorkorderObj || zWorkorderObj.isStandaloneSale) return;
    let otherWorkorders = zOpenWorkordersArr.find(
      (o) => o.customerID == zWorkorderObj.customerID
    );
    // log("others", otherWorkorders);
  }, []);

  // for testing, wait for stripe terminal to load
  useEffect(() => {
    if (zInventoryArr.length > 0) _sSetStripeTerminalReady(true);
  }, [zInventoryArr]);

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

  const handleCreditCardPaymentAmount = async (amount) => {};

  return (
    <View
      style={{
        width: "100%",
        height: "100%",
        // backgroundColor: "magenta",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <ScreenModal
        buttonVisible={false}
        showOuterModal={true}
        modalVisible={sShowCreditCardModal || sShowCashSaleModal}
        showShadow={true}
        shadowStyle={{ ...SHADOW_RADIUS_PROTO }}
        // buttonLabel="Card"
        Component={() => {
          if (sShowCreditCardModal)
            return (
              <CreditCardModalComponent
                onCancel={() => _sSetShowCreditCardModal(false)}
                setPaymentAmount={handleCreditCardPaymentAmount}
                onCardDetailObj={(val) => _sSetCardPaymentDetailsObj(val)}
              />
            );
          return (
            <CashSaleModalComponent
              onCancel={() => _sSetShowCashSaleModal(false)}
              amount={"20.45"}
            />
          );
        }}
      />

      {/* <FileInput handleBinaryString={handleUpload} /> */}
      {/* <View style={{ backgroundColor: null, width: "100%", height: "100%" }}>
        <Elements stripe={stripePromise} options={{}}>
          <PaymentComponent1 />
        </Elements>
      </View> */}
      {/* {!zIsCheckingOut ? (
        <View
          style={{
            height: "85%",
            width: "100%",
            // backgroundColor: "yellow",
            alignItems: "center",
            justifyContent: "flex-start",
            // paddingTop: 100,
          }}
        ></View>
      ) : null}
      {zIsCheckingOut ? ( */}
      <View
        style={{
          height: "85%",
          width: "100%",
          backgroundColor: "blue",
          alignItems: "center",
          justifyContent: "flex-start",
        }}
      >
        <View
          style={{
            height: "20%",
            width: "100%",
            backgroundColor: "white",
            justifyContent: "space-around",
            alignItems: "center",
            flexDirection: "column",
          }}
        >
          <Button
            textStyle={{ color: "white" }}
            buttonStyle={{
              width: 200,
              height: 40,
              backgroundColor: "green",
              borderRadius: 80,
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
              borderRadius: 80,
            }}
            text={"Card"}
            onPress={() => _sSetShowCreditCardModal(true)}
          />
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
                    <CheckBox
                      onCheck={() => {}}
                      buttonStyle={{ marginRight: 10 }}
                    />
                  </View>
                </View>
              );
            }}
          />
        </View>
      </View>
      {/* ) : null} */}
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
          text={"Start Workorder"}
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
  );
};

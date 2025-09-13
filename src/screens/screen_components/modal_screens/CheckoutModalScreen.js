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
} from "../../../components";
import { cloneDeep, initial } from "lodash";
import {
  addDashesToPhone,
  applyLineItemDiscounts,
  arrayAddObjCheckForDupes,
  calculateRunningTotals,
  checkInputForNumbersOnly,
  clog,
  formatDecimal,
  formatNumberForCurrencyDisplay,
  fuzzySearch,
  generateRandomID,
  generateUPCBarcode,
  getRgbFromNamedColor,
  lightenRGBByPercent,
  log,
  makeGrey,
  roundToTwoDecimals,
  showAlert,
  trimToTwoDecimals,
} from "../../../utils";
import React, { useCallback, useEffect, useState } from "react";
import { C, COLOR_GRADIENTS, Colors, Fonts, ICONS } from "../../../styles";
import { sendFCMMessage } from "../../../db";
import {
  dbCancelServerDrivenStripePayment,
  dbGetClosedWorkorderItem,
  dbGetOpenWorkorderItem,
  dbGetSaleItem,
  dbProcessServerDrivenStripePayment,
  dbRetrieveAvailableStripeReaders,
  dbSetSalesObj,
  dbSubscribeToStripePaymentProcess,
} from "../../../db_call_wrapper";
import { TouchableOpacity } from "react-native";
import {
  STRIPE_GET_AVAIALABLE_STRIPE_READERS_URL,
  STRIPE_INITIATE_PAYMENT_INTENT_URL,
} from "../../../private_user_constants";

const RED_COLOR = lightenRGBByPercent(getRgbFromNamedColor("red"), 20);

export function CheckoutModalScreen({ openWorkorder }) {
  // store setters
  const _zSetOpenWorkorderObj = useOpenWorkordersStore(
    (state) => state.setOpenWorkorderObj
  );
  const _zSetOptionsTabName = useTabNamesStore(
    (state) => state.setOptionsTabName
  );
  const _zSetItemsTabName = useTabNamesStore((state) => state.setItemsTabName);
  const _zSetInfoTabName = useTabNamesStore((state) => state.setInfoTabName);
  const _zSetIsCheckingOut = useCheckoutStore(
    (state) => state.setIsCheckingOut
  );
  const _zSetWorkorder = useOpenWorkordersStore((state) => state.setWorkorder);
  const _zSetOpenWorkorder = useOpenWorkordersStore(
    (state) => state.setInitialOpenWorkorderObj
  );

  // store getters
  const zOpenWorkorderObj = useOpenWorkordersStore((state) =>
    state.getOpenWorkorderObj()
  );
  const zIsCheckingOut = useCheckoutStore((state) => state.getIsCheckingOut());
  const zCustomerObj = useCurrentCustomerStore((state) =>
    state.getCustomerObj()
  );
  const zOpenWorkordersArr = useOpenWorkordersStore((state) =>
    state.getWorkorderArr()
  );
  const zInventoryArr = useInventoryStore((state) => state.getInventoryArr());
  const zGetInventoryItem = useInventoryStore(
    (state) => state.getInventoryItem
  );
  const zSettingsObj = useSettingsStore((state) => state.getSettingsObj());
  //////////////////////////////////////////////////////////////////////

  const [sRefundScan, _sSetRefundScan] = useState();
  const [sIsRefund, _setIsRefund] = useState(false);
  const [sRefundSaleObj, _setRefundSaleObj] = useState(null);
  const [sTotalAmount, _setTotalAmount] = useState(0);
  const [sSubtotalAmount, _setSubtotalAmount] = useState(0);
  const [sTotalDiscountAmount, _setTotalDiscountAmount] = useState(0);
  const [sTotalTaxAmount, _setTotalTaxAmount] = useState(0);

  const [sCombinedWorkordersArr, _setCombinedWorkordersArr] = useState([
    zOpenWorkorderObj,
  ]);
  const [sAmountLeftToPay, _setAmountLeftToPay] = useState();
  const [sSaleObj, _setSaleObj] = useState();
  const [sSearchString, _setSearchString] = useState("");
  const [sInventorySearchRes, _setInventorySearchRes] = useState([]);
  const [sFocusedItem, _setFocusedItem] = useState("");
  const [sCashSaleActive, _setCashSaleActive] = useState(true);
  const [sCardSaleActive, _setCardSaleActive] = useState(true);
  const [sRefundScanMessage, _setRefundScanMessage] = useState("");
  const [sTransactionComplete, _setTransactionComplete] = useState(false);
  const [sRefundAmount, _setRefundAmount] = useState(0);
  const [sRefundItemArr, _setRefundItemArr] = useState([]);

  // watch the combined workorders array and adjust accordingly
  let scan = "932730115940"; // test
  useEffect(() => {
    // log("rendering");
    // clog("open", zOpenWorkorderObj);
    // clog("combined", sCombinedWorkordersArr);
    // clog("arr", sCombinedWorkordersArr);
    setTotals();
    // if (zOpenWorkorderObj) {
    _sSetRefundScan(scan);
    // handleRefundScan(scan);
    // }
  }, [
    zOpenWorkorderObj,
    sCombinedWorkordersArr,
    zSettingsObj,
    sSaleObj,
    sIsRefund,
  ]);

  // watch refund text box and go find the receipt when upc entered

  function setTotals(workorder) {
    // clog(wo);
    let {
      runningQty,
      runningSubtotal,
      runningTotal,
      runningDiscount,
      runningTax,
    } = calculateRunningTotals(
      workorder || sCombinedWorkordersArr,
      zSettingsObj?.salesTax
    );

    // log(runningTax);
    _setSubtotalAmount(runningSubtotal);
    _setTotalDiscountAmount(runningDiscount);
    _setTotalTaxAmount(runningTax);
    _setTotalAmount(runningTax + runningTotal);

    // now run through the payments, update the amountLeftToPay field
    // calculate total paid on this workorder
    let totalPaid = 0;
    sSaleObj?.paymentArr.forEach((paymentObj) => {
      totalPaid += paymentObj.amountCaptured;
    });

    let amountLeftToPay = roundToTwoDecimals(
      runningTax + runningTotal - totalPaid
    );

    _setAmountLeftToPay(amountLeftToPay);
    if (amountLeftToPay === 0 && !sIsRefund) {
      _setTransactionComplete(true);
    }

    // if (sIs)
  }

  function handlePaymentCapture(paymentObj = PAYMENT_OBJECT_PROTO) {
    // let saleObj = openW
    // create or find existing sale object
    let saleObj = cloneDeep(sSaleObj);
    if (!sSaleObj) {
      saleObj = cloneDeep(SALE_OBJECT_PROTO);
      saleObj.id = generateUPCBarcode();
      saleObj.millis = new Date().getTime();
      saleObj.subtotal = sSubtotalAmount;
      saleObj.discount = sTotalDiscountAmount;
      saleObj.salesTax = sTotalTaxAmount;
      saleObj.total = sTotalAmount;
    }

    //************************************************************** */
    // need to send print object here

    // add payment obj to sale obj
    saleObj.amountCaptured = saleObj.amountCaptured + paymentObj.amountCaptured;
    paymentObj.saleID = saleObj.id;
    saleObj.paymentArr.push(paymentObj);

    // calculate total paid on this workorder
    // let totalPaid = 0;
    // saleObj.paymentArr.forEach((paymentObj) => {
    //   // log("captured", paymentObj.amountCaptured);
    //   totalPaid += roundToTwoDecimals(paymentObj.amountCaptured);
    // });

    // // log("total paid", totalPaid);

    sCombinedWorkordersArr.forEach((wo) => {
      wo.saleID = saleObj.id;

      let found = saleObj.workorderIDArr.find((id) => id === wo.id);
      if (!found) saleObj.workorderIDArr.push(wo.id);

      if (saleObj.amountCaptured === sTotalAmount) {
        wo.paymentComplete = true;
      }
      _zSetWorkorder(wo); // send to db
    });

    if (saleObj.amountCaptured === sTotalAmount) _setTransactionComplete(true);

    // log("total amount", sTotalAmount);
    _setAmountLeftToPay(sTotalAmount - saleObj.amountCaptured);
    _setSaleObj(saleObj);
    dbSetSalesObj(saleObj);
  }

  function handleCombineWorkorderCheck(wo) {
    if (sCombinedWorkordersArr.find((o) => o.id === wo.id)) {
      _setCombinedWorkordersArr(
        sCombinedWorkordersArr.filter((o) => o.id !== wo.id)
      );
      return;
    }

    _setCombinedWorkordersArr([...sCombinedWorkordersArr, wo]);
  }

  function handleRefundScan(refundScan) {
    if (refundScan.length === 12) {
      _setRefundScanMessage("Searching for transaction...");
      _setCombinedWorkordersArr([]);
      _setIsRefund(true);

      let combinedWorkorderArr = [];
      dbGetSaleItem(refundScan)
        .then((res) => {
          if (res) {
            // log("found");
            _setRefundScanMessage("Transaction Found!");
            _setRefundSaleObj(res);
            let count = 0;
            let max = res.workorderIDArr.length;
            res.workorderIDArr.forEach((workorderID) => {
              dbGetOpenWorkorderItem(workorderID).then((res) => {
                if (res) addToCombinedArr(res);
              });
              dbGetClosedWorkorderItem(workorderID).then((res) => {
                if (res) addToCombinedArr(res);
              });
            });
          } else {
            // todo message does not exist
            _setRefundScanMessage("This sale ID does not exist");
          }
        })
        .catch((e) => log("refund error", e));
    } else if (refundScan.length > 0) {
      _setRefundScanMessage("Enter 12-digit sale ID");
    } else {
      _setRefundScanMessage("");
    }
  }

  function addToCombinedArr(workorderObj) {
    // clog(workorderObj);
    let arr = cloneDeep(sCombinedWorkordersArr);
    if (!arr.find((o) => o.id === workorderObj.id)) arr.push(workorderObj);
    _setCombinedWorkordersArr(arr);
  }

  useEffect(() => {
    // clog("combined", sCombinedWorkordersArr);
  }, [sCombinedWorkordersArr]);

  function searchInventory(searchStr) {
    let split = searchStr.split(" ");
    if (searchStr.length < 3) return;
    _setSearchString(searchStr);
    let res = fuzzySearch(split, zInventoryArr);
    // clog(res);
    _setInventorySearchRes(res);
  }

  function handleInventorySelect(invItem) {
    let wo = cloneDeep(zOpenWorkorderObj);
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
    let arr = sCombinedWorkordersArr.map((o) => (o.id === wo.id ? wo : o));
    // clog(arr);
    _setCombinedWorkordersArr(arr);
  }

  function closeCheckoutScreenModal() {
    _zSetIsCheckingOut(false);
  }

  // clog(zCustomerObj);
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
            // justifyContent: "center",
            // alignItems: "center",
            flexDirection: "row",
            backgroundColor: C.backgroundWhite,
            width: "80%",
            height: "85%",
            borderRadius: 15,
            ...SHADOW_RADIUS_PROTO,
            shadowColor: C.green,
          }}
        >
          <View
            style={{
              width: "30%",
              height: "100%",
              justifyContent: "space-around",
              paddingVertical: 20,
              paddingLeft: 20,
            }}
          >
            <CashSaleComponent
              isRefund={sIsRefund}
              onComplete={handlePaymentCapture}
              onCancel={() => {}}
              sAmountLeftToPay={sAmountLeftToPay}
              acceptsChecks={zSettingsObj?.acceptChecks}
              sCashSaleActive={sCashSaleActive}
              sTransactionComplete={sTransactionComplete}
              sRefundAmount={sRefundAmount}
            />
            <StripeCreditCardComponent
              sCardSaleActive={sCardSaleActive}
              isRefund={sIsRefund}
              onComplete={handlePaymentCapture}
              onCancel={() => {}}
              sAmountLeftToPay={sAmountLeftToPay}
              zSettingsObj={zSettingsObj}
              sTransactionComplete={sTransactionComplete}
              sRefundAmount={sRefundAmount}
            />
          </View>

          <View
            style={{
              width: "30%",
              height: "100%",
              padding: 20,
            }}
          >
            <Button_
              text={"Press Meee"}
              onPress={() => handleRefundScan(sRefundScan)}
            />
            <MiddleItemComponent
              sTotalAmount={sTotalAmount}
              sTotalDiscountAmount={sTotalDiscountAmount}
              zCustomerObj={zCustomerObj}
              sIsRefund={sIsRefund}
              sRefundScan={sRefundScan}
              _sSetRefundScan={handleRefundScan}
              sSubtotalAmount={sSubtotalAmount}
              sTotalTaxAmount={sTotalTaxAmount}
              _zSetIsCheckingOut={_zSetIsCheckingOut}
              handleCancelPress={closeCheckoutScreenModal}
              paymentsArr={sSaleObj?.paymentArr}
              sAmountLeftToPay={sAmountLeftToPay}
              sFocusedItem={sFocusedItem}
              _setFocusedItem={_setFocusedItem}
              _setIsRefund={_setIsRefund}
              sScanFailureMessage={sRefundScanMessage}
              _setScanFailureMessage={_setRefundScanMessage}
              sTransactionComplete={sTransactionComplete}
              sRefundAmount={sRefundAmount}
              _setRefundAmount={_setRefundAmount}
            />
          </View>

          <View style={{ width: "40%", padding: 20 }}>
            {!sIsRefund ? (
              <View
                style={{
                  flexDirection: "row",
                  width: "100%",
                  paddingHorizontal: 10,
                }}
              >
                <TextInput
                  disabled={sTransactionComplete || sIsRefund}
                  onFocus={() => _setFocusedItem("search")}
                  autoFocus={sFocusedItem === "search"}
                  style={{
                    borderBottomColor: makeGrey(0.3),
                    borderBottomWidth: 1,
                    width: "100%",
                    marginBottom: 10,
                    fontSize: 16,
                    color: C.textMain,
                    outlineWidth: 0,
                  }}
                  value={sSearchString}
                  onChangeText={(val) => {
                    _setSearchString(val);
                    searchInventory(val);
                  }}
                  placeholder="Scan or search inventory..."
                  placeholderTextColor={makeGrey(0.3)}
                />
              </View>
            ) : null}

            {/** workorders scrollview list element  ////////// */}
            {sSearchString.length > 1 ? (
              <InventoryListComponent
                inventoryObjArr={sInventorySearchRes}
                onSelect={handleInventorySelect}
                quickItemButtons={zSettingsObj.quickItemButtons}
                _setSearchStr={_setSearchString}
                sTransactionComplete={sTransactionComplete}
              />
            ) : (
              <WorkorderListComponent
                sCombinedWorkordersArr={sCombinedWorkordersArr}
                zOpenWorkorderObj={zOpenWorkorderObj}
                zOpenWorkordersArr={zOpenWorkordersArr}
                zInventoryArr={zInventoryArr}
                zCustomerObj={zCustomerObj}
                zSettingsObj={zSettingsObj}
                zGetInventoryItem={zGetInventoryItem}
                handleCombineWorkorderCheck={handleCombineWorkorderCheck}
                sAmountLeftToPay={sAmountLeftToPay}
                isRefund={sIsRefund}
                sTransactionComplete={sTransactionComplete}
                _setRefundItemArr={_setRefundItemArr}
                sRefundItemArr={sRefundItemArr}
              />
            )}
          </View>
        </View>
      )}
    />
  );
}

const MiddleItemComponent = ({
  sPaymentsCaptured,
  sTotalAmount,
  sTotalDiscountAmount,
  sAmountLeftToPay,
  zCustomerObj,
  sIsRefund,
  sRefundScan,
  _sSetRefundScan,
  sTotalTaxAmount,
  sSubtotalAmount,
  _zSetIsCheckingOut,
  handleCancelPress,
  paymentsArr,
  sFocusedItem,
  _setFocusedItem,
  _setIsRefund,
  sScanFailureMessage,
  _setScanFailureMessage,
  sTransactionComplete,
  sRefundAmount,
  _setRefundAmount,
  sRefundObj,
}) => {
  // const [sFocusedItem, _setFocusedItem] = useState("");
  // clog(paymentsArr);
  if (!zCustomerObj) return null;
  return (
    <View
      style={{
        width: "100%",
        height: "100%",
        // justifyContent:
        // padding: 20,
      }}
    >
      {zCustomerObj?.id ? (
        <View
          style={{
            width: "100%",
            borderWidth: 1,
            borderColor: C.buttonLightGreenOutline,
            borderRadius: 10,
            padding: 10,
            marginBottom: 30,
            backgroundColor: C.backgroundListWhite,
            // flexDirection:
          }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
            }}
          >
            <View>
              <Text style={{ color: C.textMain }}>
                {zCustomerObj.first + " " + zCustomerObj.last}
              </Text>
              <Text style={{ color: makeGrey(0.6), fontSize: 12 }}>
                {zCustomerObj.email}
              </Text>
            </View>
            <View>
              {zCustomerObj.cell ? (
                <Text style={{ color: C.textMain }}>
                  <Text style={{ color: makeGrey(0.5) }}>{"cell: "}</Text>
                  {addDashesToPhone(zCustomerObj.cell)}
                </Text>
              ) : null}
              {zCustomerObj.land ? (
                <Text style={{ color: C.textMain }}>
                  <Text style={{ color: makeGrey(0.5) }}>{"land: "}</Text>
                  {addDashesToPhone(zCustomerObj.land)}
                </Text>
              ) : null}
            </View>
          </View>
          <Text style={{ fontSize: 13, color: makeGrey(0.7), paddingTop: 5 }}>
            {/* {zCustomerObj.streetAddress} */}
            {zCustomerObj.streetAddress +
              "  " +
              (zCustomerObj.unit ? "unit: " + zCustomerObj.unit + "\n" : "\n") +
              zCustomerObj.city +
              "\n" +
              zCustomerObj.notes}
          </Text>
        </View>
      ) : null}

      {/** Refund element ///////////////////////////////////////////// */}

      <View
        style={{
          width: "100%",
          alignItems: "space-between",
          // marginBottom: 30,
        }}
      >
        <View
          style={{
            width: "100%",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <CheckBox_
            text={"Refund"}
            isChecked={sIsRefund}
            onCheck={() =>
              sRefundScan.length !== 12
                ? _setScanFailureMessage("Must scan/enter 12-digit sale ID")
                : _setIsRefund(!sIsRefund)
            }
          />
          <Text style={{ fontSize: 12, color: RED_COLOR }}>
            {sScanFailureMessage}
          </Text>
        </View>
        <TextInput
          style={{
            marginTop: 5,
            width: "100%",
            borderColor: C.buttonLightGreenOutline,
            borderRadius: 7,
            padding: 5,
            textAlign: "left",
            borderWidth: 1,
            outlineWidth: 0,
            backgroundColor: C.backgroundListWhite,
          }}
          onFocus={() => {
            _setFocusedItem("refund");
            // _sSetRefundScan("");
          }}
          placeholder="Scan sale receipt (12 digit number)"
          placeholderTextColor={makeGrey(0.38)}
          autoFocus={sFocusedItem === "refund"}
          value={sRefundScan}
          onChangeText={(val) => {
            _setScanFailureMessage("");
            _sSetRefundScan(val);
          }}
        />
      </View>

      {/** totals element ////////////////////////////////////////// */}

      <View
        style={{
          width: "100%",
          minHeight: "20%",
          maxHeight: "30%",
          // alignItems: "flex-start",
          justifyContent: "space-between",
          marginTop: 10,
          paddingHorizontal: 10,
          paddingVertical: 10,
          backgroundColor: C.backgroundListWhite,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: C.buttonLightGreenOutline,
        }}
      >
        <View
          style={{
            alignItems: "center",
            flexDirection: "row",
            justifyContent: "space-between",
            width: "100%",
          }}
        >
          <Text style={{ fontSize: 13, color: makeGrey(0.5) }}>SUBTOTAL</Text>
          <View style={{ flexDirection: "row" }}>
            <Text
              style={{
                fontSize: 13,
                color: makeGrey(0.5),
                marginRight: 10,
              }}
            >
              $
            </Text>
            <Text
              style={{
                fontSize: 18,
                color: lightenRGBByPercent(C.green, 20),
              }}
            >
              {trimToTwoDecimals(sSubtotalAmount)}
            </Text>
          </View>
        </View>
        {sTotalDiscountAmount ? (
          <View
            style={{
              width: "100%",
              height: 1,
              marginVertical: 10,
              backgroundColor: C.buttonLightGreenOutline,
            }}
          />
        ) : null}
        {sTotalDiscountAmount ? (
          <View
            style={{
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "space-between",
              width: "100%",
            }}
          >
            <Text
              style={{
                marginLeft: 15,
                fontSize: 13,
                color: C.lightred,
              }}
            >
              DISCOUNT
            </Text>
            <View style={{ flexDirection: "row" }}>
              <Text
                style={{
                  fontSize: 13,
                  color: C.lightred,
                  marginRight: 10,
                }}
              >
                $
              </Text>
              <Text
                style={{
                  fontSize: 18,
                  color: C.lightred,
                }}
              >
                {"- " + formatNumberForCurrencyDisplay(sTotalDiscountAmount)}
              </Text>
            </View>
          </View>
        ) : null}
        {sTotalDiscountAmount ? (
          <View
            style={{
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "space-between",
              width: "100%",
            }}
          >
            <Text
              style={{
                marginLeft: 15,
                fontSize: 13,
                color: makeGrey(0.5),
              }}
            >
              DISCOUNTED TOTAL
            </Text>
            <View style={{ flexDirection: "row" }}>
              <Text
                style={{
                  fontSize: 13,
                  color: makeGrey(0.5),
                  marginRight: 10,
                }}
              >
                $
              </Text>
              <Text
                style={{
                  fontSize: 18,
                  color: lightenRGBByPercent(C.green, 20),
                }}
              >
                {formatNumberForCurrencyDisplay(
                  sSubtotalAmount - sTotalDiscountAmount
                )}
              </Text>
            </View>
          </View>
        ) : null}
        {sTotalDiscountAmount ? (
          <View
            style={{
              width: "100%",
              height: 1,
              marginVertical: 10,
              backgroundColor: C.buttonLightGreenOutline,
            }}
          />
        ) : null}
        <View
          style={{
            alignItems: "center",
            flexDirection: "row",
            justifyContent: "space-between",
            width: "100%",
          }}
        >
          <Text style={{ fontSize: 13, color: makeGrey(0.5) }}>SALES TAX</Text>
          <View style={{ flexDirection: "row" }}>
            <Text
              style={{
                fontSize: 13,
                color: makeGrey(0.5),
                marginRight: 10,
              }}
            >
              $
            </Text>
            <Text
              style={{
                fontSize: 18,
                color: lightenRGBByPercent(C.green, 20),
              }}
            >
              {formatNumberForCurrencyDisplay(sTotalTaxAmount)}
            </Text>
          </View>
        </View>
        <View
          style={{
            width: "100%",
            height: 1,
            backgroundColor: C.buttonLightGreenOutline,
            marginVertical: 10,
          }}
        />
        <View
          style={{
            alignItems: "center",
            flexDirection: "row",
            justifyContent: "space-between",
            width: "100%",
          }}
        >
          <Text style={{ fontSize: 16, color: makeGrey(0.5) }}>TOTAL SALE</Text>
          <View style={{ flexDirection: "row" }}>
            <Text
              style={{
                fontSize: 13,
                color: makeGrey(0.5),
                marginRight: 10,
              }}
            >
              $
            </Text>
            <Text
              style={{
                fontWeight: 500,
                fontSize: 21,
                color: C.green,
              }}
            >
              {formatNumberForCurrencyDisplay(sTotalAmount)}
            </Text>
          </View>
        </View>
      </View>

      {paymentsArr ? (
        <View
          style={{ marginTop: 30, alignItems: "flex-end", paddingRight: 10 }}
        >
          <Text style={{ color: makeGrey(0.4) }}>PAYMENTS</Text>
        </View>
      ) : null}
      {paymentsArr?.map((paymentObj) => {
        return (
          <View
            style={{
              padding: 5,
              backgroundColor: C.listItemWhite,
              width: "99%",
              backgroundColor: C.listItemWhite,
              borderRadius: 10,
              marginBottom: 5,
            }}
          >
            <Text style={{ color: C.green }}>
              {paymentObj.last4 ? "CARD SALE" : "CASH SALE"}
            </Text>
            <View
              style={{ flexDirection: "row", justifyContent: "space-between" }}
            >
              <Text>Amount received: </Text>
              <Text>
                {formatNumberForCurrencyDisplay(paymentObj.amountCaptured)}
              </Text>
            </View>
            {paymentObj.last4 ? (
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                }}
              >
                <Text>Last 4 Digits: </Text>
                <Text>{paymentObj.last4}</Text>
              </View>
            ) : null}
            {paymentObj.cash ? (
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                }}
              >
                <Text>Amount Tendered: </Text>
                <Text>
                  {formatNumberForCurrencyDisplay(paymentObj.amountTendered)}
                </Text>
              </View>
            ) : null}
            {paymentObj.cash ? (
              <View
                style={{
                  justifyContent: "space-between",
                  flexDirection: "row",
                }}
              >
                <Text>Change needed: </Text>
                <Text>
                  {formatNumberForCurrencyDisplay(
                    paymentObj.amountTendered - paymentObj.amountCaptured
                  )}
                </Text>
              </View>
            ) : null}
            {paymentObj.isRefund ? <Text>{REFUND}</Text> : null}
          </View>
        );
      })}

      <View
        style={{
          width: "100%",
          alignItems: "flex-end",
          marginTop: 10,
          paddingRight: 7,
        }}
      >
        <Text
          style={{
            fontSize: 18,
            fontWeight: 500,
            color: sTransactionComplete ? C.green : RED_COLOR,
          }}
        >
          {!sTransactionComplete
            ? "AMOUNT TO PAY: $" +
              formatNumberForCurrencyDisplay(sAmountLeftToPay)
            : "PAYMENT COMPLETE!"}
        </Text>
      </View>

      <View
        style={{
          width: "100%",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-around",
          marginTop: 25,
          // justifySelf: "flex-end",
        }}
      >
        {paymentsArr?.length > 0 && !sTransactionComplete ? (
          <SliderButton_ onConfirm={(val) => log("val", val)} />
        ) : null}
        {!paymentsArr || paymentsArr?.length == 0 ? (
          <Button_
            colorGradientArr={COLOR_GRADIENTS.green}
            text={"Cancel"}
            onPress={handleCancelPress}
          />
        ) : null}
        {paymentsArr?.length > 0 ? (
          <Button_
            colorGradientArr={COLOR_GRADIENTS.blue}
            text={sTransactionComplete ? "Close" : "Cancel"}
            onPress={handleCancelPress}
          />
        ) : null}
        {paymentsArr?.length > 0 && sTransactionComplete ? (
          <Button_
            colorGradientArr={COLOR_GRADIENTS.blue}
            text={"Reprint"}
            onPress={() => log("reprint receit method needed")}
          />
        ) : null}
      </View>
    </View>
  );
};

const CashSaleComponent = ({
  sAmountLeftToPay,
  onComplete,
  acceptsChecks,
  isRefund,
  sCashSaleActive,
  _setCardSaleActive,
  sTransactionComplete,
  sRefundAmount,
}) => {
  const [sTenderAmount, _setTenderAmount] = useState();
  const [sRequestedAmount, _setRequestedAmount] = useState(sAmountLeftToPay);
  const [sStatusMessage, _setStatusMessage] = useState("");
  const [sProcessButtonEnabled, _setProcessButtonEnabled] = useState(false);
  const [sIsCheck, _setIsCheck] = useState(false);
  const [sInputBoxFocus, _setInputBoxFocus] = useState(null);
  const [sCashChangeNeeded, _setCashChangeNeeded] = useState(0);
  const [sFocusedItem, _setFocusedItem] = useState("");

  // calculate running cash change needed for tender amount
  useEffect(() => {
    if (sTenderAmount >= sRequestedAmount) {
      let diff = Number(sTenderAmount) - Number(sRequestedAmount);
      _setCashChangeNeeded(diff);
    }
  }, [sTenderAmount, sRequestedAmount]);

  function handleCancelPress() {
    _setTenderAmount("");
    _setRequestedAmount(sAmountLeftToPay);
    _setProcessButtonEnabled(false);
  }

  function handleProcessButtonPress() {
    let paymentObject = { ...PAYMENT_OBJECT_PROTO };
    paymentObject.amountTendered = Number(sTenderAmount);
    paymentObject.amountCaptured = Number(sRequestedAmount);
    paymentObject.cash = !sIsCheck;
    paymentObject.check = sIsCheck;
    paymentObject.millis = new Date().getTime();
    paymentObject.id = generateRandomID();

    onComplete(paymentObject);
    handleCancelPress();
  }

  function handleKeyPress(event) {
    if (event.nativeEvent.key == "Enter") handleProcessButtonPress();
  }

  //   log(sProcessButtonEnabled.toString());

  let refundReady = true;
  if (isRefund && !sRefundAmount) refundReady = false;
  return (
    <View
      style={{
        ...checkoutScreenStyle.base,
        opacity: sTransactionComplete || !refundReady ? 0.2 : 1,
      }}
    >
      {acceptsChecks ? (
        <View
          style={{ width: "100%", alignItems: "flex-start", paddingLeft: 10 }}
        >
          <CheckBox_
            textStyle={{ fontSize: 12 }}
            // boxStyle={{ width: 14, height: 14 }}
            text={"Paper Check"}
            onCheck={() => {
              sTransactionComplete || !refundReady
                ? null
                : _setIsCheck(!sIsCheck);
              _setProcessButtonEnabled(sIsCheck ? false : true);
              _setTenderAmount(sIsCheck ? "" : sAmountLeftToPay);
            }}
            isChecked={sIsCheck}
          />
        </View>
      ) : null}
      <Text
        style={{
          ...checkoutScreenStyle.titleText,
          color: isRefund ? RED_COLOR : checkoutScreenStyle.titleText.color,
          fontWeight: 500,
        }}
      >
        {isRefund ? "CASH REFUND" : "CASH SALE"}
      </Text>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "flex-end",
          alignItems: "center",
          backgroundColor: C.listItemWhite,
          marginTop: 10,
          padding: 10,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: C.buttonLightGreenOutline,
        }}
      >
        <View
          style={{
            alignItems: "flex-end",
            justifyContent: "center",
            // backgroundColor: "green",
            height: "100%",
          }}
        >
          <Text style={{ color: C.textMain }}>Balance</Text>
          <Text style={{ marginTop: 10, color: C.textMain }}>Pay Amount</Text>
        </View>
        <View
          style={{
            alignItems: "flex-end",
            marginLeft: 10,
            color: C.textMain,
          }}
        >
          <Text
            style={{
              fontSize: 15,
              padding: 5,
              paddingRight: 1,
              color: C.textMain,
            }}
          >
            {"$ " + formatNumberForCurrencyDisplay(sAmountLeftToPay)}
          </Text>
          <TextInput
            disabled={!sCashSaleActive || sTransactionComplete || !refundReady}
            onFocus={() => {
              _setFocusedItem("amount");
              _setRequestedAmount("");
            }}
            autoFocus={sFocusedItem === "amount"}
            style={{
              fontSize: 15,
              outlineWidth: 0,
              color: C.textMain,
              width: 80,
              borderColor: C.buttonLightGreenOutline,
              borderRadius: 2,
              borderWidth: 1,
              padding: 5,
              paddingRight: 1,
              textAlign: "right",
            }}
            placeholder="0.00"
            placeholderTextColor={makeGrey(0.3)}
            value={formatNumberForCurrencyDisplay(sRequestedAmount)}
            onChangeText={(val) => {
              val = formatDecimal(val);
              if (val > sAmountLeftToPay) {
                _setStatusMessage("Amount greater than balance");
                return;
              } else {
                _setStatusMessage("");
                _setRequestedAmount(val);
              }
            }}
          />
        </View>
      </View>

      <View style={{ flexDirection: "row" }}>
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
              disabled={
                !sCashSaleActive || sTransactionComplete || !refundReady
              }
              style={{
                ...checkoutScreenStyle.boxText,
                color: C.textMain,
                height: "70%",
                // backgroundColor: "blue",
              }}
              autoFocus={sFocusedItem === "tender"}
              placeholder="0.00"
              placeholderTextColor={makeGrey(0.3)}
              value={sTenderAmount}
              onChangeText={(val) => {
                val = formatDecimal(val);
                if (val === "0.00") val = "";
                _setTenderAmount(val);
                _setProcessButtonEnabled(false);
                if (Number(val) >= Number(sRequestedAmount)) {
                  log(val, sRequestedAmount);
                  _setProcessButtonEnabled(true);
                } else {
                  //   log("here!");
                  //   log(val, sRequestedAmount);
                  _setProcessButtonEnabled(false);
                }
              }}
              // autoFocus={sInputBoxFocus == "tender"}
              onKeyPress={handleKeyPress}
              onFocus={() => {
                _setFocusedItem("tender");
                _setTenderAmount("");
              }}
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
        <Button_
          colorGradientArr={COLOR_GRADIENTS.green}
          //   buttonStyle={{ backgroundColor: "green" }}
          //   style={{ ...checkoutScreenStyle.mainButtonStyle }}
          textStyle={{ color: C.textWhite }}
          enabled={
            sProcessButtonEnabled && !sTransactionComplete && sCashSaleActive
          }
          //   visible={sProcessButtonLabel}
          onPress={handleProcessButtonPress}
          text={"Process"}
          buttonStyle={{
            cursor: sProcessButtonEnabled ? "inherit" : "default",
          }}
        />
        <Button_
          buttonStyle={{
            cursor: sProcessButtonEnabled ? "inherit" : "default",
          }}
          enabled={
            sTenderAmount >= sRequestedAmount &&
            !sTransactionComplete &&
            sCashSaleActive
          }
          onPress={handleCancelPress}
          text={"Cancel"}
        />
      </View>
      {sCashChangeNeeded >= 0 && sTenderAmount >= sRequestedAmount ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: C.buttonLightGreenOutline,
            borderRadius: 10,
            paddingTop: 2,
            paddingBottom: 3,
            paddingLeft: 2,
            paddingRight: 10,
            marginTop: 16,
          }}
        >
          <Text
            style={{
              fontSize: 11,
              color: makeGrey(0.3),
              width: 110,
              marginBottom: 5,
              // paddingBottom: 10,
              // paddingHorizontal: 10,
            }}
          >
            CHANGE
          </Text>
          <Text
            style={{
              // ...checkoutScreenStyle.statusText,
              textAlign: "right",
              fontSize: 25,
              color: C.green,
            }}
          >
            {formatNumberForCurrencyDisplay(sCashChangeNeeded, true)}
          </Text>
        </View>
      ) : null}
    </View>
  );
};

const StripeCreditCardComponent = ({
  sAmountLeftToPay,
  onComplete,
  zSettingsObj,
  isRefund,
  refundPaymentIntentID,
  sCardSaleActive,
  _setCashSaleActive,
  sTransactionComplete,
  sRefundAmount,
}) => {
  const [sRequestedAmount, _setRequestedAmount] = useState(sAmountLeftToPay);
  const [sStatusMessage, _setStatusMessage] = useState("");
  const [sProcessButtonEnabled, _setProcessButtonEnabled] = useState(true);
  const [sFocusedItem, _setFocusedItem] = useState("");
  const [sCardReaderObj, _setCardReaderObj] = useState("");
  const [sCardReaderArr, _setCardReaderArr] = useState([]);
  const [sListenerArr, _setListenerArr] = useState([]);
  const [sPaymentIntentID, _setPaymentIntentID] = useState("");
  const [sStatusTextColor, _setStatusTextColor] = useState(C.green);

  /////////////////////////////////////////////////////////////////////////
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    // log(sRequestedAmount);
    getAvailableStripeReaders();
    if (sRequestedAmount <= sAmountLeftToPay && sRequestedAmount >= 1) {
      _setProcessButtonEnabled(true);
    } else {
      _setProcessButtonEnabled(false);
    }

    return () => {
      try {
        sListenerArr.forEach((listener) => listener());
      } catch (e) {
        log("error canceling listener", e);
      }
    };
  }, [sRequestedAmount]);

  async function getAvailableStripeReaders() {
    // log("getting available Stripe readers");
    const res = await fetch(STRIPE_GET_AVAIALABLE_STRIPE_READERS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json();
    let readerArr = data.data;
    let arr = [];
    readerArr.forEach((connectedReader) => {
      let match = zSettingsObj.cardReaders.find(
        (o) => o.id === connectedReader.id
      );
      if (match) {
        arr.push(match);
      } else {
        arr.push(connectedReader);
      }
    });
    _setCardReaderArr(arr);
    if (
      arr.find((o) =>
        o.id === zSettingsObj.selectedCardReaderObj.id ? true : false
      )
    ) {
      _setCardReaderObj(zSettingsObj.selectedCardReaderObj);
      // startPayment(sRequestedAmount, zSettingsObj.selectedCardReaderObj.id);
    }
  }

  async function startPayment(paymentAmount, readerID) {
    if (!(paymentAmount > 0)) return;
    _setStatusTextColor("green");
    _setStatusMessage("Retrieving card reader activation...");
    // log("starting server driven payment attempt, amount", paymentAmount);
    // return;

    // readerResult obj contains readerResult object key/val and paymentIntentID key/val
    let readerResult;
    if (isRefund) {
      readerResult = await dbCancelServerDrivenStripePayment(
        readerID || sCardReaderObj.id,
        refundPaymentIntentID
      );
    } else {
      readerResult = await dbProcessServerDrivenStripePayment(
        paymentAmount,
        readerID || sCardReaderObj.id,
        false,
        sPaymentIntentID
      );
    }

    // console.log("reader result", readerResult);

    if (!readerResult) {
      _setStatusMessage("No reader found\n\nCheck connections");
      log("no result");
      return;
    }

    if (readerResult.error && readerResult.error.code) {
      handleStripeReaderActivationError(readerResult.error.code);
    } else {
      _setStatusTextColor("green");
      _setStatusMessage("Waiting for customer...");
      // log("readerkdfjkdjf", readerResult.paymentIntentID);
      _setPaymentIntentID(readerResult.paymentIntentID);
      let listenerArr = cloneDeep(sListenerArr);
      let listener = dbSubscribeToStripePaymentProcess(
        readerResult.paymentIntentID,
        handleStripeCardPaymentDBSubscriptionUpdate
      );
      listenerArr.push(listener);
      _setListenerArr(listenerArr);
    }
  }

  async function handleStripeReaderActivationError(error) {
    _setStatusTextColor(RED_COLOR);
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
    ssPaymentIntentID
  ) {
    // clog("Stripe webhook update Obj", val);

    let failureCode = val?.failure_code;
    if (
      failureCode &&
      val?.process_payment_intent?.payment_intent == ssPaymentIntentID
    ) {
      log("card failure code", failureCode);
      _setStatusTextColor(RED_COLOR);
      _setStatusMessage(
        "Failure code:  " + val.failure_code + "\n\nPayment Rejected by Stripe"
      );
    } else if (
      val.status === "succeeded" &&
      val.payment_intent === ssPaymentIntentID
    ) {
      _setStatusTextColor("green");
      _setStatusMessage("Payment Complete!");
      log("Stripe payment complete!");
      // clog("Payment complete object", val);
      let paymentMethodDetails = val.payment_method_details.card_present;
      // log("trimming", trimToTwoDecimals(Number(val.amount_captured) / 100));
      // log("num", Number(val.amountCaptured));

      let paymentDetailsObj = cloneDeep(PAYMENT_OBJECT_PROTO);
      paymentDetailsObj.amountCaptured = roundToTwoDecimals(
        val.amount_captured / 100
      );
      paymentDetailsObj.cardIssuer =
        paymentMethodDetails.receipt.application_preferred_name;
      paymentDetailsObj.cardType = paymentMethodDetails.description;
      paymentDetailsObj.id = generateUPCBarcode();
      paymentDetailsObj.isRefund = isRefund;
      paymentDetailsObj.millis = new Date().getTime();
      paymentDetailsObj.authorizationCode =
        paymentMethodDetails.receipt.authorization_code;
      paymentDetailsObj.paymentIntentID = val.payment_intent;
      paymentDetailsObj.chargeID = val.id;
      paymentDetailsObj.paymentProcessor = "stripe";
      paymentDetailsObj.receiptURL = val.receipt_url;
      paymentDetailsObj.last4 = val.payment_method_details.card_present.last4;
      paymentDetailsObj.expMonth =
        val.payment_method_details.card_present.exp_month;
      paymentDetailsObj.expYear =
        val.payment_method_details.card_present.exp_year;
      paymentDetailsObj.networkTransactionID =
        val.payment_method_details.card_present.network_transaction_id;
      paymentDetailsObj.amountRefunded = val.amount_refunded;

      // clog("Successful Payment details obj", paymentDetailsObj);
      onComplete(paymentDetailsObj);
    }
  }

  async function cancelServerDrivenStripePaymentIntent() {
    _setStatusTextColor(RED_COLOR);
    _setStatusMessage("Canceling payment request...");
    log("canceling server driven payment attempt", zReader);
    if (!zPaymentIntentID) {
      // onCancel();
      return;
    }
    let readerResult = await dbCancelServerDrivenStripePayment(
      zReader?.id,
      zPaymentIntentID
    );

    // onCancel();
  }

  function handleCancelPress() {
    _setTenderAmount("");
    _setRequestedAmount(sAmountLeftToPay);
    _setProcessButtonEnabled(false);
  }

  function handleProcessButtonPress() {
    startPayment(sAmountLeftToPay);
  }

  async function resetCardReader() {
    _setStatusMessage(RED_COLOR);
    _setStatusMessage("\nCard reader reset in progress...");
    _setPaymentIntentID(null);
    sListenerArr.forEach((listener) => listener());
    _setProcessButtonEnabled(true);
    let readerResult = await dbCancelServerDrivenStripePayment(
      sCardReaderObj.id,
      sPaymentIntentID
    );
    _setStatusTextColor("green");
    _setStatusMessage("\nReset complete!");
    clog("cancelation results", readerResult);
  }

  function onPaymentComplete(obj) {
    let paymentObject = { ...PAYMENT_OBJECT_PROTO };
    paymentObject.amountCaptured = Number(sRequestedAmount);
    paymentObject.cash = !sIsCheck;
    paymentObject.check = sIsCheck;
    paymentObject.millis = new Date().getTime();
    // paymentObject

    onComplete(paymentObject);
    handleCancelPress();
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
          readerID: reader?.id || sCardReaderObj.id,
        }),
      });
      const data = await res.json();
      clog("intent", data);
    } catch (e) {
      log("Error creating payment intent", e);
    }

    // setClientSecret(data.clientSecret);
  }

  // log(sProcessButtonEnabled.toString());
  let refundReady = true;
  if (isRefund && !sRefundAmount) refundReady = false;

  return (
    <View
      style={{
        ...checkoutScreenStyle.base,
        opacity: sTransactionComplete || !refundReady ? 0.2 : 1,
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
            <Text style={{ color: makeGrey(0.6), fontSize: 11 }}>
              Card Readers
            </Text>
            <DropdownMenu
              enabled={sCardSaleActive && !sTransactionComplete && refundReady}
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
              dataArr={sCardReaderArr || []}
              buttonText={sCardReaderObj?.label || sCardReaderObj.id}
              onSelect={_setCardReaderObj}
            />
          </View>
          <Button_
            text={"Reset Card Reader"}
            enabled={sCardSaleActive && !sTransactionComplete && refundReady}
            buttonStyle={{
              cursor: sProcessButtonEnabled ? "inherit" : "default",
              backgroundColor: makeGrey(0.2),
              paddingHorizontal: 5,
              paddingVertical: 2,
              borderRadius: 5,
              borderColor: makeGrey(0.23),
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
          color: isRefund ? RED_COLOR : checkoutScreenStyle.titleText.color,
          fontWeight: 500,
        }}
      >
        {isRefund ? "CARD REFUND" : "CARD SALE"}
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
          <Text style={{ color: C.textMain, marginTop: 10 }}>Balance</Text>
          <Text
            style={{
              marginBottom: 15,
              color: isRefund ? RED_COLOR : C.textMain,
            }}
          >
            {isRefund ? "Refund Amount" : "Pay Amount"}
          </Text>
        </View>
        <View
          style={{
            alignItems: "flex-end",
            marginLeft: 10,
            color: C.textMain,
          }}
        >
          <Text
            style={{
              fontSize: 15,
              padding: 5,
              paddingRight: 1,
              color: C.textMain,
            }}
          >
            {"$ " + formatNumberForCurrencyDisplay(sAmountLeftToPay)}
          </Text>
          <TextInput
            onFocus={() => {
              _setFocusedItem("amount");
              _setRequestedAmount("");
              // _setProcessButtonEnabled(false);
            }}
            autoFocus={sFocusedItem === "amount"}
            disabled={!sCardSaleActive || sTransactionComplete || !refundReady}
            style={{
              fontSize: 20,
              outlineWidth: 0,
              color: isRefund ? RED_COLOR : C.textMain,
              width: 80,
              borderColor: C.buttonLightGreenOutline,
              borderRadius: 5,
              borderWidth: 2,
              padding: 10,
              paddingRight: 2,
              textAlign: "right",
            }}
            placeholder="0.00"
            placeholderTextColor={makeGrey(0.3)}
            value={formatNumberForCurrencyDisplay(sRequestedAmount)}
            onChangeText={(val) => {
              val = formatDecimal(val);
              if (val > sAmountLeftToPay || val <= 3) {
                // _setStatusMessage("Improper payment amount...");
                log("here");
                _setRequestedAmount(val);
                _setProcessButtonEnabled(false);
              } else {
                _setProcessButtonEnabled(true);
                // _setStatusMessage("");
                _setRequestedAmount(val);
              }
            }}
          />
        </View>
      </View>
      {isRefund ? (
        <View style={{ width: "100%", alignItems: "center", marginTop: 10 }}>
          <Text style={{ fontSize: 12 }}>
            {"Last 4: " + "1236     " + "exp: " + "month" + " / " + "year"}
          </Text>
          <Text style={{ fontSize: 12 }}>{"World Mastercard Original"}</Text>
        </View>
      ) : null}
      <View
        style={{
          width: "100%",
          marginVertical: isRefund ? "2%" : "8%",
          alignItems: "center",
        }}
      >
        <Button_
          colorGradientArr={COLOR_GRADIENTS.green}
          textStyle={{ color: C.textWhite }}
          enabled={
            sProcessButtonEnabled &&
            sCardSaleActive &&
            !sTransactionComplete &&
            refundReady
          }
          onPress={handleProcessButtonPress}
          text={isRefund ? "Process Refund" : "Process"}
          buttonStyle={{
            // width: 130,
            cursor: sProcessButtonEnabled ? "inherit" : "default",
          }}
        />

        <Text
          style={{
            ...checkoutScreenStyle.statusText,
            fontSize: 15,
            color: sStatusTextColor,
            marginTop: 10,
          }}
        >
          {sStatusMessage}
        </Text>
      </View>
    </View>
  );
};

const InventoryListComponent = ({
  inventoryObjArr,
  onSelect,
  quickItemButtons,
  _setSearchStr,
  sTransactionComplete,
}) => {
  return (
    <View style={{ width: "100%" }}>
      <Button_
        text={"CLOSE INVENTORY"}
        onPress={() => _setSearchStr("")}
        textStyle={{ fontSize: 13, color: C.textWhite }}
        colorGradientArr={COLOR_GRADIENTS.lightBlue}
        buttonStyle={{ width: 150, marginBottom: 10 }}
      />
      <FlatList
        data={inventoryObjArr}
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
                  <Text style={{ color: C.textMain }}>{item.formalName}</Text>
                  <Text style={{ color: C.textMain }}>{item.informalName}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ color: C.textMain }}>
                    <Text style={{ color: C.textMain, fontSize: 13 }}>
                      {"$  "}
                    </Text>
                    {item.price}
                  </Text>
                  {item.salePrice ? (
                    <Text style={{ color: C.lightred }}>
                      <Text style={{ color: C.lightred, fontSize: 13 }}>
                        {"SALE PRICE $  "}
                      </Text>
                      {item.price}
                    </Text>
                  ) : null}
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
  sCombinedWorkordersArr,
  zOpenWorkordersArr,
  zOpenWorkorderObj,
  zInventoryArr,
  zCustomerObj,
  zSettingsObj,
  zGetInventoryItem,
  handleCombineWorkorderCheck,
  sAmountLeftToPay,
  isRefund,
  sTransactionComplete,
  _setRefundItemArr,
  sRefundItemArr,
}) => {
  // clog("combined in WorkorderListComponent", sCombinedWorkordersArr);
  // clog("open", zOpenWorkorderObj);

  function handleItemPress(wo, id) {}

  function sortWorkorders() {
    if (!isRefund) {
      // set the open workorder at the top of the array, this one is unselectable
      let idxOfOpen = sCombinedWorkordersArr.findIndex(
        (o) => o.id === zOpenWorkorderObj.id
      );
      let returnArr = [
        sCombinedWorkordersArr[idxOfOpen],
        ...sCombinedWorkordersArr.filter((o) => o.id != zOpenWorkorderObj.id),
      ];

      // add the rest of the customer's workorder items into the array to add to the sale if they wish
      // clog("return", returnArr);
      let theRest = [];
      if (zCustomerObj && zOpenWorkorderObj) {
        zOpenWorkordersArr.forEach((openWO) => {
          if (openWO.customerID === zOpenWorkorderObj?.customerID) {
            let foundObj = returnArr.find((o) => openWO.id === o.id);
            if (!foundObj) theRest.push(openWO);
          }
        });
      }

      returnArr = [...returnArr, ...theRest];
      // return sCombinedWorkordersArr;
      return returnArr;
    } else {
      return sCombinedWorkordersArr;
    }
  }

  // log(isRefund.toString());
  if (!zInventoryArr.length > 0) return;
  // clog(sCombinedWorkordersArr);
  return (
    <ScrollView
      style={{
        width: "100%",
        opacity: sTransactionComplete ? 0.2 : 1,
      }}
    >
      {sortWorkorders().map((workorder, idx) => {
        return (
          <View
            style={{
              width: "100%",
              borderColor: C.buttonLightGreenOutline,
              backgroundColor: C.backgroundListWhite,
              borderWidth: 1,
              borderRadius: 10,
              padding: 10,
              marginBottom: 7,
            }}
          >
            {!isRefund ? (
              <CheckBox_
                buttonStyle={{
                  alignSelf: "flex-start",
                  marginTop: 5,
                  marginBottom: 5,
                }}
                isChecked={sCombinedWorkordersArr.find(
                  (o) => o.id === workorder.id
                )}
                text={"ADD TO SALE"}
                onCheck={() =>
                  zOpenWorkorderObj.id === workorder.id ||
                  isRefund ||
                  sTransactionComplete
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
                    : sCombinedWorkordersArr.find((o) => o.id === workorder.id)
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
                  borderBottomColor: makeGrey(0.1),
                  marginBottom: 10,
                }}
              >
                <View style={{}}>
                  <Text
                    style={{
                      color: C.textMain,
                      fontSize: 16,
                      fontWeight: "500",
                    }}
                  >
                    {workorder.brand || ""}
                  </Text>
                  <Text
                    style={{
                      color: makeGrey(0.6),
                      fontSize: 16,
                      fontWeight: "500",
                      fontStyle: "italic",
                    }}
                  >
                    {workorder.model || ""}
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
                      marginLeft: 5,
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
                <Text
                  style={{
                    color: C.textMain,
                    fontSize: 16,
                    fontWeight: "500",
                  }}
                >
                  {workorder.description || ""}
                </Text>
              </View>
              <FlatList
                data={workorder.workorderLines}
                renderItem={(obj) => {
                  let index = obj.index;
                  let workorderLine = obj.item;
                  let inventoryItem = zGetInventoryItem(
                    workorderLine.inventoryItem.id
                  );
                  // log("item", inventoryItem);
                  return (
                    <View
                      style={{
                        flexDirection: "row",
                        width: "100%",
                        alignItems: "center",
                        backgroundColor: C.listItemWhite,
                        paddingVertical: 3,
                        marginVertical: 2,
                        borderColor: "transparent",
                        borderLeftColor: lightenRGBByPercent(C.green, 60),
                        borderWidth: 2,
                        paddingLeft: 10,
                        borderRadius: 15,
                      }}
                    >
                      {isRefund || !isRefund ? (
                        <CheckBox_
                          onCheck={(workorder) => {
                            let arr = cloneDeep(sRefundItemArr);
                            let found = arr.find((o) => o.id === workorder.id);
                            if (!found) arr.push(workorder);
                            _setRefundItemArr(arr);
                          }}
                          buttonStyle={{
                            marginRight: 15,
                          }}
                        />
                      ) : null}

                      <View
                        style={{
                          width: "65%",
                          justifyContent: "flex-start",
                          alignItems: "center",
                          flexDirection: "row",
                          // backgroundColor: "green",
                        }}
                      >
                        <View>
                          <Text style={{ color: C.lightred, fontSize: 12 }}>
                            {workorderLine.discountObj.name}
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
                                color: C.textMain,
                                fontWeight: "400",
                              }}
                            >
                              {inventoryItem.formalName}
                            </Text>
                          </View>
                          <Text
                            style={{
                              fontSize: 14,
                              color: makeGrey(0.65),
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
                          // backgroundColor: RED_COLOR,
                        }}
                      >
                        <GradientView
                          colorArr={COLOR_GRADIENTS.grey}
                          style={{
                            borderRadius: 10,
                            width: 30,
                            height: 20,
                          }}
                        >
                          <TextInput
                            disabled={true}
                            style={{
                              fontSize: 16,
                              fontWeight: 700,
                              textAlign: "center",
                              color: C.textWhite,
                              outlineWidth: 0,
                              width: "100%",
                            }}
                            value={workorderLine.qty}
                          />
                        </GradientView>
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
                              formatNumberForCurrencyDisplay(
                                inventoryItem?.price || workorderLine.price
                              )}
                          </Text>
                          {workorderLine.discountObj.savings ? (
                            <Text
                              style={{
                                paddingHorizontal: 0,
                                minWidth: 30,
                                color: C.lightred,
                              }}
                            >
                              {"$ -" +
                                formatNumberForCurrencyDisplay(
                                  workorderLine.discountObj.savings
                                )}
                            </Text>
                          ) : null}
                          <Text
                            style={{
                              fontWeight: "600",
                              minWidth: 30,
                              marginTop: 0,
                              paddingHorizontal: 0,
                              color: Colors.darkText,
                            }}
                          >
                            {workorderLine.discountObj.newPrice
                              ? "$ " +
                                formatNumberForCurrencyDisplay(
                                  workorderLine.discountObj.newPrice
                                )
                              : workorderLine.qty > 1
                              ? "$" +
                                formatNumberForCurrencyDisplay(
                                  inventoryItem?.price ||
                                    workorderLine.price * workorderLine.qty
                                )
                              : ""}
                          </Text>
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
                  borderTopColor: makeGrey(0.1),
                  marginTop: 5,
                  paddingTop: 5,
                }}
              >
                <Text style={{ fontSize: 13, color: "gray" }}>
                  {"SUBTOTAL: "}
                  <Text
                    style={{
                      marginRight: 10,
                      color: C.textMain,
                      fontWeight: "500",
                      fontSize: 14,
                    }}
                  >
                    {"$" +
                      formatNumberForCurrencyDisplay(
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
                          formatNumberForCurrencyDisplay(
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
                      color: C.textMain,
                      fontSize: 14,
                    }}
                  >
                    {"$" +
                      formatNumberForCurrencyDisplay(
                        (calculateRunningTotals(workorder).runningTotal *
                          zSettingsObj.salesTax) /
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
                      color: C.textMain,
                      fontSize: 15,
                    }}
                  >
                    {"$" +
                      formatNumberForCurrencyDisplay(
                        calculateRunningTotals(workorder).runningTotal *
                          (zSettingsObj.salesTax / 100) +
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
    backgroundColor: C.backgroundListWhite,
    borderRadius: 15,
    ...SHADOW_RADIUS_PROTO,
  },
  titleText: {
    fontSize: 25,
    color: makeGrey(0.55),
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
    borderRadius: 5,
    borderWidth: 2,
    backgroundColor: C.listItemWhite,
    // padding: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    width: 120,
    // height: 70,
    alignItems: "space-between",
    justifyContent: "space-between",
    flexDirection: "row",
  },
  totalTextStyle: {
    marginTop: 15,
    color: makeGrey(0.75),
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

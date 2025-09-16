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

const RED_COLOR = lightenRGBByPercent(getRgbFromNamedColor("red"), 20);

export function CheckoutModalScreen({ openWorkorder }) {
  // store setters

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
  //////////////////////////////////////////////////////////////////////

  const [sRefundScan, _sSetRefundScan] = useState();
  const [sIsRefund, _setIsRefund] = useState(false);
  const [sRefund, _setRefund] = useState({});
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
  const [sRefundScanMessage, _setRefundScanMessage] = useState("");
  const [sRefundAmount, _setRefundAmount] = useState(0);
  const [sRefundItems, _setRefundItems] = useState([]);
  const [sShouldChargeCardRefundFee, _setShouldChargeCardRefundFee] =
    useState(true);
  const [sCashChangeNeeded, _setCashChangeNeeded] = useState(null);

  // watch the combined workorders array and adjust accordingly

  // 730921185148
  let scan = "592218957081"; // test

  // all startup stuff here
  useEffect(() => {
    // insert open workorder into combined workorders array
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
        let sale = cloneDeep(SALE_OBJECT_PROTO);
        sale.id = generateUPCBarcode(); //////// dev
        sale.salesTaxPercent = zSettings.salesTax;
        sale.millis = new Date().getTime();
        setRunningTotals(sale, combinedWorkorders);
        // setRefund(zOpenWorkorder, sale);
      }
      _setCombinedWorkorders(combinedWorkorders);
    }

    _sSetRefundScan(scan); // testing
  }, [
    zOpenWorkorder,
    sCombinedWorkorders,
    zSettings,
    sSale,
    sIsRefund,
    sRefundItems,
  ]);

  useEffect(() => {
    if (sSale && sCombinedWorkorders)
      setRunningTotals(sSale, sCombinedWorkorders);
    // log("running");
  }, [sCombinedWorkorders]);

  useEffect(() => {}, [sSale]);

  function setRunningTotals(sale, combinedWorkorders, refundItems = []) {
    // log("sale", sale);
    // log("combined", combinedWorkorders);
    sale = cloneDeep(sale);
    let {
      runningQty,
      runningSubtotal,
      runningTotal,
      runningDiscount,
      runningTax,
    } = calculateRunningTotals(
      combinedWorkorders,
      zSettings?.salesTax,
      refundItems,
      sIsRefund
    );

    sale.subtotal = runningSubtotal;
    sale.discount = runningDiscount;
    sale.total = runningTax + runningTotal;
    sale.tax = runningTax;
    sale.cardRefundFee = runningTotal * (zSettings.cardRefundFeePercent / 100);
    // log("new sale", sale);
    _setSale(sale);
  }

  function setRefund() {
    // log("here");
    let refundDetailsObj = {
      cashRefundRequested: 0,
      cardRefundRequested: 0,
      totalCashRefundAllowed: 0,
      totalCardRefundAllowed: 0,
      cashAmountRefunded: 0,
      cardAmountRefunded: 0,
      totalRefundRequested: 0,
      cardTransactions: [],
      cashTransactions: [],
    };

    sSale?.payments.forEach((payment) => {
      payment = cloneDeep(payment);
      if (payment.last4) {
        refundDetailsObj = cloneDeep(refundDetailsObj);
        refundDetailsObj.cardTransactionArr = replaceOrAddToArr(
          refundDetailsObj.cardTransactionArr,
          payment
        );
        refundDetailsObj.totalCardRefundAllowed =
          refundDetailsObj.totalCardRefundAllowed + payment.amountCaptured;
      } else {
        refundDetailsObj.cashTransactionArr = replaceOrAddToArr(
          refundDetailsObj.cashTransactionArr,
          payment
        );
        refundDetailsObj.totalCashRefundAllowed =
          refundDetailsObj.totalCashRefundAllowed + payment.amountCaptured;
        refundDetailsObj.cashAmountRefunded =
          refundDetailsObj.cashAmountRefunded + Number(payment.amountRefunded) >
          0
            ? payment.amountRefunded
            : 0;
      }
    });
    let totalRefund = 0;
    sRefundItems.forEach((item) => {
      if (item.discountObj.newPrice > 0) {
        totalRefund = totalRefund + item.discountObj.newPrice;
      } else {
        totalRefund = totalRefund + item.inventoryItem.price;
      }
    });

    totalRefund = totalRefund + (totalRefund * sale.salesTaxPercent) / 100;
    refundDetailsObj.totalRefundRequested = totalRefund;

    if (refundDetailsObj.totalCardRefundAllowed > 0) {
      if (refundDetailsObj.totalCardRefundAllowed - totalRefund < 0) {
        refundDetailsObj.cardRefundRequested =
          refundDetailsObj.totalCardRefundAllowed;
      } else {
        refundDetailsObj.cardRefundRequested = totalRefund;
      }
    }

    if (refundDetailsObj.totalCashRefundAllowed > 0) {
      if (refundDetailsObj.totalCashRefundAllowed - totalRefund < 0) {
        refundDetailsObj.cashRefundRequested =
          refundDetailsObj.totalCashRefundAllowed;
      } else {
        refundDetailsObj.cashRefundRequested = totalRefund;
      }
    }

    // log(refundDetailsObj);
    _setRefund(refundDetailsObj);
  }

  function handleRefundCapture(paymentObjArr) {}

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
        wo.saleID = sale.id;
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

    let saleIDs = cloneDeep(zCustomer.salesID);
    if (!isArray(saleIDs)) saleIDs = [];
    saleIDs = replaceOrAddToArr(saleIDs, sale.id);

    // remove unused fields
    sale.payments = sale.payments.map((payment) => removeUnusedFields(payment));
    if (payment.cash)
      _setCashChangeNeeded(payment.amountTendered - payment.amountCaptured);

    // printReceipt(payment);
    _setSale(sale);
    dbSetSalesObj(removeUnusedFields(sale)); // db
    _zSetCustomerField("deposits", deposits); // db
    _zSetCustomerField("saleIDs", saleIDs); // db

    if (!sale.payments[sale.payments.length - 1].cash) {
      if (sIsDeposit || sale.paymentComplete) closeCheckoutScreenModal();
    }
  }

  function printReceipt(payment) {}

  function handleRefundScan(refundScan) {
    function addToCombinedArr(workorderObj) {
      _setRefundScanMessage("Transaction Found!");
      let arr = cloneDeep(sCombinedWorkorders);
      arr = replaceOrAddToArr(arr, workorderObj);
      arr = sortRefundWorkorderArr(arr);
      _setCombinedWorkorders(arr);
      _setIsRefund(true);
    }

    if (refundScan.length === 12) {
      _setRefundScanMessage("Searching for transaction...");
      _setCombinedWorkorders([]);

      dbGetSaleItem(refundScan)
        .then((res) => {
          if (res) {
            // log("found");
            // log(res);
            _setSale(res);
            res.workorderIDs.forEach((workorderID) => {
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
      log("no refund found");
      _setRefundScanMessage("Enter 12-digit sale ID");
    } else {
      _setRefundScanMessage("");
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

  function handleRefundItemCheck(workorderLine) {
    let checkedArr = cloneDeep(sRefundItems);
    if (arrHasItem(checkedArr, workorderLine)) {
      checkedArr = removeArrItem(checkedArr, workorderLine);
    } else {
      checkedArr.push(workorderLine);
    }
    _setRefundItems(checkedArr);
  }

  function sortRefundWorkorderArr(combinedArr) {
    // log("here");
    let newArr = [];
    combinedArr.forEach((wo) => {
      let newWO = cloneDeep(wo);
      let workorderLines = [];
      wo.workorderLines.forEach((line) => {
        if (line.qty > 1) {
          for (let i = 0; i <= line.qty - 1; i++) {
            workorderLines.push({ ...line, qty: 1, id: generateRandomID() });
          }
        } else {
          workorderLines.push(line);
        }
      });
      newWO.workorderLines = workorderLines;
      // log(newWO);
      newArr.push(newWO);
    });
    // log(newArr);
    return newArr;
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
            backgroundColor: sIsRefund
              ? lightenRGBByPercent(C.red, 80)
              : C.backgroundWhite,
            width: "85%",
            height: sIsRefund ? "95%" : "90%",
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
              sIsRefund={sIsRefund}
              handlePaymentCapture={handlePaymentCapture}
              handleRefundCapture={handleRefundCapture}
              onCancel={() => {}}
              sAmountLeftToPay={sAmountLeftToPay}
              acceptsChecks={zSettings?.acceptChecks}
              sCashSaleActive={sCashSaleActive}
              sRefundAmount={sRefundAmount}
              sRefundObj={sRefund}
              sIsDeposit={sIsDeposit}
              _setIsDeposit={_setIsDeposit}
              sSale={sSale}
              sCashChangeNeeded={sCashChangeNeeded}
              _setCashChangeNeeded={_setCashChangeNeeded}
              // sIsDeposit={sIsDeposit}
            />
            <StripeCreditCardComponent
              sCardSaleActive={sCardSaleActive}
              sIsRefund={sIsRefund}
              handlePaymentCapture={handlePaymentCapture}
              handleRefundCapture={handleRefundCapture}
              onCancel={() => {}}
              sAmountLeftToPay={sAmountLeftToPay}
              zSettingsObj={zSettings}
              sRefundAmount={sRefundAmount}
              sRefundObj={sRefund}
              sIsDeposit={sIsDeposit}
              _setIsDeposit={_setIsDeposit}
              sSale={sSale}
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
              zCustomer={zCustomer}
              sIsRefund={sIsRefund}
              sRefundScan={sRefundScan}
              _sSetRefundScan={handleRefundScan}
              _zSetIsCheckingOut={_zSetIsCheckingOut}
              handleCancelPress={closeCheckoutScreenModal}
              payments={sSale?.payments}
              sAmountLeftToPay={sAmountLeftToPay}
              sFocusedItem={sFocusedItem}
              _setFocusedItem={_setFocusedItem}
              _setIsRefund={_setIsRefund}
              sScanFailureMessage={sRefundScanMessage}
              _setScanFailureMessage={_setRefundScanMessage}
              sRefundAmount={sRefundAmount}
              _setRefundAmount={_setRefundAmount}
              sCardRefundFee={sCardRefundFee}
              sShouldChargeCardRefundFee={sShouldChargeCardRefundFee}
              sCardRefundFeePercentage={zSettings.cardRefundFeePercent}
              sAmountRefunded={sAmountRefunded}
              sRefund={sRefund}
              sApplyDeposit={sApplyDeposit}
              sSale={sSale}
              sCashChangeNeeded={sCashChangeNeeded}
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
                  disabled={sSale?.paymentComplete || sIsRefund}
                  onFocus={() => _setFocusedItem("search")}
                  autoFocus={sFocusedItem === "search"}
                  style={{
                    borderBottomColor: gray(0.3),
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
                isRefund={sIsRefund}
                _setRefundItem={_setRefundItems}
                sRefundItem={sRefundItems}
                handleRefundItemCheck={handleRefundItemCheck}
                _setCombinedWorkorders={_setCombinedWorkorders}
                sSale={sSale}
              />
            )}
          </View>
        </View>
      )}
    />
  );
}

const MiddleItemComponent = ({
  sTotalDiscountAmount,
  sAmountLeftToPay,
  zCustomer,
  sIsRefund,
  sRefundScan,
  _sSetRefundScan,
  sTotalTaxAmount,
  sSubtotalAmount,
  handleCancelPress,
  payments,
  sFocusedItem,
  _setFocusedItem,
  sScanFailureMessage,
  _setScanFailureMessage,
  sRefundAmount,
  sApplyDeposit,
  sRefund = {
    cashRefundRequested: 0,
    cardRefundRequested: 0,
    totalCashRefundAllowed: 0,
    totalCardRefundAllowedArr: [],
    totalCardRefundAllowed: 0,
    cashAmountRefunded: 0,
    cardAmountRefunded: 0,
    totalRefundRequested: 0,
    cardTransactionArr: [],
    cashTransactionArr: [],
  },
  sShouldChargeCardRefundFee,
  sCardRefundFee,
  sCardRefundFeePercentage,
  sAmountRefunded,
  sSale,
  sCashChangeNeeded,
}) => {
  return (
    <View
      style={{
        width: "100%",
        height: "100%",
        // justifyContent:
        // padding: 20,
      }}
    >
      {zCustomer?.id ? (
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
                {zCustomer?.first + " " + zCustomer?.last}
              </Text>
              <Text style={{ color: gray(0.6), fontSize: 12 }}>
                {zCustomer?.email}
              </Text>
            </View>
            <View>
              {zCustomer?.cell ? (
                <Text style={{ color: C.textMain }}>
                  <Text style={{ color: gray(0.5) }}>{"cell: "}</Text>
                  {addDashesToPhone(zCustomer?.cell)}
                </Text>
              ) : null}
              {zCustomer?.land ? (
                <Text style={{ color: C.textMain }}>
                  <Text style={{ color: gray(0.5) }}>{"land: "}</Text>
                  {addDashesToPhone(zCustomer?.land)}
                </Text>
              ) : null}
            </View>
          </View>

          {zCustomer?.streetAddress ? (
            <Text>{zCustomer.streetAddress}</Text>
          ) : null}
          {zCustomer?.unit ? <Text>{zCustomer.unit}</Text> : null}
          {zCustomer?.city ? <Text>{zCustomer.city}</Text> : null}
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
            enabled={!sIsRefund && !sSale?.payments.length > 0}
            text={"Refund"}
            isChecked={sIsRefund}
            onCheck={() =>
              sRefundScan.length !== 12
                ? _setScanFailureMessage("Must scan/enter 12-digit sale ID")
                : null
            }
          />
          <Text style={{ fontSize: 12, color: RED_COLOR }}>
            {sSale?.payments.length > 0 ? "" : sScanFailureMessage}
          </Text>
        </View>
        <TextInput
          disabled={sSale?.payments.length > 0}
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
            color: sSale?.payments.length > 0 ? gray(0.3) : C.textMain,
          }}
          onFocus={() => {
            _setFocusedItem("refund");
            // _sSetRefundScan("");
          }}
          placeholder="Scan sale receipt (12 digit number)"
          placeholderTextColor={gray(0.38)}
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
          // minHeight: "20%",
          // maxHeight: "30%",
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
          <Text style={{ fontSize: 13, color: gray(0.5) }}>SUBTOTAL</Text>
          <View style={{ flexDirection: "row" }}>
            <Text
              style={{
                fontSize: 13,
                color: gray(0.5),
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
              {formatCurrencyDisp(sSale?.subtotal)}
            </Text>
          </View>
        </View>
        {sSale?.discount ? (
          <View
            style={{
              width: "100%",
              height: 1,
              marginVertical: 10,
              backgroundColor: C.buttonLightGreenOutline,
            }}
          />
        ) : null}
        {sSale?.discount ? (
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
                {"- " + formatCurrencyDisp(sSale?.discount)}
              </Text>
            </View>
          </View>
        ) : null}
        {sSale?.discount ? (
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
                color: gray(0.5),
              }}
            >
              DISCOUNTED TOTAL
            </Text>
            <View style={{ flexDirection: "row" }}>
              <Text
                style={{
                  fontSize: 13,
                  color: gray(0.5),
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
                {formatCurrencyDisp(sSale?.subtotal - sSale?.discount)}
              </Text>
            </View>
          </View>
        ) : null}
        {sSale?.discount ? (
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
          <Text style={{ fontSize: 13, color: gray(0.5) }}>SALES TAX</Text>
          <View style={{ flexDirection: "row" }}>
            <Text
              style={{
                fontSize: 13,
                color: gray(0.5),
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
              {formatCurrencyDisp(sSale?.tax)}
            </Text>
          </View>
        </View>
        {sShouldChargeCardRefundFee &&
        sIsRefund &&
        sRefund.totalCardRefundAllowed > 0 ? (
          <View
            style={{
              width: "100%",
              height: 1,
              backgroundColor: C.buttonLightGreenOutline,
              marginVertical: 10,
            }}
          />
        ) : null}
        {sShouldChargeCardRefundFee &&
        sIsRefund &&
        sRefund.totalCardRefundAllowed > 0 ? (
          <View
            style={{
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "space-between",
              width: "100%",
            }}
          >
            <Text style={{ fontSize: 13, color: gray(0.5) }}>{"SUBTOTAL"}</Text>
            <View style={{ flexDirection: "row" }}>
              <Text
                style={{
                  fontSize: 13,
                  color: gray(0.5),
                  marginRight: 10,
                }}
              >
                $
              </Text>
              <Text
                style={{
                  fontWeight: 500,
                  fontSize: 18,
                  color: C.green,
                }}
              >
                {formatCurrencyDisp(
                  sSale?.subtotal + sSale?.tax - sSale?.discount
                )}
              </Text>
            </View>
          </View>
        ) : null}

        {sShouldChargeCardRefundFee &&
        sIsRefund &&
        sRefund.totalCardRefundAllowed > 0 ? (
          <View
            style={{
              width: "100%",
              height: 1,
              marginVertical: 10,
              backgroundColor: C.buttonLightGreenOutline,
            }}
          />
        ) : null}

        {sShouldChargeCardRefundFee && sRefund.totalCardRefundAllowed > 0 ? (
          <View
            style={{
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "space-between",
              width: "100%",
            }}
          >
            <Text style={{ fontSize: 13, color: C.red }}>
              {"CARD RE-PROCESSING FEE (" + sCardRefundFeePercentage + "%)"}
            </Text>
            <View style={{ flexDirection: "row" }}>
              <Text
                style={{
                  fontSize: 13,
                  color: gray(0.5),
                  marginRight: 10,
                }}
              >
                $
              </Text>
              <Text
                style={{
                  fontWeight: 500,
                  fontSize: 15,
                  color: C.red,
                }}
              >
                {formatCurrencyDisp(sCardRefundFee)}
              </Text>
            </View>
          </View>
        ) : null}

        {sRefund?.totalCardRefundAllowedArr?.map((cardObj) => (
          <View
            style={{
              width: "100%",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <View>
              <Text>{"CARD REFUND ALLOWED"}</Text>
              <Text style={{ fontSize: 13 }}>
                {cardObj.cardType +
                  "      " +
                  cardObj.expMonth +
                  "/" +
                  cardObj.expYear}
              </Text>
              <Text style={{ fontSize: 12 }}>
                {"**********" + cardObj.last4}
              </Text>
            </View>
            <View style={{ flexDirection: "row" }}>
              <Text
                style={{
                  fontSize: 13,
                  color: gray(0.5),
                  marginRight: 10,
                }}
              >
                $
              </Text>
              <Text style={{ fontSize: 18, fontWeight: 500 }}>
                {formatCurrencyDisp(
                  cardObj.amountCaptured - sShouldChargeCardRefundFee
                    ? sCardRefundFee
                    : 0
                )}
              </Text>
            </View>
          </View>
        ))}
        {sRefund.totalCashRefundAllowed ? (
          <View
            style={{
              width: "100%",
              height: 1,
              marginVertical: 10,
              backgroundColor: C.buttonLightGreenOutline,
            }}
          />
        ) : null}
        {sRefund.totalCashRefundAllowed ? (
          <View
            style={{
              width: "100%",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text>{"CASH REFUND ALLOWED"}</Text>
            <View style={{ flexDirection: "row" }}>
              <Text
                style={{
                  fontSize: 13,
                  color: gray(0.5),
                  marginRight: 10,
                }}
              >
                $
              </Text>
              <Text>{formatCurrencyDisp(sRefund.totalCashRefundAllowed)}</Text>
            </View>
          </View>
        ) : null}
        <View
          style={{
            width: "100%",
            height: 1,
            marginVertical: 10,
            backgroundColor: C.buttonLightGreenOutline,
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
          <Text style={{ fontSize: 16, color: gray(0.5) }}>
            {sIsRefund ? "TOTAL REFUND" : "TOTAL SALE"}
          </Text>
          <View style={{ flexDirection: "row" }}>
            <Text
              style={{
                fontSize: 13,
                color: gray(0.5),
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
              {formatCurrencyDisp(
                sIsRefund ? sRefund.totalRefundRequested : sSale?.total
              )}
            </Text>
          </View>
        </View>
      </View>
      <View
        style={{
          width: "100%",
          alignItems: "flex-end",
          marginTop: 10,
          paddingRight: 7,
        }}
      >
        {sIsRefund && sRefund.totalCashRefundAllowed > 0 ? (
          <Text
            style={{
              fontSize: 18,
              fontWeight: 500,
              color: sSale?.paymentComplete ? C.green : C.red,
            }}
          >
            {sSale?.paymentComplete
              ? "CASH REFUND COMPLETE!"
              : "CASH REFUNDED:   $" + sRefund.cashAmountRefunded}
          </Text>
        ) : null}
        {sIsRefund && sRefund.totalCardRefundAllowed > 0 ? (
          <Text
            style={{
              fontSize: 18,
              fontWeight: 500,
              color: sSale?.paymentComplete ? C.green : C.red,
            }}
          >
            {sSale?.paymentComplete
              ? "CARD REFUND COMPLETE!"
              : "CARD REFUNDED:   $" + sRefund.cardAmountRefunded}
          </Text>
        ) : null}
        {!sIsRefund ? (
          <Text
            style={{
              fontSize: 18,
              fontWeight: 500,
              color: sSale?.paymentComplete ? C.green : RED_COLOR,
            }}
          >
            {!sSale?.paymentComplete
              ? "AMOUNT LEFT TO PAY:   $" +
                formatCurrencyDisp(sSale?.total - sSale?.amountCaptured)
              : "PAYMENT COMPLETE!"}
          </Text>
        ) : null}
      </View>

      {/**Payments list //////////////////////////////////////////////////// */}

      {payments ? (
        <View
          style={{ marginTop: 30, alignItems: "flex-end", paddingRight: 10 }}
        >
          <Text style={{ color: gray(0.4) }}>PAYMENTS</Text>
        </View>
      ) : null}

      <ScrollView style={{ maxHeight: "30%", width: "100%" }}>
        {payments?.map((paymentObj) => {
          return (
            <View
              key={paymentObj.id}
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
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                }}
              >
                <Text>Amount received: </Text>
                <Text>{formatCurrencyDisp(paymentObj.amountCaptured)}</Text>
              </View>
              {paymentObj.last4 ? (
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <Text style={{ color: gray(0.4), fontSize: 13 }}>
                    Last 4 Digits:{" "}
                  </Text>
                  <Text style={{ color: gray(0.4), fontSize: 13 }}>
                    {"***" + paymentObj.last4}
                  </Text>
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
                  <Text>{formatCurrencyDisp(paymentObj.amountTendered)}</Text>
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
                    {formatCurrencyDisp(
                      paymentObj.amountTendered - paymentObj.amountCaptured
                    )}
                  </Text>
                </View>
              ) : null}
              {paymentObj.isRefund ? <Text>{"REFUND"}</Text> : null}
            </View>
          );
        })}
      </ScrollView>

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
        {/* {payments?.length > 0 && !sSale?.paymentComplete ? (
          <SliderButton_ onConfirm={(val) => log("val", val)} />
        ) : null} */}
        <Button_
          enabled={
            sSale?.paymentComplete ||
            (!sSale?.amountCaptured > 0 && !sSale?.paymentComplete)
          }
          colorGradientArr={
            sSale?.paymentComplete ? COLOR_GRADIENTS.red : COLOR_GRADIENTS.red
          }
          text={sSale?.paymentComplete ? "CLOSE" : "CANCEL"}
          onPress={handleCancelPress}
          textStyle={{ color: C.textWhite }}
          buttonStyle={{ width: 150 }}
        />
        {sCashChangeNeeded ? (
          <View
            style={{
              ...checkoutScreenStyle.boxStyle,
              width: "30%",
              paddingTop: 2,
              paddingBottom: 2,
              flexDirection: "column",
            }}
          >
            <Text
              style={{
                fontSize: 11,
                color: gray(0.3),
                width: "100%",
                textAlign: "left",
                paddingBottom: 3,
              }}
            >
              CHANGE
            </Text>
            <Text
              placeholder={"0.00"}
              style={{
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
          </View>
        ) : null}
        {payments?.length > 0 && sSale?.paymentComplete ? (
          <Button_
            buttonStyle={{ width: 150, color: C.textWhite }}
            colorGradientArr={COLOR_GRADIENTS.greenblue}
            text={"REPRINT"}
            textStyle={{ color: C.textWhite }}
            onPress={() => log("reprint receit method needed")}
          />
        ) : null}
      </View>
    </View>
  );
};

const CashSaleComponent = ({
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
  sRefund = {
    cashRefundRequested: 0,
    cardRefundRequested: 0,
    totalCashRefundAllowed: 0,
    totalCardRefundAllowedArr: [],
    totalCardRefundAllowed: 0,
    cashAmountRefunded: 0,
    cardAmountRefunded: 0,
    totalRefundRequested: 0,
    cardTransactionArr: [],
    cashTransactionArr: [],
  },
}) => {
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
  }, [sTenderAmount, sRequestedAmount]);

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
    log(diff);
    if (diff < 0) {
      // log("here1");
      _setCashChangeNeeded(formatCurrencyDisp(0));
    } else {
      // log("here2");
      _setCashChangeNeeded(formatCurrencyDisp(diff));
    }
  }

  function handleKeyPress(event) {
    if (event.nativeEvent.key == "Enter")
      sIsRefund ? handleProcessRefundPress() : handleProcessPaymentPress();
  }

  //   log(sProcessButtonEnabled.toString());

  let refundReady = true;
  if (sIsRefund && !sRefund.cashRefundRequested) refundReady = false;
  // log("cash sale complete", sSale?.paymentComplete);
  return (
    <View
      pointerEvents={sSale?.paymentComplete ? "none" : "auto"}
      style={{
        ...checkoutScreenStyle.base,
        opacity: sSale?.paymentComplete || !refundReady ? 0.2 : 1,
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
          color: sIsRefund ? RED_COLOR : checkoutScreenStyle.titleText.color,
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
          <Text style={{ color: C.textMain, marginTop: 4 }}>Balance</Text>
          <Text
            style={{
              marginBottom: 15,
              color: sIsRefund ? RED_COLOR : C.textMain,
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
              color: C.textMain,
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
                  !sCashSaleActive || sSale?.paymentComplete || !refundReady
                }
                style={{
                  fontSize: 20,
                  outlineWidth: 0,
                  color: sIsRefund ? RED_COLOR : C.textMain,
                  paddingRight: 2,
                  textAlign: "right",
                }}
                placeholder="0.00"
                placeholderTextColor={gray(0.3)}
                value={sRequestedAmountDisp}
                onChangeText={(val) => {
                  val = usdTypeMask(val).display;
                  let cents = dollarsToCents(val);
                  if (!cents) cents = 0;
                  if (val === "0.00") val = "";
                  _setStatusMessage("");
                  _setRequestedAmount(cents);
                  _setRequestedAmountDisp(val);
                }}
              />
            </View>
          </View>
        </View>
      </View>

      <CheckBox_
        enabled={!sSale?.payments.length > 0}
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
            marginLeft: 20,
            ...checkoutScreenStyle.boxStyle,
            width: "35%",
            paddingBottom: 6,
            paddingRight: 7,
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
                !sCashSaleActive || sSale?.paymentComplete || !refundReady
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
              {sIsRefund ? "Refund Amount" : "Tender"}
            </Text>
          </View>
        </View>
      </View>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-around",
          width: "100%",
          alignItems: "center",
          marginTop: 10,
        }}
      >
        <Button_
          colorGradientArr={COLOR_GRADIENTS.green}
          textStyle={{ color: C.textWhite, fontSize: 16 }}
          enabled={
            sProcessButtonEnabled && !sSale?.paymentComplete && sCashSaleActive
          }
          onPress={() => handleProcessPaymentPress()}
          text={sIsRefund ? "PROCESS REFUND" : "COMPLETE"}
          buttonStyle={{
            cursor: sProcessButtonEnabled ? "inherit" : "default",
            width: 120,
          }}
        />
        <Button_
          buttonStyle={{
            cursor: sProcessButtonEnabled ? "inherit" : "default",
            // width: 120,
          }}
          textStyle={{ fontSize: 15, color: C.textMain }}
          colorGradientArr={COLOR_GRADIENTS.grey}
          enabled={!sSale?.paymentComplete && sCashSaleActive}
          onPress={handleCancelPress}
          text={"CANCEL"}
        />
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
      </View>
    </View>
  );
};

const StripeCreditCardComponent = ({
  sSale,
  sIsDeposit,
  sAmountLeftToPay,
  handlePaymentCapture,
  zSettings,
  sIsRefund,
  refundPaymentIntentID,
  sCardSaleActive,
  sRefundAmount,
  _setIsDeposit,
  sRefundObj: sRefund = {
    cashRefundRequested: 0,
    cardRefundRequested: 0,
    totalCashRefundAllowed: 0,
    totalCardRefundAllowedArr: [],
    totalCardRefundAllowed: 0,
    cashAmountRefunded: 0,
    cardAmountRefunded: 0,
    totalRefundRequested: 0,
    cardTransactionArr: [],
    cashTransactionArr: [],
    last4: "",
    cardType: "",
    cardExpMonth: "",
    cardExpYear: "",
  },
}) => {
  const [sRequestedAmount, _setRequestedAmount] = useState(
    sSale?.total - sSale?.amountCaptured
  );
  const [sRequestedAmountDisp, _setRequestedAmountDisp] = useState(
    formatCurrencyDisp(
      sRefund.cashRefundRequested
        ? sRefund.cashRefundRequested - sRefund.cashAmountRefunded
        : sSale?.total - sSale?.amountCaptured
    )
  );
  // const [sRefundAmountDisp, _setRefundAmountDisp] = useState(forma);
  const [sStatusMessage, _setStatusMessage] = useState("");
  const [sProcessButtonEnabled, _setProcessButtonEnabled] = useState(true);
  const [sFocusedItem, _setFocusedItem] = useState("");
  const [sCardReader, _setCardReader] = useState("");
  const [sCardReaders, _setCardReaders] = useState([]);
  const [sListeners, _setListeners] = useState([]);
  const [sPaymentIntentID, _setPaymentIntentID] = useState("");
  const [sStatusTextColor, _setStatusTextColor] = useState(C.green);
  const [sPartialPaymentAlert, _setPartialPaymentAlert] = useState(false);

  /////////////////////////////////////////////////////////////////////////
  useEffect(() => {
    if (
      sRequestedAmount > sSale?.total - sSale?.amountCaptured ||
      sRequestedAmount < 50
    ) {
      _setProcessButtonEnabled(false);
    } else {
      _setProcessButtonEnabled(true);
    }
  }, [sRequestedAmount]);

  useEffect(() => {
    // log(sRequestedAmount);
    getAvailableStripeReaders();

    return () => {
      try {
        sListeners.forEach((listener) => listener());
      } catch (e) {
        log("error canceling listener", e);
      }
    };
  }, [sRefund, zSettings]);

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
      arr.push(connectedReader);
    });
    _setCardReaders(arr);
    if (arrHasItem(arr, zSettings?.selectedCardReaderObj)) {
      _setCardReader(zSettings?.selectedCardReaderObj);
    } else {
      _setCardReader(arr[0]);
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

    if (!readerResult) {
      _setStatusMessage("No reader found\n(check connections/start/restart)");
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
    paymentIntentID
  ) {
    // clog("Stripe webhook update Obj", val);

    let failureCode = val?.failure_code;
    if (
      failureCode &&
      val?.process_payment_intent?.payment_intent == paymentIntentID
    ) {
      log("card failure code", failureCode);
      _setStatusTextColor(RED_COLOR);
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

  function handleProcessButtonPress() {}

  async function resetCardReader() {
    _setStatusMessage(RED_COLOR);
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
  if (sIsRefund && !sRefundAmount) refundReady = false;
  // log("stripe sale", sSale?.paymentComplete.toString());
  return (
    <View
      pointerEvents={sSale?.paymentComplete ? "none" : "auto"}
      style={{
        ...checkoutScreenStyle.base,
        opacity: sSale?.paymentComplete || !refundReady ? 0.2 : 1,
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
          color: sIsRefund ? RED_COLOR : checkoutScreenStyle.titleText.color,
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
          <Text style={{ color: C.textMain, marginTop: 10 }}>Balance</Text>
          <Text
            style={{
              marginBottom: 15,
              color: sIsRefund ? RED_COLOR : C.textMain,
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
              color: C.textMain,
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
                  color: sIsRefund ? RED_COLOR : C.textMain,
                  paddingRight: 2,
                  textAlign: "right",
                }}
                placeholder="0.00"
                placeholderTextColor={gray(0.3)}
                value={sRequestedAmountDisp}
                onChangeText={(val) => {
                  val = usdTypeMask(val).display;
                  let cents = dollarsToCents(val);
                  if (!cents) cents = 0;
                  if (val === "0.00") val = "";
                  _setStatusMessage("");
                  _setRequestedAmount(cents);
                  _setRequestedAmountDisp(val);
                }}
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
          marginVertical: sIsRefund ? "2%" : "8%",
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
          text={sIsRefund ? "PROCESS REFUND" : "PROCESS CARD"}
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
          }}
        >
          {sStatusMessage}
        </Text>
      </View>
    </View>
  );
};

const InventoryListComponent = ({
  inventoryItems,
  onSelect,
  quickItemButtons,
  _setSearchStr,
  sSale,
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
  sCombinedWorkorders,
  zOpenWorkorders,
  zOpenWorkorder,
  zInventory,
  zCustomerObj,
  zSettings,
  _zGetInventoryItem,
  handleCombineWorkorderCheck,
  isRefund,
  sRefundItemArr,
  handleRefundItemCheck,
  sSale,
}) => {
  if (!zInventory?.length > 0) return;

  function getWorkorderArr() {
    if (isRefund) {
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
  // clog(sCombinedWorkordersArr);
  // log("pay", sSale.payments.length);
  return (
    <ScrollView
      style={{
        width: "100%",
        opacity: sSale?.paymentComplete || sSale?.payments.length > 0 ? 0.5 : 1,
      }}
    >
      {getWorkorderArr().map((workorder, idx) => {
        return (
          <View
            pointerEvents="none"
            key={workorder.id}
            style={{
              width: "100%",
              borderColor: C.buttonLightGreenOutline,
              // backgroundColor: C.backgroundListWhite,
              backgroundColor: sCombinedWorkorders.find(
                (o) => o.id === workorder.id
              )
                ? C.backgroundListWhite
                : gray(0.03),
              borderWidth: 1,
              borderRadius: 10,
              padding: 10,
              marginBottom: 7,
              opacity: sSale?.paymentComplete ? 0.2 : null,
            }}
          >
            {!isRefund && idx !== 0 ? (
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
                text={"ADD TO SALE"}
                onCheck={() =>
                  zOpenWorkorder?.id === workorder.id ||
                  isRefund ||
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
                      color: gray(0.6),
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
                  let inventoryItem = _zGetInventoryItem(
                    workorderLine.inventoryItem.id
                  );
                  // log("item", inventoryItem);
                  return (
                    <View
                      style={{
                        flexDirection: "row",
                        width: "100%",
                        alignItems: "center",
                        backgroundColor: !arrHasItem(
                          sRefundItemArr,
                          workorderLine
                        )
                          ? C.listItemWhite
                          : lightenRGBByPercent(C.blue, 60),
                        paddingVertical: 2,
                        marginBottom: 3,
                        borderColor: "transparent",
                        borderLeftColor: lightenRGBByPercent(C.green, 60),
                        borderLeftWidth: isRefund ? 0 : 2,
                        paddingLeft: 10,
                        borderRadius: 15,
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
                        {isRefund ? (
                          <CheckBox_
                            onCheck={() => {
                              handleRefundItemCheck(workorderLine);
                            }}
                            isChecked={arrHasItem(
                              sRefundItemArr,
                              workorderLine
                            )}
                            buttonStyle={{
                              marginRight: 15,
                            }}
                          />
                        ) : null}

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
                              formatCurrencyDisp(
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
                                formatCurrencyDisp(
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
                                formatCurrencyDisp(
                                  workorderLine.discountObj.newPrice
                                )
                              : workorderLine.qty > 1
                              ? "$" +
                                formatCurrencyDisp(
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
                      color: C.textMain,
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
                      color: C.textMain,
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
                      color: C.textMain,
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

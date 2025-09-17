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
import { StripeCreditCardComponent } from "./CardSaleComponent";
import { CashSaleComponent } from "./CashSaleComponent";
import { MiddleItemComponent } from "./MiddleItemComponent";

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
  const [sRefund, _setRefund] = useState({
    refundedLines: [],
    requestedRefundLines: [],
    cashRefundRequested: 0,
    cardRefundRequested: 0,
    totalRefundRequested: 0,
    totalCashRefundAllowed: 0,
    totalCardRefundAllowed: 0,
    cashAmountRefunded: 0,
    cardAmountRefunded: 0,
    cardTransactions: [],
    cashTransactions: [],
    sale: {},
  });
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
  const [sShouldChargeCardRefundFee, _setShouldChargeCardRefundFee] =
    useState(true);
  const [sCashChangeNeeded, _setCashChangeNeeded] = useState(null);
  const [sRefundPaymentOverride, _setRefundPaymentOverride] = useState(false);

  // watch the combined workorders array and adjust accordingly

  // 730921185148
  let scan = "592218957081"; // test

  // all startup stuff here
  useEffect(() => {
    // insert open workorder into combined workorders array
    if (sIsRefund) return;
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
        setRunningSaleTotals(sale, combinedWorkorders);
        // setRefund(zOpenWorkorder, sale);
      }
      _setCombinedWorkorders(combinedWorkorders);
    }

    // testing
    _sSetRefundScan(scan);
    if (sCombinedWorkorders.length > 0) return;
    handleRefundScan(scan);
  }, [zOpenWorkorder, sCombinedWorkorders, zSettings, sSale, sIsRefund]);

  // run the totals on combined workorders change
  useEffect(() => {
    if (sSale && sCombinedWorkorders && !sIsRefund)
      setRunningSaleTotals(sSale, sCombinedWorkorders);
    // log("running");
  }, [sCombinedWorkorders, sIsRefund]);

  // watch incoming refund Sale from db. check to see which lines have already been refunded in past transactions
  useEffect(() => {
    if (sIsRefund) {
      // log(sCombinedWorkorders);
      let alreadyRefundedLines = [];
      sCombinedWorkorders.forEach((combinedWorkorder) => {
        // log("comb", combinedWorkorder);
        combinedWorkorder.workorderLines.forEach((line) => {
          let found = sSale?.refundedWorkorderLines?.find(
            (lineID) => lineID === line.id
          );
          if (found) alreadyRefundedLines.push(found);
        });
      });
      let refund = cloneDeep(sRefund);
      refund.refundedLines = alreadyRefundedLines;
      _setRefund(refund);
    }
  }, [sCombinedWorkorders, sIsRefund, sSale]);

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

  ///////////////////  SALES /////////////////////////////////////
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

  function setRunningSaleTotals(sale, combinedWorkorders) {
    // log("sale", sale);
    // log("combined", combinedWorkorders);
    if (sIsRefund) return;
    sale = cloneDeep(sale);
    let {
      runningQty,
      runningSubtotal,
      runningTotal,
      runningDiscount,
      runningTax,
    } = calculateRunningTotals(
      combinedWorkorders,
      zSettings?.salesTax
      // refundItems,
      // sIsRefund
    );

    sale.subtotal = runningSubtotal;
    sale.discount = runningDiscount;
    sale.total = runningTax + runningTotal;
    sale.tax = runningTax;
    // sale.cardRefundFee = runningTotal * (zSettings.cardRefundFeePercent / 100);
    // log("new sale", sale);
    _setSale(sale);
  }

  ////////////// REFUNDS ///////////////////////////////////////

  function handleRefundScan(refundScan) {
    if (refundScan.length === 12) {
      _setIsRefund(false);
      _setCombinedWorkorders([]);
      _setRefundScanMessage("Searching for transaction...");
      _setSale(null);

      dbGetSaleItem(refundScan)
        .then((sale) => {
          if (sale) {
            _setRefundScanMessage("Transaction Found! Gathering details...");
            _setIsRefund(true);
            let count = 0;
            let workorders = [];
            sale.workorderIDs.forEach((workorderID) => {
              dbGetOpenWorkorderItem(workorderID).then((workorder) => {
                count++;
                // if (workorder) addToCombinedArr(workorder);
                if (workorder) workorders.push(workorder);
                if (count === sale.workorderIDs.length) {
                  splitIncomingRefundWorkorderLines(workorders, sale);
                  // _setCombinedWorkorders(workorders);
                }
                // addToCombinedArr(workorders, sale);
              });

              dbGetClosedWorkorderItem(workorderID).then((workorder) => {
                count++;
                // if (res) addToCombinedArr(res);
                if (workorder) workorders.push(workorder);
                if (count === sale.workorderIDs.length)
                  splitIncomingRefundWorkorderLines(workorders, sale);
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

  function splitIncomingRefundWorkorderLines(combinedWorkorders, sale) {
    let refund = cloneDeep(sRefund);
    // split the incoming refund sale workorders by default so we can select one at a time for refunding
    let newArr = [];
    combinedWorkorders.forEach((wo) => {
      let newWO = cloneDeep(wo);
      let workorderLines = [];
      wo.workorderLines.forEach((line) => {
        for (let i = 1; i <= line.qty; i++) {
          // add on a random string to end of workorder line ID so they all have unique ID's
          workorderLines.push({
            ...line,
            discountSavings: line.discountObj.savings / line.qty || 0,
            id: line.id + generateRandomID(),
          });
        }
      });
      newWO.workorderLines = workorderLines;
      newArr.push(newWO);
    });
    // log(newArr);
    _setCombinedWorkorders(newArr);
    setRefundRunningTotals(sale);
  }

  function setRefundRunningTotals(sale) {
    // look at previous refunds and calculate what has been done, what we can do still
    let refund = cloneDeep(sRefund);
    // refund.sale = sale;
    sale.payments.forEach((payment) => {
      let cardRefundAllowedTotal = 0;
      let cashRefundAllowedTotal = 0;
      payment = cloneDeep(payment);
      if (payment.last4) {
        // this is a credit card, add to credit card payment transactions arr
        refund.cardTransactions = replaceOrAddToArr(
          refund.cardTransactions,
          payment
        );

        // add the total card refund allowed, subtract what has already been refunded. card payments have individual refunds at the Payment object level, cash payments we keep track of at the Sale object level in the Refund object
        cardRefundAllowedTotal =
          cardRefundAllowedTotal + payment.amountCaptured;
        -payment.amountRefunded ? payment.amountRefunded : 0;
        refund.totalCardRefundAllowed = cardRefundAllowedTotal;
      } else {
        // add cash transactions to cash transactions arr
        refund.cashTransactions = replaceOrAddToArr(
          refund.cashTransactions,
          payment
        );

        // add to the total cash refund allowed
        cashRefundAllowedTotal =
          cardRefundAllowedTotal + payment.amountCaptured;
      }
      refund.totalCashRefundAllowed = cashRefundAllowedTotal;
    });

    // now look throught the previous refunds and see if there are any cash refunds, subtract them from the cash refund allowed
    let cashRefunded = 0;
    sale.refunds?.forEach(
      (refund) =>
        (cashRefunded += refund.cardPaymentID ? 0 : refund.amountRefunded)
    );
    refund.totalCashRefundAllowed =
      refund.totalCashRefundAllowed - cashRefunded;

    _setRefund(refund);
    _setSale(sale);
  }

  function handleRefundItemCheck(workorder, workorderLine) {
    let refund = cloneDeep(sRefund);
    workorder = cloneDeep(workorder);
    let salesTaxMultiplier = sSale.salesTaxPercent / 100 + 1;

    // add or remove the incoming checked item from requested refunds arr
    refund.requestedRefundLines = addOrRemoveFromArr(
      refund.requestedRefundLines,
      workorderLine
    );

    // calculate the running total refund requested
    let runningRefund = 0;
    let runningCardRefund = 0;
    let runningCashRefund = 0;
    refund.requestedRefundLines.forEach(
      (line) =>
        (runningRefund +=
          (line.inventoryItem.price - line.discountSavings) *
          salesTaxMultiplier)
    );
    refund.totalRefundRequested = runningRefund;

    refund.cashRefundRequested = 0;
    refund.cardRefundRequested = 0;
    if (!refund.totalCardRefundAllowed) {
      refund.cashRefundRequested = runningRefund;
    } else if (!refund.totalCashRefundAllowed) {
      refund.cardRefundRequested = runningRefund;
    } else if (runningRefund > refund.totalCardRefundAllowed) {
      refund.cardRefundRequested = refund.totalCardRefundAllowed;
      refund.cashRefundRequested =
        runningRefund - refund.totalCardRefundAllowed;
    } else {
      refund.cardRefundRequested = runningRefund;
    }

    // log("cash", refund.cashRefundRequested);
    // log("card", refund.cardRefundRequested);
    // log("total", refund.totalRefundRequested);
    _setRefund(refund);
  }

  function closeCheckoutScreenModal() {
    _zSetIsCheckingOut(false);
  }

  function printReceipt(payment) {}

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
              acceptsChecks={zSettings?.acceptChecks}
              sCashSaleActive={sCashSaleActive}
              sRefund={sRefund}
              sIsDeposit={sIsDeposit}
              _setIsDeposit={_setIsDeposit}
              sSale={sSale}
              _setCashChangeNeeded={_setCashChangeNeeded}
              sRefundPaymentOverride={sRefundPaymentOverride}
            />
            <StripeCreditCardComponent
              sCardSaleActive={sCardSaleActive}
              sIsRefund={sIsRefund}
              handlePaymentCapture={handlePaymentCapture}
              onCancel={() => {}}
              sRefundPaymentOverride={sRefundPaymentOverride}
              zSettingsObj={zSettings}
              sRefund={sRefund}
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
                sIsRefund={sIsRefund}
                // _setRefundItem={_setRefundItems}
                handleRefundItemCheck={handleRefundItemCheck}
                _setCombinedWorkorders={_setCombinedWorkorders}
                sSale={sSale}
                sRefund={sRefund}
              />
            )}
          </View>
        </View>
      )}
    />
  );
}

const InventoryListComponent = ({
  inventoryItems,
  onSelect,
  quickItemButtons,
  _setSearchStr,
  sSale,
  sRefund = {
    cashRefundRequested: 0,
    cardRefundRequested: 0,
    totalCashRefundAllowed: 0,
    totalCardRefundAllowed: 0,
    cardRefunded: 0,
    cashRefunded: 0,
    cardTransactions: [],
    cashTransactions: [],
    refundedLines: [],
  },
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
  zCustomer,
  zSettings,
  _zGetInventoryItem,
  handleCombineWorkorderCheck,
  sIsRefund,
  handleRefundItemCheck,
  sSale,
  sRefund = {
    cashRefundRequested: 0,
    cardRefundRequested: 0,
    totalCashRefundAllowed: 0,
    totalCardRefundAllowed: 0,
    cardRefunded: 0,
    cashRefunded: 0,
    cardTransactions: [],
    cashTransactions: [],
    refundedLines: [],
    requestedRefundLines: [],
  },
}) => {
  if (!zInventory?.length > 0) return;

  function getWorkorderArr() {
    if (sIsRefund) {
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

  // log(sIsRefund.toString());
  function getOpacity() {
    if (sIsRefund) {
      // if ()
    } else {
      if (!sSale?.paymentComplete || sSale.payments.length > 0) return 0.5;
    }
    return 1;
  }

  // log(sRefund);
  return (
    <ScrollView
      style={{
        width: "100%",
        opacity: getOpacity(),
      }}
    >
      {getWorkorderArr().map((workorder, idx) => {
        return (
          <View
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
            }}
          >
            {!sIsRefund && idx !== 0 ? (
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
                  sIsRefund ||
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
                  // log("item", workorderLine.qty);
                  return (
                    <View
                      style={{
                        flexDirection: "row",
                        width: "100%",
                        alignItems: "center",
                        backgroundColor: !arrHasItem(
                          sRefund.requestedRefundLines,
                          workorderLine
                        )
                          ? C.listItemWhite
                          : lightenRGBByPercent(C.blue, 60),
                        paddingVertical: 2,
                        marginBottom: 3,
                        borderColor: "transparent",
                        borderLeftColor: lightenRGBByPercent(C.green, 60),
                        borderLeftWidth: sIsRefund ? 0 : 2,
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
                        {sIsRefund ? (
                          <CheckBox_
                            onCheck={() =>
                              handleRefundItemCheck(workorder, workorderLine)
                            }
                            isChecked={
                              arrHasItem(
                                sRefund.requestedRefundLines,
                                workorderLine
                              )
                                ? true
                                : false
                            }
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
                          // backgroundColor: C.red,
                        }}
                      >
                        {!sIsRefund ? (
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
                        ) : null}
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
                                workorderLine.inventoryItem.price
                              )}
                          </Text>
                          {workorderLine.discountObj.savings ? (
                            <View style={{ alignItems: "flex-end" }}>
                              <Text
                                style={{
                                  paddingHorizontal: 0,
                                  minWidth: 30,
                                  color: C.lightred,
                                }}
                              >
                                {"$ -" +
                                  formatCurrencyDisp(
                                    workorderLine.discountSavings
                                  )}
                              </Text>
                              <Text
                                style={{
                                  fontWeight: "600",
                                  minWidth: 30,
                                  marginTop: 0,
                                  paddingHorizontal: 0,
                                  color: Colors.darkText,
                                }}
                              >
                                {formatCurrencyDisp(
                                  workorderLine.inventoryItem.price -
                                    workorderLine.discountSavings
                                )}
                              </Text>
                            </View>
                          ) : null}
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

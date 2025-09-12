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
import { cloneDeep } from "lodash";
import {
  addDashesToPhone,
  applyLineItemDiscounts,
  calculateRunningTotals,
  checkInputForNumbersOnly,
  clog,
  formatDecimal,
  formatNumberForCurrencyDisplay,
  fuzzySearch,
  generateRandomID,
  generateUPCBarcode,
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
  dbProcessServerDrivenStripePayment,
  dbRetrieveAvailableStripeReaders,
  dbSetSalesObj,
} from "../../../db_call_wrapper";
import { TouchableOpacity } from "react-native";

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

  const [sPaymentComplete, _setPaymentComplete] = useState(false);
  const [sRefundScan, _sSetRefundScan] = useState("");
  const [sIsRefund, _setIsRefund] = useState(false);
  const [sTotalAmount, _setTotalAmount] = useState(0);
  const [sSubtotalAmount, _setSubtotalAmount] = useState(0);
  const [sTotalDiscountAmount, _setTotalDiscountAmount] = useState(0);
  const [sTotalTaxAmount, _setTotalTaxAmount] = useState(0);

  const [sPaymentsCaptured, _setPaymentsCaptured] = useState([]);
  const [sSelectedWorkordersToCombine, _setSelectedWorkordersToCombine] =
    useState([zOpenWorkorderObj]);
  const [sCalculatedOpenWorkorder, _setCalculatedOpenWorkorder] = useState();
  const [sAmountLeftToPay, _setAmountLeftToPay] = useState();
  const [sSaleObj, _setSaleObj] = useState();
  const [sSearchString, _setSearchString] = useState("");
  const [sInventorySearchRes, _setInventorySearchRes] = useState([]);
  const [sFocusedItem, _setFocusedItem] = useState("");
  //

  useEffect(() => {
    // searchInventory("prch");
    return () => {
      // log("returning");
    };
  }, [zOpenWorkordersArr]);

  // watch the combined workorders array and adjust accordingly
  useEffect(() => {
    setTotals();
    // log(sSelectedWorkordersToCombine);
    // clog(zOpenWorkorderObj);
  }, [sSelectedWorkordersToCombine, zOpenWorkorderObj]);

  function setTotals(workorder) {
    // clog(wo);
    let {
      runningQty,
      runningSubtotal,
      runningTotal,
      runningDiscount,
      runningTax,
    } = calculateRunningTotals(
      workorder || sSelectedWorkordersToCombine,
      zSettingsObj?.salesTax
    );

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

    _setAmountLeftToPay(runningTax + runningTotal - totalPaid);
  }

  function handlePaymentCapture(paymentObj = PAYMENT_OBJECT_PROTO) {
    // let saleObj = openW
    // create or find existing sale object
    let saleObj = cloneDeep(sSaleObj);
    if (!sSaleObj) {
      saleObj = cloneDeep(SALE_OBJECT_PROTO);
      saleObj.id = generateUPCBarcode();
      saleObj.millis = new Date().getTime();
    }

    // need to send print object here

    // add payment obj to sale obj
    paymentObj.saleID = saleObj.id;
    saleObj.paymentArr.push(paymentObj);

    sSelectedWorkordersToCombine.forEach((wo) => {
      wo.saleObjID = saleObj.id;
      _zSetWorkorder(wo); // send to db
    });

    _setSaleObj(saleObj);
    dbSetSalesObj(saleObj);

    // calculate total paid on this workorder
    let totalPaid = 0;
    saleObj.paymentArr.forEach((paymentObj) => {
      totalPaid += paymentObj.amountCaptured;
    });

    _setAmountLeftToPay(sTotalAmount - totalPaid);
  }

  function handleCombineWorkorderCheck(wo) {
    if (sSelectedWorkordersToCombine.find((o) => o.id === wo.id)) {
      _setSelectedWorkordersToCombine(
        sSelectedWorkordersToCombine.filter((o) => o.id !== wo.id)
      );
      return;
    }

    _setSelectedWorkordersToCombine([...sSelectedWorkordersToCombine, wo]);
  }

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
    let arr = sSelectedWorkordersToCombine.map((o) =>
      o.id === wo.id ? wo : o
    );
    // clog(arr);
    _setSelectedWorkordersToCombine(arr);
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
              amountLeftToPay={sAmountLeftToPay}
              acceptsChecks={zSettingsObj?.acceptChecks}
            />
            <StripeCreditCardComponent
              isRefund={sIsRefund}
              onComplete={handlePaymentCapture}
              onCancel={() => {}}
              amountLeftToPay={sAmountLeftToPay}
              cardReaderObj={zSettingsObj?.selectedCardReaderObj}
              cardReaderArr={zSettingsObj?.cardReaders}
            />
          </View>

          <View
            style={{
              width: "30%",
              height: "100%",
              padding: 20,
            }}
          >
            <MiddleItemComponent
              sAmountLeftToPay={sAmountLeftToPay}
              sPaymentsCaptured={sPaymentsCaptured}
              sPaymentComplete={sPaymentComplete}
              sTotalAmount={sTotalAmount}
              sTotalDiscountAmount={sTotalDiscountAmount}
              zCustomerObj={zCustomerObj}
              sIsRefund={sIsRefund}
              sRefundScan={sRefundScan}
              _sSetRefundScan={_sSetRefundScan}
              sSubtotalAmount={sSubtotalAmount}
              sTotalTaxAmount={sTotalAmount}
              _zSetIsCheckingOut={_zSetIsCheckingOut}
              handleCancelPress={closeCheckoutScreenModal}
              paymentsArr={sSaleObj?.paymentArr}
              amountLeftToPay={sAmountLeftToPay}
            />
          </View>

          <View style={{ width: "40%", padding: 20 }}>
            <View
              style={{
                flexDirection: "row",
                width: "100%",
                paddingHorizontal: 10,
              }}
            >
              <TextInput
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

            {/** workorders scrollview list element  ////////// */}
            {sSearchString.length > 1 ? (
              <InventoryListComponent
                inventoryObjArr={sInventorySearchRes}
                onSelect={handleInventorySelect}
                quickItemButtons={zSettingsObj.quickItemButtons}
                _setSearchStr={_setSearchString}
              />
            ) : (
              <WorkorderListComponent
                sSelectedWorkordersToCombine={sSelectedWorkordersToCombine}
                zOpenWorkorderObj={zOpenWorkorderObj}
                zOpenWorkordersArr={zOpenWorkordersArr}
                zInventoryArr={zInventoryArr}
                zCustomerObj={zCustomerObj}
                zSettingsObj={zSettingsObj}
                zGetInventoryItem={zGetInventoryItem}
                handleCombineWorkorderCheck={handleCombineWorkorderCheck}
                amountLeftToPay={sAmountLeftToPay}
              />
            )}
          </View>
        </View>
      )}
    />
  );
}

const InventoryListComponent = ({
  inventoryObjArr,
  onSelect,
  quickItemButtons,
  _setSearchStr,
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
  sSelectedWorkordersToCombine,
  zOpenWorkordersArr,
  zOpenWorkorderObj,
  zInventoryArr,
  zCustomerObj,
  zSettingsObj,
  zGetInventoryItem,
  handleCombineWorkorderCheck,
  amountLeftToPay,
}) => {
  return (
    <ScrollView
      style={{ width: "100%", opacity: amountLeftToPay == 0 ? 0.2 : 1 }}
    >
      {zOpenWorkordersArr
        .filter((o) => o.customerID === zCustomerObj?.id)
        .map((workorder, idx) => {
          if (workorder.id === zOpenWorkorderObj.id)
            workorder = zOpenWorkorderObj;
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
              {idx !== 0 ? (
                <CheckBox_
                  buttonStyle={{
                    alignSelf: "flex-start",
                    marginTop: 5,
                    marginBottom: 5,
                  }}
                  isChecked={sSelectedWorkordersToCombine.find(
                    (o) => o.id === workorder.id
                  )}
                  text={"ADD TO SALE"}
                  onCheck={() => handleCombineWorkorderCheck(workorder)}
                />
              ) : null}
              <View
                style={{
                  opacity:
                    idx === 0
                      ? 1
                      : sSelectedWorkordersToCombine.find(
                          (o) => o.id === workorder.id
                        )
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
                        paddingHorizontal: 5,
                        paddingVertical: 2,
                        borderRadius: 5,
                        backgroundColor: workorder.color1?.backgroundColor,
                        color: workorder.color1?.textColor,
                      }}
                    >
                      {workorder.color1?.label || ""}
                    </Text>
                    <Text
                      style={{
                        marginLeft: 5,
                        paddingHorizontal: 5,
                        paddingVertical: 2,
                        borderRadius: 5,
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
                            // backgroundColor: "red",
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
  amountLeftToPay,
}) => {
  const [sFocusedItem, _setFocusedItem] = useState("");

  return (
    <View
      style={{
        width: "100%",
        height: "100%",
        // justifyContent:
        // padding: 20,
      }}
    >
      {zCustomerObj.id ? (
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
      <View
        style={{
          width: "100%",
          alignItems: "flex-start",
          marginBottom: 30,
        }}
      >
        <CheckBox_
          text={"Refund"}
          isChecked={sIsRefund}
          onCheck={() => _setIsRefund(!sIsRefund)}
        />
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
          placeholder="Scan or enter ticket ID"
          placeholderTextColor={makeGrey(0.38)}
          autoFocus={sFocusedItem === "refund"}
          value={sRefundScan}
          onChangeText={_sSetRefundScan}
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
                {"- " + trimToTwoDecimals(sTotalDiscountAmount)}
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
                {trimToTwoDecimals(sSubtotalAmount - sTotalDiscountAmount)}
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
              {trimToTwoDecimals(sTotalTaxAmount)}
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
              {trimToTwoDecimals(sTotalAmount)}
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
            color: amountLeftToPay == 0 ? C.green : C.lightred,
          }}
        >
          {amountLeftToPay == 0
            ? "PAYMENT COMPLETE!"
            : "AMOUNT LEFT: $" +
              formatNumberForCurrencyDisplay(amountLeftToPay)}
        </Text>
      </View>

      <View
        style={{
          width: "100%",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-around",
          marginTop: 25,
        }}
      >
        {paymentsArr?.length > 0 && amountLeftToPay != 0 ? (
          <SliderButton_ onConfirm={(val) => log("val", val)} />
        ) : null}
        {paymentsArr?.length == 0 ? (
          <Button_
            colorGradientArr={COLOR_GRADIENTS.red}
            text={"Cancel"}
            onPress={handleCancelPress}
          />
        ) : null}
        {paymentsArr?.length > 0 ? (
          <Button_
            colorGradientArr={COLOR_GRADIENTS.blue}
            text={sAmountLeftToPay == 0 ? "Close" : "Cancel"}
            onPress={handleCancelPress}
          />
        ) : null}
        {paymentsArr?.length > 0 && sAmountLeftToPay == 0 ? (
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
  amountLeftToPay,
  onComplete,
  acceptsChecks,
  isRefund,
}) => {
  const [sTenderAmount, _setTenderAmount] = useState();
  const [sRequestedAmount, _setRequestedAmount] = useState(amountLeftToPay);
  const [sAmountLeftToPay, _setAmountLeftToPay] = useState();
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
    _setRequestedAmount(amountLeftToPay);
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
  return (
    <View
      style={{
        ...checkoutScreenStyle.base,
        opacity: amountLeftToPay == 0 ? 0.2 : 1,
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
              _setIsCheck(!sIsCheck);
              _setProcessButtonEnabled(sIsCheck ? false : true);
              _setTenderAmount(sIsCheck ? "" : amountLeftToPay);
            }}
            isChecked={sIsCheck}
          />
        </View>
      ) : null}
      <Text
        style={{
          ...checkoutScreenStyle.titleText,
        }}
      >
        Cash Sale
      </Text>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "flex-end",
          alignItems: "center",
          marginTop: 20,
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
            {"$ " + formatNumberForCurrencyDisplay(amountLeftToPay)}
          </Text>
          <TextInput
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
              if (val > amountLeftToPay) {
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
          enabled={sProcessButtonEnabled}
          //   visible={sProcessButtonLabel}
          onPress={handleProcessButtonPress}
          text={"Process"}
        />
        <Button_
          enabled={sTenderAmount}
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
      {/* <View style={{ ...checkoutScreenStyle.loadingIndicatorStyle }}>
        <LoadingIndicator visible={sStatus} />
      </View> */}
    </View>
  );
};

const StripeCreditCardComponent = ({
  amountLeftToPay,
  onComplete,
  cardReaderObj,
  cardReaderArr,
  isRefund,
}) => {
  const [sRequestedAmount, _setRequestedAmount] = useState(amountLeftToPay);
  // const [sAmountLeftToPay, _setAmountLeftToPay] = useState();
  const [sStatusMessage, _setStatusMessage] = useState("");
  const [sProcessButtonEnabled, _setProcessButtonEnabled] = useState(false);
  const [sSelectedCardReaderObj, _setSelectedCardReaderObj] =
    useState(cardReaderObj);
  const [sFocusedItem, _setFocusedItem] = useState("");

  //////////////////////////////////////////////////////////////////

  useEffect(() => {
    if (sRequestedAmount <= amountLeftToPay) {
      _setProcessButtonEnabled(true);
    }
  }, [sRequestedAmount, amountLeftToPay]);

  useEffect(() => {
    // if (!sRunningReader) {
    //   startServerDrivenStripePaymentIntent(amountLeftToPay);
    //   _setRunningReader(true);
    // }
    // return () => {
    //   zResetStripeStore();
    //   if (sListenerArr) {
    //     sListenerArr.forEach((listener) => listener());
    //   }
    // };
  }, []);

  function handleCancelPress() {
    _setTenderAmount("");
    _setRequestedAmount(amountLeftToPay);
    _setProcessButtonEnabled(false);
  }

  function handleProcessButtonPress() {
    let paymentObject = { ...PAYMENT_OBJECT_PROTO };
    paymentObject.amountTendered = Number(sTenderAmount);
    paymentObject.amountCaptured = Number(sRequestedAmount);
    paymentObject.cash = !sIsCheck;
    paymentObject.check = sIsCheck;
    paymentObject.millis = new Date().getTime();
    // paymentObject

    onComplete(paymentObject);
    handleCancelPress();
  }

  function handleKeyPress(event) {
    if (event.nativeEvent.key != "Enter") return;
  }

  // todo
  function setCurrentReader(reader) {}

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
      zReader.id,
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
    log("canceling server driven payment attempt", zReader);
    if (!zPaymentIntentID) {
      onCancel();
      return;
    }
    let readerResult = await dbCancelServerDrivenStripePayment(
      zReader?.id,
      zPaymentIntentID
    );

    onCancel();
  }

  async function resetCardReader() {
    let readerResult = await dbCancelServerDrivenStripePayment(
      zReader?.id,
      zPaymentIntentID
    );
    onCancel();
  }

  async function clearReader() {
    let readerResult = await dbCancelServerDrivenStripePayment(
      zReader?.id,
      zPaymentIntentID
    );

    onCancel();
  }

  return (
    <View
      style={{
        ...checkoutScreenStyle.base,
        opacity: amountLeftToPay == 0 ? 0.2 : 1,
      }}
    >
      <View
        style={{
          width: "100%",
          alignItems: "flex-start",
          marginBottom: 10,
          marginLeft: 20,
        }}
      >
        <View style={{}}>
          <Text style={{ color: makeGrey(0.6), fontSize: 11 }}>
            Card Readers
          </Text>
          <DropdownMenu
            buttonIcon={ICONS.menu2}
            buttonIconSize={15}
            buttonTextStyle={{ fontSize: 13 }}
            buttonStyle={{
              borderRadius: 5,
              paddingVertical: 2,
              paddingHorizontal: 5,
              borderWidth: 1,
              borderColor: C.buttonLightGreenOutline,
            }}
            itemStyle={{ width: null }}
            dataArr={cardReaderArr || []}
            buttonText={sSelectedCardReaderObj?.label}
            onSelect={_setSelectedCardReaderObj}
          />
        </View>
      </View>
      <Text
        style={{
          ...checkoutScreenStyle.titleText,
        }}
      >
        Card Sale
      </Text>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "flex-end",
          alignItems: "center",
          marginTop: 20,
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
          <Text style={{ marginBottom: 15, color: C.textMain }}>
            Pay Amount
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
            {"$ " + formatNumberForCurrencyDisplay(amountLeftToPay)}
          </Text>
          <TextInput
            onFocus={() => {
              _setFocusedItem("amount");
              _setRequestedAmount("");
            }}
            autoFocus={sFocusedItem === "amount"}
            style={{
              fontSize: 20,
              outlineWidth: 0,
              color: C.textMain,
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
              if (val > amountLeftToPay) {
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

      <View
        style={{
          width: "100%",
          marginVertical: "10%",
          alignItems: "center",
        }}
      >
        <Button_
          colorGradientArr={COLOR_GRADIENTS.green}
          //   buttonStyle={{ backgroundColor: "green" }}
          //   style={{ ...checkoutScreenStyle.mainButtonStyle }}
          textStyle={{ color: C.textWhite }}
          enabled={sProcessButtonEnabled}
          //   visible={sProcessButtonLabel}
          onPress={handleProcessButtonPress}
          text={"Process"}
          buttonStyle={{ width: 130 }}
        />
        {/* <Button_
            enabled={sTenderAmount}
          onPress={handleCancelPress}
          text={"Cancel"}
        /> */}
        <Text
          style={{
            ...checkoutScreenStyle.statusText,
            fontSize: 25,
            color: C.green,
            marginTop: 30,
          }}
        >
          Captured
        </Text>
      </View>

      {/* <View style={{ ...checkoutScreenStyle.loadingIndicatorStyle }}>
        <LoadingIndicator visible={sStatus} />
      </View> */}
    </View>
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

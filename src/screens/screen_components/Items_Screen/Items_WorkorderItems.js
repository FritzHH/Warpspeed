/*eslint-disable*/
import { View, Text, TextInput, FlatList, Image } from "react-native-web";
import {
  applyDiscountToWorkorderItem,
  applyLineItemDiscounts,
  calculateRunningTotals,
  calculateTaxes,
  clog,
  deepEqual,
  formatCurrencyDisp,
  generateRandomID,
  generateUPCBarcode,
  lightenRGBByPercent,
  log,
  trimToTwoDecimals,
} from "../../../utils";
import {
  TabMenuDivider as Divider,
  Button,
  ScreenModal,
  GradientView,
  Image_,
  Button_,
} from "../../../components";
import {
  C,
  BUTTON_VARS,
  COLOR_GRADIENTS,
  Colors,
  ICON_PATHS,
  ICONS,
} from "../../../styles";
import {
  WORKORDER_PROTO,
  WORKORDER_ITEM_PROTO,
  INVENTORY_ITEM_PROTO,
  SETTINGS_OBJ,
  DISCOUNT_OBJ_PROTO,
  COLORS,
} from "../../../data";
import { useEffect, useRef, useState } from "react";
import { cloneDeep } from "lodash";
import {
  useCheckoutStore,
  useOpenWorkordersStore,
  useInventoryStore,
  useLoginStore,
  useSettingsStore,
  useCurrentCustomerStore,
} from "../../../stores";
import {
  dbGetCustomerObj,
  dbSetClosedWorkorderItem,
} from "../../../db_call_wrapper";
import LinearGradient from "react-native-web-linear-gradient";
import { loadFaceDetectionModel } from "face-api.js";
// import {} from '../../../assets/tools1.png'

export const Items_WorkorderItemsTab = ({}) => {
  // store setters ///////////////////////////////////////////////////////////////
  const _zSetWorkorder = useOpenWorkordersStore(
    (state) => state.setWorkorder
  );
  const _zSetIsCheckingOut = useCheckoutStore(
    (state) => state.setIsCheckingOut
  );

  // store getters ///////////////////////////////////////////////////////////////

  const zOpenWorkorder = useOpenWorkordersStore((state) =>
    state.getOpenWorkorder()
  );
  const zSettings = useSettingsStore((state) => state.getSettings());
  const zInventoryArr = useInventoryStore((state) => state.getInventoryArr());

  const zOpenWorkordersArr = useOpenWorkordersStore((state) =>
    state.getWorkorders()
  );
  // const zIsCheckingOut = useCheckoutStore((state) => state.getIsCheckingOut());

  ///////////////////////////////////////////////////////////////////////////
  const [sButtonsRowID, _setButtonsRowID] = useState(null);
  const [sTotalPrice, _setTotalPrice] = useState("");
  const [sTotalDiscount, _setTotalDiscount] = useState("");
  const [sNumItems, _setNumItems] = useState("");
  // const [sDisc]

  // dev
  const checkoutBtnRef = useRef();
  useEffect(() => {
    if (zOpenWorkorder && zOpenWorkordersArr && zSettings.salesTax) {
      // log("here");
      // _zSetIsCheckingOut(true);
      // dbGetCustomerObj("1236").then((res) => {
      //   _zSetCustomer(res);
      //   // log("res", res);
      // });
    }
  }, [zOpenWorkorder, zOpenWorkordersArr, zSettings]);

  ///////////////////////////////////////////////////////////////////////////
  ///////////////////////////////////////////////////////////////////////////

  // update the workorder inventory items to the latest prices, also watching inventory array to keep current price. also update the discont object
  useEffect(() => {
    if (!zOpenWorkorder?.workorderLines || !zInventoryArr.length > 0) return;
    let wo = cloneDeep(zOpenWorkorder);
    let linesToChange = [];

    let invIdxArr = [];
    let discountsIdxArr = [];
    wo.workorderLines.forEach((line, idx) => {
      // log("line", line);
      let curInvItem = zInventoryArr.find(
        (o) => o.id === line.inventoryItem.id
      );
      if (!curInvItem) return;
      if (!deepEqual(curInvItem, line.inventoryItem)) {
        // clog("cur inv", curInvItem.price);
        // clog("previous", line.inventoryItem.price);
        linesToChange.push(curInvItem);
        invIdxArr.push({ idx, curInvItem });
      }

      // let curDiscount = line.discountObj?;
    });

    // the price has changed. now reset the discount object to reflect the new price as well
    invIdxArr.forEach((obj) => {
      // log("changing");
      wo.workorderLines[obj.idx].inventoryItem = obj.curInvItem;
      // clog("old line", wo.workorderLines[obj.idx].discountObj?);
      let discountedLine = applyDiscountToWorkorderItem(
        wo.workorderLines[obj.idx]
      );
      // clog("new line", discountedLine.discountObj?);
      wo.workorderLines[obj.idx] = discountedLine;
    });

    if (invIdxArr.length > 0) {
      // log("found new inventory prices");
      _zSetWorkorder(wo);
    }
  }, [zInventoryArr, zOpenWorkorder]);

  // calculate running sale totaLS
  useEffect(() => {
    // log("here");
    if (!zOpenWorkorder?.workorderLines) return;
    // log("z", zOpenWorkorderObj);
    // log("inv", zInventoryArr);

    const {
      runningQty,
      runningTotal,
      runningDiscount,
      runningSubtotal,
      runningTax,
    } = calculateRunningTotals(zOpenWorkorder, zSettings.salesTax);
    // clog(calculateRunningTotals(zOpenWorkorderObj, zInventoryArr));
    _setNumItems(runningQty);
    _setTotalDiscount(runningDiscount);
    _setTotalPrice(runningTotal);
    // _zSetWorkorderObj(wo, false);
  }, [zOpenWorkorder]);

  ///////////////////////////////////////////////////
  // function checkoutPressed() {
  //   // _zSetIsCheckingOut(!zIsCheckingOut);
  // }

  function deleteWorkorderLineItem(index) {
    //     log("need to fix this method");
    // return;
    let fun = () => {
      let woCopy = cloneDeep(zOpenWorkorder);
      woCopy.workorderLines.splice(index, 1);
      // log("res", WO);
      _zSetWorkorder(woCopy);
      // if (!zOpenWorkorderObj.isStandaloneSale) ''(woCopy);
    };
    fun();
  }

  function modQtyPressed(workorderLine, option, idx) {
    let newWOLine = cloneDeep(workorderLine);
    let wo = cloneDeep(zOpenWorkorder);
    if (option === "up") {
      newWOLine.qty = newWOLine.qty + 1;
    } else {
      let qty = newWOLine.qty - 1;
      if (qty <= 0) return;
      newWOLine.qty = qty;
    }

    if (newWOLine.discountObj?.name) {
      let newLine = applyDiscountToWorkorderItem(newWOLine);
      if (newLine.discountObj?.newPrice > 0) newWOLine = newLine;
    }

    wo.workorderLines[idx] = newWOLine;
    _zSetWorkorder(wo);
  }

  function editWorkorderLine(workorderLine) {
    let wo = cloneDeep(zOpenWorkorder);
    let newWOLine = cloneDeep(workorderLine);
    if (newWOLine.discountObj?.name) {
      let newLine = applyDiscountToWorkorderItem(newWOLine);
      if (newLine.discountObj?.newPrice > 0) newWOLine = newLine;
    }

    let idx = zOpenWorkorder.workorderLines.findIndex(
      (o) => o.id == workorderLine.id
    );
    wo.workorderLines[idx] = newWOLine;
    _zSetWorkorder(wo);
    // if (!zOpenWorkorderObj.isStandaloneSale) ''(wo);
  }

  function applyDiscount(workorderLine, discountObj) {
    // log(discountObj?);
    // return;

    if (!discountObj?.value) discountObj = cloneDeep(DISCOUNT_OBJ_PROTO);

    workorderLine = cloneDeep(workorderLine);
    workorderLine.discountObj = discountObj;
    workorderLine = applyDiscountToWorkorderItem(workorderLine);

    let wo = cloneDeep(zOpenWorkorder);
    wo.workorderLines = wo.workorderLines.map((o) => {
      if (o.id === workorderLine.id) return workorderLine;
      return o;
    });

    _zSetWorkorder(wo);
  }

  function splitItems(inventoryItem, workorderLine, index) {
    let wo = cloneDeep(zOpenWorkorder);
    let num = workorderLine.qty;
    for (let i = 0; i <= num - 1; i++) {
      let newLine = cloneDeep(workorderLine);
      newLine.qty = 1;
      newLine.id = generateUPCBarcode();
      if (newLine.discountObj?.name) {
        let discountObj = applyDiscountToWorkorderItem(newLine);
        if (discountObj?.newPrice > 0) newLine.discountObj = discountObj;
      }
      if (i === 0) {
        wo.workorderLines[index] = newLine;
        continue;
      }
      wo.workorderLines.splice(index + 1, 0, newLine);
      // wo.workorderLines.push(newLine);
    }
    _zSetWorkorder(wo);
    // if (!zOpenWorkorderObj.isStandaloneSale) ''(wo);
  }

  // clog("wo", zWorkorderObj);
  function setComponent() {
    // log('here', zOpenWorkorder);

    return (
      <View
        style={{
          width: "100%",
          height: "95%",
        }}
      >
        <FlatList
          style={{ marginTop: 3, marginRight: 5 }}
          data={zOpenWorkorder.workorderLines}
          keyExtractor={(item, idx) => idx}
          renderItem={(item) => {
            let idx = item.index;
            item = item.item;
            let invItem = item.inventoryItem;

            // log("item", item);
            return (
              <LineItemComponent
                __deleteWorkorderLine={deleteWorkorderLineItem}
                // __setWorkorderObj={_zSetWorkorderObj}
                __setWorkorderLineItem={editWorkorderLine}
                inventoryItem={invItem}
                workorderLine={item}
                zWorkorderObj={zOpenWorkorder}
                __splitItems={splitItems}
                __modQtyPressed={modQtyPressed}
                index={idx}
                applyDiscount={applyDiscount}
                zSettingsObj={zSettings}
                ssButtonsRowID={sButtonsRowID}
                __setButtonsRowID={_setButtonsRowID}
              />
            );
          }}
        />
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-around",
            alignItems: "center",
            width: "99%",
            backgroundColor: C.backgroundGreen,
            opacity: sNumItems > 0 ? 1 : 0.2,
            marginVertical: 5,
            marginHorizontal: 5,
            borderRadius: 15,
            borderColor: C.buttonLightGreenOutline,
            borderWidth: 1,
            padding: 10,
            alignSelf: "center",
          }}
        >
          <Text style={{ fontSize: 13, color: "gray" }}>
            {"ITEMS: "}
            <Text
              style={{
                marginRight: 10,
                fontWeight: "bold",
                color: C.textMain,
                fontSize: 14,
              }}
            >
              {sNumItems}
            </Text>
          </Text>
          <View
            style={{
              width: 1,
              height: "100%",
              backgroundColor: C.buttonLightGreenOutline,
            }}
          />

          <Text style={{ fontSize: 13, color: "gray" }}>
            {"SUBTOTAL: "}
            <Text
              style={{
                marginRight: 10,
                color: C.textMain,
                fontWeight: "bold",
                fontSize: 14,
              }}
            >
              {"$" + formatCurrencyDisp(sTotalPrice)}
            </Text>
          </Text>
          <View
            style={{
              width: 1,
              height: "100%",
              backgroundColor: C.buttonLightGreenOutline,
            }}
          />
          {sTotalDiscount > 0 && (
            <View>
              <Text style={{ fontSize: 13, color: "gray" }}>
                {"DISCOUNT: "}
                <Text
                  style={{
                    marginRight: 10,
                    fontWeight: "bold",
                    color: C.textMain,
                    fontSize: 14,
                  }}
                >
                  {"$" + formatCurrencyDisp(sTotalDiscount)}
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
          )}
          <Text style={{ fontSize: 13, color: "gray" }}>
            {"TAX: "}
            <Text
              style={{
                marginRight: 10,
                fontWeight: "bold",
                color: C.textMain,
                fontSize: 14,
              }}
            >
              {"$" +
                formatCurrencyDisp((sTotalPrice * zSettings.salesTax) / 100)}
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
                fontWeight: "bold",
                color: C.textMain,
                fontSize: 15,
              }}
            >
              {"$" +
                formatCurrencyDisp(
                  sTotalPrice * (zSettings.salesTax / 100) + sTotalPrice
                )}
            </Text>
          </Text>
          <Button_
            ref={checkoutBtnRef}
            textStyle={{ color: C.textWhite, fontSize: 16 }}
            icon={ICONS.shoppingCart}
            text={"Check Out"}
            colorGradientArr={COLOR_GRADIENTS.green}
            buttonStyle={{
              paddingHorizontal: 20,
              paddingVertical: 2,
              borderRadius: 15,
            }}
            onPress={() => _zSetIsCheckingOut(true)}
          />
        </View>
      </View>
    );
  }
  try {
    return setComponent();
  } catch (e) {
    // log("Error returning Items_WorkorderItemsTab", e);
  }
};

export const LineItemComponent = ({
  inventoryItem = INVENTORY_ITEM_PROTO,
  workorderLine = WORKORDER_ITEM_PROTO,
  zSettingsObj = SETTINGS_OBJ,
  __deleteWorkorderLine,
  __modQtyPressed,
  __setWorkorderObj,
  __setWorkorderLineItem,
  // __
  __splitItems,
  index,
  applyDiscount,
  ssButtonsRowID,
  __setButtonsRowID,
}) => {
  const [sTempQtyVal, _setTempQtyVal] = useState(null);
  const [sShowDiscountModal, _setShowDiscountModal] = useState(null);
  const ref = useRef();

  /////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////

  function formatDiscountsArr(discountArr) {
    if (discountArr[discountArr.length - 1].name === "No Discount")
      return discountArr;
    discountArr.push({
      name: "No Discount",
    });
    return discountArr;
  }

  // clog("item", workorderLine);
    return (
      <View
        style={{
          width: "100%",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            width: "100%",
            alignItems: "center",
            backgroundColor: C.backgroundListWhite,
            paddingVertical: 3,
            paddingRight: 5,
            paddingLeft: 8,
            marginVertical: 3,
            marginHorizontal: 8,
            borderColor: "transparent",
            borderLeftColor: lightenRGBByPercent(C.green, 60),
            borderWidth: 2,
            borderRadius: 15,
          }}
        >
          <View
            style={{
              width: "73%",
              justifyContent: "flex-start",
              alignItems: "center",
              flexDirection: "row",
              // backgroundColor: "green",
            }}
          >
            <View>
              {!!workorderLine.discountObj?.name && (
                <Text style={{ color: C.lightred }}>
                  {workorderLine.discountObj?.name || "discount goes here"}
                </Text>
              )}
              <Text
                style={{
                  fontSize: 15,
                  color: Colors.darkText,
                  fontWeight: "500",
                }}
              >
                {inventoryItem.formalName}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                <TextInput
                  numberOfLines={4}
                  style={{ outlineWidth: 0, color: "dimgray" }}
                  onChangeText={(val) => {
                    let line = structuredClone(workorderLine);
                    line.intakeNotes = val;
                    __setWorkorderLineItem(line, inventoryItem);
                  }}
                  placeholder="Intake and service notes..."
                  placeholderTextColor={"gray"}
                  value={workorderLine.intakeNotes}
                />
              </View>
            </View>
          </View>
          <View
            style={{
              width: "27%",
              flexDirection: "row",
              justifyContent: "flex-end",
              alignItems: "center",
              height: "100%",
              // backgroundColor: "green",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                // marginRight: 5,
              }}
            >
              <Button_
                onPress={() => __deleteWorkorderLine(index)}
                icon={ICONS.close1}
                iconSize={17}
                buttonStyle={{
                  marginLeft: 5,
                  marginRight: 5,
                  // margin
                  backgroundColor: "transparent",
                }}
              />
              <Button_
                onPress={() => __modQtyPressed(workorderLine, "up", index)}
                buttonStyle={{
                  backgroundColor: "transparent",
                  // width: null,
                  // height: null,
                }}
                icon={ICONS.upArrowOrange}
                iconSize={25}
              />

              <GradientView
                style={{
                  marginLeft: 7,
                  borderRadius: 15,
                  width: 35,
                  height: 25,
                  // backgroundColor: "green",
                }}
              >
                <TextInput
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    textAlign: "center",
                    color: C.textWhite,
                    outlineWidth: 0,
                    width: "100%",
                  }}
                  value={sTempQtyVal === "" ? sTempQtyVal : workorderLine.qty}
                  onChangeText={(val) => {
                    if (isNaN(val) || val < 0) return;
                    if (val === "") {
                      _setTempQtyVal("");
                      val = 0;
                    } else {
                      _setTempQtyVal(null);
                    }
                    let line = structuredClone(workorderLine);
                    line.qty = Number(val);
                    __setWorkorderLineItem(line, inventoryItem);
                  }}
                />
              </GradientView>
            </View>
            <View
              style={{
                alignItems: "flex-end",
                minWidth: 80,
                // backgroundColor: "green",
                marginRight: 1,
              }}
            >
              {(workorderLine.qty > 1 ||
                workorderLine.discountObj?.newPrice) && (
                <Text
                  style={{
                    paddingHorizontal: 0,
                  }}
                >
                  {"$ " +
                    trimToTwoDecimals(
                      workorderLine.useSalePrice
                        ? inventoryItem.salePrice
                        : inventoryItem.price
                    )}
                </Text>
              )}
              {!!workorderLine.discountObj?.savings && (
                <Text
                  style={{
                    paddingHorizontal: 0,
                    minWidth: 30,
                    color: C.lightred,
                  }}
                >
                  {"$ -" + workorderLine.discountObj?.savings}
                </Text>
              )}
              <Text
                style={{
                  fontWeight: "500",
                  minWidth: 30,
                  marginTop: 0,
                  paddingHorizontal: 0,
                  color: Colors.darkText,
                }}
              >
                {workorderLine.discountObj?.newPrice
                  ? "$ " + workorderLine.discountObj?.newPrice
                  : "$" +
                    trimToTwoDecimals(
                      workorderLine.useSalePrice
                        ? inventoryItem.salePrice
                        : inventoryItem.price * workorderLine.qty
                    )}
              </Text>
            </View>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "flex-end",
                marginLeft: 7,
                alignItems: "center",
              }}
            >
              <Button_
                iconSize={23}
                icon={ICONS.editPencil}
                onPress={() =>
                  __setButtonsRowID(
                    workorderLine.id === ssButtonsRowID
                      ? null
                      : workorderLine.id
                  )
                }
                buttonStyle={{
                  backgroundColor: "transparent",
                }}
              />
            </View>
          </View>
        </View>
        {ssButtonsRowID === workorderLine.id && (
          <View
            style={{
              flexDirection: "row",
              // backgroundColor: "white",
              justifyContent: "flex-end",
              marginVertical: 5,
              width: "100%",
            }}
          >
            {workorderLine.qty > 1 && (
              <Button
                textStyle={{ fontSize: 13 }}
                onPress={() => {
                  __splitItems(inventoryItem, workorderLine, index);
                  __setButtonsRowID(null);
                }}
                text={"Split Items"}
                buttonStyle={{
                  backgroundColor: Colors.mainBackground,
                  shadowOffset: { width: 1, height: 1 },
                  marginHorizontal: 2,
                  width: null,
                  height: 25,
                  paddingHorizontal: 4,
                }}
              />
            )}
            <ScreenModal
              buttonStyle={{
                backgroundColor: Colors.mainBackground,
                shadowOffset: { width: 1, height: 1 },
                marginHorizontal: 2,
                marginLeft: 10,
                height: 25,
                // marginVertical: 2,
              }}
              buttonTextStyle={{
                fontSize: 11,
                paddingHorizontal: 10,
                paddingVertical: 2,
              }}
              // modalVisible={}
              buttonLabel="Discount"
              showButtonIcon={false}
              modalVisible={sShowDiscountModal === workorderLine.id}
              handleOuterClick={() => _setShowDiscountModal(null)}
              handleButtonPress={() => {
                _setShowDiscountModal(workorderLine.id);
              }}
              modalCoordinateVars={{ x: -0, y: 30 }}
              ref={ref}
              Component={() => {
                return (
                  <View>
                    <FlatList
                      data={formatDiscountsArr(zSettingsObj.discounts)}
                      keyExtractor={(i, x) => x}
                      renderItem={(item) => {
                        let idx = item.index;
                        item = item.item;
                        return (
                          <Button
                            buttonStyle={{
                              borderTopWidth: idx === 0 ? 0 : 1,
                              borderColor: "whitesmoke",
                              width: null,
                              height: null,
                              paddingVertical: 10,
                              backgroundColor: "lightgray",
                            }}
                            onPress={() => {
                              applyDiscount(
                                workorderLine,
                                zSettingsObj.discounts[idx]
                              );
                              _setShowDiscountModal(null);
                              __setButtonsRowID(null);
                            }}
                            shadow={false}
                            text={item.name}
                          />
                        );
                      }}
                    />
                  </View>
                );
              }}
            />
          </View>
        )}
      </View>
    );
  // try {
  //   return setComponent();
  // } catch (e) {
  //   log("Error returning LineItemComponent", e);
  // }
};

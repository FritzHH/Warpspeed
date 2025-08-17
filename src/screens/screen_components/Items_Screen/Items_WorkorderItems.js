/*eslint-disable*/
import { View, Text, TextInput, FlatList, Image } from "react-native-web";
import {
  applyDiscountToWorkorderItem,
  calculateRunningTotals,
  calculateTaxes,
  clog,
  generateRandomID,
  log,
  trimToTwoDecimals,
} from "../../../utils";
import {
  TabMenuDivider as Divider,
  Button,
  ScreenModal,
  GradientView,
  _Image,
  _Button,
} from "../../../components";
import {
  APP_BASE_COLORS,
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
} from "../../../stores";
import {
  dbSetClosedWorkorderItem,
  dbSetOpenWorkorderItem,
} from "../../../db_call_wrapper";
import LinearGradient from "react-native-web-linear-gradient";
// import {} from '../../../assets/tools1.png'

export const Items_WorkorderItemsTab = ({}) => {
  // store setters ///////////////////////////////////////////////////////////////
  const _zSetWorkorderObj = useOpenWorkordersStore(
    (state) => state.setWorkorderObj
  );
  const _zExecute = useLoginStore((state) => state.execute);
  const _zSetIsCheckingOut = useCheckoutStore(
    (state) => state.setIsCheckingOut
  );

  // store getters ///////////////////////////////////////////////////////////////

  const zWorkorderObj = useOpenWorkordersStore((state) =>
    state.getWorkorderObj()
  );
  const zSettingsObj = useSettingsStore((state) => state.getSettingsObj());
  const zInventoryArr = useInventoryStore((state) => state.getInventoryArr());

  const zOpenWorkordersArr = useOpenWorkordersStore((state) =>
    state.getWorkorderArr()
  );
  // const zIsCheckingOut = useCheckoutStore((state) => state.getIsCheckingOut());

  ///////////////////////////////////////////////////////////////////////////
  const [sButtonsRowID, _setButtonsRowID] = useState(null);
  const [sTotalPrice, _setTotalPrice] = useState("");
  const [sTotalDiscount, _setTotalDiscount] = useState("");
  const [sNumItems, _setNumItems] = useState("");
  // const [zWorkorderObj, _setWorkorderObj] = useState(
  //   zOpenWorkordersArr[zOpenWorkorderIdx]
  // );

  ///////////////////////////////////////////////////////////////////////////
  ///////////////////////////////////////////////////////////////////////////

  function calculateLineItems() {
    let wo = cloneDeep(zWorkorderObj);
    zWorkorderObj.workorderLines.forEach((line, idx) => {
      let newWOLine = cloneDeep(line);
      let discountObj = line.discountObj;
      let inventoryItem = zInventoryArr.find(
        (item) => item.id == line.invItemID
      );

      newWOLine.price = inventoryItem.price;
      if (discountObj.name) {
        let newDiscountObj = applyDiscountToWorkorderItem(
          newWOLine.discountObj,
          newWOLine,
          inventoryItem
        );
        if (discountObj.newPrice > 0) newWOLine.discountObj = newDiscountObj;
      }
      wo.workorderLines[idx] = newWOLine;
    });

    return wo;
  }

  // make sure the previous session discount object prices are up to date with inventory changes
  useEffect(() => {
    if (!zWorkorderObj?.workorderLines?.length > 0) return;
    let wo = calculateLineItems();
    _zSetWorkorderObj(wo);
    if (!zWorkorderObj.isStandaloneSale) dbSetOpenWorkorderItem(wo);
  }, []);

  // calculate running sale totaLS
  useEffect(() => {
    // log("here");
    if (!zWorkorderObj?.workorderLines) return;
    let wo = calculateLineItems();
    const { runningQty, runningTotal, runningDiscount } =
      calculateRunningTotals(wo, zInventoryArr);
    _setNumItems(runningQty);
    _setTotalDiscount(runningDiscount);
    _setTotalPrice(runningTotal);
  }, [zWorkorderObj, zInventoryArr]);

  ///////////////////////////////////////////////////
  function checkoutPressed() {
    // _zSetIsCheckingOut(!zIsCheckingOut);
  }

  function deleteWorkorderLineItem(index) {
    //     log("need to fix this method");
    // return;
    let fun = () => {
      let woCopy = cloneDeep(zWorkorderObj);
      woCopy.workorderLines.splice(index, 1);
      // log("res", WO);
      _zSetWorkorderObj(woCopy);
      if (!zWorkorderObj.isStandaloneSale) dbSetOpenWorkorderItem(woCopy);
    };
    _zExecute(fun);
  }

  function modQtyPressed(inventoryItem, workorderLine, option, idx) {
    log("need to fix this method");
    return;
    let fun = () => {
      let newWOLine = cloneDeep(workorderLine);
      let wo = cloneDeep(zWorkorderObj);
      if (option === "up") {
        newWOLine.qty = newWOLine.qty + 1;
      } else {
        let qty = newWOLine.qty - 1;
        if (qty <= 0) return;
        newWOLine.qty = qty;
      }
      if (newWOLine.discountObj.name) {
        let discountObj = applyDiscountToWorkorderItem(
          newWOLine.discountObj,
          newWOLine,
          inventoryItem
        );
        if (discountObj.newPrice > 0) newWOLine.discountObj = discountObj;
      }
      wo.workorderLines[idx] = newWOLine;

      _zSetWorkorderObj(wo);
      if (!zWorkorderObj.isStandaloneSale) dbSetOpenWorkorderItem(wo);
    };
    _zExecute(fun);
  }

  function editWorkorderLine(workorderLine, inventoryItem) {
    // log("adding new wo line");
    // log(workorderLine.qty);
    //     log("need to fix this method");
    // return;

    let fun = () => {
      let newWOLine = cloneDeep(workorderLine);
      if (newWOLine.discountObj.name) {
        let discountObj = applyDiscountToWorkorderItem(
          newWOLine.discountObj,
          newWOLine,
          inventoryItem
        );
        if (discountObj.newPrice > 0) newWOLine.discountObj = discountObj;
      }

      let idx = zWorkorderObj.workorderLines.findIndex(
        (o) => o.id == workorderLine.id
      );
      let wo = cloneDeep(zWorkorderObj);
      wo.workorderLines[idx] = newWOLine;
      _zSetWorkorderObj(wo);
      if (!zWorkorderObj.isStandaloneSale) dbSetOpenWorkorderItem(wo);
    };

    _zExecute(fun);
  }

  function applyDiscount(inventoryItem, workorderLine, discountObj, index) {
    let fun = () => {
      let newDiscountObj = DISCOUNT_OBJ_PROTO;
      if (discountObj.value) {
        newDiscountObj = applyDiscountToWorkorderItem(
          discountObj,
          workorderLine,
          inventoryItem
        );
        if (newDiscountObj.newPrice <= 0) return;
      }

      // log(newDiscountObj);
      let woCopy = cloneDeep(zWorkorderObj);
      woCopy.workorderLines[index].discountObj = newDiscountObj;
      _zSetWorkorderObj(woCopy);
      if (!zWorkorderObj.isStandaloneSale) dbSetOpenWorkorderItem(woCopy);
    };
    _zExecute(fun);
  }

  function splitItems(inventoryItem, workorderLine, index) {
    let wo = cloneDeep(zWorkorderObj);
    let num = workorderLine.qty;
    for (let i = 0; i <= num - 1; i++) {
      let newLine = cloneDeep(workorderLine);
      newLine.qty = 1;
      newLine.id = generateRandomID();
      if (newLine.discountObj.name) {
        let discountObj = applyDiscountToWorkorderItem(
          newLine.discountObj,
          newLine,
          inventoryItem
        );
        if (discountObj.newPrice > 0) newLine.discountObj = discountObj;
      }
      if (i === 0) {
        wo.workorderLines[index] = newLine;
        continue;
      }
      wo.workorderLines.splice(index + 1, 0, newLine);
      // wo.workorderLines.push(newLine);
    }
    _zSetWorkorderObj(wo);
    if (!zWorkorderObj.isStandaloneSale) dbSetOpenWorkorderItem(wo);
  }

  clog("wo", zWorkorderObj);
  function setComponent() {
    return (
      <View
        style={{
          width: "100%",
          height: "95%",
        }}
      >
        <FlatList
          style={{ marginTop: 3, marginRight: 5 }}
          data={zWorkorderObj.workorderLines}
          keyExtractor={(item, idx) => idx}
          renderItem={(item) => {
            let idx = item.index;
            item = item.item;
            let invItem = zInventoryArr.find(
              (obj) => obj.id === item.invItemID
            );
            // log("item", item);
            return (
              <LineItemComponent
                __deleteWorkorderLine={deleteWorkorderLineItem}
                // __setWorkorderObj={_zSetWorkorderObj}
                __setWorkorderLineItem={editWorkorderLine}
                inventoryItem={invItem}
                workorderLine={item}
                zWorkorderObj={zWorkorderObj}
                __splitItems={splitItems}
                __modQtyPressed={modQtyPressed}
                index={idx}
                applyDiscount={applyDiscount}
                zSettingsObj={zSettingsObj}
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
            width: "100%",
            borderTopWidth: 1,
            borderTopColor: "gray",
            // backgroundColor: "green",
            paddingTop: 5,
            paddingBottom: 5,
            opacity: sNumItems > 0 ? 1 : 0.2,
          }}
        >
          <Text style={{ fontSize: 16 }}>
            {"Items: "}
            <Text
              style={{
                marginRight: 10,
                fontWeight: "bold",
              }}
            >
              {sNumItems}
            </Text>
          </Text>
          {sTotalDiscount > 0 ? (
            <Text style={{ fontSize: 16 }}>
              {"Discount: "}
              <Text
                style={{
                  marginRight: 10,
                  fontWeight: "bold",
                }}
              >
                {"$" + sTotalDiscount}
              </Text>
            </Text>
          ) : null}
          <Text style={{ fontSize: 16 }}>
            {"Subtotal: "}
            <Text style={{ marginRight: 10, fontWeight: "bold" }}>
              {"$" + sTotalPrice}
            </Text>
          </Text>
          <Text style={{ fontSize: 16 }}>
            {"Tax: "}
            <Text style={{ marginRight: 10, fontWeight: "bold" }}>
              {"$" +
                calculateTaxes(sTotalPrice, zWorkorderObj, zSettingsObj).tax}
            </Text>
          </Text>
          <Text style={{ fontSize: 16 }}>
            {"Total: "}
            <Text style={{ marginRight: 10, fontWeight: "bold" }}>
              {"$" +
                calculateTaxes(sTotalPrice, zWorkorderObj, zSettingsObj)
                  .totalAmount}
            </Text>
          </Text>
          {!zWorkorderObj?.isStandaloneSale ? (
            <LinearGradient
              colors={[...COLOR_GRADIENTS.green]}
              style={{
                width: 150,
                height: 30,
                borderRadius: 15,
                alignItems: "center",
                justifyContent: "center",
              }}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={{ color: "white" }}>Check Out</Text>
            </LinearGradient>
          ) : // <Button
          //   textStyle={{ color: "white" }}
          //   buttonStyle={{
          //     height: 25,
          //     paddingHorizontal: 7,
          //     paddingVertical: 2,
          //     borderRadius: 5,
          //     width: 150,
          //     // backgroundColor: zIsCheckingOut ? "red" : "green",
          //     // marginRight: 5,
          //   }}
          //   // text={zIsCheckingOut ? "Cancel Checkout" : "Check Out"}
          //   text={"Check Out"}
          //   onPress={checkoutPressed}
          // />
          null}
        </View>
      </View>
    );
  }
  try {
    return setComponent();
  } catch (e) {
    log("Error returning Items_WorkorderItemsTab", e);
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
  function setComponent() {
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
            backgroundColor: APP_BASE_COLORS.backgroundListWhite,
            paddingVertical: 0,
            paddingHorizontal: 0,
            marginVertical: 1,
            marginHorizontal: 5,
            borderColor: "transparent",
            borderLeftColor: APP_BASE_COLORS.green,
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
            <_Button
              onPress={() => __deleteWorkorderLine(index)}
              icon={ICONS.close1}
              iconSize={17}
              buttonStyle={{
                backgroundColor: "transparent",

                // width: null,
                // height: null,
                // backgroundColor: "transparent",
                // // shadowOffset: { width: 1, height: 1 },
                // marginHorizontal: 1,
                // marginRight: 10,
                // padding: 5,
                // paddingVertical: 10,
                // borderRadius: 3,
              }}
              // mouseOverOptions={{
              //   enable: true,
              //   opacity: 0.7,
              //   highlightColor: "red",
              // }}
              // shadow={false}
              // textStyle={{ color: "lightgray", fontSize: 17, fontWeight: 600 }}
            />
            <View>
              {workorderLine.discountObj.discountName ? (
                <Text style={{ color: "magenta" }}>
                  {workorderLine.discountObj.discountName ||
                    "discount goes here"}
                </Text>
              ) : null}
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
              <_Button
                onPress={() =>
                  __modQtyPressed(inventoryItem, workorderLine, "up", index)
                }
                buttonStyle={{
                  backgroundColor: "transparent",
                  // width: null,
                  // height: null,
                }}
                icon={ICONS.upArrowOrange}
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
                    color: APP_BASE_COLORS.textWhite,
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
              <Text
                style={{
                  paddingHorizontal: 0,
                }}
              >
                {"$ " + trimToTwoDecimals(inventoryItem.price)}
              </Text>
              {workorderLine.discountObj.savings ? (
                <Text
                  style={{
                    paddingHorizontal: 0,
                    minWidth: 30,
                    color: "magenta",
                  }}
                >
                  {"$ -" + workorderLine.discountObj.savings}
                </Text>
              ) : null}
              <Text
                style={{
                  fontWeight: "bold",
                  minWidth: 30,
                  marginTop: 0,
                  paddingHorizontal: 0,
                  color: Colors.darkText,
                }}
              >
                {workorderLine.discountObj.newPrice
                  ? "$ " + workorderLine.discountObj.newPrice
                  : workorderLine.qty > 1
                  ? "$" +
                    trimToTwoDecimals(inventoryItem.price * workorderLine.qty)
                  : ""}
              </Text>
            </View>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "flex-end",
                marginLeft: 7,
              }}
            >
              <_Image size={28} icon={ICONS.editPencil} />
              {/* <Button
                onPress={() =>
                  __setButtonsRowID(
                    workorderLine.id === ssButtonsRowID
                      ? null
                      : workorderLine.id
                  )
                }
                mouseOverOptions={{
                  enable: true,
                  highlightColor: Colors.tabMenuButton,
                }}
                shadow={false}
                text={ssButtonsRowID === workorderLine.id ? "-" : "+"}
                textStyle={{
                  color:
                    ssButtonsRowID === workorderLine.id
                      ? "red"
                      : Colors.mainBackground,
                  fontSize: 28,
                }}
                buttonStyle={{
                  width: 25,
                  marginRight: 10,
                  alignItems: "center",
                  borderRadius: 3,
                  marginLeft: 2,
                }}
              /> */}
            </View>
          </View>
        </View>
        {ssButtonsRowID === workorderLine.id ? (
          <View
            style={{
              flexDirection: "row",
              // backgroundColor: "white",
              justifyContent: "flex-end",
              marginVertical: 5,
              width: "100%",
            }}
          >
            {workorderLine.qty > 1 ? (
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
            ) : null}
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
                                inventoryItem,
                                workorderLine,
                                item,
                                index
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
        ) : null}
      </View>
    );
  }
  try {
    return setComponent();
  } catch (e) {
    log("Error returning LineItemComponent", e);
  }
};

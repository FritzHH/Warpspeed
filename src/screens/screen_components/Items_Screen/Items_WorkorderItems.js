/*eslint-disable*/
import { View, Text, TextInput, FlatList, Image } from "react-native-web";
import {
  applyDiscountToWorkorderItem,
  calculateRunningTotals,
  deepEqual,
  formatCurrencyDisp,
  generateUPCBarcode,
  gray,
  lightenRGBByPercent,
  log,
  replaceOrAddToArr,
} from "../../../utils";
import {
  Button,
  ScreenModal,
  GradientView,
  Button_,
  DropdownMenu,
} from "../../../components";
import { C, COLOR_GRADIENTS, Colors, ICONS } from "../../../styles";
import {
  WORKORDER_ITEM_PROTO,
  INVENTORY_ITEM_PROTO,
  SETTINGS_OBJ,
  DISCOUNT_OBJ_PROTO,
} from "../../../data";
import { useEffect, useRef, useState } from "react";
import { cloneDeep } from "lodash";
import {
  useCheckoutStore,
  useOpenWorkordersStore,
  useInventoryStore,
  useSettingsStore,
} from "../../../stores";

export const Items_WorkorderItemsTab = ({}) => {
  // store setters ///////////////////////////////////////////////////////////////
  const _zSetWorkorder = useOpenWorkordersStore((state) => state.setWorkorder);
  const _zSetIsCheckingOut = useCheckoutStore(
    (state) => state.setIsCheckingOut
  );
  const _zSetWorkorderField = useOpenWorkordersStore((s) => s.setField);

  // store getters ///////////////////////////////////////////////////////////////

  const zOpenWorkorder = useOpenWorkordersStore((state) =>
    state.getOpenWorkorder()
  );
  const zSettings = useSettingsStore((state) => state.settings);
  const zInventoryArr = useInventoryStore((state) => state.inventoryArr);

  ///////////////////////////////////////////////////////////////////////////
  const [sButtonsRowID, _setButtonsRowID] = useState(null);
  const [sTotalPrice, _setTotalPrice] = useState("");
  const [sTotalDiscount, _setTotalDiscount] = useState("");
  const [sHasCheckedInventoryPrice, _setHasCheckedInventoryPrice] =
    useState(false);

  // dev
  const checkoutBtnRef = useRef();
  useEffect(() => {
    if (zOpenWorkorder?.workordersArr && zSettings.salesTax) {
      // log("here");
      // _zSetIsCheckingOut(true);
      // dbGetCustomerObj("1236").then((res) => {
      //   _zSetCustomer(res);
      //   // log("res", res);
      // });
    }
  }, [zOpenWorkorder, zSettings]);

  ///////////////////////////////////////////////////////////////////////////
  ///////////////////////////////////////////////////////////////////////////

  // update the workorder inventory items to the latest prices, also watching inventory array to keep current price. also update the discont object
  useEffect(() => {
    if (
      !(zOpenWorkorder?.workorderLines.length > 0) ||
      !(zInventoryArr.length > 0)
    )
      return;
    if (sHasCheckedInventoryPrice) return;
    _setHasCheckedInventoryPrice(true);
    let linesToChange = [];

    let invIdxArr = [];
    let discountsIdxArr = [];
    zOpenWorkorder.workorderLines.forEach((line, idx) => {
      // log("line", line);
      let curInvItem = zInventoryArr.find(
        (o) => o.id === line.inventoryItem.id
      );
      if (!curInvItem) return;
      if (!deepEqual(curInvItem, line.inventoryItem)) {
        // clog("cur inv", curInvItem.price);
        // clog("previous", line.inventoryItem.price);
        linesToChange.push({ ...curInvItem });
        invIdxArr.push({ idx, curInvItem });
      }

      // let curDiscount = line.discountObj?;
    });

    // the price has changed. now reset the discount object to reflect the new price as well
    if (invIdxArr.length > 0) {
      let wo = cloneDeep(zOpenWorkorder);
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
    _setTotalDiscount(runningDiscount);
    _setTotalPrice(runningTotal);
    // _zSetWorkorderObj(wo, false);
    log("running");
  }, [zOpenWorkorder]);

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

  function modQtyPressed(workorderLine, option) {
    // log("here");
    let newWOLine = cloneDeep(workorderLine);
    // let wo = cloneDeep(zOpenWorkorder);
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

    _zSetWorkorderField(
      "workorderLines",
      replaceOrAddToArr(zOpenWorkorder.workorderLines, newWOLine)
    );
  }

  function editWorkorderLine(workorderLine) {
    _zSetWorkorderField(
      "workorderLines",
      replaceOrAddToArr(zOpenWorkorder.workorderLines, workorderLine)
    );
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

  function handleDeleteWorkorder() {
    log("delete workorder");
  }

  // log("here", zOpenWorkorder);
  if (!(zOpenWorkorder?.workorderLines.length > 0))
    return (
      <View style={{ flex: 1, justifyContent: "center" }}>
        <Text style={{ fontSize: 100, color: gray(0.07), textAlign: "center" }}>
          {"Empty\nWorkorder"}
        </Text>
      </View>
    );

  // log("main");
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
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
              __setWorkorderLineItem={editWorkorderLine}
              inventoryItem={invItem}
              workorderLine={item}
              __splitItems={splitItems}
              __modQtyPressed={modQtyPressed}
              index={idx}
              applyDiscount={applyDiscount}
              zSettings={zSettings}
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
          backgroundColor: C.buttonLightGreen,
          marginVertical: 5,
          marginHorizontal: 5,
          borderRadius: 15,
          borderColor: C.buttonLightGreenOutline,
          borderWidth: 1,
          padding: 3,
          alignSelf: "center",
        }}
      >
        {/* <View style={{ width: "15%" }}> */}
        <Button_
          icon={ICONS.trash}
          iconSize={22}
          onPress={handleDeleteWorkorder}
        />
        {/* </View> */}
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
              color: C.text,
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
                  color: C.text,
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
              color: C.text,
              fontSize: 14,
            }}
          >
            {"$" + formatCurrencyDisp((sTotalPrice * zSettings.salesTax) / 100)}
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
              color: C.text,
              fontSize: 15,
            }}
          >
            {"$" +
              formatCurrencyDisp(
                sTotalPrice * (zSettings.salesTax / 100) + sTotalPrice
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
};

export const LineItemComponent = ({
  inventoryItem = INVENTORY_ITEM_PROTO,
  workorderLine = WORKORDER_ITEM_PROTO,
  zSettings = SETTINGS_OBJ,
  __deleteWorkorderLine,
  __modQtyPressed,
  __setWorkorderLineItem,
  __splitItems,
  index,
  applyDiscount,
  ssButtonsRowID,
  __setButtonsRowID,
}) => {
  const [sTempQtyVal, _setTempQtyVal] = useState(null);
  const [sShowDiscountModal, _setShowDiscountModal] = useState(null);
  const [sLocalNotes, _setLocalNotes] = useState(
    workorderLine.intakeNotes || ""
  );
  const ref = useRef();
  const debounceRef = useRef(null);

  /////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////

  // Sync local state when workorderLine changes from external sources
  useEffect(() => {
    _setLocalNotes(workorderLine.intakeNotes || "");
  }, [workorderLine.intakeNotes]);

  // Debounced function to update workorder line
  const debouncedUpdateNotes = (val) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      let line = { ...workorderLine, intakeNotes: val };
      __setWorkorderLineItem(line);
    }, 300); // 300ms debounce
  };

  function formatDiscountsArr(discountArr) {
    if (discountArr[discountArr.length - 1].name === "No Discount")
      return discountArr;
    discountArr.push({
      name: "No Discount",
    });
    return discountArr;
  }

  // log("item component");
  return (
    <View
      style={{
        width: "100%",
      }}
    >
      <View
        style={{
          backgroundColor: C.backgroundListWhite,
          paddingVertical: 3,
          paddingRight: 5,
          paddingLeft: 8,
          marginVertical: 3,
          marginHorizontal: 8,
          borderColor: C.listItemBorder,
          borderLeftColor: lightenRGBByPercent(C.green, 60),
          borderWidth: 1,
          borderRadius: 15,
          borderLeftWidth: 3,
          width: "100%",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            width: "100%",
            alignItems: "center",
          }}
        >
          <View
            style={{
              width: "65%",
              height: "100%",
              justifyContent: "flex-start",
              alignItems: "center",
              flexDirection: "row",
              // backgroundColor: "blue",
            }}
          >
            <View style={{ width: "100%", height: "100%" }}>
              {!!workorderLine.discountObj?.name && (
                <Text style={{ color: C.lightred }}>
                  {workorderLine.discountObj?.name || "discount goes here"}
                </Text>
              )}
              <Text
                style={{
                  fontSize: 15,
                  color: C.text,
                  fontWeight: "400",
                }}
                numberOfLines={2}
              >
                {inventoryItem.formalName}
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  width: "100%",
                  // backgroundColor: "green",
                }}
              >
                <TextInput
                  numberOfLines={4}
                  style={{ outlineWidth: 0, color: C.lightText, width: "100%" }}
                  onChangeText={(val) => {
                    _setLocalNotes(val);
                    debouncedUpdateNotes(val);
                  }}
                  placeholder="Intake and service notes..."
                  placeholderTextColor={gray(0.2)}
                  value={sLocalNotes}
                />
              </View>
            </View>
          </View>
          <View
            style={{
              width: "35%",
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
                onPress={() => __modQtyPressed(workorderLine, "up", index)}
                buttonStyle={{
                  backgroundColor: "transparent",
                  paddingHorizontal: 3,
                  // width: null,
                  // height: null,
                }}
                icon={ICONS.upArrowOrange}
                iconSize={23}
              />
              <Button_
                onPress={() => __modQtyPressed(workorderLine, "down", index)}
                buttonStyle={{
                  paddingHorizontal: 4,
                  backgroundColor: "transparent",
                }}
                icon={ICONS.downArrowOrange}
                iconSize={23}
              />
              <GradientView
                style={{
                  marginLeft: 7,
                  borderRadius: 15,
                  width: 31,
                  height: 23,
                }}
              >
                <TextInput
                  style={{
                    fontSize: 16,
                    fontWeight: 500,
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
                    let line = { ...workorderLine, qty: Number(val) };
                    __setWorkorderLineItem(line);
                  }}
                />
              </GradientView>
            </View>
            <View
              style={{
                alignItems: "flex-end",
                minWidth: 85,
                marginHorizontal: 5,
                borderWidth: 1,
                borderRadius: 7,
                borderColor: C.listItemBorder,
                height: "100%",
                paddingRight: 3,
                backgroundColor: C.backgroundWhite,
                justifyContent: "center",
              }}
            >
              {(workorderLine.qty > 1 ||
                workorderLine.discountObj?.newPrice) && (
                <Text
                  style={{
                    paddingHorizontal: 0,
                    color: C.text,
                  }}
                >
                  {"$ " +
                    formatCurrencyDisp(
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
                    color: C.lightText,
                  }}
                >
                  {"$ -" +
                    formatCurrencyDisp(workorderLine.discountObj?.savings)}
                </Text>
              )}
              <Text
                style={{
                  fontWeight: "500",
                  minWidth: 30,
                  marginTop: 0,
                  paddingHorizontal: 0,
                  color: C.text,
                }}
              >
                {workorderLine.discountObj?.newPrice
                  ? "$ " +
                    formatCurrencyDisp(workorderLine.discountObj?.newPrice)
                  : "$" +
                    formatCurrencyDisp(
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
                iconSize={20}
                icon={ICONS.editPencil}
                onPress={() =>
                  __setButtonsRowID(
                    workorderLine.id === ssButtonsRowID
                      ? null
                      : workorderLine.id
                  )
                }
                buttonStyle={{
                  paddingHorizontal: 5,
                  backgroundColor: "transparent",
                }}
              />
              <Button_
                onPress={() => __deleteWorkorderLine(index)}
                icon={ICONS.trash}
                iconSize={16}
                buttonStyle={{
                  paddingRight: 4,
                }}
              />
            </View>
          </View>
        </View>
        {ssButtonsRowID === workorderLine.id && (
          <View
            style={{
              flexDirection: "row",
              justifyContent: "flex-end",
              marginVertical: 5,
              width: "100%",
            }}
          >
            {workorderLine.qty > 1 && (
              <Button_
                icon={ICONS.axe}
                iconSize={20}
                textStyle={{ fontSize: 13, color: gray(0.55) }}
                onPress={() => {
                  __splitItems(inventoryItem, workorderLine, index);
                  __setButtonsRowID(null);
                }}
                text={"Split Items"}
                buttonStyle={{
                  backgroundColor: C.buttonLightGreen,
                  borderColor: C.buttonLightGreenOutline,
                  borderWidth: 1,
                  borderRadius: 5,
                  marginRight: 5,
                  height: 25,
                }}
              />
            )}
            <DropdownMenu
              buttonIcon={ICONS.menu2}
              buttonIconSize={13}
              dataArr={zSettings.discounts.map((o) => ({ label: o.name }))}
              // modalCoordinateVars={{ x: 0, y: -5 }}
              onSelect={(val) => {
                let discount = zSettings.discounts.find(
                  (o) => o.name === val.label
                );
                let line = {
                  ...workorderLine,
                  discountObj: discount,
                };
                __setWorkorderLineItem(line);
              }}
              buttonStyle={{
                backgroundColor: C.buttonLightGreen,
                borderColor: C.buttonLightGreenOutline,
                borderWidth: 1,
                height: 25,
                borderRadius: 5,
              }}
              buttonTextStyle={{
                fontSize: 13,
                color: gray(0.55),
              }}
              ref={ref}
              modalCoordX={-87}
              buttonText={"Discounts"}
            />
          </View>
        )}
      </View>
    </View>
  );
  // try {
  //   return setComponent();
  // } catch (e) {
  //   log("Error returning LineItemComponent", e);
  // }
};

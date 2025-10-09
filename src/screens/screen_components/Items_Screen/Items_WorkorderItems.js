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
  showAlert,
} from "../../../utils";
import {
  GradientView,
  Button_,
  DropdownMenu,
  TextInput_,
} from "../../../components";
import { C, ICONS } from "../../../styles";
import {
  WORKORDER_ITEM_PROTO,
  INVENTORY_ITEM_PROTO,
  SETTINGS_OBJ,
  TAB_NAMES,
} from "../../../data";
import { useEffect, useRef, useState } from "react";
import { cloneDeep } from "lodash";
import {
  useCheckoutStore,
  useOpenWorkordersStore,
  useInventoryStore,
  useSettingsStore,
  useTabNamesStore,
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
  const [sTotalDiscount, _setTotalDiscount] = useState("");
  const [sTotals, _setTotals] = useState({
    runningQty: 0,
    runningTotal: 0,
    runningDiscount: 0,
    runningSubtotal: 0,
    runningTax: 0,
    finalTotal: 0,
  });
  const [sHasCheckedInventoryPrice, _setHasCheckedInventoryPrice] =
    useState(false);

  // dev
  const checkoutBtnRef = useRef();

  useEffect(() => {
    if (zOpenWorkorder?.workordersArr && zSettings.salesTaxPercent) {
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

  //calculate running totals, update the workorder inventory items to the latest prices, also watching inventory array to keep current price. also update the discont object
  useEffect(() => {
    if (
      !(zOpenWorkorder?.workorderLines?.length > 0) ||
      !(zInventoryArr?.length > 0)
    )
      return;

    if (sHasCheckedInventoryPrice) return;
    _setHasCheckedInventoryPrice(true);
    let linesToChange = [];

    let invIdxArr = [];
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

  // calculate runnings totals on the open workorder ///////////////
  useEffect(() => {
    if (!(zOpenWorkorder?.workorderLines?.length > 0)) return;
    _setTotals(
      calculateRunningTotals(zOpenWorkorder, zSettings.salesTaxPercent)
    );
  }, [zOpenWorkorder]);

  ////////////////////////////////////////////////////////////////////////
  function deleteWorkorderLineItem(index) {
    let workorderLines = zOpenWorkorder.workorderLines.filter(
      (o, idx) => idx != index
    );
    _zSetWorkorderField("workorderLines", workorderLines);
  }

  function modifyQtyPressed(workorderLine, option) {
    let newWOLine = cloneDeep(workorderLine);
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
    let workorderLines = zOpenWorkorder.workorderLines.map((o) => {
      if (o.id === workorderLine.id) {
        workorderLine = { ...workorderLine, discountObj };
        let discountedWorkorderLine =
          applyDiscountToWorkorderItem(workorderLine);
        // log("discounted", discountedWorkorderLine);
        return discountedWorkorderLine;
      }
      return o;
    });

    _zSetWorkorderField("workorderLines", workorderLines);
  }

  function splitItems(workorderLine, index) {
    let num = workorderLine.qty;
    let workorderLines = cloneDeep(zOpenWorkorder.workorderLines);
    for (let i = 0; i <= num - 1; i++) {
      let newLine = cloneDeep(workorderLine);
      newLine.qty = 1;
      newLine.id = generateUPCBarcode();
      newLine.discountObj = null;
      if (i === 0) {
        workorderLines[index] = newLine;
        continue;
      }
      workorderLines.splice(index + 1, 0, newLine);
    }

    _zSetWorkorderField("workorderLines", workorderLines);
  }

  function handleDeleteWorkorder() {
    const deleteFun = () => {
      useOpenWorkordersStore.getState().removeWorkorder(zOpenWorkorder.id);
      useTabNamesStore.getState().setItems({
        itemsTabName: TAB_NAMES.itemsTab.empty,
        infoTabName: TAB_NAMES.infoTab.customer,
        optionsTabName: TAB_NAMES.optionsTab.workorders,
      });
    };

    showAlert({
      title: zOpenWorkorder.isStandaloneSale
        ? "Confirm Delete Sale"
        : "Confirm Delete Workorder",
      btn1Icon: ICONS.trash,
      handleBtn1Press: deleteFun,
    });
  }

  // log("here", zOpenWorkorder);
  if (!zOpenWorkorder) return null;
  if (!(zOpenWorkorder?.workorderLines.length > 0))
    return (
      <View style={{ flex: 1, justifyContent: "center" }}>
        <Text style={{ fontSize: 100, color: gray(0.07), textAlign: "center" }}>
          {"Empty\n" +
            (zOpenWorkorder?.isStandaloneSale ? "Sale " : "Workorder")}
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
              __modQtyPressed={modifyQtyPressed}
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
          justifyContent: "space-evenly",
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
              fontWeight: 500,
              fontSize: 14,
            }}
          >
            {"$" + formatCurrencyDisp(sTotals.runningSubtotal)}
          </Text>
        </Text>
        <View
          style={{
            width: 1,
            height: "100%",
            backgroundColor: C.buttonLightGreenOutline,
          }}
        />
        {sTotals.runningDiscount > 0 && (
          <Text style={{ fontSize: 13, color: "gray" }}>
            {"DISCOUNT: "}
            <Text
              style={{
                marginRight: 10,
                fontWeight: 500,
                color: C.text,
                fontSize: 14,
              }}
            >
              {"$" + formatCurrencyDisp(sTotals.runningDiscount)}
            </Text>
          </Text>
        )}
        {sTotals.runningDiscount > 0 && (
          <View
            style={{
              width: 1,
              height: "100%",
              backgroundColor: C.buttonLightGreenOutline,
            }}
          />
        )}
        <Text style={{ fontSize: 13, color: "gray" }}>
          {"TAX: "}
          <Text
            style={{
              marginRight: 10,
              fontWeight: 500,
              color: C.text,
              fontSize: 14,
            }}
          >
            {"$" + formatCurrencyDisp(sTotals.runningTax)}
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
              fontWeight: 500,
              color: C.text,
              fontSize: 15,
            }}
          >
            {"$" + formatCurrencyDisp(sTotals.finalTotal)}
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
          iconSize={34}
          buttonStyle={{ paddingVertical: 0 }}
          onPress={() => _zSetIsCheckingOut(true)}
        />
      </View>
    </View>
  );
};

export const LineItemComponent = ({
  inventoryItem = INVENTORY_ITEM_PROTO,
  workorderLine = WORKORDER_ITEM_PROTO,
  zSettingsObj = SETTINGS_OBJ,
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

  // log("item component");
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
          borderColor: C.listItemBorder,
          borderLeftColor: lightenRGBByPercent(C.green, 60),
          borderWidth: 1,
          borderRadius: 15,
          borderLeftWidth: 3,
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
              <TextInput_
                multiline={true}
                numberOfLines={5}
                style={{ outlineWidth: 0, color: C.lightText, width: "100%" }}
                onChangeText={(val) => {
                  let line = { ...workorderLine, intakeNotes: val };
                  __setWorkorderLineItem(line);
                }}
                placeholder="Intake and service notes..."
                placeholderTextColor={gray(0.2)}
                value={workorderLine.intakeNotes}
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
              paddingRight: 2,
              backgroundColor: C.backgroundWhite,
              justifyContent: "center",
            }}
          >
            {(workorderLine.qty > 1 || workorderLine.discountObj?.newPrice) && (
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
                {"$ -" + formatCurrencyDisp(workorderLine.discountObj?.savings)}
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
                ? "$ " + formatCurrencyDisp(workorderLine.discountObj?.newPrice)
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
                  workorderLine.id === ssButtonsRowID ? null : workorderLine.id
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
                paddingRight: 2,
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
            <Button_
              icon={ICONS.axe}
              iconSize={17}
              textStyle={{ fontSize: 13, color: gray(0.55), fontWeight: 500 }}
              onPress={() => {
                __splitItems(workorderLine, index);
                __setButtonsRowID(null);
              }}
              text={"Split Items"}
              buttonStyle={{
                backgroundColor: C.buttonLightGreen,
                borderColor: C.buttonLightGreenOutline,
                justifyContent: "center",
                alignItems: "center",
                borderWidth: 1,
                paddingVertical: 2,
                borderRadius: 5,
                marginRight: 10,
              }}
            />
          )}
          <DropdownMenu
            buttonText={"Discount"}
            modalCoordY={25}
            modalCoordX={-80}
            dataArr={zSettingsObj.discounts.map((o) => ({ label: o.name }))}
            onSelect={(item) => {
              __setButtonsRowID(null);
              applyDiscount(
                workorderLine,
                zSettingsObj.discounts.find((o) => o.name === item.label)
              );
            }}
          />
          ;
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

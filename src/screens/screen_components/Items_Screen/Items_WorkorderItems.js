/*eslint-disable*/
import { View, Text, TextInput, FlatList, Image, TouchableOpacity } from "react-native-web";
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
  resolveStatus,
  showAlert,
} from "../../../utils";
import {
  GradientView,
  Button_,
  DropdownMenu,
  TextInput_,
  Tooltip,
} from "../../../components";
import { C, ICONS } from "../../../styles";
import {
  WORKORDER_ITEM_PROTO,
  INVENTORY_ITEM_PROTO,
  SETTINGS_OBJ,
  TAB_NAMES,
} from "../../../data";
import { useEffect, useRef, useState } from "react";
import { cloneDeep, zipObject } from "lodash";
import {
  useCheckoutStore,
  useOpenWorkordersStore,
  useInventoryStore,
  useSettingsStore,
  useTabNamesStore,
  useCurrentCustomerStore,
} from "../../../stores";
import { dbGetCustomer } from "../../../db_calls_wrapper";
import { CustomItemModal } from "../modal_screens/CustomItemModal";
import { DeliveryReceiptInstance } from "twilio/lib/rest/conversations/v1/conversation/message/deliveryReceipt";

export const Items_WorkorderItemsTab = ({}) => {
  // store getters ///////////////////////////////////////////////////////////////

  // Fix 1+2: read directly from state snapshot (no getter methods); deepEqual prevents
  // re-renders when Firestore syncs identical data with new object references
  const zOpenWorkorder = useOpenWorkordersStore(
    (state) => {
      const id = state.workorderPreviewID || state.openWorkorderID;
      return state.workorders.find((o) => o.id === id) ?? null;
    },
    deepEqual
  );

  // Fix 3: deepEqual prevents re-renders from unrelated inventory changes
  const zInventoryArr = useInventoryStore((state) => state.inventoryArr, deepEqual);

  // Fix 4: subscribe only to the two fields actually used, not the whole settings object
  const zSalesTaxPercent = useSettingsStore((state) => state.settings?.salesTaxPercent);
  const zDiscounts = useSettingsStore((state) => state.settings?.discounts, deepEqual);
  const zStatuses = useSettingsStore((state) => state.settings?.statuses, deepEqual);

  const isDonePaid = resolveStatus(zOpenWorkorder?.status, zStatuses)?.label?.toLowerCase() === "done & paid";

  ///////////////////////////////////////////////////////////////////////////
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

  const [sEditingCustomLine, _setEditingCustomLine] = useState(null);

  // dev
  const checkoutBtnRef = useRef();


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
      useOpenWorkordersStore.getState().setWorkorder(wo);
    }
  }, [zInventoryArr, zOpenWorkorder]);

  // calculate runnings totals on the open workorder ///////////////
  useEffect(() => {
    if (!(zOpenWorkorder?.workorderLines?.length > 0)) return;
    _setTotals(
      calculateRunningTotals(zOpenWorkorder, zSalesTaxPercent)
    );
  }, [zOpenWorkorder]);

  ////////////////////////////////////////////////////////////////////////
  function deleteWorkorderLineItem(index) {
    let workorderLines = zOpenWorkorder.workorderLines.filter(
      (o, idx) => idx != index
    );
    useOpenWorkordersStore.getState().setField("workorderLines", workorderLines);
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

    useOpenWorkordersStore.getState().setField(
      "workorderLines",
      replaceOrAddToArr(zOpenWorkorder.workorderLines, newWOLine)
    );
  }

  function editWorkorderLine(workorderLine, saveToDB = true) {
    useOpenWorkordersStore.getState().setField(
      "workorderLines",
      replaceOrAddToArr(zOpenWorkorder.workorderLines, workorderLine),
      undefined,
      saveToDB
    );
  }

  function handleCustomItemEditSave(updatedLine) {
    editWorkorderLine(updatedLine);
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

    useOpenWorkordersStore.getState().setField("workorderLines", workorderLines);
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

    useOpenWorkordersStore.getState().setField("workorderLines", workorderLines);
  }

  function handleDeleteWorkorder() {
    const deleteFun = () => {
      const store = useOpenWorkordersStore.getState();
      const isStandalone = zOpenWorkorder.isStandaloneSale;

      store.removeWorkorder(zOpenWorkorder.id);

      if (!isStandalone) {
        const remainingWorkorders = store.workorders.filter(
          (wo) => !wo.isStandaloneSale
        );
        const previousWorkorder = remainingWorkorders[0] ?? null;

        if (previousWorkorder) {
          store.setOpenWorkorderID(previousWorkorder.id);
          useTabNamesStore.getState().setItems({
            infoTabName: TAB_NAMES.infoTab.workorder,
            itemsTabName: TAB_NAMES.itemsTab.workorderItems,
            optionsTabName: TAB_NAMES.optionsTab.inventory,
          });
          dbGetCustomer(previousWorkorder.customerID).then((customer) =>
            useCurrentCustomerStore.getState().setCustomer(customer, false)
          );
          return;
        }
      }

      store.setOpenWorkorderID(null);
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
  let hasItems = zOpenWorkorder?.workorderLines?.length > 0;
  if (!hasItems)
    return (
      <View style={{ flex: 1 }}>
        <View style={{ flex: 1, justifyContent: "center" }}>
          <Text style={{ fontSize: 100, color: gray(0.07), textAlign: "center" }}>
            {"Empty\n" +
              (zOpenWorkorder?.isStandaloneSale ? "Sale " : "Workorder")}
          </Text>
        </View>
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
          <Tooltip text="Delete workorder" position="top">
            <Button_
              icon={ICONS.trash}
              iconSize={22}
              onPress={handleDeleteWorkorder}
            />
          </Tooltip>
          <View style={{ width: 1, height: "100%", backgroundColor: C.buttonLightGreenOutline }} />
          <Text style={{ fontSize: 13, color: gray(0.65) }}>
            {"SUBTOTAL: "}
            <Text style={{ fontWeight: 500, fontSize: 14, color: gray(0.65) }}>$0.00</Text>
          </Text>
          <View style={{ width: 1, height: "100%", backgroundColor: C.buttonLightGreenOutline }} />
          <Text style={{ fontSize: 13, color: gray(0.65) }}>
            {"TAX: "}
            <Text style={{ fontWeight: 500, fontSize: 14, color: gray(0.65) }}>$0.00</Text>
          </Text>
          <View style={{ width: 1, height: "100%", backgroundColor: C.buttonLightGreenOutline }} />
          <Text
            style={{
              fontSize: 13,
              borderColor: C.buttonLightGreenOutline,
              borderRadius: 15,
              borderWidth: 1,
              paddingHorizontal: 14,
              paddingVertical: 3,
              color: gray(0.65),
            }}
          >
            {"TOTAL: "}
            <Text style={{ fontWeight: 500, fontSize: 15, color: gray(0.65) }}>$0.00</Text>
          </Text>
          <View style={{ width: 1, height: "100%", backgroundColor: C.buttonLightGreenOutline }} />
          <Tooltip text="Check out workorder" position="top">
            <Button_
              ref={checkoutBtnRef}
              icon={ICONS.shoppingCart}
              iconSize={34}
              buttonStyle={{ paddingVertical: 0, opacity: 0.3 }}
              disabled={true}
            />
          </Tooltip>
        </View>
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
      {isDonePaid && (
        <View
          style={{
            backgroundColor: C.red,
            paddingVertical: 5,
            paddingHorizontal: 12,
            marginHorizontal: 8,
            marginTop: 3,
            borderRadius: 5,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "white", fontSize: 12, fontWeight: "600" }}>
            Finished - No Edits Allowed
          </Text>
        </View>
      )}
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
              zSettingsObj={{ discounts: zDiscounts }}
              onEditCustomItem={_setEditingCustomLine}
              isLocked={isDonePaid}
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
        <Tooltip text="Delete workorder" position="top">
          <Button_
            icon={ICONS.trash}
            iconSize={22}
            disabled={isDonePaid}
            onPress={handleDeleteWorkorder}
            buttonStyle={{ opacity: isDonePaid ? 0.3 : 1 }}
          />
        </Tooltip>
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
        <Tooltip text="Check out workorder" position="top">
          <Button_
            ref={checkoutBtnRef}
            textStyle={{ color: C.textWhite, fontSize: 16 }}
            icon={ICONS.shoppingCart}
            iconSize={34}
            disabled={isDonePaid}
            buttonStyle={{ paddingVertical: 0, opacity: isDonePaid ? 0.3 : 1 }}
            onPress={() => useCheckoutStore.getState().setIsCheckingOut(true)}
          />
        </Tooltip>
      </View>
      {sEditingCustomLine && (
        <CustomItemModal
          visible={!!sEditingCustomLine}
          onClose={() => _setEditingCustomLine(null)}
          onSave={handleCustomItemEditSave}
          type={sEditingCustomLine.inventoryItem?.customLabor ? "labor" : "part"}
          existingLine={sEditingCustomLine}
        />
      )}
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
  onEditCustomItem,
  isLocked,
}) => {
  const isCustom = inventoryItem.customPart || inventoryItem.customLabor;
  const [sTempQtyVal, _setTempQtyVal] = useState(null);
  const [sShowDiscountModal, _setShowDiscountModal] = useState(null);
  const [sActiveNoteField, _sSetActiveNoteField] = useState(null);

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

  // log("INTAKE NOTES", sIntakeNotes);
  // log("WORKORDER NOTES", workorderLine.intakeNotes);
  // console.log("RECEIPT NOTES", sReceiptNotes);
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
          backgroundColor: inventoryItem.customLabor ? lightenRGBByPercent(C.blue, 80) : inventoryItem.customPart ? lightenRGBByPercent(C.green, 80) : C.backgroundListWhite,
          paddingVertical: 3,
          paddingRight: 5,
          paddingLeft: 8,
          marginVertical: 3,
          marginHorizontal: 8,
          borderColor: C.listItemBorder,
          borderLeftColor: workorderLine.discountObj?.name ? C.lightred : lightenRGBByPercent(C.green, 60),
          borderWidth: 1,
          borderRadius: 15,
          borderLeftWidth: 3,
        }}
      >
        <View
          style={{
            width: "65%",
            justifyContent: "center",
            flexDirection: "column",
            // backgroundColor: "blue",
          }}
        >
          <View style={{ width: "100%" }}>
            {!!workorderLine.discountObj?.name && (
              <Text style={{ color: C.lightred }}>
                {workorderLine.discountObj?.name || "discount goes here"}
              </Text>
            )}
            {(() => {
              const hasIntake = !!(workorderLine.intakeNotes || "").trim();
              const hasReceipt = !!(workorderLine.receiptNotes || "").trim();
              const showIntake = hasIntake || sActiveNoteField === "intake";
              const showReceipt = hasReceipt || sActiveNoteField === "receipt";

              // Cycle logic for the note button
              const handleNoteButtonPress = () => {
                if (!hasIntake && !hasReceipt) {
                  // Neither has content — cycle: null → intake → receipt → null
                  if (!sActiveNoteField) _sSetActiveNoteField("intake");
                  else if (sActiveNoteField === "intake") _sSetActiveNoteField("receipt");
                  else _sSetActiveNoteField(null);
                } else if (hasIntake && !hasReceipt) {
                  // Only intake has content — toggle receipt
                  _sSetActiveNoteField(sActiveNoteField === "receipt" ? null : "receipt");
                } else if (!hasIntake && hasReceipt) {
                  // Only receipt has content — toggle intake
                  _sSetActiveNoteField(sActiveNoteField === "intake" ? null : "intake");
                }
              };

              // Show button unless both fields have content
              const showButton = !(hasIntake && hasReceipt);

              return (
                <>
                  <View style={{ flexDirection: "row", alignItems: "center", width: "100%" }}>
                    {showButton && (
                      <TouchableOpacity
                        onPress={handleNoteButtonPress}
                        style={{ padding: 2, marginRight: 4 }}
                      >
                        <Image source={ICONS.letterR} style={{ width: 18, height: 18, opacity: 0.5 }} />
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      disabled={!isCustom || isLocked}
                      onPress={() => isCustom && onEditCustomItem?.(workorderLine)}
                      activeOpacity={isCustom ? 0.6 : 1}
                      style={{ flex: 1 }}
                    >
                      <Text
                        style={{
                          fontSize: 15,
                          color: C.text,
                          fontWeight: "400",
                          textDecorationLine: "none",
                        }}
                        numberOfLines={2}
                      >
                        {inventoryItem.formalName || (isCustom ? "(tap to edit)" : "")}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {showIntake && (
                    <TextInput_
                      multiline={true}
                      numberOfLines={5}
                      debounceMs={500}
                      capitalize={true}
                      editable={!isLocked}
                      style={{ outlineWidth: 0, color: "orange", width: "100%" }}
                      onChangeText={(val) => {
                        __setWorkorderLineItem({ ...workorderLine, intakeNotes: val });
                      }}
                      placeholder="Intake notes..."
                      placeholderTextColor={gray(0.2)}
                      value={workorderLine.intakeNotes || ""}
                    />
                  )}
                  {showReceipt && (
                    <TextInput_
                      capitalize
                      multiline={true}
                      numberOfLines={5}
                      debounceMs={500}
                      editable={!isLocked}
                      style={{ outlineWidth: 0, color: "green", width: "100%" }}
                      onChangeText={(val) => {
                        __setWorkorderLineItem({ ...workorderLine, receiptNotes: val });
                      }}
                      placeholder="Receipt notes..."
                      placeholderTextColor={gray(0.2)}
                      value={workorderLine.receiptNotes || ""}
                    />
                  )}
                </>
              );
            })()}
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
              disabled={isLocked}
              onPress={() => __modQtyPressed(workorderLine, "up", index)}
              buttonStyle={{
                backgroundColor: "transparent",
                paddingHorizontal: 3,
              }}
              icon={ICONS.upArrowOrange}
              iconSize={23}
            />
            <Button_
              disabled={isLocked}
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
                editable={!isLocked}
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
              marginLeft: 4,
              alignItems: "center",
            }}
          >
            <View
              style={{
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                // backgroundColor: "green",
              }
              }
            >
              {workorderLine.qty > 1 && <Tooltip text="Split items" position="top">
                <Button_
                  icon={ICONS.axe}
                  iconSize={23}
                  disabled={isLocked}
                  onPress={workorderLine.qty > 1 ? () => __splitItems(workorderLine, index) : () => { }}
                  buttonStyle={{
                    backgroundColor: "transparent",
                    paddingRight: 14,
                    opacity: workorderLine.qty > 1 ? 1 : 0,
                  }}
                />
              </Tooltip>
              }
            <Tooltip text="Discounts" position="top">
              <DropdownMenu
                buttonIcon={ICONS.dollarYellow}
                buttonIconSize={25}
                modalCoordY={25}
                  modalCoordX={-100}
                enabled={!isLocked}
                buttonStyle={{ borderWidth: 0, backgroundColor: "transparent" }}
                dataArr={[
                  { label: "No Discount" },
                  ...(zSettingsObj.discounts || []).map((o) => ({ label: o.name })),
                ]}
                onSelect={(item) => {
                  if (item.label === "No Discount") {
                    __setWorkorderLineItem({ ...workorderLine, discountObj: null });
                  } else {
                    applyDiscount(
                      workorderLine,
                      zSettingsObj.discounts.find((o) => o.name === item.label)
                    );
                  }
                }}
              />
              </Tooltip>
            </View>

            <Button_
              disabled={isLocked}
              onPress={() => __deleteWorkorderLine(index)}
              icon={ICONS.trash}
              iconSize={21}
              buttonStyle={{
                paddingRight: 2,
                marginLeft: -8,
              }}
            />
          </View>
        </View>
      </View>
    </View>
  );
  // try {
  //   return setComponent();
  // } catch (e) {
  //   log("Error returning LineItemComponent", e);
  // }
};

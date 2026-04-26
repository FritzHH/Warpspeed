/*eslint-disable*/
import { View, Text, FlatList, Image, TouchableOpacity, Animated } from "react-native-web";
import {
  applyDiscountToWorkorderItem,
  calculateRunningTotals,
  deepEqual,
  formatCurrencyDisp,
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
  CheckBox_,
  DropdownMenu,
  TextInput_,
  Tooltip,
  StaleBanner,
} from "../../../components";
import { C, ICONS } from "../../../styles";
import { EmptyItemsComponent } from "./Items_Empty";
import {
  CUSTOMER_PROTO,
  WORKORDER_ITEM_PROTO,
  INVENTORY_ITEM_PROTO,
  SETTINGS_OBJ,
  TAB_NAMES,
} from "../../../data";
import { useEffect, useRef, useState } from "react";
import { cloneDeep, zipObject } from "lodash";
import {
  useCheckoutStore,
  useCurrentCustomerStore,
  useOpenWorkordersStore,
  useInventoryStore,
  useSettingsStore,
  useTabNamesStore,
  useLoginStore,
  useAlertScreenStore,
  useActiveSalesStore,
} from "../../../stores";
import { CustomItemModal } from "../modal_screens/CustomItemModal";
import { calculateSaleTotals } from "../modal_screens/newCheckoutModalScreen/newCheckoutUtils";
import { DeliveryReceiptInstance } from "twilio/lib/rest/conversations/v1/conversation/message/deliveryReceipt";

export const Items_WorkorderItemsTab = ({}) => {
  // store getters ///////////////////////////////////////////////////////////////

  // Subscribe to the full workorder but only re-render when the fields this
  // component uses actually change (not brand/description/colors/partOrdered/etc.)
  const zOpenWorkorder = useOpenWorkordersStore(
    (state) => {
      const id = state.workorderPreviewID || state.openWorkorderID;
      return state.workorders.find((o) => o.id === id) ?? null;
    },
    (prev, next) => {
      if (prev === next) return true;
      if (!prev || !next) return false;
      return (
        prev.id === next.id &&
        prev.status === next.status &&
        prev.taxFree === next.taxFree &&
        prev.customerID === next.customerID &&
        prev.activeSaleID === next.activeSaleID &&
        deepEqual(prev.workorderLines, next.workorderLines) &&
        deepEqual(prev.customerNotes, next.customerNotes)
      );
    }
  );
  const zIsPreview = useOpenWorkordersStore((state) => !!state.workorderPreviewID && state.workorderPreviewID !== state.openWorkorderID);
  // Fix 3: deepEqual prevents re-renders from unrelated inventory changes
  const zInventoryArr = useInventoryStore((state) => state.inventoryArr, deepEqual);

  // Fix 4: subscribe only to the two fields actually used, not the whole settings object
  const zSalesTaxPercent = useSettingsStore((state) => state.settings?.salesTaxPercent);
  const zDiscounts = useSettingsStore((state) => state.settings?.discounts, deepEqual);
  const zStatuses = useSettingsStore((state) => state.settings?.statuses, deepEqual);

  const zWorkordersLoaded = useOpenWorkordersStore((state) => state.workordersLoaded);
  const zActiveSales = useActiveSalesStore((state) => state.activeSales);

  const isDonePaid = resolveStatus(zOpenWorkorder?.status, zStatuses)?.label?.toLowerCase() === "done & paid";
  const isLocked = isDonePaid;
  const activeSale = zOpenWorkorder?.activeSaleID
    ? zActiveSales.find((s) => s.id === zOpenWorkorder.activeSaleID)
    : null;
  const depositOnlyTotal = (activeSale?.depositsApplied || []).reduce((sum, d) => sum + (d.amount || 0), 0);
  const hasActiveSale = !!activeSale && ((activeSale.amountCaptured || 0) - depositOnlyTotal) > 0;

  const fadeAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!hasActiveSale) { fadeAnim.setValue(1); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(fadeAnim, { toValue: 0.3, duration: 1200, useNativeDriver: false }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 1200, useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [hasActiveSale]);

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
  const qtyTimerRef = useRef(null);
  const qtyMapRef = useRef({});
  const [sQtyMap, _setQtyMap] = useState({});


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

  // clear local qty overrides when switching workorders
  useEffect(() => {
    _setQtyMap({});
    qtyMapRef.current = {};
  }, [zOpenWorkorder?.id]);

  // calculate runnings totals on the open workorder ///////////////
  useEffect(() => {
    if (!(zOpenWorkorder?.workorderLines?.length > 0)) return;
    _setTotals(
      calculateRunningTotals(zOpenWorkorder, zSalesTaxPercent, [], false, !!zOpenWorkorder.taxFree)
    );
  }, [zOpenWorkorder]);

  ////////////////////////////////////////////////////////////////////////

  function buildLinesWithQtyOverrides(extraOverrides = {}) {
    let storeWo = useOpenWorkordersStore.getState().workorders.find(
      (o) => o.id === zOpenWorkorder.id
    );
    if (!storeWo) return null;
    let mergedOverrides = { ...qtyMapRef.current, ...extraOverrides };
    return storeWo.workorderLines.map((line) => {
      let overrideQty = mergedOverrides[line.id];
      if (overrideQty === undefined) return line;
      let newLine = { ...line, qty: overrideQty };
      if (newLine.discountObj?.name) {
        let discounted = applyDiscountToWorkorderItem(newLine);
        if (discounted.discountObj?.newPrice != null) return discounted;
      }
      return newLine;
    });
  }

  function checkSaleFloor(proposedLines, overrides = {}) {
    let freshSales = useActiveSalesStore.getState().activeSales;
    let sale = zOpenWorkorder?.activeSaleID
      ? freshSales.find(s => s.id === zOpenWorkorder.activeSaleID)
      : null;
    if (!sale || (sale.amountCaptured || 0) <= 0) return { allowed: true };
    let netPaid = (sale.amountCaptured || 0) - (sale.amountRefunded || 0);
    if (netPaid <= 0) return { allowed: true };
    let settings = useSettingsStore.getState().settings;
    let allStoreWorkorders = useOpenWorkordersStore.getState().workorders;
    let saleWOIds = sale.workorderIDs || [zOpenWorkorder.id];
    let combinedWOs = saleWOIds.map(woId => {
      let wo = allStoreWorkorders.find(w => w.id === woId);
      if (!wo) return null;
      if (woId === zOpenWorkorder.id) {
        wo = { ...wo };
        if (proposedLines) wo.workorderLines = proposedLines;
        if (overrides.taxFree !== undefined) wo.taxFree = overrides.taxFree;
      }
      return wo;
    }).filter(Boolean);
    let totals = calculateSaleTotals(combinedWOs, settings);
    if (totals.total < netPaid) {
      return { allowed: false, newTotal: totals.total, netPaid };
    }
    return { allowed: true };
  }

  function showFloorBlockedAlert(result) {
    useAlertScreenStore.getState().setValues({
      showAlert: true,
      title: "Cannot Reduce Total",
      message: "This change would reduce the sale total to $" + formatCurrencyDisp(result.newTotal) +
               ", which is below the $" + formatCurrencyDisp(result.netPaid) + " already paid." +
               "\n\nTo make this change, process a refund in the checkout screen first.",
      btn1Text: "OK",
      handleBtn1Press: () => useAlertScreenStore.getState().setValues({ showAlert: false }),
    });
  }

  function deleteWorkorderLineItem(index) {
    useLoginStore.getState().requireLogin(() => {
      let deletedLine = zOpenWorkorder.workorderLines[index];
      let workorderLines = zOpenWorkorder.workorderLines.filter(
        (o, idx) => idx != index
      );
      let floorCheck = checkSaleFloor(workorderLines);
      if (!floorCheck.allowed) { showFloorBlockedAlert(floorCheck); return; }
      useOpenWorkordersStore.getState().setField("workorderLines", workorderLines);

      // remove auto customer note if no other line references the same item
      if (deletedLine?.inventoryItem?.id) {
        const itemID = deletedLine.inventoryItem.id;
        const stillHasItem = workorderLines.some(
          (line) => line.inventoryItem?.id === itemID
        );
        if (!stillHasItem) {
          let customerNotes = zOpenWorkorder.customerNotes || [];
          let filtered = customerNotes.filter((n) => n.autoNoteItemID !== itemID);
          if (filtered.length !== customerNotes.length) {
            useOpenWorkordersStore.getState().setField("customerNotes", filtered);
          }
        }
      }
    });
  }

  function saveQtyMapToDb() {
    let updatedLines = buildLinesWithQtyOverrides();
    if (!updatedLines) return;

    let floorCheck = checkSaleFloor(updatedLines);
    if (!floorCheck.allowed) {
      qtyMapRef.current = {};
      _setQtyMap({});
      showFloorBlockedAlert(floorCheck);
      return;
    }

    useOpenWorkordersStore.getState().setField(
      "workorderLines",
      updatedLines,
      zOpenWorkorder.id,
      true
    );

    qtyMapRef.current = {};
    _setQtyMap({});
  }

  function modifyQtyPressed(workorderLine, option) {
    useLoginStore.getState().requireLogin(() => {
      let currentQty = qtyMapRef.current[workorderLine.id] !== undefined
        ? qtyMapRef.current[workorderLine.id]
        : workorderLine.qty;

      let newQty;
      if (option === "up") {
        newQty = currentQty + 1;
      } else {
        newQty = currentQty - 1;
        if (newQty <= 0) return;
        if (hasActiveSale) {
          let proposedLines = buildLinesWithQtyOverrides({ [workorderLine.id]: newQty });
          if (proposedLines) {
            let floorCheck = checkSaleFloor(proposedLines);
            if (!floorCheck.allowed) { showFloorBlockedAlert(floorCheck); return; }
          }
        }
      }

      // Update local state instantly
      qtyMapRef.current = { ...qtyMapRef.current, [workorderLine.id]: newQty };
      _setQtyMap({ ...qtyMapRef.current });

      // Debounce DB write
      clearTimeout(qtyTimerRef.current);
      qtyTimerRef.current = setTimeout(() => saveQtyMapToDb(), 700);
    });
  }

  function handleQtyTextInput(workorderLine, newQty) {
    useLoginStore.getState().requireLogin(() => {
      qtyMapRef.current = { ...qtyMapRef.current, [workorderLine.id]: newQty };
      _setQtyMap({ ...qtyMapRef.current });

      clearTimeout(qtyTimerRef.current);
      qtyTimerRef.current = setTimeout(() => saveQtyMapToDb(), 1500);
    });
  }

  function handleQtyBlurSave(workorderLine, rawVal) {
    useLoginStore.getState().requireLogin(() => {
      let qty = Number(rawVal);
      if (!qty || qty <= 0) qty = 1;
      clearTimeout(qtyTimerRef.current);
      qtyMapRef.current = { ...qtyMapRef.current, [workorderLine.id]: qty };
      _setQtyMap({ ...qtyMapRef.current });
      saveQtyMapToDb();
    });
  }

  function editWorkorderLine(workorderLine, saveToDB = true) {
    useLoginStore.getState().requireLogin(() => {
      useOpenWorkordersStore.getState().setField(
        "workorderLines",
        replaceOrAddToArr(zOpenWorkorder.workorderLines, workorderLine),
        undefined,
        saveToDB
      );
    });
  }

  function handleCustomItemEditSave(updatedLine) {
    if (hasActiveSale) {
      let proposedLines = zOpenWorkorder.workorderLines.map(l =>
        l.id === updatedLine.id ? updatedLine : l
      );
      let floorCheck = checkSaleFloor(proposedLines);
      if (!floorCheck.allowed) { showFloorBlockedAlert(floorCheck); return; }
    }
    editWorkorderLine(updatedLine);
  }

  function applyDiscount(workorderLine, discountObj) {
    useLoginStore.getState().requireLogin(() => {
      let workorderLines = zOpenWorkorder.workorderLines.map((o) => {
        if (o.id === workorderLine.id) {
          workorderLine = { ...workorderLine, discountObj };
          let discountedWorkorderLine =
            applyDiscountToWorkorderItem(workorderLine);
          return discountedWorkorderLine;
        }
        return o;
      });

      let floorCheck = checkSaleFloor(workorderLines);
      if (!floorCheck.allowed) { showFloorBlockedAlert(floorCheck); return; }

      useOpenWorkordersStore.getState().setField("workorderLines", workorderLines);
    });
  }

  function splitItems(workorderLine, index) {
    useLoginStore.getState().requireLogin(() => {
      let num = workorderLine.qty;
      let workorderLines = cloneDeep(zOpenWorkorder.workorderLines);
      for (let i = 0; i <= num - 1; i++) {
        let newLine = cloneDeep(workorderLine);
        newLine.qty = 1;
        newLine.id = crypto.randomUUID();
        newLine.discountObj = null;
        if (i === 0) {
          workorderLines[index] = newLine;
          continue;
        }
        workorderLines.splice(index + 1, 0, newLine);
      }

      useOpenWorkordersStore.getState().setField("workorderLines", workorderLines);
    });
  }

  function handleDeleteWorkorder() {
    useLoginStore.getState().requireLogin(() => {
    const deleteFun = () => {
      useOpenWorkordersStore.getState().removeWorkorder(zOpenWorkorder.id);

      useOpenWorkordersStore.getState().setOpenWorkorderID(null);
      useCurrentCustomerStore.getState().setCustomer({ ...CUSTOMER_PROTO }, false);
      useTabNamesStore.getState().setItems({
        itemsTabName: TAB_NAMES.itemsTab.empty,
        infoTabName: TAB_NAMES.infoTab.customer,
        optionsTabName: TAB_NAMES.optionsTab.workorders,
      });
    };

    showAlert({
      title: "Confirm Delete Workorder",
      btn1Icon: ICONS.trash,
      handleBtn1Press: deleteFun,
    });
    });
  }

  function handleTaxFreeToggle() {
    useLoginStore.getState().requireLogin(() => {
      const currentlyTaxFree = !!zOpenWorkorder.taxFree;
      if (currentlyTaxFree) {
        useOpenWorkordersStore.getState().setField("taxFree", false);
        useOpenWorkordersStore.getState().setField("taxFreeReceiptNote", "");
      } else {
        const partLines = (zOpenWorkorder.workorderLines || []).filter(line => {
          const inv = line.inventoryItem;
          return !inv.customLabor && inv.category !== "Labor";
        });

        if (partLines.length > 0) {
          const itemList = partLines.map(line =>
            "\u2022 " + line.inventoryItem.formalName + (line.qty > 1 ? " (x" + line.qty + ")" : "")
          ).join("\n");
          useAlertScreenStore.getState().setValues({
            showAlert: true,
            fullScreen: true,
            title: "Cannot Mark Tax-Free",
            message: "The following parts must be removed before this workorder can be marked tax-free:\n\n" + itemList,
            btn1Text: "OK",
            handleBtn1Press: () => {
              useAlertScreenStore.getState().setValues({ showAlert: false });
            },
          });
        } else {
          useAlertScreenStore.getState().setValues({
            showAlert: true,
            fullScreen: true,
            title: "Tax-Free Confirmation",
            message: "No shop parts, even a drop of oil, must leave with the customer for this workorder to qualify as tax-free.",
            btn1Text: "Confirm Tax-Free",
            handleBtn1Press: () => {
              useAlertScreenStore.getState().setValues({ showAlert: false });
              let floorCheck = checkSaleFloor(null, { taxFree: true });
              if (!floorCheck.allowed) { showFloorBlockedAlert(floorCheck); return; }
              useOpenWorkordersStore.getState().setField("taxFree", true);
              useOpenWorkordersStore.getState().setField("taxFreeReceiptNote", useSettingsStore.getState().settings?.taxFreeReceiptNote || "");
            },
            btn2Text: "Cancel",
            handleBtn2Press: () => {
              useAlertScreenStore.getState().setValues({ showAlert: false });
            },
          });
        }
      }
    });
  }

  // log("here", zOpenWorkorder);
  if (!zOpenWorkorder) return <EmptyItemsComponent />;
  let hasItems = zOpenWorkorder?.workorderLines?.length > 0;
  if (!hasItems)
    return (
      <View style={{ flex: 1, backgroundImage: zIsPreview ? `repeating-linear-gradient(135deg, ${lightenRGBByPercent(C.lightred, 92)}, ${lightenRGBByPercent(C.lightred, 92)} 10px, transparent 10px, transparent 20px)` : undefined }}>
        <View style={{ flex: 1, justifyContent: "center" }}>
          <Text style={{ fontSize: 100, color: gray(0.07), textAlign: "center" }}>
            {zOpenWorkorder.customerID ? "Empty\nWorkorder" : "Empty\nSale"}
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
          <Tooltip text={hasActiveSale ? "Sale in progress, cannot delete workorder" : "Delete workorder"} position="top" alert={hasActiveSale}>
            <Button_
              icon={ICONS.trash}
              iconSize={22}
              enabled={!hasActiveSale}
              onPress={handleDeleteWorkorder}
              buttonStyle={{ opacity: hasActiveSale ? 0.3 : 1 }}
            />
          </Tooltip>
          <View style={{ width: 1, height: "100%", backgroundColor: C.buttonLightGreenOutline }} />
          <CheckBox_
            text="Tax-Free"
            isChecked={!!zOpenWorkorder.taxFree}
            onCheck={handleTaxFreeToggle}
            textStyle={{ fontSize: 12, color: zOpenWorkorder.taxFree ? C.green : gray(0.5) }}
          />
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
          <View style={{ width: 1, height: "100%", backgroundColor: C.buttonLightGreenOutline, justifyContent: "center" }} />
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
        backgroundImage: zIsPreview
          ? `repeating-linear-gradient(135deg, ${lightenRGBByPercent(C.lightred, 92)}, ${lightenRGBByPercent(C.lightred, 92)} 10px, transparent 10px, transparent 20px)`
          : undefined,
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

      {!zWorkordersLoaded && zOpenWorkorder && (
        <StaleBanner
          text="Waiting on workorder refresh...."
          style={{ marginHorizontal: 8, marginTop: 3 }}
        />
      )}

      {hasActiveSale && (
        <Animated.View
          style={{
            opacity: fadeAnim,
            backgroundColor: "#FFD600",
            paddingVertical: 5,
            paddingHorizontal: 12,
            marginHorizontal: 8,
            marginTop: 3,
            borderRadius: 5,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "black", fontSize: 12, fontWeight: "600" }}>
            {((activeSale?.workorderIDs?.length || 0) > 1 ? "Combined Sale in Progress" : "Sale in Progress") + " - $" + formatCurrencyDisp((activeSale?.amountCaptured || 0) - (activeSale?.amountRefunded || 0)) + " Paid"}
          </Text>
        </Animated.View>
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
              __handleQtyTextInput={handleQtyTextInput}
              __handleQtyBlurSave={handleQtyBlurSave}
              localQty={sQtyMap[item.id]}
              index={idx}
              applyDiscount={applyDiscount}
              zSettingsObj={{ discounts: zDiscounts }}
              onEditCustomItem={_setEditingCustomLine}
              isLocked={isLocked}
              hasActiveSale={hasActiveSale}
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
        <Tooltip text={hasActiveSale ? "Sale in progress, cannot delete workorder" : "Delete workorder"} position="top" alert={hasActiveSale}>
          <Button_
            icon={ICONS.trash}
            iconSize={22}
            enabled={!isLocked && !hasActiveSale}
            onPress={handleDeleteWorkorder}
            buttonStyle={{ opacity: (isLocked || hasActiveSale) ? 0.3 : 1 }}
          />
        </Tooltip>
        <View
          style={{
            width: 1,
            height: "100%",
            backgroundColor: C.buttonLightGreenOutline,
          }}
        />
        <CheckBox_
          text="Tax-Free"
          isChecked={!!zOpenWorkorder.taxFree}
          onCheck={handleTaxFreeToggle}
          enabled={!isLocked}
          textStyle={{ fontSize: 12, color: zOpenWorkorder.taxFree ? C.green : gray(0.5) }}
        />
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
              color: zOpenWorkorder.taxFree ? C.lightText : C.text,
              fontSize: 14,
              textDecorationLine: zOpenWorkorder.taxFree ? "line-through" : "none",
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

        {(() => {
          let activeSale = zOpenWorkorder?.activeSaleID ? zActiveSales.find((s) => s.id === zOpenWorkorder.activeSaleID) : null;
          let paid = activeSale ? (activeSale.amountCaptured || 0) - (activeSale.amountRefunded || 0) : 0;
          let hasPayments = paid > 0;
          let woCount = activeSale?.workorderIDs?.length || 1;
          let saleBalance = Math.max(0, (activeSale?.total || sTotals.finalTotal) - paid);
          let remaining = hasPayments ? Math.round(saleBalance / woCount) : 0;
          return (
            <View
              style={{
                borderColor: C.buttonLightGreenOutline,
                borderRadius: 15,
                borderWidth: 1,
                paddingHorizontal: 14,
                paddingVertical: 3,
                alignItems: "center",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={{ fontSize: hasPayments ? 13 : 13, color: "gray" }}>{"TOTAL: "}</Text>
                <Text
                  style={{
                    fontWeight: 500,
                    color: hasPayments ? gray(0.5) : C.text,
                    fontSize: hasPayments ? 14 : 15,
                    textDecorationLine: hasPayments ? "line-through" : "none",
                  }}
                >
                  {"$" + formatCurrencyDisp(sTotals.finalTotal)}
                </Text>
              </View>
              {hasPayments && (
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text style={{ fontSize: 12, color: "gray" }}>{"BALANCE: "}</Text>
                  <Text
                    style={{
                      fontWeight: 500,
                      color: C.green,
                      fontSize: 14,
                    }}
                  >
                    {"$" + formatCurrencyDisp(remaining)}
                  </Text>
                </View>
              )}
            </View>
          );
        })()}
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
            enabled={!isDonePaid}
            buttonStyle={{ paddingVertical: 0, opacity: isDonePaid ? 0.3 : 1 }}
            onPress={() => useLoginStore.getState().requireLogin(() => useCheckoutStore.getState().setIsCheckingOut(true))}
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
  __handleQtyTextInput,
  __handleQtyBlurSave,
  __setWorkorderLineItem,
  __splitItems,
  localQty,
  index,
  applyDiscount,
  onEditCustomItem,
  isLocked,
  hasActiveSale,
}) => {
  const isCustom = inventoryItem.customPart || inventoryItem.customLabor;
  const effectiveQty = localQty !== undefined ? localQty : workorderLine.qty;
  const [sQtyFocused, _setQtyFocused] = useState(false);
  const [sQtyInputVal, _setQtyInputVal] = useState("");
  const qtyBlurredRef = useRef(false);

  const qtyDisplayStr = sQtyFocused ? sQtyInputVal : String(effectiveQty);
  const qtyDigits = qtyDisplayStr.length || 1;
  const qtyBoxWidth = qtyDigits <= 2 ? 31 : 31 + (qtyDigits - 2) * 10;
  const [sShowDiscountModal, _setShowDiscountModal] = useState(null);
  const [sActiveNoteField, _sSetActiveNoteField] = useState(() => {
    if (useOpenWorkordersStore._newLineIDs?.delete(workorderLine.id)) return "intake";
    return null;
  });

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
          paddingLeft: 4,
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
            width: "60%",
            justifyContent: "center",
            flexDirection: "column",
            // backgroundColor: "blue",
          }}
        >
          <View style={{ width: "100%" }}>
            {!!(workorderLine.discountObj?.name || workorderLine.discountObj?.discountName) && (
              <View style={{ alignSelf: "flex-end", flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={{ color: C.lightred, fontSize: 14, marginRight: 5 }}>
                  {workorderLine.discountObj.name || workorderLine.discountObj.discountName}
                </Text>
                {!!workorderLine.discountObj?.savings && (
                  <Text style={{ color: C.lightred, fontSize: 14 }}>
                    {"-$" + formatCurrencyDisp(workorderLine.discountObj.savings)}
                  </Text>
                )}
              </View>
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

              // Determine which note field the next click will show
              let nextNoteLabel = "Intake notes -> Receipt Notes";
              if (!hasIntake && !hasReceipt) {
                nextNoteLabel = sActiveNoteField === "intake" ? "Receipt notes" : "Intake notes -> Receipt Notes";
              } else if (hasIntake && !hasReceipt) {
                nextNoteLabel = "Receipt notes";
              } else if (!hasIntake && hasReceipt) {
                nextNoteLabel = "Intake notes";
              }

              return (
                <>
                  <View style={{ flexDirection: "row", alignItems: "center", width: "100%" }}>
                    {showButton && (
                      <Tooltip text={nextNoteLabel} position="top">
                        <TouchableOpacity
                          onPress={handleNoteButtonPress}
                          style={{ marginRight: 4 }}
                        >
                          <Image source={ICONS.editPencil} style={{ width: 15, height: 15, opacity: 0.5 }} />
                        </TouchableOpacity>
                      </Tooltip>
                    )}
                    <TouchableOpacity
                      disabled={!isCustom || isLocked}
                      onPress={() => isCustom && onEditCustomItem?.(workorderLine)}
                      activeOpacity={isCustom ? 0.6 : 1}
                      style={{ flex: 1, flexDirection: "row", alignItems: "center" }}
                    >
                      {(inventoryItem.customPart || inventoryItem.customLabor) && (
                        <View style={{ backgroundColor: inventoryItem.customLabor ? lightenRGBByPercent(C.blue, 55) : lightenRGBByPercent(C.green, 55), borderRadius: 15, paddingHorizontal: 7, paddingVertical: 3, marginRight: 5 }}>
                          <Text style={{ fontSize: 12, fontWeight: "700", color: inventoryItem.customLabor ? lightenRGBByPercent(C.blue, 15) : lightenRGBByPercent(C.green, 15) }}>{inventoryItem.customPart ? "ITEM" : "LABOR"}</Text>
                        </View>
                      )}
                      <Text
                        style={{
                          fontSize: 16,
                          color: C.text,
                          fontWeight: "400",
                          textDecorationLine: "none",
                          flex: 1,
                        }}
                        numberOfLines={2}
                      >
                        {inventoryItem.formalName ? inventoryItem.formalName : (isCustom ? "(tap to edit)" : "")}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {showIntake && (
                    <TextInput_
                      autoFocus={true}
                      multiline={true}
                      numberOfLines={5}
                      debounceMs={500}
                      capitalize={true}
                      editable={!isLocked}
                      style={{ outlineWidth: 0, color: "orange", width: "100%", paddingHorizontal: 3, fontSize: 16 }}
                      onChangeText={(val) => {
                        useLoginStore.getState().requireLogin(() => {
                          __setWorkorderLineItem({ ...workorderLine, intakeNotes: val });
                        });
                      }}
                      placeholder="      Intake notes..."
                      placeholderTextColor={gray(0.2)}
                      value={workorderLine.intakeNotes || ""}
                    />
                  )}
                  {showReceipt && (
                    <TextInput_
                      autoFocus={true}
                      capitalize
                      multiline={true}
                      numberOfLines={5}
                      debounceMs={500}
                      editable={!isLocked}
                      style={{ outlineWidth: 0, color: "green", width: "100%", paddingHorizontal: 3, fontSize: 14 }}
                      onChangeText={(val) => {
                        useLoginStore.getState().requireLogin(() => {
                          __setWorkorderLineItem({ ...workorderLine, receiptNotes: val });
                        });
                      }}
                      placeholder="      Receipt notes..."
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
            width: "40%",
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
            {effectiveQty > 1 && <Tooltip text="Split items" position="top">
              <Button_
                icon={ICONS.axe}
                iconSize={20}
                enabled={!isLocked}
                onPress={effectiveQty > 1 ? () => __splitItems(workorderLine, index) : () => { }}
                buttonStyle={{
                  backgroundColor: "transparent",
                  paddingRight: 2,
                  opacity: effectiveQty > 1 ? 1 : 0,
                }}
              />
            </Tooltip>
            }
            <Button_
              enabled={!isLocked}
              onPress={() => __modQtyPressed(workorderLine, "up", index)}
              buttonStyle={{
                backgroundColor: "transparent",
                paddingHorizontal: 3,
              }}
              icon={ICONS.upArrowOrange}
              iconSize={23}
            />
            <Button_
              enabled={!isLocked && effectiveQty > 1}
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
                width: qtyBoxWidth,
                height: 23,
              }}
            >
              <TextInput_
                editable={!isLocked}
                debounceMs={0}
                maxLength={4}
                style={{
                  fontSize: 16,
                  fontWeight: 500,
                  textAlign: "center",
                  color: C.textWhite,
                  outlineWidth: 0,
                  width: "100%",
                  height: "100%",
                }}
                value={qtyDisplayStr}
                onFocus={() => {
                  qtyBlurredRef.current = false;
                  _setQtyFocused(true);
                  _setQtyInputVal("");
                }}
                onBlur={(e) => {
                  qtyBlurredRef.current = true;
                  let rawVal = (e?.target?.value || "").replace(/\D/g, "").slice(0, 4);
                  _setQtyFocused(false);
                  __handleQtyBlurSave(workorderLine, rawVal);
                }}
                onChangeText={(val) => {
                  if (qtyBlurredRef.current) return;
                  val = val.replace(/\D/g, "").slice(0, 4);
                  _setQtyInputVal(val);
                  __handleQtyTextInput(workorderLine, Number(val) || 0);
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
            {(effectiveQty > 1 || workorderLine.discountObj?.newPrice != null) && (
              <Text
                style={{
                  fontSize: 13,
                  paddingHorizontal: 0,
                  color: C.text,
                  textDecorationLine: workorderLine.discountObj?.newPrice != null ? "line-through" : "none",
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
            <Text
              style={{
                fontSize: 15,
                fontWeight: "500",
                minWidth: 30,
                marginTop: 0,
                paddingHorizontal: 0,
                color: C.text,
              }}
            >
              {workorderLine.discountObj?.newPrice != null
                ? "$ " + formatCurrencyDisp(workorderLine.discountObj?.newPrice)
                : "$" +
                  formatCurrencyDisp(
                    workorderLine.useSalePrice
                      ? inventoryItem.salePrice
                      : inventoryItem.price * effectiveQty
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
                flexDirection: "row",
                alignItems: "center",
                // justifyContent: "space-between",
                // backgroundColor: "green",
              }
              }
            >

            <Tooltip text="Discounts" position="top">
              <DropdownMenu
                buttonIcon={ICONS.dollarYellow}
                  buttonIconSize={22}
                modalCoordY={25}
                  modalCoordX={-100}
                enabled={!isLocked}
                isDiscountMenu={true}
                discountMaxCents={workorderLine.inventoryItem.price * (workorderLine.qty || 1)}
                buttonStyle={{ borderWidth: 0, backgroundColor: "transparent" }}
                dataArr={[
                  { label: "No Discount" },
                  ...(zSettingsObj.discounts || []).filter((o) => o.type !== "$" || Number(o.value) <= workorderLine.inventoryItem.price * (workorderLine.qty || 1)).map((o) => ({ label: o.name })),
                ]}
                onSelect={(item) => {
                  if (item._customDiscount) {
                    applyDiscount(workorderLine, item._customDiscount);
                  } else if (item.label === "No Discount") {
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

            <Tooltip text="Remove" position="top">
              <Button_
                enabled={!isLocked}
                onPress={() => __deleteWorkorderLine(index)}
                icon={ICONS.trash}
                iconSize={21}
                buttonStyle={{
                  paddingRight: 2,
                  marginLeft: -8,
                }}
              />
            </Tooltip>
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

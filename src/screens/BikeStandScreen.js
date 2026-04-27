/* eslint-disable */
import { View, Text, ScrollView, TouchableOpacity } from "react-native-web";
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { cloneDeep } from "lodash";
import { C, ICONS } from "../styles";
import {
  useSettingsStore,
  useOpenWorkordersStore,
  useInventoryStore,
  useLoginStore,
  useUploadProgressStore,
} from "../stores";
import {
  resolveStatus,
  formatCurrencyDisp,
  gray,
  lightenRGBByPercent,
  capitalizeFirstLetterOfString,
  applyDiscountToWorkorderItem,
  calculateRunningTotals,
  deepEqual,
  formatWorkorderNumber,
  removeDashesFromPhone,
  formatPhoneWithDashes,
  checkInputForNumbersOnly,
  calculateWaitEstimateLabel,
  formatMillisForDisplay,
  compressImage,
  createNewWorkorder,
  scheduleAutoText,
} from "../utils";
import {
  WORKORDER_ITEM_PROTO,
  COLORS,
  CUSTOM_WAIT_TIME,
  NONREMOVABLE_WAIT_TIMES,
  SETTINGS_OBJ,
  CONTACT_RESTRICTIONS,
  QUICK_BUTTON_ITEM_PROTO,
  QB_DEFAULT_W,
  QB_DEFAULT_H,
} from "../data";
import {
  Button_,
  Image_,
  TextInput_,
  CheckBox_,
  DropdownMenu,
  StatusPickerModal,
  PhoneNumberInput,
} from "../components";
import {
  dbListenToSettings,
  dbListenToInventory,
  dbListenToOpenWorkorders,
  dbSaveOpenWorkorder,
  dbSearchCustomersByPhone,
  dbUploadWorkorderMedia,
  startNewWorkorder,
} from "../db_calls_wrapper";
import { WorkorderMediaModal } from "./screen_components/modal_screens/WorkorderMediaModal";
import { MILLIS_IN_DAY } from "../constants";

const DROPDOWN_SELECTED_OPACITY = 0.3;

function getQuickButtonFontSize(text, baseFontSize) {
  let len = (text || "").length;
  if (len <= 15) return baseFontSize;
  return Math.max(7, Math.round(baseFontSize - (len - 15) * 0.5));
}

function normalizeItemEntry(entry, idx) {
  if (typeof entry === "string") {
    return { ...QUICK_BUTTON_ITEM_PROTO, inventoryItemID: entry, x: (idx % 6) * (QB_DEFAULT_W + 1), y: Math.floor(idx / 6) * (QB_DEFAULT_H + 1) };
  }
  return entry;
}

////////////////////////////////////////////////////////////////////////////////
// Sort Logic (from Options_Workorders)
////////////////////////////////////////////////////////////////////////////////

function sortWorkorders(inputArr, statuses, currentUser) {
  let finalArr = [];

  // Pass 1: group by status order, sort by due date within each group
  (statuses || []).forEach((status) => {
    let arr = inputArr.filter((wo) => wo.status === status.id);
    arr.sort((a, b) => {
      let aHasWait = !!(a.waitTime?.maxWaitTimeDays != null && a.startedOnMillis);
      let bHasWait = !!(b.waitTime?.maxWaitTimeDays != null && b.startedOnMillis);
      if (!aHasWait && bHasWait) return -1;
      if (aHasWait && !bHasWait) return 1;
      if (!aHasWait && !bHasWait) return 0;
      let aDue = a.startedOnMillis + a.waitTime.maxWaitTimeDays * 86400000;
      let bDue = b.startedOnMillis + b.waitTime.maxWaitTimeDays * 86400000;
      return aDue - bDue;
    });
    finalArr = [...finalArr, ...arr];
  });

  // Add any workorders with unrecognized statuses at the end
  let mappedIDs = new Set(finalArr.map((o) => o.id));
  inputArr.forEach((wo) => { if (!mappedIDs.has(wo.id)) finalArr.push(wo); });

  // Pass 2: bubble current user's assigned statuses to top
  let userStatusIDs = currentUser?.statuses || [];
  if (userStatusIDs.length > 0) {
    finalArr.sort((a, b) => {
      let aMatch = userStatusIDs.includes(a.status);
      let bMatch = userStatusIDs.includes(b.status);
      if (aMatch && !bMatch) return -1;
      if (!aMatch && bMatch) return 1;
      return 0;
    });
  }

  // Pass 3: bubble workorders where current user was last SMS sender
  finalArr.sort((a, b) => {
    let aIsSender = a.lastSMSSenderUserID && a.lastSMSSenderUserID === currentUser?.id;
    let bIsSender = b.lastSMSSenderUserID && b.lastSMSSenderUserID === currentUser?.id;
    if (aIsSender && !bIsSender) return -1;
    if (!aIsSender && bIsSender) return 1;
    return 0;
  });

  return finalArr;
}

////////////////////////////////////////////////////////////////////////////////
// Main Screen
////////////////////////////////////////////////////////////////////////////////

export function BikeStandScreen() {
  const zStatuses = useSettingsStore((s) => s.settings?.statuses, deepEqual);
  const zQuickItemButtons = useSettingsStore((s) => s.settings?.quickItemButtons, deepEqual);
  const zSettings = useSettingsStore((s) => s.settings) || SETTINGS_OBJ;
  const zWorkorders = useOpenWorkordersStore((state) => state.workorders);
  const zInventory = useInventoryStore((state) => state.inventoryArr);
  const zCurrentUser = useLoginStore((state) => state.currentUser);

  const [sSelectedWorkorderID, _setSelectedWorkorderID] = useState(null);
  const qtyMapRef = useRef({});
  const [sQtyMap, _setQtyMap] = useState({});
  const qtyTimerRef = useRef(null);

  // View mode state
  const [sViewMode, _setViewMode] = useState("buttons"); // "buttons" | "workorder"
  const [sSelectedCustomer, _setSelectedCustomer] = useState(null);
  const [sShowPhoneSearch, _setShowPhoneSearch] = useState(false);
  const [sShowCustomerModal, _setShowCustomerModal] = useState(false);
  const [sDiscountCardID, _setDiscountCardID] = useState(null);
  const longPressTimerRef = useRef(null);

  // Firebase listeners (same pattern as IntakeScreen)
  useEffect(() => {
    dbListenToSettings((data) => {
      useSettingsStore.getState().setSettings(data, false, false);
    });
    dbListenToInventory((data) => {
      useInventoryStore.getState().setItems(data);
    });
    dbListenToOpenWorkorders((data) => {
      useOpenWorkordersStore.getState().setOpenWorkorders(data);
    });
  }, []);

  let statuses = zStatuses || [];
  let sortedWorkorders = sortWorkorders(zWorkorders || [], statuses, zCurrentUser);
  let selectedWorkorder = (zWorkorders || []).find((o) => o.id === sSelectedWorkorderID);
  let commonButton = (zQuickItemButtons || []).find((b) => b.id === "common");
  let canvasItems = (commonButton?.items || []).map(normalizeItemEntry);
  let canvasMaxBottom = canvasItems.reduce((max, it) => Math.max(max, (it.y || 0) + (it.h || QB_DEFAULT_H)), 0);

  //////////////////////////////////////////////////////////////////////////////
  // Quick button press
  //////////////////////////////////////////////////////////////////////////////

  async function handleQuickButtonPress(btn) {
    if (!selectedWorkorder || !btn.inventoryItemID) return;
    let invItem = (zInventory || []).find((o) => o.id === btn.inventoryItemID);
    if (!invItem) return;

    // Persist workorder to Firestore before adding items
    let wo = selectedWorkorder;
    await dbSaveOpenWorkorder(wo);

    let lines = [...(wo.workorderLines || [])];
    let line = cloneDeep(WORKORDER_ITEM_PROTO);
    line.inventoryItem = invItem;
    line.id = crypto.randomUUID();
    lines.push(line);

    useOpenWorkordersStore.getState().setField("workorderLines", lines, wo.id, true);
  }

  //////////////////////////////////////////////////////////////////////////////
  // Qty modification (same pattern as Items_WorkorderItems)
  //////////////////////////////////////////////////////////////////////////////

  function modifyQty(workorderLine, direction) {
    if (!selectedWorkorder) return;
    let currentQty = qtyMapRef.current[workorderLine.id] !== undefined
      ? qtyMapRef.current[workorderLine.id]
      : workorderLine.qty;

    let newQty = direction === "up" ? currentQty + 1 : currentQty - 1;
    if (newQty <= 0) return;

    qtyMapRef.current = { ...qtyMapRef.current, [workorderLine.id]: newQty };
    _setQtyMap({ ...qtyMapRef.current });

    clearTimeout(qtyTimerRef.current);
    qtyTimerRef.current = setTimeout(() => {
      let storeWo = useOpenWorkordersStore.getState().workorders.find(
        (o) => o.id === sSelectedWorkorderID
      );
      if (!storeWo) return;

      let updatedLines = storeWo.workorderLines.map((ln) => {
        let overrideQty = qtyMapRef.current[ln.id];
        if (overrideQty === undefined) return ln;
        let newLine = { ...ln, qty: overrideQty };
        if (newLine.discountObj?.name) {
          let discounted = applyDiscountToWorkorderItem(newLine);
          if (discounted.discountObj?.newPrice > 0) return discounted;
        }
        return newLine;
      });

      useOpenWorkordersStore.getState().setField(
        "workorderLines", updatedLines, sSelectedWorkorderID, true
      );
      qtyMapRef.current = {};
      _setQtyMap({});
    }, 700);
  }

  //////////////////////////////////////////////////////////////////////////////
  // Long-press discount
  //////////////////////////////////////////////////////////////////////////////

  function handleLongPressStart(inventoryItemID) {
    longPressTimerRef.current = setTimeout(() => {
      if (!selectedWorkorder) return;
      let hasLine = (selectedWorkorder.workorderLines || []).some(
        (ln) => ln.inventoryItem?.id === inventoryItemID
      );
      if (hasLine) _setDiscountCardID(inventoryItemID);
    }, 500);
  }

  function handleLongPressEnd() {
    clearTimeout(longPressTimerRef.current);
  }

  function handleDiscountSelect(inventoryItemID, discountObj) {
    if (!selectedWorkorder) return;
    let updatedLines = (selectedWorkorder.workorderLines || []).map((ln) => {
      if (ln.inventoryItem?.id !== inventoryItemID) return ln;
      if (!discountObj) return { ...ln, discountObj: null };
      let updated = { ...ln, discountObj };
      return applyDiscountToWorkorderItem(updated);
    });
    useOpenWorkordersStore.getState().setField(
      "workorderLines", updatedLines, sSelectedWorkorderID, true
    );
    _setDiscountCardID(null);
  }

  //////////////////////////////////////////////////////////////////////////////
  // Customer search + workorder creation
  //////////////////////////////////////////////////////////////////////////////

  async function handleCustomerSelect(customer) {
    _setShowPhoneSearch(false);
    _setSelectedCustomer(customer);

    let wo = await startNewWorkorder(customer);
    _setSelectedWorkorderID(wo.id);
    _setViewMode("workorder");
  }

  function handleBackToButtons() {
    _setViewMode("buttons");
    _setSelectedCustomer(null);
  }

  //////////////////////////////////////////////////////////////////////////////
  // Render
  //////////////////////////////////////////////////////////////////////////////

  let customerName = selectedWorkorder
    ? (capitalizeFirstLetterOfString(selectedWorkorder.customerFirst || "") +
       " " +
       capitalizeFirstLetterOfString(selectedWorkorder.customerLast || "")).trim()
    : "";

  let lines = selectedWorkorder?.workorderLines || [];
  let selectedItemIDs = new Set(lines.map((ln) => ln.inventoryItem?.id).filter(Boolean));
  let totals = selectedWorkorder
    ? calculateRunningTotals(selectedWorkorder, zSettings?.salesTaxPercent || 0, [], false, !!selectedWorkorder?.taxFree)
    : { runningSubtotal: 0, runningDiscount: 0, runningTax: 0, finalTotal: 0 };

  return (
    <View style={{ flex: 1, backgroundColor: C.backgroundWhite }}>
      {/* Phone search modal (portal) */}
      {sShowPhoneSearch && (
        <PhoneSearchModal
          onSelect={handleCustomerSelect}
          onClose={() => _setShowPhoneSearch(false)}
        />
      )}

      {/* Customer info view-only modal (portal) */}
      {sShowCustomerModal && sSelectedCustomer && (
        <CustomerInfoViewModal
          customer={sSelectedCustomer}
          onClose={() => _setShowCustomerModal(false)}
        />
      )}

      {sViewMode === "buttons" ? (
        <>
          {/* ── Header: workorder dropdown + new workorder button ── */}
          <View style={{ padding: 12, zIndex: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <WorkorderSelector
                  workorders={sortedWorkorders}
                  statuses={statuses}
                  selectedID={sSelectedWorkorderID}
                  onSelect={(id) => _setSelectedWorkorderID(id)}
                />
              </View>
              <TouchableOpacity
                onPress={() => {/* TODO: hook up new workorder logic */}}
                style={{
                  height: 42,
                  borderRadius: 6,
                  borderWidth: 1,
                  borderColor: C.buttonLightGreenOutline,
                  backgroundColor: "white",
                  alignItems: "center",
                  justifyContent: "center",
                  paddingHorizontal: 12,
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: "600", color: C.text }}>+ New</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Totals row ── */}
          <View style={{ flexDirection: "row", paddingHorizontal: 12, paddingBottom: 6, gap: 12, alignItems: "center" }}>
            <Text style={{ fontSize: 11, color: gray(0.45) }}>
              Subtotal: <Text style={{ fontWeight: "600", color: C.text }}>${formatCurrencyDisp(totals.runningSubtotal)}</Text>
            </Text>
            {totals.runningDiscount > 0 && (
              <Text style={{ fontSize: 11, color: gray(0.45) }}>
                Disc: <Text style={{ fontWeight: "600", color: C.red }}>-${formatCurrencyDisp(totals.runningDiscount)}</Text>
              </Text>
            )}
            <Text style={{ fontSize: 11, color: gray(0.45) }}>
              Tax: <Text style={{ fontWeight: "600", color: C.text }}>${formatCurrencyDisp(totals.runningTax)}</Text>
            </Text>
            <Text style={{ fontSize: 11, color: gray(0.45) }}>
              Total: <Text style={{ fontWeight: "600", color: C.text }}>${formatCurrencyDisp(totals.finalTotal)}</Text>
            </Text>
          </View>

          {/* ── Quick item canvas (common button items) ── */}
          <ScrollView
            style={{
              flex: 1,
              backgroundColor: lightenRGBByPercent(C.backgroundWhite, 20),
            }}
          >
            <div
              style={{
                position: "relative",
                width: "100%",
                minHeight: Math.max(500, canvasMaxBottom * 8),
                overflow: "hidden",
                borderRadius: 6,
              }}
            >
              {canvasItems.map((itemObj) => {
                let invItem = (zInventory || []).find((i) => i.id === itemObj.inventoryItemID);
                let name = invItem ? (invItem.informalName || invItem.formalName || "Unknown") : "(not found)";
                let w = itemObj.w || QB_DEFAULT_W;
                let h = itemObj.h || QB_DEFAULT_H;
                let fontSize = getQuickButtonFontSize(name, itemObj.fontSize || 10);
                let isOnWorkorder = selectedItemIDs.has(itemObj.inventoryItemID);

                let workorderLine = isOnWorkorder
                  ? (selectedWorkorder.workorderLines || []).find((ln) => ln.inventoryItem?.id === itemObj.inventoryItemID)
                  : null;
                let hasDiscount = !!workorderLine?.discountObj?.value;

                return (
                  <div
                    key={itemObj.inventoryItemID}
                    onClick={() => {
                      if (sDiscountCardID) { _setDiscountCardID(null); return; }
                      handleQuickButtonPress(itemObj);
                    }}
                    onMouseDown={() => handleLongPressStart(itemObj.inventoryItemID)}
                    onMouseUp={handleLongPressEnd}
                    onMouseLeave={handleLongPressEnd}
                    onTouchStart={() => handleLongPressStart(itemObj.inventoryItemID)}
                    onTouchEnd={handleLongPressEnd}
                    style={{
                      position: "absolute",
                      left: (itemObj.x || 0) + "%",
                      top: (itemObj.y || 0) + "%",
                      width: w + "%",
                      height: h + "%",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      borderWidth: isOnWorkorder ? 2 : 1,
                      borderStyle: "solid",
                      borderColor: isOnWorkorder ? C.green : C.buttonLightGreenOutline,
                      borderRadius: 8,
                      backgroundColor: isOnWorkorder ? lightenRGBByPercent(C.green, 70) : C.buttonLightGreenOutline,
                      cursor: "pointer",
                      boxSizing: "border-box",
                      paddingLeft: 4,
                      paddingRight: 4,
                      paddingTop: 2,
                      paddingBottom: 2,
                      userSelect: "none",
                      overflow: "visible",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: fontSize,
                        color: invItem ? C.text : gray(0.35),
                        textAlign: "center",
                        fontWeight: "500",
                        lineHeight: (itemObj.fontSize || 10) + 6,
                      }}
                      numberOfLines={(name || "").split("\n").length}
                    >
                      {name}
                    </Text>
                    {hasDiscount && (
                      <Text style={{ fontSize: 8, color: C.green, fontWeight: "600" }}>
                        {workorderLine.discountObj.name || "Discount"}
                      </Text>
                    )}
                    {/* Discount dropdown on long-press */}
                    {sDiscountCardID === itemObj.inventoryItemID && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          position: "absolute",
                          top: "100%",
                          left: 0,
                          zIndex: 100,
                          backgroundColor: "white",
                          borderRadius: 6,
                          border: "1px solid " + gray(0.2),
                          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                          minWidth: 140,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          onClick={() => handleDiscountSelect(itemObj.inventoryItemID, null)}
                          style={{ padding: "6px 10px", cursor: "pointer", fontSize: 12, color: C.text, borderBottom: "1px solid " + gray(0.1) }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = gray(0.05); }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "white"; }}
                        >
                          No Discount
                        </div>
                        {(zSettings.discounts || [])
                          .filter((d) => d.type !== "$" || Number(d.value) <= (invItem?.price || 0) * (workorderLine?.qty || 1))
                          .map((d) => (
                          <div
                            key={d.name}
                            onClick={() => handleDiscountSelect(itemObj.inventoryItemID, d)}
                            style={{ padding: "6px 10px", cursor: "pointer", fontSize: 12, color: C.text, borderBottom: "1px solid " + gray(0.1) }}
                            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = gray(0.05); }}
                            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "white"; }}
                          >
                            {d.name}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {canvasItems.length === 0 && (
                <Text style={{ fontSize: 13, color: gray(0.35), textAlign: "center", paddingVertical: 12, width: "100%" }}>
                  No common quick buttons configured.
                </Text>
              )}
            </div>
          </ScrollView>
        </>
      ) : (
        <StandWorkorderDetail
          workorderID={sSelectedWorkorderID}
          customer={sSelectedCustomer}
          onBack={handleBackToButtons}
          onShowCustomerModal={() => _setShowCustomerModal(true)}
        />
      )}
    </View>
  );
}

////////////////////////////////////////////////////////////////////////////////
// Workorder Selector Dropdown
////////////////////////////////////////////////////////////////////////////////

const WorkorderSelector = ({ workorders, statuses, selectedID, onSelect }) => {
  const [sOpen, _setOpen] = useState(false);

  let selected = workorders.find((o) => o.id === selectedID);
  let label = selected
    ? `#${formatWorkorderNumber(selected.workorderNumber) || "?"} — ${
        selected.customerFirst || selected.brand || "(no name)"
      } ${selected.customerLast || ""}`.trim()
    : "Select Workorder...";

  return (
    <View>
      <TouchableOpacity
        onPress={() => _setOpen(!sOpen)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          borderWidth: 1,
          borderColor: C.buttonLightGreenOutline,
          borderRadius: 6,
          paddingHorizontal: 10,
          paddingVertical: 8,
          backgroundColor: "white",
        }}
      >
        <Text
          style={{
            flex: 1,
            fontSize: 16,
            color: selected ? C.text : gray(0.4),
          }}
          numberOfLines={1}
        >
          {label}
        </Text>
        <Image_
          icon={sOpen ? ICONS.upArrow : ICONS.downArrow}
          size={14}
          style={{ marginLeft: 6 }}
        />
      </TouchableOpacity>

      {sOpen && (
        <ScrollView
          style={{
            position: "absolute",
            top: 42,
            left: 0,
            right: 0,
            maxHeight: 350,
            backgroundColor: "white",
            borderWidth: 1,
            borderColor: gray(0.2),
            borderRadius: 6,
            zIndex: 100,
          }}
        >
          {workorders.map((wo) => {
            let status = resolveStatus(wo.status, statuses);
            return (
              <TouchableOpacity
                key={wo.id}
                onPress={() => {
                  onSelect(wo.id);
                  _setOpen(false);
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  padding: 10,
                  borderBottomWidth: 1,
                  borderBottomColor: gray(0.08),
                  backgroundColor: wo.id === selectedID ? "rgb(230,240,252)" : "white",
                }}
              >
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: status.backgroundColor || gray(0.3),
                    marginRight: 10,
                  }}
                />
                <Text
                  style={{ fontSize: 15, color: C.text, flex: 1 }}
                  numberOfLines={1}
                >
                  #{formatWorkorderNumber(wo.workorderNumber) || "?"} — {wo.customerFirst || wo.brand || "(no name)"}{" "}
                  {wo.customerLast || ""}
                </Text>
                <Text style={{ fontSize: 12, color: gray(0.5) }}>
                  {status.label}
                </Text>
              </TouchableOpacity>
            );
          })}
          {workorders.length === 0 && (
            <Text
              style={{
                fontSize: 14,
                color: gray(0.4),
                padding: 14,
                textAlign: "center",
              }}
            >
              No open workorders.
            </Text>
          )}
        </ScrollView>
      )}
    </View>
  );
};

////////////////////////////////////////////////////////////////////////////////
// Phone Search Modal
////////////////////////////////////////////////////////////////////////////////

const PhoneSearchModal = ({ onSelect, onClose }) => {
  const [sPhoneInput, _setPhoneInput] = useState("");
  const [sSearchResults, _setSearchResults] = useState([]);
  const [sIsSearching, _setIsSearching] = useState(false);
  const searchTimerRef = useRef(null);

  function handlePhoneChange(incomingText) {
    let rawDigits = removeDashesFromPhone(incomingText);
    if (rawDigits.length > 10) return;
    let formatted = rawDigits.length > 0 ? formatPhoneWithDashes(rawDigits) : "";
    _setPhoneInput(formatted);

    if (rawDigits.length < 5) {
      _setSearchResults([]);
      _setIsSearching(false);
      return;
    }

    _setIsSearching(true);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      dbSearchCustomersByPhone(rawDigits).then((results) => {
        _setSearchResults(results || []);
        _setIsSearching(false);
      }).catch(() => {
        _setIsSearching(false);
      });
    }, 300);
  }

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "80%",
          maxWidth: 500,
          maxHeight: "80%",
          backgroundColor: "white",
          borderRadius: 12,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <View style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: gray(0.1),
        }}>
          <Text style={{ fontSize: 16, fontWeight: "600", color: C.text }}>
            Search Customer
          </Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={{ fontSize: 14, color: gray(0.5) }}>Close</Text>
          </TouchableOpacity>
        </View>

        {/* Phone input */}
        <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
          <PhoneNumberInput
            boxStyle={{
              width: "8%",
              height: 40,
              outlineStyle: "none",
              borderColor: gray(0.08),
              fontSize: 22,
              color: C.text,
            }}
            autoFocus={true}
            value={sPhoneInput}
            onChangeText={handlePhoneChange}
            dashStyle={{ width: 10, marginHorizontal: 4 }}
            dashColor={gray(0.2)}
            textColor={C.text}
          />
        </View>

        {/* Results */}
        <ScrollView style={{ flex: 1, paddingHorizontal: 16, paddingBottom: 12 }}>
          {sIsSearching && (
            <Text style={{ fontSize: 14, color: gray(0.4), textAlign: "center", paddingVertical: 12 }}>
              Searching...
            </Text>
          )}
          {!sIsSearching && sSearchResults.length === 0 && sPhoneInput.length > 0 && removeDashesFromPhone(sPhoneInput).length >= 5 && (
            <Text style={{ fontSize: 14, color: gray(0.4), textAlign: "center", paddingVertical: 12 }}>
              No customers found.
            </Text>
          )}
          {sSearchResults.map((customer) => (
            <TouchableOpacity
              key={customer.id}
              onPress={() => onSelect(customer)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 10,
                paddingHorizontal: 8,
                marginBottom: 4,
                borderRadius: 6,
                borderWidth: 1,
                borderColor: gray(0.08),
                backgroundColor: C.listItemWhite,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, color: C.text, fontWeight: "500" }}>
                  {capitalizeFirstLetterOfString(customer.first || "")} {capitalizeFirstLetterOfString(customer.last || "")}
                </Text>
                <Text style={{ fontSize: 14, color: gray(0.5), marginTop: 2 }}>
                  {formatPhoneWithDashes(customer.customerCell || "")}
                </Text>
              </View>
              {customer.email && (
                <Text style={{ fontSize: 14, color: gray(0.4) }} numberOfLines={1}>
                  {customer.email}
                </Text>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </div>
    </div>,
    document.body
  );
};

////////////////////////////////////////////////////////////////////////////////
// Stand Workorder Detail
////////////////////////////////////////////////////////////////////////////////

const StandWorkorderDetail = ({ workorderID, customer, onBack, onShowCustomerModal }) => {
  const zWorkorder = useOpenWorkordersStore((state) =>
    state.workorders.find((o) => o.id === workorderID) || null
  );
  const zSettings = useSettingsStore((state) => state.settings) || SETTINGS_OBJ;
  const sUploadProgress = useUploadProgressStore((s) => s.progress);

  const [sWaitDays, _setWaitDays] = useState(0);
  const [sShowMediaModal, _setShowMediaModal] = useState(null);
  const waitDaysTimerRef = useRef(null);
  const uploadInputRef = useRef(null);

  useEffect(() => {
    if (!zWorkorder?.partOrderEstimateMillis || !zWorkorder?.partOrderedMillis) {
      _setWaitDays(0);
      return;
    }
    let days = Math.max(0, Math.round((zWorkorder.partOrderEstimateMillis - zWorkorder.partOrderedMillis) / MILLIS_IN_DAY));
    _setWaitDays(days);
  }, [zWorkorder?.id]);

  function setField(fieldName, val) {
    useOpenWorkordersStore.getState().setField(fieldName, val, workorderID);
  }

  function setBikeColor(incomingColorVal, fieldName) {
    let foundColor = false;
    let newColorObj = {};
    COLORS.forEach((bikeColorObj) => {
      if (bikeColorObj.label.toLowerCase() === incomingColorVal.toLowerCase()) {
        foundColor = true;
        newColorObj = cloneDeep(bikeColorObj);
      }
    });
    if (!foundColor) {
      newColorObj.label = incomingColorVal;
      newColorObj.backgroundColor = null;
      newColorObj.textColor = null;
    }
    setField(fieldName, newColorObj);
  }

  function updateWaitDays(newDays) {
    _setWaitDays(newDays);
    clearTimeout(waitDaysTimerRef.current);
    waitDaysTimerRef.current = setTimeout(() => {
      let now = Date.now();
      useOpenWorkordersStore.getState().setField("partOrderedMillis", now, workorderID, false);
      useOpenWorkordersStore.getState().setField("partOrderEstimateMillis", now + (newDays * MILLIS_IN_DAY), workorderID);
    }, 700);
  }

  function handleDirectUpload(e) {
    let files = Array.from(e.target.files);
    if (!files.length) return;
    if (uploadInputRef.current) uploadInputRef.current.value = "";
    doUpload(files);
  }

  async function doUpload(files) {
    let total = files.length;
    let completed = 0;
    let failed = 0;
    useUploadProgressStore.getState().setProgress({ completed: 0, total, failed: 0, done: false });
    let newMedia = [...(zWorkorder?.media || [])];
    let storeName = (zSettings?.storeInfo?.displayName || "photo").replace(/\s+/g, "_");
    for (let i = 0; i < files.length; i++) {
      let fileToUpload = files[i];
      let originalFilename = fileToUpload.name;
      let originalFileSize = fileToUpload.size;
      let ext = fileToUpload.name.split(".").pop() || "jpg";
      let rand = Math.floor(1000 + Math.random() * 9000);
      let typeLabel = fileToUpload.type.startsWith("video") ? "Video" : "Image";
      let cleanName = `${storeName}_${typeLabel}_${rand}.${ext}`;
      if (fileToUpload.type.startsWith("image")) {
        let compressed = await compressImage(fileToUpload, 1024, 0.65);
        if (compressed) {
          compressed.name = cleanName;
          fileToUpload = compressed;
        } else {
          fileToUpload = new File([fileToUpload], cleanName, { type: fileToUpload.type });
        }
      } else {
        fileToUpload = new File([fileToUpload], cleanName, { type: fileToUpload.type });
      }
      const result = await dbUploadWorkorderMedia(workorderID, fileToUpload, { originalFilename, originalFileSize });
      if (result.success) {
        newMedia.push(result.mediaItem);
        completed++;
      } else {
        failed++;
      }
      useUploadProgressStore.getState().setProgress({ completed, total, failed, done: false });
    }
    useOpenWorkordersStore.getState().setField("media", newMedia, workorderID);
    useUploadProgressStore.getState().setProgress({ completed, total, failed, done: true });
    setTimeout(() => useUploadProgressStore.getState().setProgress(null), failed > 0 ? 5000 : 3000);
  }

  let rs = resolveStatus(zWorkorder?.status, zSettings?.statuses);
  let estimateLabel = calculateWaitEstimateLabel(zWorkorder, zSettings);

  let custName = (capitalizeFirstLetterOfString(customer?.first || zWorkorder?.customerFirst || "") +
    " " + capitalizeFirstLetterOfString(customer?.last || zWorkorder?.customerLast || "")).trim();
  let custPhone = customer?.customerCell || zWorkorder?.customerCell || "";

  const inputStyle = {
    borderWidth: 1,
    borderColor: C.buttonLightGreenOutline,
    color: C.text,
    paddingVertical: 4,
    paddingHorizontal: 6,
    fontSize: 14,
    outlineWidth: 0,
    borderRadius: 5,
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Top bar: customer info + back button */}
      <View style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: gray(0.1),
      }}>
        <TouchableOpacity
          onPress={onShowCustomerModal}
          style={{ flexDirection: "row", alignItems: "center", flex: 1 }}
        >
          <Image_ icon={ICONS.ridingBike} size={28} style={{ marginRight: 8 }} />
          <View>
            <Text style={{ fontSize: 16, fontWeight: "600", color: C.text }}>
              {custName || "Customer"}
            </Text>
            {custPhone ? (
              <Text style={{ fontSize: 14, color: gray(0.5) }}>
                {formatPhoneWithDashes(custPhone)}
              </Text>
            ) : null}
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onBack}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 6,
            backgroundColor: gray(0.12),
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: "600", color: C.text }}>Back to Buttons</Text>
        </TouchableOpacity>
      </View>

      {/* Scrollable form */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12 }}>
        {/* Bike details section */}
        <View style={{
          paddingHorizontal: 8,
          paddingVertical: 8,
          backgroundColor: C.backgroundListWhite,
          borderWidth: 1,
          borderColor: gray(0.05),
          borderRadius: 5,
        }}>
          {/* Brand row */}
          <View style={{ flexDirection: "row", alignItems: "center", width: "100%" }}>
            <TextInput_
              placeholder="Brand"
              capitalize={true}
              style={{ ...inputStyle, width: "45%", fontWeight: zWorkorder?.brand ? "500" : null }}
              value={zWorkorder?.brand}
              onChangeText={(val) => setField("brand", val)}
            />
            <View style={{ width: "55%", flexDirection: "row", paddingLeft: 5, justifyContent: "space-between" }}>
              <View style={{ width: "48%" }}>
                <DropdownMenu
                  dataArr={zSettings.bikeBrands}
                  onSelect={(item) => setField("brand", item)}
                  buttonStyle={{ opacity: zWorkorder?.brand ? DROPDOWN_SELECTED_OPACITY : 1 }}
                  buttonText={zSettings.bikeBrandsName}
                />
              </View>
              <View style={{ width: "48%" }}>
                <DropdownMenu
                  dataArr={zSettings.bikeOptionalBrands}
                  onSelect={(item) => setField("brand", item)}
                  buttonStyle={{ opacity: zWorkorder?.brand ? DROPDOWN_SELECTED_OPACITY : 1 }}
                  buttonText={zSettings.bikeOptionalBrandsName}
                />
              </View>
            </View>
          </View>

          {/* Model/Description row */}
          <View style={{ flexDirection: "row", alignItems: "center", width: "100%", marginTop: 8 }}>
            <TextInput_
              placeholder="Model/Description"
              capitalize={true}
              style={{ ...inputStyle, width: "45%", fontWeight: zWorkorder?.description ? "500" : null }}
              value={zWorkorder?.description}
              onChangeText={(val) => setField("description", val)}
            />
            <View style={{ width: "55%", paddingLeft: 5 }}>
              <DropdownMenu
                dataArr={zSettings.bikeDescriptions}
                onSelect={(item) => setField("description", item)}
                buttonStyle={{ opacity: zWorkorder?.description ? DROPDOWN_SELECTED_OPACITY : 1 }}
                buttonText="Descriptions"
              />
            </View>
          </View>

          {/* Colors row */}
          <View style={{ flexDirection: "row", alignItems: "center", width: "100%", marginTop: 8 }}>
            <TextInput_
              placeholder="Color 1"
              capitalize={true}
              value={zWorkorder?.color1?.label}
              style={{
                ...inputStyle,
                width: "24%",
                fontWeight: zWorkorder?.color1?.label ? "500" : null,
                backgroundColor: zWorkorder?.color1?.backgroundColor,
                color: zWorkorder?.color1?.textColor || C.text,
              }}
              onChangeText={(val) => setBikeColor(val, "color1")}
            />
            <View style={{ width: 4 }} />
            <TextInput_
              placeholder="Color 2"
              capitalize={true}
              value={zWorkorder?.color2?.label}
              style={{
                ...inputStyle,
                width: "24%",
                fontWeight: zWorkorder?.color2?.label ? "500" : null,
                backgroundColor: zWorkorder?.color2?.backgroundColor,
                color: zWorkorder?.color2?.textColor || C.text,
              }}
              onChangeText={(val) => setBikeColor(val, "color2")}
            />
            <View style={{ width: "50%", flexDirection: "row", paddingLeft: 5, justifyContent: "space-between" }}>
              <View style={{ width: "48%" }}>
                <DropdownMenu
                  itemSeparatorStyle={{ height: 0 }}
                  dataArr={COLORS}
                  menuBorderColor="transparent"
                  onSelect={(item) => setField("color1", item)}
                  buttonStyle={{ opacity: zWorkorder?.color1 ? DROPDOWN_SELECTED_OPACITY : 1 }}
                  buttonText="Color 1"
                />
              </View>
              <View style={{ width: "48%" }}>
                <DropdownMenu
                  itemSeparatorStyle={{ height: 0 }}
                  dataArr={COLORS}
                  menuBorderColor="transparent"
                  onSelect={(item) => setField("color2", item)}
                  buttonStyle={{ opacity: zWorkorder?.color2 ? DROPDOWN_SELECTED_OPACITY : 1 }}
                  buttonText="Color 2"
                />
              </View>
            </View>
          </View>

          {/* Status */}
          <StatusPickerModal
            statuses={(zSettings.statuses || []).filter((s) => !s.systemOwned && !s.hidden)}
            onSelect={(val) => {
              setField("status", val.id);
              if (val.id === "33knktg") setField("finishedOnMillis", Date.now());
              if (val.id === "part_ordered") setField("partToBeOrdered", false);
              let linked = zSettings?.waitTimeLinkedStatus?.[val.id];
              if (linked) setField("waitTime", linked);
              let autoTextRules = zSettings?.statusAutoText || [];
              let rule = autoTextRules.find((r) => r.statusID === val.id);
              if (rule) {
                let wo = useOpenWorkordersStore.getState().workorders.find((w) => w.id === workorderID) || zWorkorder;
                scheduleAutoText(rule, wo, zSettings);
              }
            }}
            buttonStyle={{
              width: "100%",
              backgroundColor: rs.backgroundColor,
              marginTop: 8,
            }}
            buttonTextStyle={{
              color: rs.textColor,
              fontWeight: "normal",
              fontSize: 14,
            }}
            buttonText={rs.label}
          />

          {/* Wait time row */}
          <View style={{ flexDirection: "row", alignItems: "center", width: "100%", marginTop: 8 }}>
            <Text style={{ color: gray(0.5), fontSize: 14, marginRight: 4 }}>Max wait days:</Text>
            <TextInput_
              placeholder="0"
              inputMode="numeric"
              style={{
                ...inputStyle,
                width: 50,
                textAlign: "center",
                fontWeight: (zWorkorder?.waitTime?.maxWaitTimeDays != null && zWorkorder?.waitTime?.maxWaitTimeDays !== "") ? "500" : null,
              }}
              value={String(zWorkorder?.waitTime?.maxWaitTimeDays ?? "")}
              onChangeText={(val) => {
                if (val !== "" && !checkInputForNumbersOnly(val)) return;
                let days = val === "" ? "" : Number(val);
                let waitObj = {
                  ...CUSTOM_WAIT_TIME,
                  label: val === "" ? "" : val + (days === 1 ? " Day" : " Days"),
                  maxWaitTimeDays: days,
                };
                setField("waitTime", waitObj);
              }}
            />
            <View style={{ flex: 1, paddingLeft: 5 }}>
              <DropdownMenu
                dataArr={zSettings.waitTimes}
                onSelect={(item) => {
                  let isNonRemovable = NONREMOVABLE_WAIT_TIMES.some((nr) => nr.id === item.id);
                  let waitObj = { ...item, removable: !isNonRemovable };
                  setField("waitTime", waitObj);
                }}
                buttonStyle={{ opacity: zWorkorder?.waitTime?.label ? DROPDOWN_SELECTED_OPACITY : 1 }}
                buttonText="Wait Times"
              />
            </View>
          </View>
          {estimateLabel && (
            <Text style={{ color: gray(0.5), fontSize: 14, fontStyle: "italic", marginTop: 4 }}>
              {estimateLabel}
            </Text>
          )}
        </View>

        {/* Parts section */}
        <View style={{
          marginTop: 8,
          paddingHorizontal: 8,
          paddingVertical: 8,
          backgroundColor: gray(0.05),
          borderRadius: 5,
        }}>
          <TextInput_
            placeholder="Part name/description"
            capitalize={true}
            style={{ ...inputStyle, width: "100%", fontWeight: zWorkorder?.partOrdered ? "500" : null, backgroundColor: C.backgroundWhite }}
            value={zWorkorder?.partOrdered}
            onChangeText={(val) => {
              setField("partOrdered", val);
              useOpenWorkordersStore.getState().setField("partOrderedMillis", Date.now(), workorderID, false);
            }}
          />

          <View style={{ flexDirection: "row", alignItems: "center", width: "100%", marginTop: 8 }}>
            <TextInput_
              placeholder="Part Source"
              capitalize={true}
              value={zWorkorder?.partSource}
              style={{ ...inputStyle, width: "50%", fontWeight: zWorkorder?.partSource ? "500" : null, backgroundColor: C.backgroundWhite }}
              onChangeText={(val) => {
                setField("partSource", val);
                useOpenWorkordersStore.getState().setField("partOrderedMillis", Date.now(), workorderID, false);
              }}
            />
            <View style={{ width: "50%", paddingLeft: 5 }}>
              <DropdownMenu
                dataArr={zSettings.partSources}
                onSelect={(item) => {
                  setField("partSource", item);
                  useOpenWorkordersStore.getState().setField("partOrderedMillis", Date.now(), workorderID, false);
                }}
                buttonStyle={{ opacity: zWorkorder?.partSource ? DROPDOWN_SELECTED_OPACITY : 1 }}
                buttonText="Part Sources"
              />
            </View>
          </View>

          {/* Est delivery + to be ordered */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%", marginTop: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", opacity: zWorkorder?.partToBeOrdered ? 0.35 : 1 }}>
              <Text style={{ fontSize: 14, color: gray(0.45), marginRight: 8 }}>Est. delivery</Text>
              <TouchableOpacity
                disabled={!!zWorkorder?.partToBeOrdered}
                onPress={() => updateWaitDays(Math.max(0, sWaitDays - 1))}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 4,
                  backgroundColor: zWorkorder?.partToBeOrdered ? gray(0.85) : C.buttonLightGreen,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Text style={{ color: gray(0.55), fontSize: 16, fontWeight: "700", marginTop: -1 }}>-</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 14, fontWeight: "400", color: C.text, minWidth: 50, textAlign: "center" }}>
                {sWaitDays + " days"}
              </Text>
              <TouchableOpacity
                disabled={!!zWorkorder?.partToBeOrdered}
                onPress={() => updateWaitDays(sWaitDays + 1)}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 4,
                  backgroundColor: zWorkorder?.partToBeOrdered ? gray(0.85) : C.buttonLightGreen,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Text style={{ color: gray(0.55), fontSize: 16, fontWeight: "700", marginTop: -1 }}>+</Text>
              </TouchableOpacity>
              {!!zWorkorder?.partOrderEstimateMillis && !zWorkorder?.partToBeOrdered && (
                <Text style={{ fontSize: 14, color: gray(0.45), marginLeft: 8 }}>
                  {formatMillisForDisplay(zWorkorder.partOrderEstimateMillis)}
                </Text>
              )}
            </View>
            <CheckBox_
              text="To be ordered"
              isChecked={!!zWorkorder?.partToBeOrdered}
              onCheck={() => setField("partToBeOrdered", !zWorkorder?.partToBeOrdered)}
              textStyle={{ fontSize: 14, color: gray(0.55) }}
            />
          </View>
        </View>

        {/* Media buttons */}
        <input
          ref={uploadInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          onChange={handleDirectUpload}
          style={{ display: "none" }}
        />
        <View style={{ alignItems: "center", marginTop: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center" }}>
            <Button_
              icon={ICONS.uploadCamera}
              iconSize={40}
              onPress={() => uploadInputRef.current?.click()}
              buttonStyle={{ backgroundColor: "transparent", paddingHorizontal: 0, paddingVertical: 0 }}
            />
            <View>
              <Button_
                icon={ICONS.viewPhoto}
                iconSize={50}
                onPress={() => _setShowMediaModal("view")}
                buttonStyle={{ backgroundColor: "transparent", paddingHorizontal: 0, paddingVertical: 0 }}
              />
              <View style={{
                position: "absolute",
                top: -1,
                right: -5,
                borderRadius: 8,
                minWidth: 16,
                height: 16,
                justifyContent: "center",
                alignItems: "center",
                paddingHorizontal: 3,
              }}>
                <Text style={{
                  color: zWorkorder?.media?.length > 0 ? C.red : "gray",
                  fontSize: 15,
                  fontWeight: "700",
                }}>
                  {zWorkorder?.media?.length || 0}
                </Text>
              </View>
            </View>
          </View>
          {/* Upload progress bar */}
          {sUploadProgress && (
            <View style={{ flexDirection: "row", alignItems: "center", width: "100%", paddingBottom: 4 }}>
              <Text style={{
                fontSize: 14,
                color: sUploadProgress.done ? (sUploadProgress.failed > 0 ? C.red : C.green) : gray(0.45),
                fontWeight: "700",
                marginRight: 6,
              }}>
                {sUploadProgress.completed}/{sUploadProgress.total}
              </Text>
              <View style={{ flex: 1, height: 4, backgroundColor: gray(0.88), borderRadius: 2, overflow: "hidden" }}>
                {!sUploadProgress.done ? (
                  <View style={{ width: "40%", height: "100%", backgroundColor: C.blue, borderRadius: 2 }} />
                ) : (
                  <View style={{
                    width: "100%",
                    height: "100%",
                    backgroundColor: sUploadProgress.failed > 0 ? C.red : C.green,
                    borderRadius: 2,
                  }} />
                )}
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Media view modal */}
      <WorkorderMediaModal
        visible={sShowMediaModal === "view"}
        onClose={() => _setShowMediaModal(null)}
        workorderID={workorderID}
        mode="view"
      />
    </View>
  );
};

////////////////////////////////////////////////////////////////////////////////
// Customer Info View Modal (read-only)
////////////////////////////////////////////////////////////////////////////////

const CustomerInfoViewModal = ({ customer, onClose }) => {
  if (!customer) return null;

  let fields = [
    { label: "First Name", value: customer.first },
    { label: "Last Name", value: customer.last },
    { label: "Cell Phone", value: formatPhoneWithDashes(customer.customerCell || "") },
    { label: "Landline", value: formatPhoneWithDashes(customer.customerLandline || "") },
    { label: "Email", value: customer.email },
    { label: "Address", value: customer.streetAddress },
    { label: "Language", value: customer.language },
    {
      label: "Contact",
      value: customer.contactRestriction === CONTACT_RESTRICTIONS.call
        ? "CALL ONLY"
        : customer.contactRestriction === CONTACT_RESTRICTIONS.email
          ? "EMAIL ONLY"
          : "",
    },
  ].filter((f) => f.value);

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "70%",
          maxWidth: 420,
          backgroundColor: "white",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <View style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: gray(0.1),
        }}>
          <Text style={{ fontSize: 16, fontWeight: "600", color: C.text }}>Customer Info</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={{ fontSize: 14, color: gray(0.5) }}>Close</Text>
          </TouchableOpacity>
        </View>
        <View style={{ padding: 16 }}>
          {fields.map((f, idx) => (
            <View
              key={idx}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 8,
                borderBottomWidth: idx < fields.length - 1 ? 1 : 0,
                borderBottomColor: gray(0.06),
              }}
            >
              <Text style={{ fontSize: 14, color: gray(0.5), width: 100 }}>{f.label}</Text>
              <Text style={{ fontSize: 14, color: C.text, fontWeight: "500", flex: 1 }}>
                {capitalizeFirstLetterOfString(String(f.value))}
              </Text>
            </View>
          ))}
        </View>
      </div>
    </div>,
    document.body
  );
};

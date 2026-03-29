/* eslint-disable */
import { View, Text, ScrollView, TouchableOpacity } from "react-native-web";
import { useState, useEffect, useRef } from "react";
import { cloneDeep } from "lodash";
import { C, ICONS } from "../styles";
import {
  useSettingsStore,
  useOpenWorkordersStore,
  useInventoryStore,
  useLoginStore,
} from "../stores";
import {
  resolveStatus,
  formatCurrencyDisp,
  gray,
  lightenRGBByPercent,
  capitalizeFirstLetterOfString,
  applyDiscountToWorkorderItem,
  deepEqual,
} from "../utils";
import { WORKORDER_ITEM_PROTO } from "../data";
import { Button_, Image_ } from "../components";
import {
  dbListenToSettings,
  dbListenToInventory,
  dbListenToOpenWorkorders,
  dbSaveOpenWorkorder,
} from "../db_calls_wrapper";

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
  const zIntakeQuickButtons = useSettingsStore((s) => s.settings?.intakeQuickButtons, deepEqual);
  const zWorkorders = useOpenWorkordersStore((state) => state.workorders);
  const zInventory = useInventoryStore((state) => state.inventoryArr);
  const zCurrentUser = useLoginStore((state) => state.currentUser);

  const [sSelectedWorkorderID, _setSelectedWorkorderID] = useState(null);
  const qtyMapRef = useRef({});
  const [sQtyMap, _setQtyMap] = useState({});
  const qtyTimerRef = useRef(null);

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
  let intakeQuickButtons = zIntakeQuickButtons || [];
  // Handle legacy flat format gracefully
  if (intakeQuickButtons.length > 0 && !Array.isArray(intakeQuickButtons[0])) {
    intakeQuickButtons = [];
  }

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
  // Render
  //////////////////////////////////////////////////////////////////////////////

  let customerName = selectedWorkorder
    ? (capitalizeFirstLetterOfString(selectedWorkorder.customerFirst || "") +
       " " +
       capitalizeFirstLetterOfString(selectedWorkorder.customerLast || "")).trim()
    : "";

  let lines = selectedWorkorder?.workorderLines || [];

  return (
    <View style={{ flex: 1, backgroundColor: C.backgroundWhite }}>
      {/* ── Header: workorder dropdown ── */}
      <View style={{ padding: 12, zIndex: 10 }}>
        <WorkorderSelector
          workorders={sortedWorkorders}
          statuses={statuses}
          selectedID={sSelectedWorkorderID}
          onSelect={(id) => _setSelectedWorkorderID(id)}
        />
      </View>

      {/* ── Customer name ── */}
      {selectedWorkorder && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <Text style={{ fontSize: 22, fontWeight: "600", color: C.text }}>
            {customerName || selectedWorkorder.brand || selectedWorkorder.description || "No Name"}
          </Text>
        </View>
      )}

      {/* ── Line items list (grows) ── */}
      <ScrollView style={{ flex: 1, paddingHorizontal: 12 }}>
        {lines.map((line, idx) => {
          let inv = line.inventoryItem || {};
          let name = inv.informalName || inv.formalName || "(unnamed)";
          let price = line.useSalePrice ? (inv.salePrice || inv.price || 0) : (inv.price || 0);
          let effectiveQty = sQtyMap[line.id] !== undefined ? sQtyMap[line.id] : (line.qty || 1);

          return (
            <View
              key={line.id || idx}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 8,
                paddingHorizontal: 10,
                marginBottom: 4,
                backgroundColor: C.listItemWhite,
                borderRadius: 6,
                borderWidth: 1,
                borderColor: gray(0.08),
              }}
            >
              {/* Name */}
              <Text style={{ flex: 1, fontSize: 15, color: C.text }} numberOfLines={1}>
                {name}
              </Text>

              {/* Qty buttons */}
              <Button_
                onPress={() => modifyQty(line, "down")}
                buttonStyle={{ backgroundColor: "transparent", paddingHorizontal: 4 }}
                icon={ICONS.downArrowOrange}
                iconSize={23}
              />
              <Text style={{ fontSize: 16, fontWeight: "600", color: C.text, minWidth: 28, textAlign: "center" }}>
                {effectiveQty}
              </Text>
              <Button_
                onPress={() => modifyQty(line, "up")}
                buttonStyle={{ backgroundColor: "transparent", paddingHorizontal: 4 }}
                icon={ICONS.upArrowOrange}
                iconSize={23}
              />

              {/* Price */}
              <Text style={{ fontSize: 14, color: C.text, fontWeight: "500", minWidth: 70, textAlign: "right" }}>
                {"$" + formatCurrencyDisp(price * effectiveQty)}
              </Text>
            </View>
          );
        })}
        {selectedWorkorder && lines.length === 0 && (
          <Text style={{ fontSize: 14, color: gray(0.4), textAlign: "center", marginTop: 20 }}>
            No items yet. Press a button below to add.
          </Text>
        )}
        {!selectedWorkorder && (
          <Text style={{ fontSize: 14, color: gray(0.4), textAlign: "center", marginTop: 40 }}>
            Select a workorder above to get started.
          </Text>
        )}
      </ScrollView>

      {/* ── Quick buttons container (fixed at bottom) ── */}
      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: gray(0.1),
          backgroundColor: lightenRGBByPercent(C.backgroundWhite, 20),
          paddingVertical: 8,
          paddingHorizontal: 8,
        }}
      >
        {intakeQuickButtons.map((row, rowIdx) => (
          <View
            key={rowIdx}
            style={{
              flexDirection: "row",
              marginBottom: 6,
            }}
          >
            {row.map((btn) => (
              <TouchableOpacity
                key={btn.id}
                onPress={() => handleQuickButtonPress(btn)}
                style={{
                  flex: 1,
                  margin: 3,
                  minHeight: 48,
                  borderWidth: 1,
                  borderColor: C.buttonLightGreenOutline,
                  borderRadius: 8,
                  backgroundColor: C.listItemWhite,
                  alignItems: "center",
                  justifyContent: "center",
                  paddingVertical: 6,
                  paddingHorizontal: 4,
                }}
              >
                <Text
                  style={{ fontSize: 14, textAlign: "center", color: C.text, fontWeight: "500" }}
                  numberOfLines={2}
                >
                  {btn.label || "(unnamed)"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ))}
        {intakeQuickButtons.length === 0 && (
          <Text style={{ fontSize: 13, color: gray(0.35), textAlign: "center", paddingVertical: 12 }}>
            No quick buttons configured. Set them up in Dashboard Admin.
          </Text>
        )}
      </View>
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
    ? `#${selected.workorderNumber || "?"} — ${
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
                  #{wo.workorderNumber || "?"} — {wo.customerFirst || wo.brand || "(no name)"}{" "}
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

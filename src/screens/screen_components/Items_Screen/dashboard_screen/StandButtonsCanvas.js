/*eslint-disable*/
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
} from "react-native-web";
import React, { useState, useRef, useCallback } from "react";
import {
  gray,
  formatCurrencyDisp,
  calculateRunningTotals,
  createNewWorkorder,
  formatWorkorderNumber,
} from "../../../../utils";
import {
  useInventoryStore,
  useLoginStore,
  useOpenWorkordersStore,
  useCurrentCustomerStore,
} from "../../../../stores";
import {
  Button_,
  Image_,
  TextInput_,
} from "../../../../components";
import { cloneDeep } from "lodash";
import { C, Fonts, ICONS } from "../../../../styles";
import { WORKORDER_ITEM_PROTO } from "../../../../data";
import { dbSaveOpenWorkorder } from "../../../../db_calls_wrapper";

const SNAP = 10;
const DEFAULT_BTN_W = 90;
const DEFAULT_BTN_H = 40;

function snapTo(v) {
  return Math.round(v / SNAP) * SNAP;
}

////////////////////////////////////////////////////////////////////////////////
// Canvas Button Card
////////////////////////////////////////////////////////////////////////////////

const CanvasButtonCard = ({
  btn,
  sEditMode,
  isSelected,
  onSelect,
  onPositionChange,
  onLabelChange,
  onDelete,
  onQuickButtonPress,
  containerRef,
}) => {
  const [sIsEditing, _setIsEditing] = useState(false);
  const zInventoryArr = useInventoryStore((state) => state.inventoryArr);
  let invItem = btn.inventoryItemID ? zInventoryArr.find((o) => o.id === btn.inventoryItemID) : null;
  const [sDragging, _setDragging] = useState(false);
  const dragStartRef = useRef(null);
  const didDragRef = useRef(false);

  let w = btn.w || DEFAULT_BTN_W;
  let h = btn.h || DEFAULT_BTN_H;

  function handleMouseDown(e) {
    if (!sEditMode || sIsEditing) return;
    e.preventDefault();
    didDragRef.current = false;
    let container = containerRef.current;
    if (!container) return;
    let rect = container.getBoundingClientRect();
    dragStartRef.current = {
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startX: btn.x || 0,
      startY: btn.y || 0,
      rect,
    };
    _setDragging(true);

    function handleMouseMove(ev) {
      if (!dragStartRef.current) return;
      let { startMouseX, startMouseY, startX, startY, rect: r } = dragStartRef.current;
      let dx = ev.clientX - startMouseX;
      let dy = ev.clientY - startMouseY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didDragRef.current = true;
      let newX = snapTo(startX + dx);
      let newY = snapTo(startY + dy);
      newX = Math.max(0, Math.min(newX, r.width - w));
      newY = Math.max(0, Math.min(newY, r.height - h));
      onPositionChange(btn.id, newX, newY);
    }

    function handleMouseUp() {
      dragStartRef.current = null;
      _setDragging(false);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }

  return (
    <div
      onMouseDown={handleMouseDown}
      onClick={() => {
        if (didDragRef.current) return;
        if (sEditMode) onSelect(btn.id);
        else if (onQuickButtonPress) onQuickButtonPress();
      }}
      style={{
        position: "absolute",
        left: btn.x || 0,
        top: btn.y || 0,
        width: w,
        height: h,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderWidth: isSelected ? 2 : 1,
        borderStyle: "solid",
        borderColor: isSelected ? C.blue : C.buttonLightGreenOutline,
        borderRadius: 8,
        backgroundColor: btn.backgroundColor || C.listItemWhite,
        cursor: sEditMode ? (sDragging ? "grabbing" : "grab") : "pointer",
        opacity: sDragging ? 0.7 : 1,
        boxSizing: "border-box",
        paddingHorizontal: 4,
        paddingVertical: 2,
        userSelect: "none",
      }}
    >
      {/* Delete - edit mode */}
      {sEditMode && !sDragging && (
        <div
          onClick={(e) => { e.stopPropagation(); onDelete(btn.id); }}
          style={{
            position: "absolute",
            top: -6,
            right: -6,
            width: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor: C.lightred,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            zIndex: 3,
          }}
        >
          <Image_ icon={ICONS.trash} size={10} />
        </div>
      )}

      {/* Pencil icon (top-left) - edit mode */}
      {sEditMode && !sDragging && (
        <div
          onClick={(e) => { e.stopPropagation(); _setIsEditing(true); }}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            top: -6,
            left: -6,
            width: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor: gray(0.12),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            zIndex: 3,
          }}
        >
          <Image_ icon={ICONS.editPencil} size={9} />
        </div>
      )}

      {/* Label */}
      {sEditMode && sIsEditing ? (
        <div onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
          <TextInput_
            style={{
              fontSize: btn.fontSize || 11,
              color: btn.textColor || C.text,
              textAlign: "center",
              borderBottomWidth: 1,
              borderBottomColor: gray(0.3),
              paddingVertical: 2,
              width: w - 10,
              outlineWidth: 0,
              outlineStyle: "none",
            }}
            value={btn.label || ""}
            onChangeText={(val) => onLabelChange(btn.id, val)}
            onBlur={() => _setIsEditing(false)}
            autoFocus
            placeholder="Label..."
            placeholderTextColor={gray(0.3)}
          />
        </div>
      ) : (
        <Text
          style={{
            fontSize: btn.fontSize || 11,
            color: btn.textColor || (btn.label ? C.text : gray(0.35)),
            textAlign: "center",
            fontWeight: "500",
          }}
          numberOfLines={2}
        >
          {btn.label || (sEditMode ? "(tap to name)" : "")}
        </Text>
      )}
    </div>
  );
};

////////////////////////////////////////////////////////////////////////////////
// Stand Buttons Canvas Editor
////////////////////////////////////////////////////////////////////////////////

const StandButtonsCanvasEditor = ({
  zSettingsObj,
  handleSettingsFieldChange,
  _setStandEditButtonObj,
  _setShowStandButtonsModal,
}) => {
  const [sEditMode, _setEditMode] = useState(false);
  const [sSelectedBtnId, _setSelectedBtnId] = useState(null);
  const [sSelectedWorkorderID, _setSelectedWorkorderID] = useState(null);
  const [sShowWODropdown, _setShowWODropdown] = useState(false);
  const canvasRef = useRef(null);

  const zWorkorders = useOpenWorkordersStore((state) => state.workorders);
  const zInventory = useInventoryStore((state) => state.inventoryArr);

  let selectedWorkorder = sSelectedWorkorderID
    ? zWorkorders.find((o) => o.id === sSelectedWorkorderID) || null
    : null;

  let salesTaxPercent = zSettingsObj?.salesTaxPercent || 0;
  let totals = selectedWorkorder?.workorderLines?.length > 0
    ? calculateRunningTotals(selectedWorkorder, salesTaxPercent, [], false, !!selectedWorkorder.taxFree)
    : { finalTotal: 0, runningSubtotal: 0, runningTax: 0, runningQty: 0 };

  let allButtons = zSettingsObj?.intakeQuickButtons || [];

  function saveButtons(updated) {
    handleSettingsFieldChange("intakeQuickButtons", updated);
  }

  function handlePositionChange(btnId, x, y) {
    saveButtons(allButtons.map((b) => b.id === btnId ? { ...b, x, y } : b));
  }

  function handleLabelChange(btnId, val) {
    saveButtons(allButtons.map((b) => b.id === btnId ? { ...b, label: val } : b));
  }

  function handleDeleteButton(btnId) {
    if (sSelectedBtnId === btnId) _setSelectedBtnId(null);
    saveButtons(allButtons.filter((b) => b.id !== btnId));
  }

  function handleResizeSelected(axis, delta) {
    if (!sSelectedBtnId) return;
    saveButtons(allButtons.map((b) => {
      if (b.id !== sSelectedBtnId) return b;
      if (axis === "w") return { ...b, w: Math.max(SNAP * 3, (b.w || DEFAULT_BTN_W) + delta) };
      if (axis === "h") return { ...b, h: Math.max(SNAP * 2, (b.h || DEFAULT_BTN_H) + delta) };
      return b;
    }));
  }

  function handleFontSizeSelected(delta) {
    if (!sSelectedBtnId) return;
    saveButtons(allButtons.map((b) => {
      if (b.id !== sSelectedBtnId) return b;
      let newSize = Math.max(6, Math.min(24, (b.fontSize || 11) + delta));
      return { ...b, fontSize: newSize };
    }));
  }

  function handleNewWorkorder() {
    useLoginStore.getState().requireLogin(() => {
      useCurrentCustomerStore.getState().setCustomer(null, false);
      let store = useOpenWorkordersStore.getState();
      store.setWorkorderPreviewID(null);
      let wo = createNewWorkorder({
        startedByFirst: useLoginStore.getState().currentUser?.first,
        startedByLast: useLoginStore.getState().currentUser?.last,
      });
      store.setWorkorder(wo, false);
      _setSelectedWorkorderID(wo.id);
    });
  }

  async function handleQuickButtonPress(btn) {
    if (!selectedWorkorder || !btn.inventoryItemID) return;
    let invItem = (zInventory || []).find((o) => o.id === btn.inventoryItemID);
    if (!invItem) return;
    await dbSaveOpenWorkorder(selectedWorkorder);
    let lines = [...(selectedWorkorder.workorderLines || [])];
    let line = cloneDeep(WORKORDER_ITEM_PROTO);
    line.inventoryItem = invItem;
    line.id = crypto.randomUUID();
    lines.push(line);
    useOpenWorkordersStore.getState().setField("workorderLines", lines, selectedWorkorder.id, true);
  }

  function handleModQty(lineId, direction) {
    if (!selectedWorkorder) return;
    let lines = selectedWorkorder.workorderLines.map((line) => {
      if (line.id !== lineId) return line;
      let newQty = direction === "up" ? line.qty + 1 : Math.max(1, line.qty - 1);
      return { ...line, qty: newQty };
    });
    useOpenWorkordersStore.getState().setField("workorderLines", lines, selectedWorkorder.id, true);
  }

  let woLabel = selectedWorkorder
    ? `#${formatWorkorderNumber(selectedWorkorder.workorderNumber)} - ${selectedWorkorder.customerFirst || selectedWorkorder.brand || "(no name)"} ${selectedWorkorder.customerLast || ""}`.trim()
    : "Select Workorder...";

  return (
    <View style={{ flex: 1, width: "100%", padding: 10, alignItems: "center" }}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8, width: "70%" }}>
        <Text style={{ flex: 1, fontSize: 12, color: gray(0.45) }}>
          {sEditMode ? "Drag buttons freely. They snap to 10px increments." : "Tap a button to add items to the workorder."}
        </Text>

        {/* Resize + Font controls - show when a button is selected in edit mode */}
        {sEditMode && sSelectedBtnId && (
          <View style={{ flexDirection: "row", alignItems: "center", marginLeft: 8, gap: 2 }}>
            <Text style={{ fontSize: 10, color: gray(0.45), marginRight: 4 }}>Size:</Text>
            <TouchableOpacity
              onPress={() => handleResizeSelected("w", -SNAP)}
              style={{ width: 22, height: 22, borderRadius: 4, backgroundColor: gray(0.1), alignItems: "center", justifyContent: "center" }}
            >
              <Text style={{ fontSize: 12, color: C.text, fontWeight: "700" }}>{"\u2190"}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleResizeSelected("w", SNAP)}
              style={{ width: 22, height: 22, borderRadius: 4, backgroundColor: gray(0.1), alignItems: "center", justifyContent: "center" }}
            >
              <Text style={{ fontSize: 12, color: C.text, fontWeight: "700" }}>{"\u2192"}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleResizeSelected("h", -SNAP)}
              style={{ width: 22, height: 22, borderRadius: 4, backgroundColor: gray(0.1), alignItems: "center", justifyContent: "center", marginLeft: 4 }}
            >
              <Text style={{ fontSize: 12, color: C.text, fontWeight: "700" }}>{"\u2191"}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleResizeSelected("h", SNAP)}
              style={{ width: 22, height: 22, borderRadius: 4, backgroundColor: gray(0.1), alignItems: "center", justifyContent: "center" }}
            >
              <Text style={{ fontSize: 12, color: C.text, fontWeight: "700" }}>{"\u2193"}</Text>
            </TouchableOpacity>

            <Text style={{ fontSize: 10, color: gray(0.45), marginLeft: 10, marginRight: 4 }}>Font:</Text>
            <TouchableOpacity
              onPress={() => handleFontSizeSelected(-1)}
              style={{ width: 22, height: 22, borderRadius: 4, backgroundColor: gray(0.1), alignItems: "center", justifyContent: "center" }}
            >
              <Text style={{ fontSize: 12, color: C.text, fontWeight: "700" }}>A-</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 10, color: C.text, minWidth: 16, textAlign: "center" }}>
              {(allButtons.find((b) => b.id === sSelectedBtnId)?.fontSize || 11)}
            </Text>
            <TouchableOpacity
              onPress={() => handleFontSizeSelected(1)}
              style={{ width: 22, height: 22, borderRadius: 4, backgroundColor: gray(0.1), alignItems: "center", justifyContent: "center" }}
            >
              <Text style={{ fontSize: 12, color: C.text, fontWeight: "700" }}>A+</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity
          onPress={() => { _setEditMode(!sEditMode); _setSelectedBtnId(null); }}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 6,
            backgroundColor: sEditMode ? C.green : gray(0.12),
            marginLeft: 8,
          }}
        >
          <Text style={{ fontSize: 11, fontWeight: "600", color: sEditMode ? "white" : C.text }}>
            {sEditMode ? "Done" : "Edit Layout"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Tablet mock frame */}
      <div
        style={{
          width: "70%",
          flex: 1,
          borderWidth: 3,
          borderStyle: "solid",
          borderColor: gray(0.3),
          borderRadius: 20,
          backgroundColor: C.backgroundWhite,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          padding: 12,
          boxSizing: "border-box",
        }}
      >
        {/* Header row: workorder selector + new button + total */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 8,
            gap: 6,
            position: "relative",
          }}
        >
          {/* Workorder selector */}
          <TouchableOpacity
            onPress={() => _setShowWODropdown(!sShowWODropdown)}
            style={{
              flex: 1,
              height: 36,
              borderWidth: 1,
              borderColor: gray(0.15),
              borderRadius: 6,
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 10,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                color: selectedWorkorder ? C.text : gray(0.35),
                flex: 1,
              }}
              numberOfLines={1}
            >
              {woLabel}
            </Text>
            <Image_ icon={ICONS.downChevron} size={10} />
          </TouchableOpacity>

          {/* New workorder button */}
          <TouchableOpacity
            onPress={handleNewWorkorder}
            style={{
              width: 36,
              height: 36,
              borderRadius: 6,
              backgroundColor: C.blue,
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Image_ icon={ICONS.add} size={16} />
          </TouchableOpacity>

          {/* Total price */}
          {selectedWorkorder && (
            <View
              style={{
                height: 36,
                borderRadius: 6,
                backgroundColor: C.green,
                paddingHorizontal: 10,
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Text style={{ fontSize: 13, color: "white", fontWeight: Fonts.weight.textHeavy }}>
                ${formatCurrencyDisp(totals.finalTotal)}
              </Text>
            </View>
          )}

          {/* Workorder dropdown */}
          {sShowWODropdown && (
            <div
              style={{
                position: "absolute",
                top: 40,
                left: 0,
                right: 70,
                maxHeight: 200,
                backgroundColor: "white",
                borderWidth: 1,
                borderStyle: "solid",
                borderColor: gray(0.15),
                borderRadius: 6,
                zIndex: 100,
                overflowY: "auto",
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              }}
            >
              {zWorkorders.map((wo) => (
                <TouchableOpacity
                  key={wo.id}
                  onPress={() => {
                    _setSelectedWorkorderID(wo.id);
                    _setShowWODropdown(false);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    padding: 8,
                    borderBottomWidth: 1,
                    borderBottomColor: gray(0.06),
                    backgroundColor: wo.id === sSelectedWorkorderID ? "rgb(230,240,252)" : "white",
                  }}
                >
                  <Text style={{ fontSize: 12, color: C.text }} numberOfLines={1}>
                    #{formatWorkorderNumber(wo.workorderNumber)} - {wo.customerFirst || wo.brand || "(no name)"} {wo.customerLast || ""}
                  </Text>
                </TouchableOpacity>
              ))}
              {zWorkorders.length === 0 && (
                <Text style={{ fontSize: 12, color: gray(0.4), textAlign: "center", padding: 12 }}>
                  No open workorders
                </Text>
              )}
            </div>
          )}
        </div>

        {/* Scrollable body: line items + quick buttons canvas */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          {/* Line items list */}
          {selectedWorkorder && selectedWorkorder.workorderLines?.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              {selectedWorkorder.workorderLines.map((line) => {
                let inv = line.inventoryItem || {};
                let name = inv.informalName || inv.formalName || "Unknown";
                let lineTotal = (inv.price || 0) * (line.qty || 1);
                return (
                  <div
                    key={line.id}
                    style={{
                      display: "flex",
                      flexDirection: "row",
                      alignItems: "center",
                      paddingVertical: 6,
                      paddingHorizontal: 8,
                      marginBottom: 3,
                      borderWidth: 1,
                      borderStyle: "solid",
                      borderColor: gray(0.1),
                      borderRadius: 6,
                      backgroundColor: "white",
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, color: C.text }} numberOfLines={1}>
                        {name}
                      </Text>
                      <Text style={{ fontSize: 10, color: gray(0.5) }}>
                        ${formatCurrencyDisp(lineTotal)}
                      </Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <TouchableOpacity
                        onPress={() => handleModQty(line.id, "down")}
                        style={{
                          width: 24,
                          height: 24,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Image_ icon={ICONS.downArrowOrange} size={12} />
                      </TouchableOpacity>
                      <View
                        style={{
                          minWidth: 28,
                          height: 24,
                          borderRadius: 4,
                          backgroundColor: gray(0.08),
                          alignItems: "center",
                          justifyContent: "center",
                          marginHorizontal: 2,
                        }}
                      >
                        <Text style={{ fontSize: 12, color: C.text, fontWeight: "600" }}>
                          {line.qty || 1}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => handleModQty(line.id, "up")}
                        style={{
                          width: 24,
                          height: 24,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Image_ icon={ICONS.upArrowOrange} size={12} />
                      </TouchableOpacity>
                    </View>
                  </div>
                );
              })}
            </div>
          )}

          {/* Line items empty state */}
          {selectedWorkorder && (!selectedWorkorder.workorderLines || selectedWorkorder.workorderLines.length === 0) && (
            <div
              style={{
                borderWidth: 1,
                borderStyle: "dashed",
                borderColor: gray(0.15),
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 8,
                paddingVertical: 20,
              }}
            >
              <Text style={{ fontSize: 11, color: gray(0.3) }}>
                Press a button below to add items
              </Text>
            </div>
          )}

          {/* Quick Buttons Canvas */}
          <div
            ref={canvasRef}
            style={{
              flex: 1,
              position: "relative",
              borderTopWidth: 1,
              borderTopStyle: "solid",
              borderTopColor: gray(0.15),
              overflow: "hidden",
              ...(sEditMode ? {
                backgroundImage: `radial-gradient(circle, ${gray(0.12)} 1px, transparent 1px)`,
                backgroundSize: `${SNAP}px ${SNAP}px`,
              } : {}),
            }}
          >
            {allButtons.map((btn) => (
              <CanvasButtonCard
                key={btn.id}
                btn={btn}
                sEditMode={sEditMode}
                isSelected={sSelectedBtnId === btn.id}
                onSelect={_setSelectedBtnId}
                containerRef={canvasRef}
                onPositionChange={handlePositionChange}
                onLabelChange={handleLabelChange}
                onDelete={handleDeleteButton}
                onQuickButtonPress={() => handleQuickButtonPress(btn)}
              />
            ))}

            {allButtons.length === 0 && !sEditMode && (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 12, color: gray(0.35) }}>
                  Search and add items from the panel on the left.
                </Text>
              </View>
            )}
          </div>
        </div>
      </div>
    </View>
  );
};

export { StandButtonsCanvasEditor };

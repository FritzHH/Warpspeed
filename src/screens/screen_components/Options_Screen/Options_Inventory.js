/*eslint-disable*/
import React, { useEffect, useRef, useState } from "react";
import { View, FlatList, Text, TouchableOpacity, ScrollView } from "react-native-web";
import { WORKORDER_ITEM_PROTO, INVENTORY_ITEM_PROTO, QUICK_BUTTON_ITEM_PROTO, QB_DEFAULT_W, QB_DEFAULT_H, QB_SNAP_PCT } from "../../../data";
import { C, COLOR_GRADIENTS, Colors, ICONS } from "../../../styles";

import {
  formatCurrencyDisp,
  gray,
  lightenRGBByPercent,
  log,
  resolveStatus,
  generateEAN13Barcode,
  normalizeBarcode,
  showAlert,
  localStorageWrapper,
} from "../../../utils";
import { workerSearchInventory } from "../../../inventorySearchManager";
import {
  Button,
  Button_,
  Image_,
  ScreenModal,
  StaleBanner,
  TouchableOpacity_,
  TextInput_,
  Tooltip,
} from "../../../components";
import { InventoryItemModalScreen } from "../modal_screens/InventoryItemModalScreen";
import { CustomItemModal } from "../modal_screens/CustomItemModal";
import { cloneDeep } from "lodash";
import {
  useSettingsStore,
  useOpenWorkordersStore,
  useInventoryStore,
  useLoginStore,
} from "../../../stores";
import { dbSaveSettingsField, dbSavePrintObj } from "../../../db_calls_wrapper";
import { labelPrintBuilder } from "../../../shared/labelPrintBuilder";

function getQuickButtonFontSize(text, baseFontSize) {
  let len = (text || "").length;
  if (len <= 15) return baseFontSize;
  return Math.max(7, Math.round(baseFontSize - (len - 15) * 0.5));
}

/** Normalize legacy string IDs to QUICK_BUTTON_ITEM_PROTO objects */
function normalizeItemEntry(entry, idx) {
  if (typeof entry === "string") {
    return { ...QUICK_BUTTON_ITEM_PROTO, inventoryItemID: entry, x: (idx % 6) * (QB_DEFAULT_W + QB_SNAP_PCT), y: Math.floor(idx / 6) * (QB_DEFAULT_H + QB_SNAP_PCT) };
  }
  return entry;
}

const SNAP_PCT = QB_SNAP_PCT;
const DEFAULT_ITEM_W = QB_DEFAULT_W;
const DEFAULT_ITEM_H = QB_DEFAULT_H;
function snapTo(v) { return Math.round(v / SNAP_PCT) * SNAP_PCT; }

/** Convert pixel-based item to percentage-based using reference canvas dimensions */
function migrateItemToPercent(item, refW, refH) {
  return {
    ...item,
    x: Math.min(100, Math.round((item.x / refW) * 100)),
    y: Math.min(100, Math.round((item.y / refH) * 100)),
    w: Math.max(DEFAULT_ITEM_W, Math.min(100, Math.round((item.w / refW) * 100))),
    h: Math.max(DEFAULT_ITEM_H, Math.min(100, Math.round((item.h / refH) * 100))),
  };
}

////////////////////////////////////////////////////////////////////////////////
// Quick Item Canvas Card
////////////////////////////////////////////////////////////////////////////////
const QuickItemCanvasCard = ({
  itemObj,
  invItem,
  sEditMode,
  isSelected,
  onSelect,
  onPositionChange,
  onPress,
  onRightClick,
  onInfoPress,
  onLabelChange,
  containerRef,
}) => {
  const [sDragging, _setDragging] = useState(false);
  const [sIsEditing, _setIsEditing] = useState(false);
  const [sEditText, _setEditText] = useState("");
  const [sShowActions, _setShowActions] = useState(false);
  const [sShowPrintPicker, _setShowPrintPicker] = useState(false);
  const [sPrintSuccess, _setPrintSuccess] = useState(false);
  const dragStartRef = useRef(null);
  const didDragRef = useRef(false);

  function handlePrintWithTemplate(slug) {
    if (!invItem) return;
    let printerID = localStorageWrapper.getItem("selectedLabelPrinterID") || "";
    if (!printerID) {
      showAlert({ title: "No Label Printer", message: "Select a label printer for this device in Settings.", btn1Text: "OK" });
      return;
    }
    let settings = useSettingsStore.getState().settings;
    let template = settings?.labelTemplates?.[slug];
    let printJob = labelPrintBuilder.zplLabel(slug, { ...invItem, storeDisplayName: settings?.storeInfo?.displayName || "" }, 1, template);
    dbSavePrintObj(printJob, printerID);
    _setShowPrintPicker(false);
    _setPrintSuccess(true);
    setTimeout(() => _setPrintSuccess(false), 1500);
  }

  function handlePrintClick() {
    if (!invItem) return;
    let settings = useSettingsStore.getState().settings;
    let allTemplates = settings?.labelTemplates || {};
    let templateEntries = Object.entries(allTemplates);
    let quickPrintSlugs = settings?.quickPrintLayouts || [];
    let qpEntries = templateEntries.filter(([slug]) => quickPrintSlugs.includes(slug));
    if (qpEntries.length === 0) {
      showAlert({ title: "No Quick Print Layouts", message: "Mark layouts as Quick Print in the Label Designer.", btn1Text: "OK" });
      return;
    }
    if (qpEntries.length === 1) {
      handlePrintWithTemplate(qpEntries[0][0]);
    } else {
      _setShowPrintPicker(true);
    }
  }

  let w = itemObj.w || DEFAULT_ITEM_W;
  let h = itemObj.h || DEFAULT_ITEM_H;
  let defaultName = invItem ? (invItem.informalName || invItem.formalName || "Unknown") : "(not found)";
  let name = itemObj.label || defaultName;
  let price = invItem ? formatCurrencyDisp(invItem.price) : "";

  function handleMouseDown(e) {
    if (!sEditMode) return;
    e.preventDefault();
    didDragRef.current = false;
    let container = containerRef.current;
    if (!container) return;
    let rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    dragStartRef.current = {
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startX: itemObj.x || 0,
      startY: itemObj.y || 0,
      rectW: rect.width,
      rectH: rect.height,
    };
    _setDragging(true);

    function handleMouseMove(ev) {
      if (!dragStartRef.current) return;
      let { startMouseX, startMouseY, startX, startY, rectW, rectH } = dragStartRef.current;
      let dx = ev.clientX - startMouseX;
      let dy = ev.clientY - startMouseY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didDragRef.current = true;
      let dxPct = (dx / rectW) * 100;
      let dyPct = (dy / rectH) * 100;
      let newX = snapTo(startX + dxPct);
      let newY = snapTo(startY + dyPct);
      newX = Math.max(0, Math.min(newX, 100 - w));
      newY = Math.max(0, Math.min(newY, 100 - h));
      onPositionChange(itemObj.inventoryItemID, newX, newY);
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
        if (sEditMode) onSelect(itemObj.inventoryItemID);
        else if (onPress) onPress();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        if (onRightClick) onRightClick(itemObj.inventoryItemID);
      }}
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
        borderWidth: isSelected ? 2 : 1,
        borderStyle: "solid",
        borderColor: isSelected ? C.blue : C.buttonLightGreenOutline,
        borderRadius: 8,
        backgroundColor: C.buttonLightGreenOutline,
        cursor: sEditMode ? (sDragging ? "grabbing" : "grab") : "pointer",
        opacity: sDragging ? 0.7 : 1,
        boxSizing: "border-box",
        paddingHorizontal: 4,
        paddingTop: 2,
        paddingBottom: sEditMode ? 2 : (sShowActions ? 20 : 2),
        userSelect: "none",
        overflow: "hidden",
      }}
    >
      {/* Pencil icon (top-left) - toggle label editing */}
      {sEditMode && !sDragging && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            if (sIsEditing) {
              let val = sEditText.trim();
              if (onLabelChange) onLabelChange(itemObj.inventoryItemID, val === defaultName ? "" : val);
              _setIsEditing(false);
            } else {
              _setEditText(itemObj.label || defaultName);
              _setIsEditing(true);
            }
          }}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            top: -6,
            left: -6,
            width: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor: sIsEditing ? C.green : gray(0.12),
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

      {sEditMode && sIsEditing ? (
        <div onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
          <textarea
            style={{
              fontSize: itemObj.fontSize || 10,
              color: C.text,
              textAlign: "center",
              borderWidth: 0,
              borderBottomWidth: 1,
              borderBottomColor: gray(0.3),
              borderBottomStyle: "solid",
              paddingTop: 2,
              paddingBottom: 2,
              width: "90%",
              outline: "none",
              resize: "none",
              overflow: "hidden",
              fontFamily: "inherit",
              fontWeight: "500",
              backgroundColor: "transparent",
              lineHeight: ((itemObj.fontSize || 10) + 2) + "px",
            }}
            value={sEditText}
            autoFocus
            rows={1}
            ref={(el) => {
              if (el) {
                el.style.height = "auto";
                el.style.height = el.scrollHeight + "px";
              }
            }}
            onChange={(e) => {
              _setEditText(e.target.value);
              let el = e.target;
              el.style.height = "auto";
              el.style.height = el.scrollHeight + "px";
            }}
            onBlur={(e) => {
              // Don't save on blur - pencil toggle handles save
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                _setIsEditing(false);
              }
            }}
          />
        </div>
      ) : (
        <>
          <Text
            style={{
              fontSize: itemObj.fontSize || 10,
              color: invItem ? C.text : gray(0.35),
              textAlign: "center",
              fontWeight: "500",
              lineHeight: (itemObj.fontSize || 10) + 2,
            }}
            numberOfLines={2}
          >
            {name}
          </Text>
          {!!price && (
            <Text style={{ fontSize: Math.min(13, Math.max(7, (itemObj.fontSize || 10) - 1)), color: gray(0.45), textAlign: "center", marginTop: 1 }}>
              ${price}
            </Text>
          )}
        </>
      )}
      {!sEditMode && (
        <>
          {/* Caret toggle */}
          <div
            onClick={(e) => { e.stopPropagation(); _setShowActions((v) => !v); }}
            onMouseDown={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              bottom: sShowActions ? 18 : 1,
              right: 1,
              width: 14,
              height: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              zIndex: 4,
            }}
          >
            <Text style={{ fontSize: 8, color: gray(0.4), lineHeight: 14 }}>{sShowActions ? "\u25BC" : "\u25B6"}</Text>
          </div>
          {/* Action row */}
          {sShowActions && (
            <div
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onContextMenu={(e) => e.stopPropagation()}
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                display: "flex",
                flexDirection: "row",
                justifyContent: "space-evenly",
                alignItems: "center",
                borderTopWidth: 1,
                borderTopStyle: "solid",
                borderTopColor: gray(0.15),
                height: 18,
                backgroundColor: C.buttonLightGreenOutline,
              }}
            >
              <div
                onClick={() => { if (invItem && onInfoPress) onInfoPress(); }}
                style={{ cursor: "pointer", padding: 2, display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <Image_ icon={ICONS.info} size={11} />
              </div>
              {(useLoginStore.getState().currentUser?.permissions?.level || 0) >= 4 && (
                <div
                  onClick={() => { if (onRightClick) onRightClick(itemObj.inventoryItemID); _setShowActions(false); }}
                  style={{ cursor: "pointer", padding: 2, display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  <Image_ icon={ICONS.editPencil} size={11} />
                </div>
              )}
              <div
                onClick={() => handlePrintClick()}
                style={{ cursor: "pointer", padding: 2, display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <Image_ icon={ICONS.print} size={8} />
              </div>
            </div>
          )}
          {/* Print layout picker */}
          {sShowPrintPicker && (() => {
            let settings = useSettingsStore.getState().settings;
            let allTemplates = settings?.labelTemplates || {};
            let templateEntries = Object.entries(allTemplates);
            let quickPrintSlugs = settings?.quickPrintLayouts || [];
            let qpEntries = templateEntries.filter(([slug]) => quickPrintSlugs.includes(slug));
            return (
              <div
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                style={{
                  position: "absolute",
                  bottom: 20,
                  left: 0,
                  zIndex: 10,
                  backgroundColor: "white",
                  borderRadius: 6,
                  border: "1px solid " + gray(0.2),
                  boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                  minWidth: 120,
                  overflow: "hidden",
                }}
              >
                {qpEntries.map(([slug, template]) => (
                  <div
                    key={slug}
                    onClick={() => handlePrintWithTemplate(slug)}
                    style={{
                      padding: "5px 8px",
                      cursor: "pointer",
                      fontSize: 10,
                      color: C.text,
                      borderBottom: "1px solid " + gray(0.1),
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = gray(0.05); }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "white"; }}
                  >
                    {template.name}
                  </div>
                ))}
                <div
                  onClick={() => _setShowPrintPicker(false)}
                  style={{ padding: "4px 8px", cursor: "pointer", fontSize: 9, color: gray(0.5), textAlign: "center" }}
                >
                  Cancel
                </div>
              </div>
            );
          })()}
          {/* Print success flash */}
          {sPrintSuccess && (
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(88,145,65,0.15)", borderRadius: 8, zIndex: 5, pointerEvents: "none" }}>
              <Text style={{ fontSize: 9, color: C.green, fontWeight: "600" }}>Sent!</Text>
            </div>
          )}
        </>
      )}
    </div>
  );
};

////////////////////////////////////////////////////////////////////////////////
// Quick Item Canvas (wraps the canvas area + edit banner)
////////////////////////////////////////////////////////////////////////////////
const QuickItemCanvas = ({
  buttonObj,
  zInventoryArr,
  zQuickItemButtons,
  onItemPress,
  onInfoPress,
  forceEditMode,
  onForceEditConsumed,
}) => {
  const [sEditMode, _setEditMode] = useState(false);

  if (forceEditMode && !sEditMode) {
    _setEditMode(true);
    if (onForceEditConsumed) onForceEditConsumed();
  }
  const [sSelectedItemId, _setSelectedItemId] = useState(null);
  const canvasRef = useRef(null);
  const dbSaveTimerRef = useRef(null);
  const migratedRef = useRef(false);

  // Normalize items (backward compat: string IDs -> objects)
  let rawItems = (buttonObj.items || []).map(normalizeItemEntry);

  // One-time migration: convert old pixel-based positions to percentages
  if (!migratedRef.current && !buttonObj._pctLayout && rawItems.length > 0) {
    migratedRef.current = true;
    let rect = canvasRef.current?.getBoundingClientRect();
    let refW = (rect?.width > 0 ? rect.width : 900);
    let refH = (rect?.height > 0 ? rect.height : 500);
    let migrated = rawItems.map((it) => migrateItemToPercent(it, refW, refH));
    rawItems = migrated;
    let updatedButtons = (zQuickItemButtons || []).map((b) =>
      b.id === buttonObj.id ? { ...b, items: migrated, _pctLayout: true } : b
    );
    useSettingsStore.getState().setField("quickItemButtons", updatedButtons, false);
    dbSaveSettingsField("quickItemButtons", updatedButtons);
  }

  function findInvItem(inventoryItemID) {
    return (zInventoryArr || []).find((i) => i.id === inventoryItemID);
  }

  function saveItems(updatedItems) {
    // Update store immediately without DB write (keeps drag smooth)
    let updatedButtons = (zQuickItemButtons || []).map((b) =>
      b.id === buttonObj.id ? { ...b, items: updatedItems } : b
    );
    useSettingsStore.getState().setField("quickItemButtons", updatedButtons, false);
    // Debounce the actual DB save
    if (dbSaveTimerRef.current) clearTimeout(dbSaveTimerRef.current);
    dbSaveTimerRef.current = setTimeout(() => {
      dbSaveSettingsField("quickItemButtons", useSettingsStore.getState().settings?.quickItemButtons);
    }, 500);
  }

  function handlePositionChange(invItemID, x, y) {
    saveItems(rawItems.map((it) => it.inventoryItemID === invItemID ? { ...it, x, y } : it));
  }

  function handleLabelChange(invItemID, label) {
    let updatedItems = rawItems.map((it) => it.inventoryItemID === invItemID ? { ...it, label } : it);
    let updatedButtons = (zQuickItemButtons || []).map((b) =>
      b.id === buttonObj.id ? { ...b, items: updatedItems } : b
    );
    useSettingsStore.getState().setField("quickItemButtons", updatedButtons, false);
    dbSaveSettingsField("quickItemButtons", updatedButtons);
  }

  function handleDeleteItem(invItemID) {
    if (sSelectedItemId === invItemID) _setSelectedItemId(null);
    saveItems(rawItems.filter((it) => it.inventoryItemID !== invItemID));
  }

  function handleResizeSelected(axis, delta) {
    if (!sSelectedItemId) return;
    saveItems(rawItems.map((it) => {
      if (it.inventoryItemID !== sSelectedItemId) return it;
      if (axis === "w") return { ...it, w: Math.max(SNAP_PCT * 3, (it.w || DEFAULT_ITEM_W) + delta) };
      if (axis === "h") return { ...it, h: Math.max(SNAP_PCT * 2, (it.h || DEFAULT_ITEM_H) + delta) };
      return it;
    }));
  }

  function handleFontSizeSelected(delta) {
    if (!sSelectedItemId) return;
    saveItems(rawItems.map((it) => {
      if (it.inventoryItemID !== sSelectedItemId) return it;
      let newSize = Math.max(6, Math.min(20, (it.fontSize || 10) + delta));
      return { ...it, fontSize: newSize };
    }));
  }

  return (
    <View style={{ flex: 1 }}>
      {/* Edit banner */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: 4,
          paddingHorizontal: 6,
          minHeight: 32,
        }}
      >
        <Text style={{ flex: 1, fontSize: 11, color: gray(0.45) }}>
          {sEditMode ? "Drag items freely. Snap to grid." : ""}
        </Text>

        {/* Resize + Font controls */}
        {sEditMode && sSelectedItemId && (
          <View style={{ flexDirection: "row", alignItems: "center", marginRight: 6, gap: 2 }}>
            <Text style={{ fontSize: 10, color: gray(0.45), marginRight: 4 }}>Size:</Text>
            {[
              { axis: "w", delta: -SNAP_PCT, label: "\u2190" },
              { axis: "w", delta: SNAP_PCT, label: "\u2192" },
              { axis: "h", delta: -SNAP_PCT, label: "\u2191" },
              { axis: "h", delta: SNAP_PCT, label: "\u2193" },
            ].map((btn, i) => (
              <TouchableOpacity
                key={i}
                onPress={() => handleResizeSelected(btn.axis, btn.delta)}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 4,
                  backgroundColor: gray(0.1),
                  alignItems: "center",
                  justifyContent: "center",
                  marginLeft: i === 2 ? 4 : 0,
                }}
              >
                <Text style={{ fontSize: 12, color: C.text, fontWeight: "700" }}>{btn.label}</Text>
              </TouchableOpacity>
            ))}

            <Text style={{ fontSize: 10, color: gray(0.45), marginLeft: 10, marginRight: 4 }}>Font:</Text>
            <TouchableOpacity
              onPress={() => handleFontSizeSelected(-1)}
              style={{ width: 22, height: 22, borderRadius: 4, backgroundColor: gray(0.1), alignItems: "center", justifyContent: "center" }}
            >
              <Text style={{ fontSize: 12, color: C.text, fontWeight: "700" }}>A-</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 10, color: C.text, minWidth: 16, textAlign: "center" }}>
              {(rawItems.find((it) => it.inventoryItemID === sSelectedItemId)?.fontSize || 10)}
            </Text>
            <TouchableOpacity
              onPress={() => handleFontSizeSelected(1)}
              style={{ width: 22, height: 22, borderRadius: 4, backgroundColor: gray(0.1), alignItems: "center", justifyContent: "center" }}
            >
              <Text style={{ fontSize: 12, color: C.text, fontWeight: "700" }}>A+</Text>
            </TouchableOpacity>
          </View>
        )}

      </View>

      {/* Canvas */}
      <div
        ref={canvasRef}
        style={{
          flex: 1,
          position: "relative",
          overflow: "hidden",
          borderRadius: 6,
          minHeight: 200,
          ...(sEditMode ? {
            backgroundImage: `radial-gradient(circle, ${gray(0.12)} 1px, transparent 1px)`,
            backgroundSize: `${SNAP_PCT}% ${SNAP_PCT}%`,
          } : {}),
        }}
      >
        {rawItems.map((itemObj) => {
          let invItem = findInvItem(itemObj.inventoryItemID);
          return (
            <QuickItemCanvasCard
              key={itemObj.inventoryItemID}
              itemObj={itemObj}
              invItem={invItem}
              sEditMode={sEditMode}
              isSelected={sSelectedItemId === itemObj.inventoryItemID}
              onSelect={_setSelectedItemId}
              containerRef={canvasRef}
              onPositionChange={handlePositionChange}
              onPress={() => invItem && onItemPress(invItem)}
              onInfoPress={() => invItem && onInfoPress(invItem)}
              onRightClick={(id) => {
                if (sEditMode) {
                  _setEditMode(false);
                  _setSelectedItemId(null);
                  dbSaveSettingsField("quickItemButtons", useSettingsStore.getState().settings?.quickItemButtons);
                } else {
                  _setEditMode(true);
                  _setSelectedItemId(id);
                }
              }}
              onLabelChange={handleLabelChange}
            />
          );
        })}

        {/* Delete X overlay for selected item in edit mode */}
        {sEditMode && sSelectedItemId && (() => {
          let sel = rawItems.find((it) => it.inventoryItemID === sSelectedItemId);
          if (!sel) return null;
          return (
            <div
              onClick={() => handleDeleteItem(sSelectedItemId)}
              style={{
                position: "absolute",
                left: `calc(${(sel.x || 0) + (sel.w || DEFAULT_ITEM_W)}% - 8px)`,
                top: `calc(${(sel.y || 0)}% - 6px)`,
                width: 16,
                height: 16,
                borderRadius: 8,
                backgroundColor: C.lightred,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                zIndex: 10,
              }}
            >
              <Text style={{ fontSize: 10, color: "white", fontWeight: "700", lineHeight: 16 }}>{"\u00D7"}</Text>
            </div>
          );
        })()}

        {rawItems.length === 0 && (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60 }}>
            <Text style={{ fontSize: 13, color: gray(0.4) }}>No items in this button</Text>
          </View>
        )}
      </div>
    </View>
  );
};

export function InventoryComponent({}) {
  // store setters ///////////////////////////////////////////////////////////////

  // store getters //////////////////////////////////////////////////////////////
  const zQuickItemButtons = useSettingsStore(
    (state) => state.settings?.quickItemButtons
  );
  const zOpenWorkorderID = useOpenWorkordersStore(
    (state) => state.openWorkorderID
  );
  const zInventoryArr = useInventoryStore((state) => state.inventoryArr);
  const zOpenWorkorder = useOpenWorkordersStore((state) => {
    const id = state.openWorkorderID;
    return id ? state.workorders.find((o) => o.id === id) : null;
  });
  const zStatuses = useSettingsStore((state) => state.settings?.statuses);
  const isInventoryLocked =
    resolveStatus(zOpenWorkorder?.status, zStatuses)?.label?.toLowerCase() === "done & paid";

  // Check if all required data is loaded
  const isDataLoaded = zQuickItemButtons && zInventoryArr?.length > 0;

  ///////////////////////////////////////////////////////////////////////
  const [sSearchTerm, _setSearchTerm] = React.useState("");
  const [sSearchResults, _setSearchResults] = React.useState([]);
  const [sModalItem, _setModalItem] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [sCurrentParentID, _setCurrentParentID] = useState(null);
  const [sMenuPath, _setMenuPath] = useState([]);
  const [sSelectedButtonID, _setSelectedButtonID] = useState(null);
  const [sCustomItemModal, _setCustomItemModal] = useState(null); // "labor" | "part" | null
  const [sForceEditMode, _setForceEditMode] = useState(false);
  const [sListPrintPickerID, _setListPrintPickerID] = useState(null);
  const [sListPrintSuccessID, _setListPrintSuccessID] = useState(null);
  const barcodeModalTimerRef = useRef(null);

  // Timeout to batch all store updates and reduce re-renders
  useEffect(() => {
    const timer = setTimeout(() => setIsReady(true), 50);
    return () => clearTimeout(timer);
  }, []);

  // Auto-fire "common" button on mount once data is loaded
  const hasAutoFiredRef = useRef(false);
  useEffect(() => {
    if (!isDataLoaded || hasAutoFiredRef.current) return;
    let commonBtn = zQuickItemButtons.find((b) => b.id === "common");
    if (commonBtn) {
      hasAutoFiredRef.current = true;
      handleQuickButtonPress(commonBtn);
    }
  }, [isDataLoaded]);
  ///////////////////////////////////////////////////////////////////////////
  ///////////////////////////////////////////////////////////////////////////

  function findInventoryItem(barcode) {
    let item = zInventoryArr.find((i) => i.id === barcode);
    if (item) return item;
    return zInventoryArr.find((i) => (i.barcodes || []).includes(barcode));
  }

  function search(searchTerm) {
    _setSearchTerm(searchTerm);
    if (!searchTerm || searchTerm.length === 0) {
      _setSearchResults([]);
      return;
    }
    if (searchTerm.length < 2) return;
    workerSearchInventory(searchTerm, (results) => _setSearchResults(results));
  }

  // Search function (now called by debounced TextInput_)
  const handleSearch = (searchTerm) => {
    _setSelectedButtonID(null);
    if (!searchTerm || searchTerm.length === 0) {
      _setSearchResults([]);
      return;
    }
    if (searchTerm.length < 2) return;
    workerSearchInventory(searchTerm, (results) => {
      _setSearchResults(results);
      // Auto-open create modal when a 12 or 13-digit barcode is entered and not found
      if (barcodeModalTimerRef.current) clearTimeout(barcodeModalTimerRef.current);
      if (/^\d{12,13}$/.test(searchTerm) && results.length === 0) {
        barcodeModalTimerRef.current = setTimeout(() => {
          let newItem = cloneDeep(INVENTORY_ITEM_PROTO);
          let barcode = normalizeBarcode(searchTerm) || generateEAN13Barcode();
          newItem.id = barcode;
          newItem.primaryBarcode = barcode;
          _setModalItem(newItem);
        }, 1500);
      }
    });
  };

  function handleQuickButtonPress(buttonObj) {
    // Intercept $LABOR and $PART buttons
    if (buttonObj.id === "labor" || buttonObj.id === "part") {
      const openWorkorder = useOpenWorkordersStore.getState().getOpenWorkorder();
      if (!openWorkorder) return;
      const statuses = useSettingsStore.getState().settings?.statuses;
      if (resolveStatus(openWorkorder.status, statuses)?.label?.toLowerCase() === "done & paid") return;
      _setCustomItemModal(buttonObj.id);
      return;
    }

    let children = zQuickItemButtons.filter(
      (b) => b.parentID === buttonObj.id
    );
    let hasChildren = children.length > 0;

    // Resolve inventory items from IDs (handle both legacy string IDs and new objects)
    let items = [];
    buttonObj.items?.forEach((entry) => {
      let id = typeof entry === "string" ? entry : entry.inventoryItemID;
      let item = findInventoryItem(id);
      if (item) items.push(item);
    });
    let hasItems = items.length > 0;

    if (hasChildren) {
      // Toggle off if clicking the already-active root button
      if (!buttonObj.parentID && sMenuPath.length > 0 && sMenuPath[0].id === buttonObj.id) {
        _setCurrentParentID(null);
        _setMenuPath([]);
        _setSelectedButtonID(null);
        _setSearchResults([]);
        _setSearchTerm("");
        return;
      }
      // Collapse up one level if clicking the active sub-button
      if (buttonObj.parentID && sMenuPath.some((crumb) => crumb.id === buttonObj.id)) {
        let idx = sMenuPath.findIndex((crumb) => crumb.id === buttonObj.id);
        let newPath = sMenuPath.slice(0, idx);
        let newParentID;
        if (newPath.length === 0) {
          newParentID = sMenuPath[0].id;
          _setCurrentParentID(newParentID);
          _setMenuPath([sMenuPath[0]]);
        } else {
          newParentID = newPath[newPath.length - 1].id;
          _setCurrentParentID(newParentID);
          _setMenuPath(newPath);
        }
        // Re-select the parent so its canvas items stay visible
        let parentBtn = (zQuickItemButtons || []).find((b) => b.id === newParentID);
        if (parentBtn?.items?.length > 0) {
          _setSelectedButtonID(parentBtn.id);
        } else {
          _setSelectedButtonID(null);
        }
        _setSearchResults([]);
        return;
      }
      // Button has children — show them as wrapping buttons in right panel
      if (!buttonObj.parentID) {
        // Root button: start a fresh menu path
        _setMenuPath([{ id: buttonObj.id, name: buttonObj.name }]);
      } else {
        // Sub-button with its own children: drill deeper
        _setMenuPath((prev) => [
          ...prev,
          { id: buttonObj.id, name: buttonObj.name },
        ]);
      }
      _setCurrentParentID(buttonObj.id);

      if (hasItems) {
        _setSelectedButtonID(buttonObj.id);
        _setSearchResults(items);
      } else {
        _setSelectedButtonID(null);
        _setSearchResults([]);
      }
    } else {
      // Leaf button (no children) — toggle selection
      if (sSelectedButtonID === buttonObj.id) {
        // Deselecting child — re-select parent if it has items
        let parentBtn = buttonObj.parentID ? (zQuickItemButtons || []).find((b) => b.id === buttonObj.parentID) : null;
        if (parentBtn) {
          let parentItems = [];
          parentBtn.items?.forEach((entry) => {
            let id = typeof entry === "string" ? entry : entry.inventoryItemID;
            let found = findInventoryItem(id);
            if (found) parentItems.push(found);
          });
          _setSelectedButtonID(parentBtn.id);
          _setSearchResults(parentItems);
        } else {
          _setSelectedButtonID(null);
          _setSearchResults([]);
        }
      } else {
        _setSelectedButtonID(buttonObj.id);
        _setSearchResults(items);
      }
      // Only clear sub-menu context if this is a root-level button
      if (!buttonObj.parentID) {
        _setCurrentParentID(null);
        _setMenuPath([]);
      }
    }
    _setSearchTerm("");
  }

  function handleBackPress() {
    let path = [...sMenuPath];
    path.pop();

    if (path.length === 0) {
      // Return to base state — no sub-menu open
      _setCurrentParentID(null);
      _setMenuPath([]);
      _setSelectedButtonID(null);
      _setSearchResults([]);
    } else {
      let newParentID = path[path.length - 1].id;
      _setCurrentParentID(newParentID);
      _setMenuPath(path);
      // Show parent button's items if it has any
      let parentButton = zQuickItemButtons.find((b) => b.id === newParentID);
      let items = [];
      parentButton?.items?.forEach((entry) => {
        let id = typeof entry === "string" ? entry : entry.inventoryItemID;
        let item = zInventoryArr.find((i) => i.id === id);
        if (item) items.push(item);
      });
      if (items.length > 0) {
        _setSelectedButtonID(newParentID);
        _setSearchResults(items);
      } else {
        _setSelectedButtonID(null);
        _setSearchResults([]);
      }
    }
    _setSearchTerm("");
  }

  function inventoryItemSelected(item) {
    console.log("inventoryItemSelected:", item?.formalName, item?.id);
    const openWorkorder = useOpenWorkordersStore.getState().getOpenWorkorder();
    if (openWorkorder) {
      const statuses = useSettingsStore.getState().settings?.statuses;
      if (resolveStatus(openWorkorder.status, statuses)?.label?.toLowerCase() === "done & paid") return;
    }
    if (!openWorkorder) {
      console.log("  -> no open workorder, opening modal, sModalItem was:", sModalItem?.id);
      _setModalItem({ ...item });
      return;
    }
    useLoginStore.getState().requireLogin(() => {
      console.log("  -> adding to workorder:", openWorkorder.id);
      let workorderLines = openWorkorder.workorderLines;
      if (!workorderLines) workorderLines = [];
      const existingIndex = workorderLines.findIndex((l) => l.inventoryItem?.id === item.id);
      if (existingIndex !== -1) {
        workorderLines = cloneDeep(workorderLines);
        workorderLines[existingIndex].qty = (workorderLines[existingIndex].qty || 1) + 1;
      } else {
        let lineItem = cloneDeep(WORKORDER_ITEM_PROTO);
        const { _score, ...cleanItem } = item;
        lineItem.inventoryItem = cleanItem;
        lineItem.id = crypto.randomUUID();
        workorderLines = [...workorderLines, lineItem];
      }
      useOpenWorkordersStore
        .getState()
        .setField("workorderLines", workorderLines);

      // auto customer note
      const autoNoteTexts = useSettingsStore.getState().settings?.autoCustomerNoteTexts || [];
      const autoNote = autoNoteTexts.find((n) => n.inventoryItemID === item.id);
      if (autoNote && autoNote.text) {
        let customerNotes = openWorkorder.customerNotes || [];
        const alreadyHasNote = customerNotes.some((n) => n.autoNoteItemID === item.id);
        if (!alreadyHasNote) {
          let currentUser = useLoginStore.getState().currentUser;
          let userName = currentUser
            ? "(" + currentUser.first + " " + (currentUser.last?.[0] || "") + ")  "
            : "(Auto)";
          customerNotes = [
            ...customerNotes,
            {
              name: userName,
              userID: currentUser?.id || "",
              value: autoNote.text,
              id: crypto.randomUUID(),
              autoNoteItemID: item.id,
            },
          ];
          useOpenWorkordersStore.getState().setField("customerNotes", customerNotes);
        }
      }
    });
  }

  function handleInventoryInfoPress(item) {
    console.log("handleInventoryInfoPress:", item?.formalName, item?.id);
    _setModalItem({ ...item });
  }

  function handleListPrintClick(item) {
    if (!item) return;
    let settings = useSettingsStore.getState().settings;
    let allTemplates = settings?.labelTemplates || {};
    let templateEntries = Object.entries(allTemplates);
    let quickPrintSlugs = settings?.quickPrintLayouts || [];
    let qpEntries = templateEntries.filter(([slug]) => quickPrintSlugs.includes(slug));
    if (qpEntries.length === 0) {
      showAlert({ title: "No Quick Print Layouts", message: "Mark layouts as Quick Print in the Label Designer.", btn1Text: "OK" });
      return;
    }
    if (qpEntries.length === 1) {
      handleListPrintWithTemplate(qpEntries[0][0], item);
    } else {
      _setListPrintPickerID(item.id);
    }
  }

  function handleListPrintWithTemplate(slug, item) {
    if (!item) return;
    let printerID = localStorageWrapper.getItem("selectedLabelPrinterID") || "";
    if (!printerID) {
      showAlert({ title: "No Label Printer", message: "Select a label printer for this device in Settings.", btn1Text: "OK" });
      return;
    }
    let settings = useSettingsStore.getState().settings;
    let template = settings?.labelTemplates?.[slug];
    let printJob = labelPrintBuilder.zplLabel(slug, { ...item, storeDisplayName: settings?.storeInfo?.displayName || "" }, 1, template);
    dbSavePrintObj(printJob, printerID);
    _setListPrintPickerID(null);
    _setListPrintSuccessID(item.id);
    setTimeout(() => _setListPrintSuccessID(null), 1500);
  }

  function handleCustomItemSave(lineItem) {
    const openWorkorder = useOpenWorkordersStore.getState().getOpenWorkorder();
    if (!openWorkorder) return;
    useLoginStore.getState().requireLogin(() => {
      let workorderLines = openWorkorder.workorderLines || [];
      workorderLines = [...workorderLines, lineItem];
      useOpenWorkordersStore.getState().setField("workorderLines", workorderLines);
    });
  }

  function clearSearch() {
    _setSearchResults([]);
    _setSearchTerm("");
    _setCurrentParentID(null);
    _setMenuPath([]);
    _setSelectedButtonID(null);
  }

  //////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////

  // Computed: children of current sub-menu level
  let currentChildren = sCurrentParentID
    ? (zQuickItemButtons || []).filter(
        (b) => b.parentID === sCurrentParentID
      )
    : [];
  // Prepend the active sub-menu button so the user can press to go up (skip root-level buttons)
  if (sCurrentParentID) {
    let activeBtn = (zQuickItemButtons || []).find((b) => b.id === sCurrentParentID);
    if (activeBtn && activeBtn.parentID) currentChildren = [activeBtn, ...currentChildren];
  }

  // Show loading state until all data is ready and component is ready
  if (!isDataLoaded || !isReady) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: C.listItemWhite,
        }}
      >
        <Text style={{ fontSize: 16, color: C.text, textAlign: "center" }}>
          {/* Loading Quick Items... */}
        </Text>
      </View>
    );
  }
  return (
    <View
      style={{
        paddingRight: 3,
        flex: 1,
      }}
    >
      {/* {isInventoryLocked && (
        <StaleBanner
          text="Sale in Progress — Workorder Locked"
          style={{ marginHorizontal: 4, marginTop: 3, marginBottom: 3, backgroundColor: "black" }}
          textStyle={{ color: "#FFD600" }}
        />
      )} */}
      <View
        style={{ flex: 1, opacity: isInventoryLocked ? 0.4 : 1 }}
        pointerEvents={isInventoryLocked ? "none" : "auto"}
      >
      <View
        style={{
          width: "100%",
          height: "5%",
          flexDirection: "row",
          paddingHorizontal: 4,
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Button_
          icon={ICONS.reset1}
          iconSize={20}
          onPress={() => clearSearch()}
          useColorGradient={false}
          disabled={!sSearchTerm}
        />
        <TextInput_
          autoFocus={true}
          style={{
            borderBottomWidth: 1,
            borderBottomColor: gray(0.2),
            fontSize: 18,
            color: C.text,
            outlineWidth: 0,
            outlineStyle: "none",
            width: "80%",
            marginLeft: 20,
            marginRight: 30,
          }}
          placeholder="Search inventory"
          placeholderTextColor={gray(0.2)}
          value={sSearchTerm}
          onChangeText={(val) => handleSearch(val)}
        />
        <Tooltip text="New Item" position="bottom">
          <Button_
            icon={ICONS.new}
            iconSize={25}
            useColorGradient={false}
            onPress={() => {
              let newItem = cloneDeep(INVENTORY_ITEM_PROTO);
              let barcode = generateEAN13Barcode();
              newItem.id = barcode;
              newItem.primaryBarcode = barcode;
              _setModalItem(newItem);
            }}
          />
        </Tooltip>
      </View>
      <View
        style={{
          width: "100%",
          flexDirection: "row",
          paddingTop: 10,
          justifyContent: "flex-start",
          height: "95%",
        }}
      >
        {/** Left column — ALWAYS shows root-level buttons */}
        <View
          style={{
            justifyContent: "flex-start",
            width: "20%",
            paddingHorizontal: 2,
          }}
        >
          {zQuickItemButtons
            ?.filter((b) => !b.parentID)
            .map((item) => {
              let isActive =
                sSelectedButtonID === item.id ||
                (sMenuPath.length > 0 && sMenuPath[0].id === item.id);
              return (
                <div
                  key={item.id}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    handleQuickButtonPress(item);
                    _setForceEditMode(true);
                  }}
                >
                  <Button_
                    onPress={() => handleQuickButtonPress(item)}
                    colorGradientArr={isActive ? ["rgb(245,166,35)", "rgb(245,166,35)"] : (item.id === "labor" || item.id === "part" || item.id === "common") ? COLOR_GRADIENTS.green : COLOR_GRADIENTS.blue}
                    buttonStyle={{
                      borderWidth: 1,
                      borderRadius: 5,
                      borderColor: C.buttonLightGreenOutline,
                      marginBottom: 10,
                      paddingHorizontal: 2,
                      paddingLeft: 2,
                      paddingVertical: item.id === "common" ? 14 : 5,
                      backgroundColor: undefined,
                    }}
                    numLines={item.name.length > 17 ? 2 : 1}
                    textStyle={{
                      fontSize: getQuickButtonFontSize(item.name, 14),
                      fontWeight: 400,
                      textAlign: "center",
                      color: isActive ? "white" : C.textWhite,
                    }}
                    text={item.name.toUpperCase()}
                  />
                </div>
              );
            })}
        </View>

        {/** Right panel — breadcrumbs + wrapping buttons + FlatList */}
        <View
          style={{
            height: "100%",
            width: "80%",
            paddingTop: 0,
            paddingLeft: 3,
            paddingRight: 3,
          }}
        >
          {/** Section 1: Breadcrumbs + Back button (only when sub-menu is open) */}
          {sCurrentParentID !== null && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: 8,
                flexWrap: "wrap",
              }}
            >
              {sMenuPath.map((crumb, i) => (
                <View
                  key={crumb.id}
                  style={{ flexDirection: "row", alignItems: "center" }}
                >
                  {i > 0 && (
                    <Text
                      style={{
                        color: gray(0.3),
                        marginHorizontal: 4,
                        fontSize: 13,
                      }}
                    >
                      {">"}
                    </Text>
                  )}
                  <TouchableOpacity
                    onPress={() => {
                      let newPath = sMenuPath.slice(0, i + 1);
                      _setMenuPath(newPath);
                      _setCurrentParentID(crumb.id);
                      // Restore the crumb's items (same logic as handleBackPress)
                      let crumbBtn = (zQuickItemButtons || []).find((b) => b.id === crumb.id);
                      let items = [];
                      crumbBtn?.items?.forEach((entry) => {
                        let id = typeof entry === "string" ? entry : entry.inventoryItemID;
                        let item = zInventoryArr.find((inv) => inv.id === id);
                        if (item) items.push(item);
                      });
                      if (items.length > 0) {
                        _setSelectedButtonID(crumb.id);
                        _setSearchResults(items);
                      } else {
                        _setSelectedButtonID(null);
                        _setSearchResults([]);
                      }
                      _setSearchTerm("");
                    }}
                  >
                    <Text
                      style={{
                        color:
                          i === sMenuPath.length - 1 ? gray(0.4) : gray(0.55),
                        fontSize: 13,
                        fontWeight:
                          i === sMenuPath.length - 1 ? "bold" : "normal",
                      }}
                    >
                      {(crumb.name || "(unnamed)").toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {/** Section 2: Wrapping child buttons (only when sub-menu has children) */}
          {currentChildren.length > 0 && (
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                marginBottom: 0,
              }}
            >
              {currentChildren.map((btn) => {
                let isSelected = sSelectedButtonID === btn.id;
                return (
                  <Button_
                    key={btn.id}
                    onPress={() => handleQuickButtonPress(btn)}
                    colorGradientArr={isSelected ? ["rgb(240,200,40)", "rgb(240,200,40)"] : [C.green, C.green]}
                    buttonStyle={{
                      borderWidth: 1,
                      borderRadius: 5,
                      borderColor: C.buttonLightGreenOutline,
                      marginRight: 6,
                      marginBottom: 6,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                    }}
                    textStyle={{
                      fontSize: getQuickButtonFontSize(btn.name, 12),
                      fontWeight: 400,
                      color: C.textWhite,
                    }}
                    text={btn.name.toUpperCase() + (isSelected ? " \u25BC" : " \u25B6")}
                  />
                );
              })}
            </View>
          )}

          {/** Section 3: Canvas (quick button selected) or list (search results) */}
          {sSelectedButtonID && !sSearchTerm ? (
            (() => {
              let activeBtn = (zQuickItemButtons || []).find((b) => b.id === sSelectedButtonID);
              if (!activeBtn || !activeBtn.items || activeBtn.items.length === 0) {
                return (
                  <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingTop: 60 }}>
                    <Image_ icon={ICONS.info} size={40} />
                    <Text style={{ fontSize: 14, color: gray(0.5), marginTop: 12 }}>No items in menu</Text>
                  </View>
                );
              }
              return (
                <QuickItemCanvas
                  buttonObj={activeBtn}
                  zInventoryArr={zInventoryArr}
                  zQuickItemButtons={zQuickItemButtons}
                  onItemPress={inventoryItemSelected}
                  onInfoPress={handleInventoryInfoPress}
                  forceEditMode={sForceEditMode}
                  onForceEditConsumed={() => _setForceEditMode(false)}
                />
              );
            })()
          ) : sSearchResults.length === 0 && sSelectedButtonID ? (
            <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingTop: 60 }}>
              <Image_ icon={ICONS.info} size={40} />
              <Text style={{ fontSize: 14, color: gray(0.5), marginTop: 12 }}>No items in menu</Text>
            </View>
          ) : (
            <ScrollView style={{ width: "100%", flex: 1 }}>
              {sSearchResults.slice(0, 50).map((item, index) => {
                let activeBtn = sSelectedButtonID ? (zQuickItemButtons || []).find((b) => b.id === sSelectedButtonID) : null;
                let dividerObj = (activeBtn?.dividers || []).find((d) => d.itemID === item.id);
                let hasDivider = !!dividerObj;
                return (
                  <React.Fragment key={item.id}>
                    {hasDivider && (
                      <View style={{ marginTop: 3 }}>
                        <View style={{ height: 4, backgroundColor: C.buttonLightGreenOutline, borderRadius: 2 }} />
                        {!!dividerObj?.label && (
                          <Text style={{ fontSize: 16, color: C.blue, paddingVertical: 2, paddingHorizontal: 6, textAlign: "center", fontWeight: "600" }}>
                            {dividerObj.label}
                          </Text>
                        )}
                      </View>
                    )}
                    <View
                      style={{
                        borderRadius: 7,
                        borderLeftColor: C.buttonLightGreenOutline,
                        borderWidth: 1,
                        borderLeftWidth: 2,
                        borderColor: C.listItemBorder,
                        flexDirection: "row",
                        alignItems: "center",
                        backgroundColor: index % 2 === 0 ? C.backgroundListWhite : gray(0.04),
                        paddingRight: 3,
                        paddingVertical: 2,
                        marginTop: index === 0 ? 0 : 5,
                        marginBottom: 5,
                      }}
                    >
                      <View style={{ width: "5%", position: "relative" }}>
                        <Button_
                          icon={ICONS.print}
                          iconSize={15}
                          buttonStyle={{ width: 30 }}
                          onPress={() => handleListPrintClick(item)}
                        />
                        {sListPrintPickerID === item.id && (() => {
                          let settings = useSettingsStore.getState().settings;
                          let allTemplates = settings?.labelTemplates || {};
                          let templateEntries = Object.entries(allTemplates);
                          let quickPrintSlugs = settings?.quickPrintLayouts || [];
                          let qpEntries = templateEntries.filter(([slug]) => quickPrintSlugs.includes(slug));
                          return (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              onMouseDown={(e) => e.stopPropagation()}
                              style={{
                                position: "absolute",
                                top: "100%",
                                left: 0,
                                zIndex: 10,
                                backgroundColor: "white",
                                borderRadius: 6,
                                border: "1px solid " + gray(0.2),
                                boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                                minWidth: 120,
                                overflow: "hidden",
                              }}
                            >
                              {qpEntries.map(([slug, template]) => (
                                <div
                                  key={slug}
                                  onClick={(e) => { e.stopPropagation(); handleListPrintWithTemplate(slug, item); }}
                                  style={{
                                    padding: "5px 8px",
                                    cursor: "pointer",
                                    fontSize: 10,
                                    color: C.text,
                                    borderBottom: "1px solid " + gray(0.1),
                                  }}
                                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = gray(0.05); }}
                                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "white"; }}
                                >
                                  {template.name}
                                </div>
                              ))}
                              <div
                                onClick={(e) => { e.stopPropagation(); _setListPrintPickerID(null); }}
                                style={{ padding: "4px 8px", cursor: "pointer", fontSize: 9, color: gray(0.5), textAlign: "center" }}
                              >
                                Cancel
                              </div>
                            </div>
                          );
                        })()}
                        {sListPrintSuccessID === item.id && (
                          <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(88,145,65,0.15)", borderRadius: 8, zIndex: 5, pointerEvents: "none" }}>
                            <Text style={{ fontSize: 9, color: C.green, fontWeight: "600" }}>Sent!</Text>
                          </div>
                        )}
                      </View>
                      {!!zOpenWorkorderID && (
                        <View style={{ width: "5%" }}>
                          <Button_
                            icon={ICONS.info}
                            iconSize={15}
                            buttonStyle={{ width: 30 }}
                            onPress={() => {
                              handleInventoryInfoPress(item);
                            }}
                          />
                        </View>
                      )}
                      <TouchableOpacity_
                        style={{
                          height: "100%",
                          width: zOpenWorkorderID ? "90%" : "95%",
                        }}
                        onPress={() => inventoryItemSelected(item)}
                      >
                        <View
                          style={{
                            width: "100%",
                            flexDirection: "row",
                            height: "100%",
                            alignItems: "center",
                          }}
                        >
                          <Text
                            style={{
                              width: "85%",
                              fontSize: 15,
                              paddingLeft: 7,
                              paddingRight: 5,
                              color: C.text,
                            }}
                          >
                            {item.informalName || item.formalName}
                            {!!item.informalName && !sSelectedButtonID && (
                              <Text style={{ fontSize: 12, color: "gray" }}>
                                {"\n" + item.formalName}
                              </Text>
                            )}
                          </Text>

                          <View
                            style={{
                              width: "15%",
                              height: "100%",
                              alignItems: "flex-end",
                              justifyContent: "center",
                              borderLeftWidth: 1,
                              borderColor: C.listItemBorder,
                              paddingRight: 5,
                              backgroundColor: C.backgroundListWhite,
                            }}
                          >
                            <Text
                              style={{
                                textAlign: "right",
                                fontSize: 10,
                                color: gray(0.4),
                              }}
                            >
                              {"$ "}
                              <Text
                                style={{
                                  textAlignVertical: "top",
                                  fontSize: 14,
                                  color: C.text,
                                }}
                              >
                                {formatCurrencyDisp(item.price)}
                              </Text>
                            </Text>
                            {!!item.salePrice && (
                              <Text
                                style={{
                                  textAlign: "right",
                                  fontSize: 10,
                                  color: lightenRGBByPercent(C.red, 60),
                                }}
                              >
                                {"$ "}
                                <Text
                                  style={{
                                    textAlignVertical: "top",
                                    fontSize: 12,
                                    color: C.red,
                                  }}
                                >
                                  {/* {formatCurrencyDisp(item.salePrice)} */}
                                </Text>
                              </Text>
                            )}
                          </View>
                        </View>
                      </TouchableOpacity_>
                    </View>
                  </React.Fragment>
                );
              })}
            </ScrollView>
          )}
        </View>
        {sModalItem && (
          <InventoryItemModalScreen
            key={sModalItem.id}
            item={sModalItem}
            isNew={!!(sModalItem.id && !sModalItem.formalName)}
            handleExit={() => _setModalItem(null)}
          />
        )}
        <CustomItemModal
          visible={!!sCustomItemModal}
          onClose={() => _setCustomItemModal(null)}
          onSave={handleCustomItemSave}
          type={sCustomItemModal}
        />
      </View>
      </View>
    </View>
  );
}

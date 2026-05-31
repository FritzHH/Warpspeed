/*eslint-disable*/
import React, { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, lazy, Suspense } from "react";
import { WORKORDER_ITEM_PROTO, INVENTORY_ITEM_PROTO, QUICK_BUTTON_ITEM_PROTO, QB_DEFAULT_W, QB_DEFAULT_H, QB_SNAP_PCT } from "../../../data";
import { C, COLOR_GRADIENTS, ICONS } from "../../../styles";

import { applyDiscountToWorkorderItem, formatCurrencyDisp, lightenRGBByPercent, log, resolveStatus, generateEAN13Barcode, normalizeBarcode, showAlert, localStorageWrapper, replaceOrAddToArr } from "../../../utils";
import { workerSearchInventory } from "../../../inventorySearchManager";
import {
  Image as DomImage,
  NoteHelper,
  TextInput as DomTextInput,
  Tooltip as DomTooltip,
} from "../../../dom_components";
const InventoryItemModalScreen = lazy(() =>
  import("../modal_screens/InventoryItemModalScreen").then((m) => ({ default: m.InventoryItemModalScreen }))
);
const CustomItemModal = lazy(() =>
  import("../modal_screens/CustomItemModal").then((m) => ({ default: m.CustomItemModal }))
);
const ColorPickerModal = lazy(() =>
  import("../modal_screens/ColorPickerModal").then((m) => ({ default: m.ColorPickerModal }))
);
import cloneDeep from "lodash/cloneDeep";
import {
  useSettingsStore,
  useOpenWorkordersStore,
  useInventoryStore,
  useLoginStore,
} from "../../../stores";
import { dbSaveSettingsField, dbSaveInventoryItem, dbSavePrintObj } from "../../../db_calls_wrapper";
import { labelPrintBuilder } from "../../../shared/labelPrintBuilder";
import headerStyles from "./InventoryHeader.module.css";
import styles from "./OptionsInventory.module.css";

function getQuickButtonFontSize(text, baseFontSize) {
  let len = (text || "").length;
  if (len <= 15) return baseFontSize;
  return Math.max(7, Math.round(baseFontSize - (len - 15) * 0.5));
}

const QB_BREAK_CHARS_RE = /[ &/\\]/;

function splitQuickButtonLabel(text) {
  const mid = text.length / 2;
  let breakIdx = -1;
  let bestDist = Infinity;
  for (let i = 0; i < text.length; i++) {
    if (QB_BREAK_CHARS_RE.test(text[i])) {
      const d = Math.abs(i - mid);
      if (d < bestDist) { bestDist = d; breakIdx = i; }
    }
  }
  if (breakIdx === -1) return null;
  return text.slice(0, breakIdx).trim() + "\n" + text.slice(breakIdx + 1).trim();
}

function RootButtonLabel({ text, fontSize, styles }) {
  const spanRef = useRef(null);
  const [label, setLabel] = useState(text);

  useLayoutEffect(() => {
    const el = spanRef.current;
    if (!el) return;
    // Measure the original text forced to one line; if it overflows the
    // span's actual rendered width, swap in a hard-broken version.
    setLabel(text);
    const prevWhiteSpace = el.style.whiteSpace;
    el.style.whiteSpace = "nowrap";
    const overflows = el.scrollWidth > el.clientWidth + 0.5;
    el.style.whiteSpace = prevWhiteSpace;
    if (overflows) {
      const split = splitQuickButtonLabel(text);
      if (split) setLabel(split);
    }
  }, [text, fontSize]);

  return (
    <span ref={spanRef} className={styles.rootBtnText} style={{ fontSize }}>
      {label}
    </span>
  );
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
const RESIZE_HANDLE_SIZE = 8;
const RESIZE_HANDLES = [
  // edges
  { id: "t", cursor: "ns-resize", style: { top: -3, left: RESIZE_HANDLE_SIZE, right: RESIZE_HANDLE_SIZE, height: 6 }, axes: { y: -1, h: -1 } },
  { id: "b", cursor: "ns-resize", style: { bottom: -3, left: RESIZE_HANDLE_SIZE, right: RESIZE_HANDLE_SIZE, height: 6 }, axes: { h: 1 } },
  { id: "l", cursor: "ew-resize", style: { left: -3, top: RESIZE_HANDLE_SIZE, bottom: RESIZE_HANDLE_SIZE, width: 6 }, axes: { x: -1, w: -1 } },
  { id: "r", cursor: "ew-resize", style: { right: -3, top: RESIZE_HANDLE_SIZE, bottom: RESIZE_HANDLE_SIZE, width: 6 }, axes: { w: 1 } },
  // corners
  { id: "tl", cursor: "nwse-resize", style: { top: -4, left: -4, width: RESIZE_HANDLE_SIZE, height: RESIZE_HANDLE_SIZE }, axes: { x: -1, y: -1, w: -1, h: -1 } },
  { id: "tr", cursor: "nesw-resize", style: { top: -4, right: -4, width: RESIZE_HANDLE_SIZE, height: RESIZE_HANDLE_SIZE }, axes: { y: -1, w: 1, h: -1 } },
  { id: "bl", cursor: "nesw-resize", style: { bottom: -4, left: -4, width: RESIZE_HANDLE_SIZE, height: RESIZE_HANDLE_SIZE }, axes: { x: -1, w: -1, h: 1 } },
  { id: "br", cursor: "nwse-resize", style: { bottom: -4, right: -4, width: RESIZE_HANDLE_SIZE, height: RESIZE_HANDLE_SIZE }, axes: { w: 1, h: 1 } },
];

const QuickItemCanvasCard = ({
  itemObj,
  invItem,
  sEditMode,
  isSelected,
  labelMode,
  onSelect,
  onPositionChange,
  onMultiDragStart,
  onMultiDrag,
  onResize,
  onPress,
  onDoubleClickPress,
  onRightClick,
  onInfoPress,
  onLabelChange,
  containerRef,
  isInWorkorder,
}) => {
  const [sDragging, _setDragging] = useState(false);
  const [sResizing, _setResizing] = useState(false);
  const [sPressed, _setPressed] = useState(false);
  const [sShowActions, _setShowActions] = useState(false);
  const [sShowPrintPicker, _setShowPrintPicker] = useState(false);
  const [sPrintSuccess, _setPrintSuccess] = useState(false);
  const dragStartRef = useRef(null);
  const resizeStartRef = useRef(null);
  const didDragRef = useRef(false);
  const lastClickTimeRef = useRef(0);
  const longPressTimerRef = useRef(null);

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
  let defaultName = invItem ? (invItem.formalName || "Unknown") : "(not found)";
  let name = invItem ? (invItem.informalName || invItem.formalName || "Unknown") : "(not found)";
  let price = invItem ? formatCurrencyDisp(invItem.price) : "";

  function handleMouseDown(e) {
    if (!sEditMode) return;
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    if (document.activeElement && (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA")) {
      document.activeElement.blur();
    }
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
    if (isSelected && onMultiDragStart) onMultiDragStart();
    _setDragging(true);

    function handleMouseMove(ev) {
      if (!dragStartRef.current) return;
      let { startMouseX, startMouseY, startX, startY, rectW, rectH } = dragStartRef.current;
      let dx = ev.clientX - startMouseX;
      let dy = ev.clientY - startMouseY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didDragRef.current = true;
      let dxPct = (dx / rectW) * 100;
      let dyPct = (dy / rectH) * 100;
      if (isSelected && onMultiDrag) {
        onMultiDrag(snapTo(dxPct), snapTo(dyPct));
      } else {
        let newX = snapTo(startX + dxPct);
        let newY = snapTo(startY + dyPct);
        newX = Math.max(0, Math.min(newX, 100 - w));
        newY = Math.max(0, Math.min(newY, 100 - h));
        onPositionChange(itemObj.inventoryItemID, newX, newY);
      }
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

  function handleResizeMouseDown(e, axes) {
    e.preventDefault();
    e.stopPropagation();
    let container = containerRef.current;
    if (!container) return;
    let rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    resizeStartRef.current = {
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startX: itemObj.x || 0,
      startY: itemObj.y || 0,
      startW: itemObj.w || DEFAULT_ITEM_W,
      startH: itemObj.h || DEFAULT_ITEM_H,
      rectW: rect.width,
      rectH: rect.height,
      axes,
    };
    _setResizing(true);

    function handleResizeMove(ev) {
      if (!resizeStartRef.current) return;
      let { startMouseX, startMouseY, startX, startY, startW, startH, rectW, rectH, axes: ax } = resizeStartRef.current;
      let dxPct = ((ev.clientX - startMouseX) / rectW) * 100;
      let dyPct = ((ev.clientY - startMouseY) / rectH) * 100;
      let newX = startX, newY = startY, newW = startW, newH = startH;
      // Horizontal: axes.w = direction of width change, axes.x = whether origin moves
      if (ax.w) {
        let wDelta = snapTo(dxPct * ax.w);
        newW = Math.max(SNAP_PCT * 3, startW + wDelta);
        if (ax.x) newX = snapTo(startX - (newW - startW));
      }
      // Vertical: axes.h = direction of height change, axes.y = whether origin moves
      if (ax.h) {
        let hDelta = snapTo(dyPct * ax.h);
        newH = Math.max(SNAP_PCT * 2, startH + hDelta);
        if (ax.y) newY = snapTo(startY - (newH - startH));
      }
      // Clamp to canvas
      newX = Math.max(0, Math.min(newX, 100 - newW));
      newY = Math.max(0, Math.min(newY, 100 - newH));
      if (onResize) onResize(itemObj.inventoryItemID, newX, newY, newW, newH);
    }

    function handleResizeUp() {
      resizeStartRef.current = null;
      _setResizing(false);
      window.removeEventListener("mousemove", handleResizeMove);
      window.removeEventListener("mouseup", handleResizeUp);
    }

    window.addEventListener("mousemove", handleResizeMove);
    window.addEventListener("mouseup", handleResizeUp);
  }

  return (
    <div
      onMouseDown={(e) => {
        if (!sEditMode) {
          _setPressed(true);
          if (onDoubleClickPress) {
            longPressTimerRef.current = setTimeout(() => {
              longPressTimerRef.current = null;
              onDoubleClickPress(e);
            }, 500);
          }
        }
        handleMouseDown(e);
      }}
      onMouseUp={() => {
        if (!sEditMode) _setPressed(false);
        if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
      }}
      onMouseLeave={() => {
        if (!sEditMode) _setPressed(false);
        if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
      }}
      onClick={() => {
        if (sEditMode) {
          if (didDragRef.current) return;
          onSelect(itemObj.inventoryItemID);
        } else if (onPress) {
          const now = Date.now();
          if (now - lastClickTimeRef.current < 500) return;
          lastClickTimeRef.current = now;
          onPress();
        }
      }}
      onDoubleClick={(e) => {
        if (!sEditMode && onDoubleClickPress) onDoubleClickPress(e);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        if (onRightClick) onRightClick(itemObj.inventoryItemID);
      }}
      className={[
        styles.canvasCard,
        isSelected && styles.canvasCardSelected,
        sEditMode && styles.canvasCardEdit,
        !sEditMode && sShowActions && styles.canvasCardWithActions,
        !sEditMode && !sShowActions && styles.canvasCardLift,
      ].filter(Boolean).join(" ")}
      style={{
        left: (itemObj.x || 0) + "%",
        top: (itemObj.y || 0) + "%",
        width: w + "%",
        height: h + "%",
        backgroundColor: itemObj.backgroundColor || (isInWorkorder ? lightenRGBByPercent(C.blue, 70) : C.buttonLightGreenOutline),
        cursor: sEditMode ? (sDragging ? "grabbing" : (sResizing ? "auto" : "grab")) : "pointer",
        opacity: sPressed ? 0.7 : (sDragging ? 0.7 : 1),
      }}
    >
      {/* Formal name helper - above card in edit mode */}
      {sEditMode && invItem?.formalName && (labelMode === "all" || (labelMode === "active" && isSelected)) && (
        <div className={styles.formalNameHelper}>
          {invItem.formalName}
        </div>
      )}

      {/* Resize handles - edges and corners */}
      {sEditMode && isSelected && !sDragging && RESIZE_HANDLES.map((handle) => (
        <div
          key={handle.id}
          onMouseDown={(e) => handleResizeMouseDown(e, handle.axes)}
          className={[
            styles.resizeHandle,
            handle.id.length === 2 && styles.resizeHandleCorner,
          ].filter(Boolean).join(" ")}
          style={{ ...handle.style, cursor: handle.cursor }}
        />
      ))}

      {sEditMode ? (
        <div onClick={(e) => e.stopPropagation()} className={styles.cardLabelWrap}>
          <DomTextInput
            value={invItem?.informalName || ""}
            placeholder={defaultName}
            placeholderTextColor={C.textMuted}
            onFocus={() => { if (!isSelected) onSelect(itemObj.inventoryItemID); }}
            onChangeText={(val) => {
              if (onLabelChange) onLabelChange(itemObj.inventoryItemID, val);
            }}
            debounceMs={400}
            multiline
            numberOfLines={99}
            className={styles.cardLabelInput}
            style={{
              fontSize: itemObj.fontSize || 10,
              color: itemObj.textColor || C.text,
              lineHeight: ((itemObj.fontSize || 10) + 6) + "px",
              textAlign: "center",
            }}
          />
        </div>
      ) : (
          <div title={defaultName} className={styles.cardNameWrap}>
            <span
              className={styles.cardNameText}
              style={{
                fontSize: itemObj.fontSize || 10,
                color: itemObj.textColor || (invItem ? C.text : C.textDisabled),
                lineHeight: ((itemObj.fontSize || 10) + 6) + "px",
              }}
            >
              {name}
            </span>
          </div>
      )}
      {!sEditMode && (
        <>
          {/* Caret toggle */}
          <div
            className={[
              styles.caretToggleWrap,
              sShowActions && styles.caretToggleWrapWithActions,
            ].filter(Boolean).join(" ")}
          >
            <DomTooltip text={sShowActions ? "Hide actions" : "Show actions"} position="left">
              <div
                onClick={(e) => { e.stopPropagation(); _setShowActions((v) => !v); }}
                onMouseDown={(e) => e.stopPropagation()}
                onContextMenu={(e) => e.stopPropagation()}
                className={styles.caretToggle}
              >
                <span className={styles.caretGlyph} style={{ color: itemObj.textColor || C.text }}>{sShowActions ? "\u25BC" : "\u25B6"}</span>
              </div>
            </DomTooltip>
          </div>
          {/* Action row */}
          {sShowActions && (
            <div
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onContextMenu={(e) => e.stopPropagation()}
              className={styles.cardActionRow}
            >
              {(useLoginStore.getState().currentUser?.permissions?.level || 0) >= 3 && (
                <div
                  title="Edit item"
                  onClick={() => { if (onRightClick) onRightClick(itemObj.inventoryItemID); _setShowActions(false); }}
                  className={styles.cardActionBtn}
                >
                  <DomImage icon={ICONS.editPencil} size={13} />
                </div>
              )}
              <div
                title="Item info"
                onClick={() => { if (invItem && onInfoPress) onInfoPress(); }}
                className={styles.cardActionBtn}
              >
                <DomImage icon={ICONS.info} size={13} />
              </div>
              {!!price && (
                <span className={styles.cardActionPrice}>
                  ${price}
                </span>
              )}
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
                className={styles.printPicker}
              >
                {qpEntries.map(([slug, template]) => (
                  <div
                    key={slug}
                    onClick={() => handlePrintWithTemplate(slug)}
                    className={styles.printPickerItem}
                  >
                    {template.name}
                  </div>
                ))}
                <div
                  onClick={() => _setShowPrintPicker(false)}
                  className={styles.printPickerCancel}
                >
                  Cancel
                </div>
              </div>
            );
          })()}
          {/* Print success flash */}
          {sPrintSuccess && (
            <div className={styles.printSuccessOverlay}>
              <span className={styles.printSuccessText}>Sent!</span>
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
const QuickItemCanvas = React.forwardRef(({
  buttonObj,
  zInventoryArr,
  zQuickItemButtons,
  zWorkorderLines,
  onItemPress,
  onItemDoubleClick,
  onInfoPress,
  forceEditMode,
  onForceEditConsumed,
  onEditStateChange,
}, ref) => {
  const [sEditMode, _setEditMode] = useState(false);

  if (forceEditMode && !sEditMode) {
    _setEditMode(true);
    if (onForceEditConsumed) onForceEditConsumed();
  }
  const [sSelectedItemIds, _setSelectedItemIds] = useState([]);
  const [sPaintStyle, _setPaintStyle] = useState(null);
  const [sLabelMode, _setLabelMode] = useState("active");
  const [sSelectionRect, _setSelectionRect] = useState(null);
  const canvasRef = useRef(null);
  const dbSaveTimerRef = useRef(null);
  const migratedRef = useRef(false);
  const selectionStartRef = useRef(null);
  const arrowKeyRef = useRef({});
  arrowKeyRef.current = { sEditMode, sSelectedItemIds, buttonObj, zQuickItemButtons };

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      let { sEditMode, sSelectedItemIds, buttonObj, zQuickItemButtons } = arrowKeyRef.current;
      if (!sEditMode || sSelectedItemIds.length === 0) return;
      let dx = 0, dy = 0;
      if (e.key === "ArrowLeft") dx = -SNAP_PCT;
      else if (e.key === "ArrowRight") dx = SNAP_PCT;
      else if (e.key === "ArrowUp") dy = -SNAP_PCT;
      else if (e.key === "ArrowDown") dy = SNAP_PCT;
      else return;
      e.preventDefault();
      let items = (buttonObj.items || []).map(normalizeItemEntry);
      let selectedSet = new Set(sSelectedItemIds);
      let updatedItems = items.map((it) => {
        if (!selectedSet.has(it.inventoryItemID)) return it;
        let w = it.w || QB_DEFAULT_W;
        let h = it.h || QB_DEFAULT_H;
        let newX = Math.max(0, Math.min((it.x || 0) + dx, 100 - w));
        let newY = Math.max(0, Math.min((it.y || 0) + dy, 100 - h));
        return { ...it, x: snapTo(newX), y: snapTo(newY) };
      });
      let updatedButtons = (zQuickItemButtons || []).map((b) =>
        b.id === buttonObj.id ? { ...b, items: updatedItems } : b
      );
      useSettingsStore.getState().setField("quickItemButtons", updatedButtons, false);
      if (dbSaveTimerRef.current) clearTimeout(dbSaveTimerRef.current);
      dbSaveTimerRef.current = setTimeout(() => {
        dbSaveSettingsField("quickItemButtons", useSettingsStore.getState().settings?.quickItemButtons);
      }, 500);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  let sSelectedItemId = sSelectedItemIds.length === 1 ? sSelectedItemIds[0] : null;

  function notifyParent(editMode, selectedId) {
    onEditStateChange?.(editMode, selectedId);
  }

  useImperativeHandle(ref, () => ({
    resizeSelected: (axis, delta) => handleResizeSelected(axis, delta),
    fontSizeSelected: (delta) => handleFontSizeSelected(delta),
    setColorSelected: (bg, text) => handleSetColorSelected(bg, text),
    clearPaintMode: () => _setPaintStyle(null),
  }));

  // Normalize items (backward compat: string IDs -> objects) and clamp to visible canvas
  let rawItems = (buttonObj.items || []).map(normalizeItemEntry).map((it) => {
    let w = it.w || QB_DEFAULT_W;
    let h = it.h || QB_DEFAULT_H;
    let x = Math.max(0, Math.min(it.x || 0, 100 - w));
    let y = Math.max(0, Math.min(it.y || 0, 100 - h));
    if (x !== (it.x || 0) || y !== (it.y || 0)) return { ...it, x, y };
    return it;
  });

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

  const multiDragStartRef = useRef(null);

  function handleMultiDragStart() {
    multiDragStartRef.current = {};
    let selectedSet = new Set(sSelectedItemIds);
    rawItems.forEach((it) => {
      if (selectedSet.has(it.inventoryItemID)) {
        multiDragStartRef.current[it.inventoryItemID] = { x: it.x || 0, y: it.y || 0 };
      }
    });
  }

  function handleMultiDrag(dxPct, dyPct) {
    if (!multiDragStartRef.current) return;
    let selectedSet = new Set(sSelectedItemIds);
    let updatedItems = rawItems.map((it) => {
      if (!selectedSet.has(it.inventoryItemID)) return it;
      let start = multiDragStartRef.current[it.inventoryItemID];
      if (!start) return it;
      let w = it.w || QB_DEFAULT_W;
      let h = it.h || QB_DEFAULT_H;
      let newX = Math.max(0, Math.min(snapTo(start.x + dxPct), 100 - w));
      let newY = Math.max(0, Math.min(snapTo(start.y + dyPct), 100 - h));
      return { ...it, x: newX, y: newY };
    });
    saveItems(updatedItems);
  }

  function handlePositionChange(invItemID, x, y) {
    saveItems(rawItems.map((it) => it.inventoryItemID === invItemID ? { ...it, x, y } : it));
  }

  function handleResize(invItemID, x, y, w, h) {
    saveItems(rawItems.map((it) => it.inventoryItemID === invItemID ? { ...it, x, y, w, h } : it));
  }

  function handleLabelChange(invItemID, informalName) {
    let invItem = findInvItem(invItemID);
    if (!invItem) return;
    let updated = { ...invItem, informalName };
    // Update local inventory store immediately for speed
    let updatedArr = (zInventoryArr || []).map((i) => i.id === invItemID ? updated : i);
    useInventoryStore.getState().setItems(updatedArr);
    // Debounce DB save
    if (dbSaveTimerRef.current) clearTimeout(dbSaveTimerRef.current);
    dbSaveTimerRef.current = setTimeout(() => {
      dbSaveInventoryItem(updated);
    }, 500);
  }

  function handleDeleteItem(invItemID) {
    if (sSelectedItemIds.includes(invItemID)) {
      _setSelectedItemIds(sSelectedItemIds.filter((id) => id !== invItemID));
      notifyParent(sEditMode, null);
    }
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

  function handleSetColorSelected(backgroundColor, textColor) {
    if (!sSelectedItemId) return;
    saveItems(rawItems.map((it) => {
      if (it.inventoryItemID !== sSelectedItemId) return it;
      return { ...it, backgroundColor: backgroundColor || "", textColor: textColor || "#000000" };
    }));
  }

  function handleCopyStyle() {
    if (!sSelectedItemId) return;
    let sel = rawItems.find((it) => it.inventoryItemID === sSelectedItemId);
    if (!sel) return;
    _setPaintStyle({ w: sel.w || DEFAULT_ITEM_W, h: sel.h || DEFAULT_ITEM_H, fontSize: sel.fontSize || 10, backgroundColor: sel.backgroundColor || null, textColor: sel.textColor || null });
  }

  function handlePasteStyle(targetId) {
    if (!sPaintStyle) return;
    saveItems(rawItems.map((it) => {
      if (it.inventoryItemID !== targetId) return it;
      return { ...it, ...sPaintStyle, x: it.x, y: it.y, inventoryItemID: it.inventoryItemID };
    }));
  }

  function handleCanvasMouseDown(e) {
    if (!sEditMode) return;
    if (e.target !== canvasRef.current) return;
    e.preventDefault();
    _setSelectedItemIds([]);
    notifyParent(sEditMode, null);
    let rect = canvasRef.current.getBoundingClientRect();
    let startXPct = ((e.clientX - rect.left) / rect.width) * 100;
    let startYPct = ((e.clientY - rect.top) / rect.height) * 100;
    selectionStartRef.current = { startXPct, startYPct, rectW: rect.width, rectH: rect.height, rect };

    function handleMouseMove(ev) {
      if (!selectionStartRef.current) return;
      let { startXPct: sx, startYPct: sy, rect: r } = selectionStartRef.current;
      let curXPct = ((ev.clientX - r.left) / r.width) * 100;
      let curYPct = ((ev.clientY - r.top) / r.height) * 100;
      let x = Math.min(sx, curXPct);
      let y = Math.min(sy, curYPct);
      let w = Math.abs(curXPct - sx);
      let h = Math.abs(curYPct - sy);
      _setSelectionRect({ x, y, w, h });
    }

    function handleMouseUp(ev) {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      if (!selectionStartRef.current) return;
      let { startXPct: sx, startYPct: sy, rect: r } = selectionStartRef.current;
      let curXPct = ((ev.clientX - r.left) / r.width) * 100;
      let curYPct = ((ev.clientY - r.top) / r.height) * 100;
      let selX = Math.min(sx, curXPct);
      let selY = Math.min(sy, curYPct);
      let selW = Math.abs(curXPct - sx);
      let selH = Math.abs(curYPct - sy);
      selectionStartRef.current = null;
      _setSelectionRect(null);
      if (selW < 1 && selH < 1) return;
      let selected = rawItems.filter((it) => {
        let ix = it.x || 0, iy = it.y || 0;
        let iw = it.w || QB_DEFAULT_W, ih = it.h || QB_DEFAULT_H;
        return ix + iw > selX && ix < selX + selW && iy + ih > selY && iy < selY + selH;
      }).map((it) => it.inventoryItemID);
      if (selected.length > 0) _setSelectedItemIds(selected);
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }

  return (
    <div className={styles.canvasWrap}>
      {/* Canvas */}
      <div
        ref={canvasRef}
        onMouseDown={handleCanvasMouseDown}
        className={[
          styles.canvas,
          sEditMode && styles.canvasEdit,
          sEditMode && sPaintStyle && styles.canvasPaint,
        ].filter(Boolean).join(" ")}
      >
        {rawItems.map((itemObj) => {
          let invItem = findInvItem(itemObj.inventoryItemID);
          return (
            <QuickItemCanvasCard
              key={itemObj.inventoryItemID}
              itemObj={itemObj}
              invItem={invItem}
              sEditMode={sEditMode}
              isSelected={sSelectedItemIds.includes(itemObj.inventoryItemID)}
              labelMode={sLabelMode}
              isInWorkorder={!!(zWorkorderLines || []).find((l) => l.inventoryItem?.id === itemObj.inventoryItemID)}
              onSelect={(id) => {
                if (sPaintStyle && !sSelectedItemIds.includes(id)) { handlePasteStyle(id); return; }
                _setSelectedItemIds([id]); notifyParent(sEditMode, id);
              }}
              containerRef={canvasRef}
              onPositionChange={handlePositionChange}
              onMultiDragStart={sSelectedItemIds.length > 1 ? handleMultiDragStart : null}
              onMultiDrag={sSelectedItemIds.length > 1 ? handleMultiDrag : null}
              onResize={handleResize}
              onPress={() => invItem && onItemPress(invItem)}
              onDoubleClickPress={(e) => invItem && onItemDoubleClick && onItemDoubleClick(invItem, e)}
              onInfoPress={() => invItem && onInfoPress(invItem)}
              onRightClick={(id) => {
                if (sEditMode) {
                  _setEditMode(false);
                  _setSelectedItemIds([]);
                  _setPaintStyle(null);
                  notifyParent(false, null);
                  dbSaveSettingsField("quickItemButtons", useSettingsStore.getState().settings?.quickItemButtons);
                } else {
                  _setEditMode(true);
                  _setSelectedItemIds([id]);
                  notifyParent(true, id);
                }
              }}
              onLabelChange={handleLabelChange}
            />
          );
        })}

        {/* Delete + Format Painter overlays for selected item in edit mode */}
        {sEditMode && sSelectedItemId && (() => {
          let sel = rawItems.find((it) => it.inventoryItemID === sSelectedItemId);
          if (!sel) return null;
          return (
            <>
              <div
                onClick={() => handleDeleteItem(sSelectedItemId)}
                className={styles.deletePill}
                style={{
                  left: `calc(${(sel.x || 0) + (sel.w || DEFAULT_ITEM_W)}% - 8px)`,
                  top: `calc(${(sel.y || 0)}% - 6px)`,
                }}
              >
                <DomImage icon={ICONS.trash} size={10} />
              </div>
              <div
                onClick={() => sPaintStyle ? _setPaintStyle(null) : handleCopyStyle()}
                className={[
                  styles.paintPill,
                  sPaintStyle && styles.paintPillActive,
                ].filter(Boolean).join(" ")}
                style={{
                  left: `calc(${(sel.x || 0) + (sel.w || DEFAULT_ITEM_W)}% - 8px)`,
                  top: `calc(${(sel.y || 0)}% + 14px)`,
                }}
              >
                <DomImage icon={ICONS.colorWheel} size={10} />
              </div>
            </>
          );
        })()}
        {/* Label mode toggle */}
        {sEditMode && (
          <div
            onClick={() => _setLabelMode(sLabelMode === "none" ? "active" : sLabelMode === "active" ? "all" : "none")}
            className={styles.labelModeToggle}
          >
            {sLabelMode === "none" ? "Labels: Off" : sLabelMode === "active" ? "Labels: Active" : "Labels: All"}
          </div>
        )}
        {/* Paint mode indicator */}
        {sEditMode && sPaintStyle && (
          <div
            onClick={() => _setPaintStyle(null)}
            className={styles.paintModeIndicator}
          >
            Paint Mode (click to exit)
          </div>
        )}

        {/* Rubber-band selection rectangle */}
        {sSelectionRect && (
          <div
            className={styles.selectionRect}
            style={{
              left: sSelectionRect.x + "%",
              top: sSelectionRect.y + "%",
              width: sSelectionRect.w + "%",
              height: sSelectionRect.h + "%",
            }}
          />
        )}

        {rawItems.length === 0 && (
          <div className={styles.canvasEmpty}>
            <span className={styles.canvasEmptyText}>No items in this button</span>
          </div>
        )}
      </div>
    </div>
  );
});

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
  const leftColRef = useRef(null);
  const [sCustomItemModal, _setCustomItemModal] = useState(null); // { type, anchorX, anchorY } | null
  const [sForceEditMode, _setForceEditMode] = useState(false);
  const [sCanvasEditMode, _setCanvasEditMode] = useState(false);
  const [sCanvasSelectedItemId, _setCanvasSelectedItemId] = useState(null);
  const [sShowColorPickerModal, _setShowColorPickerModal] = useState(false);
  const [sColorPickerAnchor, _setColorPickerAnchor] = useState({ x: 0, y: 0 });
  const quickCanvasRef = useRef(null);
  const [sListPrintPickerID, _setListPrintPickerID] = useState(null);
  const [sListPrintSuccessID, _setListPrintSuccessID] = useState(null);
  const barcodeModalTimerRef = useRef(null);
  const _searchTermRef = useRef("");
  const _scanNotFoundRef = useRef(false);

  // Note Helper dropdown state
  const zNoteHelpers = useSettingsStore((state) => state.settings?.noteHelpers);
  const [sNoteHelperDropdown, _setNoteHelperDropdown] = useState(null); // { workorderLine, anchorPosition }
  const lastClickTimeRef = useRef(0);
  const lastClickItemRef = useRef(null);

  // Timeout to batch all store updates and reduce re-renders
  useEffect(() => {
    const timer = setTimeout(() => setIsReady(true), 50);
    return () => clearTimeout(timer);
  }, []);

  // Re-measure all root-button labels when the column resizes
  // (RootButtonLabel handles its own measurement on mount; this forces
  // a re-mount on width change by keying the column with its width)
  const [sLeftColWidth, _setLeftColWidth] = useState(0);
  useLayoutEffect(() => {
    const el = leftColRef.current;
    if (!el) return;
    const update = () => _setLeftColWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
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
    _setSearchTerm(searchTerm || "");
    _searchTermRef.current = searchTerm || "";
    if (!searchTerm || searchTerm.length === 0) {
      _setSearchResults([]);
      return;
    }
    if (searchTerm.length < 2) return;
    workerSearchInventory(searchTerm, (results) => {
      if (barcodeModalTimerRef.current) clearTimeout(barcodeModalTimerRef.current);
      // 12-13 digit barcode scan: short delay to allow 13th digit, then act
      if (/^\d{12,13}$/.test(searchTerm)) {
        barcodeModalTimerRef.current = setTimeout(() => {
          const currentTerm = _searchTermRef.current;
          if (currentTerm !== searchTerm) return;
          const normalized = normalizeBarcode(searchTerm) || searchTerm;
          const exactMatch = results.find((r) => r.id === searchTerm || r.id === normalized || r.primaryBarcode === searchTerm || r.primaryBarcode === normalized || (r.barcodes || []).includes(searchTerm) || (r.barcodes || []).includes(normalized));
          if (exactMatch) {
            inventoryItemSelected(exactMatch);
          } else {
            let newItem = cloneDeep(INVENTORY_ITEM_PROTO);
            let barcode = searchTerm || generateEAN13Barcode();
            newItem.id = barcode;
            newItem.primaryBarcode = barcode;
            _scanNotFoundRef.current = true;
            _setModalItem(newItem);
          }
          _setSearchTerm("");
          _setSearchResults([]);
        }, searchTerm.length === 13 ? 100 : 200);
        return;
      }
      _setSearchResults(results);
    });
  };

  function handleQuickButtonPress(buttonObj, e) {
    _setCanvasSelectedItemId(null);
    // Intercept $LABOR and $ITEM buttons
    if (buttonObj.id === "labor" || buttonObj.id === "item") {
      const openWorkorder = useOpenWorkordersStore.getState().getOpenWorkorder();
      if (!openWorkorder) return;
      const statuses = useSettingsStore.getState().settings?.statuses;
      if (resolveStatus(openWorkorder.status, statuses)?.label?.toLowerCase() === "done & paid") return;
      let anchorX = 0, anchorY = 0;
      if (e?.nativeEvent) {
        anchorX = e.nativeEvent.pageX || e.nativeEvent.clientX || 0;
        anchorY = e.nativeEvent.pageY || e.nativeEvent.clientY || 0;
      } else if (e?.pageX != null) {
        anchorX = e.pageX;
        anchorY = e.pageY;
      }
      _setCustomItemModal({ type: buttonObj.id, anchorX, anchorY });
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
      else console.log("[Options_Inventory QB] MISSING inventory item for entry:", JSON.stringify(entry), "resolved id:", id);
    });
    let hasItems = items.length > 0;

    if (hasChildren) {
      // Already-active root button — clear search if active, otherwise no-op
      if (!buttonObj.parentID && sMenuPath.length > 0 && sMenuPath[0].id === buttonObj.id) {
        if (sSearchTerm) {
          _setSearchTerm("");
          _setSearchResults([]);
        }
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
      // Leaf button (no children)
      if (sSelectedButtonID === buttonObj.id) {
        if (sSearchTerm) {
          _setSearchTerm("");
          _setSearchResults([]);
        }
        return;
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
    _setCanvasEditMode(false);
    _setCanvasSelectedItemId(null);
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

      const replaceLineID = useOpenWorkordersStore.getState().placeholderReplaceLineID;
      if (replaceLineID) {
        const replaceIndex = workorderLines.findIndex((l) => l.id === replaceLineID);
        if (replaceIndex !== -1) {
          workorderLines = cloneDeep(workorderLines);
          const { _score, ...cleanItem } = item;
          if (cleanItem.minutes > 0 && !cleanItem.price) {
            const laborRate = useSettingsStore.getState().settings?.laborRateByHour || 0;
            cleanItem.price = Math.round((cleanItem.minutes / 60) * laborRate);
          }
          workorderLines[replaceIndex] = { ...workorderLines[replaceIndex], inventoryItem: cleanItem };
          if (workorderLines[replaceIndex].discountObj?.name) {
            workorderLines[replaceIndex] = applyDiscountToWorkorderItem(workorderLines[replaceIndex]);
          }
          useOpenWorkordersStore.setState({ placeholderReplaceLineID: null });
          useOpenWorkordersStore.getState().setField("workorderLines", workorderLines);
          return;
        }
        useOpenWorkordersStore.setState({ placeholderReplaceLineID: null });
      }

      const existingIndex = workorderLines.findIndex((l) => l.inventoryItem?.id === item.id);
      const existingHasDiscount = existingIndex !== -1 && !!workorderLines[existingIndex].discountObj?.name;
      if (existingIndex !== -1 && !existingHasDiscount) {
        workorderLines = cloneDeep(workorderLines);
        workorderLines[existingIndex].qty = (workorderLines[existingIndex].qty || 1) + 1;
      } else {
        let lineItem = cloneDeep(WORKORDER_ITEM_PROTO);
        const { _score, ...cleanItem } = item;
        if (cleanItem.minutes > 0 && !cleanItem.price) {
          const laborRate = useSettingsStore.getState().settings?.laborRateByHour || 0;
          cleanItem.price = Math.round((cleanItem.minutes / 60) * laborRate);
        }
        lineItem.inventoryItem = cleanItem;
        lineItem.id = crypto.randomUUID();
        workorderLines = [...workorderLines, lineItem];
        // Track newly added line so intake notes auto-open
        if (!useOpenWorkordersStore._newLineIDs) useOpenWorkordersStore._newLineIDs = new Set();
        useOpenWorkordersStore._newLineIDs.add(lineItem.id);
      }
      useOpenWorkordersStore
        .getState()
        .setField("workorderLines", workorderLines);

      // auto customer note
      const autoNoteTexts = useSettingsStore.getState().settings?.autoCustomerNoteTexts || [];
      const autoNote = autoNoteTexts.find((n) => n.inventoryItemID === item.id);
      if (autoNote) {
        let customerNotes = openWorkorder.customerNotes || [];
        let currentUser = useLoginStore.getState().currentUser;
        let userName = currentUser
          ? "(" + currentUser.first + " " + (currentUser.last?.[0] || "") + ")  "
          : "(Auto)";
        let notesChanged = false;

        // text auto-note
        if (autoNote.text && autoNote.text.trim()) {
          const alreadyHasNote = customerNotes.some((n) => n.autoNoteItemID === item.id);
          if (!alreadyHasNote) {
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
            notesChanged = true;
          }
        }

        // quick note auto-notes
        if (autoNote.quickNoteIDs && autoNote.quickNoteIDs.length > 0) {
          const quickNotes = useSettingsStore.getState().settings?.customerQuickNotes || [];
          autoNote.quickNoteIDs.forEach((qnID) => {
            const alreadyHas = customerNotes.some((n) => n.quickNoteItemId === qnID);
            if (alreadyHas) return;
            let noteItem = null;
            quickNotes.forEach((cat) => {
              let found = (cat.items || []).find((i) => i.id === qnID);
              if (found) noteItem = found;
            });
            if (!noteItem) return;
            customerNotes = [
              ...customerNotes,
              {
                name: userName,
                userID: currentUser?.id || "",
                value: noteItem.text || noteItem.buttonLabel,
                id: crypto.randomUUID(),
                quickNoteItemId: qnID,
              },
            ];
            notesChanged = true;
          });
        }

        if (notesChanged) {
          useOpenWorkordersStore.getState().setField("customerNotes", customerNotes);
        }
      }
    });
  }

  function openNoteHelperDropdown(item, event) {
    if (!zNoteHelpers || zNoteHelpers.length === 0) return;
    const openWorkorder = useOpenWorkordersStore.getState().getOpenWorkorder();
    if (!openWorkorder) return;
    const lines = openWorkorder.workorderLines || [];
    const line = lines.find((l) => l.inventoryItem?.id === item.id);
    if (!line) return;
    let x = 0, y = 0;
    if (event?.pageX != null) { x = event.pageX; y = event.pageY; }
    else if (event?.nativeEvent) { x = event.nativeEvent.pageX || 0; y = event.nativeEvent.pageY || 0; }
    _setNoteHelperDropdown({ workorderLine: line, anchorX: x, anchorY: y });
  }

  function handleNoteHelperUpdate(updatedLine) {
    const openWorkorder = useOpenWorkordersStore.getState().getOpenWorkorder();
    if (!openWorkorder) return;
    const updatedLines = replaceOrAddToArr(openWorkorder.workorderLines || [], updatedLine);
    useOpenWorkordersStore.getState().setField("workorderLines", updatedLines);
    _setNoteHelperDropdown((prev) => prev ? { ...prev, workorderLine: updatedLine } : null);
  }

  function handleItemDoubleClickOrLongPress(item, event) {
    openNoteHelperDropdown(item, event);
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
      // Track newly added line so intake notes auto-open
      if (!useOpenWorkordersStore._newLineIDs) useOpenWorkordersStore._newLineIDs = new Set();
      useOpenWorkordersStore._newLineIDs.add(lineItem.id);
      useOpenWorkordersStore.getState().setField("workorderLines", workorderLines);
    });
  }

  function clearSearch() {
    _setSearchResults([]);
    _setSearchTerm("");
    _setCanvasEditMode(false);
    _setCanvasSelectedItemId(null);
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

  let canvasSelectedFontSize = 10;
  let canvasSelectedBgColor = "";
  let canvasSelectedTextColor = "";
  let canvasSelectedName = "";
  if (sCanvasEditMode && sCanvasSelectedItemId && sSelectedButtonID) {
    let activeEditBtn = (zQuickItemButtons || []).find((b) => b.id === sSelectedButtonID);
    if (activeEditBtn) {
      let editItems = (activeEditBtn.items || []).map(normalizeItemEntry);
      let selItem = editItems.find((it) => it.inventoryItemID === sCanvasSelectedItemId);
      if (selItem) {
        canvasSelectedFontSize = selItem.fontSize || 10;
        canvasSelectedBgColor = selItem.backgroundColor || "";
        canvasSelectedTextColor = selItem.textColor || "";
      }
      let invItem = (zInventoryArr || []).find((i) => i.id === sCanvasSelectedItemId);
      if (invItem) canvasSelectedName = invItem.informalName || invItem.formalName || "";
    }
  }

  let existingColorSchemes = [];
  if (sCanvasEditMode && sCanvasSelectedItemId) {
    let seen = new Set();
    (zQuickItemButtons || []).forEach((btn) => {
      (btn.items || []).map(normalizeItemEntry).forEach((it) => {
        if (!it.backgroundColor || it.inventoryItemID === sCanvasSelectedItemId) return;
        let key = it.backgroundColor + "|" + (it.textColor || "");
        if (seen.has(key)) return;
        seen.add(key);
        let inv = (zInventoryArr || []).find((i) => i.id === it.inventoryItemID);
        let name = inv ? (inv.informalName || inv.formalName || "Item") : "Item";
        existingColorSchemes.push({ backgroundColor: it.backgroundColor, textColor: it.textColor || C.text, name });
      });
    });
  }

  // Show loading state until all data is ready and component is ready
  if (!isDataLoaded || !isReady) {
    return (
      <div className={styles.loadingSplash}>
        <div className={styles.loadingSplashText}>
          {/* Loading Quick Items... */}
        </div>
      </div>
    );
  }
  return (
    <div className={styles.container}>
      {/* {isInventoryLocked && (
        <StaleBanner
          text="Sale in Progress - Workorder Locked"
          style={{ marginHorizontal: 4, marginTop: 3, marginBottom: 3, backgroundColor: "black" }}
          textStyle={{ color: "#FFD600" }}
        />
      )} */}
      <div className={`${styles.lockOverlay} ${isInventoryLocked ? styles.lockOverlayLocked : ""}`}>
      {sCanvasEditMode && sSelectedButtonID ? (
        <div className={styles.editBar}>
          <span className={styles.editBarText}>
            Drag edges to resize; use hand icon to move card; and right-click to save & exit.
          </span>
          {sCanvasSelectedItemId && (
            <div className={styles.editBarControls}>
              <DomTooltip text="Card Colors" position="bottom">
                <button
                  type="button"
                  className={`${styles.editBarIconBtn} ${styles.editBarIconBtnSpacer}`}
                  onClick={(e) => {
                    _setColorPickerAnchor({ x: e.pageX || 0, y: e.pageY || 0 });
                    _setShowColorPickerModal(true);
                  }}
                >
                  <DomImage icon={ICONS.colorWheel} size={18} />
                </button>
              </DomTooltip>
              <span className={styles.editBarLabel}>Font size:</span>
              <button
                type="button"
                className={styles.editBarIconBtn}
                onClick={() => quickCanvasRef.current?.fontSizeSelected(-1)}
              >
                <span className={styles.editBarFontSizeGlyph} style={{ color: C.text }}>A-</span>
              </button>
              <span className={styles.editBarFontSizeValue} style={{ color: C.text }}>
                {canvasSelectedFontSize}
              </span>
              <button
                type="button"
                className={styles.editBarIconBtn}
                onClick={() => quickCanvasRef.current?.fontSizeSelected(1)}
              >
                <span className={styles.editBarFontSizeGlyph} style={{ color: C.text }}>A+</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className={headerStyles.header}>
          <button
            type="button"
            className={`${headerStyles.iconBtn} ${headerStyles.resetBtn}`}
            onClick={() => clearSearch()}
            disabled={!sSearchTerm}
          >
            <img src={ICONS.reset1} alt="" className={headerStyles.icon} />
          </button>
          <input
            type="text"
            autoFocus
            className={headerStyles.input}
            placeholder="Search inventory"
            value={sSearchTerm}
            onChange={(e) => handleSearch(e.target.value)}
          />
          <DomTooltip text="New Item" position="bottom">
            <button
              type="button"
              className={`${headerStyles.iconBtn} ${headerStyles.newBtn}`}
              onClick={() => {
                let newItem = cloneDeep(INVENTORY_ITEM_PROTO);
                let barcode = generateEAN13Barcode();
                newItem.id = barcode;
                newItem.primaryBarcode = barcode;
                _setModalItem(newItem);
              }}
            >
              <img src={ICONS.new} alt="" className={headerStyles.newIcon} />
            </button>
          </DomTooltip>
        </div>
      )}
      <div className={styles.body}>
        {/** Left column - ALWAYS shows root-level buttons */}
        <div className={styles.leftCol} ref={leftColRef} key={sLeftColWidth}>
          {zQuickItemButtons
            ?.filter((b) => !b.parentID)
            .map((item) => {
              const isActive =
                sSelectedButtonID === item.id ||
                (sMenuPath.length > 0 && sMenuPath[0].id === item.id);
              const isLaborOrItem = item.id === "labor" || item.id === "item";
              const isDisabled = isLaborOrItem && !zOpenWorkorderID;
              const gradientArr = isDisabled
                ? COLOR_GRADIENTS.grey
                : isActive
                ? ["rgb(245,166,35)", "rgb(245,166,35)"]
                : (isLaborOrItem || item.id === "common")
                ? COLOR_GRADIENTS.green
                : COLOR_GRADIENTS.blue;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={isDisabled}
                  className={`${styles.rootBtn} ${item.id === "common" ? styles.rootBtnCommon : ""}`}
                  style={{
                    background: `linear-gradient(to right, ${gradientArr[0]}, ${gradientArr[1]})`,
                  }}
                  onClick={(e) => handleQuickButtonPress(item, e)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    handleQuickButtonPress(item);
                    _setForceEditMode(true);
                    _setCanvasEditMode(true);
                  }}
                >
                  <RootButtonLabel
                    text={item.name.toUpperCase()}
                    fontSize={getQuickButtonFontSize(item.name, 14)}
                    styles={styles}
                  />
                </button>
              );
            })}
        </div>

        {/** Right panel - breadcrumbs + wrapping buttons + FlatList */}
        <div className={styles.rightCol}>
          {/** Section 1: Breadcrumbs + Back button (only when sub-menu is open) */}
          {sCurrentParentID !== null && (
            <div className={styles.crumbBar}>
              {sMenuPath.map((crumb, i) => {
                const isCurrent = i === sMenuPath.length - 1;
                return (
                  <div key={crumb.id} className={styles.crumbCell}>
                    {i > 0 && <span className={styles.crumbSep}>{">"}</span>}
                    <button
                      type="button"
                      className={`${styles.crumbLink} ${isCurrent ? styles.crumbLinkCurrent : styles.crumbLinkTrail}`}
                      onClick={() => {
                        const newPath = sMenuPath.slice(0, i + 1);
                        _setMenuPath(newPath);
                        _setCurrentParentID(crumb.id);
                        const crumbBtn = (zQuickItemButtons || []).find((b) => b.id === crumb.id);
                        const items = [];
                        crumbBtn?.items?.forEach((entry) => {
                          const id = typeof entry === "string" ? entry : entry.inventoryItemID;
                          const item = zInventoryArr.find((inv) => inv.id === id);
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
                      {(crumb.name || "(unnamed)").toUpperCase()}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/** Section 2: Wrapping child buttons (only when sub-menu has children) */}
          {currentChildren.length > 0 && (
            <div className={styles.subMenuRow}>
              {currentChildren.map((btn) => {
                let isSelected = sSelectedButtonID === btn.id;
                return (
                  <button
                    key={btn.id}
                    type="button"
                    className={styles.subMenuBtn}
                    style={{
                      background: isSelected
                        ? "rgb(240, 200, 40)"
                        : `linear-gradient(to right, ${C.green}, ${C.green})`,
                      fontSize: getQuickButtonFontSize(btn.name, 12),
                    }}
                    onClick={(e) => handleQuickButtonPress(btn, e)}
                  >
                    {btn.name.toUpperCase() + (isSelected ? " \u25BC" : " \u25B6")}
                  </button>
                );
              })}
            </div>
          )}

          {/** Section 3: Canvas (quick button selected) or list (search results) */}
          {sSelectedButtonID && !sSearchTerm ? (
            (() => {
              let activeBtn = (zQuickItemButtons || []).find((b) => b.id === sSelectedButtonID);
              if (!activeBtn || !activeBtn.items || activeBtn.items.length === 0) {
                return (
                  <div className={styles.emptyState}>
                    <DomImage icon={ICONS.info} size={40} />
                    <div className={styles.emptyStateText}>No items in menu</div>
                  </div>
                );
              }
              return (
                <QuickItemCanvas
                  ref={quickCanvasRef}
                  buttonObj={activeBtn}
                  zInventoryArr={zInventoryArr}
                  zQuickItemButtons={zQuickItemButtons}
                  zWorkorderLines={zOpenWorkorder?.workorderLines}
                  onItemPress={inventoryItemSelected}
                  onItemDoubleClick={handleItemDoubleClickOrLongPress}
                  onInfoPress={handleInventoryInfoPress}
                  forceEditMode={sForceEditMode}
                  onForceEditConsumed={() => _setForceEditMode(false)}
                  onEditStateChange={(editMode, selectedId) => {
                    _setCanvasEditMode(editMode);
                    _setCanvasSelectedItemId(selectedId);
                  }}
                />
              );
            })()
          ) : sSearchResults.length === 0 && sSelectedButtonID && !sSearchTerm ? (
            <div className={styles.emptyState}>
              <DomImage icon={ICONS.info} size={40} />
              <div className={styles.emptyStateText}>No items in menu</div>
            </div>
          ) : (
            <div className={styles.resultsList}>
              {sSearchResults.slice(0, 50).map((cached, index) => {
                const item = zInventoryArr.find((i) => i.id === cached.id) || cached;
                const activeBtn = sSelectedButtonID
                  ? (zQuickItemButtons || []).find((b) => b.id === sSelectedButtonID)
                  : null;
                const dividerObj = (activeBtn?.dividers || []).find((d) => d.itemID === item.id);
                return (
                  <React.Fragment key={item.id}>
                    {dividerObj && (
                      <div className={styles.divider}>
                        <div className={styles.dividerBar} />
                        {!!dividerObj.label && (
                          <div className={styles.dividerLabel}>{dividerObj.label}</div>
                        )}
                      </div>
                    )}
                    <div
                      className={`${styles.resultsRow} ${index % 2 === 0 ? styles.resultsRowEven : styles.resultsRowOdd}`}
                      style={{
                        borderLeftColor:
                          item.category === "Labor"
                            ? lightenRGBByPercent(C.orange, 15)
                            : lightenRGBByPercent(C.green, 15),
                      }}
                    >
                      {!!zOpenWorkorderID && (
                        <div className={styles.infoBtn}>
                          <button
                            type="button"
                            className={styles.infoIconBtn}
                            onClick={() => handleInventoryInfoPress(item)}
                          >
                            <img src={ICONS.info} alt="" className={styles.infoIconImg} />
                          </button>
                        </div>
                      )}
                      <div
                        className={styles.resultsRowBody}
                        style={{ width: zOpenWorkorderID ? "95%" : "100%" }}
                        onClick={(e) => {
                          const now = Date.now();
                          if (lastClickItemRef.current === item.id && now - lastClickTimeRef.current < 500) {
                            lastClickTimeRef.current = 0;
                            lastClickItemRef.current = null;
                            openNoteHelperDropdown(item, e);
                          } else {
                            lastClickTimeRef.current = now;
                            lastClickItemRef.current = item.id;
                            inventoryItemSelected(item);
                          }
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          openNoteHelperDropdown(item, e);
                        }}
                      >
                        <div className={styles.resultsRowName}>
                          {item.informalName || item.formalName}
                          {!!item.informalName && !sSelectedButtonID && (
                            <div className={styles.resultsRowFormal}>{item.formalName}</div>
                          )}
                        </div>
                        <div className={styles.resultsRowPriceCol}>
                          <div className={styles.resultsRowPriceLine}>
                            {"$ "}
                            <span className={styles.resultsRowPrice}>{formatCurrencyDisp(item.price)}</span>
                          </div>
                          {!!item.salePrice && (
                            <div
                              className={styles.resultsRowSalePriceLine}
                              style={{ color: lightenRGBByPercent(C.red, 60) }}
                            >
                              {"$ "}
                              <span style={{ fontSize: 12, color: C.red }}>
                                {formatCurrencyDisp(item.salePrice)}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </div>
        {sModalItem && (
          <Suspense fallback={null}>
            <InventoryItemModalScreen
              key={sModalItem.id}
              item={sModalItem}
              isNew={!!(sModalItem.id && !sModalItem.formalName)}
              handleExit={() => {
                const wasScanNotFound = _scanNotFoundRef.current;
                const itemID = sModalItem?.id;
                _scanNotFoundRef.current = false;
                _setModalItem(null);
                if (wasScanNotFound && itemID) {
                  const savedItem = useInventoryStore.getState().getInventoryItem(itemID);
                  if (savedItem?.formalName?.trim() && useOpenWorkordersStore.getState().getOpenWorkorder()) {
                    inventoryItemSelected(savedItem);
                  }
                }
              }}
            />
          </Suspense>
        )}
        {!!sCustomItemModal && (
          <Suspense fallback={null}>
            <CustomItemModal
              visible={!!sCustomItemModal}
              onClose={() => _setCustomItemModal(null)}
              onSave={handleCustomItemSave}
              type={sCustomItemModal?.type}
              anchorX={sCustomItemModal?.anchorX || 0}
              anchorY={sCustomItemModal?.anchorY || 0}
            />
          </Suspense>
        )}
        <NoteHelper
          visible={!!sNoteHelperDropdown}
          onClose={() => _setNoteHelperDropdown(null)}
          workorderLine={sNoteHelperDropdown?.workorderLine}
          onUpdateLine={handleNoteHelperUpdate}
          anchorX={sNoteHelperDropdown?.anchorX || 0}
          anchorY={sNoteHelperDropdown?.anchorY || 0}
          noteHelpers={zNoteHelpers || []}
        />
        {sShowColorPickerModal && (
          <Suspense fallback={null}>
            <ColorPickerModal
              onClose={() => _setShowColorPickerModal(false)}
              onSave={(bg, text) => {
                quickCanvasRef.current?.setColorSelected(bg, text);
              }}
              title="Edit Card Colors"
              previewText={canvasSelectedName || "Preview"}
              initialBgColor={canvasSelectedBgColor || C.buttonLightGreenOutline}
              initialTextColor={canvasSelectedTextColor || C.text}
              anchorPosition={sColorPickerAnchor}
              colorSchemes={existingColorSchemes}
            />
          </Suspense>
        )}
      </div>
      </div>
    </div>
  );
}

/*eslint-disable*/
import React, { useState, useRef, useCallback } from "react";
import ReactDOM from "react-dom";
import {
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from "react-native-web";
import {
  Button_,
  TextInput_,
  CheckBox_,
  DropdownMenu,
  Image_,
} from "../../../components";
import { C, COLOR_GRADIENTS, Fonts, ICONS } from "../../../styles";
import {
  formatCurrencyDisp,
  gray,
  lightenRGBByPercent,
  localStorageWrapper,
} from "../../../utils";
import { useSettingsStore, useInventoryStore, useAlertScreenStore } from "../../../stores";
import { dbSavePrintObj } from "../../../db_calls_wrapper";
import { workerSearchInventory } from "../../../inventorySearchManager";
import { cloneDeep } from "lodash";
import { labelPrintBuilder } from "../../../shared/labelPrintBuilder";

// ─── Constants ──────────────────────────────────────────────────────────────

const LABEL_SIZES = [
  { name: '2.25" x 1.25"', width: 464, height: 254 },
  { name: '2.25" x 0.75"', width: 464, height: 152 },
  { name: '2" x 1"', width: 406, height: 203 },
  { name: '1.25" x 1"', width: 254, height: 203 },
  { name: '3" x 1"', width: 609, height: 203 },
  { name: '3" x 2"', width: 609, height: 406 },
  { name: '4" x 6"', width: 812, height: 1218 },
  { name: '4" x 2"', width: 812, height: 406 },
];

const AVAILABLE_FIELDS = [
  { name: "formalName", label: "Product Name", type: "text", placeholder: "Tire Kenda Kwick Trax 700x35 Continental Gatorskin Folding" },
  { name: "informalName", label: "Product Short Name", type: "text", placeholder: "Kwick Trax 700x35" },
  { name: "brand", label: "Brand", type: "text", placeholder: "Continental" },
  { name: "id", label: "Barcode Number", type: "text", placeholder: "4827103956281" },
  { name: "price", label: "Price", type: "text", placeholder: "$49.99" },
  { name: "salePrice", label: "Sale Price", type: "text", placeholder: "$39.99" },
  { name: "salePriceLabel", label: '"Sale Price" Text', type: "text", placeholder: "Sale Price" },
  { name: "regPriceLabel", label: '"Reg. Price" Text', type: "text", placeholder: "Reg. Price" },
  { name: "storeDisplayName", label: "Store Name", type: "text", placeholder: "Bonita Bikes" },
  { name: "barcode", label: "Barcode", type: "barcode" },
];

const DEFAULT_TEXT_FIELD = {
  type: "text",
  x: 20,
  y: 20,
  width: 200,
  height: 60,
  fontSize: 30,
  bold: false,
  align: "center",
};

const DEFAULT_BARCODE_DATA_LENGTH = 13; // EAN-13

const DEFAULT_BARCODE_FIELD = {
  type: "barcode",
  x: 20,
  y: 20,
  width: 211, // module 1 for 13-char barcode
  height: 60,
};

const MAX_CANVAS_WIDTH = 520;
const MAX_CANVAS_HEIGHT = 380;

// ─── Helpers ────────────────────────────────────────────────────────────────

function slugify(name) {
  return (name || "untitled").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "untitled";
}

function getBarcodeValidWidths(dataLength) {
  let len = dataLength || DEFAULT_BARCODE_DATA_LENGTH;
  let base = (len + 3) * 11 + 35;
  let widths = [];
  for (let m = 1; m <= 10; m++) widths.push(m * base);
  return widths;
}

function snapBarcodeWidth(rawWidth, dataLength) {
  let valid = getBarcodeValidWidths(dataLength);
  let closest = valid[0];
  let minDist = Math.abs(rawWidth - closest);
  for (let i = 1; i < valid.length; i++) {
    let dist = Math.abs(rawWidth - valid[i]);
    if (dist < minDist) { closest = valid[i]; minDist = dist; }
  }
  return closest;
}

function cleanField(field) {
  let f = { type: field.type, x: Number(field.x) || 0, y: Number(field.y) || 0 };
  if (field.type === "barcode") {
    f.width = snapBarcodeWidth(Number(field.width) || 211);
    f.height = Number(field.height) || 60;
  } else {
    f.width = Number(field.width) || 200;
    f.height = Number(field.height) || 60;
    f.fontSize = Number(field.fontSize) || 30;
    f.bold = field.bold === true || field.bold === "true";
    f.align = field.align || "center";
  }
  f.name = field.name;
  return f;
}

// ─── Sub-Components ─────────────────────────────────────────────────────────

const HANDLE_SIZE = 8;
const HANDLE_STYLE_BASE = {
  position: "absolute",
  width: HANDLE_SIZE,
  height: HANDLE_SIZE,
  backgroundColor: C.blue,
  borderRadius: 1,
  zIndex: 2,
};

function ResizeHandle({ position, onResizeStart }) {
  let cursorMap = { n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize", ne: "nesw-resize", nw: "nwse-resize", se: "nwse-resize", sw: "nesw-resize" };
  let posStyle = {};
  let half = -(HANDLE_SIZE / 2);
  if (position.includes("n")) posStyle.top = half;
  if (position.includes("s")) posStyle.bottom = half;
  if (position.includes("e")) posStyle.right = half;
  if (position.includes("w")) posStyle.left = half;
  if (position === "n" || position === "s") { posStyle.left = "50%"; posStyle.marginLeft = half; }
  if (position === "e" || position === "w") { posStyle.top = "50%"; posStyle.marginTop = half; }
  return (
    <div
      onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); onResizeStart(e, position); }}
      style={{ ...HANDLE_STYLE_BASE, ...posStyle, cursor: cursorMap[position] }}
    />
  );
}

function CanvasField({ field, scale, isSelected, onSelect, onDragStart, onResizeStart, canvasW }) {
  let fieldDef = AVAILABLE_FIELDS.find((af) => af.name === field.name);
  let displayLabel = field.type === "barcode" ? "4827103956281" : (fieldDef?.placeholder || fieldDef?.label || field.name);

  function handleMouseDown(e) {
    e.stopPropagation();
    e.preventDefault();
    onSelect();
    onDragStart(e);
  }

  let handles = isSelected ? ["n", "s", "e", "w", "ne", "nw", "se", "sw"].map((pos) => (
    <ResizeHandle key={pos} position={pos} onResizeStart={onResizeStart} />
  )) : null;

  if (field.type === "barcode") {
    return (
      <div
        onMouseDown={handleMouseDown}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "absolute",
          left: field.x * scale,
          top: field.y * scale,
          cursor: isSelected ? "grab" : "pointer",
          userSelect: "none",
          border: isSelected ? "2px dashed " + C.blue : "2px solid transparent",
          backgroundColor: isSelected ? lightenRGBByPercent(C.blue, 85) : "transparent",
          padding: 2,
        }}
      >
        {handles}
        <div style={{ width: field.width * scale, height: field.height * scale, display: "flex", flexDirection: "row", alignItems: "stretch" }}>
          {Array.from({ length: 30 }).map((_, i) => (
            <div
              key={i}
              style={{
                flex: i % 3 === 0 ? 2 : 1,
                backgroundColor: i % 2 === 0 ? "black" : "white",
                height: "100%",
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  // Text field — Arial font at actual fontSize (no 0.75 factor)
  let scaledFontSize = Math.max(8, (field.fontSize || 30) * scale);
  let scaledW = (field.width || 200) * scale;
  let scaledH = (field.height || 60) * scale;
  return (
    <div
      onMouseDown={handleMouseDown}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        left: field.x * scale,
        top: field.y * scale,
        width: scaledW,
        height: scaledH,
        fontSize: scaledFontSize,
        fontFamily: "Arial",
        fontWeight: field.bold ? "bold" : "normal",
        color: isSelected ? C.blue : C.text,
        border: isSelected ? "2px dashed " + C.blue : "2px solid transparent",
        backgroundColor: isSelected ? lightenRGBByPercent(C.blue, 85) : "transparent",
        padding: "1px 3px",
        cursor: isSelected ? "grab" : "pointer",
        userSelect: "none",
        wordBreak: "break-word",
        textAlign: field.align || "center",
        overflow: "hidden",
        boxSizing: "border-box",
      }}
    >
      {handles}
      {displayLabel}
    </div>
  );
}

function FieldPalette({ fields, onAddField, onRemoveField }) {
  let fieldNamesOnCanvas = fields.map((f) => f.name);

  return (
    <View style={{ width: "15%", minWidth: 120, paddingRight: 10 }}>
      <Text style={{ fontSize: 13, fontWeight: Fonts.weight.textHeavy, color: C.text, marginBottom: 8 }}>
        FIELDS
      </Text>
      {AVAILABLE_FIELDS.map((af) => {
        let isOnCanvas = fieldNamesOnCanvas.includes(af.name);
        return (
          <TouchableOpacity
            key={af.name}
            onPress={() => {
              if (isOnCanvas) return;
              onAddField(af);
            }}
            style={{
              paddingVertical: 6,
              paddingHorizontal: 8,
              marginBottom: 4,
              borderRadius: 5,
              backgroundColor: isOnCanvas ? gray(0.92) : C.buttonLightGreen,
              borderWidth: 1,
              borderColor: isOnCanvas ? gray(0.8) : C.buttonLightGreenOutline,
              opacity: isOnCanvas ? 0.5 : 1,
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 12, color: isOnCanvas ? gray(0.5) : C.text }}>
              {af.label}
            </Text>
            {isOnCanvas && (
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  onRemoveField(af.name);
                }}
                style={{ paddingLeft: 6 }}
              >
                <Text style={{ fontSize: 11, color: C.red, fontWeight: "bold" }}>X</Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function PropertiesPanel({ field, onUpdate, onRemove, labelWidth }) {
  if (!field) {
    return (
      <View style={{ width: "22%", minWidth: 160, paddingLeft: 15, justifyContent: "center", alignItems: "center" }}>
        <Text style={{ fontSize: 12, color: gray(0.5), textAlign: "center" }}>
          Select a field on the canvas to edit its properties
        </Text>
      </View>
    );
  }

  function handleChange(key, value) {
    onUpdate({ ...field, [key]: value });
  }

  let isBarcode = field.type === "barcode";

  return (
    <View style={{ width: "22%", minWidth: 160, paddingLeft: 15 }}>
      <Text style={{ fontSize: 13, fontWeight: Fonts.weight.textHeavy, color: C.text, marginBottom: 8 }}>
        {field.name.toUpperCase()}
      </Text>

      {/* Position display */}
      <View style={{ marginBottom: 10 }}>
        <Text style={{ fontSize: 11, color: gray(0.5), marginBottom: 2 }}>Position</Text>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={{ fontSize: 12, color: C.text }}>X: {field.x}  Y: {field.y}</Text>
        </View>
        <Text style={{ fontSize: 10, color: gray(0.6), marginTop: 2 }}>Arrow keys to move (Shift = fine)</Text>
      </View>

      {isBarcode ? (
        <>
          {/* Width — steps through valid barcode widths, filtered by label width */}
          <PropRow label="Width" value={field.width}>
            <StepperButtons
              onMinus={() => {
                let valid = getBarcodeValidWidths().filter((w) => w <= (labelWidth || 9999));
                if (valid.length === 0) return;
                let idx = valid.indexOf(field.width);
                if (idx === -1) { handleChange("width", valid[0]); return; }
                if (idx > 0) handleChange("width", valid[idx - 1]);
              }}
              onPlus={() => {
                let valid = getBarcodeValidWidths().filter((w) => w <= (labelWidth || 9999));
                if (valid.length === 0) return;
                let idx = valid.indexOf(field.width);
                if (idx === -1) { handleChange("width", valid[0]); return; }
                if (idx < valid.length - 1) handleChange("width", valid[idx + 1]);
              }}
            />
          </PropRow>

          {/* Height */}
          <PropRow label="Height" value={field.height}>
            <StepperButtons
              onMinus={() => handleChange("height", Math.max(20, field.height - 10))}
              onPlus={() => handleChange("height", field.height + 10)}
            />
          </PropRow>
        </>
      ) : (
        <>
          {/* Width */}
          <PropRow label="Width" value={field.width || 200}>
            <StepperButtons
              onMinus={() => handleChange("width", Math.max(40, (field.width || 200) - 20))}
              onPlus={() => handleChange("width", (field.width || 200) + 20)}
            />
          </PropRow>

          {/* Height */}
          <PropRow label="Height" value={field.height || 60}>
            <StepperButtons
              onMinus={() => handleChange("height", Math.max(20, (field.height || 60) - 10))}
              onPlus={() => handleChange("height", (field.height || 60) + 10)}
            />
          </PropRow>

          {/* Font Size */}
          <PropRow label="Font Size" value={field.fontSize || 30}>
            <StepperButtons
              onMinus={() => handleChange("fontSize", Math.max(10, (field.fontSize || 30) - 5))}
              onPlus={() => handleChange("fontSize", (field.fontSize || 30) + 5)}
            />
          </PropRow>

          {/* Bold */}
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
            <CheckBox_
              isChecked={field.bold}
              onPress={() => handleChange("bold", !field.bold)}
            />
            <Text style={{ fontSize: 12, color: C.text, marginLeft: 6 }}>Bold</Text>
          </View>

          {/* Align */}
          <View style={{ marginBottom: 10 }}>
            <Text style={{ fontSize: 11, color: gray(0.5), marginBottom: 4 }}>Align</Text>
            <View style={{ flexDirection: "row" }}>
              {["left", "center", "right"].map((a) => (
                <TouchableOpacity
                  key={a}
                  onPress={() => handleChange("align", a)}
                  style={{
                    flex: 1,
                    paddingVertical: 5,
                    borderRadius: 4,
                    borderWidth: 1,
                    borderColor: (field.align || "center") === a ? C.blue : gray(0.8),
                    backgroundColor: (field.align || "center") === a ? lightenRGBByPercent(C.blue, 85) : "transparent",
                    marginRight: a !== "right" ? 4 : 0,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ fontSize: 11, color: (field.align || "center") === a ? C.blue : C.text, fontWeight: (field.align || "center") === a ? "bold" : "normal" }}>
                    {a.charAt(0).toUpperCase() + a.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </>
      )}

      {/* Remove */}
      <Button_
        text="Remove Field"
        onPress={onRemove}
        colorGradientArr={COLOR_GRADIENTS.red}
        style={{ marginTop: 15 }}
        textStyle={{ fontSize: 12 }}
      />
    </View>
  );
}

function PropRow({ label, value, children }) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ fontSize: 11, color: gray(0.5), marginBottom: 2 }}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        {children}
        <Text style={{ fontSize: 13, color: C.text, marginLeft: 8, fontWeight: "500" }}>{value}</Text>
      </View>
    </View>
  );
}

function StepperButtons({ onMinus, onPlus }) {
  let btnStyle = {
    width: 28,
    height: 28,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: C.buttonLightGreenOutline,
    backgroundColor: C.buttonLightGreen,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 4,
  };
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <TouchableOpacity onPress={onMinus} style={btnStyle}>
        <Text style={{ fontSize: 16, fontWeight: "bold", color: C.text }}>-</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onPlus} style={btnStyle}>
        <Text style={{ fontSize: 16, fontWeight: "bold", color: C.text }}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

function PrintSearchOverlay({ onSelect, onClose }) {
  const [sSearchText, _setSearchText] = useState("");
  const [sResults, _setResults] = useState([]);

  function handleSearch(text) {
    _setSearchText(text);
    if (!text || !text.trim()) {
      _setResults([]);
      return;
    }
    workerSearchInventory(text, (results) => {
      _setResults(results.slice(0, 30));
    });
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        zIndex: 1001,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 450,
          maxHeight: "70%",
          backgroundColor: C.backgroundWhite,
          borderRadius: 12,
          padding: 20,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Text style={{ fontSize: 15, fontWeight: Fonts.weight.textHeavy, color: C.text, marginBottom: 10 }}>
          Select Product to Print
        </Text>
        <TextInput_
          placeholder="Search inventory..."
          value={sSearchText}
          onChangeText={handleSearch}
          style={{ marginBottom: 10 }}
        />
        <div style={{ flex: 1, overflowY: "auto", maxHeight: 350 }}>
          {sResults.map((item) => (
            <TouchableOpacity
              key={item.id}
              onPress={() => onSelect(item)}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 10,
                borderBottomWidth: 1,
                borderBottomColor: gray(0.9),
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, color: C.text }}>{item.formalName || "Unnamed"}</Text>
                <Text style={{ fontSize: 11, color: gray(0.5) }}>{item.brand || ""} {item.primaryBarcode ? " | " + item.primaryBarcode : ""}</Text>
              </View>
              <Text style={{ fontSize: 13, color: C.green, fontWeight: "500" }}>
                {formatCurrencyDisp(item.price, true)}
              </Text>
            </TouchableOpacity>
          ))}
          {sSearchText && sResults.length === 0 && (
            <Text style={{ fontSize: 12, color: gray(0.5), textAlign: "center", marginTop: 20 }}>
              No results
            </Text>
          )}
        </div>
        <Button_
          text="Cancel"
          onPress={onClose}
          colorGradientArr={COLOR_GRADIENTS.grey}
          style={{ marginTop: 10 }}
          textStyle={{ fontSize: 12 }}
        />
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export const LabelDesignerModalV2 = ({ handleExit, handleSettingsFieldChange }) => {
  const zSettingsObj = useSettingsStore((state) => state.settings);

  // Layout state
  const [sLabelSize, _setLabelSize] = useState(() => {
    let saved = zSettingsObj?.defaultLabelSize;
    if (saved) {
      let match = LABEL_SIZES.find((s) => s.width === saved.width && s.height === saved.height);
      if (match) return match;
    }
    return LABEL_SIZES[0];
  });
  const [sFields, _setFields] = useState([]);
  const [sSelectedFieldIdx, _setSelectedFieldIdx] = useState(null);
  const [sLayoutName, _setLayoutName] = useState("");
  const [sCurrentLayout, _setCurrentLayout] = useState(null);
  const [sCurrentSlug, _setCurrentSlug] = useState(null);
  const [sIsDirty, _setIsDirty] = useState(false);

  // Drag/resize state (ref to avoid re-renders during drag)
  const dragRef = useRef(null);
  const resizeRef = useRef(null);
  const canvasRef = useRef(null);

  const [sPrintSuccess, _setPrintSuccess] = useState(false);

  // Derived
  let templates = zSettingsObj?.labelTemplates || {};
  let templateEntries = Object.entries(templates);
  let quickPrintSlugs = zSettingsObj?.quickPrintLayouts || [];
  let isQuickPrint = sCurrentSlug ? quickPrintSlugs.includes(sCurrentSlug) : false;
  let selectedField = sSelectedFieldIdx !== null ? sFields[sSelectedFieldIdx] : null;
  let isDefaultSize = zSettingsObj?.defaultLabelSize?.width === sLabelSize.width && zSettingsObj?.defaultLabelSize?.height === sLabelSize.height;

  // Canvas scale
  let scaleX = MAX_CANVAS_WIDTH / sLabelSize.width;
  let scaleY = MAX_CANVAS_HEIGHT / sLabelSize.height;
  let scale = Math.min(scaleX, scaleY, 1);
  let canvasW = sLabelSize.width * scale;
  let canvasH = sLabelSize.height * scale;

  // ─── Handlers ─────────────────────────────────────────────────────

  function handleKeyDown(e) {
    if (sSelectedFieldIdx === null) return;
    let step = e.shiftKey ? 1 : 5;
    let field = sFields[sSelectedFieldIdx];
    let updated = { ...field };

    switch (e.key) {
      case "ArrowUp":
        updated.y = Math.max(0, field.y - step);
        break;
      case "ArrowDown":
        updated.y = Math.min(sLabelSize.height - 10, field.y + step);
        break;
      case "ArrowLeft":
        updated.x = Math.max(0, field.x - step);
        break;
      case "ArrowRight":
        updated.x = Math.min(sLabelSize.width - 10, field.x + step);
        break;
      default:
        return;
    }
    e.preventDefault();
    let newFields = [...sFields];
    newFields[sSelectedFieldIdx] = updated;
    _setFields(newFields);
    _setIsDirty(true);
  }

  function handleFieldDragStart(idx, e) {
    let rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = {
      idx,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startFieldX: sFields[idx].x,
      startFieldY: sFields[idx].y,
    };
    function onMouseMove(moveE) {
      let drag = dragRef.current;
      if (!drag) return;
      let dx = (moveE.clientX - drag.startMouseX) / scale;
      let dy = (moveE.clientY - drag.startMouseY) / scale;
      let newX = Math.round(Math.max(0, Math.min(sLabelSize.width - 10, drag.startFieldX + dx)));
      let newY = Math.round(Math.max(0, Math.min(sLabelSize.height - 10, drag.startFieldY + dy)));
      _setFields((prev) => {
        let updated = [...prev];
        updated[drag.idx] = { ...updated[drag.idx], x: newX, y: newY };
        return updated;
      });
    }
    function onMouseUp() {
      if (dragRef.current) {
        _setIsDirty(true);
        dragRef.current = null;
      }
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      canvasRef.current?.focus();
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  function handleFieldResizeStart(idx, e, position) {
    let field = sFields[idx];
    resizeRef.current = {
      idx,
      position,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startField: { ...field },
    };
    function onMouseMove(moveE) {
      let r = resizeRef.current;
      if (!r) return;
      let dx = (moveE.clientX - r.startMouseX) / scale;
      let dy = (moveE.clientY - r.startMouseY) / scale;
      _setFields((prev) => {
        let updated = [...prev];
        let f = { ...r.startField };
        let pos = r.position;
        // Height resize (all field types)
        if (pos.includes("s")) f.height = Math.max(20, Math.round(r.startField.height + dy));
        if (pos.includes("n")) {
          let newH = Math.max(20, Math.round(r.startField.height - dy));
          f.y = Math.max(0, Math.round(r.startField.y + (r.startField.height - newH)));
          f.height = newH;
        }
        // Width resize (text only — barcode width must use stepper for valid sizes)
        if (f.type !== "barcode") {
          if (pos.includes("e")) f.width = Math.max(40, Math.round(r.startField.width + dx));
          if (pos.includes("w")) {
            let newW = Math.max(40, Math.round(r.startField.width - dx));
            f.x = Math.max(0, Math.round(r.startField.x + (r.startField.width - newW)));
            f.width = newW;
          }
        }
        updated[r.idx] = f;
        return updated;
      });
    }
    function onMouseUp() {
      if (resizeRef.current) {
        _setIsDirty(true);
        resizeRef.current = null;
      }
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      canvasRef.current?.focus();
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  function handleAddField(availableField) {
    let nextY = 20 + sFields.length * 45;
    if (nextY > sLabelSize.height - 30) nextY = 20;
    let newField;
    if (availableField.type === "barcode") {
      newField = { ...DEFAULT_BARCODE_FIELD, name: availableField.name, y: nextY };
    } else {
      newField = { ...DEFAULT_TEXT_FIELD, name: availableField.name, y: nextY };
    }
    let newFields = [...sFields, newField];
    _setFields(newFields);
    _setSelectedFieldIdx(newFields.length - 1);
    _setIsDirty(true);
  }

  function handleRemoveField(fieldName) {
    let idx = sFields.findIndex((f) => f.name === fieldName);
    if (idx < 0) return;
    let newFields = sFields.filter((_, i) => i !== idx);
    _setFields(newFields);
    if (sSelectedFieldIdx === idx) _setSelectedFieldIdx(null);
    else if (sSelectedFieldIdx > idx) _setSelectedFieldIdx(sSelectedFieldIdx - 1);
    _setIsDirty(true);
  }

  function handleUpdateSelectedField(updatedField) {
    if (sSelectedFieldIdx === null) return;
    let newFields = [...sFields];
    newFields[sSelectedFieldIdx] = updatedField;
    _setFields(newFields);
    _setIsDirty(true);
  }

  function handleSaveLayout() {
    let name = sLayoutName || "Untitled Layout";
    let baseSlug = slugify(name);
    let existingTemplates = zSettingsObj?.labelTemplates || {};

    // Resolve unique slug (skip conflict check if same as current)
    let slug = baseSlug;
    if (existingTemplates[slug] && slug !== sCurrentSlug) {
      let counter = 2;
      while (existingTemplates[slug + "-" + counter]) counter++;
      slug = slug + "-" + counter;
    }

    let template = {
      name: name,
      labelWidth: sLabelSize.width,
      labelHeight: sLabelSize.height,
      fields: sFields.map(cleanField),
    };
    console.log("Save Layout:", JSON.stringify(template, null, 2));

    let updatedTemplates = { ...existingTemplates };

    // If slug changed (rename), remove old key and update quickPrintLayouts
    if (sCurrentSlug && sCurrentSlug !== slug) {
      delete updatedTemplates[sCurrentSlug];
      let qp = zSettingsObj?.quickPrintLayouts || [];
      if (qp.includes(sCurrentSlug)) {
        handleSettingsFieldChange("quickPrintLayouts", qp.map((id) => id === sCurrentSlug ? slug : id));
      }
    }

    updatedTemplates[slug] = template;
    handleSettingsFieldChange("labelTemplates", updatedTemplates);
    _setCurrentSlug(slug);
    _setCurrentLayout(template);
    _setIsDirty(false);
  }

  function migrateField(field) {
    let f = { ...field };
    // Migrate old barcode fields
    if (f.type === "barcode") {
      if (f.barcodeHeight && !f.height) f.height = Number(f.barcodeHeight);
      if (!f.width) f.width = 211;
      if (f.name === "primaryBarcode") f.name = "barcode";
      delete f.barcodeHeight;
      delete f.moduleWidth;
    }
    // Ensure numbers
    f.x = Number(f.x) || 0;
    f.y = Number(f.y) || 0;
    if (f.type === "barcode") {
      f.width = snapBarcodeWidth(Number(f.width) || 211);
      f.height = Number(f.height) || 60;
    } else {
      // Migrate old fontHeight/fontWidth to new fontSize/width/height
      if (f.fontHeight && !f.fontSize) f.fontSize = Number(f.fontHeight);
      if (!f.width) f.width = 200;
      if (!f.height) f.height = 60;
      f.width = Number(f.width) || 200;
      f.height = Number(f.height) || 60;
      f.fontSize = Number(f.fontSize) || 30;
      f.bold = f.bold === true || f.bold === "true";
      f.align = f.align || "center";
      delete f.fontHeight;
      delete f.fontWidth;
      delete f.maxWidth;
      delete f.letterSpacing;
    }
    return f;
  }

  function handleLoadLayout(slug, template) {
    let size =
      LABEL_SIZES.find(
        (s) => s.width === Number(template.labelWidth) && s.height === Number(template.labelHeight)
      ) || LABEL_SIZES[0];
    _setLabelSize(size);
    _setFields((template.fields || []).map(migrateField));
    _setLayoutName(template.name);
    _setCurrentLayout(template);
    _setCurrentSlug(slug);
    _setSelectedFieldIdx(null);
    _setIsDirty(false);
  }

  function handleDeleteLayout() {
    if (!sCurrentSlug) return;
    useAlertScreenStore.getState().setValues({
      title: "Delete Layout",
      message: 'Delete layout "' + (sCurrentLayout?.name || sCurrentSlug) + '"?',
      btn1Text: "Cancel",
      btn2Text: "Delete",
      handleBtn2Press: () => {
        let updatedTemplates = { ...(zSettingsObj?.labelTemplates || {}) };
        delete updatedTemplates[sCurrentSlug];
        handleSettingsFieldChange("labelTemplates", updatedTemplates);
        let currentQP = zSettingsObj?.quickPrintLayouts || [];
        if (currentQP.includes(sCurrentSlug)) {
          handleSettingsFieldChange("quickPrintLayouts", currentQP.filter((id) => id !== sCurrentSlug));
        }
        _setCurrentLayout(null);
        _setCurrentSlug(null);
        _setFields([]);
        _setLayoutName("");
        _setSelectedFieldIdx(null);
        _setIsDirty(false);
      },
    });
  }

  function handleExitPress() {
    if (sIsDirty) {
      useAlertScreenStore.getState().setValues({
        title: "Unsaved Changes",
        message: "You have unsaved changes. Exit anyway?",
        btn1Text: "Cancel",
        btn2Text: "Exit",
        handleBtn2Press: handleExit,
      });
    } else {
      handleExit();
    }
  }

  function handleNewLayout() {
    function clearToNew() {
      _setFields([]);
      _setLayoutName("");
      _setCurrentLayout(null);
      _setCurrentSlug(null);
      _setSelectedFieldIdx(null);
      _setIsDirty(false);
    }
    if (sIsDirty && sFields.length > 0) {
      handleSaveLayout();
    }
    clearToNew();
  }

  function handleTestPrint() {
    if (!sCurrentSlug) {
      useAlertScreenStore.getState().setValues({
        title: "No Template",
        message: "Save the current layout as a template before printing.",
        btn1Text: "OK",
      });
      return;
    }
    let printerID = localStorageWrapper.getItem("selectedLabelPrinterID") || "";
    if (!printerID) {
      useAlertScreenStore.getState().setValues({
        title: "No Label Printer",
        message: "Select a label printer for this device in Settings.",
        btn1Text: "OK",
      });
      return;
    }
    let cleanedFields = sFields.map(cleanField);
    let template = { labelWidth: sLabelSize.width, labelHeight: sLabelSize.height, fields: cleanedFields };
    let printJob = labelPrintBuilder.zplTest(template);
    console.log("Test Print Job (ZPL):", JSON.stringify(printJob, null, 2));
    dbSavePrintObj(printJob, printerID);
    _setPrintSuccess(true);
    setTimeout(() => _setPrintSuccess(false), 2000);
  }

  function handleLabelSizeChange(sizeName) {
    let size = LABEL_SIZES.find((s) => s.name === sizeName);
    if (size) {
      _setLabelSize(size);
      _setIsDirty(true);
    }
  }

  function handleSetDefaultSize() {
    handleSettingsFieldChange("defaultLabelSize", { name: sLabelSize.name, width: sLabelSize.width, height: sLabelSize.height });
  }

  function handleToggleQuickPrint() {
    if (!sCurrentSlug) return;
    let current = zSettingsObj?.quickPrintLayouts || [];
    let updated;
    if (current.includes(sCurrentSlug)) {
      updated = current.filter((id) => id !== sCurrentSlug);
    } else {
      updated = [...current, sCurrentSlug];
    }
    handleSettingsFieldChange("quickPrintLayouts", updated);
  }

  // ─── Render ───────────────────────────────────────────────────────

  return ReactDOM.createPortal(
    <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }}>
      <TouchableWithoutFeedback onPress={handleExitPress}>
        <View style={{ width: "100%", height: "100%", backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" }}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <div
              tabIndex={0}
              ref={(el) => { if (el && !el._focused) { el.focus(); el._focused = true; } }}
              style={{
                width: "92%",
                maxWidth: 1000,
                height: "88%",
                backgroundColor: C.backgroundWhite,
                borderRadius: 15,
                padding: 20,
                display: "flex",
                flexDirection: "column",
                outline: "none",
              }}
            >
              {/* ─── Top Bar ─── */}
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
                <Text style={{ fontSize: 16, fontWeight: Fonts.weight.textSuperheavy, color: C.text, marginRight: 15 }}>
                  Label Designer
                </Text>

                {/* New layout */}
                <Button_
                  text="New"
                  onPress={handleNewLayout}
                  colorGradientArr={COLOR_GRADIENTS.blue}
                  style={{ marginRight: 8, paddingHorizontal: 12 }}
                  textStyle={{ fontSize: 12 }}
                />

                {/* Layout name input */}
                <TextInput_
                  placeholder="Layout name..."
                  value={sLayoutName}
                  onChangeText={(t) => { _setLayoutName(t); _setIsDirty(true); }}
                  style={{ width: 160, marginRight: 8 }}
                />

                {/* Load layout dropdown */}
                {templateEntries.length > 0 && (
                  <DropdownMenu
                    dataArr={templateEntries.map(([slug, t]) => t.name)}
                    onSelect={(item, idx) => handleLoadLayout(templateEntries[idx][0], templateEntries[idx][1])}
                    buttonText="Load Layout"
                    buttonStyle={{ paddingHorizontal: 10, paddingVertical: 4, marginRight: 8 }}
                    buttonTextStyle={{ fontSize: 12 }}
                  />
                )}

                {/* Label size dropdown + set default */}
                <View style={{ flexDirection: "row", alignItems: "center", marginRight: 8 }}>
                  <DropdownMenu
                    dataArr={LABEL_SIZES.map((s) => s.name)}
                    onSelect={(item) => handleLabelSizeChange(item)}
                    buttonText={sLabelSize.name}
                    buttonStyle={{ paddingHorizontal: 10, paddingVertical: 4 }}
                    buttonTextStyle={{ fontSize: 12 }}
                  />
                  {!isDefaultSize && (
                    <TouchableOpacity onPress={handleSetDefaultSize} style={{ marginLeft: 4 }}>
                      <Text style={{ fontSize: 10, color: C.blue, textDecorationLine: "underline" }}>Set Default</Text>
                    </TouchableOpacity>
                  )}
                  {isDefaultSize && (
                    <Text style={{ fontSize: 10, color: C.green, marginLeft: 4 }}>Default</Text>
                  )}
                </View>

                {/* Delete */}
                {sCurrentSlug && (
                  <Button_
                    text="Delete"
                    onPress={handleDeleteLayout}
                    colorGradientArr={COLOR_GRADIENTS.red}
                    style={{ marginRight: 6, paddingHorizontal: 12 }}
                    textStyle={{ fontSize: 12 }}
                  />
                )}

                {/* Quick Print toggle */}
                {sCurrentSlug && (
                  <View style={{ flexDirection: "row", alignItems: "center", marginRight: 8 }}>
                    <CheckBox_
                      isChecked={isQuickPrint}
                      onPress={handleToggleQuickPrint}
                    />
                    <Text style={{ fontSize: 11, color: isQuickPrint ? C.green : gray(0.5), marginLeft: 4 }}>
                      Quick Print
                    </Text>
                  </View>
                )}

              </View>

              {/* ─── Main Area ─── */}
              <View style={{ flex: 1, flexDirection: "row", overflow: "hidden" }}>
                {/* Field palette */}
                <FieldPalette
                  fields={sFields}
                  onAddField={handleAddField}
                  onRemoveField={handleRemoveField}
                />

                {/* Canvas area */}
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                  <Button_
                    text={sIsDirty ? "Save Layout" : "Saved"}
                    onPress={handleSaveLayout}
                    colorGradientArr={sIsDirty ? COLOR_GRADIENTS.green : COLOR_GRADIENTS.grey}
                    style={{ paddingHorizontal: 40, paddingVertical: 10, marginBottom: 6 }}
                    textStyle={{ fontSize: 18 }}
                    disabled={!sIsDirty || sFields.length === 0}
                  />
                  <Text style={{ fontSize: 11, color: gray(0.5), marginBottom: 6 }}>
                    {sLabelSize.name} - {sLabelSize.width} x {sLabelSize.height} dots
                  </Text>
                  <div
                    ref={canvasRef}
                    tabIndex={0}
                    onKeyDown={handleKeyDown}
                    onClick={() => { _setSelectedFieldIdx(null); canvasRef.current?.focus(); }}
                    style={{
                      width: canvasW,
                      height: canvasH,
                      backgroundColor: "white",
                      border: "2px solid " + gray(0.3),
                      borderRadius: 4,
                      position: "relative",
                      overflow: "hidden",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                      outline: "none",
                    }}
                  >
                    {/* Printer margin guides */}
                    <div style={{ position: "absolute", left: 30 * scale, top: 0, width: 0, height: "100%", borderLeft: "1px dashed " + gray(0.7), pointerEvents: "none" }} />
                    <div style={{ position: "absolute", right: 30 * scale, top: 0, width: 0, height: "100%", borderLeft: "1px dashed " + gray(0.7), pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: 0, top: 20 * scale, width: "100%", height: 0, borderTop: "1px dashed " + gray(0.7), pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: 0, bottom: 20 * scale, width: "100%", height: 0, borderTop: "1px dashed " + gray(0.7), pointerEvents: "none" }} />
                    {/* Vertical center line */}
                    <div style={{ position: "absolute", left: "50%", top: 0, width: 0, height: "100%", borderLeft: "2px dashed rgba(70,150,255,0.8)", pointerEvents: "none" }} />

                    {sFields.map((field, idx) => (
                      <CanvasField
                        key={field.name}
                        field={field}
                        scale={scale}
                        canvasW={canvasW}
                        isSelected={idx === sSelectedFieldIdx}
                        onSelect={() => _setSelectedFieldIdx(idx)}
                        onDragStart={(e) => handleFieldDragStart(idx, e)}
                        onResizeStart={(e, pos) => handleFieldResizeStart(idx, e, pos)}
                      />
                    ))}
                  </div>
                </View>

                {/* Properties panel */}
                <PropertiesPanel
                  field={selectedField}
                  onUpdate={handleUpdateSelectedField}
                  onRemove={() => {
                    if (selectedField) handleRemoveField(selectedField.name);
                  }}
                  labelWidth={sLabelSize.width}
                />
              </View>

              {/* ─── Bottom Bar ─── */}
              <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: gray(0.85), paddingTop: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Button_
                      text="Test Print Label Design"
                      onPress={handleTestPrint}
                      colorGradientArr={COLOR_GRADIENTS.green}
                      style={{ marginRight: 8, paddingHorizontal: 16 }}
                      textStyle={{ fontSize: 12 }}
                      disabled={sFields.length === 0}
                    />
                    {sPrintSuccess && (
                      <Text style={{ fontSize: 12, color: C.green, fontWeight: "500" }}>Sent to printer!</Text>
                    )}
                  </View>

                  {/* Exit */}
                  <Button_
                    text="Exit"
                    onPress={handleExitPress}
                    colorGradientArr={COLOR_GRADIENTS.grey}
                    style={{ paddingHorizontal: 16 }}
                    textStyle={{ fontSize: 12 }}
                  />
                </View>
              </View>
            </div>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>

    </View>,
    document.body
  );
};

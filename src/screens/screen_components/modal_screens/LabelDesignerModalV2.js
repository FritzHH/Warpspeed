/*eslint-disable*/
import React, { useState, useRef } from "react";
import {
  Button,
  TextInput,
  DropdownMenu,
  Image,
  CheckBox,
  Dialog,
} from "../../../dom_components";
import { C, COLOR_GRADIENTS, Fonts, ICONS } from "../../../styles";
import { lightenRGBByPercent, localStorageWrapper } from "../../../utils";
import { useSettingsStore, useAlertScreenStore } from "../../../stores";
import { dbSavePrintObj } from "../../../db_calls_wrapper";
import { labelPrintBuilder } from "../../../shared/labelPrintBuilder";
import styles from "./LabelDesignerModalV2.module.css";

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
  width: 211,
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
    <div className={styles.fieldPalette}>
      <span
        className={styles.fieldPaletteHeader}
        style={{ fontWeight: Fonts.weight.textHeavy, color: C.text }}
      >
        FIELDS
      </span>
      {AVAILABLE_FIELDS.map((af) => {
        let isOnCanvas = fieldNamesOnCanvas.includes(af.name);
        return (
          <div
            key={af.name}
            onClick={() => {
              if (isOnCanvas) return;
              onAddField(af);
            }}
            className={styles.fieldPaletteItem}
            style={{
              backgroundColor: isOnCanvas ? C.surfaceAlt : C.buttonLightGreen,
              borderColor: isOnCanvas ? C.borderStrong : C.buttonLightGreenOutline,
              opacity: isOnCanvas ? 0.5 : 1,
              cursor: isOnCanvas ? "default" : "pointer",
            }}
          >
            <span
              className={styles.fieldPaletteItemLabel}
              style={{ color: isOnCanvas ? C.textMuted : C.text }}
            >
              {af.label}
            </span>
            {isOnCanvas && (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveField(af.name);
                }}
                className={styles.fieldPaletteRemoveBtn}
              >
                <Image icon={ICONS.trash} size={11} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PropertiesPanel({ field, onUpdate, onRemove, labelWidth }) {
  if (!field) {
    return (
      <div className={styles.propertiesEmpty}>
        <span
          className={styles.propertiesEmptyText}
          style={{ color: C.textMuted }}
        >
          Select a field on the canvas to edit its properties
        </span>
      </div>
    );
  }

  function handleChange(key, value) {
    onUpdate({ ...field, [key]: value });
  }

  let isBarcode = field.type === "barcode";

  return (
    <div className={styles.propertiesPanel}>
      <span
        className={styles.propertiesTitle}
        style={{ fontWeight: Fonts.weight.textHeavy, color: C.text }}
      >
        {field.name.toUpperCase()}
      </span>

      {/* Position display */}
      <div className={styles.propertiesSection}>
        <span className={styles.propertiesPositionLabel} style={{ color: C.textMuted }}>Position</span>
        <div className={styles.propertiesPositionRow}>
          <span className={styles.propertiesPositionValue} style={{ color: C.text }}>X: {field.x}  Y: {field.y}</span>
        </div>
        <span className={styles.propertiesHint} style={{ color: C.textSecondary }}>Arrow keys to move (Shift = fine)</span>
      </div>

      {isBarcode ? (
        <>
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

          <PropRow label="Height" value={field.height}>
            <StepperButtons
              onMinus={() => handleChange("height", Math.max(20, field.height - 10))}
              onPlus={() => handleChange("height", field.height + 10)}
            />
          </PropRow>
        </>
      ) : (
        <>
          <PropRow label="Width" value={field.width || 200}>
            <StepperButtons
              onMinus={() => handleChange("width", Math.max(40, (field.width || 200) - 20))}
              onPlus={() => handleChange("width", (field.width || 200) + 20)}
            />
          </PropRow>

          <PropRow label="Height" value={field.height || 60}>
            <StepperButtons
              onMinus={() => handleChange("height", Math.max(20, (field.height || 60) - 10))}
              onPlus={() => handleChange("height", (field.height || 60) + 10)}
            />
          </PropRow>

          <PropRow label="Font Size" value={field.fontSize || 30}>
            <StepperButtons
              onMinus={() => handleChange("fontSize", Math.max(10, (field.fontSize || 30) - 5))}
              onPlus={() => handleChange("fontSize", (field.fontSize || 30) + 5)}
            />
          </PropRow>

          <div className={styles.boldRow}>
            <CheckBox
              isChecked={field.bold}
              onPress={() => handleChange("bold", !field.bold)}
            />
            <span className={styles.boldLabel} style={{ color: C.text }}>Bold</span>
          </div>

          <div className={styles.alignSection}>
            <span className={styles.alignLabel} style={{ color: C.textMuted }}>Align</span>
            <div className={styles.alignRow}>
              {["left", "center", "right"].map((a) => {
                let selected = (field.align || "center") === a;
                return (
                  <div
                    key={a}
                    onClick={() => handleChange("align", a)}
                    className={styles.alignBtn}
                    style={{
                      borderColor: selected ? C.blue : C.borderStrong,
                      backgroundColor: selected ? lightenRGBByPercent(C.blue, 85) : "transparent",
                      marginRight: a !== "right" ? 4 : 0,
                    }}
                  >
                    <span
                      className={styles.alignBtnText}
                      style={{
                        color: selected ? C.blue : C.text,
                        fontWeight: selected ? "bold" : "normal",
                      }}
                    >
                      {a.charAt(0).toUpperCase() + a.slice(1)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      <Button
        text="Remove Field"
        onPress={onRemove}
        icon={ICONS.trash}
        iconSize={14}
        colorGradientArr={COLOR_GRADIENTS.red}
        buttonStyle={{ marginTop: 15 }}
        textStyle={{ fontSize: 12 }}
      />
    </div>
  );
}

function PropRow({ label, value, children }) {
  return (
    <div className={styles.propRow}>
      <span className={styles.propRowLabel} style={{ color: C.textMuted }}>{label}</span>
      <div className={styles.propRowValueRow}>
        {children}
        <span className={styles.propRowValue} style={{ color: C.text }}>{value}</span>
      </div>
    </div>
  );
}

function StepperButtons({ onMinus, onPlus }) {
  let btnStyle = {
    borderColor: C.buttonLightGreenOutline,
    backgroundColor: C.buttonLightGreen,
  };
  return (
    <div className={styles.stepperRow}>
      <div onClick={onMinus} className={styles.stepperBtn} style={btnStyle}>
        <span className={styles.stepperBtnText} style={{ color: C.text }}>-</span>
      </div>
      <div onClick={onPlus} className={styles.stepperBtn} style={btnStyle}>
        <span className={styles.stepperBtnText} style={{ color: C.text }}>+</span>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export const LabelDesignerModalV2 = ({ handleExit, handleSettingsFieldChange }) => {
  const zSettingsObj = useSettingsStore((state) => state.settings);

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

  const dragRef = useRef(null);
  const resizeRef = useRef(null);
  const canvasRef = useRef(null);

  const [sPrintSuccess, _setPrintSuccess] = useState(false);

  let templates = zSettingsObj?.labelTemplates || {};
  let templateEntries = Object.entries(templates);
  let quickPrintSlugs = zSettingsObj?.quickPrintLayouts || [];
  let isQuickPrint = sCurrentSlug ? quickPrintSlugs.includes(sCurrentSlug) : false;
  let selectedField = sSelectedFieldIdx !== null ? sFields[sSelectedFieldIdx] : null;
  let isDefaultSize = zSettingsObj?.defaultLabelSize?.width === sLabelSize.width && zSettingsObj?.defaultLabelSize?.height === sLabelSize.height;

  let scaleX = MAX_CANVAS_WIDTH / sLabelSize.width;
  let scaleY = MAX_CANVAS_HEIGHT / sLabelSize.height;
  let scale = Math.min(scaleX, scaleY, 1);
  let canvasW = sLabelSize.width * scale;
  let canvasH = sLabelSize.height * scale;

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
        if (pos.includes("s")) f.height = Math.max(20, Math.round(r.startField.height + dy));
        if (pos.includes("n")) {
          let newH = Math.max(20, Math.round(r.startField.height - dy));
          f.y = Math.max(0, Math.round(r.startField.y + (r.startField.height - newH)));
          f.height = newH;
        }
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
    if (f.type === "barcode") {
      if (f.barcodeHeight && !f.height) f.height = Number(f.barcodeHeight);
      if (!f.width) f.width = 211;
      if (f.name === "primaryBarcode") f.name = "barcode";
      delete f.barcodeHeight;
      delete f.moduleWidth;
    }
    f.x = Number(f.x) || 0;
    f.y = Number(f.y) || 0;
    if (f.type === "barcode") {
      f.width = snapBarcodeWidth(Number(f.width) || 211);
      f.height = Number(f.height) || 60;
    } else {
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

  return (
    <Dialog
      visible={true}
      onClose={handleExitPress}
      title="Label Designer"
      contentStyle={{ backgroundColor: "transparent", padding: 0, boxShadow: "none", width: "92%", maxWidth: 1000, height: "88%" }}
    >
      <div
        tabIndex={0}
        ref={(el) => { if (el && !el._focused) { el.focus(); el._focused = true; } }}
        className={styles.modal}
        style={{ backgroundColor: C.backgroundWhite }}
      >
        {/* ─── Top Bar ─── */}
        <div className={styles.topBar}>
          <span
            className={styles.title}
            style={{ fontWeight: Fonts.weight.textSuperheavy, color: C.text }}
          >
            Label Designer
          </span>

          <Button
            text="New"
            onPress={handleNewLayout}
            colorGradientArr={COLOR_GRADIENTS.blue}
            buttonStyle={{ marginRight: 8, paddingLeft: 12, paddingRight: 12 }}
            textStyle={{ fontSize: 12 }}
          />

          <TextInput
            placeholder="Layout name..."
            value={sLayoutName}
            onChangeText={(t) => { _setLayoutName(t); _setIsDirty(true); }}
            style={{ width: 160, marginRight: 8 }}
          />

          {templateEntries.length > 0 && (
            <DropdownMenu
              dataArr={templateEntries.map(([slug, t]) => t.name)}
              onSelect={(item, idx) => handleLoadLayout(templateEntries[idx][0], templateEntries[idx][1])}
              buttonText="Load Layout"
              buttonStyle={{ paddingLeft: 10, paddingRight: 10, paddingTop: 4, paddingBottom: 4, marginRight: 8 }}
              buttonTextStyle={{ fontSize: 12 }}
            />
          )}

          <div className={styles.sizePickerWrap}>
            <DropdownMenu
              dataArr={LABEL_SIZES.map((s) => s.name)}
              onSelect={(item) => handleLabelSizeChange(item)}
              buttonText={sLabelSize.name}
              buttonStyle={{ paddingLeft: 10, paddingRight: 10, paddingTop: 4, paddingBottom: 4 }}
              buttonTextStyle={{ fontSize: 12 }}
            />
            {!isDefaultSize && (
              <span
                onClick={handleSetDefaultSize}
                className={styles.setDefaultLink}
                style={{ color: C.blue }}
              >
                Set Default
              </span>
            )}
            {isDefaultSize && (
              <span className={styles.defaultLabel} style={{ color: C.green }}>Default</span>
            )}
          </div>

          {sCurrentSlug && (
            <Button
              text="Delete"
              onPress={handleDeleteLayout}
              icon={ICONS.trash}
              iconSize={14}
              colorGradientArr={COLOR_GRADIENTS.red}
              buttonStyle={{ marginRight: 6, paddingLeft: 12, paddingRight: 12 }}
              textStyle={{ fontSize: 12 }}
            />
          )}

          {sCurrentSlug && (
            <div className={styles.quickPrintWrap}>
              <CheckBox
                isChecked={isQuickPrint}
                onPress={handleToggleQuickPrint}
              />
              <span
                className={styles.quickPrintLabel}
                style={{ color: isQuickPrint ? C.green : C.textMuted }}
              >
                Quick Print
              </span>
            </div>
          )}
        </div>

        {/* ─── Main Area ─── */}
        <div className={styles.mainArea}>
          <FieldPalette
            fields={sFields}
            onAddField={handleAddField}
            onRemoveField={handleRemoveField}
          />

          <div className={styles.canvasArea}>
            <Button
              text={sIsDirty ? "Save Layout" : "Saved"}
              onPress={handleSaveLayout}
              colorGradientArr={sIsDirty ? COLOR_GRADIENTS.green : COLOR_GRADIENTS.grey}
              buttonStyle={{ paddingLeft: 40, paddingRight: 40, paddingTop: 10, paddingBottom: 10, marginBottom: 6 }}
              textStyle={{ fontSize: 18 }}
              enabled={sIsDirty && sFields.length > 0}
            />
            <span className={styles.canvasInfoText} style={{ color: C.textMuted }}>
              {sLabelSize.name} - {sLabelSize.width} x {sLabelSize.height} dots
            </span>
            <div
              ref={canvasRef}
              tabIndex={0}
              onKeyDown={handleKeyDown}
              onClick={() => { _setSelectedFieldIdx(null); canvasRef.current?.focus(); }}
              className={styles.canvas}
              style={{
                width: canvasW,
                height: canvasH,
                borderColor: C.borderStrong,
              }}
            >
              {/* Printer margin guides */}
              <div className={styles.marginGuideV} style={{ left: 30 * scale, borderLeftColor: C.borderStrong }} />
              <div className={styles.marginGuideV} style={{ right: 30 * scale, left: "auto", borderLeftColor: C.borderStrong }} />
              <div className={styles.marginGuideH} style={{ top: 20 * scale, borderTopColor: C.borderStrong }} />
              <div className={styles.marginGuideH} style={{ bottom: 20 * scale, top: "auto", borderTopColor: C.borderStrong }} />
              {/* Vertical center line */}
              <div className={styles.centerLine} />

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
          </div>

          <PropertiesPanel
            field={selectedField}
            onUpdate={handleUpdateSelectedField}
            onRemove={() => {
              if (selectedField) handleRemoveField(selectedField.name);
            }}
            labelWidth={sLabelSize.width}
          />
        </div>

        {/* ─── Bottom Bar ─── */}
        <div className={styles.bottomBar} style={{ borderTopColor: C.borderStrong }}>
          <div className={styles.bottomBarInner}>
            <div className={styles.bottomBarLeft}>
              <Button
                text="Test Print Label Design"
                onPress={handleTestPrint}
                colorGradientArr={COLOR_GRADIENTS.green}
                buttonStyle={{ marginRight: 8, paddingLeft: 16, paddingRight: 16 }}
                textStyle={{ fontSize: 12 }}
                enabled={sFields.length > 0}
              />
              {sPrintSuccess && (
                <span className={styles.printSuccessText} style={{ color: C.green }}>Sent to printer!</span>
              )}
            </div>

            <Button
              text="Exit"
              onPress={handleExitPress}
              colorGradientArr={COLOR_GRADIENTS.grey}
              buttonStyle={{ paddingLeft: 16, paddingRight: 16 }}
              textStyle={{ fontSize: 12 }}
            />
          </div>
        </div>
      </div>
    </Dialog>
  );
};

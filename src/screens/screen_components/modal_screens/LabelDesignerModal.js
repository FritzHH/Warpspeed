/*eslint-disable*/
import React, { useState, useRef, useCallback } from "react";
import ReactDOM from "react-dom";
import {
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ScrollView,
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
  generate36CharUUID,
  formatCurrencyDisp,
  gray,
  lightenRGBByPercent,
  localStorageWrapper,
} from "../../../utils";
import { useSettingsStore, useInventoryStore, useAlertScreenStore } from "../../../stores";
import { dbSavePrintObj } from "../../../db_calls_wrapper";
import { workerSearchInventory } from "../../../inventorySearchManager";
import { cloneDeep } from "lodash";
import {
  generateZPLTemplate as _generateZPLTemplate,
  substituteZPLData as _substituteZPLData,
} from "../../../shared/labelPrintBuilder";

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
  { name: "formalName", label: "Product Name", type: "text" },
  { name: "id", label: "Product ID", type: "text" },
  { name: "brand", label: "Brand", type: "text" },
  { name: "price", label: "Price", type: "text" },
  { name: "salePrice", label: "Sale Price", type: "text" },
  { name: "primaryBarcode", label: "Barcode", type: "barcode" },
  { name: "storeName", label: "Store Name", type: "text" },
];

const DEFAULT_TEXT_FIELD = {
  type: "text",
  x: 20,
  y: 20,
  fontHeight: 30,
  fontWidth: 30,
  bold: false,
};

const DEFAULT_BARCODE_FIELD = {
  type: "barcode",
  x: 20,
  y: 20,
  barcodeHeight: 60,
  moduleWidth: 2,
};

const MAX_CANVAS_WIDTH = 520;
const MAX_CANVAS_HEIGHT = 380;

// ─── ZPL Functions (delegated to shared/labelPrintBuilder.js) ───────────────

export const generateZPLTemplate = _generateZPLTemplate;
export const substituteZPLData = _substituteZPLData;

// ─── Sub-Components ─────────────────────────────────────────────────────────

function CanvasField({ field, scale, isSelected, onSelect, onDragStart }) {
  let displayLabel = AVAILABLE_FIELDS.find((af) => af.name === field.name)?.label || field.name;

  function handleMouseDown(e) {
    e.stopPropagation();
    e.preventDefault();
    onSelect();
    onDragStart(e);
  }

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
        <div style={{ display: "flex", flexDirection: "row", alignItems: "stretch", height: field.barcodeHeight * scale }}>
          {Array.from({ length: 24 }).map((_, i) => (
            <div
              key={i}
              style={{
                width: field.moduleWidth * scale * (i % 3 === 0 ? 2 : 1),
                backgroundColor: i % 2 === 0 ? "black" : "white",
                height: "100%",
              }}
            />
          ))}
        </div>
        <div style={{ fontSize: Math.max(9, 10 * scale), color: gray(0.4), marginTop: 2 }}>
          {displayLabel}
        </div>
      </div>
    );
  }

  // Text field
  let fontSize = Math.max(8, field.fontHeight * scale * 0.75);
  return (
    <div
      onMouseDown={handleMouseDown}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        left: field.x * scale,
        top: field.y * scale,
        fontSize: fontSize,
        fontWeight: field.bold ? "bold" : "normal",
        color: isSelected ? C.blue : C.text,
        border: isSelected ? "2px dashed " + C.blue : "2px solid transparent",
        backgroundColor: isSelected ? lightenRGBByPercent(C.blue, 85) : "transparent",
        padding: "1px 3px",
        cursor: isSelected ? "grab" : "pointer",
        userSelect: "none",
        whiteSpace: "nowrap",
      }}
    >
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

function PropertiesPanel({ field, onUpdate, onRemove }) {
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
          {/* Barcode Height */}
          <PropRow label="Barcode Height" value={field.barcodeHeight}>
            <StepperButtons
              onMinus={() => handleChange("barcodeHeight", Math.max(20, field.barcodeHeight - 10))}
              onPlus={() => handleChange("barcodeHeight", field.barcodeHeight + 10)}
            />
          </PropRow>

          {/* Module Width */}
          <PropRow label="Module Width" value={field.moduleWidth}>
            <StepperButtons
              onMinus={() => handleChange("moduleWidth", Math.max(1, field.moduleWidth - 1))}
              onPlus={() => handleChange("moduleWidth", Math.min(10, field.moduleWidth + 1))}
            />
          </PropRow>
        </>
      ) : (
        <>
          {/* Font Height */}
          <PropRow label="Font Height" value={field.fontHeight}>
            <StepperButtons
              onMinus={() => {
                let newH = Math.max(10, field.fontHeight - 5);
                let update = { fontHeight: newH };
                if (field.bold) update.fontWidth = Math.round(newH * 1.4);
                else update.fontWidth = newH;
                onUpdate({ ...field, ...update });
              }}
              onPlus={() => {
                let newH = field.fontHeight + 5;
                let update = { fontHeight: newH };
                if (field.bold) update.fontWidth = Math.round(newH * 1.4);
                else update.fontWidth = newH;
                onUpdate({ ...field, ...update });
              }}
            />
          </PropRow>

          {/* Bold */}
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
            <CheckBox_
              isChecked={field.bold}
              onPress={() => {
                let newBold = !field.bold;
                let newFW = newBold
                  ? Math.round(field.fontHeight * 1.4)
                  : field.fontHeight;
                onUpdate({ ...field, bold: newBold, fontWidth: newFW });
              }}
            />
            <Text style={{ fontSize: 12, color: C.text, marginLeft: 6 }}>Bold</Text>
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

export const LabelDesignerModal = ({ handleExit, handleSettingsFieldChange }) => {
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
  const [sIsDirty, _setIsDirty] = useState(false);

  // Drag state (ref to avoid re-renders during drag)
  const dragRef = useRef(null);
  const canvasRef = useRef(null);

  // Bottom bar
  const [sShowZPL, _setShowZPL] = useState(false);
  const [sCopies, _setCopies] = useState(1);
  const [sShowPrintSearch, _setShowPrintSearch] = useState(false);
  const [sPrintSuccess, _setPrintSuccess] = useState(false);

  // Derived
  let layouts = zSettingsObj?.labelLayouts || [];
  let quickPrintIDs = zSettingsObj?.quickPrintLayouts || [];
  let isQuickPrint = sCurrentLayout ? quickPrintIDs.includes(sCurrentLayout.id) : false;
  let selectedField = sSelectedFieldIdx !== null ? sFields[sSelectedFieldIdx] : null;
  let zplTemplate = generateZPLTemplate(sLabelSize, sFields);
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
    let layout = {
      id: sCurrentLayout?.id || generate36CharUUID(),
      name: sLayoutName || "Untitled Layout",
      labelWidth: sLabelSize.width,
      labelHeight: sLabelSize.height,
      labelSizeName: sLabelSize.name,
      fields: cloneDeep(sFields),
    };

    let existingLayouts = zSettingsObj?.labelLayouts || [];
    let existingIdx = existingLayouts.findIndex((l) => l.id === layout.id);
    let updatedLayouts;

    if (existingIdx >= 0) {
      updatedLayouts = existingLayouts.map((l, i) =>
        i === existingIdx ? layout : l
      );
    } else {
      updatedLayouts = [...existingLayouts, layout];
    }

    handleSettingsFieldChange("labelLayouts", updatedLayouts);
    _setCurrentLayout(layout);
    _setIsDirty(false);
  }

  function handleLoadLayout(layout) {
    let size =
      LABEL_SIZES.find(
        (s) => s.width === layout.labelWidth && s.height === layout.labelHeight
      ) || LABEL_SIZES[0];
    _setLabelSize(size);
    _setFields(cloneDeep(layout.fields));
    _setLayoutName(layout.name);
    _setCurrentLayout(layout);
    _setSelectedFieldIdx(null);
    _setIsDirty(false);
  }

  function handleDeleteLayout() {
    if (!sCurrentLayout) return;
    useAlertScreenStore.getState().setValues({
      title: "Delete Layout",
      message: 'Delete layout "' + sCurrentLayout.name + '"?',
      btn1Text: "Cancel",
      btn2Text: "Delete",
      handleBtn2Press: () => {
        let updatedLayouts = (zSettingsObj?.labelLayouts || []).filter(
          (l) => l.id !== sCurrentLayout.id
        );
        handleSettingsFieldChange("labelLayouts", updatedLayouts);
        let currentQP = zSettingsObj?.quickPrintLayouts || [];
        if (currentQP.includes(sCurrentLayout.id)) {
          handleSettingsFieldChange("quickPrintLayouts", currentQP.filter((id) => id !== sCurrentLayout.id));
        }
        _setCurrentLayout(null);
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

  function handlePrintItem(item) {
    let itemWithStore = { ...item, storeName: zSettingsObj?.storeInfo?.displayName || "" };
    let finalZPL = substituteZPLData(zplTemplate, itemWithStore);
    let printObj = {
      id: generate36CharUUID(),
      zpl: finalZPL,
      copies: sCopies,
    };
    let printerID = localStorageWrapper.getItem("selectedLabelPrinterID") || "";
    if (!printerID) {
      useAlertScreenStore.getState().setValues({
        title: "No Label Printer",
        message: "Select a label printer for this device in Settings.",
        btn1Text: "OK",
      });
      return;
    }
    dbSavePrintObj(printObj, printerID);
    _setShowPrintSearch(false);
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
    if (!sCurrentLayout) return;
    let current = zSettingsObj?.quickPrintLayouts || [];
    let updated;
    if (current.includes(sCurrentLayout.id)) {
      updated = current.filter((id) => id !== sCurrentLayout.id);
    } else {
      updated = [...current, sCurrentLayout.id];
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
              ref={(el) => { if (el) el.focus(); }}
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

                {/* Layout name input */}
                <TextInput_
                  placeholder="Layout name..."
                  value={sLayoutName}
                  onChangeText={(t) => { _setLayoutName(t); _setIsDirty(true); }}
                  style={{ width: 160, marginRight: 8 }}
                />

                {/* Load layout dropdown */}
                {layouts.length > 0 && (
                  <DropdownMenu
                    dataArr={layouts.map((l) => l.name)}
                    onSelect={(item, idx) => handleLoadLayout(layouts[idx])}
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

                {/* Save */}
                <Button_
                  text="Save"
                  onPress={handleSaveLayout}
                  colorGradientArr={COLOR_GRADIENTS.green}
                  style={{ marginRight: 6, paddingHorizontal: 12 }}
                  textStyle={{ fontSize: 12 }}
                  disabled={sFields.length === 0}
                />

                {/* Delete */}
                {sCurrentLayout && (
                  <Button_
                    text="Delete"
                    onPress={handleDeleteLayout}
                    colorGradientArr={COLOR_GRADIENTS.red}
                    style={{ marginRight: 6, paddingHorizontal: 12 }}
                    textStyle={{ fontSize: 12 }}
                  />
                )}

                {/* Quick Print toggle */}
                {sCurrentLayout && (
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

                {/* Dirty indicator */}
                {sIsDirty && (
                  <Text style={{ fontSize: 11, color: C.orange, marginLeft: 4 }}>Unsaved</Text>
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
                    {sFields.map((field, idx) => (
                      <CanvasField
                        key={field.name}
                        field={field}
                        scale={scale}
                        isSelected={idx === sSelectedFieldIdx}
                        onSelect={() => _setSelectedFieldIdx(idx)}
                        onDragStart={(e) => handleFieldDragStart(idx, e)}
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
                />
              </View>

              {/* ─── Bottom Bar ─── */}
              <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: gray(0.85), paddingTop: 10 }}>
                {/* ZPL Preview */}
                {sShowZPL && (
                  <View
                    style={{
                      backgroundColor: gray(0.95),
                      borderRadius: 6,
                      padding: 10,
                      marginBottom: 8,
                      maxHeight: 120,
                    }}
                  >
                    <ScrollView>
                      <Text style={{ fontSize: 11, fontFamily: "monospace", color: C.text }}>
                        {zplTemplate}
                      </Text>
                    </ScrollView>
                  </View>
                )}

                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    {/* Show ZPL */}
                    <Button_
                      text={sShowZPL ? "Hide ZPL" : "Show ZPL"}
                      onPress={() => _setShowZPL(!sShowZPL)}
                      colorGradientArr={COLOR_GRADIENTS.lightBlue}
                      style={{ marginRight: 8, paddingHorizontal: 12 }}
                      textStyle={{ fontSize: 12 }}
                    />

                    {/* Copies */}
                    <View style={{ flexDirection: "row", alignItems: "center", marginRight: 12 }}>
                      <Text style={{ fontSize: 12, color: C.text, marginRight: 6 }}>Copies:</Text>
                      <StepperButtons
                        onMinus={() => _setCopies(Math.max(1, sCopies - 1))}
                        onPlus={() => _setCopies(sCopies + 1)}
                      />
                      <Text style={{ fontSize: 13, fontWeight: "500", color: C.text, marginLeft: 6 }}>{sCopies}</Text>
                    </View>

                    {/* Print */}
                    <Button_
                      text="Print"
                      onPress={() => _setShowPrintSearch(true)}
                      colorGradientArr={COLOR_GRADIENTS.green}
                      style={{ marginRight: 8, paddingHorizontal: 16 }}
                      textStyle={{ fontSize: 12 }}
                      disabled={sFields.length === 0}
                    />

                    {/* Print success */}
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

      {/* Print search overlay */}
      {sShowPrintSearch && (
        <PrintSearchOverlay
          onSelect={handlePrintItem}
          onClose={() => _setShowPrintSearch(false)}
        />
      )}
    </View>,
    document.body
  );
};

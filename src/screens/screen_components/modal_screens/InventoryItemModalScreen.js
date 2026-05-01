/*eslint-disable*/
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ScrollView,
} from "react-native-web";
import { createPortal } from "react-dom";
import { useState, useRef } from "react";
import { cloneDeep, debounce } from "lodash";
import {
  useSettingsStore,
  useInventoryStore,
  useLoginStore,
} from "../../../stores";
import {
  Image_,
  Button_,
  TextInput_,
  DropdownMenu,
  LoginModalScreen,
  CustomerQuickNotesDropdown,
  Tooltip,
  SHADOW_RADIUS_PROTO,
} from "../../../components";
import { C, ICONS } from "../../../styles";
import {
  formatCurrencyDisp,
  usdTypeMask,
  gray,
  log,
  showAlert,
  deepEqual,
  localStorageWrapper,
} from "../../../utils";
import {
  dbSaveInventoryItem,
  dbDeleteInventoryItem,
  dbSavePrintObj,
} from "../../../db_calls_wrapper";
import { labelPrintBuilder } from "../../../shared/labelPrintBuilder";

const CATEGORIES = ["Item", "Labor"];

// ─── helpers ───────────────────────────────────────────────────────────────

function buildPathForButton(buttonID, allButtons) {
  let parts = [];
  let current = allButtons.find((b) => b.id === buttonID);
  while (current) {
    parts.unshift(current.name || "(unnamed)");
    current = current.parentID
      ? allButtons.find((b) => b.id === current.parentID)
      : null;
  }
  return parts.join(" > ");
}

/** Check if a button's items array contains an inventory item ID (handles both legacy string entries and new object entries) */
function buttonHasItem(btn, itemID) {
  return (btn.items || []).some((entry) =>
    typeof entry === "string" ? entry === itemID : entry.inventoryItemID === itemID
  );
}

function getButtonsContainingItem(itemID, allButtons) {
  return allButtons
    .filter((b) => buttonHasItem(b, itemID))
    .map((b) => ({
      buttonID: b.id,
      path: buildPathForButton(b.id, allButtons),
    }));
}

// ─── Quick Button Picker Modal ─────────────────────────────────────────────

const SubMenuRow = ({ parentID, itemID, quickButtons, onToggle, expandedIDs, toggleExpanded, depth }) => {
  let children = quickButtons.filter((b) => b.parentID === parentID);
  if (children.length === 0) return null;
  let expandedChildren = children.filter((c) => expandedIDs.includes(c.id));
  return (
    <View style={{ marginTop: 6, marginLeft: depth * 8 }}>
      {/* All chips on the same row */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
        {children.map((child) => {
          let childIsIn = buttonHasItem(child, itemID);
          let hasGrandchildren = quickButtons.some((b) => b.parentID === child.id);
          let isExpanded = expandedIDs.includes(child.id);
          return (
            <TouchableOpacity
              key={child.id}
              onPress={() => {
                if (hasGrandchildren) toggleExpanded(child.id);
                else onToggle(child.id);
              }}
              style={{
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 5,
                backgroundColor: isExpanded ? "rgb(245,166,35)" : childIsIn ? C.green : gray(0.1),
                borderWidth: (isExpanded || childIsIn) ? 0 : 1,
                borderColor: gray(0.15),
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  color: (isExpanded || childIsIn) ? "white" : C.text,
                  fontWeight: (isExpanded || childIsIn) ? "600" : "400",
                }}
              >
                {child.name || "(unnamed)"}
              </Text>
              {hasGrandchildren && (
                <Text style={{ fontSize: 11, color: (isExpanded || childIsIn) ? "white" : gray(0.4), marginLeft: 4 }}>
                  {isExpanded ? "\u25BC" : "\u25B6"}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
      {/* Expanded sub-menus rendered below the row */}
      {expandedChildren.map((child) => (
        <SubMenuRow
          key={child.id}
          parentID={child.id}
          itemID={itemID}
          quickButtons={quickButtons}
          onToggle={onToggle}
          expandedIDs={expandedIDs}
          toggleExpanded={toggleExpanded}
          depth={depth + 1}
        />
      ))}
    </View>
  );
};

const QuickButtonPickerModal = ({ itemID, quickButtons, onToggle, onClose }) => {
  const [sExpandedIDs, _setExpandedIDs] = useState([]);

  function toggleExpanded(id) {
    _setExpandedIDs((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  let rootButtons = quickButtons.filter((b) => !b.parentID);

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,.4)",
        zIndex: 10002,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "45%",
          maxHeight: "calc(100vh - 40px)",
          display: "flex",
          flexDirection: "column",
        }}
      >
            <View
              style={{
                backgroundColor: "white",
                borderRadius: 12,
                padding: 20,
                ...SHADOW_RADIUS_PROTO,
                shadowOffset: { width: 3, height: 3 },
              }}
            >
              {/* Header */}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 12,
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: "600", color: C.text }}>
                  Add to Quick Button Menu
                </Text>
                <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
                  <Image_ icon={ICONS.close1} size={16} />
                </TouchableOpacity>
              </View>

              {/* Button list */}
              <ScrollView showsVerticalScrollIndicator={true} style={{ flex: 1 }}>
                {rootButtons.length === 0 ? (
                  <Text style={{ fontSize: 14, color: gray(0.5), paddingVertical: 10 }}>
                    No quick buttons configured
                  </Text>
                ) : (
                  rootButtons.map((btn) => {
                    let hasChildren = quickButtons.some((b) => b.parentID === btn.id);
                    let isIn = buttonHasItem(btn, itemID);
                    let isExpanded = sExpandedIDs.includes(btn.id);
                    return (
                      <View
                        key={btn.id}
                        style={{
                          paddingVertical: 8,
                          paddingHorizontal: 10,
                          marginBottom: 4,
                          backgroundColor: isIn ? "rgba(88,145,65,0.08)" : gray(0.03),
                          borderRadius: 8,
                          borderWidth: isIn ? 1 : 0,
                          borderColor: isIn ? C.green : "transparent",
                        }}
                      >
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                          }}
                        >
                          <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                            <Text style={{ fontSize: 15, color: C.text }}>
                              {btn.name || "(unnamed)"}
                            </Text>
                            {hasChildren && (
                              <TouchableOpacity
                                onPress={() => toggleExpanded(btn.id)}
                                style={{
                                  marginLeft: 8,
                                  paddingHorizontal: 6,
                                  paddingVertical: 2,
                                  borderRadius: 4,
                                  backgroundColor: isExpanded ? "rgb(245,166,35)" : gray(0.12),
                                }}
                              >
                                <Text style={{ fontSize: 12, color: isExpanded ? "white" : gray(0.5) }}>
                                  {isExpanded ? "\u25BC" : "\u25B6"}
                                </Text>
                              </TouchableOpacity>
                            )}
                          </View>
                          <TouchableOpacity
                            onPress={() => onToggle(btn.id)}
                            style={{
                              paddingHorizontal: 14,
                              paddingVertical: 6,
                              borderRadius: 5,
                              backgroundColor: isIn ? C.red : C.green,
                            }}
                          >
                            <Text style={{ fontSize: 13, color: "white", fontWeight: "600" }}>
                              {isIn ? "Remove" : "Add"}
                            </Text>
                          </TouchableOpacity>
                        </View>
                        {isExpanded && (
                          <SubMenuRow
                            parentID={btn.id}
                            itemID={itemID}
                            quickButtons={quickButtons}
                            onToggle={onToggle}
                            expandedIDs={sExpandedIDs}
                            toggleExpanded={toggleExpanded}
                            depth={0}
                          />
                        )}
                      </View>
                    );
                  })
                )}
              </ScrollView>
            </View>
      </div>
    </div>,
    document.body
  );
};

const CurrencyField = ({ style, cents, onChangeText, placeholder }) => {
  const [sFocused, _setFocused] = useState(false);
  const [sLocalVal, _setLocalVal] = useState("");

  return (
    <TextInput
      style={style}
      value={sFocused ? sLocalVal : formatCurrencyDisp(cents)}
      placeholder={placeholder}
      placeholderTextColor={gray(0.35)}
      onFocus={() => {
        _setFocused(true);
        _setLocalVal("");
      }}
      onBlur={() => _setFocused(false)}
      onChangeText={(v) => {
        _setLocalVal(v);
        onChangeText(v);
      }}
    />
  );
};

// ─── main component ────────────────────────────────────────────────────────

export const InventoryItemModalScreen = ({ item, isNew, handleExit, skipPortal }) => {
  const zQuickItemButtons = useSettingsStore((s) => s.settings?.quickItemButtons, deepEqual);
  const zAutoCustomerNoteTexts = useSettingsStore((s) => s.settings?.autoCustomerNoteTexts, deepEqual);
  const zShowLoginScreen = useLoginStore((state) => state.showLoginScreen);
  const quickButtons = zQuickItemButtons || [];

  const [sItem, _setItem] = useState(() => cloneDeep(item));
  const userLevel = useLoginStore.getState().currentUser?.permissions?.level || 0;
  const [sEditing, _setEditing] = useState(!!isNew || userLevel >= 2);
  const [sShowQBPicker, _setShowQBPicker] = useState(false);
  const [sDirty, _setDirty] = useState(false);
  const [sPrintSuccess, _setPrintSuccess] = useState(false);

  // debounced inventory save
  const debouncedInvSaveRef = useRef(
    debounce((updated) => {
      dbSaveInventoryItem(updated);
    }, 500)
  );

  // debounced settings save
  const debouncedSettingsSaveRef = useRef(
    debounce((updatedButtons) => {
      useSettingsStore.getState().setField("quickItemButtons", updatedButtons);
    }, 500)
  );

  // auto customer note
  const zAutoNoteTexts = zAutoCustomerNoteTexts || [];
  const zCustomerQuickNotes = useSettingsStore((s) => s.settings?.customerQuickNotes, deepEqual) || [];
  const existingAutoNote = zAutoNoteTexts.find((n) => n.inventoryItemID === item.id);
  const [sAutoNoteText, _setAutoNoteText] = useState(() => existingAutoNote?.text || "");
  const [sAutoQuickNoteIDs, _setAutoQuickNoteIDs] = useState(() => existingAutoNote?.quickNoteIDs || []);
  const [sShowQuickNotePicker, _setShowQuickNotePicker] = useState(null);
  const debouncedAutoNoteSaveRef = useRef(
    debounce((updatedArr) => {
      useSettingsStore.getState().setField("autoCustomerNoteTexts", updatedArr);
    }, 500)
  );

  // ─── field change handler ──────────────────────────────────────────────

  function handleFieldChange(fieldName, value) {
    let updated = { ...sItem, [fieldName]: value };
    _setItem(updated);
    _setDirty(true);
    if (!isNew) {
      useInventoryStore.getState().setItem(updated, false);
      debouncedInvSaveRef.current(updated);
    }
  }

  function handleSaveNewItem() {
    useInventoryStore.getState().setItem(sItem, false);
    dbSaveInventoryItem(sItem);
    let hasContent = (sAutoNoteText && sAutoNoteText.trim()) || sAutoQuickNoteIDs.length > 0;
    if (hasContent) {
      let updatedArr = [...zAutoNoteTexts];
      let entry = { inventoryItemID: sItem.id, text: sAutoNoteText || "", quickNoteIDs: sAutoQuickNoteIDs };
      let idx = updatedArr.findIndex((n) => n.inventoryItemID === sItem.id);
      if (idx >= 0) updatedArr[idx] = entry;
      else updatedArr.push(entry);
      useSettingsStore.getState().setField("autoCustomerNoteTexts", updatedArr);
    }
    handleExit();
  }

  function handlePriceChange(fieldName, rawInput) {
    const { cents } = usdTypeMask(rawInput);
    let updated = { ...sItem, [fieldName]: cents };
    if (fieldName === "price" && cents > 0) updated.minutes = 0;
    _setItem(updated);
    _setDirty(true);
    if (!isNew) {
      useInventoryStore.getState().setItem(updated, false);
      debouncedInvSaveRef.current(updated);
    }
  }

  function handleMinutesChange(rawInput) {
    const digits = rawInput.replace(/\D/g, "");
    let mins = digits === "" ? 0 : Number(digits);
    let updated = { ...sItem, minutes: mins };
    if (mins > 0) { updated.price = 0; updated.salePrice = 0; }
    _setItem(updated);
    _setDirty(true);
    if (!isNew) {
      useInventoryStore.getState().setItem(updated, false);
      debouncedInvSaveRef.current(updated);
    }
  }

  // ─── delete ────────────────────────────────────────────────────────────

  function handleDeleteItem() {
    showAlert({
      title: "Delete Item",
      message: `Are you sure you want to delete "${sItem.formalName || sItem.informalName || "this item"}"?`,
      btn1Text: "Cancel",
      btn2Text: "Delete",
      handleBtn2Press: () => {
        useLoginStore.getState().execute(() => {
          // clean up auto customer note from settings
          const autoNotes = useSettingsStore.getState().settings?.autoCustomerNoteTexts || [];
          const filtered = autoNotes.filter((n) => n.inventoryItemID !== sItem.id);
          if (filtered.length !== autoNotes.length) {
            useSettingsStore.getState().setField("autoCustomerNoteTexts", filtered);
          }
          useInventoryStore.getState().removeItem(sItem);
          dbDeleteInventoryItem(sItem.id);
          handleExit();
        }, "Admin");
      },
    });
  }

  // ─── auto customer note handler ─────────────────────────────────────────

  function saveAutoNote(text, quickNoteIDs) {
    if (isNew) return;
    let updatedArr = [...zAutoNoteTexts];
    let hasContent = (text && text.trim()) || (quickNoteIDs && quickNoteIDs.length > 0);
    if (!hasContent) {
      updatedArr = updatedArr.filter((n) => n.inventoryItemID !== sItem.id);
    } else {
      let idx = updatedArr.findIndex((n) => n.inventoryItemID === sItem.id);
      let entry = { inventoryItemID: sItem.id, text: text || "", quickNoteIDs: quickNoteIDs || [] };
      if (idx >= 0) updatedArr[idx] = entry;
      else updatedArr.push(entry);
    }
    useSettingsStore.getState().setField("autoCustomerNoteTexts", updatedArr, false);
    debouncedAutoNoteSaveRef.current(updatedArr);
  }

  function handleAutoNoteChange(text) {
    _setAutoNoteText(text);
    _setDirty(true);
    saveAutoNote(text, sAutoQuickNoteIDs);
  }

  function handleAutoQuickNoteToggle(noteItem) {
    let updated;
    if (sAutoQuickNoteIDs.includes(noteItem.id)) {
      updated = sAutoQuickNoteIDs.filter((id) => id !== noteItem.id);
    } else {
      updated = [...sAutoQuickNoteIDs, noteItem.id];
    }
    _setAutoQuickNoteIDs(updated);
    _setDirty(true);
    saveAutoNote(sAutoNoteText, updated);
  }

  // ─── quick print label ─────────────────────────────────────────────────

  let zSettings = useSettingsStore.getState().settings;
  let allTemplates = zSettings?.labelTemplates || {};
  let templateEntries = Object.entries(allTemplates);
  let quickPrintSlugs = zSettings?.quickPrintLayouts || [];
  let quickPrintEntries = templateEntries.filter(([slug]) => quickPrintSlugs.includes(slug));

  function handleQuickPrint(slug) {
    let printerID = localStorageWrapper.getItem("selectedLabelPrinterID") || "";
    if (!printerID) {
      showAlert({
        title: "No Label Printer",
        message: "Select a label printer for this device in Settings.",
        btn1Text: "OK",
      });
      return;
    }
    let template = allTemplates[slug];
    let printJob = labelPrintBuilder.zplLabel(slug, { ...sItem, storeDisplayName: zSettings?.storeInfo?.displayName || "" }, 1, template);
    dbSavePrintObj(printJob, printerID);
    _setPrintSuccess(true);
    setTimeout(() => _setPrintSuccess(false), 2000);
  }

  // ─── quick button helpers ──────────────────────────────────────────────

  function handleRemoveFromButton(buttonID) {
    let updated = quickButtons.map((b) => {
      if (b.id !== buttonID) return b;
      return { ...b, items: (b.items || []).filter((entry) =>
        typeof entry === "string" ? entry !== sItem.id : entry.inventoryItemID !== sItem.id
      ) };
    });
    _setDirty(true);
    useSettingsStore.getState().setField("quickItemButtons", updated, false);
    debouncedSettingsSaveRef.current(updated);
  }

  function handleToggleInButton(buttonID) {
    let btn = quickButtons.find((b) => b.id === buttonID);
    if (!btn) return;
    let isIn = buttonHasItem(btn, sItem.id);
    let updated = quickButtons.map((b) => {
      if (b.id !== buttonID) return b;
      if (isIn) {
        return { ...b, items: (b.items || []).filter((entry) =>
          typeof entry === "string" ? entry !== sItem.id : entry.inventoryItemID !== sItem.id
        ) };
      } else {
        return { ...b, items: [...(b.items || []), sItem.id] };
      }
    });
    _setDirty(true);
    useSettingsStore.getState().setField("quickItemButtons", updated, false);
    debouncedSettingsSaveRef.current(updated);
  }

  // ─── render helpers ────────────────────────────────────────────────────

  const sectionCardStyle = { borderWidth: 1, borderColor: gray(0.15), borderRadius: 10, backgroundColor: gray(0.03), padding: 12, marginTop: 10 };
  const labelStyle = { fontStyle: "italic", color: gray(0.45), fontSize: 13, marginTop: 4 };
  const valueStyle = { fontSize: 15, color: C.text, marginTop: 2 };
  const inputStyle = {
    fontSize: 15,
    color: C.text,
    marginTop: 2,
    borderBottomWidth: 1,
    borderBottomColor: C.buttonLightGreenOutline,
    paddingVertical: 4,
    outlineStyle: "none",
  };
  const sectionTitle = { fontSize: 14, fontWeight: "600", color: C.text, marginTop: 20, marginBottom: 6 };

  function renderField(label, fieldName, opts = {}) {
    let val = sItem[fieldName];
    if (opts.currency) val = formatCurrencyDisp(val, true);
    if (opts.currency && !sEditing && (val === "" || val === "$0.00")) val = "-";
    if (!opts.currency && !sEditing && (val === "" || val === 0)) val = "-";

    return (
      <View style={{ flex: opts.flex, marginRight: opts.last ? 0 : 10 }}>
        <Text style={labelStyle}>{label}{sEditing && opts.hint ? <Text style={{ fontWeight: "normal", color: gray(0.4) }}>{opts.hint}</Text> : null}</Text>
        {sEditing ? (
          opts.currency ? (
            <CurrencyField
              style={inputStyle}
              cents={sItem[fieldName]}
              onChangeText={(v) => handlePriceChange(fieldName, v)}
              placeholder="$0.00"
            />
          ) : opts.numeric ? (
            <TextInput
              style={inputStyle}
              value={String(sItem[fieldName] || "")}
              onChangeText={(v) => handleMinutesChange(v)}
              keyboardType="numeric"
            />
          ) : opts.multiline ? (
            <TextInput_
              style={{
                padding: 6,
                paddingLeft: 8,
                lineHeight: 18,
                fontSize: 15,
                color: C.text,
                outlineWidth: 0,
                outlineStyle: "none",
                overflow: "hidden",
                resize: "none",
                borderWidth: 0,
                borderRadius: 5,
                backgroundColor: C.listItemWhite,
                marginTop: 2,
                boxShadow: "inset 0 0 0 1px " + C.buttonLightGreenOutline,
              }}
              value={String(sItem[fieldName] || "")}
              onChangeText={(v) => handleFieldChange(fieldName, v)}
              multiline={true}
              numberOfLines={10}
              debounceMs={0}
            />
          ) : (
            <TextInput
              style={inputStyle}
              value={String(sItem[fieldName] || "")}
              onChangeText={(v) => {
                if (opts.numbersOnly) v = v.replace(/[^0-9]/g, "");
                handleFieldChange(fieldName, v);
              }}
              autoFocus={opts.autoFocus}
              keyboardType={opts.numbersOnly ? "numeric" : undefined}
              inputMode={opts.numbersOnly ? "numeric" : undefined}
            />
          )
        ) : (
          <Text style={{ ...valueStyle, ...(opts.multiline ? { whiteSpace: "pre-wrap" } : {}) }}>{String(val ?? "-")}</Text>
        )}
      </View>
    );
  }

  // ─── current placements ────────────────────────────────────────────────

  let placements = getButtonsContainingItem(sItem.id, quickButtons);

  // ─── main render ───────────────────────────────────────────────────────

  const modalContent = (
    <TouchableWithoutFeedback onPress={() => {}}>
      <View
        style={{
          width: "55%",
          height: "90vh",
          backgroundColor: "white",
          borderRadius: 15,
          padding: 20,
          ...SHADOW_RADIUS_PROTO,
          shadowOffset: { width: 3, height: 3 },
          flexDirection: "column",
        }}
      >
          <LoginModalScreen modalVisible={zShowLoginScreen} />

          {/* HEADER */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 5,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: "600", color: C.text }}>
              {isNew ? "New Inventory Item" : "Inventory Item"}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              {/* Print Label */}
              {!isNew && templateEntries.length > 0 && (
                <View style={{ flexDirection: "row", alignItems: "center", marginRight: 10 }}>
                  <DropdownMenu
                    dataArr={templateEntries.map(([slug, t]) => t.name)}
                    onSelect={(name, idx) => handleQuickPrint(templateEntries[idx][0])}
                    buttonText=""
                    buttonIcon={ICONS.print}
                    buttonIconSize={26}
                    buttonStyle={{
                      backgroundColor: "transparent",
                      borderWidth: 0,
                      padding: 6,
                    }}
                  />
                  {sPrintSuccess && (
                    <Text style={{ fontSize: 11, color: C.green, marginLeft: 4 }}>Sent!</Text>
                  )}
                </View>
              )}
            </View>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ justifyContent: "space-between", flexGrow: 1 }}>
            <View>
            {/* Names */}
            <View style={sectionCardStyle}>
              {renderField("Catalog Name", "formalName", { autoFocus: true })}
              {renderField("Quick Button/Descriptive Name", "informalName", { multiline: true, hint: " -- use enter key to space name to fit quick button card if desired" })}
            </View>

            {/* Brand + Category + Minutes */}
            <View style={{ ...sectionCardStyle, flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                {renderField("Brand", "brand")}
              </View>
              <View style={{ width: 120 }}>
                <Text style={labelStyle}>Category</Text>
                {sEditing ? (
                  <select
                    value={sItem.category || "Item"}
                    onChange={(e) => handleFieldChange("category", e.target.value)}
                    style={{
                      width: 120,
                      marginTop: 4,
                      paddingVertical: 4,
                      paddingHorizontal: 6,
                      borderRadius: 6,
                      borderWidth: 1,
                      borderColor: C.buttonLightGreenOutline,
                      backgroundColor: C.listItemWhite,
                      fontSize: 14,
                      color: C.text,
                      outlineStyle: "none",
                      cursor: "pointer",
                    }}
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                ) : (
                  <Text style={valueStyle}>{sItem.category || "Item"}</Text>
                )}
              </View>
            </View>

            {/* Prices */}
            <View style={{ ...sectionCardStyle, flexDirection: "row" }}>
              {sItem.category === "Labor" && (
                <View style={{ width: 80, marginRight: 10 }}>
                  {renderField("Minutes", "minutes", { numeric: true })}
                </View>
              )}
              {renderField("Price", "price", { currency: true, flex: 1 })}
              {renderField("Sale Price", "salePrice", { currency: true, flex: 1 })}
              {renderField("Cost", "cost", { currency: true, flex: 1, last: true })}
            </View>

            {/* Barcodes */}
            <View style={{ ...sectionCardStyle, flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                {renderField("Primary Barcode", "primaryBarcode", { numbersOnly: true })}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={labelStyle}>Additional Barcodes</Text>
                {(sItem.barcodes || []).map((code, i) => (
                  <View key={i} style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
                    {sEditing ? (
                      <TextInput
                        style={{ ...inputStyle, flex: 1 }}
                        value={code}
                        keyboardType="numeric"
                        inputMode="numeric"
                        onChangeText={(v) => {
                          v = v.replace(/[^0-9]/g, "");
                          let updated = [...(sItem.barcodes || [])];
                          updated[i] = v;
                          handleFieldChange("barcodes", updated);
                        }}
                      />
                    ) : (
                      <Text style={{ ...valueStyle, flex: 1 }}>{code}</Text>
                    )}
                    {sEditing && (
                      <TouchableOpacity
                        onPress={() => {
                          let updated = (sItem.barcodes || []).filter((_, idx) => idx !== i);
                          handleFieldChange("barcodes", updated);
                        }}
                        style={{ padding: 4, marginLeft: 6 }}
                      >
                        <Image_ icon={ICONS.trash} size={16} />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
                {sEditing && (
                  <TouchableOpacity
                    onPress={() => {
                      let updated = [...(sItem.barcodes || []), ""];
                      handleFieldChange("barcodes", updated);
                    }}
                    style={{ marginTop: 6, flexDirection: "row", alignItems: "center" }}
                  >
                    <Image_ icon={ICONS.add} size={20} style={{ tintColor: C.green }} />
                    <Text style={{ fontSize: 13, color: C.green, marginLeft: 4 }}>Add Barcode</Text>
                  </TouchableOpacity>
                )}
                {!sEditing && (sItem.barcodes || []).length === 0 && (
                  <Text style={valueStyle}>-</Text>
                )}
              </View>
            </View>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
              {/* SECTION 2: Quick Button Placement */}
              <View style={{ ...sectionCardStyle, flex: 1, marginTop: 0 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: C.text }}>
                      Quick Button Placement
                    </Text>
                    <Tooltip text="Assign this item to quick button menus for fast access" position="right">
                      <Image_ icon={ICONS.info} size={16} style={{ marginLeft: 6, opacity: 0.4 }} />
                    </Tooltip>
                  </View>
                  <TouchableOpacity
                    onPress={() => _setShowQBPicker(true)}
                    style={{ padding: 4 }}
                  >
                    <Image_ icon={ICONS.add} size={30} style={{ tintColor: C.green }} />
                  </TouchableOpacity>
                </View>
                {placements.length === 0 ? (
                  <Text style={{ fontSize: 13, color: gray(0.5), marginBottom: 6 }}>
                    Not assigned to any quick button menu
                  </Text>
                ) : (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
                    {placements.map((p) => (
                      <View
                        key={p.buttonID}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          paddingVertical: 5,
                          paddingHorizontal: 8,
                          backgroundColor: "white",
                          borderRadius: 6,
                        }}
                      >
                        <Text style={{ fontSize: 13, color: C.text }}>{p.path}</Text>
                        <TouchableOpacity
                          onPress={() => handleRemoveFromButton(p.buttonID)}
                          style={{ padding: 4, marginLeft: 4 }}
                        >
                          <Image_ icon={ICONS.trash} size={18} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {/* SECTION 3: Auto Customer Note */}
              <View style={{ ...sectionCardStyle, flex: 1, marginTop: 0 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: C.text }}>
                      Auto Customer Note
                    </Text>
                    <Tooltip text="When this item is added to a workorder, these notes will automatically appear in Customer Notes" position="right">
                      <Image_ icon={ICONS.info} size={16} style={{ marginLeft: 6, opacity: 0.4 }} />
                    </Tooltip>
                  </View>
                  <Tooltip text="Select from pre-configured customer quick notes to auto-add when this item is used" position="bottom">
                    <TouchableOpacity
                      onPress={(e) => {
                        const nativeEvent = e.nativeEvent || e;
                        _setShowQuickNotePicker({ x: nativeEvent.pageX, y: nativeEvent.pageY });
                      }}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        backgroundColor: C.buttonLightGreen,
                        borderWidth: 1,
                        borderColor: C.buttonLightGreenOutline,
                        borderRadius: 5,
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                      }}
                    >
                      <Image_ icon={ICONS.add} size={16} style={{ tintColor: C.green }} />
                      <Text style={{ fontSize: 13, color: C.text, marginLeft: 4 }}>Quick Notes</Text>
                    </TouchableOpacity>
                  </Tooltip>
                </View>
                {sAutoQuickNoteIDs.length > 0 && (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
                    {sAutoQuickNoteIDs.map((qnID) => {
                      let label = "";
                      zCustomerQuickNotes.forEach((cat) => {
                        let found = (cat.items || []).find((i) => i.id === qnID);
                        if (found) label = found.buttonLabel;
                      });
                      if (!label) return null;
                      return (
                        <TouchableOpacity
                          key={qnID}
                          onPress={() => handleAutoQuickNoteToggle({ id: qnID })}
                          style={{
                            backgroundColor: "rgb(240, 200, 200)",
                            borderRadius: 6,
                            paddingHorizontal: 10,
                            paddingVertical: 5,
                            flexDirection: "row",
                            alignItems: "center",
                          }}
                        >
                          <Text style={{ fontSize: 13, color: C.lightred, fontWeight: "500" }}>
                            {label}
                          </Text>
                          <Text style={{ fontSize: 11, color: C.lightred, marginLeft: 6 }}>✕</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                <TextInput_
                  multiline={true}
                  numberOfLines={10}
                  debounceMs={0}
                  onChangeText={handleAutoNoteChange}
                  value={sAutoNoteText}
                  placeholder="Enter custom receipt note here"
                  placeholderTextColor={gray(0.3)}
                  style={{
                    fontSize: 14,
                    lineHeight: 18,
                    paddingVertical: 6,
                    paddingHorizontal: 4,
                    outlineWidth: 0,
                    outlineStyle: "none",
                    color: C.text,
                    width: "100%",
                  }}
                />
              </View>
            </View>
            </View>

            <CustomerQuickNotesDropdown
              visible={!!sShowQuickNotePicker}
              anchorPosition={sShowQuickNotePicker}
              onClose={() => _setShowQuickNotePicker(null)}
              quickNotes={zCustomerQuickNotes}
              onToggleChip={handleAutoQuickNoteToggle}
              activeChips={sAutoQuickNoteIDs}
            />

          </ScrollView>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
            {!isNew ? (
              <Tooltip text="Delete this item" position="top">
                <TouchableOpacity
                  onPress={handleDeleteItem}
                  style={{ padding: 6, borderRadius: 6 }}
                >
                  <Image_ icon={ICONS.trash} size={40} />
                </TouchableOpacity>
              </Tooltip>
            ) : <View />}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              {isNew && !!sItem.formalName?.trim() && (
                <Tooltip text="Save new item" position="top">
                  <TouchableOpacity
                    onPress={handleSaveNewItem}
                    style={{ padding: 6, borderRadius: 6 }}
                  >
                    <Image_ icon={ICONS.check1} size={36} />
                  </TouchableOpacity>
                </Tooltip>
              )}
              {!isNew && sDirty && (
                <Tooltip text="Save changes" position="top">
                  <TouchableOpacity
                    onPress={handleExit}
                    style={{ padding: 6, borderRadius: 6 }}
                  >
                    <Image_ icon={ICONS.check1} size={36} />
                  </TouchableOpacity>
                </Tooltip>
              )}
              <Tooltip text="Close" position="top">
                <TouchableOpacity
                  onPress={handleExit}
                  style={{ padding: 6, borderRadius: 6 }}
                >
                  <Image_ icon={ICONS.close1} size={36} />
                </TouchableOpacity>
              </Tooltip>
            </View>
          </View>
        </View>
      </TouchableWithoutFeedback>
  );

  const portalContent = (
    <>
      <div
        onClick={handleExit}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(50,50,50,.5)",
          zIndex: 10001,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
          {modalContent}
        </div>
      </div>
      {sShowQBPicker && (
        <QuickButtonPickerModal
          itemID={sItem.id}
          quickButtons={quickButtons}
          onToggle={handleToggleInButton}
          onClose={() => _setShowQBPicker(false)}
        />
      )}
    </>
  );

  if (skipPortal) return portalContent;
  return createPortal(portalContent, document.body);
};

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
import { useState, useRef, useCallback } from "react";
import { cloneDeep, debounce } from "lodash";
import {
  useSettingsStore,
  useInventoryStore,
  useLoginStore,
} from "../../../stores";
import {
  Image_,
  Button_,
  DropdownMenu,
  LoginModalScreen,
  SHADOW_RADIUS_PROTO,
} from "../../../components";
import { C, ICONS } from "../../../styles";
import {
  formatCurrencyDisp,
  usdTypeMask,
  generateRandomID,
  gray,
  log,
} from "../../../utils";
import {
  dbSaveInventoryItem,
  dbDeleteInventoryItem,
} from "../../../db_calls_wrapper";

const CATEGORIES = ["Part", "Labor"];

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

function getButtonsContainingItem(itemID, allButtons) {
  return allButtons
    .filter((b) => b.items && b.items.includes(itemID))
    .map((b) => ({
      buttonID: b.id,
      path: buildPathForButton(b.id, allButtons),
    }));
}

// ─── Quick Button Picker Modal ─────────────────────────────────────────────

const QuickButtonPickerModal = ({ itemID, quickButtons, onToggle, onClose }) => {
  const [sParentID, _setParentID] = useState(null);
  const [sMenuPath, _setMenuPath] = useState([]);

  let currentButtons = quickButtons.filter((b) => b.parentID === sParentID);

  function drillIn(btn) {
    _setMenuPath((prev) => [...prev, { id: btn.id, name: btn.name }]);
    _setParentID(btn.id);
  }

  function handleBack() {
    let path = [...sMenuPath];
    path.pop();
    _setMenuPath(path);
    _setParentID(path.length > 0 ? path[path.length - 1].id : null);
  }

  function jumpTo(idx) {
    if (idx < 0) {
      _setParentID(null);
      _setMenuPath([]);
      return;
    }
    let path = sMenuPath.slice(0, idx + 1);
    _setMenuPath(path);
    _setParentID(path[path.length - 1].id);
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
        backgroundColor: "rgba(0,0,0,.4)",
        zIndex: 9999,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "45%",
          maxHeight: "70%",
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

              {/* Breadcrumb */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  flexWrap: "wrap",
                  marginBottom: 10,
                  paddingBottom: 10,
                  borderBottomWidth: 1,
                  borderBottomColor: gray(0.1),
                }}
              >
                <TouchableOpacity onPress={() => jumpTo(-1)}>
                  <Text
                    style={{
                      fontSize: 14,
                      color: C.blue,
                      fontWeight: sMenuPath.length === 0 ? "600" : "400",
                    }}
                  >
                    Root
                  </Text>
                </TouchableOpacity>
                {sMenuPath.map((seg, idx) => (
                  <View key={seg.id} style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text style={{ fontSize: 14, color: gray(0.4), marginHorizontal: 6 }}>
                      {">"}
                    </Text>
                    <TouchableOpacity onPress={() => jumpTo(idx)}>
                      <Text
                        style={{
                          fontSize: 14,
                          color: C.blue,
                          fontWeight: idx === sMenuPath.length - 1 ? "600" : "400",
                        }}
                      >
                        {seg.name}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>

              {/* Back button */}
              {sParentID && (
                <TouchableOpacity
                  onPress={handleBack}
                  style={{ marginBottom: 8 }}
                >
                  <Text style={{ fontSize: 14, color: C.blue }}>{"< Back"}</Text>
                </TouchableOpacity>
              )}

              {/* Button list */}
              <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={true}>
                {currentButtons.length === 0 ? (
                  <Text style={{ fontSize: 14, color: gray(0.5), paddingVertical: 10 }}>
                    No buttons at this level
                  </Text>
                ) : (
                  currentButtons.map((btn) => {
                    let childCount = quickButtons.filter(
                      (b) => b.parentID === btn.id
                    ).length;
                    let isIn = (btn.items || []).includes(itemID);
                    return (
                      <View
                        key={btn.id}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                          paddingVertical: 8,
                          paddingHorizontal: 10,
                          marginBottom: 4,
                          backgroundColor: isIn ? "rgba(88,145,65,0.08)" : gray(0.03),
                          borderRadius: 8,
                          borderWidth: isIn ? 1 : 0,
                          borderColor: isIn ? C.green : "transparent",
                        }}
                      >
                        <TouchableOpacity
                          onPress={() => {
                            if (childCount > 0) drillIn(btn);
                          }}
                          style={{
                            flex: 1,
                            flexDirection: "row",
                            alignItems: "center",
                          }}
                        >
                          <Text style={{ fontSize: 15, color: C.text }}>
                            {btn.name || "(unnamed)"}
                          </Text>
                          {childCount > 0 && (
                            <View
                              style={{
                                marginLeft: 8,
                                backgroundColor: C.blue,
                                borderRadius: 10,
                                paddingHorizontal: 7,
                                paddingVertical: 2,
                              }}
                            >
                              <Text style={{ fontSize: 11, color: "white", fontWeight: "600" }}>
                                {childCount}
                              </Text>
                            </View>
                          )}
                          {childCount > 0 && (
                            <Text style={{ fontSize: 13, color: gray(0.4), marginLeft: 4 }}>
                              {">"}
                            </Text>
                          )}
                        </TouchableOpacity>
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

// ─── main component ────────────────────────────────────────────────────────

export const InventoryItemModalScreen = ({ item, isNew, handleExit }) => {
  const zSettingsObj = useSettingsStore((state) => state.settings);
  const zShowLoginScreen = useLoginStore((state) => state.showLoginScreen);
  const quickButtons = zSettingsObj?.quickItemButtons || [];

  const [sItem, _setItem] = useState(() => cloneDeep(item));
  const [sEditing, _setEditing] = useState(!!isNew);
  const [sShowQBPicker, _setShowQBPicker] = useState(false);

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

  // ─── field change handler ──────────────────────────────────────────────

  function handleFieldChange(fieldName, value) {
    let updated = { ...sItem, [fieldName]: value };
    _setItem(updated);
    useInventoryStore.getState().setItem(updated, false);
    debouncedInvSaveRef.current(updated);
  }

  function handlePriceChange(fieldName, rawInput) {
    const { cents } = usdTypeMask(rawInput);
    handleFieldChange(fieldName, cents);
  }

  function handleMinutesChange(rawInput) {
    const digits = rawInput.replace(/\D/g, "");
    handleFieldChange("minutes", digits === "" ? 0 : Number(digits));
  }

  // ─── delete ────────────────────────────────────────────────────────────

  function handleDeleteItem() {
    useLoginStore.getState().execute(() => {
      useInventoryStore.getState().removeItem(sItem);
      dbDeleteInventoryItem(sItem.id);
      handleExit();
    }, "Admin");
  }

  // ─── quick button helpers ──────────────────────────────────────────────

  function handleRemoveFromButton(buttonID) {
    let updated = quickButtons.map((b) => {
      if (b.id !== buttonID) return b;
      return { ...b, items: (b.items || []).filter((id) => id !== sItem.id) };
    });
    useSettingsStore.getState().setField("quickItemButtons", updated, false);
    debouncedSettingsSaveRef.current(updated);
  }

  function handleToggleInButton(buttonID) {
    let btn = quickButtons.find((b) => b.id === buttonID);
    if (!btn) return;
    let isIn = (btn.items || []).includes(sItem.id);
    let updated = quickButtons.map((b) => {
      if (b.id !== buttonID) return b;
      if (isIn) {
        return { ...b, items: (b.items || []).filter((id) => id !== sItem.id) };
      } else {
        return { ...b, items: [...(b.items || []), sItem.id] };
      }
    });
    useSettingsStore.getState().setField("quickItemButtons", updated, false);
    debouncedSettingsSaveRef.current(updated);
  }

  // ─── render helpers ────────────────────────────────────────────────────

  const labelStyle = { fontStyle: "italic", color: gray(0.45), fontSize: 13, marginTop: 14 };
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
      <View style={{ flex: opts.flex || 1, marginRight: opts.last ? 0 : 10 }}>
        <Text style={labelStyle}>{label}</Text>
        {sEditing ? (
          opts.currency ? (
            <TextInput
              style={inputStyle}
              value={formatCurrencyDisp(sItem[fieldName])}
              onChangeText={(v) => handlePriceChange(fieldName, v)}
            />
          ) : opts.numeric ? (
            <TextInput
              style={inputStyle}
              value={String(sItem[fieldName] || "")}
              onChangeText={(v) => handleMinutesChange(v)}
              keyboardType="numeric"
            />
          ) : (
            <TextInput
              style={inputStyle}
              value={String(sItem[fieldName] || "")}
              onChangeText={(v) => handleFieldChange(fieldName, v)}
            />
          )
        ) : (
          <Text style={valueStyle}>{String(val ?? "-")}</Text>
        )}
      </View>
    );
  }

  // ─── current placements ────────────────────────────────────────────────

  let placements = getButtonsContainingItem(sItem.id, quickButtons);

  // ─── main render ───────────────────────────────────────────────────────

  const Component = useCallback(
    () => (
      <TouchableWithoutFeedback onPress={() => {}}>
        <View
          style={{
            width: "55%",
            height: "80%",
            backgroundColor: "white",
            borderRadius: 15,
            padding: 20,
            ...SHADOW_RADIUS_PROTO,
            shadowOffset: { width: 3, height: 3 },
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
              <TouchableOpacity
                onPress={() => _setEditing(!sEditing)}
                style={{
                  padding: 6,
                  marginRight: 10,
                  borderRadius: 6,
                  backgroundColor: sEditing ? C.green : "transparent",
                }}
              >
                <Image_
                  icon={ICONS.editPencil}
                  size={20}
                  style={sEditing ? { tintColor: "white" } : {}}
                />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleExit} style={{ padding: 6 }}>
                <Image_ icon={ICONS.close1} size={18} />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={true}
          >
            {/* SECTION 1: Item Details */}
            {renderField("Catalog Name", "formalName")}
            {renderField("Keyword/Short Name", "informalName")}
            {renderField("Brand", "brand")}

            {/* Category */}
            <Text style={labelStyle}>Category</Text>
            {sEditing ? (
              <DropdownMenu
                dataArr={CATEGORIES}
                buttonText={sItem.category || "Part"}
                buttonStyle={{
                  width: 120,
                  marginTop: 4,
                  paddingVertical: 4,
                  borderRadius: 6,
                }}
                onSelect={(cat) => handleFieldChange("category", cat)}
              />
            ) : (
              <Text style={valueStyle}>{sItem.category || "Part"}</Text>
            )}

            {/* Prices row */}
            <View style={{ flexDirection: "row", marginTop: 4 }}>
              {renderField("Price", "price", { currency: true, flex: 1 })}
              {renderField("Sale Price", "salePrice", { currency: true, flex: 1 })}
              {renderField("Cost", "cost", { currency: true, flex: 1, last: true })}
            </View>

            {/* Minutes — only if Labor */}
            {sItem.category === "Labor" && (
              <View style={{ flexDirection: "row", marginTop: 4 }}>
                {renderField("Minutes", "minutes", { numeric: true, flex: 1 })}
                <View style={{ flex: 2 }} />
              </View>
            )}

            {/* SKU / Barcode row */}
            <View style={{ flexDirection: "row", marginTop: 4 }}>
              {renderField("UPC", "upc", { flex: 1 })}
              {renderField("EAN", "ean", { flex: 1, last: true })}
            </View>
            <View style={{ flexDirection: "row", marginTop: 4 }}>
              {renderField("Custom SKU", "customSku", { flex: 1 })}
              {renderField("Manufacturer SKU", "manufacturerSku", { flex: 1, last: true })}
            </View>

            {/* DIVIDER */}
            <View
              style={{
                width: "100%",
                height: 1,
                backgroundColor: gray(0.15),
                marginTop: 22,
                marginBottom: 4,
              }}
            />

            {/* SECTION 2: Quick Button Placement */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginTop: 20,
                marginBottom: 6,
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: "600", color: C.text }}>
                Quick Button Placement
              </Text>
              <TouchableOpacity
                onPress={() => _setShowQBPicker(true)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 5,
                  backgroundColor: C.green,
                }}
              >
                <Text style={{ fontSize: 12, color: "white", fontWeight: "600" }}>
                  Add to Quick Button
                </Text>
              </TouchableOpacity>
            </View>
            {placements.length === 0 ? (
              <Text style={{ fontSize: 13, color: gray(0.5), marginBottom: 6 }}>
                Not assigned to any quick button menu
              </Text>
            ) : (
              placements.map((p) => (
                <View
                  key={p.buttonID}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingVertical: 5,
                    paddingHorizontal: 8,
                    marginBottom: 4,
                    backgroundColor: gray(0.04),
                    borderRadius: 6,
                  }}
                >
                  <Text style={{ fontSize: 13, color: C.text }}>{p.path}</Text>
                  <TouchableOpacity
                    onPress={() => handleRemoveFromButton(p.buttonID)}
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: 4,
                      backgroundColor: C.red,
                    }}
                  >
                    <Text style={{ fontSize: 11, color: "white", fontWeight: "600" }}>
                      Remove
                    </Text>
                  </TouchableOpacity>
                </View>
              ))
            )}

            {/* SECTION 3: Delete */}
            <View style={{ marginTop: 30, marginBottom: 20, alignItems: "center" }}>
              <TouchableOpacity
                onPress={handleDeleteItem}
                style={{
                  paddingHorizontal: 20,
                  paddingVertical: 10,
                  borderRadius: 6,
                  backgroundColor: C.red,
                }}
              >
                <Text style={{ fontSize: 14, color: "white", fontWeight: "600" }}>
                  Delete Item
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
          <View style={{ alignItems: "flex-end", marginTop: 10 }}>
            <TouchableOpacity
              onPress={handleExit}
              style={{
                paddingHorizontal: 20,
                paddingVertical: 8,
                borderRadius: 6,
                backgroundColor: gray(0.15),
              }}
            >
              <Text style={{ fontSize: 14, color: C.text, fontWeight: "600" }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableWithoutFeedback>
    ),
    [sItem, sEditing, quickButtons, zShowLoginScreen]
  );

  return createPortal(
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
          zIndex: 9998,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <div onClick={(e) => e.stopPropagation()}>
          <Component />
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
    </>,
    document.body
  );
};

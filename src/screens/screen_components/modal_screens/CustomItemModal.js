/* eslint-disable */
import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { View, Text, TextInput, TouchableOpacity } from "react-native-web";
import { C, COLOR_GRADIENTS, ICONS } from "../../../styles";
import { Button_, TextInput_, Image_ } from "../../../components";
import {
  usdTypeMask,
  applyDiscountToWorkorderItem,
  gray,
  generateEAN13Barcode,
} from "../../../utils";
import { INVENTORY_ITEM_PROTO, WORKORDER_ITEM_PROTO } from "../../../data";
import { DISCOUNT_TYPES } from "../../../constants";

import { useSettingsStore } from "../../../stores";
import { cloneDeep } from "lodash";

export const CustomItemModal = ({
  visible,
  onClose,
  onSave,
  type, // "labor" | "item"
  existingLine = null, // workorder line for editing
  anchorX = 0,
  anchorY = 0,
}) => {
  const zDiscounts = useSettingsStore((s) => s.settings?.discounts);
  const zLaborRate = useSettingsStore((s) => s.settings?.laborRateByHour);

  const isLabor = type === "labor";
  const isEditing = !!existingLine;

  const [sName, _setName] = useState("");
  const [sPriceDisplay, _setPriceDisplay] = useState("");
  const [sPriceCents, _setPriceCents] = useState(0);
  const [sMinutes, _setMinutes] = useState("");
  const [sIntakeNotes, _setIntakeNotes] = useState("");
  const [sReceiptNotes, _setReceiptNotes] = useState("");
  const [sDiscountObj, _setDiscountObj] = useState(null);
  const [sPriceManuallySet, _setPriceManuallySet] = useState(false);
  const [sDiscountDropdownOpen, _setDiscountDropdownOpen] = useState(false);
  const [sCustomPctVal, _setCustomPctVal] = useState("");
  const [sCustomDollarVal, _setCustomDollarVal] = useState("");
  const [sCustomDollarCents, _setCustomDollarCents] = useState(0);
  const discountBtnRef = useRef(null);

  // Populate fields when editing or when modal opens
  useEffect(() => {
    if (!visible) return;
    if (existingLine) {
      const inv = existingLine.inventoryItem || {};
      _setName(inv.formalName || "");
      const { display } = usdTypeMask(inv.price);
      _setPriceDisplay(display);
      _setPriceCents(inv.price || 0);
      _setMinutes(inv.minutes ? String(inv.minutes) : "");
      _setIntakeNotes(existingLine.intakeNotes || "");
      _setReceiptNotes(existingLine.receiptNotes || "");
      _setDiscountObj(existingLine.discountObj || null);
      _setPriceManuallySet(true);
      _setDiscountDropdownOpen(false);
      _setCustomPctVal("");
      _setCustomDollarVal("");
      _setCustomDollarCents(0);
    } else {
      _setName("");
      _setPriceDisplay("");
      _setPriceCents(0);
      _setMinutes("");
      _setIntakeNotes("");
      _setReceiptNotes("");
      _setDiscountObj(null);
      _setPriceManuallySet(false);
      _setDiscountDropdownOpen(false);
      _setCustomPctVal("");
      _setCustomDollarVal("");
      _setCustomDollarCents(0);
    }
  }, [visible, existingLine]);

  const getDropdownPosition = useCallback(() => {
    if (!discountBtnRef.current) return { top: 0, left: 0 };
    const rect = discountBtnRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const dropdownW = 260;
    const presetCount = (zDiscounts || []).filter((o) => o.type !== "$" || Number(o.value) <= sPriceCents).length + 1;
    const dropdownH = presetCount * 36 + 1 + 36 + 36 + 8;
    let posLeft = rect.left;
    let posTop = rect.bottom + 4;
    if (posTop + dropdownH > vh - 10) posTop = rect.top - dropdownH - 4;
    if (posTop < 10) posTop = 10;
    if (posLeft + dropdownW > vw - 10) posLeft = vw - dropdownW - 10;
    if (posLeft < 10) posLeft = 10;
    return { top: posTop, left: posLeft, width: dropdownW };
  }, [zDiscounts, sPriceCents]);

  if (!visible) return null;

  function handlePriceChange(raw) {
    const digitsOnly = String(raw).replace(/\D/g, "");
    const { display, cents } = usdTypeMask(digitsOnly);
    _setPriceDisplay(display);
    _setPriceCents(cents);
    _setPriceManuallySet(true);
    _setMinutes("");
  }

  function handleMinutesChange(val) {
    const cleaned = val.replace(/\D/g, "");
    _setMinutes(cleaned);

    if (!cleaned) return;

    // Auto-calculate price from labor rate unless user manually set price
    if (zLaborRate && !sPriceManuallySet) {
      const mins = Number(cleaned);
      const cents = Math.round((mins * zLaborRate) / 60);
      const { display } = usdTypeMask(cents);
      _setPriceDisplay(display);
      _setPriceCents(cents);
    }
  }

  function handleMinutesFocus() {
    // Reset manual flag so typing minutes will auto-calc price again
    _setPriceManuallySet(false);
    _setMinutes("");
  }

  function handlePriceFocus() {
    _setPriceDisplay("");
    _setPriceCents(0);
  }

  function handleDiscountSelect(discount) {
    _setDiscountObj(discount);
    _setDiscountDropdownOpen(false);
    _setCustomPctVal("");
    _setCustomDollarVal("");
    _setCustomDollarCents(0);
  }

  function handleSave() {
    // Build the synthetic inventory item
    let invItem = cloneDeep(INVENTORY_ITEM_PROTO);
    invItem.formalName = sName.trim();
    invItem.price = sPriceCents;
    invItem.category = isLabor ? "Labor" : "Item";
    invItem.customLabor = isLabor;
    invItem.customPart = !isLabor;
    invItem.minutes = isLabor ? Number(sMinutes) || 0 : 0;
    let barcode = isEditing
      ? existingLine.inventoryItem.id
      : generateEAN13Barcode();
    invItem.id = barcode;
    invItem.primaryBarcode = barcode;

    // Build the workorder line
    let line = isEditing ? cloneDeep(existingLine) : cloneDeep(WORKORDER_ITEM_PROTO);
    line.inventoryItem = invItem;
    line.intakeNotes = sIntakeNotes;
    line.receiptNotes = sReceiptNotes;
    if (!isEditing) line.id = crypto.randomUUID();

    // Apply discount if set
    if (sDiscountObj) {
      line.discountObj = sDiscountObj;
      line = applyDiscountToWorkorderItem(line);
    } else {
      line.discountObj = null;
    }

    onSave(line);
    onClose();
  }

  // Compute discounted price preview
  let discountedCents = null;
  if (sDiscountObj && sPriceCents > 0) {
    if (sDiscountObj.type === DISCOUNT_TYPES.percent) {
      let multiplier = 1 - Number("." + sDiscountObj.value);
      discountedCents = Math.round(sPriceCents * multiplier);
    } else {
      discountedCents = sPriceCents - (sDiscountObj.value || 0);
      if (discountedCents < 0) discountedCents = 0;
    }
  }

  const canSave = sName.trim().length > 0 && sPriceCents > 0;

  const modalWidth = 420;
  const modalHeight = 500;
  const margin = 10;
  const bottomMargin = 60;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  let left = anchorX - modalWidth / 2;
  if (left + modalWidth > vw - margin) left = vw - modalWidth - margin;
  if (left < margin) left = margin;
  let top = anchorY + 5;
  if (top + modalHeight > vh - bottomMargin) top = vh - modalHeight - bottomMargin;
  if (top < margin) top = margin;

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
        zIndex: 9999,
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ position: "absolute", top, left }}>
        <View
          style={{
            width: modalWidth,
            backgroundColor: C.backgroundWhite,
            borderRadius: 10,
            borderWidth: 2,
            borderColor: C.buttonLightGreenOutline,
            padding: 20,
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 15,
            }}
          >
            <Text
              style={{
                fontSize: 18,
                fontWeight: "600",
                color: C.text,
              }}
            >
              {isEditing ? "Edit" : "Add"} Custom {isLabor ? "Labor" : "Item"}
            </Text>
            <Button_
              icon={ICONS.redx}
              iconSize={18}
              buttonStyle={{
                backgroundColor: "transparent",
                paddingHorizontal: 0,
                paddingVertical: 0,
              }}
              onPress={onClose}
            />
          </View>

          {/* Item Name */}
          <Text style={{ fontSize: 12, color: gray(0.5), marginBottom: 3 }}>
            Item Name *
          </Text>
          <TextInput_
            placeholder={isLabor ? "Labor description" : "Item name"}
            value={sName}
            onChangeText={(val) => _setName(val.length === 1 ? val.toUpperCase() : val.charAt(0).toUpperCase() + val.slice(1))}
            debounceMs={0}
            autoFocus={true}
            style={{
              borderWidth: 1,
              borderColor: C.buttonLightGreenOutline,
              borderRadius: 5,
              paddingVertical: 6,
              paddingHorizontal: 8,
              fontSize: 15,
              color: C.text,
              outlineWidth: 0,
              backgroundColor: C.listItemWhite,
            }}
          />

          {/* Minutes (labor only) */}
          {isLabor && (
            <View style={{ marginTop: 12 }}>
              <Text style={{ fontSize: 12, color: gray(0.5), marginBottom: 3 }}>
                Minutes
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <TextInput
                  placeholder="0"
                  placeholderTextColor={gray(0.2)}
                  value={sMinutes}
                  onChangeText={(val) => handleMinutesChange(val.replace(/\D/g, ""))}
                  onFocus={handleMinutesFocus}
                  inputMode="numeric"
                  style={{
                    width: 80,
                    borderWidth: 1,
                    borderColor: C.buttonLightGreenOutline,
                    borderRadius: 5,
                    paddingVertical: 6,
                    paddingHorizontal: 8,
                    fontSize: 15,
                    color: C.text,
                    outlineWidth: 0,
                    outlineStyle: "none",
                    backgroundColor: C.listItemWhite,
                    textAlign: "center",
                  }}
                />
                <Text
                  style={{
                    marginLeft: 8,
                    fontSize: 12,
                    color: gray(0.5),
                  }}
                >
                  {"@ $" + usdTypeMask(zLaborRate, { withDollar: false }).display + "/hr"}
                </Text>
              </View>
            </View>
          )}

          {/* Price */}
          <View style={{ marginTop: 12 }}>
            <Text style={{ fontSize: 12, color: gray(0.5), marginBottom: 3 }}>
              Price *
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={{ fontSize: 16, color: C.text, marginRight: 4 }}>$</Text>
              <TextInput
                placeholder="0.00"
                placeholderTextColor={gray(0.2)}
                value={sPriceDisplay}
                onChangeText={handlePriceChange}
                onFocus={handlePriceFocus}
                inputMode="numeric"
                style={{
                  width: 120,
                  borderWidth: 1,
                  borderColor: C.buttonLightGreenOutline,
                  borderRadius: 5,
                  paddingVertical: 6,
                  paddingHorizontal: 8,
                  fontSize: 15,
                  color: C.text,
                  outlineWidth: 0,
                  outlineStyle: "none",
                  backgroundColor: C.listItemWhite,
                  textAlign: "right",
                }}
              />
            </View>
          </View>

          {/* Intake Notes */}
          <View style={{ marginTop: 12 }}>
            <Text style={{ fontSize: 12, color: gray(0.5), marginBottom: 3 }}>
              Intake Notes
            </Text>
            <TextInput_
              placeholder="Intake notes..."
              value={sIntakeNotes}
              onChangeText={(val) => _setIntakeNotes(val.charAt(0).toUpperCase() + val.slice(1))}
              multiline={true}
              numberOfLines={3}
              style={{
                borderWidth: 1,
                borderColor: C.buttonLightGreenOutline,
                borderRadius: 5,
                paddingVertical: 6,
                paddingHorizontal: 8,
                fontSize: 14,
                color: "orange",
                outlineWidth: 0,
                backgroundColor: C.listItemWhite,
              }}
            />
          </View>

          {/* Receipt Notes */}
          <View style={{ marginTop: 12 }}>
            <Text style={{ fontSize: 12, color: gray(0.5), marginBottom: 3 }}>
              Receipt Notes
            </Text>
            <TextInput_
              placeholder="Receipt notes..."
              value={sReceiptNotes}
              onChangeText={(val) => _setReceiptNotes(val.charAt(0).toUpperCase() + val.slice(1))}
              multiline={true}
              numberOfLines={3}
              style={{
                borderWidth: 1,
                borderColor: C.buttonLightGreenOutline,
                borderRadius: 5,
                paddingVertical: 6,
                paddingHorizontal: 8,
                fontSize: 14,
                color: "green",
                outlineWidth: 0,
                backgroundColor: C.listItemWhite,
              }}
            />
          </View>

          {/* Discount */}
          <View style={{ marginTop: 12 }}>
            <Text style={{ fontSize: 12, color: gray(0.5), marginBottom: 3 }}>
              Discount
            </Text>
            <div ref={discountBtnRef}>
              <TouchableOpacity
                onPress={() => { if (sPriceCents > 0) _setDiscountDropdownOpen(!sDiscountDropdownOpen); }}
                style={{
                  borderWidth: 1,
                  borderColor: C.buttonLightGreenOutline,
                  borderRadius: 5,
                  backgroundColor: C.listItemWhite,
                  paddingVertical: 8,
                  paddingHorizontal: 10,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  opacity: sPriceCents > 0 ? 1 : 0.4,
                }}
              >
                <Text style={{ color: sDiscountObj ? C.lightred : gray(0.5), fontSize: 14 }}>
                  {sDiscountObj?.name || "No Discount"}
                </Text>
                <Text style={{ fontSize: 10, color: gray(0.4) }}>{sDiscountDropdownOpen ? "\u25B2" : "\u25BC"}</Text>
              </TouchableOpacity>
            </div>
          </View>

          {/* Discount preview */}
          {discountedCents !== null && (
            <View
              style={{
                marginTop: 10,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Text
                style={{
                  fontSize: 14,
                  color: gray(0.5),
                  textDecorationLine: "line-through",
                }}
              >
                {"$" + usdTypeMask(sPriceCents, { withDollar: false }).display}
              </Text>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "600",
                  color: C.green,
                }}
              >
                {"$" + usdTypeMask(discountedCents, { withDollar: false }).display}
              </Text>
              <Text style={{ fontSize: 12, color: C.lightred }}>
                {sDiscountObj.type === DISCOUNT_TYPES.percent
                  ? sDiscountObj.value + "% off"
                  : "$" + usdTypeMask(sDiscountObj.value, { withDollar: false }).display + " off"}
              </Text>
            </View>
          )}

          {/* Action Buttons */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "flex-end",
              marginTop: 20,
              gap: 10,
            }}
          >
            <Button_
              text="Cancel"
              onPress={onClose}
              buttonStyle={{
                backgroundColor: "transparent",
                borderWidth: 1,
                borderColor: gray(0.2),
                borderRadius: 5,
                paddingHorizontal: 20,
                paddingVertical: 8,
              }}
              textStyle={{ color: C.text, fontSize: 14 }}
            />
            <Button_
              text={isEditing ? "Save" : "Add"}
              onPress={handleSave}
              disabled={!canSave}
              colorGradientArr={canSave ? COLOR_GRADIENTS.green : COLOR_GRADIENTS.grey}
              buttonStyle={{
                borderRadius: 5,
                paddingHorizontal: 20,
                paddingVertical: 8,
                opacity: canSave ? 1 : 0.4,
              }}
              textStyle={{ color: C.textWhite, fontSize: 14, fontWeight: "600" }}
            />
          </View>
        </View>
      </div>
      {sDiscountDropdownOpen && (() => {
        const pos = getDropdownPosition();
        const presetDiscounts = (zDiscounts || []).filter((o) => o.type !== "$" || Number(o.value) <= sPriceCents);
        return (
          <>
            <div
              onClick={(e) => { e.stopPropagation(); _setDiscountDropdownOpen(false); }}
              style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 10000 }}
            />
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "fixed",
                top: pos.top,
                left: pos.left,
                width: pos.width,
                zIndex: 10001,
                backgroundColor: "white",
                borderRadius: 6,
                borderWidth: 2,
                borderStyle: "solid",
                borderColor: gray(0.08),
                boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
                maxHeight: 340,
                overflowY: "auto",
              }}
            >
              <div
                onClick={() => handleDiscountSelect(null)}
                style={{
                  padding: 8,
                  cursor: "pointer",
                  fontSize: 13,
                  color: C.text,
                  backgroundColor: gray(0.036),
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = gray(0.1); }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = gray(0.036); }}
              >
                No Discount
              </div>
              {presetDiscounts.map((o, idx) => (
                <div
                  key={o.name}
                  onClick={() => handleDiscountSelect(o)}
                  style={{
                    padding: 8,
                    cursor: "pointer",
                    fontSize: 13,
                    color: C.text,
                    backgroundColor: idx % 2 === 0 ? "white" : gray(0.036),
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = gray(0.1); }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = idx % 2 === 0 ? "white" : gray(0.036); }}
                >
                  {o.name}
                </div>
              ))}
              <div style={{ height: 1, backgroundColor: gray(0.15) }} />
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", height: 36, paddingHorizontal: 6, backgroundColor: "rgb(198,218,240)" }}>
                <Text style={{ fontSize: 13, color: gray(0.5), marginRight: 6 }}>Custom %</Text>
                <TextInput
                  value={sCustomPctVal}
                  placeholder="0"
                  placeholderTextColor={gray(0.3)}
                  maxLength={3}
                  onChangeText={(v) => {
                    let cleaned = v.replace(/[^0-9]/g, "");
                    if (Number(cleaned) > 100) cleaned = "100";
                    _setCustomPctVal(cleaned);
                  }}
                  onSubmitEditing={() => {
                    const num = Number(sCustomPctVal);
                    if (!num) return;
                    handleDiscountSelect({ id: "custom_" + Date.now(), name: num + "% Off", value: String(num), type: DISCOUNT_TYPES.percent, custom: true });
                  }}
                  style={{ width: 50, height: 28, borderWidth: 1, borderColor: C.buttonLightGreenOutline, borderRadius: 4, paddingHorizontal: 6, fontSize: 13, color: C.text, textAlign: "center", outlineWidth: 0, backgroundColor: "white" }}
                />
                <TouchableOpacity
                  onPress={() => {
                    const num = Number(sCustomPctVal);
                    if (!num) return;
                    handleDiscountSelect({ id: "custom_" + Date.now(), name: num + "% Off", value: String(num), type: DISCOUNT_TYPES.percent, custom: true });
                  }}
                  style={{ marginLeft: 4, width: 24, height: 24, borderRadius: 4, backgroundColor: C.green, alignItems: "center", justifyContent: "center" }}
                >
                  <Image_ icon={ICONS.check1} size={14} />
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", height: 36, paddingHorizontal: 6, backgroundColor: "rgb(198,218,240)" }}>
                <Text style={{ fontSize: 13, color: gray(0.5), marginRight: 6 }}>Custom $</Text>
                <TextInput
                  value={sCustomDollarVal}
                  placeholder="0.00"
                  placeholderTextColor={gray(0.3)}
                  onChangeText={(v) => {
                    let result = usdTypeMask(v);
                    if (sPriceCents && result.cents > sPriceCents) result = usdTypeMask(String(sPriceCents));
                    _setCustomDollarVal(result.display);
                    _setCustomDollarCents(result.cents);
                  }}
                  onSubmitEditing={() => {
                    if (!sCustomDollarCents) return;
                    const dollars = (sCustomDollarCents / 100).toFixed(2);
                    handleDiscountSelect({ id: "custom_" + Date.now(), name: "$" + dollars + " Off", value: String(sCustomDollarCents), type: DISCOUNT_TYPES.dollar, custom: true });
                  }}
                  style={{ width: 70, height: 28, borderWidth: 1, borderColor: C.buttonLightGreenOutline, borderRadius: 4, paddingHorizontal: 6, fontSize: 13, color: C.text, textAlign: "center", outlineWidth: 0, backgroundColor: "white" }}
                />
                <TouchableOpacity
                  onPress={() => {
                    if (!sCustomDollarCents) return;
                    const dollars = (sCustomDollarCents / 100).toFixed(2);
                    handleDiscountSelect({ id: "custom_" + Date.now(), name: "$" + dollars + " Off", value: String(sCustomDollarCents), type: DISCOUNT_TYPES.dollar, custom: true });
                  }}
                  style={{ marginLeft: 4, width: 24, height: 24, borderRadius: 4, backgroundColor: C.green, alignItems: "center", justifyContent: "center" }}
                >
                  <Image_ icon={ICONS.check1} size={14} />
                </TouchableOpacity>
              </View>
            </div>
          </>
        );
      })()}
    </div>,
    document.body
  );
};

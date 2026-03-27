/* eslint-disable */
import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { View, Text, TextInput, TouchableOpacity } from "react-native-web";
import { C, COLOR_GRADIENTS, ICONS } from "../../../styles";
import { Button_, TextInput_, DropdownMenu } from "../../../components";
import {
  generateEAN13Barcode,
  usdTypeMask,
  applyDiscountToWorkorderItem,
  gray,
} from "../../../utils";
import { INVENTORY_ITEM_PROTO, WORKORDER_ITEM_PROTO } from "../../../data";
import { DISCOUNT_TYPES } from "../../../constants";
import { useSettingsStore } from "../../../stores";
import { cloneDeep } from "lodash";

export const CustomItemModal = ({
  visible,
  onClose,
  onSave,
  type, // "labor" | "part"
  existingLine = null, // workorder line for editing
}) => {
  const zDiscounts = useSettingsStore((s) => s.settings?.discounts);
  const zLaborRate = useSettingsStore((s) => s.settings?.laborRateByHour);

  const isLabor = type === "labor";
  const isEditing = !!existingLine;

  const [sName, _setName] = useState("");
  const [sPriceDisplay, _setPriceDisplay] = useState("0.00");
  const [sPriceCents, _setPriceCents] = useState(0);
  const [sMinutes, _setMinutes] = useState("");
  const [sIntakeNotes, _setIntakeNotes] = useState("");
  const [sReceiptNotes, _setReceiptNotes] = useState("");
  const [sDiscountObj, _setDiscountObj] = useState(null);
  const [sPriceManuallySet, _setPriceManuallySet] = useState(false);

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
    } else {
      _setName("");
      _setPriceDisplay("0.00");
      _setPriceCents(0);
      _setMinutes("");
      _setIntakeNotes("");
      _setReceiptNotes("");
      _setDiscountObj(null);
      _setPriceManuallySet(false);
    }
  }, [visible, existingLine]);

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

  function handleDiscountSelect(item) {
    if (item.label === "No Discount") {
      _setDiscountObj(null);
      return;
    }
    const discount = zDiscounts.find((o) => o.name === item.label);
    if (discount) _setDiscountObj(discount);
  }

  function handleSave() {
    // Build the synthetic inventory item
    let invItem = cloneDeep(INVENTORY_ITEM_PROTO);
    invItem.formalName = sName.trim();
    invItem.price = sPriceCents;
    invItem.category = isLabor ? "Labor" : "Part";
    invItem.customLabor = isLabor;
    invItem.customPart = !isLabor;
    invItem.minutes = isLabor ? Number(sMinutes) || 0 : 0;
    invItem.id = isEditing
      ? existingLine.inventoryItem.id
      : generateEAN13Barcode();

    // Build the workorder line
    let line = isEditing ? cloneDeep(existingLine) : cloneDeep(WORKORDER_ITEM_PROTO);
    line.inventoryItem = invItem;
    line.intakeNotes = sIntakeNotes;
    line.receiptNotes = sReceiptNotes;
    if (!isEditing) line.id = generateEAN13Barcode();

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
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div onClick={(e) => e.stopPropagation()}>
        <View
          style={{
            width: 420,
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
              {isEditing ? "Edit" : "Add"} Custom {isLabor ? "Labor" : "Part"}
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
            placeholder={isLabor ? "Labor description" : "Part name"}
            value={sName}
            onChangeText={(val) => _setName(val.length === 1 ? val.toUpperCase() : val.charAt(0).toUpperCase() + val.slice(1))}
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
            <DropdownMenu
              buttonText={sDiscountObj?.name || "No Discount"}
              buttonStyle={{
                borderWidth: 1,
                borderColor: C.buttonLightGreenOutline,
                borderRadius: 5,
                backgroundColor: C.listItemWhite,
              }}
              buttonTextStyle={{
                color: sDiscountObj ? C.lightred : gray(0.5),
                fontSize: 14,
              }}
              modalCoordY={25}
              dataArr={[
                { label: "No Discount" },
                ...(zDiscounts || []).map((o) => ({ label: o.name })),
              ]}
              onSelect={handleDiscountSelect}
            />
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
    </div>,
    document.body
  );
};

/* eslint-disable */
import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { C, COLOR_GRADIENTS, ICONS } from "../../../styles";
import { useZ } from "../../../hooks/useZ";
import { Button, TextInput, Image } from "../../../dom_components";
import { usdTypeMask, applyDiscountToWorkorderItem, generateEAN13Barcode } from "../../../utils";
import { INVENTORY_ITEM_PROTO, WORKORDER_ITEM_PROTO } from "../../../data";
import { DISCOUNT_TYPES } from "../../../constants";

import { useSettingsStore } from "../../../stores";
import cloneDeep from "lodash/cloneDeep";

import styles from "./CustomItemModal.module.css";

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
  const zModal = useZ("modal", visible);
  const zDropdown = useZ("dropdown", visible && sDiscountDropdownOpen);

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

  function submitCustomPct() {
    const num = Number(sCustomPctVal);
    if (!num) return;
    handleDiscountSelect({ id: "custom_" + Date.now(), name: num + "% Off", value: String(num), type: DISCOUNT_TYPES.percent, custom: true });
  }

  function submitCustomDollar() {
    if (!sCustomDollarCents) return;
    const dollars = (sCustomDollarCents / 100).toFixed(2);
    handleDiscountSelect({ id: "custom_" + Date.now(), name: "$" + dollars + " Off", value: String(sCustomDollarCents), type: DISCOUNT_TYPES.dollar, custom: true });
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
    <div onClick={onClose} className={styles.overlay} style={{ zIndex: zModal }}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={styles.anchored}
        style={{ top, left }}
      >
        <div className={styles.modal}>
          {/* Header */}
          <div className={styles.header}>
            <span className={styles.headerTitle}>
              {isEditing ? "Edit" : "Add"} Custom {isLabor ? "Labor" : "Item"}
            </span>
            <button type="button" className={styles.closeBtn} onClick={onClose}>
              <Image icon={ICONS.redx} size={18} />
            </button>
          </div>

          {/* Item Name */}
          <span className={styles.fieldLabel}>Item Name *</span>
          <TextInput
            placeholder={isLabor ? "Labor description" : "Item name"}
            value={sName}
            onChangeText={(val) => _setName(val.length === 1 ? val.toUpperCase() : val.charAt(0).toUpperCase() + val.slice(1))}
            debounceMs={0}
            autoFocus={true}
            className={`${styles.input} ${styles.inputName}`}
          />

          {/* Minutes (labor only) */}
          {isLabor && (
            <div className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>Minutes</span>
              <div className={styles.fieldRow}>
                <TextInput
                  placeholder="0"
                  placeholderTextColor={C.textDisabled}
                  value={sMinutes}
                  onChangeText={(val) => handleMinutesChange(val.replace(/\D/g, ""))}
                  onFocus={handleMinutesFocus}
                  debounceMs={0}
                  inputMode="numeric"
                  className={`${styles.input} ${styles.inputMinutes}`}
                />
                <span className={styles.minutesLabel}>
                  {"@ $" + usdTypeMask(zLaborRate, { withDollar: false }).display + "/hr"}
                </span>
              </div>
            </div>
          )}

          {/* Price */}
          <div className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>Price *</span>
            <div className={styles.fieldRow}>
              <span className={styles.priceCurrency}>$</span>
              <TextInput
                placeholder="0.00"
                placeholderTextColor={C.textDisabled}
                value={sPriceDisplay}
                onChangeText={handlePriceChange}
                onFocus={handlePriceFocus}
                debounceMs={0}
                inputMode="numeric"
                className={`${styles.input} ${styles.inputPrice}`}
              />
            </div>
          </div>

          {/* Intake Notes */}
          <div className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>Intake Notes</span>
            <TextInput
              placeholder="Intake notes..."
              value={sIntakeNotes}
              onChangeText={(val) => _setIntakeNotes(val.charAt(0).toUpperCase() + val.slice(1))}
              multiline={true}
              numberOfLines={3}
              debounceMs={0}
              className={`${styles.input} ${styles.inputArea} ${styles.inputAreaIntake}`}
            />
          </div>

          {/* Receipt Notes */}
          <div className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>Receipt Notes</span>
            <TextInput
              placeholder="Receipt notes..."
              value={sReceiptNotes}
              onChangeText={(val) => _setReceiptNotes(val.charAt(0).toUpperCase() + val.slice(1))}
              multiline={true}
              numberOfLines={3}
              debounceMs={0}
              className={`${styles.input} ${styles.inputArea} ${styles.inputAreaReceipt}`}
            />
          </div>

          {/* Discount */}
          <div className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>Discount</span>
            <button
              type="button"
              ref={discountBtnRef}
              onClick={() => { if (sPriceCents > 0) _setDiscountDropdownOpen(!sDiscountDropdownOpen); }}
              className={`${styles.discountTrigger} ${sPriceCents > 0 ? "" : styles.discountTriggerDisabled}`}
            >
              <span className={`${styles.discountTriggerLabel} ${sDiscountObj ? styles.discountTriggerLabelActive : ""}`}>
                {sDiscountObj?.name || "No Discount"}
              </span>
              <span className={styles.discountTriggerCaret}>
                {sDiscountDropdownOpen ? "\u25B2" : "\u25BC"}
              </span>
            </button>
          </div>

          {/* Discount preview */}
          {discountedCents !== null && (
            <div className={styles.discountPreviewRow}>
              <span className={styles.discountPreviewOld}>
                {"$" + usdTypeMask(sPriceCents, { withDollar: false }).display}
              </span>
              <span className={styles.discountPreviewNew}>
                {"$" + usdTypeMask(discountedCents, { withDollar: false }).display}
              </span>
              <span className={styles.discountPreviewBadge}>
                {sDiscountObj.type === DISCOUNT_TYPES.percent
                  ? sDiscountObj.value + "% off"
                  : "$" + usdTypeMask(sDiscountObj.value, { withDollar: false }).display + " off"}
              </span>
            </div>
          )}

          {/* Action Buttons */}
          <div className={styles.actionsRow}>
            <Button
              text="Cancel"
              onPress={onClose}
              colorGradientArr={COLOR_GRADIENTS.grey}
            />
            <Button
              text={isEditing ? "Save" : "Add"}
              onPress={handleSave}
              enabled={canSave}
              colorGradientArr={canSave ? COLOR_GRADIENTS.green : COLOR_GRADIENTS.grey}
            />
          </div>
        </div>
      </div>
      {sDiscountDropdownOpen && (() => {
        const pos = getDropdownPosition();
        const presetDiscounts = (zDiscounts || []).filter((o) => o.type !== "$" || Number(o.value) <= sPriceCents);
        return (
          <>
            <div
              onClick={(e) => { e.stopPropagation(); _setDiscountDropdownOpen(false); }}
              className={styles.dropdownBackdrop}
              style={{ zIndex: zDropdown }}
            />
            <div
              onClick={(e) => e.stopPropagation()}
              className={styles.dropdown}
              style={{ top: pos.top, left: pos.left, width: pos.width, zIndex: zDropdown + 1 }}
            >
              <div
                onClick={() => handleDiscountSelect(null)}
                className={`${styles.dropdownItem} ${styles.dropdownItemNone}`}
              >
                No Discount
              </div>
              {presetDiscounts.map((o, idx) => (
                <div
                  key={o.name}
                  onClick={() => handleDiscountSelect(o)}
                  className={`${styles.dropdownItem} ${idx % 2 === 0 ? styles.dropdownItemEven : styles.dropdownItemOdd}`}
                >
                  {o.name}
                </div>
              ))}
              <div className={styles.dropdownDivider} />
              <div className={styles.customRow}>
                <span className={styles.customLabel}>Custom %</span>
                <TextInput
                  value={sCustomPctVal}
                  placeholder="0"
                  placeholderTextColor={C.textDisabled}
                  maxLength={3}
                  debounceMs={0}
                  inputMode="numeric"
                  onChangeText={(v) => {
                    let cleaned = v.replace(/[^0-9]/g, "");
                    if (Number(cleaned) > 100) cleaned = "100";
                    _setCustomPctVal(cleaned);
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter") submitCustomPct(); }}
                  className={`${styles.customInput} ${styles.customInputPct}`}
                />
                <button
                  type="button"
                  onClick={submitCustomPct}
                  className={styles.customSubmit}
                >
                  <Image icon={ICONS.check1} size={14} />
                </button>
              </div>
              <div className={styles.customRow}>
                <span className={styles.customLabel}>Custom $</span>
                <TextInput
                  value={sCustomDollarVal}
                  placeholder="0.00"
                  placeholderTextColor={C.textDisabled}
                  debounceMs={0}
                  inputMode="numeric"
                  onChangeText={(v) => {
                    let result = usdTypeMask(v);
                    if (sPriceCents && result.cents > sPriceCents) result = usdTypeMask(String(sPriceCents));
                    _setCustomDollarVal(result.display);
                    _setCustomDollarCents(result.cents);
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter") submitCustomDollar(); }}
                  className={`${styles.customInput} ${styles.customInputDollar}`}
                />
                <button
                  type="button"
                  onClick={submitCustomDollar}
                  className={styles.customSubmit}
                >
                  <Image icon={ICONS.check1} size={14} />
                </button>
              </div>
            </div>
          </>
        );
      })()}
    </div>,
    document.body
  );
};

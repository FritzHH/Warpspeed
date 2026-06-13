import { useState, useEffect, useRef } from "react";
import cloneDeep from "lodash/cloneDeep";
import { ICONS } from "../../../styles";
import { Image, TouchableOpacity, ModalFooter, ModalFooterButton } from "../../../dom_components";
import {
  usdTypeMask,
  applyDiscountToWorkorderItem,
  generateEAN13Barcode,
  capitalizeFirstLetterOfString,
} from "../../../utils";
import { INVENTORY_ITEM_PROTO, WORKORDER_ITEM_PROTO } from "../../../data";
import { DISCOUNT_TYPES } from "../../../constants";
import { useSettingsStore } from "../../../stores";
import styles from "./AddCustomLaborModal.module.css";

export function AddCustomLaborModal({ existingLine = null, onSave, onClose }) {
  const zDiscounts = useSettingsStore((s) => s.settings?.discounts);
  const zLaborRate = useSettingsStore((s) => s.settings?.laborRateByHour);

  const isEditing = !!existingLine;

  const [sName, _setName] = useState("");
  const [sPriceDisplay, _setPriceDisplay] = useState("");
  const [sPriceCents, _setPriceCents] = useState(0);
  const [sMinutes, _setMinutes] = useState("");
  const [sIntakeNotes, _setIntakeNotes] = useState("");
  const [sReceiptNotes, _setReceiptNotes] = useState("");
  const [sDiscountObj, _setDiscountObj] = useState(null);
  const [sPriceManuallySet, _setPriceManuallySet] = useState(false);
  const [sDiscountOpen, _setDiscountOpen] = useState(false);
  const [sCustomPctVal, _setCustomPctVal] = useState("");
  const [sCustomDollarVal, _setCustomDollarVal] = useState("");
  const [sCustomDollarCents, _setCustomDollarCents] = useState(0);

  const nameInputRef = useRef(null);

  useEffect(() => {
    if (existingLine) {
      const inv = existingLine.inventoryItem || {};
      _setName(inv.catalogName || inv.formalName || "");
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
      _setPriceDisplay("");
      _setPriceCents(0);
      _setMinutes("");
      _setIntakeNotes("");
      _setReceiptNotes("");
      _setDiscountObj(null);
      _setPriceManuallySet(false);
    }
    _setDiscountOpen(false);
    _setCustomPctVal("");
    _setCustomDollarVal("");
    _setCustomDollarCents(0);
    setTimeout(() => nameInputRef.current?.focus(), 50);
  }, [existingLine]);

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
    if (zLaborRate && !sPriceManuallySet) {
      const mins = Number(cleaned);
      const cents = Math.round((mins * zLaborRate) / 60);
      const { display } = usdTypeMask(cents);
      _setPriceDisplay(display);
      _setPriceCents(cents);
    }
  }

  function handleMinutesFocus() {
    _setPriceManuallySet(false);
    _setMinutes("");
  }

  function handlePriceFocus() {
    _setPriceDisplay("");
    _setPriceCents(0);
  }

  function handleDiscountSelect(discount) {
    _setDiscountObj(discount);
    _setDiscountOpen(false);
    _setCustomPctVal("");
    _setCustomDollarVal("");
    _setCustomDollarCents(0);
  }

  function submitCustomPct() {
    const num = Number(sCustomPctVal);
    if (!num) return;
    handleDiscountSelect({
      id: "custom_" + Date.now(),
      name: num + "% Off",
      value: String(num),
      type: DISCOUNT_TYPES.percent,
      custom: true,
    });
  }

  function submitCustomDollar() {
    if (!sCustomDollarCents) return;
    const dollars = (sCustomDollarCents / 100).toFixed(2);
    handleDiscountSelect({
      id: "custom_" + Date.now(),
      name: "$" + dollars + " Off",
      value: String(sCustomDollarCents),
      type: DISCOUNT_TYPES.dollar,
      custom: true,
    });
  }

  function handleSave() {
    let invItem = cloneDeep(INVENTORY_ITEM_PROTO);
    invItem.catalogName = sName.trim();
    invItem.price = sPriceCents;
    invItem.category = "Labor";
    invItem.customLabor = true;
    invItem.customPart = false;
    invItem.minutes = Number(sMinutes) || 0;
    const barcode = isEditing ? existingLine.inventoryItem.id : generateEAN13Barcode();
    invItem.id = barcode;
    invItem.primaryBarcode = barcode;

    let line = isEditing ? cloneDeep(existingLine) : cloneDeep(WORKORDER_ITEM_PROTO);
    line.inventoryItem = invItem;
    line.intakeNotes = sIntakeNotes;
    line.receiptNotes = sReceiptNotes;
    if (!isEditing) line.id = crypto.randomUUID();

    if (sDiscountObj) {
      line.discountObj = sDiscountObj;
      line = applyDiscountToWorkorderItem(line);
    } else {
      line.discountObj = null;
    }

    onSave(line);
    onClose();
  }

  let discountedCents = null;
  if (sDiscountObj && sPriceCents > 0) {
    if (sDiscountObj.type === DISCOUNT_TYPES.percent) {
      const multiplier = 1 - Number("." + sDiscountObj.value);
      discountedCents = Math.round(sPriceCents * multiplier);
    } else {
      discountedCents = sPriceCents - (sDiscountObj.value || 0);
      if (discountedCents < 0) discountedCents = 0;
    }
  }

  const canSave = sName.trim().length > 0 && (sPriceCents > 0 || Number(sMinutes) > 0);
  const presetDiscounts = (zDiscounts || []).filter((o) => o.type !== "$" || Number(o.value) <= sPriceCents);

  return (
    <div className={styles.overlay}>
      <div className={styles.header}>
        <TouchableOpacity onPress={onClose} className={styles.headerBtn}>
          <Image icon={ICONS.greenLeftArrow} size={22} />
        </TouchableOpacity>
        <span className={styles.title}>{isEditing ? "Edit" : "Add"} Custom Labor</span>
      </div>

      <div className={styles.scroll}>
        <span className={styles.fieldLabel}>Labor Description *</span>
        <input
          ref={nameInputRef}
          type="text"
          placeholder="Labor description"
          value={sName}
          onChange={(e) => _setName(capitalizeFirstLetterOfString(e.target.value))}
          className={styles.input}
        />

        <span className={styles.fieldLabel}>Minutes</span>
        <div className={styles.fieldRow}>
          <input
            type="text"
            inputMode="numeric"
            placeholder="0"
            value={sMinutes}
            onChange={(e) => handleMinutesChange(e.target.value)}
            onFocus={handleMinutesFocus}
            onKeyDown={(e) => {
              if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && !/[0-9]/.test(e.key)) {
                e.preventDefault();
              }
            }}
            className={styles.inputSmall}
          />
          <span className={styles.rateHint}>
            {"@ $" + usdTypeMask(zLaborRate, { withDollar: false }).display + "/hr"}
          </span>
        </div>

        <span className={styles.fieldLabel}>Price *</span>
        <div className={styles.priceWrap}>
          <span className={styles.priceCurrency}>$</span>
          <input
            type="text"
            inputMode="numeric"
            placeholder="0.00"
            value={sPriceDisplay}
            onChange={(e) => handlePriceChange(e.target.value)}
            onFocus={handlePriceFocus}
            onKeyDown={(e) => {
              if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && !/[0-9]/.test(e.key)) {
                e.preventDefault();
              }
            }}
            className={styles.priceInput}
          />
        </div>

        <span className={styles.fieldLabel}>Intake Notes</span>
        <textarea
          placeholder="Intake notes..."
          value={sIntakeNotes}
          onChange={(e) => _setIntakeNotes(capitalizeFirstLetterOfString(e.target.value))}
          rows={3}
          className={styles.textarea}
        />

        <span className={styles.fieldLabel}>Receipt Notes</span>
        <textarea
          placeholder="Receipt notes..."
          value={sReceiptNotes}
          onChange={(e) => _setReceiptNotes(capitalizeFirstLetterOfString(e.target.value))}
          rows={3}
          className={styles.textarea}
        />

        <span className={styles.fieldLabel}>Discount</span>
        <button
          type="button"
          onClick={() => { if (sPriceCents > 0) _setDiscountOpen(!sDiscountOpen); }}
          className={`${styles.discountTrigger} ${sPriceCents > 0 ? "" : styles.discountTriggerDisabled}`}
        >
          <span className={`${styles.discountTriggerLabel} ${sDiscountObj ? styles.discountTriggerLabelActive : ""}`}>
            {sDiscountObj?.name || "No Discount"}
          </span>
          <span className={styles.discountCaret}>{sDiscountOpen ? "\u25B2" : "\u25BC"}</span>
        </button>

        {discountedCents !== null && (
          <div className={styles.discountPreview}>
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

        {sDiscountOpen && (
          <div className={styles.discountPanel}>
            <button
              type="button"
              onClick={() => handleDiscountSelect(null)}
              className={styles.discountRow}
            >
              No Discount
            </button>
            {presetDiscounts.map((o) => (
              <button
                key={o.name}
                type="button"
                onClick={() => handleDiscountSelect(o)}
                className={styles.discountRow}
              >
                {o.name}
              </button>
            ))}
            <div className={styles.discountDivider} />
            <div className={styles.customRow}>
              <span className={styles.customLabel}>Custom %</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="0"
                value={sCustomPctVal}
                maxLength={3}
                onChange={(e) => {
                  let cleaned = e.target.value.replace(/[^0-9]/g, "");
                  if (Number(cleaned) > 100) cleaned = "100";
                  _setCustomPctVal(cleaned);
                }}
                onKeyDown={(e) => { if (e.key === "Enter") submitCustomPct(); }}
                className={styles.customInput}
              />
              <TouchableOpacity onPress={submitCustomPct} className={styles.customCheckBtn}>
                <Image icon={ICONS.check1} size={18} />
              </TouchableOpacity>
            </div>
            <div className={styles.customRow}>
              <span className={styles.customLabel}>Custom $</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="0.00"
                value={sCustomDollarVal}
                onChange={(e) => {
                  let result = usdTypeMask(e.target.value);
                  if (sPriceCents && result.cents > sPriceCents) result = usdTypeMask(String(sPriceCents));
                  _setCustomDollarVal(result.display);
                  _setCustomDollarCents(result.cents);
                }}
                onKeyDown={(e) => { if (e.key === "Enter") submitCustomDollar(); }}
                className={styles.customInput}
              />
              <TouchableOpacity onPress={submitCustomDollar} className={styles.customCheckBtn}>
                <Image icon={ICONS.check1} size={18} />
              </TouchableOpacity>
            </div>
          </div>
        )}
      </div>

      <ModalFooter>
        <ModalFooterButton variant="default" onClick={onClose}>
          Cancel
        </ModalFooterButton>
        {canSave && (
          <ModalFooterButton variant="accent" onClick={handleSave}>
            {isEditing ? "Save" : "Add"}
          </ModalFooterButton>
        )}
      </ModalFooter>
    </div>
  );
}

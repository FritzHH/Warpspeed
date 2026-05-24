/*eslint-disable*/
import { useState, useRef, lazy, Suspense } from "react";
import cloneDeep from "lodash/cloneDeep";
import debounce from "lodash/debounce";
import {
  useSettingsStore,
  useInventoryStore,
  useLoginStore,
} from "../../../stores";
import {
  CheckBox,
  CurrencyInput,
  CustomerQuickNotes,
  Dialog,
  DropdownMenu,
  Image,
  LoginModal,
  TextInput,
  Tooltip,
  ModalFooter,
  ModalFooterButton,
} from "../../../dom_components";
import { C, ICONS } from "../../../styles";
import styles from "./InventoryItemModalScreen.module.css";
import { formatCurrencyDisp, showAlert, deepEqual, localStorageWrapper } from "../../../utils";
import {
  dbSaveInventoryItem,
  dbDeleteInventoryItem,
  dbSavePrintObj,
} from "../../../db_calls_wrapper";
import { labelPrintBuilder } from "../../../shared/labelPrintBuilder";
const QuickButtonPickerModal = lazy(() =>
  import("./QuickButtonPickerModal").then((m) => ({ default: m.QuickButtonPickerModal }))
);

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

// ─── main component ────────────────────────────────────────────────────────

export const InventoryItemModalScreen = ({ item, isNew, handleExit }) => {
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

  function handlePriceChange(fieldName, cents) {
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

  const sectionCardInline = { borderColor: C.borderSubtle, backgroundColor: C.surfaceAlt };
  const inputInline = { color: C.text, borderBottomColor: C.buttonLightGreenOutline };
  const textareaInline = {
    color: C.text,
    backgroundColor: C.listItemWhite,
    boxShadow: "inset 0 0 0 1px " + C.buttonLightGreenOutline,
  };

  function renderField(label, fieldName, opts = {}) {
    let val = sItem[fieldName];
    if (opts.currency) val = formatCurrencyDisp(val, true);
    if (opts.currency && !sEditing && (val === "" || val === "$0.00")) val = "-";
    if (!opts.currency && !sEditing && (val === "" || val === 0)) val = "-";

    return (
      <div
        className={`${styles.field}${opts.last ? " " + styles.fieldLast : ""}`}
        style={opts.flex ? { flex: opts.flex } : undefined}
      >
        <label className={styles.fieldLabel} style={{ color: C.textMuted }}>
          {label}
          {sEditing && opts.hint ? (
            <span className={styles.fieldHint} style={{ color: C.textMuted }}>{opts.hint}</span>
          ) : null}
        </label>
        {sEditing ? (
          opts.currency ? (
            <CurrencyInput
              className={styles.fieldInput}
              style={inputInline}
              cents={sItem[fieldName]}
              onChangeCents={(c) => handlePriceChange(fieldName, c)}
              placeholder="$0.00"
            />
          ) : opts.numeric ? (
            <input
              type="text"
              inputMode="numeric"
              className={styles.fieldInput}
              style={inputInline}
              value={String(sItem[fieldName] || "")}
              onChange={(e) => handleMinutesChange(e.target.value)}
            />
          ) : opts.multiline ? (
            <TextInput
              multiline
              debounceMs={0}
              className={styles.fieldTextarea}
              style={textareaInline}
              value={String(sItem[fieldName] || "")}
              onChangeText={(v) => handleFieldChange(fieldName, v)}
            />
          ) : (
            <input
              type="text"
              inputMode={opts.numbersOnly ? "numeric" : undefined}
              className={styles.fieldInput}
              style={inputInline}
              value={String(sItem[fieldName] || "")}
              onChange={(e) => {
                let v = e.target.value;
                if (opts.numbersOnly) v = v.replace(/[^0-9]/g, "");
                handleFieldChange(fieldName, v);
              }}
              autoFocus={opts.autoFocus}
            />
          )
        ) : (
          <span
            className={`${styles.fieldValue}${opts.multiline ? " " + styles.fieldValueMultiline : ""}`}
            style={{ color: C.text }}
          >
            {String(val ?? "-")}
          </span>
        )}
      </div>
    );
  }

  // ─── current placements ────────────────────────────────────────────────

  let placements = getButtonsContainingItem(sItem.id, quickButtons);

  // ─── main render ───────────────────────────────────────────────────────

  const modalContent = (
      <div className={styles.card}>
          {zShowLoginScreen && <LoginModal modalVisible={true} />}

          <div className={styles.cardInner}>
          {/* HEADER */}
          <div className={styles.header}>
            <span className={styles.headerTitle} style={{ color: C.text }}>
              {isNew ? "New Inventory Item" : "Inventory Item"}
            </span>
            <div className={styles.headerRight}>
              {/* Print Label */}
              {!isNew && templateEntries.length > 0 && (
                <div className={styles.printWrap}>
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
                    <span className={styles.printSent} style={{ color: C.green }}>Sent!</span>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className={styles.scrollBody}>
            <div className={styles.scrollBodyInner}>
            {/* Names */}
            <div className={styles.sectionCard} style={sectionCardInline}>
              {renderField("Catalog Name", "formalName", { autoFocus: true })}
              {renderField("Quick Button/Descriptive Name", "informalName", { multiline: true, hint: " -- use enter key to space name to fit quick button card if desired" })}
            </div>

            {/* Brand + Category */}
            <div className={`${styles.sectionCard} ${styles.sectionCardRow}`} style={sectionCardInline}>
              <div className={styles.brandWrap}>
                {renderField("Brand", "brand")}
              </div>
              <div className={styles.categoryWrap}>
                <label className={styles.fieldLabel} style={{ color: C.textMuted }}>Category</label>
                {sEditing ? (
                  <select
                    value={sItem.category || "Item"}
                    onChange={(e) => handleFieldChange("category", e.target.value)}
                    className={styles.categorySelect}
                    style={{
                      borderColor: C.buttonLightGreenOutline,
                      backgroundColor: C.listItemWhite,
                      color: C.text,
                    }}
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                ) : (
                  <span className={styles.fieldValue} style={{ color: C.text }}>{sItem.category || "Item"}</span>
                )}
              </div>
            </div>

            {/* Prices */}
            <div className={`${styles.sectionCard} ${styles.sectionCardRowPrices}`} style={sectionCardInline}>
              {sItem.category === "Labor" && (
                <div className={styles.minutesWrap}>
                  {renderField("Minutes", "minutes", { numeric: true })}
                </div>
              )}
              {renderField("Price", "price", { currency: true, flex: 1 })}
              {renderField("Sale Price", "salePrice", { currency: true, flex: 1 })}
              {renderField("Cost", "cost", { currency: true, flex: 1, last: true })}
            </div>

            {/* Barcodes */}
            <div className={`${styles.sectionCard} ${styles.sectionCardRow}`} style={sectionCardInline}>
              <div className={styles.barcodesCol}>
                {renderField("Primary Barcode", "primaryBarcode", { numbersOnly: true })}
              </div>
              <div className={styles.barcodesCol}>
                <label className={styles.fieldLabel} style={{ color: C.textMuted }}>Additional Barcodes</label>
                {(sItem.barcodes || []).map((code, i) => (
                  <div key={i} className={styles.barcodeRow}>
                    {sEditing ? (
                      <input
                        type="text"
                        inputMode="numeric"
                        className={`${styles.fieldInput} ${styles.barcodeInputFlex}`}
                        style={inputInline}
                        value={code}
                        onChange={(e) => {
                          let v = e.target.value.replace(/[^0-9]/g, "");
                          let updated = [...(sItem.barcodes || [])];
                          updated[i] = v;
                          handleFieldChange("barcodes", updated);
                        }}
                      />
                    ) : (
                      <span className={`${styles.fieldValue} ${styles.barcodeInputFlex}`} style={{ color: C.text }}>{code}</span>
                    )}
                    {sEditing && (
                      <button
                        type="button"
                        className={styles.barcodeDeleteBtn}
                        onClick={() => {
                          let updated = (sItem.barcodes || []).filter((_, idx) => idx !== i);
                          handleFieldChange("barcodes", updated);
                        }}
                      >
                        <Image icon={ICONS.trash} size={16} />
                      </button>
                    )}
                  </div>
                ))}
                {sEditing && (
                  <button
                    type="button"
                    className={styles.barcodeAddBtn}
                    onClick={() => {
                      let updated = [...(sItem.barcodes || []), ""];
                      handleFieldChange("barcodes", updated);
                    }}
                  >
                    <Image icon={ICONS.add} size={20} />
                    <span className={styles.barcodeAddText} style={{ color: C.green }}>Add Barcode</span>
                  </button>
                )}
                {!sEditing && (sItem.barcodes || []).length === 0 && (
                  <span className={styles.fieldValue} style={{ color: C.text }}>-</span>
                )}
              </div>
            </div>

            <div className={styles.receiptNoteRow}>
              <CheckBox
                text="Receipt Note Required"
                isChecked={!!sItem.receiptNoteRequired}
                onCheck={() => handleFieldChange("receiptNoteRequired", !sItem.receiptNoteRequired)}
                textStyle={{ fontSize: 14, color: sItem.receiptNoteRequired ? C.green : C.textMuted }}
              />
            </div>

            <div className={styles.twoCol}>
              {/* SECTION 2: Quick Button Placement */}
              <div className={styles.twoColItem} style={sectionCardInline}>
                <div className={styles.sectionHeader}>
                  <div className={styles.sectionHeaderLeft}>
                    <span className={styles.sectionTitle} style={{ color: C.text }}>
                      Quick Button Placement
                    </span>
                    <Tooltip text="Assign this item to quick button menus for fast access" position="right">
                      <Image icon={ICONS.info} size={16} className={styles.sectionInfoIcon} />
                    </Tooltip>
                  </div>
                  <button
                    type="button"
                    className={styles.sectionAddBtn}
                    onClick={() => _setShowQBPicker(true)}
                  >
                    <Image icon={ICONS.add} size={30} />
                  </button>
                </div>
                {placements.length === 0 ? (
                  <span className={styles.placementsEmpty} style={{ color: C.textMuted }}>
                    Not assigned to any quick button menu
                  </span>
                ) : (
                  <div className={styles.placementsWrap}>
                    {placements.map((p) => (
                      <div key={p.buttonID} className={styles.placementChip}>
                        <span className={styles.placementChipText} style={{ color: C.text }}>{p.path}</span>
                        <button
                          type="button"
                          className={styles.placementChipDelete}
                          onClick={() => handleRemoveFromButton(p.buttonID)}
                        >
                          <Image icon={ICONS.trash} size={18} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* SECTION 3: Auto Customer Note */}
              <div className={styles.twoColItem} style={sectionCardInline}>
                <div className={styles.sectionHeader}>
                  <div className={styles.sectionHeaderLeft}>
                    <span className={styles.sectionTitle} style={{ color: C.text }}>
                      Auto Customer Note
                    </span>
                    <Tooltip text="When this item is added to a workorder, these notes will automatically appear in Customer Notes" position="right">
                      <Image icon={ICONS.info} size={16} className={styles.sectionInfoIcon} />
                    </Tooltip>
                  </div>
                  <Tooltip text="Select from pre-configured customer quick notes to auto-add when this item is used" position="bottom">
                    <button
                      type="button"
                      className={styles.autoNoteAddBtn}
                      onClick={(e) => {
                        _setShowQuickNotePicker({ x: e.pageX, y: e.pageY });
                      }}
                      style={{
                        backgroundColor: C.buttonLightGreen,
                        borderColor: C.buttonLightGreenOutline,
                      }}
                    >
                      <Image icon={ICONS.add} size={16} />
                      <span className={styles.autoNoteAddText} style={{ color: C.text }}>Quick Notes</span>
                    </button>
                  </Tooltip>
                </div>
                {sAutoQuickNoteIDs.length > 0 && (
                  <div className={styles.autoNoteChipsRow}>
                    {sAutoQuickNoteIDs.map((qnID) => {
                      let label = "";
                      zCustomerQuickNotes.forEach((cat) => {
                        let found = (cat.items || []).find((i) => i.id === qnID);
                        if (found) label = found.buttonLabel;
                      });
                      if (!label) return null;
                      return (
                        <button
                          key={qnID}
                          type="button"
                          className={styles.autoNoteChip}
                          onClick={() => handleAutoQuickNoteToggle({ id: qnID })}
                        >
                          <span className={styles.autoNoteChipLabel} style={{ color: C.lightred }}>
                            {label}
                          </span>
                          <span className={styles.autoNoteChipX} style={{ color: C.lightred }}>✕</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                <textarea
                  className={styles.fieldTextarea}
                  style={{
                    color: C.text,
                    backgroundColor: "transparent",
                    fontSize: 14,
                    lineHeight: "18px",
                    padding: "6px 4px",
                  }}
                  rows={10}
                  value={sAutoNoteText}
                  onChange={(e) => handleAutoNoteChange(e.target.value)}
                  placeholder="Enter custom receipt note here"
                />
              </div>
            </div>
            </div>

            <CustomerQuickNotes
              visible={!!sShowQuickNotePicker}
              anchorPosition={sShowQuickNotePicker}
              onClose={() => _setShowQuickNotePicker(null)}
              quickNotes={zCustomerQuickNotes}
              onToggleChip={handleAutoQuickNoteToggle}
              activeChips={sAutoQuickNoteIDs}
            />

          </div>
          </div>

          <ModalFooter>
            {!isNew ? (
              <ModalFooterButton
                variant="danger"
                icon={ICONS.trash}
                iconSize={18}
                tooltip="Delete this item"
                onClick={handleDeleteItem}
              >
                Delete
              </ModalFooterButton>
            ) : null}
            {isNew && !!sItem.formalName?.trim() ? (
              <ModalFooterButton
                variant="accent"
                icon={ICONS.check1}
                iconSize={18}
                tooltip="Save new item"
                onClick={handleSaveNewItem}
              >
                Save
              </ModalFooterButton>
            ) : null}
            {!isNew && sDirty ? (
              <ModalFooterButton
                variant="accent"
                icon={ICONS.check1}
                iconSize={18}
                tooltip="Save changes"
                onClick={handleExit}
              >
                Save
              </ModalFooterButton>
            ) : null}
            <ModalFooterButton onClick={handleExit}>
              Close
            </ModalFooterButton>
          </ModalFooter>
      </div>
  );

  return (
    <>
      <Dialog
        visible={true}
        onClose={handleExit}
        aria-label={isNew ? "New Inventory Item" : "Inventory Item"}
      >
        {modalContent}
      </Dialog>
      {sShowQBPicker && (
        <Suspense fallback={null}>
          <QuickButtonPickerModal
            visible={sShowQBPicker}
            itemID={sItem.id}
            quickButtons={quickButtons}
            onToggle={handleToggleInButton}
            onClose={() => _setShowQBPicker(false)}
          />
        </Suspense>
      )}
    </>
  );
};

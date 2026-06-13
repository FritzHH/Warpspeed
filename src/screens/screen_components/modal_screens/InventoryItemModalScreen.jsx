/*eslint-disable*/
import { useState, useRef, useEffect, lazy, Suspense } from "react";
import cloneDeep from "lodash/cloneDeep";
import debounce from "lodash/debounce";
import {
  useSettingsStore,
  useInventoryStore,
  useLoginStore,
  useOrderingModalStore,
} from "../../../stores";
import {
  Button,
  CheckBox,
  CurrencyInput,
  CustomerQuickNotes,
  Dialog,
  DropdownMenu,
  Image,
  LoginModal,
  ModalFooter,
  ModalFooterButton,
  TextInput,
  Tooltip,
  LargeModalHeader,
  LargeModalHeaderButton,
} from "../../../dom_components";
import { C, COLOR_GRADIENTS, ICONS, Radius } from "../../../styles";
import styles from "./InventoryItemModalScreen.module.css";
import { formatCurrencyDisp, showAlert, deepEqual, localStorageWrapper, generate36CharUUID } from "../../../utils";
import {
  dbSaveInventoryItem,
  dbDeleteInventoryItem,
  dbSavePrintObj,
  dbListenToVendorOrders,
  dbListenToVendorOrderItems,
  dbSaveVendorOrderItem,
} from "../../../db_calls_wrapper";
import { VENDOR_CATALOGS, VENDOR_ORDER_ITEM_PROTO, WORKORDER_PROTO } from "../../../data";
import { labelPrintBuilder } from "../../../shared/labelPrintBuilder";
import { printBuilder } from "../../../shared/printBuilder";
const QuickButtonPickerModal = lazy(() =>
  import("./QuickButtonPickerModal").then((m) => ({ default: m.QuickButtonPickerModal }))
);

const CATEGORIES = ["Item", "Labor"];

// Wrapper to consume LargeModalHeader's _equalWidth/iconSize props and forward only valid DOM attrs
function PrintActionSlot({ _equalWidth, iconSize, children, ...rest }) {
  return <div {...rest}>{children}</div>;
}

function QtyStepper({ value, onChange }) {
  const inputRef = useRef(null);
  const display = value > 0 ? String(value) : "";
  const btnStyle = {
    width: 26,
    height: 26,
    border: `1px solid ${C.borderSubtle}`,
    borderRadius: Radius.control,
    backgroundColor: C.surfaceBase,
    color: C.text,
    fontSize: 16,
    lineHeight: 1,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };
  return (
    <div
      style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, width: "100%", padding: "0 12px" }}
      onClick={(e) => { e.stopPropagation(); }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <span style={{ fontSize: 13, color: C.textMuted }}>Qty</span>
      <button
        type="button"
        style={btnStyle}
        onClick={(e) => { e.stopPropagation(); onChange(Math.max(1, (value || 1) - 1)); }}
        aria-label="Decrease quantity"
      >
        {"\u2212"}
      </button>
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        value={display}
        placeholder="0"
        maxLength={2}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          const cleaned = e.target.value.replace(/[^0-9]/g, "");
          if (cleaned === "") { onChange(0); return; }
          let n = parseInt(cleaned, 10);
          if (n > 99) n = 99;
          onChange(n);
        }}
        style={{
          width: 36,
          textAlign: "center",
          fontSize: 15,
          color: C.text,
          fontWeight: 600,
          border: `1px solid ${C.borderSubtle}`,
          borderRadius: Radius.control,
          padding: "2px 4px",
          backgroundColor: C.surfaceBase,
        }}
      />
      <button
        type="button"
        style={btnStyle}
        onClick={(e) => { e.stopPropagation(); onChange(Math.min(99, (value || 0) + 1)); }}
        aria-label="Increase quantity"
      >
        {"+"}
      </button>
    </div>
  );
}

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

export const InventoryItemModalScreen = ({ item, isNew, isCatalogImport, handleExit, onImported, onChanged }) => {
  console.log("InventoryItemModalScreen raw item:", JSON.stringify(item, null, 2));
  // Catalog import treats the modal as a draft: nothing is written until the
  // operator clicks IMPORT ITEM. Same auto-save suppression as `isNew`.
  const isDraft = isNew || isCatalogImport;
  const zQuickItemButtons = useSettingsStore((s) => s.settings?.quickItemButtons, deepEqual);
  const zAutoCustomerNoteTexts = useSettingsStore((s) => s.settings?.autoCustomerNoteTexts, deepEqual);
  const zShowLoginScreen = useLoginStore((state) => state.showLoginScreen);
  const quickButtons = zQuickItemButtons || [];

  const [sItem, _setItem] = useState(() => {
    const cloned = cloneDeep(item);
    if (!cloned.catalogName && cloned.formalName) cloned.catalogName = cloned.formalName;
    return cloned;
  });
  const userLevel = useLoginStore.getState().currentUser?.permissions?.level || 0;
  const [sEditing, _setEditing] = useState(!!isDraft || userLevel >= 2);
  const [sShowQBPicker, _setShowQBPicker] = useState(false);
  const [sDirty, _setDirty] = useState(false);
  const [sPrintSuccess, _setPrintSuccess] = useState(false);
  const [sPrintQty, _setPrintQty] = useState(1);
  const [sOpenOrders, _setOpenOrders] = useState([]);
  const [sOrderItemCounts, _setOrderItemCounts] = useState({});
  const [sAddToOrderOpen, _setAddToOrderOpen] = useState(false);
  const [sShowSpecs, _setShowSpecs] = useState(false);
  const [sShowDevCustomEntry, _setShowDevCustomEntry] = useState(false);
  const [sDevCustomBarcode, _setDevCustomBarcode] = useState("");
  const [sDevCustomError, _setDevCustomError] = useState("");

  useEffect(() => {
    const unsub = dbListenToVendorOrders((data) => {
      const arr = Array.isArray(data) ? data : [];
      _setOpenOrders(
        arr
          .filter((o) => !o.status || o.status === "open")
          .sort(
            (a, b) =>
              (b.lastModifiedMillis || 0) - (a.lastModifiedMillis || 0),
          ),
      );
    });
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, []);

  const openOrderIDsKey = sOpenOrders.map((o) => o.id).join(",");
  useEffect(() => {
    if (!openOrderIDsKey) {
      _setOrderItemCounts({});
      return;
    }
    const ids = openOrderIDsKey.split(",");
    const unsubs = ids.map((orderID) =>
      dbListenToVendorOrderItems(orderID, (data) => {
        const count = Array.isArray(data) ? data.length : 0;
        _setOrderItemCounts((prev) =>
          prev[orderID] === count ? prev : { ...prev, [orderID]: count },
        );
      }),
    );
    return () => {
      unsubs.forEach((u) => { if (typeof u === "function") u(); });
    };
  }, [openOrderIDsKey]);

  async function handleAddToOrder(orderID) {
    if (!orderID) return;
    const currentUser = useLoginStore.getState().getCurrentUser?.() || {};
    const orderItem = cloneDeep(VENDOR_ORDER_ITEM_PROTO);
    orderItem.id = generate36CharUUID();
    orderItem.scannedBarcode =
      sItem.primaryBarcode ||
      (Array.isArray(sItem.barcodes) ? sItem.barcodes[0] : "") ||
      "";
    orderItem.qty = 1;
    orderItem.addedMillis = Date.now();
    orderItem.addedByUserID = currentUser.id || "";
    orderItem.lookupStatus = "matched";
    orderItem.vendorItemID = sItem.id;
    await dbSaveVendorOrderItem(orderID, orderItem);
  }

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
    if (!isDraft) {
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
    if (isCatalogImport && typeof onImported === "function") onImported(sItem);
    if (typeof onChanged === "function") onChanged();
    handleExit();
  }

  function handlePriceChange(fieldName, cents) {
    let updated = { ...sItem, [fieldName]: cents };
    if (fieldName === "price" && cents > 0) updated.minutes = 0;
    _setItem(updated);
    _setDirty(true);
    if (!isDraft) {
      useInventoryStore.getState().setItem(updated, false);
      debouncedInvSaveRef.current(updated);
    }
  }

  function handleMinutesChange(rawInput) {
    const digits = rawInput.replace(/\D/g, "");
    let mins = digits === "" ? 0 : Number(digits);
    let updated = { ...sItem, minutes: mins };
    if (mins > 0) {
      const laborRate = useSettingsStore.getState().settings?.laborRateByHour || 0;
      updated.price = Math.round((mins / 60) * laborRate);
      updated.salePrice = 0;
    } else {
      updated.price = 0;
    }
    _setItem(updated);
    _setDirty(true);
    if (!isDraft) {
      useInventoryStore.getState().setItem(updated, false);
      debouncedInvSaveRef.current(updated);
    }
  }

  // ─── delete ────────────────────────────────────────────────────────────

  function handleDeleteItem() {
    showAlert({
      title: "Delete Item",
      message: `Are you sure you want to delete "${sItem.catalogName || sItem.formalName || "this item"}"?`,
      btn1Text: "Delete",
      handleBtn1Press: () => {
        useLoginStore.getState().promptLogin({ level: "Editor" }).then((ok) => {
          if (!ok) return;
          const autoNotes = useSettingsStore.getState().settings?.autoCustomerNoteTexts || [];
          const filtered = autoNotes.filter((n) => n.inventoryItemID !== sItem.id);
          if (filtered.length !== autoNotes.length) {
            useSettingsStore.getState().setField("autoCustomerNoteTexts", filtered);
          }
          useInventoryStore.getState().removeItem(sItem);
          dbDeleteInventoryItem(sItem.id);
          if (typeof onChanged === "function") onChanged();
          handleExit();
        });
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
    let qty = Math.max(1, Math.min(99, sPrintQty || 1));
    let printJob = labelPrintBuilder.zplLabel(slug, { ...sItem, storeDisplayName: zSettings?.storeInfo?.displayName || "" }, qty, template);
    dbSavePrintObj(printJob, printerID);
    _setPrintSuccess(true);
    setTimeout(() => _setPrintSuccess(false), 2000);
  }

  // ─── DEV: spoofed thermal print for scanner testing ───────────────────
  function _devPrintSpoofedThermal(barcode) {
    let printerID = localStorageWrapper.getItem("selectedPrinterID") || "";
    if (!printerID) {
      showAlert({
        title: "No Thermal Printer",
        message: "Select a thermal printer for this device in Settings.",
        btn1Text: "OK",
      });
      return;
    }
    const _settings = useSettingsStore.getState().getSettings();
    const _currentUser = useLoginStore.getState().getCurrentUser?.() || {};
    const itemDisplay = sItem.catalogName || sItem.formalName || "Test item";
    const spoofedWO = {
      ...cloneDeep(WORKORDER_PROTO),
      id: "dev_" + Date.now().toString(36),
      customerFirst: "Test",
      customerLast: "Customer",
      startedOnMillis: Date.now(),
      status: "newly_created",
      workorderLines: [
        {
          id: "devLine_" + Date.now().toString(36),
          qty: 1,
          intakeNotes: "",
          receiptNotes: "",
          discountObj: "",
          useSalePrice: false,
          warranty: false,
          inventoryItem: {
            catalogName: "DEV: " + itemDisplay,
            price: 0,
            salePrice: 0,
          },
        },
      ],
    };
    const spoofedCustomer = {
      first: "Test",
      last: "Customer",
      customerCell: "",
      customerLandline: "",
      email: "",
    };
    const toPrint = printBuilder.workorder(
      spoofedWO,
      spoofedCustomer,
      _settings?.salesTaxPercent || 0,
      { currentUser: _currentUser, settings: _settings },
    );
    toPrint.barcode = String(barcode);
    dbSavePrintObj(toPrint, printerID);
    _setPrintSuccess(true);
    setTimeout(() => _setPrintSuccess(false), 2000);
  }

  function handleDevPrintThermal() {
    const itemUpc =
      sItem.primaryBarcode ||
      (Array.isArray(sItem.barcodes) ? sItem.barcodes[0] : "") ||
      "";
    if (!itemUpc) {
      showAlert({
        title: "No Item Barcode",
        message: "This inventory item has no UPC/barcode to print.",
        btn1Text: "OK",
      });
      return;
    }
    _devPrintSpoofedThermal(itemUpc);
  }

  function handleDevPrintCustomOpen() {
    _setDevCustomBarcode("");
    _setDevCustomError("");
    _setShowDevCustomEntry(true);
  }

  function handleDevPrintCustomClose() {
    _setShowDevCustomEntry(false);
    _setDevCustomError("");
  }

  function handleDevPrintCustomConfirm() {
    const raw = (sDevCustomBarcode || "").replace(/[^0-9]/g, "");
    if (raw.length !== 12 && raw.length !== 13) {
      _setDevCustomError("Enter exactly 12 or 13 digits.");
      return;
    }
    _devPrintSpoofedThermal(raw);
    _setShowDevCustomEntry(false);
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
            className={`${styles.fieldValue}${(opts.multiline || opts.viewMultiline) ? " " + styles.fieldValueMultiline : ""}`}
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

          <LargeModalHeader
            title={
              isCatalogImport
                ? "Import From Catalog"
                : isNew
                  ? "New Inventory Item"
                  : "Inventory Item"
            }
            iconSize={22}
            actions={[
              !isDraft && (
                sOpenOrders.length === 0 ? (
                  <LargeModalHeaderButton
                    key="addToOrder"
                    variant="default"
                    icon={ICONS.add}
                    iconPosition="only"
                    tooltip="No open orders available"
                    disabled={true}
                  />
                ) : sOpenOrders.length === 1 ? (
                  <LargeModalHeaderButton
                    key="addToOrder"
                    variant="default"
                    icon={ICONS.add}
                    iconPosition="only"
                    tooltip="Add to order"
                    onClick={() => handleAddToOrder(sOpenOrders[0].id)}
                  />
                ) : (
                  <PrintActionSlot
                    key="addToOrder"
                    style={{ width: 44, height: 44, position: "relative", flexShrink: 0 }}
                  >
                    <Tooltip text="Add to order" position="bottom" disabled={sAddToOrderOpen}>
                      <DropdownMenu
                        portal
                        onOpenChange={(open) => _setAddToOrderOpen(open)}
                        dataArr={[
                          {
                            slug: "__goToOrdering__",
                            label: (
                              <span style={{ color: C.accent, fontWeight: 600 }}>
                                Go to ordering
                              </span>
                            ),
                          },
                          { _isDivider: true },
                          ...sOpenOrders.map((o) => {
                            const name =
                              o.name ||
                              (o.createdMillis
                                ? new Date(o.createdMillis).toLocaleString()
                                : "Unnamed order");
                            const count = sOrderItemCounts[o.id] || 0;
                            return {
                              slug: o.id,
                              label: (
                                <span
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    width: "100%",
                                    gap: 8,
                                  }}
                                >
                                  <span
                                    style={{
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {name}
                                  </span>
                                  <span
                                    style={{
                                      flexShrink: 0,
                                      fontSize: 11,
                                      fontWeight: 700,
                                      padding: "2px 8px",
                                      borderRadius: 999,
                                      backgroundColor: C.surfaceAccentMuted,
                                      color: C.accent,
                                      minWidth: 22,
                                      textAlign: "center",
                                    }}
                                  >
                                    {count}
                                  </span>
                                </span>
                              ),
                            };
                          }),
                        ]}
                        onSelect={(menuItem) => {
                          if (menuItem.slug === "__goToOrdering__") {
                            useOrderingModalStore.getState().show();
                            handleExit();
                            return;
                          }
                          handleAddToOrder(menuItem.slug);
                        }}
                        buttonText=""
                        buttonIcon={ICONS.add}
                        buttonIconSize={22}
                        buttonStyle={{
                          backgroundColor: "transparent",
                          borderColor: "transparent",
                          borderRadius: Radius.control,
                          width: 44,
                          height: 44,
                          padding: 8,
                        }}
                        aria-label="Add to order"
                      />
                    </Tooltip>
                  </PrintActionSlot>
                )
              ),
              !isDraft && (
                <LargeModalHeaderButton
                  key="delete"
                  variant="danger"
                  icon={ICONS.trash}
                  iconPosition="only"
                  tooltip="Delete this item"
                  onClick={handleDeleteItem}
                />
              ),
              !isDraft && (templateEntries.length > 0 || import.meta.env.DEV) && (
                <PrintActionSlot
                  key="print"
                  style={{ width: 44, height: 44, position: "relative", flexShrink: 0 }}
                >
                  <Tooltip text="Printing options" position="bottom">
                    <DropdownMenu
                      portal
                      dataArr={[
                        ...(templateEntries.length > 0
                          ? [
                              { component: <QtyStepper value={sPrintQty} onChange={_setPrintQty} /> },
                              { _isDivider: true },
                              ...templateEntries.map(([slug, t]) => ({ label: t.name, slug })),
                            ]
                          : []),
                        ...(import.meta.env.DEV
                          ? [
                              ...(templateEntries.length > 0 ? [{ _isDivider: true }] : []),
                              { slug: "__devPrintThermal__", label: "DEV: Print thermal (item UPC)" },
                              { slug: "__devPrintCustom__", label: "DEV: Print custom UPC..." },
                            ]
                          : []),
                      ]}
                      onOpenChange={(open) => { if (open) _setPrintQty(1); }}
                      onSelect={(item) => {
                        if (item.slug === "__devPrintThermal__") handleDevPrintThermal();
                        else if (item.slug === "__devPrintCustom__") handleDevPrintCustomOpen();
                        else handleQuickPrint(item.slug);
                      }}
                      buttonText=""
                      buttonIcon={ICONS.print}
                      buttonIconSize={22}
                      buttonClassName={styles.printHeaderBtn}
                      buttonStyle={{
                        backgroundColor: "transparent",
                        borderColor: "transparent",
                        borderRadius: Radius.control,
                        width: 44,
                        height: 44,
                        padding: 8,
                      }}
                      aria-label="Print options"
                    />
                  </Tooltip>
                  {sPrintSuccess && (
                    <span
                      style={{
                        position: "absolute",
                        top: "calc(100% + 4px)",
                        right: 0,
                        fontSize: 11,
                        color: C.green,
                        whiteSpace: "nowrap",
                        pointerEvents: "none",
                      }}
                    >
                      Sent!
                    </span>
                  )}
                </PrintActionSlot>
              ),
              (isNew && !isCatalogImport && !!sItem.catalogName?.trim()) && (
                <LargeModalHeaderButton
                  key="saveNew"
                  variant="accent"
                  icon={ICONS.check1}
                  tooltip="Save new item"
                  onClick={handleSaveNewItem}
                >
                  Save
                </LargeModalHeaderButton>
              ),
              (!isDraft && sDirty) && (
                <LargeModalHeaderButton
                  key="saveEdit"
                  variant="accent"
                  icon={ICONS.check1}
                  tooltip="Save changes"
                  onClick={handleExit}
                >
                  Save
                </LargeModalHeaderButton>
              ),
              <LargeModalHeaderButton
                key="close"
                variant="default"
                icon={ICONS.close1}
                iconPosition="only"
                iconSize={27}
                tooltip="Close"
                onClick={handleExit}
              />,
            ]}
          />
          <div className={styles.cardInner}>

          <div className={styles.scrollBody}>
            <div className={styles.scrollBodyInner}>
            {isCatalogImport && (() => {
              const vendor = VENDOR_CATALOGS.find((v) => v.id === sItem.vendorId);
              const importLabel = vendor?.displayName
                ? `IMPORT ITEM FROM ${vendor.displayName.toUpperCase()}`
                : "IMPORT ITEM";
              return (
              <div style={{ marginBottom: 10, display: "flex", justifyContent: "center" }}>
                <Button
                  text={importLabel}
                  icon={ICONS.add}
                  iconSize={22}
                  colorGradientArr={COLOR_GRADIENTS.green}
                  onPress={handleSaveNewItem}
                  enabled={!!sItem.catalogName?.trim()}
                  buttonStyle={{
                    width: "100%",
                    height: 52,
                    borderRadius: Radius.control,
                  }}
                  textStyle={{
                    color: C.text,
                    fontSize: 18,
                    fontWeight: 700,
                    letterSpacing: 0.5,
                  }}
                />
              </div>
              );
            })()}
            {/* Names */}
            <div className={styles.sectionCard} style={sectionCardInline}>
              {renderField("Catalog Name", "catalogName", { autoFocus: true, multiline: true })}
              {/* {renderField("Quick Button/Descriptive Name", "informalName", { multiline: true, hint: " -- use enter key to space name to fit quick button card if desired" })} */}
            </div>

            {/* Category + Brand */}
            <div className={`${styles.sectionCard} ${styles.sectionCardRow}`} style={sectionCardInline}>
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
              <div
                className={styles.brandWrap}
                style={sItem.category === "Labor" ? { visibility: "hidden" } : undefined}
              >
                {renderField("Brand", "brand")}
              </div>
            </div>

            {/* Vendor Specs */}
            {sItem.category !== "Labor" && Object.keys(sItem.specs || {}).length > 0 && (
              <div className={styles.sectionCard} style={sectionCardInline}>
                <button
                  type="button"
                  className={styles.specsToggle}
                  onClick={() => _setShowSpecs((v) => !v)}
                  aria-expanded={sShowSpecs}
                >
                  <span
                    className={styles.specsToggleChevron}
                    style={{
                      color: C.textMuted,
                      transform: sShowSpecs ? "rotate(90deg)" : "rotate(0deg)",
                    }}
                  >
                    ▶
                  </span>
                  <span className={styles.specsToggleLabel} style={{ color: C.text }}>
                    FULL PRODUCT SPECS
                  </span>
                  <span className={styles.specsToggleCount} style={{ color: C.textMuted }}>
                    ({Object.keys(sItem.specs).length})
                  </span>
                </button>
                {sShowSpecs && (
                  <div className={styles.specsWrap}>
                    {Object.entries(sItem.specs).map(([label, value]) => (
                      <div
                        key={label}
                        className={styles.specChip}
                        style={{
                          backgroundColor: C.surfaceBase,
                          border: `1px solid ${C.borderSubtle}`,
                        }}
                      >
                        <span className={styles.specChipLabel} style={{ color: C.textMuted }}>
                          {label}
                        </span>
                        <span className={styles.specChipValue} style={{ color: C.text }}>
                          {String(value)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Prices */}
            <div className={`${styles.sectionCard} ${styles.sectionCardRowPrices}`} style={sectionCardInline}>
              {sItem.category === "Labor" && (
                <div className={styles.minutesWrap}>
                  {renderField("Minutes", "minutes", { numeric: true })}
                </div>
              )}
              {renderField("Price", "price", { currency: true, flex: 1 })}
              {renderField("Sale Price", "salePrice", { currency: true, flex: 1, last: sItem.category === "Labor" })}
              {sItem.category !== "Labor" && renderField("Cost", "cost", { currency: true, flex: 1 })}
              {sItem.category !== "Labor" && renderField("MSRP", "msrp", { currency: true, flex: 1, last: true })}
              {sItem.category !== "Labor" && (() => {
                const price = Number(sItem.price) || 0;
                const cost = Number(sItem.cost) || 0;
                const marginPct = price > 0 ? ((price - cost) / price) * 100 : null;
                const display = marginPct == null ? "-" : `${marginPct.toFixed(1)}%`;
                const valueColor =
                  marginPct == null
                    ? C.text
                    : marginPct >= 30
                      ? C.green
                      : marginPct >= 10
                        ? C.text
                        : C.danger || C.red;
                return (
                  <div className={styles.marginWrap}>
                    <span className={styles.marginLabel} style={{ color: C.textMuted }}>Margin</span>
                    <span className={styles.marginValue} style={{ color: valueColor }}>{display}</span>
                  </div>
                );
              })()}
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
                      <Button
                        icon={ICONS.trash}
                        iconSize={16}
                        onPress={() => {
                          let updated = (sItem.barcodes || []).filter((_, idx) => idx !== i);
                          handleFieldChange("barcodes", updated);
                        }}
                        buttonStyle={{
                          paddingLeft: 4,
                          paddingRight: 4,
                          paddingTop: 4,
                          paddingBottom: 4,
                          backgroundColor: "transparent",
                          marginLeft: 6,
                        }}
                        iconStyle={{ marginRight: 0 }}
                      />
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
              <div className={styles.barcodesCol}>
                {renderField("Vendor Part ID", "vendorPartId", { last: true })}
              </div>
            </div>

            <div className={styles.twoCol}>
              <div className={styles.twoColItem} style={sectionCardInline}>
                <div className={styles.sectionHeader}>
                  <div className={styles.sectionHeaderLeft}>
                    <span className={styles.sectionTitle} style={{ color: C.text }}>
                      Receipt Note Required
                    </span>
                    <Tooltip text="Require a customer receipt note to be entered when this item is added to a workorder" position="right" trigger="click">
                      <button type="button" className={styles.sectionInfoBtn} aria-label="Info">
                        <Image icon={ICONS.info} size={16} className={styles.sectionInfoIcon} />
                      </button>
                    </Tooltip>
                  </div>
                  <CheckBox
                    isChecked={!!sItem.receiptNoteRequired}
                    onCheck={() => handleFieldChange("receiptNoteRequired", !sItem.receiptNoteRequired)}
                  />
                </div>
                {sItem.vendorURL ? (
                  <a
                    className={styles.vendorLinkBtn}
                    href={sItem.vendorURL}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Go to vendor web page
                  </a>
                ) : null}
              </div>

              <div className={styles.twoColItem} style={sectionCardInline}>
                {renderField("Vendor Name", "vendorName", { last: true })}
              </div>
            </div>

            <div className={styles.twoCol}>
              {/* SECTION 2: Quick Button Placement */}
              <div className={styles.twoColItem} style={sectionCardInline}>
                <div className={styles.sectionHeader}>
                  <div className={styles.sectionHeaderLeft}>
                    <span className={styles.sectionTitle} style={{ color: C.text }}>
                      Quick Button Placement
                    </span>
                    <Tooltip text="Assign this item to quick button menus for fast access" position="right" trigger="click">
                      <button type="button" className={styles.sectionInfoBtn} aria-label="Info">
                        <Image icon={ICONS.info} size={16} className={styles.sectionInfoIcon} />
                      </button>
                    </Tooltip>
                  </div>
                  <Button
                    icon={ICONS.add}
                    iconSize={30}
                    onPress={() => _setShowQBPicker(true)}
                    buttonStyle={{
                      paddingLeft: 4,
                      paddingRight: 4,
                      paddingTop: 4,
                      paddingBottom: 4,
                      backgroundColor: "transparent",
                    }}
                    iconStyle={{ marginRight: 0 }}
                  />
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
                        <Button
                          icon={ICONS.trash}
                          iconSize={18}
                          onPress={() => handleRemoveFromButton(p.buttonID)}
                          buttonStyle={{
                            paddingLeft: 4,
                            paddingRight: 4,
                            paddingTop: 4,
                            paddingBottom: 4,
                            backgroundColor: "transparent",
                            marginLeft: 4,
                          }}
                          iconStyle={{ marginRight: 0 }}
                        />
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
                    <Tooltip text="When this item is added to a workorder, these notes will automatically appear in Customer Notes" position="right" trigger="click">
                      <button type="button" className={styles.sectionInfoBtn} aria-label="Info">
                        <Image icon={ICONS.info} size={16} className={styles.sectionInfoIcon} />
                      </button>
                    </Tooltip>
                  </div>
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
                  rows={1}
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
      {import.meta.env.DEV && sShowDevCustomEntry && (
        <Dialog
          visible={sShowDevCustomEntry}
          onClose={handleDevPrintCustomClose}
          title="DEV: Print custom UPC"
          aria-label="DEV: Print custom UPC"
        >
          <div
            style={{
              width: 380,
              backgroundColor: C.surfaceRaised,
              borderRadius: Radius.row,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
            }}
          >
            <div style={{ padding: "16px 20px 8px", display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: C.text }}>DEV: Print custom UPC</div>
              <div style={{ fontSize: 12, color: C.textMuted }}>
                Spoofs a workorder with the entered barcode and sends it to the thermal printer.
              </div>
            </div>
            <div style={{ padding: "8px 20px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: 12, color: C.textMuted }}>Barcode (12 or 13 digits)</label>
              <input
                type="text"
                inputMode="numeric"
                autoFocus
                maxLength={13}
                value={sDevCustomBarcode}
                onChange={(e) => {
                  _setDevCustomBarcode(e.target.value.replace(/[^0-9]/g, ""));
                  if (sDevCustomError) _setDevCustomError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleDevPrintCustomConfirm();
                  else if (e.key === "Escape") handleDevPrintCustomClose();
                }}
                placeholder="e.g. 012345678905"
                style={{
                  fontSize: 18,
                  letterSpacing: 1,
                  padding: "10px 12px",
                  border: `1px solid ${C.borderSubtle}`,
                  borderRadius: Radius.control,
                  backgroundColor: C.surfaceBase,
                  color: C.text,
                  outline: "none",
                }}
              />
              <div style={{ minHeight: 16, fontSize: 12, color: C.danger }}>
                {sDevCustomError}
              </div>
            </div>
            <ModalFooter size="small">
              <ModalFooterButton variant="danger" onClick={handleDevPrintCustomClose}>
                Cancel
              </ModalFooterButton>
              <ModalFooterButton
                variant="accent"
                icon={ICONS.print}
                onClick={handleDevPrintCustomConfirm}
              >
                Print
              </ModalFooterButton>
            </ModalFooter>
          </div>
        </Dialog>
      )}
    </>
  );
};

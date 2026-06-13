import { useState, useRef } from "react";
import { ICONS, C } from "../../../styles";
import {
  useOpenWorkordersStore,
  useSettingsStore,
  useAlertScreenStore,
  useLoginStore,
} from "../../../stores";
import {
  capitalizeFirstLetterOfString,
  checkInputForNumbersOnly,
  calculateWaitEstimateLabel,
  formatMillisForDisplay,
  localStorageWrapper,
  printBuilder,
} from "../../../utils";
import { dbSavePrintObj } from "../../../db_calls_wrapper";
import {
  Image,
  DropdownMenu,
  CheckBox,
  TouchableOpacity,
  PanelJumpBlocker,
  ModalFooter,
  ModalFooterButton,
} from "../../../dom_components";
import { useAutoJumpBlock } from "../../../hooks/useAutoJumpBlock";
import { useZ } from "../../../hooks/useZ";
import { MILLIS_IN_DAY } from "../../../constants";
import { COLORS, NONREMOVABLE_WAIT_TIMES } from "../../../data";
import styles from "./BikeOrderingSection.module.css";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatChangeLogTime(millis) {
  const d = new Date(millis);
  const day = DAY_NAMES[d.getDay()];
  const month = MONTH_NAMES[d.getMonth()];
  const date = d.getDate();
  let hour = d.getHours();
  const amPM = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  const min = d.getMinutes().toString().padStart(2, "0");
  return `${day}, ${month} ${date} ${hour}:${min} ${amPM}`;
}

function describeChangeLogEntry(entry) {
  if (entry.field === "workorderLines") {
    if (entry.action === "added") return `added '${entry.to}' to line items`;
    if (entry.action === "removed") return `removed '${entry.from}' from line items`;
    if (entry.action === "changed") return `changed ${entry.detail} on '${entry.item}' from '${entry.from}' to '${entry.to}'`;
  }
  if (entry.field === "status") return `changed status from '${entry.from}' to '${entry.to}'`;
  if (entry.field === "color1" || entry.field === "color2") {
    const label = entry.field === "color1" ? "primary color" : "secondary color";
    return `changed ${label}${entry.from ? ` from '${entry.from}'` : ""} to '${entry.to}'`;
  }
  if (entry.field === "taxFree") return `changed tax exempt from '${entry.from}' to '${entry.to}'`;
  const fieldLabel = entry.field === "partOrdered" ? "part ordered" : entry.field === "partSource" ? "part source" : entry.field;
  return `changed ${fieldLabel}${entry.from ? ` from '${entry.from}'` : ""} to '${entry.to}'`;
}

const PRINT_BTN_STYLE = {
  backgroundColor: "transparent",
  borderColor: "transparent",
  paddingLeft: 4,
  paddingRight: 4,
  paddingTop: 4,
  paddingBottom: 4,
  height: "auto",
};
const DROPDOWN_BTN_STYLE = { marginLeft: 6, paddingLeft: 8, paddingRight: 8, height: 38 };
const DROPDOWN_BTN_STYLE_TIGHT = { marginLeft: 4, paddingLeft: 8, paddingRight: 8, height: 38 };
const COLOR_DROPDOWN_ITEM_SEPARATOR_STYLE = { height: 0 };
const COLOR_DROPDOWN_ITEM_TEXT_STYLE = { fontSize: 20 };
const COLOR_DROPDOWN_ITEM_STYLE = { paddingTop: 10, paddingBottom: 10 };
const COLOR_BUTTON_STYLE = { height: 34, paddingLeft: 8, paddingRight: 8 };
const CHECKBOX_TEXT_STYLE = { fontSize: 15 };
const CHECKBOX_BUTTON_STYLE = { backgroundColor: "transparent", marginBottom: 8 };
const GRAY_FALLBACK = C.textMuted;

export function BikeOrderingSection({ workorder, zSettings, setField, statusPill, pickupDeliveryRow }) {
  const [sBikeEditing, _setBikeEditing] = useState(false);
  const [sShowChangeLog, _setShowChangeLog] = useState(false);
  const zChangeLog = useZ("modal", sShowChangeLog);
  const [sOrderingOpen, _setOrderingOpen] = useState(
    !!(workorder.partOrdered || workorder.partSource || workorder.trackingNumber || workorder.partOrderEstimateMillis)
  );
  const [sWaitDays, _setWaitDays] = useState(() => {
    if (!workorder.partOrderEstimateMillis || !workorder.partOrderedMillis) return 0;
    return Math.max(0, Math.round((workorder.partOrderEstimateMillis - workorder.partOrderedMillis) / MILLIS_IN_DAY));
  });
  const waitDaysTimerRef = useRef(null);

  const [sBrandFocused, _setBrandFocused] = useState(false);
  const [sDescFocused, _setDescFocused] = useState(false);
  const brandInputRef = useRef(null);
  const descInputRef = useRef(null);
  const color1DropdownRef = useRef(null);
  const brandBackspaced = useRef(false);
  const descBackspaced = useRef(false);
  const brandPrevValRef = useRef("");
  const descPrevValRef = useRef("");
  const autoJumpBlock = useAutoJumpBlock();

  const brandSuggestions = sBrandFocused && workorder.brand?.trim().length >= 1
    ? (zSettings.allBrands || []).filter(
        (b) => b.toLowerCase().startsWith(workorder.brand.trim().toLowerCase()) && b.toLowerCase() !== workorder.brand.trim().toLowerCase()
      )
    : [];

  const descSuggestions = sDescFocused && workorder.description?.trim().length >= 1
    ? (zSettings.allDescriptions || []).filter(
        (d) => d.toLowerCase().startsWith(workorder.description.trim().toLowerCase()) && d.toLowerCase() !== workorder.description.trim().toLowerCase()
      )
    : [];

  function promptAddHint({ kind, value, settingsKey }) {
    if (!value || typeof value !== "string") return;
    const trimmed = value.trim();
    if (trimmed.length < 3) return;
    const existing = (zSettings && zSettings[settingsKey]) || [];
    if (existing.some((v) => v.toLowerCase() === trimmed.toLowerCase())) return;
    const kindLabel = kind === "brand" ? "brand" : "description";
    const listLabel = settingsKey === "allBrands" ? "brands" : "descriptions";
    useAlertScreenStore.getState().setValues({
      title: `Add ${kindLabel}?`,
      message: `Add "${trimmed}" to the saved ${listLabel}?`,
      btn1Text: "Yes",
      handleBtn1Press: () => {
        const current = useSettingsStore.getState().settings?.[settingsKey] || [];
        if (!current.some((v) => v.toLowerCase() === trimmed.toLowerCase())) {
          const updated = [...current, trimmed].sort((a, b) =>
            a.toLowerCase().localeCompare(b.toLowerCase())
          );
          useSettingsStore.getState().setField(settingsKey, updated);
        }
        useAlertScreenStore.getState().resetAll();
      },
      btn2Text: "No",
      handleBtn2Press: () => useAlertScreenStore.getState().resetAll(),
      showAlert: true,
      canExitOnOuterClick: true,
    });
  }

  function getCustomerForPrint() {
    if (!workorder) return {};
    return {
      first: workorder.customerFirst || "",
      last: workorder.customerLast || "",
      customerCell: workorder.customerCell || "",
      customerLandline: workorder.customerLandline || "",
      email: workorder.customerEmail || "",
    };
  }

  function handleIntakePrint() {
    const printerID = localStorageWrapper.getItem("selectedPrinterID");
    if (!printerID) {
      useAlertScreenStore.getState().setValues({
        title: "No Printer Selected",
        message: "Open the Printing menu to choose a thermal printer for this phone.",
        btn1Text: "OK",
        handleBtn1Press: () => useAlertScreenStore.getState().resetAll(),
        showAlert: true,
        canExitOnOuterClick: true,
      });
      return;
    }
    const _settings = useSettingsStore.getState().getSettings();
    const _ctx = { currentUser: useLoginStore.getState().getCurrentUser(), settings: _settings };
    const toPrint = printBuilder.intake(workorder, getCustomerForPrint(), _settings?.salesTaxPercent, _ctx);
    dbSavePrintObj(toPrint, printerID);
  }

  function handleWorkorderPrint() {
    const printerID = localStorageWrapper.getItem("selectedPrinterID");
    if (!printerID) {
      useAlertScreenStore.getState().setValues({
        title: "No Printer Selected",
        message: "Open the Printing menu to choose a thermal printer for this phone.",
        btn1Text: "OK",
        handleBtn1Press: () => useAlertScreenStore.getState().resetAll(),
        showAlert: true,
        canExitOnOuterClick: true,
      });
      return;
    }
    const _settings = useSettingsStore.getState().getSettings();
    const _ctx = { currentUser: useLoginStore.getState().getCurrentUser(), settings: _settings };
    const toPrint = printBuilder.workorder(workorder, getCustomerForPrint(), _settings?.salesTaxPercent, _ctx);
    dbSavePrintObj(toPrint, printerID);
  }

  function updateWaitDays(newDays) {
    _setWaitDays(newDays);
    clearTimeout(waitDaysTimerRef.current);
    waitDaysTimerRef.current = setTimeout(() => {
      const now = Date.now();
      useOpenWorkordersStore.getState().setField("partOrderedMillis", now, workorder.id, false);
      setField("partOrderEstimateMillis", now + (newDays * MILLIS_IN_DAY));
    }, 700);
  }

  return (
    <div className={styles.card}>
      <PanelJumpBlocker show={autoJumpBlock.blocking} message={autoJumpBlock.message} />
      <div className={styles.editToggleRow}>
        <div className={styles.statusSlot}>{statusPill}</div>
        <div className={styles.actionBtnGroup}>
          <TouchableOpacity onPress={() => _setShowChangeLog(true)} className={styles.infoBtn}>
            <Image icon={ICONS.info} size={24} />
          </TouchableOpacity>
          {(() => {
            const selectedPrinterID = localStorageWrapper.getItem("selectedPrinterID");
            const selectedPrinter = selectedPrinterID && zSettings?.printers
              ? zSettings.printers[selectedPrinterID]
              : null;
            const printDisabled = !selectedPrinter || selectedPrinter.active !== true;
            return (
              <DropdownMenu
                buttonIcon={ICONS.print}
                buttonIconSize={24}
                buttonStyle={PRINT_BTN_STYLE}
                itemTextStyle={COLOR_DROPDOWN_ITEM_TEXT_STYLE}
                disabled={printDisabled}
                dataArr={[{ label: "Intake / Estimate" }, { label: "Workorder" }]}
                onSelect={(item) => {
                  if (item.label === "Intake / Estimate") handleIntakePrint();
                  else if (item.label === "Workorder") handleWorkorderPrint();
                }}
              />
            );
          })()}
          <TouchableOpacity onPress={() => _setBikeEditing(!sBikeEditing)} className={styles.editBtn}>
            <Image icon={ICONS.editPencil} size={29} />
          </TouchableOpacity>
        </div>
      </div>
      {pickupDeliveryRow ? (
        <div className={styles.pickupRowSlot}>{pickupDeliveryRow}</div>
      ) : null}
      <div className={styles.divider} />

      {sBikeEditing ? (
        <div>
          <span className={styles.fieldLabel}>Brand</span>
          <div className={styles.fieldRow}>
            <div className={styles.autocompleteWrap}>
              <input
                ref={brandInputRef}
                className={styles.input}
                value={capitalizeFirstLetterOfString(workorder.brand || "")}
                onKeyDown={(e) => { if (e.key === "Backspace") brandBackspaced.current = true; }}
                onChange={(e) => {
                  const val = capitalizeFirstLetterOfString(e.target.value);
                  if (val.length < brandPrevValRef.current.length) brandBackspaced.current = true;
                  brandPrevValRef.current = val;
                  setField("brand", val);
                  if (!brandBackspaced.current && val.trim().length >= 2) {
                    const q = val.trim().toLowerCase();
                    const matches = (useSettingsStore.getState().settings?.allBrands || []).filter(
                      (b) => b.toLowerCase().startsWith(q) && b.toLowerCase() !== q
                    );
                    if (matches.length === 1) {
                      const picked = matches[0];
                      setField("brand", picked);
                      _setBrandFocused(false);
                      if (brandInputRef.current) brandInputRef.current.blur();
                      autoJumpBlock.trigger(`${picked}  \u2192  Description`, () => {
                        if (descInputRef.current) descInputRef.current.focus();
                      });
                    }
                  }
                }}
                onFocus={() => {
                  _setBrandFocused(true);
                  brandBackspaced.current = false;
                  brandPrevValRef.current = workorder.brand || "";
                }}
                onBlur={() => {
                  setTimeout(() => {
                    _setBrandFocused(false);
                    brandBackspaced.current = false;
                    const allWOs = useOpenWorkordersStore.getState().getWorkorders() || [];
                    const curWO = allWOs.find((w) => w.id === workorder.id);
                    promptAddHint({ kind: "brand", value: curWO?.brand, settingsKey: "allBrands" });
                  }, 150);
                }}
                placeholder="Brand"
              />
              {brandSuggestions.length > 0 && (
                <div className={styles.suggestList}>
                  {brandSuggestions.map((item) => (
                    <div key={item} className={styles.suggestRow}>
                      <button
                        type="button"
                        className={styles.suggestPickBtn}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setField("brand", item);
                          _setBrandFocused(false);
                        }}
                      >
                        {item}
                      </button>
                      <button
                        type="button"
                        className={styles.suggestDelBtn}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          const updated = (zSettings.allBrands || []).filter((b) => b !== item);
                          useSettingsStore.getState().setField("allBrands", updated);
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <DropdownMenu
              dataArr={zSettings.bikeBrands}
              onSelect={(item) => setField("brand", item)}
              buttonText={zSettings.bikeBrandsName || "Bikes"}
              buttonStyle={DROPDOWN_BTN_STYLE}
              itemTextStyle={COLOR_DROPDOWN_ITEM_TEXT_STYLE}
            />
            {zSettings.bikeOptionalBrands?.length > 0 && (
              <DropdownMenu
                dataArr={zSettings.bikeOptionalBrands}
                onSelect={(item) => setField("brand", item)}
                buttonText={zSettings.bikeOptionalBrandsName || "Other"}
                buttonStyle={DROPDOWN_BTN_STYLE_TIGHT}
                itemTextStyle={COLOR_DROPDOWN_ITEM_TEXT_STYLE}
              />
            )}
          </div>

          <span className={styles.fieldLabel}>Description</span>
          <div className={styles.fieldRow}>
            <div className={styles.autocompleteWrap}>
              <input
                ref={descInputRef}
                className={styles.input}
                value={capitalizeFirstLetterOfString(workorder.description || "")}
                onKeyDown={(e) => { if (e.key === "Backspace") descBackspaced.current = true; }}
                onChange={(e) => {
                  const val = capitalizeFirstLetterOfString(e.target.value);
                  if (val.length < descPrevValRef.current.length) descBackspaced.current = true;
                  descPrevValRef.current = val;
                  setField("description", val);
                  if (!descBackspaced.current && val.trim().length >= 2) {
                    const q = val.trim().toLowerCase();
                    const matches = (useSettingsStore.getState().settings?.allDescriptions || []).filter(
                      (d) => d.toLowerCase().startsWith(q) && d.toLowerCase() !== q
                    );
                    if (matches.length === 1) {
                      const picked = matches[0];
                      setField("description", picked);
                      _setDescFocused(false);
                      if (descInputRef.current) descInputRef.current.blur();
                      autoJumpBlock.trigger(`${picked}  \u2192  Color 1`, () => {
                        if (color1DropdownRef.current?.open) color1DropdownRef.current.open();
                      });
                    }
                  }
                }}
                onFocus={() => {
                  _setDescFocused(true);
                  descBackspaced.current = false;
                  descPrevValRef.current = workorder.description || "";
                }}
                onBlur={() => {
                  setTimeout(() => {
                    _setDescFocused(false);
                    descBackspaced.current = false;
                    const allWOs = useOpenWorkordersStore.getState().getWorkorders() || [];
                    const curWO = allWOs.find((w) => w.id === workorder.id);
                    promptAddHint({ kind: "description", value: curWO?.description, settingsKey: "allDescriptions" });
                  }, 150);
                }}
                placeholder="Description"
              />
              {descSuggestions.length > 0 && (
                <div className={styles.suggestList}>
                  {descSuggestions.map((item) => (
                    <div key={item} className={styles.suggestRow}>
                      <button
                        type="button"
                        className={styles.suggestPickBtn}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setField("description", item);
                          _setDescFocused(false);
                        }}
                      >
                        {item}
                      </button>
                      <button
                        type="button"
                        className={styles.suggestDelBtn}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          const updated = (zSettings.allDescriptions || []).filter((d) => d !== item);
                          useSettingsStore.getState().setField("allDescriptions", updated);
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <DropdownMenu
              dataArr={zSettings.bikeDescriptions}
              onSelect={(item) => setField("description", item)}
              buttonText="Descriptions"
              buttonStyle={DROPDOWN_BTN_STYLE}
              itemTextStyle={COLOR_DROPDOWN_ITEM_TEXT_STYLE}
            />
          </div>

          <span className={styles.fieldLabel}>Colors</span>
          <div className={styles.fieldRow}>
            <DropdownMenu
              ref={color1DropdownRef}
              dataArr={COLORS}
              itemSeparatorStyle={COLOR_DROPDOWN_ITEM_SEPARATOR_STYLE}
              itemTextStyle={COLOR_DROPDOWN_ITEM_TEXT_STYLE}
              itemStyle={COLOR_DROPDOWN_ITEM_STYLE}
              menuBorderColor="transparent"
              centerMenuVertically={true}
              centerMenuHorizontally={true}
              menuMaxHeight={Math.max(200, window.innerHeight - 40)}
              onSelect={(item) => setField("color1", item)}
              buttonText={workorder.color1?.label || "Color 1"}
              buttonStyle={{
                ...COLOR_BUTTON_STYLE,
                backgroundColor: workorder.color1?.backgroundColor || undefined,
              }}
              buttonTextStyle={{
                color: workorder.color1?.textColor || undefined,
              }}
            />
            <div className={styles.colorGap} />
            <DropdownMenu
              dataArr={COLORS}
              itemSeparatorStyle={COLOR_DROPDOWN_ITEM_SEPARATOR_STYLE}
              itemTextStyle={COLOR_DROPDOWN_ITEM_TEXT_STYLE}
              itemStyle={COLOR_DROPDOWN_ITEM_STYLE}
              menuBorderColor="transparent"
              centerMenuVertically={true}
              centerMenuHorizontally={true}
              menuMaxHeight={Math.max(200, window.innerHeight - 40)}
              onSelect={(item) => setField("color2", item)}
              buttonText={workorder.color2?.label || "Color 2"}
              buttonStyle={{
                ...COLOR_BUTTON_STYLE,
                backgroundColor: workorder.color2?.backgroundColor || undefined,
              }}
              buttonTextStyle={{
                color: workorder.color2?.textColor || undefined,
              }}
            />
          </div>

          <span className={styles.fieldLabel}>Max wait (days)</span>
          <div className={styles.fieldRow}>
            <input
              className={styles.inputSmall}
              value={String(workorder.waitTime?.maxWaitTimeDays ?? "")}
              onChange={(e) => {
                const val = e.target.value;
                if (val && !checkInputForNumbersOnly(val, false)) return;
                const waitObj = { ...(workorder.waitTime || {}), maxWaitTimeDays: val ? parseInt(val) : "" };
                setField("waitTime", waitObj);
              }}
              placeholder="Days"
            />
            <DropdownMenu
              dataArr={zSettings.waitTimes}
              onSelect={(item) => {
                const isNonRemovable = NONREMOVABLE_WAIT_TIMES.some((nr) => nr.id === item.id);
                const waitObj = { ...item, removable: !isNonRemovable };
                setField("waitTime", waitObj);
              }}
              buttonText="Wait Times"
              buttonStyle={DROPDOWN_BTN_STYLE}
              itemTextStyle={COLOR_DROPDOWN_ITEM_TEXT_STYLE}
            />
          </div>

          {(() => {
            const estimateLabel = calculateWaitEstimateLabel(workorder, zSettings);
            const isMissing = estimateLabel === "Missing estimate" || estimateLabel === "No estimate";
            return estimateLabel ? (
              <span className={`${styles.estimate} ${isMissing ? styles.estimateMissing : styles.estimateNormal}`}>
                {estimateLabel}
              </span>
            ) : null;
          })()}

          <CheckBox
            isChecked={!!workorder.itemNotHere}
            text="Item not here"
            textStyle={CHECKBOX_TEXT_STYLE}
            buttonStyle={CHECKBOX_BUTTON_STYLE}
            onCheck={() => setField("itemNotHere", !workorder.itemNotHere)}
          />

        </div>
      ) : (
        <div>
          {(workorder.brand || workorder.description) ? (
            <div className={styles.readBrandBlock}>
              {!!workorder.brand && (
                <span className={styles.readBrand}>
                  {capitalizeFirstLetterOfString(workorder.brand)}
                </span>
              )}
              {!!workorder.description && (
                <span className={styles.readDescription}>
                  {capitalizeFirstLetterOfString(workorder.description)}
                </span>
              )}
            </div>
          ) : null}

          {(workorder.color1?.label || workorder.color2?.label) ? (
            <div className={styles.readColorRow}>
              {!!workorder.color1?.label && (
                <div className={styles.readColorItem}>
                  <div
                    className={styles.readColorDot}
                    style={{ backgroundColor: workorder.color1.backgroundColor || GRAY_FALLBACK }}
                  />
                  <span className={styles.readColorLabel}>
                    {workorder.color1.label}
                  </span>
                </div>
              )}
              {!!workorder.color2?.label && (
                <div className={styles.readColorItem}>
                  <div
                    className={styles.readColorDot}
                    style={{ backgroundColor: workorder.color2.backgroundColor || GRAY_FALLBACK }}
                  />
                  <span className={styles.readColorLabel}>
                    {workorder.color2.label}
                  </span>
                </div>
              )}
            </div>
          ) : null}

          <div className={styles.readEstimateRow}>
            {(() => {
              const estimateLabel = calculateWaitEstimateLabel(workorder, zSettings);
              const isMissing = estimateLabel === "Missing estimate" || estimateLabel === "No estimate";
              return estimateLabel ? (
                <span className={`${styles.estimate} ${isMissing ? styles.estimateMissing : styles.estimateNormal}`}>
                  {estimateLabel}
                </span>
              ) : <div />;
            })()}
            {!!workorder.itemNotHere && (
              <div className={styles.itemNotHereBadge}>
                <span className={styles.itemNotHereText}>Item not here</span>
              </div>
            )}
          </div>

          {!!workorder.waitTime?.maxWaitTimeDays && (
            <span className={styles.readMaxWait}>
              Max wait: {workorder.waitTime.maxWaitTimeDays} days
            </span>
          )}

        </div>
      )}

      {sShowChangeLog && (
        <div
          className={styles.clBackdrop}
          style={{ zIndex: zChangeLog }}
          onClick={() => _setShowChangeLog(false)}
        >
          <div className={styles.clCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.clHeader}>
              <span className={styles.clTitle}>Change Log</span>
              {workorder.startedOnMillis ? (
                <span className={styles.clSubtitle}>
                  Started {formatChangeLogTime(workorder.startedOnMillis)}
                  {workorder.startedBy ? ` by ${workorder.startedBy}` : ""}
                </span>
              ) : null}
            </div>
            <div className={styles.clList}>
              {(() => {
                const log = (workorder.changeLog || []).filter(
                  (e) => e && typeof e === "object" && e.timestamp
                );
                if (log.length === 0) {
                  return (
                    <div className={styles.clEmpty}>No changes recorded</div>
                  );
                }
                const sorted = [...log].sort((a, b) => b.timestamp - a.timestamp);
                return sorted.map((entry, index) => (
                  <div
                    key={`${entry.timestamp}-${index}`}
                    className={styles.clRow}
                  >
                    <div className={styles.clRowTime}>
                      {formatChangeLogTime(entry.timestamp)}
                    </div>
                    <div className={styles.clRowChange}>
                      <span className={styles.clRowUser}>{entry.user || "Unknown"}</span>
                      {" "}
                      {describeChangeLogEntry(entry)}
                    </div>
                  </div>
                ));
              })()}
            </div>
            <ModalFooter>
              <ModalFooterButton
                variant="accent"
                onClick={() => _setShowChangeLog(false)}
              >
                Close
              </ModalFooterButton>
            </ModalFooter>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useRef } from "react";
import { ICONS } from "../../../styles";
import { useOpenWorkordersStore } from "../../../stores";
import {
  capitalizeFirstLetterOfString,
  checkInputForNumbersOnly,
  calculateWaitEstimateLabel,
  formatMillisForDisplay,
} from "../../../utils";
import {
  Image,
  DropdownMenu,
  CheckBox,
  TouchableOpacity,
} from "../../../dom_components";
import { MILLIS_IN_DAY } from "../../../constants";
import { COLORS, NONREMOVABLE_WAIT_TIMES } from "../../../data";
import cloneDeep from "lodash/cloneDeep";
import styles from "./BikeOrderingSection.module.css";

const DROPDOWN_BTN_STYLE = { marginLeft: 6, paddingLeft: 8, paddingRight: 8 };
const DROPDOWN_BTN_STYLE_TIGHT = { marginLeft: 4, paddingLeft: 8, paddingRight: 8 };
const COLOR_DROPDOWN_ITEM_SEPARATOR_STYLE = { height: 0 };
const COLOR_DROPDOWN_ITEM_TEXT_STYLE = { fontSize: 17 };
const COLOR_DROPDOWN_ITEM_STYLE = { paddingTop: 2, paddingBottom: 2 };
const CHECKBOX_TEXT_STYLE = { fontSize: 13 };
const CHECKBOX_BUTTON_STYLE = { backgroundColor: "transparent", marginBottom: 8 };
const GRAY_FALLBACK = "rgb(128, 128, 128)";

export function BikeOrderingSection({ workorder, zSettings, setField }) {
  const [sBikeEditing, _setBikeEditing] = useState(false);
  const [sOrderingOpen, _setOrderingOpen] = useState(
    !!(workorder.partOrdered || workorder.partSource || workorder.trackingNumber || workorder.partOrderEstimateMillis)
  );
  const [sWaitDays, _setWaitDays] = useState(() => {
    if (!workorder.partOrderEstimateMillis || !workorder.partOrderedMillis) return 0;
    return Math.max(0, Math.round((workorder.partOrderEstimateMillis - workorder.partOrderedMillis) / MILLIS_IN_DAY));
  });
  const waitDaysTimerRef = useRef(null);

  function setBikeColor(incomingColorVal, fieldName) {
    let foundColor = false;
    let newColorObj = {};
    COLORS.forEach((bikeColorObj) => {
      if (bikeColorObj.label.toLowerCase() === incomingColorVal.toLowerCase()) {
        foundColor = true;
        newColorObj = cloneDeep(bikeColorObj);
      }
    });
    if (!foundColor) {
      newColorObj.label = incomingColorVal;
      newColorObj.backgroundColor = null;
      newColorObj.textColor = null;
    }
    setField(fieldName, newColorObj);
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
      <div className={styles.editToggleRow}>
        <TouchableOpacity onPress={() => _setBikeEditing(!sBikeEditing)} className={styles.editBtn}>
          <Image icon={ICONS.editPencil} size={18} />
        </TouchableOpacity>
      </div>

      {sBikeEditing ? (
        <div>
          <span className={styles.fieldLabel}>Brand</span>
          <div className={styles.fieldRow}>
            <input
              className={styles.input}
              value={capitalizeFirstLetterOfString(workorder.brand || "")}
              onChange={(e) => setField("brand", capitalizeFirstLetterOfString(e.target.value))}
              placeholder="Brand"
            />
            <DropdownMenu
              dataArr={zSettings.bikeBrands}
              onSelect={(item) => setField("brand", item)}
              buttonText={zSettings.bikeBrandsName || "Bikes"}
              buttonStyle={DROPDOWN_BTN_STYLE}
            />
            {zSettings.bikeOptionalBrands?.length > 0 && (
              <DropdownMenu
                dataArr={zSettings.bikeOptionalBrands}
                onSelect={(item) => setField("brand", item)}
                buttonText={zSettings.bikeOptionalBrandsName || "Other"}
                buttonStyle={DROPDOWN_BTN_STYLE_TIGHT}
              />
            )}
          </div>

          <span className={styles.fieldLabel}>Description</span>
          <div className={styles.fieldRow}>
            <input
              className={styles.input}
              value={capitalizeFirstLetterOfString(workorder.description || "")}
              onChange={(e) => setField("description", capitalizeFirstLetterOfString(e.target.value))}
              placeholder="Description"
            />
            <DropdownMenu
              dataArr={zSettings.bikeDescriptions}
              onSelect={(item) => setField("description", item)}
              buttonText="Descriptions"
              buttonStyle={DROPDOWN_BTN_STYLE}
            />
          </div>

          <span className={styles.fieldLabel}>Colors</span>
          <div className={styles.fieldRow}>
            <div className={styles.colorPair}>
              <input
                className={styles.input}
                value={workorder.color1?.label || ""}
                onChange={(e) => setBikeColor(e.target.value, "color1")}
                placeholder="Color 1"
                style={{
                  backgroundColor: workorder.color1?.backgroundColor || undefined,
                  color: workorder.color1?.textColor || undefined,
                }}
              />
              <DropdownMenu
                dataArr={COLORS}
                itemSeparatorStyle={COLOR_DROPDOWN_ITEM_SEPARATOR_STYLE}
                itemTextStyle={COLOR_DROPDOWN_ITEM_TEXT_STYLE}
                itemStyle={COLOR_DROPDOWN_ITEM_STYLE}
                menuBorderColor="transparent"
                centerMenuVertically={true}
                centerMenuHorizontally={true}
                menuMaxHeight={Math.round(window.innerHeight * 0.9)}
                onSelect={(item) => setField("color1", item)}
                buttonText="1"
                buttonStyle={DROPDOWN_BTN_STYLE_TIGHT}
              />
            </div>
            <div className={styles.colorGap} />
            <div className={styles.colorPair}>
              <input
                className={styles.input}
                value={workorder.color2?.label || ""}
                onChange={(e) => setBikeColor(e.target.value, "color2")}
                placeholder="Color 2"
                style={{
                  backgroundColor: workorder.color2?.backgroundColor || undefined,
                  color: workorder.color2?.textColor || undefined,
                }}
              />
              <DropdownMenu
                dataArr={COLORS}
                itemSeparatorStyle={COLOR_DROPDOWN_ITEM_SEPARATOR_STYLE}
                itemTextStyle={COLOR_DROPDOWN_ITEM_TEXT_STYLE}
                itemStyle={COLOR_DROPDOWN_ITEM_STYLE}
                menuBorderColor="transparent"
                centerMenuVertically={true}
                centerMenuHorizontally={true}
                menuMaxHeight={Math.round(window.innerHeight * 0.9)}
                onSelect={(item) => setField("color2", item)}
                buttonText="2"
                buttonStyle={DROPDOWN_BTN_STYLE_TIGHT}
              />
            </div>
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

          <TouchableOpacity
            onPress={() => _setOrderingOpen(!sOrderingOpen)}
            className={styles.orderingToggle}
          >
            <span className={styles.orderingTitle}>ORDERING</span>
            <Image
              icon={ICONS.downChevron}
              size={10}
              className={`${styles.chevron} ${sOrderingOpen ? styles.chevronOpen : ""}`}
            />
          </TouchableOpacity>

          {sOrderingOpen && (
            <div>
              <span className={styles.fieldLabel}>Item ordered</span>
              <input
                className={`${styles.input} ${styles.inputNoTopMargin8}`}
                value={capitalizeFirstLetterOfString(workorder.partOrdered || "")}
                onChange={(e) => {
                  setField("partOrdered", e.target.value);
                  if (!workorder.partOrderedMillis) setField("partOrderedMillis", Date.now());
                }}
                placeholder="Item names/descriptions"
              />

              <span className={styles.fieldLabel}>Source</span>
              <div className={styles.fieldRow}>
                <input
                  className={styles.input}
                  value={capitalizeFirstLetterOfString(workorder.partSource || "")}
                  onChange={(e) => {
                    setField("partSource", e.target.value);
                    if (!workorder.partOrderedMillis) setField("partOrderedMillis", Date.now());
                  }}
                  placeholder="Item sources"
                />
                <DropdownMenu
                  dataArr={zSettings.partSources}
                  onSelect={(item) => {
                    setField("partSource", item);
                    setField("partOrderedMillis", Date.now());
                  }}
                  buttonText="Sources"
                  buttonStyle={DROPDOWN_BTN_STYLE}
                />
              </div>

              <span className={styles.fieldLabelSmall}>Est. delivery</span>
              <div className={styles.deliveryRow}>
                <TouchableOpacity
                  onPress={() => updateWaitDays(Math.max(0, sWaitDays - 1))}
                  className={styles.waitBtn}
                >
                  <span className={styles.waitBtnText}>{"\u2212"}</span>
                </TouchableOpacity>
                <span className={styles.waitDaysText}>
                  {sWaitDays + " days"}
                </span>
                <TouchableOpacity
                  onPress={() => updateWaitDays(sWaitDays + 1)}
                  className={styles.waitBtn}
                >
                  <span className={styles.waitBtnText}>+</span>
                </TouchableOpacity>
                {!!workorder.partOrderEstimateMillis && (
                  <span className={styles.deliveryDate}>
                    {formatMillisForDisplay(workorder.partOrderEstimateMillis)}
                  </span>
                )}
              </div>

              <TouchableOpacity
                onPress={() => {
                  const newVal = !workorder.partToBeOrdered;
                  setField("partToBeOrdered", newVal);
                  setField("status", newVal ? "is_order_part_for_customer" : "part_ordered");
                }}
                className={styles.orderedToggle}
              >
                <div
                  className={`${styles.orderedDotOuter} ${workorder.partToBeOrdered ? styles.orderedRedBorder : styles.orderedGreenBorder}`}
                >
                  <div
                    className={`${styles.orderedDotInner} ${workorder.partToBeOrdered ? styles.orderedRedBg : styles.orderedGreenBg}`}
                  />
                </div>
                <span
                  className={`${styles.orderedText} ${workorder.partToBeOrdered ? styles.orderedRedText : styles.orderedGreenText}`}
                >
                  {workorder.partToBeOrdered ? "Not ordered" : "Ordered"}
                </span>
              </TouchableOpacity>

              <span className={styles.fieldLabel}>Tracking</span>
              <input
                className={`${styles.input} ${styles.inputNoTopMargin4}`}
                value={workorder.trackingNumber || ""}
                onChange={(e) => setField("trackingNumber", e.target.value)}
                placeholder="Tracking num or website"
              />
              {!!workorder.trackingNumber && (() => {
                const val = workorder.trackingNumber.trim();
                const isURL = /^https?:\/\/|^www\./i.test(val);
                const openUrl = isURL && val.startsWith("www.") ? "https://" + val : val;
                return (
                  <TouchableOpacity
                    onPress={() => window.open(isURL ? openUrl : "https://parcelsapp.com/en/tracking/" + val, "_blank")}
                    className={styles.trackingLink}
                  >
                    <span className={styles.linkText}>
                      {isURL ? "Open link" : "Track package"}
                    </span>
                  </TouchableOpacity>
                );
              })()}
            </div>
          )}
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

          <TouchableOpacity
            onPress={() => _setOrderingOpen(!sOrderingOpen)}
            className={styles.readOrderingToggle}
          >
            <span className={styles.orderingTitle}>ORDERING</span>
            <Image
              icon={ICONS.downChevron}
              size={10}
              className={`${styles.chevron} ${sOrderingOpen ? styles.chevronOpen : ""}`}
            />
          </TouchableOpacity>

          {sOrderingOpen && (
            <div className={styles.readOrderingBody}>
              {!!workorder.partOrdered && (
                <div className={styles.readOrderingItem}>
                  <span className={styles.fieldLabel}>Item ordered</span>
                  <span className={styles.readValue}>
                    {capitalizeFirstLetterOfString(workorder.partOrdered)}
                  </span>
                </div>
              )}
              {!!workorder.partSource && (
                <div className={styles.readOrderingItem}>
                  <span className={styles.fieldLabel}>Source</span>
                  <span className={styles.readValue}>
                    {capitalizeFirstLetterOfString(workorder.partSource)}
                  </span>
                </div>
              )}
              <div className={styles.readDeliveryRow}>
                {!!workorder.partOrderEstimateMillis && (
                  <span className={styles.readDeliveryLabel}>
                    Est. delivery: {formatMillisForDisplay(workorder.partOrderEstimateMillis)}
                  </span>
                )}
                <div className={styles.readOrderedStatus}>
                  <div
                    className={`${styles.readOrderedDotOuter} ${workorder.partToBeOrdered ? styles.orderedRedBorder : styles.orderedGreenBorder}`}
                  >
                    <div
                      className={`${styles.readOrderedDotInner} ${workorder.partToBeOrdered ? styles.orderedRedBg : styles.orderedGreenBg}`}
                    />
                  </div>
                  <span
                    className={`${styles.orderedText} ${workorder.partToBeOrdered ? styles.orderedRedText : styles.orderedGreenText}`}
                  >
                    {workorder.partToBeOrdered ? "Not ordered" : "Ordered"}
                  </span>
                </div>
              </div>
              {!!workorder.trackingNumber && (
                <div className={styles.readTrackingBlock}>
                  <span className={styles.fieldLabel}>Tracking</span>
                  {(() => {
                    const val = workorder.trackingNumber.trim();
                    const isURL = /^https?:\/\/|^www\./i.test(val);
                    const openUrl = isURL && val.startsWith("www.") ? "https://" + val : val;
                    return (
                      <TouchableOpacity
                        onPress={() => window.open(isURL ? openUrl : "https://parcelsapp.com/en/tracking/" + val, "_blank")}
                      >
                        <span className={styles.linkTextLarge}>{val}</span>
                      </TouchableOpacity>
                    );
                  })()}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

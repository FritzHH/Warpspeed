/* eslint-disable */
import { useState, useEffect, useRef } from "react";
import cloneDeep from "lodash/cloneDeep";
import { C, COLOR_GRADIENTS, Fonts, ICONS, Radius } from "../styles";
import {
  useSettingsStore,
  useOpenWorkordersStore,
  useInventoryStore,
  useLoginStore,
} from "../stores";
import { createNewWorkorder, resolveStatus, formatCurrencyDisp, deepEqual, formatWorkorderNumber } from "../utils";
import { WORKORDER_ITEM_PROTO, COLORS } from "../data";
import {
  Button,
  TextInput,
  Image,
  DropdownMenu,
} from "../dom_components";
import {
  dbListenToSettings,
  dbListenToInventory,
  dbListenToOpenWorkorders,
  dbSaveOpenWorkorder,
  startNewWorkorder,
} from "../db_calls_wrapper";
import styles from "./IntakeScreen.module.css";

const ON_THE_STAND_STATUS_ID = "34kttdkfekj";
const DROPDOWN_SELECTED_OPACITY = 0.3;

////////////////////////////////////////////////////////////////////////////////
// Main Screen
////////////////////////////////////////////////////////////////////////////////

export function IntakeScreen() {
  const zSettings = useSettingsStore((state) => {
    const s = state.settings;
    return {
      intakeButtons: s?.intakeButtons,
      statuses: s?.statuses,
      bikeBrands: s?.bikeBrands,
      bikeBrandsName: s?.bikeBrandsName,
      bikeOptionalBrands: s?.bikeOptionalBrands,
      bikeOptionalBrandsName: s?.bikeOptionalBrandsName,
      bikeDescriptions: s?.bikeDescriptions,
    };
  }, deepEqual);
  const zWorkorders = useOpenWorkordersStore((state) => state.workorders);
  const zInventory = useInventoryStore((state) => state.inventoryArr);
  const zCurrentUser = useLoginStore((state) => state.currentUser);

  const [sSelectedWorkorderID, _setSelectedWorkorderID] = useState(null);

  // Firebase listeners (same as BaseScreen) — only if stores are empty
  useEffect(() => {
    dbListenToSettings((data) => {
      useSettingsStore.getState().setSettings(data, false, false);
    });
    dbListenToInventory((data) => {
      useInventoryStore.getState().setItems(data);
    });
    dbListenToOpenWorkorders((data) => {
      useOpenWorkordersStore.getState().setOpenWorkorders(data);
    });
  }, []);

  let selectedWorkorder = zWorkorders.find((o) => o.id === sSelectedWorkorderID);

  //////////////////////////////////////////////////////////////////////////////
  // Workorder field helpers
  //////////////////////////////////////////////////////////////////////////////

  function updateField(fieldName, value) {
    if (!selectedWorkorder) return;
    useOpenWorkordersStore.getState().setField(
      fieldName,
      value,
      selectedWorkorder.id
    );
  }

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
    updateField(fieldName, newColorObj);
  }

  //////////////////////////////////////////////////////////////////////////////
  // New Workorder
  //////////////////////////////////////////////////////////////////////////////

  async function handleNewWorkorder() {
    let wo = await startNewWorkorder(null, { status: ON_THE_STAND_STATUS_ID });
    _setSelectedWorkorderID(wo.id);
  }

  //////////////////////////////////////////////////////////////////////////////
  // Intake button press — add items to workorder
  //////////////////////////////////////////////////////////////////////////////

  async function handleIntakeButtonPress(btn) {
    if (!selectedWorkorder) return;

    // Persist workorder to Firestore before adding items
    let wo = selectedWorkorder;
    await dbSaveOpenWorkorder(wo);

    // Resolve inventory items from IDs and add as workorder lines
    let lines = [...(wo.workorderLines || [])];
    (btn.itemsToAdd || []).forEach((itemId) => {
      let invItem = zInventory.find((o) => o.id === itemId);
      if (!invItem) return;
      let line = cloneDeep(WORKORDER_ITEM_PROTO);
      line.inventoryItem = invItem;
      line.id = crypto.randomUUID();
      lines.push(line);
    });

    useOpenWorkordersStore.getState().setField(
      "workorderLines",
      lines,
      wo.id,
      true // saveToDB
    );
  }

  //////////////////////////////////////////////////////////////////////////////
  // Delete line item
  //////////////////////////////////////////////////////////////////////////////

  function handleDeleteLine(lineIndex) {
    if (!selectedWorkorder) return;
    let lines = [...(selectedWorkorder.workorderLines || [])];
    lines.splice(lineIndex, 1);
    updateField("workorderLines", lines);
  }

  //////////////////////////////////////////////////////////////////////////////
  // Render
  //////////////////////////////////////////////////////////////////////////////

  let intakeButtons = zSettings?.intakeButtons || [];
  let statuses = zSettings?.statuses || [];

  return (
    <div
      className={styles.root}
      style={{ backgroundColor: C.backgroundWhite }}
    >
      {/* Top Bar */}
      <div
        className={styles.topBar}
        style={{ borderBottomColor: C.borderSubtle }}
      >
        <span
          className={styles.title}
          style={{
            fontWeight: Fonts.weight.textHeavy,
            color: C.text,
          }}
        >
          Intake
        </span>

        {/* Workorder Selector */}
        <div className={styles.selectorWrap}>
          <WorkorderSelector
            workorders={zWorkorders}
            statuses={statuses}
            selectedID={sSelectedWorkorderID}
            onSelect={_setSelectedWorkorderID}
          />
        </div>

        <Button
          text="New Workorder"
          icon={ICONS.add}
          iconSize={18}
          colorGradientArr={COLOR_GRADIENTS.green}
          onPress={handleNewWorkorder}
          buttonStyle={{ paddingHorizontal: 14, paddingVertical: 6 }}
          textStyle={{ fontSize: 13 }}
        />
      </div>

      {/* Main Content */}
      {selectedWorkorder ? (
        <div className={styles.mainContent}>
          {/* Detail Fields */}
          <div
            className={styles.detailFieldsWrap}
            style={{ borderBottomColor: C.borderSubtle }}
          >
            <WorkorderDetailFields
              workorder={selectedWorkorder}
              zSettings={zSettings}
              updateField={updateField}
              setBikeColor={setBikeColor}
            />
          </div>

          {/* Items List */}
          <div
            className={styles.itemsSection}
            style={{ borderBottomColor: C.borderSubtle }}
          >
            <div className={styles.itemsHeaderRow}>
              <span
                className={styles.itemsHeaderLabel}
                style={{
                  fontWeight: Fonts.weight.textHeavy,
                  color: C.blue,
                }}
              >
                ITEMS ({selectedWorkorder.workorderLines?.length || 0})
              </span>
            </div>
            <div className={styles.itemsScroll}>
              {(selectedWorkorder.workorderLines || []).map((line, idx) => (
                <LineItemRow
                  key={line.id || idx}
                  line={line}
                  onDelete={() => handleDeleteLine(idx)}
                />
              ))}
              {(!selectedWorkorder.workorderLines ||
                selectedWorkorder.workorderLines.length === 0) && (
                <p
                  className={styles.itemsEmpty}
                  style={{ color: C.textMuted }}
                >
                  No items yet. Press an intake button below to add items.
                </p>
              )}
            </div>
          </div>

          {/* Intake Buttons */}
          <div
            className={styles.intakeButtonsSection}
            style={{ borderTopColor: C.borderSubtle }}
          >
            <span
              className={styles.intakeButtonsLabel}
              style={{
                fontWeight: Fonts.weight.textHeavy,
                color: C.blue,
              }}
            >
              INTAKE BUTTONS
            </span>
            <div className={styles.intakeButtonsScroll}>
              <div className={styles.intakeButtonsInner}>
                {intakeButtons.map((btn) => (
                  <IntakeButtonCard
                    key={btn.id}
                    btn={btn}
                    onPress={() => handleIntakeButtonPress(btn)}
                    zInventory={zInventory}
                  />
                ))}
                {intakeButtons.length === 0 && (
                  <span
                    className={styles.intakeButtonsEmpty}
                    style={{ color: C.textMuted }}
                  >
                    No intake buttons configured. Set them up in Dashboard Admin.
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className={styles.emptyState}>
          <span
            className={styles.emptyStateText}
            style={{ color: C.textMuted }}
          >
            Select a workorder or create a new one to begin.
          </span>
        </div>
      )}
    </div>
  );
}

////////////////////////////////////////////////////////////////////////////////
// Workorder Selector Dropdown
////////////////////////////////////////////////////////////////////////////////

const WorkorderSelector = ({ workorders, statuses, selectedID, onSelect }) => {
  const [sOpen, _setOpen] = useState(false);

  let selected = workorders.find((o) => o.id === selectedID);
  let label = selected
    ? `#${formatWorkorderNumber(selected.workorderNumber) || "?"} — ${
        selected.customerFirst || selected.brand || "(no name)"
      } ${selected.customerLast || ""}`.trim()
    : "Select Workorder...";

  return (
    <div className={styles.selectorRoot}>
      <button
        type="button"
        onClick={() => _setOpen(!sOpen)}
        className={styles.selectorTrigger}
        style={{ borderColor: C.buttonLightGreenOutline }}
      >
        <span
          className={styles.selectorTriggerLabel}
          style={{ color: selected ? C.text : C.textMuted }}
        >
          {label}
        </span>
        <Image
          icon={sOpen ? ICONS.upArrow : ICONS.downArrow}
          size={12}
          style={{ marginLeft: 6 }}
        />
      </button>

      {sOpen && (
        <div
          className={styles.selectorDropdown}
          style={{ borderColor: C.borderSubtle }}
        >
          {workorders.map((wo) => {
            let status = resolveStatus(wo.status, statuses);
            return (
              <button
                type="button"
                key={wo.id}
                onClick={() => {
                  onSelect(wo.id);
                  _setOpen(false);
                }}
                className={styles.selectorRow}
                style={{
                  borderBottomColor: C.borderSubtle,
                  backgroundColor:
                    wo.id === selectedID ? "rgb(230,240,252)" : "white",
                }}
              >
                <div
                  className={styles.selectorRowDot}
                  style={{
                    backgroundColor: status.backgroundColor || C.borderStrong,
                  }}
                />
                <span
                  className={styles.selectorRowLabel}
                  style={{ color: C.text }}
                >
                  #{formatWorkorderNumber(wo.workorderNumber) || "?"} — {wo.customerFirst || wo.brand || "(no name)"}{" "}
                  {wo.customerLast || ""}
                </span>
                <span
                  className={styles.selectorRowStatus}
                  style={{ color: C.textMuted }}
                >
                  {status.label}
                </span>
              </button>
            );
          })}
          {workorders.length === 0 && (
            <p
              className={styles.selectorEmpty}
              style={{ color: C.textMuted }}
            >
              No open workorders.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

////////////////////////////////////////////////////////////////////////////////
// Workorder Detail Fields (Brand, Description, Color1, Color2)
////////////////////////////////////////////////////////////////////////////////

const WorkorderDetailFields = ({
  workorder,
  zSettings,
  updateField,
  setBikeColor,
}) => {
  return (
    <div className={styles.detailFieldsRoot}>
      {/* Brand Row */}
      <div className={styles.detailRow}>
        <TextInput
          placeholder="Brand"
          style={{
            width: "30%",
            borderWidth: 1,
            borderColor: C.buttonLightGreenOutline,
            color: C.text,
            paddingVertical: 2,
            paddingHorizontal: 4,
            fontSize: 14,
            outlineWidth: 0,
            borderRadius: Radius.control,
            fontWeight: workorder?.brand ? "500" : null,
          }}
          value={workorder?.brand || ""}
          onChangeText={(val) => updateField("brand", val)}
        />
        <div className={styles.detailRowDropdowns}>
          <div className={styles.detailDropdownHalf}>
            <DropdownMenu
              dataArr={zSettings?.bikeBrands || []}
              onSelect={(item) => updateField("brand", item)}
              buttonText={zSettings?.bikeBrandsName || "Bikes"}
              buttonStyle={{
                opacity: workorder?.brand ? DROPDOWN_SELECTED_OPACITY : 1,
              }}
            />
          </div>
          <div className={styles.detailDropdownHalf}>
            <DropdownMenu
              dataArr={zSettings?.bikeOptionalBrands || []}
              onSelect={(item) => updateField("brand", item)}
              buttonText={zSettings?.bikeOptionalBrandsName || "E-bikes"}
              buttonStyle={{
                opacity: workorder?.brand ? DROPDOWN_SELECTED_OPACITY : 1,
              }}
            />
          </div>
        </div>
      </div>

      {/* Description Row */}
      <div className={styles.detailRow}>
        <TextInput
          placeholder="Model/Description"
          style={{
            width: "30%",
            borderWidth: 1,
            borderColor: C.buttonLightGreenOutline,
            color: C.text,
            paddingVertical: 2,
            paddingHorizontal: 4,
            fontSize: 14,
            outlineWidth: 0,
            borderRadius: Radius.control,
            fontWeight: workorder?.description ? "500" : null,
          }}
          value={workorder?.description || ""}
          onChangeText={(val) => updateField("description", val)}
        />
        <div className={styles.detailDescriptionDropdownWrap}>
          <DropdownMenu
            dataArr={zSettings?.bikeDescriptions || []}
            onSelect={(item) => updateField("description", item)}
            buttonText="Descriptions"
            buttonStyle={{
              opacity: workorder?.description ? DROPDOWN_SELECTED_OPACITY : 1,
            }}
          />
        </div>
      </div>

      {/* Color Row */}
      <div className={styles.detailRowLast}>
        <TextInput
          placeholder="Color 1"
          value={workorder?.color1?.label || ""}
          style={{
            width: "15%",
            borderWidth: 1,
            borderColor: C.buttonLightGreenOutline,
            paddingVertical: 2,
            paddingHorizontal: 4,
            fontSize: 14,
            outlineWidth: 0,
            borderRadius: Radius.control,
            fontWeight: workorder?.color1?.label ? "500" : null,
            backgroundColor: workorder?.color1?.backgroundColor,
            color: workorder?.color1?.textColor || C.text,
          }}
          onChangeText={(val) => setBikeColor(val, "color1")}
        />
        <div className={styles.colorSpacer} />
        <TextInput
          placeholder="Color 2"
          value={workorder?.color2?.label || ""}
          style={{
            width: "15%",
            borderWidth: 1,
            borderColor: C.buttonLightGreenOutline,
            paddingVertical: 2,
            paddingHorizontal: 4,
            fontSize: 14,
            outlineWidth: 0,
            borderRadius: Radius.control,
            fontWeight: workorder?.color2?.label ? "500" : null,
            backgroundColor: workorder?.color2?.backgroundColor,
            color: workorder?.color2?.textColor || C.text,
          }}
          onChangeText={(val) => setBikeColor(val, "color2")}
        />
        <div className={styles.detailRowDropdowns}>
          <div className={styles.detailDropdownHalf}>
            <DropdownMenu
              itemSeparatorStyle={{ height: 0 }}
              dataArr={COLORS}
              menuBorderColor="transparent"
              onSelect={(item) => updateField("color1", item)}
              buttonText="Color 1"
              buttonStyle={{
                opacity: workorder?.color1?.label
                  ? DROPDOWN_SELECTED_OPACITY
                  : 1,
              }}
            />
          </div>
          <div className={styles.detailDropdownHalf}>
            <DropdownMenu
              itemSeparatorStyle={{ height: 0 }}
              dataArr={COLORS}
              menuBorderColor="transparent"
              onSelect={(item) => updateField("color2", item)}
              buttonText="Color 2"
              buttonStyle={{
                opacity: workorder?.color2?.label
                  ? DROPDOWN_SELECTED_OPACITY
                  : 1,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

////////////////////////////////////////////////////////////////////////////////
// Line Item Row
////////////////////////////////////////////////////////////////////////////////

const LineItemRow = ({ line, onDelete }) => {
  let inv = line.inventoryItem;
  let name = inv?.formalName || inv?.informalName || "(custom item)";
  let price = inv?.price || 0;

  return (
    <div
      className={styles.lineItemRow}
      style={{ borderLeftColor: C.blue }}
    >
      <div className={styles.lineItemInfo}>
        <span className={styles.lineItemName} style={{ color: C.text }}>
          {name}
        </span>
        <span className={styles.lineItemMeta} style={{ color: C.lightText }}>
          Qty: {line.qty || 1} | ${formatCurrencyDisp(price)}
        </span>
      </div>
      <Button
        icon={ICONS.trash}
        iconSize={14}
        onPress={onDelete}
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
  );
};

////////////////////////////////////////////////////////////////////////////////
// Intake Button Card
////////////////////////////////////////////////////////////////////////////////

const IntakeButtonCard = ({ btn, onPress, zInventory }) => {
  let itemCount = btn.itemsToAdd?.length || 0;

  return (
    <button
      type="button"
      onClick={onPress}
      className={styles.intakeCard}
      style={{
        borderColor: C.buttonLightGreenOutline,
        backgroundColor: C.listItemWhite,
      }}
    >
      <span className={styles.intakeCardLabel} style={{ color: C.text }}>
        {btn.label || "(unnamed)"}
      </span>
      {itemCount > 0 && (
        <div
          className={styles.intakeCardBadge}
          style={{ backgroundColor: C.blue }}
        >
          <span className={styles.intakeCardBadgeText}>{itemCount}</span>
        </div>
      )}
    </button>
  );
};

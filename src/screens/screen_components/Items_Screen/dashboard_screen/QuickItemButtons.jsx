import React, { useState } from "react";
import { createPortal } from "react-dom";
import {
  Button,
  TextInput,
  Image,
  CheckBox,
  TouchableOpacity,
  DropdownMenu,
  Tooltip,
} from "../../../../dom_components";
import {
  useSettingsStore,
  useTabNamesStore,
  useInventoryStore,
} from "../../../../stores";
import { C, COLOR_GRADIENTS, ICONS, Z } from "../../../../styles";
import { formatCurrencyDisp } from "../../../../utils";
import {
  QB_DEFAULT_W,
  QB_DEFAULT_H,
  QB_SNAP_PCT,
} from "../../../../data";
import { workerSearchInventory } from "../../../../inventorySearchManager";
import { dbSaveInventoryItem } from "../../../../db_calls_wrapper";
import styles from "./QuickItemButtons.module.css";

function resolveIcon(src) {
  if (!src) return null;
  return typeof src === "object" ? src.default || src : src;
}

function BoxButton({
  onPress,
  icon = ICONS.add,
  iconSize = 30,
  className = "",
  style = {},
  disabled = false,
}) {
  return (
    <button
      type="button"
      className={`${styles.boxButton} ${className}`}
      style={style}
      onClick={(e) => {
        if (disabled) return;
        if (onPress) onPress(e);
      }}
      disabled={disabled}
    >
      <img
        src={resolveIcon(icon)}
        alt=""
        className={styles.boxButtonImg}
        style={{ width: iconSize, height: iconSize }}
      />
    </button>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   QBInventorySearchModal — inventory search/select overlay
   ────────────────────────────────────────────────────────────────────────── */

const QBInventorySearchModal = ({
  parentName,
  onClose,
  onAddItems,
  existingItemIDs = [],
}) => {
  const [sInvSearch, _setInvSearch] = useState("");
  const [sInvResults, _setInvResults] = useState([]);
  const [sSelectedIDs, _setSelectedIDs] = useState(new Set());

  function doSearch(val) {
    _setInvSearch(val);
    if (!val || val.length < 3) {
      _setInvResults([]);
      return;
    }
    workerSearchInventory(val, (results) => _setInvResults(results));
  }

  function clearSearch() {
    _setInvSearch("");
    _setInvResults([]);
  }

  function toggleSelected(id) {
    _setSelectedIDs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSingleSelect(id) {
    onAddItems([id]);
    onClose();
  }

  function handleMultiSelect() {
    if (sSelectedIDs.size === 0) return;
    onAddItems([...sSelectedIDs]);
    onClose();
  }

  return createPortal(
    <div
      className={styles.modalOverlay}
      style={{ zIndex: Z.modal }}
      onClick={onClose}
    >
      <div
        className={styles.modalPanel}
        onClick={(e) => e.stopPropagation()}
        style={{
          height: window.innerHeight - 100,
          backgroundColor: C.backgroundWhite,
          borderColor: C.buttonLightGreenOutline,
        }}
      >
        {/* Header */}
        <div
          className={styles.modalHeader}
          style={{ borderBottomColor: C.borderSubtle }}
        >
          <span className={styles.modalHeaderTitle} style={{ color: C.text }}>
            {"Add items to "}
            <span style={{ color: C.green }}>{parentName}</span>
          </span>
          <BoxButton
            icon={ICONS.close1}
            iconSize={28}
            onPress={onClose}
            style={{ backgroundColor: "transparent" }}
          />
        </div>

        {/* Search bar */}
        <div className={styles.modalSearchBar}>
          <BoxButton icon={ICONS.reset1} iconSize={20} onPress={clearSearch} />
          <input
            autoFocus
            className={styles.modalSearchInput}
            style={{ borderBottomColor: C.borderSubtle, color: C.text }}
            placeholder="Search inventory"
            value={sInvSearch}
            onChange={(e) => doSearch(e.target.value)}
          />
        </div>

        {/* Select button */}
        <div className={styles.modalSelectRow}>
          <Button
            text={
              sSelectedIDs.size > 0
                ? "Select Items (" + sSelectedIDs.size + ")"
                : "Select Items"
            }
            onPress={handleMultiSelect}
            enabled={sSelectedIDs.size > 0}
            colorGradientArr={COLOR_GRADIENTS.green}
            buttonStyle={{
              borderRadius: 5,
              paddingTop: 8,
              paddingBottom: 8,
              opacity: sSelectedIDs.size > 0 ? 1 : 0.4,
            }}
            textStyle={{ fontSize: 13, color: C.textWhite }}
          />
        </div>

        {/* Results */}
        <div className={styles.modalResultsScroll}>
          {sInvResults.slice(0, 50).map((item, index) => {
            const isChecked = sSelectedIDs.has(item.id);
            const alreadyAdded = existingItemIDs.includes(item.id);
            return (
              <div
                key={item.id}
                className={`${styles.modalResultRow} ${alreadyAdded ? "" : styles.modalResultRowHover}`}
                style={{
                  borderColor: C.borderSubtle,
                  backgroundColor:
                    index % 2 === 0 ? C.backgroundListWhite : C.surfaceAlt,
                  cursor: alreadyAdded ? "default" : "pointer",
                  opacity: alreadyAdded ? 0.4 : 1,
                }}
              >
                <CheckBox
                  isChecked={isChecked}
                  onCheck={
                    alreadyAdded ? undefined : () => toggleSelected(item.id)
                  }
                  buttonStyle={{ marginRight: 4 }}
                />
                <button
                  type="button"
                  className={`${styles.modalResultMain} ${alreadyAdded ? styles.modalResultMainDisabled : ""}`}
                  onClick={
                    alreadyAdded ? undefined : () => handleSingleSelect(item.id)
                  }
                  disabled={alreadyAdded}
                >
                  <div className={styles.modalResultLabels}>
                    <span
                      className={styles.modalResultName}
                      style={{ color: alreadyAdded ? C.textMuted : C.text }}
                    >
                      {item.informalName || item.formalName}
                    </span>
                    {!!item.informalName && (
                      <span
                        className={styles.modalResultFormal}
                        style={{ color: C.textMuted }}
                      >
                        {item.formalName}
                      </span>
                    )}
                  </div>
                  <span
                    className={styles.modalResultPrice}
                    style={{ color: alreadyAdded ? C.textMuted : C.text }}
                  >
                    {"$" + formatCurrencyDisp(item.price)}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
};

/* ──────────────────────────────────────────────────────────────────────────
   ParentButtonItemsList — list of inventory items linked to current parent
   ────────────────────────────────────────────────────────────────────────── */

const ParentButtonItemsList = ({
  sCurrentParentID,
  handleDividerLabelChange,
  handleToggleDivider,
}) => {
  const zSettingsObj = useSettingsStore((state) => state.settings);
  const [sDragIdx, _setDragIdx] = useState(null);
  const [sDragOverIdx, _setDragOverIdx] = useState(null);
  const zInventoryArr = useInventoryStore((state) => state.inventoryArr);

  const quickItemButtons = zSettingsObj?.quickItemButtons || [];
  const parentButton = quickItemButtons.find((b) => b.id === sCurrentParentID);
  const parentItems = (parentButton?.items || [])
    .map((entry) => {
      const id = typeof entry === "string" ? entry : entry.inventoryItemID;
      return zInventoryArr.find((o) => o.id === id);
    })
    .filter(Boolean);

  function handleItemLabelChange(inventoryItemID, val) {
    const invItem = zInventoryArr.find((o) => o.id === inventoryItemID);
    if (!invItem) return;
    const updated = { ...invItem, informalName: val };
    const updatedArr = zInventoryArr.map((i) =>
      i.id === inventoryItemID ? updated : i
    );
    useInventoryStore.getState().setItems(updatedArr);
    dbSaveInventoryItem(updated);
  }

  function reorderItems(fromIdx, toIdx) {
    if (fromIdx === null || toIdx === null || fromIdx === toIdx) return;
    const items = [...(parentButton?.items || [])];
    const [dragged] = items.splice(fromIdx, 1);
    items.splice(toIdx, 0, dragged);
    const updated = quickItemButtons.map((b) =>
      b.id === sCurrentParentID ? { ...b, items } : b
    );
    useSettingsStore.getState().setField("quickItemButtons", updated);
  }

  function handleDeleteItem(itemId) {
    const items = (parentButton?.items || []).filter((entry) => {
      const id = typeof entry === "string" ? entry : entry.inventoryItemID;
      return id !== itemId;
    });
    const updated = quickItemButtons.map((b) =>
      b.id === sCurrentParentID ? { ...b, items } : b
    );
    useSettingsStore.getState().setField("quickItemButtons", updated);
  }

  function handleAddToTargetQB(inventoryItemID, targetBtnID) {
    const targetBtn = quickItemButtons.find((b) => b.id === targetBtnID);
    if (!targetBtn) return;
    const existingIDs = (targetBtn.items || []).map((e) =>
      typeof e === "string" ? e : e.inventoryItemID
    );
    if (existingIDs.includes(inventoryItemID)) return;
    const sourceEntry = (parentButton?.items || []).find((e) => {
      const id = typeof e === "string" ? e : e.inventoryItemID;
      return id === inventoryItemID;
    });
    const w =
      sourceEntry && typeof sourceEntry !== "string"
        ? sourceEntry.w || QB_DEFAULT_W
        : QB_DEFAULT_W;
    const h =
      sourceEntry && typeof sourceEntry !== "string"
        ? sourceEntry.h || QB_DEFAULT_H
        : QB_DEFAULT_H;
    const fontSize =
      sourceEntry && typeof sourceEntry !== "string"
        ? sourceEntry.fontSize || 10
        : 10;
    const newEntry = {
      inventoryItemID,
      x: (existingIDs.length % 6) * (QB_DEFAULT_W + QB_SNAP_PCT),
      y: Math.floor(existingIDs.length / 6) * (QB_DEFAULT_H + QB_SNAP_PCT),
      w,
      h,
      fontSize,
    };
    if (sourceEntry && typeof sourceEntry !== "string" && sourceEntry.color) {
      newEntry.color = sourceEntry.color;
    }
    const updated = quickItemButtons.map((b) =>
      b.id === targetBtnID
        ? { ...b, items: [...(b.items || []), newEntry] }
        : b
    );
    useSettingsStore.getState().setField("quickItemButtons", updated);
  }

  if (parentItems.length === 0) return null;

  const dropdownTargets = quickItemButtons
    .filter(
      (b) => b.id !== "labor" && b.id !== "item" && b.id !== sCurrentParentID
    )
    .map((b) => ({ id: b.id, label: b.name || "(unnamed)" }));

  return (
    <div className={styles.itemsRoot}>
      <span className={styles.itemsHeader} style={{ color: C.textMuted }}>
        ITEMS ({parentItems.length})
      </span>
      {parentItems.map((inv, idx) => {
        const dividerObj = (parentButton?.dividers || []).find(
          (d) => d.itemID === inv.id
        );
        const hasDivider = !!dividerObj;
        const isDragTarget =
          sDragOverIdx === idx && sDragIdx !== null && sDragIdx !== idx;
        return (
          <React.Fragment key={inv.id}>
            {hasDivider && (
              <div className={styles.dividerBlock}>
                <div
                  className={styles.dividerBar}
                  style={{ backgroundColor: C.buttonLightGreenOutline }}
                />
                <TextInput
                  placeholder="Divider label (optional)"
                  value={dividerObj?.label || ""}
                  onChangeText={(val) =>
                    handleDividerLabelChange(inv.id, val)
                  }
                  debounceMs={500}
                  style={{
                    fontSize: 12,
                    color: C.textMuted,
                    paddingTop: 3,
                    paddingBottom: 3,
                    paddingLeft: 6,
                    paddingRight: 6,
                    backgroundColor: "transparent",
                  }}
                />
              </div>
            )}
            <div
              draggable
              onDragStart={() => _setDragIdx(idx)}
              onDragOver={(e) => {
                e.preventDefault();
                _setDragOverIdx(idx);
              }}
              onDragEnd={() => {
                _setDragIdx(null);
                _setDragOverIdx(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                reorderItems(sDragIdx, idx);
                _setDragIdx(null);
                _setDragOverIdx(null);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                handleToggleDivider(inv.id);
              }}
              title={
                hasDivider
                  ? "Right click to remove divider"
                  : "Right click to add divider above"
              }
              className={styles.itemRow}
              style={{
                borderWidth: isDragTarget ? 2 : 1,
                borderColor: isDragTarget
                  ? C.blue
                  : C.buttonLightGreenOutline,
                backgroundColor:
                  idx % 2 === 0 ? C.backgroundListWhite : C.listItemWhite,
                opacity: sDragIdx === idx ? 0.5 : 1,
              }}
            >
              <div className={styles.itemRowMain}>
                <span
                  className={styles.itemRowFormalName}
                  style={{ color: C.text }}
                >
                  {inv.formalName}
                </span>
                <TextInput
                  placeholder="Descriptive name"
                  placeholderTextColor={C.textDisabled}
                  value={inv.informalName || ""}
                  onChangeText={(val) =>
                    handleItemLabelChange(inv.id, val)
                  }
                  debounceMs={400}
                  style={{
                    fontSize: 11,
                    color: C.blue,
                    paddingTop: 2,
                    paddingBottom: 2,
                    paddingLeft: 0,
                    paddingRight: 0,
                    marginTop: 2,
                    backgroundColor: "transparent",
                    borderBottomWidth: 1,
                    borderBottomColor: C.borderSubtle,
                  }}
                />
              </div>
              <span
                className={styles.itemRowPrice}
                style={{ color: C.textMuted }}
              >
                {"$" + formatCurrencyDisp(inv.price)}
              </span>
              {dropdownTargets.length > 0 && (
                <div className={styles.itemRowDropdownWrap}>
                  <DropdownMenu
                    dataArr={dropdownTargets}
                    onSelect={(item) => handleAddToTargetQB(inv.id, item.id)}
                    buttonIcon={ICONS.add}
                    buttonIconSize={17}
                    buttonStyle={{
                      backgroundColor: "transparent",
                      borderWidth: 0,
                      paddingTop: 0,
                      paddingBottom: 0,
                      paddingLeft: 0,
                      paddingRight: 0,
                    }}
                    centerMenuVertically
                    menuMaxHeight={window.innerHeight - 20}
                  />
                </div>
              )}
              <button
                type="button"
                className={styles.itemRowDeleteBtn}
                onClick={() => handleDeleteItem(inv.id)}
              >
                <Image icon={ICONS.trash} size={14} />
              </button>
              {isDragTarget && sDragIdx > idx && (
                <Image
                  icon={ICONS.backRed}
                  size={14}
                  style={{ position: "absolute", bottom: 4, left: 4 }}
                />
              )}
              {isDragTarget && sDragIdx < idx && (
                <Image
                  icon={ICONS.rightArrowBlue}
                  size={14}
                  style={{ position: "absolute", bottom: 4, left: 4 }}
                />
              )}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};

/* ──────────────────────────────────────────────────────────────────────────
   QuickItemButtonsComponent — main view (top-level + drill-down)
   ────────────────────────────────────────────────────────────────────────── */

export const QuickItemButtonsComponent = () => {
  const zSettingsObj = useSettingsStore((state) => state.settings);
  const sCurrentParentID = useTabNamesStore((state) =>
    state.getDashboardQBParentID()
  );
  const _setCurrentParentID = useTabNamesStore(
    (state) => state.setDashboardQBParentID
  );
  const sMenuPath = useTabNamesStore((state) =>
    state.getDashboardQBMenuPath()
  );
  const _setMenuPath = (valOrFn) => {
    if (typeof valOrFn === "function") {
      const current = useTabNamesStore.getState().getDashboardQBMenuPath();
      useTabNamesStore.getState().setDashboardQBMenuPath(valOrFn(current));
    } else {
      useTabNamesStore.getState().setDashboardQBMenuPath(valOrFn);
    }
  };
  const [sDragIdx, _setDragIdx] = useState(null);
  const [sDragOverIdx, _setDragOverIdx] = useState(null);
  const [sEditingID, _setEditingID] = useState(null);
  const [sShowInvSearchModal, _setShowInvSearchModal] = useState(false);
  const zInventoryArr = useInventoryStore((state) => state.inventoryArr);

  function getChildCount(buttonID) {
    return (zSettingsObj?.quickItemButtons || []).filter(
      (b) => b.parentID === buttonID
    ).length;
  }

  function drillIn(btn) {
    _setMenuPath((prev) => [...prev, { id: btn.id, name: btn.name }]);
    _setCurrentParentID(btn.id);
  }

  function handleBack() {
    const path = [...sMenuPath];
    path.pop();
    _setMenuPath(path);
    _setCurrentParentID(path.length > 0 ? path[path.length - 1].id : null);
  }

  function handleDelete(btn) {
    if (btn.id === "labor" || btn.id === "item") return;
    const deletedParentID = btn.parentID || null;
    const updated = zSettingsObj.quickItemButtons
      .filter((o) => o.id !== btn.id)
      .map((o) =>
        o.parentID === btn.id ? { ...o, parentID: deletedParentID } : o
      );
    useSettingsStore.getState().setField("quickItemButtons", updated);
  }

  function handleNameChange(btn, val) {
    useSettingsStore
      .getState()
      .setField(
        "quickItemButtons",
        zSettingsObj.quickItemButtons.map((o) =>
          o.id === btn.id ? { ...o, name: val } : o
        )
      );
  }

  function handleAdd() {
    const newID = crypto.randomUUID();
    const quickButtonsArr = [...(zSettingsObj?.quickItemButtons || [])];
    quickButtonsArr.push({
      id: newID,
      name: "",
      parentID: sCurrentParentID,
      items: [],
    });
    useSettingsStore.getState().setField("quickItemButtons", quickButtonsArr);
    _setEditingID(newID);
  }

  function handleAddItemsToButton(itemIDs) {
    if (!sCurrentParentID) return;
    const updated = (zSettingsObj?.quickItemButtons || []).map((b) => {
      if (b.id !== sCurrentParentID) return b;
      const existing = b.items || [];
      const existingIDs = existing.map((e) =>
        typeof e === "string" ? e : e.inventoryItemID
      );
      const newEntries = itemIDs
        .filter((id) => !existingIDs.includes(id))
        .map((id, i) => ({
          inventoryItemID: id,
          x:
            ((existingIDs.length + i) % 6) * (QB_DEFAULT_W + QB_SNAP_PCT),
          y:
            Math.floor((existingIDs.length + i) / 6) *
            (QB_DEFAULT_H + QB_SNAP_PCT),
          w: QB_DEFAULT_W,
          h: QB_DEFAULT_H,
          fontSize: 10,
        }));
      return { ...b, items: [...existing, ...newEntries] };
    });
    useSettingsStore.getState().setField("quickItemButtons", updated);
  }

  function renderInvSearchModal() {
    if (!sShowInvSearchModal) return null;
    const parentBtn = (zSettingsObj?.quickItemButtons || []).find(
      (b) => b.id === sCurrentParentID
    );
    const parentName = parentBtn?.name || "(unnamed)";
    const existingItemIDs = (parentBtn?.items || []).map((e) =>
      typeof e === "string" ? e : e.inventoryItemID
    );
    return (
      <QBInventorySearchModal
        parentName={parentName}
        onClose={() => _setShowInvSearchModal(false)}
        onAddItems={handleAddItemsToButton}
        existingItemIDs={existingItemIDs}
      />
    );
  }

  function reorderSubButtons(fromIdx, toIdx) {
    if (fromIdx === null || toIdx === null || fromIdx === toIdx) return;
    const allButtons = [...zSettingsObj.quickItemButtons];
    const isMatch =
      sCurrentParentID === null
        ? (b) => !b.parentID
        : (b) => b.parentID === sCurrentParentID;
    const children = allButtons.filter(isMatch);
    const [dragged] = children.splice(fromIdx, 1);
    children.splice(toIdx, 0, dragged);
    let childIndex = 0;
    const result = allButtons.map((b) => {
      if (isMatch(b)) return children[childIndex++];
      return b;
    });
    useSettingsStore.getState().setField("quickItemButtons", result);
  }

  function handleToggleDivider(itemID) {
    if (!sCurrentParentID) return;
    const updated = allButtons.map((b) => {
      if (b.id !== sCurrentParentID) return b;
      const dividers = [...(b.dividers || [])];
      const idx = dividers.findIndex((d) => d.itemID === itemID);
      if (idx >= 0) dividers.splice(idx, 1);
      else dividers.push({ itemID, label: "" });
      return { ...b, dividers };
    });
    useSettingsStore.getState().setField("quickItemButtons", updated);
  }

  function handleDividerLabelChange(itemID, label) {
    if (!sCurrentParentID) return;
    const capitalized = label.replace(/(?:^|\s)\S/g, (ch) => ch.toUpperCase());
    const updated = allButtons.map((b) => {
      if (b.id !== sCurrentParentID) return b;
      const dividers = (b.dividers || []).map((d) =>
        d.itemID === itemID ? { ...d, label: capitalized } : d
      );
      return { ...b, dividers };
    });
    useSettingsStore.getState().setField("quickItemButtons", updated);
  }

  const allButtons = zSettingsObj?.quickItemButtons || [];
  const topLevelButtons = allButtons.filter((b) => !b.parentID);
  const currentChildren = allButtons.filter(
    (b) => b.parentID === sCurrentParentID
  );

  function renderButtonCard(btn, idx, isDraggable, isColumn) {
    const isEditing = sEditingID === btn.id;
    const childCount = getChildCount(btn.id);
    const isLocked = btn.id === "labor" || btn.id === "item";
    const isDragTarget =
      isDraggable &&
      sDragOverIdx === idx &&
      sDragIdx !== null &&
      sDragIdx !== idx;

    let formalNames = "";
    if (isEditing) {
      formalNames = (btn.items || [])
        .map((entry) => {
          const id = typeof entry === "string" ? entry : entry.inventoryItemID;
          return zInventoryArr.find((o) => o.id === id)?.formalName;
        })
        .filter(Boolean)
        .join(", ");
    }

    const cardClass = [
      styles.card,
      isColumn ? styles.cardRow : styles.cardTile,
      isDraggable ? styles.cardDraggable : "",
      isEditing && formalNames ? styles.cardEditingShifted : "",
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <div
        key={btn.id}
        draggable={isDraggable}
        onDragStart={isDraggable ? () => _setDragIdx(idx) : undefined}
        onDragOver={
          isDraggable
            ? (e) => {
                e.preventDefault();
                _setDragOverIdx(idx);
              }
            : undefined
        }
        onDragEnd={
          isDraggable
            ? () => {
                _setDragIdx(null);
                _setDragOverIdx(null);
              }
            : undefined
        }
        onDrop={
          isDraggable
            ? (e) => {
                e.preventDefault();
                reorderSubButtons(sDragIdx, idx);
                _setDragIdx(null);
                _setDragOverIdx(null);
              }
            : undefined
        }
        onMouseEnter={(e) => {
          if (!isEditing) e.currentTarget.style.opacity = "0.7";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = "1";
        }}
        className={cardClass}
        style={{
          borderWidth: isDragTarget ? 2 : 1,
          borderColor: isDragTarget ? C.blue : C.buttonLightGreenOutline,
          backgroundColor: isEditing
            ? "rgb(245,166,35)"
            : isColumn
            ? C.listItemWhite
            : C.backgroundGreen,
          opacity: isDraggable && sDragIdx === idx ? 0.5 : 1,
        }}
      >
        {isEditing && formalNames ? (
          <span
            className={`${styles.cardFormalNamesLabel} ${isColumn ? styles.cardFormalNamesLabelLeft : styles.cardFormalNamesLabelCenter}`}
            style={{ color: C.textMuted }}
          >
            {formalNames}
          </span>
        ) : null}

        {isEditing ? (
          <div
            className={isColumn ? styles.cardNameWrapRow : styles.cardNameWrapTile}
          >
            <input
              autoFocus
              className={`${styles.cardNameInput} ${isColumn ? styles.cardNameInputRow : styles.cardNameInputTile}`}
              style={{ color: C.text }}
              placeholder="Enter name..."
              value={btn.name}
              onChange={(e) => handleNameChange(btn, e.target.value)}
            />
          </div>
        ) : (
          <TouchableOpacity
            onPress={isLocked ? undefined : () => drillIn(btn)}
            style={{
              flex: isColumn ? 1 : undefined,
              width: isColumn ? undefined : "100%",
              cursor: isLocked ? "default" : "pointer",
            }}
          >
            <span
              className={`${styles.cardNameText} ${isColumn ? styles.cardNameTextRow : styles.cardNameTextTile}`}
              style={{ color: C.text }}
            >
              {btn.name || "(unnamed)"}
            </span>
          </TouchableOpacity>
        )}

        <div
          className={`${styles.cardControls} ${isColumn ? styles.cardControlsRow : styles.cardControlsTile}`}
        >
          {childCount > 0 && (
            <div
              className={styles.childCountBadge}
              style={{ backgroundColor: C.blue }}
            >
              <span
                className={styles.childCountBadgeText}
                style={{ color: C.textWhite }}
              >
                {childCount}
              </span>
            </div>
          )}
          <BoxButton
            onPress={() => _setEditingID(isEditing ? null : btn.id)}
            iconSize={isEditing ? 37 : 17}
            icon={isEditing ? ICONS.clickHere : ICONS.editPencil}
          />
          {btn.removable !== false && (
            <BoxButton
              onPress={() => handleDelete(btn)}
              className={styles.cardDeleteSpacer}
              iconSize={17}
              icon={ICONS.trash}
            />
          )}
        </div>

        {isDragTarget && sDragIdx > idx && (
          <Image
            icon={ICONS.backRed}
            size={14}
            className={`${styles.cardDragArrow} ${styles.cardDragArrowLeft}`}
          />
        )}
        {isDragTarget && sDragIdx < idx && (
          <Image
            icon={ICONS.rightArrowBlue}
            size={14}
            className={`${styles.cardDragArrow} ${isColumn ? styles.cardDragArrowLeft : styles.cardDragArrowRight}`}
          />
        )}
      </div>
    );
  }

  // ── TOP-LEVEL VIEW ──
  if (sCurrentParentID === null) {
    return (
      <div className={`${styles.outer} ${styles.outerFlex}`}>
        <div
          className={`${styles.inner} ${styles.innerFlex}`}
          style={{ alignItems: "center" }}
        >
          <div className={styles.topLevelAddRow}>
            <Tooltip text="Add quick-item button" position="right">
              <BoxButton onPress={handleAdd} icon={ICONS.menu1} iconSize={40} />
            </Tooltip>
          </div>
          <div
            className={styles.topLevelListBox}
            style={{
              borderColor: C.buttonLightGreenOutline,
              backgroundColor: C.backgroundListWhite,
            }}
          >
            <div className={styles.topLevelScroll}>
              {topLevelButtons.map((btn, idx) =>
                renderButtonCard(btn, idx, true, true)
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── SUB-LEVEL VIEW ──
  return (
    <div className={styles.outer}>
      <div className={styles.inner} style={{ alignItems: "center" }}>
        <div className={styles.subRoot}>
          {/* Navigation header */}
          <div className={styles.navHeader}>
            <button
              type="button"
              className={`${styles.navButton} ${styles.navButtonTopLevel}`}
              style={{ borderColor: C.buttonLightGreenOutline }}
              onClick={() => {
                _setCurrentParentID(null);
                _setMenuPath([]);
              }}
            >
              <span className={styles.navButtonText} style={{ color: C.blue }}>
                Top Level
              </span>
            </button>
            <button
              type="button"
              className={`${styles.navButton} ${styles.navButtonBack}`}
              style={{ borderColor: C.buttonLightGreenOutline }}
              onClick={handleBack}
            >
              <span
                className={styles.navButtonBackText}
                style={{ color: C.text }}
              >
                {"\u25C0 Back"}
              </span>
            </button>

            <div className={styles.crumbList}>
              {sMenuPath.map((crumb, i) => {
                const isLast = i === sMenuPath.length - 1;
                return (
                  <div className={styles.crumbItem} key={crumb.id}>
                    {i > 0 && (
                      <span
                        className={styles.crumbSeparator}
                        style={{ color: C.textDisabled }}
                      >
                        {">"}
                      </span>
                    )}
                    <button
                      type="button"
                      className={styles.crumbButton}
                      onClick={() => {
                        _setMenuPath((prev) => prev.slice(0, i + 1));
                        _setCurrentParentID(crumb.id);
                      }}
                    >
                      <span
                        className={`${styles.crumbText} ${isLast ? styles.crumbTextActive : ""}`}
                        style={{ color: isLast ? C.text : C.blue }}
                      >
                        {crumb.name || "(unnamed)"}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Add buttons */}
          <div className={styles.addRow}>
            <Tooltip text="Add item" position="right">
              <BoxButton
                onPress={() => _setShowInvSearchModal(true)}
                iconSize={40}
              />
            </Tooltip>
            <div className={styles.addRowSpacer}>
              <Tooltip text="Add sub-menu" position="right">
                <BoxButton onPress={handleAdd} icon={ICONS.menu1} iconSize={40} />
              </Tooltip>
            </div>
          </div>

          {renderInvSearchModal()}

          {/* Flex-wrap grid of sub-buttons */}
          <div className={styles.gridWrap}>
            {currentChildren.map((btn, idx) =>
              renderButtonCard(btn, idx, true)
            )}
          </div>

          {/* Inventory items linked to this button */}
          {sCurrentParentID && (
            <ParentButtonItemsList
              sCurrentParentID={sCurrentParentID}
              handleDividerLabelChange={handleDividerLabelChange}
              handleToggleDivider={handleToggleDivider}
            />
          )}
        </div>
      </div>
    </div>
  );
};

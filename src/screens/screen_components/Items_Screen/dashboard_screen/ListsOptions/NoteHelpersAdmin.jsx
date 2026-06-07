import React, { useState } from "react";
import cloneDeep from "lodash/cloneDeep";
import { Tooltip, TouchableOpacity, Image, NoteHelper } from "../../../../../dom_components";
import { C, ICONS } from "../../../../../styles";

import { NOTE_HELPER_PROTO } from "../../../../../data";
import { BoxButton1, BoxContainerInner } from "./_helpers";
import { NoteHelperEditorModal } from "./NoteHelperEditorModal";
import styles from "./ListOptions.module.css";

const TEST_WORKORDER_LINE = {
  inventoryItem: { catalogName: "Sample Item" },
  intakeNotes: "",
  receiptNotes: "",
};

export const NoteHelpersAdmin = ({
  zSettingsObj,
  handleSettingsFieldChange,
}) => {
  const [sCatDragIdx, _setCatDragIdx] = useState(null);
  const [sCatDragOverIdx, _setCatDragOverIdx] = useState(null);
  const [sEditorModal, _setEditorModal] = useState(null);
  const [sTestMenuOpen, _setTestMenuOpen] = useState(false);

  const noteHelpers = zSettingsObj?.noteHelpers || [];

  function reorderCategories(fromIdx, toIdx) {
    if (fromIdx === null || toIdx === null || fromIdx === toIdx) return;
    let arr = [...noteHelpers];
    let [dragged] = arr.splice(fromIdx, 1);
    arr.splice(toIdx, 0, dragged);
    handleSettingsFieldChange("noteHelpers", arr);
  }

  function handleAddCategory() {
    let newCat = {
      ...cloneDeep(NOTE_HELPER_PROTO),
      id: crypto.randomUUID(),
      label: "",
    };
    _setEditorModal({ category: newCat, isNew: true });
  }

  function handleEditCategory(cat) {
    _setEditorModal({ category: cloneDeep(cat), isNew: false });
  }

  function handleSaveCategory(updatedCat) {
    let exists = noteHelpers.find((c) => c.id === updatedCat.id);
    let arr;
    if (exists) {
      arr = noteHelpers.map((c) =>
        c.id === updatedCat.id ? updatedCat : c
      );
    } else {
      arr = [...noteHelpers, updatedCat];
    }
    handleSettingsFieldChange("noteHelpers", arr);
  }

  function handleDeleteCategory(catId) {
    let arr = noteHelpers.filter((c) => c.id !== catId);
    handleSettingsFieldChange("noteHelpers", arr);
  }

  function handleToggleCategoryField(catId, field) {
    let arr = noteHelpers.map((c) => {
      if (c.id !== catId) return c;
      let current = c[field] === true;
      return { ...c, [field]: !current };
    });
    handleSettingsFieldChange("noteHelpers", arr);
  }

  return (
    <BoxContainerInner borderless style={{ alignItems: "center" }}>
      <div className={styles.section}>
        {/* Header */}
        <div
          className={styles.sectionHeader}
          style={{ backgroundColor: C.buttonLightGreen, padding: "5px 0" }}
        >
          <span style={{ color: C.text, marginRight: 20 }}>
            Workorder Item Note Helpers
          </span>
          <Tooltip text="Add category">
            <BoxButton1 onPress={handleAddCategory} />
          </Tooltip>
        </div>

        {/* See Menu (read-only preview) */}
        <div
          style={{
            marginTop: 10,
            width: "95%",
            display: "flex",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Tooltip text="Preview the menu users see in the workorder flow (read-only)">
            <BoxButton1
              label="See Menu"
              icon={ICONS.eyeballs}
              iconSize={20}
              onPress={() => _setTestMenuOpen(true)}
              style={{
                paddingLeft: 10,
                paddingRight: 10,
                paddingTop: 4,
                paddingBottom: 4,
              }}
              textStyle={{ fontSize: 13, marginLeft: 6 }}
            />
          </Tooltip>
        </div>

        {/* Category list */}
        <div style={{ marginTop: 10, width: "95%", flexShrink: 0 }}>
          {noteHelpers.map((cat, catIdx) => {
            const isDragOver = sCatDragOverIdx === catIdx;
            const isDragging = sCatDragIdx === catIdx;
            return (
              <div
                key={cat.id}
                draggable
                onDragStart={() => {
                  _setCatDragIdx(catIdx);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  _setCatDragOverIdx(catIdx);
                }}
                onDragEnd={() => {
                  _setCatDragIdx(null);
                  _setCatDragOverIdx(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  reorderCategories(sCatDragIdx, catIdx);
                  _setCatDragIdx(null);
                  _setCatDragOverIdx(null);
                }}
                className={styles.categoryRow}
                style={{
                  borderWidth: isDragOver ? 2 : 1,
                  borderColor: isDragOver ? C.blue : C.buttonLightGreenOutline,
                  backgroundColor: C.listItemWhite,
                  opacity: isDragging ? 0.5 : 1,
                }}
              >
                <div className={styles.categoryRowTop}>
                  <span className={styles.categoryLabel} style={{ color: C.text }}>
                    {cat.label}
                  </span>
                  <span className={styles.categoryItemCount} style={{ color: C.textMuted }}>
                    {(cat.items || []).length} items
                  </span>
                  <Tooltip text="Edit category">
                    <TouchableOpacity
                      onPress={() => handleEditCategory(cat)}
                      style={{ padding: 4 }}
                    >
                      <Image icon={ICONS.editPencil} size={15} />
                    </TouchableOpacity>
                  </Tooltip>
                  <Tooltip text="Delete category">
                    <TouchableOpacity
                      onPress={() => handleDeleteCategory(cat.id)}
                      style={{ padding: 4, marginLeft: 4 }}
                    >
                      <Image icon={ICONS.trash} size={15} />
                    </TouchableOpacity>
                  </Tooltip>
                </div>
                <div className={styles.categoryTargetRow}>
                  <button
                    type="button"
                    onClick={() =>
                      handleToggleCategoryField(cat.id, "intakeNotes")
                    }
                    className={styles.targetCheckboxRow}
                  >
                    <div
                      className={styles.targetCheckboxBox}
                      style={{
                        borderColor: cat.intakeNotes ? C.blue : C.borderStrong,
                        backgroundColor: cat.intakeNotes
                          ? C.blue
                          : "transparent",
                      }}
                    />
                    <span className={styles.targetCheckboxLabel} style={{ color: C.textMuted }}>
                      Intake
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleToggleCategoryField(cat.id, "receiptNotes")
                    }
                    className={styles.targetCheckboxRow}
                  >
                    <div
                      className={styles.targetCheckboxBox}
                      style={{
                        borderColor: cat.receiptNotes ? C.blue : C.borderStrong,
                        backgroundColor: cat.receiptNotes
                          ? C.blue
                          : "transparent",
                      }}
                    />
                    <span className={styles.targetCheckboxLabel} style={{ color: C.textMuted }}>
                      Receipt
                    </span>
                  </button>
                </div>
                {(cat.items || []).length > 0 && (
                  <div className={styles.categoryItemPreviewRow}>
                    {(cat.items || []).map((item, itemIdx) => (
                      <div
                        key={item.id || itemIdx}
                        className={styles.categoryItemPreview}
                        style={{
                          borderColor: C.buttonLightGreenOutline,
                          color: C.text,
                        }}
                      >
                        {item.buttonLabel || item}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <NoteHelperEditorModal
        key={sEditorModal?.category?.id || "closed"}
        visible={!!sEditorModal}
        category={sEditorModal?.category}
        isNew={sEditorModal?.isNew || false}
        onClose={() => _setEditorModal(null)}
        onSave={handleSaveCategory}
        onDelete={handleDeleteCategory}
      />

      <NoteHelper
        visible={sTestMenuOpen}
        onClose={() => _setTestMenuOpen(false)}
        workorderLine={TEST_WORKORDER_LINE}
        onUpdateLine={() => {}}
        noteHelpers={noteHelpers}
        noteHelpersTarget="intakeNotes"
        centered
        readOnly
      />
    </BoxContainerInner>
  );
};

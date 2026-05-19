import React, { useState } from "react";
import cloneDeep from "lodash/cloneDeep";
import { Tooltip, TouchableOpacity, Image } from "../../../../../dom_components";
import { C, ICONS } from "../../../../../styles";
import { gray } from "../../../../../utils";
import { QUICK_CUSTOMER_NOTE_PROTO } from "../../../../../data";
import { BoxButton1, BoxContainerInner } from "./_helpers";
import { CustomerQuickNoteEditorModal } from "./CustomerQuickNoteEditorModal";
import styles from "./ListOptions.module.css";

export const CustomerQuickNotesAdmin = ({
  zSettingsObj,
  handleSettingsFieldChange,
}) => {
  const [sCatDragIdx, _setCatDragIdx] = useState(null);
  const [sCatDragOverIdx, _setCatDragOverIdx] = useState(null);
  const [sEditorModal, _setEditorModal] = useState(null);

  const quickNotes = zSettingsObj?.customerQuickNotes || [];

  function reorderCategories(fromIdx, toIdx) {
    if (fromIdx === null || toIdx === null || fromIdx === toIdx) return;
    let arr = [...quickNotes];
    let [dragged] = arr.splice(fromIdx, 1);
    arr.splice(toIdx, 0, dragged);
    handleSettingsFieldChange("customerQuickNotes", arr);
  }

  function handleAddCategory() {
    let newCat = {
      ...cloneDeep(QUICK_CUSTOMER_NOTE_PROTO),
      id: crypto.randomUUID(),
      label: "",
    };
    _setEditorModal({ category: newCat, isNew: true });
  }

  function handleEditCategory(cat) {
    _setEditorModal({ category: cloneDeep(cat), isNew: false });
  }

  function handleSaveCategory(updatedCat) {
    let exists = quickNotes.find((c) => c.id === updatedCat.id);
    let arr;
    if (exists) {
      arr = quickNotes.map((c) =>
        c.id === updatedCat.id ? updatedCat : c
      );
    } else {
      arr = [...quickNotes, updatedCat];
    }
    handleSettingsFieldChange("customerQuickNotes", arr);
  }

  function handleDeleteCategory(catId) {
    let arr = quickNotes.filter((c) => c.id !== catId);
    handleSettingsFieldChange("customerQuickNotes", arr);
  }

  return (
    <BoxContainerInner borderless style={{ alignItems: "center" }}>
      <div className={styles.section}>
        <div
          className={styles.sectionHeader}
          style={{ backgroundColor: C.buttonLightGreen, padding: "5px 0" }}
        >
          <span style={{ color: C.text, marginRight: 20 }}>
            Customer Quick Notes
          </span>
          <Tooltip text="Add category">
            <BoxButton1 onPress={handleAddCategory} />
          </Tooltip>
        </div>

        <div style={{ marginTop: 10, width: "95%", flexShrink: 0 }}>
          {quickNotes.map((cat, catIdx) => {
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
                  <span className={styles.categoryItemCount} style={{ color: gray(0.4) }}>
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
                        {item.buttonLabel}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <CustomerQuickNoteEditorModal
        key={sEditorModal?.category?.id || "closed"}
        visible={!!sEditorModal}
        category={sEditorModal?.category}
        isNew={sEditorModal?.isNew || false}
        onClose={() => _setEditorModal(null)}
        onSave={handleSaveCategory}
        onDelete={handleDeleteCategory}
      />
    </BoxContainerInner>
  );
};

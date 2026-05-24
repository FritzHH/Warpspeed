import React, { useState } from "react";
import cloneDeep from "lodash/cloneDeep";
import { Dialog, TextInput, TouchableOpacity, Image, ModalFooter, ModalFooterButton } from "../../../../../dom_components";
import { C, ICONS } from "../../../../../styles";

import { QUICK_CUSTOMER_NOTE_ITEM_PROTO } from "../../../../../data";
import styles from "./ListOptions.module.css";

export const CustomerQuickNoteEditorModal = ({
  visible,
  category,
  isNew,
  onClose,
  onSave,
  onDelete,
}) => {
  const [sCategory, _setCategory] = useState(() =>
    category ? cloneDeep(category) : null
  );
  const [sEditingName, _setEditingName] = useState(isNew);

  if (!visible || !sCategory) return null;

  let nameValid = (sCategory.label || "").trim().length >= 3;

  function updateItem(itemIdx, field, val) {
    let updated = cloneDeep(sCategory);
    updated.items[itemIdx] = { ...updated.items[itemIdx], [field]: val };
    _setCategory(updated);
  }

  function addItem() {
    let updated = cloneDeep(sCategory);
    updated.items = [
      ...(updated.items || []),
      {
        ...cloneDeep(QUICK_CUSTOMER_NOTE_ITEM_PROTO),
        id: crypto.randomUUID(),
        buttonLabel: "",
        text: "",
      },
    ];
    _setCategory(updated);
  }

  function removeItem(itemIdx) {
    let updated = cloneDeep(sCategory);
    updated.items = updated.items.filter((_, i) => i !== itemIdx);
    _setCategory(updated);
  }

  function handleSave() {
    if (!nameValid) return;
    onSave(sCategory);
    onClose();
  }

  return (
    <Dialog visible={visible} onClose={onClose} overlayColor={C.surfaceOverlay}>
      <div
        className={styles.modalShell}
        style={{ borderColor: C.buttonLightGreenOutline }}
      >
        {/* Header */}
        <div
          className={styles.modalHeader}
          style={{
            borderBottomColor: C.buttonLightGreenOutline,
            backgroundColor: C.buttonLightGreen,
          }}
        >
          {sEditingName ? (
            <TextInput
              value={sCategory.label}
              autoFocus
              capitalize
              placeholder="Category name"
              placeholderTextColor={C.textMuted}
              onChangeText={(val) =>
                _setCategory({ ...sCategory, label: val })
              }
              onBlur={() => {
                if (nameValid) _setEditingName(false);
              }}
              onSubmitEditing={() => {
                if (nameValid) _setEditingName(false);
              }}
              className={styles.modalHeaderInput}
              style={{
                borderColor: nameValid ? C.buttonLightGreenOutline : C.lightred,
                color: C.text,
              }}
            />
          ) : (
            <div className={styles.modalHeaderTitleRow}>
              <span className={styles.modalHeaderTitle} style={{ color: C.text }}>
                {sCategory.label}
              </span>
              <TouchableOpacity
                onPress={() => _setEditingName(true)}
                style={{ marginLeft: 8, padding: 2 }}
              >
                <Image icon={ICONS.editPencil} size={14} />
              </TouchableOpacity>
            </div>
          )}
          {!isNew && (
            <TouchableOpacity
              onPress={() => {
                onDelete(sCategory.id);
                onClose();
              }}
              style={{ marginLeft: 10, padding: 4 }}
            >
              <Image icon={ICONS.trash} size={16} />
            </TouchableOpacity>
          )}
        </div>

        {/* Items list */}
        <div className={styles.modalScrollArea}>
          {(sCategory.items || []).map((item, itemIdx) => (
            <div
              key={item.id || itemIdx}
              className={styles.modalItemBox}
              style={{
                borderColor: C.buttonLightGreenOutline,
                backgroundColor: C.listItemWhite,
              }}
            >
              <div className={styles.modalItemFieldRow}>
                <span className={styles.modalItemFieldLabel} style={{ color: C.textMuted }}>
                  Label
                </span>
                <TextInput
                  value={item.buttonLabel}
                  capitalize
                  placeholder="Button label"
                  placeholderTextColor={C.textDisabled}
                  onChangeText={(val) =>
                    updateItem(itemIdx, "buttonLabel", val)
                  }
                  className={styles.modalItemFieldInput}
                  style={{
                    borderColor: C.buttonLightGreenOutline,
                    color: C.text,
                  }}
                />
                <TouchableOpacity
                  onPress={() => removeItem(itemIdx)}
                  style={{ marginLeft: 8, padding: 4 }}
                >
                  <Image icon={ICONS.trash} size={14} />
                </TouchableOpacity>
              </div>
              <div className={styles.modalItemFieldRowMulti}>
                <span className={styles.modalItemFieldLabelMulti} style={{ color: C.textMuted }}>
                  Text
                </span>
                <TextInput
                  value={item.text}
                  multiline
                  capitalize
                  placeholder="Note injected into customer notes (optional)"
                  placeholderTextColor={C.textDisabled}
                  onChangeText={(val) => updateItem(itemIdx, "text", val)}
                  className={styles.modalItemFieldInput}
                  style={{
                    borderColor: C.buttonLightGreenOutline,
                    color: C.text,
                    minHeight: 60,
                    overflow: "hidden",
                    resize: "none",
                  }}
                />
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addItem}
            className={styles.modalAddItemBtn}
            style={{ borderColor: C.buttonLightGreenOutline }}
          >
            <span className={styles.modalAddItemBtnText} style={{ color: C.textMuted }}>
              + Add Item
            </span>
          </button>
        </div>

        {/* Validation message */}
        {!nameValid && (
          <div className={styles.modalErrorRow} style={{ borderTopColor: C.buttonLightGreenOutline }}>
            <span className={styles.modalFooterError} style={{ color: C.lightred }}>
              Category name must be 3+ characters
            </span>
          </div>
        )}
        <ModalFooter>
          <ModalFooterButton variant="danger" onClick={onClose}>
            Cancel
          </ModalFooterButton>
          <ModalFooterButton variant="accent" disabled={!nameValid} onClick={handleSave}>
            Save
          </ModalFooterButton>
        </ModalFooter>
      </div>
    </Dialog>
  );
};

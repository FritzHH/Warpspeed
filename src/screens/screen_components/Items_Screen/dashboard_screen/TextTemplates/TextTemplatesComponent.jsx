import React, { useRef, useState } from "react";
import { Button, CheckBox } from "../../../../../dom_components";
import { C, COLOR_GRADIENTS, ICONS, Radius } from "../../../../../styles";

import { SETTINGS_OBJ } from "../../../../../data";
import { TemplateRow } from "./TemplateRow";
import { EmojiPickerModal } from "./EmojiPickerModal";
import styles from "./TextTemplatesComponent.module.css";

export const TextTemplatesComponent = ({
  zSettingsObj,
  handleSettingsFieldChange,
}) => {
  const [sSelectedTemplateId, _setSelectedTemplateId] = useState(null);
  const [sLocalEdits, _setLocalEdits] = useState({});
  const [sNewTemplateIds, _setNewTemplateIds] = useState([]);
  const [sUnsavedTemplates, _setUnsavedTemplates] = useState([]);
  const [sEmojiModalTemplateId, _setEmojiModalTemplateId] = useState(null);
  const cursorPositionRefs = useRef({});
  const textInputRefs = useRef({});

  let savedTemplates =
    zSettingsObj?.smsTemplates || zSettingsObj?.textTemplates || [];
  let hasMergedSms = useRef(false);
  if (!hasMergedSms.current && savedTemplates.length > 0) {
    let defaultTyped = (SETTINGS_OBJ.smsTemplates || []).filter((t) => t.type);
    let missing = defaultTyped.filter(
      (d) => !savedTemplates.find((s) => s.type === d.type)
    );
    let defaultNonRemovable = (SETTINGS_OBJ.smsTemplates || []).filter(
      (t) => t.removable === false && !t.type
    );
    let missingByID = defaultNonRemovable.filter(
      (d) => !savedTemplates.find((s) => s.id === d.id)
    );
    let allMissing = [...missing, ...missingByID];
    if (allMissing.length > 0) {
      let merged = [...savedTemplates, ...allMissing];
      handleSettingsFieldChange("smsTemplates", merged);
      savedTemplates = merged;
    }
    hasMergedSms.current = true;
  }
  let templates = [...sUnsavedTemplates, ...savedTemplates].sort(
    (a, b) => (b.type ? 1 : 0) - (a.type ? 1 : 0)
  );

  // Backward compat helpers
  function getLabel(t) {
    return t.label || t.name || t.buttonLabel || "";
  }
  function getContent(t) {
    return t.content || t.message || t.text || "";
  }

  function getLocalValue(templateId, field) {
    let key = templateId + "_" + field;
    return key in sLocalEdits ? sLocalEdits[key] : null;
  }

  function isNewTemplate(templateId) {
    return sNewTemplateIds.indexOf(templateId) !== -1;
  }

  function handleAddTemplate() {
    let newTemplate = {
      id: crypto.randomUUID(),
      label: "",
      content: "",
      type: "",
      order: 0,
      showInChat: true,
    };
    _setUnsavedTemplates([newTemplate, ...sUnsavedTemplates]);
    _setNewTemplateIds([...sNewTemplateIds, newTemplate.id]);
    _setSelectedTemplateId(newTemplate.id);
  }

  function handleSaveNewTemplate(templateObj) {
    let finalTemplate = {
      id: templateObj.id,
      label: getLocalValue(templateObj.id, "label") ?? getLabel(templateObj),
      content:
        getLocalValue(templateObj.id, "content") ?? getContent(templateObj),
      type: templateObj.type || "",
      order: templateObj.order || 0,
      showInChat: templateObj.showInChat !== false,
    };
    let arr = [finalTemplate, ...savedTemplates];
    handleSettingsFieldChange("smsTemplates", arr);
    _setUnsavedTemplates(
      sUnsavedTemplates.filter((t) => t.id !== templateObj.id)
    );
    _setNewTemplateIds(
      sNewTemplateIds.filter((id) => id !== templateObj.id)
    );
    let newEdits = { ...sLocalEdits };
    delete newEdits[templateObj.id + "_label"];
    delete newEdits[templateObj.id + "_content"];
    _setLocalEdits(newEdits);
  }

  function handleDeleteTemplate(templateObj) {
    if (isNewTemplate(templateObj.id)) {
      _setUnsavedTemplates(
        sUnsavedTemplates.filter((t) => t.id !== templateObj.id)
      );
      _setNewTemplateIds(
        sNewTemplateIds.filter((id) => id !== templateObj.id)
      );
    } else {
      let arr = savedTemplates.filter((t) => t.id !== templateObj.id);
      handleSettingsFieldChange("smsTemplates", arr);
    }
    if (sSelectedTemplateId === templateObj.id) _setSelectedTemplateId(null);
    let newEdits = { ...sLocalEdits };
    delete newEdits[templateObj.id + "_label"];
    delete newEdits[templateObj.id + "_content"];
    _setLocalEdits(newEdits);
  }

  function handleFieldChange(templateObj, field, val) {
    if (isNewTemplate(templateObj.id)) {
      _setLocalEdits({
        ...sLocalEdits,
        [templateObj.id + "_" + field]: val,
      });
    } else {
      let arr = savedTemplates.map((t) => {
        if (t.id === templateObj.id) return { ...t, [field]: val };
        return t;
      });
      handleSettingsFieldChange("smsTemplates", arr);
    }
  }

  function handleInsertVariable(templateObj, variableStr) {
    let currentContent = isNewTemplate(templateObj.id)
      ? getLocalValue(templateObj.id, "content") ?? getContent(templateObj)
      : getContent(templateObj);
    let cursorPos =
      cursorPositionRefs.current[templateObj.id] ?? currentContent.length;
    let before = currentContent.slice(0, cursorPos);
    let after = currentContent.slice(cursorPos);
    let newContent = before + variableStr + after;

    if (isNewTemplate(templateObj.id)) {
      _setLocalEdits({
        ...sLocalEdits,
        [templateObj.id + "_content"]: newContent,
      });
    } else {
      let arr = savedTemplates.map((t) => {
        if (t.id === templateObj.id) return { ...t, content: newContent };
        return t;
      });
      handleSettingsFieldChange("smsTemplates", arr);
    }
    cursorPositionRefs.current[templateObj.id] =
      cursorPos + variableStr.length;
    textInputRefs.current[templateObj.id]?.current?.focus?.();
  }

  function getInputRefObject(id) {
    if (!textInputRefs.current[id]) textInputRefs.current[id] = { current: null };
    return textInputRefs.current[id];
  }

  function handleEmojiSelected(emojiId) {
    let tObj = templates.find((t) => t.id === sEmojiModalTemplateId);
    if (tObj) handleInsertVariable(tObj, emojiId);
    _setEmojiModalTemplateId(null);
  }

  let allowStaffPhoneReply = zSettingsObj?.allowStaffPhoneReply !== false;

  return (
    <div className={styles.outer}>
      <div className={styles.inner}>
        <div className={styles.sectionHeader}>TEXT SETTINGS</div>
        <CheckBox
          isChecked={allowStaffPhoneReply}
          textStyle={{ fontSize: 15 }}
          buttonStyle={{ backgroundColor: "transparent" }}
          text="Allow staff to reply to forwarded customer messages from their phone"
          onCheck={() =>
            handleSettingsFieldChange(
              "allowStaffPhoneReply",
              !allowStaffPhoneReply
            )
          }
        />
      </div>

      <div className={styles.inner}>
        {/* Add button */}
        <div className={styles.addRow}>
          <Button
            onPress={handleAddTemplate}
            text="Add Template"
            icon={ICONS.add}
            iconSize={30}
            colorGradientArr={COLOR_GRADIENTS.blue}
            textStyle={{ color: "white", fontSize: 14 }}
            buttonStyle={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: Radius.control,
              backgroundColor: C.surfaceAlt,
            }}
          />
        </div>

        {/* Templates list */}
        <div className={styles.list}>
          {templates.map((templateObj) => {
            let isSelected = sSelectedTemplateId === templateObj.id;
            let isNew = isNewTemplate(templateObj.id);
            let labelValue = isNew
              ? getLocalValue(templateObj.id, "label") ?? getLabel(templateObj)
              : getLabel(templateObj);
            let contentValue = isNew
              ? getLocalValue(templateObj.id, "content") ??
                getContent(templateObj)
              : getContent(templateObj);

            return (
              <TemplateRow
                key={templateObj.id}
                templateObj={templateObj}
                isSelected={isSelected}
                isNew={isNew}
                savedTemplates={savedTemplates}
                labelValue={labelValue}
                contentValue={contentValue}
                onSelectTemplate={_setSelectedTemplateId}
                onFieldChange={handleFieldChange}
                onInsertVariable={handleInsertVariable}
                onOpenEmojiModal={_setEmojiModalTemplateId}
                onDeleteTemplate={handleDeleteTemplate}
                onSaveNewTemplate={handleSaveNewTemplate}
                bodyInputRef={getInputRefObject(templateObj.id)}
                onCursorChange={(id, pos) => {
                  cursorPositionRefs.current[id] = pos;
                }}
              />
            );
          })}
        </div>

        {/* Emoji picker modal - portaled to body to avoid z-index issues */}
        {!!sEmojiModalTemplateId && (
          <EmojiPickerModal
            onSelectEmoji={handleEmojiSelected}
            onClose={() => _setEmojiModalTemplateId(null)}
          />
        )}
      </div>
    </div>
  );
};

import React from "react";
import {
  Button,
  CheckBox,
  DropdownMenu,
  TextInput,
  Tooltip,
} from "../../../../../dom_components";
import { C, COLOR_GRADIENTS, ICONS } from "../../../../../styles";

import {
  TEXT_TEMPLATE_VARIABLES,
  TEXT_TEMPLATE_TYPE_VARIABLES,
} from "./templateConstants";
import styles from "./TemplateRow.module.css";

export function TemplateRow({
  templateObj,
  isSelected,
  isNew,
  savedTemplates,
  labelValue,
  contentValue,
  onSelectTemplate,
  onFieldChange,
  onInsertVariable,
  onOpenEmojiModal,
  onDeleteTemplate,
  onSaveNewTemplate,
  bodyInputRef,
  onCursorChange,
}) {
  const orderOptions = (() => {
    let usedOrders = new Set(
      savedTemplates
        .filter((t) => t.id !== templateObj.id && t.order > 0)
        .map((t) => t.order)
    );
    let available = [{ label: "---", value: 0 }];
    for (let i = 1; i <= savedTemplates.length; i++) {
      if (!usedOrders.has(i)) available.push({ label: String(i), value: i });
    }
    return available;
  })();

  return (
    <div
      className={styles.row}
      style={{
        borderColor: isSelected ? C.green : C.buttonLightGreenOutline,
        backgroundColor: C.backgroundListWhite,
      }}
    >
      {/* Header row: template name + order + show in chat + delete */}
      <div className={styles.headerRow}>
        <TextInput
          debounceMs={500}
          onChangeText={(val) => onFieldChange(templateObj, "label", val)}
          onFocus={() => onSelectTemplate(templateObj.id)}
          placeholder="Template name..."
          placeholderTextColor={C.textDisabled}
          className={styles.labelInput}
          style={{ borderColor: C.buttonLightGreenOutline, color: C.text }}
          value={labelValue}
        />
        <div className={styles.orderGroup}>
          <span className={styles.orderLabel} style={{ color: C.textMuted }}>
            Order
          </span>
          <DropdownMenu
            dataArr={orderOptions}
            onSelect={(item) => onFieldChange(templateObj, "order", item.value)}
            buttonText={templateObj.order > 0 ? String(templateObj.order) : "---"}
            buttonStyle={{ paddingVertical: 3, paddingHorizontal: 6, minWidth: 40 }}
            buttonTextStyle={{ fontSize: 12 }}
          />
        </div>
        <div className={styles.checkGroup}>
          <CheckBox
            text="Chat"
            isChecked={templateObj.showInChat !== false}
            onCheck={() =>
              onFieldChange(
                templateObj,
                "showInChat",
                templateObj.showInChat === false
              )
            }
          />
        </div>
        {!templateObj.type && templateObj.removable !== false && (
          <div className={styles.deleteBtnWrap}>
            <Tooltip text="Delete template" position="top">
              <Button
                onPress={() => onDeleteTemplate(templateObj)}
                iconSize={15}
                icon={ICONS.trash}
              />
            </Tooltip>
          </div>
        )}
      </div>

      {/* Message body */}
      <TextInput
        inputRef={bodyInputRef}
        debounceMs={500}
        multiline={true}
        numberOfLines={0}
        onChangeText={(val) => onFieldChange(templateObj, "content", val)}
        onFocus={() => onSelectTemplate(templateObj.id)}
        onSelect={(event) => {
          let start = event.target?.selectionStart ?? 0;
          onCursorChange(templateObj.id, start);
        }}
        placeholder="Message body..."
        placeholderTextColor={C.textDisabled}
        className={styles.bodyInput}
        style={{ borderColor: C.buttonLightGreenOutline, color: C.text }}
        value={contentValue}
      />

      {/* Variable buttons + emoji picker - always rendered to avoid layout shift */}
      <div
        className={`${styles.variableBar} ${
          isSelected ? "" : styles.variableBarHidden
        }`}
      >
        <button
          type="button"
          className={`${styles.pillButton} ${styles.emojiPill}`}
          onClick={() => onOpenEmojiModal(templateObj.id)}
          style={{
            backgroundColor: C.buttonLightGreen,
            borderColor: C.buttonLightGreenOutline,
          }}
        >
          {"😊"}
        </button>
        {[
          ...TEXT_TEMPLATE_VARIABLES,
          ...(TEXT_TEMPLATE_TYPE_VARIABLES[templateObj.type] || []),
        ].map((v) => (
          <button
            key={v.variable}
            type="button"
            className={`${styles.pillButton} ${styles.variablePill}`}
            onClick={() => onInsertVariable(templateObj, v.variable)}
            style={{
              backgroundColor: C.buttonLightGreen,
              borderColor: C.buttonLightGreenOutline,
              color: C.text,
            }}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* Save button - only for new unsaved templates */}
      {isNew && (
        <div className={styles.saveBtnWrap}>
          <Button
            colorGradientArr={COLOR_GRADIENTS.greenblue}
            text="SAVE"
            onPress={() => onSaveNewTemplate(templateObj)}
            textStyle={{ color: C.textWhite, fontSize: 13 }}
          />
        </div>
      )}
    </div>
  );
}

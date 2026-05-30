import React from "react";
import styles from "./CardReaderRowItem.module.css";
import { Button, Image, TextInput } from "../../../../dom_components";
import { C, ICONS, Radius } from "../../../../styles";


export function CardReaderRowItem({
  reader,
  isEditing,
  labelDraft,
  onStartEdit,
  onLabelChange,
  onStopEdit,
  onDelete,
}) {
  const isOnline = reader.status === "online";
  const hasLabel = !!reader.label;
  const shortId =
    reader.id.length > 20 ? "..." + reader.id.slice(-12) : reader.id;

  return (
    <div
      className={styles.row}
      style={{
        backgroundColor: C.listItemWhite,
        borderColor: C.buttonLightGreenOutline,
      }}
    >
      <div
        className={styles.statusDot}
        style={{ backgroundColor: isOnline ? C.green : C.borderStrong }}
      />
      <div className={styles.readerInfo}>
        <span className={styles.readerSubtitle} style={{ color: C.textMuted }}>
          {reader.device_type ? reader.device_type + "  ·  " : ""}
          {shortId}
        </span>
        {hasLabel && !isEditing && (
          <div className={styles.labelRow}>
            <span className={styles.labelText} style={{ color: C.text }}>
              {reader.label}
            </span>
            <Button
              icon={ICONS.editPencil}
              iconSize={14}
              buttonStyle={{ paddingHorizontal: 6, backgroundColor: "transparent" }}
              onPress={onStartEdit}
            />
          </div>
        )}
        {(!hasLabel || isEditing) && (
          <div className={styles.labelRow}>
            <TextInput
              debounceMs={500}
              value={isEditing ? labelDraft : ""}
              onChangeText={onLabelChange}
              placeholder="Enter label..."
              placeholderTextColor={C.textMuted}
              style={{
                outlineWidth: 0,
                fontSize: 14,
                paddingTop: 3,
                paddingBottom: 3,
                paddingLeft: 6,
                paddingRight: 6,
                backgroundColor: C.backgroundWhite,
                borderWidth: 1,
                borderStyle: "solid",
                borderColor: C.buttonLightGreenOutline,
                borderRadius: Radius.control,
                minWidth: 140,
              }}
              onFocus={() => {
                if (!isEditing) onStartEdit();
              }}
              onBlur={onStopEdit}
            />
          </div>
        )}
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
}

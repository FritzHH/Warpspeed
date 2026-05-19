import React from "react";
import styles from "./CardReaderRowItem.module.css";
import { Button, Image, TextInput } from "../../../../dom_components";
import { C, ICONS } from "../../../../styles";
import { gray } from "../../../../utils";

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
        style={{ backgroundColor: isOnline ? C.green : gray(0.4) }}
      />
      <div className={styles.readerInfo}>
        <span className={styles.readerSubtitle} style={{ color: gray(0.5) }}>
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
              placeholderTextColor={gray(0.4)}
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
                borderRadius: 5,
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
      <button type="button" className={styles.deleteButton} onClick={onDelete}>
        <Image icon={ICONS.trash} size={14} />
      </button>
    </div>
  );
}

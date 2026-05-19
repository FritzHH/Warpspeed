import React, { useState } from "react";
import { DropdownMenu, TextInput } from "../../../../../dom_components";
import { C, ICONS } from "../../../../../styles";
import { gray, localStorageWrapper } from "../../../../../utils";
import { useAlertScreenStore } from "../../../../../stores";
import styles from "./CardReaderManager.module.css";

const LS_CARD_READER_KEY = "warpspeed_selected_card_reader";

export function CardReaderManager({ liveReaders = [], savedReaders = [], onSaveReaders }) {
  const [sEditingId, _setEditingId] = useState(null);
  const [sLabelDraft, _setLabelDraft] = useState("");
  const [sSelectedReader, _setSelectedReader] = useState(() => localStorageWrapper.getItem(LS_CARD_READER_KEY));

  let mergedReaders = liveReaders.map((live) => {
    let saved = savedReaders.find((s) => s.id === live.id);
    return {
      id: live.id,
      label: saved?.label || "",
      status: live.status || "offline",
      device_type: live.device_type || "",
      isLive: true,
    };
  });
  savedReaders.forEach((saved) => {
    if (saved.id && !mergedReaders.find((m) => m.id === saved.id)) {
      mergedReaders.push({ id: saved.id, label: saved.label || "", status: "offline", device_type: "", isLive: false });
    }
  });

  function saveLabel(readerId, label) {
    let updated = savedReaders.filter((s) => s.id !== readerId);
    if (label.trim()) updated.push({ id: readerId, label: label.trim() });
    onSaveReaders(updated);
  }

  function handleDeleteReader(reader) {
    let isConnected = reader.isLive;
    useAlertScreenStore.getState().setValues({
      title: isConnected ? "Reader Connected" : "Remove Reader",
      message: isConnected
        ? "This reader is connected to the Stripe account. It will appear back in this list until it is removed from your account."
        : "This reader is no longer connected to the account. Safely remove?",
      btn1Text: "Remove",
      btn2Text: "Cancel",
      handleBtn1Press: () => {
        let updated = savedReaders.filter((s) => s.id !== reader.id);
        onSaveReaders(updated);
        if (sSelectedReader?.id === reader.id) {
          _setSelectedReader(null);
          localStorageWrapper.removeItem(LS_CARD_READER_KEY);
        }
        useAlertScreenStore.getState().setShowAlert(false);
      },
      handleBtn2Press: () => useAlertScreenStore.getState().setShowAlert(false),
      canExitOnOuterClick: true,
    });
  }

  let dropdownData = mergedReaders.map((r) => {
    let isOffline = r.status !== "online";
    return {
      id: r.id,
      label: (r.label || r.id) + (isOffline ? "  (offline)" : ""),
      disabled: isOffline,
      rawLabel: r.label,
      textColor: isOffline ? gray(0.5) : C.text,
    };
  });

  let selectedLabel = "";
  if (sSelectedReader?.id) {
    selectedLabel = sSelectedReader.label || sSelectedReader.id;
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.box} style={{ backgroundColor: C.backgroundListWhite }}>
        <span className={styles.header} style={{ color: gray(0.6) }}>STRIPE CARD READERS</span>

        {mergedReaders.length === 0 && (
          <span className={styles.emptyText} style={{ color: gray(0.4) }}>
            No readers found on account
          </span>
        )}

        <div className={styles.list}>
          {mergedReaders.map((reader) => {
            let isOnline = reader.status === "online";
            let isEditing = sEditingId === reader.id;
            let hasLabel = !!reader.label;

            return (
              <div
                key={reader.id}
                className={styles.readerRow}
                style={{ backgroundColor: C.listItemWhite }}
              >
                <span
                  className={styles.statusDot}
                  style={{ backgroundColor: isOnline ? C.green : gray(0.4) }}
                />
                <div className={styles.readerInfo}>
                  <span className={styles.readerId} style={{ color: gray(0.5) }}>
                    {reader.device_type ? reader.device_type + "  ·  " : ""}
                    {reader.id.length > 20 ? "..." + reader.id.slice(-12) : reader.id}
                  </span>
                  {hasLabel && !isEditing && (
                    <div className={styles.labelRow}>
                      <span className={styles.labelText} style={{ color: C.text }}>
                        {reader.label}
                      </span>
                      <button
                        type="button"
                        className={styles.editBtn}
                        onClick={() => {
                          _setEditingId(reader.id);
                          _setLabelDraft(reader.label);
                        }}
                        aria-label="Edit label"
                      >
                        <img
                          className={styles.iconImg}
                          src={ICONS.editPencil}
                          alt=""
                          width={14}
                          height={14}
                        />
                      </button>
                    </div>
                  )}
                  {(!hasLabel || isEditing) && (
                    <div className={styles.labelRow}>
                      <TextInput
                        debounceMs={500}
                        value={isEditing ? sLabelDraft : ""}
                        onChangeText={(val) => {
                          _setLabelDraft(val);
                          saveLabel(reader.id, val);
                        }}
                        placeholder="Enter label..."
                        placeholderTextColor={gray(0.4)}
                        style={{
                          outline: "none",
                          fontSize: 14,
                          padding: "3px 6px",
                          backgroundColor: C.backgroundWhite,
                          border: `1px solid ${C.buttonLightGreenOutline}`,
                          borderRadius: 5,
                          minWidth: 140,
                        }}
                        onFocus={() => {
                          if (sEditingId !== reader.id) {
                            _setEditingId(reader.id);
                            _setLabelDraft(reader.label || "");
                          }
                        }}
                        onBlur={() => {
                          _setEditingId(null);
                          _setLabelDraft("");
                        }}
                      />
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className={styles.deleteBtn}
                  onClick={() => handleDeleteReader(reader)}
                  aria-label="Remove reader"
                >
                  <img
                    className={styles.iconImg}
                    src={ICONS.trash}
                    alt=""
                    width={14}
                    height={14}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className={styles.selectedRow}>
        <span className={styles.selectedLabel}>Selected Reader: </span>
        <DropdownMenu
          buttonText={selectedLabel || "None"}
          buttonTextStyle={{ fontSize: 14 }}
          buttonStyle={{
            borderRadius: 5,
            borderWidth: 1,
            borderColor: C.buttonLightGreenOutline,
            paddingHorizontal: 7,
            paddingVertical: 3,
          }}
          dataArr={dropdownData}
          onSelect={(item) => {
            if (item.disabled) return;
            let obj = { id: item.id, label: item.rawLabel || "" };
            _setSelectedReader(obj);
            localStorageWrapper.setItem(LS_CARD_READER_KEY, obj);
          }}
        />
      </div>
    </div>
  );
}

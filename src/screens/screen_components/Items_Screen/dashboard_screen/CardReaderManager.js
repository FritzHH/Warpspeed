import React, { useState } from "react";
import styles from "./CardReaderManager.module.css";
import { DropdownMenu } from "../../../../dom_components";
import { useAlertScreenStore } from "../../../../stores";
import { C } from "../../../../styles";
import { gray, localStorageWrapper } from "../../../../utils";
import { CardReaderRowItem } from "./CardReaderRowItem";

const LS_CARD_READER_KEY = "warpspeed_selected_card_reader";

export function CardReaderManager({
  liveReaders = [],
  savedReaders = [],
  onSaveReaders,
}) {
  const [sEditingId, _setEditingId] = useState(null);
  const [sLabelDraft, _setLabelDraft] = useState("");
  const [sSelectedReader, _setSelectedReader] = useState(() =>
    localStorageWrapper.getItem(LS_CARD_READER_KEY)
  );

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
      mergedReaders.push({
        id: saved.id,
        label: saved.label || "",
        status: "offline",
        device_type: "",
        isLive: false,
      });
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
    <div className={styles.container}>
      <div
        className={styles.listBox}
        style={{
          backgroundColor: C.backgroundListWhite,
          borderColor: C.buttonLightGreenOutline,
        }}
      >
        <span className={styles.heading} style={{ color: gray(0.6) }}>
          STRIPE CARD READERS
        </span>

        {mergedReaders.length === 0 && (
          <span className={styles.emptyText} style={{ color: gray(0.4) }}>
            No readers found on account
          </span>
        )}

        <div className={styles.rowList}>
          {mergedReaders.map((reader) => (
            <CardReaderRowItem
              key={reader.id}
              reader={reader}
              isEditing={sEditingId === reader.id}
              labelDraft={sLabelDraft}
              onStartEdit={() => {
                _setEditingId(reader.id);
                _setLabelDraft(reader.label || "");
              }}
              onLabelChange={(val) => {
                _setLabelDraft(val);
                saveLabel(reader.id, val);
              }}
              onStopEdit={() => {
                _setEditingId(null);
                _setLabelDraft("");
              }}
              onDelete={() => handleDeleteReader(reader)}
            />
          ))}
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

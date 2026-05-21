/* eslint-disable */
import React, { useState, useEffect } from "react";
import { C, ICONS, COLOR_GRADIENTS } from "../../../styles";
import { Button, TextInput, Dialog } from "../../../dom_components";
import { useLoginStore, useSettingsStore } from "../../../stores";
import { PRIVILEDGE_LEVELS } from "../../../data";
import { formatMillisForDisplay } from "../../../utils";
import {
  firestoreWrite,
  firestoreDelete,
  firestoreUpdate,
  firestoreSubscribeCollection,
} from "../../../db_calls";
import styles from "./DevNotesModal.module.css";

function getDevNotesPath(noteID) {
  let settings = useSettingsStore.getState().getSettings();
  let tenantID = settings?.tenantID;
  let storeID = settings?.storeID;
  let base = `tenants/${tenantID}/stores/${storeID}/dev_notes`;
  return noteID ? base + "/" + noteID : base;
}

export const DevNotesModal = ({ visible, onClose }) => {
  const [sNotes, _sSetNotes] = useState([]);
  const [sNewNoteText, _sSetNewNoteText] = useState("");
  const [sEditingNoteID, _sSetEditingNoteID] = useState(null);
  const [sEditText, _sSetEditText] = useState("");

  useEffect(() => {
    if (!visible) return;
    const unsubscribe = firestoreSubscribeCollection(getDevNotesPath(), (docs) => {
      let sorted = (docs || []).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      _sSetNotes(sorted);
    });
    return () => unsubscribe();
  }, [visible]);

  if (!visible) return null;

  const currentUser = useLoginStore.getState().getCurrentUser();
  const userPerm = currentUser?.permissions?.name || currentUser?.permissions;
  const isOwner = userPerm === PRIVILEDGE_LEVELS.owner;

  async function handlePost() {
    let text = sNewNoteText.trim();
    if (!text) return;
    let id = crypto.randomUUID();
    let now = Date.now();
    await firestoreWrite(getDevNotesPath(id), {
      id,
      text,
      userID: currentUser?.id || "",
      userName: ((currentUser?.first || "") + " " + (currentUser?.last || "")).trim() || "Unknown",
      createdAt: now,
      updatedAt: now,
    });
    _sSetNewNoteText("");
  }

  async function handleDeleteNote(note) {
    await firestoreDelete(getDevNotesPath(note.id));
  }

  function handleStartEdit(note) {
    _sSetEditingNoteID(note.id);
    _sSetEditText(note.text);
  }

  async function handleSaveEdit(note) {
    let text = sEditText.trim();
    if (!text) return;
    await firestoreUpdate(getDevNotesPath(note.id), {
      text,
      updatedAt: Date.now(),
    });
    _sSetEditingNoteID(null);
    _sSetEditText("");
  }

  function handleCancelEdit() {
    _sSetEditingNoteID(null);
    _sSetEditText("");
  }

  return (
    <Dialog visible={visible} onClose={onClose} title="Dev Notes" aria-label="Dev Notes">
      <div className={styles.card}>
        {/* Header */}
        <div className={styles.header}>
          <span className={styles.title} style={{ color: C.text }}>
            Dev Notes
          </span>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <img src={ICONS.close1} alt="" className={styles.closeIcon} />
          </button>
        </div>

        {/* Input area */}
        <div className={styles.inputRow}>
          <div className={styles.inputWrap}>
            <TextInput
              value={sNewNoteText}
              onChangeText={(val) =>
                _sSetNewNoteText(val.charAt(0).toUpperCase() + val.slice(1))
              }
              debounceMs={0}
              placeholder="Write a note..."
              autoFocus={true}
              multiline={true}
              numberOfLines={3}
              style={{
                width: "100%",
                borderColor: C.buttonLightGreenOutline,
                borderRadius: 10,
                borderWidth: 2,
                backgroundColor: C.listItemWhite,
                paddingTop: 10,
                paddingBottom: 10,
                paddingLeft: 10,
                paddingRight: 10,
                fontSize: 14,
                color: C.text,
                boxSizing: "border-box",
              }}
            />
          </div>
          <Button
            text="Post"
            colorGradientArr={COLOR_GRADIENTS.green}
            textStyle={{ color: C.textWhite, fontSize: 13 }}
            buttonStyle={{
              width: 70,
              height: 38,
              borderRadius: 5,
              marginTop: 2,
            }}
            onPress={handlePost}
          />
        </div>

        {/* Notes list */}
        <div className={styles.list}>
          {sNotes.length === 0 && (
            <div className={styles.emptyText} style={{ color: C.textMuted }}>
              No notes yet
            </div>
          )}
          {sNotes.map((note) => {
            let isAuthor = note.userID === currentUser?.id;
            let canEditDelete = isAuthor || isOwner;
            let isEditing = sEditingNoteID === note.id;

            return (
              <div
                key={note.id}
                className={styles.note}
                style={{
                  backgroundColor: C.listItemWhite,
                  borderColor: C.borderStrong,
                }}
              >
                {isEditing ? (
                  <div>
                    <TextInput
                      value={sEditText}
                      onChangeText={(val) => _sSetEditText(val)}
                      debounceMs={0}
                      multiline={true}
                      numberOfLines={3}
                      autoFocus={true}
                      style={{
                        borderColor: C.buttonLightGreenOutline,
                        borderRadius: 8,
                        borderWidth: 2,
                        backgroundColor: C.backgroundWhite,
                        paddingTop: 8,
                        paddingBottom: 8,
                        paddingLeft: 10,
                        paddingRight: 10,
                        fontSize: 14,
                        color: C.text,
                        marginBottom: 8,
                      }}
                    />
                    <div className={styles.editActions}>
                      <Button
                        text="Cancel"
                        colorGradientArr={COLOR_GRADIENTS.grey}
                        textStyle={{ color: C.textWhite, fontSize: 12 }}
                        buttonStyle={{ width: 70, height: 30, borderRadius: 5 }}
                        onPress={handleCancelEdit}
                      />
                      <Button
                        text="Save"
                        colorGradientArr={COLOR_GRADIENTS.green}
                        textStyle={{ color: C.textWhite, fontSize: 12 }}
                        buttonStyle={{ width: 70, height: 30, borderRadius: 5 }}
                        onPress={() => handleSaveEdit(note)}
                      />
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className={styles.noteText} style={{ color: C.text }}>
                      {note.text}
                    </p>
                    <div className={styles.noteFooter}>
                      <span className={styles.noteMeta} style={{ color: C.textMuted }}>
                        {note.userName || "Unknown"}
                        {"  ·  "}
                        {formatMillisForDisplay(note.createdAt)}
                        {note.updatedAt && note.updatedAt !== note.createdAt
                          ? "  (edited)"
                          : ""}
                      </span>
                      <div className={styles.noteActions}>
                        {canEditDelete && (
                          <button
                            className={styles.iconBtn}
                            onClick={() => handleStartEdit(note)}
                            aria-label="Edit note"
                          >
                            <img
                              src={ICONS.editPencil}
                              alt=""
                              className={styles.actionIcon}
                            />
                          </button>
                        )}
                        <button
                          className={styles.iconBtn}
                          onClick={() => handleDeleteNote(note)}
                          aria-label="Delete note"
                        >
                          <img src={ICONS.trash} alt="" className={styles.actionIcon} />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Dialog>
  );
};

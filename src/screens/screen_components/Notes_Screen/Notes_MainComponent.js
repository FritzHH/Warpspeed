/* eslint-disable */
import { gray, resolveStatus, lightenRGBByPercent, capitalizeFirstLetterOfString } from "../../../utils";
import { Image } from "../../../dom_components/Image/Image";
import { TouchableOpacity } from "../../../dom_components/TouchableOpacity/TouchableOpacity";
import { TextInput } from "../../../dom_components/TextInput/TextInput";
import { Tooltip } from "../../../dom_components/Tooltip/Tooltip";
import { C, ICONS } from "../../../styles";
import { useState, useRef } from "react";
import { useOpenWorkordersStore, useLoginStore, useSettingsStore } from "../../../stores";
import styles from "./Notes_MainComponent.module.css";

const EMPTY_NOTES = [];

export function Notes_MainComponent() {
  const zInternalNotes = useOpenWorkordersStore(
    (state) => {
      const resolvedID = state.workorderPreviewID || state.openWorkorderID;
      const workorder = state.workorders.find((wo) => wo.id === resolvedID);
      return workorder?.internalNotes || EMPTY_NOTES;
    },
    (prev, next) => {
      if (!prev && !next) return true;
      if (!prev || !next) return false;
      if (prev.length !== next.length) return false;
      return prev.every((note, i) => note === next[i]);
    }
  );
  const zCustomerNotes = useOpenWorkordersStore(
    (state) => {
      const resolvedID = state.workorderPreviewID || state.openWorkorderID;
      const workorder = state.workorders.find((wo) => wo.id === resolvedID);
      return workorder?.customerNotes || EMPTY_NOTES;
    },
    (prev, next) => {
      if (!prev && !next) return true;
      if (!prev || !next) return false;
      if (prev.length !== next.length) return false;
      return prev.every((note, i) => note === next[i]);
    }
  );
  const zOpenWorkorderID = useOpenWorkordersStore((s) => s.workorderPreviewID || s.openWorkorderID);
  const zWorkorderStatus = useOpenWorkordersStore((state) => {
    const resolvedID = state.workorderPreviewID || state.openWorkorderID;
    const workorder = state.workorders.find((wo) => wo.id === resolvedID);
    return workorder?.status || "";
  });
  const zStatuses = useSettingsStore((state) => state.settings?.statuses);
  const isDonePaid = resolveStatus(zWorkorderStatus, zStatuses)?.label?.toLowerCase() === "done & paid";
  const zIsPreview = useOpenWorkordersStore((state) => !!state.workorderPreviewID && state.workorderPreviewID !== state.openWorkorderID);

  const [sEditingNoteId, _setEditingNoteId] = useState(null);
  const cursorOffsetRef = useRef(null);

  function formatUserShowName() {
    const user = useLoginStore.getState().currentUser;
    return "(" + user.first.toString() + " " + user.last[0] + ")  ";
  }

  function formatNoteDateShort(millis) {
    if (!millis) return "";
    const d = new Date(millis);
    const days = ["Sun", "Mon", "Tues", "Wed", "Thurs", "Fri", "Sat"];
    const rawHours = d.getHours();
    const hours = rawHours % 12 || 12;
    const mins = d.getMinutes().toString().padStart(2, "0");
    const ap = rawHours >= 12 ? "P" : "A";
    return `${days[d.getDay()]} ${hours}:${mins} ${ap}`;
  }

  function outsideClicked(option) {
    useLoginStore.getState().requireLogin(() => {
      let notesArr;
      let fieldName;
      if (option == "customer") {
        notesArr = zCustomerNotes;
        fieldName = "customerNotes";
      } else {
        notesArr = zInternalNotes;
        fieldName = "internalNotes";
      }

      const newId = crypto.randomUUID();
      notesArr.unshift({
        name: formatUserShowName(),
        userID: useLoginStore.getState().currentUser.id,
        value: "",
        id: newId,
        createdAt: Date.now(),
      });

      useOpenWorkordersStore.getState().setField(fieldName, notesArr);
      _setEditingNoteId(newId);
    });
  }

  function deleteItem(item, index, option) {
    useLoginStore.getState().requireLogin(() => {
      let notesArr;
      let fieldName;
      if (option == "customer") {
        notesArr = zCustomerNotes;
        fieldName = "customerNotes";
      } else {
        notesArr = zInternalNotes;
        fieldName = "internalNotes";
      }

      notesArr = notesArr.filter((o) => o.id != item.id);
      useOpenWorkordersStore.getState().setField(fieldName, notesArr);
    });
  }

  function textChanged(value, index, option) {
    let notesArr;
    let fieldName;
    if (option == "customer") {
      notesArr = zCustomerNotes;
      fieldName = "customerNotes";
    } else {
      notesArr = zInternalNotes;
      fieldName = "internalNotes";
    }

    let line = notesArr[index];
    line.value = value;
    notesArr[index] = line;

    useOpenWorkordersStore.getState().setField(fieldName, notesArr);
  }

  function handleNoteTextClick(e, item) {
    const nativeEvt = e?.nativeEvent || e;
    const px = nativeEvt?.pageX;
    const py = nativeEvt?.pageY;
    if (px != null && py != null && document.caretRangeFromPoint) {
      const range = document.caretRangeFromPoint(px - window.scrollX, py - window.scrollY);
      if (range) cursorOffsetRef.current = range.startOffset;
    }
    _setEditingNoteId(item.id);
  }

  function handleInputFocus(e) {
    useLoginStore.getState().requireLogin(() => {});
    const el = e.target;
    const offset = cursorOffsetRef.current;
    cursorOffsetRef.current = null;
    if (offset != null && offset <= el.value.length) {
      el.selectionStart = el.selectionEnd = offset;
    } else {
      el.selectionStart = el.selectionEnd = el.value.length;
    }
  }

  if (!zOpenWorkorderID) {
    return <div className={styles.emptyContainer}></div>;
  }

  const containerStyle = {
    backgroundImage: zIsPreview
      ? `repeating-linear-gradient(135deg, ${lightenRGBByPercent(C.lightred, 92)}, ${lightenRGBByPercent(C.lightred, 92)} 10px, transparent 10px, transparent 20px)`
      : undefined,
  };

  const headerBorderStyle = { borderColor: C.buttonLightGreenOutline };
  const noteRowStyle = { backgroundColor: C.backgroundWhite };

  return (
    <div
      className={`${styles.container} ${isDonePaid ? styles.containerDisabled : ""}`}
      style={containerStyle}
    >
      <div className={styles.row}>
        {/* CUSTOMER NOTES */}
        <div className={`${styles.column} ${styles.columnLeft}`}>
          <div className={styles.headerBar} style={headerBorderStyle}>
            <div className={styles.headerIconGroup}>
              <Image icon={ICONS.notes} size={20} />
              <span className={styles.headerLabel} style={{ color: C.text }}>
                Customer Notes
              </span>
            </div>
            <TouchableOpacity
              onPress={() => outsideClicked("customer")}
              style={{
                flex: 1,
                height: "100%",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <span className={styles.headerActionText} style={{ color: gray(0.18) }}>
                Click to add
              </span>
            </TouchableOpacity>
          </div>

          <div className={styles.notesList}>
            {zCustomerNotes.map((item, index) => {
              const isEditing = sEditingNoteId === item.id;
              return (
                <div key={item.id} className={styles.noteRow} style={noteRowStyle}>
                  <div className={styles.noteMeta}>
                    <div className={styles.noteMetaTopRow}>
                      <Tooltip text="Delete note" position="right">
                        <TouchableOpacity
                          onPress={() => {
                            deleteItem(item, index, "customer");
                            _setEditingNoteId(null);
                          }}
                          style={{ padding: 2 }}
                        >
                          <Image
                            icon={ICONS.trash}
                            size={14}
                            className={styles.deleteIcon}
                          />
                        </TouchableOpacity>
                      </Tooltip>
                      <span className={styles.noteName} style={{ color: gray(0.4) }}>
                        {item.name}
                      </span>
                    </div>
                    <span className={styles.noteDate} style={{ color: gray(0.5) }}>
                      {formatNoteDateShort(item.createdAt)}
                    </span>
                  </div>
                  {isEditing ? (
                    <TextInput
                      multiline={true}
                      numberOfLines={10}
                      capitalize={true}
                      debounceMs={1000}
                      onChangeText={(val) => textChanged(val, index, "customer")}
                      onBlur={() => _setEditingNoteId(null)}
                      onFocus={handleInputFocus}
                      className={styles.noteInput}
                      style={{ color: C.text, lineHeight: "18px" }}
                      autoFocus={true}
                      value={item.value}
                    />
                  ) : (
                    <div
                      className={styles.noteTextBox}
                      onClick={(e) => handleNoteTextClick(e, item)}
                    >
                      <span
                        className={styles.noteText}
                        style={{ color: item.value ? C.text : gray(0.5) }}
                      >
                        {capitalizeFirstLetterOfString(item.value) || "Empty note"}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* INTERNAL NOTES */}
        <div className={`${styles.column} ${styles.columnRight}`}>
          <Tooltip text="Add note" position="top">
            <TouchableOpacity
              onPress={() => outsideClicked("internal")}
              style={{
                width: "100%",
                height: 35,
                display: "flex",
                flexDirection: "row",
                justifyContent: "flex-start",
                alignItems: "center",
                borderColor: C.buttonLightGreenOutline,
                borderStyle: "solid",
                borderWidth: 1,
                borderRadius: 15,
                marginBottom: 5,
                paddingLeft: 3,
                paddingRight: 3,
                boxSizing: "border-box",
                flexShrink: 0,
              }}
            >
              <div className={styles.headerIconGroupInternal}>
                <Image icon={ICONS.gears1} size={20} />
                <span className={styles.headerLabel} style={{ color: C.text }}>
                  Internal Notes
                </span>
              </div>
              <span className={styles.headerActionInternal} style={{ color: gray(0.18) }}>
                Click to add
              </span>
            </TouchableOpacity>
          </Tooltip>

          <div className={`${styles.notesList} ${styles.notesListInternal}`}>
            {zInternalNotes.map((item, index) => {
              const isEditing = sEditingNoteId === item.id;
              return (
                <div key={item.id} className={styles.noteRow} style={noteRowStyle}>
                  <div className={styles.noteMeta}>
                    <div className={styles.noteMetaTopRow}>
                      <Tooltip text="Delete note" position="right">
                        <TouchableOpacity
                          onPress={() => {
                            deleteItem(item, index, "internal");
                            _setEditingNoteId(null);
                          }}
                          style={{ padding: 2 }}
                        >
                          <Image
                            icon={ICONS.trash}
                            size={14}
                            className={styles.deleteIcon}
                          />
                        </TouchableOpacity>
                      </Tooltip>
                      <span className={styles.noteName} style={{ color: gray(0.4) }}>
                        {item.name}
                      </span>
                    </div>
                    <span className={styles.noteDate} style={{ color: gray(0.5) }}>
                      {formatNoteDateShort(item.createdAt)}
                    </span>
                  </div>
                  {isEditing ? (
                    <TextInput
                      multiline={true}
                      numberOfLines={10}
                      capitalize={true}
                      debounceMs={1000}
                      onChangeText={(val) => textChanged(val, index, "internal")}
                      onBlur={() => _setEditingNoteId(null)}
                      onFocus={handleInputFocus}
                      className={styles.noteInput}
                      style={{ color: C.text, lineHeight: "18px" }}
                      autoFocus={true}
                      value={item.value}
                    />
                  ) : (
                    <div
                      className={styles.noteTextBox}
                      onClick={(e) => handleNoteTextClick(e, item)}
                    >
                      <span
                        className={styles.noteText}
                        style={{ color: item.value ? C.text : gray(0.5) }}
                      >
                        {capitalizeFirstLetterOfString(item.value) || "Empty note"}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

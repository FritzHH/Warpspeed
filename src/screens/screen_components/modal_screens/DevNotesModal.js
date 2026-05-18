/* eslint-disable */
import React, { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import { View, Text, TouchableOpacity, ScrollView } from "react-native-web";
import { C, ICONS, Fonts, COLOR_GRADIENTS, Z } from "../../../styles";
import { Button_, TextInput_, Image_ } from "../../../components";
import { useLoginStore, useSettingsStore, useAlertScreenStore } from "../../../stores";
import { PRIVILEDGE_LEVELS } from "../../../data";
import { formatMillisForDisplay, gray } from "../../../utils";
import {
  firestoreWrite,
  firestoreDelete,
  firestoreUpdate,
  firestoreSubscribeCollection,
} from "../../../db_calls";

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

  // Real-time listener for dev_notes collection
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

  return ReactDOM.createPortal(
    <View
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        justifyContent: "center",
        alignItems: "center",
        zIndex: Z.modal,
      }}
    >
      {/* Click-outside overlay */}
      <TouchableOpacity
        activeOpacity={1}
        onPress={onClose}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          cursor: "default",
        }}
      />
      {/* Modal card */}
      <View
        style={{
          width: 600,
          height: "90%",
          backgroundColor: C.backgroundWhite,
          borderRadius: 12,
          borderWidth: 2,
          borderColor: C.buttonLightGreenOutline,
          padding: 20,
        }}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <Text
            style={{
              fontSize: 18,
              fontWeight: Fonts.weight.textHeavy,
              color: C.text,
            }}
          >
            Dev Notes
          </Text>
          <TouchableOpacity onPress={onClose}>
            <Image_ icon={ICONS.close1} size={18} />
          </TouchableOpacity>
        </View>

        {/* Input area */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            marginBottom: 14,
          }}
        >
          <View style={{ flex: 1, marginRight: 10 }}>
            <TextInput_
              value={sNewNoteText}
              onChangeText={(val) => _sSetNewNoteText(val.charAt(0).toUpperCase() + val.slice(1))}
              debounceMs={0}
              placeholder="Write a note..."
              autoFocus={true}
              multiline={true}
              numberOfLines={3}
              blurOnSubmit={false}
              style={{
                borderColor: C.buttonLightGreenOutline,
                borderRadius: 10,
                borderWidth: 2,
                backgroundColor: C.listItemWhite,
                paddingVertical: 10,
                paddingHorizontal: 10,
                fontSize: 14,
                color: C.text,
              }}
            />
          </View>
          <Button_
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
        </View>

        {/* Notes list */}
        <ScrollView style={{ flex: 1 }}>
          {sNotes.length === 0 && (
            <Text
              style={{
                fontSize: 14,
                color: gray(0.5),
                textAlign: "center",
                marginTop: 40,
              }}
            >
              No notes yet
            </Text>
          )}
          {sNotes.map((note) => {
            let isAuthor = note.userID === currentUser?.id;
            let canEditDelete = isAuthor || isOwner;
            let isEditing = sEditingNoteID === note.id;

            return (
              <View
                key={note.id}
                style={{
                  backgroundColor: C.listItemWhite,
                  borderWidth: 1,
                  borderColor: gray(0.88),
                  borderRadius: 8,
                  marginBottom: 8,
                  padding: 12,
                }}
              >
                {isEditing ? (
                  <View>
                    <TextInput_
                      value={sEditText}
                      onChangeText={(val) => _sSetEditText(val)}
                      debounceMs={0}
                      multiline={true}
                      numberOfLines={3}
                      blurOnSubmit={false}
                      autoFocus={true}
                      style={{
                        borderColor: C.buttonLightGreenOutline,
                        borderRadius: 8,
                        borderWidth: 2,
                        backgroundColor: C.backgroundWhite,
                        paddingVertical: 8,
                        paddingHorizontal: 10,
                        fontSize: 14,
                        color: C.text,
                        marginBottom: 8,
                      }}
                    />
                    <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
                      <Button_
                        text="Cancel"
                        colorGradientArr={COLOR_GRADIENTS.grey}
                        textStyle={{ color: C.textWhite, fontSize: 12 }}
                        buttonStyle={{ width: 70, height: 30, borderRadius: 5, marginRight: 8 }}
                        onPress={handleCancelEdit}
                      />
                      <Button_
                        text="Save"
                        colorGradientArr={COLOR_GRADIENTS.green}
                        textStyle={{ color: C.textWhite, fontSize: 12 }}
                        buttonStyle={{ width: 70, height: 30, borderRadius: 5 }}
                        onPress={() => handleSaveEdit(note)}
                      />
                    </View>
                  </View>
                ) : (
                  <View>
                    <Text
                      style={{
                        fontSize: 14,
                        color: C.text,
                        marginBottom: 8,
                        lineHeight: 20,
                      }}
                    >
                      {note.text}
                    </Text>
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <Text style={{ fontSize: 12, color: gray(0.5) }}>
                        {note.userName || "Unknown"}
                        {"  ·  "}
                        {formatMillisForDisplay(note.createdAt)}
                        {note.updatedAt && note.updatedAt !== note.createdAt
                          ? "  (edited)"
                          : ""}
                      </Text>
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        {canEditDelete && (
                          <TouchableOpacity
                            onPress={() => handleStartEdit(note)}
                            style={{ paddingHorizontal: 8 }}
                          >
                            <Image_ icon={ICONS.editPencil} size={16} />
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity
                          onPress={() => handleDeleteNote(note)}
                          style={{ paddingHorizontal: 8 }}
                        >
                          <Image_ icon={ICONS.trash} size={16} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      </View>
    </View>,
    document.body
  );
};

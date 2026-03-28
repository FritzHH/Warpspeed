/* eslint-disable */
import {
  View,
  Text,
  TextInput,
  FlatList,
} from "react-native-web";
import { gray, resolveStatus } from "../../../utils";
import { Image_, TouchableOpacity_, TextInput_, Tooltip } from "../../../components";
import { C, Colors, ICONS } from "../../../styles";
import { useState } from "react";
import { useOpenWorkordersStore, useLoginStore, useSettingsStore } from "../../../stores";

/// Notes Tab Component
export function Notes_MainComponent() {
  // setters /////////////////////////////////////////////////////////////////////

  // getters /////////////////////////////////////////////////////////////////////

  const EMPTY_NOTES = [];
  const zInternalNotes = useOpenWorkordersStore(
    (state) => {
      const resolvedID = state.workorderPreviewID || state.openWorkorderID;
      const workorder = state.workorders.find(
        (wo) => wo.id === resolvedID
      );
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
      const workorder = state.workorders.find(
        (wo) => wo.id === resolvedID
      );
      return workorder?.customerNotes || EMPTY_NOTES;
    },
    (prev, next) => {
      if (!prev && !next) return true;
      if (!prev || !next) return false;
      if (prev.length !== next.length) return false;
      return prev.every((note, i) => note === next[i]);
    }
  );
  const zCurrentUser = useLoginStore((state) => state.currentUser);
  const zOpenWorkorderID = useOpenWorkordersStore((s) => s.workorderPreviewID || s.openWorkorderID);
  const zWorkorderStatus = useOpenWorkordersStore((state) => {
    const resolvedID = state.workorderPreviewID || state.openWorkorderID;
    const workorder = state.workorders.find((wo) => wo.id === resolvedID);
    return workorder?.status || "";
  });
  const zStatuses = useSettingsStore((state) => state.settings?.statuses);
  const isDonePaid = resolveStatus(zWorkorderStatus, zStatuses)?.label?.toLowerCase() === "done & paid";

  /////////////////////////////////////////////////////////////////////////////////
  const [sEditingNoteId, _setEditingNoteId] = useState(null);

  function formatUserShowName() {
    return (
      "(" + zCurrentUser.first.toString() + " " + zCurrentUser.last[0] + ")  "
    );
  }

  function formatNoteDate(millis) {
    if (!millis) return "";
    const d = new Date(millis);
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const day = days[d.getDay()];
    const month = d.getMonth() + 1;
    const date = d.getDate();
    let hours = d.getHours();
    const mins = d.getMinutes().toString().padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
    return `${day} ${month}/${date}, ${hours}:${mins} ${ampm}`;
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
        userID: zCurrentUser.id,
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

    // ''(wo);
  }

  // clog(zWorkorderObj);

  if (!zOpenWorkorderID) {
    return <View style={{ flex: 1 }}></View>;
  }

  return (
    <View
      style={{
        height: "100%",
        borderRadius: 15,
      }}
    >
      <View
        pointerEvents={isDonePaid ? "none" : "auto"}
        style={{
          paddingTop: 5,
          paddingHorizontal: 5,
          flexDirection: "row",
        }}
      >
        <View
          style={{
            width: "50%",
            height: "100%",
            flexDirection: "column",
            paddingRight: 10,
          }}
        >
          <Tooltip text="Add note" position="top">
            <TouchableOpacity_
              onPress={() => outsideClicked("customer")}
              style={{
                flexDirection: "row",
                width: "100%",
                height: 35,
                justifyContent: "space-between",
                alignItems: "center",
                borderColor: C.buttonLightGreenOutline,
                borderWidth: 1,
                borderRadius: 15,
                marginBottom: 5,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  width: "30%",
                  paddingLeft: 8,
                }}
              >
                <Image_ icon={ICONS.notes} size={20} />
                <Text
                  style={{
                    fontSize: 15,
                    color: C.text,
                    fontWeight: 500,
                    marginLeft: 10,
                  }}
                >
                  {"Customer Notes"}
                </Text>
            </View>
            <Text
              style={{
                fontSize: 16,
                color: gray(0.18),
                width: "70%",
                textAlign: "center",
              }}
            >
                Click to add
            </Text>
            </TouchableOpacity_>
          </Tooltip>

          <View
            style={{
              height: "100%",
              width: "100%",
            }}
          >
            <FlatList
              keyExtractor={(i, idx) => idx}
              data={zCustomerNotes}
              renderItem={(item) => {
                let index = item.index;
                item = item.item;
                const isEditing = sEditingNoteId === item.id;
                return (
                  <View
                    style={{
                      width: "100%",
                      flexDirection: "row",
                      alignItems: "center",
                      borderRadius: 5,
                      backgroundColor: C.backgroundWhite,
                      marginBottom: 3,
                    }}
                  >
                    <View style={{ alignItems: "center", justifyContent: "center", flexDirection: "row", paddingTop: 2 }}>
                      <Tooltip text="Delete note" position="right">
                        <TouchableOpacity_
                          onPress={() => { deleteItem(item, index, "customer"); _setEditingNoteId(null); }}
                          style={{ padding: 2 }}
                        >
                          <Image_
                            icon={ICONS.trash}
                            size={14}
                            style={{ opacity: 0.35, filter: "grayscale(100%)" }}
                          />
                        </TouchableOpacity_>
                      </Tooltip>
                      <Tooltip text={formatNoteDate(item.createdAt)} position="right">
                        <Text
                          style={{
                            color: gray(.4),
                            padding: 2,
                            fontSize: 12,
                            outlineWidth: 0,
                          }}
                        >
                          {item.name}
                        </Text>
                      </Tooltip>
                    </View>
                    {isEditing ? (
                      <TextInput_
                        multiline={true}
                        numberOfLines={10}
                        capitalize={true}
                        onChangeText={(val) =>
                          textChanged(val, index, "customer")
                        }
                        onBlur={() => _setEditingNoteId(null)}
                        style={{
                          padding: 2,
                          paddingLeft: 4,
                          lineHeight: 18,
                          outlineWidth: 0,
                          outlineStyle: "none",
                          borderWidth: 0,
                          flex: 1,
                          color: C.text,
                        }}
                        autoFocus={true}
                        value={item.value}
                      />
                    ) : (
                      <TouchableOpacity_
                        onPress={() => _setEditingNoteId(item.id)}
                        style={{ flex: 1, padding: 2, paddingLeft: 4, cursor: "text" }}
                      >
                        <Text
                          style={{
                            lineHeight: 18,
                            color: item.value ? C.text : gray(0.5),
                            fontSize: 14,
                          }}
                        >
                          {item.value || "Empty note"}
                        </Text>
                      </TouchableOpacity_>
                    )}
                  </View>
                );
              }}
            />
          </View>
        </View>

        {/* ///////////////INTERNAL NOTES /////////////////////////////////////*/}

        <View
          style={{
            width: "50%",
            height: "100%",
            flexDirection: "column",
            // paddingLeft: 10,
          }}
        >
          <Tooltip text="Add note" position="top">
            <TouchableOpacity_
              onPress={() => outsideClicked("internal")}
              style={{
                flexDirection: "row",
                width: "100%",
                height: 35,
                justifyContent: "flex-start",
                alignItems: "center",
                borderColor: C.buttonLightGreenOutline,
                borderWidth: 1,
                borderRadius: 15,
                marginBottom: 5,
                paddingHorizontal: 3,
              }}
            >
              <View
                style={{
                  width: "30%",
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                <Image_ icon={ICONS.gears1} size={20} />
                <Text
                  style={{
                    marginLeft: 10,
                    fontSize: 15,
                    color: C.text,
                    fontWeight: 500,
                  }}
                >
                  {"Internal Notes"}
                </Text>
              </View>
              <Text
                style={{
                  fontSize: 16,
                  color: gray(0.18),
                  width: "70%",
                  textAlign: "center",
                }}
              >
                Click to add
              </Text>
            </TouchableOpacity_>
          </Tooltip>
          <View
            style={{
              width: "100%",
              height: "100%",
              flexDirection: "column",
              paddingRight: 10,
            }}
          >
            <FlatList
              keyExtractor={(i, idx) => idx}
              data={zInternalNotes}
              renderItem={(item) => {
                let index = item.index;
                item = item.item;
                const isEditing = sEditingNoteId === item.id;
                return (
                  <View
                    style={{
                      width: "100%",
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: C.backgroundWhite,
                      marginBottom: 3,
                    }}
                  >
                    <View style={{ alignItems: "center", justifyContent: "center", flexDirection: "row", paddingTop: 2 }}>
                      <Tooltip text="Delete note" position="right">
                        <TouchableOpacity_
                          onPress={() => { deleteItem(item, index, "internal"); _setEditingNoteId(null); }}
                          style={{ padding: 2 }}
                        >
                          <Image_
                            icon={ICONS.trash}
                            size={14}
                            style={{ opacity: 0.35, filter: "grayscale(100%)" }}
                          />
                        </TouchableOpacity_>
                      </Tooltip>
                      <Tooltip text={formatNoteDate(item.createdAt)} position="right">
                        <Text
                          style={{
                            color: gray(.4),
                            padding: 2,
                            fontSize: 12,
                          }}
                        >
                          {item.name}
                        </Text>
                      </Tooltip>
                    </View>
                    {isEditing ? (
                      <TextInput_
                        multiline={true}
                        numberOfLines={10}
                        capitalize={true}
                        onChangeText={(val) =>
                          textChanged(val, index, "internal")
                        }
                        onBlur={() => _setEditingNoteId(null)}
                        style={{
                          padding: 2,
                          paddingLeft: 4,
                          lineHeight: 18,
                          outlineWidth: 0,
                          outlineStyle: "none",
                          borderWidth: 0,
                          flex: 1,
                          color: C.text,
                        }}
                        autoFocus={true}
                        value={item.value}
                      />
                    ) : (
                      <TouchableOpacity_
                        onPress={() => _setEditingNoteId(item.id)}
                        style={{ flex: 1, padding: 2, paddingLeft: 4, cursor: "text" }}
                      >
                        <Text
                          style={{
                            lineHeight: 18,
                            color: item.value ? C.text : gray(0.5),
                            fontSize: 14,
                          }}
                        >
                          {item.value || "Empty note"}
                        </Text>
                      </TouchableOpacity_>
                    )}
                  </View>
                );
              }}
            />
          </View>
        </View>
      </View>
    </View>
  );
}


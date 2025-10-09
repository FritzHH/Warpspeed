/* eslint-disable */
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableWithoutFeedback,
} from "react-native-web";
import { generateRandomID, gray } from "../../../utils";
import { Image_, TouchableOpacity_, TextInput_ } from "../../../components";
import { C, Colors, ICONS } from "../../../styles";
import { useState } from "react";
import { useOpenWorkordersStore, useLoginStore } from "../../../stores";

/// Notes Tab Component
export function Notes_MainComponent() {
  // setters /////////////////////////////////////////////////////////////////////

  // getters /////////////////////////////////////////////////////////////////////

  const EMPTY_NOTES = [];
  const zInternalNotes = useOpenWorkordersStore(
    (state) => {
      const workorder = state.workorders.find(
        (wo) => wo.id === state.openWorkorderID
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
      const workorder = state.workorders.find(
        (wo) => wo.id === state.openWorkorderID
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
  const zCurrentUser = useLoginStore((state) => state.getCurrentUser());
  const zOpenWorkorderID = useOpenWorkordersStore((s) => s.openWorkorderID);

  /////////////////////////////////////////////////////////////////////////////////
  const [customerNotesHeight, setCustomerNotesHeight] = useState([25]); // Initial height
  const [internalNotesHeight, setInternalNotesHeight] = useState([20]); // Initial height
  const [sFocusIdx, _setFocusIdx] = useState(null);

  function formatUserShowName() {
    return (
      "(" + zCurrentUser.first.toString() + " " + zCurrentUser.last[0] + ")  "
    );
  }

  function outsideClicked(option) {
    let notesArr;
    let fieldName;
    if (option == "customer") {
      notesArr = zCustomerNotes;
      fieldName = "customerNotes";
    } else {
      notesArr = zInternalNotes;
      fieldName = "internalNotes";
    }

    notesArr.unshift({
      name: formatUserShowName(),
      userID: zCurrentUser.id,
      value: "",
      id: generateRandomID(),
    });

    useOpenWorkordersStore.getState().setField(fieldName, notesArr);
  }

  function deleteItem(item, index, option) {
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

  const handleCustomerContentSizeChange = (event, index) => {
    // let arr = [];
    let ar = customerNotesHeight.map((h, idx) => {
      if (idx === index) {
        return event.nativeEvent.contentSize.height;
      }
      return h;
    });

    if (index > customerNotesHeight.length - 1) {
      ar.push(25);
    }

    setCustomerNotesHeight(ar);
  };

  const handleInternalContentSizeChange = (event, index) => {
    // let arr = [];
    let ar = internalNotesHeight.map((h, idx) => {
      if (idx === index) {
        return event.nativeEvent.contentSize.height;
      }
      return h;
    });

    if (index > internalNotesHeight.length - 1) {
      ar.push(25);
    }

    setInternalNotesHeight(ar);
  };

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
              Click Here
            </Text>
          </TouchableOpacity_>

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
                return (
                  <TouchableWithoutFeedback
                    onPress={() => _setFocusIdx(index)}
                    onLongPress={() => deleteItem(item, index, "customer")}
                  >
                    <View
                      style={{
                        width: "100%",
                        // paddingVertical: 3,
                        flexDirection: "row",
                        alignItems: "center",
                        borderRadius: 5,
                        backgroundColor: C.backgroundWhite,
                      }}
                    >
                      <Text
                        style={{
                          color: gray(.4),
                          padding: 2,
                          fontSize: 12,
                          // height: customerNotesHeight[index] || null,
                          outlineWidth: 0,
                        }}
                      >
                        {item.name}
                      </Text>
                      <TextInput_

                        multiline={true}
                        numberOfLines={10}
                        onChangeText={(val) =>
                          textChanged(val, index, "customer")
                        }
                        style={{
                          padding: 2,                            paddingLeft: 4,

                          height: customerNotesHeight[index] || null,
                          outlineWidth: 0,
                          width: "100%",
                          color: C.text
                        }}
                        autoFocus={index === sFocusIdx}
                        value={item.value}
                      />
                    </View>
                  </TouchableWithoutFeedback>
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
              Click Here
            </Text>
          </TouchableOpacity_>
          <TouchableWithoutFeedback onPress={() => outsideClicked("internal")}>
            <View
              style={{
                width: "100%",
                height: "100%",
                // backgroundColor: APP_BASE_COLORS.backgroundListWhite,
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
                  return (
                    <TouchableWithoutFeedback
                      onPress={() => _setFocusIdx(index)}
                      onLongPress={() => deleteItem(item, index, "internal")}
                    >
                      <View
                        style={{
                          width: "100%",
                          // paddingVertical: 3,
                          flexDirection: "row",
                          alignItems: "center",
                          backgroundColor: C.backgroundWhite,
                        }}
                      >
                        <Text
                          style={{
                            color: gray(.4),
                            padding: 2,
                            // height: internalNotesHeight[index] || null,
                            fontSize: 12
                          }}
                        >
                          {item.name}
                        </Text>
                        <TextInput_
                          multiline={true}
                          numberOfLines={10}
                          onChangeText={(val) =>
                            textChanged(val, index, "internal")
                          }
                          style={{
                            padding: 2,
                            paddingLeft: 4,
                            height: internalNotesHeight[index] || null,
                            outlineWidth: 0,
                            width: "100%",
                            color: C.text
                          }}
                          autoFocus={index === sFocusIdx}
                          value={item.value}
                        />
                      </View>
                    </TouchableWithoutFeedback>
                  );
                }}
              />
            </View>
          </TouchableWithoutFeedback>
        </View>
      </View>
    </View>
  );
}


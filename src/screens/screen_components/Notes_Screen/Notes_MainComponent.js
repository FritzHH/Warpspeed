/* eslint-disable */
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableWithoutFeedback,
} from "react-native-web";
import { generateRandomID } from "../../../utils";
import { Image_ } from "../../../components";
import { C, Colors, ICONS } from "../../../styles";
import { useState } from "react";
import { useOpenWorkordersStore, useLoginStore } from "../../../stores";

/// Notes Tab Component
export function Notes_MainComponent() {
  // setters /////////////////////////////////////////////////////////////////////
  const _zSetWorkorderObj = useOpenWorkordersStore(
    (state) => state.setWorkorder
  );
  const zCurrentUser = useLoginStore((state) => state.getCurrentUser());

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

  // const zInternalNotes = useOpenWorkordersStore(s => )

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

  return (
    <View
      style={{
        // justifySelf: "center",
        height: "100%",
        // borderRadius: 15,
        // shadowColor: APP_BASE_COLORS.green,
        // backgroundColor: APP_BASE_COLORS.backgroundWhite,
        // borderColor: APP_BASE_COLORS.buttonLightGreen,
        // borderWidth: 1,
        borderRadius: 15,
        // shadowOffset: {
        //   width: 2,
        //   height: 2,
        // },
        // shadowOpacity: 0.5,
        // shadowRadius: 15,
        // flexDirection: "row",
        // paddingTop: 5,
      }}
    >
      <View
        style={{
          paddingTop: 5,
          paddingHorizontal: 5,
          flexDirection: "row",
          // height: "100%",
          // flex: 1,

          // backgroundColor: "green",
        }}
      >
        <TouchableWithoutFeedback onPress={() => outsideClicked("customer")}>
          <View
            style={{
              width: "50%",
              height: "100%",
              flexDirection: "column",
              paddingRight: 10,
            }}
          >
            <TouchableWithoutFeedback
              onPress={() => outsideClicked("customer")}
            >
              <View
                style={{
                  flexDirection: "row",
                  width: "100%",
                  height: 40,
                  justifyContent: "flex-start",
                  alignItems: "center",
                  borderColor: C.buttonLightGreenOutline,
                  borderWidth: 1,
                  borderRadius: 15,
                  marginBottom: 5,
                }}
              >
                <Image_ icon={ICONS.notes} />
                <Text
                  style={{
                    fontSize: 15,
                    color: C.text,
                    fontWeight: "bold",
                    // marginBottom: 5,
                    marginLeft: 10,
                  }}
                >
                  {"Customer Notes"}
                </Text>
              </View>
            </TouchableWithoutFeedback>

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
                            padding: 2,
                            height: customerNotesHeight[index] || null,
                            outlineWidth: 0,
                            // width: "100%",
                          }}
                        >
                          {item.name}
                        </Text>
                        <TextInput
                          onContentSizeChange={(ev) =>
                            handleCustomerContentSizeChange(ev, index)
                          }
                          multiline={true}
                          // numberOfLines={5}
                          onChangeText={(val) =>
                            textChanged(val, index, "customer")
                          }
                          style={{
                            padding: 2,
                            height: customerNotesHeight[index] || null,
                            outlineWidth: 0,
                            width: "100%",
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
        </TouchableWithoutFeedback>
        {/* <View style={{ height: "100%", width: 1, backgroundColor: "gray" }} /> */}
        <View
          style={{
            width: "50%",
            height: "100%",
            flexDirection: "column",
            // paddingLeft: 10,
          }}
        >
          <TouchableWithoutFeedback onPress={() => outsideClicked("internal")}>
            <View
              style={{
                flexDirection: "row",
                width: "100%",
                height: 40,
                justifyContent: "flex-start",
                alignItems: "center",
                borderColor: C.buttonLightGreenOutline,
                borderWidth: 1,
                borderRadius: 15,
                marginBottom: 5,
                paddingHorizontal: 3,
              }}
            >
              <Image_ icon={ICONS.gears1} />
              <Text
                style={{
                  marginLeft: 10,
                  fontSize: 15,
                  color: C.text,
                  fontWeight: "bold",
                }}
              >
                {"Internal Notes"}
              </Text>
            </View>
          </TouchableWithoutFeedback>
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
                            padding: 2,
                            height: internalNotesHeight[index] || null,
                          }}
                        >
                          {item.name}
                        </Text>
                        <TextInput
                          onContentSizeChange={(ev) =>
                            handleInternalContentSizeChange(ev, index)
                          }
                          multiline={true}
                          // numberOfLines={5}
                          onChangeText={(val) =>
                            textChanged(val, index, "internal")
                          }
                          style={{
                            padding: 2,
                            height: internalNotesHeight[index] || null,
                            outlineWidth: 0,
                            width: "100%",
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

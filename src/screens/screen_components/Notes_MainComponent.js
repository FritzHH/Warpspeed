import {
  View,
  Text,
  Pressable,
  TextInput,
  FlatList,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from "react-native-web";
import { dim, log, trimToTwoDecimals } from "../../utils";
import {
  HorzSpacer,
  TabMenuButton,
  TabMenuDivider as Divider,
  ModalDropdown,
  TextInputOnMainBackground,
  TextInputLabelOnMainBackground,
} from "../../components";
import { Colors } from "../../styles";
import { useState } from "react";
import { cloneDeep } from "lodash";

/// Notes Tab Component

let name = "(Fritz) ";
let notesArr = [];
let notesObj = { name: "", val: "", time: "" };
notesArr[0] = {
  ...notesObj,
  name: "Fritz",
  val: name + "hello sir",
  time: new Date().getTime(),
};
notesArr[1] = {
  ...notesObj,
  name: "Fritz",
  val: name + "gday sir",
  time: new Date().getTime(),
};
export const Notes_MainComponent = ({
  ssCurrentUser,
  ssWorkorderObj,
  __setWorkorderObj,
}) => {
  // log("workorder", ssWorkorderObj);
  const [customerNotesHeight, setCustomerNotesHeight] = useState([25]); // Initial height
  const [internalNotesHeight, setInternalNotesHeight] = useState([20]); // Initial height
  // log("ss", ssWorkorderObj);
  function customerOutsideClicked() {
    let notesArr = ssWorkorderObj.notes.customerNotes;
    notesArr.push({ ...notesObj, name: name, val: name });
    ssWorkorderObj.notes.customerNotes = notesArr;
    __setWorkorderObj(ssWorkorderObj);
  }

  function deleteCustomerItem(item, index) {
    // log("deleting", index);
    let arr = ssWorkorderObj.notes.customerNotes.filter(
      (item, index1) => index != index1
    );
    ssWorkorderObj.notes.customerNotes = arr;
    __setWorkorderObj(ssWorkorderObj);
    // let arr = ssWorkorderObj
  }

  function customerTextChanged(newVal, index) {
    // log("incoming", newVal);
    let prevItem = ssWorkorderObj.notes.customerNotes[index];
    if (
      newVal.length > prevItem.val.length &&
      newVal.startsWith(prevItem.val)
    ) {
      // log("added");
      prevItem.val = newVal;
    } else if (
      newVal.length < prevItem.val.length &&
      prevItem.val.startsWith(newVal)
    ) {
      if (!newVal.startsWith("(" + ssCurrentUser.first + ") ")) {
        prevItem.val = "(" + ssCurrentUser.first + ") ";
      } else {
        prevItem.val = newVal;
      }
    }

    __setWorkorderObj(ssWorkorderObj);
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

  function internalOutsideClicked() {
    let notesArr = ssWorkorderObj.notes.internalNotes;
    notesArr.push({ ...notesObj, name: name, val: name });
    ssWorkorderObj.notes.internalNotes = notesArr;
    __setWorkorderObj(ssWorkorderObj);
  }

  function deleteInternalItem(item, index) {
    // log("deleting", index);
    let arr = ssWorkorderObj.notes.internalNotes.filter(
      (item, index1) => index != index1
    );
    ssWorkorderObj.notes.internalNotes = arr;
    __setWorkorderObj(ssWorkorderObj);
    // let arr = ssWorkorderObj
  }

  function internalTextChanged(newVal, index) {
    // log("incoming", newVal);
    let prevItem = ssWorkorderObj.notes.internalNotes[index];
    if (
      newVal.length > prevItem.val.length &&
      newVal.startsWith(prevItem.val)
    ) {
      // log("added");
      prevItem.val = newVal;
    } else if (
      newVal.length < prevItem.val.length &&
      prevItem.val.startsWith(newVal)
    ) {
      if (!newVal.startsWith("(" + ssCurrentUser.first + ") ")) {
        prevItem.val = "(" + ssCurrentUser.first + ") ";
      } else {
        prevItem.val = newVal;
      }
    }

    __setWorkorderObj(ssWorkorderObj);
  }

  return (
    <View style={{ width: "100%", height: "100%", paddingTop: 20 }}>
      {ssWorkorderObj.id && (
        <View
          style={{
            flexDirection: "row",
            width: "100%",
            height: "100%",
          }}
        >
          <TouchableWithoutFeedback onPress={() => customerOutsideClicked()}>
            <View
              style={{
                width: "50%",
                height: "100%",
                backgroundColor: null,
                flexDirection: "column",
                paddingRight: 10,
              }}
            >
              <View>
                <Text style={{ color: "lightgray" }}>Customer Notes</Text>
              </View>

              <FlatList
                keyExtractor={(i, idx) => idx}
                data={ssWorkorderObj.notes.customerNotes}
                renderItem={(item) => {
                  let index = item.index;
                  item = item.item;
                  return (
                    <TouchableWithoutFeedback
                      onLongPress={() => deleteCustomerItem(item, index)}
                    >
                      <View style={{ width: "100%", paddingVertical: 3 }}>
                        <TextInput
                          onContentSizeChange={(ev) =>
                            handleCustomerContentSizeChange(ev, index)
                          }
                          multiline={true}
                          onChangeText={(val) =>
                            customerTextChanged(val, index)
                          }
                          style={{
                            padding: 2,
                            height: customerNotesHeight[index] || 20,
                            backgroundColor: "rgba(0, 0, 0, 0.05)",
                            outlineWidth: 0,
                          }}
                          autoFocus={
                            index ===
                            ssWorkorderObj.notes.customerNotes.length - 1
                          }
                          value={item.val}
                        />
                      </View>
                    </TouchableWithoutFeedback>
                  );
                }}
              />
            </View>
          </TouchableWithoutFeedback>
          <View
            style={{
              width: "50%",
              height: "100%",
              backgroundColor: null,
              flexDirection: "column",
              borderLeftWidth: 1,
              borderColor: "lightgray",
              paddingLeft: 10,
            }}
          >
            <View>
              <Text
                style={{
                  color: "lightgray",
                }}
              >
                Internal Notes
              </Text>
            </View>
            <TouchableWithoutFeedback onPress={() => internalOutsideClicked()}>
              <View
                style={{
                  width: "100%",
                  height: "100%",
                  backgroundColor: null,
                  flexDirection: "column",
                  paddingRight: 10,
                }}
              >
                <FlatList
                  keyExtractor={(i, idx) => idx}
                  data={ssWorkorderObj.notes.internalNotes}
                  renderItem={(item) => {
                    let index = item.index;
                    item = item.item;
                    return (
                      <TouchableWithoutFeedback
                        onLongPress={() => deleteInternalItem(item, index)}
                      >
                        <View style={{ width: "100%", paddingVertical: 3 }}>
                          <TextInput
                            onContentSizeChange={(ev) =>
                              handleInternalContentSizeChange(ev, index)
                            }
                            multiline={true}
                            onChangeText={(val) =>
                              internalTextChanged(val, index)
                            }
                            style={{
                              padding: 2,
                              height: internalNotesHeight[index] || 20,
                              backgroundColor: "rgba(0, 0, 0, 0.05)",
                              outlineWidth: 0,
                            }}
                            autoFocus={
                              index ===
                              ssWorkorderObj.notes.internalNotes.length - 1
                            }
                            value={item.val}
                          />
                        </View>
                      </TouchableWithoutFeedback>
                    );
                  }}
                />
              </View>
            </TouchableWithoutFeedback>
          </View>
          {/* </View> */}
        </View>
      )}
    </View>
  );
};

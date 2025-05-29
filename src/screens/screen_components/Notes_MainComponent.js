/* eslint-disable */

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
import { useCurrentUserStore, useCurrentWorkorderStore } from "../../stores";
import { WORKORDER_PROTO } from "../../data";
import { dbSetOpenWorkorderItem } from "../../db_calls";

/// Notes Tab Component
export function Notes_MainComponent() {
  const zCurrentUser = useCurrentUserStore((state) => state.getCurrentUser());
  const zWorkorderObj = useCurrentWorkorderStore((state) =>
    state.getWorkorderObj()
  );
  ///
  const _zSetWorkorderObj = useCurrentWorkorderStore(
    (state) => state.setWorkorderObj
  );

  if (!zWorkorderObj.customerNotes)
    _zSetWorkorderObj({ ...zWorkorderObj, customerNotes: [] });
  if (!zWorkorderObj.internalNotes)
    _zSetWorkorderObj({ ...zWorkorderObj, internalNotes: [] });
  /////////////////////////////////////////////////////////////////////////////////
  const [customerNotesHeight, setCustomerNotesHeight] = useState([25]); // Initial height
  const [internalNotesHeight, setInternalNotesHeight] = useState([20]); // Initial height
  // log(zWorkorderObj);
  function customerOutsideClicked() {
    let newObj = { ...zWorkorderObj };
    let notesArr = newObj.customerNotes;
    notesArr.push("");
    newObj.customerNotes = notesArr;
    _zSetWorkorderObj(newObj);
    dbSetOpenWorkorderItem(newObj);
  }

  function deleteCustomerItem(item, index) {
    let newObj = { ...zWorkorderObj };
    let arr = zWorkorderObj.customerNotes.filter(
      (item, index1) => index != index1
    );
    newObj.customerNotes = arr;
    _zSetWorkorderObj(newObj);
    dbSetOpenWorkorderItem(newObj);
  }

  function customerTextChanged(newVal, index) {
    let newObj = { ...zWorkorderObj };
    let prevItem = newObj.customerNotes[index];
    if (newVal.length > prevItem.length && newVal.startsWith(prevItem)) {
      // log("added");
      prevItem = newVal;
    } else if (newVal.length < prevItem.length && prevItem.startsWith(newVal)) {
      if (!newVal.startsWith("(" + zCurrentUser.first + ") ")) {
        prevItem = "(" + zCurrentUser.first + ") ";
      } else {
        prevItem = newVal;
      }
    }
    newObj.customerNotes[index] = prevItem;
    _zSetWorkorderObj(newObj);
    dbSetOpenWorkorderItem(newObj);
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
    let newObj = { ...zWorkorderObj };
    let notesArr = newObj.internalNotes;
    notesArr.push("");
    newObj.internalNotes = notesArr;
    _zSetWorkorderObj(newObj);
    dbSetOpenWorkorderItem(newObj);
  }

  function deleteInternalItem(item, index) {
    // log("deleting", index);
    let newObj = { ...zWorkorderObj };
    let arr = newObj.internalNotes.filter((item, index1) => index != index1);
    newObj.internalNotes = arr;
    _zSetWorkorderObj(newObj);
    dbSetOpenWorkorderItem(newObj);

    // let arr = zWorkorderObj
  }

  function internalTextChanged(newVal, index) {
    // log("incoming", newVal);
    let newObj = { ...zWorkorderObj };
    let prevItem = newObj.internalNotes[index];
    if (newVal.length > prevItem.length && newVal.startsWith(prevItem)) {
      // log("added");
      prevItem = newVal;
    } else if (newVal.length < prevItem.length && prevItem.startsWith(newVal)) {
      if (!newVal.startsWith("(" + zCurrentUser.first + ") ")) {
        prevItem.val = "(" + zCurrentUser.first + ") ";
      } else {
        prevItem = newVal;
      }
    }
    newObj.internalNotes[index] = prevItem;

    _zSetWorkorderObj(newObj);
    dbSetOpenWorkorderItem(newObj);
  }

  if (!zWorkorderObj.id) return null;
  return (
    <View style={{ width: "100%", height: "100%", paddingTop: 20 }}>
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
              <Text style={{ color: "lightgray" }}>{"Customer Notes"}</Text>
            </View>

            <FlatList
              keyExtractor={(i, idx) => idx}
              data={zWorkorderObj.customerNotes}
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
                        onChangeText={(val) => customerTextChanged(val, index)}
                        style={{
                          padding: 2,
                          height: customerNotesHeight[index] || 20,
                          backgroundColor: "rgba(0, 0, 0, 0.05)",
                          outlineWidth: 0,
                        }}
                        autoFocus={
                          index === zWorkorderObj.customerNotes.length - 1
                        }
                        value={item}
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
              {"Internal Notes"}
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
                data={zWorkorderObj.internalNotes}
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
                            index === zWorkorderObj.internalNotes.length - 1
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
      </View>
    </View>
  );
}

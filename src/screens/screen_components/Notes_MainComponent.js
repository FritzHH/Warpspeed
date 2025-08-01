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
import {
  clog,
  dim,
  generateRandomID,
  log,
  trimToTwoDecimals,
} from "../../utils";
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
import {
  useAppCurrentUserStore,
  useCurrentWorkorderStore,
  useLoginStore,
} from "../../stores";
import { WORKORDER_PROTO } from "../../data";
import { dbSetOpenWorkorderItem } from "../../db_call_wrapper";

/// Notes Tab Component
export function Notes_MainComponent() {
  // setters /////////////////////////////////////////////////////////////////////
  const _zSetWorkorderObj = useCurrentWorkorderStore(
    (state) => state.setWorkorderObj
  );
  const zCurrentUserObj = useLoginStore((state) => state.getCurrentUserObj());
  const _zExecute = useLoginStore((state) => state.execute);

  // getters /////////////////////////////////////////////////////////////////////
  const zWorkorderObj = useCurrentWorkorderStore((state) =>
    state.getWorkorderObj()
  );

  /////////////////////////////////////////////////////////////////////////////////
  const [customerNotesHeight, setCustomerNotesHeight] = useState([25]); // Initial height
  const [internalNotesHeight, setInternalNotesHeight] = useState([20]); // Initial height
  const [sFocusIdx, _setFocusIdx] = useState(null);

  function formatUserShowName() {
    return (
      "(" +
      zCurrentUserObj.first.toString() +
      " " +
      zCurrentUserObj.last[0] +
      ")  "
    );
  }

  function outsideClicked(option) {
    let wo = cloneDeep(zWorkorderObj);
    let notesArr;
    if (option == "customer") {
      notesArr = wo.customerNotes || [];
    } else {
      notesArr = wo.internalNotes || [];
    }

    notesArr.unshift({
      name: formatUserShowName(),
      userID: zCurrentUserObj.id,
      value: "",
      id: generateRandomID(),
    });
    if (option === "customer") {
      wo.customerNotes = notesArr;
    } else {
      wo.internalNotes = notesArr;
    }

    _setFocusIdx(0);
    _zSetWorkorderObj(wo);
    dbSetOpenWorkorderItem(wo);
  }

  function deleteItem(item, index, option) {
    let newObj = cloneDeep(zWorkorderObj);
    let arr;
    if (option == "customer") {
      arr = zWorkorderObj.customerNotes;
    } else {
      arr = zWorkorderObj.internalNotes;
    }
    arr = arr.filter((o) => o.id != item.id);
    if (option == "customer") {
      newObj.customerNotes = arr;
    } else {
      newObj.internalNotes = arr;
    }
    _zSetWorkorderObj(newObj);
    dbSetOpenWorkorderItem(newObj);
  }

  function textChanged(value, index, option) {
    let wo = cloneDeep(zWorkorderObj);
    let item;
    if (option === "customer") {
      item = wo.customerNotes;
    } else {
      item = wo.internalNotes;
    }
    let line = item[index];
    line.value = value;
    item[index] = line;

    if (option === "customer") {
      wo.customerNotes = item;
    } else {
      wo.internalNotes = item;
    }
    _zSetWorkorderObj(wo);
    dbSetOpenWorkorderItem(wo);
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
  if (!zWorkorderObj) return null;

  return (
    <View style={{ width: "100%", height: "100%", paddingTop: 20 }}>
      <View
        style={{
          flexDirection: "row",
          width: "100%",
          height: "100%",
        }}
      >
        <TouchableWithoutFeedback onPress={() => outsideClicked("customer")}>
          <View
            style={{
              width: "50%",
              height: "100%",
              backgroundColor: null,
              flexDirection: "column",
              paddingRight: 10,
            }}
          >
            <TouchableWithoutFeedback
              onPress={() => outsideClicked("customer")}
            >
              <View
                style={{ width: "100%", height: 40, justifyContent: "center" }}
              >
                <Text style={{ color: "lightgray", marginBottom: 5 }}>
                  {"Customer Notes"}
                </Text>
              </View>
            </TouchableWithoutFeedback>

            <View style={{ height: "100%" }}>
              <FlatList
                keyExtractor={(i, idx) => idx}
                data={zWorkorderObj.customerNotes}
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
                        }}
                      >
                        <Text
                          style={{
                            padding: 2,
                            height: customerNotesHeight[index] || null,
                            backgroundColor: "rgba(0, 0, 0, 0.03)",
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
                            backgroundColor: "rgba(0, 0, 0, 0.03)",
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
          <TouchableWithoutFeedback onPress={() => outsideClicked("internal")}>
            <View
              style={{ width: "100%", height: 40, justifyContent: "center" }}
            >
              <Text style={{ color: "lightgray", marginBottom: 5 }}>
                {"Internal Notes"}
              </Text>
            </View>
          </TouchableWithoutFeedback>
          <TouchableWithoutFeedback onPress={() => outsideClicked("internal")}>
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
                      onPress={() => _setFocusIdx(index)}
                      onLongPress={() => deleteItem(item, index, "internal")}
                    >
                      <View
                        style={{
                          width: "100%",
                          // paddingVertical: 3,
                          flexDirection: "row",
                          alignItems: "center",
                        }}
                      >
                        <Text
                          style={{
                            padding: 2,
                            height: internalNotesHeight[index] || null,
                            backgroundColor: "rgba(0, 0, 0, 0.03)",
                            outlineWidth: 0,
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
                            backgroundColor: "rgba(0, 0, 0, 0.03)",
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

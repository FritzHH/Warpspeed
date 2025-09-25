/* eslint-disable */

import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableWithoutFeedback,
} from "react-native-web";
import {
  clog,
  dim,
  generateRandomID,
  log,
  trimToTwoDecimals,
} from "../../../utils";
import { Image_ } from "../../../components";
import { C, Colors, ICONS } from "../../../styles";
import { useState } from "react";
import { cloneDeep } from "lodash";
import { useOpenWorkordersStore, useLoginStore } from "../../../stores";
import { dbSetWorkorder } from "../../../db_call_wrapper";

/// Notes Tab Component
export function Notes_MainComponent() {
  // setters /////////////////////////////////////////////////////////////////////
  const _zSetWorkorderObj = useOpenWorkordersStore(
    (state) => state.setWorkorder
  );
  const zCurrentUser = useLoginStore((state) => state.getCurrentUser());
  const _zExecute = useLoginStore((state) => state.execute);

  // getters /////////////////////////////////////////////////////////////////////
  const zOpenWorkorder = useOpenWorkordersStore((state) =>
    state.getOpenWorkorder()
  );

  /////////////////////////////////////////////////////////////////////////////////
  const [customerNotesHeight, setCustomerNotesHeight] = useState([25]); // Initial height
  const [internalNotesHeight, setInternalNotesHeight] = useState([20]); // Initial height
  const [sFocusIdx, _setFocusIdx] = useState(null);

  function formatUserShowName() {
    return (
      "(" +
      zCurrentUser.first.toString() +
      " " +
      zCurrentUser.last[0] +
      ")  "
    );
  }

  function outsideClicked(option) {
    let wo = cloneDeep(zOpenWorkorder);
    let notesArr;
    if (option == "customer") {
      notesArr = wo.customerNotes || [];
    } else {
      notesArr = wo.internalNotes || [];
    }

    notesArr.unshift({
      name: formatUserShowName(),
      userID: zCurrentUser.id,
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
    // ''(wo);
  }

  function deleteItem(item, index, option) {
    let newObj = cloneDeep(zOpenWorkorder);
    let arr;
    if (option == "customer") {
      arr = zOpenWorkorder.customerNotes;
    } else {
      arr = zOpenWorkorder.internalNotes;
    }
    arr = arr.filter((o) => o.id != item.id);
    if (option == "customer") {
      newObj.customerNotes = arr;
    } else {
      newObj.internalNotes = arr;
    }
    _zSetWorkorderObj(newObj);
    // ''(newObj);
  }

  function textChanged(value, index, option) {
    let wo = cloneDeep(zOpenWorkorder);
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
  if (!zOpenWorkorder) return null;

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
                    color: C.textMain,
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
                data={zOpenWorkorder.customerNotes}
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
                  color: C.textMain,
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
                data={zOpenWorkorder.internalNotes}
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

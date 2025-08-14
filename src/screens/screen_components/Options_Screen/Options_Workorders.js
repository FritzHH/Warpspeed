/* eslint-disable */
import { View, Text, FlatList, TouchableOpacity } from "react-native-web";
import {
  clog,
  dim,
  getDisplayFormatDateTime,
  getWordDayOfWeek,
  log,
  trimToTwoDecimals,
  useInterval,
} from "../../../utils";
import { TabMenuDivider as Divider, CheckBox } from "../../../components";
import { Colors } from "../../../styles";
import { TAB_NAMES } from "../../../data";
import React, { useEffect, useRef, useState } from "react";
import { cloneDeep } from "lodash";
import {
  useCurrentCustomerStore,
  useCustMessagesStore,
  useOpenWorkordersStore,
  useSettingsStore,
  useTabNamesStore,
  useWorkorderPreviewStore,
} from "../../../stores";
import {
  dbGetCustomerObj,
  dbSetOpenWorkorderItem,
} from "../../../db_call_wrapper";
import { messagesSubscribe } from "../../../db_subscription_wrapper";
import { getDatabase } from "firebase/database";

export function WorkordersComponent({}) {
  // getters ///////////////////////////////////////////////////////
  const zOpenWorkordersArr = useOpenWorkordersStore((state) =>
    state.getWorkorderArr()
  );
  const zSettingsObj = useSettingsStore((state) => state.getSettingsObj());
  const zOpenWorkorder = useOpenWorkordersStore((state) =>
    state.getWorkorderObj()
  );

  // setters ////////////////////////////////////////////////////////
  const _zSetIncomingMessage = useCustMessagesStore(
    (state) => state.setIncomingMessage
  );
  const _zSetOutgoingMessage = useCustMessagesStore(
    (state) => state.setOutgoingMessage
  );
  const _zSetCurrentWorkorderIdx = useOpenWorkordersStore(
    (state) => state.setOpenWorkorderIdx
  );
  const _zSetPreviewObj = useWorkorderPreviewStore(
    (state) => state.setPreviewObj
  );
  const _zSetCurrentCustomer = useCurrentCustomerStore(
    (state) => state.setCustomerObj
  );
  const _zSetItemsTabName = useTabNamesStore((state) => state.setItemsTabName);
  const _zSetOptionsTabName = useTabNamesStore(
    (state) => state.setOptionsTabName
  );
  const _zSetInfoTabName = useTabNamesStore((state) => state.setInfoTabName);
  const _zModOpenWorkorderArrItem = useOpenWorkordersStore(
    (state) => state.modItem
  );
  const _zSetWorkorder = useOpenWorkordersStore(
    (state) => state.setWorkorderObj
  );

  ///////////////////////////////////////////////////////////////////////////////////
  const [sAllowPreview, _setAllowPreview] = useState(true);
  const [sDotColorObj, _setDotColorObj] = useState({});

  useEffect(() => {
    let day = 86400000; // millis in day
    let hour = 3600000;
    const intervalId = setInterval(() => {
      let todayWord = getWordDayOfWeek();
      let nowMillis = new Date().getTime();
      let tomorrowWord = getWordDayOfWeek(nowMillis + day);
      let twodaysagoMillis = new Date(nowMillis - day * 2 + hour * 3);
      let onedayagomillis = new Date(nowMillis - day + hour * 3);
      let threedaysagoMillis = new Date(nowMillis - day * 3 + hour * 3);
      let fivedaysagoMillis = new Date(nowMillis - day * 5 + hour * 3);

      let colorsObj = cloneDeep(sDotColorObj);
      zOpenWorkordersArr.forEach((wo) => {
        let startedOnMillis = Number(wo.startedOnMillis);
        //testing
        // startedOnMillis = Number(threedaysagoMillis);

        let diffMillis = nowMillis - startedOnMillis;
        let diffHours = diffMillis / hour;

        let maxWaitMillis = Number(wo.waitTime?.maxWaitTimeDays * day);
        // if (!maxWaitMillis ) return;
        let dayEndWord = getWordDayOfWeek(startedOnMillis + maxWaitMillis);

        // log("start day", getWordDayOfWeek(startedOnMillis));
        // log("wait days", wo.waitTime.maxWaitTimeDays);
        // log("day end", dayEndWord);

        let color;
        // log("label", wo.waitTime.label);
        if (wo.waitTime.label == "Waiting" || wo.waitTime.label == "Today") {
          if (colorsObj[wo.id] == "red") {
            color = null;
          } else {
            color = "red";
          }
        } else if (dayEndWord == todayWord) {
          color = "red";
        } else if (dayEndWord == tomorrowWord) {
          color = "yellow";
        }
        colorsObj[wo.id] = color;
      });
      _setDotColorObj(colorsObj);
    }, 750);

    return () => {
      clearInterval(intervalId);
    };
  }, [zOpenWorkordersArr, sDotColorObj]);

  ///////////////////////////////////////////////////////////////////////////////////
  ///////////////////////////////////////////////////////////////////////////////////

  function workorderSelected(obj) {
    // log("obj", obj);
    obj = cloneDeep(obj);
    dbGetCustomerObj(obj.customerID).then((custObj) => {
      // log("cust obj", custObj);
      _zSetCurrentCustomer(custObj);
    });
    _zSetWorkorder(obj);

    _zSetInfoTabName(TAB_NAMES.infoTab.workorder);
    _zSetItemsTabName(TAB_NAMES.itemsTab.workorderItems);
    _zSetOptionsTabName(TAB_NAMES.optionsTab.quickItems);
    _zSetPreviewObj(null);
    // messagesSubscribe(
    //   obj.customerID,
    //   _zSetIncomingMessage,
    //   _zSetOutgoingMessage
    // );
  }

  function sortWorkorders(inputArr) {
    let finalArr = [];
    zSettingsObj.statuses.forEach((status) => {
      let arr = [];
      zOpenWorkordersArr.forEach((wo) => {
        if (wo.status.label == status.label) arr.push(wo);
      });
      arr.sort((a, b) => a.startedOnMillis - b.startedOnMillis);
    });
  }

  // clog(zOpenWorkordersArr);
  const [sLastHoverInsideMillis, _setLastHoverInsideMilles] = useState(
    new Date().getTime() * 2
  );
  return (
    <View
      style={{
        flex: 1,
      }}
    >
      <View
        style={{
          height: "4%",
          // backgroundColor: "blue",
          paddingVertical: 5,
          justifyContent: "flex-end",
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <CheckBox
          isChecked={sAllowPreview}
          onCheck={() => _setAllowPreview(!sAllowPreview)}
          viewStyle={{ alignSelf: "flex-end" }}
          text={"Preview On"}
          buttonStyle={{
            width: 15,
            height: 15,
            marginRight: 20,
            borderWidth: 1,
            borderColor: "transparent",
          }}
          outerButtonStyle={{}}
          textStyle={{ color: "dimgray", marginRight: 10 }}
        />
      </View>

      <FlatList
        style={{
          width: "100%",
          height: "96%",
          backgroundColor: null,
          paddingHorizontal: 5,
        }}
        data={zOpenWorkordersArr}
        keyExtractor={(item, index) => index}
        ItemSeparatorComponent={() => (
          <View style={{ height: 1, backgroundColor: "gray", width: "100%" }} />
        )}
        renderItem={(item) => {
          let workorder = item.item;
          return (
            <View>
              <TouchableOpacity
                onLongPress={() => deleteWorkorder(workorder)}
                onMouseOver={() => {
                  if (!sAllowPreview) return;
                  _zSetPreviewObj(workorder);
                }}
                onMouseLeave={() => {
                  if (!sAllowPreview) return;
                  _zSetPreviewObj(null);
                }}
                onPress={() => {
                  workorderSelected(workorder);
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    width: "100%",
                    // backgroundColor: "green",
                    marginTop: 4,
                  }}
                >
                  <View
                    style={{
                      marginVertical: 5,
                      flexDirection: "row",
                      width: "75%",
                    }}
                  >
                    <Text style={{ marginRight: 10 }}>
                      {workorder.brand || "Brand"}
                    </Text>
                    <Text>{workorder.description || "Descripion"}</Text>
                  </View>
                  <View
                    style={{
                      width: "25%",
                      justifyContent: "flex-end",
                      alignItems: "center",
                      flexDirection: "row",
                      // backgroundColor: "green",
                    }}
                  >
                    <View style={{ alignItems: "flex-end", paddingRight: 20 }}>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            color: "gray",
                          }}
                        >
                          {"Status:  "}
                        </Text>
                        <Text style={{ fontSize: 14 }}>
                          {workorder.status.label}
                        </Text>
                      </View>
                      <View
                        style={{ flexDirection: "row", alignItems: "center" }}
                      >
                        <Text style={{ color: "gray", fontSize: 13 }}>
                          {getDisplayFormatDateTime(workorder.startedOnMillis)}
                        </Text>
                        <View
                          style={{
                            // width: 1,
                            // height: 10,
                            backgroundColor: "black",
                            marginHorizontal: 4,
                          }}
                        />
                        <Text style={{ color: "black", fontSize: 13 }}>
                          {workorder.waitTime.label}
                        </Text>
                      </View>
                    </View>
                    <View
                      style={{
                        backgroundColor: sDotColorObj[workorder.id],
                        width: 13,
                        height: 13,
                        borderRadius: 100,
                      }}
                    />
                  </View>
                </View>
              </TouchableOpacity>
            </View>
          );
        }}
      />
    </View>
  );
}

// function RowItemComponent({
//   backgroundColor,
//   workorder,
//   ssAllowPreview,
//   onWorkorderSelected,
//   deleteWorkorder,
//   _zSetPreviewObj,
// }) {
//   const [sLastHoverInsideMillis, _setLastHoverInsideMilles] = useState(
//     new Date().getTime() * 2
//   );
//   // log("item", workorder);
//   /////////////////////////////////////////////////////////////
//   //////////////////////////////////////////////////////////
//   return (

//   );
// }

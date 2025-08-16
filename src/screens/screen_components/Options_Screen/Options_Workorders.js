/* eslint-disable */
import { View, Text, FlatList, TouchableOpacity } from "react-native-web";
import {
  capitalizeFirstLetterOfString,
  clog,
  dim,
  getDisplayFormatDateTime,
  getWordDayOfWeek,
  getWordMonth,
  log,
  trimToTwoDecimals,
  useInterval,
} from "../../../utils";
import { TabMenuDivider as Divider, CheckBox } from "../../../components";
import { Colors } from "../../../styles";
import { TAB_NAMES } from "../../../data";
import React, { useEffect, useRef, useState } from "react";
import { cloneDeep, sortBy } from "lodash";
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

const numMillisInDay = 86400000; // millis in day
const numMillisOneWeek = numMillisInDay * 7;
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
  const [sItemOptions, _setItemOptions] = useState({});

  useEffect(() => {
    let hour = 3600000;
    const intervalId = setInterval(() => {
      let colorsObj = cloneDeep(sItemOptions);
      let nowMillis = Number(new Date().getTime());
      let todayWord = getWordDayOfWeek();
      let tomorrowWord = getWordDayOfWeek(nowMillis + numMillisInDay);
      let nextDayWord = getWordDayOfWeek(nowMillis + numMillisInDay * 2);

      /////////////////////////////////////////////////////
      zOpenWorkordersArr.forEach((wo) => {
        const startedOnMillis = Number(wo.startedOnMillis);
        const maxWaitMillis = Number(
          wo.waitTime?.maxWaitTimeDays * numMillisInDay
        );
        const endDayMillis = startedOnMillis + maxWaitMillis;
        const dayEndWord = getWordDayOfWeek(startedOnMillis + maxWaitMillis);

        let waitEndMonthWord = getWordMonth(endDayMillis);
        let todayMonthWord = getWordMonth(nowMillis);

        // check to see if the due day word is same week or upcoming weeks
        let isDueWithin7Days = true;
        if (
          Math.ceil((endDayMillis - nowMillis) / numMillisInDay) >= 7 ||
          waitEndMonthWord != todayMonthWord
        ) {
          isDueWithin7Days = false;
        }

        // check to see if past due
        let isPastDue = false;
        if (
          Number(startedOnMillis + maxWaitMillis) < nowMillis &&
          todayWord != dayEndWord
        )
          isPastDue = true;

        let optionsObj = {
          color: null,
          waitEndDay: maxWaitMillis && isDueWithin7Days ? dayEndWord : "",
        };

        //////////////////////////
        if (wo.waitTime.label == "Waiting" || wo.waitTime.label == "Today") {
          optionsObj.waitEndDay = "Today";
          if (colorsObj[wo.id]?.color == "red") {
            optionsObj.color = null;
          } else {
            optionsObj.color = "red";
          }
        } else if (isPastDue) {
          if (colorsObj[wo.id]?.color == "pink") {
            optionsObj.color = null;
          } else {
            optionsObj.color = "pink";
          }
          optionsObj.waitEndDay = "PAST DUE";
        } else if (dayEndWord == todayWord && isDueWithin7Days) {
          optionsObj.color = "red";
          optionsObj.waitEndDay = dayEndWord;
        } else if (dayEndWord == tomorrowWord && isDueWithin7Days) {
          optionsObj.waitEndDay = dayEndWord;
          optionsObj.color = "yellow";
        } else if (dayEndWord == nextDayWord && isDueWithin7Days) {
          optionsObj.waitEndDay = dayEndWord;
          optionsObj.color = "green";
        }
        colorsObj[wo.id] = optionsObj;
      });
      ////////////////////////////////////////////////////////

      _setItemOptions(colorsObj);
    }, 750);

    return () => {
      clearInterval(intervalId);
    };
  }, [zOpenWorkordersArr, sItemOptions]);

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
    let nowMillis = new Date().getTime();
    zSettingsObj?.statuses?.forEach((status) => {
      let arr = [];
      inputArr.forEach((wo) => {
        const startedOnMillis = Number(wo.startedOnMillis);
        const maxWaitMillis = Number(
          wo.waitTime?.maxWaitTimeDays * numMillisInDay
        );
        if (wo.status.label == status.label) arr.push(wo);
      });

      // arr = sortBy(arr, "waitTime.maxWaitTimeDays");
      arr = sortBy(arr, (wo) => {
        let millisToCompletion =
          wo.startedOnMillis +
          wo.waitTime?.maxWaitTimeDays * numMillisInDay -
          nowMillis;
        return millisToCompletion;
      });

      finalArr = [...finalArr, ...arr];
    });
    return finalArr;
  }

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
        data={sortWorkorders(zOpenWorkordersArr)}
        keyExtractor={(item, index) => index}
        ItemSeparatorComponent={() => (
          <View style={{ height: 1, backgroundColor: "gray", width: "100%" }} />
        )}
        renderItem={(item) => {
          // if (!item.item.id) {
          //   return (
          //     <View style={{ width: "100%" }}>
          //       <Text>{"Status"}</Text>
          //       <Text>{"Status"}</Text>
          //     </View>
          //   );
          // }

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
                      width: "65%",
                    }}
                  >
                    <Text style={{ marginRight: 10 }}>
                      {workorder.brand || "Brand"}
                    </Text>
                    <Text>{workorder.description}</Text>
                  </View>
                  <View
                    style={{
                      width: "35%",
                      justifyContent: "flex-end",
                      alignItems: "center",
                      flexDirection: "row",
                      // backgroundColor: "green",
                    }}
                  >
                    {/* <View style={{ alignItems: "flex-end", paddingRight: 20 }}> */}
                    <View
                      style={{
                        flexDirection: "column",
                        alignItems: "flex-end",
                        justifyContent: "space-between",
                        height: "100%",
                      }}
                    >
                      <View
                        style={{
                          backgroundColor: workorder.status.backgroundColor,
                          flexDirection: "row",
                          paddingHorizontal: 15,
                          paddingVertical: 2,
                          alignItems: "center",
                          borderRadius: 5,
                        }}
                      >
                        <Text
                          style={{
                            color: workorder.status.textColor,
                            fontSize: 14,
                          }}
                        >
                          {workorder.status.label}
                        </Text>
                      </View>
                      <View style={{ width: 8 }} />
                      <Text style={{ color: "dimgray", fontSize: 13 }}>
                        {getDisplayFormatDateTime(workorder.startedOnMillis)}
                      </Text>
                    </View>
                    <View
                      style={{
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "space-between",
                        height: "100%",
                        paddingRight: 8,
                      }}
                    >
                      <Text
                        style={{
                          color: "dimgray",
                          fontSize: 12,
                          width: 100,
                          textAlign: "right",
                        }}
                      >
                        {"est: "}
                        <Text
                          style={{
                            color: "dimgray",
                            fontSize: 14,
                            fontStyle: "italic",
                          }}
                        >
                          {workorder.waitTime.label}
                        </Text>
                      </Text>
                      {sItemOptions[workorder.id]?.waitEndDay ? (
                        <Text
                          style={{
                            paddingLeft: 10,
                            color: "black",
                            fontSize: 13,
                          }}
                        >
                          {"Due: " +
                            capitalizeFirstLetterOfString(
                              sItemOptions[workorder.id].waitEndDay
                            )}
                        </Text>
                      ) : null}
                    </View>
                    <View
                      style={{
                        backgroundColor: sItemOptions[workorder.id]?.color,
                        width: 13,
                        height: 13,
                        borderRadius: 100,
                      }}
                    />
                    {/* </View> */}
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

/* eslint-disable */
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
} from "react-native-web";
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
import { APP_BASE_COLORS, Colors } from "../../../styles";
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
import LinearGradient from "react-native-web-linear-gradient";
import Svg, { Path } from "react-native-svg";

const MyIcon = ({ size = 24, color = "green" }) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M16 6C17.1046 6 18 5.10457 18 4C18 2.89543 17.1046 2 16 2C14.8954 2 14 2.89543 14 4C14 5.10457 14.8954 6 16 6ZM13.2428 5.52993C13.5738 5.61279 13.8397 5.85869 13.9482 6.18222C14.13 6.72461 14.3843 7.20048 14.697 7.59998C15.5586 8.70094 16.9495 9.32795 18.8356 9.01361C19.3804 8.92281 19.8956 9.29083 19.9864 9.8356C20.0772 10.3804 19.7092 10.8956 19.1644 10.9864C17.0282 11.3424 15.1791 10.7992 13.8435 9.60462L11.1291 11.9869L12.7524 13.8413C12.912 14.0236 13 14.2577 13 14.5V19C13 19.5523 12.5523 20 12 20C11.4477 20 11 19.5523 11 19V14.8759L8.9689 12.5556L8.92455 12.5059C8.68548 12.2386 8.28531 11.7911 8.11145 11.2626C8.00463 10.9379 7.97131 10.5628 8.08578 10.1667C8.1967 9.78279 8.42374 9.45733 8.7058 9.18044L8.71971 9.16705L12.3134 5.77299C12.5614 5.53871 12.9118 5.44708 13.2428 5.52993ZM2 17C2 15.3431 3.34315 14 5 14C6.65685 14 8 15.3431 8 17C8 18.6569 6.65685 20 5 20C3.34315 20 2 18.6569 2 17ZM5 12C2.23858 12 0 14.2386 0 17C0 19.7614 2.23858 22 5 22C7.76142 22 10 19.7614 10 17C10 14.2386 7.76142 12 5 12ZM16 17C16 15.3431 17.3431 14 19 14C20.6569 14 22 15.3431 22 17C22 18.6569 20.6569 20 19 20C17.3431 20 16 18.6569 16 17ZM19 12C16.2386 12 14 14.2386 14 17C14 19.7614 16.2386 22 19 22C21.7614 22 24 19.7614 24 17C24 14.2386 21.7614 12 19 12Z" />
    </Svg>
  );
};

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
        let maxWaitMillis = Number(
          wo.waitTime?.maxWaitTimeDays * numMillisInDay
        );
        let endWaitMillis = startedOnMillis + maxWaitMillis;

        // check to see if any shop closed days exist in the quoted wait time
        // first get all day names that the shop is closed
        let closedDayNamesArr = [];
        Object.keys(zSettingsObj?.storeHours).forEach((dayName) => {
          if (!zSettingsObj.storeHours[dayName]?.isOpen)
            closedDayNamesArr.push(dayName);
        });

        // next get list of all day names within the time range quoted
        const dayNames = [
          "Sunday",
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
        ];
        const result = [];
        let current = new Date(wo.startedOnMillis);

        // Normalize to the start of the day (midnight)
        current.setHours(0, 0, 0, 0);

        const end = new Date(endWaitMillis);
        end.setHours(0, 0, 0, 0);

        while (current <= end) {
          result.push(dayNames[current.getDay()]);
          // Move to next day
          current.setDate(current.getDate() + 1);
        }

        // last check to see if any of the day names in the wait period coincide with days the shop is closed
        let daysClosedMillis = closedDayNamesArr.length * numMillisInDay;
        endWaitMillis = endWaitMillis + daysClosedMillis;

        // const endDayMillis = startedOnMillis + maxWaitMillis;
        const dayEndWord = getWordDayOfWeek(endWaitMillis);

        let waitEndMonthWord = getWordMonth(endWaitMillis);
        let todayMonthWord = getWordMonth(nowMillis);

        // check to see if the due day word is same week or upcoming weeks
        let isDueWithin7Days = true;
        if (
          Math.ceil((endWaitMillis - nowMillis) / numMillisInDay) >= 7 ||
          waitEndMonthWord != todayMonthWord
        ) {
          isDueWithin7Days = false;
        }

        // check to see if past due
        let isPastDue = false;
        if (endWaitMillis < nowMillis && todayWord != dayEndWord)
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
  }, [zOpenWorkordersArr, sItemOptions, zSettingsObj]);

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
                    marginBottom: 4,
                    borderRadius: 7,
                    // borderWidth: 1,
                    borderLeftWidth: 4,

                    borderLeftColor: APP_BASE_COLORS.buttonLightGreenOutline,
                    borderColor: APP_BASE_COLORS.buttonLightGreenOutline,
                    backgroundColor: APP_BASE_COLORS.listItemWhite,
                    flexDirection: "row",
                    width: "100%",
                    justifyContent: "flex-start",
                    alignItems: "center",
                    paddingLeft: 5,
                    paddingRight: 2,
                    paddingVertical: 2,
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
                      height: "100%",
                      // backgroundColor: "green",
                    }}
                  >
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
                          borderRadius: 15,
                          borderColor: "transparent",

                          borderLeftColor: workorder.status.textColor,
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
                        {/* </LinearGradient> */}
                      </View>
                      <View style={{ width: 8 }} />
                      <Text style={{ color: "dimgray", fontSize: 13 }}>
                        {getDisplayFormatDateTime(workorder.startedOnMillis)}
                      </Text>
                    </View>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "flex-start",
                        height: "100%",
                        paddingRight: 2,
                        backgroundColor: APP_BASE_COLORS.buttonLightGreen,
                        borderWidth: 1,
                        borderColor: APP_BASE_COLORS.buttonLightGreenOutline,
                        borderRadius: 5,
                        marginLeft: 5,
                      }}
                    >
                      <View style={{ flexDirection: "" }}>
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
                              color: APP_BASE_COLORS.textMain,
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
                              color: "gray",
                              fontSize: 13,
                              alignSelf: "flex-end",
                            }}
                          >
                            {"due: "}{" "}
                            <Text style={{ color: APP_BASE_COLORS.textMain }}>
                              {capitalizeFirstLetterOfString(
                                sItemOptions[workorder.id].waitEndDay
                              )}
                            </Text>
                          </Text>
                        ) : null}
                      </View>
                      <View
                        style={{
                          backgroundColor: sItemOptions[workorder.id]?.color,
                          width: 13,
                          height: 13,
                          borderRadius: 100,
                          marginLeft: 7,
                        }}
                      />
                    </View>

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

/* eslint-disable */
import { View, Text, FlatList, TouchableOpacity } from "react-native-web";
import {
  capitalizeFirstLetterOfString,
  formatMillisForDisplay,
  getWordDayOfWeek,
  getWordMonth,
  lightenRGBByPercent,
  log,
  resolveStatus,
} from "../../../utils";
import { TabMenuDivider as Divider, CheckBox_ } from "../../../components";
import { C, Colors } from "../../../styles";
import { TAB_NAMES } from "../../../data";
import React, { useRef, useState } from "react";
import { sortBy } from "lodash";
import {
  useCurrentCustomerStore,
  useOpenWorkordersStore,
  useSettingsStore,
  useTabNamesStore,
  useWorkorderPreviewStore,
} from "../../../stores";

import { dbGetCustomer } from "../../../db_calls_wrapper";

const NUM_MILLIS_IN_DAY = 86400000; // millis in day

const dayNamesArr = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function computeWaitInfo(workorder) {
  const nowMillis = Date.now();

  const startedOnMillis = Number(workorder.startedOnMillis);
  const maxWaitDays = Number(workorder.waitTime?.maxWaitTimeDays);
  if (!maxWaitDays || !startedOnMillis) return { color: null, waitEndDay: "", textColor: null };

  let endWaitMillis = startedOnMillis + maxWaitDays * NUM_MILLIS_IN_DAY;

  // get closed day names from settings
  let closedDayNamesArr = [];
  const settings = useSettingsStore.getState().settings;
  if (settings?.storeHours) {
    Object.keys(settings.storeHours).forEach((dayName) => {
      if (!settings.storeHours[dayName]?.isOpen) closedDayNamesArr.push(dayName);
    });
  }

  // count closed days within wait period
  let closedDaysInRange = 0;
  if (closedDayNamesArr.length > 0) {
    let current = new Date(startedOnMillis);
    current.setHours(0, 0, 0, 0);
    const end = new Date(endWaitMillis);
    end.setHours(0, 0, 0, 0);
    while (current <= end) {
      if (closedDayNamesArr.includes(dayNamesArr[current.getDay()])) closedDaysInRange++;
      current.setDate(current.getDate() + 1);
    }
  }

  endWaitMillis = endWaitMillis + closedDaysInRange * NUM_MILLIS_IN_DAY;

  // compare dates at midnight for day-level precision
  let endDate = new Date(endWaitMillis);
  endDate.setHours(0, 0, 0, 0);
  let today = new Date(nowMillis);
  today.setHours(0, 0, 0, 0);
  let yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  let tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  let dayAfterTomorrow = new Date(today);
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);

  let endTime = endDate.getTime();
  let todayTime = today.getTime();
  let yesterdayTime = yesterday.getTime();
  let tomorrowTime = tomorrow.getTime();
  let dayAfterTomorrowTime = dayAfterTomorrow.getTime();

  let result = { color: null, waitEndDay: "", textColor: null };

  if (endTime === todayTime) {
    // due today
    result.waitEndDay = "Today";
    result.color = "red";
    result.textColor = C.text;
  } else if (endTime === yesterdayTime) {
    // due yesterday
    result.waitEndDay = "Yesterday";
    result.color = "red";
    result.textColor = "red";
  } else if (endTime < yesterdayTime) {
    // past due before yesterday — show short date in red
    let shortDay = getWordDayOfWeek(endWaitMillis, true);
    let month = getWordMonth(endWaitMillis);
    let day = endDate.getDate();
    let suffix = day === 1 || day === 21 || day === 31 ? "st" : day === 2 || day === 22 ? "nd" : day === 3 || day === 23 ? "rd" : "th";
    result.waitEndDay = shortDay + ", " + month + " " + day + suffix;
    result.color = "red";
    result.textColor = "red";
  } else if (endTime === tomorrowTime) {
    // due tomorrow
    result.waitEndDay = "Tomorrow";
    result.color = "yellow";
    result.textColor = C.text;
  } else if (endTime === dayAfterTomorrowTime) {
    // due day after tomorrow
    result.waitEndDay = getWordDayOfWeek(endWaitMillis);
    result.color = "green";
    result.textColor = C.text;
  } else {
    // future — more than 2 days out
    let daysOut = Math.ceil((endTime - todayTime) / NUM_MILLIS_IN_DAY);
    if (daysOut <= 6) {
      result.waitEndDay = getWordDayOfWeek(endWaitMillis);
    } else {
      let shortDay = getWordDayOfWeek(endWaitMillis, true);
      let month = getWordMonth(endWaitMillis);
      let day = endDate.getDate();
      let suffix = day === 1 || day === 21 || day === 31 ? "st" : day === 2 || day === 22 ? "nd" : day === 3 || day === 23 ? "rd" : "th";
      result.waitEndDay = shortDay + " " + month + " " + day + suffix;
    }
    result.textColor = C.text;
  }

  return result;
}

const WaitTimeIndicator = React.memo(function WaitTimeIndicator({ workorder }) {
  const info = computeWaitInfo(workorder);

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "flex-end",
        height: "100%",
        width: 100,
        paddingRight: 2,
        backgroundColor: C.buttonLightGreen,
        borderWidth: 1,
        borderColor: C.buttonLightGreenOutline,
        borderRadius: 5,
        marginLeft: 5,
      }}
    >
      <View style={{ flexDirection: "column", alignItems: "flex-end" }}>
        {!!info.waitEndDay && (
          <Text style={{ color: info.textColor || C.text, fontSize: 13, fontWeight: "600", textAlign: "right" }}>
            {capitalizeFirstLetterOfString(info.waitEndDay)}
          </Text>
        )}
      </View>
      {/* <View
        style={{
          backgroundColor: info.color,
          width: 13,
          height: 13,
          borderRadius: 100,
          marginLeft: 7,
        }}
      /> */}
    </View>
  );
});

export function WorkordersComponent({}) {
  // getters ///////////////////////////////////////////////////////
  const zOpenWorkorders = useOpenWorkordersStore((state) => state.workorders);
  const zOpenWorkorderID = useOpenWorkordersStore((state) => state.openWorkorderID);
  const zPreviewID = useOpenWorkordersStore((state) => state.workorderPreviewID);

  ///////////////////////////////////////////////////////////////////

  ///////////////////////////////////////////////////////////////////////////////////
  const [sAllowPreview, _setAllowPreview] = useState(true);
  const exitTimerRef = useRef(null);
  const preHoverTabsRef = useRef(null);

  ///////////////////////////////////////////////////////////////////////////////////
  ///////////////////////////////////////////////////////////////////////////////////

  function workorderSelected(obj) {
    dbGetCustomer(obj.customerID).then((customer) => {
      // clog("cust obj", custObj);
      useCurrentCustomerStore.getState().setCustomer(customer);
    });

    useOpenWorkordersStore.getState().setOpenWorkorderID(obj.id);
    // _zSetInitialOpenWorkorder(obj);
    useTabNamesStore.getState().setItems({
      infoTabName: TAB_NAMES.infoTab.workorder,
      itemsTabName: TAB_NAMES.itemsTab.workorderItems,
      optionsTabName: TAB_NAMES.optionsTab.inventory,
    });
    useWorkorderPreviewStore;
    useWorkorderPreviewStore.getState().setPreviewObj(null);
  }

  function sortWorkorders(inputArr) {
    // first remove any standalone sales
    inputArr = inputArr.filter((o) => !o.isStandaloneSale);
    return inputArr;
    // log('input arr', inputArr)
    let finalArr = [];
    let nowMillis = new Date().getTime();
    const statuses = useSettingsStore.getState().settings?.statuses;
    statuses?.statuses?.forEach((status) => {
      // log(status)
      let arr = [];
      inputArr.forEach((wo) => {
        const startedOnMillis = Number(wo.startedOnMillis);
        const maxWaitMillis = Number(
          wo.waitTime?.maxWaitTimeDays * NUM_MILLIS_IN_DAY
        );
        if (wo.status === status.id) arr.push(wo);
      });

      // arr = sortBy(arr, "waitTime.maxWaitTimeDays");
      arr = sortBy(arr, (wo) => {
        let millisToCompletion =
          wo.startedOnMillis +
          wo.waitTime?.maxWaitTimeDays * NUM_MILLIS_IN_DAY -
          nowMillis;
        return millisToCompletion;
      });

      finalArr = [...finalArr, ...arr];
    });
    // log("final", finalArr);
    return finalArr;
  }

  function onMouseEnter(workorder) {
    if (exitTimerRef.current) {
      clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
    // Save pre-hover tab state so we can restore on exit
    if (!preHoverTabsRef.current) {
      let tabStore = useTabNamesStore.getState();
      preHoverTabsRef.current = {
        infoTabName: tabStore.infoTabName,
        itemsTabName: tabStore.itemsTabName,
      };
    }
    useOpenWorkordersStore.getState().setWorkorderPreviewID(workorder.id);
    useTabNamesStore.getState().setItems({
      infoTabName: TAB_NAMES.infoTab.workorder,
      itemsTabName: TAB_NAMES.itemsTab.workorderItems
    });
  }

  function onMouseExit(workorder) {
    useOpenWorkordersStore.getState().setWorkorderPreviewID(null);
    exitTimerRef.current = setTimeout(() => {
      // Restore the tab state that was active before the hover
      if (preHoverTabsRef.current) {
        useTabNamesStore.getState().setItems(preHoverTabsRef.current);
        preHoverTabsRef.current = null;
      } else {
        let store = useOpenWorkordersStore.getState();
        let activeID = store.openWorkorderID;
        if (!activeID) {
          useTabNamesStore.getState().setItems({
            infoTabName: TAB_NAMES.infoTab.customer,
            itemsTabName: TAB_NAMES.itemsTab.empty
          });
        } else {
          let activeWO = store.workorders.find((o) => o.id === activeID);
          if (activeWO?.isStandaloneSale) {
            useTabNamesStore.getState().setItems({
              infoTabName: TAB_NAMES.infoTab.checkout,
              itemsTabName: TAB_NAMES.itemsTab.workorderItems
            });
          }
        }
      }
      exitTimerRef.current = null;
    }, 50);
  }

  return (
    <View
      style={{
        flex: 1,
        paddingHorizontal: 5,
      }}
    >
      <View
        style={{
          height: "4%",
          paddingVertical: 5,
          justifyContent: "flex-end",
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <CheckBox_
          isChecked={sAllowPreview}
          onCheck={() => _setAllowPreview(!sAllowPreview)}
          viewStyle={{ alignSelf: "flex-end" }}
          text={"Preview On"}
          iconSize={10}
          buttonStyle={{
            borderRadius: 5,
            backgroundColor: "transparent",
          }}
          outerButtonStyle={{}}
          textStyle={{ color: C.text, fontSize: 13 }}
        />
      </View>

      <FlatList
        style={{
          width: "100%",
          height: "96%",
          backgroundColor: null,
        }}
        data={sortWorkorders(zOpenWorkorders)}
        keyExtractor={(item, index) => index}
        renderItem={(item) => {
          let workorder = item.item;
          const rs = resolveStatus(workorder.status, useSettingsStore.getState().settings?.statuses);
          return (
            <View>
              <TouchableOpacity
                onLongPress={() => deleteWorkorder(workorder)}
                onMouseOver={() => {
                  if (!sAllowPreview) return;
                  onMouseEnter(workorder)
                }}
                onMouseLeave={() => {
                  if (!sAllowPreview) return;
                  onMouseExit()
                }}
                onPress={() => {
                  workorderSelected(workorder);
                }}
              >
                <View
                  style={{
                    marginBottom: 4,
                    borderRadius: 7,
                    borderLeftWidth: 4,
                    borderLeftColor: rs.backgroundColor || C.buttonLightGreenOutline,
                    borderColor: C.buttonLightGreenOutline,
                    opacity: workorder.id === zPreviewID ? 0.6 : 1,
                    backgroundColor: workorder.id === zOpenWorkorderID
                      ? lightenRGBByPercent(C.lightred, 60)
                      : C.listItemWhite,
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
                      marginVertical: 2,
                      flexDirection: "column",
                      width: "65%",
                      justifyContent: "center",
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <Text
                        numberOfLines={1}
                        style={{
                          fontSize: 13,
                          color: "dimgray",
                        }}
                      >
                        {capitalizeFirstLetterOfString(workorder.customerFirst) + " " + capitalizeFirstLetterOfString(workorder.customerLast)}
                      </Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <Text
                        style={{
                          fontWeight: 500,
                          color: C.text,
                        }}
                      >
                        {workorder.brand || "Brand"}
                      </Text>
                      {!!workorder.description && (
                        <View
                          style={{
                            width: 7,
                            height: 2,
                            marginHorizontal: 5,
                            backgroundColor: "lightgray",
                          }}
                        />
                      )}
                      <Text
                        style={{
                          color: C.text,
                        }}
                      >
                        {workorder.description}
                      </Text>
                      {workorder.workorderLines?.length > 0 && (
                        <View
                          style={{
                            backgroundColor: C.blue,
                            borderRadius: 10,
                            paddingHorizontal: 6,
                            paddingVertical: 1,
                            marginLeft: 8,
                          }}
                        >
                          <Text style={{ color: "white", fontSize: 11, fontWeight: "600" }}>
                            {workorder.workorderLines.length}
                          </Text>
                        </View>
                      )}
                    </View>
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
                          backgroundColor: rs.backgroundColor,
                          flexDirection: "row",
                          paddingHorizontal: 11,
                          paddingVertical: 2,
                          alignItems: "center",
                          borderRadius: 10,
                          borderColor: "transparent",

                          borderLeftColor: rs.textColor,
                        }}
                      >
                        <Text
                          style={{
                            color: rs.textColor,
                            fontSize: 12,
                            fontWeight: "600",
                          }}
                        >
                          {rs.label}
                        </Text>
                        {/* </LinearGradient> */}
                      </View>
                      <View style={{ width: 8 }} />
                      <Text style={{ color: "dimgray", fontSize: 13 }}>
                        {formatMillisForDisplay(
                          workorder.startedOnMillis,
                          new Date(workorder.startedOnMillis).getFullYear() !== new Date().getFullYear()
                        )}
                      </Text>
                    </View>
                    <WaitTimeIndicator workorder={workorder} />

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

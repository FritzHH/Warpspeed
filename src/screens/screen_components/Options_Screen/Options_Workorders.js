/* eslint-disable */
import { View, Text, FlatList, TouchableOpacity } from "react-native-web";
import {
  capitalizeFirstLetterOfString,
  formatMillisForDisplay,
  getWordDayOfWeek,
  getWordMonth,
  log,
} from "../../../utils";
import { TabMenuDivider as Divider, CheckBox_ } from "../../../components";
import { C, Colors } from "../../../styles";
import { TAB_NAMES } from "../../../data";
import React, { useEffect, useRef, useState } from "react";
import { cloneDeep, sortBy } from "lodash";
import {
  useCurrentCustomerStore,
  useOpenWorkordersStore,
  useSettingsStore,
  useTabNamesStore,
  useWorkorderPreviewStore,
} from "../../../stores";

import { dbGetCustomer } from "../../../db_calls_wrapper";

const NUM_MILLIS_IN_DAY = 86400000; // millis in day
export function WorkordersComponent({}) {
  // getters ///////////////////////////////////////////////////////
  const zOpenWorkorders = useOpenWorkordersStore((state) => state.workorders);

  // setters ////////////////////////////////////////////////////////
  const _zSetPreviewObj = useWorkorderPreviewStore(
    (state) => state.setPreviewObj
  );

  ///////////////////////////////////////////////////////////////////////////////////
  const [sAllowPreview, _setAllowPreview] = useState(true);
  const [sItemOptions, _setItemOptions] = useState({});
  // log('here', zOpenWorkorders)
  useEffect(() => {
    let hour = 3600000;
    const intervalId = setInterval(() => {
      try {
        let colorsObj = cloneDeep(sItemOptions);
        let nowMillis = Number(new Date().getTime());
        let todayWord = getWordDayOfWeek();
        let tomorrowWord = getWordDayOfWeek(nowMillis + NUM_MILLIS_IN_DAY);
        let nextDayWord = getWordDayOfWeek(nowMillis + NUM_MILLIS_IN_DAY * 2);

        /////////////////////////////////////////////////////
        zOpenWorkorders.forEach((wo) => {
          const startedOnMillis = Number(wo.startedOnMillis);
          let maxWaitMillis = Number(
            wo.waitTime?.maxWaitTimeDays * NUM_MILLIS_IN_DAY
          );
          let endWaitMillis = startedOnMillis + maxWaitMillis;

          // check to see if any shop closed days exist in the quoted wait time
          // first get all day names that the shop is closed
          let closedDayNamesArr = [];
          const settings = useSettingsStore().getState().settings;
          Object.keys(settings?.storeHours).forEach((dayName) => {
            if (!settings.storeHours[dayName]?.isOpen)
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
          let daysClosedMillis = closedDayNamesArr.length * NUM_MILLIS_IN_DAY;
          endWaitMillis = endWaitMillis + daysClosedMillis;

          // const endDayMillis = startedOnMillis + maxWaitMillis;
          const dayEndWord = getWordDayOfWeek(endWaitMillis);

          let waitEndMonthWord = getWordMonth(endWaitMillis);
          let todayMonthWord = getWordMonth(nowMillis);

          // check to see if the due day word is same week or upcoming weeks
          let isDueWithin7Days = true;
          if (
            Math.ceil((endWaitMillis - nowMillis) / NUM_MILLIS_IN_DAY) >= 7 ||
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
      } catch (e) {}
    }, 750);

    return () => {
      clearInterval(intervalId);
    };
  }, [zOpenWorkorders, sItemOptions]);

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
    _zSetPreviewObj(null);
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
        if (wo.status.label == status.label) arr.push(wo);
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
    // log(workorder)
    useOpenWorkordersStore.getState().setOpenWorkorderID(workorder.id)
    useTabNamesStore.getState().setItems({
      infoTabName: TAB_NAMES.infoTab.workorder,
      itemsTabName: TAB_NAMES.itemsTab.workorderItems
    })
  }

  function onMouseExit(workorder) {
    useOpenWorkordersStore.getState().setOpenWorkorderID(null)
        useTabNamesStore.getState().setItems({
      infoTabName: TAB_NAMES.infoTab.customer,
      itemsTabName: TAB_NAMES.itemsTab.empty
    })
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
                    // borderWidth: 1,
                    borderLeftWidth: 4,

                    borderLeftColor: C.buttonLightGreenOutline,
                    borderColor: C.buttonLightGreenOutline,
                    backgroundColor: C.listItemWhite,
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
                      alignItems: "center",
                    }}
                  >
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
                        // fontStyle: "italic"
                      }}
                    >
                      {workorder.description}
                    </Text>
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
                        {formatMillisForDisplay(workorder.startedOnMillis)}
                      </Text>
                    </View>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "flex-start",
                        height: "100%",
                        paddingRight: 2,
                        backgroundColor: C.buttonLightGreen,
                        borderWidth: 1,
                        borderColor: C.buttonLightGreenOutline,
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
                              color: C.text,
                              fontSize: 14,
                              fontStyle: "italic",
                            }}
                          >
                            {workorder.waitTime.label}
                          </Text>
                        </Text>
                        {!!sItemOptions[workorder.id]?.waitEndDay && (
                          <Text
                            style={{
                              paddingLeft: 10,
                              color: "gray",
                              fontSize: 13,
                              alignSelf: "flex-end",
                            }}
                          >
                            {"due: "}{" "}
                            <Text style={{ color: C.text }}>
                              {capitalizeFirstLetterOfString(
                                sItemOptions[workorder.id].waitEndDay
                              )}
                            </Text>
                          </Text>
                        )}
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

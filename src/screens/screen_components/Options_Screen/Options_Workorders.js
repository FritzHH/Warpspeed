/* eslint-disable */
import { View, Text, FlatList, TouchableOpacity } from "react-native-web";
import {
  calculateWaitEstimateLabel,
  capitalizeFirstLetterOfString,
  formatMillisForDisplay,
  gray,
  lightenRGBByPercent,
  log,
  resolveStatus,
  deepEqual,
} from "../../../utils";
import { TabMenuDivider as Divider, CheckBox_, SmallLoadingIndicator, Image_, Button_, TextInput_ } from "../../../components";
import { C, Colors, Fonts, ICONS } from "../../../styles";
import { TAB_NAMES } from "../../../data";
import React, { useRef, useState } from "react";
import { sortBy } from "lodash";
import {
  useCurrentCustomerStore,
  useLoginStore,
  useOpenWorkordersStore,
  useSettingsStore,
  useTabNamesStore,
  useWorkorderPreviewStore,
} from "../../../stores";
import { dbGetCustomer } from "../../../db_calls_wrapper";


const NUM_MILLIS_IN_DAY = 86400000; // millis in day

function computeWaitInfo(workorder) {
  let label = calculateWaitEstimateLabel(workorder, useSettingsStore.getState().getSettings());
  let result = { waitEndDay: "", textColor: C.text, isMissing: false };

  if (!label) return result;

  // "Missing estimate" → show question mark icon
  if (label === "Missing estimate") {
    result.isMissing = true;
    return result;
  }

  // "No estimate" → display as-is
  if (label === "No estimate") {
    result.waitEndDay = label;
    return result;
  }

  let lowerLabel = label.toLowerCase();

  // Color rules
  if (lowerLabel.includes("today") || lowerLabel.includes("overdue")) {
    result.textColor = "red";
  } else if (lowerLabel.includes("tomorrow")) {
    result.textColor = C.green;
  }

  // Overdue: split "Overdue X" into 2 lines
  if (lowerLabel.startsWith("overdue ")) {
    let afterOverdue = label.substring(8); // after "Overdue "
    // Capitalize "Yesterday" if present
    if (afterOverdue.toLowerCase() === "yesterday") afterOverdue = "Yesterday";
    result.waitEndDay = "Overdue\n" + afterOverdue;
    return result;
  }

  // Check for "today", "tomorrow" — capitalize and put on second line
  if (lowerLabel.includes("today")) {
    let parts = label.split(/\s+(today)/i);
    let prefix = parts[0]?.trim();
    if (prefix) {
      result.waitEndDay = prefix + "\nToday";
    } else {
      result.waitEndDay = "Today";
    }
    return result;
  }

  if (lowerLabel.includes("tomorrow")) {
    let parts = label.split(/\s+(tomorrow)/i);
    let prefix = parts[0]?.trim();
    if (prefix) {
      result.waitEndDay = prefix + "\nTomorrow";
    } else {
      result.waitEndDay = "Tomorrow";
    }
    return result;
  }

  // Split before day name if a prefix exists (e.g. "First half Sunday" → "First half\nSunday")
  let dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  for (let day of dayNames) {
    if (label.endsWith(day) && label.length > day.length) {
      let prefix = label.slice(0, label.length - day.length).trim();
      result.waitEndDay = prefix + "\n" + day;
      return result;
    }
  }

  // Everything else: just show the label as-is (day name or short date)
  result.waitEndDay = label;
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
      <View style={{ flexDirection: "column", alignItems: info.isMissing ? "center" : "flex-end", justifyContent: "center" }}>
        {info.isMissing ? (
          <Image_ source={ICONS.questionMark} style={{ width: 35, height: 35 }} />
        ) : !!info.waitEndDay && info.waitEndDay.includes("\n") ? (
          <>
            <Text style={{ color: info.textColor, fontSize: 11, textAlign: "right", fontStyle: "italic" }}>
              {capitalizeFirstLetterOfString(info.waitEndDay.split("\n")[0])}
            </Text>
            <Text style={{ color: info.textColor, fontSize: 13, textAlign: "right" }}>
              {info.waitEndDay.split("\n")[1]}
            </Text>
          </>
        ) : !!info.waitEndDay ? (
          <Text style={{ color: info.textColor, fontSize: 13, textAlign: "right" }}>
            {capitalizeFirstLetterOfString(info.waitEndDay)}
          </Text>
        ) : null}
      </View>
    </View>
  );
});

export function WorkordersComponent({}) {
  // getters ///////////////////////////////////////////////////////
  const zOpenWorkorders = useOpenWorkordersStore((state) => state.workorders);
  const zWorkordersLoaded = useOpenWorkordersStore((state) => state.workordersLoaded);
  const zOpenWorkorderID = useOpenWorkordersStore((state) => state.openWorkorderID);
  const zPreviewID = useOpenWorkordersStore((state) => state.workorderPreviewID);
  const zCurrentUser = useLoginStore((state) => state.currentUser);
  const zUsers = useSettingsStore((state) => state.settings?.users, deepEqual);

  const [sSearchTerm, _setSearchTerm] = useState("");

  ///////////////////////////////////////////////////////////////////

  ///////////////////////////////////////////////////////////////////////////////////
  let sAllowPreview = zCurrentUser?.preview !== false; // default true
  const exitTimerRef = useRef(null);
  const preHoverTabsRef = useRef(null);

  function handleTogglePreview() {
    if (!zCurrentUser) return;
    let newVal = !sAllowPreview;
    let userArr = (zUsers || []).map((u) => {
      if (u.id === zCurrentUser.id) return { ...u, preview: newVal };
      return u;
    });
    useLoginStore.getState().setCurrentUser({ ...zCurrentUser, preview: newVal });
    useSettingsStore.getState().setField("users", userArr);
  }

  ///////////////////////////////////////////////////////////////////////////////////
  ///////////////////////////////////////////////////////////////////////////////////

  function workorderSelected(obj) {
    const store = useOpenWorkordersStore.getState();
    // Clear locked (completed) workorder if switching away
    const lockedID = store.lockedWorkorderID;
    if (lockedID && lockedID !== obj.id) {
      store.setLockedWorkorderID(null);
      store.removeWorkorder(lockedID, false);
    }
    store.setOpenWorkorderID(obj.id);
    useTabNamesStore.getState().setItems({
      infoTabName: TAB_NAMES.infoTab.workorder,
      itemsTabName: TAB_NAMES.itemsTab.workorderItems,
      optionsTabName: TAB_NAMES.optionsTab.inventory,
    });
    useWorkorderPreviewStore.getState().setPreviewObj(null);

    // Background-fetch customer so it's ready when the customer info modal opens
    if (obj.customerID) {
      dbGetCustomer(obj.customerID).then((customer) => {
        if (customer) useCurrentCustomerStore.getState().setCustomer(customer, false);
      });
    }
  }

  function sortWorkorders(inputArr) {
    // first remove any standalone sales
    inputArr = inputArr.filter((o) => !o.isStandaloneSale);
    let finalArr = [];
    let nowMillis = new Date().getTime();
    const statuses = useSettingsStore.getState().settings?.statuses || [];
    statuses.forEach((status) => {
      // log(status)
      let arr = [];
      inputArr.forEach((wo) => {
        const startedOnMillis = Number(wo.startedOnMillis);
        const maxWaitMillis = Number(
          wo.waitTime?.maxWaitTimeDays * NUM_MILLIS_IN_DAY
        );
        if (wo.status === status.id) arr.push(wo);
      });

      arr.sort((a, b) => {
        let aHasWait = !!(a.waitTime?.maxWaitTimeDays != null && a.startedOnMillis);
        let bHasWait = !!(b.waitTime?.maxWaitTimeDays != null && b.startedOnMillis);
        if (!aHasWait && bHasWait) return -1;
        if (aHasWait && !bHasWait) return 1;
        if (!aHasWait && !bHasWait) return 0;
        let aDue = a.startedOnMillis + a.waitTime.maxWaitTimeDays * NUM_MILLIS_IN_DAY;
        let bDue = b.startedOnMillis + b.waitTime.maxWaitTimeDays * NUM_MILLIS_IN_DAY;
        return aDue - bDue;
      });

      finalArr = [...finalArr, ...arr];
    });

    // Priority 2: Bubble workorders whose status matches the logged-in user's
    // attached statuses to the top (stable sort keeps same-status groups together)
    const currentUser = useLoginStore.getState().getCurrentUser();
    const userStatusIDs = currentUser?.statuses || [];
    if (userStatusIDs.length > 0) {
      finalArr.sort((a, b) => {
        let aMatch = userStatusIDs.includes(a.status);
        let bMatch = userStatusIDs.includes(b.status);
        if (aMatch && !bMatch) return -1;
        if (!aMatch && bMatch) return 1;
        return 0;
      });
    }

    // Priority 1 (highest): Current user sent the last message on this workorder
    finalArr.sort((a, b) => {
      let aIsSender = a.lastSMSSenderUserID && a.lastSMSSenderUserID === currentUser?.id;
      let bIsSender = b.lastSMSSenderUserID && b.lastSMSSenderUserID === currentUser?.id;
      if (aIsSender && !bIsSender) return -1;
      if (!aIsSender && bIsSender) return 1;
      return 0;
    });

    return finalArr;
  }

  function filterWorkorders(workorders) {
    if (!sSearchTerm || sSearchTerm.length < 2) return workorders;
    let term = sSearchTerm.toLowerCase();
    return workorders.filter((wo) => {
      let first = (wo.customerFirst || "").toLowerCase();
      let last = (wo.customerLast || "").toLowerCase();
      let brand = (wo.brand || "").toLowerCase();
      let phone = (wo.customerCell || "").replace(/\D/g, "");
      let searchDigits = term.replace(/\D/g, "");
      return (
        first.includes(term) ||
        last.includes(term) ||
        brand.includes(term) ||
        (searchDigits.length >= 2 && phone.includes(searchDigits))
      );
    });
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
    exitTimerRef.current = setTimeout(() => {
      // Restore tabs and clear preview in the same tick to avoid flicker
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
      useOpenWorkordersStore.getState().setWorkorderPreviewID(null);
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
          paddingVertical: 5,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          <Button_
            icon={ICONS.reset1}
            iconSize={20}
            onPress={() => _setSearchTerm("")}
            useColorGradient={false}
          />
          <TextInput_
            style={{
              borderBottomWidth: 1,
              borderBottomColor: gray(0.2),
              fontSize: 15,
              color: C.text,
              outlineWidth: 0,
              outlineStyle: "none",
              flex: 1,
              marginLeft: 8,
              marginRight: 12,
            }}
            placeholder="Search workorders"
            placeholderTextColor={gray(0.2)}
            value={sSearchTerm}
            onChangeText={(val) => _setSearchTerm(val)}
          />
        </View>
        <CheckBox_
          isChecked={sAllowPreview}
          onCheck={handleTogglePreview}
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
        data={filterWorkorders(sortWorkorders(zOpenWorkorders))}
        keyExtractor={(item, index) => index}
        ListEmptyComponent={() => (
          <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 30 }}>
            {!zWorkordersLoaded ? (
              <SmallLoadingIndicator message="Loading workorders...." size={40} textStyle={{ fontSize: 16 }} />
            ) : (
              <Text style={{ color: gray(0.4), fontSize: 14 }}>No workorders</Text>
            )}
          </View>
        )}
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
                    flexDirection: "column",
                    width: "100%",
                    paddingLeft: 5,
                    paddingRight: 2,
                    paddingVertical: 2,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      width: "100%",
                      justifyContent: "flex-start",
                      alignItems: "center",
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
                        {workorder.hasNewSMS && (
                          <View
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: 4,
                              backgroundColor: "gold",
                              marginRight: 5,
                            }}
                          />
                        )}
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
                              backgroundColor: "gray",
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
                    </View>
                  </View>

                  {/* Part ordered / source row */}
                  {!!(workorder.partOrdered || workorder.partSource) && (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingTop: 2,
                        paddingBottom: 1,
                        marginTop: 2,
                      }}
                    >
                      {!!workorder.partOrdered && (
                        <Text
                          numberOfLines={1}
                          style={{ fontSize: 13, color: C.blue, fontWeight: "500" }}
                        >
                          {workorder.partOrdered}
                        </Text>
                      )}
                      {!!(workorder.partOrdered && workorder.partSource) && (
                        <View
                          style={{
                            width: 5,
                            height: 2,
                            marginHorizontal: 5,
                            backgroundColor: "lightgray",
                          }}
                        />
                      )}
                      {!!workorder.partSource && (
                        <Text
                          numberOfLines={1}
                          style={{ fontSize: 13, color: C.orange }}
                        >
                          {workorder.partSource}
                        </Text>
                      )}
                      {!!workorder.partOrderedMillis && (
                        <Text
                          numberOfLines={1}
                          style={{ fontSize: 11, color: "dimgray", marginLeft: 6 }}
                        >
                          {formatMillisForDisplay(workorder.partOrderedMillis)}
                          {!!workorder.partOrderEstimateMillis &&
                            " → " + formatMillisForDisplay(workorder.partOrderEstimateMillis)
                          }
                        </Text>
                      )}
                    </View>
                  )}
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

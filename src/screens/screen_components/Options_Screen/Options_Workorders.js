/* eslint-disable */
import { View, Text, FlatList, TouchableOpacity } from "react-native-web";
import {
  calculateRunningTotals,
  calculateWaitEstimateLabel,
  capitalizeFirstLetterOfString,
  formatCurrencyDisp,
  formatMillisForDisplay,
  gray,
  lightenRGBByPercent,
  log,
  resolveStatus,
  deepEqual,
} from "../../../utils";
import { TabMenuDivider as Divider, SmallLoadingIndicator, Image_, Button_, TextInput_, Tooltip, WebPageModal, DropdownMenu } from "../../../components";
import { C, Colors, Fonts, ICONS } from "../../../styles";
import { TAB_NAMES } from "../../../data";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { sortBy } from "lodash";
import {
  useCurrentCustomerStore,
  useLoginStore,
  useOpenWorkordersStore,
  useSettingsStore,
  useTabNamesStore,
  useActiveSalesStore,
  useWorkorderPreviewStore,
  useCustMessagesStore,
  useAlertScreenStore,
} from "../../../stores";
import { dbGetCustomer, dbGetCustomerMessages, dbListenToNewMessages } from "../../../db_calls_wrapper";


const NUM_MILLIS_IN_DAY = 86400000; // millis in day

function computeWaitInfo(workorder) {
  let label = calculateWaitEstimateLabel(workorder, useSettingsStore.getState().getSettings());
  let result = { waitEndDay: "", textColor: C.text, isMissing: false, isItalic: false };

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

  if (workorder.status === "finished") {
    result.textColor = gray(0.4);
  } else if (lowerLabel === "waiting" || lowerLabel === "today") {
    result.waitEndDay = label;
    result.textColor = "red";
    result.isItalic = true;
    return result;
  }

  // Color rules
  if (workorder.status !== "finished") {
    if (lowerLabel.includes("today") || lowerLabel.includes("overdue")) {
      result.textColor = "red";
    } else if (lowerLabel.includes("tomorrow")) {
      result.textColor = C.green;
    }
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

const MONTH_LABELS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAY_LABELS_SHORT = ["Sun","Mon","Tues","Wed","Thurs","Fri","Sat"];

function formatPickupDeliveryTime(time) {
  if (!time) return "";
  let [h, m] = time.split(":");
  h = Number(h);
  let suffix = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return h + (m && m !== "00" ? ":" + m : "") + suffix;
}

const WaitTimeIndicator = React.memo(function WaitTimeIndicator({ workorder }) {
  const isPickupDelivery = workorder.status === "pickup" || workorder.status === "delivery";
  const pd = workorder.pickupDelivery;

  if (isPickupDelivery) {
    const hasDate = pd?.month && pd?.day;
    let dateStr = "";
    let timeStr = "";
    let isToday = false;
    let isTomorrow = false;
    if (hasDate) {
      const now = new Date();
      const d = new Date(now.getFullYear(), Number(pd.month) - 1, Number(pd.day));
      isToday = Number(pd.month) === now.getMonth() + 1 && Number(pd.day) === now.getDate();
      const tom = new Date(now);
      tom.setDate(tom.getDate() + 1);
      isTomorrow = Number(pd.month) === tom.getMonth() + 1 && Number(pd.day) === tom.getDate();
      dateStr = DAY_LABELS_SHORT[d.getDay()] + ", " + MONTH_LABELS_SHORT[Number(pd.month) - 1] + " " + pd.day;
      timeStr = pd.startTime
        ? formatPickupDeliveryTime(pd.startTime) + (pd.endTime ? "-" + formatPickupDeliveryTime(pd.endTime) : "")
        : "";
    }
    const textColor = isToday ? C.red : isTomorrow ? C.green : C.text;

    return (
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "flex-end",
          height: "100%",
          width: 100,
          paddingRight: 4,
          backgroundColor: C.buttonLightGreen,
          borderWidth: 1,
          borderColor: C.buttonLightGreenOutline,
          borderRadius: 5,
          marginLeft: 5,
        }}
      >
        <View style={{ flexDirection: "column", alignItems: "flex-end", justifyContent: "center" }}>
          {hasDate ? (
            <>
              {isToday ? (
                <Text style={{ color: textColor, fontSize: 13, textAlign: "right" }}>Today</Text>
              ) : isTomorrow ? (
                <Text style={{ color: textColor, fontSize: 13, textAlign: "right" }}>Tomorrow</Text>
              ) : (
                <Text style={{ color: textColor, fontSize: 12, textAlign: "right" }}>
                  {dateStr}
                </Text>
              )}
              {!!timeStr && (
                <Text style={{ color: C.text, fontSize: 10, textAlign: "right" }}>
                  {timeStr}
                </Text>
              )}
            </>
          ) : (
            <Image_ source={ICONS.questionMark} style={{ width: 35, height: 35 }} />
          )}
        </View>
      </View>
    );
  }

  const info = computeWaitInfo(workorder);

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "flex-end",
        height: "90%",
        width: 100,
        paddingRight: 4,
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
          <Text style={{ color: info.textColor, fontSize: 13, textAlign: "right", fontStyle: info.isItalic ? "italic" : "normal" }}>
            {capitalizeFirstLetterOfString(info.waitEndDay)}
          </Text>
        ) : null}
      </View>
    </View>
  );
});

const WorkorderRowItem = React.memo(function WorkorderRowItem({
  workorder, isSelected, isPreviewed, paidAmount, isLinkedSale, onSelect, onHoverEnter, onHoverExit
}) {
  const [sHovered, _sSetHovered] = useState(false);
  const rs = resolveStatus(workorder.status, useSettingsStore.getState().settings?.statuses);
  let wipUser = "";
  if (workorder.status === "work_in_progress" && workorder.changeLog?.length) {
    for (let i = workorder.changeLog.length - 1; i >= 0; i--) {
      let entry = workorder.changeLog[i];
      if (entry.field === "status" && entry.to === rs.label) { wipUser = entry.user || ""; break; }
    }
  }

  return (
    <View>
      <TouchableOpacity
        onPress={() => {
          onSelect(workorder);
        }}
      >
        <View
          onMouseEnter={() => _sSetHovered(true)}
          onMouseLeave={() => _sSetHovered(false)}
          style={{
            marginBottom: 2,
            borderRadius: 7,
            borderLeftWidth: 4,
            borderLeftColor: rs.backgroundColor || C.buttonLightGreenOutline,
            borderColor: C.buttonLightGreenOutline,
            opacity: isPreviewed ? 0.83 : sHovered && !isSelected ? 0.83 : 1,
            backgroundColor: isSelected
              ? lightenRGBByPercent(C.lightred, 85)
              : workorder.status?.toLowerCase().includes("finished")
                ? lightenRGBByPercent(C.green, 85)
                : C.listItemWhite,
            flexDirection: "row",
            width: "100%",
            paddingLeft: 5,
            paddingVertical: 1,
          }}
        >
          <View style={{ flex: 1, flexDirection: "column" }}>
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
                      backgroundColor: C.green,
                      marginRight: 5,
                    }}
                  />
                )}
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: 14,
                    color: "dimgray",
                  }}
                >
                  {capitalizeFirstLetterOfString(workorder.customerFirst) + " " + capitalizeFirstLetterOfString(workorder.customerLast)}
                </Text>
                {paidAmount > 0 && (
                  <Text style={{ fontSize: 12, color: C.green, marginLeft: 6, fontWeight: "500" }}>
                    {"Paid $" + formatCurrencyDisp(paidAmount)}
                  </Text>
                )}
                {isLinkedSale && (
                  <Text style={{ fontSize: 12, color: C.orange, marginLeft: 6, fontWeight: "500" }}>
                    Combined Sale
                  </Text>
                )}
              </View>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                {!!workorder.color1?.backgroundColor && (
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: workorder.color1.backgroundColor, marginRight: 4 }} />
                )}
                {!!workorder.color2?.backgroundColor && (
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: workorder.color2.backgroundColor, marginRight: 4 }} />
                )}
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: C.text,
                  }}
                >
                  {capitalizeFirstLetterOfString(workorder.brand) || ""}
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
                    fontSize: 12,
                    color: C.text,
                  }}
                >
                  {capitalizeFirstLetterOfString(workorder.description)}
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
                {workorder.workorderLines?.length > 0 && (() => {
                  let totals = calculateRunningTotals(workorder, useSettingsStore.getState().getSettings()?.salesTaxPercent, [], false, !!workorder?.taxFree);
                  let hasDiscount = totals.runningDiscount > 0;
                  return totals.runningSubtotal > 0 ? (
                    <View style={{ flexDirection: "row", alignItems: "center", marginLeft: 6 }}>
                      {hasDiscount && (
                        <Text style={{ color: "gray", fontSize: 11, fontWeight: "500", textDecorationLine: "line-through", marginRight: 4 }}>
                          {"$" + formatCurrencyDisp(totals.runningSubtotal)}
                        </Text>
                      )}
                      <Text style={{ color: "gray", fontSize: 11, fontWeight: "500" }}>
                        {"$" + formatCurrencyDisp(totals.finalTotal)}
                      </Text>
                    </View>
                  ) : null;
                })()}
                {!!workorder.itemNotHere && (
                  <View
                    style={{
                      backgroundColor: "rgb(255, 243, 176)",
                      borderRadius: 10,
                      paddingHorizontal: 8,
                      paddingVertical: 1,
                      marginLeft: 8,
                    }}
                  >
                    <Text style={{ color: "rgb(90, 75, 0)", fontSize: 9, fontWeight: "600" }}>
                      Item not here
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
                <Text style={{ color: "dimgray", fontSize: 11 }}>
                  {(() => {
                    let d = new Date(workorder.startedOnMillis);
                    let h = d.getHours();
                    let m = d.getMinutes();
                    h = h % 12 || 12;
                    return h + ":" + (m < 10 ? "0" : "") + m + "  ";
                  })()}
                  {formatMillisForDisplay(
                    workorder.startedOnMillis,
                    new Date(workorder.startedOnMillis).getFullYear() !== new Date().getFullYear()
                  )}
                </Text>
                <View style={{ width: 8 }} />
                {workorder.status === "work_in_progress" ? (
                  <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: rs.backgroundColor, borderRadius: 10, borderColor: "transparent", borderLeftColor: rs.textColor, paddingLeft: 11 }}>
                    {!!wipUser && (
                      <Text style={{ color: C.red, fontSize: 9, fontStyle: "italic", marginRight: 5 }}>{wipUser}</Text>
                    )}
                    <DropdownMenu
                      enabled={true}
                      dataArr={(useSettingsStore.getState().getSettings()?.users || []).map((u) => ({
                        label: (u.first || "") + (u.last ? " " + u.last.charAt(0) + "." : ""),
                      }))}
                      onSelect={(item) => {
                        let changeLog = [...(workorder.changeLog || [])];
                        for (let i = changeLog.length - 1; i >= 0; i--) {
                          if (changeLog[i].field === "status" && changeLog[i].to === rs.label) {
                            changeLog[i] = { ...changeLog[i], user: item.label };
                            break;
                          }
                        }
                        useOpenWorkordersStore.getState().setWorkorder({ ...workorder, changeLog }, true);
                      }}
                      buttonText={rs.label}
                      buttonStyle={{
                        backgroundColor: "transparent",
                        borderColor: "transparent",
                        borderRadius: 0,
                        paddingHorizontal: 11,
                        paddingLeft: 0,
                        paddingVertical: 2,
                        borderWidth: 0,
                      }}
                      buttonTextStyle={{
                        color: rs.textColor,
                        fontSize: 11,
                        fontWeight: "normal",
                      }}
                      buttonIcon={null}
                      showButtonShadow={false}
                      modalCoordX={-80}
                      modalCoordY={25}
                      menuMaxHeight={200}
                      centerMenuVertically={true}
                    />
                  </View>
                ) : (
                  <TouchableOpacity
                    activeOpacity={workorder.status === "finished" ? 0.6 : 1}
                    onPress={(e) => {
                      if (workorder.status !== "finished") return;
                      e.stopPropagation();
                      useAlertScreenStore.getState().setValues({
                        title: "Customer Contacted",
                        message: "Has this customer been contacted?",
                        btn1Text: "Yes",
                        handleBtn1Press: () => {
                          useOpenWorkordersStore.getState().setField("contacted", true, workorder.id);
                          useAlertScreenStore.getState().setShowAlert(false);
                        },
                        btn2Text: "No",
                        handleBtn2Press: () => {
                          useOpenWorkordersStore.getState().setField("contacted", false, workorder.id);
                          useAlertScreenStore.getState().setShowAlert(false);
                        },
                        canExitOnOuterClick: true,
                      });
                    }}
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
                    {workorder.status === "finished" && (
                      <Text style={{ fontSize: 11, color: workorder.contacted ? rs.textColor : C.red, marginRight: 4 }}>
                        {workorder.contacted ? "\u2713" : "\u2717"}
                      </Text>
                    )}
                    <Text
                      style={{
                        color: rs.textColor,
                        fontSize: 11,
                        fontWeight: "normal",
                      }}
                    >
                      {rs.label}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>

          {/* Part ordered / source row */}
          {!!(workorder.partOrdered || workorder.partSource || workorder.trackingNumber) && (
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
                  style={{ fontSize: 14, color: C.blue, fontWeight: "500" }}
                >
                  {capitalizeFirstLetterOfString(workorder.partOrdered)}
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
                  style={{ fontSize: 14, color: C.orange }}
                >
                  {capitalizeFirstLetterOfString(workorder.partSource)}
                </Text>
              )}
              {!!(workorder.partOrderedMillis && workorder.partOrderEstimateMillis && Math.round((workorder.partOrderEstimateMillis - workorder.partOrderedMillis) / NUM_MILLIS_IN_DAY) > 0) && (
                <Text
                  numberOfLines={1}
                  style={{ fontSize: 12, color: "dimgray", marginLeft: 6 }}
                >
                  {formatMillisForDisplay(workorder.partOrderedMillis)}
                  {" \u2192 " + formatMillisForDisplay(workorder.partOrderEstimateMillis)}
                </Text>
              )}
              {!!workorder.trackingNumber && (() => {
                const inputVal = workorder.trackingNumber.trim();
                const isURL = /^https?:\/\/|^www\./i.test(inputVal);
                if (isURL) {
                  const openUrl = inputVal.startsWith("www.") ? "https://" + inputVal : inputVal;
                  return (
                    <View onContextMenu={(e) => { e.preventDefault(); navigator.clipboard.writeText(inputVal); }} style={{ marginLeft: 6 }}>
                      <Tooltip text="Click to open website, right-click to copy link" position="top">
                        <TouchableOpacity
                          onPress={() => window.open(openUrl, "_blank")}
                          style={{ paddingVertical: 1, paddingHorizontal: 8, borderRadius: 4, backgroundColor: lightenRGBByPercent(C.blue, 75) }}
                        >
                          <Text style={{ fontSize: 11, color: C.blue, fontWeight: "500" }}>Open Tracking</Text>
                        </TouchableOpacity>
                      </Tooltip>
                    </View>
                  );
                }
                return (
                  <View onContextMenu={(e) => { e.preventDefault(); navigator.clipboard.writeText(inputVal); }} style={{ marginLeft: 6 }}>
                    <Tooltip text="Click to open tracker, right-click to copy tracking number" position="top">
                      <WebPageModal
                        url={"https://parcelsapp.com/en/tracking/" + inputVal}
                        title="Package Tracking"
                        subtitle={inputVal}
                        buttonLabel="Open Tracking"
                        buttonStyle={{ paddingVertical: 1, paddingHorizontal: 8, borderRadius: 4, backgroundColor: lightenRGBByPercent(C.blue, 75) }}
                        buttonTextStyle={{ fontSize: 11, color: C.blue, fontWeight: "500" }}
                      />
                    </Tooltip>
                  </View>
                );
              })()}
            </View>
          )}
          </View>
          <View
            onMouseOver={() => onHoverEnter(workorder)}
            onMouseLeave={() => onHoverExit()}
            style={{ alignSelf: "stretch", justifyContent: "center" }}
          >
            <WaitTimeIndicator workorder={workorder} />
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );
}, (prev, next) => {
  if (prev.workorder !== next.workorder) return false;
  if (prev.isSelected !== next.isSelected) return false;
  if (prev.isPreviewed !== next.isPreviewed) return false;
  if (prev.paidAmount !== next.paidAmount) return false;
  if (prev.isLinkedSale !== next.isLinkedSale) return false;
  return true;
});

export function WorkordersComponent({}) {
  // getters ///////////////////////////////////////////////////////
  const zOpenWorkorders = useOpenWorkordersStore((state) => state.workorders);
  const zWorkordersLoaded = useOpenWorkordersStore((state) => state.workordersLoaded);
  const zOpenWorkorderID = useOpenWorkordersStore((state) => state.openWorkorderID);
  const zPreviewID = useOpenWorkordersStore((state) => state.workorderPreviewID);
  const zActiveSales = useActiveSalesStore((state) => state.activeSales);
  const [sSearchTerm, _setSearchTerm] = useState("");

  // Rehydration: fetch fresh messages on reload (persisted ones show instantly while fetching)
  const hasRehydratedMsgsRef = useRef(false);
  useEffect(() => {
    if (hasRehydratedMsgsRef.current) return;
    if (!zOpenWorkorderID || !zOpenWorkorders.length) return;
    let wo = zOpenWorkorders.find((o) => o.id === zOpenWorkorderID);
    if (!wo?.customerCell) return;
    hasRehydratedMsgsRef.current = true;
    // Reset messagesPhone so fetchCustomerMessages doesn't skip due to "already loaded" guard
    useCustMessagesStore.getState().setMessagesPhone(null);
    fetchCustomerMessages(wo.customerCell);
  }, [zOpenWorkorderID, zOpenWorkorders]);

  // Sale IDs shared by 2+ workorders (linked/combined sales)
  let linkedSaleIDs = new Set();
  let saleIDCounts = {};
  for (let wo of zOpenWorkorders) {
    if (wo.activeSaleID) {
      saleIDCounts[wo.activeSaleID] = (saleIDCounts[wo.activeSaleID] || 0) + 1;
      if (saleIDCounts[wo.activeSaleID] > 1) linkedSaleIDs.add(wo.activeSaleID);
    }
  }

  function handleSearchChange(val) {
    _setSearchTerm(val);
    let q = val.trim();
    if (q.length < 5) return;
    let workorders = zOpenWorkorders.filter((wo) => !!wo.customerID);
    let scored = workorders.map((wo) => ({ wo, score: scoreWorkorder(wo, q) }));
    let matches = scored.filter((s) => s.score > 0);
    if (matches.length === 1) {
      let wo = matches[0].wo;
      _setSearchTerm("");
      workorderSelected(wo);
    }
  }

  function scoreWorkorder(wo, query) {
    let q = query.toLowerCase().trim();
    if (!q) return 0;
    let parts = q.split(/\s+/).filter(Boolean);
    let score = 0;

    let fields = {
      workorderNumber: (wo.workorderNumber || "").toLowerCase(),
      id: (wo.id || "").toLowerCase(),
      first: (wo.customerFirst || "").toLowerCase(),
      last: (wo.customerLast || "").toLowerCase(),
      phone: (wo.customerCell || "").replace(/\D/g, ""),
      email: (wo.customerEmail || "").toLowerCase(),
      brand: (wo.brand || "").toLowerCase(),
      description: (wo.description || "").toLowerCase(),
    };

    for (let part of parts) {
      let partScore = 0;
      // Exact start matches score highest
      if (fields.first === part || fields.last === part) partScore = Math.max(partScore, 100);
      if (fields.first.startsWith(part)) partScore = Math.max(partScore, 80);
      if (fields.last.startsWith(part)) partScore = Math.max(partScore, 80);
      if (fields.workorderNumber.includes(part)) partScore = Math.max(partScore, 70);
      if (fields.id.includes(part)) partScore = Math.max(partScore, 70);
      if (fields.phone.includes(part)) partScore = Math.max(partScore, 60);
      if (fields.email.includes(part)) partScore = Math.max(partScore, 50);
      if (fields.brand.startsWith(part)) partScore = Math.max(partScore, 45);
      if (fields.brand.includes(part)) partScore = Math.max(partScore, 35);
      if (fields.description.includes(part)) partScore = Math.max(partScore, 30);
      // Partial contains on names
      if (!partScore && fields.first.includes(part)) partScore = 20;
      if (!partScore && fields.last.includes(part)) partScore = 20;
      score += partScore;
    }

    return score;
  }

  const searchInputRef = useRef(null);
  const enterTimerRef = useRef(null);
  const exitTimerRef = useRef(null);
  const preHoverItemsTabRef = useRef(null);
  const preHoverInfoTabRef = useRef(null);

  function onMouseEnter(workorder) {
    if (exitTimerRef.current) { clearTimeout(exitTimerRef.current); exitTimerRef.current = null; }
    if (enterTimerRef.current) { clearTimeout(enterTimerRef.current); enterTimerRef.current = null; }
    enterTimerRef.current = setTimeout(() => {
      enterTimerRef.current = null;
      if (!preHoverItemsTabRef.current) {
        preHoverItemsTabRef.current = useTabNamesStore.getState().itemsTabName;
      }
      if (!preHoverInfoTabRef.current) {
        preHoverInfoTabRef.current = useTabNamesStore.getState().infoTabName;
      }
      useOpenWorkordersStore.getState().setWorkorderPreviewID(workorder.id);
      useTabNamesStore.getState().setItemsTabName(TAB_NAMES.itemsTab.workorderItems);
      useTabNamesStore.getState().setInfoTabName(TAB_NAMES.infoTab.workorder);
    }, 50);
  }

  function onMouseExit() {
    if (enterTimerRef.current) { clearTimeout(enterTimerRef.current); enterTimerRef.current = null; }
    exitTimerRef.current = setTimeout(() => {
      if (preHoverItemsTabRef.current) {
        useTabNamesStore.getState().setItemsTabName(preHoverItemsTabRef.current);
        preHoverItemsTabRef.current = null;
      }
      if (preHoverInfoTabRef.current) {
        useTabNamesStore.getState().setInfoTabName(preHoverInfoTabRef.current);
        preHoverInfoTabRef.current = null;
      }
      useOpenWorkordersStore.getState().setWorkorderPreviewID(null);
      exitTimerRef.current = null;
    }, 50);
  }

  function fetchCustomerMessages(customerCell) {
    if (!customerCell || customerCell.length !== 10) return;
    let msgStore = useCustMessagesStore.getState();
    if (msgStore.messagesPhone === customerCell && msgStore.messages.length > 0) return;
    msgStore.clearMessages();
    msgStore.setMessagesPhone(customerCell);

    // Check hub cache first (shared with hub conversation panel)
    let cached = msgStore.getHubCachedThread(customerCell);
    if (cached && cached.messages.length > 0) {
      let recent = cached.messages.slice(-7);
      msgStore.setMessages(recent);
      msgStore.setMessagesHasMore(cached.messages.length > 7 || !cached.noMoreHistory);
      if (recent.length > 0) msgStore.setMessagesNextCursor(recent[0].millis);
      setupCustomerMessageListener(customerCell, cached.messages);
      return;
    }

    // Not in Zustand cache - check IndexedDB, then Firestore
    msgStore.setMessagesLoading(true);
    (async () => {
      try {
        const { getMessages } = await import("../../../hubMessageDB");
        const idbMsgs = await getMessages(customerCell);
        if (idbMsgs.length > 0 && useCustMessagesStore.getState().getMessagesPhone() === customerCell) {
          let store = useCustMessagesStore.getState();
          let sorted = idbMsgs.sort((a, b) => (a.millis || 0) - (b.millis || 0));
          let recent = sorted.slice(-7);
          store.setMessages(recent);
          store.setMessagesHasMore(sorted.length > 7);
          if (recent.length > 0) store.setMessagesNextCursor(recent[0].millis);
          store.setMessagesLoading(false);
          store.setHubCachedThread(customerCell, sorted, false);
          setupCustomerMessageListener(customerCell, sorted);
          return;
        }
      } catch (e) { /* IndexedDB unavailable, fall through */ }

      // Firestore fetch as last resort
      if (useCustMessagesStore.getState().getMessagesPhone() !== customerCell) return;
      dbGetCustomerMessages(customerCell, null, 7).then((result) => {
        if (!result.success || useCustMessagesStore.getState().getMessagesPhone() !== customerCell) {
          useCustMessagesStore.getState().setMessagesLoading(false);
          return;
        }
        let sorted = result.messages.sort((a, b) => (a.millis || 0) - (b.millis || 0));
        let store = useCustMessagesStore.getState();
        store.setMessages(sorted);
        store.setMessagesHasMore(result.hasMore);
        store.setMessagesNextCursor(result.nextPageTimestamp);
        store.setMessagesLoading(false);
        store.setHubCachedThread(customerCell, sorted, result.messages.length < 7);
        setupCustomerMessageListener(customerCell, sorted);
      }).catch(() => {
        useCustMessagesStore.getState().setMessagesLoading(false);
      });
    })();
  }

  function setupCustomerMessageListener(customerCell, existingMessages) {
    let lastMillis = 0;
    existingMessages.forEach((m) => { if (m.millis > lastMillis) lastMillis = m.millis; });
    if (!lastMillis) lastMillis = Date.now();
    let unsub = dbListenToNewMessages(customerCell, lastMillis, (newMessages) => {
      if (useCustMessagesStore.getState().getMessagesPhone() !== customerCell) return;
      let store = useCustMessagesStore.getState();
      store.mergeMessages(newMessages);
      let allMessages = useCustMessagesStore.getState().getMessages();
      store.setHubCachedThread(customerCell, allMessages, false);
    });
    useCustMessagesStore.getState().setMessagesUnsub(unsub);
  }

  function workorderSelected(obj) {
    // Clear hover state so exit handler doesn't restore stale tabs
    preHoverItemsTabRef.current = null;
    if (enterTimerRef.current) { clearTimeout(enterTimerRef.current); enterTimerRef.current = null; }
    if (exitTimerRef.current) { clearTimeout(exitTimerRef.current); exitTimerRef.current = null; }
    useOpenWorkordersStore.getState().setWorkorderPreviewID(null);

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
    });
    useTabNamesStore.getState().setMessagesHubMode(false);
    useWorkorderPreviewStore.getState().setPreviewObj(null);
    // Background-fetch customer so it's ready when the customer info modal opens
    if (obj.customerID) {
      dbGetCustomer(obj.customerID).then((customer) => {
        if (customer) useCurrentCustomerStore.getState().setCustomer(customer, false);
      });
      if (obj.customerCell) fetchCustomerMessages(obj.customerCell);
    }
  }

  function sortWorkorders(inputArr) {
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

    // Priority 0 (highest): Today's pickup/delivery at the very top, sorted by startTime
    const now = new Date();
    const todayMonth = now.getMonth() + 1;
    const todayDay = now.getDate();
    finalArr.sort((a, b) => {
      const aIsToday = (a.status === "pickup" || a.status === "delivery") &&
        Number(a.pickupDelivery?.month) === todayMonth &&
        Number(a.pickupDelivery?.day) === todayDay;
      const bIsToday = (b.status === "pickup" || b.status === "delivery") &&
        Number(b.pickupDelivery?.month) === todayMonth &&
        Number(b.pickupDelivery?.day) === todayDay;
      if (aIsToday && !bIsToday) return -1;
      if (!aIsToday && bIsToday) return 1;
      if (aIsToday && bIsToday) {
        // pickups first, then deliveries
        if (a.status === "pickup" && b.status === "delivery") return -1;
        if (a.status === "delivery" && b.status === "pickup") return 1;
        // within same type, sort by startTime
        return (a.pickupDelivery?.startTime || "").localeCompare(b.pickupDelivery?.startTime || "");
      }
      return 0;
    });

    return finalArr;
  }

  function filterAndRankWorkorders(workorders) {
    let q = sSearchTerm.trim();
    if (!q) return workorders;
    let scored = workorders.map((wo) => ({ wo, score: scoreWorkorder(wo, q) }));
    scored = scored.filter((s) => s.score > 0);
    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.wo);
  }

  const sortedData = useMemo(() => {
    const customerWorkorders = zOpenWorkorders.filter((wo) => !!wo.customerID);
    if (sSearchTerm.trim()) return filterAndRankWorkorders(customerWorkorders);
    return sortWorkorders(customerWorkorders);
  }, [zOpenWorkorders, sSearchTerm]);

  return (
    <View
      style={{
        flex: 1,
        paddingHorizontal: 5,
      }}
    >
      <View
        style={{
          height: "5%",
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 4,
          justifyContent: "space-between",
        }}
      >
          <Button_
            icon={ICONS.reset1}
            iconSize={20}
            onPress={() => {
              _setSearchTerm("");
              searchInputRef.current?.focus();
            }}
            useColorGradient={false}
            disabled={!sSearchTerm}
          />
          <TextInput_
            inputRef={searchInputRef}
            style={{
              borderBottomWidth: 1,
              borderBottomColor: gray(0.2),
              fontSize: 18,
              color: C.text,
              outlineWidth: 0,
              outlineStyle: "none",
              width: "80%",
              marginLeft: 20,
              marginRight: 30,
            }}
            placeholder="Find open workorder"
            placeholderTextColor={gray(0.2)}
            value={sSearchTerm}
            onChangeText={handleSearchChange}
            autoFocus={true}
          />
      </View>

      <FlatList
        style={{
          width: "100%",
          height: "96%",
          backgroundColor: null,
        }}
        data={sortedData}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={() => (
          <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 30 }}>
            {!zWorkordersLoaded ? (
              <SmallLoadingIndicator message="Loading workorders...." size={40} textStyle={{ fontSize: 16 }} />
            ) : sSearchTerm.trim() ? (
              <View style={{ alignItems: "center" }}>
                <Image_ source={ICONS.info} style={{ width: 24, height: 24, marginBottom: 6, opacity: 0.5 }} />
                <Text style={{ color: gray(0.4), fontSize: 14 }}>No results found</Text>
              </View>
            ) : (
              <Text style={{ color: gray(0.4), fontSize: 14 }}>No workorders</Text>
            )}
          </View>
        )}
        renderItem={({ item: workorder }) => {
          let sale = workorder.activeSaleID ? zActiveSales.find((s) => s.id === workorder.activeSaleID) : null;
          let paidAmount = sale ? (sale.amountCaptured || 0) - (sale.amountRefunded || 0) : 0;
          return (
            <WorkorderRowItem
              workorder={workorder}
              isSelected={workorder.id === zOpenWorkorderID}
              isPreviewed={workorder.id === zPreviewID}
              paidAmount={paidAmount}
              isLinkedSale={!!workorder.activeSaleID && linkedSaleIDs.has(workorder.activeSaleID)}
              onSelect={workorderSelected}
              onHoverEnter={onMouseEnter}
              onHoverExit={onMouseExit}
            />
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

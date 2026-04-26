/* eslint-disable */
import { View, Text, FlatList, TouchableOpacity } from "react-native-web";
import {
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
import { TabMenuDivider as Divider, CheckBox_, SmallLoadingIndicator, Image_, Button_, TextInput_, Tooltip, WebPageModal } from "../../../components";
import { C, Colors, Fonts, ICONS } from "../../../styles";
import { TAB_NAMES } from "../../../data";
import React, { useEffect, useRef, useState } from "react";
import { sortBy } from "lodash";
import {
  useCurrentCustomerStore,
  useLoginStore,
  useOpenWorkordersStore,
  useSettingsStore,
  useTabNamesStore,
  useWorkorderPreviewStore,
  useActiveSalesStore,
  useCustMessagesStore,
} from "../../../stores";
import { dbGetCustomer, dbGetCustomerMessages, dbListenToNewMessages } from "../../../db_calls_wrapper";


const NUM_MILLIS_IN_DAY = 86400000; // millis in day
const EMPTY_PENDING = [];

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
  const zUsers = useSettingsStore((state) => state.settings?.users);
  const zActiveSales = useActiveSalesStore((state) => state.activeSales);
  const zPendingWOIDs = (zUsers || []).find((u) => u.id === zCurrentUser?.id)?.pendingWorkorderIDs || EMPTY_PENDING;

  const [sSearchTerm, _setSearchTerm] = useState("");
  const [sStatusBlink, _setStatusBlink] = useState(false);

  useEffect(() => {
    if (zPendingWOIDs.length === 0) { _setStatusBlink(false); return; }
    _setStatusBlink(true);
    const interval = setInterval(() => { _setStatusBlink((prev) => !prev); }, 500);
    return () => clearInterval(interval);
  }, [zPendingWOIDs.length]);

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

  ///////////////////////////////////////////////////////////////////

  ///////////////////////////////////////////////////////////////////////////////////
  let sAllowPreview = zCurrentUser?.preview !== false; // default true
  const enterTimerRef = useRef(null);
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

    // Priority 1: Current user sent the last message on this workorder
    finalArr.sort((a, b) => {
      let aIsSender = a.lastSMSSenderUserID && a.lastSMSSenderUserID === currentUser?.id;
      let bIsSender = b.lastSMSSenderUserID && b.lastSMSSenderUserID === currentUser?.id;
      if (aIsSender && !bIsSender) return -1;
      if (!aIsSender && bIsSender) return 1;
      return 0;
    });

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

  function onMouseEnter(workorder) {
    if (exitTimerRef.current) {
      clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
    if (enterTimerRef.current) {
      clearTimeout(enterTimerRef.current);
      enterTimerRef.current = null;
    }
    enterTimerRef.current = setTimeout(() => {
      enterTimerRef.current = null;
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
    }, 150);
  }

  function onMouseExit(workorder) {
    if (enterTimerRef.current) {
      clearTimeout(enterTimerRef.current);
      enterTimerRef.current = null;
    }
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
            onPress={() => {
              _setSearchTerm("");
            }}
            useColorGradient={false}
            disabled={!sSearchTerm}
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
            placeholder="Find open workorder"
            placeholderTextColor={gray(0.2)}
            value={sSearchTerm}
            onChangeText={handleSearchChange}
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
        onLayout={() => console.log("[Options_Workorders]", JSON.stringify(zOpenWorkorders, null, 2))}
        data={sSearchTerm.trim() ? filterAndRankWorkorders(zOpenWorkorders.filter((wo) => !!wo.customerID)) : sortWorkorders(zOpenWorkorders.filter((wo) => !!wo.customerID))}
        keyExtractor={(item, index) => index}
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
        renderItem={(item) => {
          let workorder = item.item;
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
                  if (zPendingWOIDs.includes(workorder.id)) {
                    const uid = useLoginStore.getState().getCurrentUser()?.id;
                    const users = useSettingsStore.getState().getSettings()?.users || [];
                    const updatedUsers = users.map((u) => {
                      if (u.id !== uid) return u;
                      return { ...u, pendingWorkorderIDs: (u.pendingWorkorderIDs || []).filter((id) => id !== workorder.id) };
                    });
                    useSettingsStore.getState().setField("users", updatedUsers);
                  }
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
                      ? lightenRGBByPercent(C.lightred, 85)
                      : (zPendingWOIDs.includes(workorder.id) && sStatusBlink)
                        ? "rgba(255, 255, 0, 0.35)"
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
                              backgroundColor: C.green,
                              marginRight: 5,
                            }}
                          />
                        )}
                        <Text
                          numberOfLines={1}
                          style={{
                            fontSize: 15,
                            color: "dimgray",
                          }}
                        >
                          {capitalizeFirstLetterOfString(workorder.customerFirst) + " " + capitalizeFirstLetterOfString(workorder.customerLast)}
                        </Text>
                        {(() => {
                          let sale = workorder.activeSaleID ? zActiveSales.find((s) => s.id === workorder.activeSaleID) : null;
                          let paid = sale ? (sale.amountCaptured || 0) - (sale.amountRefunded || 0) : 0;
                          return paid > 0 ? (
                            <Text style={{ fontSize: 14, color: C.green, marginLeft: 6, fontWeight: "500" }}>
                              {"Paid $" + formatCurrencyDisp(paid)}
                            </Text>
                          ) : null;
                        })()}
                        {!!workorder.activeSaleID && linkedSaleIDs.has(workorder.activeSaleID) && (
                          <Text style={{ fontSize: 14, color: C.orange, marginLeft: 6, fontWeight: "500" }}>
                            Combined Sale
                          </Text>
                        )}
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <Text
                          style={{
                            fontSize: 14,
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
                            fontSize: 14,
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
                            <Text style={{ color: "white", fontSize: 13, fontWeight: "600" }}>
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
                        <Text style={{ color: "dimgray", fontSize: 15 }}>
                          {formatMillisForDisplay(
                            workorder.startedOnMillis,
                            new Date(workorder.startedOnMillis).getFullYear() !== new Date().getFullYear()
                          )}
                        </Text>
                        <View style={{ width: 8 }} />
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
                          {!!wipUser && (
                            <Text style={{ color: C.red, fontSize: 11, fontStyle: "italic", marginRight: 5 }}>{wipUser}</Text>
                          )}
                          <Text
                            style={{
                              color: rs.textColor,
                              fontSize: 14,
                              fontWeight: "600",
                            }}
                          >
                            {rs.label}
                          </Text>
                        </View>
                      </View>
                      <WaitTimeIndicator workorder={workorder} />
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
                          style={{ fontSize: 14, color: C.orange }}
                        >
                          {workorder.partSource}
                        </Text>
                      )}
                      {!!(workorder.partOrderedMillis && workorder.partOrderEstimateMillis && Math.round((workorder.partOrderEstimateMillis - workorder.partOrderedMillis) / NUM_MILLIS_IN_DAY) > 0) && (
                        <Text
                          numberOfLines={1}
                          style={{ fontSize: 12, color: "dimgray", marginLeft: 6 }}
                        >
                          {formatMillisForDisplay(workorder.partOrderedMillis)}
                          {" → " + formatMillisForDisplay(workorder.partOrderEstimateMillis)}
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

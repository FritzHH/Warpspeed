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
import { TabMenuDivider as Divider, CheckBox_, SmallLoadingIndicator, Image_, Button_, TextInput_ } from "../../../components";
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
  useCheckoutStore,
  useCustMessagesStore,
} from "../../../stores";
import { dbGetCustomer, dbGetCompletedWorkorder, dbGetCompletedSale, dbSearchCompletedWorkorders, dbGetCustomerMessages, dbListenToNewMessages } from "../../../db_calls_wrapper";
import { readTransaction } from "../modal_screens/newCheckoutModalScreen/newCheckoutFirebaseCalls";
import { ClosedWorkorderModal } from "../modal_screens/ClosedWorkorderModal";


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
  const [sClosedWorkorder, _sSetClosedWorkorder] = useState(null);
  const [sSearching, _sSetSearching] = useState(false);
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

  function getSearchMode(raw) {
    if (!raw) return null;
    let upper = raw.toUpperCase();
    if (upper[0] === "W" && (upper.length === 1 || upper[1] === "O")) return "WO_MODE";
    if (/^\d/.test(raw)) return "NUMBER_MODE";
    if (/^[a-zA-Z]/.test(raw)) return "NAME_MODE";
    return null;
  }

  function formatSearchDisplay(val) {
    let raw = val.replace(/-/g, "");
    let mode = getSearchMode(raw);

    if (mode === "WO_MODE") {
      // Single "W" typed -> autocomplete to "WO-"
      if (raw.length === 1) return "WO-";
      // Auto-capitalize WO prefix
      let formatted = "WO" + raw.slice(2).toUpperCase();
      // Insert dash after WO
      if (formatted.length > 2) formatted = "WO-" + formatted.slice(2);
      // Insert dash after 4 digits (position WO- + 4 digits = index 6 in raw = index 7 in display)
      if (formatted.length > 7) formatted = formatted.slice(0, 7) + "-" + formatted.slice(7);
      return formatted;
    }

    if (mode === "NAME_MODE") {
      // Auto-capitalize first letter of each word
      return raw.replace(/\b\w/g, (c) => c.toUpperCase());
    }

    // NUMBER_MODE or single char - return as-is
    return raw;
  }

  function handleSearchChange(val) {
    // Strip special characters (allow letters, digits, spaces only)
    val = val.replace(/[^a-zA-Z0-9\s-]/g, "");

    // Backspace from "WO-" -> clear completely
    let raw = val.replace(/-/g, "");
    if (sSearchTerm === "WO-" && raw.length < 3) {
      _setSearchTerm("");
      _sSetSearching(false);
      return;
    }

    let digits = raw.replace(/\D/g, "");

    // 13-digit barcode scanner detection (instant scan)
    if (digits.length === 13 && /^\d{13}$/.test(raw)) {
      _setSearchTerm(raw);
      let prefix = digits[0];
      if (prefix === "1") {
        let found = zOpenWorkorders.find((w) => w.id === digits);
        if (found) {
          useOpenWorkordersStore.getState().setOpenWorkorderID(found.id);
          if (found.customerID) {
            dbGetCustomer(found.customerID).then((c) => {
              if (c) useCurrentCustomerStore.getState().setCustomer(c, false);
            });
            if (found.customerCell) fetchCustomerMessages(found.customerCell);
          }
          useTabNamesStore.getState().setItems({
            infoTabName: TAB_NAMES.infoTab.workorder,
            itemsTabName: TAB_NAMES.itemsTab.workorderItems,
            optionsTabName: TAB_NAMES.optionsTab.inventory,
          });
          _setSearchTerm("");
        } else {
          dbGetCompletedWorkorder(digits).then((wo) => {
            if (wo) {
              let store = useOpenWorkordersStore.getState();
              store.setWorkorder(wo, false);
              store.setLockedWorkorderID(wo.id);
              store.setOpenWorkorderID(wo.id);
              useTabNamesStore.getState().setItems({
                infoTabName: TAB_NAMES.infoTab.workorder,
                itemsTabName: TAB_NAMES.itemsTab.workorderItems,
                optionsTabName: TAB_NAMES.optionsTab.inventory,
              });
              if (wo.customerID) {
                dbGetCustomer(wo.customerID).then((c) => {
                  if (c) useCurrentCustomerStore.getState().setCustomer(c, false);
                });
                if (wo.customerCell) fetchCustomerMessages(wo.customerCell);
              }
            }
            _setSearchTerm("");
          });
        }
        return;
      } else if (prefix === "3") {
        readTransaction(digits).then((txn) => {
          if (txn?.saleID) {
            useCheckoutStore.getState().setStringOnly(txn.saleID);
          }
          _setSearchTerm("");
        });
        return;
      } else if (prefix === "4") {
        useCheckoutStore.getState().setStringOnly(digits);
        _setSearchTerm("");
        return;
      }
    }

    // Format for display and store
    let display = formatSearchDisplay(val);
    _setSearchTerm(display);
    _sSetSearching(false);

    let mode = getSearchMode(raw);

    // Remote search triggers
    if (mode === "WO_MODE") {
      let woRaw = "WO" + raw.slice(2).toUpperCase();
      // Full WO number = 11 chars (WO + 4 digits + 3 month + 2 year)
      if (woRaw.length >= 11) {
        let localMatches = zOpenWorkorders.filter((wo) =>
          (wo.workorderNumber || "").toUpperCase().includes(woRaw)
        );
        if (localMatches.length === 0) {
          _sSetSearching(true);
          dbSearchCompletedWorkorders("workorderNumber", woRaw).then((results) => {
            _sSetSearching(false);
            if (results && results.length > 0) {
              _sSetClosedWorkorder(results[0]);
            }
          });
        }
      }
    } else if (mode === "NUMBER_MODE") {
      // 12+ digits with no local ID match -> remote pull by ID
      if (digits.length >= 12) {
        let localIDMatch = zOpenWorkorders.find((wo) => (wo.id || "").includes(digits));
        if (!localIDMatch) {
          _sSetSearching(true);
          dbGetCompletedWorkorder(digits).then((wo) => {
            if (wo) {
              _sSetSearching(false);
              _sSetClosedWorkorder(wo);
            } else if (digits.length >= 10) {
              // Also try phone search if no ID match
              let phone = digits.slice(0, 10);
              dbSearchCompletedWorkorders("customerCell", phone).then((results) => {
                _sSetSearching(false);
                if (results && results.length > 0) {
                  _sSetClosedWorkorder(results[0]);
                }
              });
            } else {
              _sSetSearching(false);
            }
          });
        }
      } else if (digits.length >= 10) {
        // 10+ digits with no local phone match -> remote phone search
        let phone = digits.slice(0, 10);
        let localPhoneMatch = zOpenWorkorders.find((wo) => {
          let woPhone = (wo.customerCell || "").replace(/\D/g, "");
          return woPhone.includes(phone);
        });
        if (!localPhoneMatch) {
          _sSetSearching(true);
          dbSearchCompletedWorkorders("customerCell", phone).then((results) => {
            _sSetSearching(false);
            if (results && results.length > 0) {
              _sSetClosedWorkorder(results[0]);
            }
          });
        }
      }
    }
  }

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
    let raw = sSearchTerm.replace(/-/g, "");
    let mode = getSearchMode(raw);

    if (mode === "WO_MODE") {
      // Search starts at 4+ chars total (WO + 2 digits)
      if (raw.length < 4) return workorders;
      let woRaw = "WO" + raw.slice(2).toUpperCase();
      return workorders.filter((wo) =>
        (wo.workorderNumber || "").toUpperCase().includes(woRaw)
      );
    }

    if (mode === "NUMBER_MODE") {
      if (raw.length < 2) return workorders;
      let digits = raw.replace(/\D/g, "");
      return workorders.filter((wo) => {
        let phone = (wo.customerCell || "").replace(/\D/g, "");
        return (wo.id || "").includes(digits) || (digits.length >= 2 && phone.includes(digits));
      });
    }

    if (mode === "NAME_MODE") {
      if (raw.length < 2) return workorders;
      let parts = raw.toLowerCase().split(/\s+/).filter(Boolean);
      if (parts.length === 0) return workorders;
      return workorders.filter((wo) => {
        let first = (wo.customerFirst || "").toLowerCase();
        let last = (wo.customerLast || "").toLowerCase();
        let email = (wo.customerEmail || "").toLowerCase();
        return parts.some((part) => first.includes(part) || last.includes(part) || email.includes(part));
      });
    }

    // PENDING_WO (single "W") or unknown - show all
    return workorders;
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
              _sSetClosedWorkorder(null);
              _sSetSearching(false);
            }}
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
        data={filterWorkorders(sortWorkorders(zOpenWorkorders.filter((wo) => !!wo.customerID)))}
        keyExtractor={(item, index) => index}
        ListEmptyComponent={() => (
          <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 30 }}>
            {!zWorkordersLoaded ? (
              <SmallLoadingIndicator message="Loading workorders...." size={40} textStyle={{ fontSize: 16 }} />
            ) : sSearching ? (
              <SmallLoadingIndicator message="Searching..." size={30} textStyle={{ fontSize: 14 }} />
            ) : sSearchTerm.replace(/-/g, "").length >= 2 ? (
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
                      ? lightenRGBByPercent(C.lightred, 60)
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
                            fontSize: 13,
                            color: "dimgray",
                          }}
                        >
                          {capitalizeFirstLetterOfString(workorder.customerFirst) + " " + capitalizeFirstLetterOfString(workorder.customerLast)}
                        </Text>
                        {(() => {
                          let sale = workorder.activeSaleID ? zActiveSales.find((s) => s.id === workorder.activeSaleID) : null;
                          let paid = sale ? (sale.amountCaptured || 0) - (sale.amountRefunded || 0) : 0;
                          return paid > 0 ? (
                            <Text style={{ fontSize: 12, color: C.green, marginLeft: 6, fontWeight: "500" }}>
                              {"Paid $" + formatCurrencyDisp(paid)}
                            </Text>
                          ) : null;
                        })()}
                        {!!workorder.activeSaleID && linkedSaleIDs.has(workorder.activeSaleID) && (
                          <Text style={{ fontSize: 12, color: C.orange, marginLeft: 6, fontWeight: "500" }}>
                            Combined Sale
                          </Text>
                        )}
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
      <ClosedWorkorderModal
        workorder={sClosedWorkorder}
        onClose={() => _sSetClosedWorkorder(null)}
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

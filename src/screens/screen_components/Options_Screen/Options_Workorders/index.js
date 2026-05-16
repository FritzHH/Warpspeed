/* eslint-disable */
import { View } from "react-native-web";
import { gray } from "../../../../utils";
import { Button_, TextInput_ } from "../../../../components";
import { C, ICONS } from "../../../../styles";
import { TAB_NAMES } from "../../../../data";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  useCurrentCustomerStore,
  useLoginStore,
  useOpenWorkordersStore,
  useSettingsStore,
  useTabNamesStore,
  useActiveSalesStore,
  useWorkorderPreviewStore,
  useCustMessagesStore,
} from "../../../../stores";
import { dbGetCustomer, dbGetCustomerMessages, dbListenToNewMessages } from "../../../../db_calls_wrapper";
import { scoreWorkorder, sortWorkorders } from "./utils";
import WorkorderRowItem from "./WorkorderRowItem";
import EmptyState from "./EmptyState";

export function WorkordersComponent({}) {
  const zOpenWorkorders = useOpenWorkordersStore((state) => state.workorders);
  const zWorkordersLoaded = useOpenWorkordersStore((state) => state.workordersLoaded);
  const zOpenWorkorderID = useOpenWorkordersStore((state) => state.openWorkorderID);
  const zPreviewID = useOpenWorkordersStore((state) => state.workorderPreviewID);
  const zActiveSales = useActiveSalesStore((state) => state.activeSales);
  const [sSearchTerm, _setSearchTerm] = useState("");

  const hasRehydratedMsgsRef = useRef(false);
  useEffect(() => {
    if (hasRehydratedMsgsRef.current) return;
    if (!zOpenWorkorderID || !zOpenWorkorders.length) return;
    let wo = zOpenWorkorders.find((o) => o.id === zOpenWorkorderID);
    if (!wo?.customerCell) return;
    hasRehydratedMsgsRef.current = true;
    useCustMessagesStore.getState().setMessagesPhone(null);
    fetchCustomerMessages(wo.customerCell);
  }, [zOpenWorkorderID, zOpenWorkorders]);

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

    let cached = msgStore.getHubCachedThread(customerCell);
    if (cached && cached.messages.length > 0) {
      let recent = cached.messages.slice(-7);
      msgStore.setMessages(recent);
      msgStore.setMessagesHasMore(cached.messages.length > 7 || !cached.noMoreHistory);
      if (recent.length > 0) msgStore.setMessagesNextCursor(recent[0].millis);
      setupCustomerMessageListener(customerCell, cached.messages);
      return;
    }

    msgStore.setMessagesLoading(true);
    (async () => {
      try {
        const { getMessages } = await import("../../../../hubMessageDB");
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
    preHoverItemsTabRef.current = null;
    if (enterTimerRef.current) { clearTimeout(enterTimerRef.current); enterTimerRef.current = null; }
    if (exitTimerRef.current) { clearTimeout(exitTimerRef.current); exitTimerRef.current = null; }
    useOpenWorkordersStore.getState().setWorkorderPreviewID(null);

    const store = useOpenWorkordersStore.getState();
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
    if (obj.customerID) {
      dbGetCustomer(obj.customerID).then((customer) => {
        if (customer) useCurrentCustomerStore.getState().setCustomer(customer, false);
      });
      if (obj.customerCell) fetchCustomerMessages(obj.customerCell);
    }
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
    const statuses = useSettingsStore.getState().settings?.statuses || [];
    const currentUser = useLoginStore.getState().getCurrentUser();
    return sortWorkorders(customerWorkorders, statuses, currentUser);
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

      <div style={{ width: "100%", flex: 1, overflowY: "auto" }}>
        {sortedData.length === 0 ? (
          <EmptyState isLoaded={zWorkordersLoaded} hasSearchTerm={!!sSearchTerm.trim()} />
        ) : (
          sortedData.map((workorder) => {
            let sale = workorder.activeSaleID ? zActiveSales.find((s) => s.id === workorder.activeSaleID) : null;
            let paidAmount = sale ? (sale.amountCaptured || 0) - (sale.amountRefunded || 0) : 0;
            return (
              <WorkorderRowItem
                key={workorder.id}
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
          })
        )}
      </div>
    </View>
  );
}

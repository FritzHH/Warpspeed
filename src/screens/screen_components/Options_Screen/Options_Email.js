/* eslint-disable */

import { View, Text, TouchableOpacity, FlatList, ActivityIndicator } from "react-native-web";
import React, { useState, useCallback, useMemo } from "react";
import { C, COLOR_GRADIENTS, Fonts, ICONS } from "../../../styles";
import { Button_, Image_, TabMenuButton, Tooltip } from "../../../components";
import { useEmailStore, useLoginStore, useSettingsStore, useTabNamesStore } from "../../../stores";
import { TAB_NAMES } from "../../../data";
import { dbGmailDisconnect, dbGmailModifyLabels } from "../../../db_calls_wrapper";
import { buildSignOffHtml } from "../Items_Screen/Items_EmailView";
import { log, gray, lightenRGBByPercent } from "../../../utils";
import dayjs from "dayjs";

const FOLDERS = [
  { key: "INBOX", label: "Inbox" },
  { key: "SENT", label: "Sent" },
  { key: "DRAFT", label: "Drafts" },
  { key: "TRASH", label: "Trash" },
  { key: "SPAM", label: "Spam" },
  { key: "ALL", label: "All Mail" },
];

export const EmailOptionsPanel = React.memo(() => {
  const zActiveAccountKey = useEmailStore((state) => state.activeAccountKey);
  const zActiveFolder = useEmailStore((state) => state.activeFolder);
  const zEmailAuth = useEmailStore((state) => state.emailAuth);
  const zEmails = useEmailStore((state) => state.emails);
  const zEmailsLoading = useEmailStore((state) => state.emailsLoading);
  const zSelectedThreadId = useEmailStore((state) => state.selectedThreadId);
  const zSettings = useSettingsStore((state) => state.settings);

  const zThreadedEmails = useMemo(() => {
    const accountEmails = zEmails.filter((e) => e.accountKey === zActiveAccountKey);
    const threadMap = {};
    accountEmails.forEach((email) => {
      const tid = email.threadId || email.id;
      if (!threadMap[tid]) {
        threadMap[tid] = {
          threadId: tid, subject: email.subject, from: email.from,
          fromName: email.fromName, snippet: email.snippet,
          internalDate: email.internalDate, isUnread: email.isUnread,
          messageCount: 1, latestMessage: email,
          allLabels: new Set(email.labelIds || []),
        };
      } else {
        threadMap[tid].messageCount++;
        if (email.isUnread) threadMap[tid].isUnread = true;
        (email.labelIds || []).forEach((l) => threadMap[tid].allLabels.add(l));
        if (email.internalDate > threadMap[tid].internalDate) {
          threadMap[tid].internalDate = email.internalDate;
          threadMap[tid].snippet = email.snippet;
          threadMap[tid].from = email.from;
          threadMap[tid].fromName = email.fromName;
          threadMap[tid].latestMessage = email;
        }
      }
    });
    let threads = Object.values(threadMap);
    const folderLabel = zActiveFolder === "ALL" ? null : (zActiveFolder === "DRAFT" ? "DRAFT" : zActiveFolder);
    if (folderLabel) {
      threads = threads.filter((t) => t.allLabels.has(folderLabel));
    }
    return threads.sort((a, b) => (b.internalDate || 0) - (a.internalDate || 0));
  }, [zEmails, zActiveAccountKey, zActiveFolder]);

  const [sHoveredThreadId, _sSetHoveredThreadId] = useState(null);

  const currentUser = useLoginStore((state) => state.currentUser);
  const userInboxes = currentUser?.emailInboxes || [];
  const allEmailAccounts = zSettings?.emailAccounts || [];
  const emailAccounts = allEmailAccounts.filter((a) => userInboxes.includes(a.accountKey));
  const connectedAccounts = emailAccounts.filter((a) => zEmailAuth?.[a.accountKey]?.status === "connected");
  const anyConnected = connectedAccounts.length > 0;
  const activeAuth = zEmailAuth?.[zActiveAccountKey];
  const isConnected = activeAuth?.status === "connected";

  if (anyConnected && !emailAccounts.some((a) => a.accountKey === zActiveAccountKey)) {
    useEmailStore.getState().setActiveAccountKey(connectedAccounts[0].accountKey);
  }


  function handleSelectThread(threadId) {
    useEmailStore.getState().setSelectedThreadId(threadId);
    useEmailStore.getState().setComposeMode(null);
    useTabNamesStore.getState().setItemsTabName(TAB_NAMES.itemsTab.emailView);
    const unreadIds = zEmails
      .filter((e) => e.threadId === threadId && e.accountKey === zActiveAccountKey && e.isUnread)
      .map((e) => e.id);
    if (unreadIds.length > 0) {
      dbGmailModifyLabels(unreadIds, [], ["UNREAD"]);
    }
  }

  function handleCompose() {
    useEmailStore.getState().clearComposeDraft();
    let signOff = buildSignOffHtml(zActiveAccountKey);
    if (signOff) useEmailStore.getState().updateComposeDraft({ bodyHtml: signOff });
    useEmailStore.getState().setComposeMode("new");
    useEmailStore.getState().setSelectedThreadId(null);
    useTabNamesStore.getState().setItemsTabName(TAB_NAMES.itemsTab.emailView);
  }

  function optimisticLabelUpdate(messageIds, addLabelIds, removeLabelIds) {
    const updated = zEmails.map((e) => {
      if (!messageIds.includes(e.id)) return e;
      let labels = [...(e.labelIds || [])];
      (removeLabelIds || []).forEach((l) => { labels = labels.filter((x) => x !== l); });
      (addLabelIds || []).forEach((l) => { if (!labels.includes(l)) labels.push(l); });
      return { ...e, labelIds: labels, isUnread: labels.includes("UNREAD") };
    });
    useEmailStore.getState().setEmails(updated);
  }

  function handleTrashThread(threadId) {
    const messageIds = zEmails
      .filter((e) => e.threadId === threadId && e.accountKey === zActiveAccountKey)
      .map((e) => e.id);
    if (messageIds.length === 0) return;
    optimisticLabelUpdate(messageIds, ["TRASH"], ["INBOX"]);
    dbGmailModifyLabels(messageIds, ["TRASH"], ["INBOX"]);
  }

  function handleArchiveThread(threadId) {
    const messageIds = zEmails
      .filter((e) => e.threadId === threadId && e.accountKey === zActiveAccountKey)
      .map((e) => e.id);
    if (messageIds.length === 0) return;
    optimisticLabelUpdate(messageIds, [], ["INBOX"]);
    dbGmailModifyLabels(messageIds, [], ["INBOX"]);
  }

  function handleFolderPress(folderKey) {
    useEmailStore.getState().setActiveFolder(folderKey);
  }

  function handleAccountSwitch(accountKey) {
    useEmailStore.getState().setActiveAccountKey(accountKey);
  }

  const renderEmailItem = useCallback(({ item }) => {
    const isSelected = item.threadId === zSelectedThreadId;
    const dateStr = item.internalDate
      ? dayjs(item.internalDate).format(
          dayjs(item.internalDate).isSame(dayjs(), "day") ? "h:mm A" : "MMM D"
        )
      : "";
    const isHovered = sHoveredThreadId === item.threadId;
    return (
      <View
        onMouseEnter={() => _sSetHoveredThreadId(item.threadId)}
        onMouseLeave={() => _sSetHoveredThreadId(null)}
        style={{
          flexDirection: "row",
          borderBottomWidth: 1,
          borderBottomColor: gray(0.12),
          backgroundColor: isSelected ? lightenColor(C.orange, 0.85) : "transparent",
          opacity: isHovered && !isSelected ? 0.6 : 1,
        }}
      >
        <TouchableOpacity
          onPress={() => handleSelectThread(item.threadId)}
          style={{ flex: 1, paddingVertical: 10, paddingLeft: 12 }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text
              numberOfLines={1}
              style={{
                fontSize: 13,
                fontWeight: item.isUnread ? Fonts.weight.textSuperheavy : Fonts.weight.textRegular,
                color: C.text,
                flex: 1,
                marginRight: 8,
              }}
            >
              {item.fromName || item.from || "Unknown"}
            </Text>
            <Text style={{ fontSize: 11, color: gray(0.5), flexShrink: 0 }}>{dateStr}</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
            {item.isUnread && (
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: C.blue,
                  marginRight: 6,
                  flexShrink: 0,
                }}
              />
            )}
            <Text
              numberOfLines={1}
              style={{
                fontSize: 13,
                fontWeight: item.isUnread ? Fonts.weight.textHeavy : Fonts.weight.textRegular,
                color: C.text,
                flex: 1,
              }}
            >
              {item.subject || "(no subject)"}
            </Text>
            {item.messageCount > 1 && (
              <View
                style={{
                  backgroundColor: gray(0.15),
                  borderRadius: 8,
                  paddingHorizontal: 5,
                  paddingVertical: 1,
                  marginLeft: 6,
                }}
              >
                <Text style={{ fontSize: 10, color: gray(0.4) }}>{item.messageCount}</Text>
              </View>
            )}
          </View>
          <Text
            numberOfLines={1}
            style={{ fontSize: 12, color: gray(0.5), marginTop: 2 }}
          >
            {item.snippet || ""}
          </Text>
        </TouchableOpacity>
        <View style={{ justifyContent: "center", alignItems: "center", paddingHorizontal: 6 }}>
          <Tooltip text="Trash" position="left">
            <TouchableOpacity
              onPress={() => handleTrashThread(item.threadId)}
              style={{ padding: 4 }}
            >
              <Image_ icon={ICONS.trash} size={18} />
            </TouchableOpacity>
          </Tooltip>
          <Tooltip text="Archive" position="left">
            <TouchableOpacity
              onPress={() => handleArchiveThread(item.threadId)}
              style={{ padding: 4, marginTop: 4 }}
            >
              <Image_ icon={ICONS.archive} size={18} />
            </TouchableOpacity>
          </Tooltip>
        </View>
      </View>
    );
  }, [zSelectedThreadId, zEmails, zActiveAccountKey, sHoveredThreadId]);

  if (zEmailAuth === null) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color={C.blue} />
      </View>
    );
  }

  if (!anyConnected) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 20 }}>
        <Image_ icon={ICONS.paperPlane} size={48} style={{ marginBottom: 16, opacity: 0.4 }} />
        <Text style={{ fontSize: 16, fontWeight: Fonts.weight.textHeavy, color: C.text, marginBottom: 8 }}>
          No Connected Inboxes
        </Text>
        <Text style={{ fontSize: 13, color: gray(0.5), textAlign: "center" }}>
          {emailAccounts.length > 0
            ? "Your assigned email accounts have not been authorized yet. Authorize them in Dashboard → Email Options."
            : "No email accounts have been assigned to you. Contact an admin to configure access in Dashboard → Email Options."}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {/* Account switcher */}
      <View style={{ flexDirection: "row", marginTop: 8, marginBottom: 8 }}>
        {connectedAccounts.map((acct) => (
          <AccountTabButton
            key={acct.accountKey}
            label={acct.displayName}
            isSelected={zActiveAccountKey === acct.accountKey}
            unreadCount={zEmailAuth?.[acct.accountKey]?.unreadCount || 0}
            onPress={() => handleAccountSwitch(acct.accountKey)}
          />
        ))}
      </View>

      {/* Folder buttons + action buttons */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {FOLDERS.map((folder) => {
            const isActive = zActiveFolder === folder.key;
            const unreadCount =
              folder.key === "INBOX" ? zEmailAuth?.[zActiveAccountKey]?.unreadCount || 0 : 0;
            const label = unreadCount > 0 ? `${folder.label} (${unreadCount > 99 ? "99+" : unreadCount})` : folder.label;
            return (
              <TabMenuButton
                key={folder.key}
                onPress={() => handleFolderPress(folder.key)}
                text={label}
                isSelected={isActive}
              />
            );
          })}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", paddingRight: 8 }}>
          <TouchableOpacity
            onPress={handleCompose}
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: C.green,
              paddingVertical: 6,
              paddingHorizontal: 14,
              borderRadius: 8,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: Fonts.weight.textHeavy, color: C.textWhite }}>
              + Compose
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Divider */}
      <View style={{ height: 1, backgroundColor: gray(0.12) }} />

      {/* Email list */}
      {zEmailsLoading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={C.blue} />
        </View>
      ) : zThreadedEmails.length === 0 ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 20 }}>
          <Text style={{ fontSize: 14, color: gray(0.5) }}>No emails in this folder</Text>
        </View>
      ) : (
        <FlatList
          data={zThreadedEmails}
          renderItem={renderEmailItem}
          keyExtractor={(item) => item.threadId}
          style={{ flex: 1 }}
        />
      )}
    </View>
  );
});

const AccountTabButton = ({ label, isSelected, unreadCount, onPress }) => {
  const [sHovered, _sSetHovered] = useState(false);
  return (
    <TouchableOpacity
      onPress={onPress}
      onMouseEnter={() => _sSetHovered(true)}
      onMouseLeave={() => _sSetHovered(false)}
      activeOpacity={0.8}
      style={{
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 8,
        backgroundColor: isSelected ? C.orange : lightenRGBByPercent(C.orange, 60),
        opacity: sHovered && !isSelected ? 0.7 : 1,
      }}
    >
      <Text style={{ fontSize: 13, fontWeight: Fonts.weight.textHeavy, color: C.textWhite }}>{label}</Text>
      {unreadCount > 0 && (
        <View
          style={{
            backgroundColor: "white",
            borderRadius: 9,
            minWidth: 18,
            height: 18,
            justifyContent: "center",
            alignItems: "center",
            paddingHorizontal: 5,
            marginLeft: 6,
          }}
        >
          <Text style={{ fontSize: 11, color: gray(0.4), fontWeight: Fonts.weight.textHeavy }}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

function lightenColor(hex, factor) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lr = Math.round(r + (255 - r) * factor);
  const lg = Math.round(g + (255 - g) * factor);
  const lb = Math.round(b + (255 - b) * factor);
  return `rgb(${lr},${lg},${lb})`;
}

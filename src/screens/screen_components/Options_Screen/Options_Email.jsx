/* eslint-disable */

import React, { useState, useCallback, useMemo } from "react";
import { C, Fonts, ICONS } from "../../../styles";
import { Tooltip } from "../../../dom_components";
import { TabMenuButton } from "../../../dom_components/TabMenuButton/TabMenuButton";
import { useEmailStore, useLoginStore, useSettingsStore, useTabNamesStore } from "../../../stores";
import { TAB_NAMES } from "../../../data";
import { dbGmailDisconnect, dbGmailModifyLabels } from "../../../db_calls_wrapper";
import { buildSignOffHtml } from "../Items_Screen/emailSignOff";
import { log, lightenRGBByPercent } from "../../../utils";
import dayjs from "dayjs";
import styles from "./OptionsEmail.module.css";

const FOLDERS = [
  { key: "INBOX", label: "Inbox" },
  { key: "SENT", label: "Sent" },
  { key: "DRAFT", label: "Drafts" },
  { key: "TRASH", label: "Trash" },
  { key: "SPAM", label: "Spam" },
  { key: "ALL", label: "All Mail" },
];

const SEARCH_MIN_CHARS = 3;

function extractEmailAddr(headerVal) {
  if (!headerVal) return "";
  const m = headerVal.match(/<([^>]+)>/);
  return (m ? m[1] : headerVal).trim().toLowerCase();
}

function detectForwardedFrom(thread, ownEmail) {
  if (!thread) return "";
  const own = (ownEmail || "").toLowerCase();
  const deliveredAddrs = (thread.deliveredTo || []).map(extractEmailAddr).filter(Boolean);
  const mismatch = deliveredAddrs.find((addr) => addr && addr !== own);
  if (mismatch) return mismatch;
  const xff = extractEmailAddr(thread.xForwardedFor);
  if (xff && xff !== own) return xff;
  const resent = extractEmailAddr(thread.resentFrom);
  if (resent) return resent;
  return "";
}

// Per-inbox badge colors used in search results. Assigned by index of
// connectedAccounts; cycles if a user somehow has > 8 connected inboxes.
const ACCOUNT_BADGE_COLORS = [
  { bg: "blue",   fg: "white" },
  { bg: "yellow", fg: "black" },
  { bg: "green",  fg: "white" },
  { bg: "orange", fg: "white" },
  { bg: "red",    fg: "white" },
  { bg: "maroon", fg: "white" },
  { bg: "purple", fg: "white" },
  { bg: "pink",   fg: "black" },
];

export const EmailOptionsPanel = React.memo(() => {
  const zActiveAccountKey = useEmailStore((state) => state.activeAccountKey);
  const zActiveFolder = useEmailStore((state) => state.activeFolder);
  const zEmailAuth = useEmailStore((state) => state.emailAuth);
  const zEmails = useEmailStore((state) => state.emails);
  const zEmailsLoading = useEmailStore((state) => state.emailsLoading);
  const zSelectedThreadId = useEmailStore((state) => state.selectedThreadId);
  const zSettings = useSettingsStore((state) => state.settings);

  const currentUser = useLoginStore((state) => state.currentUser);
  const userInboxes = currentUser?.emailInboxes || [];
  const allEmailAccounts = zSettings?.emailAccounts || [];
  const emailAccounts = allEmailAccounts.filter((a) => userInboxes.includes(a.accountKey));
  const connectedAccounts = emailAccounts.filter((a) => zEmailAuth?.[a.accountKey]?.status === "connected");
  const anyConnected = connectedAccounts.length > 0;
  const activeAuth = zEmailAuth?.[zActiveAccountKey];
  const isConnected = activeAuth?.status === "connected";

  const connectedAccountKeysStr = connectedAccounts
    .map((a) => a.accountKey)
    .sort()
    .join(",");

  const [sHoveredThreadId, _sSetHoveredThreadId] = useState(null);
  const [sSearchTerm, _sSetSearchTerm] = useState("");

  const isSearchActive = sSearchTerm.trim().length >= SEARCH_MIN_CHARS;

  const connectedAccountsSig = connectedAccounts
    .map((a) => `${a.accountKey}|${a.displayName || ""}`)
    .sort()
    .join(",");

  const accountBadgeMap = useMemo(() => {
    const map = {};
    connectedAccounts.forEach((a, i) => {
      const color = ACCOUNT_BADGE_COLORS[i % ACCOUNT_BADGE_COLORS.length];
      map[a.accountKey] = { ...color, label: a.displayName || a.accountKey };
    });
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectedAccountsSig]);

  const accountEmailMap = useMemo(() => {
    const map = {};
    connectedAccounts.forEach((a) => {
      if (a.email) map[a.accountKey] = a.email.toLowerCase();
    });
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectedAccountsSig]);

  const zThreadedEmails = useMemo(() => {
    const term = sSearchTerm.trim().toLowerCase();
    const isSearching = term.length >= SEARCH_MIN_CHARS;
    const searchAccountKeys = isSearching
      ? new Set(connectedAccountKeysStr ? connectedAccountKeysStr.split(",") : [])
      : null;

    const filtered = zEmails.filter((e) => {
      if (isSearching) {
        if (!searchAccountKeys.has(e.accountKey)) return false;
        const haystack = [e.subject, e.fromName, e.from, e.snippet]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(term);
      }
      return e.accountKey === zActiveAccountKey;
    });

    const threadMap = {};
    filtered.forEach((email) => {
      const tid = email.threadId || email.id;
      const key = `${email.accountKey}:${tid}`;
      if (!threadMap[key]) {
        threadMap[key] = {
          threadId: tid, accountKey: email.accountKey,
          subject: email.subject, from: email.from,
          fromName: email.fromName, snippet: email.snippet,
          internalDate: email.internalDate, isUnread: email.isUnread,
          messageCount: 1, latestMessage: email,
          allLabels: new Set(email.labelIds || []),
          deliveredTo: email.deliveredTo || [],
          xForwardedFor: email.xForwardedFor || "",
          xForwardedTo: email.xForwardedTo || "",
          resentFrom: email.resentFrom || "",
        };
      } else {
        threadMap[key].messageCount++;
        if (email.isUnread) threadMap[key].isUnread = true;
        (email.labelIds || []).forEach((l) => threadMap[key].allLabels.add(l));
        if (email.internalDate > threadMap[key].internalDate) {
          threadMap[key].internalDate = email.internalDate;
          threadMap[key].snippet = email.snippet;
          threadMap[key].from = email.from;
          threadMap[key].fromName = email.fromName;
          threadMap[key].latestMessage = email;
          threadMap[key].deliveredTo = email.deliveredTo || [];
          threadMap[key].xForwardedFor = email.xForwardedFor || "";
          threadMap[key].xForwardedTo = email.xForwardedTo || "";
          threadMap[key].resentFrom = email.resentFrom || "";
        }
      }
    });

    let threads = Object.values(threadMap);
    if (!isSearching) {
      const folderLabel = zActiveFolder === "ALL" ? null : (zActiveFolder === "DRAFT" ? "DRAFT" : zActiveFolder);
      if (folderLabel) {
        threads = threads.filter((t) => t.allLabels.has(folderLabel));
      }
    }
    return threads.sort((a, b) => (b.internalDate || 0) - (a.internalDate || 0));
  }, [zEmails, zActiveAccountKey, zActiveFolder, sSearchTerm, connectedAccountKeysStr]);

  const searchHeader = (
    <div className={styles.searchHeader}>
      <button
        type="button"
        className={`${styles.searchIconBtn} ${styles.searchResetBtn}`}
        onClick={() => _sSetSearchTerm("")}
        disabled={!sSearchTerm}
      >
        <img src={ICONS.reset1} alt="" className={styles.searchIcon} />
      </button>
      <input
        type="text"
        className={styles.searchInput}
        placeholder="Search email"
        value={sSearchTerm}
        onChange={(e) => _sSetSearchTerm(e.target.value)}
      />
    </div>
  );

  if (anyConnected && !emailAccounts.some((a) => a.accountKey === zActiveAccountKey)) {
    useEmailStore.getState().setActiveAccountKey(connectedAccounts[0].accountKey);
  }


  function handleSelectThread(threadId, threadAccountKey) {
    const acctKey = threadAccountKey || zActiveAccountKey;
    if (threadAccountKey && threadAccountKey !== zActiveAccountKey) {
      useEmailStore.getState().setActiveAccountKey(threadAccountKey);
    }
    useEmailStore.getState().setSelectedThreadId(threadId);
    useEmailStore.getState().setComposeMode(null);
    useTabNamesStore.getState().setItemsTabName(TAB_NAMES.itemsTab.emailView);
    const unreadIds = zEmails
      .filter((e) => e.threadId === threadId && e.accountKey === acctKey && e.isUnread)
      .map((e) => e.id);
    if (unreadIds.length > 0) {
      dbGmailModifyLabels(unreadIds, [], ["UNREAD"], acctKey);
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

  function handleTrashThread(threadId, threadAccountKey) {
    const acctKey = threadAccountKey || zActiveAccountKey;
    const messageIds = zEmails
      .filter((e) => e.threadId === threadId && e.accountKey === acctKey)
      .map((e) => e.id);
    if (messageIds.length === 0) return;
    optimisticLabelUpdate(messageIds, ["TRASH"], ["INBOX"]);
    dbGmailModifyLabels(messageIds, ["TRASH"], ["INBOX"], acctKey);
  }

  function handleArchiveThread(threadId, threadAccountKey) {
    const acctKey = threadAccountKey || zActiveAccountKey;
    const messageIds = zEmails
      .filter((e) => e.threadId === threadId && e.accountKey === acctKey)
      .map((e) => e.id);
    if (messageIds.length === 0) return;
    optimisticLabelUpdate(messageIds, [], ["INBOX"]);
    dbGmailModifyLabels(messageIds, [], ["INBOX"], acctKey);
  }

  function handleFolderPress(folderKey) {
    useEmailStore.getState().setActiveFolder(folderKey);
  }

  function handleAccountSwitch(accountKey) {
    useEmailStore.getState().setActiveAccountKey(accountKey);
  }

  const renderEmailItem = useCallback((item) => {
    const isSelected = item.threadId === zSelectedThreadId
      && (!isSearchActive || item.accountKey === zActiveAccountKey);
    const rowKey = isSearchActive ? `${item.accountKey}:${item.threadId}` : item.threadId;
    const hoverKey = rowKey;
    const dateStr = item.internalDate
      ? dayjs(item.internalDate).format(
          dayjs(item.internalDate).isSame(dayjs(), "day") ? "h:mm A" : "MMM D"
        )
      : "";
    const isHovered = sHoveredThreadId === hoverKey;
    const badge = isSearchActive ? accountBadgeMap[item.accountKey] : null;
    const forwardedFrom = detectForwardedFrom(item, accountEmailMap[item.accountKey]);
    return (
      <div
        key={rowKey}
        className={styles.emailRow}
        onMouseEnter={() => _sSetHoveredThreadId(hoverKey)}
        onMouseLeave={() => _sSetHoveredThreadId(null)}
        style={{
          background: isSelected ? lightenColor(C.orange, 0.85) : "transparent",
          opacity: isHovered && !isSelected ? 0.6 : 1,
        }}
      >
        <button
          type="button"
          className={styles.emailRowBody}
          onClick={() => handleSelectThread(item.threadId, item.accountKey)}
        >
          <div className={styles.emailRowTopLine}>
            {badge && (
              <span
                className={styles.acctBadgeChip}
                style={{ background: badge.bg, color: badge.fg }}
              >
                {badge.label}
              </span>
            )}
            <span
              className={`${styles.emailRowFrom} ${item.isUnread ? styles.emailRowFromUnread : ""}`}
              style={{ color: C.text }}
            >
              {item.fromName || item.from || "Unknown"}
            </span>
            <span className={styles.emailRowDate}>{dateStr}</span>
          </div>
          <div className={styles.emailRowMidLine}>
            {item.isUnread && (
              <span className={styles.unreadDot} style={{ background: C.blue }} />
            )}
            <span
              className={`${styles.emailRowSubject} ${item.isUnread ? styles.emailRowSubjectUnread : ""}`}
              style={{ color: C.text }}
            >
              {item.subject || "(no subject)"}
            </span>
            {item.messageCount > 1 && (
              <span className={styles.msgCountChip}>
                <span className={styles.msgCountChipText}>{item.messageCount}</span>
              </span>
            )}
            {forwardedFrom && (
              <Tooltip text={`Forwarded from ${forwardedFrom}`} position="left">
                <span className={styles.fwdChip}>Fwd: {forwardedFrom}</span>
              </Tooltip>
            )}
          </div>
          <span className={styles.emailRowSnippet}>{item.snippet || ""}</span>
        </button>
        <div className={styles.emailRowActions}>
          <Tooltip text="Trash" position="left">
            <button
              type="button"
              className={styles.actionIconBtn}
              onClick={() => handleTrashThread(item.threadId, item.accountKey)}
            >
              <img src={ICONS.trash} alt="" className={styles.actionIcon} />
            </button>
          </Tooltip>
          <Tooltip text="Archive" position="left">
            <button
              type="button"
              className={styles.actionIconBtn}
              onClick={() => handleArchiveThread(item.threadId, item.accountKey)}
            >
              <img src={ICONS.archive} alt="" className={styles.actionIcon} />
            </button>
          </Tooltip>
        </div>
      </div>
    );
  }, [zSelectedThreadId, zEmails, zActiveAccountKey, sHoveredThreadId, isSearchActive, accountBadgeMap, accountEmailMap]);

  if (zEmailAuth === null) {
    return (
      <div className={styles.container}>
        {searchHeader}
        <div className={styles.centerState}>
          <span
            className={styles.spinner}
            style={{ width: 40, height: 40, borderWidth: 4, color: C.blue }}
          />
        </div>
      </div>
    );
  }

  if (!anyConnected) {
    return (
      <div className={styles.container}>
        {searchHeader}
        <div className={styles.centerState}>
          <img src={ICONS.paperPlane} alt="" className={styles.centerStateIcon} />
          <span className={styles.centerStateTitle} style={{ color: C.text }}>
            No Connected Inboxes
          </span>
          <span className={styles.centerStateText}>
            {emailAccounts.length > 0
              ? "Your assigned email accounts have not been authorized yet. Authorize them in Dashboard → Email Options."
              : "No email accounts have been assigned to you. Contact an admin to configure access in Dashboard → Email Options."}
          </span>
        </div>
      </div>
    );
  }

  if (isSearchActive) {
    return (
      <div className={styles.container}>
        {searchHeader}
        <div className={styles.searchResultsContainer}>
          {zThreadedEmails.length === 0 ? (
            <div className={styles.centerState}>
              <span className={styles.centerStateText}>No results</span>
            </div>
          ) : (
            <div className={styles.listScroll}>
              {zThreadedEmails.map((item) => renderEmailItem(item))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {searchHeader}
      {/* Account switcher */}
      <div className={styles.accountRow}>
        {connectedAccounts.map((acct) => (
          <AccountTabButton
            key={acct.accountKey}
            label={acct.displayName}
            isSelected={zActiveAccountKey === acct.accountKey}
            unreadCount={zEmailAuth?.[acct.accountKey]?.unreadCount || 0}
            onPress={() => handleAccountSwitch(acct.accountKey)}
          />
        ))}
      </div>

      {/* Folder buttons + action buttons */}
      <div className={styles.toolbarRow}>
        <div className={styles.folderGroup}>
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
        </div>
        <div className={styles.actionGroup}>
          <button
            type="button"
            className={styles.composeBtn}
            onClick={handleCompose}
            style={{ background: C.green }}
          >
            <span className={styles.composeBtnText}>+ Compose</span>
          </button>
        </div>
      </div>

      {/* Divider */}
      <div className={styles.divider} />

      {/* Email list */}
      {zEmailsLoading ? (
        <div className={styles.centerState}>
          <span
            className={styles.spinner}
            style={{ width: 40, height: 40, borderWidth: 4, color: C.blue }}
          />
        </div>
      ) : zThreadedEmails.length === 0 ? (
        <div className={styles.centerState}>
          <span className={styles.centerStateText}>No emails in this folder</span>
        </div>
      ) : (
        <div className={styles.listScroll}>
          {zThreadedEmails.map((item) => renderEmailItem(item))}
        </div>
      )}
    </div>
  );
});

const AccountTabButton = ({ label, isSelected, unreadCount, onPress }) => {
  return (
    <button
      type="button"
      className={`${styles.acctTab} ${isSelected ? styles.acctTabSelected : ""}`}
      onClick={onPress}
      style={{
        background: isSelected ? C.orange : lightenRGBByPercent(C.orange, 60),
      }}
    >
      <span className={styles.acctTabText}>{label}</span>
      {unreadCount > 0 && (
        <span className={styles.acctBadge}>
          <span className={styles.acctBadgeText}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        </span>
      )}
    </button>
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

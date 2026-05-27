/* eslint-disable */
import React, { useState, useMemo, useRef, useEffect, useLayoutEffect } from "react";
import ReactDOM from "react-dom";
import { C, ICONS } from "../../../styles";
import {
  useLoginStore,
  useSettingsStore,
  useOpenWorkordersStore,
  useAlertScreenStore,
} from "../../../stores";
import { capitalizeFirstLetterOfString, formatMillisForDisplay, resolveStatus, generate36CharUUID } from "../../../utils";
import { selectOpenWorkorderByID } from "../../../shared/selectOpenWorkorder";
import { sortWorkorders } from "../Options_Screen/Options_Workorders/utils";
import styles from "./UserMessagesModal.module.css";
import { useZ } from "../../../hooks/useZ";
import { Tooltip, DropdownMenu, ModalFooter, ModalFooterButton } from "../../../dom_components";
import { dbSetUserPersonalNotes, dbSendSMS, dbSendEmail } from "../../../db_calls_wrapper";

const SUPPRESS_OPTIONS = [
  { label: "Off", millis: 0 },
  { label: "30 min", millis: 30 * 60 * 1000 },
  { label: "1 hour", millis: 60 * 60 * 1000 },
  { label: "2 hours", millis: 2 * 60 * 60 * 1000 },
  { label: "4 hours", millis: 4 * 60 * 60 * 1000 },
  { label: "8 hours", millis: 8 * 60 * 60 * 1000 },
];

function userDisplayName(u) {
  if (!u) return "Unknown";
  return (
    (capitalizeFirstLetterOfString(u.first || "") + " " + capitalizeFirstLetterOfString(u.last || "")).trim() ||
    "Unknown"
  );
}

function userShortName(u) {
  if (!u) return "Unknown";
  let first = capitalizeFirstLetterOfString(u.first || "");
  let lastInitial = (u.last || "").trim().charAt(0).toUpperCase();
  return (first + (lastInitial ? " " + lastInitial + "." : "")).trim() || "Unknown";
}

function statusDisplay(statusID, settings) {
  if (!statusID) return "";
  let statusObj = (settings?.statuses || []).find((s) => s.id === statusID);
  return statusObj?.label || statusID;
}

function autoCapText(text) {
  if (!text) return text;
  let result = text.charAt(0).toUpperCase() + text.slice(1);
  result = result.replace(/([.\n]\s*)([a-z])/g, (_, prefix, letter) => prefix + letter.toUpperCase());
  return result;
}

function AutoGrowTextarea({ value, onChange, placeholder, className, minRows = 2, autoFocus = false }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [value]);
  return (
    <textarea
      ref={ref}
      className={className}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      rows={minRows}
      autoFocus={autoFocus}
    />
  );
}

export const UserMessagesModal = ({ handleExit, defaultTab = "inbox" }) => {
  const zUsers = useSettingsStore((state) => state.settings?.users) || [];
  const zSettings = useSettingsStore((state) => state.settings);
  const zMessages = useLoginStore((state) => state.inAppMessages) || {};
  const zCurrentUser = useLoginStore((state) => state.currentUser);
  const zOpenWorkorders = useOpenWorkordersStore((state) => state.workorders) || [];
  const zManagerNotes = useLoginStore((state) => state.managerNotes) || {};

  const canSeeManager = (zCurrentUser?.permissions?.level || 0) >= 3;

  const [sTab, _setTab] = useState(defaultTab);
  const [sRecipientIDs, _setRecipientIDs] = useState([]);
  const [sWorkorderID, _setWorkorderID] = useState("");
  const [sMessage, _setMessage] = useState("");
  const [sSendStatus, _setSendStatus] = useState("");
  const [sReplyDrafts, _setReplyDrafts] = useState({});
  const [sShowWorkorderPicker, _setShowWorkorderPicker] = useState(false);
  const [sNewNote, _setNewNote] = useState("");
  const [sEditingNoteID, _setEditingNoteID] = useState(null);
  const [sEditDraft, _setEditDraft] = useState("");
  const [sNoteSendStatus, _setNoteSendStatus] = useState({});

  const zMain = useZ("modal");
  const zPicker = zMain + 5;
  const [sSuppressMillis, _setSuppressMillis] = useState(() => {
    let until = zCurrentUser?.loginMessageSuppressUntil || 0;
    if (!until || Date.now() >= until) return 0;
    let remaining = until - Date.now();
    let match = 0;
    for (let opt of SUPPRESS_OPTIONS) {
      if (opt.millis > 0 && opt.millis <= remaining && opt.millis > match) match = opt.millis;
    }
    return match;
  });

  const visibleUsers = useMemo(
    () => zUsers.filter((u) => !u.hidden && u.id !== zCurrentUser?.id),
    [zUsers, zCurrentUser]
  );

  const sortedWorkorders = useMemo(
    () => sortWorkorders(zOpenWorkorders || [], zSettings?.statuses || [], zCurrentUser),
    [zOpenWorkorders, zSettings?.statuses, zCurrentUser]
  );

  const { inboxThreads, sentThreads } = useMemo(() => {
    let mine = Object.values(zMessages || {}).filter((m) => {
      if (!m) return false;
      if (m.deletedBy?.[zCurrentUser?.id]) return false;
      let toMe = (m.toUserIDs || []).includes(zCurrentUser?.id);
      let fromMe = m.fromUserID === zCurrentUser?.id;
      return toMe || fromMe;
    });
    let byThread = {};
    for (let m of mine) {
      let t = m.threadID || m.id;
      if (!byThread[t]) byThread[t] = [];
      byThread[t].push(m);
    }
    let inbox = [];
    let sent = [];
    for (let tid of Object.keys(byThread)) {
      let arr = byThread[tid].sort((a, b) => (a.createdMillis || 0) - (b.createdMillis || 0));
      let lastMillis = arr[arr.length - 1]?.createdMillis || 0;
      let hasUnread = arr.some(
        (m) => m.fromUserID !== zCurrentUser?.id && !m.readBy?.[zCurrentUser?.id]
      );
      let hasIncoming = arr.some((m) => m.fromUserID !== zCurrentUser?.id);
      let thread = { threadID: tid, messages: arr, lastMillis, hasUnread };
      if (hasIncoming) inbox.push(thread);
      else sent.push(thread);
    }
    inbox.sort((a, b) => b.lastMillis - a.lastMillis);
    sent.sort((a, b) => b.lastMillis - a.lastMillis);
    return { inboxThreads: inbox, sentThreads: sent };
  }, [zMessages, zCurrentUser]);

  const inboxUnreadCount = useMemo(() => {
    return inboxThreads.reduce((sum, t) => sum + (t.hasUnread ? 1 : 0), 0);
  }, [inboxThreads]);

  const managerNotesList = useMemo(() => {
    return Object.values(zManagerNotes || {}).sort(
      (a, b) => (b.createdMillis || 0) - (a.createdMillis || 0)
    );
  }, [zManagerNotes]);

  const personalNotes = useMemo(() => {
    let liveUser = zUsers.find((u) => u.id === zCurrentUser?.id);
    let arr = liveUser?.personalNotes || [];
    return [...arr].sort((a, b) => (b.createdMillis || 0) - (a.createdMillis || 0));
  }, [zUsers, zCurrentUser]);

  const userHasPhone = useMemo(() => {
    let liveUser = zUsers.find((u) => u.id === zCurrentUser?.id);
    let phone = (liveUser?.phone || "").replace(/\D/g, "");
    return phone.length >= 10;
  }, [zUsers, zCurrentUser]);

  const userHasEmail = useMemo(() => {
    let liveUser = zUsers.find((u) => u.id === zCurrentUser?.id);
    let email = (liveUser?.email || "").trim();
    return email.includes("@") && email.includes(".");
  }, [zUsers, zCurrentUser]);

  const managerUnreadCount = useMemo(() => {
    return managerNotesList.filter((n) => !n.read).length;
  }, [managerNotesList]);

  function toggleRecipient(id) {
    _setRecipientIDs((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function handleSend() {
    if (!sMessage.trim() || sRecipientIDs.length === 0) return;
    let wo = sWorkorderID ? zOpenWorkorders.find((w) => w.id === sWorkorderID) : null;
    let customerName = wo
      ? (capitalizeFirstLetterOfString(wo.customerFirst || "") + " " + capitalizeFirstLetterOfString(wo.customerLast || "")).trim()
      : null;
    let statusLabel = wo ? statusDisplay(wo.status, zSettings) : null;
    useLoginStore.getState().setSendInAppMessage({
      message: sMessage.trim(),
      toUserIDs: sRecipientIDs,
      workorderID: sWorkorderID || null,
      workorderCustomerName: customerName,
      workorderStatus: statusLabel,
    });
    _setMessage("");
    _setRecipientIDs([]);
    _setWorkorderID("");
    _setSendStatus("Sent");
    setTimeout(() => _setSendStatus(""), 2500);
  }

  function handleReply(threadID, parentMessageID) {
    let text = (sReplyDrafts[threadID] || "").trim();
    if (!text) return;
    let parent = zMessages[parentMessageID];
    let recipients = new Set();
    if (parent?.fromUserID && parent.fromUserID !== zCurrentUser?.id) recipients.add(parent.fromUserID);
    (parent?.toUserIDs || []).forEach((uid) => {
      if (uid !== zCurrentUser?.id) recipients.add(uid);
    });
    useLoginStore.getState().setSendInAppMessage({
      message: text,
      toUserIDs: [...recipients],
      workorderID: parent?.workorderID || null,
      workorderCustomerName: parent?.workorderCustomerName || null,
      workorderStatus: parent?.workorderStatus || null,
      replyToID: parentMessageID,
    });
    Object.values(zMessages || {}).forEach((m) => {
      if (!m) return;
      let mThreadID = m.threadID || m.id;
      if (mThreadID !== threadID) return;
      if (m.fromUserID === zCurrentUser?.id) return;
      if (m.readBy?.[zCurrentUser?.id]) return;
      useLoginStore.getState().setMarkInAppMessageRead(m.id);
    });
    _setReplyDrafts((prev) => ({ ...prev, [threadID]: "" }));
  }

  function handleMarkReadToggle(message) {
    let alreadyRead = !!message.readBy?.[zCurrentUser?.id];
    if (alreadyRead) useLoginStore.getState().setMarkInAppMessageUnread(message.id);
    else useLoginStore.getState().setMarkInAppMessageRead(message.id);
  }

  function handleDelete(message) {
    let isMine = message.fromUserID === zCurrentUser?.id;
    useAlertScreenStore.getState().setValues({
      title: "DELETE MESSAGE",
      message: isMine
        ? "Delete this message? It will also be removed from all recipients' inboxes."
        : "Remove this message from your inbox? Other recipients will still see it.",
      btn1Text: "DELETE",
      btn2Text: "CANCEL",
      handleBtn1Press: () =>
        isMine
          ? useLoginStore.getState().setHardDeleteInAppMessage(message.id)
          : useLoginStore.getState().setDeleteInAppMessageForCurrentUser(message.id),
      handleBtn2Press: () => null,
      showAlert: true,
    });
  }

  function handleRemoveThread(thread) {
    useAlertScreenStore.getState().setValues({
      title: "REMOVE THREAD",
      message: "Remove this thread from your inbox? Other participants will still see it.",
      btn1Text: "REMOVE",
      btn2Text: "CANCEL",
      handleBtn1Press: () => {
        thread.messages.forEach((m) => {
          useLoginStore.getState().setDeleteInAppMessageForCurrentUser(m.id);
        });
      },
      handleBtn2Press: () => null,
      showAlert: true,
    });
  }

  async function persistPersonalNotes(nextNotes) {
    if (!zCurrentUser?.id) return;
    await dbSetUserPersonalNotes(zCurrentUser.id, nextNotes);
  }

  function handleAddNote() {
    let text = sNewNote.trim();
    if (!text) return;
    let now = Date.now();
    let newNote = {
      id: generate36CharUUID(),
      text,
      createdMillis: now,
      updatedMillis: now,
    };
    let next = [newNote, ...personalNotes];
    _setNewNote("");
    persistPersonalNotes(next);
  }

  function handleStartEdit(note) {
    _setEditingNoteID(note.id);
    _setEditDraft(note.text || "");
  }

  function handleCancelEdit() {
    _setEditingNoteID(null);
    _setEditDraft("");
  }

  function handleSaveEdit(note) {
    let text = sEditDraft.trim();
    if (!text) return;
    let next = personalNotes.map((n) =>
      n.id === note.id ? { ...n, text, updatedMillis: Date.now() } : n
    );
    _setEditingNoteID(null);
    _setEditDraft("");
    persistPersonalNotes(next);
  }

  function handleDeleteNote(note) {
    useAlertScreenStore.getState().setValues({
      title: "DELETE NOTE",
      message: "Delete this note permanently?",
      btn1Text: "DELETE",
      btn2Text: "CANCEL",
      handleBtn1Press: () => {
        let next = personalNotes.filter((n) => n.id !== note.id);
        persistPersonalNotes(next);
      },
      handleBtn2Press: () => null,
      showAlert: true,
    });
  }

  async function handleSendNote(note, channel) {
    if (!note?.text) return;
    let liveUser = zUsers.find((u) => u.id === zCurrentUser?.id);
    if (!liveUser) return;
    _setNoteSendStatus((prev) => ({ ...prev, [note.id]: "Sending..." }));
    let prefix = "💬 Forwarded to yourself:\n";
    try {
      if (channel === "text") {
        let cleaned = (liveUser.phone || "").replace(/\D/g, "");
        if (cleaned.length < 10) {
          _setNoteSendStatus((prev) => ({ ...prev, [note.id]: "No phone on file" }));
          return;
        }
        let tenDigit = cleaned.length === 11 && cleaned.startsWith("1") ? cleaned.slice(1) : cleaned;
        let result = await dbSendSMS({ phoneNumber: tenDigit, message: `${prefix}${note.text}` });
        _setNoteSendStatus((prev) => ({
          ...prev,
          [note.id]: result?.success ? "Sent" : "Failed",
        }));
      } else if (channel === "email") {
        let email = (liveUser.email || "").trim();
        if (!email.includes("@")) {
          _setNoteSendStatus((prev) => ({ ...prev, [note.id]: "No email on file" }));
          return;
        }
        let escapedBody = note.text
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
        let htmlBody = `<div style="font-family: sans-serif; white-space: pre-wrap;">${escapedBody}</div>`;
        let result = await dbSendEmail(email, "Your note", htmlBody);
        _setNoteSendStatus((prev) => ({
          ...prev,
          [note.id]: result?.success ? "Sent" : "Failed",
        }));
      }
    } catch (e) {
      _setNoteSendStatus((prev) => ({ ...prev, [note.id]: "Failed" }));
    }
    setTimeout(() => {
      _setNoteSendStatus((prev) => {
        let { [note.id]: _, ...rest } = prev;
        return rest;
      });
    }, 2500);
  }

  function handleWorkorderChipClick(message) {
    let wo = selectOpenWorkorderByID(message?.workorderID);
    if (!wo) {
      useAlertScreenStore.getState().setValues({
        title: "WORKORDER UNAVAILABLE",
        message: "That workorder is no longer in the open list. It may have been completed.",
        btn1Text: "OK",
        handleBtn1Press: () => null,
        showAlert: true,
      });
      return;
    }
    if (message && !message.readBy?.[zCurrentUser?.id] && message.fromUserID !== zCurrentUser?.id) {
      useLoginStore.getState().setMarkInAppMessageRead(message.id);
    }
    if (handleExit) handleExit();
  }

  function renderRecipientNames(toIDs) {
    if (!toIDs || toIDs.length === 0) return null;
    return toIDs.map((id, idx) => (
      <React.Fragment key={id}>
        {idx > 0 && ", "}
        <span className={styles.recipientToName}>
          {userDisplayName(zUsers.find((u) => u.id === id))}
        </span>
      </React.Fragment>
    ));
  }

  function renderMessage(message, threadID, hideDelete = false, hideIncomingTo = false) {
    let isUnread = message.fromUserID !== zCurrentUser?.id && !message.readBy?.[zCurrentUser?.id];
    let isMine = message.fromUserID === zCurrentUser?.id;
    let timeText = message.createdMillis ? formatMillisForDisplay(message.createdMillis, true) : "";
    let alreadyRead = !!message.readBy?.[zCurrentUser?.id];
    let bubbleClass = isMine
      ? styles.messageBubbleMine
      : `${styles.messageBubbleTheirs} ${isUnread ? styles.messageBubbleTheirsUnread : ""}`;
    let showRead = !isMine;
    let showDelete = !hideDelete;
    let showActions = showRead || showDelete;
    let showRecipients = message.toUserIDs?.length > 0 && !(hideIncomingTo && !isMine);
    return (
      <div
        key={message.id}
        className={`${styles.messageBubbleRow} ${
          isMine ? styles.messageBubbleRowMine : styles.messageBubbleRowTheirs
        }`}
      >
        <div className={styles.messageBubbleColumn}>
          <div className={styles.messageMeta}>
            {!isMine && (
              <span className={styles.messageAuthor} style={{ color: C.text }}>
                {message.fromAuthorName || "Unknown"}
              </span>
            )}
            <span className={styles.messageTime}>{timeText}</span>
          </div>
          {showRecipients && (
            <div className={styles.recipients}>
              To: {renderRecipientNames(message.toUserIDs)}
            </div>
          )}
          <div className={`${styles.messageBubble} ${bubbleClass}`}>
            <div className={styles.messageBody}>{message.message}</div>
            {!!message.workorderID && (
              <button
                type="button"
                className={styles.workorderChip}
                onClick={() => handleWorkorderChipClick(message)}
              >
                <span>WO</span>
                <span style={{ fontWeight: 700 }}>
                  {message.workorderCustomerName || "Workorder"}
                </span>
                {message.workorderStatus && <span>· {message.workorderStatus}</span>}
              </button>
            )}
          </div>
          {showActions && (
            <div className={styles.messageActions}>
              {showRead && (
                <button
                  type="button"
                  className={`${styles.actionBtn} ${alreadyRead ? styles.actionBtnReadDone : styles.actionBtnRead}`}
                  onClick={() => handleMarkReadToggle(message)}
                >
                  {alreadyRead ? "MARK UNREAD" : "MARK READ"}
                </button>
              )}
              {showDelete && (
                <button
                  type="button"
                  className={`${styles.actionBtn} ${styles.actionBtnDelete}`}
                  onClick={() => handleDelete(message)}
                >
                  DELETE
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderThread(thread, isSentTab = false) {
    let last = thread.messages[thread.messages.length - 1];
    let draft = sReplyDrafts[thread.threadID] || "";
    let placeholder = isSentTab ? "Add more...." : "Reply...";
    let buttonLabel = isSentTab ? "Send" : "REPLY";
    let isStarted = thread.messages.length > 1;
    let hideDelete = isStarted;
    let participantIDs = new Set();
    thread.messages.forEach((m) => {
      if (m.fromUserID) participantIDs.add(m.fromUserID);
      (m.toUserIDs || []).forEach((uid) => participantIDs.add(uid));
    });
    let hideIncomingTo = !isSentTab && participantIDs.size < 3;
    return (
      <div key={thread.threadID} className={styles.threadCard} style={{ backgroundColor: C.surfaceAlt }}>
        {isStarted && (
          <div className={styles.threadHeader}>
            <Tooltip text="Remove thread from your inbox" position="left">
              <button
                type="button"
                className={styles.threadRemoveBtn}
                onClick={() => handleRemoveThread(thread)}
              >
                Remove thread
              </button>
            </Tooltip>
          </div>
        )}
        {thread.messages.map((m) => renderMessage(m, thread.threadID, hideDelete, hideIncomingTo))}
        <div className={styles.replyInputRow}>
          <input
            type="text"
            className={styles.replyInputField}
            placeholder={placeholder}
            value={draft}
            onChange={(e) =>
              _setReplyDrafts((prev) => ({ ...prev, [thread.threadID]: e.target.value }))
            }
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleReply(thread.threadID, last.id);
              }
            }}
          />
          <div className={styles.replySendColumn}>
            <button
              type="button"
              className={styles.replySendBtn}
              disabled={!draft.trim()}
              onClick={() => handleReply(thread.threadID, last.id)}
              style={{ opacity: !draft.trim() ? 0.3 : 1 }}
              aria-label={buttonLabel}
            >
              <img src={ICONS.airplane} alt={buttonLabel} className={styles.replySendIcon} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {ReactDOM.createPortal(
    <div className={styles.overlay} style={{ zIndex: zMain }} onClick={handleExit}>
      <div className={styles.card} onClick={(e) => e.stopPropagation()}>
        <div className={styles.cardInner}>
        <div className={styles.header}>
          <div className={styles.suppressGroup}>
            <span className={styles.suppressLabel} style={{ color: C.textMuted }}>
              SUPPRESS
            </span>
            <select
              className={styles.suppressSelect}
              value={sSuppressMillis}
              onChange={(e) => {
                let ms = Number(e.target.value);
                _setSuppressMillis(ms);
                if (zCurrentUser?.id) {
                  useLoginStore.getState().setSuppressLoginMessagesForUser(zCurrentUser.id, ms);
                }
              }}
            >
              {SUPPRESS_OPTIONS.map((opt) => (
                <option key={opt.millis} value={opt.millis}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <span className={styles.title} style={{ color: C.text }}>
            Messages
          </span>
          <span className={styles.headerSpacer} aria-hidden="true" />
        </div>

        <div className={styles.tabsRow}>
          <button
            type="button"
            className={`${styles.tabBtn} ${sTab === "compose" ? styles.tabBtnActive : ""}`}
            style={{ color: sTab === "compose" ? C.green : C.textMuted }}
            onClick={() => _setTab("compose")}
          >
            Compose
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${sTab === "inbox" ? styles.tabBtnActive : ""}`}
            style={{ color: sTab === "inbox" ? C.green : C.textMuted }}
            onClick={() => _setTab("inbox")}
          >
            Inbox{inboxUnreadCount > 0 && (
              <span className={styles.unreadBadge}>{inboxUnreadCount}</span>
            )}
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${sTab === "sent" ? styles.tabBtnActive : ""}`}
            style={{ color: sTab === "sent" ? C.green : C.textMuted }}
            onClick={() => _setTab("sent")}
          >
            Sent
          </button>
          {canSeeManager && (
            <button
              type="button"
              className={`${styles.tabBtn} ${sTab === "manager" ? styles.tabBtnActive : ""}`}
              style={{ color: sTab === "manager" ? C.green : C.textMuted }}
              onClick={() => _setTab("manager")}
            >
              Manager{managerUnreadCount > 0 && (
                <span className={styles.unreadBadge}>{managerUnreadCount}</span>
              )}
            </button>
          )}
          <button
            type="button"
            className={`${styles.tabBtn} ${sTab === "notes" ? styles.tabBtnActive : ""}`}
            style={{ color: sTab === "notes" ? C.green : C.textMuted }}
            onClick={() => _setTab("notes")}
          >
            Notes
          </button>
        </div>

        <div className={styles.body}>
          {sTab === "compose" && (
            <div className={styles.composeForm}>
              <div className={styles.formLabel} style={{ color: C.textMuted }}>
                To
              </div>
              <div className={styles.recipientList}>
                {visibleUsers.length === 0 && (
                  <div style={{ padding: 10, fontSize: 12, color: C.textMuted, fontStyle: "italic" }}>
                    No other users available.
                  </div>
                )}
                {visibleUsers.map((u) => {
                  let checked = sRecipientIDs.includes(u.id);
                  return (
                    <button
                      type="button"
                      key={u.id}
                      className={styles.recipientRow}
                      onClick={() => toggleRecipient(u.id)}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        readOnly
                        style={{ marginRight: 8, accentColor: C.green }}
                      />
                      <span className={styles.recipientName} style={{ color: C.text }}>
                        {userDisplayName(u)}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className={styles.formLabel} style={{ color: C.textMuted }}>
                Attach workorder (optional)
              </div>
              {(() => {
                let selected = sWorkorderID
                  ? sortedWorkorders.find((w) => w.id === sWorkorderID)
                  : null;
                let selectedLabel = selected
                  ? (capitalizeFirstLetterOfString(selected.customerFirst || "") +
                      " " +
                      capitalizeFirstLetterOfString(selected.customerLast || "")).trim() ||
                    "Standalone"
                  : "— None —";
                let selectedStatus = selected
                  ? resolveStatus(selected.status, zSettings?.statuses || [])
                  : null;
                return (
                  <div className={styles.workorderTriggerRow}>
                    <button
                      type="button"
                      className={styles.workorderTriggerBtn}
                      onClick={() => _setShowWorkorderPicker(true)}
                    >
                      <span
                        className={styles.workorderName}
                        style={{ color: selected ? C.text : C.textMuted, fontStyle: selected ? "normal" : "italic" }}
                      >
                        {selectedLabel}
                        {selected?.workorderNumber ? " #" + selected.workorderNumber : ""}
                      </span>
                      {selectedStatus?.label && (
                        <span
                          className={styles.workorderStatusPill}
                          style={{ backgroundColor: selectedStatus.backgroundColor }}
                        >
                          <span
                            className={styles.workorderStatusLabel}
                            style={{ color: selectedStatus.textColor }}
                          >
                            {selectedStatus.label}
                          </span>
                        </span>
                      )}
                    </button>
                    {sWorkorderID && (
                      <button
                        type="button"
                        className={styles.workorderClearBtn}
                        onClick={() => _setWorkorderID("")}
                        aria-label="Clear attached workorder"
                      >
                        ×
                      </button>
                    )}
                  </div>
                );
              })()}

              <div className={styles.formLabel} style={{ color: C.textMuted }}>
                Message
              </div>
              <div className={styles.messageInputRow}>
                <textarea
                  className={styles.messageInputField}
                  value={sMessage}
                  onChange={(e) => {
                    let val = e.target.value;
                    if (val.length > 0) val = val.charAt(0).toUpperCase() + val.slice(1);
                    _setMessage(val);
                  }}
                  placeholder="Type your message..."
                  style={{ color: C.text }}
                />
                <div className={styles.messageSendColumn}>
                  <button
                    type="button"
                    className={styles.messageSendBtn}
                    disabled={!sMessage.trim() || sRecipientIDs.length === 0}
                    onClick={handleSend}
                    style={{ opacity: !sMessage.trim() || sRecipientIDs.length === 0 ? 0.3 : 1 }}
                    aria-label="Send"
                  >
                    <img src={ICONS.airplane} alt="Send" className={styles.messageSendIcon} />
                  </button>
                </div>
              </div>

              <div className={styles.sendRow}>
                <span className={styles.sendStatus} style={{ color: sSendStatus ? C.green : "transparent" }}>
                  {sSendStatus || "placeholder"}
                </span>
              </div>
            </div>
          )}

          {sTab === "inbox" && (
            <div className={styles.inboxScroll}>
              {inboxThreads.length === 0 && (
                <div className={styles.emptyMessage}>No messages.</div>
              )}
              {inboxThreads.map(renderThread)}
            </div>
          )}

          {sTab === "sent" && (
            <div className={styles.inboxScroll}>
              {sentThreads.length === 0 && (
                <div className={styles.emptyMessage}>No sent messages awaiting a reply.</div>
              )}
              {sentThreads.map((t) => renderThread(t, true))}
            </div>
          )}

          {sTab === "notes" && (
            <div className={styles.notesScroll}>
              <div className={styles.noteComposeRow}>
                <div className={styles.noteInputRow}>
                  <AutoGrowTextarea
                    className={styles.noteInputField}
                    value={sNewNote}
                    onChange={(e) => _setNewNote(autoCapText(e.target.value))}
                    placeholder="Write a note to yourself..."
                    minRows={2}
                  />
                  <div className={styles.noteSendColumn}>
                    <button
                      type="button"
                      className={styles.noteSendBtn}
                      disabled={!sNewNote.trim()}
                      onClick={handleAddNote}
                      style={{ opacity: !sNewNote.trim() ? 0.3 : 1 }}
                      aria-label="Add note"
                    >
                      <img src={ICONS.check} alt="Add note" className={styles.noteSendIcon} />
                    </button>
                  </div>
                </div>
              </div>

              {personalNotes.length === 0 && (
                <div className={styles.emptyMessage}>No notes yet.</div>
              )}

              {personalNotes.map((note) => {
                let isEditing = sEditingNoteID === note.id;
                let timeText = note.createdMillis
                  ? formatMillisForDisplay(note.createdMillis, true)
                  : "";
                let sendStatus = sNoteSendStatus[note.id] || "";
                return (
                  <div key={note.id} className={styles.noteCard}>
                    <div className={styles.noteHeader}>
                      <span className={styles.noteTime}>{timeText}</span>
                      <div className={styles.noteIconActions}>
                        {!isEditing && (
                          <Tooltip text="Edit note" position="top">
                            <button
                              type="button"
                              className={styles.noteIconBtn}
                              onClick={() => handleStartEdit(note)}
                              aria-label="Edit note"
                            >
                              <img
                                src={ICONS.editPencil}
                                alt=""
                                className={styles.noteIcon}
                              />
                            </button>
                          </Tooltip>
                        )}
                        <Tooltip text="Delete note" position="top">
                          <button
                            type="button"
                            className={styles.noteIconBtn}
                            onClick={() => handleDeleteNote(note)}
                            aria-label="Delete note"
                          >
                            <img
                              src={ICONS.trash}
                              alt=""
                              className={styles.noteIcon}
                            />
                          </button>
                        </Tooltip>
                      </div>
                    </div>

                    {isEditing ? (
                      <>
                        <AutoGrowTextarea
                          className={styles.noteTextarea}
                          value={sEditDraft}
                          onChange={(e) => _setEditDraft(autoCapText(e.target.value))}
                          placeholder="Edit note..."
                          minRows={2}
                          autoFocus
                        />
                        <div className={styles.noteEditActions}>
                          <button
                            type="button"
                            className={styles.noteCancelBtn}
                            onClick={handleCancelEdit}
                          >
                            CANCEL
                          </button>
                          <button
                            type="button"
                            className={styles.noteSaveBtn}
                            disabled={!sEditDraft.trim()}
                            onClick={() => handleSaveEdit(note)}
                          >
                            SAVE
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className={styles.noteBody}>{note.text}</div>
                    )}

                    <div className={styles.noteFooter}>
                      <span
                        className={styles.noteSendStatus}
                        style={{ color: sendStatus ? C.green : "transparent" }}
                      >
                        {sendStatus || "placeholder"}
                      </span>
                      <div className={styles.noteSendDropdownWrap}>
                        <DropdownMenu
                          buttonText="Send it to me"
                          buttonStyle={{
                            backgroundColor: C.surfaceBase,
                            borderColor: C.borderSubtle,
                            borderWidth: 1,
                            borderStyle: "solid",
                            paddingVertical: 6,
                            paddingHorizontal: 10,
                          }}
                          buttonTextStyle={{ fontSize: 12, color: C.text }}
                          buttonIcon={null}
                          dataArr={[
                            {
                              id: "text",
                              label: userHasPhone ? "Text" : "Text (no phone on file)",
                              disabled: !userHasPhone,
                              textColor: !userHasPhone ? C.textMuted : C.text,
                              strikethrough: !userHasPhone,
                            },
                            {
                              id: "email",
                              label: userHasEmail ? "Email" : "Email (no email on file)",
                              disabled: !userHasEmail,
                              textColor: !userHasEmail ? C.textMuted : C.text,
                              strikethrough: !userHasEmail,
                            },
                          ]}
                          onSelect={(item) => {
                            if (item.disabled) return;
                            handleSendNote(note, item.id);
                          }}
                          itemTextAlign="left"
                          itemStyle={{ paddingVertical: 8, paddingHorizontal: 12 }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {sTab === "manager" && canSeeManager && (
            <div className={styles.inboxScroll}>
              {managerNotesList.length === 0 && (
                <div className={styles.emptyMessage}>No manager notes.</div>
              )}
              {managerNotesList.map((note) => {
                let forUser = zUsers.find((u) => u.id === note.userID);
                let forUserName = forUser ? userDisplayName(forUser) : "Unknown user";
                let readByUser = note.readByUserID
                  ? zUsers.find((u) => u.id === note.readByUserID)
                  : null;
                let readByText = note.read && readByUser ? userShortName(readByUser) : null;
                let timeText = note.createdMillis
                  ? formatMillisForDisplay(note.createdMillis, true)
                  : "";
                return (
                  <div
                    key={note.id}
                    className={`${styles.messageRow} ${!note.read ? styles.messageRowUnread : ""}`}
                  >
                    <div className={styles.messageMeta}>
                      <span className={styles.messageAuthor} style={{ color: C.text }}>
                        {note.authorName || "Unknown"}
                      </span>
                      <span className={styles.messageTime}>{timeText}</span>
                    </div>
                    <div className={styles.recipients}>For: {forUserName}</div>
                    <div className={styles.messageBody} style={{ color: C.text }}>
                      {note.message}
                    </div>
                    <div className={styles.messageActions}>
                      <button
                        type="button"
                        className={`${styles.actionBtn} ${styles.actionBtnRead}`}
                        onClick={() =>
                          useLoginStore
                            .getState()
                            .setMarkManagerNoteRead(note.id, zCurrentUser?.id)
                        }
                      >
                        {note.read ? "MARK UNREAD" : "MARK READ"}
                      </button>
                      <button
                        type="button"
                        className={`${styles.actionBtn} ${styles.actionBtnDelete}`}
                        onClick={() => {
                          useAlertScreenStore.getState().setValues({
                            title: "REMOVE NOTE",
                            message: "Remove this manager note permanently?",
                            btn1Text: "REMOVE",
                            btn2Text: "CANCEL",
                            handleBtn1Press: () =>
                              useLoginStore.getState().setResolveManagerNote(note.id),
                            handleBtn2Press: () => null,
                            showAlert: true,
                          });
                        }}
                      >
                        REMOVE
                      </button>
                    </div>
                    {readByText && (
                      <span className={styles.readByText}>Read by {readByText}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        </div>
        <ModalFooter>
          <ModalFooterButton onClick={handleExit}>Close</ModalFooterButton>
        </ModalFooter>
      </div>
    </div>,
    document.body
  )}
      {sShowWorkorderPicker && ReactDOM.createPortal(
        <div
          className={styles.pickerOverlay}
          style={{ zIndex: zPicker }}
          onClick={(e) => {
            e.stopPropagation();
            _setShowWorkorderPicker(false);
          }}
        >
          <div className={styles.pickerCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.pickerInner}>
            <div className={styles.pickerHeader}>
              <span className={styles.pickerTitle} style={{ color: C.text }}>
                Attach Workorder
              </span>
            </div>
            <div className={styles.pickerList}>
              <button
                type="button"
                className={`${styles.workorderRow} ${!sWorkorderID ? styles.workorderRowSelected : ""}`}
                onClick={() => {
                  _setWorkorderID("");
                  _setShowWorkorderPicker(false);
                }}
              >
                <span className={styles.workorderName} style={{ color: C.textMuted, fontStyle: "italic" }}>
                  — None —
                </span>
              </button>
              {sortedWorkorders.map((w) => {
                let label =
                  (capitalizeFirstLetterOfString(w.customerFirst || "") +
                    " " +
                    capitalizeFirstLetterOfString(w.customerLast || "")).trim() ||
                  "Standalone";
                let rs = resolveStatus(w.status, zSettings?.statuses || []);
                let isSelected = sWorkorderID === w.id;
                return (
                  <button
                    type="button"
                    key={w.id}
                    className={`${styles.workorderRow} ${isSelected ? styles.workorderRowSelected : ""}`}
                    onClick={() => {
                      _setWorkorderID(w.id);
                      _setShowWorkorderPicker(false);
                    }}
                  >
                    <span className={styles.workorderName} style={{ color: C.text }}>
                      {label}
                      {w.workorderNumber ? " #" + w.workorderNumber : ""}
                    </span>
                    {!!rs.label && (
                      <span
                        className={styles.workorderStatusPill}
                        style={{ backgroundColor: rs.backgroundColor }}
                      >
                        <span
                          className={styles.workorderStatusLabel}
                          style={{ color: rs.textColor }}
                        >
                          {rs.label}
                        </span>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            </div>
            <ModalFooter>
              <ModalFooterButton onClick={() => _setShowWorkorderPicker(false)}>Close</ModalFooterButton>
            </ModalFooter>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

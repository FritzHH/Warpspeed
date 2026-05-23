/* eslint-disable */
import React, { useState, useMemo } from "react";
import ReactDOM from "react-dom";
import { C, ICONS } from "../../../styles";
import {
  useLoginStore,
  useSettingsStore,
  useOpenWorkordersStore,
  useAlertScreenStore,
} from "../../../stores";
import { capitalizeFirstLetterOfString, formatMillisForDisplay, resolveStatus } from "../../../utils";
import { selectOpenWorkorderByID } from "../../../shared/selectOpenWorkorder";
import { sortWorkorders } from "../Options_Screen/Options_Workorders/utils";
import styles from "./UserMessagesModal.module.css";

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
    if (!toIDs || toIDs.length === 0) return "";
    return toIDs
      .map((id) => userDisplayName(zUsers.find((u) => u.id === id)))
      .join(", ");
  }

  function renderMessage(message, threadID) {
    let isUnread = message.fromUserID !== zCurrentUser?.id && !message.readBy?.[zCurrentUser?.id];
    let isMine = message.fromUserID === zCurrentUser?.id;
    let timeText = message.createdMillis ? formatMillisForDisplay(message.createdMillis, true) : "";
    let alreadyRead = !!message.readBy?.[zCurrentUser?.id];
    return (
      <div
        key={message.id}
        className={`${styles.messageRow} ${isUnread ? styles.messageRowUnread : ""}`}
      >
        <div className={styles.messageMeta}>
          <span className={styles.messageAuthor} style={{ color: C.text }}>
            {isMine ? "You" : message.fromAuthorName || "Unknown"}
          </span>
          <span className={styles.messageTime}>{timeText}</span>
        </div>
        {message.toUserIDs?.length > 0 && (
          <div className={styles.recipients}>
            To: {renderRecipientNames(message.toUserIDs)}
          </div>
        )}
        <div className={styles.messageBody} style={{ color: C.text }}>
          {message.message}
        </div>
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
        {!isMine && (
          <div className={styles.messageActions}>
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.actionBtnRead}`}
              onClick={() => handleMarkReadToggle(message)}
            >
              {alreadyRead ? "MARK UNREAD" : "MARK READ"}
            </button>
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.actionBtnDelete}`}
              onClick={() => handleDelete(message)}
            >
              DELETE
            </button>
          </div>
        )}
        {isMine && (
          <div className={styles.messageActions}>
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.actionBtnDelete}`}
              onClick={() => handleDelete(message)}
            >
              DELETE
            </button>
          </div>
        )}
      </div>
    );
  }

  function renderThread(thread) {
    let last = thread.messages[thread.messages.length - 1];
    let draft = sReplyDrafts[thread.threadID] || "";
    return (
      <div key={thread.threadID} className={styles.threadCard} style={{ backgroundColor: C.surfaceAlt }}>
        {thread.messages.map((m) => renderMessage(m, thread.threadID))}
        <div className={styles.replyRow}>
          <input
            type="text"
            className={styles.replyInput}
            placeholder="Reply..."
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
          <button
            type="button"
            className={styles.replyBtn}
            disabled={!draft.trim()}
            onClick={() => handleReply(thread.threadID, last.id)}
          >
            REPLY
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {ReactDOM.createPortal(
    <div className={styles.overlay} onClick={handleExit}>
      <div className={styles.card} onClick={(e) => e.stopPropagation()}>
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
          <button
            type="button"
            className={styles.closeBtn}
            onClick={handleExit}
            aria-label="Close"
          >
            <img src={ICONS.close1} alt="" className={styles.closeIcon} />
          </button>
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
              <textarea
                className={styles.messageTextarea}
                value={sMessage}
                onChange={(e) => {
                  let val = e.target.value;
                  if (val.length > 0) val = val.charAt(0).toUpperCase() + val.slice(1);
                  _setMessage(val);
                }}
                placeholder="Type your message..."
                style={{ color: C.text }}
              />

              <div className={styles.sendRow}>
                <span className={styles.sendStatus} style={{ color: sSendStatus ? C.green : "transparent" }}>
                  {sSendStatus || "placeholder"}
                </span>
                <button
                  type="button"
                  className={styles.sendBtn}
                  disabled={!sMessage.trim() || sRecipientIDs.length === 0}
                  onClick={handleSend}
                >
                  SEND
                </button>
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
              {sentThreads.map(renderThread)}
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
    </div>,
    document.body
  )}
      {sShowWorkorderPicker && ReactDOM.createPortal(
        <div
          className={styles.pickerOverlay}
          onClick={(e) => {
            e.stopPropagation();
            _setShowWorkorderPicker(false);
          }}
        >
          <div className={styles.pickerCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.pickerHeader}>
              <span className={styles.pickerTitle} style={{ color: C.text }}>
                Attach Workorder
              </span>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={() => _setShowWorkorderPicker(false)}
                aria-label="Close"
              >
                <img src={ICONS.close1} alt="" className={styles.closeIcon} />
              </button>
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
        </div>,
        document.body
      )}
    </>
  );
};

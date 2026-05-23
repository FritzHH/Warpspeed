/* eslint-disable */

import React, { useEffect, useRef, useState } from "react";
import { Image as ImageDom, TouchableOpacity as TouchableOpacityDom, Tooltip } from "../../../dom_components";
import { C, ICONS } from "../../../styles";
import { useLoginStore, useSettingsStore } from "../../../stores";
import s from "./Messages.module.css";

const AUTO_SEND_SECONDS = 10;

// Module-level auto-send timer
let _autoSendTimer = null;
let _autoSendThunk = null;

export function scheduleAutoSend(thunk) {
  clearAutoSend();
  _autoSendThunk = thunk;
  _autoSendTimer = setTimeout(() => {
    if (_autoSendThunk) _autoSendThunk();
    _autoSendThunk = null;
    _autoSendTimer = null;
  }, AUTO_SEND_SECONDS * 1000);
}

export function clearAutoSend() {
  if (_autoSendTimer) clearTimeout(_autoSendTimer);
  _autoSendTimer = null;
  _autoSendThunk = null;
}

/**
 * Builds the forwardTo payload array for outgoing messages.
 * Resolves selected user IDs against the users list, returning
 * [{ userID, phone, first }, ...] for users that have a phone number.
 */
export function buildForwardToArray(selectedForwardIDs, users) {
  if (!selectedForwardIDs?.length || !users?.length) return [];
  return selectedForwardIDs
    .map((id) => {
      let u = users.find((u) => u.id === id);
      if (!u || !u.phone) return null;
      return { userID: u.id, phone: u.phone, first: u.first || "" };
    })
    .filter(Boolean);
}

/**
 * Initial selection for the forward-users dropdown.
 * Prefers existing thread.forwardTo array; falls back to [currentUser.id].
 */
export function initialSelectedForwardIDs(thread) {
  let arr = Array.isArray(thread?.forwardTo) ? thread.forwardTo : null;
  if (arr && arr.length > 0) return arr.map((f) => f.userID).filter(Boolean);
  let currentUser = useLoginStore.getState().getCurrentUser();
  return currentUser?.id ? [currentUser.id] : [];
}

function ForwardUsersDropdown({ selectedForwardIDs, onChangeSelectedForwardIDs }) {
  const users = useSettingsStore((state) => state.settings?.users) || [];
  const visibleUsers = users.filter((u) => u.hidden !== true);
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleDocClick(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleDocClick);
    return () => document.removeEventListener("mousedown", handleDocClick);
  }, [open]);

  function toggle(id) {
    let prev = Array.isArray(selectedForwardIDs) ? selectedForwardIDs : [];
    let next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
    onChangeSelectedForwardIDs(next);
  }

  let selectedCount = selectedForwardIDs?.length || 0;
  let currentUserID = useLoginStore.getState().getCurrentUser()?.id;
  let buttonLabel;
  if (selectedCount === 0) {
    buttonLabel = "No one";
  } else {
    let names = selectedForwardIDs
      .map((id) => {
        if (id === currentUserID) return "You";
        let u = users.find((x) => x.id === id);
        if (!u) return null;
        return (u.first || "") + (u.last ? " " + u.last.charAt(0) + "." : "");
      })
      .filter(Boolean);
    buttonLabel = names.join(", ");
  }

  return (
    <div className={s.forwardUsersDropdownRoot} ref={rootRef}>
      <span className={s.forwardUsersDropdownLeadLabel}>Forward to</span>
      <button
        type="button"
        className={s.forwardUsersDropdownBtn}
        onClick={() => setOpen((v) => !v)}
      >
        {buttonLabel}
        <span className={s.forwardUsersDropdownCaret}>{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className={s.forwardUsersDropdownPanel}>
          {visibleUsers.length === 0 ? (
            <div className={s.forwardUsersDropdownEmpty}>No users</div>
          ) : (
            visibleUsers.map((u) => {
              let label = (u.first || "") + (u.last ? " " + u.last.charAt(0) + "." : "");
              let isChecked = !!(selectedForwardIDs && selectedForwardIDs.includes(u.id));
              let boxClass = s.forwardUsersDropdownCheckbox + (isChecked ? " " + s["forwardUsersDropdownCheckbox--checked"] : "");
              return (
                <div
                  key={u.id}
                  className={s.forwardUsersDropdownItem}
                  onClick={() => toggle(u.id)}
                >
                  <div className={boxClass}>
                    {isChecked && <span className={s.forwardUsersDropdownCheckmark}>✓</span>}
                  </div>
                  <span className={s.forwardUsersDropdownLabel}>{label || "Unnamed"}</span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function FireButton({ disabled, onFire }) {
  let cls = s.replyOptionsFireBtn + (disabled ? " " + s["replyOptionsFireBtn--disabled"] : "");
  return (
    <Tooltip text="Allow responses and forward" position="top">
      <button
        type="button"
        className={cls}
        onClick={disabled ? undefined : onFire}
        disabled={!!disabled}
      >
        <ImageDom icon={ICONS.forwardGreen} size={20} style={{ marginRight: 6 }} />
        Forward
      </button>
    </Tooltip>
  );
}

/**
 * Orange reply options bar that appears after pressing send.
 * Shows: auto-send countdown, can reply yes/no, fire button + forward-users dropdown.
 */
export function ReplyOptionsBar({
  visible,
  hasActivePhone,
  onSelectCanRespond,
  onCancel,
  audioMode,
  audioUploading,
  onSendAudio,
  onDeleteAudio,
  selectedForwardIDs,
  onChangeSelectedForwardIDs,
  onFire,
}) {
  const [secondsLeft, setSecondsLeft] = useState(AUTO_SEND_SECONDS);

  useEffect(() => {
    if (!visible || audioMode) { setSecondsLeft(AUTO_SEND_SECONDS); return; }
    setSecondsLeft(AUTO_SEND_SECONDS);
    let interval = setInterval(() => {
      setSecondsLeft((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [visible, audioMode]);

  if (!visible) return null;

  let fireDisabled = !hasActivePhone || !(selectedForwardIDs?.length > 0);

  if (audioMode) {
    let sendBtnClass = s.replyOptionsAudioSendBtn + (audioUploading ? " " + s["replyOptionsAudioSendBtn--uploading"] : "");
    let deleteBtnClass = s.replyOptionsAudioDeleteBtn + (audioUploading ? " " + s["replyOptionsAudioDeleteBtn--disabled"] : "");
    return (
      <div className={`${s.replyOptionsBar} ${s["replyOptionsBar--audio"]}`}>
        <div className={s.replyOptionsAudioLeft}>
          <span className={s.replyOptionsLabel}>Audio ready to send</span>
        </div>
        <div className={s.replyOptionsAudioRight}>
          <div className={s.replyOptionsAudioButtons}>
            <button
              type="button"
              className={sendBtnClass}
              onClick={audioUploading ? undefined : onSendAudio}
              disabled={!!audioUploading}
            >
              {audioUploading ? "Sending..." : "Send"}
            </button>
            <button
              type="button"
              className={deleteBtnClass}
              onClick={audioUploading ? undefined : onDeleteAudio}
              disabled={!!audioUploading}
            >
              <ImageDom icon={ICONS.trash} size={14} style={{ marginRight: 6 }} />
              Delete
            </button>
          </div>
          <ForwardUsersDropdown
            selectedForwardIDs={selectedForwardIDs}
            onChangeSelectedForwardIDs={onChangeSelectedForwardIDs}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={s.replyOptionsBar}>
      <div className={s.replyOptionsHeaderRow}>
        <span className={s.replyOptionsCountdown}>{`Auto-sending (no replies) in ${secondsLeft} seconds`}</span>
        {onCancel && (
          <button type="button" className={s.replyOptionsCancelBtn} onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
      <div className={s.replyOptionsCanReplyRow}>
        <span className={s.replyOptionsCanReplyLabel}>Can reply?</span>
        <Tooltip text="Allow replies (no forwarding)" position="top">
          <TouchableOpacityDom
            onPress={() => onSelectCanRespond(true)}
            className={`${s.replyOptionsYesNoBtn} ${s.replyOptionsYesBtn}`}
            hoverOpacity={0.5}
          >
            <ImageDom icon={ICONS.check} size={50} />
          </TouchableOpacityDom>
        </Tooltip>
        <Tooltip text="Nope" position="top">
          <TouchableOpacityDom
            onPress={() => onSelectCanRespond(false)}
            className={s.replyOptionsYesNoBtn}
            hoverOpacity={0.5}
          >
            <ImageDom icon={ICONS.redx} size={50} />
          </TouchableOpacityDom>
        </Tooltip>
      </div>
      <div className={s.replyOptionsForwardSection}>
        <ForwardUsersDropdown
          selectedForwardIDs={selectedForwardIDs}
          onChangeSelectedForwardIDs={onChangeSelectedForwardIDs}
        />
        <FireButton disabled={fireDisabled} onFire={onFire} />
      </div>
    </div>
  );
}

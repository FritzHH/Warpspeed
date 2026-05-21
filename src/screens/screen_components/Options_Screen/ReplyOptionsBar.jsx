/* eslint-disable */

import React from "react";
import { Image as ImageDom, TouchableOpacity as TouchableOpacityDom } from "../../../dom_components";
import { C, ICONS } from "../../../styles";
import { useLoginStore } from "../../../stores";
import s from "./Messages.module.css";

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
  }, 10000);
}

export function clearAutoSend() {
  if (_autoSendTimer) clearTimeout(_autoSendTimer);
  _autoSendTimer = null;
  _autoSendThunk = null;
}

/**
 * Builds the forwardTo payload for outgoing messages.
 * @param {boolean|undefined} forwardOverride - explicit override
 * @param {boolean} forwardReplies - current forward replies state
 * @returns {object|null}
 */
export function buildForwardToPayload(forwardOverride, forwardReplies) {
  const currentUser = useLoginStore.getState().getCurrentUser();
  if (!currentUser?.id) return null;
  let shouldForward = forwardOverride !== undefined ? forwardOverride : forwardReplies;
  if (shouldForward) {
    if (!currentUser.phone) return null;
    return { userID: currentUser.id, phone: currentUser.phone, first: currentUser.first || "", enable: true };
  }
  return { userID: currentUser.id, enable: false };
}

function ForwardCheckboxRow({ checked, disabled, onToggle, label }) {
  let rowClass = s.replyOptionsForwardRow + (disabled ? " " + s["replyOptionsForwardRow--disabled"] : "");
  let boxClass = s.replyOptionsForwardCheckbox + (checked ? " " + s["replyOptionsForwardCheckbox--checked"] : "");
  return (
    <div className={rowClass} onClick={disabled ? undefined : onToggle}>
      <div className={boxClass}>
        {checked && <span className={s.replyOptionsForwardCheckmark}>✓</span>}
      </div>
      <span className={s.replyOptionsForwardLabel}>{label}</span>
    </div>
  );
}

/**
 * Orange reply options bar that appears after pressing send.
 * Shows: auto-send countdown, can reply yes/no, forward replies checkbox.
 */
export function ReplyOptionsBar({ visible, forwardReplies, hasActivePhone, onSelectCanRespond, onToggleForward, audioMode, audioUploading, onSendAudio, onDeleteAudio }) {
  if (!visible) return null;

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
          <ForwardCheckboxRow
            checked={forwardReplies}
            disabled={!hasActivePhone}
            onToggle={onToggleForward}
            label="Forward replies to me"
          />
        </div>
      </div>
    );
  }

  return (
    <div className={s.replyOptionsBar}>
      <span className={s.replyOptionsCountdown}>Auto-sending in 10 seconds</span>
      <div className={s.replyOptionsCanReplyRow}>
        <span className={s.replyOptionsCanReplyLabel}>Can reply?</span>
        <TouchableOpacityDom
          onPress={() => onSelectCanRespond(true)}
          className={`${s.replyOptionsYesNoBtn} ${s.replyOptionsYesBtn}`}
          hoverOpacity={0.5}
        >
          <ImageDom icon={ICONS.check} size={50} />
        </TouchableOpacityDom>
        <TouchableOpacityDom
          onPress={() => onSelectCanRespond(false)}
          className={s.replyOptionsYesNoBtn}
          hoverOpacity={0.5}
        >
          <ImageDom icon={ICONS.redx} size={50} />
        </TouchableOpacityDom>
      </div>
      <ForwardCheckboxRow
        checked={forwardReplies}
        disabled={!hasActivePhone}
        onToggle={onToggleForward}
        label="Forward replies"
      />
    </div>
  );
}

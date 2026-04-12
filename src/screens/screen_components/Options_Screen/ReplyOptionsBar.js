/* eslint-disable */

import { View, Text, TouchableOpacity } from "react-native-web";
import React, { useRef, useEffect } from "react";
import { gray } from "../../../utils";
import { Image_, TouchableOpacity_, Tooltip } from "../../../components";
import { C, ICONS } from "../../../styles";
import { useLoginStore, useAlertScreenStore } from "../../../stores";

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

/**
 * Orange reply options bar that appears after pressing send.
 * Shows: auto-send countdown, can reply yes/no, forward replies checkbox.
 *
 * Props:
 *  - visible: boolean
 *  - forwardReplies: boolean
 *  - hasActivePhone: boolean - whether forward toggle should be enabled
 *  - onSelectCanRespond(canRespond: boolean): called when user picks yes/no
 *  - onToggleForward(): called when forward checkbox is toggled
 */
export function ReplyOptionsBar({ visible, forwardReplies, hasActivePhone, onSelectCanRespond, onToggleForward, audioMode, audioUploading, onSendAudio, onDeleteAudio }) {
  if (!visible) return null;

  if (audioMode) {
    return (
      <View style={{ width: '100%', justifyContent: "space-between", flexDirection: 'row', alignItems: "center", marginBottom: 4, backgroundColor: 'orange', padding: 10, borderRadius: 6 }}>
        <View style={{ alignItems: 'flex-start' }}>
          <Text style={{ color: 'dimgray', fontWeight: "500" }}>Audio ready to send</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
            <TouchableOpacity_
              onPress={audioUploading ? undefined : onSendAudio}
              style={{ paddingVertical: 8, paddingHorizontal: 16, marginRight: 8, backgroundColor: audioUploading ? gray(0.6) : C.green, borderRadius: 5 }}
              hoverOpacity={0.7}
            >
              <Text style={{ color: "white", fontWeight: "600", fontSize: 15 }}>{audioUploading ? "Sending..." : "Send"}</Text>
            </TouchableOpacity_>
            <TouchableOpacity_
              onPress={audioUploading ? undefined : onDeleteAudio}
              style={{ paddingVertical: 8, paddingHorizontal: 16, backgroundColor: C.red, borderRadius: 5, opacity: audioUploading ? 0.4 : 1 }}
              hoverOpacity={0.7}
            >
              <Text style={{ color: "white", fontWeight: "600", fontSize: 15 }}>Delete</Text>
            </TouchableOpacity_>
          </View>
          <TouchableOpacity onPress={hasActivePhone ? onToggleForward : undefined} style={{ flexDirection: "row", alignItems: "center", opacity: hasActivePhone ? 1 : 0.4 }}>
            <View style={{ width: 22, height: 22, borderRadius: 4, backgroundColor: forwardReplies ? C.red : "transparent", borderWidth: 2, borderColor: forwardReplies ? C.red : gray(0.15), alignItems: "center", justifyContent: "center" }}>
              {forwardReplies && <Text style={{ color: "white", fontSize: 14, fontWeight: "bold" }}>✓</Text>}
            </View>
            <Text style={{ fontSize: 17, color: C.text, marginLeft: 8 }}>Forward replies to me</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={{ width: '100%', justifyContent: "space-between", flexDirection: 'row', marginBottom: 4, backgroundColor: 'orange', padding: 10, borderRadius: 6 }}>
      <View style={{ alignItems: 'flex-start' }}>
        <Text style={{ color: 'dimgray' }}>Auto-sending in 10 seconds</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 10 }}>
          <Text style={{ fontSize: 15, color: 'dimgray', fontWeight: "500", marginRight: 10 }}>Can reply?</Text>
          <TouchableOpacity_
            onPress={() => onSelectCanRespond(true)}
            style={{ padding: 10, marginRight: 6 }}
            hoverOpacity={0.5}
          >
            <Image_ icon={ICONS.check} size={70} />
          </TouchableOpacity_>
          <TouchableOpacity_
            onPress={() => onSelectCanRespond(false)}
            style={{ padding: 10 }}
            hoverOpacity={0.5}
          >
            <Image_ icon={ICONS.redx} size={70} />
          </TouchableOpacity_>
        </View>
        <TouchableOpacity onPress={hasActivePhone ? onToggleForward : undefined} style={{ flexDirection: "row", alignItems: "center", opacity: hasActivePhone ? 1 : 0.4 }}>
          <View style={{ width: 22, height: 22, borderRadius: 4, backgroundColor: forwardReplies ? C.red : "transparent", borderWidth: 2, borderColor: forwardReplies ? C.red : gray(0.15), alignItems: "center", justifyContent: "center" }}>
            {forwardReplies && <Text style={{ color: "white", fontSize: 14, fontWeight: "bold" }}>✓</Text>}
          </View>
          <Text style={{ fontSize: 17, color: C.text, marginLeft: 8 }}>Forward replies to me</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

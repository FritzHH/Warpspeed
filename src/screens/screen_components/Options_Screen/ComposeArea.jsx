/* eslint-disable */

import React, { useRef } from "react";
import {
  DropdownMenu as DropdownMenuDom,
  Image as ImageDom,
  TextInput as TextInputDom,
  TouchableOpacity as TouchableOpacityDom,
} from "../../../dom_components";
import { C, ICONS } from "../../../styles";
import { ReplyOptionsBar } from "./ReplyOptionsBar";
import s from "./Messages.module.css";

const TRANSLATION_LANGUAGES = [
  { label: "English", code: "en" },
  { label: "Spanish", code: "es" },
  { label: "French", code: "fr" },
  { label: "German", code: "de" },
  { label: "Creole", code: "ht" },
  { label: "Arabic", code: "ar" },
];

/**
 * Shared compose area for customer + hub message tabs.
 *
 * Renders (top → bottom):
 *   • translation banner (auto, when fromLang ≠ toLang and message present)
 *   • audio banner (auto, when audioUrl present)
 *   • ReplyOptionsBar (auto, when showReplyOptions true)
 *   • input row: TextInput (auto-grows internally) + airplane send button
 *   • footer row: from-lang → to-lang dropdowns, then centerSlot, then rightSlot
 */
export function ComposeArea({
  mode = "customer",
  value,
  onChange,
  onSend,
  sendDisabled,
  textInputRef,
  onSelect,
  placeholder = "Message...",
  audioUrl,
  audioUploading,
  showReplyOptions,
  audioMode,
  onSelectCanRespond,
  onSendAudio,
  onDeleteAudio,
  selectedForwardIDs,
  onChangeSelectedForwardIDs,
  onFire,
  onCancelReply,
  hasActivePhone,
  fromLang,
  onFromLang,
  toLang,
  onToLang,
  translatedText,
  translateLoading,
  centerSlot,
  rightSlot,
}) {
  let rootClass = s.composeRoot + (mode === "hub" ? " " + s["composeRoot--hub"] : "");
  let showTranslate = fromLang && toLang && fromLang !== toLang && value && value.trim();

  const internalInputRef = useRef(null);
  const inputRef = textInputRef || internalInputRef;

  return (
    <div className={rootClass}>
      {showTranslate ? (
        <div className={s.translationBanner}>
          {translatedText && !translateLoading ? (
            <span className={s.translationText}>{translatedText}</span>
          ) : (
            <span className={s.translationLoading}>Translating...</span>
          )}
        </div>
      ) : null}

      {audioUrl ? (
        <div className={s.audioBanner}>
          <audio controls src={audioUrl} />
        </div>
      ) : null}

      <ReplyOptionsBar
        visible={!!showReplyOptions}
        hasActivePhone={hasActivePhone}
        audioMode={audioMode}
        audioUploading={audioUploading}
        onSelectCanRespond={onSelectCanRespond}
        onSendAudio={onSendAudio}
        onDeleteAudio={onDeleteAudio}
        selectedForwardIDs={selectedForwardIDs}
        onChangeSelectedForwardIDs={onChangeSelectedForwardIDs}
        onFire={onFire}
        onCancel={onCancelReply}
      />

      <div className={s.inputRow} style={{ borderColor: C.surfaceOverlayLight }}>
        <TextInputDom
          ref={inputRef}
          value={value}
          onChangeText={onChange}
          debounceMs={0}
          autoFocus={true}
          multiline={true}
          numberOfLines={0}
          placeholder={placeholder}
          placeholderTextColor="gray"
          onSelect={onSelect}
          className={s.inputField}
          style={{ color: C.text }}
        />
        <div className={s.sendColumn}>
          <TouchableOpacityDom
            onPress={() => { if (!sendDisabled) onSend(); }}
            className={s.sendButton}
            style={{ opacity: sendDisabled ? 0.3 : 1 }}
          >
            <ImageDom icon={ICONS.airplane} size={41} />
          </TouchableOpacityDom>
        </div>
      </div>

      <div className={s.footerRow}>
        <div style={{ display: "flex", flexDirection: "row", alignItems: "center" }}>
          <DropdownMenuDom
            dataArr={TRANSLATION_LANGUAGES}
            onSelect={(item) => onFromLang(item.code)}
            buttonText={TRANSLATION_LANGUAGES.find((l) => l.code === fromLang)?.label || "English"}
            buttonStyle={{ paddingVertical: 5, paddingHorizontal: 10 }}
            openUpward={mode === "hub"}
          />
          <ImageDom icon={ICONS.rightArrowBlue} size={16} className={s.footerArrow} />
          <DropdownMenuDom
            dataArr={TRANSLATION_LANGUAGES}
            onSelect={(item) => onToLang(item.code)}
            buttonText={TRANSLATION_LANGUAGES.find((l) => l.code === toLang)?.label || (mode === "hub" ? "Spanish" : "English")}
            buttonStyle={{ paddingVertical: 5, paddingHorizontal: 10 }}
            openUpward={mode === "hub"}
          />
        </div>
        {centerSlot}
        <div className={`${s.footerGroup} ${s.footerIconGroup}`}>
          {rightSlot}
        </div>
      </div>
    </div>
  );
}

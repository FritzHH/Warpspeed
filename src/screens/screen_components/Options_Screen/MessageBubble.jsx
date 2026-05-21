/* eslint-disable */

import React, { memo, lazy, Suspense, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Image as ImageDom,
  TouchableOpacity as TouchableOpacityDom,
  Tooltip as TooltipDom,
  SmallLoadingIndicator as SmallLoadingIndicatorDom,
} from "../../../dom_components";

const MediaLightbox = lazy(() => import("./MediaLightbox"));
import { C, ICONS, Z } from "../../../styles";
import { formatDateTimeForReceipt } from "../../../utils";
import { translateText } from "../../../db_calls";
import { dbSaveMessageTranslation } from "../../../db_calls_wrapper";
import { useLoginStore } from "../../../stores";
import s from "./Messages.module.css";

const TRANSLATION_LANGUAGES = [
  { label: "English", code: "en" },
  { label: "Spanish", code: "es" },
  { label: "French", code: "fr" },
  { label: "German", code: "de" },
  { label: "Creole", code: "ht" },
  { label: "Arabic", code: "ar" },
];

const URL_REGEX = /(https?:\/\/[^\s]+)/;

function LinkifiedText({ text, className, style }) {
  let parts = text.split(URL_REGEX);
  if (parts.length === 1) return <span className={className} style={style}>{text}</span>;
  return (
    <span className={className} style={style}>
      {parts.map((part, i) =>
        URL_REGEX.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => { e.preventDefault(); window.open(part, "_blank"); }}
          >
            {part}
          </a>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        )
      )}
    </span>
  );
}

export const MediaThumbnail = memo(({ url, thumbnailUrl, contentType }) => {
  const [sLoading, _setLoading] = useState(true);
  const [sError, _setError] = useState(false);
  const [sFullView, _setFullView] = useState(false);
  const isVideo = (contentType || "").startsWith("video/");

  function handleDownload() {
    fetch(url)
      .then((res) => res.blob())
      .then((blob) => {
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = url.split("/").pop()?.split("?")[0] || "download";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      })
      .catch(() => { window.open(url, "_blank"); });
  }

  return (
    <>
      <TouchableOpacityDom
        onPress={() => { _setFullView(true); }}
        className={s.mediaThumbBtn}
      >
        {sError ? (
          <span className={s.mediaThumbError}>Image unavailable</span>
        ) : isVideo ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <span className={s.mediaThumbVideoIcon}>&#9654;</span>
            <span className={s.mediaThumbVideoLabel}>Video</span>
          </div>
        ) : (
          <div style={{ position: "relative", width: "100%", height: "100%" }}>
            <img
              src={thumbnailUrl || url}
              alt=""
              className={s.mediaThumbImg}
              onLoad={() => _setLoading(false)}
              onError={() => { _setLoading(false); _setError(true); }}
            />
            {sLoading && (
              <div className={s.mediaThumbLoadingOverlay}>
                <SmallLoadingIndicatorDom />
              </div>
            )}
          </div>
        )}
      </TouchableOpacityDom>
      {sFullView && (
        <Suspense fallback={null}>
          <MediaLightbox
            url={url}
            isVideo={isVideo}
            onClose={() => _setFullView(false)}
            onDownload={handleDownload}
          />
        </Suspense>
      )}
    </>
  );
});

export const IncomingMessageComponent = memo(({ msgObj, onScrollToBottom, autoTranslateTo }) => {
  const cached = msgObj.translated;
  const [sTranslation, _setTranslation] = useState(
    cached
      ? { text: cached.text, loading: false, langCode: cached.langCode, detectedFrom: cached.detectedFrom || "" }
      : { text: "", loading: false, langCode: "" }
  );
  const [sContextMenu, _setContextMenu] = useState({ x: 0, y: 0, visible: false });
  const autoTranslatedRef = useRef(false);

  useEffect(() => {
    if (!sContextMenu.visible) return;
    function dismiss() { _setContextMenu(prev => ({ ...prev, visible: false })); }
    document.addEventListener("mousedown", dismiss);
    return () => document.removeEventListener("mousedown", dismiss);
  }, [sContextMenu.visible]);

  useEffect(() => {
    if (autoTranslatedRef.current || !autoTranslateTo || !msgObj.message) return;
    autoTranslatedRef.current = true;
    if (cached?.text && cached.langCode === autoTranslateTo) return;
    doTranslate("en", autoTranslateTo);
  }, [autoTranslateTo]);

  function handleContextMenu(e) {
    if (!msgObj.message) return;
    e.preventDefault();
    _setContextMenu({ x: e.clientX, y: e.clientY, visible: true });
  }

  function saveTranslation(translated) {
    if (!msgObj.id || !msgObj.phoneNumber) return;
    msgObj.translated = translated;
    dbSaveMessageTranslation(msgObj.phoneNumber, msgObj.id, translated);
  }

  function doTranslate(langCode, sourceLang) {
    _setContextMenu(prev => ({ ...prev, visible: false }));
    _setTranslation({ text: "", loading: true, langCode });
    if (onScrollToBottom) onScrollToBottom();
    translateText({ text: msgObj.message, targetLanguage: langCode, ...(sourceLang ? { sourceLanguage: sourceLang } : {}) })
      .then((result) => {
        if (result.success) {
          let translated = result.data?.data?.translatedText || result.data?.translatedText || "";
          let detected = result.data?.data?.detectedSourceLanguage || result.data?.detectedSourceLanguage || sourceLang || "";
          if (detected === langCode) {
            _setTranslation({ text: "", loading: false, langCode });
          } else {
            _setTranslation({ text: translated, loading: false, langCode, detectedFrom: detected });
            saveTranslation({ text: translated, langCode, detectedFrom: detected });
          }
        } else {
          _setTranslation({ text: "", loading: false, langCode });
        }
        if (onScrollToBottom) onScrollToBottom();
      })
      .catch(() => { _setTranslation({ text: "", loading: false, langCode }); });
  }

  let dateObj = formatDateTimeForReceipt(null, msgObj.millis);
  let hasMedia = msgObj.mediaUrls?.length > 0 || !!msgObj.imageUrl;
  let mediaOnly = hasMedia && !msgObj.message;
  let fromLangLabel = sTranslation.detectedFrom
    ? (TRANSLATION_LANGUAGES.find(l => l.code === sTranslation.detectedFrom)?.label || sTranslation.detectedFrom)
    : "";

  let outerClass = s.bubbleOuter + " " + s["bubbleOuter--incoming"] + (mediaOnly ? " " + s["bubbleOuter--mediaOnly"] : "");
  let innerClass = s.bubbleInner + " " + (hasMedia ? s["bubbleInner--media"] : s["bubbleInner--incoming"]) + (mediaOnly ? " " + s["bubbleInner--mediaOnly"] : "");

  return (
    <div className={outerClass}>
      <div className={s.bubbleInnerWrap}>
        <div className={innerClass}>
          {msgObj.mediaUrls?.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", marginBottom: msgObj.message ? 4 : 0 }}>
              {msgObj.mediaUrls.map((media, i) => (
                <MediaThumbnail key={i} url={media.url} thumbnailUrl={media.thumbnailUrl} contentType={media.contentType} />
              ))}
            </div>
          ) : msgObj.imageUrl ? (
            <MediaThumbnail url={msgObj.imageUrl} contentType="image/" />
          ) : null}
          {msgObj.message ? (
            <TooltipDom text="Right click for translation" position="top">
              <div onContextMenu={handleContextMenu} className={s.bubbleContextWrap}>
                {sTranslation.loading ? (
                  <>
                    <div className={s.bubbleTranslatingText}>Translating...</div>
                    <div className={s.bubbleOriginalText}>{msgObj.message}</div>
                  </>
                ) : sTranslation.text ? (
                  <>
                    <LinkifiedText text={sTranslation.text} className={s.bubbleText} />
                    <div className={s.bubbleOriginalText}>
                      {"Original" + (fromLangLabel ? " (" + fromLangLabel + ")" : "") + ": " + msgObj.message}
                    </div>
                  </>
                ) : (
                  <LinkifiedText text={msgObj.message} className={s.bubbleText} />
                )}
              </div>
            </TooltipDom>
          ) : null}
        </div>
        {!hasMedia && <div className={`${s.bubbleTail} ${s["bubbleTail--incoming"]}`} />}
      </div>
      <div className={s.bubbleInfoRow}>
        <span className={s.bubbleInfoText}>{dateObj.date}</span>
        <span className={s.bubbleInfoText}>{dateObj.dayOfWeek + ", " + dateObj.time}</span>
      </div>
      {msgObj.autoResponseSent && (
        <span className={s.bubbleAutoResponseText}>Auto-response sent (thread was closed)</span>
      )}
      {sContextMenu.visible && createPortal(
        <div
          onMouseDown={(e) => e.stopPropagation()}
          className={s.translateContextMenu}
          style={{ left: sContextMenu.x, bottom: window.innerHeight - sContextMenu.y, zIndex: Z.dropdown }}
        >
          <div className={s.translateContextHeader}>Translate to</div>
          {TRANSLATION_LANGUAGES.map((lang) => (
            <div
              key={lang.code}
              onClick={() => doTranslate(lang.code)}
              className={s.translateContextItem}
              style={{ color: C.text }}
            >
              {lang.label}
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
});

export const OutgoingMessageComponent = memo(({ msgObj, isLastOutgoing, thread, onToggleBlock, onToggleForward }) => {
  let displayStatus = msgObj.status;
  if (isLastOutgoing && thread?.lastOutgoingMessageID === msgObj.id && thread?.lastOutgoingMessageStatus) {
    displayStatus = thread.lastOutgoingMessageStatus;
  }
  let dateObj = formatDateTimeForReceipt(null, msgObj.millis);
  let isFailed = displayStatus === "failed" || displayStatus === "undelivered";
  let hasMedia = msgObj.mediaUrls?.length > 0 || !!msgObj.imageUrl;
  let mediaOnly = hasMedia && !msgObj.message;
  let showStatusIcons = isLastOutgoing;
  let currentUserID = useLoginStore.getState().getCurrentUser()?.id;
  let isForwarding = !!(currentUserID && thread?.forwardTo?.[currentUserID]);
  let isResponding = (thread?.canRespond !== undefined ? thread.canRespond : msgObj.canRespond);

  let outerClass = s.bubbleOuter + " " + s["bubbleOuter--outgoing"] + (mediaOnly ? " " + s["bubbleOuter--mediaOnly"] : "");
  let innerClass = s.bubbleInner + " " + (hasMedia ? s["bubbleInner--media"] : s["bubbleInner--outgoing"]) + (isFailed && !hasMedia ? " " + s["bubbleInner--outgoingFailed"] : "") + (mediaOnly ? " " + s["bubbleInner--mediaOnly"] : "");
  let tailClass = s.bubbleTail + " " + s["bubbleTail--outgoing"] + (isFailed ? " " + s["bubbleTail--outgoingFailed"] : "");

  return (
    <div className={outerClass}>
      <div className={s.bubbleInnerWrap}>
        <div className={innerClass}>
          {showStatusIcons && (
            <div className={s.bubbleStatusSidebar}>
              <TooltipDom text={isResponding ? "Block responses from user" : "Allow responses"} position="top">
                <TouchableOpacityDom onPress={onToggleBlock} className={s.bubbleStatusSidebarBtn}>
                  <ImageDom icon={isResponding ? ICONS.unblock : ICONS.blocked} size={35} />
                </TouchableOpacityDom>
              </TooltipDom>
              <TooltipDom text={isForwarding ? "Stop forwarding replies to me" : "Forward replies to me"} position="top">
                <TouchableOpacityDom onPress={onToggleForward} className={s.bubbleStatusSidebarBtn} style={{ marginTop: 4 }}>
                  <ImageDom icon={isForwarding ? ICONS.allowNotif : ICONS.blockNotif} size={28} />
                </TouchableOpacityDom>
              </TooltipDom>
            </div>
          )}
          <div className={s.bubbleContent}>
            {msgObj.mediaUrls?.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", marginBottom: msgObj.message ? 4 : 0 }}>
                {msgObj.mediaUrls.map((media, i) => (
                  <MediaThumbnail key={i} url={media.url} thumbnailUrl={media.thumbnailUrl} contentType={media.contentType} />
                ))}
              </div>
            ) : msgObj.imageUrl ? (
              <MediaThumbnail url={msgObj.imageUrl} contentType="image/" />
            ) : null}
            {msgObj.message ? (
              <LinkifiedText text={msgObj.message} className={`${s.bubbleText} ${s.bubbleTextOutgoing}`} />
            ) : null}
            {msgObj.originalMessage ? (
              <div className={`${s.bubbleOriginalText} ${s["bubbleOriginalText--outgoing"]}`}>
                {"Original" + (msgObj.translatedFrom ? " (" + (TRANSLATION_LANGUAGES.find(l => l.code === msgObj.translatedFrom)?.label || msgObj.translatedFrom) + ")" : "") + ": " + msgObj.originalMessage}
              </div>
            ) : null}
          </div>
        </div>
        {!hasMedia && <div className={tailClass} />}
      </div>
      <div className={s.bubbleInfoRow}>
        <span className={s.bubbleInfoText}>{dateObj.dayOfWeek + ", " + dateObj.time}</span>
        {(displayStatus === "sending" || displayStatus === "queued" || displayStatus === "accepted") && (
          <span className={`${s.bubbleStatusText} ${s["bubbleStatusText--sending"]}`}>Sending...</span>
        )}
        {displayStatus === "sent" && (
          <span className={s.bubbleStatusText} style={{ color: C.blue }}>Sent</span>
        )}
        {displayStatus === "delivered" && (
          <span className={s.bubbleStatusText} style={{ color: C.green }}>Delivered</span>
        )}
        {displayStatus === "undelivered" && (
          <span className={s.bubbleStatusText} style={{ color: C.red }}>Not Delivered</span>
        )}
        {displayStatus === "failed" && (
          <span className={s.bubbleStatusText} style={{ color: C.red }}>
            Failed{msgObj.errorMessage ? ": " + msgObj.errorMessage : ""}
          </span>
        )}
        <span className={s.bubbleInfoText}>{dateObj.date}</span>
      </div>
    </div>
  );
});

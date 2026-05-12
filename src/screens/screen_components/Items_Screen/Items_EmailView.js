/* eslint-disable */

import { View, Text, TouchableOpacity, ScrollView, FlatList, ActivityIndicator } from "react-native-web";
import React, { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { C, COLOR_GRADIENTS, Fonts, ICONS } from "../../../styles";
import { Button_, Image_, TextInput_ } from "../../../components";
import { useEmailStore, useLoginStore, useSettingsStore } from "../../../stores";
import { dbGmailSendEmail, dbGmailModifyLabels, dbGmailGetAttachment } from "../../../db_calls_wrapper";
import { log, gray } from "../../../utils";
import { uploadFileToStorage } from "../../../db_calls";
import dayjs from "dayjs";
import DOMPurify from "dompurify";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";

const QUILL_MODULES = {
  toolbar: [
    ["bold", "italic", "underline", "strike"],
    [{ list: "ordered" }, { list: "bullet" }],
    ["link"],
    ["clean"],
  ],
};

const QUILL_FORMATS = [
  "bold", "italic", "underline", "strike",
  "list", "link",
];

export function buildSignOffHtml(activeAccountKey) {
  let zSettings = useSettingsStore.getState().settings;
  let activeAccount = zSettings?.emailAccounts?.find((a) => a.accountKey === activeAccountKey) || {};
  let html = "";
  if (activeAccount.appendUserName) {
    let currentUser = useLoginStore.getState().getCurrentUser();
    if (currentUser) {
      let firstName = currentUser.first || "";
      let lastInitial = currentUser.last ? currentUser.last.charAt(0) + "." : "";
      let userName = (firstName + " " + lastInitial).trim();
      if (userName) {
        html += `<br/><br/><br/><p style="margin:0;">Thanks,<br/><br/>-${userName}</p>`;
      }
    }
  }
  let sig = activeAccount.signature || {};
  let hasSegments = sig?.segments?.length > 0 && sig.segments.some((s) => s.text);
  if (hasSegments || sig.imageUrl) {
    let scale = (sig.imageScale || 100) / 100;
    let logoImgTag = sig.imageUrl ? `<img src="${sig.imageUrl}" style="max-width:${Math.round(300 * scale)}px;max-height:${Math.round(300 * scale)}px;vertical-align:middle;" />` : "";
    let hasLogoVar = hasSegments && sig.segments.some((s) => s.text.includes("{logo}"));
    html += '<br/><div style="margin-top:10px;border-top:1px solid #ccc;padding-top:10px;">';
    if (hasSegments) {
      html += '<p style="margin:0;white-space:pre-wrap;">';
      for (let seg of sig.segments) {
        if (!seg.text) continue;
        let escaped = seg.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br/>");
        if (logoImgTag) escaped = escaped.replace(/\{logo\}/g, logoImgTag);
        html += `<span style="font-family:${seg.fontFamily};font-size:${seg.fontSize}px;font-weight:${seg.fontWeight};font-style:${seg.fontStyle || "normal"};">${escaped}</span>`;
      }
      html += "</p>";
    }
    if (sig.imageUrl && !hasLogoVar) {
      html += `<img src="${sig.imageUrl}" style="max-width:${Math.round(300 * scale)}px;max-height:${Math.round(300 * scale)}px;margin-top:${hasSegments ? "8" : "0"}px;" />`;
    }
    html += "</div>";
  }
  return html;
}

export const Items_EmailView = React.memo(() => {
  const zSelectedThreadId = useEmailStore((state) => state.selectedThreadId);
  const zComposeMode = useEmailStore((state) => state.composeMode);
  const zEmails = useEmailStore((state) => state.emails);
  const zActiveAccountKey = useEmailStore((state) => state.activeAccountKey);
  const zSendingEmail = useEmailStore((state) => state.sendingEmail);

  const zThreadMessages = useMemo(() => {
    if (!zSelectedThreadId) return [];
    return zEmails
      .filter((e) => e.threadId === zSelectedThreadId && e.accountKey === zActiveAccountKey)
      .sort((a, b) => (a.internalDate || 0) - (b.internalDate || 0));
  }, [zEmails, zSelectedThreadId, zActiveAccountKey]);

  let content;
  if (zComposeMode) {
    content = <ComposeView />;
  } else if (zSelectedThreadId && zThreadMessages.length > 0) {
    content = <ThreadView />;
  } else {
    content = (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 20 }}>
        <Image_ icon={ICONS.paperPlane} size={64} style={{ opacity: 0.2, marginBottom: 16 }} />
        <Text style={{ fontSize: 16, color: gray(0.5) }}>
          Select an email to read, or compose a new message
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {content}
      {zSendingEmail && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(255,255,255,0.7)",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 999,
          }}
        >
          <Image_ icon={ICONS.wheelGIF} size={80} />
          <Text style={{ fontSize: 15, color: C.text, marginTop: 12, fontWeight: Fonts.weight.textHeavy }}>
            Sending email...
          </Text>
        </View>
      )}
    </View>
  );
});

// ============================================================================
// THREAD VIEW
// ============================================================================

const ThreadView = React.memo(() => {
  const zSelectedThreadId = useEmailStore((state) => state.selectedThreadId);
  const zEmails = useEmailStore((state) => state.emails);
  const zActiveAccountKey = useEmailStore((state) => state.activeAccountKey);
  const [sExpandedMessages, _sSetExpandedMessages] = useState({});

  const zThreadMessages = useMemo(() => {
    if (!zSelectedThreadId) return [];
    return zEmails
      .filter((e) => e.threadId === zSelectedThreadId && e.accountKey === zActiveAccountKey)
      .sort((a, b) => (a.internalDate || 0) - (b.internalDate || 0));
  }, [zEmails, zSelectedThreadId, zActiveAccountKey]);

  if (!zThreadMessages.length) return null;

  const subject = zThreadMessages[0]?.subject || "(no subject)";
  const latestMessage = zThreadMessages[zThreadMessages.length - 1];

  function handleReply() {
    const msg = latestMessage;
    let signOff = buildSignOffHtml(zActiveAccountKey);
    useEmailStore.getState().setComposeMode("reply");
    useEmailStore.getState().updateComposeDraft({
      to: [msg.from],
      subject: msg.subject?.startsWith("Re:") ? msg.subject : `Re: ${msg.subject}`,
      bodyHtml: signOff || "",
      threadId: msg.threadId,
      inReplyTo: msg.messageIdHeader || "",
      references: [msg.references, msg.messageIdHeader].filter(Boolean).join(" "),
    });
  }

  function handleReplyAll() {
    const msg = latestMessage;
    const allRecipients = [...new Set([msg.from, ...(msg.to || []), ...(msg.cc || [])])];
    const zSettings = useSettingsStore.getState().settings;
    const myEmail = zSettings?.emailAccounts?.find((a) => a.accountKey === zActiveAccountKey)?.email || "";
    const toList = allRecipients.filter((e) => e !== myEmail);
    let signOff = buildSignOffHtml(zActiveAccountKey);
    useEmailStore.getState().setComposeMode("replyAll");
    useEmailStore.getState().updateComposeDraft({
      to: toList,
      subject: msg.subject?.startsWith("Re:") ? msg.subject : `Re: ${msg.subject}`,
      bodyHtml: signOff || "",
      threadId: msg.threadId,
      inReplyTo: msg.messageIdHeader || "",
      references: [msg.references, msg.messageIdHeader].filter(Boolean).join(" "),
    });
  }

  function handleForward() {
    const msg = latestMessage;
    let signOff = buildSignOffHtml(zActiveAccountKey);
    useEmailStore.getState().setComposeMode("forward");
    useEmailStore.getState().updateComposeDraft({
      to: [],
      subject: msg.subject?.startsWith("Fwd:") ? msg.subject : `Fwd: ${msg.subject}`,
      bodyHtml: (signOff || "") + buildQuotedHtml(msg),
      threadId: null,
      inReplyTo: "",
      references: "",
    });
  }

  async function handleMarkRead(unread) {
    const messageIds = zThreadMessages.map((m) => m.id);
    if (unread) {
      await dbGmailModifyLabels(messageIds, ["UNREAD"], []);
    } else {
      await dbGmailModifyLabels(messageIds, [], ["UNREAD"]);
    }
  }

  async function handleTrash() {
    const messageIds = zThreadMessages.map((m) => m.id);
    await dbGmailModifyLabels(messageIds, ["TRASH"], ["INBOX"]);
    useEmailStore.getState().setSelectedThreadId(null);
  }

  async function handleArchive() {
    const messageIds = zThreadMessages.map((m) => m.id);
    await dbGmailModifyLabels(messageIds, [], ["INBOX"]);
    useEmailStore.getState().setSelectedThreadId(null);
  }

  function toggleExpand(messageId) {
    _sSetExpandedMessages((prev) => ({ ...prev, [messageId]: !prev[messageId] }));
  }

  const isInbox = zThreadMessages.some((m) => m.labelIds?.includes("INBOX"));
  const isUnread = zThreadMessages.some((m) => m.isUnread);

  return (
    <View style={{ flex: 1 }}>
      {/* Thread header */}
      <View
        style={{
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: gray(0.12),
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <View style={{ flex: 1, marginRight: 12 }}>
          <Text style={{ fontSize: 18, fontWeight: Fonts.weight.textHeavy, color: C.text }}>
            {subject}
          </Text>
          <Text style={{ fontSize: 12, color: gray(0.5), marginTop: 2 }}>
            {zThreadMessages.length} message{zThreadMessages.length > 1 ? "s" : ""} in thread
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <ActionButton label={isUnread ? "Mark Read" : "Mark Unread"} onPress={() => handleMarkRead(!isUnread)} />
          {isInbox && <ActionButton label="Archive" onPress={handleArchive} />}
          <ActionButton label="Trash" onPress={handleTrash} color={C.red} />
        </View>
      </View>

      {/* Messages */}
      <ScrollView style={{ flex: 1, padding: 16 }}>
        {zThreadMessages.map((message, index) => {
          const isLast = index === zThreadMessages.length - 1;
          const isExpanded = isLast || sExpandedMessages[message.id];
          return (
            <MessageBubble
              key={message.id}
              message={message}
              isExpanded={isExpanded}
              onToggleExpand={() => toggleExpand(message.id)}
              isLast={isLast}
            />
          );
        })}
        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Reply bar */}
      <View
        style={{
          flexDirection: "row",
          padding: 12,
          borderTopWidth: 1,
          borderTopColor: gray(0.12),
          justifyContent: "flex-start",
          alignItems: "center",
        }}
      >
        <View style={{ marginRight: 12 }}>
          <Button_
            text="Reply"
            onPress={handleReply}
            colorGradientArr={COLOR_GRADIENTS.blue}
            buttonStyle={{ paddingHorizontal: 20 }}
          />
        </View>
        <View style={{ marginRight: 12 }}>
          <Button_
            text="Reply All"
            onPress={handleReplyAll}
            colorGradientArr={COLOR_GRADIENTS.lightBlue}
            buttonStyle={{ paddingHorizontal: 16 }}
          />
        </View>
        <Button_
          text="Forward"
          onPress={handleForward}
          colorGradientArr={COLOR_GRADIENTS.grey}
          buttonStyle={{ paddingHorizontal: 16 }}
        />
      </View>
    </View>
  );
});

// ============================================================================
// MESSAGE BUBBLE
// ============================================================================

const MessageBubble = React.memo(({ message, isExpanded, onToggleExpand, isLast }) => {
  const [sShowImages, _sSetShowImages] = useState(false);
  const [sDownloadingAttachment, _sSetDownloadingAttachment] = useState(null);

  const dateStr = message.internalDate
    ? dayjs(message.internalDate).format("MMM D, YYYY h:mm A")
    : "";

  async function handleDownloadAttachment(att) {
    if (att.storageUrl) {
      window.open(att.storageUrl, "_blank");
      return;
    }
    _sSetDownloadingAttachment(att.attachmentId);
    try {
      const result = await dbGmailGetAttachment(message.id, att.attachmentId, att.filename);
      if (result.success && result.data?.downloadUrl) {
        window.open(result.data.downloadUrl, "_blank");
      }
    } catch (e) {
      log("Attachment download error", e);
    }
    _sSetDownloadingAttachment(null);
  }

  let sanitizedHtml = "";
  if (isExpanded && message.bodyHtml) {
    let html = message.bodyHtml;
    if (!sShowImages) {
      html = html.replace(/<img[^>]*src=["']https?:\/\/[^"']*["'][^>]*>/gi, '<span style="color:#999;font-style:italic">[Image blocked]</span>');
    }
    DOMPurify.addHook("afterSanitizeAttributes", (node) => {
      if (node.tagName === "A") {
        node.setAttribute("target", "_blank");
        node.setAttribute("rel", "noopener noreferrer");
      }
    });
    sanitizedHtml = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        "p", "br", "div", "span", "a", "b", "strong", "i", "em", "u",
        "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6",
        "table", "thead", "tbody", "tr", "td", "th",
        "img", "blockquote", "pre", "code", "hr", "sub", "sup",
      ],
      ALLOWED_ATTR: ["href", "src", "alt", "style", "class", "target", "rel", "width", "height"],
      ALLOW_DATA_ATTR: false,
    });
    DOMPurify.removeHook("afterSanitizeAttributes");
  }

  return (
    <View
      style={{
        marginBottom: 12,
        borderWidth: 1,
        borderColor: gray(0.12),
        borderRadius: 10,
        overflow: "hidden",
        backgroundColor: C.listItemWhite,
      }}
    >
      {/* Header */}
      <TouchableOpacity
        onPress={onToggleExpand}
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          padding: 12,
          backgroundColor: isExpanded ? "transparent" : gray(0.03),
        }}
      >
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: Fonts.weight.textHeavy, color: C.text }}>
            {message.fromName || message.from}
          </Text>
          {isExpanded && (
            <Text style={{ fontSize: 11, color: gray(0.5), marginTop: 2 }}>
              To: {(message.to || []).join(", ")}
              {message.cc?.length > 0 && `  CC: ${message.cc.join(", ")}`}
            </Text>
          )}
        </View>
        <Text style={{ fontSize: 11, color: gray(0.5), flexShrink: 0 }}>{dateStr}</Text>
      </TouchableOpacity>

      {/* Body */}
      {isExpanded && (
        <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
          {/* Show images button */}
          {!sShowImages && message.bodyHtml?.match(/<img[^>]*src=["']https?:\/\//i) && (
            <TouchableOpacity
              onPress={() => _sSetShowImages(true)}
              style={{
                paddingVertical: 4,
                paddingHorizontal: 10,
                backgroundColor: gray(0.07),
                borderRadius: 6,
                alignSelf: "flex-start",
                marginBottom: 8,
              }}
            >
              <Text style={{ fontSize: 12, color: C.blue }}>Show images</Text>
            </TouchableOpacity>
          )}

          {sanitizedHtml ? (
            <div
              dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
              style={{
                fontSize: 14,
                lineHeight: "1.5",
                color: "#333",
                wordBreak: "break-word",
                overflowWrap: "break-word",
                maxWidth: "100%",
                overflow: "hidden",
              }}
            />
          ) : (
            <Text style={{ fontSize: 14, color: C.text, lineHeight: 20 }}>
              {message.bodyText || message.snippet || ""}
            </Text>
          )}

          {/* Attachments */}
          {message.attachments?.length > 0 && (
            <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: gray(0.1), paddingTop: 8 }}>
              <Text style={{ fontSize: 12, fontWeight: Fonts.weight.textHeavy, color: gray(0.5), marginBottom: 6 }}>
                Attachments ({message.attachments.length})
              </Text>
              {message.attachments.map((att) => (
                <TouchableOpacity
                  key={att.attachmentId || att.filename}
                  onPress={() => handleDownloadAttachment(att)}
                  disabled={sDownloadingAttachment === att.attachmentId}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                    backgroundColor: gray(0.05),
                    borderRadius: 6,
                    marginBottom: 4,
                  }}
                >
                  {sDownloadingAttachment === att.attachmentId ? (
                    <ActivityIndicator size="small" color={C.blue} style={{ marginRight: 8 }} />
                  ) : (
                    <Text style={{ fontSize: 14, marginRight: 8 }}>📎</Text>
                  )}
                  <Text style={{ fontSize: 12, color: C.blue, flex: 1 }} numberOfLines={1}>
                    {att.filename}
                  </Text>
                  <Text style={{ fontSize: 11, color: gray(0.5), marginLeft: 8 }}>
                    {att.size ? formatFileSize(att.size) : ""}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Collapsed snippet */}
      {!isExpanded && (
        <TouchableOpacity onPress={onToggleExpand} style={{ paddingHorizontal: 12, paddingBottom: 8 }}>
          <Text style={{ fontSize: 13, color: gray(0.5) }} numberOfLines={1}>
            {message.snippet || ""}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
});

// ============================================================================
// EMAIL AUTOCOMPLETE INPUT
// ============================================================================

const EmailAutocompleteInput = React.memo(({ value, onChangeText, placeholder }) => {
  const zEmails = useEmailStore((state) => state.emails);
  const [sFocused, _sSetFocused] = useState(false);
  const [sSelectedIndex, _sSetSelectedIndex] = useState(-1);
  const wrapperRef = useRef(null);

  const knownContacts = useMemo(() => {
    const contactMap = {};
    zEmails.forEach((email) => {
      const addContact = (addr, name) => {
        if (!addr) return;
        const lower = addr.toLowerCase().trim();
        if (!lower || !lower.includes("@")) return;
        if (!contactMap[lower] || (name && !contactMap[lower].name)) {
          contactMap[lower] = { email: lower, name: name || "" };
        }
      };
      addContact(email.from, email.fromName);
      (email.to || []).forEach((addr) => addContact(addr, ""));
      (email.cc || []).forEach((addr) => addContact(addr, ""));
    });
    return Object.values(contactMap).sort((a, b) => a.email.localeCompare(b.email));
  }, [zEmails]);

  const currentQuery = useMemo(() => {
    const parts = value.split(/[,;]/);
    return (parts[parts.length - 1] || "").trim().toLowerCase();
  }, [value]);

  const suggestions = useMemo(() => {
    if (!currentQuery || currentQuery.length < 1) return [];
    return knownContacts.filter(
      (c) => c.email.includes(currentQuery) || (c.name && c.name.toLowerCase().includes(currentQuery))
    ).slice(0, 8);
  }, [knownContacts, currentQuery]);

  const showDropdown = sFocused && suggestions.length > 0;

  useEffect(() => {
    _sSetSelectedIndex(-1);
  }, [suggestions.length]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        _sSetFocused(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function selectSuggestion(contact) {
    const parts = value.split(/[,;]/);
    parts.pop();
    const prefix = parts.length > 0 ? parts.join(", ") + ", " : "";
    onChangeText(prefix + contact.email + ", ");
    _sSetFocused(true);
  }

  function handleKeyDown(e) {
    if (!showDropdown) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      _sSetSelectedIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      _sSetSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" || e.key === "Tab") {
      if (sSelectedIndex >= 0 && sSelectedIndex < suggestions.length) {
        e.preventDefault();
        selectSuggestion(suggestions[sSelectedIndex]);
      }
    }
  }

  return (
    <div ref={wrapperRef} onKeyDown={handleKeyDown} style={{ flex: 1, position: "relative" }}>
      <TextInput_
        value={value}
        onChangeText={(val) => {
          onChangeText(val);
          _sSetFocused(true);
        }}
        onFocus={() => _sSetFocused(true)}
        placeholder={placeholder}
        style={{ fontSize: 14, outline: "none" }}
        debounceMs={0}
      />
      <div style={{ position: "absolute", left: 0, right: 0, top: "100%", zIndex: 999 }}>
        {showDropdown && (
          <View
            style={{
              backgroundColor: C.backgroundWhite,
              borderWidth: 1,
              borderColor: gray(0.18),
              borderRadius: 8,
              maxHeight: 220,
              overflow: "auto",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.15,
              shadowRadius: 6,
            }}
          >
            {suggestions.map((contact, idx) => (
              <TouchableOpacity
                key={contact.email}
                onPress={() => selectSuggestion(contact)}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  backgroundColor: idx === sSelectedIndex ? gray(0.08) : "transparent",
                  borderBottomWidth: idx < suggestions.length - 1 ? 1 : 0,
                  borderBottomColor: gray(0.07),
                }}
              >
                {contact.name ? (
                  <View>
                    <Text style={{ fontSize: 13, color: C.text, fontWeight: Fonts.weight.textHeavy }}>
                      {contact.name}
                    </Text>
                    <Text style={{ fontSize: 12, color: gray(0.45) }}>{contact.email}</Text>
                  </View>
                ) : (
                  <Text style={{ fontSize: 13, color: C.text }}>{contact.email}</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </div>
    </div>
  );
});

// ============================================================================
// COMPOSE VIEW
// ============================================================================

const ComposeView = React.memo(() => {
  const zComposeMode = useEmailStore((state) => state.composeMode);
  const zComposeDraft = useEmailStore((state) => state.composeDraft);
  const zSendingEmail = useEmailStore((state) => state.sendingEmail);
  const zActiveAccountKey = useEmailStore((state) => state.activeAccountKey);
  const zSettings = useSettingsStore((state) => state.settings);

  const [sShowCc, _sSetShowCc] = useState(zComposeDraft.cc?.length > 0);
  const [sShowBcc, _sSetShowBcc] = useState(zComposeDraft.bcc?.length > 0);
  const [sToInput, _sSetToInput] = useState(zComposeDraft.to?.join(", ") || "");
  const [sCcInput, _sSetCcInput] = useState(zComposeDraft.cc?.join(", ") || "");
  const [sBccInput, _sSetBccInput] = useState(zComposeDraft.bcc?.join(", ") || "");
  const [sError, _sSetError] = useState("");
  const fileInputRef = useRef(null);
  const videoInputRef = useRef(null);

  const quillCallbackRef = useCallback((node) => {
    if (node) {
      setTimeout(() => {
        const editor = node.getEditor();
        editor.setSelection(0, 0);
      }, 50);
    }
  }, []);

  const myEmail = zSettings?.emailAccounts?.find((a) => a.accountKey === zActiveAccountKey)?.email || "";

  const modeLabel =
    zComposeMode === "reply" ? "Reply" :
    zComposeMode === "replyAll" ? "Reply All" :
    zComposeMode === "forward" ? "Forward" :
    "New Email";

  function handleBodyChange(value) {
    useEmailStore.getState().updateComposeDraft({ bodyHtml: value });
  }

  function handleSubjectChange(value) {
    useEmailStore.getState().updateComposeDraft({ subject: value });
  }

  function handleDiscard() {
    useEmailStore.getState().clearComposeDraft();
  }

  async function handleSend() {
    _sSetError("");
    const toAddresses = sToInput
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const ccAddresses = sCcInput
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const bccAddresses = sBccInput
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (toAddresses.length === 0) {
      _sSetError("At least one recipient is required");
      return;
    }

    const draft = useEmailStore.getState().composeDraft;

    const photoAttachments = draft.attachments
      .filter((a) => a.type === "photo")
      .map((a) => ({
        filename: a.filename,
        mimeType: a.mimeType,
        content: a.base64,
      }));

    useEmailStore.getState().setSendingEmail(true);

    let finalBodyHtml = draft.bodyHtml || "";

    const result = await dbGmailSendEmail({
      accountKey: zActiveAccountKey,
      to: toAddresses,
      cc: ccAddresses,
      bcc: bccAddresses,
      subject: draft.subject,
      bodyHtml: finalBodyHtml,
      bodyText: stripHtml(finalBodyHtml),
      threadId: draft.threadId || undefined,
      inReplyTo: draft.inReplyTo || undefined,
      references: draft.references || undefined,
      attachments: photoAttachments.length > 0 ? photoAttachments : undefined,
      videoStorageUrl: draft.attachments.find((a) => a.type === "video")?.storageUrl || undefined,
    });

    useEmailStore.getState().setSendingEmail(false);

    if (result.success) {
      useEmailStore.getState().clearComposeDraft();
    } else {
      _sSetError(result.error || "Failed to send email");
    }
  }

  function handleAddPhoto() {
    fileInputRef.current?.click();
  }

  function handleAddVideo() {
    videoInputRef.current?.click();
  }

  async function handlePhotoSelected(event) {
    const files = event.target.files;
    if (!files?.length) return;

    const newAttachments = [...(useEmailStore.getState().composeDraft.attachments || [])];
    const totalExisting = newAttachments.reduce((sum, a) => sum + (a.size || 0), 0);

    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) {
        _sSetError(`${file.name} exceeds 10MB limit`);
        continue;
      }
      if (totalExisting + file.size > 25 * 1024 * 1024) {
        _sSetError("Total attachments exceed 25MB limit");
        break;
      }
      const base64 = await fileToBase64(file);
      newAttachments.push({
        type: "photo",
        filename: file.name,
        mimeType: file.type,
        size: file.size,
        base64,
        previewUrl: URL.createObjectURL(file),
      });
    }

    useEmailStore.getState().updateComposeDraft({ attachments: newAttachments });
    event.target.value = "";
  }

  async function handleVideoSelected(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) {
      _sSetError("Video exceeds 100MB limit");
      event.target.value = "";
      return;
    }

    _sSetError("");
    const newAttachments = [...(useEmailStore.getState().composeDraft.attachments || [])];
    const tempEntry = {
      type: "video",
      filename: file.name,
      mimeType: file.type,
      size: file.size,
      uploading: true,
      storageUrl: "",
    };
    newAttachments.push(tempEntry);
    useEmailStore.getState().updateComposeDraft({ attachments: newAttachments });

    try {
      const { tenantID, storeID } = getTenantAndStoreFromSettings();
      const path = `${tenantID}/${storeID}/email-attachments/videos/${Date.now()}_${file.name}`;
      const result = await uploadFileToStorage(file, path);
      const url = result.downloadURL;
      const updated = useEmailStore.getState().composeDraft.attachments.map((a) =>
        a.filename === file.name && a.type === "video"
          ? { ...a, uploading: false, storageUrl: url }
          : a
      );
      useEmailStore.getState().updateComposeDraft({ attachments: updated });
    } catch (e) {
      log("Video upload error", e);
      _sSetError("Failed to upload video");
      const filtered = useEmailStore.getState().composeDraft.attachments.filter(
        (a) => !(a.filename === file.name && a.type === "video")
      );
      useEmailStore.getState().updateComposeDraft({ attachments: filtered });
    }
    event.target.value = "";
  }

  function handleRemoveAttachment(index) {
    const updated = [...useEmailStore.getState().composeDraft.attachments];
    const removed = updated.splice(index, 1)[0];
    if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
    useEmailStore.getState().updateComposeDraft({ attachments: updated });
  }

  return (
    <View style={{ flex: 1 }}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: gray(0.12),
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: Fonts.weight.textHeavy, color: C.text }}>
          {modeLabel}
        </Text>
        <Text style={{ fontSize: 12, color: gray(0.5) }}>From: {myEmail}</Text>
      </View>

      <ScrollView style={{ flex: 1, padding: 16 }}>
        {/* To field */}
        <View style={{ marginBottom: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={{ fontSize: 13, color: gray(0.5), width: 40 }}>To:</Text>
            <EmailAutocompleteInput
              value={sToInput}
              onChangeText={_sSetToInput}
              placeholder="recipient@example.com"
            />
            {!sShowCc && (
              <TouchableOpacity onPress={() => _sSetShowCc(true)} style={{ marginLeft: 8 }}>
                <Text style={{ fontSize: 12, color: C.blue }}>Cc</Text>
              </TouchableOpacity>
            )}
            {!sShowBcc && (
              <TouchableOpacity onPress={() => _sSetShowBcc(true)} style={{ marginLeft: 8 }}>
                <Text style={{ fontSize: 12, color: C.blue }}>Bcc</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Cc field */}
        {sShowCc && (
          <View style={{ marginBottom: 8, flexDirection: "row", alignItems: "center" }}>
            <Text style={{ fontSize: 13, color: gray(0.5), width: 40 }}>Cc:</Text>
            <EmailAutocompleteInput
              value={sCcInput}
              onChangeText={_sSetCcInput}
              placeholder="cc@example.com"
            />
          </View>
        )}

        {/* Bcc field */}
        {sShowBcc && (
          <View style={{ marginBottom: 8, flexDirection: "row", alignItems: "center" }}>
            <Text style={{ fontSize: 13, color: gray(0.5), width: 40 }}>Bcc:</Text>
            <EmailAutocompleteInput
              value={sBccInput}
              onChangeText={_sSetBccInput}
              placeholder="bcc@example.com"
            />
          </View>
        )}

        {/* Subject field */}
        <View style={{ marginBottom: 12, flexDirection: "row", alignItems: "center" }}>
          <Text style={{ fontSize: 13, color: gray(0.5), width: 40 }}>Subj:</Text>
          <View style={{ flex: 1 }}>
            <TextInput_
              value={zComposeDraft.subject}
              onChangeText={handleSubjectChange}
              placeholder="Subject"
              style={{ fontSize: 14, outline: "none" }}
            />
          </View>
        </View>

        {/* Rich text editor */}
        <View
          style={{
            borderWidth: 1,
            borderColor: gray(0.15),
            borderRadius: 8,
            overflow: "hidden",
            minHeight: 250,
            marginBottom: 12,
          }}
        >
          <ReactQuill
            ref={quillCallbackRef}
            theme="snow"
            value={zComposeDraft.bodyHtml}
            onChange={handleBodyChange}
            modules={QUILL_MODULES}
            formats={QUILL_FORMATS}
            placeholder="Write your message..."
            style={{ minHeight: 200 }}
          />
        </View>

        {/* Attachment buttons */}
        <View style={{ flexDirection: "row", marginBottom: 12 }}>
          <TouchableOpacity
            onPress={handleAddPhoto}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingVertical: 6,
              paddingHorizontal: 12,
              backgroundColor: C.blue,
              borderRadius: 6,
              marginRight: 8,
            }}
          >
            <Text style={{ fontSize: 13, color: C.textWhite, fontWeight: Fonts.weight.textHeavy }}>Add Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleAddVideo}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingVertical: 6,
              paddingHorizontal: 12,
              backgroundColor: C.blue,
              borderRadius: 6,
            }}
          >
            <Text style={{ fontSize: 13, color: C.textWhite, fontWeight: Fonts.weight.textHeavy }}>Add Video</Text>
          </TouchableOpacity>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handlePhotoSelected}
            style={{ display: "none" }}
          />
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            onChange={handleVideoSelected}
            style={{ display: "none" }}
          />
        </View>

        {/* Attachment list */}
        {zComposeDraft.attachments?.length > 0 && (
          <View style={{ marginBottom: 12 }}>
            {zComposeDraft.attachments.map((att, index) => (
              <View
                key={`${att.filename}-${index}`}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 6,
                  paddingHorizontal: 10,
                  backgroundColor: gray(0.05),
                  borderRadius: 6,
                  marginBottom: 4,
                }}
              >
                <Text style={{ fontSize: 13, marginRight: 8 }}>
                  {att.type === "video" ? "🎥" : "📎"}
                </Text>
                <Text style={{ fontSize: 12, color: C.text, flex: 1 }} numberOfLines={1}>
                  {att.filename}
                </Text>
                <Text style={{ fontSize: 11, color: gray(0.5), marginRight: 8 }}>
                  {formatFileSize(att.size)}
                </Text>
                {att.uploading ? (
                  <ActivityIndicator size="small" color={C.blue} />
                ) : (
                  <TouchableOpacity onPress={() => handleRemoveAttachment(index)}>
                    <Text style={{ fontSize: 14, color: C.red }}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Quoted message for replies */}
        {(zComposeMode === "reply" || zComposeMode === "replyAll") && (
          <View
            style={{
              borderLeftWidth: 3,
              borderLeftColor: gray(0.2),
              paddingLeft: 12,
              marginTop: 8,
              opacity: 0.6,
            }}
          >
            <Text style={{ fontSize: 12, color: gray(0.5), marginBottom: 4 }}>
              Original message
            </Text>
          </View>
        )}

        {/* Error */}
        {sError ? (
          <Text style={{ fontSize: 13, color: C.red, marginTop: 8 }}>{sError}</Text>
        ) : null}

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Send/Discard bar */}
      <View
        style={{
          flexDirection: "row",
          padding: 12,
          borderTopWidth: 1,
          borderTopColor: gray(0.12),
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Button_
          text="Discard"
          onPress={handleDiscard}
          colorGradientArr={COLOR_GRADIENTS.grey}
          style={{ paddingHorizontal: 20 }}
        />
        <Button_
          text={zSendingEmail ? "Sending..." : "Send"}
          onPress={handleSend}
          loading={zSendingEmail}
          disabled={zSendingEmail}
          colorGradientArr={COLOR_GRADIENTS.green}
          style={{ paddingHorizontal: 30 }}
        />
      </View>
    </View>
  );
});

// ============================================================================
// HELPER COMPONENTS & FUNCTIONS
// ============================================================================

const ActionButton = ({ label, onPress, color }) => (
  <TouchableOpacity
    onPress={onPress}
    style={{
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: 6,
      backgroundColor: gray(0.07),
      marginLeft: 6,
    }}
  >
    <Text style={{ fontSize: 12, color: color || C.text, fontWeight: Fonts.weight.textHeavy }}>
      {label}
    </Text>
  </TouchableOpacity>
);

function formatFileSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function stripHtml(html) {
  if (!html) return "";
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || "";
}

function buildQuotedHtml(message) {
  const date = message.internalDate
    ? dayjs(message.internalDate).format("MMM D, YYYY h:mm A")
    : "";
  return `<br/><br/><div style="border-left:2px solid #ccc;padding-left:10px;color:#555">
    <p>On ${date}, ${message.fromName || message.from} wrote:</p>
    ${message.bodyHtml || `<p>${message.bodyText || ""}</p>`}
  </div>`;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getTenantAndStoreFromSettings() {
  const settings = useSettingsStore.getState().settings;
  return {
    tenantID: settings?.tenantID || "",
    storeID: settings?.storeID || "",
  };
}

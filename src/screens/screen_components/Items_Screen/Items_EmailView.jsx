/* eslint-disable */

import React, { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { C, COLOR_GRADIENTS, Fonts, ICONS } from "../../../styles";
import { Image } from "../../../dom_components/Image/Image";
import { Button } from "../../../dom_components/Button/Button";
import { TextInput } from "../../../dom_components/TextInput/TextInput";
import { TouchableOpacity } from "../../../dom_components/TouchableOpacity/TouchableOpacity";
import { LoadingIndicator } from "../../../dom_components/LoadingIndicator/LoadingIndicator";
import styles from "./Items_EmailView.module.css";
import { useEmailStore, useLoginStore, useSettingsStore } from "../../../stores";
import { dbGmailSendEmail, dbGmailModifyLabels, dbGmailGetAttachment } from "../../../db_calls_wrapper";
import { log } from "../../../utils";
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

import { buildSignOffHtml } from "./emailSignOff";

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
      <div className={styles.emptyState}>
        <Image icon={ICONS.paperPlane} size={64} className={styles.emptyStateIcon} />
        <span className={styles.emptyStateText} style={{ color: C.textMuted }}>
          Select an email to read, or compose a new message
        </span>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      {content}
      {zSendingEmail && (
        <div className={styles.sendingOverlay}>
          <Image icon={ICONS.wheelGIF} size={80} />
          <span
            className={styles.sendingText}
            style={{ color: C.text, fontWeight: Fonts.weight.textHeavy }}
          >
            Sending email...
          </span>
        </div>
      )}
    </div>
  );
});

// ============================================================================
// THREAD VIEW
// ============================================================================

const ThreadView = React.memo(() => {
  const zSelectedThreadId = useEmailStore((state) => state.selectedThreadId);
  const zEmails = useEmailStore((state) => state.emails);
  const zActiveAccountKey = useEmailStore((state) => state.activeAccountKey);
  const zThreadInspectorState = useEmailStore((state) => state.threadInspectorState);
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
    useEmailStore.getState().setThreadInspectorState("open");
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
    const myEmail = useEmailStore.getState().getEmailAccountByKey?.(zActiveAccountKey)?.email || "";
    const toList = allRecipients.filter((e) => e !== myEmail);
    let signOff = buildSignOffHtml(zActiveAccountKey);
    useEmailStore.getState().setComposeMode("replyAll");
    useEmailStore.getState().setThreadInspectorState("open");
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
    useEmailStore.getState().setThreadInspectorState("open");
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
    <div className={styles.threadRoot}>
      {/* Thread header */}
      <div className={styles.threadHeader} style={{ borderBottomColor: C.borderSubtle }}>
        <div className={styles.threadHeaderTitleCol}>
          <span
            className={styles.threadSubject}
            style={{ fontWeight: Fonts.weight.textHeavy, color: C.text }}
          >
            {subject}
          </span>
          <span className={styles.threadMeta} style={{ color: C.textMuted }}>
            {zThreadMessages.length} message{zThreadMessages.length > 1 ? "s" : ""} in thread
          </span>
        </div>
        <div className={styles.threadHeaderActions}>
          <button
            type="button"
            className={styles.viewThreadPill}
            onClick={() => {
              const current = useEmailStore.getState().threadInspectorState;
              useEmailStore.getState().setThreadInspectorState(
                current === "open" ? "hidden" : "open"
              );
            }}
            style={{
              borderColor: C.borderSubtle,
              color: C.text,
              background: zThreadInspectorState === "open" ? C.surfaceSuccessMuted : "transparent",
            }}
          >
            <img src={ICONS.eyeballs} alt="" className={styles.viewThreadIcon} />
            <span>View Thread</span>
          </button>
          <ActionButton label={isUnread ? "Mark Read" : "Mark Unread"} onPress={() => handleMarkRead(!isUnread)} />
          {isInbox && <ActionButton label="Archive" onPress={handleArchive} />}
          <ActionButton label="Trash" onPress={handleTrash} color={C.red} />
        </div>
      </div>

      {/* Messages */}
      <div className={styles.threadScroll}>
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
        <div className={styles.threadScrollSpacer} />
      </div>

      {/* Reply bar */}
      <div className={styles.replyBar} style={{ borderTopColor: C.borderSubtle }}>
        <div className={styles.replyButtonWrap}>
          <Button
            text="Reply"
            onPress={handleReply}
            colorGradientArr={COLOR_GRADIENTS.blue}
            buttonStyle={{ paddingLeft: 20, paddingRight: 20 }}
          />
        </div>
        <div className={styles.replyButtonWrap}>
          <Button
            text="Reply All"
            onPress={handleReplyAll}
            colorGradientArr={COLOR_GRADIENTS.lightBlue}
            buttonStyle={{ paddingLeft: 16, paddingRight: 16 }}
          />
        </div>
        <Button
          text="Forward"
          onPress={handleForward}
          colorGradientArr={COLOR_GRADIENTS.grey}
          buttonStyle={{ paddingLeft: 16, paddingRight: 16 }}
        />
      </div>
    </div>
  );
});

// ============================================================================
// MESSAGE BUBBLE
// ============================================================================

export const MessageBubble = React.memo(({ message, isExpanded, onToggleExpand, isLast }) => {
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
    <div
      className={styles.bubble}
      style={{ borderColor: C.borderSubtle, backgroundColor: C.listItemWhite }}
    >
      {/* Header */}
      <TouchableOpacity
        onPress={onToggleExpand}
        className={styles.bubbleHeader}
        style={{ backgroundColor: isExpanded ? "transparent" : C.surfaceAlt }}
      >
        <div className={styles.bubbleHeaderTextCol}>
          <span
            className={styles.bubbleFrom}
            style={{ fontWeight: Fonts.weight.textHeavy, color: C.text }}
          >
            {message.fromName || message.from}
          </span>
          {isExpanded && (
            <span className={styles.bubbleRecipients} style={{ color: C.textMuted }}>
              To: {(message.to || []).join(", ")}
              {message.cc?.length > 0 && `  CC: ${message.cc.join(", ")}`}
            </span>
          )}
        </div>
        <span className={styles.bubbleDate} style={{ color: C.textMuted }}>{dateStr}</span>
      </TouchableOpacity>

      {/* Body */}
      {isExpanded && (
        <div className={styles.bubbleBody}>
          {/* Show images button */}
          {!sShowImages && message.bodyHtml?.match(/<img[^>]*src=["']https?:\/\//i) && (
            <TouchableOpacity
              onPress={() => _sSetShowImages(true)}
              className={styles.showImagesBtn}
              style={{ backgroundColor: C.surfaceAlt }}
            >
              <span className={styles.showImagesText} style={{ color: C.blue }}>Show images</span>
            </TouchableOpacity>
          )}

          {sanitizedHtml ? (
            <div
              className={styles.bubbleHtmlBody}
              dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
            />
          ) : (
            <span className={styles.bubbleTextBody} style={{ color: C.text }}>
              {message.bodyText || message.snippet || ""}
            </span>
          )}

          {/* Attachments */}
          {message.attachments?.length > 0 && (
            <div className={styles.attachmentsBlock} style={{ borderTopColor: C.borderSubtle }}>
              <span
                className={styles.attachmentsHeader}
                style={{ fontWeight: Fonts.weight.textHeavy, color: C.textMuted }}
              >
                Attachments ({message.attachments.length})
              </span>
              {message.attachments.map((att) => (
                <TouchableOpacity
                  key={att.attachmentId || att.filename}
                  onPress={() => handleDownloadAttachment(att)}
                  disabled={sDownloadingAttachment === att.attachmentId}
                  className={styles.attachmentRow}
                  style={{ backgroundColor: C.surfaceAlt }}
                >
                  {sDownloadingAttachment === att.attachmentId ? (
                    <LoadingIndicator
                      size="small"
                      color={C.blue}
                      centered={false}
                      className={styles.attachmentSpinner}
                    />
                  ) : (
                    <span className={styles.attachmentIcon}>📎</span>
                  )}
                  <span className={styles.attachmentName} style={{ color: C.blue }}>
                    {att.filename}
                  </span>
                  <span className={styles.attachmentSize} style={{ color: C.textMuted }}>
                    {att.size ? formatFileSize(att.size) : ""}
                  </span>
                </TouchableOpacity>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Collapsed snippet */}
      {!isExpanded && (
        <TouchableOpacity onPress={onToggleExpand} className={styles.snippetRow}>
          <span className={styles.snippetText} style={{ color: C.textMuted }}>
            {message.snippet || ""}
          </span>
        </TouchableOpacity>
      )}
    </div>
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
    <div ref={wrapperRef} onKeyDown={handleKeyDown} className={styles.autocompleteWrap}>
      <TextInput
        value={value}
        onChangeText={(val) => {
          onChangeText(val);
          _sSetFocused(true);
        }}
        onFocus={() => _sSetFocused(true)}
        placeholder={placeholder}
        style={{ fontSize: 14, outline: "none" }}
        debounceMs={0}
        type="email"
        autoComplete="email"
        name="compose-recipient"
      />
      <div className={styles.autocompleteDropdownAnchor}>
        {showDropdown && (
          <div
            className={styles.autocompleteDropdown}
            style={{
              backgroundColor: C.backgroundWhite,
              borderColor: C.borderSubtle,
              boxShadow: "0 2px 6px rgba(0, 0, 0, 0.15)",
            }}
          >
            {suggestions.map((contact, idx) => (
              <TouchableOpacity
                key={contact.email}
                onPress={() => selectSuggestion(contact)}
                className={`${styles.autocompleteItem} ${idx < suggestions.length - 1 ? styles.autocompleteItemBorder : ""}`}
                style={{
                  backgroundColor: idx === sSelectedIndex ? C.surfaceAlt : "transparent",
                  borderBottomColor: C.borderSubtle,
                }}
              >
                {contact.name ? (
                  <>
                    <span
                      className={styles.autocompleteItemName}
                      style={{ color: C.text, fontWeight: Fonts.weight.textHeavy }}
                    >
                      {contact.name}
                    </span>
                    <span className={styles.autocompleteItemEmail} style={{ color: C.textMuted }}>
                      {contact.email}
                    </span>
                  </>
                ) : (
                  <span className={styles.autocompleteItemName} style={{ color: C.text }}>
                    {contact.email}
                  </span>
                )}
              </TouchableOpacity>
            ))}
          </div>
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
  const zEmailAccounts = useEmailStore((state) => state.emailAccounts);
  const zThreadInspectorState = useEmailStore((state) => state.threadInspectorState);

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

  const myEmail = (zEmailAccounts || []).find(
    (a) => (a.accountKey || a.id) === zActiveAccountKey
  )?.email || "";

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
      useEmailStore.getState().setThreadInspectorState("hidden");
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
    <div className={styles.composeRoot}>
      {/* Header */}
      <div className={styles.composeHeader} style={{ borderBottomColor: C.borderSubtle }}>
        <span
          className={styles.composeModeLabel}
          style={{ fontWeight: Fonts.weight.textHeavy, color: C.text }}
        >
          {modeLabel}
        </span>
        {zComposeMode !== "new" &&
          zComposeMode !== null &&
          zThreadInspectorState === "minimized" && (
            <button
              type="button"
              className={styles.viewThreadPill}
              onClick={() =>
                useEmailStore.getState().setThreadInspectorState("open")
              }
              style={{ borderColor: C.borderSubtle, color: C.text }}
            >
              <img src={ICONS.eyeballs} alt="" className={styles.viewThreadIcon} />
              <span>View Thread</span>
            </button>
          )}
        <span className={styles.composeFromLabel} style={{ color: C.textMuted }}>
          From: {myEmail}
        </span>
      </div>

      <div className={styles.composeScroll}>
        {/* To field */}
        <div className={styles.fieldBlock}>
          <div className={styles.fieldRow}>
            <span className={styles.fieldLabel} style={{ color: C.textMuted }}>To:</span>
            <EmailAutocompleteInput
              value={sToInput}
              onChangeText={_sSetToInput}
              placeholder="recipient@example.com"
            />
            {!sShowCc && (
              <TouchableOpacity onPress={() => _sSetShowCc(true)} className={styles.fieldToggle}>
                <span className={styles.fieldToggleText} style={{ color: C.blue }}>Cc</span>
              </TouchableOpacity>
            )}
            {!sShowBcc && (
              <TouchableOpacity onPress={() => _sSetShowBcc(true)} className={styles.fieldToggle}>
                <span className={styles.fieldToggleText} style={{ color: C.blue }}>Bcc</span>
              </TouchableOpacity>
            )}
          </div>
        </div>

        {/* Cc field */}
        {sShowCc && (
          <div className={styles.fieldBlock}>
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel} style={{ color: C.textMuted }}>Cc:</span>
              <EmailAutocompleteInput
                value={sCcInput}
                onChangeText={_sSetCcInput}
                placeholder="cc@example.com"
              />
            </div>
          </div>
        )}

        {/* Bcc field */}
        {sShowBcc && (
          <div className={styles.fieldBlock}>
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel} style={{ color: C.textMuted }}>Bcc:</span>
              <EmailAutocompleteInput
                value={sBccInput}
                onChangeText={_sSetBccInput}
                placeholder="bcc@example.com"
              />
            </div>
          </div>
        )}

        {/* Subject field */}
        <div className={styles.subjectFieldRow}>
          <span className={styles.fieldLabel} style={{ color: C.textMuted }}>Subj:</span>
          <div className={styles.subjectInputWrap}>
            <TextInput
              value={zComposeDraft.subject}
              onChangeText={handleSubjectChange}
              placeholder="Subject"
              style={{ fontSize: 14, outline: "none" }}
            />
          </div>
        </div>

        {/* Rich text editor */}
        <div className={styles.editorWrapper} style={{ borderColor: C.borderSubtle }}>
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
        </div>

        {/* Attachment buttons */}
        <div className={styles.attachBtnRow}>
          <TouchableOpacity
            onPress={handleAddPhoto}
            className={styles.attachBtn}
            style={{ backgroundColor: C.blue }}
          >
            <span
              className={styles.attachBtnText}
              style={{ color: C.textWhite, fontWeight: Fonts.weight.textHeavy }}
            >
              Add Photo
            </span>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleAddVideo}
            className={styles.attachBtn}
            style={{ backgroundColor: C.blue }}
          >
            <span
              className={styles.attachBtnText}
              style={{ color: C.textWhite, fontWeight: Fonts.weight.textHeavy }}
            >
              Add Video
            </span>
          </TouchableOpacity>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handlePhotoSelected}
            className={styles.hiddenFileInput}
          />
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            onChange={handleVideoSelected}
            className={styles.hiddenFileInput}
          />
        </div>

        {/* Attachment list */}
        {zComposeDraft.attachments?.length > 0 && (
          <div className={styles.composeAttachmentList}>
            {zComposeDraft.attachments.map((att, index) => (
              <div
                key={`${att.filename}-${index}`}
                className={styles.composeAttachmentRow}
                style={{ backgroundColor: C.surfaceAlt }}
              >
                <span className={styles.composeAttachmentEmoji}>
                  {att.type === "video" ? "🎥" : "📎"}
                </span>
                <span className={styles.composeAttachmentName} style={{ color: C.text }}>
                  {att.filename}
                </span>
                <span className={styles.composeAttachmentSize} style={{ color: C.textMuted }}>
                  {formatFileSize(att.size)}
                </span>
                {att.uploading ? (
                  <LoadingIndicator size="small" color={C.blue} centered={false} />
                ) : (
                  <TouchableOpacity onPress={() => handleRemoveAttachment(index)}>
                    <span className={styles.removeAttachmentBtn} style={{ color: C.red }}>✕</span>
                  </TouchableOpacity>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Quoted message for replies */}
        {(zComposeMode === "reply" || zComposeMode === "replyAll") && (
          <div className={styles.quoteBlock} style={{ borderLeftColor: C.borderSubtle }}>
            <span className={styles.quoteHeader} style={{ color: C.textMuted }}>
              Original message
            </span>
          </div>
        )}

        {/* Error */}
        {sError ? (
          <span className={styles.errorText} style={{ color: C.red }}>{sError}</span>
        ) : null}

        <div className={styles.composeScrollSpacer} />
      </div>

      {/* Send/Discard bar */}
      <div className={styles.composeActionBar} style={{ borderTopColor: C.borderSubtle }}>
        <Button
          text="Discard"
          onPress={handleDiscard}
          colorGradientArr={COLOR_GRADIENTS.grey}
          buttonStyle={{ paddingLeft: 20, paddingRight: 20 }}
        />
        <Button
          text={zSendingEmail ? "Sending..." : "Send"}
          onPress={handleSend}
          enabled={!zSendingEmail}
          colorGradientArr={COLOR_GRADIENTS.green}
          buttonStyle={{ paddingLeft: 30, paddingRight: 30 }}
        />
      </div>
    </div>
  );
});

// ============================================================================
// HELPER COMPONENTS & FUNCTIONS
// ============================================================================

const ActionButton = ({ label, onPress, color }) => (
  <TouchableOpacity
    onPress={onPress}
    className={styles.actionButton}
    style={{ backgroundColor: C.surfaceAlt }}
  >
    <span
      className={styles.actionButtonText}
      style={{ color: color || C.text, fontWeight: Fonts.weight.textHeavy }}
    >
      {label}
    </span>
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

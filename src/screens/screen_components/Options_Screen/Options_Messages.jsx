/* eslint-disable */

import { createPortal } from "react-dom";
import { capitalizeFirstLetterOfString, calculateRunningTotals, dim, findTemplateByType, formatDateTimeForReceipt, formatPhoneWithDashes, formatStoreHours, getWorkorderPaymentState, log, printBuilder } from "../../../utils";
import {
  DropdownMenu as DropdownMenuDom,
  Image as ImageDom,
  TextInput as TextInputDom,
  TouchableOpacity as TouchableOpacityDom,
  Tooltip as TooltipDom,
  LoadingIndicator as LoadingIndicatorDom,
  SmallLoadingIndicator as SmallLoadingIndicatorDom,
  PhoneNumberInput,
} from "../../../dom_components";
import { C, COLOR_GRADIENTS, Colors, ICONS, Fonts, Z } from "../../../styles";
import hubStyles from "./Messages.module.css";
import { useTranslation } from "../../../useTranslation";
import {
  SMS_PROTO,
  CUSTOMER_PROTO,
  SETTINGS_OBJ,
  TAB_NAMES,
} from "../../../data";
import React, {
  memo,
  useEffect,
  useReducer,
  useRef,
  useState,
  useCallback,
} from "react";
import {
  useOpenWorkordersStore,
  useCustMessagesStore,
  useLoginStore,
  useSettingsStore,
  useAlertScreenStore,
  useActiveSalesStore,
  useCurrentCustomerStore,
  useTabNamesStore,
} from "../../../stores";
import { smsService } from "../../../data_service_modules";
import { DEBOUNCE_DELAY, build_db_path } from "../../../constants";
import { dbSendReceipt, dbCreateTextToPayInvoice, dbListenToNewMessages, dbGetCustomerMessages, dbUpdateMessageCanRespond, dbToggleSMSForwarding, dbGetCustomer, dbSaveMessageTranslation } from "../../../db_calls_wrapper";
import { translateText } from "../../../db_calls";
import { WorkorderMediaModal } from "../modal_screens/WorkorderMediaModal";
import { scheduleAutoSend, clearAutoSend, buildForwardToPayload } from "./ReplyOptionsBar";
import { ComposeArea } from "./ComposeArea";
import { IncomingMessageComponent, OutgoingMessageComponent, MediaThumbnail } from "./MessageBubble";


const TRANSLATION_LANGUAGES = [
  { label: "English", code: "en" },
  { label: "Spanish", code: "es" },
  { label: "French", code: "fr" },
  { label: "German", code: "de" },
  { label: "Creole", code: "ht" },
  { label: "Arabic", code: "ar" },
];
const LANG_NAME_TO_CODE = { English: "en", Spanish: "es", French: "fr", German: "de", Creole: "ht", Arabic: "ar" };

function scrollListToBottom(ref, animated) {
  let el = ref?.current;
  if (!el) return;
  try { el.scrollTo({ top: el.scrollHeight, behavior: animated ? "smooth" : "auto" }); }
  catch (e) { el.scrollTop = el.scrollHeight; }
}

const TEXT_TEMPLATE_VARIABLES = [
  { label: "First Name", variable: "{firstName}" },
  { label: "Last Name", variable: "{lastName}" },
  { label: "Brand", variable: "{brand}" },
  { label: "Description", variable: "{description}" },
  { label: "Total Amount", variable: "{totalAmount}" },
  { label: "Line Items", variable: "{lineItems}" },
  { label: "Part Ordered", variable: "{partOrdered}" },
  { label: "Part Source", variable: "{partSource}" },
  { label: "Store Hours", variable: "{storeHours}" },
  { label: "Store Phone", variable: "{storePhone}" },
  { label: "Support Email", variable: "{supportEmail}" },
];

// Auto-capitalize: first letter, after sentence-ending punctuation, standalone "i"
function autoCapitalize(val) {
  if (!val) return val;
  if (val.length > 10000) val = val.slice(0, 10000);
  val = val.replace(/(^|[.!?]\s+)([a-z])/g, (m, before, letter) => before + letter.toUpperCase());
  val = val.replace(/(^|\s)i(?=$|\s|[.,!?;:'])/g, (m, before) => before + "I");
  val = val.replace(/(\S?)(\s+)I([a-z])/g, (m, prev, space, after) => {
    if (/[.!?]/.test(prev)) return m;
    return prev + space + "i" + after;
  });
  return val;
}

export function MessagesComponent({}) {
  // getters ///////////////////////////////////////////////////////////////
  const zWorkorderObj = useOpenWorkordersStore((state) =>
    state.workorders.find((o) => o.id === state.openWorkorderID) || null
  );
  const zCustomer = zWorkorderObj?.customerID
    ? { id: zWorkorderObj.customerID, first: zWorkorderObj.customerFirst, last: zWorkorderObj.customerLast, customerCell: zWorkorderObj.customerCell }
    : CUSTOMER_PROTO;
  const zAllWorkorders = useOpenWorkordersStore((state) => state.workorders);
  const hasCustomer = !!zCustomer?.id && !!zCustomer?.customerCell;
  const zSettings = useSettingsStore((state) => state.settings);
  const zMessages = useCustMessagesStore((state) => state.messages);
  const zMessagesLoading = useCustMessagesStore((state) => state.messagesLoading);
  const zMessagesLoadingMore = useCustMessagesStore((state) => state.messagesLoadingMore);
  const zMessagesHasMore = useCustMessagesStore((state) => state.messagesHasMore);
  const zSmsThreads = useCustMessagesStore((state) => state.getSmsThreads());
  //////////////////////////////////////////////////////////////////////////

  // Clear hasNewSMS flag when messages are viewed - only if current user sent the last message
  useEffect(() => {
    if (zWorkorderObj?.hasNewSMS) {
      let currentUser = useLoginStore.getState().getCurrentUser();
      if (currentUser?.id && zWorkorderObj.lastSMSSenderUserID === currentUser.id) {
        useOpenWorkordersStore.getState().setField("hasNewSMS", false, zWorkorderObj.id);
      }
    }
    if (zWorkorderObj?.customerCell) {
      let thread = zSmsThreads.find(t => t.phone === zWorkorderObj.customerCell);
      if (thread) _setReadThreadPhones(prev => ({ ...prev, [thread.phone]: thread.lastMillis }));
    }
  }, [zWorkorderObj?.hasNewSMS, zWorkorderObj?.id]);

  const [sNewMessage, _setNewMessage] = useState("");
  const [sCanRespond, _setCanRespond] = useState(false);
  const [sFromLang, _setFromLang] = useState("en");
  const [sToLang, _setToLang] = useState(() => LANG_NAME_TO_CODE[zWorkorderObj?.customerLanguage] || "en");
  const [sShowMediaPicker, _setShowMediaPicker] = useState(false);
  const [sCustomPhoneMode, _setCustomPhoneMode] = useState(false);
  const [sShowReplyModal, _setShowReplyModal] = useState(false);
  const [sCustomPhone, _setCustomPhone] = useState("");
  const [sCustomPhoneMessages, _setCustomPhoneMessages] = useState([]);
  const [sForwardReplies, _setForwardReplies] = useState(false);
  const [sAudioRecording, _setAudioRecording] = useState(false);
  const [sAudioBlob, _setAudioBlob] = useState(null);
  const [sAudioUrl, _setAudioUrl] = useState("");
  const [sHasMicrophone, _setHasMicrophone] = useState(false);
  const [sAudioUploading, _setAudioUploading] = useState(false);
  const textInputRef = useRef("");
  const messageListRef = useRef(null);
  const debounceTimerRef = useRef(null);
  const cursorPositionRef = useRef(0);
  const pendingActionRef = useRef(null);
  const pendingMediaRef = useRef(null);
  const userOverrodeForwardRef = useRef(false);
  const userOverrodeCanRespondRef = useRef(false);
  const isUnmodifiedTemplateRef = useRef(false);
  const hasInitialScrolledRef = useRef(false);
  const lastMsgIdRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  // Hub mode (replaces custom phone dialer)
  // Hub cache is now loaded from IndexedDB on app start (BaseScreen)
  const [sHubMode, __setHubMode] = useState(() => useTabNamesStore.getState().getMessagesHubMode());
  const [sHubSelectedPhone, __setHubSelectedPhone] = useState(() => useTabNamesStore.getState().getMessagesHubPhone());

  const _setHubMode = useCallback((valOrFn) => {
    __setHubMode((prev) => {
      let val = typeof valOrFn === "function" ? valOrFn(prev) : valOrFn;
      useTabNamesStore.getState().setMessagesHubMode(val);
      return val;
    });
  }, []);

  const _setHubSelectedPhone = useCallback((valOrFn) => {
    __setHubSelectedPhone((prev) => {
      let val = typeof valOrFn === "function" ? valOrFn(prev) : valOrFn;
      useTabNamesStore.getState().setMessagesHubPhone(val);
      return val;
    });
  }, []);
  const [sHubNewPhone, _setHubNewPhone] = useState("");
  const [sReadThreadPhones, _setReadThreadPhones] = useState({});
  const [sHubSidebarCollapsed, _setHubSidebarCollapsed] = useState(false);
  const [sHubSidebarFullWidth, _setHubSidebarFullWidth] = useState(false);
  const [sHubHoverPhone, _setHubHoverPhone] = useState("");
  const hoverTimerRef = useRef(null);
  const [sHubVisibleCount, _setHubVisibleCount] = useState(35);
  const [sHubSearch, _setHubSearch] = useState("");
  const hubSearchInputRef = useRef(null);
  const hubLoadObserverRef = useRef(null);
  const hubSentinelRef = useCallback((node) => {
    if (hubLoadObserverRef.current) {
      hubLoadObserverRef.current.disconnect();
      hubLoadObserverRef.current = null;
    }
    if (!node) return;
    hubLoadObserverRef.current = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        _setHubVisibleCount((c) => c + 35);
      }
    }, { rootMargin: "200px 0px" });
    hubLoadObserverRef.current.observe(node);
  }, []);

  const {
    translatedText, isLoading: sTranslateLoading,
    debouncedTranslate, clearTranslation,
  } = useTranslation({ defaultDirection: "en-to-es" });

  // Debounced handler for message input
  const handleMessageChange = useCallback((val) => {
    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    val = autoCapitalize(val);

    // Update state immediately for responsive UI
    _setNewMessage(val);
    isUnmodifiedTemplateRef.current = false;
    if (sShowReplyModal) { _setShowReplyModal(false); clearAutoSend(); }

    // Trigger translation if languages differ
    if (sFromLang && sToLang && sFromLang !== sToLang) {
      debouncedTranslate(val, sToLang);
    }

    // Debounce any side effects (if needed in future)
    debounceTimerRef.current = setTimeout(() => {
      // Any debounced logic can go here
      // Currently just using for debouncing the state update itself
    }, DEBOUNCE_DELAY);
  }, [sFromLang, sToLang, debouncedTranslate]);

  // Load more messages on scroll to top (pagination)
  const loadMoreMessages = useCallback(() => {
    let msgStore = useCustMessagesStore.getState();
    if (msgStore.messagesLoadingMore || !msgStore.messagesHasMore || !msgStore.messagesPhone) return;
    let cursor = msgStore.messagesNextCursor;
    if (!cursor) return;
    msgStore.setMessagesLoadingMore(true);
    dbGetCustomerMessages(msgStore.messagesPhone, cursor, 7).then((result) => {
      if (!result.success) {
        useCustMessagesStore.getState().setMessagesLoadingMore(false);
        return;
      }
      let store = useCustMessagesStore.getState();
      store.prependMessages(result.messages);
      store.setMessagesHasMore(result.hasMore);
      store.setMessagesNextCursor(result.nextPageTimestamp);
      store.setMessagesLoadingMore(false);
      // Update IndexedDB cache with full merged array
      let allMessages = useCustMessagesStore.getState().getMessages();
      let phone = useCustMessagesStore.getState().getMessagesPhone();
      if (phone) store.setHubCachedThread(phone, allMessages, !result.hasMore);
    }).catch(() => {
      useCustMessagesStore.getState().setMessagesLoadingMore(false);
    });
  }, []);

  // Cleanup debounce timer on unmount + detect microphone
  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices().then(devices => {
      _setHasMicrophone(devices.some(d => d.kind === "audioinput"));
    }).catch(() => {});
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream?.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  // Custom phone mode: redirect to hub mode when phone is entered
  useEffect(() => {
    if (!sCustomPhoneMode || sCustomPhone.length !== 10) return;
    // Switch to hub mode with the entered phone pre-selected
    _setCustomPhoneMode(false);
    _setHubMode(true);
    _setHubSelectedPhone(sCustomPhone);
    _setCustomPhone("");
    _setCustomPhoneMessages([]);
  }, [sCustomPhoneMode, sCustomPhone]);

  useEffect(() => {
    try {
      // Read canRespond from thread parent doc (not from individual messages)
      if (!userOverrodeCanRespondRef.current && zCustomer?.customerCell) {
        let thread = zSmsThreads.find(t => t.phone === zCustomer.customerCell);
        if (thread) _setCanRespond(thread.canRespond !== undefined ? !!thread.canRespond : true);
      }
    } catch (e) {}

    if (zMessages.length === 0) {
      hasInitialScrolledRef.current = false;
      lastMsgIdRef.current = null;
      return;
    }
    if (sCustomPhoneMode) return;
    let lastId = zMessages[zMessages.length - 1]?.id;
    if (!hasInitialScrolledRef.current) {
      hasInitialScrolledRef.current = true;
      lastMsgIdRef.current = lastId;
      setTimeout(() => scrollListToBottom(messageListRef, false), 100);
      return;
    }
    if (lastId === lastMsgIdRef.current) return;
    lastMsgIdRef.current = lastId;
    scrollListToBottom(messageListRef, true);
  }, [zMessages]);

  // Auto-scroll custom phone messages to bottom
  useEffect(() => {
    try {
      if (!sCustomPhoneMode || sCustomPhoneMessages.length < 1) return;
      if (!hasInitialScrolledRef.current) {
        hasInitialScrolledRef.current = true;
        setTimeout(() => scrollListToBottom(messageListRef, false), 100);
        return;
      }
      if (sCustomPhoneMessages.length > 1) {
        scrollListToBottom(messageListRef, true);
      }
    } catch (e) {}
  }, [sCustomPhoneMessages]);

  function handleInsertVariable(variableStr) {
    let cursorPos = cursorPositionRef.current ?? sNewMessage.length;
    let before = sNewMessage.slice(0, cursorPos);
    let after = sNewMessage.slice(cursorPos);
    let newMessage = before + variableStr + " " + after;
    _setNewMessage(newMessage);
    cursorPositionRef.current = cursorPos + variableStr.length + 1;
    textInputRef.current?.focus();
    if (sFromLang && sToLang && sFromLang !== sToLang) debouncedTranslate(newMessage, sToLang);
  }

  function handleToggleForwardReplies() {
    const currentUser = useLoginStore.getState().getCurrentUser();
    if (!currentUser?.id) return;
    if (!currentUser?.phone) {
      useAlertScreenStore.getState().setValues({
        title: "No Phone Number",
        message: "Your account needs a personal phone number to enable SMS forwarding. Ask an admin to add one.",
        btn1Text: "OK",
        handleBtn1Press: () => useAlertScreenStore.getState().resetAll(),
        showAlert: true,
        canExitOnOuterClick: true,
      });
      return;
    }
    userOverrodeForwardRef.current = true;
    let newVal = !sForwardReplies;
    _setForwardReplies(newVal);
    if (newVal) {
      clearAutoSend();
      _setCanRespond(true);
      _setShowReplyModal(false);
      if (pendingActionRef.current === "intake") {
        handleSendWorkorderTicket(true, true);
        pendingActionRef.current = null;
      } else if (pendingActionRef.current === "media") {
        sendMediaMessage(true, true);
      } else if (pendingActionRef.current === "audio") {
        handleSendAudio(true, true);
        pendingActionRef.current = null;
      } else {
        sendMessage(sNewMessage, "", true, true);
      }
    }
  }


  function splitIntoChunks(text, maxLen = 1600) {
    if (text.length <= maxLen) return [text];
    let chunks = [];
    let remaining = text;
    while (remaining.length > 0) {
      if (remaining.length <= maxLen) { chunks.push(remaining); break; }
      let splitAt = remaining.lastIndexOf(" ", maxLen);
      if (splitAt <= 0) splitAt = maxLen;
      chunks.push(remaining.slice(0, splitAt));
      remaining = remaining.slice(splitAt).trimStart();
    }
    return chunks;
  }

  async function sendMessage(text, imageUrl = "", canRespondVal, forwardOverride) {
    if ((!text || !text.trim()) && !imageUrl) return;
    let sendPhone = sCustomPhoneMode ? sCustomPhone : zCustomer.customerCell;
    if (!sendPhone || sendPhone.length !== 10) return;
    useLoginStore.getState().requireLogin(async () => {
      let zCurrentUserObj = useLoginStore.getState().getCurrentUser();
      let useCanRespond = canRespondVal !== undefined ? canRespondVal : sCanRespond;
      let forwardTo = buildForwardToPayload(forwardOverride, sForwardReplies);
      userOverrodeForwardRef.current = false;
      userOverrodeCanRespondRef.current = false;

      let isTranslated = !!(translatedText && sFromLang && sToLang && sFromLang !== sToLang);
      let sendText = isTranslated ? translatedText : text;
      let originalText = isTranslated ? text : "";
      let translatedFromLang = isTranslated ? sFromLang : "";

      _setNewMessage("");
      _setShowReplyModal(false);
      clearTranslation();

      let chunks = splitIntoChunks(sendText || "");
      let anyFailed = false;
      let lastError = "";

      for (let i = 0; i < chunks.length; i++) {
        let isLastChunk = i === chunks.length - 1;
        let msg = { ...SMS_PROTO };
        msg.message = chunks[i];
        if (i === 0 && originalText) { msg.originalMessage = originalText; msg.translatedFrom = translatedFromLang; msg.translatedTo = isTranslated ? sToLang : ""; }
        msg.imageUrl = i === 0 ? imageUrl : "";
        msg.phoneNumber = sendPhone;
        msg.canRespond = isLastChunk && useCanRespond ? true : null;
        msg.millis = new Date().getTime() + i;
        msg.customerID = sCustomPhoneMode ? "" : zCustomer.id;
        if (!sCustomPhoneMode && zCustomer.first) msg.customerFirst = zCustomer.first;
        if (!sCustomPhoneMode && zCustomer.last) msg.customerLast = zCustomer.last;
        if (sCustomPhoneMode) {
          let matchedWO = zAllWorkorders.find(wo => wo.customerCell === sendPhone);
          if (matchedWO) { msg.customerFirst = matchedWO.customerFirst || ""; msg.customerLast = matchedWO.customerLast || ""; }
        }
        msg.id = crypto.randomUUID();
        msg.type = "outgoing";
        msg.senderUserObj = zCurrentUserObj;
        msg.sentByUser = zCurrentUserObj.id;
        if (isLastChunk && forwardTo) msg.forwardTo = forwardTo;
        if (sCustomPhoneMode) {
          _setCustomPhoneMessages(prev => [...prev, { ...msg, status: "sending" }]);
        }
        let result = await smsService.send(msg);
        if (sCustomPhoneMode) {
          _setCustomPhoneMessages(prev => prev.map(m =>
            m.id === msg.id
              ? { ...m, status: result.success ? "sent" : "failed", errorMessage: result.success ? "" : (result.error || "") }
              : m
          ));
        }
        if (!result.success) { anyFailed = true; lastError = result.error || ""; break; }
      }

      if (!anyFailed && !sCustomPhoneMode) {
        let allWOs = useOpenWorkordersStore.getState().workorders;
        allWOs.filter((wo) => wo.customerID === zCustomer.id).forEach((wo) => {
          useOpenWorkordersStore.getState().setField("lastSMSSenderUserID", zCurrentUserObj.id, wo.id);
        });
      }
      if (anyFailed) {
        useAlertScreenStore.getState().setValues({
          title: "Message Failed",
          message: lastError || "Failed to send message",
          btn1Text: "OK",
          handleBtn1Press: () => useAlertScreenStore.getState().resetAll(),
          showAlert: true,
          canExitOnOuterClick: true,
        });
      }
    });
  }
  function resolveTemplate(templateMessage) {
    if (!templateMessage) return "";
    let totalAmount = "";
    try {
      let totals = calculateRunningTotals(zWorkorderObj, zSettings?.salesTaxPercent, [], false, !!zWorkorderObj.taxFree);
      totalAmount = "$" + (totals.finalTotal / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } catch (e) {
      totalAmount = "$0.00";
    }
    let lineItems = "";
    try {
      lineItems = (zWorkorderObj?.workorderLines || [])
        .map((line) => {
          let name = line.inventoryItem?.informalName || line.inventoryItem?.formalName || "";
          return line.qty + "x " + name;
        })
        .join(", ");
    } catch (e) {}
    let storeHoursText = "";
    try {
      storeHoursText = formatStoreHours(zSettings?.storeHours);
    } catch (e) {}
    let brandsText = "";
    try {
      let customerWOs = (zAllWorkorders || []).filter((wo) => wo.customerID && wo.customerID === zCustomer?.id);
      let uniqueBrands = [...new Set(customerWOs.map((wo) => wo.brand).filter(Boolean))];
      brandsText = uniqueBrands.join(" & ");
    } catch (e) {}
    return templateMessage
      .replace(/\{firstName\}/g, capitalizeFirstLetterOfString(zCustomer?.first) || "")
      .replace(/\{lastName\}/g, capitalizeFirstLetterOfString(zCustomer?.last) || "")
      .replace(/\{brands\}/g, brandsText)
      .replace(/\{brand\}/g, zWorkorderObj?.brand || "")
      .replace(/\{description\}/g, zWorkorderObj?.description || "")
      .replace(/\{totalAmount\}/g, totalAmount)
      .replace(/\{lineItems\}/g, lineItems)
      .replace(/\{partOrdered\}/g, zWorkorderObj?.partOrdered || "")
      .replace(/\{partSource\}/g, zWorkorderObj?.partSource || "")
      .replace(/\{storeHours\}/g, storeHoursText)
      .replace(/\{storePhone\}/g, ((p) => p.length === 10 ? "(" + p.slice(0, 3) + ") " + p.slice(3, 6) + "-" + p.slice(6) : p)(zSettings?.storeInfo?.phone || ""))
      .replace(/\{supportEmail\}/g, zSettings?.storeInfo?.supportEmail || "");
  }
  function handleSendWorkorderTicket(canRespondVal, forwardOverride) {
    if (!zWorkorderObj || !zCustomer?.customerCell) return;
    useLoginStore.getState().requireLogin(() => {
      let settings = zSettings;
      let { tenantID, storeID } = useSettingsStore.getState().getSettings();

      let smsTemplate = findTemplateByType(settings?.smsTemplates || settings?.textTemplates, "intakeReceipt");
      if (!(smsTemplate?.content || smsTemplate?.message || smsTemplate?.text || "").trim()) return;

      const _ctx = { currentUser: useLoginStore.getState().getCurrentUser(), settings };
      let receiptData = printBuilder.intake(zWorkorderObj, zCustomer, settings?.salesTaxPercent, _ctx);
      let storagePath = build_db_path.cloudStorage.intakeReceiptPDF(zWorkorderObj.id, tenantID, storeID);
      let messageID = crypto.randomUUID();
      let canRespondBool = canRespondVal ? true : null;
      let forwardTo = buildForwardToPayload(forwardOverride, sForwardReplies);

      useCustMessagesStore.getState().setOutgoingMessage({
        ...SMS_PROTO,
        id: messageID,
        message: "Sending intake ticket...",
        phoneNumber: zCustomer.customerCell,
        customerID: zWorkorderObj?.customerID || "",
        type: "outgoing",
        millis: Date.now(),
        status: "sending",
        senderUserObj: useLoginStore.getState().getCurrentUser(),
        sentByUser: useLoginStore.getState().getCurrentUser()?.id || "",
      });

      dbSendReceipt({
        receiptType: "intake",
        receiptData,
        storagePath,
        sendSMS: true,
        sendEmail: false,
        customerEmail: "",
        customerCell: zCustomer.customerCell,
        customerID: zWorkorderObj?.customerID || "",
        templateVars: {
          firstName: capitalizeFirstLetterOfString((zCustomer?.first || "Customer").trim()),
          storeName: settings?.storeInfo?.displayName || "our store",
          brand: zWorkorderObj?.brand || "",
          description: zWorkorderObj?.description || "",
        },
        smsMessageID: messageID,
        canRespond: canRespondBool,
        forwardTo,
        updateWorkorderField: { workorderID: zWorkorderObj.id, field: "intakeReceiptURL" },
      }).then((result) => {
        if (result?.data?.receiptURL) {
          useOpenWorkordersStore.getState().setField("intakeReceiptURL", result.data.receiptURL, zWorkorderObj.id);
        }
        useCustMessagesStore.getState().updateMessageStatus(messageID, "sent", "");
      }).catch(() => {
        useCustMessagesStore.getState().updateMessageStatus(messageID, "failed", "Failed to send");
      });
    });
  }

  function handleSendFinalizedTicket(canRespondVal, forwardOverride) {
    if (!zWorkorderObj || !zCustomer?.customerCell) return;
    if (!zWorkorderObj.workorderLines || zWorkorderObj.workorderLines.length === 0) return;
    useLoginStore.getState().requireLogin(async () => {
      let settings = zSettings;
      let { tenantID, storeID } = useSettingsStore.getState().getSettings();

      const _ctx = { currentUser: useLoginStore.getState().getCurrentUser(), settings };
      let receiptData = printBuilder.workorder(zWorkorderObj, zCustomer, settings?.salesTaxPercent, _ctx);
      let activeSale = zWorkorderObj.activeSaleID
        ? useActiveSalesStore.getState().getActiveSale(zWorkorderObj.activeSaleID)
        : null;
      let paymentState = getWorkorderPaymentState(zWorkorderObj, activeSale, settings);
      if (paymentState.netPaid > 0) {
        receiptData.amountPaid = paymentState.netPaid;
        receiptData.finalTotal = Math.max(0, (receiptData.finalTotal || 0) - paymentState.netPaid);
      }
      let storagePath = `${tenantID}/${storeID}/workorder-tickets/${zWorkorderObj.id}.pdf`;
      let messageID = crypto.randomUUID();
      let canRespondBool = canRespondVal ? true : null;
      let forwardTo = buildForwardToPayload(forwardOverride, sForwardReplies);

      useCustMessagesStore.getState().setOutgoingMessage({
        ...SMS_PROTO,
        id: messageID,
        message: "Sending finalized ticket...",
        phoneNumber: zCustomer.customerCell,
        customerID: zWorkorderObj?.customerID || "",
        type: "outgoing",
        millis: Date.now(),
        status: "sending",
        senderUserObj: useLoginStore.getState().getCurrentUser(),
        sentByUser: useLoginStore.getState().getCurrentUser()?.id || "",
      });

      dbSendReceipt({
        receiptType: "workorder",
        receiptData,
        storagePath,
        sendSMS: true,
        sendEmail: false,
        customerEmail: "",
        customerCell: zCustomer.customerCell,
        customerID: zWorkorderObj?.customerID || "",
        templateVars: {
          firstName: capitalizeFirstLetterOfString((zCustomer?.first || "Customer").trim()),
          storeName: settings?.storeInfo?.displayName || "our store",
          brand: zWorkorderObj?.brand || "",
          description: zWorkorderObj?.description || "",
        },
        smsMessageID: messageID,
        canRespond: canRespondBool,
        forwardTo,
      }).then(() => {
        useCustMessagesStore.getState().updateMessageStatus(messageID, "sent", "");
      }).catch(() => {
        useCustMessagesStore.getState().updateMessageStatus(messageID, "failed", "Failed to send");
      });
    });
  }

  async function handleSendSMSPayment(hubPhone) {
    let sendPhone = hubPhone || (sCustomPhoneMode ? sCustomPhone : zCustomer?.customerCell);
    if (!zWorkorderObj || !sendPhone) return;
    if (!zWorkorderObj.workorderLines || zWorkorderObj.workorderLines.length === 0) {
      useAlertScreenStore.getState().setValues({
        title: "No Line Items",
        message: "This workorder has no line items to charge for.",
        btn1Text: "OK",
        handleBtn1Press: () => useAlertScreenStore.getState().resetAll(),
        showAlert: true,
        canExitOnOuterClick: true,
      });
      return;
    }
    if (zWorkorderObj.paymentComplete) {
      useAlertScreenStore.getState().setValues({
        title: "Already Paid",
        message: "This workorder is already paid.",
        btn1Text: "OK",
        handleBtn1Press: () => useAlertScreenStore.getState().resetAll(),
        showAlert: true,
        canExitOnOuterClick: true,
      });
      return;
    }
    useLoginStore.getState().requireLogin(async () => {
      let activeSale = zWorkorderObj.activeSaleID
        ? useActiveSalesStore.getState().getActiveSale(zWorkorderObj.activeSaleID)
        : null;
      let paymentState = getWorkorderPaymentState(zWorkorderObj, activeSale, zSettings);
      let amountDue = paymentState.remainingForThisWO;
      let displayAmount = "$" + (amountDue / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      let customerObj = useCurrentCustomerStore.getState().getCustomer();
      let custEmail = customerObj?.email || "";
      let hasPhone = sendPhone.length === 10;
      let hasEmail = custEmail && custEmail.includes("@");
      let channel = hasPhone && hasEmail ? "both" : (hasPhone ? "sms" : "email");

      let sendTo = [];
      if (hasPhone) sendTo.push(formatPhoneWithDashes(sendPhone));
      if (hasEmail) sendTo.push(custEmail);
      let recipientName = zCustomer?.first || "customer";

      useAlertScreenStore.getState().setValues({
        title: "Send Payment Link",
        message: "Send a payment link for " + displayAmount + " to " + recipientName + " at " + sendTo.join(" & ") + "?",
        btn1Text: "Send",
        btn2Text: "Cancel",
        handleBtn1Press: () => {
          useAlertScreenStore.getState().resetAll();
          let opts = {};
          if (!zWorkorderObj.customerID) opts.phone = sendPhone;
          if (hasEmail && !zWorkorderObj.customerID) opts.email = custEmail;

          let messageID = crypto.randomUUID();
          useCustMessagesStore.getState().setOutgoingMessage({
            ...SMS_PROTO,
            id: messageID,
            message: "Sending payment link for " + displayAmount + "...",
            phoneNumber: sendPhone,
            customerID: zWorkorderObj?.customerID || "",
            type: "outgoing",
            millis: Date.now(),
            status: "sending",
            senderUserObj: useLoginStore.getState().getCurrentUser(),
            sentByUser: useLoginStore.getState().getCurrentUser()?.id || "",
          });

          dbCreateTextToPayInvoice(zWorkorderObj.id, channel, opts).then((result) => {
            if (result && result.success) {
              useCustMessagesStore.getState().updateMessageStatus(messageID, "sent", "");
            } else {
              useCustMessagesStore.getState().updateMessageStatus(messageID, "failed", result?.error || "Failed to send payment link");
            }
          }).catch(() => {
            useCustMessagesStore.getState().updateMessageStatus(messageID, "failed", "Failed to send payment link");
          });
        },
        handleBtn2Press: () => useAlertScreenStore.getState().resetAll(),
        showAlert: true,
        canExitOnOuterClick: true,
      });
    });
  }
  function handleMediaPicked(mediaItem) {
    _setShowMediaPicker(false);
    if (!mediaItem || !mediaItem.url) return;
    pendingMediaRef.current = [mediaItem];
    pendingActionRef.current = "media";
    _setShowReplyModal(true);
    scheduleAutoSend(() => {
      _setShowReplyModal(false);
      sendMediaMessage(sCanRespond);
      pendingActionRef.current = null;
      pendingMediaRef.current = null;
    });
  }
  function handleMediaMultiSelect(mediaItems) {
    _setShowMediaPicker(false);
    if (!mediaItems || !mediaItems.length) return;
    pendingMediaRef.current = mediaItems;
    pendingActionRef.current = "media";
    _setShowReplyModal(true);
    scheduleAutoSend(() => {
      _setShowReplyModal(false);
      sendMediaMessage(sCanRespond);
      pendingActionRef.current = null;
      pendingMediaRef.current = null;
    });
  }
  function sendMediaMessage(canRespondVal, forwardOverride) {
    let mediaItems = pendingMediaRef.current;
    if (!mediaItems || !mediaItems.length) return;
    let sendPhone = sCustomPhoneMode ? sCustomPhone : zCustomer.customerCell;
    if (!sendPhone || sendPhone.length !== 10) return;
    useLoginStore.getState().requireLogin(async () => {
      let zCurrentUserObj = useLoginStore.getState().getCurrentUser();
      let useCanRespond = canRespondVal !== undefined ? canRespondVal : sCanRespond;
      let forwardTo = buildForwardToPayload(forwardOverride, sForwardReplies);
      userOverrodeForwardRef.current = false;
      userOverrodeCanRespondRef.current = false;
      _setShowReplyModal(false);
      let storeName = zSettings?.storeInfo?.displayName || "Our store";
      let hasImages = mediaItems.some((m) => m.type === "image");
      let hasVideos = mediaItems.some((m) => m.type === "video");
      let imageCount = mediaItems.filter((m) => m.type === "image").length;
      let videoCount = mediaItems.filter((m) => m.type === "video").length;
      let parts = [];
      if (hasImages) parts.push(imageCount === 1 ? "a photo" : imageCount + " photos");
      if (hasVideos) parts.push(videoCount === 1 ? "a video" : videoCount + " videos");
      let mediaText = storeName + " has sent you " + parts.join(" and ");
      let msg = { ...SMS_PROTO };
      msg.message = mediaText;
      msg.mediaUrls = mediaItems.map((m) => ({ url: m.url, thumbnailUrl: m.thumbnailUrl || "", contentType: m.type === "video" ? "video/mp4" : "image/jpeg" }));
      msg.phoneNumber = sendPhone;
      msg.canRespond = useCanRespond ? true : null;
      msg.millis = new Date().getTime();
      msg.customerID = sCustomPhoneMode ? "" : zCustomer.id;
      if (!sCustomPhoneMode && zCustomer.first) msg.customerFirst = zCustomer.first;
      if (!sCustomPhoneMode && zCustomer.last) msg.customerLast = zCustomer.last;
      if (sCustomPhoneMode) {
        let matchedWO = zAllWorkorders.find(wo => wo.customerCell === sendPhone);
        if (matchedWO) { msg.customerFirst = matchedWO.customerFirst || ""; msg.customerLast = matchedWO.customerLast || ""; }
      }
      msg.id = crypto.randomUUID();
      msg.type = "outgoing";
      msg.senderUserObj = zCurrentUserObj;
      msg.sentByUser = zCurrentUserObj.id;
      if (forwardTo) msg.forwardTo = forwardTo;
      if (sCustomPhoneMode) {
        _setCustomPhoneMessages(prev => [...prev, { ...msg, status: "sending" }]);
      }
      let result = await smsService.send(msg);
      if (sCustomPhoneMode) {
        _setCustomPhoneMessages(prev => prev.map(m =>
          m.id === msg.id
            ? { ...m, status: result.success ? "sent" : "failed", errorMessage: result.success ? "" : (result.error || "") }
            : m
        ));
      }
      if (result.success && !sCustomPhoneMode) {
        let allWOs = useOpenWorkordersStore.getState().workorders;
        allWOs.filter((wo) => wo.customerID === zCustomer.id).forEach((wo) => {
          useOpenWorkordersStore.getState().setField("lastSMSSenderUserID", zCurrentUserObj.id, wo.id);
        });
      }
      if (!result.success) {
        useAlertScreenStore.getState().setValues({
          title: "Message Failed",
          message: result.error || "Failed to send media",
          btn1Text: "OK",
          handleBtn1Press: () => useAlertScreenStore.getState().resetAll(),
          showAlert: true,
          canExitOnOuterClick: true,
        });
      }
      pendingMediaRef.current = null;
      pendingActionRef.current = null;
    });
  }
  ///////////////////////////////////////////////////////////////
  /////////////////////////////////////////////////////////////////

  // Determine active phone and message source based on mode
  const activePhone = sCustomPhoneMode ? sCustomPhone : zCustomer?.customerCell;
  const isCustomPhoneReady = sCustomPhoneMode && sCustomPhone.length === 10;

  let messagesArr;
  if (sCustomPhoneMode) {
    messagesArr = sCustomPhoneMessages;
  } else {
    messagesArr = zMessages;
  }

  let customerThread = zSmsThreads.find(t => t.phone === (sCustomPhoneMode ? sCustomPhone : zCustomer?.customerCell));

  let lastOutgoingID = null;
  for (let i = messagesArr.length - 1; i >= 0; i--) {
    if (messagesArr[i].type === "outgoing") { lastOutgoingID = messagesArr[i].id || messagesArr[i].millis; break; }
  }

  function handleEnterHubMode() {
    _setHubMode(true);
    _setHubSelectedPhone("");
    _setHubNewPhone("");
    _setNewMessage("");
    _setForwardReplies(false);
    clearTranslation();
  }

  function handleExitHubMode() {
    _setHubMode(false);
    _setHubSelectedPhone("");
    _setHubNewPhone("");
    _setNewMessage("");
    _setForwardReplies(false);
    clearTranslation();
    hasInitialScrolledRef.current = false;
    lastMsgIdRef.current = null;
  }

  async function handleHubOpenWorkorder(phone) {
    let wo = zAllWorkorders.find(w => w.customerCell === phone);
    if (!wo) return;
    useOpenWorkordersStore.getState().setOpenWorkorderID(wo.id);
    if (wo.customerID) {
      dbGetCustomer(wo.customerID).then((c) => {
        if (c) useCurrentCustomerStore.getState().setCustomer(c, false);
      });
    }
    if (wo.paymentComplete) useOpenWorkordersStore.getState().setLockedWorkorderID(wo.id);
    useTabNamesStore.getState().setItems({
      infoTabName: TAB_NAMES.infoTab.workorder,
      itemsTabName: TAB_NAMES.itemsTab.workorderItems,
      optionsTabName: TAB_NAMES.optionsTab.messages,
    });
    // Populate customer messages store from Hub cache so messages appear immediately
    let msgStore = useCustMessagesStore.getState();
    let cached = msgStore.getHubCachedThread(phone);
    msgStore.clearMessages();
    msgStore.setMessagesPhone(phone);
    let msgs = [];
    if (cached && cached.messages.length > 0) {
      msgs = cached.messages;
      msgStore.setMessages(msgs);
      msgStore.setMessagesHasMore(!cached.noMoreHistory);
    }
    // Set up real-time listener for new incoming messages
    let lastMillis = 0;
    msgs.forEach((m) => { if (m.millis > lastMillis) lastMillis = m.millis; });
    if (!lastMillis) lastMillis = Date.now();
    let unsub = dbListenToNewMessages(phone, lastMillis, (newMessages) => {
      if (useCustMessagesStore.getState().getMessagesPhone() !== phone) return;
      let store = useCustMessagesStore.getState();
      store.mergeMessages(newMessages);
      let allMessages = store.getMessages();
      store.setHubCachedThread(phone, allMessages, false);
    });
    msgStore.setMessagesUnsub(unsub);
    handleExitHubMode();
  }

  function handleHubOpenWorkorderKeepHub(wo) {
    if (!wo) return;
    _setHubMode(true);
    useOpenWorkordersStore.getState().setOpenWorkorderID(wo.id);
    if (wo.customerID) {
      dbGetCustomer(wo.customerID).then((c) => {
        if (c) useCurrentCustomerStore.getState().setCustomer(c, false);
      });
    }
    if (wo.paymentComplete) useOpenWorkordersStore.getState().setLockedWorkorderID(wo.id);
    useTabNamesStore.getState().setItems({
      infoTabName: TAB_NAMES.infoTab.workorder,
      itemsTabName: TAB_NAMES.itemsTab.workorderItems,
      optionsTabName: TAB_NAMES.optionsTab.messages,
    });
  }

  function handleHubThreadClick(thread) {
    _setReadThreadPhones(prev => ({ ...prev, [thread.phone]: thread.lastMillis }));
    _setHubSelectedPhone(prev => {
      if (prev === thread.phone) {
        _setHubHoverPhone("");
        return "";
      }
      return thread.phone;
    });
  }

  function handleHubNewThread() {
    let phone = sHubNewPhone.replace(/\D/g, "").slice(0, 10);
    if (phone.length !== 10) return;
    let existing = zSmsThreads.find(t => t.phone === phone);
    if (existing) {
      handleHubThreadClick(existing);
    } else {
      _setHubSelectedPhone(phone);
    }
    _setHubNewPhone("");
  }

  function handleEnterCustomPhoneMode() {
    _setCustomPhoneMode(true);
    _setCustomPhone("");
    _setCustomPhoneMessages([]);
    _setCanRespond(true);
    _setNewMessage("");
    _setForwardReplies(false);
    clearTranslation();
  }

  function handleExitCustomPhoneMode() {
    _setCustomPhoneMode(false);
    _setCustomPhone("");
    _setCustomPhoneMessages([]);
    _setNewMessage("");
    _setForwardReplies(false);
    clearTranslation();
  }

  async function handleToggleBlockResponses() {
    let phone = sCustomPhoneMode ? sCustomPhone : zCustomer?.customerCell;
    if (!phone || phone.length !== 10) return;
    let newCanRespond = sCanRespond ? null : true;
    userOverrodeCanRespondRef.current = true;
    _setCanRespond(!sCanRespond);
    await dbUpdateMessageCanRespond(phone, null, newCanRespond);
    if (!newCanRespond) {
      let currentUser = useLoginStore.getState().getCurrentUser();
      if (currentUser?.id) {
        let thread = zSmsThreads.find(t => t.phone === phone);
        if (thread?.forwardTo?.[currentUser.id]) {
          await dbToggleSMSForwarding(phone, currentUser.id, false, currentUser.phone, currentUser.first);
        }
      }
    }
  }

  async function handleToggleForwardResponses() {
    let phone = sCustomPhoneMode ? sCustomPhone : zCustomer?.customerCell;
    if (!phone || phone.length !== 10) return;
    let currentUser = useLoginStore.getState().getCurrentUser();
    if (!currentUser?.id) return;
    let thread = zSmsThreads.find(t => t.phone === phone);
    let isCurrentlyForwarding = !!(thread?.forwardTo?.[currentUser.id]);
    if (!isCurrentlyForwarding && !sCanRespond) {
      userOverrodeCanRespondRef.current = true;
      _setCanRespond(true);
      await dbUpdateMessageCanRespond(phone, null, true);
    }
    await dbToggleSMSForwarding(phone, currentUser.id, !isCurrentlyForwarding, currentUser.phone, currentUser.first);
  }

  async function handleStartRecording() {
    if (!sHasMicrophone || sAudioRecording) return;
    try {
      let stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      let recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm" });
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        let blob = new Blob(audioChunksRef.current, { type: recorder.mimeType });
        let url = URL.createObjectURL(blob);
        _setAudioBlob(blob);
        _setAudioUrl(url);
        _setShowReplyModal(true);
        pendingActionRef.current = "audio";
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      _setAudioRecording(true);
    } catch (err) {
      log("Microphone access error:", err);
      _setHasMicrophone(false);
    }
  }

  function handleStopRecording() {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== "recording") return;
    mediaRecorderRef.current.stop();
    mediaRecorderRef.current.stream?.getTracks().forEach(t => t.stop());
    _setAudioRecording(false);
  }

  function handleDeleteAudio() {
    if (sAudioUrl) URL.revokeObjectURL(sAudioUrl);
    _setAudioBlob(null);
    _setAudioUrl("");
    _setAudioRecording(false);
    _setShowReplyModal(false);
    pendingActionRef.current = null;
    clearAutoSend();
  }

  async function handleSendAudio(canRespondVal, forwardOverride) {
    if (!sAudioBlob) return;
    let sendPhone = sCustomPhoneMode ? sCustomPhone : zCustomer?.customerCell;
    if (!sendPhone || sendPhone.length !== 10) return;
    _setAudioUploading(true);
    try {
      let { uploadFileToStorage } = await import("../../../db_calls");
      let zSettings = useSettingsStore.getState().settings;
      let tenantID = zSettings?.tenantID;
      let storeID = zSettings?.storeID;
      let storeName = zSettings?.storeInfo?.displayName || "Our store";
      let timestamp = Date.now();
      let storagePath = `${tenantID}/${storeID}/sms-audio/${timestamp}_${crypto.randomUUID()}.webm`;
      let result = await uploadFileToStorage(sAudioBlob, storagePath, { contentType: "audio/webm" });
      if (!result.success) { log("Audio upload failed:", result.error); _setAudioUploading(false); return; }
      useLoginStore.getState().requireLogin(async () => {
        let zCurrentUserObj = useLoginStore.getState().getCurrentUser();
        let useCanRespond = canRespondVal !== undefined ? canRespondVal : sCanRespond;
        let forwardTo = buildForwardToPayload(forwardOverride, sForwardReplies);
        let msg = { ...SMS_PROTO };
        msg.message = storeName + " has sent you an audio message";
        msg.mediaUrls = [{ url: result.downloadURL, contentType: "audio/webm" }];
        msg.phoneNumber = sendPhone;
        msg.customerID = sCustomPhoneMode ? "" : zCustomer.id;
        if (!sCustomPhoneMode && zCustomer.first) msg.customerFirst = zCustomer.first;
        if (!sCustomPhoneMode && zCustomer.last) msg.customerLast = zCustomer.last;
        msg.canRespond = useCanRespond ? true : null;
        msg.millis = Date.now();
        msg.id = crypto.randomUUID();
        msg.type = "outgoing";
        msg.senderUserObj = zCurrentUserObj;
        msg.sentByUser = zCurrentUserObj.id;
        if (forwardTo) msg.forwardTo = forwardTo;
        let sendResult = await smsService.send(msg);
        if (sendResult.success && !sCustomPhoneMode) {
          let allWOs = useOpenWorkordersStore.getState().workorders;
          allWOs.filter((wo) => wo.customerID === zCustomer.id).forEach((wo) => {
            useOpenWorkordersStore.getState().setField("lastSMSSenderUserID", zCurrentUserObj.id, wo.id);
          });
        }
        handleDeleteAudio();
        _setAudioUploading(false);
      });
    } catch (err) {
      log("Audio send error:", err);
      _setAudioUploading(false);
    }
  }

  // Whether the compose area should show
  const hasActivePhone = sCustomPhoneMode ? sCustomPhone.length === 10 : !!zCustomer?.customerCell;

  // Search-bar filtering for hub thread list (matches by first, last, phone cell, phone landline)
  const hubSearchIsPhone = !/[a-zA-Z]/.test(sHubSearch);
  const hubSearchDisplayValue = hubSearchIsPhone && sHubSearch ? formatPhoneWithDashes(sHubSearch) : sHubSearch;
  const filteredHubThreads = React.useMemo(() => {
    let raw = sHubSearch.trim();
    if (!raw) return zSmsThreads;
    let hasLetters = /[a-zA-Z]/.test(raw);
    let digitsOnly = raw.replace(/\D/g, "");
    let landlineByCell = null;
    if (!hasLetters && digitsOnly) {
      landlineByCell = {};
      for (let wo of zAllWorkorders) {
        if (wo.customerCell && wo.customerLandline) {
          if (!landlineByCell[wo.customerCell]) landlineByCell[wo.customerCell] = new Set();
          landlineByCell[wo.customerCell].add(wo.customerLandline.replace(/\D/g, ""));
        }
      }
    }
    return zSmsThreads.filter((t) => {
      if (hasLetters) {
        let q = raw.toLowerCase();
        let first = (t.customerFirst || "").toLowerCase();
        let last = (t.customerLast || "").toLowerCase();
        if (!first && !last) {
          let wo = zAllWorkorders.find((w) => w.customerCell === t.phone);
          if (wo) {
            first = (wo.customerFirst || "").toLowerCase();
            last = (wo.customerLast || "").toLowerCase();
          }
        }
        let full = (first + " " + last).trim();
        return first.startsWith(q) || last.startsWith(q) || full.includes(q);
      }
      if (digitsOnly) {
        if (t.phone && t.phone.replace(/\D/g, "").includes(digitsOnly)) return true;
        let landlines = landlineByCell ? landlineByCell[t.phone] : null;
        if (landlines) {
          for (let ll of landlines) if (ll.includes(digitsOnly)) return true;
        }
        return false;
      }
      return true;
    });
  }, [zSmsThreads, sHubSearch, zAllWorkorders]);

  // Hub mode: 2-panel layout for all message threads
  const showHub = sHubMode || !hasCustomer;
  if (showHub) {
    return (
      <div className={hubStyles.hubOuterRoot}>
        <div className={hubStyles.hubSearchHeader}>
          <button
            type="button"
            className={hubStyles.hubSearchResetBtn}
            onClick={() => {
              _setHubSearch("");
              hubSearchInputRef.current?.focus();
            }}
            disabled={!sHubSearch}
          >
            <img src={ICONS.reset1} alt="" className={hubStyles.hubSearchResetIcon} />
          </button>
          <input
            ref={hubSearchInputRef}
            type="text"
            className={hubStyles.hubSearchInput}
            placeholder="Search by name or phone"
            value={hubSearchDisplayValue}
            onChange={(e) => {
              let val = e.target.value;
              if (/[a-zA-Z]/.test(val)) {
                _setHubSearch(val);
              } else {
                _setHubSearch(val.replace(/\D/g, "").slice(0, 10));
              }
            }}
          />
        </div>
        <div className={hubStyles.hubLayoutRoot}>
        {/* Left panel: thread list */}
        {sHubSidebarCollapsed ? (
          <div className={hubStyles.hubSidebarCollapsed}>
            <TooltipDom text="Show conversations" position="right">
              <TouchableOpacityDom onPress={() => _setHubSidebarCollapsed(false)} className={hubStyles.hubSidebarCollapsedBtn}>
                <ImageDom icon={ICONS.greenRightArrow} size={30} />
              </TouchableOpacityDom>
            </TooltipDom>
          </div>
        ) : (
          <div
            className={hubStyles.hubSidebarExpanded}
            style={{ width: sHubSidebarFullWidth ? "100%" : "30%", borderRightWidth: sHubSidebarFullWidth ? 0 : 2 }}
          >
            {/* Header */}
            <div className={hubStyles.hubSidebarHeader}>
              <div className={hubStyles.hubSidebarHeaderRow}>
                <TooltipDom text="Collapse" position="right">
                  <TouchableOpacityDom onPress={() => _setHubSidebarCollapsed(true)} className={hubStyles.hubSidebarHeaderBtn}>
                    <ImageDom icon={ICONS.greenLeftArrow} size={26} />
                  </TouchableOpacityDom>
                </TooltipDom>
                <div className={hubStyles.hubSidebarHeaderCenter}>
                  <span className={hubStyles.hubSidebarHeaderTitle} style={{ color: C.text }}>Messages</span>
                </div>
                <TooltipDom text={sHubSidebarFullWidth ? "Shrink sidebar" : "Expand sidebar"} position="left">
                  <TouchableOpacityDom onPress={() => _setHubSidebarFullWidth(!sHubSidebarFullWidth)} className={hubStyles.hubSidebarHeaderBtn}>
                    <ImageDom icon={sHubSidebarFullWidth ? ICONS.greenLeftArrow : ICONS.greenRightArrow} size={26} />
                  </TouchableOpacityDom>
                </TooltipDom>
              </div>
            </div>
            {/* Thread list */}
            {zSmsThreads.length < 1 ? (
              <div className={hubStyles.hubEmpty}>
                <span className={hubStyles.hubEmptyText} style={{ color: C.textDisabled }}>No conversations yet</span>
              </div>
            ) : filteredHubThreads.length < 1 ? (
              <div className={hubStyles.hubEmpty}>
                <span className={hubStyles.hubEmptyText} style={{ color: C.textDisabled }}>No matching conversations</span>
              </div>
            ) : (
              <div className={hubStyles.threadList}>
                {filteredHubThreads.slice(0, sHubVisibleCount).map((item) => {
                  let activeWO = zAllWorkorders.find(wo => wo.customerCell === item.phone);
                  let isUnread = item.lastType === "incoming" && sHubSelectedPhone !== item.phone && (!sReadThreadPhones[item.phone] || sReadThreadPhones[item.phone] < item.lastMillis);
                  return (
                    <ThreadCard
                      key={item.phone}
                      thread={item}
                      isSelected={sHubSelectedPhone === item.phone}
                      isHovered={sHubHoverPhone === item.phone}
                      isUnread={isUnread}
                      activeWO={activeWO}
                      onPress={() => handleHubThreadClick(item)}
                      onHoverIn={() => { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = setTimeout(() => _setHubHoverPhone(item.phone), 500); }}
                      onHoverOut={() => { clearTimeout(hoverTimerRef.current); _setHubHoverPhone((prev) => prev === item.phone ? "" : prev); }}
                    />
                  );
                })}
                {sHubVisibleCount < filteredHubThreads.length && (
                  <>
                    <div className={hubStyles.loadingMore}>Loading more…</div>
                    <div ref={hubSentinelRef} className={hubStyles.sentinel} />
                  </>
                )}
              </div>
            )}
          </div>
        )}
        {/* Right panel: conversation */}
        {!sHubSidebarFullWidth && (
          <div className={hubStyles.hubRightPanel}>
            {(sHubHoverPhone || sHubSelectedPhone) ? (
              <HubConversationPanel
                key={sHubHoverPhone || sHubSelectedPhone}
                phone={sHubHoverPhone || sHubSelectedPhone}
                thread={zSmsThreads.find(t => t.phone === (sHubHoverPhone || sHubSelectedPhone))}
                previewMode={!!sHubHoverPhone && sHubHoverPhone !== sHubSelectedPhone}
                onShowPhoneEntry={() => { _setHubSelectedPhone(""); _setHubNewPhone(""); }}
                onOpenWorkorder={handleHubOpenWorkorder}
                onOpenWorkorderKeepHub={handleHubOpenWorkorderKeepHub}
                onSendPaymentLink={!hasCustomer ? handleSendSMSPayment : null}
                hasMatchingWorkorder={!hasCustomer && !!zAllWorkorders.find(w => w.customerCell === (sHubHoverPhone || sHubSelectedPhone))}
                matchingWorkorders={zAllWorkorders.filter(w => w.customerCell === (sHubHoverPhone || sHubSelectedPhone))}
                exitHubButton={null}
              />
            ) : (
              <div className={hubStyles.hubPlaceholderCol}>
                <div className={hubStyles.hubPlaceholderCenter}>
                  <span className={hubStyles.hubPlaceholderText} style={{ color: C.textDisabled }}>Select a conversation</span>
                </div>
                <div className={hubStyles.hubPlaceholderEntryRow}>
                  <PhoneNumberInput
                    value={sHubNewPhone}
                    onChangeText={(val) => {
                      let cleaned = val.replace(/\D/g, "").slice(0, 10);
                      _setHubNewPhone(cleaned);
                      if (cleaned.length === 10) {
                        let existing = zSmsThreads.find(t => t.phone === cleaned);
                        if (existing) {
                          handleHubThreadClick(existing);
                        } else {
                          _setHubSelectedPhone(cleaned);
                        }
                        _setHubNewPhone("");
                      }
                    }}
                    maxLength={10}
                    height={36}
                    fontSize={15}
                    style={{ flex: 1 }}
                  />
                  {hasCustomer && (
                    <TooltipDom text="Back to customer" position="top" offsetX={-20}>
                      <TouchableOpacityDom onPress={handleExitHubMode} className={hubStyles.hubPlaceholderBackBtn}>
                        <ImageDom icon={ICONS.person} size={28} />
                      </TouchableOpacityDom>
                    </TooltipDom>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        </div>
      </div>
    );
  }

  return (
    <div className={hubStyles.customerRoot}>
      {zCustomer?.customerCell && !sCustomPhoneMode && (
        <div className={hubStyles.customerBanner}>
          <span className={hubStyles.customerBannerName} style={{ color: C.textMuted }}>
            {((zCustomer.first || "") + " " + (zCustomer.last || "")).trim()}
          </span>
          <span className={hubStyles.customerBannerPhone} style={{ color: C.textMuted }}>
            {`(${zCustomer.customerCell.slice(0, 3)}) ${zCustomer.customerCell.slice(3, 6)}-${zCustomer.customerCell.slice(6)}`}
          </span>
        </div>
      )}
      <div className={hubStyles.messagesArea}>
        {zMessagesLoading && !sCustomPhoneMode && (
          <div className={hubStyles.messagesCenter}>
            <LoadingIndicatorDom message="Loading messages..." />
          </div>
        )}
        {(!zMessagesLoading || sCustomPhoneMode) && messagesArr.length < 1 && (
          <div className={hubStyles.messagesCenter}>
            <span className={hubStyles.messagesEmptyText} style={{ color: C.textDisabled }}>
              {sCustomPhoneMode
                ? (sCustomPhone.length < 10
                  ? "Enter a phone number to message"
                  : "No messages to/from this phone number")
                : !zCustomer?.id
                  ? "Enter the phone number to message"
                  : zCustomer?.customerCell
                    ? "No messages to/from this cell phone #"
                    : "No cell phone on account\n\nText messaging deactivated"}
            </span>
          </div>
        )}
        {(!zMessagesLoading || sCustomPhoneMode) && messagesArr.length > 0 && (
          <div className={hubStyles.messagesListWrap}>
            {zMessagesLoadingMore && !sCustomPhoneMode && (
              <div className={hubStyles.messagesLoadingMore}>
                <SmallLoadingIndicatorDom />
              </div>
            )}
            <div
              ref={messageListRef}
              className={hubStyles.messageList}
              onScroll={(e) => {
                if (sCustomPhoneMode) return;
                if (e.currentTarget.scrollTop <= 0 && zMessagesHasMore && !zMessagesLoadingMore) {
                  loadMoreMessages();
                }
              }}
            >
              {messagesArr.map((item) => {
                let key = item.id || String(item.millis);
                if (item.type === "incoming") {
                  return (
                    <IncomingMessageComponent
                      key={key}
                      msgObj={item}
                      autoTranslateTo={sFromLang !== sToLang ? sToLang : ""}
                      onScrollToBottom={() => { setTimeout(() => scrollListToBottom(messageListRef, true), 50); }}
                    />
                  );
                }
                let isLast = (item.id || item.millis) === lastOutgoingID;
                return (
                  <OutgoingMessageComponent
                    key={key}
                    msgObj={item}
                    isLastOutgoing={isLast}
                    thread={customerThread}
                    onToggleBlock={handleToggleBlockResponses}
                    onToggleForward={handleToggleForwardResponses}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>
      {!hasActivePhone ? (
        <div className={hubStyles.phoneEntryWrap}>
          {(sCustomPhoneMode || !hasCustomer) ? (
            <div className={hubStyles.phoneEntryRow}>
              <PhoneNumberInput
                value={sCustomPhone}
                onChangeText={(val) => {
                  let cleaned = val.replace(/\D/g, "").slice(0, 10);
                  _setCustomPhone(cleaned);
                  if (!sCustomPhoneMode) {
                    _setCustomPhoneMode(true);
                    _setCanRespond(true);
                  }
                }}
                autoFocus={true}
                maxLength={10}
                height={36}
                fontSize={16}
                style={{ width: "auto" }}
              />
              {hasCustomer && (
                <TouchableOpacityDom
                  onPress={handleExitCustomPhoneMode}
                  className={hubStyles.phoneEntryBackBtn}
                  style={{ backgroundColor: C.blue }}
                >
                  <span className={hubStyles.phoneEntryBackText}>Back to customer</span>
                </TouchableOpacityDom>
              )}
            </div>
          ) : null}
        </div>
      ) : (
        <ComposeArea
          mode="customer"
          value={sNewMessage}
          onChange={handleMessageChange}
          onSend={() => {
            if (isUnmodifiedTemplateRef.current) {
              sendMessage(sNewMessage, "", false, false);
              isUnmodifiedTemplateRef.current = false;
            } else {
              _setShowReplyModal(true);
              scheduleAutoSend(() => {
                _setShowReplyModal(false);
                sendMessage(sNewMessage, "", sCanRespond);
              });
            }
          }}
          sendDisabled={!sNewMessage.trim() || (sFromLang !== sToLang && sTranslateLoading)}
          textInputRef={textInputRef}
          onSelect={(e) => { if (e?.target) cursorPositionRef.current = e.target.selectionStart; }}
          audioUrl={sAudioUrl}
          audioUploading={sAudioUploading}
          showReplyOptions={sShowReplyModal}
          audioMode={pendingActionRef.current === "audio"}
          onSelectCanRespond={(canRespond) => {
            clearAutoSend();
            _setCanRespond(canRespond);
            _setShowReplyModal(false);
            if (pendingActionRef.current === "intake") { handleSendWorkorderTicket(canRespond); pendingActionRef.current = null; }
            else if (pendingActionRef.current === "finalized") { handleSendFinalizedTicket(canRespond); pendingActionRef.current = null; }
            else if (pendingActionRef.current === "media") { sendMediaMessage(canRespond); }
            else if (pendingActionRef.current === "audio") { handleSendAudio(canRespond); }
            else { sendMessage(sNewMessage, "", canRespond); }
          }}
          onSendAudio={() => handleSendAudio(sCanRespond)}
          onDeleteAudio={handleDeleteAudio}
          forwardReplies={sForwardReplies}
          onToggleForward={handleToggleForwardReplies}
          hasActivePhone={hasActivePhone}
          fromLang={sFromLang}
          onFromLang={(code) => {
            _setFromLang(code);
            if (code && sToLang && code !== sToLang && sNewMessage.trim()) debouncedTranslate(sNewMessage, sToLang);
            if (!code || code === sToLang) clearTranslation();
          }}
          toLang={sToLang}
          onToLang={(code) => {
            _setToLang(code);
            if (sFromLang && code && sFromLang !== code && sNewMessage.trim()) debouncedTranslate(sNewMessage, code);
            if (!code || sFromLang === code) clearTranslation();
          }}
          translatedText={translatedText}
          translateLoading={sTranslateLoading}
          centerSlot={
            <DropdownMenuDom
              dataArr={(zSettings?.smsTemplates || zSettings?.textTemplates || [])
                .filter((t) => t.showInChat !== false)
                .sort((a, b) => (b.order || 999) - (a.order || 999))
                .map((t) => ({ label: t.label || t.name || t.buttonLabel || "Untitled", message: t.content || t.message || t.text || "" }))}
              onSelect={(item) => {
                let resolved = resolveTemplate(item.message);
                _setNewMessage(resolved);
                isUnmodifiedTemplateRef.current = true;
                if (sFromLang && sToLang && sFromLang !== sToLang) debouncedTranslate(resolved, sToLang);
              }}
              buttonText="Templates"
              buttonStyle={{ paddingVertical: 5, backgroundColor: C.blue }}
              buttonTextStyle={{ color: "white" }}
            />
          }
          rightSlot={
            <>
              <TooltipDom text="Variables" position="top">
                <DropdownMenuDom
                  dataArr={TEXT_TEMPLATE_VARIABLES.map((v) => ({ label: v.label, variable: v.variable }))}
                  onSelect={(item) => handleInsertVariable(resolveTemplate(item.variable))}
                  buttonIcon={ICONS.variable}
                  buttonIconSize={40}
                  buttonStyle={{ padding: 6, backgroundColor: "transparent", borderWidth: 0 }}
                />
              </TooltipDom>
              <TooltipDom text="Send Info" position="top">
                <DropdownMenuDom
                  dataArr={(() => {
                    let items = [
                      { label: "Send intake/estimate ticket", key: "workorder" },
                      { label: "Send finalized ticket", key: "finalized" },
                    ];
                    let paymentError = zWorkorderObj?.paymentComplete ? "Already paid" : (!zWorkorderObj?.workorderLines?.length ? "No line items" : "");
                    if (paymentError) {
                      items.push({ label: "Send Payment Link", key: "payment", textColor: C.text, strikethrough: true, subtitle: paymentError });
                    } else {
                      items.push({ label: "Send Payment Link", key: "payment" });
                    }
                    if (!zWorkorderObj?.media?.length) {
                      items.push({ label: "Send Media", key: "media", textColor: C.text, strikethrough: true, subtitle: "No media attached" });
                    } else {
                      items.push({ label: "Send Media", key: "media" });
                    }
                    return items;
                  })()}
                  onSelect={(item) => {
                    if (item.key === "workorder") { pendingActionRef.current = "intake"; _setShowReplyModal(true); scheduleAutoSend(() => { _setShowReplyModal(false); handleSendWorkorderTicket(sCanRespond); pendingActionRef.current = null; }); }
                    else if (item.key === "finalized") { pendingActionRef.current = "finalized"; _setShowReplyModal(true); scheduleAutoSend(() => { _setShowReplyModal(false); handleSendFinalizedTicket(sCanRespond); pendingActionRef.current = null; }); }
                    else if (item.key === "payment") handleSendSMSPayment();
                    else if (item.key === "media") _setShowMediaPicker(true);
                  }}
                  buttonIcon={ICONS.paperPlane}
                  buttonIconSize={35}
                  buttonStyle={{ padding: 6, backgroundColor: "transparent", borderWidth: 0 }}
                />
              </TooltipDom>
              {hasCustomer && !sCustomPhoneMode ? (
                <TooltipDom text="Messages Hub" position="top">
                  <TouchableOpacityDom
                    onPress={handleEnterHubMode}
                    className={hubStyles.iconBtn}
                  >
                    <ImageDom icon={ICONS.cellPhone} size={35} />
                  </TouchableOpacityDom>
                </TooltipDom>
              ) : null}
              {sCustomPhoneMode ? (
                <div className={hubStyles.customPhoneInfo}>
                  <span className={hubStyles.customPhoneText} style={{ color: C.textMuted }}>{formatPhoneWithDashes(sCustomPhone)}</span>
                  {hasCustomer && (
                    <TouchableOpacityDom
                      onPress={handleExitCustomPhoneMode}
                      className={hubStyles.customPhoneBackBtn}
                      style={{ backgroundColor: C.blue }}
                    >
                      <span className={hubStyles.customPhoneBackText}>Back to customer</span>
                    </TouchableOpacityDom>
                  )}
                </div>
              ) : null}
            </>
          }
        />
      )}
      {sShowMediaPicker && zWorkorderObj?.id && (
        <WorkorderMediaModal
          visible={true}
          onClose={() => _setShowMediaPicker(false)}
          workorderID={zWorkorderObj.id}
          mode="view"
          onSelect={handleMediaPicked}
          onSendMedia={handleMediaMultiSelect}
        />
      )}
    </div>
  );
}

function ThreadCard({ thread, isSelected, isHovered, isUnread, activeWO, onPress, onHoverIn, onHoverOut }) {
  let bgColor = isUnread ? "rgb(0,122,255)" : "transparent";
  if (isSelected) bgColor = isUnread ? "rgb(0,100,220)" : C.surfaceAlt;
  else if (isHovered) bgColor = isUnread ? "rgb(0,110,235)" : C.surfaceAlt;
  let textColor = isUnread ? "white" : C.text;
  let subtextColor = isUnread ? "rgba(255,255,255,0.7)" : C.textDisabled;
  let formattedPhone = formatPhoneWithDashes(thread.phone);
  let customerName = activeWO
    ? (activeWO.customerFirst + " " + activeWO.customerLast).trim()
    : ((thread.customerFirst || "") + " " + (thread.customerLast || "")).trim();
  let dateObj = formatDateTimeForReceipt(null, thread.lastMillis);
  let preview = thread.lastMessage || (thread.hasMedia ? "[Media]" : "");

  // Build short date: "Wed, Apr 7" or "Wed, Apr 7 '25" if not current year
  let shortDate = "";
  if (thread.lastMillis) {
    let d = new Date(thread.lastMillis);
    let dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    let monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    shortDate = dayNames[d.getDay()] + ", " + monthNames[d.getMonth()] + " " + d.getDate();
    if (d.getFullYear() !== new Date().getFullYear()) shortDate += " '" + String(d.getFullYear()).slice(-2);
  }

  // Delivery status for last outgoing message
  let deliveryLabel = "";
  let deliveryColor = subtextColor;
  if (thread.lastType !== "incoming" && thread.lastOutgoingMessageStatus) {
    let s = thread.lastOutgoingMessageStatus;
    if (s === "delivered") { deliveryLabel = "Delivered"; deliveryColor = C.green; }
    else if (s === "sent") { deliveryLabel = "Sent"; deliveryColor = subtextColor; }
    else if (s === "failed") { deliveryLabel = "Failed"; deliveryColor = C.red; }
    else if (s === "undelivered") { deliveryLabel = "Not Delivered"; deliveryColor = C.red; }
    else if (s === "queued" || s === "accepted" || s === "sending") { deliveryLabel = "Sending..."; }
  }

  let cardClass = hubStyles.threadCard + (isSelected ? " " + hubStyles.threadCardSelected : "");
  let cardStyle = { backgroundColor: bgColor };
  if (isSelected) {
    cardStyle.borderColor = C.orange;
    cardStyle.borderBottomColor = C.orange;
  }
  let nameColor = isUnread ? "rgba(255,255,255,0.85)" : C.blue;
  let previewColor = isUnread ? "rgba(255,255,255,0.85)" : C.borderStrong;

  return (
    <div
      className={cardClass}
      style={cardStyle}
      onClick={onPress}
      onMouseEnter={onHoverIn}
      onMouseLeave={onHoverOut}
    >
      <div className={hubStyles.threadRow}>
        <div className={hubStyles.threadLeft}>
          <div className={hubStyles.phoneLine}>
            {thread.lastType !== "incoming" && <img src={ICONS.forwardGreen} alt="" className={hubStyles.questionIcon} />}
            <span className={hubStyles.phoneText} style={{ color: textColor }}>{formattedPhone}</span>
          </div>
          {customerName ? (
            <span className={hubStyles.customerName} style={{ color: nameColor }}>{customerName}</span>
          ) : (
            <div className={hubStyles.customerSpacer} />
          )}
        </div>
        <div className={hubStyles.threadRight}>
          <span className={hubStyles.dateText} style={{ color: subtextColor }}>{shortDate}</span>
          <span className={hubStyles.timeText} style={{ color: subtextColor }}>{dateObj?.time || ""}</span>
          {deliveryLabel ? <span className={hubStyles.deliveryText} style={{ color: deliveryColor }}>{deliveryLabel}</span> : null}
        </div>
      </div>
      <div className={hubStyles.previewWrap}>
        <span className={hubStyles.preview} style={{ color: previewColor }}>{preview}</span>
      </div>
    </div>
  );
}

function HubConversationPanel({ phone, thread, previewMode, onShowPhoneEntry, onOpenWorkorder, onOpenWorkorderKeepHub, onSendPaymentLink, hasMatchingWorkorder, matchingWorkorders = [], exitHubButton }) {
  const [sWoDropdown, _setWoDropdown] = useState(null);
  // Initialize from cache synchronously to avoid layout flash on hover
  const [sMessages, _setMessages] = useState(() => {
    let cached = useCustMessagesStore.getState().getHubCachedThread(phone);
    if (cached && cached.messages.length > 0) return cached.messages.slice(-7);
    return [];
  });
  const [sListenerConnecting, _setListenerConnecting] = useState(() => {
    let cached = useCustMessagesStore.getState().getHubCachedThread(phone);
    return !(cached && cached.messages.length > 0);
  });
  const [sNoMoreHistory, _setNoMoreHistory] = useState(() => {
    let cached = useCustMessagesStore.getState().getHubCachedThread(phone);
    return cached?.noMoreHistory || false;
  });
  const [sLoadingMore, _setLoadingMore] = useState(false);
  const [sNewMessage, _setNewMessage] = useState("");
  const [sCanRespond, _setCanRespond] = useState(thread?.canRespond !== undefined ? !!thread.canRespond : true);
  const lastThreadCanRespondRef = useRef(thread?.canRespond);
  if (thread?.canRespond !== lastThreadCanRespondRef.current) {
    lastThreadCanRespondRef.current = thread?.canRespond;
    _setCanRespond(thread?.canRespond !== undefined ? !!thread.canRespond : true);
  }
  const [sFromLang, _setFromLang] = useState("en");
  const [sToLang, _setToLang] = useState(() => {
    let wo = useOpenWorkordersStore.getState().workorders.find(w => w.customerCell === phone);
    return (wo?.customerLanguage && LANG_NAME_TO_CODE[wo.customerLanguage]) || "en";
  });
  const [sShowReplyModal, _setShowReplyModal] = useState(false);
  const [sForwardReplies, _setForwardReplies] = useState(false);
  const [sHubMediaUploading, _setHubMediaUploading] = useState(false);
  const [sAudioRecording, _setAudioRecording] = useState(false);
  const [sAudioBlob, _setAudioBlob] = useState(null);
  const [sAudioUrl, _setAudioUrl] = useState("");
  const [sHasMicrophone, _setHasMicrophone] = useState(false);
  const [sAudioUploading, _setAudioUploading] = useState(false);
  const messageListRef = useRef(null);
  const pendingSendTextRef = useRef("");
  const pendingActionRef = useRef(null);
  const hubFileInputRef = useRef(null);
  const sMessagesRef = useRef([]);
  const noMoreRef = useRef(false);
  const hasInitialScrolledRef = useRef(false);
  const lastMsgIdRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const longPressTimerRef = useRef(null);
  const longPressFiredRef = useRef(false);

  const {
    translatedText, isLoading: sTranslateLoading,
    debouncedTranslate, clearTranslation,
  } = useTranslation({ defaultDirection: "en-to-es" });

  function updateCache(messages, noMoreHistory) {
    noMoreRef.current = noMoreHistory;
    useCustMessagesStore.getState().setHubCachedThread(phone, messages, noMoreHistory);
  }

  function detectToLang(msgs) {
    for (let i = msgs.length - 1; i >= 0; i--) {
      let m = msgs[i];
      if (m.type === "outgoing" && m.translatedTo) { _setToLang(m.translatedTo); return; }
      if (m.type === "outgoing" && m.translatedFrom && m.originalMessage) { _setToLang(m.translatedFrom === "en" ? "es" : m.translatedFrom); return; }
    }
    _setToLang("en");
  }

  useEffect(() => {
    if (!phone || phone.length !== 10) { _setMessages([]); _setListenerConnecting(false); return; }
    let cancelled = false;
    _setNewMessage("");
    _setShowReplyModal(false);
    _setForwardReplies(false);
    _setLoadingMore(false);
    clearAutoSend();
    // Reset audio state on phone change
    if (sAudioUrl) URL.revokeObjectURL(sAudioUrl);
    _setAudioBlob(null);
    _setAudioUrl("");
    _setAudioRecording(false);
    _setAudioUploading(false);
    pendingActionRef.current = null;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream?.getTracks().forEach(t => t.stop());
    }
    // Detect microphone
    navigator.mediaDevices?.enumerateDevices().then(devices => {
      if (!cancelled) _setHasMicrophone(devices.some(d => d.kind === "audioinput"));
    }).catch(() => {});

    // Check Zustand cache first (synchronous, instant)
    let cached = useCustMessagesStore.getState().getHubCachedThread(phone);
    let startMessages = [];
    let fullCachedMessages = [];
    let noMore = false;

    if (cached && cached.messages.length > 0) {
      fullCachedMessages = cached.messages;
      startMessages = cached.messages.slice(-7);
      noMore = cached.noMoreHistory && cached.messages.length <= 7;
    }

    detectToLang(fullCachedMessages.length > 0 ? fullCachedMessages : startMessages);
    _setMessages(startMessages);
    sMessagesRef.current = startMessages;
    _setNoMoreHistory(noMore);
    noMoreRef.current = noMore;
    if (!startMessages.length) _setListenerConnecting(true);

    // If not in Zustand, check IndexedDB, then Firestore as last resort
    if (!startMessages.length) {
      (async () => {
        try {
          const { getMessages } = await import("../../../hubMessageDB");
          const idbMsgs = await getMessages(phone);
          if (!cancelled && idbMsgs.length > 0) {
            let recent = idbMsgs.slice(-7);
            sMessagesRef.current = recent;
            _setMessages(recent);
            detectToLang(idbMsgs);
            _setNoMoreHistory(false);
            noMoreRef.current = false;
            useCustMessagesStore.getState().setHubCachedThread(phone, idbMsgs, false);
            _setListenerConnecting(false);
            fullCachedMessages = idbMsgs;
            return;
          }
        } catch (e) { /* IndexedDB unavailable, fall through to Firestore */ }
        // Firestore fetch as last resort
        let result = await dbGetCustomerMessages(phone, null, 7);
        if (cancelled || !result.success) { _setListenerConnecting(false); return; }
        let initialNoMore = result.messages.length < 7;
        let sorted = result.messages.sort((a, b) => (a.millis || 0) - (b.millis || 0));
        sMessagesRef.current = sorted;
        _setMessages(sorted);
        detectToLang(sorted);
        _setNoMoreHistory(initialNoMore);
        noMoreRef.current = initialNoMore;
        updateCache(sorted, initialNoMore);
        _setListenerConnecting(false);
      })();
    }

    // Listener watches for messages after the newest one in the full cache (not sliced)
    let allForListener = fullCachedMessages.length > 0 ? fullCachedMessages : startMessages;
    let maxMillis = 0;
    allForListener.forEach(m => { if (m.millis > maxMillis) maxMillis = m.millis; });
    let listenerStartMillis = maxMillis || Date.now();

    let unsub = dbListenToNewMessages(phone, listenerStartMillis, (newMsgs) => {
      if (cancelled) return;
      _setListenerConnecting(false);
      _setMessages(prev => {
        let ids = new Set(prev.map(m => m.id));
        let fresh = newMsgs.filter(m => !ids.has(m.id));
        if (!fresh.length) return prev;
        let merged = [...prev, ...fresh].sort((a, b) => (a.millis || 0) - (b.millis || 0));
        sMessagesRef.current = merged;
        updateCache(merged, noMoreRef.current);
        return merged;
      });
    });
    return () => {
      cancelled = true;
      if (unsub) unsub();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream?.getTracks().forEach(t => t.stop());
      }
    };
  }, [phone]);

  async function handleLoadMore() {
    if (sNoMoreHistory || sLoadingMore) return;
    if (!sMessagesRef.current.length) return;
    _setLoadingMore(true);
    let oldestMillis = Math.min(...sMessagesRef.current.map(m => m.millis));
    let result = await dbGetCustomerMessages(phone, oldestMillis, 7);
    if (!result.success) { _setLoadingMore(false); return; }
    let sorted = result.messages.sort((a, b) => (a.millis || 0) - (b.millis || 0));
    let currentMessages = sMessagesRef.current;
    let ids = new Set(currentMessages.map(m => m.id));
    let fresh = sorted.filter(m => !ids.has(m.id));
    let noMore = fresh.length < 7;
    let merged = [...fresh, ...currentMessages].sort((a, b) => (a.millis || 0) - (b.millis || 0));
    sMessagesRef.current = merged;
    _setMessages(merged);
    _setNoMoreHistory(noMore);
    updateCache(merged, noMore);
    _setLoadingMore(false);
  }

  useEffect(() => {
    if (sMessages.length === 0) {
      hasInitialScrolledRef.current = false;
      lastMsgIdRef.current = null;
      return;
    }
    let lastId = sMessages[sMessages.length - 1]?.id;
    if (!hasInitialScrolledRef.current) {
      hasInitialScrolledRef.current = true;
      lastMsgIdRef.current = lastId;
      setTimeout(() => scrollListToBottom(messageListRef, false), 100);
      return;
    }
    if (lastId === lastMsgIdRef.current) return;
    lastMsgIdRef.current = lastId;
    scrollListToBottom(messageListRef, true);
  }, [sMessages]);

  function handleSend() {
    if (!sNewMessage.trim() || !phone || phone.length !== 10) return;
    pendingSendTextRef.current = sNewMessage;
    _setShowReplyModal(true);
    scheduleAutoSend(() => {
      _setShowReplyModal(false);
      doSend(pendingSendTextRef.current, sCanRespond);
    });
  }

  async function doSend(text, canRespondVal, forwardOverride) {
    if (!text?.trim() || !phone || phone.length !== 10) return;

    let isTranslated = !!(translatedText && sFromLang && sToLang && sFromLang !== sToLang);
    let sendText = isTranslated ? translatedText : text;
    let originalText = isTranslated ? text : "";
    let translatedFromLang = isTranslated ? sFromLang : "";

    _setNewMessage("");
    clearTranslation();
    useLoginStore.getState().requireLogin(async () => {
      let zCurrentUserObj = useLoginStore.getState().getCurrentUser();
      let forwardTo = buildForwardToPayload(forwardOverride, sForwardReplies);
      let msg = { ...SMS_PROTO };
      msg.message = sendText;
      if (originalText) { msg.originalMessage = originalText; msg.translatedFrom = translatedFromLang; msg.translatedTo = isTranslated ? sToLang : ""; }
      msg.phoneNumber = phone;
      msg.canRespond = canRespondVal ? true : null;
      msg.millis = Date.now();
      msg.id = crypto.randomUUID();
      msg.type = "outgoing";
      msg.senderUserObj = zCurrentUserObj;
      msg.sentByUser = zCurrentUserObj.id;
      if (forwardTo) msg.forwardTo = forwardTo;
      let matchedWO = useOpenWorkordersStore.getState().workorders.find(wo => wo.customerCell === phone);
      if (matchedWO) { msg.customerFirst = matchedWO.customerFirst || ""; msg.customerLast = matchedWO.customerLast || ""; }
      let optimistic = { ...msg, status: "sending" };
      let addedMessages = [...sMessagesRef.current, optimistic];
      sMessagesRef.current = addedMessages;
      _setMessages(addedMessages);
      updateCache(addedMessages, noMoreRef.current);
      let result = await smsService.send(msg);
      let updatedMessages = sMessagesRef.current.map(m => m.id === msg.id ? { ...m, status: result.success ? "sent" : "failed" } : m);
      sMessagesRef.current = updatedMessages;
      _setMessages(updatedMessages);
      updateCache(updatedMessages, noMoreRef.current);
      if (!result.success) {
        useAlertScreenStore.getState().setValues({
          title: "Message Failed", message: result.error || "Failed to send message",
          btn1Text: "OK", handleBtn1Press: () => useAlertScreenStore.getState().resetAll(),
          showAlert: true, canExitOnOuterClick: true,
        });
      }
    });
  }

  function handleToggleForwardReplies() {
    const currentUser = useLoginStore.getState().getCurrentUser();
    if (!currentUser?.id) return;
    if (!currentUser?.phone) {
      useAlertScreenStore.getState().setValues({
        title: "No Phone Number",
        message: "Your account needs a personal phone number to enable SMS forwarding. Ask an admin to add one.",
        btn1Text: "OK",
        handleBtn1Press: () => useAlertScreenStore.getState().resetAll(),
        showAlert: true, canExitOnOuterClick: true,
      });
      return;
    }
    let newVal = !sForwardReplies;
    _setForwardReplies(newVal);
    if (newVal) {
      clearAutoSend();
      _setCanRespond(true);
      _setShowReplyModal(false);
      if (pendingActionRef.current === "audio") {
        handleSendAudio(true, true);
        pendingActionRef.current = null;
      } else {
        doSend(pendingSendTextRef.current, true, true);
      }
    }
  }

  async function handleToggleBlock() {
    let outgoing = sMessages.filter(m => m.type === "outgoing");
    if (!outgoing.length) return;
    let last = [...outgoing].sort((a, b) => (b.millis || 0) - (a.millis || 0))[0];
    if (!last?.id) return;
    let newCanRespond = sCanRespond ? null : true;
    log("handleToggleBlock", { phone, id: last.id, newCanRespond });
    let result = await dbUpdateMessageCanRespond(phone, last.id, newCanRespond);
    log("handleToggleBlock result", result);
    _setCanRespond(!sCanRespond);
    let updated = sMessages.map(m => m.id === last.id ? { ...m, canRespond: newCanRespond } : m);
    sMessagesRef.current = updated;
    _setMessages(updated);
    updateCache(updated, noMoreRef.current);
    if (!newCanRespond) {
      let currentUser = useLoginStore.getState().getCurrentUser();
      if (currentUser?.id && thread?.forwardTo?.[currentUser.id]) {
        await dbToggleSMSForwarding(phone, currentUser.id, false, currentUser.phone, currentUser.first);
      }
    }
  }

  async function handleHubToggleForward() {
    if (!phone || phone.length !== 10) return;
    let currentUser = useLoginStore.getState().getCurrentUser();
    if (!currentUser?.id) return;
    let isCurrentlyForwarding = !!(thread?.forwardTo?.[currentUser.id]);
    if (!isCurrentlyForwarding && !sCanRespond) {
      _setCanRespond(true);
      let outgoing = sMessages.filter(m => m.type === "outgoing");
      let last = [...outgoing].sort((a, b) => (b.millis || 0) - (a.millis || 0))[0];
      if (last?.id) {
        await dbUpdateMessageCanRespond(phone, last.id, true);
        let updated = sMessages.map(m => m.id === last.id ? { ...m, canRespond: true } : m);
        sMessagesRef.current = updated;
        _setMessages(updated);
        updateCache(updated, noMoreRef.current);
      }
    }
    await dbToggleSMSForwarding(phone, currentUser.id, !isCurrentlyForwarding, currentUser.phone, currentUser.first);
  }

  async function handleStartRecording() {
    if (!sHasMicrophone || sAudioRecording) return;
    try {
      let stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      let recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm" });
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        let blob = new Blob(audioChunksRef.current, { type: recorder.mimeType });
        let url = URL.createObjectURL(blob);
        _setAudioBlob(blob);
        _setAudioUrl(url);
        _setShowReplyModal(true);
        pendingActionRef.current = "audio";
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      _setAudioRecording(true);
    } catch (err) {
      log("Microphone access error:", err);
      _setHasMicrophone(false);
    }
  }

  function handleStopRecording() {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== "recording") return;
    mediaRecorderRef.current.stop();
    mediaRecorderRef.current.stream?.getTracks().forEach(t => t.stop());
    _setAudioRecording(false);
  }

  function handleDeleteAudio() {
    if (sAudioUrl) URL.revokeObjectURL(sAudioUrl);
    _setAudioBlob(null);
    _setAudioUrl("");
    _setAudioRecording(false);
    _setShowReplyModal(false);
    pendingActionRef.current = null;
    clearAutoSend();
  }

  async function handleSendAudio(canRespondVal, forwardOverride) {
    if (!sAudioBlob || !phone || phone.length !== 10) return;
    _setAudioUploading(true);
    try {
      let { uploadFileToStorage } = await import("../../../db_calls");
      let zSettings = useSettingsStore.getState().settings;
      let tenantID = zSettings?.tenantID;
      let storeID = zSettings?.storeID;
      let storeName = zSettings?.storeInfo?.displayName || "Our store";
      let timestamp = Date.now();
      let storagePath = `${tenantID}/${storeID}/sms-audio/${timestamp}_${crypto.randomUUID()}.webm`;
      let result = await uploadFileToStorage(sAudioBlob, storagePath, { contentType: "audio/webm" });
      if (!result.success) { log("Audio upload failed:", result.error); _setAudioUploading(false); return; }
      useLoginStore.getState().requireLogin(async () => {
        let zCurrentUserObj = useLoginStore.getState().getCurrentUser();
        let useCanRespond = canRespondVal !== undefined ? canRespondVal : sCanRespond;
        let forwardTo = buildForwardToPayload(forwardOverride, sForwardReplies);
        let msg = { ...SMS_PROTO };
        msg.message = storeName + " has sent you an audio message";
        msg.mediaUrls = [{ url: result.downloadURL, contentType: "audio/webm" }];
        msg.phoneNumber = phone;
        msg.canRespond = useCanRespond ? true : null;
        msg.millis = Date.now();
        msg.id = crypto.randomUUID();
        msg.type = "outgoing";
        msg.senderUserObj = zCurrentUserObj;
        msg.sentByUser = zCurrentUserObj.id;
        if (forwardTo) msg.forwardTo = forwardTo;
        let matchedWO = useOpenWorkordersStore.getState().workorders.find(wo => wo.customerCell === phone);
        if (matchedWO) { msg.customerFirst = matchedWO.customerFirst || ""; msg.customerLast = matchedWO.customerLast || ""; }
        let optimistic = { ...msg, status: "sending" };
        let addedMessages = [...sMessagesRef.current, optimistic];
        sMessagesRef.current = addedMessages;
        _setMessages(addedMessages);
        updateCache(addedMessages, noMoreRef.current);
        let sendResult = await smsService.send(msg);
        let updatedMessages = sMessagesRef.current.map(m => m.id === msg.id ? { ...m, status: sendResult.success ? "sent" : "failed" } : m);
        sMessagesRef.current = updatedMessages;
        _setMessages(updatedMessages);
        updateCache(updatedMessages, noMoreRef.current);
        if (!sendResult.success) {
          useAlertScreenStore.getState().setValues({
            title: "Message Failed", message: sendResult.error || "Failed to send message",
            btn1Text: "OK", handleBtn1Press: () => useAlertScreenStore.getState().resetAll(),
            showAlert: true, canExitOnOuterClick: true,
          });
        }
        handleDeleteAudio();
        _setAudioUploading(false);
      });
    } catch (err) {
      log("Audio send error:", err);
      _setAudioUploading(false);
    }
  }

  async function handleHubFilesSelected(e) {
    let files = Array.from(e.target.files);
    if (!files.length || !phone || phone.length !== 10) return;
    _setHubMediaUploading(true);
    try {
      const { uploadFileToStorage } = await import("../../../db_calls");
      const { compressImage } = await import("../../../utils");
      let zSettings = useSettingsStore.getState().settings;
      let tenantID = zSettings?.tenantID;
      let storeID = zSettings?.storeID;
      let storeName = zSettings?.storeInfo?.displayName || "Our store";
      let mediaItems = [];
      for (let i = 0; i < files.length; i++) {
        let file = files[i];
        let timestamp = Date.now();
        let storagePath = `${tenantID}/${storeID}/message-media/${timestamp}_${file.name}`;
        let result = await uploadFileToStorage(file, storagePath);
        if (!result.success) { log("Hub media upload failed:", result.error); continue; }
        let thumbnailUrl = "";
        if (file.type.startsWith("image")) {
          let thumbBlob = await compressImage(file, 300, 0.5);
          if (thumbBlob) {
            let thumbPath = `${tenantID}/${storeID}/message-media/thumbnails/${timestamp}_${file.name}`;
            let thumbResult = await uploadFileToStorage(thumbBlob, thumbPath);
            if (thumbResult.success) thumbnailUrl = thumbResult.downloadURL;
          }
        }
        let isVideo = file.type.startsWith("video");
        mediaItems.push({ url: result.downloadURL, thumbnailUrl, type: isVideo ? "video" : "image", contentType: isVideo ? "video/mp4" : "image/jpeg" });
      }
      if (hubFileInputRef.current) hubFileInputRef.current.value = "";
      if (!mediaItems.length) { _setHubMediaUploading(false); return; }
      // Build and send media message using same pattern as customer messages sendMediaMessage
      useLoginStore.getState().requireLogin(async () => {
        let zCurrentUserObj = useLoginStore.getState().getCurrentUser();
        let hasImages = mediaItems.some(m => m.type === "image");
        let hasVideos = mediaItems.some(m => m.type === "video");
        let imageCount = mediaItems.filter(m => m.type === "image").length;
        let videoCount = mediaItems.filter(m => m.type === "video").length;
        let parts = [];
        if (hasImages) parts.push(imageCount === 1 ? "a photo" : imageCount + " photos");
        if (hasVideos) parts.push(videoCount === 1 ? "a video" : videoCount + " videos");
        let mediaText = storeName + " has sent you " + parts.join(" and ");
        let msg = { ...SMS_PROTO };
        msg.message = mediaText;
        msg.mediaUrls = mediaItems.map(m => ({ url: m.url, thumbnailUrl: m.thumbnailUrl || "", contentType: m.contentType }));
        msg.phoneNumber = phone;
        msg.canRespond = sCanRespond ? true : null;
        msg.millis = Date.now();
        msg.id = crypto.randomUUID();
        msg.type = "outgoing";
        msg.senderUserObj = zCurrentUserObj;
        msg.sentByUser = zCurrentUserObj.id;
        let matchedWO = useOpenWorkordersStore.getState().workorders.find(wo => wo.customerCell === phone);
        if (matchedWO) { msg.customerFirst = matchedWO.customerFirst || ""; msg.customerLast = matchedWO.customerLast || ""; }
        let optimistic = { ...msg, status: "sending" };
        let addedMessages = [...sMessagesRef.current, optimistic];
        sMessagesRef.current = addedMessages;
        _setMessages(addedMessages);
        updateCache(addedMessages, noMoreRef.current);
        _setHubMediaUploading(false);
        let result = await smsService.send(msg);
        let updatedMessages = sMessagesRef.current.map(m => m.id === msg.id ? { ...m, status: result.success ? "sent" : "failed" } : m);
        sMessagesRef.current = updatedMessages;
        _setMessages(updatedMessages);
        updateCache(updatedMessages, noMoreRef.current);
        if (!result.success) {
          useAlertScreenStore.getState().setValues({
            title: "Message Failed", message: result.error || "Failed to send media",
            btn1Text: "OK", handleBtn1Press: () => useAlertScreenStore.getState().resetAll(),
            showAlert: true, canExitOnOuterClick: true,
          });
        }
      });
    } catch (err) {
      log("Hub media upload error:", err);
      _setHubMediaUploading(false);
      if (hubFileInputRef.current) hubFileInputRef.current.value = "";
    }
  }

  let lastOutgoingID = null;
  for (let i = sMessages.length - 1; i >= 0; i--) {
    if (sMessages[i].type === "outgoing") { lastOutgoingID = sMessages[i].id || sMessages[i].millis; break; }
  }

  let customerName = ((thread?.customerFirst || "") + " " + (thread?.customerLast || "")).trim();

  return (
    <div className={hubStyles.hubPanelRoot}>
      {/* Header */}
      <div className={hubStyles.hubPanelHeader}>
        <span className={hubStyles.hubPanelHeaderPhone} style={{ color: C.text }}>{formatPhoneWithDashes(phone)}</span>
        <div className={hubStyles.hubPanelHeaderCenter}>
          {customerName ? (
            <span className={hubStyles.hubPanelCustomerName} style={{ color: C.blue }}>{customerName}</span>
          ) : !thread && !sListenerConnecting ? (
            <div className={hubStyles.hubPanelNewThreadBadge} style={{ backgroundColor: C.green }}>
              <span className={hubStyles.hubPanelNewThreadText}>New Thread</span>
            </div>
          ) : sListenerConnecting ? <SmallLoadingIndicatorDom /> : null}
        </div>
        <TouchableOpacityDom
          onPress={(e) => {
            if (matchingWorkorders.length < 1) return;
            if (matchingWorkorders.length === 1) {
              onOpenWorkorderKeepHub(matchingWorkorders[0]);
            } else {
              let nativeEvent = e?.nativeEvent || e;
              _setWoDropdown({ x: nativeEvent.pageX || nativeEvent.clientX || 0, y: nativeEvent.pageY || nativeEvent.clientY || 0 });
            }
          }}
          disabled={matchingWorkorders.length < 1}
          className={`${hubStyles.hubPanelHeaderBtn} ${hubStyles["hubPanelHeaderBtn--openWO"]}`}
          style={{ backgroundColor: C.orange, opacity: matchingWorkorders.length > 0 ? 1 : 0 }}
        >
          <span className={hubStyles.hubPanelHeaderBtnText}>Open Workorder</span>
        </TouchableOpacityDom>
        <TouchableOpacityDom
          onPress={handleLoadMore}
          disabled={sLoadingMore || sNoMoreHistory}
          className={hubStyles.hubPanelHeaderBtn}
          style={{ backgroundColor: (sLoadingMore || sNoMoreHistory) ? C.surfaceAlt : C.blue, opacity: sNoMoreHistory ? 0.4 : 1 }}
        >
          {sLoadingMore ? <SmallLoadingIndicatorDom /> : <span className={hubStyles.hubPanelHeaderBtnText}>Load more</span>}
        </TouchableOpacityDom>
      </div>
      {sWoDropdown && createPortal(
        <div className={hubStyles.woDropdownBackdrop} style={{ zIndex: Z.dropdown }} onClick={() => _setWoDropdown(null)}>
          <div
            className={hubStyles.woDropdownMenu}
            style={{ top: sWoDropdown.y, left: sWoDropdown.x, backgroundColor: C.listItemWhite, borderColor: C.buttonLightGreenOutline }}
            onClick={(e) => e.stopPropagation()}
          >
            {matchingWorkorders.map((wo) => (
              <div
                key={wo.id}
                className={hubStyles.woDropdownItem}
                onClick={() => { _setWoDropdown(null); onOpenWorkorderKeepHub(wo); }}
              >
                <span className={hubStyles.woDropdownItemTitle} style={{ color: C.text }}>
                  {[wo.brand, wo.description].filter(Boolean).join(" ") || "Untitled"}
                </span>
                <div className={hubStyles.woDropdownStatusBadge} style={{ backgroundColor: C.blue }}>
                  <span className={hubStyles.woDropdownStatusText}>{wo.status || "No status"}</span>
                </div>
              </div>
            ))}
          </div>
        </div>,
        document.body
      )}
      {/* Messages */}
      <div className={hubStyles.hubMessagesArea}>
        {sMessages.length < 1 && !sListenerConnecting ? (
          <div className={hubStyles.messagesCenter}>
            <span className={hubStyles.hubMessagesEmptyText} style={{ color: C.textDisabled }}>No messages yet</span>
          </div>
        ) : sMessages.length < 1 ? null : (
          <div
            ref={messageListRef}
            className={hubStyles.messageList}
            style={previewMode ? { overflowY: "hidden", pointerEvents: "none" } : undefined}
          >
            {sMessages.map((item) => {
              let key = item.id || String(item.millis);
              if (item.type === "incoming") {
                return (
                  <IncomingMessageComponent
                    key={key}
                    msgObj={item}
                    autoTranslateTo={sFromLang !== sToLang ? sToLang : ""}
                    onScrollToBottom={() => { setTimeout(() => scrollListToBottom(messageListRef, true), 50); }}
                  />
                );
              }
              let isLast = (item.id || item.millis) === lastOutgoingID;
              return (
                <OutgoingMessageComponent
                  key={key}
                  msgObj={item}
                  isLastOutgoing={isLast}
                  thread={thread}
                  onToggleBlock={handleToggleBlock}
                  onToggleForward={handleHubToggleForward}
                />
              );
            })}
          </div>
        )}
      </div>
      {/* Compose — hidden in preview mode */}
      {!previewMode && (
        <ComposeArea
          mode="hub"
          value={sNewMessage}
          onChange={(val) => {
            val = autoCapitalize(val);
            _setNewMessage(val);
            if (sFromLang && sToLang && sFromLang !== sToLang) debouncedTranslate(val, sToLang);
          }}
          onSend={() => handleSend()}
          sendDisabled={!sNewMessage.trim() || sHubMediaUploading || (sFromLang !== sToLang && sTranslateLoading)}
          audioUrl={sAudioUrl}
          audioUploading={sAudioUploading}
          showReplyOptions={sShowReplyModal}
          audioMode={pendingActionRef.current === "audio"}
          onSelectCanRespond={(canRespond) => {
            clearAutoSend();
            _setCanRespond(canRespond);
            _setShowReplyModal(false);
            if (pendingActionRef.current === "audio") { handleSendAudio(canRespond); }
            else { doSend(pendingSendTextRef.current, canRespond); }
          }}
          onSendAudio={() => handleSendAudio(sCanRespond)}
          onDeleteAudio={handleDeleteAudio}
          forwardReplies={sForwardReplies}
          onToggleForward={handleToggleForwardReplies}
          hasActivePhone={!!phone && phone.length === 10}
          fromLang={sFromLang}
          onFromLang={(code) => {
            _setFromLang(code);
            if (code && sToLang && code !== sToLang && sNewMessage.trim()) debouncedTranslate(sNewMessage, sToLang);
            if (!code || code === sToLang) clearTranslation();
          }}
          toLang={sToLang}
          onToLang={(code) => {
            _setToLang(code);
            if (sFromLang && code && sFromLang !== code && sNewMessage.trim()) debouncedTranslate(sNewMessage, code);
            if (!code || sFromLang === code) clearTranslation();
          }}
          translatedText={translatedText}
          translateLoading={sTranslateLoading}
          rightSlot={
            <>
              <input
                ref={hubFileInputRef}
                type="file"
                accept="image/*,video/*"
                multiple
                onChange={handleHubFilesSelected}
                style={{ display: "none" }}
              />
              {matchingWorkorders.length < 1 && (
                <TooltipDom text={sHubMediaUploading ? "Uploading..." : "Send photo/video"} position="top">
                  <TouchableOpacityDom
                    onPress={() => !sHubMediaUploading && hubFileInputRef.current?.click()}
                    className={hubStyles.iconBtn}
                    style={{ opacity: sHubMediaUploading ? 0.4 : 1 }}
                  >
                    {sHubMediaUploading
                      ? <LoadingIndicatorDom />
                      : <ImageDom icon={ICONS.uploadCamera} size={35} />
                    }
                  </TouchableOpacityDom>
                </TooltipDom>
              )}
              {onSendPaymentLink && (
                <TooltipDom text="Send Payment Link" position="top" hideOnPress>
                  <TouchableOpacityDom
                    onPress={() => onSendPaymentLink(phone)}
                    className={hubStyles.iconBtn}
                  >
                    <ImageDom icon={ICONS.paperPlane} size={35} />
                  </TouchableOpacityDom>
                </TooltipDom>
              )}
              {onShowPhoneEntry && (
                <TooltipDom text="New number" position="top">
                  <div
                    onClick={() => {
                      if (longPressFiredRef.current) { longPressFiredRef.current = false; return; }
                      if (!sHubMediaUploading) onShowPhoneEntry();
                    }}
                    onPointerDown={() => {
                      if (sHubMediaUploading) return;
                      longPressFiredRef.current = false;
                      longPressTimerRef.current = setTimeout(async () => {
                        longPressFiredRef.current = true;
                        const { clearAll } = await import("../../../hubMessageDB");
                        await clearAll();
                        useCustMessagesStore.getState().clearHubConversationCache();
                        log("Hub message cache cleared");
                        alert("Message cache cleared. Refresh to reload.");
                      }, 1000);
                    }}
                    onPointerUp={() => { if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; } }}
                    onPointerLeave={() => { if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; } }}
                    className={hubStyles.iconBtn}
                    style={{ opacity: sHubMediaUploading ? 0.3 : 1, cursor: "pointer" }}
                  >
                    <ImageDom icon={ICONS.cellPhone} size={35} />
                  </div>
                </TooltipDom>
              )}
              {matchingWorkorders.length > 0 && (
                <TooltipDom text="Go to customer" position="top" offsetX={-15}>
                  <TouchableOpacityDom onPress={() => onOpenWorkorder(phone)} className={hubStyles.iconBtn}>
                    <ImageDom icon={ICONS.person} size={35} />
                  </TouchableOpacityDom>
                </TooltipDom>
              )}
              {exitHubButton}
            </>
          }
        />
      )}
    </div>
  );
}

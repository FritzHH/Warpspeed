/* eslint-disable */

import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Image,
  ActivityIndicator,
} from "react-native-web";
import { createPortal } from "react-dom";
import {
  capitalizeFirstLetterOfString,
  calculateRunningTotals,
  dim,
  formatDateTimeForReceipt,
  formatPhoneWithDashes,
  formatStoreHours,
  gray,
  log,
  printBuilder,
} from "../../../utils";
import {
  TabMenuDivider as Divider,
  Button,
  CheckBox_,
  Button_,
  DropdownMenu,
  Image_,
  PhoneNumberInput,
  LoadingIndicator,
  SmallLoadingIndicator,
  Tooltip,
  TouchableOpacity_,
} from "../../../components";
import { C, COLOR_GRADIENTS, Colors, ICONS, Fonts } from "../../../styles";
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
import { dbUploadPDFAndSendSMS, dbCreateTextToPayInvoice, dbListenToNewMessages, dbGetCustomerMessages, dbUpdateMessageCanRespond, dbToggleSMSForwarding, dbGetCustomer, dbSaveMessageTranslation } from "../../../db_calls_wrapper";
import { translateText } from "../../../db_calls";
import { WorkorderMediaModal } from "../modal_screens/WorkorderMediaModal";
import { TransformWrapper, TransformComponent, useTransformEffect } from "react-zoom-pan-pinch";
import { ReplyOptionsBar, scheduleAutoSend, clearAutoSend, buildForwardToPayload } from "./ReplyOptionsBar";


const TRANSLATION_LANGUAGES = [
  { label: "English", code: "en" },
  { label: "Spanish", code: "es" },
  { label: "French", code: "fr" },
  { label: "German", code: "de" },
  { label: "Creole", code: "ht" },
  { label: "Arabic", code: "ar" },
];
const LANG_NAME_TO_CODE = { English: "en", Spanish: "es", French: "fr", German: "de", Creole: "ht", Arabic: "ar" };

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
];

// Auto-capitalize: first letter, after sentence-ending punctuation, standalone "i"
function autoCapitalize(val) {
  if (!val) return val;
  if (val.length > 10000) val = val.slice(0, 10000);
  val = val.replace(/(^|[.!?]\s+)([a-z])/g, (m, before, letter) => before + letter.toUpperCase());
  val = val.replace(/(^|\s)i(?=$|\s|[.,!?;:'])/g, (m, before) => before + "I");
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
  }, [zWorkorderObj?.hasNewSMS, zWorkorderObj?.id]);

  const [sNewMessage, _setNewMessage] = useState("");
  const [sCanRespond, _setCanRespond] = useState(false);
  const [sInputHeight, _setInputHeight] = useState(36);
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
  const [sHubSidebarCollapsed, _setHubSidebarCollapsed] = useState(false);
  const [sHubSidebarFullWidth, _setHubSidebarFullWidth] = useState(false);
  const [sHubHoverPhone, _setHubHoverPhone] = useState("");
  const hoverTimerRef = useRef(null);

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

    // Imperative height adjustment — reset to 0 then measure scrollHeight so it shrinks on delete
    if (textInputRef.current) {
      const node = textInputRef.current;
      node.style.height = "0px";
      const h = Math.max(36, Math.ceil(node.scrollHeight));
      node.style.height = h + "px";
      _setInputHeight(h);
    }

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

    // Scroll: reset refs when messages clear, let onContentSizeChange handle initial
    if (zMessages.length === 0) {
      hasInitialScrolledRef.current = false;
      lastMsgIdRef.current = null;
      return;
    }
    if (!hasInitialScrolledRef.current) return;
    let lastId = zMessages[zMessages.length - 1]?.id;
    if (lastId === lastMsgIdRef.current) return;
    lastMsgIdRef.current = lastId;
    try { messageListRef.current?.scrollToEnd({ animated: true }); } catch (e) {}
  }, [zMessages]);

  // Auto-scroll custom phone messages to bottom
  useEffect(() => {
    try {
      if (!sCustomPhoneMode || sCustomPhoneMessages.length < 1) return;

      // canRespond is now read from thread parent doc (handled by hub mode redirect)

      if (sCustomPhoneMessages.length > 1) {
        messageListRef.current?.scrollToIndex({
          index: sCustomPhoneMessages.length - 1,
          animated: true,
        });
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
      _setInputHeight(36);
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
    return templateMessage
      .replace(/\{firstName\}/g, capitalizeFirstLetterOfString(zCustomer?.first) || "")
      .replace(/\{lastName\}/g, capitalizeFirstLetterOfString(zCustomer?.last) || "")
      .replace(/\{brand\}/g, zWorkorderObj?.brand || "")
      .replace(/\{description\}/g, zWorkorderObj?.description || "")
      .replace(/\{totalAmount\}/g, totalAmount)
      .replace(/\{lineItems\}/g, lineItems)
      .replace(/\{partOrdered\}/g, zWorkorderObj?.partOrdered || "")
      .replace(/\{partSource\}/g, zWorkorderObj?.partSource || "")
      .replace(/\{storeHours\}/g, storeHoursText)
      .replace(/\{storePhone\}/g, ((p) => p.length === 10 ? "(" + p.slice(0, 3) + ") " + p.slice(3, 6) + "-" + p.slice(6) : p)(zSettings?.storeInfo?.phone || ""));
  }
  async function handleSendWorkorderTicket(canRespondVal, forwardOverride) {
    if (!zWorkorderObj || !zCustomer?.customerCell) return;
    useLoginStore.getState().requireLogin(async () => {
      let { tenantID, storeID } = useSettingsStore.getState().getSettings();
      const _ctx = { currentUser: useLoginStore.getState().getCurrentUser(), settings: zSettings };
      let receiptData = printBuilder.workorder(zWorkorderObj, zCustomer, zSettings?.salesTaxPercent, _ctx);
      let { generateWorkorderTicketPDF } = await import("../../../pdfGenerator");
      let base64 = generateWorkorderTicketPDF(receiptData);
      let storagePath = build_db_path.cloudStorage.workorderTicketPDF(zWorkorderObj.id, tenantID, storeID);
      let messageTemplate = zSettings?.workorderTicketMessage || "Hi {firstName}, here is your workorder ticket: {link}";
      let message = resolveTemplate(messageTemplate);
      let messageID = crypto.randomUUID();
      let canRespondBool = canRespondVal ? true : null;
      let forwardTo = buildForwardToPayload(forwardOverride, sForwardReplies);
      let result = await dbUploadPDFAndSendSMS({
        base64,
        storagePath,
        message,
        phoneNumber: zCustomer.customerCell,
        customerID: zCustomer.id,
        messageID,
        canRespond: canRespondBool,
        forwardTo,
      });
      if (result && result.success) {
        useCustMessagesStore.getState().setOutgoingMessage({
          id: messageID,
          message: message.replace(/\{link\}/g, "[PDF link]"),
          phoneNumber: zCustomer.customerCell,
          customerID: zCustomer.id,
          millis: new Date().getTime(),
          type: "outgoing",
          status: "sent",
          canRespond: canRespondBool,
          senderUserObj: useLoginStore.getState().getCurrentUser(),
        });
      } else {
        useAlertScreenStore.getState().setValues({
          title: "Workorder Send Failed",
          message: result?.error || "Failed to upload and send workorder ticket",
          btn1Text: "OK",
          handleBtn1Press: () => useAlertScreenStore.getState().resetAll(),
          showAlert: true,
          canExitOnOuterClick: true,
        });
      }
    });
  }

  async function handleSendSMSPayment() {
    if (!zWorkorderObj || !zCustomer?.customerCell) return;
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
    if (zWorkorderObj.activeSaleID) {
      useAlertScreenStore.getState().setValues({
        title: "Active Sale In Progress",
        message: "This workorder has an active sale. Complete or cancel the sale before sending a payment link.",
        btn1Text: "OK",
        handleBtn1Press: () => useAlertScreenStore.getState().resetAll(),
        showAlert: true,
        canExitOnOuterClick: true,
      });
      return;
    }
    useLoginStore.getState().requireLogin(async () => {
      let amountDue = 0;
      let activeSale = zWorkorderObj.activeSaleID
        ? useActiveSalesStore.getState().getActiveSale(zWorkorderObj.activeSaleID)
        : null;
      if (activeSale) {
        amountDue = (activeSale.total || 0) - (activeSale.amountCaptured || 0);
      } else {
        let totals = calculateRunningTotals(zWorkorderObj, zSettings?.salesTaxPercent, [], false, !!zWorkorderObj.taxFree);
        amountDue = totals.finalTotal;
      }
      let displayAmount = "$" + (amountDue / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      useAlertScreenStore.getState().setValues({
        title: "Send SMS Payment",
        message: "Send a payment link for " + displayAmount + " to " + zCustomer.first + " at " + zCustomer.customerCell + "?",
        btn1Text: "Send",
        btn2Text: "Cancel",
        handleBtn1Press: async () => {
          useAlertScreenStore.getState().resetAll();
          let result = await dbCreateTextToPayInvoice(zWorkorderObj.id, "sms");
          if (result && result.success) {
            useAlertScreenStore.getState().setValues({
              title: "Payment Link Sent",
              message: "Payment link sent to " + zCustomer.first + ".",
              btn1Text: "OK",
              handleBtn1Press: () => useAlertScreenStore.getState().resetAll(),
              showAlert: true,
              canExitOnOuterClick: true,
            });
          } else {
            useAlertScreenStore.getState().setValues({
              title: "Payment Link Failed",
              message: result?.error || "Failed to send payment link",
              btn1Text: "OK",
              handleBtn1Press: () => useAlertScreenStore.getState().resetAll(),
              showAlert: true,
              canExitOnOuterClick: true,
            });
          }
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
  }

  async function handleToggleForwardResponses() {
    let phone = sCustomPhoneMode ? sCustomPhone : zCustomer?.customerCell;
    if (!phone || phone.length !== 10) return;
    let currentUser = useLoginStore.getState().getCurrentUser();
    if (!currentUser?.id) return;
    let thread = zSmsThreads.find(t => t.phone === phone);
    let isCurrentlyForwarding = !!(thread?.forwardTo?.[currentUser.id]);
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

  // Hub mode: 2-panel layout for all message threads
  const showHub = sHubMode || !hasCustomer;
  if (showHub) {
    return (
      <View style={{ flex: 1, flexDirection: "row" }}>
        {/* Left panel: thread list */}
        {sHubSidebarCollapsed ? (
          <View style={{ width: 36, borderRightWidth: 2, borderRightColor: gray(0.15), alignItems: "center", paddingTop: 10 }}>
            <Tooltip text="Show conversations" position="right">
              <TouchableOpacity onPress={() => _setHubSidebarCollapsed(false)} style={{ padding: 6 }}>
                <Image_ icon={ICONS.greenRightArrow} size={30} />
              </TouchableOpacity>
            </Tooltip>
          </View>
        ) : (
          <View style={{ width: sHubSidebarFullWidth ? "100%" : "30%", borderRightWidth: sHubSidebarFullWidth ? 0 : 2, borderRightColor: gray(0.15), flexDirection: "column" }}>
            {/* Header */}
            <View style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: gray(0.1) }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Tooltip text="Collapse" position="right">
                  <TouchableOpacity onPress={() => _setHubSidebarCollapsed(true)} style={{ padding: 4 }}>
                    <Image_ icon={ICONS.greenLeftArrow} size={26} />
                  </TouchableOpacity>
                </Tooltip>
                <View style={{ flex: 1, alignItems: "center" }}>
                  <Text style={{ fontSize: 16, fontWeight: Fonts.weight.textHeavy, color: C.text }}>Messages</Text>
                </View>
                <Tooltip text={sHubSidebarFullWidth ? "Shrink sidebar" : "Expand sidebar"} position="left">
                  <TouchableOpacity onPress={() => _setHubSidebarFullWidth(!sHubSidebarFullWidth)} style={{ padding: 4 }}>
                    <Image_ icon={sHubSidebarFullWidth ? ICONS.greenLeftArrow : ICONS.greenRightArrow} size={26} />
                  </TouchableOpacity>
                </Tooltip>
              </View>
            </View>
            {/* Thread list */}
            <View style={{ flex: 1, overflow: "hidden" }}>
            {zSmsThreads.length < 1 ? (
              <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
                <Text style={{ fontSize: 14, color: gray(0.3) }}>No conversations yet</Text>
              </View>
            ) : (
              <FlatList
                data={zSmsThreads}
                keyExtractor={(item) => item.phone}
                renderItem={({ item }) => {
                  let activeWO = zAllWorkorders.find(wo => wo.customerCell === item.phone);
                  return (
                    <ThreadCard
                      thread={item}
                      isSelected={sHubSelectedPhone === item.phone}
                      isHovered={sHubHoverPhone === item.phone}
                      activeWO={activeWO}
                      onPress={() => handleHubThreadClick(item)}
                      onHoverIn={() => { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = setTimeout(() => _setHubHoverPhone(item.phone), 150); }}
                      onHoverOut={() => { clearTimeout(hoverTimerRef.current); _setHubHoverPhone((prev) => prev === item.phone ? "" : prev); }}
                    />
                  );
                }}
              />
            )}
            </View>
          </View>
        )}
        {/* Right panel: conversation */}
        {!sHubSidebarFullWidth && (
          <View style={{ flex: 1 }}>
            {(sHubHoverPhone || sHubSelectedPhone) ? (
              <HubConversationPanel
                key={sHubHoverPhone || sHubSelectedPhone}
                phone={sHubHoverPhone || sHubSelectedPhone}
                thread={zSmsThreads.find(t => t.phone === (sHubHoverPhone || sHubSelectedPhone))}
                previewMode={!!sHubHoverPhone && sHubHoverPhone !== sHubSelectedPhone}
                onShowPhoneEntry={() => { _setHubSelectedPhone(""); _setHubNewPhone(""); }}
                onOpenWorkorder={handleHubOpenWorkorder}
                onOpenWorkorderKeepHub={handleHubOpenWorkorderKeepHub}
                hasMatchingWorkorder={!hasCustomer && !!zAllWorkorders.find(w => w.customerCell === (sHubHoverPhone || sHubSelectedPhone))}
                matchingWorkorders={zAllWorkorders.filter(w => w.customerCell === (sHubHoverPhone || sHubSelectedPhone))}
                exitHubButton={null}
              />
            ) : (
              <View style={{ flex: 1, flexDirection: "column" }}>
                <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
                  <Text style={{ fontSize: 16, color: gray(0.25) }}>Select a conversation</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", paddingTop: 8, paddingHorizontal: 8, paddingBottom: 8 }}>
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
                    <Tooltip text="Back to customer" position="top" offsetX={-20}>
                      <TouchableOpacity onPress={handleExitHubMode} style={{ marginLeft: 8, padding: 4 }}>
                        <Image_ icon={ICONS.person} size={28} />
                      </TouchableOpacity>
                    </Tooltip>
                  )}
                </View>
              </View>
            )}
          </View>
        )}
      </View>
    );
  }

  return (
    <View
      style={{
        flex: 1,
        padding: 5,
        justifyContent: "space-between",
      }}
    >
      <View
        style={{
          width: "100%",
          flex: 1,
          flexShrink: 1,
          overflow: "hidden",
        }}
      >
        {zMessagesLoading && !sCustomPhoneMode && (
          <View style={{ width: "100%", height: "100%", justifyContent: "center", alignItems: "center" }}>
            <LoadingIndicator message="Loading messages..." />
          </View>
        )}
        {(!zMessagesLoading || sCustomPhoneMode) && messagesArr.length < 1 && (
          <View
            style={{
              width: "100%",
              height: "100%",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Text
              style={{ textAlign: "center", fontSize: 18, color: gray(0.25) }}
            >
              {sCustomPhoneMode
                ? (sCustomPhone.length < 10
                  ? "Enter a phone number to message"
                  : "No messages to/from this phone number")
                : !zCustomer?.id
                  ? "Enter the phone number to message"
                  : zCustomer?.customerCell
                    ? "No messages to/from this cell phone #"
                    : "No cell phone on account\n\nText messaging deactivated"}
            </Text>
          </View>
        )}
        {(!zMessagesLoading || sCustomPhoneMode) && messagesArr.length > 0 && (
          <View style={{ width: "100%", flex: 1 }}>
            {zMessagesLoadingMore && !sCustomPhoneMode && (
              <View style={{ width: "100%", paddingVertical: 8, alignItems: "center" }}>
                <SmallLoadingIndicator />
              </View>
            )}
            <FlatList
              onScrollToIndexFailed={(info) => {
                setTimeout(() => { messageListRef.current?.scrollToEnd({ animated: false }); }, 50);
              }}
              onContentSizeChange={() => {
                if (!hasInitialScrolledRef.current && messagesArr.length > 0) {
                  hasInitialScrolledRef.current = true;
                  lastMsgIdRef.current = messagesArr[messagesArr.length - 1]?.id;
                  messageListRef.current?.scrollToEnd({ animated: false });
                }
              }}
              ref={messageListRef}
              data={messagesArr}
              renderItem={(item) => {
                let idx = item.index;
                item = item.item;
                if (item.type === "incoming")
                  return <IncomingMessageComponent msgObj={item} autoTranslateTo={sFromLang !== sToLang ? sToLang : ""} onScrollToBottom={() => { setTimeout(() => { messageListRef.current?.scrollToEnd({ animated: true }); }, 50); }} />;
                let isLast = (item.id || item.millis) === lastOutgoingID;
                return <OutgoingMessageComponent msgObj={item} isLastOutgoing={isLast} thread={customerThread} onToggleBlock={handleToggleBlockResponses} onToggleForward={handleToggleForwardResponses} />;
              }}
              onScroll={(e) => {
                if (sCustomPhoneMode) return;
                let { contentOffset } = e.nativeEvent;
                if (contentOffset.y <= 0 && zMessagesHasMore && !zMessagesLoadingMore) {
                  loadMoreMessages();
                }
              }}
              scrollEventThrottle={200}
            />
          </View>
        )}
      </View>
      {!hasActivePhone ? (
        <View style={{ width: "100%", paddingVertical: 10, paddingHorizontal: 10 }}>
          {(sCustomPhoneMode || !hasCustomer) ? (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center" }}>
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
                <TouchableOpacity
                  onPress={handleExitCustomPhoneMode}
                  style={{ marginLeft: 12, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 4, backgroundColor: C.blue }}
                >
                  <Text style={{ fontSize: 13, color: "white" }}>Back to customer</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null}
        </View>
      ) : (
        <View
          style={{
            paddingTop: 10,
              flexDirection: "column",
              width: "100%",
          }}
        >
          {(sFromLang && sToLang && sFromLang !== sToLang) && sNewMessage.trim() ? (
            <View style={{
              padding: 6, marginBottom: 4, backgroundColor: "rgb(245,245,220)",
              borderRadius: 5, borderWidth: 1, borderColor: gray(0.15),
            }}>
              {translatedText && !sTranslateLoading
                ? <Text style={{ fontSize: 14, color: C.text }}>{translatedText}</Text>
                : <Text style={{ fontSize: 13, color: gray(0.5), fontStyle: "italic" }}>Translating...</Text>
              }
            </View>
          ) : null}
            <View style={{ width: "100%" }}>

              {sAudioUrl ? (
                <View style={{ padding: 8, marginBottom: 4, backgroundColor: "rgb(245,245,220)", borderRadius: 5, borderWidth: 1, borderColor: gray(0.15) }}>
                  <audio controls src={sAudioUrl} style={{ width: "100%" }} />
                </View>
              ) : null}
              <ReplyOptionsBar
                visible={sShowReplyModal}
                forwardReplies={sForwardReplies}
                hasActivePhone={hasActivePhone}
                audioMode={pendingActionRef.current === "audio"}
                audioUploading={sAudioUploading}
                onSelectCanRespond={(canRespond) => {
                  clearAutoSend();
                  _setCanRespond(canRespond);
                  _setShowReplyModal(false);
                  if (pendingActionRef.current === "intake") { handleSendWorkorderTicket(canRespond); pendingActionRef.current = null; }
                  else if (pendingActionRef.current === "media") { sendMediaMessage(canRespond); }
                  else if (pendingActionRef.current === "audio") { handleSendAudio(canRespond); }
                  else { sendMessage(sNewMessage, "", canRespond); }
                }}
                onSendAudio={() => handleSendAudio(sCanRespond)}
                onDeleteAudio={handleDeleteAudio}
                onToggleForward={handleToggleForwardReplies}
              />
              <View style={{ flexDirection: "row", alignItems: "flex-end", borderWidth: 2, borderRadius: 5, borderColor: gray(0.15), backgroundColor: "white" }}>
                <TextInput
                  onChangeText={handleMessageChange}
                  ref={textInputRef}
                  autoFocus={true}
                  autoCapitalize="sentences"
                  multiline={true}
                  placeholderTextColor={"gray"}
                  placeholder={"Message..."}
                  onSelectionChange={(e) => {
                    cursorPositionRef.current = e.nativeEvent.selection.start;
                  }}
                  onContentSizeChange={(e) => {
                    let h = e?.nativeEvent?.contentSize?.height;
                    if (typeof h === "number" && h > 0) {
                      _setInputHeight(Math.max(36, Math.ceil(h)));
                    }
                  }}
                  style={{
                    outlineStyle: "none",
                    outlineColor: "transparent",
                    outlineWidth: 0,
                    borderWidth: 0,
                    borderColor: "transparent",
                    color: C.text,
                    paddingTop: 0,
                    paddingBottom: 0,
                    paddingLeft: 5,
                    paddingRight: 4,
                    marginVertical: 8,
                    fontSize: 15,
                    lineHeight: 20,
                    height: sInputHeight,
                    overflow: "hidden",
                    flex: 1,
                    textAlignVertical: "top",
                  }}
                  value={sNewMessage}
                />
                <View style={{ flexDirection: "column", alignItems: "center", justifyContent: "flex-end" }}>
                  <TouchableOpacity
                    onPress={() => { if (sNewMessage.trim() && !(sFromLang !== sToLang && sTranslateLoading)) { if (isUnmodifiedTemplateRef.current) { sendMessage(sNewMessage, "", false, false); isUnmodifiedTemplateRef.current = false; } else { _setShowReplyModal(true); scheduleAutoSend(() => { _setShowReplyModal(false); sendMessage(sNewMessage, "", sCanRespond); }); } } }}
                    style={{ marginRight: 4, marginBottom: 2, padding: 6, opacity: (!sNewMessage.trim() || (sFromLang !== sToLang && sTranslateLoading)) ? 0.3 : 1 }}
                  >
                    <Image_ icon={ICONS.airplane} size={41} />
                  </TouchableOpacity>
                  <Tooltip text={!sHasMicrophone ? "No microphone detected" : sAudioRecording ? "Stop recording" : "Record audio clip"} position="top">
                    <TouchableOpacity
                      onPress={sHasMicrophone ? (sAudioRecording ? handleStopRecording : handleStartRecording) : undefined}
                      style={{ marginRight: 4, marginBottom: 4, padding: 4, opacity: sHasMicrophone ? 1 : 0.3 }}
                    >
                      <Image_ icon={sAudioRecording ? ICONS.stopRecord : ICONS.microphone} size={30} />
                    </TouchableOpacity>
                  </Tooltip>
                </View>
              </View>
          </View>
            <View style={{ width: "100%", marginTop: 10, paddingHorizontal: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <DropdownMenu
                    dataArr={TRANSLATION_LANGUAGES}
                    onSelect={(item) => {
                      _setFromLang(item.code);
                      if (item.code && sToLang && item.code !== sToLang && sNewMessage.trim()) debouncedTranslate(sNewMessage, sToLang);
                      if (!item.code || item.code === sToLang) clearTranslation();
                    }}
                    buttonText={TRANSLATION_LANGUAGES.find(l => l.code === sFromLang)?.label || "English"}
                    buttonStyle={{ paddingVertical: 5 }}
                    openUpward={true}
                  />
                  <Image_ icon={ICONS.rightArrowBlue} size={16} style={{ marginHorizontal: 6 }} />
                  <DropdownMenu
                    dataArr={TRANSLATION_LANGUAGES}
                    onSelect={(item) => {
                      _setToLang(item.code);
                      if (sFromLang && item.code && sFromLang !== item.code && sNewMessage.trim()) debouncedTranslate(sNewMessage, item.code);
                      if (!item.code || sFromLang === item.code) clearTranslation();
                    }}
                    buttonText={TRANSLATION_LANGUAGES.find(l => l.code === sToLang)?.label || "English"}
                    buttonStyle={{ paddingVertical: 5 }}
                    openUpward={true}
                  />
                </View>
                <DropdownMenu
                  dataArr={(zSettings?.smsTemplates || zSettings?.textTemplates || [])
                    .filter((t) => t.showInChat !== false)
                    .sort((a, b) => {
                      let aOrd = a.order || 999;
                      let bOrd = b.order || 999;
                      return bOrd - aOrd;
                    })
                    .map((t) => ({ label: t.label || t.name || t.buttonLabel || "Untitled", message: t.content || t.message || t.text || "" }))}
                  onSelect={(item) => {
                    let resolved = resolveTemplate(item.message);
                    _setNewMessage(resolved);
                    isUnmodifiedTemplateRef.current = true;
                    if (sFromLang && sToLang && sFromLang !== sToLang) debouncedTranslate(resolved, sToLang);
                  }}
                  buttonText={"Templates"}
                  buttonStyle={{ paddingVertical: 5, backgroundColor: C.blue }}
                  buttonTextStyle={{ color: "white" }}
                  openUpward={true}
                />
                <Tooltip text="Variables" position="top">
                  <DropdownMenu
                    dataArr={TEXT_TEMPLATE_VARIABLES.map((v) => ({ label: v.label, variable: v.variable }))}
                    onSelect={(item) => handleInsertVariable(resolveTemplate(item.variable))}
                    buttonIcon={ICONS.variable}
                    buttonIconSize={40}
                    buttonStyle={{ alignItems: "center", justifyContent: "center", padding: 6, backgroundColor: "transparent", borderWidth: 0 }}
                    openUpward={true}
                  />
                </Tooltip>
                <Tooltip text="Send Info" position="top">
                  <DropdownMenu
                    dataArr={(() => {
                      let items = [
                        { label: "Send Intake Ticket", key: "workorder" },
                      ];
                      let paymentError = zWorkorderObj?.paymentComplete ? "Already paid" : (!zWorkorderObj?.workorderLines?.length ? "No line items" : (zWorkorderObj?.activeSaleID ? "Active sale in progress" : ""));
                      if (paymentError) {
                        items.push({ label: "Send Payment Link", key: "payment", textColor: C.text, strikethrough: true });
                      } else {
                        items.push({ label: "Send Payment Link", key: "payment" });
                      }
                      if (!zWorkorderObj?.media?.length) {
                        items.push({ label: "Send Media", key: "media", textColor: C.text, strikethrough: true });
                      } else {
                        items.push({ label: "Send Media", key: "media" });
                      }
                      return items;
                    })()}
                    onSelect={(item) => {
                      if (item.key === "workorder") { pendingActionRef.current = "intake"; _setShowReplyModal(true); scheduleAutoSend(() => { _setShowReplyModal(false); handleSendWorkorderTicket(sCanRespond); pendingActionRef.current = null; }); }
                      else if (item.key === "payment") handleSendSMSPayment();
                      else if (item.key === "media") _setShowMediaPicker(true);
                    }}
                    buttonIcon={ICONS.paperPlane}
                    buttonIconSize={35}
                    buttonStyle={{ alignItems: "center", justifyContent: "center", padding: 6, backgroundColor: "transparent", borderWidth: 0 }}
                    openUpward={true}
                  />
                </Tooltip>
                {hasCustomer && !sCustomPhoneMode ? (
                  <Tooltip text="Messages Hub" position="top">
                    <TouchableOpacity
                      onPress={handleEnterHubMode}
                      style={{ alignItems: "center", justifyContent: "center", padding: 6 }}
                    >
                      <Image_ icon={ICONS.cellPhone} size={35} />
                    </TouchableOpacity>
                  </Tooltip>
                ) : null}
                {sCustomPhoneMode ? (
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text style={{ fontSize: 13, color: gray(0.45), marginRight: 8 }}>{formatPhoneWithDashes(sCustomPhone)}</Text>
                    {hasCustomer && (
                      <TouchableOpacity
                        onPress={handleExitCustomPhoneMode}
                        style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: 4, backgroundColor: C.blue }}
                      >
                        <Text style={{ fontSize: 13, color: "white" }}>Back to customer</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ) : null}
              </View>
            </View>
        </View>
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
    </View>
  );
}

function ThreadCard({ thread, isSelected, isHovered, activeWO, onPress, onHoverIn, onHoverOut }) {
  let isIncoming = thread.lastType === "incoming";
  let bgColor = isIncoming ? "rgb(230,230,230)" : "rgb(0,122,255)";
  if (isSelected) bgColor = isIncoming ? "rgb(215,215,215)" : "rgb(0,100,220)";
  else if (isHovered) bgColor = isIncoming ? "rgb(220,220,220)" : "rgb(0,110,235)";
  let textColor = isIncoming ? C.text : "white";
  let subtextColor = isIncoming ? gray(0.35) : "rgba(255,255,255,0.7)";
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
  if (!isIncoming && thread.lastOutgoingMessageStatus) {
    let s = thread.lastOutgoingMessageStatus;
    if (s === "delivered") { deliveryLabel = "Delivered"; deliveryColor = isIncoming ? C.green : "rgba(180,255,180,0.9)"; }
    else if (s === "sent") { deliveryLabel = "Sent"; deliveryColor = subtextColor; }
    else if (s === "failed") { deliveryLabel = "Failed"; deliveryColor = isIncoming ? C.red : "rgb(255,180,180)"; }
    else if (s === "undelivered") { deliveryLabel = "Not Delivered"; deliveryColor = isIncoming ? C.red : "rgb(255,180,180)"; }
    else if (s === "queued" || s === "accepted" || s === "sending") { deliveryLabel = "Sending..."; }
  }

  return (
    <TouchableOpacity onPress={onPress} onMouseEnter={onHoverIn} onMouseLeave={onHoverOut} style={{ paddingVertical: 10, paddingHorizontal: 2, borderBottomWidth: isSelected ? 2 : 1, borderBottomColor: isSelected ? C.orange : gray(0.08), backgroundColor: bgColor, borderWidth: isSelected ? 2 : 0, borderColor: isSelected ? C.orange : "transparent" }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            {!activeWO && <Image_ icon={ICONS.questionMark} size={14} style={{ marginRight: 6 }} />}
            <Text style={{ fontSize: 14, fontWeight: Fonts.weight.textHeavy, color: textColor }}>{formattedPhone}</Text>
          </View>
          {customerName ? (
            <Text style={{ fontSize: 12, color: isIncoming ? C.blue : "rgba(255,255,255,0.85)", marginTop: 2 }} numberOfLines={1}>{customerName}</Text>
          ) : (
            <View style={{ height: 18, marginTop: 2 }} />
          )}
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ fontSize: 11, color: subtextColor }}>{shortDate}</Text>
          <Text style={{ fontSize: 11, color: subtextColor, marginTop: 2 }}>{dateObj?.time || ""}</Text>
          {deliveryLabel ? <Text style={{ fontSize: 10, color: deliveryColor, marginTop: 1 }}>{deliveryLabel}</Text> : null}
        </View>
      </View>
      <View style={{ marginTop: 4 }}>
        <Text numberOfLines={2} style={{ fontSize: 13, color: isIncoming ? gray(0.5) : "rgba(255,255,255,0.85)", flex: 1 }}>{preview}</Text>
      </View>
    </TouchableOpacity>
  );
}

function HubConversationPanel({ phone, thread, previewMode, onShowPhoneEntry, onOpenWorkorder, onOpenWorkorderKeepHub, hasMatchingWorkorder, matchingWorkorders = [], exitHubButton }) {
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
  const [sHubInputHeight, _setHubInputHeight] = useState(36);
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
    _setHubInputHeight(36);
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
    if (!hasInitialScrolledRef.current) return;
    let lastId = sMessages[sMessages.length - 1]?.id;
    if (lastId === lastMsgIdRef.current) return;
    lastMsgIdRef.current = lastId;
    try { messageListRef.current?.scrollToEnd({ animated: true }); } catch (e) {}
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
    _setHubInputHeight(36);
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
  }

  async function handleHubToggleForward() {
    if (!phone || phone.length !== 10) return;
    let currentUser = useLoginStore.getState().getCurrentUser();
    if (!currentUser?.id) return;
    let isCurrentlyForwarding = !!(thread?.forwardTo?.[currentUser.id]);
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
    <View style={{ flex: 1, flexDirection: "column" }}>
      {/* Header */}
      <View style={{ paddingVertical: 8, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: gray(0.1), flexDirection: "row", alignItems: "center" }}>
        <Text style={{ fontSize: 16, fontWeight: Fonts.weight.textHeavy, color: C.text }}>{formatPhoneWithDashes(phone)}</Text>
        <View style={{ flex: 1, alignItems: "center" }}>
          {customerName ? <Text style={{ fontSize: 13, color: C.blue }} numberOfLines={1}>{customerName}</Text>
          : !thread && !sListenerConnecting ? (
            <View style={{ backgroundColor: C.green, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 4 }}>
              <Text style={{ fontSize: 12, color: "white", fontWeight: Fonts.weight.textHeavy }}>New Thread</Text>
            </View>
          ) : sListenerConnecting ? <ActivityIndicator size={16} color="#007bff" /> : null}
        </View>
        <TouchableOpacity
          onPress={(e) => {
            if (matchingWorkorders.length < 1) return;
            if (matchingWorkorders.length === 1) {
              onOpenWorkorderKeepHub(matchingWorkorders[0]);
            } else {
              let nativeEvent = e.nativeEvent || e;
              _setWoDropdown({ x: nativeEvent.pageX || nativeEvent.clientX || 0, y: nativeEvent.pageY || nativeEvent.clientY || 0 });
            }
          }}
          disabled={matchingWorkorders.length < 1}
          style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: 4, marginRight: 6, backgroundColor: C.orange, opacity: matchingWorkorders.length > 0 ? 1 : 0 }}
        >
          <Text style={{ fontSize: 12, color: "white", fontWeight: Fonts.weight.textHeavy }}>Open Workorder</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleLoadMore} disabled={sLoadingMore || sNoMoreHistory} style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: 4, backgroundColor: (sLoadingMore || sNoMoreHistory) ? gray(0.15) : C.blue, opacity: sNoMoreHistory ? 0.4 : 1 }}>
          {sLoadingMore ? <SmallLoadingIndicator /> : <Text style={{ fontSize: 12, color: "white", fontWeight: Fonts.weight.textHeavy }}>Load more</Text>}
        </TouchableOpacity>
      </View>
      {sWoDropdown && createPortal(
        <TouchableWithoutFeedback onPress={() => _setWoDropdown(null)}>
          <View style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 99999 }}>
            <View style={{ position: "absolute", top: sWoDropdown.y, left: sWoDropdown.x, backgroundColor: C.listItemWhite, borderRadius: 8, borderWidth: 2, borderColor: C.buttonLightGreenOutline, minWidth: 240, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 10, overflow: "hidden" }}>
              {matchingWorkorders.map((wo) => (
                <TouchableOpacity
                  key={wo.id}
                  onPress={() => { _setWoDropdown(null); onOpenWorkorderKeepHub(wo); }}
                  style={{ paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: gray(0.1), flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
                >
                  <Text style={{ fontSize: 13, fontWeight: Fonts.weight.textHeavy, color: C.text, flex: 1 }} numberOfLines={1}>
                    {[wo.brand, wo.description].filter(Boolean).join(" ") || "Untitled"}
                  </Text>
                  <View style={{ backgroundColor: C.blue, paddingVertical: 2, paddingHorizontal: 8, borderRadius: 4, marginLeft: 10 }}>
                    <Text style={{ fontSize: 11, color: "white", fontWeight: Fonts.weight.textHeavy }}>{wo.status || "No status"}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableWithoutFeedback>,
        document.body
      )}
      {/* Messages */}
      <View style={{ flex: 1, overflow: "hidden" }}>
        {sMessages.length < 1 && !sListenerConnecting ? (
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
            <Text style={{ fontSize: 16, color: gray(0.25) }}>No messages yet</Text>
          </View>
        ) : sMessages.length < 1 ? null : (
          <FlatList
            ref={messageListRef}
            data={sMessages}
            keyExtractor={(item) => item.id || String(item.millis)}
            renderItem={({ item }) => {
              if (item.type === "incoming") return <IncomingMessageComponent msgObj={item} autoTranslateTo={sFromLang !== sToLang ? sToLang : ""} onScrollToBottom={() => { setTimeout(() => { messageListRef.current?.scrollToEnd({ animated: true }); }, 50); }} />;
              let isLast = (item.id || item.millis) === lastOutgoingID;
              return <OutgoingMessageComponent msgObj={item} isLastOutgoing={isLast} thread={thread} onToggleBlock={handleToggleBlock} onToggleForward={handleHubToggleForward} />;
            }}
            onScrollToIndexFailed={(info) => {
              setTimeout(() => { messageListRef.current?.scrollToEnd({ animated: false }); }, 50);
            }}
            onContentSizeChange={() => {
              if (!hasInitialScrolledRef.current && sMessages.length > 0) {
                hasInitialScrolledRef.current = true;
                lastMsgIdRef.current = sMessages[sMessages.length - 1]?.id;
                messageListRef.current?.scrollToEnd({ animated: false });
              }
            }}
            scrollEnabled={!previewMode}
            scrollEventThrottle={200}
          />
        )}
      </View>
      {/* Compose — hidden in preview mode */}
      {!previewMode && <View style={{ paddingTop: 8, paddingHorizontal: 8 }}>
        {(sFromLang && sToLang && sFromLang !== sToLang) && sNewMessage.trim() ? (
          <View style={{ padding: 6, marginBottom: 4, backgroundColor: "rgb(245,245,220)", borderRadius: 5, borderWidth: 1, borderColor: gray(0.15) }}>
            {translatedText && !sTranslateLoading
              ? <Text style={{ fontSize: 14, color: C.text }}>{translatedText}</Text>
              : <Text style={{ fontSize: 13, color: gray(0.5), fontStyle: "italic" }}>Translating...</Text>
            }
          </View>
        ) : null}
        {sAudioUrl ? (
          <View style={{ padding: 8, marginBottom: 4, backgroundColor: "rgb(245,245,220)", borderRadius: 5, borderWidth: 1, borderColor: gray(0.15) }}>
            <audio controls src={sAudioUrl} style={{ width: "100%" }} />
          </View>
        ) : null}
        <ReplyOptionsBar
          visible={sShowReplyModal}
          forwardReplies={sForwardReplies}
          hasActivePhone={!!phone && phone.length === 10}
          audioMode={pendingActionRef.current === "audio"}
          audioUploading={sAudioUploading}
          onSelectCanRespond={(canRespond) => {
            clearAutoSend();
            _setCanRespond(canRespond);
            _setShowReplyModal(false);
            if (pendingActionRef.current === "audio") { handleSendAudio(canRespond); }
            else { doSend(pendingSendTextRef.current, canRespond); }
          }}
          onSendAudio={() => handleSendAudio(sCanRespond)}
          onDeleteAudio={handleDeleteAudio}
          onToggleForward={handleToggleForwardReplies}
        />
        <View style={{ flexDirection: "row", alignItems: "flex-end", borderWidth: 2, borderRadius: 5, borderColor: gray(0.15), backgroundColor: "white" }}>
          <TextInput
            onChangeText={(val) => {
              val = autoCapitalize(val);
              _setNewMessage(val);
              if (sFromLang && sToLang && sFromLang !== sToLang) debouncedTranslate(val, sToLang);
            }}
            multiline={true}
            placeholder="Message..."
            placeholderTextColor="gray"
            onContentSizeChange={(e) => {
              let h = e?.nativeEvent?.contentSize?.height;
              if (typeof h === "number" && h > 0) {
                _setHubInputHeight(Math.max(36, Math.ceil(h)));
              }
            }}
            style={{
              outlineStyle: "none",
              outlineColor: "transparent",
              outlineWidth: 0,
              borderWidth: 0,
              borderColor: "transparent",
              color: C.text,
              paddingTop: 0,
              paddingBottom: 0,
              paddingLeft: 5,
              paddingRight: 4,
              marginVertical: 8,
              fontSize: 15,
              lineHeight: 20,
              height: sHubInputHeight,
              overflow: "hidden",
              flex: 1,
              textAlignVertical: "top",
            }}
            value={sNewMessage}
          />
          <View style={{ flexDirection: "column", alignItems: "center", justifyContent: "flex-end", marginRight: 4, marginBottom: 4 }}>
            <TouchableOpacity onPress={() => !sHubMediaUploading && !(sFromLang !== sToLang && sTranslateLoading) && handleSend()} style={{ padding: 6, opacity: (sHubMediaUploading || (sFromLang !== sToLang && sTranslateLoading)) ? 0.3 : (sNewMessage.trim() ? 1 : 0.3) }}>
              <Image_ icon={ICONS.airplane} size={41} />
            </TouchableOpacity>
            <Tooltip text={!sHasMicrophone ? "No microphone detected" : sAudioRecording ? "Stop recording" : "Record audio clip"} position="top">
              <TouchableOpacity
                onPress={sHasMicrophone ? (sAudioRecording ? handleStopRecording : handleStartRecording) : undefined}
                style={{ padding: 4, opacity: sHasMicrophone ? 1 : 0.3 }}
              >
                <Image_ icon={sAudioRecording ? ICONS.stopRecord : ICONS.microphone} size={30} />
              </TouchableOpacity>
            </Tooltip>
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8, marginBottom: 8, paddingHorizontal: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <DropdownMenu
              dataArr={TRANSLATION_LANGUAGES}
              onSelect={(item) => {
                _setFromLang(item.code);
                if (item.code && sToLang && item.code !== sToLang && sNewMessage.trim()) debouncedTranslate(sNewMessage, sToLang);
                if (!item.code || item.code === sToLang) clearTranslation();
              }}
              buttonText={TRANSLATION_LANGUAGES.find(l => l.code === sFromLang)?.label || "English"}
              buttonStyle={{ paddingVertical: 5 }}
              openUpward={true}
            />
            <Image_ icon={ICONS.rightArrowBlue} size={16} style={{ marginHorizontal: 6 }} />
            <DropdownMenu
              dataArr={TRANSLATION_LANGUAGES}
              onSelect={(item) => {
                _setToLang(item.code);
                if (sFromLang && item.code && sFromLang !== item.code && sNewMessage.trim()) debouncedTranslate(sNewMessage, item.code);
                if (!item.code || sFromLang === item.code) clearTranslation();
              }}
              buttonText={TRANSLATION_LANGUAGES.find(l => l.code === sToLang)?.label || "Spanish"}
              buttonStyle={{ paddingVertical: 5 }}
              openUpward={true}
            />
          </View>
          <input
            ref={hubFileInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            onChange={handleHubFilesSelected}
            style={{ display: "none" }}
          />
          {matchingWorkorders.length < 1 && (
            <Tooltip text={sHubMediaUploading ? "Uploading..." : "Send photo/video"} position="top">
              <TouchableOpacity
                onPress={() => !sHubMediaUploading && hubFileInputRef.current?.click()}
                style={{ alignItems: "center", justifyContent: "center", padding: 6, opacity: sHubMediaUploading ? 0.4 : 1 }}
              >
                {sHubMediaUploading
                  ? <SmallLoadingIndicator />
                  : <Image_ icon={ICONS.uploadCamera} size={35} />
                }
              </TouchableOpacity>
            </Tooltip>
          )}
          {onShowPhoneEntry && (
            <Tooltip text="New number" position="top">
              <TouchableOpacity
                onPress={() => !sHubMediaUploading && onShowPhoneEntry()}
                onLongPress={async () => {
                  if (sHubMediaUploading) return;
                  const { clearAll } = await import("../../../hubMessageDB");
                  await clearAll();
                  useCustMessagesStore.getState().clearHubConversationCache();
                  log("Hub message cache cleared");
                  alert("Message cache cleared. Refresh to reload.");
                }}
                delayLongPress={1000}
                style={{ padding: 6, opacity: sHubMediaUploading ? 0.3 : 1 }}
              >
                <Image_ icon={ICONS.cellPhone} size={35} />
              </TouchableOpacity>
            </Tooltip>
          )}
          {matchingWorkorders.length > 0 && (
            <Tooltip text="Go to customer" position="top" offsetX={-15}>
              <TouchableOpacity onPress={() => onOpenWorkorder(phone)} style={{ padding: 6 }}>
                <Image_ icon={ICONS.person} size={35} />
              </TouchableOpacity>
            </Tooltip>
          )}
          {exitHubButton}
        </View>
      </View>}
    </View>
  );
}

const INNER_MSG_BOX_STYLE = {
  width: "100%",
  borderRadius: 5,
  paddingHorizontal: 5,
  paddingVertical: 5,
};
const OUTER_MSG_BOX_STYLE = {
  width: "75%",
  marginVertical: 10,
  marginHorizontal: 4,
  // padding: 5,
};

function ZoomCursorHelper({ wrapperRef }) {
  useTransformEffect(({ state }) => {
    if (wrapperRef.current) wrapperRef.current.style.cursor = state.scale > 1 ? "grab" : "default";
  });
  return null;
}

const MESSAGE_TEXT_STYLE = {
  fontSize: 14,
};

const INFO_TEXT_STYLE = {
  fontSize: 11,
  marginTop: 2,
  color: gray(0.6),
};

const MediaThumbnail = memo(({ url, thumbnailUrl, contentType }) => {
  const [sLoading, _setLoading] = useState(true);
  const [sError, _setError] = useState(false);
  const [sFullView, _setFullView] = useState(false);
  const [sFullLoading, _setFullLoading] = useState(true);
  const [sFullDims, _setFullDims] = useState(null);
  const wrapperDivRef = useRef(null);
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
      .catch(() => {
        window.open(url, "_blank");
      });
  }

  return (
    <>
      <TouchableOpacity
        onPress={() => { _setFullView(true); _setFullLoading(true); _setFullDims(null); }}
        style={{ width: 300, height: 300, borderRadius: 4, overflow: "hidden", marginBottom: 4, marginRight: 4, backgroundColor: "rgba(0,0,0,0.05)" }}
      >
        {sError ? (
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
            <Text style={{ fontSize: 11, color: gray(0.5) }}>Image unavailable</Text>
          </View>
        ) : isVideo ? (
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
            <Text style={{ fontSize: 24 }}>&#9654;</Text>
            <Text style={{ fontSize: 11, color: gray(0.4), marginTop: 4 }}>Video</Text>
          </View>
        ) : (
          <>
            <Image
              source={{ uri: thumbnailUrl || url }}
              style={{ width: "100%", height: "100%" }}
              resizeMode="cover"
              onLoad={() => _setLoading(false)}
              onError={() => { _setLoading(false); _setError(true); }}
            />
            {sLoading && (
              <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "center", alignItems: "center" }}>
                <ActivityIndicator size="small" color={gray(0.5)} />
              </View>
            )}
          </>
        )}
      </TouchableOpacity>
      {sFullView && createPortal(
        <div
          onClick={() => _setFullView(false)}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.85)",
            zIndex: 9999,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: sFullDims ? sFullDims.width : "80%",
              height: sFullDims ? sFullDims.height : "80%",
              position: "relative",
              borderRadius: 8,
            }}
          >
            {/* Download button */}
            <div
              onClick={(e) => { e.stopPropagation(); handleDownload(); }}
              style={{
                position: "absolute", top: 8, right: 8, width: 36, height: 36,
                borderRadius: 18, backgroundColor: C.green,
                display: "flex", justifyContent: "center", alignItems: "center",
                cursor: "pointer", zIndex: 2,
              }}
            >
              <span style={{ color: "white", fontSize: 16, fontWeight: "bold", lineHeight: 1 }}>&#8681;</span>
            </div>
            {isVideo ? (
              <video
                src={url}
                controls
                autoPlay
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            ) : (
              <div ref={wrapperDivRef} style={{ width: "100%", height: "100%" }}>
                <TransformWrapper
                  initialScale={1}
                  minScale={1}
                  maxScale={8}
                  centerOnInit={true}
                  wheel={{ step: 0.3 }}
                  panning={{ velocityDisabled: true }}
                  doubleClick={{ disabled: true }}
                >
                  <ZoomCursorHelper wrapperRef={wrapperDivRef} />
                  <TransformComponent
                    wrapperStyle={{ width: "100%", height: "100%" }}
                    contentStyle={{ width: "100%", height: "100%" }}
                  >
                    <img
                      src={url}
                      onLoad={(e) => {
                        _setFullLoading(false);
                        const { naturalWidth, naturalHeight } = e.target;
                        const maxW = window.innerWidth * 0.8;
                        const maxH = window.innerHeight * 0.8;
                        const scale = Math.min(maxW / naturalWidth, maxH / naturalHeight, 1);
                        _setFullDims({ width: Math.round(naturalWidth * scale), height: Math.round(naturalHeight * scale) });
                      }}
                      style={{ width: "100%", height: "100%", objectFit: "contain", userSelect: "none" }}
                      draggable={false}
                    />
                  </TransformComponent>
                </TransformWrapper>
              </div>
            )}
            {sFullLoading && !isVideo && (
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", justifyContent: "center", alignItems: "center", pointerEvents: "none" }}>
                <ActivityIndicator size="large" color="white" />
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
});

const IncomingMessageComponent = memo(({ msgObj, onScrollToBottom, autoTranslateTo }) => {
  const cached = msgObj.translated;
  const [sTranslation, _setTranslation] = useState(cached ? { text: cached.text, loading: false, langCode: cached.langCode, detectedFrom: cached.detectedFrom || "" } : { text: "", loading: false, langCode: "" });
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
  let backgroundColor = hasMedia ? "transparent" : "rgb(230,230,230)";
  let fromLangLabel = sTranslation.detectedFrom
    ? (TRANSLATION_LANGUAGES.find(l => l.code === sTranslation.detectedFrom)?.label || sTranslation.detectedFrom)
    : "";

  return (
    <View style={{ ...OUTER_MSG_BOX_STYLE, alignSelf: "flex-start", marginLeft: 12, width: (msgObj.mediaUrls?.length > 0 || msgObj.imageUrl) && !msgObj.message ? undefined : "75%" }}>
      <View style={{ position: "relative" }}>
        <View style={{ backgroundColor, ...INNER_MSG_BOX_STYLE, borderBottomLeftRadius: 2, width: (msgObj.mediaUrls?.length > 0 || msgObj.imageUrl) && !msgObj.message ? undefined : "100%" }}>
          {msgObj.mediaUrls?.length > 0 ? (
            <View style={{ flexDirection: "column", marginBottom: msgObj.message ? 4 : 0 }}>
              {msgObj.mediaUrls.map((media, i) => (
                <MediaThumbnail key={i} url={media.url} thumbnailUrl={media.thumbnailUrl} contentType={media.contentType} />
              ))}
            </View>
          ) : msgObj.imageUrl ? (
            <MediaThumbnail url={msgObj.imageUrl} contentType="image/" />
          ) : null}
          {msgObj.message ? (
            <Tooltip text="Right click for translation" position="top">
              <View onContextMenu={handleContextMenu} style={{ cursor: "context-menu" }}>
                {sTranslation.loading ? (
                  <>
                    <Text style={{ ...MESSAGE_TEXT_STYLE, color: gray(0.5), fontStyle: "italic" }}>Translating...</Text>
                    <Text style={{ fontSize: 12, color: gray(0.45), fontStyle: "italic", marginTop: 3 }}>{msgObj.message}</Text>
                  </>
                ) : sTranslation.text ? (
                  <>
                    <Text style={{ ...MESSAGE_TEXT_STYLE }}>{sTranslation.text}</Text>
                    <Text style={{ fontSize: 12, color: gray(0.45), fontStyle: "italic", marginTop: 3 }}>
                      {"Original" + (fromLangLabel ? " (" + fromLangLabel + ")" : "") + ": " + msgObj.message}
                    </Text>
                  </>
                ) : (
                  <Text style={{ ...MESSAGE_TEXT_STYLE }}>{msgObj.message}</Text>
                )}
              </View>
            </Tooltip>
          ) : null}
        </View>
        {!hasMedia && <View style={{ position: "absolute", bottom: 0, left: -8, width: 0, height: 0, borderTopWidth: 8, borderTopColor: backgroundColor, borderLeftWidth: 8, borderLeftColor: "transparent" }} />}
      </View>
      <View style={{ width: "100%", flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ ...INFO_TEXT_STYLE }}>{dateObj.date}</Text>
        <Text style={{ ...INFO_TEXT_STYLE }}>{dateObj.dayOfWeek + ", " + dateObj.time}</Text>
      </View>
      {msgObj.autoResponseSent && (
        <Text style={{ fontSize: 10, color: gray(0.5), fontStyle: "italic" }}>Auto-response sent (thread was closed)</Text>
      )}
      {sContextMenu.visible && createPortal(
        <div onMouseDown={(e) => e.stopPropagation()} style={{ position: "fixed", left: sContextMenu.x, bottom: window.innerHeight - sContextMenu.y, zIndex: 99999, backgroundColor: "white", borderRadius: 8, boxShadow: "0 3px 16px rgba(0,0,0,0.22)", padding: 6, minWidth: 160 }}>
          <div style={{ padding: "5px 12px", fontSize: 11, fontWeight: "600", color: gray(0.45), textTransform: "uppercase", letterSpacing: 0.5 }}>Translate to</div>
          {TRANSLATION_LANGUAGES.map((lang) => (
            <div
              key={lang.code}
              onClick={() => doTranslate(lang.code)}
              style={{ padding: "9px 14px", cursor: "pointer", borderRadius: 5, fontSize: 15, fontWeight: "500", color: C.text }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = C.blue; e.currentTarget.style.color = "white"; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = C.text; }}
            >
              {lang.label}
            </div>
          ))}
        </div>,
        document.body
      )}
    </View>
  );
});

const OutgoingMessageComponent = memo(({ msgObj, isLastOutgoing, thread, onToggleBlock, onToggleForward }) => {
  // Use live delivery status from thread parent doc for the last outgoing message
  let displayStatus = msgObj.status;
  if (isLastOutgoing && thread?.lastOutgoingMessageID === msgObj.id && thread?.lastOutgoingMessageStatus) {
    displayStatus = thread.lastOutgoingMessageStatus;
  }
  let dateObj = formatDateTimeForReceipt(null, msgObj.millis);
  let isFailed = displayStatus === "failed" || displayStatus === "undelivered";
  let hasMedia = msgObj.mediaUrls?.length > 0 || !!msgObj.imageUrl;
  let backgroundColor = hasMedia ? "transparent" : (isFailed ? "rgb(200,80,80)" : "rgb(0,122,255)");
  let showStatusIcons = isLastOutgoing;
  // Check if current user has forwarding enabled on the thread parent doc
  let currentUserID = useLoginStore.getState().getCurrentUser()?.id;
  let isForwarding = !!(currentUserID && thread?.forwardTo?.[currentUserID]);
  let isResponding = (thread?.canRespond !== undefined ? thread.canRespond : msgObj.canRespond);
  return (
    <View style={{ ...OUTER_MSG_BOX_STYLE, alignSelf: "flex-end", marginRight: 12, width: (msgObj.mediaUrls?.length > 0 || msgObj.imageUrl) && !msgObj.message ? undefined : "75%" }}>
      <View style={{ position: "relative" }}>
        <View style={{ backgroundColor, ...INNER_MSG_BOX_STYLE, borderBottomRightRadius: 2, flexDirection: "row", alignItems: "flex-start", width: (msgObj.mediaUrls?.length > 0 || msgObj.imageUrl) && !msgObj.message ? undefined : "100%" }}>
          {showStatusIcons && (
            <View style={{ flexDirection: "column", alignItems: "center", marginRight: 5, marginTop: 2 }}>
              <Tooltip text={isResponding ? "Block responses from user" : "Allow responses"} position="top">
                <TouchableOpacity onPress={onToggleBlock} style={{ alignItems: "center", justifyContent: "center" }}>
                  <Image source={isResponding ? ICONS.unblock : ICONS.blocked} style={{ width: 35, height: 35 }} />
                </TouchableOpacity>
              </Tooltip>
              <Tooltip text={isForwarding ? "Stop forwarding replies to me" : "Forward replies to me"} position="top">
                <TouchableOpacity onPress={onToggleForward} style={{ alignItems: "center", justifyContent: "center", marginTop: 4 }}>
                  <Image source={isForwarding ? ICONS.allowNotif : ICONS.blockNotif} style={{ width: 28, height: 28 }} />
                </TouchableOpacity>
              </Tooltip>
            </View>
          )}
          <View style={{ flex: 1 }}>
            {msgObj.mediaUrls?.length > 0 ? (
              <View style={{ flexDirection: "column", marginBottom: msgObj.message ? 4 : 0 }}>
                {msgObj.mediaUrls.map((media, i) => (
                  <MediaThumbnail key={i} url={media.url} thumbnailUrl={media.thumbnailUrl} contentType={media.contentType} />
                ))}
              </View>
            ) : msgObj.imageUrl ? (
              <MediaThumbnail url={msgObj.imageUrl} contentType="image/" />
            ) : null}
            {msgObj.message ? (
              <Text style={{ ...MESSAGE_TEXT_STYLE, color: "white" }}>{msgObj.message}</Text>
            ) : null}
            {msgObj.originalMessage ? (
              <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", fontStyle: "italic", marginTop: 3 }}>
                {"Original" + (msgObj.translatedFrom ? " (" + (TRANSLATION_LANGUAGES.find(l => l.code === msgObj.translatedFrom)?.label || msgObj.translatedFrom) + ")" : "") + ": " + msgObj.originalMessage}
              </Text>
            ) : null}
          </View>
        </View>
        {!hasMedia && <View style={{ position: "absolute", bottom: 0, right: -8, width: 0, height: 0, borderTopWidth: 8, borderTopColor: backgroundColor, borderRightWidth: 8, borderRightColor: "transparent" }} />}
      </View>
      <View
        style={{
          width: "100%",
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Text style={{ ...INFO_TEXT_STYLE }}>
          {dateObj.dayOfWeek + ", " + dateObj.time}
        </Text>
        {(displayStatus === "sending" || displayStatus === "queued" || displayStatus === "accepted") && (
          <Text style={{ fontSize: 10, color: gray(0.5), fontStyle: "italic" }}>Sending...</Text>
        )}
        {displayStatus === "sent" && (
          <Text style={{ fontSize: 10, color: C.blue }}>Sent</Text>
        )}
        {displayStatus === "delivered" && (
          <Text style={{ fontSize: 10, color: C.green }}>Delivered</Text>
        )}
        {displayStatus === "undelivered" && (
          <Text style={{ fontSize: 10, color: C.red }}>Not Delivered</Text>
        )}
        {displayStatus === "failed" && (
          <Text style={{ fontSize: 10, color: C.red }}>Failed{msgObj.errorMessage ? ": " + msgObj.errorMessage : ""}</Text>
        )}
        <Text style={{ ...INFO_TEXT_STYLE }}>{dateObj.date}</Text>
      </View>
    </View>
  );
});

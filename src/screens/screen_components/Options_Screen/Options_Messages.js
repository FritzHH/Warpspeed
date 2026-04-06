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
  combine2ArraysOrderByMillis,
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
} from "../../../stores";
import { smsService } from "../../../data_service_modules";
import { DEBOUNCE_DELAY, build_db_path } from "../../../constants";
import { dbUploadPDFAndSendSMS, dbCreateTextToPayInvoice, dbListenToNewMessages, dbGetCustomerMessages, dbUpdateMessageCanRespond } from "../../../db_calls_wrapper";
import { WorkorderMediaModal } from "../modal_screens/WorkorderMediaModal";
import { TransformWrapper, TransformComponent, useTransformEffect } from "react-zoom-pan-pinch";


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

// Module-level auto-send timer — survives component unmount
let _autoSendTimer = null;
let _autoSendThunk = null;
function scheduleAutoSend(thunk) {
  clearAutoSend();
  _autoSendThunk = thunk;
  _autoSendTimer = setTimeout(() => {
    if (_autoSendThunk) _autoSendThunk();
    _autoSendThunk = null;
    _autoSendTimer = null;
  }, 10000);
}
function clearAutoSend() {
  if (_autoSendTimer) clearTimeout(_autoSendTimer);
  _autoSendTimer = null;
  _autoSendThunk = null;
}

export function MessagesComponent({}) {
  // getters ///////////////////////////////////////////////////////////////
  const zWorkorderObj = useOpenWorkordersStore((state) =>
    state.workorders.find((o) => o.id === state.openWorkorderID) || null
  );
  const zCustomer = zWorkorderObj?.customerID
    ? { id: zWorkorderObj.customerID, first: zWorkorderObj.customerFirst, last: zWorkorderObj.customerLast, customerCell: zWorkorderObj.customerCell }
    : CUSTOMER_PROTO;
  const zSettings = useSettingsStore((state) => state.settings);
  const zIncomingMessagesArr = useCustMessagesStore(
    (state) => state.incomingMessages
  );
  const zOutgoingMessagesArr = useCustMessagesStore(
    (state) => state.outgoingMessages
  );
  const zMessagesLoading = useCustMessagesStore((state) => state.messagesLoading);
  const zMessagesLoadingMore = useCustMessagesStore((state) => state.messagesLoadingMore);
  const zMessagesHasMore = useCustMessagesStore((state) => state.messagesHasMore);
  //////////////////////////////////////////////////////////////////////////

  // Clear hasNewSMS flag when messages are viewed
  useEffect(() => {
    if (zWorkorderObj?.hasNewSMS) {
      useOpenWorkordersStore.getState().setField("hasNewSMS", false, zWorkorderObj.id);
    }
  }, [zWorkorderObj?.hasNewSMS, zWorkorderObj?.id]);

  const [sNewMessage, _setNewMessage] = useState("");
  const [sCanRespond, _setCanRespond] = useState(false);
  const [sInputHeight, _setInputHeight] = useState(36);
  const [sTranslateActive, _setTranslateActive] = useState(false);
  const [sShowMediaPicker, _setShowMediaPicker] = useState(false);
  const [sCustomPhoneMode, _setCustomPhoneMode] = useState(false);
  const [sShowReplyModal, _setShowReplyModal] = useState(false);
  const [sCustomPhone, _setCustomPhone] = useState("");
  const [sCustomPhoneMessages, _setCustomPhoneMessages] = useState([]);
  const [sForwardReplies, _setForwardReplies] = useState(false);
  const textInputRef = useRef("");
  const messageListRef = useRef(null);
  const debounceTimerRef = useRef(null);
  const cursorPositionRef = useRef(0);
  const pendingActionRef = useRef(null);
  const userOverrodeForwardRef = useRef(false);
  const userOverrodeCanRespondRef = useRef(false);

  const {
    translatedText, isEnToEs, isLoading: sTranslateLoading,
    targetLang, debouncedTranslate, flipDirection, doTranslate, clearTranslation,
  } = useTranslation({ defaultDirection: "es-to-en" });

  // Debounced handler for message input
  const handleMessageChange = useCallback((val) => {
    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Cap at 10,000 characters
    if (val.length > 10000) val = val.slice(0, 10000);

    // Update state immediately for responsive UI
    _setNewMessage(val);
    if (sShowReplyModal) { _setShowReplyModal(false); clearAutoSend(); }

    // Imperative height adjustment — reset to 0 then measure scrollHeight so it shrinks on delete
    if (textInputRef.current) {
      const node = textInputRef.current;
      node.style.height = "0px";
      const h = Math.max(36, Math.ceil(node.scrollHeight));
      node.style.height = h + "px";
      _setInputHeight(h);
    }

    // Trigger translation if active
    if (sTranslateActive) {
      debouncedTranslate(val, targetLang);
    }

    // Debounce any side effects (if needed in future)
    debounceTimerRef.current = setTimeout(() => {
      // Any debounced logic can go here
      // Currently just using for debouncing the state update itself
    }, DEBOUNCE_DELAY);
  }, [sTranslateActive, debouncedTranslate, targetLang]);

  // Load more messages on scroll to top (pagination)
  const loadMoreMessages = useCallback(() => {
    let msgStore = useCustMessagesStore.getState();
    if (msgStore.messagesLoadingMore || !msgStore.messagesHasMore || !msgStore.messagesPhone) return;
    let cursor = msgStore.messagesNextCursor;
    if (!cursor) return;
    msgStore.setMessagesLoadingMore(true);
    dbGetCustomerMessages(msgStore.messagesPhone, cursor, 10).then((result) => {
      if (!result.success) {
        useCustMessagesStore.getState().setMessagesLoadingMore(false);
        return;
      }
      let store = useCustMessagesStore.getState();
      store.prependMessages(result.messages);
      store.setMessagesHasMore(result.hasMore);
      store.setMessagesNextCursor(result.nextPageTimestamp);
      store.setMessagesLoadingMore(false);
    }).catch(() => {
      useCustMessagesStore.getState().setMessagesLoadingMore(false);
    });
  }, []);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Custom phone mode: fetch last 7 messages then listen for new ones
  useEffect(() => {
    if (!sCustomPhoneMode || sCustomPhone.length !== 10) {
      _setCustomPhoneMessages([]);
      return;
    }
    let unsub = null;
    let cancelled = false;
    dbGetCustomerMessages(sCustomPhone, null, 7).then((result) => {
      if (cancelled) return;
      if (!result.success) return;
      _setCustomPhoneMessages(result.messages.sort((a, b) => (a.millis || 0) - (b.millis || 0)));
      let lastMillis = 0;
      result.messages.forEach((m) => { if (m.millis > lastMillis) lastMillis = m.millis; });
      if (!lastMillis) lastMillis = Date.now();
      unsub = dbListenToNewMessages(sCustomPhone, lastMillis, (newMessages) => {
        if (cancelled) return;
        _setCustomPhoneMessages((prev) => {
          let existingIDs = new Set(prev.map((m) => m.id));
          let fresh = newMessages.filter((m) => !existingIDs.has(m.id));
          if (!fresh.length) return prev;
          return [...prev, ...fresh].sort((a, b) => (a.millis || 0) - (b.millis || 0));
        });
      });
    }).catch(() => { });
    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, [sCustomPhoneMode, sCustomPhone]);

  // log("res", sCanRespond);
  useEffect(() => {
    try {
      let arr = combine2ArraysOrderByMillis(
        zIncomingMessagesArr,
        zOutgoingMessagesArr
      );

      let lastOutgoing = [...zOutgoingMessagesArr].sort((a, b) => (b.millis || 0) - (a.millis || 0))[0];
      if (lastOutgoing) {
        if (!userOverrodeCanRespondRef.current) {
          _setCanRespond(!lastOutgoing.senderUserObj || !!lastOutgoing.canRespond);
        }
        if (!userOverrodeForwardRef.current) {
          const currentUser = useLoginStore.getState().getCurrentUser();
          let fwd = lastOutgoing.forwardTo;
          _setForwardReplies(!!fwd && fwd.userID === currentUser?.id && !!fwd.enable);
        }
      }

      if (arr.length - 1 > 0) {
        messageListRef.current?.scrollToIndex({
          index: arr.length - 1,
          animated: true,
        });
      }
    } catch (e) {}
  }, [zIncomingMessagesArr, zOutgoingMessagesArr]);

  // Auto-scroll custom phone messages to bottom
  useEffect(() => {
    try {
      if (!sCustomPhoneMode || sCustomPhoneMessages.length < 1) return;

      // Derive canRespond and forward replies state from last outgoing message
      let lastOutgoing = sCustomPhoneMessages.filter(m => m.type === "outgoing").sort((a, b) => (b.millis || 0) - (a.millis || 0))[0];
      if (lastOutgoing) {
        if (!userOverrodeCanRespondRef.current) {
          _setCanRespond(!lastOutgoing.senderUserObj || !!lastOutgoing.canRespond);
        }
        if (!userOverrodeForwardRef.current) {
          const currentUser = useLoginStore.getState().getCurrentUser();
          let fwd = lastOutgoing.forwardTo;
          _setForwardReplies(!!fwd && fwd.userID === currentUser?.id && !!fwd.enable);
        }
      }

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
    if (sTranslateActive) debouncedTranslate(newMessage, targetLang);
  }

  function handleToggleTranslate() {
    let newActive = !sTranslateActive;
    _setTranslateActive(newActive);
    if (newActive && sNewMessage.trim()) debouncedTranslate(sNewMessage, targetLang);
    if (!newActive) clearTranslation();
  }

  function handleFlipDirection() {
    flipDirection();
    let newTarget = isEnToEs ? "en" : "es";
    if (sTranslateActive && sNewMessage.trim()) doTranslate(sNewMessage, newTarget);
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
      } else {
        sendMessage(sNewMessage, "", true, true);
      }
    }
  }

  function buildForwardToPayload(forwardOverride) {
    const currentUser = useLoginStore.getState().getCurrentUser();
    if (!currentUser?.id) return null;
    let shouldForward = forwardOverride !== undefined ? forwardOverride : sForwardReplies;
    if (shouldForward) {
      if (!currentUser.phone) return null;
      return { userID: currentUser.id, phone: currentUser.phone, first: currentUser.first || "", enable: true };
    }
    return { userID: currentUser.id, enable: false };
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
      let forwardTo = buildForwardToPayload(forwardOverride);
      userOverrodeForwardRef.current = false;
      userOverrodeCanRespondRef.current = false;
      _setNewMessage("");
      _setInputHeight(36);
      _setShowReplyModal(false);
      clearTranslation();

      let chunks = splitIntoChunks(text || "");
      let anyFailed = false;
      let lastError = "";

      for (let i = 0; i < chunks.length; i++) {
        let isLastChunk = i === chunks.length - 1;
        let msg = { ...SMS_PROTO };
        msg.message = chunks[i];
        msg.imageUrl = i === 0 ? imageUrl : "";
        msg.phoneNumber = sendPhone;
        msg.firstName = sCustomPhoneMode ? "" : zCustomer.first;
        msg.lastName = sCustomPhoneMode ? "" : zCustomer.last;
        msg.canRespond = isLastChunk && useCanRespond ? new Date().getTime() : null;
        msg.millis = new Date().getTime() + i;
        msg.customerID = sCustomPhoneMode ? "" : zCustomer.id;
        msg.id = crypto.randomUUID();
        msg.type = "outgoing";
        msg.senderUserObj = zCurrentUserObj;
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
      let canRespondMillis = canRespondVal ? new Date().getTime() : null;
      let forwardTo = buildForwardToPayload(forwardOverride);
      let result = await dbUploadPDFAndSendSMS({
        base64,
        storagePath,
        message,
        phoneNumber: zCustomer.customerCell,
        customerID: zCustomer.id,
        messageID,
        canRespond: canRespondMillis,
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
          canRespond: canRespondMillis,
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
    sendMessage(mediaItem.url, mediaItem.url);
  }
  ///////////////////////////////////////////////////////////////
  /////////////////////////////////////////////////////////////////

  // Determine active phone and message source based on mode
  const hasCustomer = !!zCustomer?.id && !!zCustomer?.customerCell;
  const activePhone = sCustomPhoneMode ? sCustomPhone : zCustomer?.customerCell;
  const isCustomPhoneReady = sCustomPhoneMode && sCustomPhone.length === 10;

  let messagesArr;
  if (sCustomPhoneMode) {
    messagesArr = sCustomPhoneMessages;
  } else {
    messagesArr = combine2ArraysOrderByMillis(
      zIncomingMessagesArr,
      zOutgoingMessagesArr
    );
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
    let outgoing = (sCustomPhoneMode ? sCustomPhoneMessages : zOutgoingMessagesArr).filter(m => m.type === "outgoing");
    if (!outgoing.length) return;
    let sorted = [...outgoing].sort((a, b) => (b.millis || 0) - (a.millis || 0));
    let lastOutgoing = sorted[0];
    if (!lastOutgoing?.id) return;
    let newCanRespond = sCanRespond ? null : new Date().getTime();
    let result = await dbUpdateMessageCanRespond(phone, lastOutgoing.id, newCanRespond);
    if (result.success) {
      userOverrodeCanRespondRef.current = true;
      _setCanRespond(!sCanRespond);
      useCustMessagesStore.getState().updateMessageField(lastOutgoing.id, "canRespond", newCanRespond);
    }
  }

  // Whether the compose area should show
  const hasActivePhone = sCustomPhoneMode ? sCustomPhone.length === 10 : !!zCustomer?.customerCell;

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
                const wait = new Promise((resolve) => setTimeout(resolve, 50));
                wait.then(() => {
                  messageListRef.current?.scrollToIndex({
                    index: info.index,
                    animated: true,
                  });
                });
              }}
              ref={messageListRef}
              data={messagesArr}
              renderItem={(item) => {
                let idx = item.index;
                item = item.item;
                if (item.type === "incoming")
                  return <IncomingMessageComponent msgObj={item} />;
                return <OutgoingMessageComponent msgObj={item} />;
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
                  style={{ marginLeft: 12, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 4, borderWidth: 1, borderColor: C.blue }}
                >
                  <Text style={{ fontSize: 13, color: C.blue }}>Back to customer</Text>
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
          {sTranslateActive && (translatedText || sTranslateLoading) ? (
            <View style={{
              padding: 6, marginBottom: 4, backgroundColor: "rgb(245,245,220)",
              borderRadius: 5, borderWidth: 1, borderColor: gray(0.15),
            }}>
              {sTranslateLoading
                ? <Text style={{ fontSize: 13, color: gray(0.5), fontStyle: "italic" }}>Translating...</Text>
                : <Text style={{ fontSize: 14, color: C.text }}>{translatedText}</Text>
              }
            </View>
          ) : null}
            <View style={{ width: "100%" }}>

              {sShowReplyModal && (
                <View style={{ width: '100%', justifyContent: "space-between", flexDirection: 'row', marginBottom: 4, backgroundColor: 'orange', padding: 10, borderRadius: 6 }}>
                  {/**install an indicator here showing countdown to auto-send */}
                  <View style={{ alignItems: 'flex-start' }}><Text style={{ color: 'dimgray' }}>Auto-sending in 10 seconds</Text></View>
                  <View style={{ alignItems: 'flex-end' }}>

                    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 10 }}>
                      <Text style={{ fontSize: 15, color: 'dimgray', fontWeight: "500", marginRight: 10 }}>Can reply?</Text>
                      <TouchableOpacity_
                        onPress={() => { clearAutoSend(); _setCanRespond(true); _setShowReplyModal(false); if (pendingActionRef.current === "intake") { handleSendWorkorderTicket(true); pendingActionRef.current = null; } else { sendMessage(sNewMessage, "", true); } }}
                        style={{ padding: 10, marginRight: 6 }}
                        hoverOpacity={0.5}
                      >
                        <Image_ icon={ICONS.check} size={70} />
                      </TouchableOpacity_>
                      <TouchableOpacity_
                        onPress={() => { clearAutoSend(); _setCanRespond(false); _setShowReplyModal(false); if (pendingActionRef.current === "intake") { handleSendWorkorderTicket(false); pendingActionRef.current = null; } else { sendMessage(sNewMessage, "", false); } }}
                        style={{ padding: 10 }}
                        hoverOpacity={0.5}
                      >
                        <Image_ icon={ICONS.redx} size={70} />
                      </TouchableOpacity_>
                    </View>
                    <CheckBox_
                      text={"Forward replies to me"}
                      isChecked={sForwardReplies}
                      onCheck={handleToggleForwardReplies}
                      enabled={hasActivePhone}
                      textStyle={{ fontSize: 17, color: C.text }}
                      enableMouseOver={true}
                    />
                  </View>
                </View>
              )}
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
                <View style={{ position: "relative" }}>
                  <TouchableOpacity
                    onPress={() => { if (sNewMessage.trim()) { _setShowReplyModal(true); scheduleAutoSend(() => { _setShowReplyModal(false); sendMessage(sNewMessage, "", sCanRespond); }); } }}
                    style={{ marginRight: 4, marginBottom: 4, padding: 6, opacity: sNewMessage.trim() ? 1 : 0.3 }}
                  >
                    <Image_ icon={ICONS.airplane} size={41} />
                  </TouchableOpacity>
                </View>
              </View>
          </View>
            <View style={{ width: "100%", marginTop: 10, paddingHorizontal: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <CheckBox_
                  text={"Translate"}
                  isChecked={sTranslateActive}
                  onCheck={handleToggleTranslate}
                />
                <DropdownMenu
                  dataArr={(zSettings?.smsTemplates || zSettings?.textTemplates || []).map((t) => ({ label: t.label || t.name || t.buttonLabel || "Untitled", message: t.content || t.message || t.text || "" }))}
                  onSelect={(item) => {
                    let resolved = resolveTemplate(item.message);
                    _setNewMessage(resolved);
                    if (sTranslateActive) debouncedTranslate(resolved, targetLang);
                  }}
                  buttonText={"Templates"}
                  buttonStyle={{ paddingVertical: 5 }}
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
                <Tooltip text={sCanRespond ? "Block response" : "Allow responses from user"} position="top">
                  <TouchableOpacity
                    onPress={handleToggleBlockResponses}
                    style={{ alignItems: "center", justifyContent: "center", padding: 6 }}
                  >
                    <Image_ icon={sCanRespond ? ICONS.unblock : ICONS.blocked} size={35} />
                  </TouchableOpacity>
                </Tooltip>
                {hasCustomer && !sCustomPhoneMode ? (
                  <Tooltip text="Number entry" position="top">
                    <TouchableOpacity
                      onPress={handleEnterCustomPhoneMode}
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
                        style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: 4, borderWidth: 1, borderColor: C.blue }}
                      >
                        <Text style={{ fontSize: 13, color: C.blue }}>Back to customer</Text>
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
        />
      )}
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
  width: "60%",
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
};

const MediaThumbnail = memo(({ url, thumbnailUrl, contentType }) => {
  const [sLoading, _setLoading] = useState(true);
  const [sError, _setError] = useState(false);
  const [sFullView, _setFullView] = useState(false);
  const [sFullLoading, _setFullLoading] = useState(true);
  const wrapperDivRef = useRef(null);
  const isVideo = (contentType || "").startsWith("video/");

  function handleDownload() {
    const a = document.createElement("a");
    a.href = url;
    a.download = url.split("/").pop() || "download";
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return (
    <>
      <TouchableOpacity
        onPress={() => { _setFullView(true); _setFullLoading(true); }}
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
              width: "80%",
              height: "80%",
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
                      onLoad={() => _setFullLoading(false)}
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

const IncomingMessageComponent = memo(({ msgObj }) => {
  let dateObj = formatDateTimeForReceipt(null, msgObj.millis);
  let backgroundColor = "lightgray";
  return (
    <View style={{ ...OUTER_MSG_BOX_STYLE, alignSelf: "flex-start", width: (msgObj.mediaUrls?.length > 0 || msgObj.imageUrl) && !msgObj.message ? undefined : "60%" }}>
      <View style={{ backgroundColor, ...INNER_MSG_BOX_STYLE, width: (msgObj.mediaUrls?.length > 0 || msgObj.imageUrl) && !msgObj.message ? undefined : "100%" }}>
        {msgObj.mediaUrls?.length > 0 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: msgObj.message ? 4 : 0 }}>
            {msgObj.mediaUrls.map((media, i) => (
              <MediaThumbnail key={i} url={media.url} thumbnailUrl={media.thumbnailUrl} contentType={media.contentType} />
            ))}
          </View>
        ) : msgObj.imageUrl ? (
          <MediaThumbnail url={msgObj.imageUrl} contentType="image/" />
        ) : null}
        {msgObj.message ? (
          <Text style={{ ...MESSAGE_TEXT_STYLE }}>{msgObj.message}</Text>
        ) : null}
      </View>
      <View
        style={{
          width: "100%",
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        <Text style={{ ...INFO_TEXT_STYLE }}>{dateObj.date}</Text>
        <Text style={{ ...INFO_TEXT_STYLE }}>
          {dateObj.dayOfWeek + ", " + dateObj.time}
        </Text>
      </View>
      {msgObj.autoResponseSent && (
        <Text style={{ fontSize: 10, color: gray(0.5), fontStyle: "italic" }}>Auto-response sent (thread was closed)</Text>
      )}
    </View>
  );
});

const OutgoingMessageComponent = memo(({ msgObj }) => {
  let dateObj = formatDateTimeForReceipt(null, msgObj.millis);
  let backgroundColor = msgObj.status === "failed" ? "rgb(200,80,80)" : "rgb(0,122,255)";
  return (
    <View style={{ ...OUTER_MSG_BOX_STYLE, alignSelf: "flex-end", width: (msgObj.mediaUrls?.length > 0 || msgObj.imageUrl) && !msgObj.message ? undefined : "60%" }}>
      <View style={{ backgroundColor, ...INNER_MSG_BOX_STYLE, width: (msgObj.mediaUrls?.length > 0 || msgObj.imageUrl) && !msgObj.message ? undefined : "100%" }}>
        {msgObj.mediaUrls?.length > 0 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: msgObj.message ? 4 : 0 }}>
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
        {msgObj.status === "sending" && (
          <Text style={{ fontSize: 10, color: gray(0.5), fontStyle: "italic" }}>Sending...</Text>
        )}
        {msgObj.status === "sent" && (
          <Text style={{ fontSize: 10, color: C.green }}>Sent</Text>
        )}
        {msgObj.status === "failed" && (
          <Text style={{ fontSize: 10, color: C.red }}>Failed{msgObj.errorMessage ? ": " + msgObj.errorMessage : ""}</Text>
        )}
        <Text style={{ ...INFO_TEXT_STYLE }}>{dateObj.date}</Text>
      </View>
    </View>
  );
});

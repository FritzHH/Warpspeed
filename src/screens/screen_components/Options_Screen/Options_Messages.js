/* eslint-disable */

import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Image,
} from "react-native-web";
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
import { dbUploadPDFAndSendSMS, dbCreateTextToPayInvoice, dbListenToCustomerMessages, dbToggleSMSForwarding, dbGetConversationForwardState, dbGetCustomerMessages } from "../../../db_calls_wrapper";
import { WorkorderMediaModal } from "../modal_screens/WorkorderMediaModal";
import { sendSaleReceipt } from "../modal_screens/newCheckoutModalScreen/newCheckoutUtils";

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

  // Clear hasNewSMS flag when messages are viewed, and refresh messages
  useEffect(() => {
    if (zWorkorderObj?.hasNewSMS) {
      useOpenWorkordersStore.getState().setField("hasNewSMS", false, zWorkorderObj.id);
      // Re-fetch latest messages to pick up the new incoming SMS
      let phone = zWorkorderObj.customerCell;
      if (phone && phone.length === 10 && !sCustomPhoneMode) {
        let msgStore = useCustMessagesStore.getState();
        msgStore.setMessagesPhone(phone);
        msgStore.setMessagesLoading(true);
        dbGetCustomerMessages(phone, null, 7).then((result) => {
          if (!result.success || useCustMessagesStore.getState().getMessagesPhone() !== phone) {
            useCustMessagesStore.getState().setMessagesLoading(false);
            return;
          }
          let store = useCustMessagesStore.getState();
          store.setIncomingMessages(result.messages.filter((m) => m.type === "incoming"));
          store.setOutgoingMessages(result.messages.filter((m) => m.type !== "incoming"));
          store.setMessagesHasMore(result.hasMore);
          store.setMessagesNextCursor(result.nextPageTimestamp);
          store.setMessagesLoading(false);
        }).catch(() => {
          useCustMessagesStore.getState().setMessagesLoading(false);
        });
      }
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
  const forwardLoadedPhoneRef = useRef(null);

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

    // Update state immediately for responsive UI
    _setNewMessage(val);
    if (sShowReplyModal) _setShowReplyModal(false);

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

  // Custom phone mode: listen to message thread for the entered phone number
  useEffect(() => {
    if (!sCustomPhoneMode || sCustomPhone.length !== 10) {
      _setCustomPhoneMessages([]);
      return;
    }
    const unsubscribe = dbListenToCustomerMessages(sCustomPhone, (messages) => {
      if (messages) {
        _setCustomPhoneMessages(messages);
      }
    });
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [sCustomPhoneMode, sCustomPhone]);

  // log("res", sCanRespond);
  useEffect(() => {
    // Load forwarding state once per phone number change
    const phone = sCustomPhoneMode ? sCustomPhone : zCustomer?.customerCell;
    if (phone && phone.length === 10 && phone !== forwardLoadedPhoneRef.current) {
      forwardLoadedPhoneRef.current = phone;
      const currentUser = useLoginStore.getState().getCurrentUser();
      if (currentUser?.id) {
        dbGetConversationForwardState(phone, currentUser.id).then(isForwarding => {
          _setForwardReplies(isForwarding);
        });
      }
    }
    try {
      let arr = combine2ArraysOrderByMillis(
        zIncomingMessagesArr,
        zOutgoingMessagesArr
      );

      let lastMessage = arr[arr.length - 1];
      console.log(lastMessage);
      if (!lastMessage.senderUserObj || lastMessage.canRespond) {
        _setCanRespond(true);
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
      if (!sCustomPhoneMode || sCustomPhoneMessages.length < 2) return;
      messageListRef.current?.scrollToIndex({
        index: sCustomPhoneMessages.length - 1,
        animated: true,
      });
    } catch (e) {}
  }, [sCustomPhoneMessages]);

  function handleInsertVariable(variableStr) {
    let cursorPos = cursorPositionRef.current ?? sNewMessage.length;
    let before = sNewMessage.slice(0, cursorPos);
    let after = sNewMessage.slice(cursorPos);
    let newMessage = before + variableStr + after;
    _setNewMessage(newMessage);
    cursorPositionRef.current = cursorPos + variableStr.length;
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

  async function handleToggleForwardReplies() {
    const phone = sCustomPhoneMode ? sCustomPhone : zCustomer?.customerCell;
    if (!phone || phone.length !== 10) return;
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
    const newState = !sForwardReplies;
    _setForwardReplies(newState);
    const result = await dbToggleSMSForwarding(phone, currentUser.id, newState, currentUser.phone, currentUser.first);
    if (!result.success) _setForwardReplies(!newState);
  }

  async function sendMessage(text, imageUrl = "") {
    if ((!text || !text.trim()) && !imageUrl) return;
    let sendPhone = sCustomPhoneMode ? sCustomPhone : zCustomer.customerCell;
    if (!sendPhone || sendPhone.length !== 10) return;
    useLoginStore.getState().requireLogin(async () => {
      let zCurrentUserObj = useLoginStore.getState().getCurrentUser();
      let msg = { ...SMS_PROTO };
      msg.message = text || "";
      msg.imageUrl = imageUrl;
      msg.phoneNumber = sendPhone;
      msg.firstName = sCustomPhoneMode ? "" : zCustomer.first;
      msg.lastName = sCustomPhoneMode ? "" : zCustomer.last;
      msg.canRespond = sCanRespond ? new Date().getTime() : null;
      msg.millis = new Date().getTime();
      msg.customerID = sCustomPhoneMode ? "" : zCustomer.id;
      msg.id = crypto.randomUUID();
      msg.type = "outgoing";
      msg.senderUserObj = zCurrentUserObj;
      _setNewMessage("");
      _setInputHeight(36);
      _setShowReplyModal(true);
      clearTranslation();
      // Optimistically add message to local list in custom phone mode
      if (sCustomPhoneMode) {
        _setCustomPhoneMessages(prev => [...prev, { ...msg, status: "sending" }]);
      }
      let result = await smsService.send(msg);
      // Update status in local list for custom phone mode
      if (sCustomPhoneMode) {
        _setCustomPhoneMessages(prev => prev.map(m =>
          m.id === msg.id
            ? { ...m, status: result.success ? "sent" : "failed", errorMessage: result.success ? "" : (result.error || "") }
            : m
        ));
      }
      if (result.success && !sCustomPhoneMode) {
        // Flag all customer workorders so the sender's list prioritizes them
        let allWOs = useOpenWorkordersStore.getState().workorders;
        allWOs.filter((wo) => wo.customerID === zCustomer.id).forEach((wo) => {
          useOpenWorkordersStore.getState().setField("lastSMSSenderUserID", zCurrentUserObj.id, wo.id);
        });
      }
      if (!result.success) {
        useAlertScreenStore.getState().setValues({
          title: "Message Failed",
          message: result.error || "Failed to send message",
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
  async function handleSendWorkorderTicket() {
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
      let result = await dbUploadPDFAndSendSMS({
        base64,
        storagePath,
        message,
        phoneNumber: zCustomer.customerCell,
        customerID: zCustomer.id,
        messageID,
      });
      if (result && result.success) {
        sendMessage(message.replace(/\{link\}/g, "[PDF link]"));
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

  function handleSendSaleReceipt() {
    if (!zWorkorderObj || !zCustomer?.customerCell) return;
    useLoginStore.getState().requireLogin(() => {
      const settings = useSettingsStore.getState().getSettings();
      const customer = {
        first: zWorkorderObj.customerFirst || "",
        last: zWorkorderObj.customerLast || "",
        customerCell: zWorkorderObj.customerPhone || "",
        email: zWorkorderObj.customerEmail || "",
        id: zWorkorderObj.customerID || "",
      };
      sendSaleReceipt(zWorkorderObj, customer, zWorkorderObj, settings);
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
    forwardLoadedPhoneRef.current = null;
    clearTranslation();
  }

  function handleExitCustomPhoneMode() {
    _setCustomPhoneMode(false);
    _setCustomPhone("");
    _setCustomPhoneMessages([]);
    _setNewMessage("");
    _setForwardReplies(false);
    forwardLoadedPhoneRef.current = null;
    clearTranslation();
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
                  {sShowReplyModal && (
                    <View style={{
                      position: "absolute",
                      bottom: 55,
                      right: 0,
                      backgroundColor: "white",
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: gray(0.2),
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                      flexDirection: "row",
                      alignItems: "center",
                      shadowColor: "black",
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.15,
                      shadowRadius: 4,
                      elevation: 4,
                      zIndex: 10,
                    }}>
                      <Text style={{ fontSize: 12, color: C.text, marginRight: 8 }}>User can reply?</Text>
                      <TouchableOpacity
                        onPress={() => { _setCanRespond(true); _setShowReplyModal(false); }}
                        style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: C.green, justifyContent: "center", alignItems: "center", marginRight: 6 }}
                      >
                        <Text style={{ fontSize: 15, color: "white", fontWeight: "bold" }}>✓</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => { _setCanRespond(false); _setShowReplyModal(false); }}
                        style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: C.red, justifyContent: "center", alignItems: "center" }}
                      >
                        <Text style={{ fontSize: 15, color: "white", fontWeight: "bold" }}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  <TouchableOpacity
                    onPress={() => { if (sNewMessage.trim() && sNewMessage.length <= 1600) sendMessage(sNewMessage); }}
                    style={{ marginRight: 4, marginBottom: 4, padding: 6, opacity: sNewMessage.trim() && sNewMessage.length <= 1600 ? 1 : 0.3 }}
                  >
                    <Image_ icon={ICONS.airplane} size={41} />
                  </TouchableOpacity>
                </View>
              </View>
            <Text style={{ fontSize: 10, color: sNewMessage.length > 1600 ? C.red : gray(0.4), alignSelf: "flex-end", marginTop: 2 }}>
              {sNewMessage.length} / 1600
            </Text>
          </View>
            <View style={{ width: "100%", marginTop: 10, paddingHorizontal: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
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
                <DropdownMenu
                  dataArr={TEXT_TEMPLATE_VARIABLES.map((v) => ({ label: v.label, variable: v.variable }))}
                  onSelect={(item) => handleInsertVariable(resolveTemplate(item.variable))}
                  buttonText={"Variables"}
                  buttonStyle={{ paddingVertical: 5 }}
                  openUpward={true}
                />
                <Button_
                  onPress={() => _setShowMediaPicker(true)}
                  text={"Attach Media"}
                  icon={ICONS.viewPhoto}
                  iconSize={16}
                  enabled={!!(zWorkorderObj?.media?.length)}
                  colorGradientArr={COLOR_GRADIENTS.purple}
                  buttonStyle={{ borderRadius: 5, paddingHorizontal: 10 }}
                />
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <CheckBox_
                    text={"Translate"}
                    isChecked={sTranslateActive}
                    onCheck={handleToggleTranslate}
                  />
                  {sTranslateActive && (
                    <TouchableOpacity onPress={handleFlipDirection} style={{ marginLeft: 4, paddingHorizontal: 6 }}>
                      <Image_ icon={isEnToEs ? ICONS.exportIcon : ICONS.importIcon} size={18} />
                    </TouchableOpacity>
                  )}
                </View>
                <CheckBox_
                  text={"Forward replies"}
                  isChecked={sForwardReplies}
                  onCheck={handleToggleForwardReplies}
                  enabled={hasActivePhone}
                />
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <Button_
                  onPress={handleSendWorkorderTicket}
                  text={"Send Workorder"}
                  enabled={!!zWorkorderObj && !!zCustomer?.customerCell}
                  colorGradientArr={COLOR_GRADIENTS.green}
                  buttonStyle={{ borderRadius: 5, paddingHorizontal: 15 }}
                />
                <Button_
                  onPress={handleSendSaleReceipt}
                  text={"Send Receipt"}
                  enabled={!!zWorkorderObj && !!zCustomer?.customerCell}
                  colorGradientArr={COLOR_GRADIENTS.green}
                  buttonStyle={{ borderRadius: 5, paddingHorizontal: 15 }}
                />
                <Button_
                  onPress={handleSendSMSPayment}
                  text={"Send SMS Payment"}
                  enabled={!!zWorkorderObj && !!zCustomer?.customerCell && !zWorkorderObj.paymentComplete && !zWorkorderObj.activeSaleID}
                  colorGradientArr={COLOR_GRADIENTS.blue}
                  buttonStyle={{ borderRadius: 5, paddingHorizontal: 15 }}
                />
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                {hasCustomer && !sCustomPhoneMode ? (
                  <TouchableOpacity
                    onPress={handleEnterCustomPhoneMode}
                    style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: 4, borderWidth: 1, borderColor: gray(0.3) }}
                    title="Enter a phone number"
                  >
                    <Text style={{ fontSize: 13, color: gray(0.4) }}>Clear customer</Text>
                  </TouchableOpacity>
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

const MESSAGE_TEXT_STYLE = {
  fontSize: 14,
};

const INFO_TEXT_STYLE = {
  fontSize: 11,
  marginTop: 2,
};

const IncomingMessageComponent = memo(({ msgObj }) => {
  let dateObj = formatDateTimeForReceipt(null, msgObj.millis);
  let backgroundColor = "lightgray";
  return (
    <View style={{ ...OUTER_MSG_BOX_STYLE, alignSelf: "flex-start" }}>
      <View style={{ backgroundColor, ...INNER_MSG_BOX_STYLE }}>
        {msgObj.imageUrl ? (
          <Image
            source={{ uri: msgObj.imageUrl }}
            style={{ width: "100%", height: 180, borderRadius: 4, marginBottom: 4 }}
            resizeMode="cover"
          />
        ) : null}
        {msgObj.message && !msgObj.imageUrl ? (
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
    <View style={{ ...OUTER_MSG_BOX_STYLE, alignSelf: "flex-end" }}>
      <View style={{ backgroundColor, ...INNER_MSG_BOX_STYLE }}>
        {msgObj.imageUrl ? (
          <Image
            source={{ uri: msgObj.imageUrl }}
            style={{ width: "100%", height: 180, borderRadius: 4, marginBottom: 4 }}
            resizeMode="cover"
          />
        ) : null}
        {msgObj.message && !msgObj.imageUrl ? (
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

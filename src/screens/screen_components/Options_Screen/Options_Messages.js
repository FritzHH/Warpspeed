/* eslint-disable */

import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from "react-native-web";
import {
  capitalizeFirstLetterOfString,
  combine2ArraysOrderByMillis,
  calculateRunningTotals,
  dim,
  formatDateTimeForReceipt,
  formatStoreHours,
  generateRandomID,
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
} from "../../../components";
import { C, COLOR_GRADIENTS, Colors, ICONS, Fonts } from "../../../styles";
import { useTranslation } from "../../../useTranslation";
import {
  SMS_PROTO,
  WORKORDER_PROTO,
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
  useCurrentCustomerStore,
  useOpenWorkordersStore,
  useCustMessagesStore,
  useLoginStore,
  useSettingsStore,
  useAlertScreenStore,
} from "../../../stores";
import { smsService } from "../../../data_service_modules";
import { DEBOUNCE_DELAY, build_db_path } from "../../../constants";
import { dbUploadPDFAndSendSMS } from "../../../db_calls_wrapper";

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
  let zCustomer = CUSTOMER_PROTO;
  let zWorkorderObj = WORKORDER_PROTO;
  zCustomer = useCurrentCustomerStore((state) => state.customer);
  zWorkorderObj = useOpenWorkordersStore((state) =>
    state.workorders.find((o) => o.id === state.openWorkorderID) || null
  );
  const zSettings = useSettingsStore((state) => state.settings);
  const zIncomingMessagesArr = useCustMessagesStore(
    (state) => state.incomingMessages
  );
  const zOutgoingMessagesArr = useCustMessagesStore(
    (state) => state.outgoingMessages
  );
  //////////////////////////////////////////////////////////////////////////

  // Clear hasNewSMS flag when messages are viewed
  if (zWorkorderObj?.hasNewSMS) {
    useOpenWorkordersStore.getState().setField("hasNewSMS", false, zWorkorderObj.id);
  }

  const [sNewMessage, _setNewMessage] = useState("");
  const [sCanRespond, _setCanRespond] = useState(false);
  const [sInputHeight, _setInputHeight] = useState(36);
  const [sTranslateActive, _setTranslateActive] = useState(false);
  const textInputRef = useRef("");
  const messageListRef = useRef(null);
  const debounceTimerRef = useRef(null);
  const cursorPositionRef = useRef(0);

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

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // log("res", sCanRespond);
  useEffect(() => {
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

  async function sendMessage(text) {
    if (!text || !text.trim()) return;
    useLoginStore.getState().requireLogin(async () => {
      let zCurrentUserObj = useLoginStore.getState().getCurrentUser();
      let msg = { ...SMS_PROTO };
      msg.message = text;
      msg.phoneNumber = zCustomer.cell;
      msg.firstName = zCustomer.first;
      msg.lastName = zCustomer.last;
      msg.canRespond = sCanRespond ? new Date().getTime() : null;
      msg.millis = new Date().getTime();
      msg.customerID = zCustomer.id;
      msg.id = generateRandomID();
      msg.type = "outgoing";
      msg.senderUserObj = zCurrentUserObj;
      _setNewMessage("");
      _setCanRespond(false);
      clearTranslation();
      let result = await smsService.send(msg);
      if (result.success) {
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
    if (!zWorkorderObj || !zCustomer?.cell) return;
    useLoginStore.getState().requireLogin(async () => {
      let { tenantID, storeID } = useSettingsStore.getState().getSettings();
      let receiptData = printBuilder.workorder(zWorkorderObj, zCustomer, zSettings?.salesTaxPercent);
      let { generateWorkorderTicketPDF } = await import("../../../pdfGenerator");
      let base64 = generateWorkorderTicketPDF(receiptData);
      let storagePath = build_db_path.cloudStorage.workorderTicketPDF(zWorkorderObj.id, tenantID, storeID);
      let messageTemplate = zSettings?.workorderTicketMessage || "Hi {firstName}, here is your workorder ticket: {link}";
      let message = resolveTemplate(messageTemplate);
      let messageID = generateRandomID();
      let result = await dbUploadPDFAndSendSMS({
        base64,
        storagePath,
        message,
        phoneNumber: zCustomer.cell,
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

  async function handleSendSaleReceipt() {
    if (!zWorkorderObj || !zCustomer?.cell) return;
    useLoginStore.getState().requireLogin(async () => {
      let { tenantID, storeID } = useSettingsStore.getState().getSettings();
      let sale = zWorkorderObj;
      let receiptData = printBuilder.sale(sale, sale.payments || [], zCustomer, zWorkorderObj, zSettings?.salesTaxPercent);
      let { generateSaleReceiptPDF } = await import("../../../pdfGenerator");
      let base64 = generateSaleReceiptPDF(receiptData);
      let storagePath = build_db_path.cloudStorage.saleReceiptPDF(zWorkorderObj.id, tenantID, storeID);
      let messageTemplate = zSettings?.saleReceiptMessage || "Hi {firstName}, here is your receipt: {link}";
      let message = resolveTemplate(messageTemplate);
      let messageID = generateRandomID();
      let result = await dbUploadPDFAndSendSMS({
        base64,
        storagePath,
        message,
        phoneNumber: zCustomer.cell,
        customerID: zCustomer.id,
        messageID,
      });
      if (result && result.success) {
        sendMessage(message.replace(/\{link\}/g, "[PDF link]"));
      } else {
        useAlertScreenStore.getState().setValues({
          title: "Receipt Send Failed",
          message: result?.error || "Failed to upload and send receipt",
          btn1Text: "OK",
          handleBtn1Press: () => useAlertScreenStore.getState().resetAll(),
          showAlert: true,
          canExitOnOuterClick: true,
        });
      }
    });
  }
  ///////////////////////////////////////////////////////////////
  /////////////////////////////////////////////////////////////////

  let messagesArr = combine2ArraysOrderByMillis(
    zIncomingMessagesArr,
    zOutgoingMessagesArr
  );

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
          backgroundColor: 'blue'
        }}
      >
        {messagesArr.length < 1 && (
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
              {!zCustomer?.id
                ? "Select a customer to message"
                : zCustomer?.cell
                ? "No messages to/from this cell phone #"
                : "No cell phone on account\n\nText messaging deactivated"}
            </Text>
          </View>
        )}
        {messagesArr.length > 0 && (
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
          />
        )}
      </View>
      {!zCustomer?.cell ? (
        <View style={{ width: "100%", height: "100%" }}></View>
      ) : (
        <View
          style={{
            paddingTop: 10,
              flexDirection: "column",
            width: "100%",
              // height: "20%",
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
                outlineColor: 'transparent',
                outlineWidth: 0,
                color: C.text,
                padding: 5,
                paddingBottom: 10,
                fontSize: 15,
                height: sInputHeight,
                overflow: "hidden",
                flexWrap: "wrap",
                textWrap: "pretty",
                borderWidth: 2,
                borderRadius: 5,
                borderColor: sCanRespond ? C.red : gray(0.15),
                width: "100%",
              }}
              value={sNewMessage}
            />
            <Text style={{ fontSize: 10, color: sNewMessage.length > 1600 ? C.red : gray(0.4), alignSelf: "flex-end", marginTop: 2 }}>
              {sNewMessage.length} / 1600
            </Text>
          </View>
            <View style={{
              width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "space-around", marginTop: 10, paddingHorizontal: 0

            }}>
            <Button_
              onPress={() => sendMessage(sNewMessage)}
              text={"Send"}
              enabled={!!sNewMessage.trim() && sNewMessage.length <= 1600}
              colorGradientArr={COLOR_GRADIENTS.blue}
              buttonStyle={{ borderRadius: 5, paddingHorizontal: 15 }}
            />
            <DropdownMenu
              dataArr={(zSettings?.textTemplates || []).map((t) => ({ label: t.name || "Untitled", message: t.message }))}
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
            <CheckBox_
                buttonStyle={{}}
                text={"Can Respond"}
              isChecked={sCanRespond}
              onCheck={() => _setCanRespond(!sCanRespond)}
            />
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
            <Button_
              onPress={() => { _setNewMessage(""); _setInputHeight(36); clearTranslation(); }}
              text={"Clear"}
              colorGradientArr={COLOR_GRADIENTS.red}
              buttonStyle={{ borderRadius: 5, paddingHorizontal: 15 }}
            />
            <Button_
              onPress={handleSendWorkorderTicket}
              text={"Send Workorder"}
              enabled={!!zWorkorderObj && !!zCustomer?.cell}
              colorGradientArr={COLOR_GRADIENTS.green}
              buttonStyle={{ borderRadius: 5, paddingHorizontal: 15 }}
            />
            <Button_
              onPress={handleSendSaleReceipt}
              text={"Send Receipt"}
              enabled={!!zWorkorderObj && !!zCustomer?.cell}
              colorGradientArr={COLOR_GRADIENTS.green}
              buttonStyle={{ borderRadius: 5, paddingHorizontal: 15 }}
            />
          </View>
        </View>
      )}
    </View>
    // </View>
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
        <Text style={{ ...MESSAGE_TEXT_STYLE }}>{msgObj.message}</Text>
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
        <Text style={{ ...MESSAGE_TEXT_STYLE, color: "white" }}>{msgObj.message}</Text>
      </View>
      <View
        style={{
          width: "100%",
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        <Text style={{ ...INFO_TEXT_STYLE }}>
          {dateObj.dayOfWeek + ", " + dateObj.time}
        </Text>
        <Text style={{ ...INFO_TEXT_STYLE }}>{dateObj.date}</Text>
      </View>
      {msgObj.status === "sending" && (
        <Text style={{ fontSize: 10, color: gray(0.5), fontStyle: "italic", alignSelf: "flex-end" }}>Sending...</Text>
      )}
      {msgObj.status === "failed" && (
        <Text style={{ fontSize: 10, color: C.red, alignSelf: "flex-end" }}>Failed to send{msgObj.errorMessage ? ": " + msgObj.errorMessage : ""}</Text>
      )}
    </View>
  );
});

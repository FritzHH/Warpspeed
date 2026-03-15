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
  combine2ArraysOrderByMillis,
  calculateRunningTotals,
  dim,
  formatDateTimeForReceipt,
  generateRandomID,
  gray,
  log,
} from "../../../utils";
import {
  TabMenuDivider as Divider,
  Button,
  CheckBox_,
  Button_,
  DropdownMenu,
} from "../../../components";
import { C, COLOR_GRADIENTS, Colors } from "../../../styles";
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
} from "../../../stores";
import { smsService } from "../../../data_service_modules";
import { DEBOUNCE_DELAY } from "../../../constants";

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
  const [sNewMessage, _setNewMessage] = useState("");
  const [sCanRespond, _setCanRespond] = useState(false);
  const [sInputHeight, _setInputHeight] = useState(36);
  const textInputRef = useRef("");
  const messageListRef = useRef(null);
  const debounceTimerRef = useRef(null);
  const cursorPositionRef = useRef(0);

  // Debounced handler for message input
  const handleMessageChange = useCallback((val) => {
    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Update state immediately for responsive UI
    _setNewMessage(val);

    // Debounce any side effects (if needed in future)
    debounceTimerRef.current = setTimeout(() => {
      // Any debounced logic can go here
      // Currently just using for debouncing the state update itself
    }, DEBOUNCE_DELAY);
  }, []);

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
  }

  function sendMessage(text) {
    let zCurrentUserObj = useLoginStore.getState().getCurrentUser();
    let msg = { ...SMS_PROTO };
    msg.message = text;
    msg.phoneNumber = zCustomer.cell; // || "2393369177";
    msg.firstName = zCustomer.first; // || "Fritz";
    msg.lastName = zCustomer.last; // || "Hieb";
    msg.canRespond = sCanRespond ? new Date().getTime() : null;
    msg.millis = new Date().getTime();
    msg.customerID = zCustomer.id; // || "3d2E63TXCY2bzmOdeQc8";
    msg.id = generateRandomID();
    msg.type = "outgoing";
    msg.senderUserObj = zCurrentUserObj;
    _setNewMessage("");
    _setCanRespond(false);
    smsService.send(msg);
    // _zSetOutgoingMessage(msg, true);
  }
  function formatStoreHours(storeHours) {
    if (!storeHours?.standard || storeHours.standard.length === 0) return "";
    let days = storeHours.standard;
    let shortNames = { Monday: "Mon", Tuesday: "Tues", Wednesday: "Wed", Thursday: "Thurs", Friday: "Fri", Saturday: "Sat", Sunday: "Sun" };
    let groups = [];
    let currentGroup = null;
    for (let i = 0; i < days.length; i++) {
      let day = days[i];
      let key = day.isOpen ? day.open + "-" + day.close : "closed";
      if (currentGroup && currentGroup.key === key) {
        currentGroup.end = day.name;
      } else {
        currentGroup = { key, start: day.name, end: day.name, isOpen: day.isOpen, open: day.open, close: day.close };
        groups.push(currentGroup);
      }
    }
    return groups.map((g) => {
      let label = g.start === g.end ? shortNames[g.start] || g.start : (shortNames[g.start] || g.start) + "-" + (shortNames[g.end] || g.end);
      return g.isOpen ? label + " " + g.open + " - " + g.close : "Closed " + label;
    }).join(", ");
  }
  function resolveTemplate(templateMessage) {
    if (!templateMessage) return "";
    let totalAmount = "";
    try {
      let totals = calculateRunningTotals(zWorkorderObj, zSettings?.salesTaxPercent);
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
      .replace(/\{firstName\}/g, zCustomer?.first || "")
      .replace(/\{lastName\}/g, zCustomer?.last || "")
      .replace(/\{brand\}/g, zWorkorderObj?.brand || "")
      .replace(/\{description\}/g, zWorkorderObj?.description || "")
      .replace(/\{totalAmount\}/g, totalAmount)
      .replace(/\{lineItems\}/g, lineItems)
      .replace(/\{partOrdered\}/g, zWorkorderObj?.partOrdered || "")
      .replace(/\{partSource\}/g, zWorkorderObj?.partSource || "")
      .replace(/\{storeHours\}/g, storeHoursText)
      .replace(/\{storePhone\}/g, ((p) => p.length === 10 ? "(" + p.slice(0, 3) + ") " + p.slice(3, 6) + "-" + p.slice(6) : p)(zSettings?.storeInfo?.phone || ""));
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
            <View style={{
              width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "space-around", marginTop: 10, paddingHorizontal: 0

            }}>
            {/* {sNewMessage.length > 5 || true && ( */}
            <Button_
              onPress={() => sendMessage(sNewMessage)}
              text={"Send"}
              colorGradientArr={COLOR_GRADIENTS.blue}
                buttonStyle={{ borderRadius: 5, paddingHorizontal: 15 }}
            />
            {/* )} */}
            <DropdownMenu
              dataArr={(zSettings?.textTemplates || []).map((t) => ({ label: t.name || "Untitled", message: t.message }))}
              onSelect={(item) => _setNewMessage(resolveTemplate(item.message))}
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
            <Button_
              onPress={() => { _setNewMessage(""); _setInputHeight(36); }}
              text={"Clear"}
              colorGradientArr={COLOR_GRADIENTS.red}
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
    </View>
  );
});

const OutgoingMessageComponent = memo(({ msgObj }) => {
  let dateObj = formatDateTimeForReceipt(null, msgObj.millis);
  let backgroundColor = "rgb(0,122,255)";
  return (
    <View style={{ ...OUTER_MSG_BOX_STYLE, alignSelf: "flex-end" }}>
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
        <Text style={{ ...INFO_TEXT_STYLE }}>
          {dateObj.dayOfWeek + ", " + dateObj.time}
        </Text>
        <Text style={{ ...INFO_TEXT_STYLE }}>{dateObj.date}</Text>
      </View>
    </View>
  );
});

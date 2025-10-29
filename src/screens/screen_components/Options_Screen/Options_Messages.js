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
} from "../../../stores";
import { smsService } from "../../../data_service_modules";
import { DEBOUNCE_DELAY } from "../../../constants";

export function MessagesComponent({}) {
  // setters /////////////////////////////////////////////////////////////
  const _zSetOutgoingMessage = useCustMessagesStore(
    (state) => state.setOutgoingMessage
  );

  // getters ///////////////////////////////////////////////////////////////
  let zCustomer = CUSTOMER_PROTO;
  let zWorkorderObj = WORKORDER_PROTO;
  zCustomer = useCurrentCustomerStore((state) => state.customer);
  zWorkorderObj = useOpenWorkordersStore((state) => state.openWorkorder);
  const zIncomingMessagesArr = useCustMessagesStore(
    (state) => state.incomingMessages
  );
  const zOutgoingMessagesArr = useCustMessagesStore(
    (state) => state.outgoingMessages
  );
  //////////////////////////////////////////////////////////////////////////
  const [sNewMessage, _setNewMessage] = useState("");
  const [sCanRespond, _setCanRespond] = useState(false);
  const textInputRef = useRef("");
  const messageListRef = useRef(null);
  const debounceTimerRef = useRef(null);

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
      }}
    >
      <View
        style={{
          width: "100%",
          height: "80%",
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
            flexDirection: "row",
            width: "100%",
            height: "20%",
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
            style={{
              color: C.text,
              padding: 5,
              fontSize: 15,
              flexWrap: "wrap",
              textWrap: "pretty",
              outlineWidth: 0,
              borderWidth: 2,
              borderRadius: 15,
              borderColor: sCanRespond ? C.red : gray(0.15),
              width: "80%",
            }}
            value={sNewMessage}
          />
          <View style={{ width: "20%", paddingHorizontal: 5, height: "100%" }}>
            {/* {sNewMessage.length > 5 || true && ( */}
            <Button_
              onPress={() => sendMessage(sNewMessage)}
              text={"Send"}
              colorGradientArr={COLOR_GRADIENTS.blue}
              buttonStyle={{ width: "100%" }}
            />
            {/* )} */}
            <DropdownMenu
              dataArr={[{ label: "hello" }]}
              buttonText={"Templates"}
              buttonStyle={{ marginTop: 10, borderRadius: 15 }}
            />
            <CheckBox_
              buttonStyle={{ marginTop: 10 }}
              text={"Respond"}
              isChecked={sCanRespond}
              onCheck={() => _setCanRespond(!sCanRespond)}
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

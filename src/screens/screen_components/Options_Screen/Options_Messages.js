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
  log,
} from "../../../utils";
import {
  TabMenuDivider as Divider,
  Button,
  CheckBox_,
} from "../../../components";
import { Colors } from "../../../styles";
import {
  SMS_PROTO,
  WORKORDER_PROTO,
  CUSTOMER_PROTO,
  SETTINGS_OBJ,
} from "../../../data";
import React, { memo, useEffect, useReducer, useRef, useState } from "react";
import {
  useCurrentCustomerStore,
  useOpenWorkordersStore,
  useCustMessagesStore,
  useLoginStore,
} from "../../../storesOld";
import { dbSendMessageToCustomer } from "../../../db_call_wrapper";

export function MessagesComponent({}) {
  // setters /////////////////////////////////////////////////////////////
  const _zSetOutgoingMessage = useCustMessagesStore(
    (state) => state.setOutgoingMessage
  );

  const _zExecute = useLoginStore((state) => state.execute);
  // getters ///////////////////////////////////////////////////////////////
  let zCustomerObj = CUSTOMER_PROTO;
  let zWorkorderObj = WORKORDER_PROTO;
  zCustomerObj = useCurrentCustomerStore((state) => state.getCustomerObj());
  zWorkorderObj = useOpenWorkordersStore((state) => state.getWorkorderObj());
  const zIncomingMessagesArr = useCustMessagesStore((state) =>
    state.getIncomingMessagesArr()
  );
  const zOutgoingMessagesArr = useCustMessagesStore((state) =>
    state.getOutgoingMessagesArr()
  );
  const zCurrentUserObj = useLoginStore((state) => state.getCurrentUserObj());
  //////////////////////////////////////////////////////////////////////////
  const [sNewMessage, _setNewMessage] = useState("");
  const [sCanRespond, _setCanRespond] = useState(false);
  const textInputRef = useRef("");
  const messageListRef = useRef(null);

  function sendMessage(text, canRespond) {
    let msg = { ...SMS_PROTO };
    msg.message = text;
    msg.phoneNumber = zCustomerObj.cell; // || "2393369177";
    msg.firstName = zCustomerObj.first; // || "Fritz";
    msg.lastName = zCustomerObj.last; // || "Hieb";
    msg.canRespond = canRespond || sCanRespond;
    msg.millis = new Date().getTime();
    msg.customerID = zCustomerObj.id; // || "3d2E63TXCY2bzmOdeQc8";
    msg.id = generateRandomID();
    msg.type = "outgoing";
    msg.senderUserObj = zCurrentUserObj;
    _setNewMessage("");
    _zSetOutgoingMessage(msg);
    dbSendMessageToCustomer(msg);
  }

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

  ///////////////////////////////////////////////////////////////
  /////////////////////////////////////////////////////////////////
  return (
    <View
      style={{
        flex: 1,
        padding: 5,
      }}
    >
      <View
        style={{
          // width: "100%",
          height: dim.windowHeight * 0.8,
          backgroundColor: "transparent",
        }}
      >
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
          data={combine2ArraysOrderByMillis(
            zIncomingMessagesArr,
            zOutgoingMessagesArr
          )}
          renderItem={(item) => {
            let idx = item.index;
            item = item.item;
            // log("item", item);
            if (item.type === "incoming")
              return <IncomingMessageComponent msgObj={item} />;
            return <OutgoingMessageComponent msgObj={item} />;
          }}
        />
      </View>
      <View
        style={{
          marginTop: 5,
          flexDirection: "row",
          width: "100%",
          height: dim.windowHeight * 0.16,
        }}
      >
        <TextInput
          onChangeText={(val) => _setNewMessage(val)}
          ref={textInputRef}
          autoFocus={true}
          numberOfLines={4}
          multiline={true}
          placeholderTextColor={"gray"}
          placeholder={"Message..."}
          style={{
            fontSize: 15,
            flexWrap: "wrap",
            textWrap: "pretty",
            outlineWidth: 0,
            width: "85%",
          }}
          value={sNewMessage}
        />
        <View style={{ width: "14%" }}>
          {sNewMessage.length > 5 && (
            <Button
              onPress={() => endMessage(sNewMessage)}
              text={"Send"}
              buttonStyle={{ width: "100%" }}
            />
          )}
          <CheckBox_
            checkedColor={"red"}
            buttonStyle={{ borderWidth: 1, borderColor: "gray" }}
            text={"Respond"}
            isChecked={sCanRespond}
            onCheck={() => _setCanRespond(!sCanRespond)}
          />
        </View>
      </View>
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

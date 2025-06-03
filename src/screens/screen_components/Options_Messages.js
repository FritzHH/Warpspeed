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
  formatDateTime,
  generateRandomID,
  log,
  trimToTwoDecimals,
} from "../../utils";
import {
  TabMenuDivider as Divider,
  ScreenModal,
  Button,
  InventoryItemInModal,
  CheckBox,
  LoginScreenComponent,
} from "../../components";
import { Colors } from "../../styles";
import {
  INVENTORY_ITEM_PROTO,
  INVENTORY_CATEGORIES,
  TAB_NAMES,
  SMS_PROTO,
  WORKORDER_PROTO,
  CUSTOMER_PROTO,
  SETTINGS_PROTO,
} from "../../data";
import { IncomingCustomerComponent } from "./Info_CustomerInfoComponent";
import React, { useEffect, useRef, useState } from "react";
import { cloneDeep } from "lodash";
import {
  execute,
  useCurrentCustomerStore,
  useCurrentWorkorderStore,
  useCustMessagesStore,
  USER_ACTION_GLOBAL,
  useSettingsStore,
} from "../../stores";
import { dbSendMessageToCustomer } from "../../db_calls";
import { getListeners } from "../../db_subscriptions";

export function MessagesComponent({}) {
  // getters
  let zCustomerObj = CUSTOMER_PROTO;
  let zWorkorderObj = WORKORDER_PROTO;

  zCustomerObj = useCurrentCustomerStore((state) => state.getCustomerObj());
  zWorkorderObj = useCurrentWorkorderStore((state) => state.getWorkorderObj());
  const zIncomingMessagesArr = useCustMessagesStore((state) =>
    state.getIncomingMessagesArr()
  );
  const zOutgoingMessagesArr = useCustMessagesStore((state) =>
    state.getOutgoingMessagesArr()
  );
  // setters
  const zSetOutgoingMessage = useCustMessagesStore(
    (state) => state.setOutgoingMessage
  );

  /////////////////////////////////////////////////////////////
  const [sNewMessage, _setNewMessage] = useState("test message buddyyyy");
  const [sCanRespond, _setCanRespond] = useState(true);
  // const [sLastMessageRendered, _setLastMessageRendered] = useState(null);
  const [sScrollPosition, _setScrollPosition] = useState(null);
  const [sHeldOutgoingMessage, _setHeldOutgoingMessage] = useState(null);
  const [sLoginFunctionCallback, _setLoginFunctionCallback] = useState(
    () => () => {}
  );
  const [sShowLoginScreen, _setShowLoginScreen] = useState(false);

  let messageListRef = useRef(null);

  function sendMessage(text, canRespond) {
    let msg = { ...SMS_PROTO };
    msg.message = text;
    msg.phoneNumber = zCustomerObj.cell || "2393369177";
    msg.firstName = zCustomerObj.first || "Fritz";
    msg.lastName = zCustomerObj.last || "Hieb";
    msg.canRespond = canRespond || sCanRespond;
    msg.millis = new Date().getTime();
    msg.customerID = zCustomerObj.id || "3d2E63TXCY2bzmOdeQc8";
    msg.id = generateRandomID();
    msg.type = "outgoing";
    if (!USER_ACTION_GLOBAL.getUser()) {
    }
    msg.senderUserID;
    zSetOutgoingMessage(msg);
    dbSendMessageToCustomer(msg);
  }

  useEffect(() => {
    let arr = combine2ArraysOrderByMillis(
      zIncomingMessagesArr,
      zOutgoingMessagesArr
    );
    _setScrollPosition(arr.length - 1);
    if (arr.length - 1 > 0) {
      messageListRef.current?.scrollToIndex({
        index: arr.length - 1,
        animated: true,
      });
    }
  }, [zIncomingMessagesArr, zOutgoingMessagesArr]);

  ///////////////////////////////////////////////////////////////
  /////////////////////////////////////////////////////////////////
  return (
    <View
      style={{
        width: "100%",
        height: "80%",
      }}
    >
      {/* <LoginScreenComponent /> */}
      <LoginScreenComponent
        modalVisible={sShowLoginScreen}
        loginCallback={() => sLoginFunctionCallback()}
        _setModalVisibility={() => _setShowLoginScreen(false)}
      />
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
        style={{ width: "100%", height: "30%" }}
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
      <View
        style={{
          flexDirection: "row",
          width: "100%",
          // backgroundColor: "green",
        }}
      >
        <TextInput
          onChangeText={(val) =>
            execute(
              () => _setNewMessage(val),
              _setLoginFunctionCallback,
              _setShowLoginScreen
            )
          }
          autoFocus={true}
          numberOfLines={4}
          multiline={true}
          style={{
            flexWrap: "wrap",
            textWrap: "pretty",
            // minHeight: 60,
            outlineWidth: 0,
            width: "85%",
            borderWidth: 1,
          }}
          value={sNewMessage}
        />
        <View style={{ width: "14%" }}>
          {sNewMessage.length > 5 ? (
            <Button
              onPress={() => sendMessage(sNewMessage)}
              text={"Send"}
              buttonStyle={{ width: "100%" }}
            />
          ) : null}
          <CheckBox
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

function IncomingMessageComponent({ msgObj }) {
  let dateObj = formatDateTime(null, msgObj.millis);
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
        <Text style={{ ...INFO_TEXT_STYLE }}>
          {dateObj.dayOfWeek + ", " + dateObj.time}
        </Text>
        <Text style={{ ...INFO_TEXT_STYLE }}>{dateObj.date}</Text>
      </View>
    </View>
  );
}

function OutgoingMessageComponent({ msgObj }) {
  let dateObj = formatDateTime(null, msgObj.millis);
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
}

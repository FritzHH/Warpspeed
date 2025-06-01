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
} from "../../components";
import { Colors } from "../../styles";
import {
  INVENTORY_ITEM_PROTO,
  INVENTORY_CATEGORIES,
  TAB_NAMES,
  SMS_PROTO,
  WORKORDER_PROTO,
  CUSTOMER_PROTO,
} from "../../data";
import { IncomingCustomerComponent } from "./Info_CustomerInfoComponent";
import React, { useEffect, useRef, useState } from "react";
import { cloneDeep } from "lodash";
import {
  useCurrentCustomerStore,
  useCurrentWorkorderStore,
  useCustMessagesStore,
} from "../../stores";
import { dbSendMessageToCustomer } from "../../db_calls";

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
  const [sNewMessage, _setNewMessage] = useState(
    "test message buddyyyy\nhello new line!"
  );
  const [sCanRespond, _setCanRespond] = useState(false);

  function formatMessagesArrForViewing() {
    let fullArr = combine2ArraysOrderByMillis(
      zIncomingMessagesArr,
      zOutgoingMessagesArr
    );
    return fullArr;
  }

  function sendMessage(text, canRespond) {
    let msg = { ...SMS_PROTO };
    msg.message = text;
    msg.phoneNumber = zCustomerObj.cell;
    msg.firstName = zCustomerObj.first;
    msg.lastName = zCustomerObj.last;
    msg.canRespond = canRespond || sCanRespond;
    msg.millis = new Date().getTime();
    msg.customerID = zCustomerObj.id;
    msg.id = generateRandomID();
    msg.type = "outgoing";
    // log(msg);
    zSetOutgoingMessage(msg);
    dbSendMessageToCustomer(msg);
  }

  ///////////////////////////////////////////////////////////////
  /////////////////////////////////////////////////////////////////
  return (
    <View
      style={{
        width: "100%",
        height: "80%",
      }}
    >
      <FlatList
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
      <View style={{ flexDirection: "row", width: "100%" }}>
        <TextInput
          onChangeText={(val) => _setNewMessage(val)}
          autoFocus={true}
          numberOfLines={4}
          multiline={true}
          style={{
            flexWrap: "wrap",
            textWrap: "pretty",
            // minHeight: 60,
            outlineWidth: 0,
            width: "90%",
            borderWidth: 1,
          }}
          value={sNewMessage}
        />
        {sNewMessage.length > 5 ? (
          <Button
            onPress={() => sendMessage(sNewMessage)}
            text={"Send"}
            buttonStyle={{ width: "15" }}
          />
        ) : null}
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
  let backgroundColor = "lightgray";
  return (
    <View style={{ backgroundColor, ...INNER_MSG_BOX_STYLE }}>
      <Text style={{ ...MESSAGE_TEXT_STYLE }}>{msgObj.message}</Text>
      <Text style={{ ...INFO_TEXT_STYLE }}>
        {formatDateTime(null, msgObj.millis)}
      </Text>
    </View>
  );
}

function OutgoingMessageComponent({ msgObj }) {
  let dateObj = formatDateTime(null, msgObj.millis);
  let backgroundColor = "rgb(0,122,255)";
  return (
    <View style={{ ...OUTER_MSG_BOX_STYLE }}>
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

/* eslint-disable */
import React, { useEffect, useState, useRef, memo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
} from "react-native-web";
import { useParams } from "react-router-dom";
import { C, ICONS } from "../../styles";
import { Button_, Image_ } from "../../components";
import {
  formatPhoneWithDashes,
  formatDateTimeForReceipt,
  capitalizeFirstLetterOfString,
  generateRandomID,
  gray,
  log,
} from "../../utils";
import {
  useOpenWorkordersStore,
  useLoginStore,
  useAlertScreenStore,
} from "../../stores";
import { dbListenToCustomerMessages } from "../../db_calls_wrapper";
import { smsService } from "../../data_service_modules";
import { SMS_PROTO } from "../../data";

export function MobileMessagesScreen() {
  const { id } = useParams();
  const zWorkorder = useOpenWorkordersStore((state) =>
    state.workorders.find((o) => o.id === id) || null
  );

  const [sMessages, _setMessages] = useState([]);
  const [sNewMessage, _setNewMessage] = useState("");
  const [sSending, _setSending] = useState(false);
  const scrollRef = useRef(null);

  const customerPhone = zWorkorder?.customerCell;
  const customerFirst = zWorkorder?.customerFirst || "";
  const customerLast = zWorkorder?.customerLast || "";
  const customerID = zWorkorder?.customerID || "";

  // Listen to customer messages
  useEffect(() => {
    if (!customerPhone) return;
    const unsubscribe = dbListenToCustomerMessages(customerPhone, (messages) => {
      if (messages) {
        _setMessages(messages);
      }
    });
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [customerPhone]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      setTimeout(() => {
        scrollRef.current?.scrollToEnd?.({ animated: true });
      }, 100);
    }
  }, [sMessages.length]);

  async function handleSend() {
    if (!sNewMessage.trim() || sSending) return;
    useLoginStore.getState().requireLogin(async () => {
      _setSending(true);
      let currentUser = useLoginStore.getState().getCurrentUser();
      let msg = { ...SMS_PROTO };
      msg.message = sNewMessage.trim();
      msg.phoneNumber = customerPhone;
      msg.firstName = customerFirst;
      msg.lastName = customerLast;
      msg.canRespond = null;
      msg.millis = new Date().getTime();
      msg.customerID = customerID;
      msg.id = generateRandomID();
      msg.type = "outgoing";
      msg.senderUserObj = currentUser;
      _setNewMessage("");
      let result = await smsService.send(msg);
      if (result.success) {
        // Flag workorders for this customer
        let allWOs = useOpenWorkordersStore.getState().workorders;
        allWOs
          .filter((wo) => wo.customerID === customerID)
          .forEach((wo) => {
            useOpenWorkordersStore
              .getState()
              .setField("lastSMSSenderUserID", currentUser.id, wo.id);
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
      _setSending(false);
    });
  }

  if (!zWorkorder) {
    return (
      <View
        style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
      >
        <Text style={{ color: C.lightText, fontSize: 16 }}>
          Workorder not found
        </Text>
      </View>
    );
  }

  if (!customerPhone) {
    return (
      <View
        style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
      >
        <Text style={{ color: C.lightText, fontSize: 16 }}>
          No phone number on file
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.backgroundWhite }}>
      {/* Header */}
      <View
        style={{
          backgroundColor: C.buttonLightGreen,
          borderBottomWidth: 1,
          borderBottomColor: C.buttonLightGreenOutline,
          paddingHorizontal: 16,
          paddingVertical: 10,
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: "600", color: C.text }}>
          {capitalizeFirstLetterOfString(customerFirst) +
            " " +
            capitalizeFirstLetterOfString(customerLast)}
        </Text>
        <Text style={{ fontSize: 13, color: C.lightText, marginTop: 2 }}>
          {formatPhoneWithDashes(customerPhone)}
        </Text>
      </View>

      {/* Messages list */}
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 12,
          paddingVertical: 8,
        }}
      >
        {sMessages.length === 0 && (
          <View
            style={{
              justifyContent: "center",
              alignItems: "center",
              paddingVertical: 40,
            }}
          >
            <Text style={{ fontSize: 15, color: C.lightText }}>
              No messages yet
            </Text>
          </View>
        )}
        {sMessages.map((msg) => {
          if (msg.type === "incoming") {
            return <IncomingBubble key={msg.id} msgObj={msg} />;
          }
          return <OutgoingBubble key={msg.id} msgObj={msg} />;
        })}
        <View style={{ height: 10 }} />
      </ScrollView>

      {/* Input area */}
      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: gray(0.88),
          backgroundColor: C.listItemWhite,
          paddingHorizontal: 12,
          paddingVertical: 10,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
          <TextInput
            value={sNewMessage}
            onChangeText={_setNewMessage}
            placeholder="Type a message..."
            placeholderTextColor={gray(0.5)}
            multiline={true}
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: gray(0.82),
              borderRadius: 20,
              paddingHorizontal: 14,
              paddingVertical: 10,
              fontSize: 16,
              color: C.text,
              maxHeight: 100,
              outlineWidth: 0,
              backgroundColor: C.backgroundWhite,
            }}
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={!sNewMessage.trim() || sSending}
            style={{
              marginLeft: 10,
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor:
                sNewMessage.trim() && !sSending ? C.blue : gray(0.8),
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Text
              style={{
                color: "white",
                fontSize: 18,
                fontWeight: "700",
                marginLeft: 2,
              }}
            >
              ↑
            </Text>
          </TouchableOpacity>
        </View>
        {sNewMessage.length > 0 && (
          <Text
            style={{
              fontSize: 11,
              color: sNewMessage.length > 1600 ? C.red : gray(0.5),
              textAlign: "right",
              marginTop: 4,
            }}
          >
            {sNewMessage.length} / 1600
          </Text>
        )}
      </View>
    </View>
  );
}

////////////////////////////////////////////////////////////
// Message bubble components
////////////////////////////////////////////////////////////

const IncomingBubble = memo(({ msgObj }) => {
  let dateObj = formatDateTimeForReceipt(null, msgObj.millis);
  return (
    <View
      style={{
        maxWidth: "78%",
        alignSelf: "flex-start",
        marginVertical: 4,
      }}
    >
      <View
        style={{
          backgroundColor: "lightgray",
          borderRadius: 16,
          borderBottomLeftRadius: 4,
          paddingHorizontal: 12,
          paddingVertical: 8,
        }}
      >
        <Text style={{ fontSize: 15, color: C.text }}>{msgObj.message}</Text>
      </View>
      <Text
        style={{
          fontSize: 11,
          color: gray(0.5),
          marginTop: 2,
          marginLeft: 4,
        }}
      >
        {dateObj.dayOfWeek + ", " + dateObj.time}
      </Text>
    </View>
  );
});

const OutgoingBubble = memo(({ msgObj }) => {
  let dateObj = formatDateTimeForReceipt(null, msgObj.millis);
  let bgColor =
    msgObj.status === "failed" ? "rgb(200,80,80)" : "rgb(0,122,255)";
  return (
    <View
      style={{
        maxWidth: "78%",
        alignSelf: "flex-end",
        marginVertical: 4,
      }}
    >
      <View
        style={{
          backgroundColor: bgColor,
          borderRadius: 16,
          borderBottomRightRadius: 4,
          paddingHorizontal: 12,
          paddingVertical: 8,
        }}
      >
        <Text style={{ fontSize: 15, color: "white" }}>{msgObj.message}</Text>
      </View>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "flex-end",
          marginTop: 2,
          marginRight: 4,
        }}
      >
        <Text style={{ fontSize: 11, color: gray(0.5) }}>
          {dateObj.dayOfWeek + ", " + dateObj.time}
        </Text>
      </View>
      {msgObj.status === "sending" && (
        <Text
          style={{
            fontSize: 10,
            color: gray(0.5),
            fontStyle: "italic",
            alignSelf: "flex-end",
          }}
        >
          Sending...
        </Text>
      )}
      {msgObj.status === "failed" && (
        <Text
          style={{
            fontSize: 10,
            color: C.red,
            alignSelf: "flex-end",
          }}
        >
          Failed to send
          {msgObj.errorMessage ? ": " + msgObj.errorMessage : ""}
        </Text>
      )}
    </View>
  );
});

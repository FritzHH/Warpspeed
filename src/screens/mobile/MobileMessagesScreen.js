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
import { Button_, Image_, CheckBox_ } from "../../components";
import {
  formatPhoneWithDashes,
  formatDateTimeForReceipt,
  capitalizeFirstLetterOfString,
  gray,
  log,
} from "../../utils";
import {
  useOpenWorkordersStore,
  useLoginStore,
  useAlertScreenStore,
  useSettingsStore,
} from "../../stores";
import { dbListenToCustomerMessages, dbUpdateMessageCanRespond } from "../../db_calls_wrapper";
import { firestoreRead } from "../../db_calls";
import { smsService } from "../../data_service_modules";
import { SMS_PROTO } from "../../data";

export function MobileMessagesScreen({ workorderID, onBack }) {
  const params = useParams();
  const woID = workorderID || params?.id;
  const zWorkorder = useOpenWorkordersStore((state) =>
    state.workorders.find((o) => o.id === woID) || null
  );

  const [sMessages, _setMessages] = useState([]);
  const [sNewMessage, _setNewMessage] = useState("");
  const [sSending, _setSending] = useState(false);
  const [sInputHeight, _setInputHeight] = useState(36);
  const [sCanRespond, _setCanRespond] = useState(true);
  const scrollRef = useRef(null);

  const customerPhone = zWorkorder?.customerCell;
  const customerFirst = zWorkorder?.customerFirst || "";
  const customerLast = zWorkorder?.customerLast || "";
  const customerID = zWorkorder?.customerID || "";

  // Listen to customer messages + load canRespond from thread parent doc
  useEffect(() => {
    if (!customerPhone) return;
    const cleanPhone = customerPhone.replace(/\D/g, "");
    const unsubscribe = dbListenToCustomerMessages(customerPhone, (messages) => {
      if (messages) _setMessages(messages);
    });
    const zSettings = useSettingsStore.getState().getSettings();
    const tenantID = zSettings?.tenantID;
    const storeID = zSettings?.storeID;
    if (tenantID && storeID && cleanPhone.length === 10) {
      firestoreRead(`tenants/${tenantID}/stores/${storeID}/sms-messages/${cleanPhone}`)
        .then((data) => {
          if (data && data.canRespond !== undefined) _setCanRespond(!!data.canRespond);
        })
        .catch(() => {});
    }
    return () => { if (unsubscribe) unsubscribe(); };
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
      if (customerFirst) msg.customerFirst = customerFirst;
      if (customerLast) msg.customerLast = customerLast;
      msg.canRespond = sCanRespond ? true : null;
      msg.millis = new Date().getTime();
      msg.customerID = customerID;
      msg.id = crypto.randomUUID();
      msg.type = "outgoing";
      msg.senderUserObj = currentUser;
      msg.sentByUser = currentUser.id;
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

  async function handleToggleCanRespond() {
    let newVal = !sCanRespond;
    _setCanRespond(newVal);
    await dbUpdateMessageCanRespond(customerPhone, null, newVal);
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
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <TouchableOpacity onPress={onBack} style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
          {onBack ? (
            <Image_ icon={ICONS.downChevron} size={16} style={{ transform: [{ rotate: "90deg" }], marginRight: 10 }} />
          ) : null}
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: "600", color: C.text }}>
              {capitalizeFirstLetterOfString(customerFirst) +
                " " +
                capitalizeFirstLetterOfString(customerLast)}
            </Text>
            <Text style={{ fontSize: 13, color: C.lightText, marginTop: 2 }}>
              {formatPhoneWithDashes(customerPhone)}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Messages list */}
      <View style={{ flex: 1, overflow: "hidden" }}>
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
      </View>

      {/* Input area */}
      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: "lightgray",
          backgroundColor: C.listItemWhite,
          paddingHorizontal: 12,
          paddingBottom: 10,
        }}
      >
        <View style={{ marginVertical: 2 }}>
          <CheckBox_
            isChecked={sCanRespond}
            onCheck={handleToggleCanRespond}
            text="User can respond"
          />
        </View>
        <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
          <TextInput
            value={sNewMessage}
            onChangeText={(val) => {
              if (val.length === 1) val = val.toUpperCase();
              _setNewMessage(val);
            }}
            placeholder="Type a message..."
            autoCapitalize="sentences"
            placeholderTextColor={gray(0.5)}
            multiline={true}
            onContentSizeChange={(e) => {
              let h = e?.nativeEvent?.contentSize?.height;
              if (typeof h === "number" && h > 0) {
                _setInputHeight(Math.max(36, Math.ceil(h)));
              }
            }}
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: gray(0.82),
              borderRadius: 20,
              paddingHorizontal: 14,
              paddingVertical: 10,
              fontSize: 16,
              lineHeight: 20,
              color: C.text,
              height: sInputHeight,
              outlineWidth: 0,
              overflow: "hidden",
              backgroundColor: C.backgroundWhite,
              textAlignVertical: "top",
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

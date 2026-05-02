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
import { Button_, Image_, CheckBox_, AlertBox_ } from "../../components";
import {
  formatPhoneWithDashes,
  formatDateTimeForReceipt,
  capitalizeFirstLetterOfString,
  calculateRunningTotals,
  gray,
  log,
} from "../../utils";
import {
  useOpenWorkordersStore,
  useLoginStore,
  useAlertScreenStore,
  useSettingsStore,
  useActiveSalesStore,
} from "../../stores";
import { dbListenToCustomerMessages, dbUpdateMessageCanRespond, dbCreateTextToPayInvoice } from "../../db_calls_wrapper";
import { firestoreRead } from "../../db_calls";
import { smsService } from "../../data_service_modules";
import { buildForwardToPayload } from "../screen_components/Options_Screen/ReplyOptionsBar";
import { SMS_PROTO } from "../../data";

export function MobileMessagesScreen({ workorderID, onBack }) {
  const params = useParams();
  const woID = workorderID || params?.id;
  const zWorkorder = useOpenWorkordersStore((state) =>
    state.workorders.find((o) => o.id === woID) || null
  );

  const zShowAlert = useAlertScreenStore((s) => s.showAlert);

  const [sMessages, _setMessages] = useState([]);
  const [sNewMessage, _setNewMessage] = useState("");
  const [sSending, _setSending] = useState(false);
  const [sInputHeight, _setInputHeight] = useState(36);
  const [sCanRespond, _setCanRespond] = useState(true);
  const [sNotifyMe, _setNotifyMe] = useState(false);
  const [sActionsOpen, _setActionsOpen] = useState(false);
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
    msg.sentByUser = currentUser?.id;
    let forwardTo = buildForwardToPayload(sNotifyMe);
    if (forwardTo) msg.forwardTo = forwardTo;
    _setNewMessage("");
    let result = await smsService.send(msg);
    if (result.success) {
      let allWOs = useOpenWorkordersStore.getState().workorders;
      allWOs
        .filter((wo) => wo.customerID === customerID)
        .forEach((wo) => {
          useOpenWorkordersStore
            .getState()
            .setField("lastSMSSenderUserID", currentUser?.id, wo.id);
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
  }

  async function handleToggleCanRespond() {
    let newVal = !sCanRespond;
    _setCanRespond(newVal);
    await dbUpdateMessageCanRespond(customerPhone, null, newVal);
  }

  function handleSendPaymentLink() {
    if (!zWorkorder.workorderLines || zWorkorder.workorderLines.length === 0) {
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
    if (zWorkorder.paymentComplete) {
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
    if (zWorkorder.activeSaleID) {
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
    let zSettings = useSettingsStore.getState().getSettings();
    let amountDue = 0;
    let activeSale = zWorkorder.activeSaleID
      ? useActiveSalesStore.getState().getActiveSale(zWorkorder.activeSaleID)
      : null;
    if (activeSale) {
      amountDue = (activeSale.total || 0) - (activeSale.amountCaptured || 0);
    } else {
      let totals = calculateRunningTotals(zWorkorder, zSettings?.salesTaxPercent, [], false, !!zWorkorder.taxFree);
      amountDue = totals.finalTotal;
    }
    let displayAmount = "$" + (amountDue / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    useAlertScreenStore.getState().setValues({
      title: "Send SMS Payment",
      message: "Send a payment link for " + displayAmount + " to " + customerFirst + " at " + customerPhone + "?",
      btn1Text: "Send",
      btn2Text: "Cancel",
      handleBtn1Press: async () => {
        useAlertScreenStore.getState().resetAll();
        let result = await dbCreateTextToPayInvoice(zWorkorder.id, "sms");
        if (result && result.success) {
          useAlertScreenStore.getState().setValues({
            title: "Payment Link Sent",
            message: "Payment link sent to " + customerFirst + ".",
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
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginVertical: 2 }}>
          <View>
            <TouchableOpacity onPress={() => _setActionsOpen(!sActionsOpen)} style={{ padding: 6 }}>
              <Image_ icon={ICONS.menu2} size={22} />
            </TouchableOpacity>
            {sActionsOpen ? (
              <View style={{
                position: "absolute",
                bottom: "100%",
                left: 0,
                backgroundColor: C.listItemWhite,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: "lightgray",
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.15,
                shadowRadius: 6,
                elevation: 5,
                minWidth: 160,
              }}>
                <TouchableOpacity
                  onPress={() => { _setActionsOpen(false); handleSendPaymentLink(); }}
                  style={{ paddingVertical: 12, paddingHorizontal: 14 }}
                >
                  <Text style={{ fontSize: 14, color: C.text }}>Send invoice</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
          <CheckBox_
            isChecked={sNotifyMe}
            onCheck={() => {
              let currentUser = useLoginStore.getState().getCurrentUser();
              if (!currentUser?.phone) {
                useAlertScreenStore.getState().setValues({
                  title: "No Phone Number",
                  message: "Your user profile does not have a phone number. Add one in settings to receive forwarded replies.",
                  btn1Text: "OK",
                  handleBtn1Press: () => useAlertScreenStore.getState().resetAll(),
                  showAlert: true,
                  canExitOnOuterClick: true,
                });
                return;
              }
              _setNotifyMe(!sNotifyMe);
            }}
            text="Notify me"
          />
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
      </View>
      <AlertBox_ showAlert={zShowAlert} />
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

/* eslint-disable */
import { View, Text, TextInput, TouchableOpacity } from "react-native-web";
import { useState } from "react";
import { Button_ } from "../../../../components";
import { C, COLOR_GRADIENTS, Fonts } from "../../../../styles";
import { formatPhoneWithDashes, removeDashesFromPhone, gray } from "../../../../utils";

export function SendReceiptModal({ visible, onSend, onClose }) {
  const [sPhone, _sSetPhone] = useState("");
  const [sEmail, _sSetEmail] = useState("");
  const [sError, _sSetError] = useState("");
  const [sSending, _sSetSending] = useState(false);
  const [sSuccess, _sSetSuccess] = useState("");

  if (!visible) return null;

  function handlePhoneChange(val) {
    let digits = val.replace(/\D/g, "").slice(0, 10);
    _sSetPhone(formatPhoneWithDashes(digits));
    _sSetError("");
  }

  function handleEmailChange(val) {
    _sSetEmail(val);
    _sSetError("");
  }

  function validate() {
    let rawPhone = removeDashesFromPhone(sPhone).replace(/\D/g, "");
    let hasPhone = rawPhone.length > 0;
    let trimmedEmail = sEmail.trim();
    let hasEmail = trimmedEmail.length > 0;
    if (!hasPhone && !hasEmail) return "Enter a phone number or email address";
    if (hasPhone && rawPhone.length !== 10) return "Phone number must be 10 digits";
    if (hasEmail && !trimmedEmail.includes("@")) return "Enter a valid email address";
    return null;
  }

  async function handleSend() {
    let err = validate();
    if (err) {
      _sSetError(err);
      return;
    }
    _sSetError("");
    _sSetSending(true);
    let rawPhone = removeDashesFromPhone(sPhone).replace(/\D/g, "");
    let trimmedEmail = sEmail.trim();
    try {
      await onSend({ phone: rawPhone, email: trimmedEmail });
      _sSetSuccess("Receipt sent!");
      setTimeout(() => {
        _sSetSending(false);
        _sSetSuccess("");
        onClose();
      }, 1200);
    } catch (e) {
      _sSetError("Failed to send receipt");
      _sSetSending(false);
    }
  }

  let formLocked = sSending;

  let inputStyle = {
    fontSize: 16,
    outlineWidth: 0,
    outlineStyle: "none",
    color: C.text,
    borderColor: C.buttonLightGreenOutline,
    borderRadius: 8,
    borderWidth: 2,
    backgroundColor: C.listItemWhite,
    paddingVertical: 8,
    paddingHorizontal: 10,
  };

  let labelStyle = {
    fontSize: 11,
    color: gray(0.5),
    marginBottom: 4,
    fontWeight: Fonts.weight.textHeavy,
  };

  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 999,
      }}
    >
      <TouchableOpacity
        activeOpacity={1}
        onPress={formLocked ? undefined : onClose}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        }}
      />
      <View
        style={{
          backgroundColor: C.backgroundWhite,
          borderRadius: 15,
          paddingVertical: 25,
          paddingHorizontal: 30,
          width: 360,
          alignItems: "center",
          zIndex: 1000,
        }}
      >
        {/* Title */}
        <Text style={{ fontSize: 20, color: gray(0.5), fontWeight: Fonts.weight.textHeavy, marginBottom: 20 }}>
          SEND RECEIPT
        </Text>

        {/* Phone */}
        <View style={{ width: "100%", marginBottom: 12 }}>
          <Text style={labelStyle}>Phone Number</Text>
          <TextInput
            style={inputStyle}
            value={sPhone}
            onChangeText={handlePhoneChange}
            placeholder="239-291-9396"
            placeholderTextColor={gray(0.3)}
            autoFocus={true}
            editable={!formLocked}
          />
        </View>

        {/* Email */}
        <View style={{ width: "100%", marginBottom: 16 }}>
          <Text style={labelStyle}>Email Address</Text>
          <TextInput
            style={inputStyle}
            value={sEmail}
            onChangeText={handleEmailChange}
            placeholder="customer@email.com"
            placeholderTextColor={gray(0.3)}
            editable={!formLocked}
            onSubmitEditing={handleSend}
          />
        </View>

        {/* Status messages */}
        {!!sError && (
          <View style={{ backgroundColor: "rgba(220,50,50,0.1)", borderRadius: 8, paddingVertical: 5, paddingHorizontal: 14, marginBottom: 6 }}>
            <Text style={{ fontSize: 12, color: C.lightred, fontWeight: "500", textAlign: "center" }}>{sError}</Text>
          </View>
        )}
        {!!sSuccess && (
          <View style={{ backgroundColor: "rgba(0,160,0,0.1)", borderRadius: 8, paddingVertical: 5, paddingHorizontal: 14, marginBottom: 6 }}>
            <Text style={{ fontSize: 12, color: C.green, fontWeight: "500", textAlign: "center" }}>{sSuccess}</Text>
          </View>
        )}

        {/* Buttons */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", width: "100%", marginTop: 10 }}>
          <Button_
            text="CANCEL"
            onPress={onClose}
            enabled={!formLocked}
            colorGradientArr={COLOR_GRADIENTS.grey}
            textStyle={{ color: C.textWhite, fontSize: 14 }}
            buttonStyle={{ paddingHorizontal: 20 }}
          />
          <Button_
            text={sSending ? "SENDING..." : "SEND"}
            onPress={handleSend}
            enabled={!formLocked}
            colorGradientArr={COLOR_GRADIENTS.green}
            textStyle={{ color: C.textWhite, fontSize: 14 }}
            buttonStyle={{ paddingHorizontal: 20 }}
          />
        </View>
      </View>
    </View>
  );
}

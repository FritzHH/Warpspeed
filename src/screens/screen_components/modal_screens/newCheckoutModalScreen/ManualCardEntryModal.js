/* eslint-disable */
import { View, Text, TextInput, TouchableOpacity } from "react-native-web";
import { useState, useRef } from "react";
import { Button_, SmallLoadingIndicator } from "../../../../components";
import { C, COLOR_GRADIENTS, Fonts } from "../../../../styles";
import { formatCurrencyDisp, log, gray } from "../../../../utils";
import { newCheckoutProcessManualCardPayment } from "./newCheckoutFirebaseCalls";
import { buildManualCardTransaction } from "./newCheckoutUtils";
import { dlog, DCAT } from "./checkoutDebugLog";

function formatCardNumber(raw) {
  let digits = raw.replace(/\D/g, "").slice(0, 16);
  return digits.replace(/(.{4})/g, "$1 ").trim();
}

export function ManualCardEntryModal({
  amount = 0,
  onClose,
  onPaymentCapture,
  saleID = "",
  customerID = "",
  onCardProcessingStart,
  onCardProcessingEnd,
}) {
  // DEV defaults — remove for production
  const [sCardNumber, _setCardNumber] = useState("4242424242424242");
  const [sCardNumberDisp, _setCardNumberDisp] = useState("4242 4242 4242 4242");
  const [sExpMonth, _setExpMonth] = useState("12");
  const [sExpYear, _setExpYear] = useState("30");
  const [sCvc, _setCvc] = useState("123");
  const [sZip, _setZip] = useState("33900");
  const [sProcessing, _setProcessing] = useState(false);
  const [sDone, _setDone] = useState(false);
  const [sError, _setError] = useState("");
  const [sSuccess, _setSuccess] = useState("");

  const expMonthRef = useRef(null);
  const expYearRef = useRef(null);
  const cvcRef = useRef(null);
  const zipRef = useRef(null);

  function handleCardNumberChange(val) {
    dlog(DCAT.INPUT, "handleCardNumberChange", "ManualCardEntry", { length: val.replace(/\D/g, "").length });
    let digits = val.replace(/\D/g, "").slice(0, 16);
    _setCardNumber(digits);
    _setCardNumberDisp(formatCardNumber(digits));
  }

  function handleExpMonthChange(val) {
    dlog(DCAT.INPUT, "handleExpMonthChange", "ManualCardEntry", { length: val.replace(/\D/g, "").length });
    let digits = val.replace(/\D/g, "").slice(0, 2);
    _setExpMonth(digits);
    if (digits.length === 2 && expYearRef.current) expYearRef.current.focus();
  }

  function handleExpYearChange(val) {
    dlog(DCAT.INPUT, "handleExpYearChange", "ManualCardEntry", { length: val.replace(/\D/g, "").length });
    let digits = val.replace(/\D/g, "").slice(0, 2);
    _setExpYear(digits);
    if (digits.length === 2 && cvcRef.current) cvcRef.current.focus();
  }

  function handleCvcChange(val) {
    dlog(DCAT.INPUT, "handleCvcChange", "ManualCardEntry", { length: val.replace(/\D/g, "").length });
    let digits = val.replace(/\D/g, "").slice(0, 4);
    _setCvc(digits);
    if (digits.length >= 3 && zipRef.current) zipRef.current.focus();
  }

  function handleZipChange(val) {
    dlog(DCAT.INPUT, "handleZipChange", "ManualCardEntry", { length: val.replace(/\D/g, "").length });
    let digits = val.replace(/\D/g, "").slice(0, 5);
    _setZip(digits);
  }

  function validate() {
    if (sCardNumber.length < 13) return "Card number must be at least 13 digits";
    if (!sExpMonth || parseInt(sExpMonth) < 1 || parseInt(sExpMonth) > 12) return "Invalid expiration month";
    if (!sExpYear || sExpYear.length < 2) return "Invalid expiration year";
    if (sCvc.length < 3) return "CVC must be at least 3 digits";
    if (sZip.length < 5) return "Zip code must be 5 digits";
    return null;
  }

  async function handleCharge() {
    dlog(DCAT.BUTTON, "handleCharge", "ManualCardEntry", { amount, saleID, customerID });
    let err = validate();
    if (err) {
      dlog(DCAT.ACTION, "handleCharge_validationError", "ManualCardEntry", { error: err });
      _setError(err);
      return;
    }

    _setProcessing(true);
    _setError("");
    _setSuccess("");

    if (onCardProcessingStart) onCardProcessingStart(amount);

    try {
      let expYearFull = 2000 + parseInt(sExpYear);
      let result = await newCheckoutProcessManualCardPayment(
        amount,
        sCardNumber,
        parseInt(sExpMonth),
        expYearFull,
        sCvc,
        sZip,
        saleID,
        customerID
      );

      if (result?.success) {
        let payment = buildManualCardTransaction(result.data.charge);
        dlog(DCAT.ACTION, "handleCharge_success", "ManualCardEntry", { amountCaptured: payment.amountCaptured });
        _setSuccess(`Payment of ${formatCurrencyDisp(payment.amountCaptured)} approved`);
        _setDone(true);
        _setProcessing(false);
        if (onPaymentCapture) onPaymentCapture(payment);
        if (onCardProcessingEnd) onCardProcessingEnd();
        setTimeout(() => { if (onClose) onClose(); }, 1200);
      } else {
        dlog(DCAT.ACTION, "handleCharge_failed", "ManualCardEntry", { message: result?.message });
        _setError(result?.message || "Payment failed");
        _setProcessing(false);
        if (onCardProcessingEnd) onCardProcessingEnd();
      }
    } catch (error) {
      dlog(DCAT.ACTION, "handleCharge_error", "ManualCardEntry", { message: error?.message });
      log("ManualCardEntryModal charge error:", error);
      _setError(error?.message || "Payment failed");
      _setProcessing(false);
      if (onCardProcessingEnd) onCardProcessingEnd();
    }
  }

  let formLocked = sProcessing || sDone;
  let chargeEnabled = !formLocked && sCardNumber.length >= 13 && sExpMonth && sExpYear && sCvc.length >= 3 && sZip.length >= 5;

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
          MANUAL CARD ENTRY
        </Text>

        {/* Card Number */}
        <View style={{ width: "100%", marginBottom: 12 }}>
          <Text style={labelStyle}>Card Number</Text>
          <TextInput
            style={{ ...inputStyle, letterSpacing: 2 }}
            value={sCardNumberDisp}
            onChangeText={handleCardNumberChange}
            placeholder="0000 0000 0000 0000"
            placeholderTextColor={gray(0.3)}
            autoFocus={true}
            editable={!formLocked}
            onSubmitEditing={() => expMonthRef.current?.focus()}
          />
        </View>

        {/* Exp + CVC row */}
        <View style={{ flexDirection: "row", width: "100%", marginBottom: 12 }}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={labelStyle}>Exp Month</Text>
            <TextInput
              ref={expMonthRef}
              style={inputStyle}
              value={sExpMonth}
              onChangeText={handleExpMonthChange}
              placeholder="MM"
              placeholderTextColor={gray(0.3)}
              editable={!formLocked}
            />
          </View>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={labelStyle}>Exp Year</Text>
            <TextInput
              ref={expYearRef}
              style={inputStyle}
              value={sExpYear}
              onChangeText={handleExpYearChange}
              placeholder="YY"
              placeholderTextColor={gray(0.3)}
              editable={!formLocked}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={labelStyle}>CVC</Text>
            <TextInput
              ref={cvcRef}
              style={inputStyle}
              value={sCvc}
              onChangeText={handleCvcChange}
              placeholder="123"
              placeholderTextColor={gray(0.3)}
              editable={!formLocked}
            />
          </View>
        </View>

        {/* Zip */}
        <View style={{ width: "100%", marginBottom: 16 }}>
          <Text style={labelStyle}>Billing Zip Code</Text>
          <TextInput
            ref={zipRef}
            style={{ ...inputStyle, width: 120 }}
            value={sZip}
            onChangeText={handleZipChange}
            placeholder="00000"
            placeholderTextColor={gray(0.3)}
            editable={!formLocked}
            onSubmitEditing={handleCharge}
          />
        </View>

        {/* Amount display */}
        <Text style={{ fontSize: 16, color: C.text, fontWeight: Fonts.weight.textHeavy, marginBottom: 10 }}>
          Charging: ${formatCurrencyDisp(amount)}
        </Text>

        {/* Status messages */}
        {sProcessing && (
          <SmallLoadingIndicator color={C.green} text="" message="" containerStyle={{ padding: 2, marginBottom: 6 }} />
        )}
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
            onPress={() => { dlog(DCAT.BUTTON, "cancel", "ManualCardEntry", {}); onClose(); }}
            enabled={!formLocked}
            colorGradientArr={COLOR_GRADIENTS.grey}
            textStyle={{ color: C.textWhite, fontSize: 14 }}
            buttonStyle={{ paddingHorizontal: 20 }}
          />
          <Button_
            text={`CHARGE $${formatCurrencyDisp(amount)}`}
            onPress={handleCharge}
            enabled={chargeEnabled}
            colorGradientArr={COLOR_GRADIENTS.green}
            textStyle={{ color: C.textWhite, fontSize: 14 }}
            buttonStyle={{ paddingHorizontal: 20, cursor: chargeEnabled ? "inherit" : "default" }}
          />
        </View>
      </View>
    </View>
  );
}

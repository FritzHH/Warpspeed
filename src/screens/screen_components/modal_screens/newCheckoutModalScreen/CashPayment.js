/* eslint-disable */
import { View, Text, TextInput, Image } from "react-native-web";
import { useState, useRef, memo } from "react";
import { Button_, CheckBox_, SHADOW_RADIUS_PROTO } from "../../../../components";
import { C, COLOR_GRADIENTS, Fonts, ICONS } from "../../../../styles";
import {
  usdTypeMask,
  formatCurrencyDisp,
  gray,
} from "../../../../utils";
import { buildCashTransaction } from "./newCheckoutUtils";

export const CashPayment = memo(function CashPayment({
  amountLeftToPay = 0,
  onPaymentCapture,
  acceptChecks = false,
  saleComplete = false,
  onCashChange,
  hasReaders = false,
  isVisible = false,
  lockAmount = false,
}) {
  const [sPayAmount, _setPayAmount] = useState("");
  const [sPayAmountDisp, _setPayAmountDisp] = useState("");
  const [sTenderAmount, _setTenderAmount] = useState("");
  const [sTenderAmountDisp, _setTenderAmountDisp] = useState("");
  const [sIsCheck, _setIsCheck] = useState(false);
  const [sFocused, _setFocused] = useState("");
  const [sStatusMessage, _setStatusMessage] = useState("");
  const [sDone, _setDone] = useState(false);
  const [sSuccessMsg, _setSuccessMsg] = useState("");

  const tenderInputRef = useRef(null);
  const autoLoadedRef = useRef(false);
  const prevAmountRef = useRef(amountLeftToPay);

  // Auto-load amountLeftToPay into pay amount on first availability
  if (amountLeftToPay > 0 && !autoLoadedRef.current && isVisible) {
    autoLoadedRef.current = true;
    prevAmountRef.current = amountLeftToPay;
    _setPayAmountDisp(formatCurrencyDisp(amountLeftToPay));
    _setPayAmount(amountLeftToPay);
    if (!hasReaders) {
      setTimeout(() => tenderInputRef.current?.focus(), 100);
    }
  }

  // Sync display when balance changes externally (other payment captured, card processing)
  if (autoLoadedRef.current && amountLeftToPay !== prevAmountRef.current) {
    prevAmountRef.current = amountLeftToPay;
    if (amountLeftToPay > 0) {
      _setPayAmountDisp(formatCurrencyDisp(amountLeftToPay));
      _setPayAmount(amountLeftToPay);
    } else {
      _setPayAmountDisp("");
      _setPayAmount(0);
    }
    _setTenderAmountDisp("");
    _setTenderAmount(0);
  }

  function handlePayAmountChange(val) {
    let result = usdTypeMask(val, { withDollar: false });
    if (result.cents > amountLeftToPay) {
      _setPayAmountDisp(formatCurrencyDisp(amountLeftToPay));
      _setPayAmount(amountLeftToPay);

      return;
    }
    _setPayAmountDisp(result.display);
    _setPayAmount(result.cents);

  }

  function handleTenderAmountChange(val) {
    let result = usdTypeMask(val, { withDollar: false });
    _setTenderAmountDisp(result.display);
    _setTenderAmount(result.cents);
  }

  function handleProcessPayment() {
    if (!sPayAmount || sPayAmount <= 0) {
      _setStatusMessage("Enter a payment amount");
      return;
    }
    if (sPayAmount > amountLeftToPay) {
      _setStatusMessage("Amount exceeds balance due");
      return;
    }

    let tenderCents = sTenderAmount || sPayAmount;
    if (!sIsCheck && tenderCents < sPayAmount) {
      _setStatusMessage("Tender amount must be >= pay amount");
      return;
    }

    let payment = buildCashTransaction(sPayAmount, tenderCents, sIsCheck);

    // Calculate change
    let change = tenderCents - sPayAmount;
    if (change > 0 && onCashChange) {
      onCashChange(change);
    }

    if (onPaymentCapture) onPaymentCapture(payment);

    // Show celebration
    _setSuccessMsg(`Payment of $${formatCurrencyDisp(payment.amountCaptured)} approved`);
    _setDone(true);

    // Reset inputs
    _setPayAmount("");
    _setPayAmountDisp("");
    _setTenderAmount("");
    _setTenderAmountDisp("");
    _setStatusMessage("");
    _setIsCheck(false);

    // If partial payment, reset back to form after brief celebration
    let newRemaining = amountLeftToPay - payment.amountCaptured;
    if (newRemaining > 0) {
      setTimeout(() => {
        _setDone(false);
        _setSuccessMsg("");
      }, 3000);
    }
  }

  let isEnabled = !saleComplete && amountLeftToPay > 0;

  // ── Success celebration ──
  let celebrationGif = saleComplete ? ICONS.guyCelebrating : ICONS.popperCelebration;

  if (sDone) {
    return (
      <View
        style={{
          alignItems: "center",
          width: "100%",
          height: "48%",
          borderRadius: 15,
          ...SHADOW_RADIUS_PROTO,
          justifyContent: "center",
          paddingHorizontal: 15,
        }}
      >
        <View style={{ alignItems: "center" }}>
          <Image
            source={celebrationGif}
            style={{ width: 100, height: 100, marginBottom: 14, backgroundColor: "transparent" }}
            resizeMode="contain"
          />
          <Text style={{ fontSize: 15, color: C.green, fontWeight: "600", textAlign: "center" }}>
            {saleComplete ? "Full payment complete!" : sSuccessMsg}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View
      pointerEvents={saleComplete || amountLeftToPay <= 0 ? "none" : "auto"}
      style={{
        alignItems: "center",
        paddingTop: 20,
        width: "100%",
        height: "48%",
        borderRadius: 15,
        ...SHADOW_RADIUS_PROTO,
        justifyContent: "space-between",
        paddingBottom: 20,
        opacity: saleComplete || amountLeftToPay <= 0 ? 0.2 : 1,
      }}
    >
      {/* Check checkbox */}
      {!!acceptChecks && (
        <View
          style={{ width: "100%", alignItems: "flex-start", paddingLeft: 10 }}
        >
          <CheckBox_
            enabled={isEnabled}
            textStyle={{ fontSize: 12 }}
            text={"Paper Check"}
            onCheck={() => _setIsCheck(!sIsCheck)}
            isChecked={sIsCheck}
          />
        </View>
      )}

      {/* Title */}
      <Text
        style={{
          fontSize: 25,
          color: gray(0.6),
          fontWeight: 600,
        }}
      >
        {sIsCheck ? "CHECK SALE" : "CASH SALE"}
      </Text>

      {/* Balance + Pay Amount Box */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "flex-end",
          alignItems: "center",
          marginTop: 5,
          backgroundColor: C.listItemWhite,
          padding: 10,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: C.buttonLightGreenOutline,
          width: "70%",
        }}
      >
        <View
          style={{
            alignItems: "flex-end",
            justifyContent: "space-between",
            height: "100%",
            paddingRight: 5,
          }}
        >
          <Text style={{ color: C.text, marginTop: 4 }}>Balance</Text>
          <Text style={{ marginBottom: 15, color: C.text }}>Pay Amount</Text>
        </View>
        <View style={{ alignItems: "flex-end", marginLeft: 10 }}>
          <Text
            style={{
              fontSize: 15,
              padding: 5,
              paddingRight: 1,
              color: C.text,
            }}
          >
            {"$ " + formatCurrencyDisp(amountLeftToPay)}
          </Text>
          <View
            style={{
              marginLeft: 10,
              borderColor: C.buttonLightGreenOutline,
              borderRadius: 10,
              borderWidth: 2,
              backgroundColor: C.listItemWhite,
              paddingVertical: 10,
              paddingHorizontal: 10,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingBottom: 6,
              paddingRight: 7,
            }}
          >
            <Text style={{ fontSize: 15 }}>$</Text>
            <View
              style={{
                width: 100,
                alignItems: "flex-end",
                paddingRight: 5,
              }}
            >
              <TextInput
                onFocus={() => {
                  if (lockAmount) return;
                  _setFocused("pay");
                  _setPayAmountDisp("");
                  _setPayAmount(0);
                }}
                style={{
                  fontSize: 20,
                  outlineWidth: 0,
                  outlineStyle: "none",
                  color: lockAmount ? gray(0.5) : C.text,
                  paddingRight: 2,
                  textAlign: "right",
                }}
                placeholder="0.00"
                placeholderTextColor={gray(0.3)}
                value={sPayAmountDisp}
                onChangeText={handlePayAmountChange}
                editable={isEnabled && !lockAmount}
              />
            </View>
          </View>
        </View>
      </View>

      {/* Tender Amount */}
      {!sIsCheck && (
        <View
          style={{
            width: "100%",
            alignItems: "center",
            marginVertical: 5,
          }}
        >
          <View
            style={{
              borderColor: C.buttonLightGreenOutline,
              borderRadius: 10,
              borderWidth: 2,
              backgroundColor: C.listItemWhite,
              paddingVertical: 10,
              paddingHorizontal: 10,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              width: "35%",
              paddingBottom: 6,
            }}
          >
            <Text style={{ fontSize: 15, color: C.green }}>$</Text>
            <View
              style={{
                width: "100%",
                alignItems: "flex-end",
                paddingRight: 5,
              }}
            >
              <TextInput
                ref={tenderInputRef}
                onFocus={() => {
                  _setFocused("tender");
                  _setTenderAmountDisp("");
                  _setTenderAmount(0);
                }}
                style={{
                  outlineWidth: 0,
                  outlineStyle: "none",
                  fontSize: 25,
                  textAlign: "right",
                  color: C.green,
                  width: "90%",
                }}
                placeholder="0.00"
                placeholderTextColor={gray(0.3)}
                value={sTenderAmountDisp}
                onChangeText={handleTenderAmountChange}
                editable={isEnabled}
              />
              <Text
                style={{
                  fontStyle: "italic",
                  color: "darkgray",
                  fontSize: 12,
                }}
              >
                Tender
              </Text>
              {sTenderAmount > 0 && sPayAmount > 0 && sTenderAmount >= sPayAmount && (
                <Text
                  style={{
                    fontSize: 13,
                    color: C.green,
                    fontWeight: "600",
                    marginTop: 2,
                  }}
                >
                  {"Change: $" + formatCurrencyDisp(sTenderAmount - sPayAmount)}
                </Text>
              )}
            </View>
          </View>
        </View>
      )}

      {/* Status Message */}
      {sStatusMessage ? (
        <Text
          style={{
            fontSize: 11,
            color: C.lightred,
            fontStyle: "italic",
            marginBottom: 4,
          }}
        >
          {sStatusMessage}
        </Text>
      ) : null}

      {/* Process Button */}
      {(() => {
        let canComplete = isEnabled && sPayAmount > 0 && (sIsCheck || sTenderAmount >= sPayAmount);
        return (
          <Button_
            text="COMPLETE PAYMENT"
            onPress={handleProcessPayment}
            enabled={canComplete}
            colorGradientArr={COLOR_GRADIENTS.green}
            textStyle={{ color: C.textWhite, fontSize: 16 }}
            buttonStyle={{
              cursor: canComplete ? "inherit" : "default", borderRadius: 6
            }}
          />
        );
      })()}
    </View>
  );
});

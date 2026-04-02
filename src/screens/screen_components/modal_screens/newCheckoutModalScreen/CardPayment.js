/* eslint-disable */
import { View, Text, TextInput, Animated, Image } from "react-native-web";
import { useState, useRef, memo } from "react";
import { Button_, SHADOW_RADIUS_PROTO, SmallLoadingIndicator } from "../../../../components";
import { C, COLOR_GRADIENTS, Fonts, ICONS } from "../../../../styles";
import { usdTypeMask, formatCurrencyDisp, log, gray } from "../../../../utils";
import { dbRequestNewId } from "../../../../db_calls_wrapper";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardNumberElement, CardExpiryElement, CardCvcElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { STRIPE_PUBLISHABLE_KEY } from "../../../../private_user_constants";
import { buildManualCardTransaction } from "./newCheckoutUtils";
import { newCheckoutProcessManualCardPayment } from "./newCheckoutFirebaseCalls";

const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);

// Stripe Element appearance (renders inside Stripe's secure iframe)
// Defined at module level so the reference is stable across renders —
// new object refs cause Stripe to call element.update() and flash the iframe
const STRIPE_ELEMENT_STYLE = {
  base: {
    fontSize: "14px",
    color: "#333",
    "::placeholder": { color: "rgb(192,192,192)" },
  },
  invalid: { color: "#e53e3e" },
};
const STRIPE_ELEMENT_OPTIONS = { style: STRIPE_ELEMENT_STYLE };

function CardPaymentForm({
  amountLeftToPay = 0,
  onPaymentCapture,
  saleComplete = false,
  saleID = "",
  customerID = "",
  customerEmail = "",
  onCardProcessingStart,
  onCardProcessingEnd,
  onSwitchToReader,
  onPaymentStarted,
  lockAmount = false,
  transactionId = null,
  onTransactionIdUsed,
}) {
  const stripe = useStripe();
  const elements = useElements();

  // ── Amount state ──
  const [sRequestedAmount, _setRequestedAmount] = useState("");
  const [sRequestedAmountDisp, _setRequestedAmountDisp] = useState("");

  // ── Zip (not handled by Stripe Elements) ──
  const [sZip, _setZip] = useState("33900"); // DEV default — remove for production

  // ── Stripe Element completeness ──
  const [sCardComplete, _setCardComplete] = useState(false);
  const [sExpComplete, _setExpComplete] = useState(false);
  const [sCvcComplete, _setCvcComplete] = useState(false);

  // ── Elements ready state ──
  const [sCardReady, _setCardReady] = useState(false);

  // ── Process state ──
  const [sProcessing, _setProcessing] = useState(false);
  const [sDone, _setDone] = useState(false);
  const [sError, _setError] = useState("");
  const [sSuccess, _setSuccess] = useState("");

  const [sButtonFocused, _setButtonFocused] = useState(false);

  const autoLoadedRef = useRef(false);
  const prevAmountRef = useRef(amountLeftToPay);
  const zipRef = useRef(null);
  const startBtnRef = useRef(null);

  // ── Focus chain: Amount → Card → Zip → Exp → CVC → Start button ──
  function focusCardNumber() {
    if (!elements) return;
    let el = elements.getElement(CardNumberElement);
    if (el) el.focus();
  }
  function focusZip() {
    if (zipRef.current) zipRef.current.focus();
  }
  function focusExpiry() {
    if (!elements) return;
    let el = elements.getElement(CardExpiryElement);
    if (el) el.focus();
  }
  function focusCvc() {
    if (!elements) return;
    let el = elements.getElement(CardCvcElement);
    if (el) el.focus();
  }
  function focusStartButton() {
    if (startBtnRef.current) startBtnRef.current.focus();
  }

  // ── Amount handler ──
  function handleAmountChange(val) {
    let result = usdTypeMask(val, { withDollar: false });
    if (result.cents > amountLeftToPay) {
      _setRequestedAmountDisp(formatCurrencyDisp(amountLeftToPay));
      _setRequestedAmount(amountLeftToPay);
      return;
    }
    _setRequestedAmountDisp(result.display);
    _setRequestedAmount(result.cents);
  }

  function handleZipChange(val) {
    let digits = val.replace(/\D/g, "").slice(0, 5);
    _setZip(digits);
    if (digits.length >= 5) focusExpiry();
  }

  // ── Validation ──
  function validate() {
    if (!sRequestedAmount || sRequestedAmount < 50) return "Minimum card payment is $0.50";
    if (sRequestedAmount > amountLeftToPay) return "Amount exceeds balance due";
    if (!sCardComplete) return "Card number is incomplete";
    if (!sExpComplete) return "Expiration is incomplete";
    if (!sCvcComplete) return "CVC is incomplete";
    if (sZip.length < 5) return "Zip code must be 5 digits";
    return null;
  }

  // ── Charge handler ──
  async function handleCharge() {
    let err = validate();
    if (err) {
      _setError(err);
      return;
    }
    if (!stripe || !elements) {
      _setError("Payment system not loaded yet");
      return;
    }

    // Grab the element ref synchronously BEFORE any state changes
    const cardElement = elements.getElement(CardNumberElement);

    // Lock the form and show loading — React batches these into one render
    _setProcessing(true);
    _setError("");
    _setSuccess("");

    try {
      const { paymentMethod, error: pmError } = await stripe.createPaymentMethod({
        type: "card",
        card: cardElement,
        billing_details: { address: { postal_code: sZip } },
      });

      if (pmError) {
        _setError(pmError.message);
        _setProcessing(false);
        return;
      }

      if (onCardProcessingStart) onCardProcessingStart(sRequestedAmount);

      let transactionID = transactionId || dbRequestNewId("transactions");
      if (transactionId && onTransactionIdUsed) onTransactionIdUsed();

      // Notify parent to add pending ID to sale before payment starts
      if (onPaymentStarted) onPaymentStarted(transactionID);

      let result = await newCheckoutProcessManualCardPayment(
        Math.round(sRequestedAmount),
        paymentMethod.id,
        saleID,
        customerID,
        customerEmail,
        transactionID
      );

      if (result?.success) {
        let payment = buildManualCardTransaction(result.data.charge, transactionID);
        _setSuccess(`Payment of ${formatCurrencyDisp(payment.amountCaptured)} approved`);
        _setDone(true);
        _setProcessing(false);
        if (onPaymentCapture) onPaymentCapture(payment);
        if (onCardProcessingEnd) onCardProcessingEnd();

        // If partial payment, reset back to form after a brief celebration
        let newRemaining = amountLeftToPay - payment.amountCaptured;
        if (newRemaining > 0) {
          setTimeout(() => {
            _setDone(false);
            _setSuccess("");
          }, 3000);
        }
      } else {
        _setError(result?.message || "Payment failed");
        _setProcessing(false);
        if (onCardProcessingEnd) onCardProcessingEnd();
      }
    } catch (error) {
      log("CardPayment charge error:", error);
      _setError(error?.message || "Payment failed");
      _setProcessing(false);
      if (onCardProcessingEnd) onCardProcessingEnd();
    }
  }

  // ── Auto-load amount ──
  if (amountLeftToPay > 0 && !autoLoadedRef.current) {
    autoLoadedRef.current = true;
    prevAmountRef.current = amountLeftToPay;
    _setRequestedAmountDisp(formatCurrencyDisp(amountLeftToPay));
    _setRequestedAmount(amountLeftToPay);
  }

  if (autoLoadedRef.current && amountLeftToPay !== prevAmountRef.current) {
    prevAmountRef.current = amountLeftToPay;
    if (amountLeftToPay > 0) {
      _setRequestedAmountDisp(formatCurrencyDisp(amountLeftToPay));
      _setRequestedAmount(amountLeftToPay);
    } else {
      _setRequestedAmountDisp("");
      _setRequestedAmount(0);
    }
  }

  // ── Success animation ──
  // ── Derived ──
  let formLocked = sProcessing || sDone || saleComplete;
  let chargeEnabled = !formLocked && sRequestedAmount >= 50 && sCardReady && sCardComplete && sExpComplete && sCvcComplete && sZip.length >= 5 && !!stripe;

  let elementContainerStyle = {
    borderColor: C.buttonLightGreenOutline,
    borderRadius: 8,
    borderWidth: 2,
    backgroundColor: C.listItemWhite,
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 8,
    paddingRight: 8,
  };

  let inputStyle = {
    fontSize: 14,
    outlineWidth: 0,
    outlineStyle: "none",
    color: C.text,
    borderColor: C.buttonLightGreenOutline,
    borderRadius: 8,
    borderWidth: 2,
    backgroundColor: C.listItemWhite,
    paddingVertical: 6,
    paddingHorizontal: 8,
  };

  let labelStyle = {
    fontSize: 10,
    color: gray(0.5),
    marginBottom: 2,
    fontWeight: Fonts.weight.textHeavy,
  };

  // ── Success celebration ──
  let celebrationGif = saleComplete ? ICONS.guyCelebrating : ICONS.popperCelebration;

  if (sDone) {
    return (
      <View
        style={{
          alignItems: "center",
          width: "100%",
          height: "48%",
          borderRadius: 6,
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
            {saleComplete ? "Full payment complete!" : sSuccess}
          </Text>
        </View>
      </View>
    );
  }

  // ── Form ──
  return (
    <View
      pointerEvents={saleComplete || sProcessing ? "none" : "auto"}
      style={{
        alignItems: "center",
        paddingTop: 15,
        width: "100%",
        height: "48%",
        borderRadius: 6,
        ...SHADOW_RADIUS_PROTO,
        justifyContent: "space-between",
        paddingBottom: 15,
        paddingHorizontal: 15,
        opacity: saleComplete ? 0.2 : 1,
      }}
    >
      {/* Processing overlay — covers form + Stripe iframes immediately */}
      {sProcessing && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(255,255,255,0.88)",
            justifyContent: "center",
            alignItems: "center",
            borderRadius: 6,
            zIndex: 10,
          }}
        >
          <SmallLoadingIndicator color={C.green} text="" message="" containerStyle={{ padding: 2 }} />
          <Text style={{ fontSize: 13, color: gray(0.5), fontWeight: "600", marginTop: 8 }}>Processing payment...</Text>
          {!!sError && (
            <Text style={{ fontSize: 13, color: C.lightred, fontWeight: "600", textAlign: "center", marginTop: 8 }}>{sError}</Text>
          )}
        </View>
      )}

      {/* Title */}
      <Text style={{ fontSize: 22, color: gray(0.6), fontWeight: 500 }}>
        MANUAL CARD SALE
      </Text>

      {/* Payment Amount Input */}
      <View
        pointerEvents={formLocked ? "none" : "auto"}
        style={{
          borderColor: C.buttonLightGreenOutline,
          borderRadius: 10,
          borderWidth: 2,
          backgroundColor: C.listItemWhite,
          paddingVertical: 6,
          paddingHorizontal: 10,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          width: "60%",
        }}
      >
        <Text style={{ fontSize: 15 }}>$</Text>
        <View style={{ width: 100, alignItems: "flex-end", paddingRight: 5 }}>
          <TextInput
            onFocus={() => {
              if (lockAmount) return;
              _setRequestedAmountDisp("");
              _setRequestedAmount(0);
            }}
            style={{
              fontSize: 18,
              outlineWidth: 0,
              outlineStyle: "none",
              color: lockAmount ? gray(0.5) : C.text,
              paddingRight: 2,
              textAlign: "right",
            }}
            placeholder="0.00"
            placeholderTextColor={gray(0.3)}
            value={sRequestedAmountDisp}
            onChangeText={handleAmountChange}
            editable={!formLocked && !lockAmount}
            onSubmitEditing={focusCardNumber}
          />
        </View>
      </View>

      {/* Card Number + Zip row */}
      <View pointerEvents={formLocked ? "none" : "auto"} style={{ flexDirection: "row", width: "100%", opacity: formLocked ? 0.5 : 1 }}>
        <View style={{ flex: 3, marginRight: 6 }}>
          <Text style={labelStyle}>Card Number</Text>
          <View style={elementContainerStyle}>
            <CardNumberElement
              options={STRIPE_ELEMENT_OPTIONS}
              onReady={() => _setCardReady(true)}
              onChange={(e) => {
                _setCardComplete(e.complete);
                if (e.complete) focusZip();
              }}
            />
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={labelStyle}>Zip</Text>
          <TextInput
            ref={zipRef}
            style={inputStyle}
            value={sZip}
            onChangeText={handleZipChange}
            placeholder="00000"
            placeholderTextColor={gray(0.3)}
            editable={!formLocked}
            onSubmitEditing={focusExpiry}
            autoComplete="off"
            name="zp-inp"
          />
        </View>
      </View>

      {/* Exp + CVC row */}
      <View pointerEvents={formLocked ? "none" : "auto"} style={{ flexDirection: "row", width: "100%", opacity: formLocked ? 0.5 : 1 }}>
        <View style={{ flex: 1, marginRight: 6 }}>
          <Text style={labelStyle}>Expiration</Text>
          <View style={elementContainerStyle}>
            <CardExpiryElement
              options={STRIPE_ELEMENT_OPTIONS}
              onChange={(e) => {
                _setExpComplete(e.complete);
                if (e.complete) focusCvc();
              }}
            />
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={labelStyle}>CVC</Text>
          <View style={elementContainerStyle}>
            <CardCvcElement
              options={STRIPE_ELEMENT_OPTIONS}
              onChange={(e) => {
                _setCvcComplete(e.complete);
                if (e.complete) focusStartButton();
              }}
            />
          </View>
        </View>
      </View>

      {/* Status messages */}
      <View style={{ alignItems: "center", justifyContent: "center", minHeight: 30 }}>
        {sProcessing && !sError && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <SmallLoadingIndicator color={C.green} text="" message="" containerStyle={{ padding: 2 }} />
            <Text style={{ fontSize: 13, color: gray(0.5), fontWeight: "600" }}>Processing payment...</Text>
          </View>
        )}
        {!!sError && (
          <Text style={{ fontSize: 13, color: C.lightred, fontWeight: "600", textAlign: "center" }}>{sError}</Text>
        )}
      </View>

      {/* Action Buttons */}
      <View style={{ flexDirection: "row", alignItems: "center", width: "100%" }}>
        <View style={{ width: "33%", alignItems: "flex-start", paddingLeft: 7 }} />
        <View
          ref={startBtnRef}
          tabIndex={0}
          onFocus={() => _setButtonFocused(true)}
          onBlur={() => _setButtonFocused(false)}
          onKeyDown={(e) => { if (e.key === "Enter" && chargeEnabled) handleCharge(); }}
          style={{ width: "33%", alignItems: "center", outlineStyle: "none" }}
        >
          <Button_
            text="Start Sale"
            onPress={handleCharge}
            enabled={chargeEnabled}
            colorGradientArr={COLOR_GRADIENTS.green}
            textStyle={{ color: C.textWhite, fontSize: 16 }}
            buttonStyle={{
              paddingHorizontal: 30,
              cursor: chargeEnabled ? "inherit" : "default",
              borderWidth: sButtonFocused ? 1 : 0,
              borderColor: sButtonFocused ? gray(0.4) : "transparent",
            }}
          />
        </View>
        <View style={{ width: "33%", alignItems: "flex-end", paddingRight: 7 }}>
          <Button_
            text="Card Reader"
            onPress={onSwitchToReader}
            enabled={!formLocked}
            colorGradientArr={COLOR_GRADIENTS.blue}
            textStyle={{ color: C.textWhite, fontSize: 11 }}
            buttonStyle={{ paddingVertical: 2, paddingRight: 10, width: 90, cursor: formLocked ? "default" : "inherit" }}
          />
        </View>
      </View>
    </View>
  );
}

// Wrapper provides Stripe Elements context
export const CardPayment = memo(function CardPayment(props) {
  return (
    <Elements stripe={stripePromise}>
      <CardPaymentForm {...props} />
    </Elements>
  );
});

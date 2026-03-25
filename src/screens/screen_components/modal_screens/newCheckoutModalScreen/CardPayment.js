/* eslint-disable */
import { View, Text, TextInput, Animated } from "react-native-web";
import { useState, useRef } from "react";
import { Button_, SHADOW_RADIUS_PROTO, SmallLoadingIndicator } from "../../../../components";
import { C, COLOR_GRADIENTS, Fonts } from "../../../../styles";
import { usdTypeMask, formatCurrencyDisp, log, gray } from "../../../../utils";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardNumberElement, CardExpiryElement, CardCvcElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { STRIPE_PUBLISHABLE_KEY } from "../../../../private_user_constants";
import { buildManualCardPayment } from "./newCheckoutUtils";
import { newCheckoutProcessManualCardPayment } from "./newCheckoutFirebaseCalls";

const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);

// Stripe Element appearance (renders inside Stripe's secure iframe)
const STRIPE_ELEMENT_STYLE = {
  base: {
    fontSize: "14px",
    color: "#333",
    "::placeholder": { color: "rgb(77,77,77)" },
  },
  invalid: { color: "#e53e3e" },
};

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

  const autoLoadedRef = useRef(false);
  const prevAmountRef = useRef(amountLeftToPay);
  const zipRef = useRef(null);

  const successScale = useRef(new Animated.Value(0)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;
  const successPulse = useRef(new Animated.Value(1)).current;
  const successAnimStarted = useRef(false);

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

    _setError("");
    _setSuccess("");

    try {
      // Tokenize BEFORE any state changes — setting processing/disabled re-renders
      // the Stripe Elements which makes them unreadable mid-transition
      const cardElement = elements.getElement(CardNumberElement);
      const { paymentMethod, error: pmError } = await stripe.createPaymentMethod({
        type: "card",
        card: cardElement,
        billing_details: { address: { postal_code: sZip } },
      });

      if (pmError) {
        _setError(pmError.message);
        return;
      }

      // Now safe to set processing state — we already have the PM ID
      _setProcessing(true);
      if (onCardProcessingStart) onCardProcessingStart(sRequestedAmount);

      let result = await newCheckoutProcessManualCardPayment(
        sRequestedAmount,
        paymentMethod.id,
        saleID,
        customerID,
        customerEmail
      );

      if (result?.success) {
        let payment = buildManualCardPayment(result.data.charge);
        _setSuccess(`Payment of ${formatCurrencyDisp(payment.amountCaptured)} approved`);
        _setDone(true);
        _setProcessing(false);
        if (onPaymentCapture) onPaymentCapture(payment);
        if (onCardProcessingEnd) onCardProcessingEnd();
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
  if (sDone && !successAnimStarted.current) {
    successAnimStarted.current = true;
    Animated.parallel([
      Animated.spring(successScale, { toValue: 1, friction: 4, tension: 80, useNativeDriver: false }),
      Animated.timing(successOpacity, { toValue: 1, duration: 300, useNativeDriver: false }),
    ]).start(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(successPulse, { toValue: 1.06, duration: 800, useNativeDriver: false }),
          Animated.timing(successPulse, { toValue: 1, duration: 800, useNativeDriver: false }),
        ])
      ).start();
    });
  }

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

  return (
    <View
      pointerEvents={saleComplete ? "none" : "auto"}
      style={{
        alignItems: "center",
        paddingTop: 15,
        width: "100%",
        height: "48%",
        borderRadius: 15,
        ...SHADOW_RADIUS_PROTO,
        justifyContent: "space-between",
        paddingBottom: 15,
        paddingHorizontal: 15,
        opacity: saleComplete ? 0.2 : 1,
      }}
    >
      {/* Title */}
      <Text style={{ fontSize: 22, color: gray(0.6), fontWeight: 500 }}>
        MANUAL CARD SALE
      </Text>

      {/* Payment Amount Input */}
      <View
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
              _setRequestedAmountDisp("");
              _setRequestedAmount(0);
            }}
            style={{
              fontSize: 18,
              outlineWidth: 0,
              outlineStyle: "none",
              color: C.text,
              paddingRight: 2,
              textAlign: "right",
            }}
            placeholder="0.00"
            placeholderTextColor={gray(0.3)}
            value={sRequestedAmountDisp}
            onChangeText={handleAmountChange}
            editable={!formLocked}
          />
        </View>
      </View>

      {/* Card Number + Zip row */}
      <View style={{ flexDirection: "row", width: "100%" }}>
        <View style={{ flex: 3, marginRight: 6 }}>
          <Text style={labelStyle}>Card Number</Text>
          <View style={elementContainerStyle}>
            <CardNumberElement
              options={{ style: STRIPE_ELEMENT_STYLE }}
              onReady={() => _setCardReady(true)}
              onChange={(e) => _setCardComplete(e.complete)}
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
            onSubmitEditing={handleCharge}
            autoComplete="off"
            name="zp-inp"
          />
        </View>
      </View>

      {/* Exp + CVC row */}
      <View style={{ flexDirection: "row", width: "100%" }}>
        <View style={{ flex: 1, marginRight: 6 }}>
          <Text style={labelStyle}>Expiration</Text>
          <View style={elementContainerStyle}>
            <CardExpiryElement
              options={{ style: STRIPE_ELEMENT_STYLE }}
              onChange={(e) => _setExpComplete(e.complete)}
            />
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={labelStyle}>CVC</Text>
          <View style={elementContainerStyle}>
            <CardCvcElement
              options={{ style: STRIPE_ELEMENT_STYLE }}
              onChange={(e) => _setCvcComplete(e.complete)}
            />
          </View>
        </View>
      </View>

      {/* Status messages */}
      <View style={{ alignItems: "center", justifyContent: "center", minHeight: 30 }}>
        {sProcessing && (
          <SmallLoadingIndicator color={C.green} text="" message="" containerStyle={{ padding: 2 }} />
        )}
        {!!sError && (
          <View style={{ backgroundColor: "rgba(220,50,50,0.1)", borderRadius: 8, paddingVertical: 4, paddingHorizontal: 12 }}>
            <Text style={{ fontSize: 11, color: C.lightred, fontWeight: "500", textAlign: "center" }}>{sError}</Text>
          </View>
        )}
        {!!sSuccess && (
          <Animated.View
            style={{
              backgroundColor: C.green,
              borderRadius: 10,
              paddingVertical: 8,
              paddingHorizontal: 20,
              marginTop: 4,
              opacity: successOpacity,
              transform: [{ scale: Animated.multiply(successScale, successPulse) }],
            }}
          >
            <Text style={{ fontSize: 15, color: C.textWhite, fontWeight: "700", textAlign: "center" }}>{sSuccess}</Text>
          </Animated.View>
        )}
      </View>

      {/* Action Buttons */}
      <View style={{ flexDirection: "row", alignItems: "center", width: "100%" }}>
        <View style={{ width: "33%", alignItems: "flex-start", paddingLeft: 7 }} />
        <View style={{ width: "33%", alignItems: "center" }}>
          <Button_
            text="Start Sale"
            onPress={handleCharge}
            enabled={chargeEnabled}
            colorGradientArr={COLOR_GRADIENTS.green}
            textStyle={{ color: C.textWhite, fontSize: 16 }}
            buttonStyle={{ paddingHorizontal: 30, cursor: chargeEnabled ? "inherit" : "default" }}
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
export function CardPayment(props) {
  return (
    <Elements stripe={stripePromise}>
      <CardPaymentForm {...props} />
    </Elements>
  );
}

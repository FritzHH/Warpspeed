/* eslint-disable */
import { View, Text, TextInput, Animated, Image } from "react-native-web";
import { useState, useRef, useEffect } from "react";
import { Button_, DropdownMenu, SHADOW_RADIUS_PROTO, SmallLoadingIndicator, Tooltip } from "../../../../components";
import { C, COLOR_GRADIENTS, Fonts, ICONS } from "../../../../styles";
import {
  usdTypeMask,
  formatCurrencyDisp,
  log,
  gray,
  localStorageWrapper,
} from "../../../../utils";
import { useStripePaymentStore } from "../../../../stores";
import { buildCardPayment } from "./newCheckoutUtils";
import {
  newCheckoutProcessStripePayment,
  newCheckoutCancelStripePayment,
  newCheckoutListenToPaymentUpdates,
} from "./newCheckoutFirebaseCalls";

function PulsingText({ text }) {
  const opacity = useRef(new Animated.Value(0.3)).current;
  const started = useRef(false);
  if (!started.current) {
    started.current = true;
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 900, useNativeDriver: false }),
        Animated.timing(opacity, { toValue: 0.3, duration: 900, useNativeDriver: false }),
      ])
    ).start();
  }
  return (
    <Animated.Text
      style={{
        fontSize: 11,
        color: C.lightText,
        fontStyle: "italic",
        marginTop: 6,
        opacity,
      }}
    >
      {text}
    </Animated.Text>
  );
}

const PAYMENT_TIMEOUT_MS = 120000; // 2 minutes
const LS_CARD_READER_KEY = "warpspeed_selected_card_reader";

// Maps Stripe decline_code and failure_code values to user-friendly messages
function formatStripeError(code) {
  const messages = {
    insufficient_funds: "Insufficient funds on card",
    lost_card: "This card has been reported lost",
    stolen_card: "This card has been reported stolen",
    expired_card: "Card is expired",
    incorrect_cvc: "Incorrect CVC",
    card_declined: "Card declined by issuer",
    processing_error: "Processing error — try again",
    do_not_honor: "Card declined — customer should contact their bank",
    generic_decline: "Card declined",
    card_not_supported: "Card not supported",
    try_again_later: "Card issuer unavailable — try again",
    pickup_card: "Card cannot be used — customer should contact their bank",
    not_permitted: "Payment not permitted on this card",
    withdrawal_count_limit_exceeded: "Card has exceeded withdrawal limit",
    invalid_account: "Card account is invalid",
    new_account_information_available: "Card info has changed — try again",
    currency_not_supported: "Card does not support USD",
    duplicate_transaction: "Duplicate transaction — already processed",
    reenter_transaction: "Could not process — try again",
    timed_out: "Reader timed out waiting for card — try again",
    card_removed: "Card removed too early — reinsert and hold until done",
    canceled: "Payment was cancelled",
    card_swipe_not_supported: "Card swipe not supported — use chip or tap",
    chip_read_failed: "Chip read failed — try again or use tap",
    contactless_not_supported: "Tap not supported — use chip",
    pin_required: "PIN required — reinsert card and enter PIN",
    offline_pin_required: "Offline PIN required",
    online_or_offline_pin_required: "PIN required — reinsert card and enter PIN",
    no_common_application: "Card not compatible with this reader",
  };
  return messages[code] || null;
}

function buildCompletionError(completionData) {
  let rawCode = completionData.decline_code || completionData.failure_code || "";
  let rawMsg = completionData.failure_message || completionData.error_message || "";
  let friendly = rawCode ? formatStripeError(rawCode) : null;
  if (friendly) return rawCode ? `${friendly} (${rawCode})` : friendly;
  if (rawMsg) return rawMsg;
  return rawCode ? `Payment failed (${rawCode})` : "Payment failed";
}

function cleanupStoreListeners() {
  let store = useStripePaymentStore.getState();
  if (store._cardTimeout) {
    clearTimeout(store._cardTimeout);
    store._cardTimeout = null;
  }
  if (store._cardListeners) {
    store._cardListeners.unsubscribe();
    store._cardListeners = null;
  }
}

export function CardReaderPayment({
  amountLeftToPay = 0,
  onPaymentCapture,
  stripeReaders = [],
  settings,
  saleComplete = false,
  readerError = "",
  saleID = "",
  customerID = "",
  customerEmail = "",
  onCardProcessingStart,
  onCardProcessingEnd,
  onSwitchToManual,
}) {
  const [sRequestedAmount, _setRequestedAmount] = useState("");
  const [sRequestedAmountDisp, _setRequestedAmountDisp] = useState("");
  const [sCardReader, _setCardReader] = useState(null);
  const [sFocused, _setFocused] = useState("");

  const successScale = useRef(new Animated.Value(0)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;
  const successAnimStarted = useRef(false);

  const autoLoadedRef = useRef(false);
  const prevAmountRef = useRef(amountLeftToPay);

  const callbacksRef = useRef({ onPaymentCapture, onCardProcessingEnd, onCardProcessingStart });
  callbacksRef.current = { onPaymentCapture, onCardProcessingEnd, onCardProcessingStart };

  const zCardStatus = useStripePaymentStore((s) => s.cardStatus);
  const zCardError = useStripePaymentStore((s) => s.cardError);
  const zCardMessage = useStripePaymentStore((s) => s.cardMessage);
  const zPaymentIntentID = useStripePaymentStore((s) => s.paymentIntentID);
  const _zSetCardStatus = useStripePaymentStore((s) => s.setCardStatus);
  const _zSetCardError = useStripePaymentStore((s) => s.setCardError);
  const _zSetCardMessage = useStripePaymentStore((s) => s.setCardMessage);
  const _zSetPaymentIntentID = useStripePaymentStore((s) => s.setPaymentIntentID);
  const _zResetCardTransaction = useStripePaymentStore((s) => s.resetCardTransaction);

  function getInitialReader() {
    if (sCardReader) return sCardReader;
    let saved = localStorageWrapper.getItem(LS_CARD_READER_KEY);
    if (saved?.id) {
      let match = stripeReaders.find((r) => r.id === saved.id);
      if (match) return match;
    }
    return null;
  }

  let activeReader = getInitialReader();

  function setupListeners(readerID, piID) {
    cleanupStoreListeners();
    let store = useStripePaymentStore.getState();

    let listener = newCheckoutListenToPaymentUpdates(
      readerID,
      piID,
      (data) => {
        if (!data) return;
        let s = useStripePaymentStore.getState();

        if (data.status === "succeeded" && (data.payment_intent || data.amount_captured)) {
          if (s._cardTimeout) { clearTimeout(s._cardTimeout); s._cardTimeout = null; }
          let payment = buildCardPayment(data);
          s.setCardMessage(`Payment of ${formatCurrencyDisp(payment.amountCaptured)} approved`);
          s.setCardError("");
          s.setCardStatus("succeeded");
          s.setPaymentIntentID(null);
          cleanupStoreListeners();
          if (callbacksRef.current.onCardProcessingEnd) callbacksRef.current.onCardProcessingEnd();
          if (callbacksRef.current.onPaymentCapture) callbacksRef.current.onPaymentCapture(payment);
          return;
        }

        if (data.status === "failed" || data.failure_code || data.decline_code) {
          if (s._cardTimeout) { clearTimeout(s._cardTimeout); s._cardTimeout = null; }
          s.setCardError(buildCompletionError(data));
          s.setCardMessage("");
          s.setCardStatus("idle");
          s.setPaymentIntentID(null);
          cleanupStoreListeners();
          if (callbacksRef.current.onCardProcessingEnd) callbacksRef.current.onCardProcessingEnd();
          return;
        }

        s.setCardMessage("Processing payment...");
        s.setCardStatus("processingPayment");
      }
    );

    if (!listener) {
      store.setCardError("Failed to set up payment listener");
      store.setCardStatus("failed");
      return;
    }

    store._cardListeners = listener;

    store._cardTimeout = setTimeout(() => {
      let s = useStripePaymentStore.getState();
      s.setCardError("Payment timed out — card reader may be unresponsive");
      s.setCardMessage("");
      s.setCardStatus("idle");
      s.setPaymentIntentID(null);
      cleanupStoreListeners();
      if (callbacksRef.current.onCardProcessingEnd) callbacksRef.current.onCardProcessingEnd();
    }, PAYMENT_TIMEOUT_MS);
  }

  useEffect(() => {
    if (!activeReader) return;
    let store = useStripePaymentStore.getState();

    if (
      (zCardStatus === "waitingForCard" || zCardStatus === "processingPayment") &&
      !store._cardListeners &&
      zPaymentIntentID
    ) {
      setupListeners(activeReader.id, zPaymentIntentID);
      return;
    }

    if (zCardStatus === "idle") {
      let action = activeReader.action;
      if (action && action.type === "process_payment_intent") {
        let actionPiID = action.process_payment_intent?.payment_intent || "";
        if (!actionPiID) return;
        if (actionPiID === zPaymentIntentID) {
          _zSetCardStatus("waitingForCard");
          _zSetCardMessage("Card reader ready to accept payment");
          setupListeners(activeReader.id, zPaymentIntentID);
        } else {
          _zSetCardStatus("readerBusy");
          _zSetCardError("Reader has an active payment (" + actionPiID + ")");
        }
      }
    }
  }, [activeReader?.id, activeReader?.action?.type, zCardStatus]);

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

  function handleReaderSelect(item) {
    let reader = stripeReaders.find((r) => r.id === item.id);
    _setCardReader(reader || null);
    _zSetCardError("");
    _zSetCardMessage("");
    if (reader) {
      localStorageWrapper.setItem(LS_CARD_READER_KEY, { id: reader.id, label: item.label || reader.id });
      if (reader.action && reader.action.type) {
        let piID = reader.action.process_payment_intent?.payment_intent || "";
        if (piID && piID === zPaymentIntentID) {
          _zSetCardStatus("waitingForCard");
          _zSetCardMessage("Card reader ready to accept payment");
        } else {
          _zSetCardStatus("readerBusy");
          let msg = reader.action.type === "process_payment_intent"
            ? "Reader has an active payment" + (piID ? " (" + piID + ")" : "")
            : "Reader is busy (" + reader.action.type + ")";
          _zSetCardError(msg);
        }
      } else {
        if (zCardStatus === "readerBusy") _zSetCardStatus("idle");
      }
    }
  }

  async function startPayment() {
    if (zCardStatus !== "idle" && zCardStatus !== "succeeded") return;
    if (!activeReader) {
      _zSetCardError("No card reader selected");
      return;
    }
    if (!sRequestedAmount || sRequestedAmount < 50) {
      _zSetCardError("Minimum card payment is $0.50");
      return;
    }
    if (sRequestedAmount > amountLeftToPay) {
      _zSetCardError("Amount exceeds balance due");
      return;
    }

    _zSetCardStatus("initiating");
    _zSetCardError("");
    _zSetCardMessage("Initiating payment...");

    if (callbacksRef.current.onCardProcessingStart) callbacksRef.current.onCardProcessingStart(sRequestedAmount);

    try {
      let result = await newCheckoutProcessStripePayment(
        sRequestedAmount,
        activeReader.id,
        zPaymentIntentID || null,
        saleID,
        customerID,
        customerEmail
      );

      if (!result?.success) {
        _zSetCardError(result?.message || "Payment initiation failed");
        _zSetCardMessage("");
        _zSetCardStatus("failed");
        if (callbacksRef.current.onCardProcessingEnd) callbacksRef.current.onCardProcessingEnd();
        return;
      }

      let piID = result.data?.paymentIntentID;
      _zSetPaymentIntentID(piID);
      _zSetCardStatus("waitingForCard");
      _zSetCardMessage("Card reader ready to accept payment");

      setupListeners(activeReader.id, piID);
    } catch (error) {
      log("newCheckout card payment error:", error);
      let msg = error?.message || "Payment failed";
      let code = error?.code || "";

      if (code === "functions/resource-exhausted" || msg.includes("currently processing") || msg.includes("Reader is busy")) {
        _zSetCardStatus("readerBusy");
        _zSetCardError(msg);
      } else if (code === "functions/unavailable" || msg.includes("offline")) {
        _zSetCardStatus("idle");
        _zSetCardError("Reader is offline — check power and network (" + msg + ")");
      } else {
        _zSetCardStatus("idle");
        _zSetCardError(msg);
      }
      _zSetCardMessage("");
      cleanupStoreListeners();
      if (callbacksRef.current.onCardProcessingEnd) callbacksRef.current.onCardProcessingEnd();
    }
  }

  async function clearReader() {
    if (!activeReader) return;
    _zSetCardStatus("clearing");
    _zSetCardMessage("Clearing reader...");
    _zSetCardError("");
    cleanupStoreListeners();

    try {
      let result = await newCheckoutCancelStripePayment(activeReader.id);
      _zSetCardMessage(result?.message || "Reader cleared");
      _zResetCardTransaction();
      if (callbacksRef.current.onCardProcessingEnd) callbacksRef.current.onCardProcessingEnd();
    } catch (error) {
      log("clearReader error:", error);
      _zSetCardError(error?.message || "Failed to clear reader");
      _zSetCardMessage("");
      _zSetCardStatus("readerBusy");
    }
  }

  // ── Success animation ──
  if (zCardStatus === "succeeded" && !successAnimStarted.current) {
    successAnimStarted.current = true;
    Animated.parallel([
      Animated.spring(successScale, { toValue: 1, friction: 5, tension: 60, useNativeDriver: false }),
      Animated.timing(successOpacity, { toValue: 1, duration: 350, useNativeDriver: false }),
    ]).start();
  }
  if (zCardStatus !== "succeeded" && successAnimStarted.current) {
    successAnimStarted.current = false;
    successScale.setValue(0);
    successOpacity.setValue(0);
  }

  // ── Derived values ──
  let savedCardReaders = settings?.cardReaders || [];
  let readerDropdownData = stripeReaders
    .filter((r) => r.status === "online")
    .map((r) => {
      let saved = savedCardReaders.find((s) => s.id === r.id);
      return { id: r.id, label: saved?.label || r.id };
    });

  let hasOnlineReaders = readerDropdownData.length > 0;
  let boxEnabled = hasOnlineReaders && !saleComplete;
  let isProcessing = zCardStatus === "initiating" || zCardStatus === "processingPayment" || zCardStatus === "clearing";
  let isEnabled = boxEnabled && amountLeftToPay > 0 && !isProcessing;

  if (hasOnlineReaders && amountLeftToPay > 0 && !autoLoadedRef.current) {
    autoLoadedRef.current = true;
    prevAmountRef.current = amountLeftToPay;
    _setRequestedAmountDisp(formatCurrencyDisp(amountLeftToPay));
    _setRequestedAmount(amountLeftToPay);
  }

  if (!hasOnlineReaders) {
    return (
      <View
        style={{
          alignItems: "center",
          paddingTop: 20,
          width: "100%",
          height: "48%",
          borderRadius: 15,
          ...SHADOW_RADIUS_PROTO,
          justifyContent: "center",
          paddingBottom: 20,
        }}
      >
        <Text style={{ fontSize: 25, color: gray(0.6), fontWeight: 500 }}>
          CARD SALE
        </Text>
        {!!readerError && (
          <Text style={{ fontSize: 13, color: C.lightred, fontStyle: "italic", marginTop: 10 }}>
            {readerError}
          </Text>
        )}
        <PulsingText text="watching for new readers..." />
        {onSwitchToManual && (
          <View style={{ marginTop: 12 }}>
            <Button_
              text="Manual Entry"
              onPress={onSwitchToManual}
              enabled={true}
              colorGradientArr={COLOR_GRADIENTS.blue}
              textStyle={{ color: C.textWhite, fontSize: 11 }}
              buttonStyle={{ paddingVertical: 2, paddingHorizontal: 14 }}
            />
          </View>
        )}
      </View>
    );
  }

  // Reset card component after successful payment
  if (zCardStatus === "succeeded") {
    useStripePaymentStore.getState().setCardStatus("idle");
    useStripePaymentStore.getState().setCardMessage("");
    prevAmountRef.current = amountLeftToPay;
    if (amountLeftToPay > 0) {
      _setRequestedAmountDisp(formatCurrencyDisp(amountLeftToPay));
      _setRequestedAmount(amountLeftToPay);
    } else {
      _setRequestedAmountDisp("");
      _setRequestedAmount(0);
    }
  }

  let startDisabled = !isEnabled
    || sRequestedAmount < 50
    || zCardStatus === "initiating"
    || zCardStatus === "processingPayment"
    || zCardStatus === "clearing"
    || zCardStatus === "waitingForCard"
    || zCardStatus === "readerBusy";

  return (
    <View
      pointerEvents={boxEnabled ? "auto" : "none"}
      style={{
        alignItems: "center",
        paddingTop: 15,
        width: "100%",
        height: "48%",
        borderRadius: 15,
        ...SHADOW_RADIUS_PROTO,
        justifyContent: "space-between",
        paddingBottom: 20,
        opacity: boxEnabled ? 1 : 0.2,
      }}
    >
      {/* Title + Reader Selector Row */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          width: "100%",
          justifyContent: "space-between",
          paddingHorizontal: 30,
        }}
      >
        <Text style={{ fontSize: 16, color: gray(0.6), fontWeight: 500 }}>
          CARD SALE
        </Text>
        <View style={{ flex: 1, alignItems: "flex-end" }}>
          <DropdownMenu
            dataArr={readerDropdownData}
            onSelect={handleReaderSelect}
            buttonText={
              activeReader
                ? (savedCardReaders.find((s) => s.id === activeReader.id)?.label || activeReader.id)
                : "Select Reader"
            }
            enabled={!isProcessing}
            buttonStyle={{
              paddingVertical: 4,
              paddingHorizontal: 6,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: C.buttonLightGreenOutline,
              backgroundColor: C.listItemWhite,
              // width: 150
            }}
            buttonTextStyle={{ fontSize: 11, width: '100%' }}
          />
        </View>
      </View>

      {!!readerError && (
        <Text style={{ fontSize: 11, color: C.lightred, fontStyle: "italic" }}>
          {readerError}
        </Text>
      )}

      {/* Payment Amount Input */}
      <View style={{ marginTop: 5 }}>
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
            paddingBottom: 6,
            paddingRight: 7,
          }}
        >
          <Text style={{ fontSize: 15 }}>$</Text>
          <View style={{ width: 100, alignItems: "flex-end", paddingRight: 5 }}>
            <TextInput
              onFocus={() => {
                _setFocused("amount");
                _setRequestedAmountDisp("");
                _setRequestedAmount(0);
              }}
              style={{
                fontSize: 20,
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
              editable={isEnabled}
            />
          </View>
        </View>
        <View style={{ alignItems: "flex-end", marginTop: 3 }}>
          <Button_
            text="MAX"
            onPress={() => {
              _setRequestedAmountDisp(formatCurrencyDisp(amountLeftToPay));
              _setRequestedAmount(amountLeftToPay);
            }}
            enabled={isEnabled}
            colorGradientArr={COLOR_GRADIENTS.green}
            textStyle={{ color: C.textWhite, fontSize: 10, fontWeight: "600" }}
            buttonStyle={{ height: 20, paddingHorizontal: 8, borderRadius: 4 }}
          />
        </View>
      </View>

      {/* Status Messages */}
      <View style={{ alignItems: "center", justifyContent: "center", minHeight: 30 }}>
        {isProcessing && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <SmallLoadingIndicator color={C.green} text="" message="" containerStyle={{ padding: 2 }} />
            {!!zCardMessage && (
              <Text style={{ fontSize: 13, color: gray(0.5), fontWeight: "600" }}>{zCardMessage}</Text>
            )}
          </View>
        )}
        {!isProcessing && !!zCardError && (
          <Text style={{ fontSize: 13, color: C.lightred, fontWeight: "600", textAlign: "center" }}>
            {zCardError}
          </Text>
        )}
        {!isProcessing && !!zCardMessage && zCardStatus !== "succeeded" && (
          <Text style={{ fontSize: 13, color: C.green, fontWeight: "600", textAlign: "center" }}>
            {zCardMessage}
          </Text>
        )}
      </View>

      {/* Action Buttons */}
      <View style={{ flexDirection: "row", alignItems: "center", width: "100%" }}>
        <View style={{ width: "33%", alignItems: "flex-start", justifyContent: "flex-end", paddingLeft: 7 }}>
          <Tooltip text="Clearing the reader will cancel the transaction for all users, be careful!" position="top">
            <Button_
              text="Clear Reader"
              onPress={clearReader}
              enabled={zCardStatus !== "clearing"}
              colorGradientArr={COLOR_GRADIENTS.red}
              textStyle={{ color: C.textWhite, fontSize: 11 }}
              buttonStyle={{ paddingVertical: 2, paddingRight: 10, width: 90, borderRadius: 6 }}
            />
          </Tooltip>
        </View>
        <View style={{ width: "33%", alignItems: "center" }}>
          <Button_
            text="START CARD SALE"
            onPress={startPayment}
            enabled={!startDisabled}
            colorGradientArr={COLOR_GRADIENTS.green}
            textStyle={{ color: C.textWhite, fontSize: 16 }}
            buttonStyle={{ cursor: startDisabled ? "default" : "inherit", borderRadius: 6 }}
          />
        </View>
        <View style={{ width: "33%", alignItems: "flex-end", paddingRight: 7 }}>
          {onSwitchToManual && (
            <Button_
              text="Manual Entry"
              onPress={onSwitchToManual}
              enabled={!isProcessing}
              colorGradientArr={COLOR_GRADIENTS.blue}
              textStyle={{ color: C.textWhite, fontSize: 11 }}
              buttonStyle={{ paddingVertical: 2, paddingRight: 10, width: 90, cursor: isProcessing ? "default" : "inherit", borderRadius: 6 }}
            />
          )}
        </View>
      </View>
    </View>
  );
}

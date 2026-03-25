/* eslint-disable */
import { View, Text, TextInput, Animated } from "react-native-web";
import { useState, useRef } from "react";
import { Button_, DropdownMenu, SHADOW_RADIUS_PROTO, SmallLoadingIndicator, Tooltip } from "../../../../components";
import { C, COLOR_GRADIENTS, Fonts } from "../../../../styles";
import {
  usdTypeMask,
  formatCurrencyDisp,
  log,
  gray,
  localStorageWrapper,
} from "../../../../utils";
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
    // decline_code values (issuer-side)
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
    // failure_code values (terminal/reader-side)
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

// Builds a display-friendly error from completion data, always including the raw Stripe code
function buildCompletionError(completionData) {
  let rawCode = completionData.decline_code || completionData.failure_code || "";
  let rawMsg = completionData.failure_message || completionData.error_message || "";
  let friendly = rawCode ? formatStripeError(rawCode) : null;
  if (friendly) return rawCode ? `${friendly} (${rawCode})` : friendly;
  if (rawMsg) return rawMsg;
  return rawCode ? `Payment failed (${rawCode})` : "Payment failed";
}

export function CardPayment({
  amountLeftToPay = 0,
  onPaymentCapture,
  stripeReaders = [],
  settings,
  saleComplete = false,
  readerError = "",
  saleID = "",
  customerID = "",
  onCardProcessingStart,
  onCardProcessingEnd,
}) {
  const [sRequestedAmount, _setRequestedAmount] = useState("");
  const [sRequestedAmountDisp, _setRequestedAmountDisp] = useState("");
  const [sCardReader, _setCardReader] = useState(null);
  const [sPaymentIntentID, _setPaymentIntentID] = useState("");
  const [sProcessing, _setProcessing] = useState(false);
  const [sErrorMessage, _setErrorMessage] = useState("");
  const [sSuccessMessage, _setSuccessMessage] = useState("");
  const [sListeners, _setListeners] = useState(null);
  const [sFocused, _setFocused] = useState("");
  // Reader has an active action: our payment waiting for card, or an orphaned payment
  const [sReaderActive, _setReaderActive] = useState(false);

  const listenersRef = useRef(null);
  const timeoutRef = useRef(null);
  const autoLoadedRef = useRef(false);
  const prevAmountRef = useRef(amountLeftToPay);
  const startupCheckDoneRef = useRef(false);

  function cleanupListeners() {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (listenersRef.current) {
      listenersRef.current.unsubscribe();
      listenersRef.current = null;
      _setListeners(null);
    }
  }

  // Auto-select reader from localStorage (per-device)
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

  // On startup: check if the selected reader has a stuck/orphaned action
  if (activeReader && !startupCheckDoneRef.current && !sProcessing && !sReaderActive) {
    startupCheckDoneRef.current = true;
    let action = activeReader.action;
    if (action && action.type) {
      let piID = action.process_payment_intent?.payment_intent || "";
      if (piID && piID === sPaymentIntentID) {
        // This is our payment intent — reader is ready for customer
        _setReaderActive(true);
        _setSuccessMessage("Waiting for card tap/insert...");
      } else {
        let msg = action.type === "process_payment_intent"
          ? `Reader has an active payment` + (piID ? ` (${piID})` : "")
          : `Reader is busy (${action.type})`;
        _setReaderActive(true);
        _setErrorMessage(msg);
      }
    }
  }

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
    _setErrorMessage("");
    _setReaderActive(false);
    if (reader) {
      localStorageWrapper.setItem(LS_CARD_READER_KEY, { id: reader.id, label: item.label || reader.id });
      // Check if newly selected reader has a stuck action
      if (reader.action && reader.action.type) {
        let piID = reader.action.process_payment_intent?.payment_intent || "";
        if (piID && piID === sPaymentIntentID) {
          _setReaderActive(true);
          _setSuccessMessage("Waiting for card tap/insert...");
        } else {
          let msg = reader.action.type === "process_payment_intent"
            ? `Reader has an active payment` + (piID ? ` (${piID})` : "")
            : `Reader is busy (${reader.action.type})`;
          _setReaderActive(true);
          _setErrorMessage(msg);
        }
      }
    }
  }

  async function startPayment() {
    if (sProcessing || sReaderActive) return;
    if (!activeReader) {
      _setErrorMessage("No card reader selected");
      return;
    }
    if (!sRequestedAmount || sRequestedAmount < 50) {
      _setErrorMessage("Minimum card payment is $0.50");
      return;
    }
    if (sRequestedAmount > amountLeftToPay) {
      _setErrorMessage("Amount exceeds balance due");
      return;
    }

    _setProcessing(true);
    _setErrorMessage("");
    _setSuccessMessage("Initiating payment...");

    // Notify parent that card is processing this amount (cash side updates immediately)
    if (onCardProcessingStart) onCardProcessingStart(sRequestedAmount);

    try {
      let result = await newCheckoutProcessStripePayment(
        sRequestedAmount,
        activeReader.id,
        sPaymentIntentID || null,
        saleID,
        customerID
      );

      if (!result?.success) {
        _setErrorMessage(result?.message || "Payment initiation failed");
        _setSuccessMessage("");
        _setProcessing(false);
        if (onCardProcessingEnd) onCardProcessingEnd();
        return;
      }

      let piID = result.data?.paymentIntentID;
      _setPaymentIntentID(piID);
      _setProcessing(false);
      _setReaderActive(true);
      _setSuccessMessage("Waiting for card tap/insert...");

      // Set up real-time listener for payment updates
      let listener = newCheckoutListenToPaymentUpdates(
        activeReader.id,
        piID,
        // onUpdate
        (updateData) => {
          if (!updateData) return;
          log("newCheckout card update:", updateData);
          _setSuccessMessage("Processing payment...");
        },
        // onCompletion
        (completionData) => {
          if (!completionData) return;
          log("newCheckout card completion:", completionData);

          // Clear timeout on any completion response
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }

          if (
            completionData.status === "succeeded" ||
            completionData.payment_intent
          ) {
            let payment = buildCardPayment(completionData);
            _setSuccessMessage(
              `Payment of ${formatCurrencyDisp(payment.amountCaptured)} approved`
            );
            _setReaderActive(false);
            _setRequestedAmount("");
            _setRequestedAmountDisp("");
            _setPaymentIntentID("");
            cleanupListeners();
            if (onCardProcessingEnd) onCardProcessingEnd();
            if (onPaymentCapture) onPaymentCapture(payment);
          } else if (completionData.status === "failed" || completionData.failure_code || completionData.decline_code) {
            _setErrorMessage(buildCompletionError(completionData));
            _setSuccessMessage("");
            cleanupListeners();
            if (onCardProcessingEnd) onCardProcessingEnd();
            // Keep sReaderActive true — user needs to clear the reader
          }
        }
      );

      listenersRef.current = listener;
      _setListeners(listener);

      // Payment timeout
      timeoutRef.current = setTimeout(() => {
        _setErrorMessage("Payment timed out — card reader may be unresponsive");
        _setSuccessMessage("");
        cleanupListeners();
        if (onCardProcessingEnd) onCardProcessingEnd();
        // Keep sReaderActive true — user needs to clear the reader
      }, PAYMENT_TIMEOUT_MS);
    } catch (error) {
      log("newCheckout card payment error:", error);
      let msg = error?.message || "Payment failed";
      let isReaderBusy = error?.code === "functions/resource-exhausted"
        || msg.includes("currently processing")
        || msg.includes("Reader is busy");
      if (isReaderBusy) {
        _setReaderActive(true);
      } else if (error?.code === "functions/unavailable" || msg.includes("offline")) {
        msg = "Reader is offline — check power and network (" + msg + ")";
      }
      _setErrorMessage(msg);
      _setSuccessMessage("");
      _setProcessing(false);
      cleanupListeners();
      if (onCardProcessingEnd) onCardProcessingEnd();
    }
  }

  // Clears whatever action the reader is processing (our payment or orphaned)
  async function clearReader() {
    if (!activeReader) return;
    try {
      _setProcessing(true);
      _setSuccessMessage("Clearing reader...");
      _setErrorMessage("");
      cleanupListeners();
      let result = await newCheckoutCancelStripePayment(activeReader.id);
      _setSuccessMessage(result?.message || "Reader cleared");
      _setProcessing(false);
      _setReaderActive(false);
      _setPaymentIntentID("");
      if (onCardProcessingEnd) onCardProcessingEnd();
    } catch (error) {
      log("clearReader error:", error);
      _setErrorMessage(error?.message || "Failed to clear reader");
      _setSuccessMessage("");
      _setProcessing(false);
    }
  }

  let savedCardReaders = settings?.cardReaders || [];
  let readerDropdownData = stripeReaders
    .filter((r) => r.status === "online")
    .map((r) => {
      let saved = savedCardReaders.find((s) => s.id === r.id);
      return { id: r.id, label: saved?.label || r.id };
    });

  let hasOnlineReaders = readerDropdownData.length > 0;
  let boxEnabled = hasOnlineReaders && !saleComplete;
  let isEnabled = boxEnabled && amountLeftToPay > 0 && !sProcessing;

  // Auto-load amountLeftToPay into card amount on first availability
  if (hasOnlineReaders && amountLeftToPay > 0 && !autoLoadedRef.current) {
    autoLoadedRef.current = true;
    prevAmountRef.current = amountLeftToPay;
    _setRequestedAmountDisp(formatCurrencyDisp(amountLeftToPay));
    _setRequestedAmount(amountLeftToPay);
  }

  // Sync display when balance changes externally (cash payment captured)
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

  if (!hasOnlineReaders) {
    return (
      <View
        style={{
          alignItems: "center",
          paddingTop: 20,
          width: "100%",
          flex: 1,
          borderRadius: 15,
          ...SHADOW_RADIUS_PROTO,
          justifyContent: "center",
          paddingBottom: 20,
        }}
      >
        <Text
          style={{
            fontSize: 25,
            color: gray(0.6),
            fontWeight: 500,
          }}
        >
          CARD SALE
        </Text>
        {!!readerError && (
          <Text
            style={{
              fontSize: 13,
              color: C.lightred,
              fontStyle: "italic",
              marginTop: 10,
            }}
          >
            {readerError}
          </Text>
        )}
        <PulsingText text="watching for new readers..." />
      </View>
    );
  }

  let startEnabled = isEnabled && sRequestedAmount >= 50;

  return (
    <View
      pointerEvents={boxEnabled ? "auto" : "none"}
      style={{
        alignItems: "center",
        paddingTop: 15,
        width: "100%",
        flex: 1,
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
          width: "90%",
          justifyContent: "space-between",
        }}
      >
        <Text style={{ fontSize: 25, color: gray(0.6), fontWeight: 500 }}>
          CARD SALE
        </Text>
        <View style={{ width: "45%" }}>
          <DropdownMenu
            dataArr={readerDropdownData}
            onSelect={handleReaderSelect}
            buttonText={
              activeReader
                ? (savedCardReaders.find((s) => s.id === activeReader.id)?.label || activeReader.id)
                : "Select Reader"
            }
            enabled={!sProcessing}
            buttonStyle={{
              paddingVertical: 4,
              paddingHorizontal: 6,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: C.buttonLightGreenOutline,
              backgroundColor: C.listItemWhite,
            }}
            buttonTextStyle={{ fontSize: 11 }}
          />
        </View>
      </View>

      {/* Reader error message */}
      {!!readerError && (
        <Text style={{ fontSize: 11, color: C.lightred, fontStyle: "italic" }}>
          {readerError}
        </Text>
      )}

      {/* Payment Amount Input */}
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
          marginTop: 5,
        }}
      >
        <Text style={{ fontSize: 15 }}>$</Text>
        <View
          style={{ width: 100, alignItems: "flex-end", paddingRight: 5 }}
        >
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

      {/* Status Messages + Processing Indicator */}
      <View style={{ alignItems: "center", justifyContent: "center" }}>
        {sProcessing && (
          <SmallLoadingIndicator
            color={C.green}
            text=""
            message=""
            containerStyle={{ padding: 2 }}
          />
        )}
        {sErrorMessage ? (
          <View
            style={{
              backgroundColor: "rgba(220,50,50,0.1)",
              borderRadius: 8,
              paddingVertical: 5,
              paddingHorizontal: 14,
              marginTop: 2,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                color: C.lightred,
                fontWeight: "500",
                textAlign: "center",
              }}
            >
              {sErrorMessage}
            </Text>
          </View>
        ) : null}
        {sSuccessMessage ? (
          <View
            style={{
              backgroundColor: "rgba(0,160,0,0.1)",
              borderRadius: 8,
              paddingVertical: 5,
              paddingHorizontal: 14,
              marginTop: 2,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                color: C.green,
                fontWeight: "500",
                textAlign: "center",
              }}
            >
              {sSuccessMessage}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Action Button */}
      {sReaderActive ? (
        <Tooltip text="Clearing the reader will cancel the transaction for all users, be careful!" position="top">
          <Button_
            text={sProcessing ? "CLEARING..." : "CLEAR READER"}
            onPress={clearReader}
            enabled={!sProcessing}
            colorGradientArr={COLOR_GRADIENTS.red}
            textStyle={{ color: C.textWhite, fontSize: 16 }}
          />
        </Tooltip>
      ) : (
        <Button_
          text={sProcessing ? "PROCESSING..." : "START CARD SALE"}
          onPress={startPayment}
          enabled={startEnabled && !sProcessing}
          colorGradientArr={COLOR_GRADIENTS.green}
          textStyle={{ color: C.textWhite, fontSize: 16 }}
          buttonStyle={{
            cursor: startEnabled && !sProcessing ? "inherit" : "default",
          }}
        />
      )}
    </View>
  );
}

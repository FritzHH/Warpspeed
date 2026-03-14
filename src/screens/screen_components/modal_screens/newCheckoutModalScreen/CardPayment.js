/* eslint-disable */
import { View, Text, TextInput } from "react-native-web";
import { TouchableOpacity } from "react-native";
import { useState } from "react";
import { Button_, DropdownMenu, SHADOW_RADIUS_PROTO } from "../../../../components";
import { C, COLOR_GRADIENTS, Fonts } from "../../../../styles";
import {
  usdTypeMask,
  formatCurrencyDisp,
  log,
  gray,
} from "../../../../utils";
import { buildCardPayment } from "./newCheckoutUtils";
import {
  newCheckoutProcessStripePayment,
  newCheckoutCancelStripePayment,
  newCheckoutListenToPaymentUpdates,
} from "./newCheckoutFirebaseCalls";

export function CardPayment({
  amountLeftToPay = 0,
  onPaymentCapture,
  stripeReaders = [],
  settings,
  saleComplete = false,
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

  // Auto-select reader from settings if available
  function getInitialReader() {
    if (sCardReader) return sCardReader;
    if (settings?.selectedCardReaderObj?.id) {
      let match = stripeReaders.find(
        (r) => r.id === settings.selectedCardReaderObj.id
      );
      if (match) return match;
    }
    if (stripeReaders.length > 0) return stripeReaders[0];
    return null;
  }

  let activeReader = getInitialReader();

  function handleAmountChange(val) {
    let result = usdTypeMask(val, { withDollar: false });
    _setRequestedAmountDisp(result.display);
    _setRequestedAmount(result.cents);
  }

  function handleReaderSelect(item) {
    let reader = stripeReaders.find((r) => r.id === item.id);
    _setCardReader(reader || null);
    _setErrorMessage("");
  }

  async function startPayment() {
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

    try {
      let result = await newCheckoutProcessStripePayment(
        sRequestedAmount,
        activeReader.id,
        sPaymentIntentID || null
      );

      if (!result?.success) {
        _setErrorMessage(result?.message || "Payment initiation failed");
        _setSuccessMessage("");
        _setProcessing(false);
        return;
      }

      let piID = result.data?.paymentIntentID;
      _setPaymentIntentID(piID);
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

          if (
            completionData.status === "succeeded" ||
            completionData.payment_intent
          ) {
            let payment = buildCardPayment(completionData);
            _setSuccessMessage(
              `Payment of ${formatCurrencyDisp(payment.amountCaptured)} approved`
            );
            _setProcessing(false);
            _setRequestedAmount("");
            _setRequestedAmountDisp("");
            _setPaymentIntentID("");

            // Clean up listener
            if (sListeners) sListeners.unsubscribe();
            _setListeners(null);

            if (onPaymentCapture) onPaymentCapture(payment);
          } else if (completionData.failure_code) {
            _setErrorMessage(
              `Payment failed: ${completionData.failure_code}`
            );
            _setSuccessMessage("");
            _setProcessing(false);
          }
        }
      );
      _setListeners(listener);
    } catch (error) {
      log("newCheckout card payment error:", error);
      _setErrorMessage(error?.message || "Payment failed");
      _setSuccessMessage("");
      _setProcessing(false);
    }
  }

  async function resetCardReader() {
    if (!activeReader) return;
    try {
      _setSuccessMessage("Resetting reader...");
      _setErrorMessage("");
      await newCheckoutCancelStripePayment(activeReader.id);
      _setSuccessMessage("Reader reset");
      _setProcessing(false);
      _setPaymentIntentID("");
      if (sListeners) {
        sListeners.unsubscribe();
        _setListeners(null);
      }
    } catch (error) {
      _setErrorMessage("Failed to reset reader");
      _setSuccessMessage("");
    }
  }

  let readerDropdownData = stripeReaders
    .filter((r) => r.status === "online")
    .map((r) => ({
      id: r.id,
      label: r.label || r.id,
    }));

  let hasOnlineReaders = readerDropdownData.length > 0;
  let boxEnabled = hasOnlineReaders && !saleComplete;
  let isEnabled = boxEnabled && amountLeftToPay > 0 && !sProcessing;

  return (
    <View
      pointerEvents={boxEnabled ? "auto" : "none"}
      style={{
        alignItems: "center",
        paddingTop: 20,
        width: "100%",
        height: "48%",
        borderRadius: 15,
        ...SHADOW_RADIUS_PROTO,
        justifyContent: "space-between",
        paddingBottom: 20,
        opacity: boxEnabled ? 1 : 0.2,
      }}
    >
      {/* Title */}
      <Text
        style={{
          fontSize: 25,
          color: gray(0.6),
          fontWeight: 500,
        }}
      >
        CARD SALE
      </Text>

      {/* Reader Selection */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          width: "80%",
          marginTop: 5,
        }}
      >
        <View style={{ flex: 1 }}>
          <DropdownMenu
            dataArr={readerDropdownData}
            onSelect={handleReaderSelect}
            buttonText={
              activeReader
                ? activeReader.label || activeReader.id
                : "Select Reader"
            }
            enabled={isEnabled}
            buttonStyle={{
              paddingVertical: 6,
              paddingHorizontal: 8,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: C.buttonLightGreenOutline,
              backgroundColor: C.listItemWhite,
            }}
          />
        </View>
        <TouchableOpacity
          onPress={resetCardReader}
          style={{
            paddingVertical: 6,
            paddingHorizontal: 10,
            borderRadius: 6,
            backgroundColor: gray(0.08),
          }}
        >
          <Text style={{ fontSize: 11, color: C.lightText }}>Reset</Text>
        </TouchableOpacity>
      </View>

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
          width: "60%",
          marginTop: 5,
        }}
      >
        <Text style={{ fontSize: 15 }}>$</Text>
        <View
          style={{
            width: 120,
            alignItems: "flex-end",
            paddingRight: 5,
          }}
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

      {/* Status Messages */}
      {sErrorMessage ? (
        <Text
          style={{
            fontSize: 11,
            color: C.lightred,
            fontStyle: "italic",
            marginBottom: 4,
          }}
        >
          {sErrorMessage}
        </Text>
      ) : null}
      {sSuccessMessage ? (
        <Text
          style={{
            fontSize: 11,
            color: C.green,
            fontStyle: "italic",
            marginBottom: 4,
          }}
        >
          {sSuccessMessage}
        </Text>
      ) : null}

      {/* Process Button */}
      <Button_
        text={sProcessing ? "PROCESSING..." : "START CARD SALE"}
        onPress={startPayment}
        enabled={isEnabled && sRequestedAmount >= 50}
        colorGradientArr={COLOR_GRADIENTS.blue}
        textStyle={{ color: C.textWhite, fontSize: 16 }}
        buttonStyle={{
          cursor: isEnabled && sRequestedAmount >= 50 ? "inherit" : "default",
        }}
      />
    </View>
  );
}

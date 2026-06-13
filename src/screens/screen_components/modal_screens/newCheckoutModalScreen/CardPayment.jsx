/* eslint-disable */
import { useState, useRef, memo } from "react";
import { Button, TextInput, Image, SmallLoadingIndicator } from "../../../../dom_components";
import { C, COLOR_GRADIENTS, Fonts, ICONS } from "../../../../styles";
import { usdTypeMask, formatCurrencyDisp, log } from "../../../../utils";
import { takeId, getId } from "../../../../idPool";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardNumberElement, CardExpiryElement, CardCvcElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { STRIPE_PUBLISHABLE_KEY } from "../../../../private_user_constants";
import { buildManualCardTransaction } from "./newCheckoutUtils";
import { newCheckoutProcessManualCardPayment } from "./newCheckoutFirebaseCalls";
import { dlog, DCAT } from "./checkoutDebugLog";
import styles from "./CardPayment.module.css";

const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);

const STRIPE_ELEMENT_STYLE = {
  base: {
    fontSize: "14px",
    color: "#333",
    "::placeholder": { color: "rgb(192,192,192)" },
  },
  invalid: { color: "#e53e3e" },
};
const STRIPE_ELEMENT_OPTIONS = { style: STRIPE_ELEMENT_STYLE, disableLink: true };

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
  onPaymentFailed,
  lockAmount = false,
  transactionId = null,
  onTransactionIdUsed,
}) {
  const stripe = useStripe();
  const elements = useElements();

  const [sRequestedAmount, _setRequestedAmount] = useState("");
  const [sRequestedAmountDisp, _setRequestedAmountDisp] = useState("");

  const [sZip, _setZip] = useState("33900");

  const [sCardComplete, _setCardComplete] = useState(false);
  const [sExpComplete, _setExpComplete] = useState(false);
  const [sCvcComplete, _setCvcComplete] = useState(false);

  const [sCardReady, _setCardReady] = useState(false);

  const [sProcessing, _setProcessing] = useState(false);
  const [sDone, _setDone] = useState(false);
  const [sError, _setError] = useState("");
  const [sSuccess, _setSuccess] = useState("");

  const [sButtonFocused, _setButtonFocused] = useState(false);

  const autoLoadedRef = useRef(false);
  const prevAmountRef = useRef(amountLeftToPay);
  const zipRef = useRef(null);
  const startBtnRef = useRef(null);

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

  function handleAmountChange(val) {
    let result = usdTypeMask(val, { withDollar: false });
    dlog(DCAT.INPUT, "amount_change", "CardPayment", { cents: result.cents, capped: result.cents > amountLeftToPay });
    if (result.cents > amountLeftToPay) {
      _setRequestedAmountDisp(formatCurrencyDisp(amountLeftToPay));
      _setRequestedAmount(amountLeftToPay);
      return;
    }
    _setRequestedAmountDisp(result.display);
    _setRequestedAmount(result.cents);
  }

  function handleZipChange(val) {
    let digits = (val || "").replace(/\D/g, "").slice(0, 5);
    dlog(DCAT.INPUT, "zip_change", "CardPayment", { length: digits.length });
    _setZip(digits);
    if (digits.length >= 5) focusExpiry();
  }

  function validate() {
    if (!sRequestedAmount || sRequestedAmount < 50) return "Minimum card payment is $0.50";
    if (sRequestedAmount > amountLeftToPay) return "Amount exceeds balance due";
    if (!sCardComplete) return "Card number is incomplete";
    if (!sExpComplete) return "Expiration is incomplete";
    if (!sCvcComplete) return "CVC is incomplete";
    if (sZip.length < 5) return "Zip code must be 5 digits";
    return null;
  }

  async function handleCharge() {
    dlog(DCAT.BUTTON, "START_MANUAL_CARD_PAYMENT", "CardPayment", { amount: sRequestedAmount, saleID });
    let err = validate();
    if (err) {
      dlog(DCAT.ACTION, "manualCardPayment_validation_failed", "CardPayment", { error: err });
      _setError(err);
      return;
    }
    if (!stripe || !elements) {
      _setError("Payment system not loaded yet");
      return;
    }

    const cardElement = elements.getElement(CardNumberElement);

    _setProcessing(true);
    _setError("");
    _setSuccess("");

    let transactionID;
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

      transactionID = takeId("transactions") || await getId("transactions");

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
        dlog(DCAT.ACTION, "manualCardPayment_success", "CardPayment", { amountCaptured: payment.amountCaptured, transactionID });
        _setSuccess(`Payment of ${formatCurrencyDisp(payment.amountCaptured)} approved`);
        _setDone(true);
        _setProcessing(false);
        if (onPaymentCapture) onPaymentCapture(payment);
        if (onCardProcessingEnd) onCardProcessingEnd();

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
        if (onPaymentFailed) onPaymentFailed(transactionID);
        if (onCardProcessingEnd) onCardProcessingEnd();
      }
    } catch (error) {
      log("CardPayment charge error:", error);
      dlog(DCAT.ACTION, "manualCardPayment_error", "CardPayment", { message: error?.message });
      _setError(error?.message || "Payment failed");
      _setProcessing(false);
      if (onPaymentFailed) onPaymentFailed(transactionID);
      if (onCardProcessingEnd) onCardProcessingEnd();
    }
  }

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

  let formLocked = sProcessing || sDone || saleComplete;
  let chargeEnabled = !formLocked && sRequestedAmount >= 50 && sCardReady && sCardComplete && sExpComplete && sCvcComplete && sZip.length >= 5 && !!stripe;

  let elementContainerStyle = {
    borderColor: C.buttonLightGreenOutline,
    backgroundColor: C.listItemWhite,
  };

  let labelStyle = {
    color: C.textMuted,
    fontWeight: Fonts.weight.textHeavy,
  };

  let isPaidInFull = saleComplete || amountLeftToPay <= 0;
  let celebrationGif = isPaidInFull ? ICONS.guyCelebrating : ICONS.popperCelebration;

  if (sDone || isPaidInFull) {
    return (
      <div className={styles.containerDone}>
        <div className={styles.celebrationInner}>
          <Image
            src={celebrationGif}
            width={100}
            height={100}
            resizeMode="contain"
            style={{ marginBottom: 14, backgroundColor: "transparent" }}
          />
          <span className={styles.celebrationText} style={{ color: C.green }}>
            {isPaidInFull ? "Full payment complete!" : sSuccess}
          </span>
        </div>
      </div>
    );
  }

  let inert = saleComplete || sProcessing;

  return (
    <div
      className={styles.container}
      style={{
        opacity: saleComplete ? 0.2 : 1,
        pointerEvents: inert ? "none" : "auto",
      }}
    >
      {sProcessing && (
        <div className={styles.overlay}>
          <SmallLoadingIndicator color={C.green} text="" message="" containerStyle={{ padding: 2 }} />
          <span className={styles.overlayText} style={{ color: C.textMuted }}>Processing payment...</span>
          {!!sError && (
            <span className={styles.overlayError} style={{ color: C.lightred }}>{sError}</span>
          )}
        </div>
      )}

      <span className={styles.title} style={{ color: C.textSecondary }}>
        MANUAL CARD SALE
      </span>

      <div
        className={styles.amountBox}
        style={{
          borderColor: C.buttonLightGreenOutline,
          backgroundColor: C.listItemWhite,
          pointerEvents: formLocked ? "none" : "auto",
        }}
      >
        <span className={styles.amountDollar}>$</span>
        <div className={styles.amountInputWrap}>
          <TextInput
            debounceMs={0}
            onFocus={() => {
              if (lockAmount) return;
              _setRequestedAmountDisp("");
              _setRequestedAmount(0);
            }}
            style={{ color: lockAmount ? C.textMuted : C.text }}
            className={styles.amountInput}
            placeholder="0.00"
            placeholderTextColor={C.textDisabled}
            value={sRequestedAmountDisp}
            onChangeText={handleAmountChange}
            editable={!formLocked && !lockAmount}
          />
        </div>
      </div>

      <div
        className={styles.rowSplit}
        style={{ opacity: formLocked ? 0.5 : 1, pointerEvents: formLocked ? "none" : "auto" }}
      >
        <div className={styles.cardCol}>
          <div className={styles.label} style={labelStyle}>Card Number</div>
          <div className={styles.elementContainer} style={elementContainerStyle}>
            <CardNumberElement
              options={STRIPE_ELEMENT_OPTIONS}
              onReady={() => _setCardReady(true)}
              onChange={(e) => {
                dlog(DCAT.INPUT, "cardNumber_complete", "CardPayment", { complete: e.complete });
                _setCardComplete(e.complete);
                if (e.complete) focusZip();
              }}
            />
          </div>
        </div>
        <div className={styles.zipCol}>
          <div className={styles.label} style={labelStyle}>Zip</div>
          <TextInput
            ref={zipRef}
            debounceMs={0}
            className={styles.zipInput}
            style={{
              color: C.text,
              borderColor: C.buttonLightGreenOutline,
              backgroundColor: C.listItemWhite,
            }}
            value={sZip}
            onChangeText={handleZipChange}
            placeholder="00000"
            placeholderTextColor={C.textDisabled}
            editable={!formLocked}
            autoComplete="off"
            name="zp-inp"
          />
        </div>
      </div>

      <div
        className={styles.rowSplit}
        style={{ opacity: formLocked ? 0.5 : 1, pointerEvents: formLocked ? "none" : "auto" }}
      >
        <div className={styles.halfColLeft}>
          <div className={styles.label} style={labelStyle}>Expiration</div>
          <div className={styles.elementContainer} style={elementContainerStyle}>
            <CardExpiryElement
              options={STRIPE_ELEMENT_OPTIONS}
              onChange={(e) => {
                dlog(DCAT.INPUT, "cardExpiry_complete", "CardPayment", { complete: e.complete });
                _setExpComplete(e.complete);
                if (e.complete) focusCvc();
              }}
            />
          </div>
        </div>
        <div className={styles.halfCol}>
          <div className={styles.label} style={labelStyle}>CVC</div>
          <div className={styles.elementContainer} style={elementContainerStyle}>
            <CardCvcElement
              options={STRIPE_ELEMENT_OPTIONS}
              onChange={(e) => {
                dlog(DCAT.INPUT, "cardCvc_complete", "CardPayment", { complete: e.complete });
                _setCvcComplete(e.complete);
                if (e.complete) focusStartButton();
              }}
            />
          </div>
        </div>
      </div>

      <div className={styles.statusRow}>
        {sProcessing && !sError && (
          <div className={styles.statusInline}>
            <SmallLoadingIndicator color={C.green} text="" message="" containerStyle={{ padding: 2 }} />
            <span className={styles.statusText} style={{ color: C.textMuted }}>Processing payment...</span>
          </div>
        )}
        {!!sError && (
          <span className={styles.statusError} style={{ color: C.lightred }}>{sError}</span>
        )}
      </div>

      <div className={styles.actionRow}>
        <div className={styles.actionLeft} />
        <div
          ref={startBtnRef}
          tabIndex={0}
          onFocus={() => _setButtonFocused(true)}
          onBlur={() => _setButtonFocused(false)}
          onKeyDown={(e) => { if (e.key === "Enter" && chargeEnabled) handleCharge(); }}
          className={styles.actionCenter}
        >
          <Button
            text="Start Sale"
            onPress={handleCharge}
            enabled={chargeEnabled}
            colorGradientArr={COLOR_GRADIENTS.green}
            textStyle={{ color: C.textWhite, fontSize: 16 }}
            buttonStyle={{
              paddingLeft: 30,
              paddingRight: 30,
              cursor: chargeEnabled ? "inherit" : "default",
              border: sButtonFocused ? `1px solid ${C.borderStrong}` : "1px solid transparent",
            }}
          />
        </div>
        <div className={styles.actionRight}>
          <Button
            text="Card Reader"
            onPress={() => { dlog(DCAT.BUTTON, "SWITCH_TO_READER", "CardPayment", {}); if (onSwitchToReader) onSwitchToReader(); }}
            enabled={!formLocked}
            colorGradientArr={COLOR_GRADIENTS.blue}
            textStyle={{ color: C.textWhite, fontSize: 11 }}
            buttonStyle={{ paddingTop: 2, paddingBottom: 2, paddingRight: 10, width: 90, cursor: formLocked ? "default" : "inherit" }}
          />
        </div>
      </div>
    </div>
  );
}

export const CardPayment = memo(function CardPayment(props) {
  return (
    <Elements stripe={stripePromise}>
      <CardPaymentForm {...props} />
    </Elements>
  );
});

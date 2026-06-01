/* eslint-disable */
import { useState, useRef, memo } from "react";
import { Button, CheckBox, TextInput, Image } from "../../../../dom_components";
import { C, COLOR_GRADIENTS, ICONS, Radius } from "../../../../styles";
import {
  usdTypeMask,
  formatCurrencyDisp,
  roundCashCentsForCurrency,
} from "../../../../utils";
import { useSettingsStore } from "../../../../stores";
import { buildCashTransaction } from "./newCheckoutUtils";
import { takeId, getId } from "../../../../idPool";
import { dlog, DCAT } from "./checkoutDebugLog";
import styles from "./CashPayment.module.css";

export const CashPayment = memo(function CashPayment({
  amountLeftToPay = 0,
  onPaymentCapture,
  acceptChecks = false,
  saleComplete = false,
  onCashChange,
  hasReaders = false,
  isVisible = false,
  lockAmount = false,
  cardIsProcessing = false,
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

  // CAD cash payments round to nearest nickel (no pennies in Canada). USD
  // and any unknown currency stay exact. Card/check paths are unaffected —
  // only physical cash needs rounding.
  const currency = useSettingsStore.getState().getSettings()?.currency || "USD";
  const roundedLeftToPay = roundCashCentsForCurrency(amountLeftToPay, currency);
  const isCadCash = (currency || "").toUpperCase() === "CAD";

  if (amountLeftToPay > 0 && !autoLoadedRef.current && isVisible) {
    autoLoadedRef.current = true;
    prevAmountRef.current = amountLeftToPay;
    _setPayAmountDisp(formatCurrencyDisp(roundedLeftToPay));
    _setPayAmount(roundedLeftToPay);
    if (!hasReaders) {
      setTimeout(() => tenderInputRef.current?.focus(), 100);
    }
  }

  if (autoLoadedRef.current && amountLeftToPay !== prevAmountRef.current) {
    prevAmountRef.current = amountLeftToPay;
    if (amountLeftToPay > 0) {
      _setPayAmountDisp(formatCurrencyDisp(roundedLeftToPay));
      _setPayAmount(roundedLeftToPay);
    } else {
      _setPayAmountDisp("");
      _setPayAmount(0);
    }
    _setTenderAmountDisp("");
    _setTenderAmount(0);
  }

  function handlePayAmountChange(val) {
    let result = usdTypeMask(val, { withDollar: false });
    let cents = roundCashCentsForCurrency(result.cents, currency);
    dlog(DCAT.INPUT, "payAmount_change", "CashPayment", { cents, capped: cents > roundedLeftToPay });
    if (cents > roundedLeftToPay) {
      _setPayAmountDisp(formatCurrencyDisp(roundedLeftToPay));
      _setPayAmount(roundedLeftToPay);
      return;
    }
    // Snap to nickel for CAD; keep raw display for USD.
    _setPayAmountDisp(isCadCash ? formatCurrencyDisp(cents) : result.display);
    _setPayAmount(cents);
  }

  function handleTenderAmountChange(val) {
    let result = usdTypeMask(val, { withDollar: false });
    dlog(DCAT.INPUT, "tenderAmount_change", "CashPayment", { cents: result.cents });
    _setTenderAmountDisp(result.display);
    _setTenderAmount(result.cents);
  }

  async function handleProcessPayment() {
    dlog(DCAT.BUTTON, "COMPLETE_PAYMENT", "CashPayment", { payAmount: sPayAmount, tenderAmount: sTenderAmount, isCheck: sIsCheck, amountLeftToPay });
    if (!sPayAmount || sPayAmount <= 0) {
      _setStatusMessage("Enter a payment amount");
      return;
    }
    // CAD cash rounding can push the rounded pay amount above the raw
    // amountLeftToPay (e.g., $1.03 bill rounds up to $1.05 due). Compare to
    // the rounded ceiling so rounding-up doesn't trip the cap.
    if (sPayAmount > roundedLeftToPay) {
      _setStatusMessage("Amount exceeds balance due");
      return;
    }

    let tenderCents = sTenderAmount || sPayAmount;
    if (!sIsCheck && tenderCents < sPayAmount) {
      _setStatusMessage("Tender amount must be >= pay amount");
      return;
    }

    let txnId = takeId("transactions") || await getId("transactions");
    let payment = buildCashTransaction(sPayAmount, tenderCents, sIsCheck, txnId);

    let change = tenderCents - sPayAmount;
    if (change > 0 && onCashChange) {
      onCashChange(change);
    }

    if (onPaymentCapture) onPaymentCapture(payment);

    _setSuccessMsg(`Payment of $${formatCurrencyDisp(payment.amountCaptured)} approved`);
    _setDone(true);

    _setPayAmount("");
    _setPayAmountDisp("");
    _setTenderAmount("");
    _setTenderAmountDisp("");
    _setStatusMessage("");
    _setIsCheck(false);

    let newRemaining = amountLeftToPay - payment.amountCaptured;
    if (newRemaining > 0) {
      setTimeout(() => {
        _setDone(false);
        _setSuccessMsg("");
      }, 3000);
    }
  }

  let isEnabled = !saleComplete && amountLeftToPay > 0;
  let celebrationGif = saleComplete ? ICONS.guyCelebrating : ICONS.popperCelebration;

  if (sDone) {
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
            {saleComplete ? "Full payment complete!" : sSuccessMsg}
          </span>
        </div>
      </div>
    );
  }

  let inert = saleComplete || amountLeftToPay <= 0 || cardIsProcessing;
  let containerOpacity = saleComplete || amountLeftToPay <= 0 ? 0.2 : cardIsProcessing ? 0.4 : 1;
  let canComplete = isEnabled && sPayAmount > 0 && (sIsCheck || sTenderAmount >= sPayAmount);

  return (
    <div
      className={styles.container}
      style={{
        opacity: containerOpacity,
        pointerEvents: inert ? "none" : "auto",
      }}
    >
      {!!acceptChecks && (
        <div className={styles.checkBoxRow}>
          <CheckBox
            enabled={isEnabled}
            textStyle={{ fontSize: 12 }}
            text={"Paper Check"}
            onCheck={() => {
              dlog(DCAT.CHECKBOX, "paperCheck_toggle", "CashPayment", { newValue: !sIsCheck });
              _setIsCheck(!sIsCheck);
            }}
            isChecked={sIsCheck}
          />
        </div>
      )}

      <span className={styles.title} style={{ color: C.textSecondary }}>
        {sIsCheck ? "CHECK SALE" : "CASH SALE"}
      </span>

      <div
        className={styles.payRow}
        style={{
          backgroundColor: C.listItemWhite,
          borderColor: C.buttonLightGreenOutline,
        }}
      >
        <div className={styles.labelsCol}>
          <span className={styles.labelTop} style={{ color: C.text }}>Balance</span>
          <span className={styles.labelBottom} style={{ color: C.text }}>Pay Amount</span>
        </div>
        <div className={styles.valuesCol}>
          <span className={styles.balanceText} style={{ color: C.text }}>
            {"$ " + formatCurrencyDisp(roundedLeftToPay)}
          </span>
          {isCadCash && roundedLeftToPay !== amountLeftToPay && (
            <span style={{ color: C.textMuted, fontSize: 11, marginTop: 2 }}>
              {`Cash rounded from $${formatCurrencyDisp(amountLeftToPay)} (nearest 5¢)`}
            </span>
          )}
          <div
            className={styles.payAmountBox}
            style={{
              borderColor: C.buttonLightGreenOutline,
              backgroundColor: C.listItemWhite,
            }}
          >
            <span className={styles.dollarSign}>$</span>
            <div className={styles.payInputWrap}>
              <TextInput
                debounceMs={0}
                onFocus={() => {
                  if (lockAmount) return;
                  _setFocused("pay");
                  _setPayAmountDisp("");
                  _setPayAmount(0);
                }}
                style={{
                  color: lockAmount ? C.textMuted : C.text,
                }}
                className={styles.payInput}
                placeholder="0.00"
                placeholderTextColor={C.textDisabled}
                value={sPayAmountDisp}
                onChangeText={handlePayAmountChange}
                editable={isEnabled && !lockAmount}
              />
            </div>
          </div>
        </div>
      </div>

      {!sIsCheck && (
        <div className={styles.tenderSection}>
          <div
            className={styles.tenderBox}
            style={{
              borderColor: C.buttonLightGreenOutline,
              backgroundColor: C.listItemWhite,
            }}
          >
            <span className={styles.tenderDollar} style={{ color: C.green }}>$</span>
            <div className={styles.tenderInputWrap}>
              <TextInput
                ref={tenderInputRef}
                debounceMs={0}
                onFocus={() => {
                  _setFocused("tender");
                  _setTenderAmountDisp("");
                  _setTenderAmount(0);
                }}
                style={{ color: C.green }}
                className={styles.tenderInput}
                placeholder="0.00"
                placeholderTextColor={C.textDisabled}
                value={sTenderAmountDisp}
                onChangeText={handleTenderAmountChange}
                editable={isEnabled}
              />
              <span className={styles.tenderLabel}>Tender</span>
              {sTenderAmount > 0 && sPayAmount > 0 && sTenderAmount >= sPayAmount && (
                <span className={styles.changeText} style={{ color: C.green }}>
                  {"Change: $" + formatCurrencyDisp(sTenderAmount - sPayAmount)}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {sStatusMessage ? (
        <span className={styles.statusMsg} style={{ color: C.lightred }}>
          {sStatusMessage}
        </span>
      ) : null}

      <Button
        text="COMPLETE PAYMENT"
        onPress={handleProcessPayment}
        enabled={canComplete}
        colorGradientArr={COLOR_GRADIENTS.green}
        textStyle={{ color: C.textWhite, fontSize: 16 }}
        buttonStyle={{
          cursor: canComplete ? "inherit" : "default",
          borderRadius: Radius.control,
        }}
      />
    </div>
  );
});

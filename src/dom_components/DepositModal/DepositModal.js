import React, { forwardRef, useState, useCallback } from "react";
import ReactDOM from "react-dom";
import { C, COLOR_GRADIENTS } from "../../styles";
import { gray, usdTypeMask } from "../../utils";
import { CUSTOMER_DEPOST_TYPES } from "../../data";
import styles from "./DepositModal.module.css";

export const DepositModal = forwardRef(function DepositModal(
  {
    visible,
    onClose,
    onPay,
    onCredit,
    inline,
    inlineStyle = {},
    customer,
    className = "",
    "data-testid": testId,
  },
  ref
) {
  const [sDepositType, _sSetDepositType] = useState(CUSTOMER_DEPOST_TYPES.deposit);
  const [sDepositAmount, _sSetDepositAmount] = useState("");
  const [sDepositAmountCents, _sSetDepositAmountCents] = useState(0);
  const [sDepositNote, _sSetDepositNote] = useState("");
  const [sSendSMS, _sSetSendSMS] = useState(false);
  const [sSendEmail, _sSetSendEmail] = useState(false);

  let isCredit = sDepositType === CUSTOMER_DEPOST_TYPES.credit;
  let isGiftCard = false;
  let creditReady = isCredit && sDepositAmountCents >= 100 && sDepositNote.trim().length > 3;
  let depositReady = (!isCredit && !isGiftCard) && sDepositAmountCents > 0;
  let giftCardReady = false;
  let hasPhone = !!(customer?.customerCell || customer?.cell);
  let hasEmail = !!customer?.email;
  let showSendReceipt = isCredit && (hasPhone || hasEmail);

  const resetAndClose = useCallback(() => {
    _sSetDepositAmount("");
    _sSetDepositAmountCents(0);
    _sSetDepositNote("");
    _sSetDepositType(CUSTOMER_DEPOST_TYPES.deposit);
    _sSetSendSMS(false);
    _sSetSendEmail(false);
    onClose();
  }, [onClose]);

  function handleCreditConfirm() {
    if (onCredit) {
      onCredit({
        amountCents: sDepositAmountCents,
        text: sDepositNote.trim(),
        sendSMS: sSendSMS,
        sendEmail: sSendEmail,
      });
    }
    resetAndClose();
  }

  if (!visible) return null;

  const confirmReady = isCredit ? creditReady : isGiftCard ? giftCardReady : depositReady;

  const innerCard = (
    <div
      ref={ref}
      className={`${styles.card} ${className}`}
      style={inline ? { position: "absolute", zIndex: 200, ...inlineStyle } : undefined}
      data-testid={testId}
      role="dialog"
      aria-label="Add Deposit or Credit"
    >
      <span className={styles.title} style={{ color: C.text }}>
        Add Deposit / Credit / Gift Card
      </span>

      {/* Type selection */}
      <div className={styles.typeRow}>
        <button
          className={`${styles.typeBtn} ${sDepositType === CUSTOMER_DEPOST_TYPES.deposit ? styles.typeBtnActive : ""}`}
          onClick={() => _sSetDepositType(CUSTOMER_DEPOST_TYPES.deposit)}
        >
          <span className={styles.typeBtnIcon}>{sDepositType === CUSTOMER_DEPOST_TYPES.deposit ? "☑" : "☐"}</span>
          <span className={styles.typeBtnText}>Deposit</span>
        </button>
        <button
          className={`${styles.typeBtn} ${isCredit ? styles.typeBtnActive : ""}`}
          onClick={() => _sSetDepositType(CUSTOMER_DEPOST_TYPES.credit)}
        >
          <span className={styles.typeBtnIcon}>{isCredit ? "☑" : "☐"}</span>
          <span className={styles.typeBtnText}>Credit</span>
        </button>
      </div>

      {/* Credit warning */}
      {isCredit && (
        <div className={styles.creditWarning}>
          <span className={styles.creditWarningIcon}>!</span>
          <span className={styles.creditWarningText}>
            Applying a credit will give a customer future free money
          </span>
        </div>
      )}

      {/* Amount input */}
      <div className={styles.amountRow} style={{ borderColor: C.buttonLightGreenOutline, backgroundColor: C.listItemWhite }}>
        <span className={styles.dollarSign} style={{ color: gray(0.4) }}>$</span>
        <input
          type="text"
          inputMode="decimal"
          className={styles.amountInput}
          placeholder="0.00"
          value={sDepositAmount}
          onChange={(e) => {
            let result = usdTypeMask(e.target.value);
            _sSetDepositAmount(result.display);
            _sSetDepositAmountCents(result.cents);
          }}
          autoFocus={true}
          style={{ color: C.text }}
        />
      </div>

      {/* Note input */}
      <textarea
        className={styles.noteInput}
        placeholder={isCredit ? "Reason (required)" : "Note (optional)"}
        value={sDepositNote}
        onChange={(e) => {
          let val = e.target.value;
          _sSetDepositNote(val.length === 1 ? val.toUpperCase() : val.charAt(0).toUpperCase() + val.slice(1));
        }}
        style={{
          borderColor: isCredit && sDepositNote.trim().length === 0 ? C.orange : gray(0.08),
          backgroundColor: C.listItemWhite,
          color: C.text,
        }}
      />

      {/* Send receipt */}
      {showSendReceipt && (
        <div className={styles.receiptSection}>
          <span className={styles.receiptLabel} style={{ color: gray(0.45) }}>Send Receipt</span>
          <div className={styles.receiptCheckboxes}>
            {hasPhone && (
              <button className={styles.checkBtn} onClick={() => _sSetSendSMS(!sSendSMS)}>
                <span>{sSendSMS ? "☑" : "☐"}</span>
                <span className={styles.checkLabel}>SMS</span>
              </button>
            )}
            {hasEmail && (
              <button className={styles.checkBtn} onClick={() => _sSetSendEmail(!sSendEmail)}>
                <span>{sSendEmail ? "☑" : "☐"}</span>
                <span className={styles.checkLabel}>Email</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className={styles.actions}>
        <button className={styles.cancelBtn} onClick={resetAndClose}>
          Cancel
        </button>
        <button
          className={styles.confirmBtn}
          onClick={() => {
            if (isCredit) {
              if (!creditReady) return;
              handleCreditConfirm();
            } else {
              if (!depositReady) return;
              onPay({
                type: sDepositType,
                amountCents: sDepositAmountCents,
                note: sDepositNote,
              });
              resetAndClose();
            }
          }}
          disabled={!confirmReady}
          style={{ opacity: confirmReady ? 1 : 0.4 }}
        >
          {isCredit ? "Apply Credit" : "Pay Amount"}
        </button>
      </div>
    </div>
  );

  if (inline) return innerCard;

  return ReactDOM.createPortal(
    <div className={styles.backdrop} onClick={resetAndClose}>
      <div onClick={(e) => e.stopPropagation()}>
        {innerCard}
      </div>
    </div>,
    document.body
  );
});

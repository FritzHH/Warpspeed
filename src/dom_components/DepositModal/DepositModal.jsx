import React, { useState, useCallback } from "react";
import { C } from "../../styles";
import { usdTypeMask } from "../../utils";
import { CUSTOMER_DEPOST_TYPES } from "../../data";
import { Dialog } from "../Dialog/Dialog";
import { ModalFooter, ModalFooterButton } from "../ModalFooter/ModalFooter";
import styles from "./DepositModal.module.css";

export const DepositModal = function DepositModal({
  visible,
  onClose,
  onPay,
  onCredit,
  customer,
  className = "",
  "data-testid": testId,
}) {
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

  const confirmReady = isCredit ? creditReady : isGiftCard ? giftCardReady : depositReady;

  return (
    <Dialog
      visible={visible}
      onClose={resetAndClose}
      title="Add Deposit / Credit / Gift Card"
      aria-label="Add Deposit or Credit"
    >
    <div
      className={`${styles.card} ${className}`}
      data-testid={testId}
    >
      <div className={styles.cardInner}>
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
        <span className={styles.dollarSign} style={{ color: C.textMuted }}>$</span>
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
          borderColor: isCredit && sDepositNote.trim().length === 0 ? C.warning : C.borderSubtle,
          backgroundColor: C.listItemWhite,
          color: C.text,
        }}
      />

      {/* Send receipt */}
      {showSendReceipt && (
        <div className={styles.receiptSection}>
          <span className={styles.receiptLabel} style={{ color: C.textMuted }}>Send Receipt</span>
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

      </div>
      <ModalFooter>
        <ModalFooterButton variant="danger" onClick={resetAndClose}>
          Cancel
        </ModalFooterButton>
        <ModalFooterButton
          variant="accent"
          disabled={!confirmReady}
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
        >
          {isCredit ? "Apply Credit" : "Pay Amount"}
        </ModalFooterButton>
      </ModalFooter>
    </div>
    </Dialog>
  );
};

/* eslint-disable */
import { useState } from "react";
import { Dialog, TextInput, ModalFooter, ModalFooterButton } from "../../../../dom_components";
import { C, Fonts } from "../../../../styles";
import { formatPhoneWithDashes, removeDashesFromPhone } from "../../../../utils";
import { dlog, DCAT } from "./checkoutDebugLog";
import styles from "./SendReceiptModal.module.css";

export function SendReceiptModal({ visible, onSend, onClose }) {
  const [sPhone, _sSetPhone] = useState("");
  const [sEmail, _sSetEmail] = useState("");
  const [sError, _sSetError] = useState("");
  const [sSending, _sSetSending] = useState(false);
  const [sSuccess, _sSetSuccess] = useState("");

  function handlePhoneChange(val) {
    dlog(DCAT.INPUT, "handlePhoneChange", "SendReceiptModal", { digitCount: val.replace(/\D/g, "").length });
    let digits = val.replace(/\D/g, "").slice(0, 10);
    _sSetPhone(formatPhoneWithDashes(digits));
    _sSetError("");
  }

  function handleEmailChange(val) {
    dlog(DCAT.INPUT, "handleEmailChange", "SendReceiptModal", { hasAt: val.includes("@") });
    _sSetEmail(val);
    _sSetError("");
  }

  function validate() {
    let rawPhone = removeDashesFromPhone(sPhone).replace(/\D/g, "");
    let hasPhone = rawPhone.length > 0;
    let trimmedEmail = sEmail.trim();
    let hasEmail = trimmedEmail.length > 0;
    if (!hasPhone && !hasEmail) return "Enter a phone number or email address";
    if (hasPhone && rawPhone.length !== 10) return "Phone number must be 10 digits";
    if (hasEmail && !trimmedEmail.includes("@")) return "Enter a valid email address";
    return null;
  }

  async function handleSend() {
    dlog(DCAT.BUTTON, "handleSend", "SendReceiptModal", { hasPhone: sPhone.replace(/\D/g, "").length > 0, hasEmail: sEmail.trim().length > 0 });
    let err = validate();
    if (err) {
      _sSetError(err);
      return;
    }
    _sSetError("");
    _sSetSending(true);
    let rawPhone = removeDashesFromPhone(sPhone).replace(/\D/g, "");
    let trimmedEmail = sEmail.trim();
    try {
      await onSend({ phone: rawPhone, email: trimmedEmail });
      _sSetSuccess("Receipt sent!");
      setTimeout(() => {
        _sSetSending(false);
        _sSetSuccess("");
        onClose();
      }, 1200);
    } catch (e) {
      _sSetError("Failed to send receipt");
      _sSetSending(false);
    }
  }

  let formLocked = sSending;

  let labelStyle = {
    color: C.textMuted,
    fontWeight: Fonts.weight.textHeavy,
  };

  let inputStyle = {
    color: C.text,
    borderColor: C.buttonLightGreenOutline,
    backgroundColor: C.listItemWhite,
  };

  return (
    <Dialog
      visible={visible}
      onClose={onClose}
      preventClose={formLocked}
      title="Send Receipt"
      aria-label="Send Receipt"
    >
      <div className={styles.panel} style={{ backgroundColor: C.backgroundWhite }}>
        <div className={styles.panelInner}>
        <span
          className={styles.title}
          style={{ color: C.textMuted, fontWeight: Fonts.weight.textHeavy }}
        >
          SEND RECEIPT
        </span>

        <div className={`${styles.field} ${styles.fieldPhone}`}>
          <span className={styles.label} style={labelStyle}>Phone Number</span>
          <TextInput
            debounceMs={0}
            className={styles.input}
            style={inputStyle}
            value={sPhone}
            onChangeText={handlePhoneChange}
            placeholder="239-291-9396"
            placeholderTextColor={C.textDisabled}
            autoFocus={true}
            editable={!formLocked}
          />
        </div>

        <div className={`${styles.field} ${styles.fieldEmail}`}>
          <span className={styles.label} style={labelStyle}>Email Address</span>
          <TextInput
            debounceMs={0}
            className={styles.input}
            style={inputStyle}
            value={sEmail}
            onChangeText={handleEmailChange}
            placeholder="customer@email.com"
            placeholderTextColor={C.textDisabled}
            editable={!formLocked}
          />
        </div>

        {!!sError && (
          <div className={styles.statusErr}>
            <span className={styles.statusText} style={{ color: C.lightred }}>{sError}</span>
          </div>
        )}
        {!!sSuccess && (
          <div className={styles.statusOk}>
            <span className={styles.statusText} style={{ color: C.green }}>{sSuccess}</span>
          </div>
        )}

        </div>
        <ModalFooter>
          <ModalFooterButton
            variant="danger"
            disabled={formLocked}
            onClick={() => { dlog(DCAT.BUTTON, "cancel", "SendReceiptModal", {}); onClose(); }}
          >
            CANCEL
          </ModalFooterButton>
          <ModalFooterButton
            variant="accent"
            disabled={formLocked}
            onClick={handleSend}
          >
            {sSending ? "SENDING..." : "SEND"}
          </ModalFooterButton>
        </ModalFooter>
      </div>
    </Dialog>
  );
}

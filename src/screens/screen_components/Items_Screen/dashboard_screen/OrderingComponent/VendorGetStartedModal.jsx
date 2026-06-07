import { useState } from "react";
import { createPortal } from "react-dom";
import { useZ } from "../../../../../hooks/useZ";
import { copyToClipboard } from "../../../../../utils";
import { ModalFooter, ModalFooterButton } from "../../../../../dom_components";
import styles from "./VendorGetStartedModal.module.css";

export function VendorGetStartedModal({ vendor, onClose }) {
  const z = useZ("modal", !!vendor);
  const [sCopiedField, _setCopiedField] = useState(null);

  if (!vendor) return null;

  const toEmail = vendor.toEmail || "";
  const subject = vendor.subject || "";
  const body = vendor.body || "";

  function handleCopy(field, text) {
    if (!text) return;
    copyToClipboard(text);
    _setCopiedField(field);
    setTimeout(() => {
      _setCopiedField((prev) => (prev === field ? null : prev));
    }, 2000);
  }

  return createPortal(
    <div className={styles.overlay} style={{ zIndex: z }} onClick={onClose}>
      <div className={styles.card} onClick={(e) => e.stopPropagation()}>
        <div className={styles.cardInner}>
          <div className={styles.header}>
            <span className={styles.title}>
              {vendor.displayName} — Get Started
            </span>
          </div>
          <p className={styles.intro}>
            Send the email below to {vendor.displayName} to receive the
            credentials you&apos;ll paste into the vendor card.
          </p>

          <FieldBlock
            label="To"
            value={toEmail}
            placeholder="(email address pending — ask user to fill in)"
            field="to"
            copied={sCopiedField === "to"}
            onCopy={handleCopy}
            single
          />

          <FieldBlock
            label="Subject"
            value={subject}
            field="subject"
            copied={sCopiedField === "subject"}
            onCopy={handleCopy}
            single
          />

          <FieldBlock
            label="Body"
            value={body}
            field="body"
            copied={sCopiedField === "body"}
            onCopy={handleCopy}
          />
        </div>
        <ModalFooter size="small">
          <ModalFooterButton variant="default" onClick={onClose}>
            Close
          </ModalFooterButton>
        </ModalFooter>
      </div>
    </div>,
    document.body,
  );
}

function FieldBlock({ label, value, placeholder, field, copied, onCopy, single }) {
  const hasValue = !!(value && value.trim());
  const displayValue = hasValue ? value : placeholder || "(pending)";
  return (
    <div className={styles.fieldBlock}>
      <div className={styles.fieldHeader}>
        <span className={styles.fieldLabel}>{label}</span>
        <button
          type="button"
          className={styles.copyBtn}
          onClick={() => onCopy(field, value)}
          disabled={!hasValue}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {single ? (
        <div
          className={`${styles.singleValue} ${!hasValue ? styles.pendingValue : ""}`}
        >
          {displayValue}
        </div>
      ) : (
        <pre
          className={`${styles.multiValue} ${!hasValue ? styles.pendingValue : ""}`}
        >
          {displayValue}
        </pre>
      )}
    </div>
  );
}

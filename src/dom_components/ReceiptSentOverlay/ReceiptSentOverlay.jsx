import React, { forwardRef, useEffect } from "react";
import { C, ICONS } from "../../styles";
import styles from "./ReceiptSentOverlay.module.css";

export const ReceiptSentOverlay = forwardRef(function ReceiptSentOverlay(
  {
    visible,
    sentSMS,
    sentEmail,
    duration = 1300,
    onDone,
    className = "",
    "data-testid": testId,
  },
  ref
) {
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => {
      if (onDone) onDone();
    }, duration);
    return () => clearTimeout(t);
  }, [visible, duration, onDone]);

  if (!visible) return null;

  const parts = [];
  if (sentSMS) parts.push("Text");
  if (sentEmail) parts.push("Email");
  const label = parts.join(" & ") + " Sent";

  const resolveIcon = (src) => {
    if (!src) return null;
    return typeof src === "object" ? src.default || src : src;
  };

  return (
    <div
      ref={ref}
      className={`${styles.backdrop} ${className}`}
      data-testid={testId}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className={styles.card}>
        <img
          src={resolveIcon(ICONS.paperPlane)}
          alt=""
          className={styles.icon}
        />
        <span
          className={styles.label}
          style={{ color: C.text }}
        >
          {label}
        </span>
      </div>
    </div>
  );
});

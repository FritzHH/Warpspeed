import React from "react";
import { createPortal } from "react-dom";
import { useBillingStore } from "../../stores";
import { useZ } from "../../hooks/useZ";
import styles from "./BillingSuspensionBanner.module.css";

function formatGraceRemaining(graceUntil) {
  const ms = graceUntil - Date.now();
  if (ms <= 0) return "today";
  const days = Math.ceil(ms / 86400000);
  if (days === 1) return "1 day";
  return `${days} days`;
}

export const BillingSuspensionBanner = () => {
  const tenantDoc = useBillingStore((s) => s.tenantDoc);
  const isBlocked = useBillingStore((s) => s.isPaymentBlocked());
  const isGrace = useBillingStore((s) => s.isInGracePeriod());
  const active = isBlocked || isGrace;
  const z = useZ("toast", active);
  if (!active) return null;

  const variant = isBlocked ? "danger" : "warning";
  const remaining =
    isGrace && typeof tenantDoc?.subscriptionGraceUntil === "number"
      ? formatGraceRemaining(tenantDoc.subscriptionGraceUntil)
      : null;

  const message = isBlocked
    ? "Billing suspended — update payment method in Subscription to restore payment processing"
    : `Payment failed — ${remaining} until billing is suspended. Update payment method in Subscription.`;

  return createPortal(
    <div
      className={`${styles.banner} ${variant === "danger" ? styles.danger : styles.warning}`}
      style={{ zIndex: z }}
    >
      <span className={styles.text}>{message}</span>
    </div>,
    document.body,
  );
};

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ModalFooter, ModalFooterButton } from "../ModalFooter/ModalFooter";
import { useAlertScreenStore, useLayoutStore } from "../../stores";
import { useZ } from "../../hooks/useZ";
import styles from "./AlertBox.module.css";

const OFFSET_PX = 20;
const GHOST_CLICK_GUARD_MS = 300;

export const AlertBox = ({ showAlert }) => {
  const zAlerts = useAlertScreenStore((state) => state.alerts);
  const z = useZ("alert", showAlert);
  const topShownAtRef = useRef(0);

  const topId = zAlerts.length > 0 ? zAlerts[zAlerts.length - 1].id : null;

  useEffect(() => {
    if (topId) topShownAtRef.current = Date.now();
  }, [topId]);

  useEffect(() => {
    if (!showAlert) return;
    function onKeyDown(e) {
      if (e.key !== "Escape") return;
      const top = useAlertScreenStore.getState().getTopAlert();
      if (top && top.canExitOnOuterClick) {
        useAlertScreenStore.getState().dismissTop();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [showAlert]);

  if (!showAlert || zAlerts.length === 0) return null;

  const topIndex = zAlerts.length - 1;
  const topAlert = zAlerts[topIndex];
  const underlying = zAlerts.slice(0, -1);

  return createPortal(
    <>
      {underlying.map((alert, i) => (
        <AlertCard
          key={alert.id}
          alert={alert}
          index={i}
          isTop={false}
          z={z}
        />
      ))}
      <div
        className={styles.overlay}
        data-alert-portal=""
        style={{ zIndex: z }}
        onClick={() => {
          if (Date.now() - topShownAtRef.current < GHOST_CLICK_GUARD_MS) return;
          if (topAlert.canExitOnOuterClick) {
            useAlertScreenStore.getState().dismissTop();
          }
        }}
      />
      <AlertCard
        key={topAlert.id}
        alert={topAlert}
        index={topIndex}
        isTop
        z={z}
      />
    </>,
    document.body
  );
};

function SeverityGlyph({ severity }) {
  if (severity === "warning") {
    return (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
        <path d="M12 2.5L1 21.5h22L12 2.5zm0 4.5L19.4 20H4.6L12 7zm-1 4v4.5h2V11h-2zm0 6v2h2v-2h-2z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v2h-2V7zm0 4h2v7h-2v-7z" />
    </svg>
  );
}

function AlertCard({ alert, index, isTop, z }) {
  const cardRef = useRef(null);
  const [sBusy, _setBusy] = useState(false);
  const deviceType = useLayoutStore((state) => state.deviceType);
  const variantClass =
    deviceType === "tablet" ? styles.tablet :
    deviceType === "mobile" ? styles.phone :
    "";
  const btnStyle =
    deviceType === "tablet" ? { fontSize: 26, height: 64 } :
    deviceType === "mobile" ? { fontSize: 22, height: 56 } :
    undefined;

  useEffect(() => {
    if (!alert.autoDismiss) return;
    const ms = alert.autoDismissMs > 0 ? alert.autoDismissMs : 4000;
    const t = setTimeout(() => {
      useAlertScreenStore.getState().dismissAlert(alert.id);
    }, ms);
    return () => clearTimeout(t);
  }, [alert.id, alert.autoDismiss, alert.autoDismissMs]);

  useEffect(() => {
    if (!isTop || !cardRef.current) return;
    const btn = cardRef.current.querySelector("button");
    if (btn) btn.focus();
  }, [isTop, alert.id]);

  function dismiss() {
    useAlertScreenStore.getState().dismissAlert(alert.id);
  }

  function makeHandler(handler) {
    return async () => {
      if (typeof handler !== "function") {
        dismiss();
        return;
      }
      try {
        _setBusy(true);
        let result = handler();
        if (result && typeof result.then === "function") {
          await result;
        }
        dismiss();
      } catch (err) {
        _setBusy(false);
      }
    };
  }

  const showCancel =
    !alert.autoDismiss &&
    (alert.useCancelButton ||
      (!alert.handleBtn2Press && !alert.handleBtn3Press));

  const offset = index * OFFSET_PX;
  const severity = alert.severity === "warning" ? "warning" : "info";
  const severityClass = severity === "warning" ? styles.warning : styles.info;
  const hasTitle = !!alert.title;
  // default-variant (CANCEL / btn2) buttons sit on the white footer,
  // so override ModalFooter's default white text to a readable dark.
  const neutralBtnStyle = { ...(btnStyle || {}), color: "var(--text-default)" };

  return (
    <div
      ref={cardRef}
      role={isTop ? "alertdialog" : undefined}
      aria-modal={isTop ? "true" : undefined}
      aria-labelledby={isTop && hasTitle ? `${alert.id}-title` : undefined}
      aria-describedby={isTop && alert.message ? `${alert.id}-message` : undefined}
      className={`${styles.content} ${severityClass} ${variantClass}`}
      data-alert-portal=""
      style={{
        zIndex: z,
        opacity: isTop ? 1 : 0.85,
        pointerEvents: isTop ? "auto" : "none",
        transform: `translate(calc(-50% + ${offset}px), calc(-50% + ${offset}px))`,
        ...alert.alertBoxStyle,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className={styles.accentStrip} />
      {hasTitle && (
        <div className={styles.header}>
          <div className={styles.iconBubble}>
            <SeverityGlyph severity={severity} />
          </div>
          <div className={styles.title} id={`${alert.id}-title`}>
            {alert.title}
          </div>
        </div>
      )}
      <div className={`${styles.body} ${hasTitle ? "" : styles.bodyNoTitle}`}>
        {alert.message && (
          <p className={styles.message} id={`${alert.id}-message`}>
            {alert.message}
          </p>
        )}
        {alert.subMessage && (
          <p className={styles.subMessage}>{alert.subMessage}</p>
        )}
      </div>
      {!alert.autoDismiss && (
        <ModalFooter className={styles.footerOverride}>
          {showCancel && (
            <ModalFooterButton
              variant="default"
              onClick={dismiss}
              disabled={sBusy}
              style={neutralBtnStyle}
            >
              CANCEL
            </ModalFooterButton>
          )}
          {alert.handleBtn3Press && (
            <ModalFooterButton
              variant="primary"
              onClick={makeHandler(alert.handleBtn3Press)}
              disabled={!!alert.btn3Disabled || sBusy}
              tooltip={alert.btn3Tooltip}
              style={btnStyle}
            >
              {alert.btn3Text}
            </ModalFooterButton>
          )}
          {alert.handleBtn2Press && (
            <ModalFooterButton
              variant="default"
              onClick={makeHandler(alert.handleBtn2Press)}
              disabled={!!alert.btn2Disabled || sBusy}
              tooltip={alert.btn2Tooltip}
              style={neutralBtnStyle}
            >
              {alert.btn2Text}
            </ModalFooterButton>
          )}
          <ModalFooterButton
            variant="accent"
            onClick={makeHandler(alert.handleBtn1Press)}
            disabled={!!alert.btn1Disabled || sBusy}
            tooltip={alert.btn1Tooltip}
            style={btnStyle}
          >
            {sBusy ? "Saving..." : alert.btn1Text}
          </ModalFooterButton>
        </ModalFooter>
      )}
    </div>
  );
}

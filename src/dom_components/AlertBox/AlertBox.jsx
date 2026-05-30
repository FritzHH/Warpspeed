import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ModalHeader } from "../ModalHeader/ModalHeader";
import { ModalFooter, ModalFooterButton } from "../ModalFooter/ModalFooter";
import { useAlertScreenStore } from "../../stores";
import { useZ } from "../../hooks/useZ";
import styles from "./AlertBox.module.css";

const OFFSET_PX = 20;

export const AlertBox = ({ showAlert }) => {
  const zAlerts = useAlertScreenStore((state) => state.alerts);
  const z = useZ("alert", showAlert);

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

function AlertCard({ alert, index, isTop, z }) {
  const cardRef = useRef(null);

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
    return () => {
      if (typeof handler === "function") handler();
      dismiss();
    };
  }

  const showCancel =
    !alert.autoDismiss &&
    (alert.useCancelButton ||
      (!alert.handleBtn2Press && !alert.handleBtn3Press));

  const offset = index * OFFSET_PX;

  return (
    <div
      ref={cardRef}
      role={isTop ? "alertdialog" : undefined}
      aria-modal={isTop ? "true" : undefined}
      aria-labelledby={isTop ? `${alert.id}-title` : undefined}
      className={styles.content}
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
      {alert.title && (
        <ModalHeader
          title={alert.title}
          severity={alert.severity}
          className={styles.headerOverride}
        />
      )}
      <div className={styles.body}>
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
        <ModalFooter>
          {showCancel && (
            <ModalFooterButton variant="default" onClick={dismiss}>
              CANCEL
            </ModalFooterButton>
          )}
          {alert.handleBtn3Press && (
            <ModalFooterButton
              variant="primary"
              onClick={makeHandler(alert.handleBtn3Press)}
              disabled={!!alert.btn3Disabled}
              tooltip={alert.btn3Tooltip}
            >
              {alert.btn3Text}
            </ModalFooterButton>
          )}
          {alert.handleBtn2Press && (
            <ModalFooterButton
              variant="default"
              onClick={makeHandler(alert.handleBtn2Press)}
              disabled={!!alert.btn2Disabled}
              tooltip={alert.btn2Tooltip}
            >
              {alert.btn2Text}
            </ModalFooterButton>
          )}
          <ModalFooterButton
            variant="accent"
            onClick={makeHandler(alert.handleBtn1Press)}
            disabled={!!alert.btn1Disabled}
            tooltip={alert.btn1Tooltip}
          >
            {alert.btn1Text}
          </ModalFooterButton>
        </ModalFooter>
      )}
    </div>
  );
}

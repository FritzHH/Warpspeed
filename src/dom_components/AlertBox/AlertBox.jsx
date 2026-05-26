import React, { useState, useEffect } from "react";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { C, Colors, COLOR_GRADIENTS } from "../../styles";

import { useAlertScreenStore } from "../../stores";
import styles from "./AlertBox.module.css";
import { useZ } from "../../hooks/useZ";

const gradientStyle = (arr) =>
  arr && arr.length >= 2
    ? { background: `linear-gradient(to right, ${arr.join(", ")})` }
    : {};

export const AlertBox = ({ showAlert }) => {
  const zCanExitOnOuterClick = useAlertScreenStore((state) => state.canExitOnOuterClick);
  const zTitle = useAlertScreenStore((state) => state.title);
  const zSeverity = useAlertScreenStore((state) => state.severity);
  const zMessage = useAlertScreenStore((state) => state.message);
  const zSubMessage = useAlertScreenStore((state) => state.subMessage);
  const zButton1Text = useAlertScreenStore((state) => state.btn1Text);
  const zButton2Text = useAlertScreenStore((state) => state.btn2Text);
  const zButton3Text = useAlertScreenStore((state) => state.btn3Text);
  const zButton1Handler = useAlertScreenStore((state) => state.handleBtn1Press);
  const zButton2Handler = useAlertScreenStore((state) => state.handleBtn2Press);
  const zButton3Handler = useAlertScreenStore((state) => state.handleBtn3Press);
  const zAlertBoxStyle = useAlertScreenStore((state) => state.alertBoxStyle);
  const zUseCancelButton = useAlertScreenStore((state) => state.useCancelButton);
  const zAutoDismiss = useAlertScreenStore((state) => state.autoDismiss);
  const zAutoDismissMs = useAlertScreenStore((state) => state.autoDismissMs);

  const [fadedIn, setFadedIn] = useState(false);
  const z = useZ("alert", showAlert);

  useEffect(() => {
    if (showAlert) {
      requestAnimationFrame(() => setFadedIn(true));
    } else {
      setFadedIn(false);
    }
  }, [showAlert]);

  useEffect(() => {
    if (!showAlert || !zAutoDismiss) return;
    const ms = zAutoDismissMs > 0 ? zAutoDismissMs : 4000;
    const t = setTimeout(() => {
      useAlertScreenStore.getState().setShowAlert(false);
      setTimeout(() => useAlertScreenStore.getState().resetAll(), 100);
    }, ms);
    return () => clearTimeout(t);
  }, [showAlert, zAutoDismiss, zAutoDismissMs]);

  const showCancel = !zAutoDismiss && (zUseCancelButton || (!zButton2Handler && !zButton3Handler));

  function dismissAlert() {
    useAlertScreenStore.getState().setShowAlert(false);
    setTimeout(() => useAlertScreenStore.getState().resetAll(), 100);
  }

  function handleButton1Press() {
    if (typeof zButton1Handler === "function") zButton1Handler();
    dismissAlert();
  }

  function handleButton2Press() {
    if (typeof zButton2Handler === "function") zButton2Handler();
    dismissAlert();
  }

  function handleButton3Press() {
    if (typeof zButton3Handler === "function") zButton3Handler();
    dismissAlert();
  }

  return (
    <AlertDialogPrimitive.Root open={showAlert} onOpenChange={(open) => { if (!open) dismissAlert(); }}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay asChild>
          <div
            className={styles.overlay}
            style={{ zIndex: z, opacity: fadedIn ? 1 : 0 }}
            onClick={() => zCanExitOnOuterClick && useAlertScreenStore.getState().resetAll()}
          />
        </AlertDialogPrimitive.Overlay>
        <AlertDialogPrimitive.Content asChild onEscapeKeyDown={() => dismissAlert()}>
          <div
            className={styles.content}
            style={{
              zIndex: z + 1,
              backgroundColor: C.backgroundWhite,
              opacity: fadedIn ? 1 : 0,
              ...zAlertBoxStyle,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {!!zTitle && (
              <div className={`${styles.header} ${zSeverity === "info" ? styles.headerInfo : styles.headerWarning}`}>
                <AlertDialogPrimitive.Title asChild>
                  <h2 className={styles.title}>{zTitle}</h2>
                </AlertDialogPrimitive.Title>
              </div>
            )}

            <div className={styles.body}>
              {!!zMessage && (
                <AlertDialogPrimitive.Description asChild>
                  <p className={styles.message} style={{ color: Colors.darkText }}>
                    {zMessage}
                  </p>
                </AlertDialogPrimitive.Description>
              )}
              {!!zSubMessage && (
                <p className={styles.subMessage} style={{ color: Colors.darkText }}>
                  {zSubMessage}
                </p>
              )}
            </div>

            {!zAutoDismiss && (
              <div className={styles.footer}>
                {showCancel && (
                  <AlertDialogPrimitive.Cancel asChild>
                    <button
                      type="button"
                      className={`${styles.footerBtn} ${styles.btnCancel}`}
                      onClick={dismissAlert}
                    >
                      CANCEL
                    </button>
                  </AlertDialogPrimitive.Cancel>
                )}
                {!!zButton3Handler && (
                  <AlertDialogPrimitive.Action asChild>
                    <button
                      type="button"
                      className={`${styles.footerBtn} ${styles.btnTertiary}`}
                      style={gradientStyle(COLOR_GRADIENTS.purple)}
                      onClick={handleButton3Press}
                    >
                      {zButton3Text}
                    </button>
                  </AlertDialogPrimitive.Action>
                )}
                {!!zButton2Handler && (
                  <AlertDialogPrimitive.Action asChild>
                    <button
                      type="button"
                      className={`${styles.footerBtn} ${styles.btnSecondary}`}
                      onClick={handleButton2Press}
                    >
                      {zButton2Text}
                    </button>
                  </AlertDialogPrimitive.Action>
                )}
                <AlertDialogPrimitive.Action asChild>
                  <button
                    type="button"
                    className={`${styles.footerBtn} ${styles.btnAccept}`}
                    style={gradientStyle(COLOR_GRADIENTS.green)}
                    onClick={handleButton1Press}
                  >
                    {zButton1Text}
                  </button>
                </AlertDialogPrimitive.Action>
              </div>
            )}
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
};

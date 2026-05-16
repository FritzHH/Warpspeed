import React, { useState, useEffect } from "react";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { C, Colors, COLOR_GRADIENTS, ICONS } from "../../styles";
import { gray } from "../../utils";
import { useAlertScreenStore } from "../../stores";
import { Button } from "../Button/Button";
import styles from "./AlertBox.module.css";

export const AlertBox = ({ showAlert }) => {
  const zCanExitOnOuterClick = useAlertScreenStore((state) => state.canExitOnOuterClick);
  const zTitle = useAlertScreenStore((state) => state.title);
  const zMessage = useAlertScreenStore((state) => state.message);
  const zSubMessage = useAlertScreenStore((state) => state.subMessage);
  const zButton1Text = useAlertScreenStore((state) => state.btn1Text);
  const zButton2Text = useAlertScreenStore((state) => state.btn2Text);
  const zButton3Text = useAlertScreenStore((state) => state.btn3Text);
  const zButton1Handler = useAlertScreenStore((state) => state.handleBtn1Press);
  const zButton2Handler = useAlertScreenStore((state) => state.handleBtn2Press);
  const zButton3Handler = useAlertScreenStore((state) => state.handleBtn3Press);
  const zButton1Icon = useAlertScreenStore((state) => state.btn1Icon);
  const zButton2Icon = useAlertScreenStore((state) => state.btn2Icon);
  const zButton3Icon = useAlertScreenStore((state) => state.btn3Icon);
  const zIcon1Size = useAlertScreenStore((state) => state.icon1Size);
  const zIcon2Size = useAlertScreenStore((state) => state.icon2Size);
  const zIcon3Size = useAlertScreenStore((state) => state.icon3Size);
  const zAlertBoxStyle = useAlertScreenStore((state) => state.alertBoxStyle);
  const zUseCancelButton = useAlertScreenStore((state) => state.useCancelButton);

  const [fadedIn, setFadedIn] = useState(false);

  useEffect(() => {
    if (showAlert) {
      requestAnimationFrame(() => setFadedIn(true));
    } else {
      setFadedIn(false);
    }
  }, [showAlert]);

  const showCancel = zUseCancelButton || (!zButton2Handler && !zButton3Handler);

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
            style={{ opacity: fadedIn ? 1 : 0 }}
            onClick={() => zCanExitOnOuterClick && useAlertScreenStore.getState().resetAll()}
          />
        </AlertDialogPrimitive.Overlay>
        <AlertDialogPrimitive.Content asChild onEscapeKeyDown={() => dismissAlert()}>
          <div
            className={styles.content}
            style={{
              backgroundColor: C.backgroundWhite,
              opacity: fadedIn ? 1 : 0,
              ...zAlertBoxStyle,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.header}>
              {!!zTitle && (
                <AlertDialogPrimitive.Title asChild>
                  <h2 className={styles.title}>{zTitle}</h2>
                </AlertDialogPrimitive.Title>
              )}
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

            <div className={styles.buttonRow}>
              <AlertDialogPrimitive.Action asChild>
                <Button
                  colorGradientArr={zButton1Text ? COLOR_GRADIENTS.green : []}
                  text={zButton1Text}
                  buttonStyle={{ paddingTop: 4, paddingBottom: 4, flex: 1 }}
                  textStyle={{ color: C.textWhite, fontWeight: "600" }}
                  onPress={handleButton1Press}
                  iconSize={zIcon1Size || 60}
                  icon={zButton1Icon || (zButton1Text ? null : ICONS.check1)}
                />
              </AlertDialogPrimitive.Action>
              {!!zButton2Handler && (
                <AlertDialogPrimitive.Action asChild>
                  <Button
                    colorGradientArr={zButton2Text ? COLOR_GRADIENTS.blue : []}
                    text={zButton2Text}
                    buttonStyle={{ paddingTop: 4, paddingBottom: 4, flex: 1 }}
                    textStyle={zButton2Text ? { color: C.textWhite, fontWeight: "600" } : {}}
                    onPress={handleButton2Press}
                    iconSize={zIcon2Size || 60}
                    icon={zButton2Icon || (zButton2Text ? null : ICONS.close1)}
                  />
                </AlertDialogPrimitive.Action>
              )}
              {!!zButton3Handler && (
                <AlertDialogPrimitive.Action asChild>
                  <Button
                    colorGradientArr={zButton3Text ? COLOR_GRADIENTS.purple : []}
                    text={zButton3Text}
                    buttonStyle={{ paddingTop: 4, paddingBottom: 4, flex: 1 }}
                    textStyle={zButton3Text ? { color: C.textWhite, fontWeight: "600" } : {}}
                    onPress={handleButton3Press}
                    iconSize={zIcon3Size || 60}
                    icon={zButton3Icon || (zButton3Text ? null : ICONS.close1)}
                  />
                </AlertDialogPrimitive.Action>
              )}
            </div>

            {showCancel && (
              <div className={styles.cancelWrapper}>
                <AlertDialogPrimitive.Cancel asChild>
                  <Button
                    textStyle={{ color: gray(0.4) }}
                    buttonStyle={{
                      backgroundColor: gray(0.09),
                      borderRadius: 0,
                      borderBottomRightRadius: 15,
                      borderBottomLeftRadius: 15,
                      width: "100%",
                    }}
                    text="CANCEL"
                    onPress={dismissAlert}
                    fullWidth
                  />
                </AlertDialogPrimitive.Cancel>
              </div>
            )}
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
};

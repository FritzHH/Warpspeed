import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Button } from "../Button/Button";
import { SHADOW_NONE } from "../shadows";
import { C } from "../../styles";
import { useZ } from "../../hooks/useZ";
import styles from "./ScreenModal.module.css";

export const ScreenModal = ({
  enabled,
  modalCoordinateVars = {},
  mouseOverOptions = {},
  handleButtonPress = () => {},
  handleMouseOver,
  handleMouseExit,
  buttonLabel,
  buttonVisible = true,
  showOuterModal = false,
  buttonIconSize,
  showShadow = true,
  buttonStyle = {},
  buttonTextStyle = {},
  Component,
  ButtonComponent,
  outerModalStyle = {},
  modalVisible = false,
  setModalVisibility = () => {},
  shadowStyle = { ...SHADOW_NONE },
  buttonIcon,
  handleModalActionInternally = false,
  handleOuterClick = () => {},
  openUpward = false,
  centerMenuHorizontally = false,
}) => {
  const [sInternalModalShow, _setInternalModalShow] = useState(false);
  const [sFadedIn, _setFadedIn] = useState(false);

  const isVisible = handleModalActionInternally ? sInternalModalShow : modalVisible;

  const zModal = useZ("modal", isVisible && showOuterModal);
  const zPopover = useZ("dropdown", isVisible && !showOuterModal);

  useEffect(() => {
    if (isVisible) {
      requestAnimationFrame(() => _setFadedIn(true));
    } else {
      _setFadedIn(false);
    }
  }, [isVisible]);

  const overlayZ = zModal;
  const contentZ = zModal + 1;

  let resolvedShadow = shadowStyle;
  if (!showShadow) resolvedShadow = SHADOW_NONE;
  if (mouseOverOptions.highlightColor) mouseOverOptions.enable = true;

  const handleClose = () => {
    _setInternalModalShow(false);
    handleOuterClick();
  };

  const handleTriggerClick = () => {
    handleButtonPress();
    setModalVisibility(false);
    _setInternalModalShow(!sInternalModalShow);
  };

  const TriggerButton = () => {
    if (!buttonVisible) return null;
    if (ButtonComponent) return ButtonComponent();
    return (
      <Button
        enabled={enabled}
        handleMouseExit={handleMouseExit}
        handleMouseOver={handleMouseOver}
        icon={buttonIcon}
        iconSize={buttonIconSize}
        text={buttonLabel}
        onPress={handleTriggerClick}
        textStyle={{ ...buttonTextStyle }}
        buttonStyle={{
          alignItems: "center",
          justifyContent: "center",
          ...resolvedShadow,
          ...buttonStyle,
        }}
      />
    );
  };

  if (showOuterModal) {
    return (
      <div className={styles.wrapper}>
        <TriggerButton />
        <DialogPrimitive.Root open={isVisible} onOpenChange={(open) => { if (!open) handleClose(); }}>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay asChild>
              <div
                className={styles.overlay}
                style={{
                  backgroundColor: outerModalStyle?.backgroundColor || C.surfaceOverlay,
                  opacity: sFadedIn ? 1 : 0,
                  zIndex: overlayZ,
                  transition: "opacity 150ms ease-in",
                }}
              />
            </DialogPrimitive.Overlay>
            <DialogPrimitive.Content asChild onOpenAutoFocus={(e) => e.preventDefault()}>
              <div
                className={styles.contentWrapper}
                style={{
                  opacity: sFadedIn ? 1 : 0,
                  zIndex: contentZ,
                  transition: "opacity 150ms ease-in",
                  ...outerModalStyle,
                }}
              >
                <DialogPrimitive.Title style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0 }}>
                  Modal
                </DialogPrimitive.Title>
                {Component()}
              </div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      </div>
    );
  }

  return (
    <PopoverPrimitive.Root
      open={isVisible}
      onOpenChange={(open) => { if (!open) handleClose(); }}
    >
      <PopoverPrimitive.Anchor>
        <TriggerButton />
      </PopoverPrimitive.Anchor>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side={openUpward ? "top" : "bottom"}
          align={centerMenuHorizontally ? "center" : "start"}
          sideOffset={4}
          alignOffset={centerMenuHorizontally ? 0 : (modalCoordinateVars?.x ?? 0)}
          collisionPadding={10}
          onOpenAutoFocus={(e) => e.preventDefault()}
          style={{
            zIndex: zPopover,
            opacity: sFadedIn ? 1 : 0,
            transition: "opacity 150ms ease-in",
          }}
        >
          {Component()}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
};

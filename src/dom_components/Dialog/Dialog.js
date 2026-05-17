import React, { useState, useEffect } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import styles from "./Dialog.module.css";

export const Dialog = ({
  visible,
  onClose,
  overlayColor = "rgba(50,50,50,.65)",
  children,
  contentStyle = {},
  preventClose = false,
  title = "Dialog",
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
}) => {
  const [fadedIn, setFadedIn] = useState(false);

  useEffect(() => {
    if (visible) {
      requestAnimationFrame(() => setFadedIn(true));
    } else {
      setFadedIn(false);
    }
  }, [visible]);

  return (
    <DialogPrimitive.Root
      open={visible}
      onOpenChange={(open) => {
        if (!open && onClose && !preventClose) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay asChild>
          <div
            className={styles.overlay}
            style={{
              backgroundColor: overlayColor,
              opacity: fadedIn ? 1 : 0,
            }}
          />
        </DialogPrimitive.Overlay>
        <DialogPrimitive.Content
          asChild
          onPointerDownOutside={(e) => { if (preventClose) e.preventDefault(); }}
          onEscapeKeyDown={(e) => { if (preventClose) e.preventDefault(); }}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          aria-describedby={ariaDescribedBy}
        >
          <div
            className={styles.content}
            style={{
              opacity: fadedIn ? 1 : 0,
              ...contentStyle,
            }}
          >
            <DialogPrimitive.Title style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0 }}>
              {ariaLabel || title}
            </DialogPrimitive.Title>
            <div className={styles.inner} onClick={(e) => e.stopPropagation()}>
              {children}
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

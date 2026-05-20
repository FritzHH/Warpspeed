import React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { C } from "../../styles";
import styles from "./Tooltip.module.css";

export const Tooltip = ({
  text,
  children,
  position = "top",
  style = {},
  backgroundColor,
  color,
  alert = false,
  offsetX = 0,
  offsetY = 0,
  delayDuration = 400,
  disabled = false,
  "aria-describedby": ariaDescribedBy,
}) => {
  if (!text || disabled) {
    return <div style={style}>{children}</div>;
  }

  const bgColor = backgroundColor || (alert ? C.warning : C.surfaceOverlayHeavy);
  const textColor = color || C.textOnAccent;
  const sideOffset = 6 + (position === "top" || position === "left" ? offsetY : -offsetY);

  return (
    <TooltipPrimitive.Root delayDuration={delayDuration}>
      <TooltipPrimitive.Trigger asChild>
        <div className={styles.trigger} style={style} aria-describedby={ariaDescribedBy}>
          {children}
        </div>
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={position}
          sideOffset={sideOffset}
          alignOffset={offsetX}
          collisionPadding={10}
          className={styles.content}
        >
          <div className={styles.bubble} style={{ backgroundColor: bgColor }}>
            <span className={styles.text} style={{ color: textColor }}>
              {text}
            </span>
          </div>
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
};

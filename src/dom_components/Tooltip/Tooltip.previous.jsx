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
  darkMode = false,
  offsetX = 0,
  offsetY = 0,
  delayDuration = 400,
  disabled = false,
  "aria-describedby": ariaDescribedBy,
}) => {
  const onlyChild = React.Children.only(children);

  const mergeProps = (extra) =>
    React.cloneElement(onlyChild, {
      style: { ...(onlyChild.props.style || {}), ...style },
      ...extra,
    });

  if (!text || disabled) {
    return mergeProps({});
  }

  const bgColor =
    backgroundColor ||
    (alert ? C.warning : darkMode ? C.surfaceOverlayHeavy : C.surfaceOverlay);
  const textColor = color || C.textOnAccent;
  const sideOffset = 6 + (position === "top" || position === "left" ? offsetY : -offsetY);

  const triggerChild = mergeProps({
    "aria-describedby": ariaDescribedBy || onlyChild.props["aria-describedby"],
  });

  return (
    <TooltipPrimitive.Root delayDuration={delayDuration}>
      <TooltipPrimitive.Trigger asChild>
        {triggerChild}
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

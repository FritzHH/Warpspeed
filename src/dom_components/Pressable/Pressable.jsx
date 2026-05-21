import React, { forwardRef, useRef, useCallback } from "react";
import styles from "./Pressable.module.css";

const DOUBLE_CLICK_THRESHOLD = 350;

export const Pressable = forwardRef(function Pressable(
  {
    children,
    onPress,
    onClick,
    onDoublePress,
    onRightPress,
    disabled = false,
    activeOpacity = 0.7,
    tooltip = "",
    style = {},
    className = "",
    "aria-label": ariaLabel,
    "data-testid": testId,
    ...rest
  },
  ref
) {
  const clickTimer = useRef(null);

  const handleClick = useCallback(
    (e) => {
      if (disabled) return;
      const handler = onPress || onClick;

      if (onDoublePress) {
        if (clickTimer.current) {
          clearTimeout(clickTimer.current);
          clickTimer.current = null;
          onDoublePress(e);
        } else {
          clickTimer.current = setTimeout(() => {
            clickTimer.current = null;
            handler?.(e);
          }, DOUBLE_CLICK_THRESHOLD);
        }
      } else {
        handler?.(e);
      }
    },
    [disabled, onPress, onClick, onDoublePress]
  );

  const handleContextMenu = useCallback(
    (e) => {
      if (onRightPress) {
        e.preventDefault();
        onRightPress(e);
      }
    },
    [onRightPress]
  );

  return (
    <div
      ref={ref}
      className={`${styles.pressable} ${disabled ? styles.disabled : ""} ${className}`}
      style={{ "--active-opacity": activeOpacity, ...style }}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      title={tooltip || undefined}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      aria-label={ariaLabel}
      data-testid={testId}
      onKeyDown={(e) => {
        if (!disabled && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          handleClick(e);
        }
      }}
      {...rest}
    >
      {children}
    </div>
  );
});

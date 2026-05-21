import React, { forwardRef, useState, useCallback } from "react";
import styles from "./TouchableOpacity.module.css";

export const TouchableOpacity = forwardRef(function TouchableOpacity(
  {
    children,
    onPress,
    onClick,
    activeOpacity = 0.6,
    hoverOpacity = 0.7,
    disabled = false,
    style = {},
    hoverStyle = {},
    disabledStyle = {},
    className = "",
    "aria-label": ariaLabel,
    "data-testid": testId,
    ...rest
  },
  ref
) {
  const [isPressed, setIsPressed] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const handleClick = useCallback(
    (e) => {
      if (disabled) return;
      (onPress || onClick)?.(e);
    },
    [disabled, onPress, onClick]
  );

  const getOpacity = () => {
    if (disabled) return 0.3;
    if (isPressed) return Math.min(activeOpacity, 0.6);
    if (isHovered) return hoverOpacity;
    return 1;
  };

  const combinedStyle = {
    ...style,
    ...(isHovered && !disabled ? hoverStyle : {}),
    ...(disabled ? disabledStyle : {}),
    opacity: getOpacity(),
    cursor: disabled ? "not-allowed" : "pointer",
    transition: "opacity 0.2s ease",
  };

  return (
    <div
      ref={ref}
      className={`${styles.touchable} ${disabled ? styles.disabled : ""} ${className}`}
      style={combinedStyle}
      onClick={handleClick}
      onPointerDown={() => !disabled && setIsPressed(true)}
      onPointerUp={() => setIsPressed(false)}
      onPointerLeave={() => {
        setIsPressed(false);
        setIsHovered(false);
      }}
      onPointerEnter={() => !disabled && setIsHovered(true)}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      aria-label={ariaLabel}
      data-testid={testId}
      onKeyDown={(e) => {
        if (!disabled && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          (onPress || onClick)?.(e);
        }
      }}
      {...rest}
    >
      {children}
    </div>
  );
});

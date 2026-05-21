import React, { forwardRef } from "react";
import { C, COLOR_GRADIENTS } from "../../styles";
import styles from "./TabMenuButton.module.css";

export const TabMenuButton = forwardRef(function TabMenuButton(
  {
    onPress,
    onClick,
    text,
    isSelected = false,
    icon,
    iconSize = 20,
    height,
    disabled = false,
    style = {},
    textStyle = {},
    className = "",
    "aria-label": ariaLabel,
    "data-testid": testId,
    ...rest
  },
  ref
) {
  const gradientColors = isSelected ? COLOR_GRADIENTS.blue : COLOR_GRADIENTS.lightBlue;
  const gradient = `linear-gradient(to right, ${gradientColors[0]}, ${gradientColors[1]})`;

  const resolveIcon = (src) => {
    if (!src) return null;
    return typeof src === "object" ? src.default || src : src;
  };

  return (
    <button
      ref={ref}
      type="button"
      className={`${styles.tabButton} ${className}`}
      style={{
        background: gradient,
        height,
        ...style,
      }}
      onClick={(e) => !disabled && (onPress || onClick)?.(e)}
      disabled={disabled}
      aria-label={ariaLabel || text}
      aria-pressed={isSelected}
      data-testid={testId}
      {...rest}
    >
      {!!icon && (
        <img
          src={resolveIcon(icon)}
          alt=""
          className={styles.icon}
          style={{ width: iconSize, height: iconSize }}
        />
      )}
      {text && (
        <span
          className={styles.text}
          style={{
            color: isSelected ? C.textWhite : "white",
            ...textStyle,
          }}
        >
          {text}
        </span>
      )}
    </button>
  );
});

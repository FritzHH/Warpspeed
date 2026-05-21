import React, { forwardRef } from "react";
import { C } from "../../styles";
import styles from "./LoadingIndicator.module.css";

const SIZES = { small: 20, medium: 40, large: 60 };

export const LoadingIndicator = forwardRef(function LoadingIndicator(
  {
    size = "medium",
    color = C.info,
    text = "",
    message = "Loading...",
    centered = true,
    className = "",
    style = {},
    "aria-label": ariaLabel,
    "data-testid": testId,
  },
  ref
) {
  const px = typeof size === "number" ? size : (SIZES[size] || SIZES.medium);
  const borderWidth = Math.max(2, Math.round(px / 10));
  const displayText = text || message;

  return (
    <div
      ref={ref}
      className={`${styles.container} ${centered ? styles.centered : ""} ${className}`}
      style={style}
      role="status"
      aria-busy="true"
      aria-label={ariaLabel || displayText || "Loading"}
      data-testid={testId}
    >
      <div
        className={styles.spinner}
        style={{
          width: px,
          height: px,
          borderWidth,
          color,
        }}
      />
      {!!displayText && <span className={styles.message}>{displayText}</span>}
    </div>
  );
});

export const SmallLoadingIndicator = (props) => (
  <LoadingIndicator size="small" centered={false} {...props} />
);

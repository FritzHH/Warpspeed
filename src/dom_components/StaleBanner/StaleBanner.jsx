import React, { forwardRef } from "react";
import styles from "./StaleBanner.module.css";

export const StaleBanner = forwardRef(function StaleBanner(
  {
    text,
    style = {},
    textStyle = {},
    className = "",
    "aria-label": ariaLabel,
    "data-testid": testId,
  },
  ref
) {
  return (
    <div
      ref={ref}
      className={`${styles.banner} ${className}`}
      style={style}
      aria-label={ariaLabel || text}
      data-testid={testId}
    >
      <span className={styles.text} style={textStyle}>
        {text}
      </span>
    </div>
  );
});

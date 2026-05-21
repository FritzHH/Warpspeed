import React, { forwardRef } from "react";
import { C } from "../../styles";
import styles from "./CheckBox.module.css";

export const CheckBox = forwardRef(function CheckBox(
  {
    text,
    onCheck,
    iconSize = 15,
    mouseOverOptions,
    isChecked,
    buttonStyle = {},
    textStyle = {},
    enabled = true,
    enableMouseOver = true,
    // Additive props
    className = "",
    "aria-label": ariaLabel,
    "data-testid": testId,
  },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      className={`${styles.checkbox} ${!enabled ? styles.disabled : ""} ${enableMouseOver ? styles.hoverable : ""} ${className}`}
      style={buttonStyle}
      onClick={() => enabled && onCheck?.()}
      disabled={!enabled}
      role="checkbox"
      aria-checked={!!isChecked}
      aria-label={ariaLabel || text}
      data-testid={testId}
    >
      <svg
        className={styles.icon}
        width={iconSize}
        height={iconSize}
        viewBox="0 0 16 16"
        fill="none"
      >
        {isChecked ? (
          <>
            <rect x="1" y="1" width="14" height="14" rx="3" style={{ fill: C.accent, stroke: C.accent }} strokeWidth="1.5" />
            <path d="M4.5 8.5L7 11L11.5 5.5" style={{ stroke: C.textOnAccent }} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </>
        ) : (
          <rect x="1" y="1" width="14" height="14" rx="3" fill="none" style={{ stroke: C.borderStrong }} strokeWidth="1.5" />
        )}
      </svg>
      {text && (
        <span className={styles.text} style={{ color: C.textDefault, fontSize: 15, ...textStyle }}>
          {text}
        </span>
      )}
    </button>
  );
});

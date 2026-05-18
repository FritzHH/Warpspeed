import React, { forwardRef } from "react";
import ReactDOM from "react-dom";
import { C, Fonts } from "../../styles";
import { gray, lightenRGBByPercent } from "../../utils";
import styles from "./CustomerQuickNotes.module.css";

export const CustomerQuickNotes = forwardRef(function CustomerQuickNotes(
  {
    visible,
    onClose,
    quickNotes = [],
    onToggleChip,
    activeChips = [],
    anchorPosition,
    className = "",
    "data-testid": testId,
  },
  ref
) {
  if (!visible) return null;

  const dropdownWidth = 340;
  const maxHeight = 400;
  let left = 0;
  let top = 0;

  if (typeof window !== "undefined" && anchorPosition) {
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    left = anchorPosition.x;
    top = anchorPosition.y;
    if (left + dropdownWidth > vw - 10) left = vw - dropdownWidth - 10;
    if (top + maxHeight > vh - 10) top = vh - maxHeight - 10;
    if (left < 10) left = 10;
    if (top < 10) top = 10;
  }

  return ReactDOM.createPortal(
    <div
      ref={ref}
      className={`${styles.backdrop} ${className}`}
      onClick={onClose}
      data-testid={testId}
    >
      <div
        className={styles.dropdown}
        style={{
          width: dropdownWidth,
          maxHeight,
          borderColor: C.buttonLightGreenOutline,
          ...(anchorPosition ? { left, top, position: "absolute" } : {}),
        }}
        onClick={(e) => e.stopPropagation()}
        role="listbox"
        aria-label="Customer Quick Notes"
      >
        {/* Header */}
        <div className={styles.header} style={{ borderBottomColor: C.buttonLightGreenOutline }}>
          <span className={styles.title} style={{ color: C.text }}>
            Customer Quick Notes
          </span>
        </div>

        {/* Categories */}
        {quickNotes.map((category) => (
          <div key={category.id} className={styles.category}>
            <span className={styles.categoryLabel} style={{ color: gray(0.4) }}>
              {category.label}
            </span>
            <div className={styles.chipGrid}>
              {(category.items || []).map((item, chipIdx) => {
                const active = activeChips.includes(item.id);
                return (
                  <button
                    key={item.id || chipIdx}
                    className={styles.chip}
                    onClick={() => onToggleChip(item)}
                    style={{
                      backgroundColor: active ? lightenRGBByPercent(C.red, 70) : C.buttonLightGreenOutline,
                    }}
                  >
                    <span style={{ fontSize: 15, color: active ? C.red : gray(0.5) }}>
                      {item.buttonLabel}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>,
    document.body
  );
});

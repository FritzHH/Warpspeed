import React, { forwardRef, useState, useRef, useCallback } from "react";
import ReactDOM from "react-dom";
import { C } from "../../styles";
import styles from "./StatusPickerModal.module.css";
import { useZ } from "../../hooks/useZ";

const StatusPickerRow = ({ status, idx, total, onPress, itemHeight, itemTextStyle }) => {
  return (
    <button
      className={styles.row}
      onClick={onPress}
      style={{
        height: itemHeight,
        backgroundColor: status.backgroundColor || C.listItemWhite,
        borderBottomWidth: idx < total - 1 ? 1 : 0,
        borderBottomColor: C.borderSubtle,
        borderBottomStyle: idx < total - 1 ? "solid" : "none",
      }}
    >
      <span
        className={styles.rowText}
        style={{
          color: status.textColor || C.text,
          ...itemTextStyle,
        }}
      >
        {status.label}
      </span>
    </button>
  );
};

export const StatusPickerModal = forwardRef(function StatusPickerModal(
  {
    statuses = [],
    onSelect = () => {},
    enabled = true,
    buttonText = "+ Status",
    buttonStyle: buttonStyleProp = {},
    buttonTextStyle: buttonTextStyleProp = {},
    modalCoordX = 0,
    modalCoordY = 30,
    menuWidth,
    centered = false,
    itemHeight = 40,
    itemTextStyle,
    disabled = false,
    className = "",
    "aria-label": ariaLabel,
    "data-testid": testId,
  },
  ref
) {
  const [sVisible, _setVisible] = useState(false);
  const [sLeft, _setLeft] = useState(0);
  const z = useZ("dropdown", sVisible);
  const anchorRef = useRef(null);

  const MENU_WIDTH = menuWidth || 320;
  const VIEWPORT_PADDING = 10;

  const handleToggle = useCallback(() => {
    if (!enabled || disabled) return;
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      let l = centered ? (window.innerWidth - MENU_WIDTH) / 2 : rect.left + modalCoordX;
      if (l + MENU_WIDTH > window.innerWidth - VIEWPORT_PADDING) l = window.innerWidth - MENU_WIDTH - VIEWPORT_PADDING;
      if (l < VIEWPORT_PADDING) l = VIEWPORT_PADDING;
      _setLeft(l);
    }
    _setVisible((v) => !v);
  }, [enabled, disabled, centered, MENU_WIDTH, modalCoordX]);

  const handleClose = useCallback(() => _setVisible(false), []);

  return (
    <>
      <button
        ref={(node) => {
          anchorRef.current = node;
          if (typeof ref === "function") ref(node);
          else if (ref) ref.current = node;
        }}
        className={`${styles.trigger} ${className}`}
        style={{
          backgroundColor: C.buttonLightGreen,
          borderColor: C.buttonLightGreenOutline,
          ...buttonStyleProp,
        }}
        onClick={handleToggle}
        disabled={!enabled || disabled}
        aria-label={ariaLabel || buttonText}
        aria-haspopup="listbox"
        aria-expanded={sVisible}
        data-testid={testId}
      >
        <span className={styles.triggerText} style={{ color: C.text, ...buttonTextStyleProp }}>
          {buttonText}
        </span>
      </button>

      {sVisible && ReactDOM.createPortal(
        <div className={styles.overlay} style={{ zIndex: z }} onClick={handleClose}>
          <div
            className={styles.menu}
            style={{
              left: sLeft,
              width: MENU_WIDTH,
            }}
            onClick={(e) => e.stopPropagation()}
            role="listbox"
            aria-label="Status list"
          >
            <div className={styles.scrollArea}>
              {statuses.map((status, idx) => (
                <StatusPickerRow
                  key={status.id || idx}
                  status={status}
                  idx={idx}
                  total={statuses.length}
                  itemHeight={itemHeight}
                  itemTextStyle={itemTextStyle}
                  onPress={() => {
                    _setVisible(false);
                    onSelect(status);
                  }}
                />
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
});

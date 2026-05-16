import React, { forwardRef, useState } from "react";
import { Colors } from "../../styles";
import { SHADOW_PROTO } from "../shadows";
import { Dialog } from "../Dialog/Dialog";
import styles from "./ModalDropdown.module.css";

export const ModalDropdown = forwardRef(function ModalDropdown(
  {
    data = [],
    onSelect,
    buttonLabel,
    onRemoveSelection,
    currentSelection,
    removeButtonText,
    buttonStyle = {},
    textStyle = {},
    innerModalStyle = {},
    // Additive props
    disabled = false,
    className = "",
    "aria-label": ariaLabel,
    "data-testid": testId,
  },
  ref
) {
  const [isModalVisible, setModalVisible] = useState(false);
  const [selectedValue, setSelectedValue] = useState(null);

  const toggleModal = () => { if (!disabled) setModalVisible(!isModalVisible); };

  const handleSelect = (item) => {
    setSelectedValue(item);
    onSelect?.(item);
    setModalVisible(false);
  };

  return (
    <div ref={ref}>
      <div
        className={`${styles.trigger} ${className}`}
        style={{
          backgroundColor: Colors.blueButtonBackground,
          borderRadius: 2,
          paddingLeft: 10,
          paddingRight: 10,
          height: 25,
          padding: 3,
          alignItems: "center",
          justifyContent: "center",
          ...SHADOW_PROTO,
          ...buttonStyle,
        }}
        onClick={toggleModal}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-haspopup="listbox"
        aria-expanded={isModalVisible}
        aria-label={ariaLabel || buttonLabel}
        aria-disabled={disabled || undefined}
        data-testid={testId}
        onKeyDown={(e) => {
          if (!disabled && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            toggleModal();
          }
        }}
      >
        <span
          className={styles.triggerText}
          style={{ color: "white", textAlign: "center", fontSize: 15, ...textStyle }}
        >
          {buttonLabel}
        </span>
      </div>

      <Dialog visible={isModalVisible} onClose={toggleModal} overlayColor="rgba(0,0,0,0.5)">
        <div className={styles.list} style={{ width: "20%", ...innerModalStyle }} role="listbox">
          {data.map((item, index) => {
            const isObject = typeof item === "object";
            let label = "";
            let itemStyleProps = {};
            let textColor = null;

            if (isObject) {
              if (Object.hasOwn(item, "backgroundColor")) {
                label = item.label;
                itemStyleProps.backgroundColor = item.backgroundColor;
                textColor = item.textColor;
                itemStyleProps.paddingTop = 15;
                itemStyleProps.paddingBottom = 15;
                if (label === currentSelection?.label) {
                  itemStyleProps.borderWidth = 10;
                  itemStyleProps.borderStyle = "solid";
                  itemStyleProps.borderColor = Colors.mainBackground;
                }
              }
            } else {
              label = item;
              itemStyleProps.backgroundColor = Colors.opacityBackgroundLight;
              itemStyleProps.marginTop = 2;
              itemStyleProps.marginBottom = 2;
              textColor = "white";
            }

            return (
              <div
                key={index}
                className={styles.option}
                style={{
                  borderColor: "dimgray",
                  ...itemStyleProps,
                }}
                onClick={() => handleSelect(item)}
                role="option"
                aria-selected={isObject && label === currentSelection?.label}
              >
                <span style={{ fontSize: 15, color: textColor }}>
                  {label}
                </span>
              </div>
            );
          })}

          {currentSelection && (
            <div className={styles.footer}>
              <div
                className={styles.removeButton}
                onClick={() => {
                  onRemoveSelection?.();
                  setModalVisible(false);
                }}
              >
                <span>{removeButtonText}</span>
              </div>
            </div>
          )}
        </div>
      </Dialog>
    </div>
  );
});

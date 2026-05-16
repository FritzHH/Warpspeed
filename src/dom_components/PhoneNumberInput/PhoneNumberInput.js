import React, { forwardRef, useState, useRef, useEffect, useCallback } from "react";
import { C } from "../../styles";
import { gray } from "../../utils";
import styles from "./PhoneNumberInput.module.css";

export const PhoneNumberInput = forwardRef(function PhoneNumberInput(
  {
    width,
    height,
    value = "",
    onChangeText,
    placeholder = "",
    style = {},
    boxStyle = {},
    filledBoxStyle = {},
    placeholderBoxStyle = {},
    cursorBoxStyle = {},
    placeholderTextColor = "#999",
    cursorTextColor = "#fff",
    showDashes = true,
    dashStyle = {},
    dashColor = "#666",
    dashSize = 16,
    maxLength = 10,
    autoFocus = false,
    editable = true,
    handleEnterPress = () => {},
    highlightOnClick = true,
    onFocus,
    onBlur,
    fontSize,
    textColor = gray(0.55),
    disabled = false,
    className = "",
    "aria-label": ariaLabel,
    "data-testid": testId,
  },
  ref
) {
  const [cursorPosition, setCursorPosition] = useState(0);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const digits = value.replace(/\D/g, "").slice(0, maxLength);

  const handleTextChange = useCallback((e) => {
    const cleanText = e.target.value.replace(/\D/g, "").slice(0, maxLength);
    setCursorPosition(Math.min(cleanText.length, maxLength - 1));
    if (onChangeText) onChangeText(cleanText);
  }, [maxLength, onChangeText]);

  const handleFocusEvent = useCallback(() => {
    setIsFocused(true);
    setCursorPosition(Math.min(digits.length, maxLength - 1));
    if (onFocus) onFocus();
  }, [digits.length, maxLength, onFocus]);

  const handleBlurEvent = useCallback(() => {
    setIsFocused(false);
    setCursorPosition(0);
    if (onBlur) onBlur();
  }, [onBlur]);

  const handleClick = useCallback((e) => {
    if (highlightOnClick) {
      e.preventDefault();
      setIsFocused(true);
      setCursorPosition(Math.min(digits.length, 9));
      inputRef.current?.focus();
    }
  }, [highlightOnClick, digits.length]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === "Enter") {
      handleEnterPress();
      return;
    }
    const allowed = ["Backspace", "Delete", "ArrowLeft", "ArrowRight", "Enter"];
    if (allowed.includes(e.key) || /^\d$/.test(e.key)) return;
    if (e.ctrlKey || e.metaKey) return;
    e.preventDefault();
  }, [handleEnterPress]);

  const handleSelect = useCallback((e) => {
    const start = e.target.selectionStart || 0;
    setCursorPosition(Math.min(start, digits.length, maxLength - 1));
  }, [digits.length, maxLength]);

  const renderBoxes = () => {
    const elements = [];
    for (let i = 0; i < 10; i++) {
      const digit = digits[i] || "";
      const isEmpty = !digit;
      const isCursorPos = isFocused && cursorPosition === i;

      const boxInlineStyle = {
        width: width || 30,
        height: height || 40,
        borderColor: isCursorPos ? C.cursorRed : isEmpty ? "#ddd" : "#007bff",
        backgroundColor: isCursorPos ? C.cursorRed : isEmpty ? "#f8f9fa" : "#fff",
        boxShadow: isCursorPos ? "0 0 10px rgba(255, 107, 107, 0.5)" : "none",
        ...boxStyle,
        ...(isCursorPos ? cursorBoxStyle : isEmpty ? placeholderBoxStyle : filledBoxStyle),
      };

      elements.push(
        <div key={`box-${i}`} className={styles.box} style={boxInlineStyle}>
          <span
            className={styles.digit}
            style={{
              fontSize: fontSize || 18,
              color: isCursorPos ? cursorTextColor : isEmpty ? placeholderTextColor : textColor,
            }}
          >
            {digit}
          </span>
        </div>
      );

      if (showDashes && (i === 2 || i === 5)) {
        elements.push(
          <span
            key={`dash-${i}`}
            className={styles.dash}
            style={{ fontSize: dashSize, color: dashColor, ...dashStyle }}
          >
            -
          </span>
        );
      }
    }
    return elements;
  };

  return (
    <div
      ref={ref}
      className={`${styles.container} ${disabled ? styles.disabled : ""} ${className}`}
      style={style}
      onClick={handleClick}
      aria-label={ariaLabel || "Phone number input"}
      data-testid={testId}
    >
      {renderBoxes()}
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        autoComplete="tel"
        value={digits}
        onChange={handleTextChange}
        onFocus={handleFocusEvent}
        onBlur={handleBlurEvent}
        onKeyDown={handleKeyDown}
        onSelect={handleSelect}
        placeholder={placeholder}
        disabled={!editable || disabled}
        maxLength={maxLength}
        className={styles.hiddenInput}
        aria-hidden="true"
        tabIndex={-1}
      />
    </div>
  );
});

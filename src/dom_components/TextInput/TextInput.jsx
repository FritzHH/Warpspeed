import React, { forwardRef, useState, useEffect, useRef, useCallback, useLayoutEffect } from "react";
import { DEBOUNCE_DELAY } from "../../constants";
import styles from "./TextInput.module.css";

export const TextInput = forwardRef(function TextInput(
  {
    value = "",
    onChangeText,
    debounceMs = DEBOUNCE_DELAY,
    style = {},
    placeholder = "",
    placeholderTextColor = "gray",
    multiline = false,
    numberOfLines,
    autoFocus = false,
    editable = true,
    disabled = false,
    onFocus,
    onBlur,
    onContentSizeChange,
    capitalize = false,
    inputRef: externalInputRef,
    // Additive props (not in old component)
    label,
    error,
    errorMessage,
    required = false,
    className = "",
    id,
    "aria-label": ariaLabel,
    "data-testid": testId,
    ...props
  },
  ref
) {
  const [localValue, setLocalValue] = useState(value || "");
  const debounceRef = useRef(null);
  const latestValueRef = useRef(value || "");
  const internalRef = useRef(null);

  // Combined ref: always populates internalRef (for adjustHeight) AND forwards
  // to any external ref/callback so the caller still gets the node.
  const setRef = useCallback(
    (node) => {
      internalRef.current = node;
      const assign = (target) => {
        if (!target) return;
        if (typeof target === "function") target(node);
        else target.current = node;
      };
      assign(externalInputRef);
      assign(ref);
    },
    [externalInputRef, ref]
  );

  const baseLineHeight = (style && parseInt(style.lineHeight)) || 20;
  const minHeight = multiline ? baseLineHeight : undefined;
  const maxHeight = multiline && numberOfLines ? baseLineHeight * numberOfLines : undefined;

  // Sync local state when value prop changes externally
  useEffect(() => {
    setLocalValue(value || "");
    latestValueRef.current = value || "";
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  }, [value]);

  // Auto-height on mount and when value changes externally
  useLayoutEffect(() => {
    if (!multiline) return;
    if (internalRef.current) adjustHeight(internalRef.current);
  }, [localValue, multiline]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function adjustHeight(node) {
    if (!node) return;
    node.style.height = "0px";
    const scrollH = node.scrollHeight;
    const h = Math.max(minHeight || 0, Math.ceil(scrollH));
    const newH = maxHeight ? Math.min(h, maxHeight) : h;
    node.style.height = newH + "px";
  }

  const debouncedOnChangeText = useCallback(
    (val) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (!onChangeText) return;
      if (debounceMs === 0) {
        onChangeText(val);
        return;
      }
      debounceRef.current = setTimeout(() => {
        onChangeText(val);
      }, debounceMs);
    },
    [onChangeText, debounceMs]
  );

  const handleChange = (e) => {
    let val = e.target.value;
    if (capitalize) {
      val = val.replace(/(^|[.!?]\s+|\n[-*]+\s*)([a-z])/g, (_, sep, char) => sep + char.toUpperCase());
    }
    setLocalValue(val);
    latestValueRef.current = val;

    if (multiline && e.target) {
      adjustHeight(e.target);
    }

    // Fire onContentSizeChange for consumers that use it
    if (onContentSizeChange && multiline && e.target) {
      onContentSizeChange({
        nativeEvent: {
          contentSize: {
            height: e.target.scrollHeight,
            width: e.target.scrollWidth,
          },
        },
      });
    }

    debouncedOnChangeText(val);
  };

  const isDisabled = disabled || !editable;
  const isReadOnly = !disabled && !editable;
  const inputId = id || (label ? `input-${label.replace(/\s+/g, "-").toLowerCase()}` : undefined);

  const computedStyle = {
    "--placeholder-color": placeholderTextColor,
    ...(multiline
      ? {
          minHeight,
          textAlign: "start",
        }
      : {}),
    ...style,
  };

  const classNames = [
    styles.input,
    multiline ? styles.multiline : "",
    disabled ? styles.disabled : "",
    isReadOnly ? styles.readOnly : "",
    error ? styles.error : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const Component = multiline ? "textarea" : "input";

  return (
    <>
      {label && (
        <label className={styles.label} htmlFor={inputId}>
          {label}
          {required && " *"}
        </label>
      )}
      <Component
        ref={setRef}
        id={inputId}
        className={classNames}
        style={computedStyle}
        value={localValue}
        onChange={handleChange}
        placeholder={placeholder}
        autoFocus={autoFocus}
        disabled={disabled}
        readOnly={isReadOnly}
        rows={multiline ? (numberOfLines || 1) : undefined}
        aria-label={ariaLabel || label}
        aria-invalid={!!error || undefined}
        aria-required={required || undefined}
        data-testid={testId}
        onFocus={onFocus}
        onBlur={(e) => {
          if (debounceRef.current) {
            clearTimeout(debounceRef.current);
            debounceRef.current = null;
            if (onChangeText) onChangeText(latestValueRef.current);
          }
          if (onBlur) onBlur(e);
        }}
        {...props}
      />
      {error && errorMessage && (
        <span className={styles.errorMessage}>{errorMessage}</span>
      )}
    </>
  );
});

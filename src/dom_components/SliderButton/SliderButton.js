import React, { forwardRef, useState, useRef, useCallback } from "react";
import styles from "./SliderButton.module.css";

export const SliderButton = forwardRef(function SliderButton(
  {
    onConfirm,
    toConfirmLabel = "Slide to confirm",
    confirmLabel = "Confirmed!",
    showLabel = false,
    style = {},
    textStyle = {},
    labelStyle = {},
    sliderWidth = 280,
    knobSize = 50,
    sliderBackgroundColor = "#eee",
    sliderBackgroundOpacity = 1,
    knobBackgroundColor = "#4CAF50",
    knobTextColor = "white",
    knobText = "\u27a4",
    knobImage,
    knobImageSize = 20,
    disabled = false,
    className = "",
    "aria-label": ariaLabel,
    "data-testid": testId,
  },
  ref
) {
  const [offset, setOffset] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const dragging = useRef(false);
  const startX = useRef(0);

  const maxDistance = sliderWidth - knobSize;
  const threshold = maxDistance - 10;

  const handlePointerDown = useCallback((e) => {
    if (disabled || confirmed) return;
    dragging.current = true;
    startX.current = e.clientX - offset;
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [disabled, confirmed, offset]);

  const handlePointerMove = useCallback((e) => {
    if (!dragging.current) return;
    const dx = e.clientX - startX.current;
    setOffset(Math.max(0, Math.min(dx, maxDistance)));
  }, [maxDistance]);

  const handlePointerUp = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;

    if (offset > threshold) {
      setConfirmed(true);
      onConfirm?.();
      setTimeout(() => {
        setConfirmed(false);
        setOffset(0);
      }, 300);
    } else {
      setOffset(0);
    }
  }, [offset, threshold, onConfirm]);

  const resolveIcon = (src) => {
    if (!src) return null;
    return typeof src === "object" ? src.default || src : src;
  };

  return (
    <div
      ref={ref}
      className={`${styles.container} ${disabled ? styles.disabled : ""} ${className}`}
      style={style}
      aria-label={ariaLabel || toConfirmLabel}
      data-testid={testId}
    >
      {!!showLabel && (
        <span className={styles.label} style={labelStyle}>
          {confirmed ? confirmLabel : toConfirmLabel}
        </span>
      )}
      <div
        className={styles.track}
        style={{
          width: sliderWidth,
          height: knobSize,
          backgroundColor: sliderBackgroundColor,
          opacity: sliderBackgroundOpacity,
        }}
      >
        <div
          className={styles.knob}
          style={{
            width: knobSize,
            height: knobSize,
            backgroundColor: knobBackgroundColor,
            transform: `translateX(${offset}px)`,
            transition: dragging.current ? "none" : "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          role="slider"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round((offset / maxDistance) * 100)}
          tabIndex={disabled ? -1 : 0}
        >
          {knobImage ? (
            <img
              src={resolveIcon(knobImage)}
              alt=""
              className={styles.knobIcon}
              style={{ width: knobImageSize, height: knobImageSize }}
            />
          ) : (
            <span className={styles.knobText} style={{ color: knobTextColor, ...textStyle }}>
              {knobText}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});

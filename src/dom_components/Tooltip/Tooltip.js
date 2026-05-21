import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { C } from "../../styles";
import styles from "./Tooltip.module.css";

export const Tooltip = ({
  text,
  children,
  position = "top",
  style = {},
  backgroundColor,
  color,
  alert = false,
  darkMode = false,
  offsetX = 0,
  offsetY = 0,
  delayDuration = 400,
  disabled = false,
  "aria-describedby": ariaDescribedBy,
}) => {
  const wrapRef = useRef(null);
  const bubbleRef = useRef(null);
  const showTimerRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, ready: false });

  const showTooltip = useCallback(() => {
    if (!text || disabled) return;
    clearTimeout(showTimerRef.current);
    showTimerRef.current = setTimeout(() => setVisible(true), delayDuration);
  }, [text, disabled, delayDuration]);

  const hideTooltip = useCallback(() => {
    clearTimeout(showTimerRef.current);
    setVisible(false);
    setPos((p) => (p.ready ? { top: 0, left: 0, ready: false } : p));
  }, []);

  useEffect(() => () => clearTimeout(showTimerRef.current), []);

  useEffect(() => {
    if (!visible) return;
    const el = wrapRef.current?.firstElementChild;
    const bubble = bubbleRef.current;
    if (!el || !bubble) return;
    const r = el.getBoundingClientRect();
    const b = bubble.getBoundingClientRect();
    const gap = 6;
    let top = 0;
    let left = 0;
    if (position === "top") {
      top = r.top - b.height - gap + offsetY;
      left = r.left + r.width / 2 - b.width / 2 + offsetX;
    } else if (position === "bottom") {
      top = r.bottom + gap - offsetY;
      left = r.left + r.width / 2 - b.width / 2 + offsetX;
    } else if (position === "left") {
      top = r.top + r.height / 2 - b.height / 2 + offsetY;
      left = r.left - b.width - gap + offsetX;
    } else {
      top = r.top + r.height / 2 - b.height / 2 + offsetY;
      left = r.right + gap + offsetX;
    }
    const pad = 10;
    left = Math.max(pad, Math.min(left, window.innerWidth - b.width - pad));
    top = Math.max(pad, Math.min(top, window.innerHeight - b.height - pad));
    setPos({ top, left, ready: true });
  }, [visible, position, offsetX, offsetY, text]);

  if (!text || disabled) {
    return (
      <span
        ref={wrapRef}
        style={{ display: "contents", ...style }}
        aria-describedby={ariaDescribedBy}
      >
        {children}
      </span>
    );
  }

  const bgColor =
    backgroundColor ||
    (alert ? C.warning : darkMode ? C.surfaceOverlayHeavy : C.surfaceOverlay);
  const textColor = color || C.textOnAccent;

  return (
    <>
      <span
        ref={wrapRef}
        onPointerEnter={showTooltip}
        onPointerLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
        style={{ display: "contents", ...style }}
        aria-describedby={ariaDescribedBy}
      >
        {children}
      </span>
      {visible &&
        createPortal(
          <div
            ref={bubbleRef}
            className={styles.bubble}
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              backgroundColor: bgColor,
              zIndex: "var(--z-tooltip)",
              pointerEvents: "none",
              opacity: pos.ready ? 1 : 0,
            }}
          >
            <span className={styles.text} style={{ color: textColor }}>
              {text}
            </span>
          </div>,
          document.body,
        )}
    </>
  );
};

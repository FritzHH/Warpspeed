import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { C } from "../../styles";
import styles from "./Tooltip.module.css";

const GAP = 6;
const VIEWPORT_PAD = 8;

// Compute top/left for a given side. r = trigger rect, b = bubble rect.
function positionForSide(side, r, b, offsetX, offsetY) {
  switch (side) {
    case "top":
      return {
        top: r.top - b.height - GAP + offsetY,
        left: r.left + r.width / 2 - b.width / 2 + offsetX,
      };
    case "bottom":
      return {
        top: r.bottom + GAP - offsetY,
        left: r.left + r.width / 2 - b.width / 2 + offsetX,
      };
    case "left":
      return {
        top: r.top + r.height / 2 - b.height / 2 + offsetY,
        left: r.left - b.width - GAP + offsetX,
      };
    case "right":
    default:
      return {
        top: r.top + r.height / 2 - b.height / 2 + offsetY,
        left: r.right + GAP + offsetX,
      };
  }
}

function fitsViewport(pos, b) {
  return (
    pos.left >= VIEWPORT_PAD &&
    pos.top >= VIEWPORT_PAD &&
    pos.left + b.width <= window.innerWidth - VIEWPORT_PAD &&
    pos.top + b.height <= window.innerHeight - VIEWPORT_PAD
  );
}

const OPPOSITE = { top: "bottom", bottom: "top", left: "right", right: "left" };

// Try preferred side; if it overflows, try opposite, then perpendiculars.
// Fall back to preferred with clamping if nothing fits.
function pickPosition(preferred, r, b, offsetX, offsetY) {
  const tried = new Set();
  const order = [preferred, OPPOSITE[preferred], "top", "bottom", "left", "right"];
  for (const side of order) {
    if (tried.has(side)) continue;
    tried.add(side);
    const pos = positionForSide(side, r, b, offsetX, offsetY);
    if (fitsViewport(pos, b)) return { ...pos, ready: true };
  }
  const fallback = positionForSide(preferred, r, b, offsetX, offsetY);
  return {
    top: Math.max(VIEWPORT_PAD, Math.min(fallback.top, window.innerHeight - b.height - VIEWPORT_PAD)),
    left: Math.max(VIEWPORT_PAD, Math.min(fallback.left, window.innerWidth - b.width - VIEWPORT_PAD)),
    ready: true,
  };
}

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
  // Set on click; suppresses focus-driven show until pointer leaves and re-enters.
  // Without this, clicking a tooltipped button hides the tooltip on pointerdown
  // but the click's focus transfer re-fires onFocus → tooltip reappears.
  const suppressShowRef = useRef(false);
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, ready: false });

  const showTooltip = useCallback(() => {
    if (!text || disabled) return;
    if (suppressShowRef.current) return;
    clearTimeout(showTimerRef.current);
    showTimerRef.current = setTimeout(() => setVisible(true), delayDuration);
  }, [text, disabled, delayDuration]);

  const hideTooltip = useCallback(() => {
    clearTimeout(showTimerRef.current);
    setVisible(false);
    setPos((p) => (p.ready ? { top: 0, left: 0, ready: false } : p));
  }, []);

  const handlePointerDown = useCallback(() => {
    suppressShowRef.current = true;
    hideTooltip();
  }, [hideTooltip]);

  const handlePointerLeave = useCallback(() => {
    suppressShowRef.current = false;
    hideTooltip();
  }, [hideTooltip]);

  useEffect(() => () => clearTimeout(showTimerRef.current), []);

  // Measure trigger + bubble and position with collision detection (try
  // preferred side, then opposite, then perpendiculars, fall back to clamped).
  useEffect(() => {
    if (!visible) return;
    const el = wrapRef.current?.firstElementChild;
    const bubble = bubbleRef.current;
    if (!el || !bubble) return;
    const r = el.getBoundingClientRect();
    const b = bubble.getBoundingClientRect();
    setPos(pickPosition(position, r, b, offsetX, offsetY));
  }, [visible, position, offsetX, offsetY, text]);

  // Close on scroll or resize while visible — coordinates would otherwise stale.
  useEffect(() => {
    if (!visible) return;
    const onMove = () => hideTooltip();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [visible, hideTooltip]);

  // Hide on any pointerdown anywhere while visible. Capture-phase so it fires
  // before any element's stopPropagation can intercept (e.g., DropdownMenu
  // triggers, modal close buttons). Suppress further focus-driven re-shows
  // until the pointer leaves and re-enters the trigger.
  useEffect(() => {
    if (!visible) return;
    const onGlobalDown = () => {
      suppressShowRef.current = true;
      hideTooltip();
    };
    document.addEventListener("pointerdown", onGlobalDown, true);
    return () => document.removeEventListener("pointerdown", onGlobalDown, true);
  }, [visible, hideTooltip]);

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
        onPointerLeave={handlePointerLeave}
        onPointerDown={handlePointerDown}
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
            role="tooltip"
            style={{
              top: pos.top,
              left: pos.left,
              backgroundColor: bgColor,
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

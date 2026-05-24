import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { claimZ, releaseZ } from "../../styles";
import styles from "./Toast.module.css";

const FADE_OUT_MS = 420;

const POSITION_CLASS = {
  "top-left":          styles.posTopLeft,
  "top-middle":        styles.posTopMiddle,
  "top-right":         styles.posTopRight,
  "mid-top-middle":    styles.posMidTopMiddle,
  "middle":            styles.posMiddle,
  "mid-bottom-middle": styles.posMidBottomMiddle,
  "bottom-left":       styles.posBottomLeft,
  "bottom-middle":     styles.posBottomMiddle,
  "bottom-right":      styles.posBottomRight,
};

export const Toast = ({
  text,
  visible = false,
  duration = 2000,
  position = "mid-top-middle",
  backgroundColor,
  color,
  opacity,
  onHide,
  children,
}) => {
  const [mounted, setMounted] = useState(visible);
  const [exiting, setExiting] = useState(false);
  const [zClaim, setZClaim] = useState(null);
  const exitTimerRef = useRef(null);
  const hideTimerRef = useRef(null);

  useLayoutEffect(() => {
    if (!mounted) return;
    const z = claimZ("toast");
    setZClaim(z);
    return () => {
      releaseZ("toast", z);
      setZClaim(null);
    };
  }, [mounted]);

  // Sync to visible prop. true -> mount + reset exit. false -> begin exit.
  useEffect(() => {
    if (visible) {
      clearTimeout(exitTimerRef.current);
      setMounted(true);
      setExiting(false);
    } else if (mounted && !exiting) {
      setExiting(true);
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-hide timer: after `duration`, begin exit animation.
  useEffect(() => {
    if (!visible || !duration || exiting) return;
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setExiting(true), duration);
    return () => clearTimeout(hideTimerRef.current);
  }, [visible, duration, exiting]);

  // Exit animation -> unmount + onHide.
  useEffect(() => {
    if (!exiting) return;
    clearTimeout(exitTimerRef.current);
    exitTimerRef.current = setTimeout(() => {
      setMounted(false);
      setExiting(false);
      onHide && onHide();
    }, FADE_OUT_MS);
    return () => clearTimeout(exitTimerRef.current);
  }, [exiting, onHide]);

  if (!mounted) return null;

  const posClass = POSITION_CLASS[position] || styles.posMidTopMiddle;
  const animClass = exiting ? styles.exiting : styles.entering;
  const toastStyle = {};
  if (backgroundColor) toastStyle.backgroundColor = backgroundColor;
  if (opacity != null) toastStyle["--toast-opacity"] = opacity;
  if (zClaim != null) toastStyle.zIndex = zClaim;

  const textStyle = color ? { color } : undefined;

  return createPortal(
    <div
      className={`${styles.toast} ${posClass} ${animClass}`}
      style={toastStyle}
      role="status"
      aria-live="polite"
    >
      {children ? children : <span className={styles.text} style={textStyle}>{text}</span>}
    </div>,
    document.body,
  );
};

import React, { forwardRef, useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import { ICONS } from "../../styles";
import styles from "./PrinterAlert.module.css";

export const PrinterAlert = forwardRef(function PrinterAlert(
  {
    visible,
    x,
    y,
    onDone,
    "data-testid": testId,
  },
  ref
) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!visible) return;
    const el = containerRef.current;
    if (!el) return;

    el.classList.remove(styles.fadeOut);
    el.classList.add(styles.pulsing);

    const timer = setTimeout(() => {
      el.classList.remove(styles.pulsing);
      el.classList.add(styles.fadeOut);

      const handleEnd = () => {
        el.removeEventListener("animationend", handleEnd);
        if (onDone) onDone();
      };
      el.addEventListener("animationend", handleEnd);
    }, 2000);

    return () => clearTimeout(timer);
  }, [visible, onDone]);

  if (!visible) return null;

  const resolveIcon = (src) => {
    if (!src) return null;
    return typeof src === "object" ? src.default || src : src;
  };

  return ReactDOM.createPortal(
    <div
      ref={(node) => {
        containerRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
      className={styles.container}
      style={{
        left: (x || 0) - 25,
        top: (y || 0) - 25,
      }}
      data-testid={testId}
      aria-hidden="true"
    >
      <img
        src={resolveIcon(ICONS.print)}
        alt=""
        className={styles.icon}
      />
    </div>,
    document.body
  );
});

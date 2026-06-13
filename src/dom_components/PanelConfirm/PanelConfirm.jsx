/* eslint-disable */
import { useEffect, useRef } from "react";
import styles from "./PanelConfirm.module.css";

const GHOST_CLICK_GUARD_MS = 300;

/**
 * PanelConfirm — panel-scoped confirm prompt. Renders inline (no portal) so
 * it fills its nearest `position: relative` ancestor. Backdrop dims the panel;
 * card sits in the upper third with title, message, and Yes/No buttons.
 *
 * Props:
 *   show:       boolean
 *   title:      string
 *   message:    string
 *   yesText:    string (default "Yes")
 *   noText:     string (default "No")
 *   onYes:      () => void
 *   onNo:       () => void
 *   size:       "default" | "large"
 */
export function PanelConfirm({
  show,
  title,
  message,
  yesText = "Yes",
  noText = "No",
  onYes,
  onNo,
  size = "default",
  centered = false,
}) {
  const shownAtRef = useRef(0);

  useEffect(() => {
    if (show) shownAtRef.current = Date.now();
  }, [show]);

  if (!show) return null;

  const stop = (e) => e.stopPropagation();
  const sizeClass = size === "large" ? styles.large : "";
  const centeredClass = centered ? styles.centered : "";

  const handleBackdropClick = () => {
    if (Date.now() - shownAtRef.current < GHOST_CLICK_GUARD_MS) return;
    if (onNo) onNo();
  };

  return (
    <div
      className={`${styles.backdrop} ${sizeClass} ${centeredClass}`}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
    >
      <div className={styles.card} onClick={stop}>
        {title && <div className={styles.title}>{title}</div>}
        {message && <div className={styles.message}>{message}</div>}
        <div className={styles.actions}>
          <button type="button" className={`${styles.btn} ${styles.btnNo}`} onClick={onNo}>
            {noText}
          </button>
          <button type="button" className={`${styles.btn} ${styles.btnYes}`} onClick={onYes}>
            {yesText}
          </button>
        </div>
      </div>
    </div>
  );
}

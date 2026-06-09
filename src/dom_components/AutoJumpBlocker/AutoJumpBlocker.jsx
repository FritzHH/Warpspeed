/* eslint-disable */
import { createPortal } from "react-dom";
import { useZ } from "../../hooks/useZ";
import styles from "./AutoJumpBlocker.module.css";

/**
 * AutoJumpBlocker — full-screen blocking overlay shown for ~750ms between an
 * autocomplete selection and the focus jump to the next field. Captures and
 * swallows pointer + keyboard input while visible. Pair with `useAutoJumpBlock`.
 *
 * Props:
 *   show:    boolean — visibility
 *   message: string — centered text
 */
export function AutoJumpBlocker({ show, message }) {
  const z = useZ("alert", show);

  if (!show) return null;

  const swallow = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return createPortal(
    <div
      className={styles.backdrop}
      style={{ zIndex: z }}
      onPointerDownCapture={swallow}
      onPointerUpCapture={swallow}
      onMouseDownCapture={swallow}
      onMouseUpCapture={swallow}
      onClickCapture={swallow}
      onTouchStartCapture={swallow}
      onTouchEndCapture={swallow}
      onKeyDownCapture={swallow}
      onKeyPressCapture={swallow}
      onKeyUpCapture={swallow}
      role="status"
      aria-live="polite"
    >
      <div className={styles.card}>{message || "..."}</div>
    </div>,
    document.body,
  );
}

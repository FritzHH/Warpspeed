/* eslint-disable */
import styles from "./PanelJumpBlocker.module.css";

/**
 * PanelJumpBlocker — panel-scoped variant of AutoJumpBlocker. Renders inline
 * (no portal) so it fills its nearest `position: relative` ancestor instead of
 * the whole viewport. Card sits in the top third of the panel; backdrop dims
 * the panel and swallows pointer + keyboard input while visible. Pair with
 * `useAutoJumpBlock`.
 *
 * Props:
 *   show:    boolean — visibility
 *   message: string — text shown on the card
 */
export function PanelJumpBlocker({ show, message }) {
  if (!show) return null;

  const swallow = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      className={styles.backdrop}
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
    </div>
  );
}

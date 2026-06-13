import styles from "./SwipeBackHint.module.css";

export function SwipeBackHint({ label, swipeX }) {
  if (!swipeX || swipeX <= 0) return null;
  const opacity = Math.min(swipeX / 80, 1);
  const viewportWidth =
    typeof window !== "undefined" ? window.innerWidth : 400;
  const committed = swipeX >= viewportWidth * 0.3;
  return (
    <div
      className={`${styles.hint} ${committed ? styles.committed : ""}`}
      style={{ opacity }}
    >
      <span className={styles.arrow}>{"\u2190"}</span>
      {label && <span className={styles.label}>{label}</span>}
    </div>
  );
}

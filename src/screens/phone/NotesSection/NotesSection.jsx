import styles from "./NotesSection.module.css";

export function NotesSection({ notes }) {
  if (!notes) return null;
  return (
    <div className={styles.card}>
      <span className={styles.label}>NOTES</span>
      <span className={styles.body}>{notes}</span>
    </div>
  );
}

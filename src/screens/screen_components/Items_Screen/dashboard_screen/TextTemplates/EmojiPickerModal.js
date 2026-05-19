import React from "react";
import { createPortal } from "react-dom";
import { C, Z } from "../../../../../styles";
import { TEMPLATE_EMOJIS } from "./templateConstants";
import styles from "./EmojiPickerModal.module.css";

export function EmojiPickerModal({ onSelectEmoji, onClose }) {
  return createPortal(
    <div className={styles.backdrop} style={{ zIndex: Z.modal }}>
      <div className={styles.backdropClickCatcher} onClick={onClose} />
      <div
        className={styles.modal}
        style={{ backgroundColor: C.backgroundWhite }}
      >
        <div className={styles.title} style={{ color: C.text }}>
          Insert Emoji
        </div>
        <div className={styles.grid}>
          {TEMPLATE_EMOJIS.map((e) => (
            <button
              key={e.id}
              type="button"
              className={styles.emojiCell}
              onClick={() => onSelectEmoji(e.id)}
            >
              <span className={styles.emoji}>{e.id}</span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}

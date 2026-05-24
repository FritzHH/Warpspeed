import React, { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { C } from "../../../../../styles";
import { useZ } from "../../../../../hooks/useZ";
import { TEMPLATE_EMOJIS } from "./templateConstants";
import styles from "./EmojiPickerModal.module.css";

export function EmojiPickerModal({ onSelectEmoji, onClose, anchorRect }) {
  const modalRef = useRef(null);
  const [pos, setPos] = useState(anchorRect ? { left: -9999, top: -9999 } : null);
  const z = useZ("modal");

  useLayoutEffect(() => {
    if (!anchorRect || !modalRef.current) return;
    const m = modalRef.current.getBoundingClientRect();
    const W = window.innerWidth;
    const H = window.innerHeight;
    let left = anchorRect.left - m.width - 8;
    let top = anchorRect.bottom - m.height;
    if (left < 8) left = 8;
    if (top < 8) top = 8;
    if (top + m.height > H - 8) top = H - 8 - m.height;
    if (left + m.width > W - 8) left = W - 8 - m.width;
    setPos({ left, top });
  }, [anchorRect]);

  const modalContent = (
    <div
      ref={modalRef}
      className={styles.modal}
      style={
        anchorRect
          ? {
              backgroundColor: C.backgroundWhite,
              position: "fixed",
              left: pos ? pos.left : 0,
              top: pos ? pos.top : 0,
              boxShadow: "0 6px 24px rgba(0,0,0,0.18)",
            }
          : { backgroundColor: C.backgroundWhite }
      }
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
  );

  return createPortal(
    anchorRect ? (
      <div className={styles.anchoredWrap} style={{ zIndex: z }}>
        <div className={styles.backdropClickCatcher} onClick={onClose} />
        {modalContent}
      </div>
    ) : (
      <div className={styles.backdrop} style={{ zIndex: z }}>
        <div className={styles.backdropClickCatcher} onClick={onClose} />
        {modalContent}
      </div>
    ),
    document.body
  );
}

import React from "react";
import { Dialog } from "../Dialog/Dialog";
import { Image } from "../Image/Image";
import styles from "./TestConfirmModal.module.css";

export const TestConfirmModal = ({
  visible,
  onClose,
  onConfirm,
  title = "Discard changes?",
  message = "Your unsaved changes will be lost. Continue?",
  cancelBg,
  cancelFg,
  cancelIcon,
  discardIcon,
  confirmBg,
  confirmFg,
  confirmIcon,
}) => {
  const cancelStyle = {
    ...(cancelBg && { backgroundColor: cancelBg }),
    ...(cancelFg && { color: cancelFg }),
  };
  const confirmStyle = {
    ...(confirmBg && { backgroundColor: confirmBg }),
    ...(confirmFg && { color: confirmFg }),
  };

  return (
    <Dialog
      visible={visible}
      onClose={onClose}
      title={title}
      aria-label={title}
      overlayColor="transparent"
    >
      <div className={styles.card}>
        <div className={styles.header}>
          <span className={styles.title}>{title}</span>
        </div>

        <div className={styles.body}>
          <p className={styles.message}>{message}</p>
        </div>

        <div className={styles.footer}>
          <button
            className={styles.actionBtn}
            style={cancelStyle}
            onClick={onClose}
          >
            {cancelIcon && <Image icon={cancelIcon} size={16} />}
            <span>Cancel</span>
          </button>
          <button className={styles.actionBtn} onClick={onClose}>
            {discardIcon && <Image icon={discardIcon} size={16} />}
            <span>Discard</span>
          </button>
          <button
            className={styles.actionBtn}
            style={confirmStyle}
            onClick={onConfirm}
          >
            {confirmIcon && <Image icon={confirmIcon} size={16} />}
            <span>Confirm</span>
          </button>
        </div>
      </div>
    </Dialog>
  );
};

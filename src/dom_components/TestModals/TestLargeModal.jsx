import React from "react";
import { Dialog } from "../Dialog/Dialog";
import { Image } from "../Image/Image";
import { ICONS } from "../../styles";
import styles from "./TestLargeModal.module.css";

export const TestLargeModal = ({
  visible,
  onClose,
  onShowConfirm,
  cancelBg,
  cancelFg,
  cancelIcon,
  draftIcon,
  primaryBg,
  primaryFg,
  primaryIcon,
}) => {
  const cancelStyle = {
    ...(cancelBg && { backgroundColor: cancelBg }),
    ...(cancelFg && { color: cancelFg }),
  };
  const primaryStyle = {
    ...(primaryBg && { backgroundColor: primaryBg }),
    ...(primaryFg && { color: primaryFg }),
  };

  return (
    <Dialog
      visible={visible}
      onClose={onClose}
      title="Test Large Modal"
      aria-label="Test Large Modal"
    >
      <div className={styles.card}>
        <div className={styles.header}>
          <span className={styles.title}>Test Large Modal</span>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close"
          >
            <Image icon={ICONS.close1} width={16} height={16} />
          </button>
        </div>

        <div className={styles.body}>
          <p className={styles.placeholder}>
            Body content area. Represents the working space of a large modal
            (checkout, workorder, payroll, etc.). Sized to give plenty of room
            for forms, tables, or multi-section content.
          </p>
          <p className={styles.placeholder}>
            Action buttons live in the header (top-right) and footer (below).
            No scattered controls in the body.
          </p>
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
            {draftIcon && <Image icon={draftIcon} size={16} />}
            <span>Save Draft</span>
          </button>
          <button
            className={styles.actionBtn}
            style={primaryStyle}
            onClick={onShowConfirm}
          >
            {primaryIcon && <Image icon={primaryIcon} size={16} />}
            <span>Show Confirm</span>
          </button>
        </div>
      </div>
    </Dialog>
  );
};

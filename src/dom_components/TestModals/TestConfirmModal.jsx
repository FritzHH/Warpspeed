import React from "react";
import { Dialog } from "../Dialog/Dialog";
import { ModalFooter, ModalFooterButton } from "../ModalFooter/ModalFooter";
import styles from "./TestConfirmModal.module.css";

export const TestConfirmModal = ({
  visible,
  onClose,
  onConfirm,
  title = "Discard changes?",
  message = "Your unsaved changes will be lost. Continue?",
}) => {
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

        <ModalFooter size="small">
          <ModalFooterButton onClick={onClose}>Cancel</ModalFooterButton>
          <ModalFooterButton onClick={onClose}>Discard</ModalFooterButton>
          <ModalFooterButton variant="accent" onClick={onConfirm}>
            Confirm
          </ModalFooterButton>
        </ModalFooter>
      </div>
    </Dialog>
  );
};

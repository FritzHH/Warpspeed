/* eslint-disable */
import React from "react";
import {
  Dialog,
  ModalHeader,
  ModalHeaderButton,
  ModalFooter,
  ModalFooterButton,
} from "../../../../dom_components";
import {
  useLoginStore,
  useSettingsStore,
  useAlertScreenStore,
} from "../../../../stores";
import { ICONS } from "../../../../styles";
import styles from "./NewUserHelpModal.module.css";

function dismissForever(onClose) {
  const currentUser = useLoginStore.getState().currentUser;
  if (!currentUser) {
    onClose();
    return;
  }

  const liveUsers = useSettingsStore.getState().settings?.users || [];
  const updated = liveUsers.map((u) =>
    u.id === currentUser.id ? { ...u, showNewUserHelp: false } : u
  );
  useSettingsStore.getState().setField("users", updated);
  useLoginStore.getState().setCurrentUser({
    ...currentUser,
    showNewUserHelp: false,
  });
  onClose();
}

function confirmDismiss(onClose) {
  useAlertScreenStore.getState().setValues({
    title: "Dismiss Help?",
    severity: "warning",
    message: "You won't see this guide again.",
    btn1Text: "DISMISS",
    btn2Text: "CANCEL",
    handleBtn1Press: () => dismissForever(onClose),
    handleBtn2Press: () => {},
    showAlert: true,
  });
}

export const NewUserHelpModal = ({ visible, onClose }) => {
  const currentUser = useLoginStore((s) => s.currentUser);
  const showAdminSection = (currentUser?.permissions?.level || 0) >= 4;

  return (
    <Dialog visible={visible} onClose={onClose} title="New User Help">
      <div className={styles.card}>
        <ModalHeader
          title="New User Help"
          actions={
            <ModalHeaderButton
              icon={ICONS.close1}
              iconPosition="only"
              iconSize={16}
              label="Close"
              onClick={onClose}
            />
          }
        />

        <div className={styles.body}>
          <div className={styles.section}>
            <div className={styles.sectionHeading}>Getting Started</div>
            <div className={styles.sectionBody} />
          </div>

          {showAdminSection && (
            <div className={styles.section}>
              <div className={styles.sectionHeading}>Admin Tasks</div>
              <div className={styles.sectionBody} />
            </div>
          )}
        </div>

        <ModalFooter>
          <ModalFooterButton
            variant="danger"
            onClick={() => confirmDismiss(onClose)}
          >
            Dismiss Forever
          </ModalFooterButton>
        </ModalFooter>
      </div>
    </Dialog>
  );
};

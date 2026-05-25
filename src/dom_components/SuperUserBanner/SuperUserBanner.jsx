import React from "react";
import { createPortal } from "react-dom";
import { useLoginStore } from "../../stores";
import { permissionToLevel } from "../../data";
import { useZ } from "../../hooks/useZ";
import styles from "./SuperUserBanner.module.css";

export const SuperUserBanner = () => {
  const currentUser = useLoginStore((s) => s.getCurrentUser());
  const level = permissionToLevel(currentUser?.permissions);
  const active = level >= 4 && !import.meta.env.DEV;
  const z = useZ("toast", active);
  if (!active) return null;
  return createPortal(
    <div className={styles.banner} style={{ zIndex: z }}>
      <span className={styles.text}>SUPER-USER MODE ACTIVE - PLEASE LOG OUT WHEN FINISHED</span>
    </div>,
    document.body,
  );
};

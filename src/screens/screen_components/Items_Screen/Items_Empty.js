/* eslint-disable */
import React from "react";
import defaultLogo from "../../../resources/default_app_logo_large.png";
import styles from "./Items_Empty.module.css";

export function EmptyItemsComponent() {
  return (
    <div className={styles.root}>
      <img src={defaultLogo} alt="" className={styles.logo} draggable={false} />
    </div>
  );
}

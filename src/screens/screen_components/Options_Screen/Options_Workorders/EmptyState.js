/* eslint-disable */
import React from "react";
import { SmallLoadingIndicator } from "../../../../dom_components";
import { C, ICONS } from "../../../../styles";

import styles from "./EmptyState.module.css";

export default function EmptyState({ isLoaded, hasSearchTerm }) {
  if (!isLoaded) {
    return (
      <div className={styles.container}>
        <SmallLoadingIndicator message="Loading workorders...." size={40} />
      </div>
    );
  }

  if (hasSearchTerm) {
    return (
      <div className={styles.container}>
        <div className={styles.noResultsContainer}>
          <img src={ICONS.info} className={styles.infoIcon} alt="" />
          <span className={styles.emptyText} style={{ color: C.textMuted }}>No results found</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <span className={styles.emptyText} style={{ color: C.textMuted }}>No workorders</span>
    </div>
  );
}

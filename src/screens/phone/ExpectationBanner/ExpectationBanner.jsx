import { useEffect, useState } from "react";
import { useRoadCallStore, useLoginStore } from "../../../stores";
import { dbClearCallExpectation } from "../../../db_calls_wrapper";
import { formatPhoneWithDashes } from "../../../utils";
import { TouchableOpacity } from "../../../dom_components";
import styles from "./ExpectationBanner.module.css";

function formatRemaining(ms) {
  if (!ms || ms <= 0) return "expired";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function ExpectationBanner() {
  const zCurrentUser = useLoginStore((s) => s.currentUser);
  const zExpectations = useRoadCallStore((s) => s.expectations);

  // Tick once a second so the countdown updates live.
  const [, _setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => _setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const myExpectation = zExpectations.find(
    (e) => e && e.userID === zCurrentUser?.id
  );
  if (!myExpectation) return null;

  const remainingMs = (myExpectation.expiresAt || 0) - Date.now();
  if (remainingMs <= 0) return null;

  const customerLabel =
    myExpectation.customerName ||
    formatPhoneWithDashes(myExpectation.customerPhone || "");

  async function handleCancel() {
    await dbClearCallExpectation(myExpectation.customerPhone);
  }

  return (
    <div className={styles.banner}>
      <div className={styles.content}>
        <span className={styles.dot} />
        <div className={styles.textColumn}>
          <span className={styles.label}>EXPECTING CALLBACK</span>
          <span className={styles.customer}>{customerLabel}</span>
        </div>
        <span className={styles.countdown}>{formatRemaining(remainingMs)}</span>
      </div>
      <TouchableOpacity onPress={handleCancel} className={styles.cancelBtn}>
        <span className={styles.cancelText}>CANCEL</span>
      </TouchableOpacity>
    </div>
  );
}

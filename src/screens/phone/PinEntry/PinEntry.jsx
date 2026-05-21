import { ICONS } from "../../../styles";
import { Image, AlertBox } from "../../../dom_components";
import { StandKeypad } from "../../../shared/StandKeypad";
import { useAlertScreenStore } from "../../../stores";
import styles from "./PinEntry.module.css";

export function PinEntry({ pin, pinError, onKeyPress }) {
  const zShowAlert = useAlertScreenStore((state) => state.showAlert);

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <Image icon={ICONS.gears1} size={24} className={styles.headerIcon} />
        <span className={styles.headerTitle}>WARPSPEED</span>
      </div>
      <AlertBox showAlert={zShowAlert} />
      <div className={styles.body}>
        <span className={styles.prompt}>Enter PIN</span>
        <div className={styles.dotsRow}>
          {pin.split("").map((_, i) => (
            <div key={i} className={styles.dot} />
          ))}
          {pin.length === 0 && (
            <span className={styles.emptyPlaceholder}>-</span>
          )}
        </div>
        {!!pinError && <span className={styles.errorText}>{pinError}</span>}
        <StandKeypad mode="phone" onKeyPress={onKeyPress} />
      </div>
    </div>
  );
}

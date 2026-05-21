/*eslint-disable*/
import { Dashboard_Admin } from "./dashboard_screen/Dashboard_Admin";
import { APP_USER, SETTINGS_OBJ } from "../../../data";
import { useLoginStore, useSettingsStore } from "../../../stores";
import styles from "./Items_Dashboard.module.css";

export function Items_Dashboard({}) {
  let zSettingsObj = SETTINGS_OBJ;
  let zUserObj = APP_USER;
  zSettingsObj = useSettingsStore((state) => state.settings);
  zUserObj = useLoginStore((state) => state.currentUser);

  return (
    <div className={styles.container}>
      <Dashboard_Admin />
    </div>
  );
}

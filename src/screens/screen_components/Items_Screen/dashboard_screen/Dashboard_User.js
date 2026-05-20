/* eslint-disable */
import { useSettingsStore } from "../../../../stores";
import { ExtensionSettingsComponent } from "./ExtensionSettings";
import styles from "./Dashboard_User.module.css";

export function Dashboard_User({}) {
  const zSettingsObj = useSettingsStore((state) => state.settings);

  const handleSettingsFieldChange = (fieldName, value) => {
    useSettingsStore.getState().setField(fieldName, value);
  };

  return (
    <div className={styles.container}>
      <ExtensionSettingsComponent
        zSettingsObj={zSettingsObj}
        handleSettingsFieldChange={handleSettingsFieldChange}
      />
    </div>
  );
}

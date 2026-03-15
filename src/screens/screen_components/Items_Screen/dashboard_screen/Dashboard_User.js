/* eslint-disable */
import { View } from "react-native-web";
import { useSettingsStore } from "../../../../stores";
import { ExtensionSettingsComponent } from "./ExtensionSettings";

export function Dashboard_User({}) {
  const zSettingsObj = useSettingsStore((state) => state.settings);

  const handleSettingsFieldChange = (fieldName, value) => {
    // Update Zustand store immediately for responsive UI
    useSettingsStore.getState().setField(fieldName, value);

    // Note: Actual database save happens when user clicks "Save Settings" button
    // in the ExtensionSettingsComponent to avoid excessive database writes
  };

  return (
    <View style={{ flex: 1 }}>
      <ExtensionSettingsComponent
        zSettingsObj={zSettingsObj}
        handleSettingsFieldChange={handleSettingsFieldChange}
      />
    </View>
  );
}

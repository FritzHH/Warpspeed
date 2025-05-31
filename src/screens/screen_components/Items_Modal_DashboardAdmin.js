/*eslint-disable*/
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
} from "react-native-web";
import { log } from "../../utils";
import { useSettingsStore } from "../../stores";

export function Items_Modal_DashboardAdmin({}) {
  // setters
  const _zSetSettingsObj = useSettingsStore((state) => state.setSettingsObj);

  // getters
  const zSettingsObj = useSettingsStore((state) => state.getSettingsObj());
  return (
    <View style={{ width: "100%", height: "100%" }}>
      <Flatlist />
    </View>
  );
}

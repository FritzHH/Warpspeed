/*eslint-disable*/
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
} from "react-native-web";
import { log } from "../../../utils";
import { Button_, ScreenModal } from "../../../components";
import { Dashboard_Admin } from "./dashboard_screen/Dashboard_Admin";
import { useState } from "react";
import { APP_USER, SETTINGS_OBJ } from "../../../data";
import { useLoginStore, useSettingsStore } from "../../../stores";
// import FaceLogin from "../../../faceDetectionClient";

export function Items_Dashboard({}) {
  // setters

  // getters
  let zSettingsObj = SETTINGS_OBJ;
  let zUserObj = APP_USER;
  zSettingsObj = useSettingsStore((state) => state.settings);
  zUserObj = useLoginStore((state) => state.currentUser);

  //////////////////////////////////////////////////////////////
  const [sShowAdminModal, _setShowAdminModal] = useState(false);

  function ScreenComponent() {
    return <Dashboard_Admin />;
  }

  return (
    <View
      style={{
        flex: 1,
      }}
    >
      {ScreenComponent()}
    </View>
  );
}

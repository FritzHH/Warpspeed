/*eslint-disable*/
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity
} from "react-native-web";
import { log } from "../../../utils";
import { Button_, ScreenModal } from "../../../components";
import { Items_Modal_DashboardAdmin } from "./dashboard_screen/Dashboard_Admin";
import { useState } from "react";
import { APP_USER, SETTINGS_OBJ } from "../../../data";
import { useAppCurrentUserStore, useSettingsStore } from "../../../stores";
// import FaceLogin from "../../../faceDetectionClient";

export function Items_Dashboard({}) {
  // setters

  // getters
  let zSettingsObj = SETTINGS_OBJ;
  let zUserObj = APP_USER;
  zSettingsObj = useSettingsStore((state) => state.getSettingsObj());
  zUserObj = useAppCurrentUserStore((state) => state.getCurrentUserObj());

  //////////////////////////////////////////////////////////////
  const [sShowAdminModal, _setShowAdminModal] = useState(false);

  function go() {}

  return (
    <View style={{ width: "100%", height: "100%", paddingTop: 40 }}>
      {/* <Button_ text={"Face Recog."} onPress={go} /> */}
      {/* <FaceLogin /> */}
    </View>
  );
}

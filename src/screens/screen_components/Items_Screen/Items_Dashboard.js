/*eslint-disable*/
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
} from "react-native-web";
import { log } from "../../../utils";
import { ScreenModal } from "../../../components";
import { Items_Modal_DashboardAdmin } from "../Items_Screen/Items_Modal_DashboardAdmin";
import { useState } from "react";
import { APP_USER, SETTINGS_PROTO } from "../../../data";
import { useAppCurrentUserStore, useSettingsStore } from "../../../stores";

export function Items_Dashboard({}) {
  // setters

  // getters
  let zSettingsObj = SETTINGS_PROTO;
  let zUserObj = APP_USER;
  zSettingsObj = useSettingsStore((state) => state.getSettingsObj());
  zUserObj = useAppCurrentUserStore((state) => state.getCurrentUserObj());

  //////////////////////////////////////////////////////////////
  const [sShowAdminModal, _setShowAdminModal] = useState(false);
  return (
    <View style={{ width: "100%", height: "100%" }}>
      <ScreenModal
        showOuterModal={true}
        handleButtonPress={() => _setShowAdminModal(true)}
        modalVisible={sShowAdminModal}
        Component={Items_Modal_DashboardAdmin}
      />
    </View>
  );
}

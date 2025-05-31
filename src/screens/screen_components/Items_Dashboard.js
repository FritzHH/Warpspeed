/*eslint-disable*/
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
} from "react-native-web";
import { log } from "../../utils";
import { ScreenModal } from "../../components";
import { Items_Modal_DashboardAdmin } from "./Items_Modal_DashboardAdmin";
import { useState } from "react";

export function Items_Dashboard({}) {
  // setters
  // getters
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

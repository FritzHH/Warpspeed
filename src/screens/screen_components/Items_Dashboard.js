import {
  View,
  Text,
  Pressable,
  TextInput,
  FlatList,
  TouchableOpacity,
} from "react-native-web";
import { dim, log, trimToTwoDecimals } from "../../utils";
import {
  HorzSpacer,
  TabMenuButton,
  TabMenuDivider as Divider,
  ModalDropdown,
  TextInputOnMainBackground,
  TextInputLabelOnMainBackground,
} from "../../components";
import { Colors } from "../../styles";
import {
  BIKE_COLORS,
  BRANDS,
  CUSTOMER,
  BIKE_DESCRIPTIONS,
  DISCOUNTS,
  PART_SOURCES,
  WORKORDER,
  WORKORDER_ITEM,
} from "../../data";
import { QuickItemsTab } from "./Options_QuickItemsTab";
import { create } from "lodash";

export function Items_Dashboard({ fun_create_new_workorder }) {
  return (
    <View style={{ width: "100%", height: "100%" }}>
      <TouchableOpacity
        onPress={fun_create_new_workorder}
        style={{
          flexDirection: "row",
          justifyContent: "center",
          alignItems: "center",
          width: 200,
          height: 150,
        }}
      >
        <Text style={{ color: "red", fontSize: 30 }}>New Workorder</Text>
      </TouchableOpacity>
    </View>
  );
}

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
  bike_colors_db,
  bike_brands_db,
  CUSTOMER_PROTO,
  bike_descriptions_db,
  discounts_db,
  part_sources_db,
  WORKORDER_PROTO,
  WORKORDER_ITEM_PROTO,
} from "../../data";
import { create } from "lodash";

export function Items_Dashboard({ fun_create_new_workorder }) {
  return (
    <View style={{ width: "100%", height: "100%" }}>
      <TouchableOpacity
        // onPress={fun_create_new_workorder}
        style={{
          flexDirection: "row",
          justifyContent: "center",
          alignItems: "center",
          width: 200,
          height: 150,
        }}
      >
        <Text style={{ color: "red", fontSize: 30 }}>Button Here</Text>
      </TouchableOpacity>
    </View>
  );
}

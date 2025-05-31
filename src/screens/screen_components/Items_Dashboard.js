import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
} from "react-native-web";
import { log } from "../../utils";

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

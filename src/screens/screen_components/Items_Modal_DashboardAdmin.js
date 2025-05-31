/*eslint-disable*/
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from "react-native-web";
import { log } from "../../utils";
import { useSettingsStore } from "../../stores";
import { Button } from "../../components";
import { cloneDeep, set } from "lodash";
import { dbSetSettings } from "../../db_calls";

export function Items_Modal_DashboardAdmin({}) {
  // setters
  const _zSetSettingsObj = useSettingsStore((state) => state.setSettingsObj);

  // getters
  const zSettingsObj = useSettingsStore((state) => state.getSettingsObj());

  function moveStatus(statusObj, direction) {
    let statusArr = cloneDeep(zSettingsObj.statuses);
    let idx = statusArr.findIndex((status) => status.name === statusObj.name);

    if (direction === "up" && idx != 0) {
      let statusToReplace = statusArr[idx - 1];
      statusArr[idx] = statusToReplace;
      statusArr[idx - 1] = statusObj;
    } else if (direction === "down" && idx != statusArr.length - 1) {
      let statusToReplace = statusArr[idx + 1];
      statusArr[idx] = statusToReplace;
      statusArr[idx + 1] = statusObj;
    }
    let settingsObj = { ...zSettingsObj };
    settingsObj.statuses = statusArr;
    _zSetSettingsObj(settingsObj);
    dbSetSettings(settingsObj);
  }

  return (
    <View style={{ width: "50%", height: "75%", backgroundColor: "white" }}>
      <FlatList
        data={zSettingsObj.statuses}
        keyExtractor={(item) => item.position}
        renderItem={(item) => {
          item = item.item;
          return (
            <TouchableWithoutFeedback onLongPress={() => {}}>
              <View style={{ flexDirection: "row", width: "100%" }}>
                <Text>{item.name}</Text>
                <Button onPress={() => moveStatus(item, "down")} text={"<"} />
                <Button onPress={() => moveStatus(item, "up")} text={">"} />
              </View>
            </TouchableWithoutFeedback>
          );
        }}
      />
    </View>
  );
}

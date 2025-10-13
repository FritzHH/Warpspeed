/* eslint-disable */
import { Text, View } from "react-native-web";
import { Image_ } from "../../../components";
import { ICONS } from "../../../styles";
import { log } from "../../../utils";

// TODO
// need to replace picture with picture from user database
export function EmptyItemsComponent() {
  return (
    <View
      style={{
        width: "100%",
        height: "100%",
        padding: 0,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Image_
        icon={require('../../../resources/bblogo_trans_high.png')}
        style={{ opacity: 0.1, width: "90%", height: "90%" }}
      />
    </View>
  );
}

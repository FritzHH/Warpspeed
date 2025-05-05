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

/// Notes Tab Component
export const Notes_MainComponent = ({ ssWorkorderObj, __setWorkorderObj }) => {
  if (!ssWorkorderObj) {
    //dev
    ssWorkorderObj = {};
    ssWorkorderObj.notes = {};
    ssWorkorderObj.notes.customerNotes = "";
    ssWorkorderObj.notes.internalNotes = "";
  }

  return (
    <View style={{ width: "100%", height: "100%", paddingTop: 20 }}>
      <View
        style={{
          flexDirection: "row",
          width: "100%",
          height: "100%",
        }}
      >
        <View
          style={{
            width: "50%",
            height: "100%",
            backgroundColor: null,
            flexDirection: "column",
            paddingRight: 10,
          }}
        >
          <View>
            <Text style={{ color: "lightgray" }}>Customer Notes</Text>
          </View>
          <TextInput
            multiline={true}
            placeholderTextColor={"darkgray"}
            placeholder="Write as many notes as you can..."
            style={{
              marginTop: 5,
              width: "100%",
              height: "100%",
              outlineWidth: 0,
            }}
            value={ssWorkorderObj.notes.customerNotes}
          />
        </View>
        <View
          style={{
            width: "50%",
            height: "100%",
            backgroundColor: null,
            flexDirection: "column",
            borderLeftWidth: 1,
            borderColor: "lightgray",
            paddingLeft: 10,
          }}
        >
          <View>
            <Text
              style={{
                color: "lightgray",
              }}
            >
              Internal Notes
            </Text>
          </View>
          <TextInput
            multiline={true}
            placeholder="Please be detailed..."
            placeholderTextColor={"darkgray"}
            style={{
              marginTop: 5,
              width: "100%",
              height: "100%",
              outlineWidth: 0,
            }}
            // value={workorderObj.notes.internalNotes}
          />
        </View>
      </View>
    </View>
  );
};

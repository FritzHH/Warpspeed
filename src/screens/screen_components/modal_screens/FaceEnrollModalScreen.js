/*eslint-disable*/

import { Modal, TouchableWithoutFeedback, View } from "react-native-web";
import { useSettingsStore } from "../../../stores";
import { Button_, ScreenModal } from "../../../components";
import { FaceDetectionComponent } from "../../../faceDetectionClient";
import { log } from "../../../utils";
import { COLOR_GRADIENTS } from "../../../styles";

export function FaceEnrollModalScreen({ visible, handleExitPress }) {
  // store setters ///////////////////////////////////////////////////////////
  const _zSetSettingsObj = useSettingsStore((state) => state.setSettingsObj);

  // store getters ///////////////////////////////////////////////////////////
  const zSettingsObj = useSettingsStore((state) => state.getSettingsObj());

  // local state ///////////////////////////////////////////////////////////

  ///////////////////////////////////////////////////////////
  ///////////////////////////////////////////////////////////

  function handleDescriptor(descriptor) {
    // log(descriptor);
    handleExitPress();
  }

  return (
    <TouchableWithoutFeedback onPress={() => null}>
      <Modal visible={visible} transparent>
        <View
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.85)",
            alignItems: "center",
            justifyContent: "center",
            alignSelf: "center",
            justifySelf: "center",
            width: "100%",
            height: "100%",
          }}
        >
          <FaceDetectionComponent __handleEnrollDescriptor={handleDescriptor} />
          <Button_
            text={"Exit"}
            colorGradientArr={COLOR_GRADIENTS.green}
            buttonStyle={{ paddingHorizontal: 20 }}
            onPress={handleExitPress}
          />
        </View>
      </Modal>
    </TouchableWithoutFeedback>
  );
}

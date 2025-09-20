/*eslint-disable*/

import { Modal, TouchableWithoutFeedback, View } from "react-native-web";
import { useLoginStore, useSettingsStore } from "../../../storesOld";
import { Button_, ScreenModal } from "../../../components";
import { FaceDetectionClientComponent } from "../../../faceDetectionClient";
import { log } from "../../../utils";
import { COLOR_GRADIENTS } from "../../../styles";
import { useEffect } from "react";

export function FaceEnrollModalScreen({
  handleExitPress,
  handleDescriptorCapture,
  userObj,
}) {
  // store setters ///////////////////////////////////////////////////////////
  const _zSetSettingsObj = useSettingsStore((state) => state.setSettingsObj);
  const _zSetRunBackgroundFacialRecognition = useLoginStore(
    (state) => state.setRunBackgroundRecognition
  );

  // store getters ///////////////////////////////////////////////////////////
  const zSettingsObj = useSettingsStore((state) => state.getSettingsObj());

  // local state ///////////////////////////////////////////////////////////
  useEffect(() => {
    _zSetRunBackgroundFacialRecognition(false);
    return () => _zSetRunBackgroundFacialRecognition(true);
  }, []);

  ///////////////////////////////////////////////////////////
  ///////////////////////////////////////////////////////////

  function handleDescriptor(descriptor) {
    // log(descriptor);
    handleDescriptorCapture(userObj, descriptor);
    handleExitPress();
  }

  return (
    <TouchableWithoutFeedback onPress={() => null}>
      <Modal visible={userObj} transparent>
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
          <FaceDetectionClientComponent
            __handleEnrollDescriptor={handleDescriptor}
          />
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

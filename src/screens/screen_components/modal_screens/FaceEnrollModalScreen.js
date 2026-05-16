/*eslint-disable*/

import { View } from "react-native-web";
import { useLoginStore } from "../../../stores";
import { Button_, Dialog_ } from "../../../components";
import { FaceDetectionClientComponent } from "../../../faceDetection";
import { log } from "../../../utils";
import { COLOR_GRADIENTS } from "../../../styles";
import { useEffect } from "react";

export function FaceEnrollModalScreen({
  handleExitPress,
  handleDescriptorCapture,
  userObj,
}) {
  // store setters ///////////////////////////////////////////////////////////
  const _zSetRunBackgroundFacialRecognition = useLoginStore(
    (state) => state.setRunBackgroundRecognition
  );

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
    <Dialog_ visible={!!userObj} onClose={handleExitPress} overlayColor="rgba(0, 0, 0, 0.85)" preventClose>
      <View
        style={{
          alignItems: "center",
          justifyContent: "center",
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
    </Dialog_>
  );
}

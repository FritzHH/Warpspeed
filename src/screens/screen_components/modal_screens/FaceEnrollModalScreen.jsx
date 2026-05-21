/*eslint-disable*/

import { useLoginStore } from "../../../stores";
import { Button, Dialog } from "../../../dom_components";
import { log } from "../../../utils";
import { COLOR_GRADIENTS, C } from "../../../styles";
import { useEffect, Suspense, lazy } from "react";

const FaceDetectionClientComponent = lazy(() =>
  import("../../../faceDetection").then((m) => ({
    default: m.FaceDetectionClientComponent,
  }))
);

export function FaceEnrollModalScreen({
  handleExitPress,
  handleDescriptorCapture,
  userObj,
}) {
  const _zSetRunBackgroundFacialRecognition = useLoginStore(
    (state) => state.setRunBackgroundRecognition
  );

  useEffect(() => {
    _zSetRunBackgroundFacialRecognition(false);
    return () => _zSetRunBackgroundFacialRecognition(true);
  }, []);

  function handleDescriptor(descriptor) {
    handleDescriptorCapture(userObj, descriptor);
    handleExitPress();
  }

  return (
    <Dialog visible={!!userObj} onClose={handleExitPress} overlayColor={C.surfaceOverlayHeavy} preventClose>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Suspense fallback={null}>
          <FaceDetectionClientComponent
            __handleEnrollDescriptor={handleDescriptor}
          />
        </Suspense>
        <Button
          text={"Exit"}
          colorGradientArr={COLOR_GRADIENTS.green}
          buttonStyle={{ paddingLeft: 20, paddingRight: 20 }}
          onPress={handleExitPress}
        />
      </div>
    </Dialog>
  );
}

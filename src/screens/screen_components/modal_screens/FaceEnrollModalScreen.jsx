/*eslint-disable*/

import { useLoginStore } from "../../../stores";
import { Button, Dialog, LargeModalHeader, LargeModalHeaderButton } from "../../../dom_components";
import { log } from "../../../utils";
import { COLOR_GRADIENTS, C, Radius } from "../../../styles";
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
          overflow: "hidden",
          backgroundColor: C.surfaceBase,
          borderRadius: Radius.container,
        }}
      >
        <LargeModalHeader
          title="Face Enrollment"
          actions={
            <LargeModalHeaderButton variant="default" onClick={handleExitPress}>
              CLOSE
            </LargeModalHeaderButton>
          }
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <Suspense fallback={null}>
            <FaceDetectionClientComponent
              __handleEnrollDescriptor={handleDescriptor}
            />
          </Suspense>
        </div>
      </div>
    </Dialog>
  );
}

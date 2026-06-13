import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useOpenWorkordersStore, useSettingsStore } from "../../stores";
import { ROUTES } from "../../routes";
import { PhotoCapture } from "./PhotoCapture/PhotoCapture";
import { uploadWorkorderMedia } from "./MediaSection/mediaUpload";

export function PhotoCaptureScreen() {
  const { woID } = useParams();
  const navigate = useNavigate();
  const workorder = useOpenWorkordersStore(
    (state) => state.workorders.find((w) => w.id === woID) || null
  );
  const zSettings = useSettingsStore((state) => state.settings);

  if (!workorder) {
    return <Navigate to={ROUTES.phone} replace />;
  }

  function handleComplete(file) {
    uploadWorkorderMedia(workorder.id, [file], zSettings);
    navigate(-1);
  }

  return (
    <PhotoCapture
      onComplete={handleComplete}
      onCancel={() => navigate(-1)}
    />
  );
}

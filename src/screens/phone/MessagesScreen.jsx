import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useOpenWorkordersStore } from "../../stores";
import { ROUTES } from "../../routes";
import { MobileMessagesScreen } from "../mobile/MobileMessagesScreen";

export function MessagesScreen() {
  const { woID } = useParams();
  const navigate = useNavigate();
  const workorder = useOpenWorkordersStore(
    (state) => state.workorders.find((w) => w.id === woID) || null
  );

  if (!workorder) {
    return <Navigate to={ROUTES.phone} replace />;
  }

  return (
    <MobileMessagesScreen
      workorderID={woID}
      onBack={() => navigate(-1)}
      backLabel="Workorder"
    />
  );
}

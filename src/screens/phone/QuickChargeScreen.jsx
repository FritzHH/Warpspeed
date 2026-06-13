import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useOpenWorkordersStore } from "../../stores";
import { ROUTES } from "../../routes";
import { QuickChargePanel } from "./QuickChargePanel/QuickChargePanel";

export function QuickChargeScreen() {
  const { woID } = useParams();
  const navigate = useNavigate();
  const workorder = useOpenWorkordersStore(
    (state) => state.workorders.find((w) => w.id === woID) || null
  );

  if (!workorder) {
    return <Navigate to={ROUTES.phone} replace />;
  }

  return (
    <QuickChargePanel
      workorder={workorder}
      onSuccess={() => navigate(ROUTES.phone, { replace: true })}
      onCancel={() => navigate(-1)}
    />
  );
}

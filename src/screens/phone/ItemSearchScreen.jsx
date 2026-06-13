import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useOpenWorkordersStore } from "../../stores";
import { ROUTES } from "../../routes";
import { ItemSearchModal } from "./ItemSearchModal/ItemSearchModal";

export function ItemSearchScreen() {
  const { woID } = useParams();
  const navigate = useNavigate();
  const workorder = useOpenWorkordersStore(
    (state) => state.workorders.find((w) => w.id === woID) || null
  );

  if (!workorder) {
    return <Navigate to={ROUTES.phone} replace />;
  }

  function handleAddItems(lineItems) {
    const next = [...(workorder.workorderLines || []), ...lineItems];
    useOpenWorkordersStore.getState().setField("workorderLines", next, workorder.id);
    navigate(-1);
  }

  return (
    <ItemSearchModal
      onClose={() => navigate(-1)}
      onAddItems={handleAddItems}
    />
  );
}

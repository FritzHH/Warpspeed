import {
  useOpenWorkordersStore,
  useTabNamesStore,
  useCurrentCustomerStore,
  useWorkorderPreviewStore,
} from "../stores";
import { dbGetCustomer } from "../db_calls_wrapper";
import { TAB_NAMES } from "../data";

/**
 * Mimic the same flow that Options_Workorders row click triggers.
 * Given just a workorderID, find the open workorder and route the UI to it.
 * Returns the workorder object if found, else null.
 */
export function selectOpenWorkorderByID(workorderID) {
  if (!workorderID) return null;
  let store = useOpenWorkordersStore.getState();
  let wo = (store.workorders || []).find((w) => w.id === workorderID);
  if (!wo) return null;

  if (wo.status === "finished_and_paid") {
    return wo;
  }

  store.setWorkorderPreviewID(null);
  let lockedID = store.lockedWorkorderID;
  if (lockedID && lockedID !== wo.id) {
    store.setLockedWorkorderID(null);
    store.removeWorkorder(lockedID, false);
  }
  store.setOpenWorkorderID(wo.id);

  useTabNamesStore.getState().setItems({
    infoTabName: TAB_NAMES.infoTab.workorder,
    itemsTabName: TAB_NAMES.itemsTab.workorderItems,
  });
  useTabNamesStore.getState().setMessagesHubMode(false);
  if (wo.hasNewSMS) {
    useTabNamesStore.getState().setOptionsTabName(TAB_NAMES.optionsTab.messages);
  }

  useWorkorderPreviewStore.getState().setPreviewObj(null);

  if (wo.customerID) {
    dbGetCustomer(wo.customerID).then((customer) => {
      if (customer) useCurrentCustomerStore.getState().setCustomer(customer, false);
    });
  }

  return wo;
}

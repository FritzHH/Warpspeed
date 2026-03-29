/*eslint-disable*/
import {
  useOpenWorkordersStore,
  useTabNamesStore,
  useWorkorderPreviewStore,
  useCurrentCustomerStore,
  useCheckoutStore,
  useAlertScreenStore,
  useTicketSearchStore,
} from "../stores";
import { TAB_NAMES } from "../data";
import { log } from "../utils";
import {
  dbGetCompletedWorkorder,
  dbGetCompletedSale,
  dbGetCustomer,
  dbSearchCompletedWorkorders,
  dbSearchWorkordersByIdPrefix,
  dbSearchSalesByIdPrefix,
} from "../db_calls_wrapper";
import { newCheckoutGetActiveSale } from "../screens/screen_components/modal_screens/newCheckoutModalScreen/newCheckoutFirebaseCalls";

export function showTicketAlert(message) {
  useAlertScreenStore.getState().setValues({
    title: "Ticket Search",
    message,
    btn1Text: "OK",
    handleBtn1Press: () => {},
    showAlert: true,
    canExitOnOuterClick: true,
  });
}

function openWorkorder(wo, isCompleted) {
  const store = useOpenWorkordersStore.getState();
  store.setWorkorderPreviewID(null);
  if (isCompleted) {
    store.setWorkorder(wo, false);
    store.setLockedWorkorderID(wo.id);
    store.setOpenWorkorderID(wo.id);
  } else {
    if (wo.paymentComplete) {
      store.setLockedWorkorderID(wo.id);
    } else {
      store.setLockedWorkorderID(null);
    }
    store.setOpenWorkorderID(wo.id);
  }
  useTabNamesStore.getState().setItems({
    infoTabName: TAB_NAMES.infoTab.workorder,
    itemsTabName: TAB_NAMES.itemsTab.workorderItems,
    optionsTabName: TAB_NAMES.optionsTab.inventory,
  });
  useWorkorderPreviewStore.getState().setPreviewObj(null);
  if (wo.customerID) {
    dbGetCustomer(wo.customerID).then((customer) => {
      if (customer) useCurrentCustomerStore.getState().setCustomer(customer, false);
    });
  }
}

function openSale(sale, isCompleted) {
  if (isCompleted) {
    useCheckoutStore.getState().setStringOnly(sale.id);
  } else {
    useCheckoutStore.getState().setViewOnlySale(sale);
    useCheckoutStore.getState().setIsCheckingOut(true);
  }
}

export async function executeTicketSearch(searchText, onComplete, options) {
  let trimmed = (searchText || "").trim();
  if (!trimmed) return;
  const onWorkorderFound = options?.onWorkorderFound;

  try {
    const store = useOpenWorkordersStore.getState();
    const openWOs = store.getWorkorders();
    const isFullBarcode = /^\d{12}$/.test(trimmed);
    const isWoNumber = /^\d{5}$/.test(trimmed);
    const isFirst4 = /^\d{4}$/.test(trimmed);

    // Full 12-digit barcode — auto search
    if (isFullBarcode) {
      const prefix = trimmed[0];
      if (prefix === "1") {
        let found = openWOs.find((w) => w.id === trimmed);
        if (found) { if (onWorkorderFound) onWorkorderFound(found); else openWorkorder(found, false); if (onComplete) onComplete(); return; }
        let completed = await dbGetCompletedWorkorder(trimmed);
        if (completed) { if (onWorkorderFound) onWorkorderFound(completed); else openWorkorder(completed, true); if (onComplete) onComplete(); return; }
        showTicketAlert("Workorder not found");
      } else if (prefix === "3") {
        let sale = await newCheckoutGetActiveSale(trimmed);
        if (sale) { openSale(sale, false); if (onComplete) onComplete(); return; }
        sale = await dbGetCompletedSale(trimmed);
        if (sale) { openSale(sale, true); if (onComplete) onComplete(); return; }
        showTicketAlert("Sale not found");
      } else if (prefix === "2") {
        let found = openWOs.find((w) => w.id === trimmed);
        if (found) { if (onWorkorderFound) onWorkorderFound(found); else openWorkorder(found, false); if (onComplete) onComplete(); return; }
        let completedWo = await dbGetCompletedWorkorder(trimmed);
        if (completedWo) { if (onWorkorderFound) onWorkorderFound(completedWo); else openWorkorder(completedWo, true); if (onComplete) onComplete(); return; }
        let sale = await newCheckoutGetActiveSale(trimmed);
        if (sale) { openSale(sale, false); if (onComplete) onComplete(); return; }
        sale = await dbGetCompletedSale(trimmed);
        if (sale) { openSale(sale, true); if (onComplete) onComplete(); return; }
        showTicketAlert("Ticket not found");
      } else {
        showTicketAlert("Unrecognized barcode prefix");
      }
      return;
    }

    // 5-digit workorder number
    if (isWoNumber) {
      let found = openWOs.find((w) => w.workorderNumber === trimmed);
      if (found) { if (onWorkorderFound) onWorkorderFound(found); else openWorkorder(found, false); if (onComplete) onComplete(); return; }
      let results = await dbSearchCompletedWorkorders("workorderNumber", trimmed);
      if (results.length > 0) { if (onWorkorderFound) onWorkorderFound(results[0]); else openWorkorder(results[0], true); if (onComplete) onComplete(); return; }
      showTicketAlert("Workorder not found");
      return;
    }

    // 4-digit prefix search
    if (isFirst4) {
      const prefix = trimmed[0];
      useTicketSearchStore.getState().setIsSearching(true);
      useTicketSearchStore.getState().setResults([]);
      useTabNamesStore.getState().setItemsTabName(TAB_NAMES.itemsTab.ticketSearchResults);

      if (prefix === "1") {
        let results = await dbSearchWorkordersByIdPrefix(trimmed);
        useTicketSearchStore.getState().setResults(results);
      } else if (prefix === "3") {
        let results = await dbSearchSalesByIdPrefix(trimmed);
        useTicketSearchStore.getState().setResults(results);
      } else if (prefix === "2") {
        let [woResults, saleResults] = await Promise.all([
          dbSearchWorkordersByIdPrefix(trimmed),
          dbSearchSalesByIdPrefix(trimmed),
        ]);
        useTicketSearchStore.getState().setResults([...woResults, ...saleResults]);
      } else {
        showTicketAlert("First digit must be 1 (workorder), 2 (legacy), or 3 (sale)");
      }
      useTicketSearchStore.getState().setIsSearching(false);
      if (onComplete) onComplete();
      return;
    }

    showTicketAlert("Enter a 12-digit barcode, 5-digit WO #, or first 4 digits");
  } catch (err) {
    log("Ticket search error:", err);
    showTicketAlert("Search error — please try again");
  }
}

/*eslint-disable*/
import {
  useOpenWorkordersStore,
  useTabNamesStore,
  useWorkorderPreviewStore,
  useCurrentCustomerStore,
  useCheckoutStore,
  useTicketSearchStore,
} from "../stores";
import { TAB_NAMES } from "../data";
import { log } from "../utils";
import {
  dbGetCompletedWorkorder,
  dbGetCompletedSale,
  dbGetCustomer,
  dbSearchCompletedWorkorders,
  dbSearchCompletedWorkordersByNumber,
  dbSearchWorkordersByIdPrefix,
  dbSearchSalesByIdPrefix,
  dbSearchTransactionsByIdPrefix,
  dbCrossStoreSearchByID,
} from "../db_calls_wrapper";
import { readActiveSale, readTransaction, readTransactions } from "../screens/screen_components/modal_screens/newCheckoutModalScreen/newCheckoutFirebaseCalls";

function showSearching() {
  useTicketSearchStore.getState().setResults([]);
  useTicketSearchStore.getState().setIsSearching(true);
  useTabNamesStore.getState().setItemsTabName(TAB_NAMES.itemsTab.ticketSearchResults);
}

function showEmptyResults() {
  useTicketSearchStore.getState().setResults([]);
  useTicketSearchStore.getState().setIsSearching(false);
  useTabNamesStore.getState().setItemsTabName(TAB_NAMES.itemsTab.ticketSearchResults);
}

function doneSearching() {
  useTicketSearchStore.getState().setIsSearching(false);
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

async function openSaleWithHydration(sale, isCompleted, onSaleFound) {
  if (onSaleFound) {
    let txns = [];
    if (sale.transactionIDs?.length > 0) {
      txns = await readTransactions(sale.transactionIDs);
    }
    onSaleFound({ ...sale, _transactions: txns });
  } else {
    openSale(sale, isCompleted);
  }
}

// ── Live auto-search (fires as user types) ──────────────────────
// mode "woNumber": searches open + completed workorders by workorderNumber prefix
// mode "salesTransactions": searches active-sales + completed-sales + transactions by ID prefix
export async function executeLiveSearch(trimmed, mode, options) {
  if (!trimmed) return;
  showSearching();
  try {
    let results = [];
    if (mode === "woNumber") {
      const woPrefix = "WO" + trimmed;
      const openWOs = useOpenWorkordersStore.getState().getWorkorders() || [];
      const localMatches = openWOs
        .filter((w) => w.workorderNumber && w.workorderNumber.startsWith(woPrefix))
        .map((w) => ({ type: "workorder", data: w, isCompleted: false }));
      const completedMatches = (await dbSearchCompletedWorkordersByNumber(trimmed))
        .map((w) => ({ type: "workorder", data: w, isCompleted: true }));
      results = [...localMatches, ...completedMatches];
    } else if (mode === "salesTransactions") {
      const prefix = trimmed[0];
      if (prefix === "1") {
        results = await dbSearchWorkordersByIdPrefix(trimmed);
      } else if (prefix === "3") {
        results = await dbSearchTransactionsByIdPrefix(trimmed);
      } else if (prefix === "4") {
        results = await dbSearchSalesByIdPrefix(trimmed);
      } else {
        let [woResults, saleResults, txnResults] = await Promise.all([
          dbSearchWorkordersByIdPrefix(trimmed),
          dbSearchSalesByIdPrefix(trimmed),
          dbSearchTransactionsByIdPrefix(trimmed),
        ]);
        results = [...woResults, ...saleResults, ...txnResults];
      }
    }

    // Single result — auto-open the appropriate modal
    if (results.length === 1 && options?.onSingleResult) {
      let item = results[0];
      if (item.type === "workorder") {
        if (item.isCompleted) {
          options.onCompletedWorkorderFound?.(item.data);
        } else {
          openWorkorder(item.data, false);
        }
      } else if (item.type === "sale") {
        await openSaleWithHydration(item.data, item.isCompleted, options.onSaleFound);
      } else if (item.type === "transaction") {
        options.onTransactionFound?.(item.data);
      }
      options.onSingleResult();
      doneSearching();
      return;
    }

    useTicketSearchStore.getState().setResults(results);
  } catch (err) {
    log("Live search error:", err);
    useTicketSearchStore.getState().setResults([]);
  } finally {
    doneSearching();
  }
}

export async function executeTicketSearch(searchText, onComplete, options) {
  let trimmed = (searchText || "").trim();
  if (!trimmed) return;
  const onWorkorderFound = options?.onWorkorderFound;
  const onCompletedWorkorderFound = options?.onCompletedWorkorderFound;
  const onTransactionFound = options?.onTransactionFound;
  const onSaleFound = options?.onSaleFound;

  showSearching();

  try {
    const store = useOpenWorkordersStore.getState();
    const openWOs = store.getWorkorders();
    const isFullBarcode = /^\d{12,13}$/.test(trimmed);
    const isWoNumber = /^\d{5}$/.test(trimmed);
    const isFirst4 = /^\d{4}$/.test(trimmed);

    // ── Full barcode (12 or 13 digits) ──
    if (isFullBarcode) {
      const is13 = trimmed.length === 13;
      const prefix = trimmed[0];

      // ── 13-digit: prefix-routed search ──
      if (is13) {
        if (prefix === "1") {
          // Workorder
          let found = openWOs.find((w) => w.id === trimmed);
          if (found) { if (onWorkorderFound) onWorkorderFound(found); else openWorkorder(found, false); if (onComplete) onComplete(); return; }
          let completedWo = await dbGetCompletedWorkorder(trimmed);
          if (completedWo) { if (onCompletedWorkorderFound) onCompletedWorkorderFound(completedWo); else if (onWorkorderFound) onWorkorderFound(completedWo); else openWorkorder(completedWo, true); if (onComplete) onComplete(); return; }
          let cross = await dbCrossStoreSearchByID(trimmed);
          if (cross?.type === "workorder") {
            if (cross.isCompleted && onCompletedWorkorderFound) onCompletedWorkorderFound(cross.data);
            else if (onWorkorderFound) onWorkorderFound(cross.data);
            else openWorkorder(cross.data, cross.isCompleted);
            if (onComplete) onComplete(); return;
          }
          showEmptyResults(); return;
        }
        if (prefix === "3") {
          // Transaction
          let txn = await readTransaction(trimmed);
          if (txn) { if (onTransactionFound) onTransactionFound(txn); if (onComplete) onComplete(); return; }
          showEmptyResults(); return;
        }
        if (prefix === "4") {
          // Sale
          let activeSale = await readActiveSale(trimmed);
          if (activeSale) { await openSaleWithHydration(activeSale, false, onSaleFound); if (onComplete) onComplete(); return; }
          let completedSale = await dbGetCompletedSale(trimmed);
          if (completedSale) { await openSaleWithHydration(completedSale, true, onSaleFound); if (onComplete) onComplete(); return; }
          let cross = await dbCrossStoreSearchByID(trimmed);
          if (cross?.type === "sale") {
            await openSaleWithHydration(cross.data, cross.isCompleted, onSaleFound);
            if (onComplete) onComplete(); return;
          }
          showEmptyResults(); return;
        }
      }

      // ── 12-digit or unrecognized 13-digit prefix: sequential search (old IDs) ──
      let found = openWOs.find((w) => w.id === trimmed);
      if (found) { if (onWorkorderFound) onWorkorderFound(found); else openWorkorder(found, false); if (onComplete) onComplete(); return; }
      let completedWo = await dbGetCompletedWorkorder(trimmed);
      if (completedWo) { if (onCompletedWorkorderFound) onCompletedWorkorderFound(completedWo); else if (onWorkorderFound) onWorkorderFound(completedWo); else openWorkorder(completedWo, true); if (onComplete) onComplete(); return; }
      let activeSale = await readActiveSale(trimmed);
      if (activeSale) { await openSaleWithHydration(activeSale, false, onSaleFound); if (onComplete) onComplete(); return; }
      let completedSale = await dbGetCompletedSale(trimmed);
      if (completedSale) { await openSaleWithHydration(completedSale, true, onSaleFound); if (onComplete) onComplete(); return; }
      let txn = await readTransaction(trimmed);
      if (txn) { if (onTransactionFound) onTransactionFound(txn); if (onComplete) onComplete(); return; }
      let crossResult = await dbCrossStoreSearchByID(trimmed);
      if (crossResult) {
        if (crossResult.type === "workorder") {
          if (crossResult.isCompleted && onCompletedWorkorderFound) onCompletedWorkorderFound(crossResult.data);
          else if (onWorkorderFound) onWorkorderFound(crossResult.data);
          else openWorkorder(crossResult.data, crossResult.isCompleted);
        } else {
          await openSaleWithHydration(crossResult.data, crossResult.isCompleted, onSaleFound);
        }
        if (onComplete) onComplete();
        return;
      }
      showEmptyResults(); return;
    }

    // ── 5-digit workorder number ──
    if (isWoNumber) {
      let found = openWOs.find((w) => w.workorderNumber === trimmed);
      if (found) { if (onWorkorderFound) onWorkorderFound(found); else openWorkorder(found, false); if (onComplete) onComplete(); return; }
      let results = await dbSearchCompletedWorkorders("workorderNumber", trimmed);
      if (results.length > 0) { if (onCompletedWorkorderFound) onCompletedWorkorderFound(results[0]); else if (onWorkorderFound) onWorkorderFound(results[0]); else openWorkorder(results[0], true); if (onComplete) onComplete(); return; }
      showEmptyResults(); return;
    }

    // ── 4-digit prefix search — route by first digit ──
    if (isFirst4) {
      const prefix = trimmed[0];
      let results = [];

      if (prefix === "1") {
        results = await dbSearchWorkordersByIdPrefix(trimmed);
      } else if (prefix === "3") {
        results = await dbSearchTransactionsByIdPrefix(trimmed);
      } else if (prefix === "4") {
        results = await dbSearchSalesByIdPrefix(trimmed);
      } else {
        let [woResults, saleResults, txnResults] = await Promise.all([
          dbSearchWorkordersByIdPrefix(trimmed),
          dbSearchSalesByIdPrefix(trimmed),
          dbSearchTransactionsByIdPrefix(trimmed),
        ]);
        results = [...woResults, ...saleResults, ...txnResults];
      }

      useTicketSearchStore.getState().setResults(results);
      doneSearching();
      if (onComplete) onComplete();
      return;
    }

    // ── Anything else — show empty results ──
    showEmptyResults();
  } catch (err) {
    log("Ticket search error:", err);
    showEmptyResults();
  } finally {
    doneSearching();
  }
}

/* eslint-disable */
import { useState, useRef, lazy, Suspense } from "react";
import { SmallLoadingIndicator, Button } from "../dom_components";
import { C, ICONS } from "../styles";
import { executeTicketSearch, executeLiveSearch } from "./ticketSearch";
const ClosedWorkorderModal = lazy(() =>
  import("../screens/screen_components/modal_screens/ClosedWorkorderModal").then((m) => ({ default: m.ClosedWorkorderModal }))
);
const TransactionModal = lazy(() =>
  import("../screens/screen_components/modal_screens/TransactionModal").then((m) => ({ default: m.TransactionModal }))
);
const FullSaleModal = lazy(() =>
  import("../dom_components/FullSaleModal/FullSaleModal").then((m) => ({ default: m.FullSaleModal }))
);
const NewRefundModalScreen = lazy(() =>
  import("../screens/screen_components/modal_screens/newCheckoutModalScreen/NewRefundModalScreen").then((m) => ({ default: m.NewRefundModalScreen }))
);
import { findSaleByTransactionID } from "../screens/screen_components/modal_screens/newCheckoutModalScreen/newCheckoutFirebaseCalls";
import { useAlertScreenStore, useTicketSearchStore, useTabNamesStore } from "../stores";
import { TAB_NAMES } from "../data";
import styles from "./TicketSearchInput.module.css";

export function TicketSearchInput({}) {
  const [sTicketSearch, _setTicketSearch] = useState("");
  const [sTicketSearching, _setTicketSearching] = useState(false);
  const [sClosedWorkorder, _sSetClosedWorkorder] = useState(null);
  const [sTransaction, _sSetTransaction] = useState(null);
  const [sSale, _sSetSale] = useState(null);
  const [sRefundSaleID, _sSetRefundSaleID] = useState(null);
  const [sRefundInitialPayment, _sSetRefundInitialPayment] = useState(null);
  const debounceRef = useRef(null);

  function clearResults() {
    useTicketSearchStore.getState().reset();
    if (useTabNamesStore.getState().itemsTabName === TAB_NAMES.itemsTab.ticketSearchResults) {
      useTabNamesStore.getState().setItemsTabName(TAB_NAMES.itemsTab.empty);
    }
  }

  function clearSearch() {
    _setTicketSearch("");
    clearResults();
  }

  const searchCallbacks = {
    onCompletedWorkorderFound: (wo) => { clearResults(); _sSetClosedWorkorder(wo); },
    onTransactionFound: (txn) => { clearResults(); _sSetTransaction(txn); },
    onSaleFound: (sale) => { clearResults(); _sSetSale(sale); },
  };

  async function handleTransactionRefund(txn) {
    let sale = await findSaleByTransactionID(txn.id);
    if (!sale) {
      useAlertScreenStore.getState().setAlert({
        title: "Sale Not Found",
        message: "Could not find the sale associated with this transaction.",
      });
      return;
    }
    _sSetTransaction(null);
    _sSetRefundInitialPayment(txn);
    _sSetRefundSaleID(sale.id);
  }

  function stripWoPrefix(val) {
    return val.replace(/^WO-/i, "").trim();
  }

  async function handleExecuteTicketSearch() {
    _setTicketSearching(true);
    try {
      await executeTicketSearch(stripWoPrefix(sTicketSearch), () => _setTicketSearch(""), searchCallbacks);
    } finally {
      _setTicketSearching(false);
    }
  }

  function handleInputChange(e) {
    const val = e.target.value;
    let upper = val.toUpperCase();
    // Backspace on "WO-" or partial → clear completely
    if (sTicketSearch === "WO-" && val.length < 3) { _setTicketSearch(""); return; }
    if (upper === "W" && val.length === 1) { _setTicketSearch("WO-"); return; }
    if (upper === "WO" && val.length === 2) { _setTicketSearch("WO-"); return; }

    // Only allow letters and numbers (no special characters)
    if (/[^a-zA-Z0-9\-]/.test(val)) return;
    let hasWoPrefix = /^WO-/i.test(val);
    let trimmed = stripWoPrefix(val).trim();
    // Cap actual input at 13 characters (excluding WO- prefix)
    if (trimmed.length > 13) { return; }
    _setTicketSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!/^\d+$/.test(trimmed)) return;
    let clearOnMatch = () => _setTicketSearch("");
    // 13 digits (new prefixed EAN-13) — fire immediately via exact search
    if (trimmed.length === 13) {
      executeTicketSearch(trimmed, clearOnMatch, searchCallbacks);
      return;
    }
    // All other searches debounce 300ms so barcode scanners finish before any search fires
    debounceRef.current = setTimeout(() => {
      // 12 digits (old barcodes) — exact search
      if (trimmed.length === 12) {
        executeTicketSearch(trimmed, clearOnMatch, searchCallbacks);
        return;
      }
      // WO mode: auto-search workorderNumber after 1+ digits typed
      if (hasWoPrefix && trimmed.length >= 1) {
        executeLiveSearch(trimmed, "woNumber", {
          onSingleResult: clearOnMatch,
          ...searchCallbacks,
        });
        return;
      }
      // Non-WO mode: auto-search sales + transactions after 4 digits typed
      if (!hasWoPrefix && trimmed.length >= 4) {
        executeLiveSearch(trimmed, "salesTransactions", {
          onSingleResult: clearOnMatch,
          ...searchCallbacks,
        });
      }
    }, 300);
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleExecuteTicketSearch();
    }
  }

  return (
    <div className={styles.container} onClick={(e) => e.stopPropagation()}>
      <div className={styles.row}>
        <input
          type="text"
          className={styles.input}
          value={sTicketSearch}
          placeholder="Scan ticket or enter WO number"
          maxLength={16}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          style={{
            caretColor: C.cursorRed,
            color: C.text,
            borderColor: C.borderSubtle,
            backgroundColor: C.listItemWhite,
          }}
        />
        <Button
          icon={ICONS.reset1}
          iconSize={20}
          onPress={clearSearch}
          enabled={!!sTicketSearch}
        />
        {sTicketSearching && (
          <div className={styles.loaderWrap}>
            <SmallLoadingIndicator />
          </div>
        )}
      </div>
      {!!sClosedWorkorder && (
        <Suspense fallback={<SmallLoadingIndicator />}>
          <ClosedWorkorderModal
            workorder={sClosedWorkorder}
            onClose={() => _sSetClosedWorkorder(null)}
          />
        </Suspense>
      )}
      {!!sTransaction && (
        <Suspense fallback={<SmallLoadingIndicator />}>
          <TransactionModal
            transaction={sTransaction}
            onClose={() => _sSetTransaction(null)}
            onRefund={handleTransactionRefund}
          />
        </Suspense>
      )}
      {!!sSale && (
        <Suspense fallback={<SmallLoadingIndicator />}>
          <FullSaleModal
            item={{ saleID: sSale.id }}
            onClose={() => _sSetSale(null)}
            onRefund={(saleID) => {
              _sSetSale(null);
              _sSetRefundSaleID(saleID);
            }}
          />
        </Suspense>
      )}
      {!!sRefundSaleID && (
        <Suspense fallback={<SmallLoadingIndicator />}>
          <NewRefundModalScreen
            visible={true}
            saleID={sRefundSaleID}
            initialPayment={sRefundInitialPayment}
            onClose={() => { _sSetRefundSaleID(null); _sSetRefundInitialPayment(null); }}
          />
        </Suspense>
      )}
    </div>
  );
}

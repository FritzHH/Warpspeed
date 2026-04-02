/* eslint-disable */
import { View, TextInput } from "react-native-web";
import { useState, useRef } from "react";
import { gray } from "../utils";
import { SmallLoadingIndicator } from "../components";
import { C } from "../styles";
import { executeTicketSearch, executeLiveSearch } from "./ticketSearch";
import { ClosedWorkorderModal } from "../screens/screen_components/modal_screens/ClosedWorkorderModal";
import { TransactionModal } from "../screens/screen_components/modal_screens/TransactionModal";
import { SaleModal } from "../screens/screen_components/modal_screens/SaleModal";

export function TicketSearchInput({}) {
  const [sTicketSearch, _setTicketSearch] = useState("");
  const [sTicketSearching, _setTicketSearching] = useState(false);
  const [sClosedWorkorder, _sSetClosedWorkorder] = useState(null);
  const [sTransaction, _sSetTransaction] = useState(null);
  const [sSale, _sSetSale] = useState(null);
  const debounceRef = useRef(null);

  const searchCallbacks = {
    onCompletedWorkorderFound: (wo) => _sSetClosedWorkorder(wo),
    onTransactionFound: (txn) => _sSetTransaction(txn),
    onSaleFound: (sale) => _sSetSale(sale),
  };

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

  return (
    <View onClick={(e) => e.stopPropagation()} style={{ width: "100%" }}>
      <View
        style={{
          width: "100%",
          paddingTop: 10,
          paddingHorizontal: 20,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <TextInput
          value={sTicketSearch}
          placeholder={"Scan ticket or enter WO number"}
          placeholderTextColor={gray(0.35)}
          maxLength={16}
          onChangeText={(val) => {
            // Auto-format "wo" → "WO-"
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
            // 12 digits (old barcodes) — debounce 120ms so scanner can finish 13th char
            if (trimmed.length === 12) {
              debounceRef.current = setTimeout(() => {
                executeTicketSearch(trimmed, clearOnMatch, searchCallbacks);
              }, 120);
              return;
            }
            // WO mode: auto-search workorderNumber after 1+ digits typed (4th total char = WO- + 1 digit)
            // Searches open-workorders + completed-workorders only
            if (hasWoPrefix && trimmed.length >= 1) {
              executeLiveSearch(trimmed, "woNumber", {
                onSingleResult: clearOnMatch,
                onCompletedWorkorderFound: (wo) => _sSetClosedWorkorder(wo),
                onSaleFound: (sale) => _sSetSale(sale),
                onTransactionFound: (txn) => _sSetTransaction(txn),
              });
              return;
            }
            // Non-WO mode: auto-search sales + transactions after 4 digits typed
            if (!hasWoPrefix && trimmed.length >= 4) {
              executeLiveSearch(trimmed, "salesTransactions", {
                onSingleResult: clearOnMatch,
                onCompletedWorkorderFound: (wo) => _sSetClosedWorkorder(wo),
                onSaleFound: (sale) => _sSetSale(sale),
                onTransactionFound: (txn) => _sSetTransaction(txn),
              });
            }
          }}
          onSubmitEditing={() => handleExecuteTicketSearch()}
          style={{
            flex: 1,
            caretColor: C.cursorRed,
            color: C.text,
            borderWidth: 1,
            borderColor: gray(0.15),
            borderRadius: 7,
            height: 35,
            outlineStyle: "none",
            fontSize: 14,
            paddingHorizontal: 10,
            backgroundColor: C.listItemWhite,
          }}
        />
        {sTicketSearching && (
          <View style={{ marginLeft: 8 }}>
            <SmallLoadingIndicator />
          </View>
        )}
      </View>
      <ClosedWorkorderModal
        workorder={sClosedWorkorder}
        onClose={() => _sSetClosedWorkorder(null)}
      />
      <TransactionModal
        transaction={sTransaction}
        onClose={() => _sSetTransaction(null)}
      />
      <SaleModal
        sale={sSale}
        onClose={() => _sSetSale(null)}
      />
    </View>
  );
}

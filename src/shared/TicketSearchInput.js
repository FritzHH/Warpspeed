/* eslint-disable */
import { View, TextInput } from "react-native-web";
import { useState } from "react";
import { gray } from "../utils";
import { Button_, SmallLoadingIndicator } from "../components";
import { C } from "../styles";
import { executeTicketSearch } from "./ticketSearch";
import { ClosedWorkorderModal } from "../screens/screen_components/modal_screens/ClosedWorkorderModal";
import { TransactionModal } from "../screens/screen_components/modal_screens/TransactionModal";

export function TicketSearchInput({}) {
  const [sTicketSearch, _setTicketSearch] = useState("");
  const [sTicketSearching, _setTicketSearching] = useState(false);
  const [sClosedWorkorder, _sSetClosedWorkorder] = useState(null);
  const [sTransaction, _sSetTransaction] = useState(null);

  async function handleExecuteTicketSearch() {
    _setTicketSearching(true);
    try {
      await executeTicketSearch(sTicketSearch, () => _setTicketSearch(""), {
        onCompletedWorkorderFound: (wo) => _sSetClosedWorkorder(wo),
        onTransactionFound: (txn) => _sSetTransaction(txn),
      });
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
          placeholder={"Scan ticket or enter first 4 of barcode"}
          placeholderTextColor={gray(0.35)}
          onChangeText={(val) => {
            _setTicketSearch(val);
            let trimmed = val.trim();
            if (/^\d{12}$/.test(trimmed)) {
              _setTicketSearch("");
              executeTicketSearch(trimmed, null, {
                onCompletedWorkorderFound: (wo) => _sSetClosedWorkorder(wo),
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
      {sTicketSearch.trim().length === 4 && /^\d{4}$/.test(sTicketSearch.trim()) && (
        <View style={{ width: "100%", paddingHorizontal: 20, alignItems: "flex-end", marginTop: 3 }}>
          <Button_
            text={sTicketSearch.trim()[0] === "3" ? "Search Sales" : sTicketSearch.trim()[0] === "2" ? "Search Legacy" : "Search Workorders"}
            onPress={() => handleExecuteTicketSearch()}
            buttonStyle={{
              width: 150,
              borderRadius: 5,
              paddingVertical: 6,
              borderWidth: 1,
              borderColor: C.buttonLightGreenOutline,
              backgroundColor: C.buttonLightGreen,
            }}
            textStyle={{ fontSize: 11, color: C.text }}
          />
        </View>
      )}
      <ClosedWorkorderModal
        workorder={sClosedWorkorder}
        onClose={() => _sSetClosedWorkorder(null)}
      />
      <TransactionModal
        transaction={sTransaction}
        onClose={() => _sSetTransaction(null)}
      />
    </View>
  );
}

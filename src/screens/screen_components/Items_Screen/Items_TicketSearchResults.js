/* eslint-disable */

import { View, Text, FlatList } from "react-native-web";
import { useState } from "react";
import { formatCurrencyDisp, formatMillisForDisplay, gray, log, formatWorkorderNumber, lightenRGBByPercent } from "../../../utils";
import {
  SmallLoadingIndicator,
  TouchableOpacity_,
} from "../../../components";
import {
  useTicketSearchStore,
  useOpenWorkordersStore,
  useTabNamesStore,
  useActiveSalesStore,
  useAlertScreenStore,
} from "../../../stores";
import { TAB_NAMES } from "../../../data";
import { C } from "../../../styles";
import { ClosedWorkorderModal } from "../modal_screens/ClosedWorkorderModal";
import { TransactionModal } from "../modal_screens/TransactionModal";
import { SaleModal } from "../modal_screens/SaleModal";
import { NewRefundModalScreen } from "../modal_screens/newCheckoutModalScreen/NewRefundModalScreen";
import { readTransactions, findSaleByTransactionID } from "../modal_screens/newCheckoutModalScreen/newCheckoutFirebaseCalls";

export function Items_TicketSearchResults({}) {
  const zResults = useTicketSearchStore((state) => state.getResults());
  const zIsSearching = useTicketSearchStore((state) => state.getIsSearching());
  const zActiveSales = useActiveSalesStore((state) => state.activeSales);
  const [sClosedWorkorder, _sSetClosedWorkorder] = useState(null);
  const [sTransaction, _sSetTransaction] = useState(null);
  const [sSale, _sSetSale] = useState(null);
  const [sRefundSaleID, _sSetRefundSaleID] = useState(null);
  const [sRefundInitialPayment, _sSetRefundInitialPayment] = useState(null);

  function handleWorkorderPress(wo, isCompleted) {
    if (isCompleted) {
      _sSetClosedWorkorder(wo);
      return;
    }

    // add to open workorders store if not already there
    let existing = useOpenWorkordersStore.getState().getWorkorders() || [];
    let found = existing.find((w) => w.id === wo.id);
    if (!found) {
      useOpenWorkordersStore.getState().setWorkorder(wo);
    }

    // select this workorder
    useOpenWorkordersStore.getState().setOpenWorkorder(wo);

    // lock if payment is complete
    if (wo.paymentComplete) {
      useOpenWorkordersStore.getState().setLockedWorkorderID(wo.id);
    }

    // switch to workorder items tab
    useTabNamesStore.getState().setItemsTabName(TAB_NAMES.itemsTab.workorderItems);
  }

  async function handleSalePress(sale) {
    // Hydrate _transactions then open SaleModal
    let txns = [];
    if (sale.transactionIDs?.length > 0) {
      txns = await readTransactions(sale.transactionIDs);
    }
    _sSetSale({ ...sale, _transactions: txns });
  }

  function handleTransactionPress(txn) {
    _sSetTransaction(txn);
  }

  async function handleTransactionRefund(txn) {
    // Find the sale that contains this transaction, then open refund modal
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

  function handlePress(item) {
    if (item.type === "workorder") {
      handleWorkorderPress(item.data, item.isCompleted);
    } else if (item.type === "sale") {
      handleSalePress(item.data);
    } else if (item.type === "transaction") {
      handleTransactionPress(item.data);
    }
  }

  function renderWorkorderCard(item) {
    let wo = item.data;
    let isPaid = wo.paymentComplete || !!wo.saleID;
    return (
      <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: "600", color: C.text }}>
            WO #{formatWorkorderNumber(wo.workorderNumber) || wo.id}
          </Text>
          <Text style={{ fontSize: 13, color: gray(0.45), marginTop: 2 }}>
            {[wo.brand, wo.description].filter(Boolean).join(" / ") || "No vehicle info"}
          </Text>
          {wo.customerFirst ? (
            <Text style={{ fontSize: 12, color: gray(0.55), marginTop: 2 }}>
              {wo.customerFirst} {wo.customerLast || ""}
            </Text>
          ) : null}
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text
            style={{
              fontSize: 12,
              fontWeight: "600",
              color: isPaid ? "#fff" : item.isCompleted ? C.blue : C.green,
              backgroundColor: isPaid ? C.red : "transparent",
              paddingHorizontal: isPaid ? 6 : 0,
              paddingVertical: isPaid ? 2 : 0,
              borderRadius: 4,
              overflow: "hidden",
            }}
          >
            {isPaid ? "PAID" : item.isCompleted ? "COMPLETED" : "OPEN"}
          </Text>
          {(() => {
            let sale = wo.activeSaleID ? zActiveSales.find((s) => s.id === wo.activeSaleID) : null;
            let paid = sale ? (sale.amountCaptured || 0) - (sale.amountRefunded || 0) : 0;
            return paid > 0 && !wo.paymentComplete ? (
              <Text style={{ fontSize: 11, color: C.orange, marginTop: 2 }}>
                Partial: {formatCurrencyDisp(paid, true)}
              </Text>
            ) : null;
          })()}
        </View>
      </View>
    );
  }

  function renderSaleCard(item) {
    let sale = item.data;
    return (
      <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: "600", color: C.text }}>
            Sale {"#" + sale.id.slice(-4)}
          </Text>
          <Text style={{ fontSize: 13, color: gray(0.45), marginTop: 2 }}>
            Total: {formatCurrencyDisp(sale.total, true)}
          </Text>
          {sale.millis ? (
            <Text style={{ fontSize: 12, color: gray(0.55), marginTop: 2 }}>
              {formatMillisForDisplay(sale.millis)}
            </Text>
          ) : null}
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text
            style={{
              fontSize: 12,
              fontWeight: "600",
              color: item.isCompleted ? "#fff" : C.orange,
              backgroundColor: item.isCompleted ? C.green : "transparent",
              paddingHorizontal: item.isCompleted ? 6 : 0,
              paddingVertical: item.isCompleted ? 2 : 0,
              borderRadius: 4,
              overflow: "hidden",
            }}
          >
            {item.isCompleted ? "COMPLETED" : "PARTIAL"}
          </Text>
          {sale.amountCaptured > 0 && !sale.paymentComplete ? (
            <Text style={{ fontSize: 11, color: C.orange, marginTop: 2 }}>
              Captured: {formatCurrencyDisp(sale.amountCaptured, true)}
            </Text>
          ) : null}
        </View>
      </View>
    );
  }

  function renderTransactionCard(item) {
    let txn = item.data;
    let isCard = txn.method === "card";
    return (
      <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: "600", color: C.text }}>
            Txn {"#" + txn.id.slice(-4)}
          </Text>
          <Text style={{ fontSize: 13, color: gray(0.45), marginTop: 2 }}>
            {(txn.method || "unknown").toUpperCase()}
            {isCard && txn.last4 ? " ..." + txn.last4 : ""}
            {" - " + formatCurrencyDisp(txn.amountCaptured || 0, true)}
          </Text>
          {txn.millis ? (
            <Text style={{ fontSize: 12, color: gray(0.55), marginTop: 2 }}>
              {formatMillisForDisplay(txn.millis)}
            </Text>
          ) : null}
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <View
            style={{
              backgroundColor: isCard
                ? lightenRGBByPercent(C.blue, 60)
                : lightenRGBByPercent(C.green, 60),
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderRadius: 4,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: "600",
                color: isCard ? C.blue : C.green,
              }}
            >
              {isCard ? "CARD" : "CASH"}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  function renderItem({ item }) {
    return (
      <TouchableOpacity_
        onPress={() => handlePress(item)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: 12,
          paddingHorizontal: 15,
          marginHorizontal: 10,
          marginTop: 8,
          backgroundColor: C.listItemWhite,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: item.type === "sale" ? C.blue : item.type === "transaction" ? C.purple : C.buttonLightGreenOutline,
        }}
      >
        {item.type === "workorder"
          ? renderWorkorderCard(item)
          : item.type === "transaction"
            ? renderTransactionCard(item)
            : renderSaleCard(item)}
      </TouchableOpacity_>
    );
  }

  return (
    <View style={{ flex: 1, width: "100%" }}>
      <View style={{ paddingHorizontal: 15, paddingTop: 12, paddingBottom: 6 }}>
        <Text style={{ fontSize: 16, fontWeight: "600", color: C.text }}>
          Ticket Search Results ({zResults.length})
        </Text>
      </View>
      <FlatList
        data={zResults}
        renderItem={renderItem}
        keyExtractor={(item, index) => {
          let pre = item.type === "workorder" ? "wo-" : item.type === "transaction" ? "txn-" : "sale-";
          return pre + (item.data?.id || index);
        }}
        ListEmptyComponent={
          zIsSearching ? (
            <SmallLoadingIndicator />
          ) : (
            <View style={{ alignItems: "center", marginTop: 40 }}>
              <Text style={{ fontSize: 14, color: gray(0.5) }}>
                No results found
              </Text>
            </View>
          )
        }
        contentContainerStyle={{ paddingBottom: 20 }}
      />
      <ClosedWorkorderModal
        workorder={sClosedWorkorder}
        onClose={() => _sSetClosedWorkorder(null)}
      />
      <TransactionModal
        transaction={sTransaction}
        onClose={() => _sSetTransaction(null)}
        onRefund={handleTransactionRefund}
      />
      <SaleModal
        sale={sSale}
        onClose={() => _sSetSale(null)}
      />
      {!!sRefundSaleID && (
        <NewRefundModalScreen
          visible={true}
          saleID={sRefundSaleID}
          initialPayment={sRefundInitialPayment}
          onClose={() => { _sSetRefundSaleID(null); _sSetRefundInitialPayment(null); }}
        />
      )}
    </View>
  );
}

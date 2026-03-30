/* eslint-disable */

import { View, Text, FlatList } from "react-native-web";
import { useState } from "react";
import { formatCurrencyDisp, formatMillisForDisplay, gray, log } from "../../../utils";
import {
  SmallLoadingIndicator,
  TouchableOpacity_,
} from "../../../components";
import {
  useTicketSearchStore,
  useOpenWorkordersStore,
  useTabNamesStore,
  useCheckoutStore,
  useActiveSalesStore,
} from "../../../stores";
import { TAB_NAMES } from "../../../data";
import { C } from "../../../styles";
import { ClosedWorkorderModal } from "../modal_screens/ClosedWorkorderModal";

export function Items_TicketSearchResults({}) {
  const zResults = useTicketSearchStore((state) => state.getResults());
  const zIsSearching = useTicketSearchStore((state) => state.getIsSearching());
  const zActiveSales = useActiveSalesStore((state) => state.activeSales);
  const [sClosedWorkorder, _sSetClosedWorkorder] = useState(null);

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

  function handleSalePress(sale, isCompleted) {
    if (isCompleted) {
      // completed sale → open refund screen via receiptScan trigger
      useCheckoutStore.getState().setStringOnly(sale.id);
    } else {
      // partial/active sale → open checkout screen
      useCheckoutStore.getState().setViewOnlySale(sale);
      useCheckoutStore.getState().setIsCheckingOut(true);
    }
  }

  function handlePress(item) {
    if (item.type === "workorder") {
      handleWorkorderPress(item.data, item.isCompleted);
    } else if (item.type === "sale") {
      handleSalePress(item.data, item.isCompleted);
    }
  }

  function renderWorkorderCard(item) {
    let wo = item.data;
    let isPaid = wo.paymentComplete || !!wo.saleID;
    return (
      <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: "600", color: C.text }}>
            WO #{wo.workorderNumber || wo.id}
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
          borderColor: item.type === "sale" ? C.blue : C.buttonLightGreenOutline,
        }}
      >
        {item.type === "workorder" ? renderWorkorderCard(item) : renderSaleCard(item)}
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
        keyExtractor={(item, index) =>
          (item.type === "workorder" ? "wo-" : "sale-") + (item.data?.id || index)
        }
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
    </View>
  );
}

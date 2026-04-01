/* eslint-disable */

import { View, Text, FlatList } from "react-native-web";
import { useState } from "react";
import {
  capitalizeFirstLetterOfString,
  formatCurrencyDisp,
  formatMillisForDisplay,
  formatPhoneForDisplay,
  gray,
  resolveStatus,
  calculateRunningTotals,
  formatWorkorderNumber,
} from "../../../utils";
import {
  SmallLoadingIndicator,
  TouchableOpacity_,
} from "../../../components";
import {
  useWorkorderSearchStore,
  useOpenWorkordersStore,
  useTabNamesStore,
  useSettingsStore,
  useActiveSalesStore,
  useCurrentCustomerStore,
} from "../../../stores";
import { TAB_NAMES } from "../../../data";
import { C } from "../../../styles";
import { ClosedWorkorderModal } from "../modal_screens/ClosedWorkorderModal";

export function Items_WorkorderSearchList({}) {
  const zResults = useWorkorderSearchStore((s) => s.searchResults);
  const zIsSearching = useWorkorderSearchStore((s) => s.isSearching);
  const statuses = useSettingsStore((s) => s.settings?.statuses) || [];
  const taxPercent = useSettingsStore((s) => s.settings?.salesTaxPercent) || 0;
  const zActiveSales = useActiveSalesStore((s) => s.activeSales);

  const [sClosedWorkorder, _sSetClosedWorkorder] = useState(null);

  function handleOpenWorkorderPress(wo) {
    useOpenWorkordersStore.getState().setOpenWorkorderID(wo.id);
    useTabNamesStore.getState().setItems({
      infoTabName: TAB_NAMES.infoTab.workorder,
      itemsTabName: TAB_NAMES.itemsTab.workorderItems,
      optionsTabName: TAB_NAMES.optionsTab.inventory,
    });
    useWorkorderSearchStore.getState().reset();
  }

  function handlePress(item) {
    if (item.isCompleted) {
      _sSetClosedWorkorder(item.data);
    } else {
      handleOpenWorkorderPress(item.data);
    }
  }

  return (
    <View style={{ flex: 1, width: "100%" }}>
      <FlatList
        data={zResults}
        keyExtractor={(item, index) =>
          (item.isCompleted ? "closed-" : "open-") + (item.data?.id || index)
        }
        ListEmptyComponent={() => (
          <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 30 }}>
            {zIsSearching ? (
              <SmallLoadingIndicator />
            ) : (
              <Text style={{ color: gray(0.4), fontSize: 14 }}>No workorders found</Text>
            )}
          </View>
        )}
        contentContainerStyle={{ paddingBottom: 20, paddingTop: 10 }}
        renderItem={({ item }) => {
          const workorder = item.data;
          const rs = resolveStatus(workorder.status, statuses);
          const totals = calculateRunningTotals(workorder, taxPercent, [], false, !!workorder.taxFree);
          const itemCount = workorder.workorderLines?.length || 0;

          return (
            <TouchableOpacity_
              onPress={() => handlePress(item)}
              style={{
                marginHorizontal: 10,
                marginBottom: 6,
                borderRadius: 7,
                borderLeftWidth: 4,
                borderLeftColor: item.isCompleted
                  ? C.blue
                  : (rs.backgroundColor || C.buttonLightGreenOutline),
                borderColor: C.buttonLightGreenOutline,
                borderWidth: 1,
                backgroundColor: C.listItemWhite,
                paddingVertical: 6,
                paddingHorizontal: 10,
              }}
            >
              {/* Row 1: Customer name + phone + status badge */}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 3,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                  <Text numberOfLines={1} style={{ fontSize: 13, color: "dimgray" }}>
                    {workorder.customerFirst
                      ? capitalizeFirstLetterOfString(workorder.customerFirst) +
                        " " +
                        capitalizeFirstLetterOfString(workorder.customerLast || "")
                      : "No customer"}
                  </Text>
                  {!!workorder.customerCell && (
                    <Text style={{ fontSize: 12, color: gray(0.45), marginLeft: 10 }}>
                      {formatPhoneForDisplay(workorder.customerCell)}
                    </Text>
                  )}
                </View>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  {item.isCompleted && (
                    <View
                      style={{
                        backgroundColor: C.blue,
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        borderRadius: 10,
                        marginRight: 4,
                      }}
                    >
                      <Text style={{ color: "#fff", fontSize: 10, fontWeight: "600" }}>
                        CLOSED
                      </Text>
                    </View>
                  )}
                  <View
                    style={{
                      backgroundColor: rs.backgroundColor,
                      paddingHorizontal: 10,
                      paddingVertical: 2,
                      borderRadius: 10,
                    }}
                  >
                    <Text style={{ color: rs.textColor, fontSize: 11, fontWeight: "600" }}>
                      {rs.label}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Row 2: Brand / description + item count */}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 4,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                  <Text style={{ fontWeight: "500", color: C.text, fontSize: 14 }}>
                    {workorder.brand || ""}
                  </Text>
                  {!!workorder.description && (
                    <View
                      style={{
                        width: 7,
                        height: 2,
                        marginHorizontal: 5,
                        backgroundColor: "lightgray",
                      }}
                    />
                  )}
                  <Text numberOfLines={1} style={{ color: C.text, fontSize: 14 }}>
                    {workorder.description || ""}
                  </Text>
                  {itemCount > 0 && (
                    <View
                      style={{
                        backgroundColor: "gray",
                        borderRadius: 10,
                        paddingHorizontal: 6,
                        paddingVertical: 1,
                        marginLeft: 8,
                      }}
                    >
                      <Text style={{ color: "white", fontSize: 10, fontWeight: "600" }}>
                        {itemCount}
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Row 3: WO number + date + total */}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Text style={{ color: C.green, fontSize: 12, fontWeight: "600" }}>
                  {formatWorkorderNumber(workorder.workorderNumber) || ""}
                </Text>
                <Text style={{ color: "dimgray", fontSize: 12 }}>
                  {formatMillisForDisplay(
                    workorder.startedOnMillis,
                    new Date(workorder.startedOnMillis).getFullYear() !== new Date().getFullYear()
                  )}
                </Text>
                {(() => {
                  let sale = workorder.activeSaleID
                    ? zActiveSales.find((s) => s.id === workorder.activeSaleID)
                    : null;
                  let paid = sale
                    ? (sale.amountCaptured || 0) - (sale.amountRefunded || 0)
                    : 0;
                  if (workorder.paymentComplete) {
                    return (
                      <Text style={{ fontSize: 13, fontWeight: "600", color: C.green }}>
                        {"$" + formatCurrencyDisp(totals.finalTotal)}
                      </Text>
                    );
                  }
                  if (paid > 0) {
                    return (
                      <Text style={{ fontSize: 13, fontWeight: "600", color: C.orange }}>
                        {"$" + formatCurrencyDisp(paid) + " paid"}
                      </Text>
                    );
                  }
                  return (
                    <Text style={{ fontSize: 13, fontWeight: "600", color: C.text }}>
                      {"$" + formatCurrencyDisp(totals.finalTotal)}
                    </Text>
                  );
                })()}
              </View>
            </TouchableOpacity_>
          );
        }}
      />
      <ClosedWorkorderModal
        workorder={sClosedWorkorder}
        onClose={() => _sSetClosedWorkorder(null)}
      />
    </View>
  );
}

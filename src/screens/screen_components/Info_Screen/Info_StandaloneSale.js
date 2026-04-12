/* eslint-disable */
import { View, Text, FlatList, TouchableOpacity } from "react-native-web";
import { TAB_NAMES, RECEIPT_TYPES, WORKORDER_PROTO } from "../../../data";
import { cloneDeep } from "lodash";
import {
  useOpenWorkordersStore,
  useTabNamesStore,
  useSettingsStore,
  useLoginStore,
  useCheckoutStore,
  useActiveSalesStore,
} from "../../../stores";

import {
  Button_,
  ScreenModal,
  Tooltip,
} from "../../../components";
import { TicketSearchInput } from "../../../shared/TicketSearchInput";
import {
  generateEAN13Barcode,
  gray,
  formatCurrencyDisp,
  formatMillisForDisplay,
  localStorageWrapper,
} from "../../../utils";
import { useState } from "react";
import { C, COLOR_GRADIENTS, ICONS } from "../../../styles";
import {
  dbSavePrintObj,
} from "../../../db_calls_wrapper";

export const StandaloneSaleComponent = ({}) => {
  const zOpenWorkorder = useOpenWorkordersStore((state) => state.getOpenWorkorder());
  const zActiveSales = useActiveSalesStore((state) => state.activeSales);
  const standaloneSales = zActiveSales.filter((s) => !s.customerID && !s.paymentComplete);
  const [sShowActiveSalesModal, _setShowActiveSalesModal] = useState(false);

  let clearDisabled = !zOpenWorkorder
    || ((zOpenWorkorder.workorderLines || []).length === 0
      && (zOpenWorkorder.customerNotes || []).length === 0
      && (zOpenWorkorder.internalNotes || []).length === 0);

  function handleSelectActiveSale(sale) {
    _setShowActiveSalesModal(false);
    // Find matching workorder by saleID or create a temp one
    let store = useOpenWorkordersStore.getState();
    let woID = sale.workorderIDs?.[0];
    if (woID) {
      let existingWo = store.workorders.find((w) => w.id === woID);
      if (existingWo) {
        store.setOpenWorkorderID(existingWo.id);
      } else {
        // Workorder isn't loaded — set it with the activeSaleID so checkout can resume
        let wo = cloneDeep(WORKORDER_PROTO);
        wo.id = woID;
        wo.activeSaleID = sale.id;
        wo.startedOnMillis = sale.millis || Date.now();
        store.setWorkorder(wo, false);
        store.setOpenWorkorderID(wo.id);
      }
    }
    useCheckoutStore.getState().setIsCheckingOut(true);
  }

  //////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////
  return (
    <View
      style={{
        width: "100%",
        height: "100%",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <TicketSearchInput />

      {/* Existing content */}
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          width: "100%",
          alignItems: "center",
        }}
      >
        <Text style={{ fontSize: 72, color: gray(0.08) }}>{"SALE"}</Text>
        <Button_
          text={"Active Sales" + (standaloneSales.length > 0 ? ` (${standaloneSales.length})` : "")}
          enabled={standaloneSales.length > 0}
          onPress={() => _setShowActiveSalesModal(true)}
          colorGradientArr={standaloneSales.length > 0 ? COLOR_GRADIENTS.green : COLOR_GRADIENTS.grey}
          buttonStyle={{
            borderRadius: 5,
            paddingHorizontal: 20,
            paddingVertical: 8,
            marginTop: 20,
          }}
          textStyle={{ color: C.textWhite, fontSize: 13, fontWeight: "600" }}
        />
      </View>

      {/* Active Sales Modal */}
      {sShowActiveSalesModal && (
        <ScreenModal
          showOuterModal={true}
          modalVisible={sShowActiveSalesModal}
          onClose={() => _setShowActiveSalesModal(false)}
          Component={() => (
            <View style={{ width: 400, maxHeight: 500, backgroundColor: C.backgroundWhite, borderRadius: 10, padding: 20 }}>
              <Text style={{ fontSize: 18, fontWeight: "600", color: C.text, marginBottom: 15 }}>Active Sales</Text>
              {standaloneSales.length === 0 ? (
                <Text style={{ color: gray(0.5), textAlign: "center", paddingVertical: 20 }}>No active sales</Text>
              ) : (
                <FlatList
                  data={standaloneSales}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      onPress={() => handleSelectActiveSale(item)}
                      style={{
                        borderWidth: 1,
                        borderColor: C.buttonLightGreenOutline,
                        borderRadius: 8,
                        padding: 12,
                        marginBottom: 8,
                        backgroundColor: C.listItemWhite,
                      }}
                    >
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                        <Text style={{ fontSize: 14, fontWeight: "500", color: C.text }}>
                          {"$" + formatCurrencyDisp(item.total || 0)}
                        </Text>
                        <Text style={{ fontSize: 12, color: gray(0.5) }}>
                          {item.millis ? formatMillisForDisplay(item.millis) : ""}
                        </Text>
                      </View>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
                        <Text style={{ fontSize: 11, color: gray(0.5) }}>
                          {"Paid: $" + formatCurrencyDisp(item.amountCaptured || 0)}
                        </Text>
                        <Text style={{ fontSize: 11, color: C.green }}>
                          {"Remaining: $" + formatCurrencyDisp(Math.max(0, (item.total || 0) - (item.amountCaptured || 0)))}
                        </Text>
                      </View>
                      {item.createdBy && (
                        <Text style={{ fontSize: 10, color: gray(0.4), marginTop: 2 }}>
                          {"By " + item.createdBy}
                        </Text>
                      )}
                    </TouchableOpacity>
                  )}
                />
              )}
              <Button_
                text="Close"
                onPress={() => _setShowActiveSalesModal(false)}
                buttonStyle={{ marginTop: 10, alignSelf: "center", paddingHorizontal: 30 }}
                textStyle={{ fontSize: 13 }}
              />
            </View>
          )}
        />
      )}

      <Button_
        text="CLEAR SALE"
        onPress={() => {
          let store = useOpenWorkordersStore.getState();
          let oldWo = store.getOpenWorkorder();
          if (!oldWo) return;
          store.removeWorkorder(oldWo.id);
          let wo = cloneDeep(WORKORDER_PROTO);
          wo.id = generateEAN13Barcode();
          wo.startedBy = useLoginStore.getState().currentUser?.id;
          wo.startedOnMillis = Date.now();
          store.setWorkorder(wo);
          store.setOpenWorkorderID(wo.id);
        }}
        enabled={!clearDisabled}
        colorGradientArr={COLOR_GRADIENTS.red}
        buttonStyle={{
          borderRadius: 5,
          paddingHorizontal: 30,
          paddingVertical: 10,
          marginBottom: 30,
        }}
        textStyle={{ color: C.textWhite, fontSize: 14, fontWeight: "600" }}
      />
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          width: "100%",
          height: "15%",
          alignItems: "center",
        }}
      >
        <Tooltip text="New workorder" position="top">
          <Button_
            onPress={() => {
              useTabNamesStore.getState().setItems({
                infoTabName: TAB_NAMES.infoTab.customer,
                itemsTabName: TAB_NAMES.itemsTab.empty,
                optionsTabName: TAB_NAMES.optionsTab.workorders,
              });
            }}
            icon={ICONS.bicycle}
            iconSize={55}
            buttonStyle={{ marginBottom: 0, paddingLeft: 15 }}
          />
        </Tooltip>
        {!!zOpenWorkorder?.customerID && (
          <Tooltip text="Back to workorder" position="top">
            <Button_
              onPress={() => {
                useTabNamesStore.getState().setItems({
                  infoTabName: TAB_NAMES.infoTab.workorder,
                  itemsTabName: TAB_NAMES.itemsTab.workorderItems,
                  optionsTabName: TAB_NAMES.optionsTab.inventory,
                });
              }}
              icon={ICONS.letterW}
              iconSize={35}
              buttonStyle={{
                backgroundColor: "transparent",
                paddingHorizontal: 0,
                paddingVertical: 0,
              }}
            />
          </Tooltip>
        )}
        <Tooltip text="Pop cash register" position="top">
          <Button_
            icon={ICONS.openCashRegister}
            iconSize={40}
            onPress={() =>
              dbSavePrintObj(
                { id: crypto.randomUUID(), receiptType: RECEIPT_TYPES.register },
                localStorageWrapper.getItem("selectedPrinterID") || ""
              )
            }
          />
        </Tooltip>
      </View>
    </View>
  );
};

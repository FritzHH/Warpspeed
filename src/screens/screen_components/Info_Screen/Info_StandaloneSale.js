/* eslint-disable */
import { View, Text, TextInput, FlatList, TouchableOpacity } from "react-native-web";
import { TAB_NAMES, RECEIPT_TYPES, WORKORDER_PROTO } from "../../../data";
import { cloneDeep } from "lodash";
import {
  useOpenWorkordersStore,
  useTabNamesStore,
  useSettingsStore,
  useLoginStore,
  useCheckoutStore,
} from "../../../stores";

import {
  Button_,
  SmallLoadingIndicator,
  ScreenModal,
  Tooltip,
} from "../../../components";
import {
  generateEAN13Barcode,
  gray,
  formatCurrencyDisp,
  formatMillisForDisplay,
} from "../../../utils";
import { useState, useRef } from "react";
import { C, COLOR_GRADIENTS, ICONS } from "../../../styles";
import {
  dbSavePrintObj,
  dbGetStandaloneActiveSales,
} from "../../../db_calls_wrapper";
import { executeTicketSearch } from "../../../shared/ticketSearch";
import { ClosedWorkorderModal } from "../modal_screens/ClosedWorkorderModal";

export const StandaloneSaleComponent = ({}) => {
  const zOpenWorkorder = useOpenWorkordersStore((state) => state.getOpenWorkorder());
  const [sTicketSearch, _setTicketSearch] = useState("");
  const [sTicketSearching, _setTicketSearching] = useState(false);
  const [sActiveSales, _setActiveSales] = useState([]);
  const [sActiveSalesLoading, _setActiveSalesLoading] = useState(false);
  const [sShowActiveSalesModal, _setShowActiveSalesModal] = useState(false);
  const [sFoundWorkorder, _setFoundWorkorder] = useState(null);
  const hasCheckedRef = useRef(false);

  let clearDisabled = !zOpenWorkorder
    || ((zOpenWorkorder.workorderLines || []).length === 0
      && (zOpenWorkorder.customerNotes || []).length === 0
      && (zOpenWorkorder.internalNotes || []).length === 0);

  // Check for standalone active sales on mount
  if (!hasCheckedRef.current) {
    hasCheckedRef.current = true;
    _setActiveSalesLoading(true);
    dbGetStandaloneActiveSales().then((sales) => {
      _setActiveSales(sales);
      _setActiveSalesLoading(false);
    });
  }

  function handleRefreshActiveSales() {
    _setActiveSalesLoading(true);
    dbGetStandaloneActiveSales().then((sales) => {
      _setActiveSales(sales);
      _setActiveSalesLoading(false);
    });
  }

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

  async function handleExecuteTicketSearch() {
    _setTicketSearching(true);
    try {
      await executeTicketSearch(sTicketSearch, () => _setTicketSearch(""), {
        onWorkorderFound: (wo) => _setFoundWorkorder(wo),
      });
    } finally {
      _setTicketSearching(false);
    }
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
      {/* Ticket search input */}
      <View style={{ width: "100%" }}>
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
            onChangeText={(val) => _setTicketSearch(val)}
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
              text={sTicketSearch.trim()[0] === "3" ? "Search Sales" : sTicketSearch.trim()[0] === "2" ? "Search Legacy" : sTicketSearch.trim()[0] === "1" ? "Search Workorders" : "Search"}
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
      </View>

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
          text={sActiveSalesLoading ? "Loading..." : "Active Sales" + (sActiveSales.length > 0 ? ` (${sActiveSales.length})` : "")}
          enabled={sActiveSales.length > 0}
          onPress={() => {
            handleRefreshActiveSales();
            _setShowActiveSalesModal(true);
          }}
          colorGradientArr={sActiveSales.length > 0 ? COLOR_GRADIENTS.green : COLOR_GRADIENTS.grey}
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
              {sActiveSalesLoading ? (
                <View style={{ alignItems: "center", paddingVertical: 30 }}>
                  <SmallLoadingIndicator />
                </View>
              ) : sActiveSales.length === 0 ? (
                <Text style={{ color: gray(0.5), textAlign: "center", paddingVertical: 20 }}>No active sales</Text>
              ) : (
                <FlatList
                  data={sActiveSales}
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

      <ClosedWorkorderModal
        workorder={sFoundWorkorder}
        onClose={() => _setFoundWorkorder(null)}
      />

      <Button_
        text="CLEAR SALE"
        onPress={() => {
          let store = useOpenWorkordersStore.getState();
          let oldWo = store.getOpenWorkorder();
          if (!oldWo) return;
          store.removeWorkorder(oldWo.id);
          let wo = cloneDeep(WORKORDER_PROTO);
          wo.id = generateEAN13Barcode("1");
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
        <Tooltip text="Back to Customer" position="top">
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
        <Tooltip text="Pop cash register" position="top">
          <Button_
            icon={ICONS.openCashRegister}
            iconSize={40}
            onPress={() =>
              dbSavePrintObj(
                { id: crypto.randomUUID(), receiptType: RECEIPT_TYPES.register },
                useSettingsStore.getState().getSettings()?.selectedPrinterID || ""
              )
            }
          />
        </Tooltip>
      </View>
    </View>
  );
};

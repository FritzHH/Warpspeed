/* eslint-disable */
import { View, Text, TextInput, ScrollView, TouchableOpacity } from "react-native-web";
import { TAB_NAMES, RECEIPT_TYPES, WORKORDER_PROTO } from "../../../data";
import { cloneDeep } from "lodash";
import {
  useOpenWorkordersStore,
  useTabNamesStore,
  useCurrentCustomerStore,
  useAlertScreenStore,
  useCheckoutStore,
  useWorkorderPreviewStore,
  useTicketSearchStore,
  useSettingsStore,
  useLoginStore,
} from "../../../stores";

import {
  Button_,
  ScreenModal,
  SmallLoadingIndicator,
  Tooltip,
} from "../../../components";
import {
  formatCurrencyDisp,
  formatMillisForDisplay,
  generateEAN13Barcode,
  gray,
  log,
  printBuilder,
} from "../../../utils";
import { useEffect, useRef, useState } from "react";
import { C, COLOR_GRADIENTS, ICONS } from "../../../styles";
import {
  dbSavePrintObj,
  dbGetCompletedWorkorder,
  dbGetCompletedSale,
  dbGetCustomer,
  dbSearchCompletedWorkorders,
  dbSearchWorkordersByIdPrefix,
  dbSearchSalesByIdPrefix,
} from "../../../db_calls_wrapper";
import { newCheckoutGetActiveSale, fetchStandaloneActiveSales, countStandaloneActiveSales } from "../modal_screens/newCheckoutModalScreen/newCheckoutFirebaseCalls";

export const StandaloneSaleComponent = ({}) => {
  const zOpenWorkorder = useOpenWorkordersStore((state) => state.getOpenWorkorder());
  const [sTicketSearch, _setTicketSearch] = useState("");
  const [sTicketSearching, _setTicketSearching] = useState(false);
  const [sResumeLoading, _setResumeLoading] = useState(false);
  const [sActiveSaleCount, _setActiveSaleCount] = useState(0);
  const [sActiveSales, _setActiveSales] = useState([]);
  const [sShowResumeModal, _setShowResumeModal] = useState(false);

  useEffect(() => {
    countStandaloneActiveSales().then((count) => {
      log("countStandaloneActiveSales result:", count);
      _setActiveSaleCount(count);
    }).catch((err) => {
      log("countStandaloneActiveSales error:", err);
      _setActiveSaleCount(0);
    });
  }, []);

  let clearDisabled = !zOpenWorkorder || !zOpenWorkorder.isStandaloneSale
    || ((zOpenWorkorder.workorderLines || []).length === 0
      && (zOpenWorkorder.customerNotes || []).length === 0
      && (zOpenWorkorder.internalNotes || []).length === 0);

  //////////////////////////////////////////////////////////////////////

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
    _setTicketSearch("");
  }

  function openSale(sale, isCompleted) {
    if (isCompleted) {
      useCheckoutStore.getState().setStringOnly(sale.id);
    } else {
      useCheckoutStore.getState().setViewOnlySale(sale);
      useCheckoutStore.getState().setIsCheckingOut(true);
    }
    _setTicketSearch("");
  }

  function showTicketAlert(message) {
    useAlertScreenStore.getState().setValues({
      title: "Ticket Search",
      message,
      btn1Text: "OK",
      handleBtn1Press: () => {},
      showAlert: true,
      canExitOnOuterClick: true,
    });
  }

  async function executeTicketSearch() {
    let trimmed = sTicketSearch.trim();
    if (!trimmed) return;
    _setTicketSearching(true);

    try {
      const store = useOpenWorkordersStore.getState();
      const openWOs = store.getWorkorders();
      const isFullBarcode = /^\d{13}$/.test(trimmed);
      const isWoNumber = /^\d{5}$/.test(trimmed);
      const isFirst4 = /^\d{4}$/.test(trimmed);

      // Full 13-digit EAN-13 barcode — auto search
      if (isFullBarcode) {
        const prefix = trimmed[0];
        if (prefix === "1") {
          let found = openWOs.find((w) => w.id === trimmed);
          if (found) { openWorkorder(found, false); return; }
          let completed = await dbGetCompletedWorkorder(trimmed);
          if (completed) { openWorkorder(completed, true); return; }
          showTicketAlert("Workorder not found");
        } else if (prefix === "3") {
          let sale = await newCheckoutGetActiveSale(trimmed);
          if (sale) { openSale(sale, false); return; }
          sale = await dbGetCompletedSale(trimmed);
          if (sale) { openSale(sale, true); return; }
          showTicketAlert("Sale not found");
        } else if (prefix === "2") {
          let found = openWOs.find((w) => w.id === trimmed);
          if (found) { openWorkorder(found, false); return; }
          let completedWo = await dbGetCompletedWorkorder(trimmed);
          if (completedWo) { openWorkorder(completedWo, true); return; }
          let sale = await newCheckoutGetActiveSale(trimmed);
          if (sale) { openSale(sale, false); return; }
          sale = await dbGetCompletedSale(trimmed);
          if (sale) { openSale(sale, true); return; }
          showTicketAlert("Ticket not found");
        } else {
          showTicketAlert("Unrecognized barcode prefix");
        }
        return;
      }

      // 5-digit workorder number
      if (isWoNumber) {
        let found = openWOs.find((w) => w.workorderNumber === trimmed);
        if (found) { openWorkorder(found, false); return; }
        let results = await dbSearchCompletedWorkorders("workorderNumber", trimmed);
        if (results.length > 0) { openWorkorder(results[0], true); return; }
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
        return;
      }

      showTicketAlert("Enter a 13-digit barcode, 5-digit WO #, or first 4 digits");
    } catch (err) {
      log("Ticket search error:", err);
      showTicketAlert("Search error — please try again");
    } finally {
      _setTicketSearching(false);
    }
  }

  async function handleResumeStandaloneSale() {
    _setResumeLoading(true);
    _setActiveSales([]);
    try {
      let activeSales = await fetchStandaloneActiveSales();
      if (!activeSales || activeSales.length === 0) {
        showTicketAlert("No active standalone sales found");
        return;
      }
      _setActiveSales(activeSales.sort((a, b) => (b.millis || 0) - (a.millis || 0)));
    } catch (err) {
      log("Resume standalone sale error:", err);
      showTicketAlert("Error finding sale — please try again");
    } finally {
      _setResumeLoading(false);
    }
  }

  function handleSelectActiveSale(sale) {
    _setShowResumeModal(false);
    let store = useOpenWorkordersStore.getState();
    let wo = cloneDeep(WORKORDER_PROTO);
    wo.isStandaloneSale = true;
    wo.id = generateEAN13Barcode("1");
    wo.activeSaleID = sale.id;
    wo.startedBy = useLoginStore.getState().currentUser?.id;
    wo.startedOnMillis = Date.now();
    store.setWorkorder(wo);
    store.setOpenWorkorderID(wo.id);
    if (sale.customerID) {
      dbGetCustomer(sale.customerID).then((customer) => {
        if (customer) useCurrentCustomerStore.getState().setCustomer(customer, false);
      });
    }
    useTabNamesStore.getState().setItems({
      infoTabName: TAB_NAMES.infoTab.checkout,
      itemsTabName: TAB_NAMES.itemsTab.workorderItems,
      optionsTabName: TAB_NAMES.optionsTab.inventory,
    });
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
            onSubmitEditing={() => executeTicketSearch()}
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
              onPress={() => executeTicketSearch()}
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
      </View>
      <Tooltip text={sActiveSaleCount ? `${sActiveSaleCount} active sale${sActiveSaleCount === 1 ? "" : "s"}` : "No active sales"} position="top">
        <ScreenModal
          enabled={!sResumeLoading && !!sActiveSaleCount}
          handleModalActionInternally={true}
          showOuterModal={true}
          buttonLabel={sResumeLoading ? "Searching..." : "Resume Sale"}
          handleButtonPress={handleResumeStandaloneSale}
          buttonStyle={{
            borderRadius: 5,
            paddingHorizontal: 30,
            paddingVertical: 10,
            marginBottom: 10,
            borderWidth: 1,
            borderColor: C.buttonLightGreenOutline,
            backgroundColor: C.buttonLightGreen,
          }}
          buttonTextStyle={{ color: C.text, fontSize: 14, fontWeight: "600" }}
          Component={() => (
            <View
              style={{
                width: 420,
                maxHeight: "70%",
                backgroundColor: C.backgroundWhite,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: C.buttonLightGreenOutline,
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: gray(0.1),
                }}
              >
                <Text style={{ fontSize: 18, fontWeight: "bold", color: C.text }}>
                  Active Standalone Sales
                </Text>
                <Text style={{ fontSize: 12, color: gray(0.5), marginTop: 2 }}>
                  Select to resume
                </Text>
              </View>
              {sResumeLoading ? (
                <View style={{ paddingVertical: 40, alignItems: "center" }}>
                  <SmallLoadingIndicator />
                </View>
              ) : (
                <ScrollView style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
                  {sActiveSales.map((sale) => {
                    let items = sale.addedItems || [];
                    let itemCount = items.reduce((sum, item) => sum + (item.qty || 1), 0);
                    return (
                      <TouchableOpacity
                        key={sale.id}
                        onPress={() => handleSelectActiveSale(sale)}
                        style={{
                          backgroundColor: C.listItemWhite,
                          borderWidth: 1,
                          borderColor: C.buttonLightGreenOutline,
                          borderRadius: 8,
                          paddingHorizontal: 12,
                          paddingVertical: 10,
                          marginBottom: 8,
                        }}
                      >
                        <Text style={{ fontSize: 15, fontWeight: "600", color: C.text }}>
                          {sale.millis ? formatMillisForDisplay(sale.millis, true) : "Unknown date"}
                        </Text>
                        <View style={{ marginTop: 6 }}>
                          {items.length > 0 ? items.map((item, idx) => {
                            let inv = item.inventoryItem || item;
                            let name = inv.formalName || inv.informalName || "Item";
                            let price = inv.salePrice || inv.price || 0;
                            return (
                            <View key={idx} style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 2 }}>
                              <Text style={{ fontSize: 14, color: gray(0.5), flex: 1 }} numberOfLines={1}>
                                {(item.qty || 1) > 1 ? (item.qty + "x ") : ""}{name}
                              </Text>
                              <Text style={{ fontSize: 14, color: gray(0.5), marginLeft: 8 }}>
                                {formatCurrencyDisp(price * (item.qty || 1), true)}
                              </Text>
                            </View>);
                          }) : (
                            <Text style={{ fontSize: 14, color: gray(0.35) }}>No items</Text>
                          )}
                        </View>
                        <View style={{ height: 1, backgroundColor: gray(0.1), marginVertical: 6 }} />
                        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                          <Text style={{ fontSize: 14, color: gray(0.5) }}>
                            {itemCount} item{itemCount !== 1 ? "s" : ""}
                            {(sale.discount || 0) > 0 ? ("  |  Disc: " + formatCurrencyDisp(sale.discount, true)) : ""}
                          </Text>
                          <Text style={{ fontSize: 15, fontWeight: "bold", color: C.text }}>
                            {formatCurrencyDisp(sale.total || 0, true)}
                          </Text>
                        </View>
                        {(sale.amountCaptured || 0) > 0 && (
                          <Text style={{ fontSize: 13, color: C.green, marginTop: 2 }}>
                            Paid: {formatCurrencyDisp(sale.amountCaptured, true)}
                          </Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}
            </View>
          )}
        />
      </Tooltip>
      <Button_
        text="CLEAR SALE"
        onPress={() => {
          let store = useOpenWorkordersStore.getState();
          let oldWo = store.getOpenWorkorder();
          if (!oldWo) return;
          store.removeWorkorder(oldWo.id);
          let wo = cloneDeep(WORKORDER_PROTO);
          wo.isStandaloneSale = true;
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

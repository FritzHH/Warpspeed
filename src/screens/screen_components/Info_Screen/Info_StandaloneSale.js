/* eslint-disable */
import { View, Text, TextInput } from "react-native-web";
import { TAB_NAMES, RECEIPT_TYPES } from "../../../data";
import {
  useOpenWorkordersStore,
  useTabNamesStore,
  useCurrentCustomerStore,
  useAlertScreenStore,
  useCheckoutStore,
  useWorkorderPreviewStore,
  useTicketSearchStore,
} from "../../../stores";

import {
  Button_,
  SmallLoadingIndicator,
  Tooltip,
} from "../../../components";
import {
  generateEAN13Barcode,
  gray,
  log,
  printBuilder,
} from "../../../utils";
import { useRef, useState } from "react";
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
import { newCheckoutGetActiveSale } from "../modal_screens/newCheckoutModalScreen/newCheckoutFirebaseCalls";

export const StandaloneSaleComponent = ({}) => {
  const [sTicketSearch, _setTicketSearch] = useState("");
  const [sTicketSearching, _setTicketSearching] = useState(false);

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
        <Tooltip text="Pop register" position="top">
          <Button_
            icon={ICONS.cashRegister}
            iconSize={40}
            onPress={() =>
              dbSavePrintObj(
                { id: generateEAN13Barcode(), receiptType: RECEIPT_TYPES.register },
                "8C:77:3B:60:33:22_Star MCP31"
              )
            }
          />
        </Tooltip>
        <Tooltip text="Test Print" position="top">
          <Button_
            icon={ICONS.receipt}
            iconSize={40}
            onPress={() =>
              dbSavePrintObj(printBuilder.test(), "8C:77:3B:60:33:22_Star MCP31")
            }
          />
        </Tooltip>
      </View>
    </View>
  );
};

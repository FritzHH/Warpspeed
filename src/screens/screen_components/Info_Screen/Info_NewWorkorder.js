/* eslint-disable */

import { View, TextInput, Button } from "react-native-web";
import {
  formatPhoneWithDashes,
  createNewWorkorder,
  generateEAN13Barcode,
  log,
  removeDashesFromPhone,
  stringIsNumeric,
  gray,
  capitalizeAllWordsInSentence,
  extractRandomFiveDigits,
  lightenRGBByPercent,
} from "../../../utils";
import { ScreenModal, Button_, PhoneNumberInput, Tooltip, TextInput_, SmallLoadingIndicator } from "../../../components";
import { CUSTOMER_PROTO, SETTINGS_OBJ, TAB_NAMES, WORKORDER_PROTO } from "../../../data";
import React, { useEffect, useRef, useState, useMemo } from "react";
import { cloneDeep } from "lodash";
import {
  useCurrentCustomerStore,
  useCustomerSearchStore,
  useTabNamesStore,
  useOpenWorkordersStore,
  useLoginStore,
  useWorkorderPreviewStore,
  useAlertScreenStore,
  useTicketSearchStore,
  useCheckoutStore,
} from "../../../stores";
import { C, COLOR_GRADIENTS, ICONS } from "../../../styles";
import {
  dbSearchCustomersByEmail,
  dbSearchCustomersByName,
  dbSearchCustomersByPhone,
  dbGetCompletedWorkorder,
  dbSearchCompletedWorkorders,
  dbGetCustomer,
  dbSearchWorkordersByIdPrefix,
  dbSearchSalesByIdPrefix,
  dbGetCompletedSale,
} from "../../../db_calls_wrapper";
import { newCheckoutGetActiveSale } from "../modal_screens/newCheckoutModalScreen/newCheckoutFirebaseCalls";
import { CustomerInfoScreenModalComponent } from "../modal_screens/CustomerInfoModalScreen";
export function NewWorkorderComponent({}) {
  // store getters ///////////////////////////////////////////////////////////////
  const zCustomerSearchResults = useCustomerSearchStore((s) => s.searchResults);

  //////////////////////////////////////////////////////////////////////
  const [sTextInput, _setTextInput] = React.useState("");
  const [sSearchFieldName, _setSearchFieldName] = React.useState("phone");
  const [sCustomerInfo, _setCustomerInfo] = React.useState(null);
  const [buttonVisible, setButtonVisible] = React.useState(false);
  const [sTicketSearch, _setTicketSearch] = React.useState("");
  const [sTicketSearching, _setTicketSearching] = React.useState(false);
  const searchTimerRef = useRef(null);
  const containerRef = useRef(null);

  function openWorkorder(wo, isCompleted) {
    const store = useOpenWorkordersStore.getState();
    store.setWorkorderPreviewID(null);
    if (isCompleted) {
      store.setWorkorder(wo, false);
      store.setLockedWorkorderID(wo.id);
      store.setOpenWorkorderID(wo.id);
    } else {
      // lock if payment is complete even on open workorders
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
      // completed sale → open refund screen via receiptScan trigger in BaseScreen
      useCheckoutStore.getState().setStringOnly(sale.id);
    } else {
      // partial/active sale → open checkout screen
      useCheckoutStore.getState().setViewOnlySale(sale);
      useCheckoutStore.getState().setIsCheckingOut(true);
    }
    _setTicketSearch("");
  }

  async function handleTicketSearch(input) {
    _setTicketSearch(input);
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
          // Warpspeed workorder barcode — check local first
          let found = openWOs.find((w) => w.id === trimmed);
          if (found) { openWorkorder(found, false); return; }
          let completed = await dbGetCompletedWorkorder(trimmed);
          if (completed) { openWorkorder(completed, true); return; }
          showTicketAlert("Workorder not found");
        } else if (prefix === "3") {
          // Warpspeed sale barcode — search by ID
          let sale = await newCheckoutGetActiveSale(trimmed);
          if (sale) { openSale(sale, false); return; }
          sale = await dbGetCompletedSale(trimmed);
          if (sale) { openSale(sale, true); return; }
          showTicketAlert("Sale not found");
        } else if (prefix === "2") {
          // Lightspeed legacy barcode — could be sale (22) or workorder (25)
          // Check workorders first (local then Firestore)
          let found = openWOs.find((w) => w.id === trimmed);
          if (found) { openWorkorder(found, false); return; }
          let completedWo = await dbGetCompletedWorkorder(trimmed);
          if (completedWo) { openWorkorder(completedWo, true); return; }
          // Check sales
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

      // 4-digit prefix search — button press search
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
          // Lightspeed legacy — search both workorders and sales
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

  // dev ////////////////////////////////////
  useEffect(() => {
    // handleTextChange(sTextInput);
  }, [sTextInput]);
  // dev ///////////////////////////////////

  const zIsSearching = useCustomerSearchStore((s) => s.isSearching);

  useEffect(() => {
    if (zCustomerSearchResults.length > 0 || zIsSearching) {
      useTabNamesStore.getState().setItemsTabName(TAB_NAMES.itemsTab.customerList);
    } else {
      // Only clear to empty if items tab is currently showing customerList
      // (user cleared their search). Don't override other tabs like Dashboard.
      const currentTab = useTabNamesStore.getState().itemsTabName;
      if (currentTab === TAB_NAMES.itemsTab.customerList) {
        useTabNamesStore.getState().setItemsTabName(TAB_NAMES.itemsTab.empty);
      }
    }
  }, [zCustomerSearchResults, zIsSearching]);

  // Update button visibility when dependencies change
  useEffect(() => {
    const rawDigits = removeDashesFromPhone(sTextInput);
    const shouldShow =
      (sSearchFieldName === "phone" &&
        rawDigits.length === 10 &&
        zCustomerSearchResults.length === 0) ||
      (sSearchFieldName !== "phone" && sTextInput.length >= 3);

    setButtonVisible(shouldShow);
  }, [sSearchFieldName, sTextInput, zCustomerSearchResults.length]);

  async function handleTextChange(incomingText = "") {
    // log(incomingText);
    let isEmail;
    let rawText = removeDashesFromPhone(incomingText);
    let isNumeric = stringIsNumeric(incomingText.substring(0, 3));
    if (incomingText.includes("@")) {
      isEmail = true;
      isNumeric = false;
    }
    // let searchStr = "";

    const searchFun = async (searchStrings, options, displayQuery) => {
      //dev
      let funs = [];
      options.forEach((option) => {
        searchStrings.forEach((searchString) => {
          if (option === "email")
            funs.push(() => dbSearchCustomersByEmail(searchString));
          if (option === "name")
            funs.push(() => dbSearchCustomersByName(searchString));
          if (option === "phone")
            funs.push(() => dbSearchCustomersByPhone(searchString));
        });
      });

      // Update the store with the full search query for display filtering (immediate)
      const primaryType = options.includes("phone") ? "phone" : options.includes("email") ? "email" : "name";
      useCustomerSearchStore.getState().setSearchQuery(displayQuery || searchStrings.join(" "), primaryType);

      // Clear old results immediately so loading indicator shows right away
      useCustomerSearchStore.getState().setSearchResults([]);
      useCustomerSearchStore.getState().setIsSearching(true);
      // Debounce the actual DB calls (300ms)
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      searchTimerRef.current = setTimeout(() => {
        let pending = funs.length;
        if (pending === 0) {
          useCustomerSearchStore.getState().setIsSearching(false);
          return;
        }
        funs.forEach((fun) => {
          fun().then((res) => {
            useCustomerSearchStore.getState().addToSearchResults(res);
          }).finally(() => {
            pending--;
            if (pending === 0) useCustomerSearchStore.getState().setIsSearching(false);
          });
        });
      }, 300);
    };

    if (rawText.length <= 2) {
      // do nothing, string too short to search
      _setTextInput(rawText);
      useCustomerSearchStore.getState().reset();
      return;
    } else if (isNumeric && rawText.length <= 3) {
      // check to see if the last character is a '-' in the string before user edit
      let searchStr = [];
      if (sTextInput.length === 4) {
        searchStr = rawText.substring(0, 2);
        _setTextInput(searchStr);
      } else {
        searchStr = rawText;
        _setTextInput(formatPhoneWithDashes(searchStr));
      }
      if (rawText.length >= 7) searchFun([searchStr], ["phone"]);
      return;
    } else if (
      isNumeric &&
      incomingText.includes("-") &&
      rawText.length === 6
    ) {
      let searchStr = rawText;
      if (sTextInput.length === 8) {
        // there was a dash, user deleted it so remove the number preceding the dash
        searchStr = rawText.substring(0, 5);
      }
      _setTextInput(formatPhoneWithDashes(searchStr));
      if (rawText.length >= 7) searchFun([searchStr], ["phone"]);
      return;
    } else if (isNumeric && rawText.length > 10) {
      // do nothing, search ran on the last round and do not enter the new
      return;
    } else if (isNumeric) {
      _setTextInput(formatPhoneWithDashes(rawText));
      if (rawText.length >= 7) searchFun([rawText], ["phone"]);
      return;
    }

    // now we know the user has entered a name or email
    _setTextInput(incomingText);
    if (isEmail) {
      // run email search
      searchFun([incomingText], ["email"]);
    } else {
      // name search — only query the last word (most recent/narrowest term)
      // previous words' results are already cached in the store
      let split;
      if (incomingText.includes("  ")) {
        split = incomingText.split("  ");
      } else {
        split = incomingText.split(" ");
      }
      let lastWord = split.filter(Boolean).pop();
      if (lastWord) searchFun([lastWord], ["name"], incomingText);
    }
  }

  function handleCreateCustomerBtnPressed() {
    let custInfo = cloneDeep(CUSTOMER_PROTO);
    if (sSearchFieldName === "phone") {
      custInfo.customerCell = removeDashesFromPhone(sTextInput);
    } else {
      if (sTextInput.includes("@")) {
        custInfo.email = sTextInput;
      } else {
        let split = sTextInput.split(" ");
        custInfo.first = split[0];
        if (split[1]) custInfo.last = split[1];
      }
    }
    // log(custInfo);
    // do not set the customer id this is how the next screen knows it is a new customer. we will set the id in the modal automatically on creation
    _setCustomerInfo(custInfo);
  }

  function handleStartStandaloneSalePress() {
    useLoginStore.getState().requireLogin(() => {
      let store = useOpenWorkordersStore.getState();
      store.setWorkorderPreviewID(null);
      let existing = store.workorders.find((o) => o.isStandaloneSale);

      if (existing) {
        let elapsed = Date.now() - (existing.lastInteractionMillis || existing.startedOnMillis || 0);
        if (elapsed > 5 * 60 * 1000) {
          store.removeWorkorder(existing.id);
        } else {
          store.setOpenWorkorderID(existing.id);
          useTabNamesStore.getState().setItems({
            infoTabName: TAB_NAMES.infoTab.checkout,
            itemsTabName: TAB_NAMES.itemsTab.workorderItems,
            optionsTabName: TAB_NAMES.optionsTab.inventory,
          });
          return;
        }
      }

      let wo = createNewWorkorder({
        startedByFirst: useLoginStore.getState().currentUser?.first,
        startedByLast: useLoginStore.getState().currentUser?.last,
        isStandaloneSale: true,
      });

      useOpenWorkordersStore.getState().setWorkorder(wo);
      useOpenWorkordersStore.getState().setOpenWorkorderID(wo.id);
      useTabNamesStore.getState().setItems({
        infoTabName: TAB_NAMES.infoTab.checkout,
        itemsTabName: TAB_NAMES.itemsTab.workorderItems,
        optionsTabName: TAB_NAMES.optionsTab.inventory,
      });
    });
  }

  function handleCancelCreateNewCustomerPress() {
    _setTextInput("");
    _setSearchFieldName("phone");
    _setCustomerInfo(null);
  }

  function handleCreateNewCustomerPressed(customerInfoFromModal) {
    useLoginStore.getState().requireLogin(() => {
      // first create new customer — use the modal's updated state, not the stale local copy
      let newCustomer = cloneDeep(customerInfoFromModal || sCustomerInfo);
      newCustomer.id = generateEAN13Barcode();
      newCustomer.millisCreated = new Date().getTime();

      // next create new empty workorder for automatic population of next screen
      let newWorkorder = createNewWorkorder({
        customerID: newCustomer.id,
        customerFirst: newCustomer.first,
        customerLast: newCustomer.last,
        customerCell: newCustomer.customerCell || newCustomer.customerLandline,
        customerLandline: newCustomer.customerLandline,
        customerEmail: newCustomer.email,
        customerContactRestriction: newCustomer.contactRestriction,
        startedByFirst: useLoginStore.getState().getCurrentUser().first,
        startedByLast: useLoginStore.getState().getCurrentUser().last,
        status: SETTINGS_OBJ.statuses[0]?.id || "",
      });

      // add in the newly created workorder to the customer's file
      newCustomer.workorders.push(newWorkorder.id);
      _setCustomerInfo(newCustomer);
      useCurrentCustomerStore.getState().setCustomer(newCustomer);
      useOpenWorkordersStore.getState().setWorkorder(newWorkorder, false)
      useOpenWorkordersStore.getState().setOpenWorkorderID(newWorkorder.id)
      useTabNamesStore.getState().setItems({
        infoTabName: TAB_NAMES.infoTab.workorder,
        itemsTabName: TAB_NAMES.itemsTab.workorderItems,
        optionsTabName: TAB_NAMES.optionsTab.inventory,
      });
      useCustomerSearchStore.getState().reset();
    });
  }

  //////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////
  return (
    <View
      ref={containerRef}
      onClick={() => {
        let input = containerRef.current?.querySelector("input");
        if (input) input.focus();
      }}
      style={{
        width: "100%",
        height: "100%",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      {/* Ticket search input */}
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
            onChangeText={(val) => handleTicketSearch(val)}
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

      <View
        style={{
          alignItems: "flex-end",
          width: "100%",
          padding: 20,
          marginTop: "60%",
        }}
      >
        {sSearchFieldName === "phone" ? (
          <PhoneNumberInput
            boxStyle={{
              width: "8%",
              height: 37,
              outlineStyle: "none",
              borderColor: gray(0.08),
              fontSize: 25,
              color: C.text,
            }}
            autoFocus={true}
            value={sTextInput}
            onChangeText={(val) => handleTextChange(val)}
            dashStyle={{ width: 10, marginHorizontal: 4 }}
            dashColor={gray(0.2)}
            textColor={C.text}
          />
        ) : (
          <TextInput
            value={capitalizeAllWordsInSentence(sTextInput)}
            placeholder={"First, last or email"}
            placeholderTextColor={gray(0.3)}
            onChangeText={(val) => handleTextChange(val)}
            autoFocus={true}
            style={{
              caretColor: C.cursorRed,
              color: C.text,
              borderBottomWidth: 1,
              borderColor: gray(0.2),
              width: "80%",
              height: 37,
              outlineStyle: "none",
              fontSize: 18,
              alignSelf: "center",
            }}
          />
        )}
        <View
          style={{ flexDirection: "row", alignItems: "center", marginTop: 5 }}
        >
          {useMemo(
            () => (
              <ScreenModal
                showOuterModal={true}
                modalVisible={sCustomerInfo}
                ButtonComponent={() => (
                  <Button_
                    text={"CUSTOMER"}
                    buttonStyle={{
                      marginRight: 20,
                      height: 37,
                      marginTop: 10,
                      paddingHorizontal: 25,
                    }}
                    textStyle={{ fontSize: 15 }}
                    colorGradientArr={COLOR_GRADIENTS.blue}
                    icon={ICONS.new}
                    iconSize={25}
                    onPress={handleCreateCustomerBtnPressed}
                    visible={buttonVisible}
                  />
                )}
                Component={() => (
                  <CustomerInfoScreenModalComponent
                    incomingCustomer={sCustomerInfo}
                    isNewCustomer={true}
                    button1Text={"Create Customer"}
                    button2Text={"Cancel"}
                    handleButton1Press={handleCreateNewCustomerPressed}
                    handleButton2Press={handleCancelCreateNewCustomerPress}
                  />
                )}
              />
            ),
            [sCustomerInfo, buttonVisible]
          )}
          <Tooltip text={sSearchFieldName === "phone" ? "Search by name" : "Search by phone"} position="top">
            <Button_
              icon={ICONS.reset1}
              buttonStyle={{ marginTop: 10, paddingHorizontal: 0 }}
              onPress={() => {
                if (sSearchFieldName === "phone") {
                  _setSearchFieldName("name");
                } else {
                  _setSearchFieldName("phone");
                }
                handleTextChange("");
              }}
            />
          </Tooltip>
        </View>
      </View>
      <View
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          alignItems: "flex-end",
          marginRight: 11,
          marginBottom: 20,
        }}
      >
        <Tooltip text="Standalone Sale" position="top">
          <Button_
            onPress={handleStartStandaloneSalePress}
            icon={ICONS.cashRegister}
            iconSize={35}
          />
        </Tooltip>
      </View>

      {/** customer info modal */}
    </View>
  );
}



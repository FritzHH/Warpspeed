/* eslint-disable */

import { View, TextInput, Button } from "react-native-web";
import {
  formatPhoneWithDashes,
  createNewWorkorder,
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
} from "../../../stores";
import { C, COLOR_GRADIENTS, ICONS } from "../../../styles";
import {
  dbSearchCustomersByEmail,
  dbSearchCustomersByName,
  dbSearchCustomersByPhone,
} from "../../../db_calls_wrapper";
import { executeTicketSearch } from "../../../shared/ticketSearch";
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

  async function handleExecuteTicketSearch() {
    _setTicketSearching(true);
    try {
      await executeTicketSearch(sTicketSearch, () => _setTicketSearch(""));
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

      useCustomerSearchStore.getState().setIsSearching(true);
      // Debounce the actual DB calls (300ms)
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      searchTimerRef.current = setTimeout(() => {
        let pending = funs.length;
        if (pending === 0) {
          useCustomerSearchStore.getState().setIsSearching(false);
          return;
        }
        let allResults = [];
        funs.forEach((fun) => {
          fun().then((res) => {
            if (res) allResults.push(...res);
          }).finally(() => {
            pending--;
            if (pending === 0) {
              let existing = useCustomerSearchStore.getState().searchResults;
              let newIds = new Set(allResults.map((r) => r.id));
              let existingIds = new Set(existing.map((r) => r.id));
              let toAdd = allResults.filter((r) => !existingIds.has(r.id));
              let hasRemovals = existing.some((r) => !newIds.has(r.id));
              if (hasRemovals || toAdd.length > 0) {
                let kept = existing.filter((r) => newIds.has(r.id));
                useCustomerSearchStore.getState().setSearchResults([...kept, ...toAdd]);
              }
              useCustomerSearchStore.getState().setIsSearching(false);
            }
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
      useCurrentCustomerStore.getState().setCustomer(null, false);
      let store = useOpenWorkordersStore.getState();
      store.setWorkorderPreviewID(null);

      let wo = createNewWorkorder({
        startedByFirst: useLoginStore.getState().currentUser?.first,
        startedByLast: useLoginStore.getState().currentUser?.last,
      });

      store.setWorkorder(wo, false);
      store.setOpenWorkorderID(wo.id);
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
      newCustomer.id = crypto.randomUUID();
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
            onChangeText={(val) => {
              _setTicketSearch(val);
              let trimmed = val.trim();
              if (/^\d{12}$/.test(trimmed)) {
                _setTicketSearch("");
                executeTicketSearch(trimmed);
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



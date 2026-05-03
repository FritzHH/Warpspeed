/* eslint-disable */

import { View, Text, TextInput, Button, TouchableOpacity } from "react-native-web";
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
import { ScreenModal, Button_, PhoneNumberInput, Tooltip, TextInput_ } from "../../../components";
import { CUSTOMER_PROTO, SETTINGS_OBJ, TAB_NAMES, WORKORDER_PROTO } from "../../../data";
import React, { useEffect, useRef, useState, useMemo } from "react";
import { cloneDeep } from "lodash";
import {
  useCurrentCustomerStore,
  useCustomerSearchStore,
  useWorkorderSearchStore,
  useTabNamesStore,
  useOpenWorkordersStore,
  useLoginStore,
  useCheckoutStore,
} from "../../../stores";
import { C, COLOR_GRADIENTS, ICONS } from "../../../styles";
import {
  dbSearchCustomersByEmail,
  dbSearchCustomersByName,
  dbSearchCustomersByPhone,
  dbSearchCompletedWorkordersByNumber,
  dbGetCompletedWorkorder,
  dbGetCompletedSale,
  dbGetCustomer,
  startNewWorkorder,
} from "../../../db_calls_wrapper";
import { TicketSearchInput } from "../../../shared/TicketSearchInput";
import { readTransaction } from "../modal_screens/newCheckoutModalScreen/newCheckoutFirebaseCalls";
import { CustomerInfoScreenModalComponent } from "../modal_screens/CustomerInfoModalScreen";
export function NewWorkorderComponent({}) {
  // store getters ///////////////////////////////////////////////////////////////
  const zCustomerSearchResults = useCustomerSearchStore((s) => s.searchResults);

  //////////////////////////////////////////////////////////////////////
  const [sTextInput, _setTextInput] = React.useState("");
  const [sSearchFieldName, _setSearchFieldName] = React.useState("phone");
  const [sCustomerInfo, _setCustomerInfo] = React.useState(null);
  const [buttonVisible, setButtonVisible] = React.useState(false);
  const searchTimerRef = useRef(null);
  const woSearchTimerRef = useRef(null);
  const containerRef = useRef(null);
  const phoneInputRef = useRef(null);

  // dev ////////////////////////////////////
  useEffect(() => {
    // handleTextChange(sTextInput);
  }, [sTextInput]);
  // dev ///////////////////////////////////

  const zIsSearching = useCustomerSearchStore((s) => s.isSearching);
  const zWoSearchResults = useWorkorderSearchStore((s) => s.searchResults);
  const zWoIsSearching = useWorkorderSearchStore((s) => s.isSearching);

  useEffect(() => {
    if (zWoSearchResults.length > 0 || zWoIsSearching) {
      useTabNamesStore.getState().setItemsTabName(TAB_NAMES.itemsTab.workorderSearchResults);
    } else if (zCustomerSearchResults.length > 0 || zIsSearching) {
      useTabNamesStore.getState().setItemsTabName(TAB_NAMES.itemsTab.customerList);
    } else {
      const currentTab = useTabNamesStore.getState().itemsTabName;
      if (
        currentTab === TAB_NAMES.itemsTab.customerList ||
        currentTab === TAB_NAMES.itemsTab.workorderSearchResults
      ) {
        useTabNamesStore.getState().setItemsTabName(TAB_NAMES.itemsTab.empty);
      }
    }
  }, [zCustomerSearchResults, zIsSearching, zWoSearchResults, zWoIsSearching]);

  // Update button visibility when dependencies change
  useEffect(() => {
    if (/^wo/i.test(sTextInput)) {
      setButtonVisible(false);
      return;
    }
    const rawDigits = removeDashesFromPhone(sTextInput);
    const shouldShow =
      (sSearchFieldName === "phone" &&
        rawDigits.length === 10 &&
        zCustomerSearchResults.length === 0) ||
      (sSearchFieldName !== "phone" && sTextInput.length >= 3);

    setButtonVisible(shouldShow);
  }, [sSearchFieldName, sTextInput, zCustomerSearchResults.length]);

  async function handleTextChange(incomingText = "") {
    // Workorder search mode — detect "WO" or "wo" prefix
    const woMatch = incomingText.match(/^wo/i);
    if (woMatch) {
      _setTextInput(incomingText);
      useCustomerSearchStore.getState().reset();

      const afterPrefix = incomingText.slice(2).trim();
      if (afterPrefix.length < 1) {
        useWorkorderSearchStore.getState().reset();
        return;
      }

      const searchPrefix = "WO" + afterPrefix.toUpperCase();
      useWorkorderSearchStore.getState().setSearchQuery(afterPrefix);
      useWorkorderSearchStore.getState().setIsSearching(true);

      // Immediate: local search against open workorders
      const openWOs = useOpenWorkordersStore.getState().getWorkorders() || [];
      const localMatches = openWOs
        .filter((w) => (w.workorderNumber || "").toUpperCase().startsWith(searchPrefix))
        .map((w) => ({ data: w, isCompleted: false }));

      useWorkorderSearchStore.getState().setSearchResults(localMatches);

      // Debounced: DB search for completed workorders
      if (woSearchTimerRef.current) clearTimeout(woSearchTimerRef.current);
      woSearchTimerRef.current = setTimeout(async () => {
        try {
          const completedResults = await dbSearchCompletedWorkordersByNumber(afterPrefix.toUpperCase());
          const completedMatches = completedResults.map((w) => ({ data: w, isCompleted: true }));
          const currentLocal = useWorkorderSearchStore.getState().getSearchResults()
            .filter((r) => !r.isCompleted);
          const localIDs = new Set(currentLocal.map((r) => r.data.id));
          const newCompleted = completedMatches.filter((r) => !localIDs.has(r.data.id));
          useWorkorderSearchStore.getState().setSearchResults([...currentLocal, ...newCompleted]);
        } catch (e) {
          // silently fail
        } finally {
          useWorkorderSearchStore.getState().setIsSearching(false);
        }
      }, 300);

      return;
    }

    // Clear workorder search when not in WO mode
    useWorkorderSearchStore.getState().reset();

    // 13-digit barcode scan — auto-search by prefix
    let rawDigits = incomingText.replace(/\D/g, "");
    if (rawDigits.length === 13 && /^\d{13}$/.test(rawDigits)) {
      _setTextInput(rawDigits);
      useCustomerSearchStore.getState().reset();
      let prefix = rawDigits[0];

      if (prefix === "1") {
        // Workorder ID
        let openWOs = useOpenWorkordersStore.getState().getWorkorders() || [];
        let found = openWOs.find((w) => w.id === rawDigits);
        if (found) {
          useOpenWorkordersStore.getState().setOpenWorkorderID(found.id);
          if (found.customerID) {
            dbGetCustomer(found.customerID).then((c) => {
              if (c) useCurrentCustomerStore.getState().setCustomer(c, false);
            });
          }
          useTabNamesStore.getState().setItems({
            infoTabName: TAB_NAMES.infoTab.workorder,
            itemsTabName: TAB_NAMES.itemsTab.workorderItems,
            optionsTabName: TAB_NAMES.optionsTab.inventory,
          });
        } else {
          dbGetCompletedWorkorder(rawDigits).then((wo) => {
            if (wo) {
              let store = useOpenWorkordersStore.getState();
              store.setWorkorder(wo, false);
              store.setLockedWorkorderID(wo.id);
              store.setOpenWorkorderID(wo.id);
              useTabNamesStore.getState().setItems({
                infoTabName: TAB_NAMES.infoTab.workorder,
                itemsTabName: TAB_NAMES.itemsTab.workorderItems,
                optionsTabName: TAB_NAMES.optionsTab.inventory,
              });
              if (wo.customerID) {
                dbGetCustomer(wo.customerID).then((c) => {
                  if (c) useCurrentCustomerStore.getState().setCustomer(c, false);
                });
              }
            }
          });
        }
      } else if (prefix === "2") {
        // Sale ID — open in checkout
        useCheckoutStore.getState().setStringOnly(rawDigits);
      } else if (prefix === "3") {
        // Transaction ID — open the sale that contains this transaction
        readTransaction(rawDigits).then((txn) => {
          if (txn?.saleID) {
            useCheckoutStore.getState().setStringOnly(txn.saleID);
          }
        });
      }
      return;
    }

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
      if (rawText.length >= 5) searchFun([searchStr], ["phone"]);
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
      if (rawText.length >= 5) searchFun([searchStr], ["phone"]);
      return;
    } else if (isNumeric && rawText.length > 10) {
      return;
    } else if (isNumeric) {
      _setTextInput(formatPhoneWithDashes(rawText));
      if (rawText.length >= 4) searchFun([rawText], ["phone"]);
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
    useLoginStore.getState().requireLogin(async () => {
      useCurrentCustomerStore.getState().setCustomer(null, false);
      useOpenWorkordersStore.getState().setWorkorderPreviewID(null);
      await startNewWorkorder();
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
    useLoginStore.getState().requireLogin(async () => {
      let newCustomer = cloneDeep(customerInfoFromModal || sCustomerInfo);
      newCustomer.id = crypto.randomUUID();
      newCustomer.millisCreated = new Date().getTime();

      _setCustomerInfo(newCustomer);
      useCurrentCustomerStore.getState().setCustomer(newCustomer);
      await startNewWorkorder(newCustomer);
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
        let input = phoneInputRef.current?.querySelector("input");
        if (input) input.focus();
      }}
      style={{
        width: "100%",
        height: "100%",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <TicketSearchInput />

      <View
        ref={phoneInputRef}
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
            autoComplete="one-time-code"
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
            autoComplete="one-time-code"
            style={{
              caretColor: C.cursorRed,
              color: C.text,
              borderBottomWidth: 1,
              borderColor: gray(0.2),
              width: "100%",
              height: 37,
              outlineStyle: "none",
              fontSize: 18,
            }}
          />
        )}
        <TouchableOpacity
          onPress={() => {
            _setSearchFieldName(sSearchFieldName === "phone" ? "name" : "phone");
            handleTextChange("");
          }}
          style={{ alignSelf: "flex-end", marginTop: 8, backgroundColor: C.blue, borderRadius: 5, paddingHorizontal: 10, paddingVertical: 4 }}
        >
          <Text style={{ fontSize: 14, fontWeight: "600", color: C.textWhite }}>
            {sSearchFieldName === "phone" ? "ABC" : "123"}
          </Text>
        </TouchableOpacity>
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
        <Tooltip text="New sale" position="top">
          <Button_
            onPress={handleStartStandaloneSalePress}
            icon={ICONS.cashRegister}
            iconSize={35}
          />
        </Tooltip>
      </View>

    </View>
  );
}



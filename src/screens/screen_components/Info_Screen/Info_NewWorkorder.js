/* eslint-disable */

import React, { useEffect, useRef, useState, useMemo } from "react";
import cloneDeep from "lodash/cloneDeep";
import {
  formatPhoneWithDashes,
  removeDashesFromPhone,
  stringIsNumeric,
  gray,
  capitalizeAllWordsInSentence,
} from "../../../utils";
import { Button, ScreenModal, PhoneNumberInput, Tooltip } from "../../../dom_components";
import { CUSTOMER_PROTO, TAB_NAMES } from "../../../data";
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
  dbGetCustomer,
  startNewWorkorder,
} from "../../../db_calls_wrapper";
import { TicketSearchInput } from "../../../shared/TicketSearchInput";
import { readTransaction } from "../modal_screens/newCheckoutModalScreen/newCheckoutFirebaseCalls";
import { CustomerInfoScreenModalComponent } from "../modal_screens/CustomerInfoModalScreen";
import styles from "./Info_NewWorkorder.module.css";

export function NewWorkorderComponent({}) {
  // store getters ///////////////////////////////////////////////////////////////
  const zCustomerSearchResults = useCustomerSearchStore((s) => s.searchResults);
  const zIsSearching = useCustomerSearchStore((s) => s.isSearching);
  const zWoSearchResults = useWorkorderSearchStore((s) => s.searchResults);
  const zWoIsSearching = useWorkorderSearchStore((s) => s.isSearching);

  //////////////////////////////////////////////////////////////////////
  const [sTextInput, _setTextInput] = useState("");
  const [sSearchFieldName, _setSearchFieldName] = useState("phone");
  const [sCustomerInfo, _setCustomerInfo] = useState(null);
  const [buttonVisible, setButtonVisible] = useState(false);
  const searchTimerRef = useRef(null);
  const woSearchTimerRef = useRef(null);
  const containerRef = useRef(null);
  const phoneInputRef = useRef(null);

  // dev ////////////////////////////////////
  useEffect(() => {
    // handleTextChange(sTextInput);
  }, [sTextInput]);
  // dev ///////////////////////////////////

  useEffect(() => {
    if (zWoSearchResults.length > 0 || zWoIsSearching) {
      useTabNamesStore.getState().setItemsTabName(TAB_NAMES.itemsTab.workorderSearchResults);
    } else if (zCustomerSearchResults.length > 0 || zIsSearching) {
      useTabNamesStore.getState().setItemsTabName(TAB_NAMES.itemsTab.customerList);
    } else if (sTextInput.length > 0) {
      useTabNamesStore.getState().setItemsTabName(TAB_NAMES.itemsTab.empty);
    } else {
      const currentTab = useTabNamesStore.getState().itemsTabName;
      if (
        currentTab === TAB_NAMES.itemsTab.customerList ||
        currentTab === TAB_NAMES.itemsTab.workorderSearchResults ||
        currentTab === TAB_NAMES.itemsTab.empty
      ) {
        useTabNamesStore.getState().setItemsTabName(TAB_NAMES.itemsTab.recentCustomers);
      }
    }
  }, [zCustomerSearchResults, zIsSearching, zWoSearchResults, zWoIsSearching, sTextInput]);

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
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      _setTextInput(rawText);
      useCustomerSearchStore.getState().reset();
      return;
    } else if (isNumeric && rawText.length <= 3) {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      // check to see if the last character is a '-' in the string before user edit
      let searchStr = [];
      if (sTextInput.length === 4) {
        searchStr = rawText.substring(0, 2);
        _setTextInput(searchStr);
      } else {
        searchStr = rawText;
        _setTextInput(formatPhoneWithDashes(searchStr));
      }
      useCustomerSearchStore.getState().reset();
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
    <div
      ref={containerRef}
      onClick={() => {
        if (useLoginStore.getState().showLoginScreen) return;
        const input = phoneInputRef.current?.querySelector("input");
        if (input) input.focus();
      }}
      className={styles.container}
    >
      <TicketSearchInput />

      <div ref={phoneInputRef} className={styles.inputBlock}>
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
          <input
            value={capitalizeAllWordsInSentence(sTextInput)}
            placeholder="First, last or email"
            onChange={(e) => handleTextChange(e.target.value)}
            autoFocus
            autoComplete="one-time-code"
            className={styles.nameInput}
            style={{
              caretColor: C.cursorRed,
              color: C.text,
              borderBottomColor: gray(0.2),
            }}
          />
        )}
        <button
          type="button"
          onClick={() => {
            _setSearchFieldName(sSearchFieldName === "phone" ? "name" : "phone");
            handleTextChange("");
          }}
          className={styles.toggleBtn}
          style={{ backgroundColor: C.blue }}
        >
          {sSearchFieldName === "phone" ? "ABC" : "123"}
        </button>
        <div className={styles.modalRow}>
          {useMemo(
            () => (
              <ScreenModal
                showOuterModal={true}
                modalVisible={sCustomerInfo}
                ButtonComponent={() => (
                  <Button
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
        </div>
      </div>

      <div onClick={(e) => e.stopPropagation()} className={styles.saleBtnRow}>
        <Tooltip text="Sale screen" position="top">
          <Button
            onPress={handleStartStandaloneSalePress}
            icon={ICONS.cashRegister}
            iconSize={35}
          />
        </Tooltip>
      </div>
    </div>
  );
}

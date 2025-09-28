/* eslint-disable */

import { View, TextInput, Button } from "react-native-web";
import {
  formatPhoneWithDashes,
  createNewWorkorder,
  generateUPCBarcode,
  log,
  removeDashesFromPhone,
  stringIsNumeric,
  gray,
  capitalizeAllWordsInSentence,
} from "../../../utils";
import { ScreenModal, Button_, PhoneNumberInput } from "../../../components";
import { CUSTOMER_PROTO, TAB_NAMES, WORKORDER_PROTO } from "../../../data";
import React, { useEffect, useState, useMemo } from "react";
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
import { CustomerInfoScreenModalComponent } from "../modal_screens/CustomerInfoModalScreen";
export function NewWorkorderComponent({}) {
  // store setters ////////////////////////////////////////////////////////////////
  const _zSetOptionsTabName = useTabNamesStore(
    (state) => state.setOptionsTabName
  );
  const _zSetItemsTabName = useTabNamesStore((state) => state.setItemsTabName);
  const _zSetInfoTabName = useTabNamesStore((state) => state.setInfoTabName);
  const _zSetOpenWorkorder = useOpenWorkordersStore(
    (state) => state.setWorkorder
  );

  // store getters ///////////////////////////////////////////////////////////////
  const zCustomerSearchResults = useCustomerSearchStore((s) =>
    s.getSearchResults()
  );

  //////////////////////////////////////////////////////////////////////
  const [sTextInput, _setTextInput] = React.useState("239");
  const [sSearchFieldName, _setSearchFieldName] = React.useState("phone");
  const [sCustomerInfoObj, _setCustomerInfoObj] = React.useState(null);
  const [buttonVisible, setButtonVisible] = React.useState(false);

  // dev ////////////////////////////////////
  useEffect(() => {
    handleTextChange(sTextInput);
  }, [sTextInput]);
  // dev ///////////////////////////////////

  useEffect(() => {
    if (zCustomerSearchResults.length > 0) {
      _zSetItemsTabName(TAB_NAMES.itemsTab.customerList);
    } else {
      _zSetItemsTabName(TAB_NAMES.itemsTab.empty);
    }
  }, [zCustomerSearchResults]);

  // Update button visibility when dependencies change
  useEffect(() => {
    const shouldShow =
      (sSearchFieldName === "phone" &&
        sTextInput.length === 10 &&
        zCustomerSearchResults.length === 0) ||
      (sSearchFieldName !== "phone" && sTextInput.length >= 3);

    setButtonVisible(shouldShow);
  }, [sSearchFieldName, sTextInput.length, zCustomerSearchResults.length]);

  async function handleTextChange(incomingText = "") {
    let isEmail;
    let rawText = removeDashesFromPhone(incomingText);
    let isNumeric = stringIsNumeric(incomingText.substring(0, 3));
    if (incomingText.includes("@")) {
      isEmail = true;
      isNumeric = false;
    }
    // let searchStr = "";

    const searchFun = async (searchStrings, options) => {
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

      funs.forEach((fun) => {
        fun().then((res) => {
          log("res", res);
          useCustomerSearchStore.getState().addToSearchResults(res);
        });
      });
    };

    if (rawText.length <= 2) {
      // do nothing, string too short to search
      _setTextInput(rawText);
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
      searchFun([searchStr], ["phone", "email"]);
      // searchFun(searchStr, "phone");
      // searchFun(searchStr, "email"); // email search in case begins with numbers
      return;
    } else if (
      isNumeric &&
      incomingText.includes("-") &&
      rawText.length === 6
    ) {
      // log(Math.random());
      let searchStr = rawText;
      if (sTextInput.length === 8) {
        // there was a dash, user deleted it so remove the number preceding the dash
        searchStr = rawText.substring(0, 5);
      }
      _setTextInput(formatPhoneWithDashes(searchStr));
      // run search here on phone numbers
      searchFun([searchStr], ["phone"]);
      return;
    } else if (isNumeric && rawText.length > 10) {
      // do nothing, search ran on the last round and do not enter the new
      return;
    }

    // now we know the user has entered a name or email
    _setTextInput(incomingText);
    if (isEmail) {
      // run email search
      searchFun([incomingText], ["email"]);
    } else {
      // name search
      let split;
      if (incomingText.includes("  ")) {
        split = incomingText.split("  ");
      } else {
        split = incomingText.split(" ");
      }
      searchFun(split, ["name"]);
    }
  }

  function handleCreateCustomerBtnPressed() {
    let custInfo = cloneDeep(CUSTOMER_PROTO);
    if (sSearchFieldName === "phone") {
      custInfo.cell = sTextInput;
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
    _setCustomerInfoObj(custInfo);
  }

  function handleStartStandaloneSalePress() {
    let wo = cloneDeep(WORKORDER_PROTO);
    wo.isStandaloneSale = true;
    wo.id = generateUPCBarcode();
    wo.startedBy = useLoginStore.getCurrentUser().id;
    wo.startedOnMillis = new Date().getTime();

    _zSetOpenWorkorder(wo, false);
    _zSetInfoTabName(TAB_NAMES.infoTab.checkout);
    _zSetItemsTabName(TAB_NAMES.itemsTab.workorderItems);
    _zSetOptionsTabName(TAB_NAMES.optionsTab.quickItems);
  }

  function handleCancelCreateNewCustomerPress() {
    _setTextInput("");
    _setSearchFieldName("phone");
    _setCustomerInfoObj(null);
  }

  function handleCreateNewCustomerPressed() {
    // first create new customer
    let newCustomerObj = cloneDeep(sCustomerInfoObj);
    newCustomerObj.id = generateUPCBarcode();
    newCustomerObj.dateCreated = new Date().getTime();

    // next create new empty workorder for automatic population of next screen
    let newWorkorder = createNewWorkorder({
      customerID: newCustomerObj.id,
      customerFirst: newCustomerObj.first,
      customerLast: newCustomerObj.last,
      customerPhone: newCustomerObj.cell || newCustomerObj.landline,
      startedByFirst: useLoginStore.getCurrentUser().first,
      startedByLast: useLoginStore.getCurrentUser().last,
    });

    // add in the newly created workorder to the customer's file
    newCustomerObj.workorders.push(newWorkorder.id);

    useCurrentCustomerStore.getState().setCustomer(newCustomerObj, true);
    useOpenWorkordersStore.getState().setWorkorder(newWorkorder, true, true);
    useOpenWorkordersStore.getState().setOpenWorkorder(newWorkorder);
    useTabNamesStore.getState().setInfoTabName(TAB_NAMES.infoTab.workorder);
    useTabNamesStore
      .getState()
      .setItemsTabName(TAB_NAMES.itemsTab.workorderItems);
    useTabNamesStore
      .getState()
      .setOptionsTabName(TAB_NAMES.optionsTab.quickItems);
    _zSetInfoTabName(TAB_NAMES.infoTab.workorder);
    _zSetItemsTabName(TAB_NAMES.itemsTab.workorderItems);
    _zSetOptionsTabName(TAB_NAMES.optionsTab.quickItems);
  }

  //////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////
  // log(sTextInput.length);
  // log(sSearchFieldName);
  function setComponent() {
    return (
      <View
        style={{
          width: "100%",
          height: "100%",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        {/* <LoginModalScreen modalVisible={zShowLoginScreen} /> */}

        <View
          style={{
            alignItems: "flex-end",
            width: "100%",
            padding: 20,
            marginTop: "70%",
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
                width: 300,
                height: 37,
                outlineWidth: 0,
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
                  outerModalStyle={{}}
                  buttonLabel={"Create New Customer"}
                  modalVisible={sCustomerInfoObj}
                  canExitOnOuterClick={false}
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
                      isNewCustomer={true}
                      ssCustomerInfoObj={sCustomerInfoObj}
                      __setCustomerInfoObj={_setCustomerInfoObj}
                      button1Text={"Create Customer"}
                      button2Text={"Cancel"}
                      handleButton1Press={handleCreateNewCustomerPressed}
                      handleButton2Press={handleCancelCreateNewCustomerPress}
                    />
                  )}
                />
              ),
              [sCustomerInfoObj, buttonVisible]
            )}
            <Button_
              icon={ICONS.reset1}
              buttonStyle={{ marginTop: 10, paddingHorizontal: 0 }}
              onPress={() => {
                if (sSearchFieldName === "phone") {
                  _setSearchFieldName("name");
                } else {
                  _setSearchFieldName("phone");
                }
                _setTextInput("");
              }}
            />
          </View>
        </View>
        <View style={{ width: "100%", alignItems: "flex-end" }}>
          <Button_
            buttonStyle={{ margin: 20 }}
            onPress={handleStartStandaloneSalePress}
            icon={ICONS.cashRegister}
            iconSize={55}
          />
        </View>

        {/** customer info modal */}
      </View>
    );
  }

  try {
    return setComponent();
  } catch (e) {
    log("Error returning NewWorkorderComponent", e);
  }
}

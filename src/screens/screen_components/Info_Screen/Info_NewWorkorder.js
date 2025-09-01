/* eslint-disable */

import { View, TextInput } from "react-native-web";
import {
  addDashesToPhone,
  capitalizeFirstLetterOfString,
  clog,
  dim,
  generateRandomID,
  LETTERS,
  log,
  NUMS,
  removeDashesFromPhone,
  searchCustomerNames,
  searchPhoneNum,
} from "../../../utils";
import {
  ScreenModal,
  Button,
  CustomerInfoScreenModalComponent,
  SHADOW_RADIUS_PROTO,
  LoginScreenModalComponent,
  ColorSelectorModalComponent,
  Button_,
} from "../../../components";
import {
  CUSTOMER_PROTO,
  FOCUS_NAMES,
  TAB_NAMES,
  WORKORDER_PROTO,
} from "../../../data";
import React, { useEffect, useState } from "react";
import { cloneDeep } from "lodash";
import {
  useCurrentCustomerStore,
  useCustomerPreviewStore,
  useCustomerSearchStore,
  useTabNamesStore,
  useOpenWorkordersStore,
  useCustMessagesStore,
  useLoginStore,
} from "../../../stores";
import { messagesSubscribe } from "../../../db_subscription_wrapper";
import { C, COLOR_GRADIENTS, Colors, ICONS } from "../../../styles";
import {
  dbSearchForName,
  dbSearchForPhoneNumber,
} from "../../../db_call_wrapper";
export function NewWorkorderComponent({}) {
  // store setters ////////////////////////////////////////////////////////////////
  const _zSetIncomingMessage = useCustMessagesStore(
    (state) => state.setIncomingMessage
  );
  const _zSetOutgoingMessage = useCustMessagesStore(
    (state) => state.setOutgoingMessage
  );
  const _zSetOptionsTabName = useTabNamesStore(
    (state) => state.setOptionsTabName
  );
  const _zSetItemsTabName = useTabNamesStore((state) => state.setItemsTabName);
  const _zSetInfoTabName = useTabNamesStore((state) => state.setInfoTabName);
  const _zSetSearchResults = useCustomerSearchStore(
    (state) => state.setSearchResultsArr
  );
  const _zResetSearch = useCustomerSearchStore((state) => state.reset);

  const _zSetNewWorkorderInArr = useOpenWorkordersStore(
    (state) => state.modItem
  );
  const _zSetOpenWorkorder = useOpenWorkordersStore(
    (state) => state.setWorkorderObj
  );
  const _zSetCurrentCustomer = useCurrentCustomerStore(
    (state) => state.setCustomerObj
  );
  const _zExecute = useLoginStore((state) => state.execute);
  const _zStartStandaloneSale = useOpenWorkordersStore(
    (state) => state.startStandaloneSale
  );

  // store getters ///////////////////////////////////////////////////////////////
  const zCustPreviewArr = useCustomerPreviewStore((state) =>
    state.getCustPreviewArr()
  );
  const zShowLoginScreen = useLoginStore((state) => state.getShowLoginScreen());
  const zCurrentUser = useLoginStore((state) => state.getCurrentUserObj());
  const zSearchResults = useCustomerSearchStore((state) =>
    state.getSearchResultsArr()
  );

  //////////////////////////////////////////////////////////////////////
  const [sBox1Val, _setBox1Val] = React.useState("");
  // const [sBox1Val, _setBox1Val] = React.useState("222-222-2222");

  const [sBox2Val, _setBox2Val] = React.useState("");
  const [sSearchingByName, _setSearchingByName] = React.useState(false);
  const [sCustomerInfoObj, _setCustomerInfoObj] = React.useState(null);
  const [sShowCreateCustomerButton, _setShowCreateCustomerBtn] =
    useState(false);
  const [sInfoTextFocus, _setInfoTextFocus] = useState(FOCUS_NAMES.cell);

  // watch inputs to see if we need to show Create Customer button (show button after 10 digits phone or 2 digits first name)
  useEffect(() => {
    let showButton = false;
    if (sSearchingByName) {
      if (sBox1Val.length > 1 || sBox2Val.length > 1) showButton = true;
    } else {
      let noDashes = removeDashesFromPhone(sBox1Val);
      if (noDashes.length == 10 && zSearchResults.length == 0)
        showButton = true;
    }
    _setShowCreateCustomerBtn(showButton);
  }, [sBox1Val, sBox2Val, zSearchResults]);

  async function handleBox1TextChange(incomingText = "") {
    // log("incoming box 1", incomingText);
    // if all input erased
    if (incomingText === "" || !incomingText) {
      _setBox1Val("");
      _zSetSearchResults([]);
      _zSetItemsTabName(TAB_NAMES.itemsTab.empty);
      return;
    }

    let formattedText = incomingText;
    if (!sSearchingByName) formattedText = removeDashesFromPhone(incomingText);
    if (sSearchingByName) {
      // make first letter uppercase
      // formattedText = formattedText.toLowerCase();
      // let char1 = formattedText[0].toUpperCase();
      // log("char", char1);
      // let substr = formattedText.substring(1, formattedText.length);
      // formattedText = char1 + substr;
      formattedText = capitalizeFirstLetterOfString(formattedText);
    }

    // check for valid inputs for each box
    if (sSearchingByName) {
      if (
        LETTERS.includes(formattedText[formattedText.length - 1]) ||
        LETTERS.toUpperCase().includes(formattedText[formattedText.length - 1])
      ) {
        _setBox1Val(formattedText);
      } else {
        return;
      }
    } else if (
      NUMS.includes(formattedText[formattedText.length - 1]) &&
      formattedText.length <= 10
    ) {
      let dashed = addDashesToPhone(formattedText);
      // log("dash", dashed);
      _setBox1Val(dashed);
    } else {
      return;
    }

    // run searches
    ///////////////////////
    let searchResults = [];
    // log("arr", zCustPreviewArr);
    if (sSearchingByName) {
      searchResults = await dbSearchForName(formattedText);
    } else {
      searchResults = await dbSearchForPhoneNumber(formattedText);
    }
    // log("results", searchResults);

    _zSetSearchResults(searchResults);
    if (searchResults.length > 0) {
      _zSetItemsTabName(TAB_NAMES.itemsTab.customerList);
    } else {
      _zSetItemsTabName(TAB_NAMES.itemsTab.empty);
    }

    // show the create customer button if input conditions are met
  }

  function handleBox2TextChange(incomingText = "") {
    if (incomingText === "") {
      _setBox2Val("");
      // _zSetSearchResults([]);
      return;
    }
    let formattedText = incomingText;
    formattedText = capitalizeFirstLetterOfString(formattedText);
    if (
      LETTERS.includes(formattedText[formattedText.length - 1]) ||
      LETTERS.toUpperCase().includes(formattedText[formattedText.length - 1])
    ) {
      _setBox2Val(formattedText);
    } else {
      return;
    }
  }

  function handleCreateCustomerBtnPressed() {
    let custInfo = cloneDeep(CUSTOMER_PROTO);
    if (sSearchingByName) {
      custInfo.first = sBox1Val;
      custInfo.last = sBox2Val;
      _setInfoTextFocus(FOCUS_NAMES.cell);
    } else {
      _setInfoTextFocus(FOCUS_NAMES.first);
      custInfo.cell = sBox1Val;
    }
    // log(custInfo);
    // do not set the customer id this is how the next screen knows it is a new customer. we will set the id in the modal automatically on creation
    _setCustomerInfoObj(custInfo);
  }

  function handleStartStandaloneSalePress() {
    let wo = cloneDeep(WORKORDER_PROTO);
    wo.isStandaloneSale = true;
    wo.id = generateRandomID();
    wo.startedBy = zCurrentUser.id;
    wo.startedOnMillis = new Date().getTime();

    _zSetOpenWorkorder(wo, false);
    _zSetInfoTabName(TAB_NAMES.infoTab.checkout);
    _zSetItemsTabName(TAB_NAMES.infoTab.workorder);
    _zSetOptionsTabName(TAB_NAMES.optionsTab.quickItems);
  }

  function handleCancelCreateNewCustomerPress() {
    _setBox1Val("");
    _setBox2Val("");
    _setSearchingByName(false);
    _zResetSearch();
    _setShowCreateCustomerBtn(false);
    _setCustomerInfoObj(null);
  }

  function handleCreateNewCustomerPressed() {
    // log("create new customer pressed", log(zCurrentUser));
    // first create new customer
    let newCustomerObj = cloneDeep(sCustomerInfoObj);
    newCustomerObj.id = generateRandomID();
    newCustomerObj.dateCreated = new Date().getTime();
    newCustomerObj.workorders.push(newWorkorder.id);

    // next create new empty workorder for automatic population of next screen
    let newWorkorder = cloneDeep(WORKORDER_PROTO);
    newWorkorder.id = generateRandomID();
    newWorkorder.startedOnMillis = new Date().getTime();
    newWorkorder.customerFirst = sCustomerInfoObj.first;
    newWorkorder.customerLast = sCustomerInfoObj.last;
    newWorkorder.customerPhone =
      sCustomerInfoObj.cell || sCustomerInfoObj.landline;
    newWorkorder.customerID = sCustomerInfoObj.id;
    newWorkorder.startedBy = zCurrentUser.first;
    newWorkorder.status = "Service";
    newWorkorder.changeLog.push(
      "Started by: " + zCurrentUser.first + " " + zCurrentUser.last
    );

    _zSetCurrentCustomer(newCustomerObj);
    // dbSetCustomerObj(newCustomerObj);
    // dbSetOpenWorkorderItem(newWorkorder);
    _zSetNewWorkorderInArr(newWorkorder, "add");
    _zSetOpenWorkorder(newWorkorder);
    // _zResetSearch();
    _zSetInfoTabName(TAB_NAMES.infoTab.workorder);
    _zSetItemsTabName(TAB_NAMES.itemsTab.workorderItems);
    _zSetOptionsTabName(TAB_NAMES.optionsTab.quickItems);
    messagesSubscribe(
      newCustomerObj.id,
      _zSetIncomingMessage,
      _zSetOutgoingMessage
    );
  }

  //////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////
  function setComponent() {
    return (
      <View
        style={{
          width: "100%",
          height: "100%",
          justifyContent: "flex-end",
          alignItems: "center",
          paddingBottom: 20,
        }}
      >
        {/* <View
          style={{
            width: "100%",
            justifyContent: "flex-start",
            alignItems: "center"
            // backgroundColor: "green"
          }}
        > */}
        {/* <View
            style={{
              flexDirection: "row",
              width: "100%",
              justifyContent: "space-between",
              alignItems: "center",
              paddingHorizontal: 5
            }}
          > */}
        {/* <Button
              buttonStyle={{
                width: 110,
                // height: 30,
                ...SHADOW_RADIUS_PROTO,
                marginTop: 10,
                marginRight: 10,
                // padding: 5,
                paddingHorizontal: 0
              }}
              textStyle={{ fontSize: 13, color: "white" }}
              onPress={() => {
                _setBox1Val("");
                _setBox2Val("");
                _setSearchingByName(!sSearchingByName);
                _zSetSearchResults([]);
                _setShowCreateCustomerBtn(false);
              }}
              text={sSearchingByName ? "Search By Phone" : "Search By Name"}
            />
            <Button
              buttonStyle={{
                width: 110,
                // height: 30,
                ...SHADOW_RADIUS_PROTO,
                marginTop: 10,
                marginRight: 10,
                // padding: 5,
                paddingHorizontal: 0
              }}
              textStyle={{ fontSize: 13, color: "white" }}
              text={"New Sale"}
              onPress={() => {
                handleStartStandaloneSalePress();
              }}
            /> */}
        {/* </View> */}
        <LoginScreenModalComponent modalVisible={zShowLoginScreen} />
        <View style={{ alignItems: "center" }}>
          <TextInput
            style={{
              // marginTop: 100,
              borderBottomWidth: 1,
              width: 200,
              height: 40,
              paddingHorizontal: 3,
              outlineStyle: "none",
              borderColor: "gray",
              fontSize: 16,
              color: sBox1Val.length < 0 ? "gray" : "dimgray",
            }}
            autoFocus={true}
            placeholder={sSearchingByName ? "First Name" : "Phone number"}
            placeholderTextColor={"gray"}
            value={sBox1Val}
            onChangeText={(val) => handleBox1TextChange(val)}
          />
          <View style={{ width: 10 }} />
          {sSearchingByName && (
            <TextInput
              placeholder={"Last name"}
              placeholderTextColor={"gray"}
              style={{
                marginTop: 20,
                padding: 3,
                borderBottomWidth: 1,
                fontSize: 16,
                width: 200,
                height: 40,
                outlineStyle: "none",
                borderColor: "gray",
              }}
              value={sBox2Val}
              onChangeText={(val) => handleBox2TextChange(val)}
            />
          )}
          <Button_
            text={sSearchingByName ? "Search Phone" : "Search Name"}
            onPress={() => {
              _setBox1Val("");
              _setBox2Val("");
              _setSearchingByName(!sSearchingByName);
              _zSetSearchResults([]);
              _setShowCreateCustomerBtn(false);
            }}
            icon={ICONS.search}
            iconSize={25}
            colorGradientArr={COLOR_GRADIENTS.blue}
            buttonStyle={{
              paddingHorizontal: 25,
              paddingVertical: 5,
              marginTop: 20,
              width: 220,
            }}
          />
        </View>
        <View style={{ height: "45%" }} />
        {/** customer info modal */}
        <Button_
          buttonStyle={{}}
          onPress={handleStartStandaloneSalePress}
          icon={ICONS.cashRegister}
          iconSize={80}
        />
        <ScreenModal
          showOuterModal={true}
          outerModalStyle={{}}
          buttonStyle={{
            height: 50,
            marginVertical: 10,
            marginTop: 50,
            width: null,
          }}
          buttonVisible={sShowCreateCustomerButton}
          buttonTextStyle={{ color: "dimgray" }}
          handleButtonPress={() => handleCreateCustomerBtnPressed()}
          buttonLabel={"Create New Customer"}
          modalVisible={sCustomerInfoObj}
          canExitOnOuterClick={false}
          Component={() => (
            <CustomerInfoScreenModalComponent
              ssCustomerInfoObj={sCustomerInfoObj}
              __setCustomerInfoObj={_setCustomerInfoObj}
              button1Text={"Create Customer"}
              button2Text={"Cancel"}
              ssInfoTextFocus={sInfoTextFocus}
              __setInfoTextFocus={_setInfoTextFocus}
              handleButton1Press={handleCreateNewCustomerPressed}
              handleButton2Press={handleCancelCreateNewCustomerPress}
            />
          )}
        />
      </View>
    );
  }

  try {
    return setComponent();
  } catch (e) {
    log("Error returning NewWorkorderComponent", e);
  }
}

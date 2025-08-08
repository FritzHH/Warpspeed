/* eslint-disable */

import { View, TextInput } from "react-native-web";
import {
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
  useAppCurrentUserStore,
  useCustomerPreviewStore,
  useCustomerSearchStore,
  useOpenWorkordersStore,
  useTabNamesStore,
  useCurrentWorkorderStore,
  useCustMessagesStore,
  useLoginStore,
} from "../../../stores";
import { messagesSubscribe } from "../../../db_subscriptions";
import { Colors } from "../../../styles";
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
  const _zSetOpenWorkorder = useCurrentWorkorderStore(
    (state) => state.setWorkorderObj
  );
  const _zSetCurrentCustomer = useCurrentCustomerStore(
    (state) => state.setCustomerObj
  );
  const _zExecute = useLoginStore((state) => state.execute);
  const _zStartStandaloneSale = useCurrentWorkorderStore(
    (state) => state.startStandaloneSale
  );

  // store getters ///////////////////////////////////////////////////////////////
  const zCustPreviewArr = useCustomerPreviewStore((state) =>
    state.getCustPreviewArr()
  );
  const zShowLoginScreen = useLoginStore((state) => state.getShowLoginScreen());
  const zCurrentUser = useLoginStore((state) => state.getCurrentUserObj());

  //////////////////////////////////////////////////////////////////////
  const [sBox1Val, _setBox1Val] = React.useState("");
  const [sBox2Val, _setBox2Val] = React.useState("");
  const [sSearchingByName, _setSearchingByName] = React.useState(false);
  const [sCustomerInfo, _setCustomerInfo] = React.useState(null);
  const [sShowCreateCustomerButton, _setShowCreateCustomerBtn] = useState(true);
  const [sInfoTextFocus, _setInfoTextFocus] = useState(FOCUS_NAMES.cell);

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
      formattedText = formattedText.toLowerCase();
      let char1 = formattedText[0].toUpperCase();
      // log("char", char1);
      let substr = formattedText.substring(1, formattedText.length);
      formattedText = char1 + substr;
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
      _setBox1Val(formattedText);
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
    if (sSearchingByName) _setShowCreateCustomerBtn(formattedText.length >= 2);
    if (!sSearchingByName)
      _setShowCreateCustomerBtn(
        formattedText.length === 10 && searchResults.length === 0
      );
  }

  function handleBox2TextChange(incomingText = "") {
    if (incomingText === "") {
      _setBox2Val("");
      // _zSetSearchResults([]);
      return;
    }
    let formattedText = incomingText;
    formattedText = formattedText.toLowerCase();
    let char1 = formattedText[0].toUpperCase();
    // log("char", char1);
    let substr = formattedText.substring(1, formattedText.length);
    formattedText = char1 + substr;
    if (
      LETTERS.includes(formattedText[formattedText.length - 1]) ||
      LETTERS.toUpperCase().includes(formattedText[formattedText.length - 1])
    ) {
      _setBox2Val(formattedText);
    } else {
      return;
    }
  }

  function handleCreateNewCustomerPressed() {
    // log("create new customer pressed", log(zCurrentUser));
    // setInterval(() => {
    //   log(zCurrentUser);
    // }, 500);

    // return;
    let newWorkorder = cloneDeep(WORKORDER_PROTO);
    newWorkorder.id = generateRandomID();
    newWorkorder.customerFirst = sCustomerInfo.first;
    newWorkorder.customerLast = sCustomerInfo.last;
    newWorkorder.customerPhone = sCustomerInfo.cell || sCustomerInfo.landline;
    newWorkorder.customerID = sCustomerInfo.id;
    newWorkorder.startedBy = zCurrentUser.first;
    newWorkorder.status = "Service";
    newWorkorder.changeLog.push(
      "Started by: " + zCurrentUser.first + " " + zCurrentUser.last
    );
    let newCustomerObj = cloneDeep(sCustomerInfo);
    newCustomerObj.dateCreated = new Date().getTime();
    newCustomerObj.workorders.push(newWorkorder.id);

    _zSetCurrentCustomer(newCustomerObj);
    // dbSetCustomerObj(newCustomerObj);
    // dbSetOpenWorkorderItem(newWorkorder);
    _zSetNewWorkorderInArr(newWorkorder, "add");
    _zSetOpenWorkorder(newWorkorder);
    _zResetSearch();
    _zSetInfoTabName(TAB_NAMES.infoTab.workorder);
    _zSetItemsTabName(TAB_NAMES.itemsTab.workorderItems);
    _zSetOptionsTabName(TAB_NAMES.optionsTab.quickItems);
    messagesSubscribe(
      newCustomerObj.id,
      _zSetIncomingMessage,
      _zSetOutgoingMessage
    );
  }

  function handleModalCreateCustomerBtnPressed() {
    let custInfo = { ...CUSTOMER_PROTO };
    if (sSearchingByName) {
      custInfo.first = sBox1Val;
      custInfo.last = sBox2Val;
      _setInfoTextFocus(FOCUS_NAMES.cell);
    } else {
      _setInfoTextFocus(FOCUS_NAMES.first);
      custInfo.cell = sBox1Val;
    }
    custInfo.id = generateRandomID();
    _setCustomerInfo(custInfo);
  }

  //////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////
  function setComponent() {
    return (
      <View
        style={{
          width: "100%",
          height: "100%",
          backgroundColor: null,
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <View
          style={{
            width: "100%",
            justifyContent: "flex-start",
            alignItems: "center",
            // marginTop: 100,
            // backgroundColor: "green",
          }}
        >
          <View style={{ width: "100%", alignItems: "flex-end" }}>
            <Button
              buttonStyle={{
                width: 80,
                // height: 30,
                ...SHADOW_RADIUS_PROTO,
                marginTop: 10,
                marginRight: 10,
                // padding: 5,
                paddingHorizontal: 0,
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
          </View>
          <LoginScreenModalComponent modalVisible={zShowLoginScreen} />
          <TextInput
            style={{
              marginTop: 100,
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
            placeholder={sSearchingByName ? "First Name..." : "Phone number..."}
            placeholderTextColor={"gray"}
            value={sBox1Val}
            onChangeText={(val) => handleBox1TextChange(val)}
          />
          <View style={{ width: 10 }} />
          {sSearchingByName && (
            // <View>
            <TextInput
              placeholder={"Last name..."}
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
            // </View>
          )}

          {/** customer info modal */}
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
            handleButtonPress={() =>
              _zExecute(() => handleModalCreateCustomerBtnPressed())
            }
            buttonLabel={"Create New Customer"}
            modalVisible={sCustomerInfo}
            canExitOnOuterClick={false}
            Component={() => (
              <CustomerInfoScreenModalComponent
                sCustomerInfo={sCustomerInfo || {}}
                button1Text={"Create Customer"}
                button2Text={"Cancel"}
                ssInfoTextFocus={sInfoTextFocus}
                __setInfoTextFocus={_setInfoTextFocus}
                handleButton1Press={handleCreateNewCustomerPressed}
                __setCustomerInfo={_setCustomerInfo}
                handleButton2Press={() => {
                  // cancel button
                  _setBox1Val("");
                  _setBox2Val("");
                  _setSearchingByName(false);
                  _zResetSearch();
                  _setShowCreateCustomerBtn(false);
                  _setCustomerInfo(null);
                }}
              />
            )}
          />
        </View>

        <Button
          text={"New Sale"}
          // buttonStyle={}
          onPress={() => {
            _zStartStandaloneSale();
            _zSetInfoTabName(TAB_NAMES.infoTab.checkout);
            _zSetItemsTabName(TAB_NAMES.infoTab.workorder);
          }}
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

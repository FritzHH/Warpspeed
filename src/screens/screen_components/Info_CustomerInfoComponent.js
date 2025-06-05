/* eslint-disable */

import { View, TextInput } from "react-native-web";
import {
  dim,
  generateRandomID,
  log,
  removeDashesFromPhone,
  searchCustomerNames,
  searchPhoneNum,
} from "../../utils";
import {
  ScreenModal,
  Button,
  CustomerInfoScreenModalComponent,
  SHADOW_RADIUS_PROTO,
  LoginScreenModalComponent,
} from "../../components";
import { ButtonStyles, Colors } from "../../styles";
import {
  CUSTOMER_PROTO,
  FOCUS_NAMES,
  TAB_NAMES,
  WORKORDER_PROTO,
} from "../../data";
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
} from "../../stores";
import { dbSetCustomerObj, dbSetOpenWorkorderItem } from "../../db_calls";
import { messagesSubscribe } from "../../db_subscriptions";
const LETTERS = "qwertyuioplkjhgfdsazxcvbnm-";
const NUMS = "1234567890-";
export function CustomerInfoScreenComponent({}) {
  // setters ////////////////////////////////////////////////////////////////
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

  // getters ///////////////////////////////////////////////////////////////
  const zCustPreviewArr = useCustomerPreviewStore((state) =>
    state.getCustPreviewArr()
  );
  const zShowLoginScreen = useLoginStore((state) => state.getShowLoginScreen());
  const zCurrentUser = useLoginStore((state) => state.getCurrentUserObj());

  //////////////////////////////////////////////////////////////////////
  const [sBox1Val, _setBox1Val] = React.useState("239336917");
  const [sBox2Val, _setBox2Val] = React.useState("");
  const [sSearchingByName, _setSearchingByName] = React.useState(false);
  const [sCustomerInfo, _setCustomerInfo] = React.useState(null);
  const [sShowCreateCustomerButton, _setShowCreateCustomerBtn] = useState(true);
  const [sInfoTextFocus, _setInfoTextFocus] = useState(FOCUS_NAMES.cell);

  function handleBox1TextChange(incomingText = "") {
    // log("incoming box 1", incomingText);
    // if all input erased
    if (incomingText === "") {
      _setBox1Val("");
      _zSetSearchResults([]);
      return;
    }

    let formattedText = incomingText;
    if (!sSearchingByName) formattedText = removeDashesFromPhone(incomingText);

    // check for valid inputs for each box

    if (sSearchingByName) {
      if (LETTERS.includes(formattedText[formattedText.length - 1])) {
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
    if (sSearchingByName) {
      searchResults = searchCustomerNames(
        formattedText,
        sBox2Val,
        zCustPreviewArr
      );
    } else {
      searchResults = searchPhoneNum(formattedText, zCustPreviewArr);
      // log(searchResults);
    }
    _zSetSearchResults(searchResults);
    if (searchResults.length > 0) {
      _zSetItemsTabName(TAB_NAMES.itemsTab.customerList);
    }
    // log("res", searchResults);
    // show the create customer button if input conditions are met
    if (sSearchingByName) _setShowCreateCustomerBtn(formattedText.length >= 2);
    if (!sSearchingByName)
      _setShowCreateCustomerBtn(
        formattedText.length === 10 && searchResults.length === 0
      );
  }

  function handleBox2TextChange(formattedText = "") {
    if (formattedText.length === 0) {
      _setBox2Val("");
      return;
    }
    if (!LETTERS.includes(formattedText[formattedText.length - 1])) {
      return;
    } else {
      _setBox2Val(formattedText);
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
  return (
    <View style={{ width: "100%", height: "100%" }}>
      <LoginScreenModalComponent modalVisible={zShowLoginScreen} />

      <View
        style={{
          marginTop: "50%",
          width: "90%",
          justifyContent: "space-between",
          // backgroundColor: "green",
        }}
      >
        <View>
          <TextInput
            style={{
              borderBottomWidth: 1,
              width: 200,
              height: 40,
              paddingHorizontal: 3,
              outlineStyle: "none",
              borderColor: sBox1Val.length < 0 ? "gray" : "dimgray",
              fontSize: 16,
              color: sBox1Val.length < 0 ? "gray" : "dimgray",
            }}
            autoFocus={true}
            placeholder={sSearchingByName ? "First Name..." : "Phone number..."}
            placeholderTextColor={"gray"}
            value={sBox1Val}
            onChangeText={(val) => handleBox1TextChange(val)}
          />
        </View>
        <View style={{ width: 10 }} />
        {sSearchingByName && (
          <View>
            <TextInput
              placeholder={"Last name..."}
              placeholderTextColor={"darkgray"}
              style={{
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
          </View>
        )}
        <Button
          buttonStyle={{
            width: 160,
            height: 30,
            padding: 7,
            ...SHADOW_RADIUS_PROTO,
            // backgroundColor: "",
            marginVertical: 10,
            marginTop: 20,
          }}
          textStyle={{ color: "dimgray" }}
          onPress={() => {
            _setBox1Val("");
            _setBox2Val("");
            _setSearchingByName(!sSearchingByName);
            _zSetSearchResults([]);
            _setShowCreateCustomerBtn(false);
          }}
          text={sSearchingByName ? "Use Phone #" : "Use Name"}
        />
      </View>

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
  );
}

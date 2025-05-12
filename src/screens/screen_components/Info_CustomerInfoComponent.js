import {
  View,
  Text,
  Pressable,
  TextInput,
  FlatList,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from "react-native-web";
import {
  dim,
  log,
  removeDashesFromPhone,
  searchArray,
  searchCustomerNames,
  searchPhoneNum,
  trimToTwoDecimals,
} from "../../utils";
import {
  HorzSpacer,
  TabMenuButton,
  TabMenuDivider as Divider,
  ModalDropdown,
  TextInputOnMainBackground,
  TextInputLabelOnMainBackground,
  ScreenModal,
  Button,
  CustomerInfoComponent,
  AlertBox,
  SHADOW_RADIUS_PROTO,
} from "../../components";
import { ButtonStyles, Colors } from "../../styles";
import {
  CUSTOMER_PROTO,
  FOCUS_NAMES,
  ALERT_BOX_PROTO,
  TAB_NAMES,
} from "../../data";
import React, { useEffect, useState } from "react";
import { cloneDeep } from "lodash";

export function CustomerInfoScreenComponent({
  ssCustomersArr,
  __createNewCustomer,
  __setCustomerSearchArr,
  __setItemsTabName,
}) {
  const [sBox1Val, _setBox1Val] = React.useState("");
  const [sBox2Val, _setBox2Val] = React.useState("");
  const [sSearchingByName, _setSearchingByName] = React.useState(false);
  const [sCustomerInfo, _setCustomerInfo] = React.useState(CUSTOMER_PROTO);
  const [sImproperDataAlertBox, _setImproperDataAlertBox] = React.useState({
    ...ALERT_BOX_PROTO,
  });
  const [sShowCustomerModal, _setShowCustomerModal] = React.useState(false);
  const [sShowCreateCustomerButton, _setShowCreateCustomerBtn] =
    useState(false);
  const [sInfoTextFocus, _setInfoTextFocus] = useState(FOCUS_NAMES.cell);

  useEffect(() => {
    __setItemsTabName(TAB_NAMES.itemsTab.customerList);
  }, []);

  /////////////////
  const LETTERS = "qwertyuioplkjhgfdsazxcvbnm-";
  const NUMS = "1234567890-";
  ///////////////////////
  // button press handlers
  ///////////////////////
  function handleBox1TextChange(incomingText = "") {
    // log("incoming box 1", incomingText);
    // if all input erased
    if (incomingText === "") {
      _setBox1Val("");
      __setCustomerSearchArr([]);
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
    } else {
      if (
        NUMS.includes(formattedText[formattedText.length - 1]) &&
        formattedText.length <= 10
      ) {
        _setBox1Val(formattedText);
      } else {
        return;
      }
    }

    // run searches
    let searchResults = [];
    if (sSearchingByName) {
      searchResults = searchCustomerNames(
        formattedText,
        sBox2Val,
        ssCustomersArr
      );
    } else {
      searchResults = searchPhoneNum(formattedText, ssCustomersArr);
      // log(searchResults);
    }
    // log("search results", searchResults);
    __setCustomerSearchArr(searchResults);

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
    //to do bump new customer up to workorder
    // log("creating new customer in modal");
    __createNewCustomer(sCustomerInfo);
    _setShowCustomerModal(false);
  }

  function handleModalCreateCustomerBtnPressed() {
    // log("pressed");
    let testForImproperDataEntry = true;
    let message = "";

    let custInfo = cloneDeep(sCustomerInfo);
    if (sSearchingByName) {
      custInfo.first = sBox1Val;
      custInfo.last = sBox2Val;
      _setInfoTextFocus(FOCUS_NAMES.cell);
    } else {
      _setInfoTextFocus(FOCUS_NAMES.first);
      custInfo.phone.cell = sBox1Val;
    }
    _setCustomerInfo(custInfo);
    _setShowCustomerModal(true);
  }

  //////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////
  return (
    <View style={{ width: "100%", height: "100%" }}>
      {/* <AlertBox
        {...sImproperDataAlertBox}
        onModalDismiss={() =>
          _setImproperDataAlertBox({
            ...sImproperDataAlertBox,
            showBox: false,
          })
        }
      /> */}
      <View
        style={{
          flexDirection: "row",
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
              width: sSearchingByName ? 200 : null,
              width: 160,
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
                width: 160,
                height: 40,
                outlineStyle: "none",
                borderColor: "gray",
              }}
              value={sBox2Val}
              onChangeText={(val) => handleBox2TextChange(val)}
            />
          </View>
        )}
      </View>
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
        textStyle={{ color: "lightgray" }}
        onPress={() => {
          _setBox1Val("");
          _setBox2Val("");
          _setSearchingByName(!sSearchingByName);
          __setCustomerSearchArr([]);
          _setShowCreateCustomerBtn(false);
        }}
        text={sSearchingByName ? "Use Phone #" : "Use Name"}
      />
      {/** customer info modal */}
      <ScreenModal
        showOuterModal={true}
        outerModalStyle={{}}
        buttonStyle={{
          height: 50,
          marginVertical: 10,
          marginTop: 50,
          width: "90%",
        }}
        buttonVisible={sShowCreateCustomerButton}
        buttonTextStyle={{ color: "whitesmoke" }}
        handleButtonPress={handleModalCreateCustomerBtnPressed}
        buttonLabel={"Create New Customer"}
        modalVisible={sShowCustomerModal}
        canExitOnOuterClick={false}
        Component={() => (
          <CustomerInfoComponent
            sCustomerInfo={cloneDeep(sCustomerInfo)}
            exitScreenButtonText={"Create Customer"}
            closeButtonText={"Cancel"}
            ssInfoTextFocus={sInfoTextFocus}
            ssCancelButtonText={"Cancel"}
            ssCreateCustomerBtnText={"Create Customer"}
            __setInfoTextFocus={_setInfoTextFocus}
            __handleCreateCustomerPress={handleCreateNewCustomerPressed}
            __setCustomerInfo={_setCustomerInfo}
            __handleCancelButtonPress={() => {
              _setBox1Val("");
              _setBox2Val("");
              _setSearchingByName(false);
              _setShowCustomerModal(false);
            }}
          />
        )}
      />
    </View>
  );
}

// if (!sSearchingByName) {
//   // change this to < 12 production
//   if (sBox1Val.length < 12) {
//     testForImproperDataEntry = false;
//     message = "The phone number is too short or improperly formatted";
//   }
// } else {
//   if (sBox1Val.length < 1) {
//     testForImproperDataEntry = false;
//     message = "You need to have at least an initial in the First Name box";
//   }
// }

///////////////////////
// functions
///////////////////////
// if (!testForImproperDataEntry) {
//   _setShowCustomerModal(false);
//   _setImproperDataAlertBox({
//     ...sImproperDataAlertBox,
//     message,
//     showBox: true,
//     handleBtn1Press: () =>
//       _setImproperDataAlertBox({
//         ...sImproperDataAlertBox,
//         showBox: false,
//       }),
//   });
//   return;
// }

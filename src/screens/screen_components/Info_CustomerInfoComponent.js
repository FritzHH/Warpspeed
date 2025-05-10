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
import { CUSTOMER_PROTO, FOCUS_NAMES, ALERT_BOX_PROTO } from "../../data";
import React, { useState } from "react";
import { cloneDeep } from "lodash";

export function CustomerInfoScreenComponent({
  ssCustomersArr,
  __createNewCustomer,
  __setCustomerSearchArr,
}) {
  const [sBox1Val, _setBox1Val] = React.useState("");
  const [sBox2Val, _setBox2Val] = React.useState("");
  const [sSearchingByName, _setSearchingByName] = React.useState(false);
  const [sCustomerInfo, _setCustomerInfo] = React.useState(CUSTOMER_PROTO);
  const [sImproperDataAlertBox, _setImproperDataAlertBox] = React.useState({
    ...ALERT_BOX_PROTO,
  });
  const [sShowCustomerModal, _setShowCustomerModal] = React.useState(false);
  const [sShowCreateCustomerButton, _setShowCreateCustomerBtn] = useState(true);
  const [sInfoTextFocus, _setInfoTextFocus] = useState(FOCUS_NAMES.cell);

  ///////////////////////
  // button press handlers
  ///////////////////////
  function handleBox1TextChange(incomingText = "") {
    // log("incoming box 1", incomingText);
    let test = true;
    if (!sSearchingByName) {
      if ("1234567890".includes(incomingText[incomingText.length - 1])) {
        if (incomingText.length <= 12) {
          let phoneNumNoDashes = removeDashesFromPhone(incomingText);
          let searchArr = searchPhoneNum(phoneNumNoDashes, ssCustomersArr);
          __setCustomerSearchArr(searchArr);

          if (searchArr.length == 0 && incomingText.length == 12) {
            _setShowCreateCustomerBtn(true);
          } else {
            _setShowCreateCustomerBtn(false);
          }
          // log("search arr", searchArr);
        } else {
          test = false;
        }
      }
    } else {
      if (incomingText.length > 0) {
        _setShowCreateCustomerBtn(true);
      } else {
        _setShowCreateCustomerBtn(false);
      }
      test = "qwertyuioplkjhgfdsazxcvbnm-".includes(
        incomingText[incomingText.length - 1]
      );
    }

    if (!test) {
      // log("failed test in box 1 challenge: ", incomingText);
      _setBox1Val(incomingText.slice(0, incomingText.length - 1));
    } else {
      _setBox1Val(incomingText);
    }
    if (sSearchingByName) {
      if (incomingText.length >= 2) {
        _setShowCreateCustomerBtn(true);
      } else {
        _setShowCreateCustomerBtn(false);
      }
    } else {
      if (incomingText.length >= 12) {
        _setShowCreateCustomerBtn(true);
      } else {
        _setShowCreateCustomerBtn(false);
      }
    }
  }

  function handleBox2TextChange(incomingText = "") {
    // log("incoming box 2", incomingText);
    let test = "qwertyuioplkjhgfdsazxcvbnm-".includes(
      incomingText[incomingText.length - 1]
    );
    if (!test) {
      // log("removing characters in box2");
      _setBox2Val(incomingText.slice(0, incomingText.length - 1));
    } else {
      _setBox2Val(incomingText);
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
              borderColor: Colors.darkText,
              width: 160,
              height: 40,
              paddingHorizontal: 3,
              outlineStyle: "none",
              borderColor: "gray",
              fontSize: 16,
            }}
            autoFocus={true}
            placeholder={sSearchingByName ? "First Name..." : "Phone number..."}
            placeholderTextColor={"darkgray"}
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

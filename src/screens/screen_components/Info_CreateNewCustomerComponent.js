import {
  View,
  Text,
  Pressable,
  TextInput,
  FlatList,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from "react-native-web";
import { dim, log, trimToTwoDecimals } from "../../utils";
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
  shadow_radius,
} from "../../components";
import { ButtonStyles, Colors } from "../../styles";
import {
  BIKE_COLORS,
  BRANDS,
  CUSTOMER,
  BIKE_DESCRIPTIONS,
  DISCOUNTS,
  PART_SOURCES,
  WORKORDER,
  WORKORDER_ITEM,
  BIKE_COLORS_ARR,
  FOCUS_NAMES,
  ALERT_BOX_PROTOTYPE,
  INFO_COMPONENT_NAMES,
} from "../../data";
import { QuickItemsTab } from "./Options_QuickItemsTab";
import React from "react";
import { cloneDeep } from "lodash";

export function NewCustomerComponent({
  _setInfoComponentName,
  _setCustomerObj,
  sCustomerObj,
  __createNewCustomer,
  sNewCustomerObject,
  ssShowAlertBox,
  __setShowAlertbox,
}) {
  const [sBox1Val, _setBox1Val] = React.useState("");
  const [sBox2Val, _setBox2Val] = React.useState("");
  const [sSearchingByName, _setSearchingByName] = React.useState(false);
  const [sFoundExistingCustomer, _setFoundExistingCustomer] =
    React.useState(false);
  const [sCustomerInfo, _setCustomerInfo] = React.useState(cloneDeep(CUSTOMER));
  const [sInfoTextFocus, _setInfoTextFocus] = React.useState(FOCUS_NAMES.cell);
  const [sImproperDataAlertBox, _setImproperDataAlertBox] = React.useState({
    ...ALERT_BOX_PROTOTYPE,
  });
  const [sShowEnterModal, _setShowEnterModal] = React.useState(false);
  // const [s]
  function handleBox1TextChange(incomingText = "") {
    let test;
    if (!sSearchingByName) {
      if ("1234567890".includes(incomingText[incomingText.length - 1])) {
        test = incomingText.length <= 12;
      }
    } else {
      test = "qwertyuioplkjhgfdsazxcvbnm-".includes(
        incomingText[incomingText.length - 1]
      );
    }

    if (!test) {
      log("failed test in box 1 challenge: ", incomingText);
      _setBox1Val(incomingText.slice(0, incomingText.length - 1));
    } else {
      _setBox1Val(incomingText);
    }
  }

  function handleBox2TextChange(incomingText = "") {
    log("incoming", incomingText);
    let test = "qwertyuioplkjhgfdsazxcvbnm-".includes(
      incomingText[incomingText.length - 1]
    );
    if (!test) {
      log("removing characters in box2");
      _setBox2Val(incomingText.slice(0, incomingText.length - 1));
    } else {
      _setBox2Val(incomingText);
    }
  }

  function handleEnterPressed() {
    let testForImproperDataEntry = true;
    let message = "";
    if (!sSearchingByName) {
      // change this to < 12 production
      if (sBox1Val.length < 12) {
        testForImproperDataEntry = false;
        message = "The phone number is too short or improperly formatted";
      }
    } else {
      if (sBox1Val.length < 2) {
        testForImproperDataEntry = false;
        message = "You need to have at least a name in the First Name box";
      }
    }

    if (!testForImproperDataEntry) {
      log("test failed", sBox1Val);
      _setShowEnterModal(false);
      _setImproperDataAlertBox({
        ...sImproperDataAlertBox,
        message,
        showBox: true,
        handleBtn1Press: () =>
          _setImproperDataAlertBox({
            ...sImproperDataAlertBox,
            showBox: false,
          }),
      });
      return;
    }

    let custInfo = cloneDeep(sCustomerInfo);
    if (sSearchingByName) {
      custInfo.first = sBox1Val;
      custInfo.last = sBox2Val;
    } else {
      custInfo.phone.cell = sBox1Val;
    }
    log("should be seeing modal now", custInfo);
    _setCustomerInfo(custInfo);
    _setShowEnterModal(true);
  }

  function handleCreateNewCustomerPressed() {
    //to do bump new customer up to workorder
    log("creating new customer in modal");
    __createNewCustomer(cloneDeep(sCustomerInfo));
    _setShowEnterModal(false);
  }

  return (
    <View style={{ width: "100%", height: "100%" }}>
      <AlertBox
        {...sImproperDataAlertBox}
        onModalDismiss={() =>
          _setImproperDataAlertBox({
            ...sImproperDataAlertBox,
            showBox: false,
          })
        }
      />
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
              // borderWidth: 1,
              borderColor: Colors.darkText,
              width: 160,
              height: 40,
              paddingHorizontal: 3,
            }}
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
                width: 160,
                height: 40,
              }}
              value={sBox2Val}
              onChangeText={(val) => handleBox2TextChange(val)}
            />
          </View>
        )}
      </View>
      <Button
        viewStyle={{
          width: "30%",
          padding: 7,
          ...shadow_radius,
          backgroundColor: "lightgray",
          marginVertical: 10,
          marginTop: 20,
          opacity: 0.4,
        }}
        textStyle={{ color: Colors.darkText }}
        onPress={() => {
          _setBox1Val("");
          _setBox2Val("");
          _setSearchingByName(!sSearchingByName);
        }}
        text={sSearchingByName ? "Use Phone #" : "Use Name"}
      />
      <ScreenModal
        modalStyle={{ height: "100%", width: "100%" }}
        modalProps={{ height: "90%", width: "90%" }}
        buttonStyle={{
          height: 50,
          marginVertical: 10,
          marginTop: 50,
          width: "90%",
        }}
        buttonTextStyle={{}}
        handleButtonPress={handleEnterPressed}
        buttonLabel={"Submit"}
        showModal={sShowEnterModal}
        canExitOnOuterClick={false}
        Component={() => (
          <CustomerInfoComponent
            sCustomerInfo={cloneDeep(sCustomerInfo)}
            _setCustomerInfo={_setCustomerInfo}
            handleExitScreenPress={handleCreateNewCustomerPressed}
            exitScreenButtonText={"Create Customer"}
            ssInfoTextFocus={sInfoTextFocus}
            __setInfoTextFocus={_setInfoTextFocus}
            __closeButtonText={"Cancel"}
            __handleCloseButtonPress={() => {
              _setBox1Val("");
              _setBox2Val("");
              _setSearchingByName(false);
              _setShowEnterModal(false);
            }}
          />
        )}
      />
    </View>
  );
}

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
} from "../../data";
import { QuickItemsTab } from "./Options_QuickItemsTab";
import React from "react";
import { cloneDeep } from "lodash";

// export function CustomerInfoComponent({
//   __setInfoComponentName,
//   ssInfoComponentName,
// }) {
//   const [sBox1Val, _setBox1Val] = React.useState("");
//   const [sBox2Val, _setBox2Val] = React.useState("");
//   const [sShowCustomerModal, _setShowCustomerModal] = React.useState(false);
//   const [sSearchingByName, _setSearchingByName] = React.useState(false);
//   const [sFoundExistingCustomer, _setFoundExistingCustomer] =
//     React.useState(false);
//   const [sCustomerInfo, _setCustomerInfo] = React.useState(cloneDeep(CUSTOMER));

//   function handleBox1TextChange(incomingText = "") {
//     let test;
//     if (!sSearchingByName) {
//       if ("1234567890".includes(incomingText[incomingText.length - 1])) {
//         test = incomingText.length <= 10;
//       }
//     } else {
//       test = "qwertyuioplkjhgfdsazxcvbnm-".includes(
//         incomingText[incomingText.length - 1]
//       );
//     }

//     if (!test) {
//       log("removing");
//       _setBox1Val(incomingText.slice(0, incomingText.length - 1));
//     } else {
//       _setBox1Val(incomingText);
//     }
//   }

//   function handleBox2TextChange(incomingText = "") {
//     log("incoming", incomingText);
//     let test = "qwertyuioplkjhgfdsazxcvbnm-".includes(
//       incomingText[incomingText.length - 1]
//     );
//     if (!test) {
//       log("removing characters in box2");
//       _setBox2Val(incomingText.slice(0, incomingText.length - 1));
//     } else {
//       _setBox2Val(incomingText);
//     }
//   }

//   function handleEnterPressed() {
//     let custInfo = cloneDeep(sCustomerInfo);
//     if (sSearchingByName) {
//       custInfo.first = sBox1Val;
//       custInfo.last = sBox2Val;
//     } else {
//       custInfo.phone.cell = sBox1Val;
//     }
//     _setCustomerInfo(custInfo);
//     _setBox1Val("");
//     _setBox2Val("");
//   }

//   return (
//     <View>
//       <View style={{ flexDirection: "row", marginTop: "50%" }}>
//         <View>
//           <Text style={{}}>{sSearchingByName ? "First Name" : "Phone #"}</Text>
//           <TextInput
//             style={{
//               width: sSearchingByName ? 200 : null,
//               borderWidth: 1,
//               width: 160,
//               height: 40,
//             }}
//             value={sBox1Val}
//             onChangeText={(val) => handleBox1TextChange(val)}
//           />
//         </View>
//         <View style={{ width: 10 }} />
//         {sSearchingByName && (
//           <View>
//             <Text style={{}}>{"Last Name"}</Text>
//             <TextInput
//               style={{ borderWidth: 1, width: 160, height: 40 }}
//               value={sBox2Val}
//               onChangeText={(val) => handleBox2TextChange(val)}
//             />
//           </View>
//         )}
//       </View>
//       <ScreenModal
//         modalProps={{ height: "90%", width: "90%" }}
//         handleButtonPress={handleEnterPressed}
//         buttonLabel={"Enter"}
//         Component={() => (
//           <CustomerInputModalInnerComponent
//             sCustomerInfo={cloneDeep(sCustomerInfo)}
//             _setCustomerInfo={_setCustomerInfo}
//           />
//         )}
//       />

//       <Button
//         onPress={() => {
//           _setBox1Val("");
//           _setBox2Val("");
//           _setSearchingByName(!sSearchingByName);
//         }}
//         text={sSearchingByName ? "Use Phone #" : "Use Name"}
//       />
//     </View>
//   );
// }

export function NewCustomerComponent({
  __setInfoComponentName,
  ssInfoComponentName,
  __setCustomerObj,
  ssCustomerObj,
}) {
  const [sBox1Val, _setBox1Val] = React.useState("");
  const [sBox2Val, _setBox2Val] = React.useState("");
  const [sShowCustomerModal, _setShowCustomerModal] = React.useState(false);
  const [sSearchingByName, _setSearchingByName] = React.useState(false);
  const [sFoundExistingCustomer, _setFoundExistingCustomer] =
    React.useState(false);
  const [sCustomerInfo, _setCustomerInfo] = React.useState(cloneDeep(CUSTOMER));

  function handleBox1TextChange(incomingText = "") {
    let test;
    if (!sSearchingByName) {
      if ("1234567890".includes(incomingText[incomingText.length - 1])) {
        test = incomingText.length <= 10;
      }
    } else {
      test = "qwertyuioplkjhgfdsazxcvbnm-".includes(
        incomingText[incomingText.length - 1]
      );
    }

    if (!test) {
      log("removing");
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
    let custInfo = cloneDeep(sCustomerInfo);
    if (sSearchingByName) {
      custInfo.first = sBox1Val;
      custInfo.last = sBox2Val;
    } else {
      custInfo.phone.cell = sBox1Val;
    }
    _setCustomerInfo(custInfo);
    _setBox1Val("");
    _setBox2Val("");
  }

  return (
    <View>
      <View style={{ flexDirection: "row", marginTop: "50%" }}>
        <View>
          <Text style={{}}>{sSearchingByName ? "First Name" : "Phone #"}</Text>
          <TextInput
            style={{
              width: sSearchingByName ? 200 : null,
              borderWidth: 1,
              width: 160,
              height: 40,
            }}
            value={sBox1Val}
            onChangeText={(val) => handleBox1TextChange(val)}
          />
        </View>
        <View style={{ width: 10 }} />
        {sSearchingByName && (
          <View>
            <Text style={{}}>{"Last Name"}</Text>
            <TextInput
              style={{ borderWidth: 1, width: 160, height: 40 }}
              value={sBox2Val}
              onChangeText={(val) => handleBox2TextChange(val)}
            />
          </View>
        )}
      </View>
      <ScreenModal
        modalProps={{ height: "90%", width: "90%" }}
        handleButtonPress={handleEnterPressed}
        buttonLabel={"Enter"}
        Component={() => (
          <CustomerInfoComponent
            sCustomerInfo={cloneDeep(sCustomerInfo)}
            _setCustomerInfo={_setCustomerInfo}
          />
        )}
      />

      <Button
        onPress={() => {
          _setBox1Val("");
          _setBox2Val("");
          _setSearchingByName(!sSearchingByName);
        }}
        text={sSearchingByName ? "Use Phone #" : "Use Name"}
      />
    </View>
  );
}

function CustomerInputModalInnerComponent({
  sCustomerInfo = CUSTOMER,
  _setCustomerInfo,
}) {
  const TEXT_INPUT_STYLE = {
    width: 200,
    height: 40,
    borderColor: "gray",
    borderWidth: 1,
    marginLeft: 20,
    marginTop: 10,
    paddingHorizontal: 3,
  };

  return (
    <TouchableWithoutFeedback>
      <View
        style={{
          width: "60%",
          backgroundColor: "whitesmoke",
          height: "70%",
          flexDirection: "row",
          shadowProps: {
            shadowColor: "black",
            shadowOffset: { width: 2, height: 2 },
            shadowOpacity: 0.3,
            shadowRadius: 5,
          },
        }}
      >
        <View>
          <TextInput
            onChangeText={(val) => {
              sCustomerInfo.phone.cell = val;
              _setCustomerInfo(sCustomerInfo);
            }}
            placeholderTextColor="darkgray"
            placeholder="Cell phone"
            style={{ ...TEXT_INPUT_STYLE }}
            value={sCustomerInfo.phone.cell}
            autoComplete="none"
          />
          <TextInput
            onChangeText={(val) => {
              sCustomerInfo.phone.landline = val;
              _setCustomerInfo(sCustomerInfo);
            }}
            placeholderTextColor="darkgray"
            placeholder="Landline"
            style={{ ...TEXT_INPUT_STYLE }}
            value={sCustomerInfo.phone.landline}
            autoComplete="none"
          />
          <TextInput
            onChangeText={(val) => {
              sCustomerInfo.first = val;
              _setCustomerInfo(sCustomerInfo);
            }}
            placeholderTextColor="darkgray"
            placeholder="First name"
            style={{ ...TEXT_INPUT_STYLE }}
            value={sCustomerInfo.first}
            autoComplete="none"
          />
          <TextInput
            onChangeText={(val) => {
              sCustomerInfo.last(val);
              _setCustomerInfo(sCustomerInfo);
            }}
            placeholderTextColor="darkgray"
            placeholder="Last name"
            style={{ ...TEXT_INPUT_STYLE }}
            value={sCustomerInfo.last}
            autoComplete="none"
          />
          <TextInput
            onChangeText={(val) => {
              sCustomerInfo.email(val);
              _setCustomerInfo(sCustomerInfo);
            }}
            placeholderTextColor="darkgray"
            placeholder="Email address"
            style={{ ...TEXT_INPUT_STYLE }}
            value={sCustomerInfo.email}
            autoComplete="none"
          />
          <TextInput
            onChangeText={(val) => {
              sCustomerInfo.address.streetAddress = val;
              _setCustomerInfo(sCustomerInfo);
            }}
            placeholderTextColor="darkgray"
            placeholder="Street address"
            style={{ ...TEXT_INPUT_STYLE }}
            value={sCustomerInfo.address.streetAddress}
            autoComplete="none"
          />
          <TextInput
            onChangeText={(val) => {
              sCustomerInfo.address.unit = val;
              _setCustomerInfo(sCustomerInfo);
            }}
            placeholderTextColor="darkgray"
            placeholder="Unit"
            style={{ ...TEXT_INPUT_STYLE }}
            value={sCustomerInfo.address.unit}
            autoComplete="none"
          />
          <TextInput
            onChangeText={(val) => {
              sCustomerInfo.address.city = val;
              _setCustomerInfo(sCustomerInfo);
            }}
            placeholderTextColor="darkgray"
            placeholder="City"
            style={{ ...TEXT_INPUT_STYLE }}
            value={sCustomerInfo.address.city}
            autoComplete="none"
          />
          <TextInput
            onChangeText={(val) => {
              sCustomerInfo.address.state = val;
              _setCustomerInfo(sCustomerInfo);
            }}
            placeholderTextColor="darkgray"
            placeholder="State"
            style={{ ...TEXT_INPUT_STYLE }}
            value={sCustomerInfo.address.state}
            autoComplete="none"
          />
          <TextInput
            onChangeText={(val) => {
              sCustomerInfo.address.zip = val;
              _setCustomerInfo(sCustomerInfo);
            }}
            placeholderTextColor="darkgray"
            placeholder="Zip code"
            style={{ ...TEXT_INPUT_STYLE }}
            value={sCustomerInfo.address.zip}
            autoComplete="none"
          />
          <TextInput
            onChangeText={(val) => {
              sCustomerInfo.address.notes(val);
              _setCustomerInfo(sCustomerInfo);
            }}
            placeholderTextColor="darkgray"
            placeholder="Address notes"
            style={{ ...TEXT_INPUT_STYLE }}
            value={sCustomerInfo.address.notes}
            autoComplete="none"
          />
          <Button
            onPress={() => {
              log("pressed");
            }}
            viewStyle={{
              marginTop: 30,
              marginLeft: 20,
              backgroundColor: "lightgray",
              height: 40,
              width: 200,
            }}
            textStyle={{ color: "dimgray" }}
            text={"Create New Customer"}
          />
        </View>
        <View>
          <View style={{ borderWidth: 1, width: 300, height: 300 }} />
          <Text>Workorder list</Text>
          <View style={{ borderWidth: 1, width: 300, height: 300 }} />
          <Text>Payments</Text>
        </View>
      </View>
    </TouchableWithoutFeedback>
  );
}

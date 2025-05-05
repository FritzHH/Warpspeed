import {
  View,
  Text,
  Pressable,
  TextInput,
  FlatList,
  TouchableOpacity,
} from "react-native-web";
import { dim, log, trimToTwoDecimals } from "../../utils";
import {
  HorzSpacer,
  TabMenuButton,
  TabMenuDivider as Divider,
  ModalDropdown,
  TextInputOnMainBackground,
  TextInputLabelOnMainBackground,
} from "../../components";
import { Colors } from "../../styles";
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
import {
  CustomerInfoComponent,
  IncomingCustomerComponent,
} from "./Info_CreateNewWorkorderComponent";

export const Info_MainComponent = ({
  ssCustomerObj = CUSTOMER,
  ssWorkorderObj = WORKORDER,
  __setCustomerObj,
  __setWorkorderObj,
}) => {
  function setBikeColor(incomingColorVal) {
    log("incoming", incomingColorVal);
    let foundColor = false;
    let newColorObj = {};
    BIKE_COLORS_ARR.forEach((bikeColorObj) => {
      if (bikeColorObj.label.toLowerCase() === incomingColorVal.toLowerCase()) {
        foundColor = true;
        newColorObj = { ...bikeColorObj };
      }
    });
    if (!foundColor) {
      // log("not found", incomingColorVal);
      newColorObj.label = newColorObj.label;
      newColorObj.backgroundColor = null;
      newColorObj.textColor = null;
    }

    // log("setting", newColorObj);
    ssWorkorderObj.color = newColorObj;
    __setWorkorderObj(ssWorkorderObj);
  }

  return (
    <View style={{ height: "100%", width: "100%", paddingRight: 7 }}>
      <Text style={{ color: Colors.darkTextOnMainBackground, fontSize: 30 }}>
        {ssCustomerObj.first + " " + ssCustomerObj.last}
      </Text>
      <View
        style={{
          marginTop: 10,
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        {ssCustomerObj.phone.cell ? (
          <Text style={{ color: Colors.lightTextOnMainBackground }}>
            {"Cell:  " + ssCustomerObj.phone.cell}
          </Text>
        ) : null}
        {ssCustomerObj.phone.cell ? (
          <Text style={{ color: Colors.lightTextOnMainBackground }}>
            {"Land:  " + ssCustomerObj.phone.landline}
          </Text>
        ) : null}
        {ssCustomerObj.phone.callOnlyOption ? (
          <Text style={{ color: "pink" }}>CALL ONLY</Text>
        ) : null}
        {ssCustomerObj.phone.emailOnlyOption ? (
          <Text style={{ color: "pink" }}>EMAIL ONLY</Text>
        ) : null}
      </View>
      <TextInputLabelOnMainBackground
        // value={"BRAND"}
        styleProps={{ marginTop: 10 }}
      />
      <View
        style={{
          marginTop: 30,
          flexDirection: "row",
          justifyContent: "flex-start",
          width: "100%",
        }}
      >
        <TextInputOnMainBackground
          placeholderText={"Brand"}
          styleProps={{ marginRight: 5 }}
          value={ssWorkorderObj.brand}
          onTextChange={(val) => {
            log(val);
            ssWorkorderObj.brand = val;
            __setWorkorderObj(ssWorkorderObj);
          }}
        />
        <ModalDropdown
          itemListStyle={{ width: 80 }}
          modalStyle={{
            alignSelf: "flex-start",
            marginVertical: "2%",
            width: "30%",
          }}
          closeButtonText={"Close"}
          removeButtonText={"Remove"}
          buttonLabel={BRANDS.brands1Title}
          buttonStyle={{ width: 90 }}
          data={BRANDS.brands1}
          currentSelectionName={ssWorkorderObj.brand}
          onSelect={(val) => {
            ssWorkorderObj.brand = val;
            __setWorkorderObj(ssWorkorderObj);
          }}
          onRemoveSelection={() => {
            ssWorkorderObj.brand = "";
            __setWorkorderObj(ssWorkorderObj);
          }}
        />
        <View style={{ width: 3 }} />
        <ModalDropdown
          itemListStyle={{ width: 100 }}
          modalStyle={{
            alignSelf: "flex-start",
            marginVertical: "2%",
            width: "30%",
          }}
          data={BRANDS.brands2}
          buttonLabel={BRANDS.brands2Title}
          closeButtonText={"Close"}
          removeButtonText={"Remove"}
          buttonStyle={{ width: 70 }}
          currentSelectionName={ssWorkorderObj.brand}
          onSelect={(val) => {
            ssWorkorderObj.brand = val;
            __setWorkorderObj(ssWorkorderObj);
          }}
          onRemoveSelection={() => {
            ssWorkorderObj.brand = "";
            __setWorkorderObj(ssWorkorderObj);
          }}
        />
      </View>
      <TextInputLabelOnMainBackground
        // value={"MODEL/DESCRIPTION"}
        styleProps={{ marginTop: 10, marginBottom: 2 }}
      />
      <View
        style={{
          flexDirection: "row",
          justifyContent: "flex-start",
          width: "100%",
          alignItems: "center",
        }}
      >
        <TextInputOnMainBackground
          placeholderText={"Model/Description"}
          styleProps={{ marginRight: 2 }}
          value={ssWorkorderObj.description}
          onTextChange={(val) => {
            ssWorkorderObj.description = val;
            __setWorkorderObj(ssWorkorderObj);
          }}
        />
        <ModalDropdown
          itemListStyle={{ width: 100 }}
          modalStyle={{
            alignSelf: "flex-start",
            marginVertical: "2%",
            width: "30%",
          }}
          data={BIKE_DESCRIPTIONS}
          buttonLabel={"Descriptions"}
          closeButtonText={"Close"}
          buttonStyle={{ width: 90 }}
          removeButtonText={"Remove"}
          currentSelectionName={ssWorkorderObj.description}
          onSelect={(val) => {
            ssWorkorderObj.description = val;
            __setWorkorderObj(ssWorkorderObj);
          }}
          onRemoveSelection={() => {
            ssWorkorderObj.description = "";
            __setWorkorderObj(ssWorkorderObj);
          }}
        />
      </View>
      <TextInputLabelOnMainBackground
        // value={"COLOR"}
        styleProps={{
          marginTop: 10,
          marginBottom: 2,
        }}
      />
      <View
        style={{
          flexDirection: "row",
          justifyContent: "flex-start",
          width: "100%",
        }}
      >
        <TextInputOnMainBackground
          placeholderText={"Color"}
          value={ssWorkorderObj.color.label}
          styleProps={{
            marginRight: 2,
            backgroundColor: ssWorkorderObj.color.backgroundColor,
            color: ssWorkorderObj.color.textColor,
          }}
          onTextChange={(val) => {
            setBikeColor(val);
          }}
        />
        <ModalDropdown
          itemListStyle={{
            width: 120,
          }}
          modalStyle={{
            alignSelf: "flex-start",
            marginVertical: "2%",
            width: "30%",
          }}
          data={BIKE_COLORS_ARR}
          closeButtonText={"Close"}
          buttonStyle={{ width: 90 }}
          removeButtonText={"Remove Color"}
          buttonLabel={"Colors"}
          currentSelection={ssWorkorderObj.color}
          onSelect={(val) => {
            ssWorkorderObj.color = val;
            __setWorkorderObj(ssWorkorderObj);
          }}
          onRemoveSelection={() => {
            ssWorkorderObj.color = {
              label: "",
              backgroundColor: "",
              textColor: "",
            };
            __setWorkorderObj(ssWorkorderObj);
          }}
        />
      </View>
      <TextInputLabelOnMainBackground
        placeholderText={"Part Ordered"}
        // value={"PART ORDERED"}
        styleProps={{ marginTop: 10, marginBottom: 2 }}
      />
      <View
        style={{
          flexDirection: "row",
          justifyContent: "flex-start",
          alignItems: "center",
          width: "100%",
        }}
      >
        <TextInputOnMainBackground
          placeholderText={"Part Source"}
          styleProps={{ marginRight: 2 }}
          value={ssWorkorderObj.partOrdered}
          onTextChange={(val) => {
            ssWorkorderObj.partOrdered = val;
            __setWorkorderObj(ssWorkorderObj);
          }}
        />
      </View>
      <TextInputLabelOnMainBackground
        // value={"PART SOURCE"}
        styleProps={{ marginTop: 10, marginBottom: 2 }}
      />
      <View
        style={{
          // marginTop: 8,
          flexDirection: "row",
          justifyContent: "flex-start",
          alignItems: "center",
          width: "100%",
        }}
      >
        <TextInputOnMainBackground
          value={ssWorkorderObj.partSource}
          styleProps={{ marginRight: 2 }}
          onTextChange={(val) => {
            log(val);
            ssWorkorderObj.partSource = val;
            __setWorkorderObj(ssWorkorderObj);
          }}
        />
        <ModalDropdown
          itemListStyle={{ width: 90 }}
          modalStyle={{
            alignSelf: "flex-start",
            marginVertical: "2%",
            width: "30%",
          }}
          data={PART_SOURCES}
          closeButtonText={"Close"}
          removeButtonText={"Remove"}
          buttonStyle={{ width: 90 }}
          buttonLabel={"Sources"}
          currentSelectionName={ssWorkorderObj.partSource}
          onSelect={(val) => {
            ssWorkorderObj.partSource = val;
            __setWorkorderObj(ssWorkorderObj);
          }}
          onRemoveSelection={() => {
            ssWorkorderObj.partSource = "";
            __setWorkorderObj(ssWorkorderObj);
          }}
        />
      </View>
    </View>
  );
};

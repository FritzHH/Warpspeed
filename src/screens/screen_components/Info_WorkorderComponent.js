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
  ScreenModal,
  CustomerInfoComponent,
  Button,
} from "../../components";
import { Colors } from "../../styles";
import {
  bike_colors_db,
  bike_brands_db,
  CUSTOMER_PROTO,
  bike_descriptions_db,
  discounts_db,
  part_sources_db,
  WORKORDER_PROTO,
  WORKORDER_ITEM_PROTO,
  bike_colors_arr_db,
  FOCUS_NAMES,
} from "../../data";
import { IncomingCustomerComponent } from "./Info_CustomerInfoComponent";
import React, { useRef } from "react";
import { cloneDeep } from "lodash";

export const Info_WorkorderComponent = ({
  ssCustomerObj = CUSTOMER_PROTO,
  ssWorkorderObj = WORKORDER_PROTO,
  __setCustomerObj,
  __setWorkorderObj,
  __handleCreateNewWorkorderPressed,
}) => {
  const [sShowCustomerInfoModal, _setShowCustomerInfoModal] =
    React.useState(false);
  const [sInfoTextFocus, _setInfoTextFocus] = React.useState(null);

  function setBikeColor(incomingColorVal) {
    let foundColor = false;
    let newColorObj = {};
    bike_colors_arr_db.forEach((bikeColorObj) => {
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

  function closeModal() {
    _setShowCustomerInfoModal(false);
    setTimeout(() => {
      _setShowCustomerInfoModal(true);
    }, 300);
    // _setS;
  }

  // const exitButtonRef = useRef(null)
  return (
    <View style={{ height: "100%", width: "100%", paddingRight: 7 }}>
      <View
        style={{
          flexDirection: "row",
          width: "100%",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <ScreenModal
          showShadow={false}
          showButtonIcon={false}
          showModal={sShowCustomerInfoModal}
          outerModalStyle={{ height: "90%", width: "90%" }}
          buttonLabel={ssCustomerObj.first + " " + ssCustomerObj.last}
          buttonStyle={{
            alignItems: "flex-start",
            justifyContent: "center",
            paddingLeft: 0,
          }}
          mouseOverOptions={{ highlightColor: "transparent" }}
          handleButtonPress={() => _setShowCustomerInfoModal(true)}
          buttonTextStyle={{
            fontSize: 25,
            color: Colors.darkText,
          }}
          shadowProps={{ shadowColor: "transparent" }}
          Component={() => (
            <CustomerInfoComponent
              sCustomerInfo={ssCustomerObj}
              _setCustomerInfo={__setCustomerObj}
              handleExitScreenPress={closeModal}
              exitScreenButtonText={"Close"}
              ssInfoTextFocus={sInfoTextFocus}
              __setInfoTextFocus={_setInfoTextFocus}
            />
          )}
        />

        <Button
          onPress={__handleCreateNewWorkorderPressed}
          text={"+"}
          shadow={false}
          buttonStyle={{ width: null }}
          textStyle={{
            padding: 5,
            fontSize: 50,
            color: "red",
          }}
        />
      </View>
      {ssWorkorderObj && (
        <View>
          <View
            style={{
              // marginTop: 10,
              flexDirection: "row",
              justifyContent: "space-between",
              // backgroundColor: "red",
            }}
          >
            {ssCustomerObj.phone.cell.length > 0 ? (
              <Text style={{ color: Colors.lightTextOnMainBackground }}>
                {"Cell:  " + ssCustomerObj.phone.cell}
              </Text>
            ) : null}
            {ssCustomerObj.phone.landline.length > 0 ? (
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
              marginTop: 15,
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
                // log(val);
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
              removeButtonText={"Remove Color"}
              buttonLabel={bike_brands_db.brands1Title}
              buttonStyle={{ width: 90 }}
              data={bike_brands_db.brands1}
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
              data={bike_brands_db.brands2}
              buttonLabel={bike_brands_db.brands2Title}
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
              data={bike_descriptions_db}
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
              data={bike_colors_arr_db}
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
              placeholderText={"Part Ordered"}
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
              placeholderText={"Part Source"}
              styleProps={{ marginRight: 2 }}
              onTextChange={(val) => {
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
              data={part_sources_db}
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
      )}
    </View>
  );
};

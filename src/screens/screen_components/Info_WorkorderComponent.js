/* eslint-disable */

import { View, Text, TextInput } from "react-native-web";
import { dim, log, trimToTwoDecimals } from "../../utils";
import {
  TabMenuDivider as Divider,
  ModalDropdown,
  // TextInputOnMainBackground,
  TextInputLabelOnMainBackground,
  ScreenModal,
  CustomerInfoComponent,
  Button,
  SHADOW_RADIUS_NOTHING,
  SHADOW_RADIUS_PROTO,
} from "../../components";
import { Colors } from "../../styles";
import {
  bike_brands_db,
  bike_descriptions_db,
  part_sources_db,
  bike_colors_arr_db,
  SETTINGS_PROTO,
  WORKORDER_PROTO,
  CUSTOMER_PROTO,
} from "../../data";
import { IncomingCustomerComponent } from "./Info_CustomerInfoComponent";
import React, { useRef } from "react";
import { cloneDeep } from "lodash";
import {
  useCurrentCustomerStore,
  useCurrentWorkorderStore,
  useSettingsStore,
} from "../../stores";
import { dbSetCustomerObj, dbSetOpenWorkorderItem } from "../../db_calls";

export const Info_WorkorderComponent = ({
  __handleCreateNewWorkorderPressed,
}) => {
  // getters
  let zWorkorderObj = WORKORDER_PROTO;
  zWorkorderObj = useCurrentWorkorderStore((state) => state.getWorkorderObj());
  let zCustomerObj = CUSTOMER_PROTO;
  zCustomerObj = useCurrentCustomerStore((state) => state.getCustomerObj());
  var zSettingsObj = SETTINGS_PROTO;
  zSettingsObj = useSettingsStore((state) => state.getSettingsObj());
  // setters
  const _zSetWorkorderObj = useCurrentWorkorderStore(
    (state) => state.setWorkorderObj
  );
  const _zSetCustomerObj = useCurrentWorkorderStore(
    (state) => state.customerObj
  );
  ////////////////////////////////////////////////////////////////////
  const [sShowCustomerInfoModal, _setShowCustomerInfoModal] =
    React.useState(false);
  const [sInfoTextFocus, _setInfoTextFocus] = React.useState(null);

  function setWorkorderObj(obj) {
    _zSetWorkorderObj(obj);
    dbSetOpenWorkorderItem(obj);
  }

  function setCustomerObj(obj) {
    _zSetCustomerObj(obj);
    dbSetCustomerObj(obj);
  }
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
      // newColorObj.label = newColorObj.label;
      newColorObj.backgroundColor = null;
      newColorObj.textColor = null;
    }

    // log("setting", newColorObj);
    let wo = { ...zWorkorderObj };
    wo.color = newColorObj;
    setWorkorderObj(wo);
  }

  function closeModal() {
    _setShowCustomerInfoModal(false);
    setTimeout(() => {
      _setShowCustomerInfoModal(true);
    }, 300);
    // _setS;
  }

  function getBackgroundColor(workorderObj) {
    let backgroundColor;
    let textColor;
    let color = zSettingsObj.statusGroups.find((o) => {
      let members = o.members;

      members.forEach((member) => {
        if (member === zWorkorderObj.status) {
          textColor = o.textColor;
          backgroundColor = o.color;
        }
      });
      return backgroundColor;
    });
    // log(backgroundColor, textColor);
    return { backgroundColor, textColor };
  }

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
          buttonLabel={
            zWorkorderObj.customerFirst + " " + zWorkorderObj.customerLast
          }
          buttonStyle={{
            alignItems: "flex-start",
            justifyContent: "center",
            paddingLeft: 0,
          }}
          mouseOverOptions={{ highlightColor: "transparent" }}
          handleButtonPress={() => _setShowCustomerInfoModal(true)}
          buttonTextStyle={{
            fontSize: 25,
            color: Colors.lightText,
          }}
          shadowProps={{ shadowColor: "transparent" }}
          Component={() => (
            <CustomerInfoComponent
              sCustomerInfo={zCustomerObj}
              _setCustomerInfo={setCustomerObj}
              handleButton1Press={closeModal}
              button1Text={"Close"}
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
      {zWorkorderObj && (
        <View>
          <View
            style={{
              // marginTop: 10,
              flexDirection: "row",
              justifyContent: "space-between",
              // backgroundColor: "red",
            }}
          >
            {zCustomerObj.cell.length > 0 ? (
              <Text style={{ color: Colors.darkText }}>
                {"Cell:  " + zCustomerObj.cell}
              </Text>
            ) : null}
            {zCustomerObj.landline.length > 0 ? (
              <Text style={{ color: Colors.darkText }}>
                {"Land:  " + zCustomerObj.landline}
              </Text>
            ) : null}
            {zCustomerObj.contactRestriction === "CALL" ? (
              <Text style={{ color: Colors.darkText }}>CALL ONLY</Text>
            ) : null}
            {zCustomerObj.contactRestriction === "EMAIL" ? (
              <Text style={{ color: Colors.darkText }}>EMAIL ONLY</Text>
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
              value={zWorkorderObj.brand}
              onTextChange={(val) => {
                // log(val);
                zWorkorderObj.brand = val;
                setWorkorderObj(zWorkorderObj);
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
              buttonLabel={zSettingsObj.bikeBrandsName}
              // buttonStyle={{ width: 90 }}
              data={zSettingsObj.bikeBrands}
              currentSelectionName={zWorkorderObj.brand}
              onSelect={(val) => {
                zWorkorderObj.brand = val;
                setWorkorderObj(zWorkorderObj);
              }}
              onRemoveSelection={() => {
                zWorkorderObj.brand = "";
                setWorkorderObj(zWorkorderObj);
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
              data={zSettingsObj.bikeOptionalBrands}
              buttonLabel={zSettingsObj.bikeOptionalBrandsName}
              closeButtonText={"Close"}
              removeButtonText={"Remove"}
              buttonStyle={{ width: 70 }}
              currentSelectionName={zWorkorderObj.brand}
              onSelect={(val) => {
                let newObj = { ...zWorkorderObj };
                newObj.brand = val;
                setWorkorderObj(newObj);
              }}
              onRemoveSelection={() => {
                let newObj = { ...zWorkorderObj };
                newObj.brand = "";
                setWorkorderObj(newObj);
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
              value={zWorkorderObj.description}
              onTextChange={(val) => {
                let newObj = { ...zWorkorderObj };
                newObj.description = val;
                setWorkorderObj(newObj);
              }}
            />
            <ModalDropdown
              itemListStyle={{ width: 100 }}
              modalStyle={{
                alignSelf: "flex-start",
                marginVertical: "2%",
                width: "30%",
              }}
              data={zSettingsObj.bikeDescriptions}
              buttonLabel={"Descriptions"}
              closeButtonText={"Close"}
              buttonStyle={{ width: 90 }}
              removeButtonText={"Remove"}
              currentSelectionName={zWorkorderObj.description}
              onSelect={(val) => {
                let newObj = { ...zWorkorderObj };
                newObj.description = val;
                setWorkorderObj(newObj);
              }}
              onRemoveSelection={() => {
                let newObj = { ...zWorkorderObj };
                newObj.description = "";
                setWorkorderObj(newObj);
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
              value={zWorkorderObj.color.label}
              styleProps={{
                marginRight: 2,
                backgroundColor: zWorkorderObj.color.backgroundColor,
                color: zWorkorderObj.color.textColor,
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
              data={zSettingsObj.bikeColors}
              closeButtonText={"Close"}
              buttonStyle={{ width: 90 }}
              removeButtonText={"Remove Color"}
              buttonLabel={"Colors"}
              currentSelection={zWorkorderObj.color}
              onSelect={(val) => {
                let newObj = { ...zWorkorderObj };
                newObj.color = val;
                setWorkorderObj(newObj);
              }}
              onRemoveSelection={() => {
                let newObj = { ...zWorkorderObj };
                newObj.color = {
                  label: "",
                  backgroundColor: "",
                  textColor: "",
                };
                setWorkorderObj(newObj);
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
              value={zWorkorderObj.partOrdered}
              onTextChange={(val) => {
                let newObj = { ...zWorkorderObj };
                newObj.partOrdered = val;
                setWorkorderObj(newObj);
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
              value={zWorkorderObj.partSource}
              placeholderText={"Part Source"}
              styleProps={{ marginRight: 2 }}
              onTextChange={(val) => {
                let newObj = { ...zWorkorderObj };
                newObj.partSource = val;
                setWorkorderObj(newObj);
              }}
            />
            <ModalDropdown
              itemListStyle={{ width: 90 }}
              modalStyle={{
                alignSelf: "flex-start",
                marginVertical: "2%",
                width: "30%",
              }}
              data={zSettingsObj.partSources}
              closeButtonText={"Close"}
              removeButtonText={"Remove"}
              buttonStyle={{ width: 90 }}
              buttonLabel={"Sources"}
              currentSelectionName={zWorkorderObj.partSource}
              onSelect={(val) => {
                let newObj = { ...zWorkorderObj };
                newObj.partSource = val;
                setWorkorderObj(newObj);
              }}
              onRemoveSelection={() => {
                let newObj = { ...zWorkorderObj };
                newObj.partSource = "";
                setWorkorderObj(newObj);
              }}
            />
          </View>
          <View
            style={{
              // marginTop: 8,
              flexDirection: "row",
              justifyContent: "center",
              marginTop: 8,
              alignItems: "center",
              width: "90%",
              padding: 5,
              backgroundColor: getBackgroundColor().backgroundColor,
              ...SHADOW_RADIUS_PROTO,
            }}
          >
            <ModalDropdown
              // itemListStyle={{ width: 90 }}
              modalStyle={{
                alignSelf: "flex-start",
                marginVertical: "2%",
                width: "30%",
              }}
              data={zSettingsObj.statuses}
              closeButtonText={"Close"}
              // removeButtonText={"Remove"}
              // buttonStyle={{ width: 90 }}
              buttonStyle={{
                width: "100%",
                backgroundColor: "transparent",
                ...SHADOW_RADIUS_NOTHING,
              }}
              textStyle={{ color: getBackgroundColor().textColor }}
              buttonLabel={zWorkorderObj.status}
              onSelect={(val) => {
                let newObj = cloneDeep(zWorkorderObj);
                newObj.status = val;
                setWorkorderObj(newObj);
              }}
            />
          </View>
        </View>
      )}
    </View>
  );
};

const TextInputOnMainBackground = ({
  value,
  onTextChange,
  styleProps = {},
  placeholderText,
}) => {
  return (
    <TextInput
      value={value}
      placeholder={placeholderText}
      placeholderTextColor={"lightgray"}
      style={{
        borderWidth: 2,
        borderColor: "dimgray",
        color: "dimgray",
        paddingVertical: 3,
        paddingHorizontal: 4,
        fontSize: 16,
        outlineWidth: 0,
        ...styleProps,
      }}
      onChangeText={(val) => onTextChange(val)}
    />
  );
};

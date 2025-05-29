/* eslint-disable */

import { View, Text } from "react-native-web";
import { dim, log, trimToTwoDecimals } from "../../utils";
import {
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
  bike_brands_db,
  bike_descriptions_db,
  part_sources_db,
  bike_colors_arr_db,
} from "../../data";
import { IncomingCustomerComponent } from "./Info_CustomerInfoComponent";
import React, { useRef } from "react";
import { cloneDeep } from "lodash";
import {
  useCurrentCustomerStore,
  useCurrentWorkorderStore,
} from "../../stores";
import { dbSetCustomerObj, dbSetOpenWorkorderItem } from "../../db_calls";

export const Info_WorkorderComponent = ({
  __handleCreateNewWorkorderPressed,
}) => {
  const zWorkorderObj = {
    ...useCurrentWorkorderStore((state) => state.getWorkorderObj()),
  };
  const zCustomerObj = {
    ...useCurrentCustomerStore((state) => state.getCustomerObj()),
  };
  ////
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
            color: Colors.darkText,
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
              <Text style={{ color: Colors.lightTextOnMainBackground }}>
                {"Cell:  " + zCustomerObj.cell}
              </Text>
            ) : null}
            {zCustomerObj.landline.length > 0 ? (
              <Text style={{ color: Colors.lightTextOnMainBackground }}>
                {"Land:  " + zCustomerObj.landline}
              </Text>
            ) : null}
            {zCustomerObj.contactRestriction === "CALL" ? (
              <Text style={{ color: "pink" }}>CALL ONLY</Text>
            ) : null}
            {zCustomerObj.contactRestriction === "EMAIL" ? (
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
              buttonLabel={bike_brands_db.brands1Title}
              buttonStyle={{ width: 90 }}
              data={bike_brands_db.brands1}
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
              data={bike_brands_db.brands2}
              buttonLabel={bike_brands_db.brands2Title}
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
              data={bike_descriptions_db}
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
              data={bike_colors_arr_db}
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
              data={part_sources_db}
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
        </View>
      )}
    </View>
  );
};

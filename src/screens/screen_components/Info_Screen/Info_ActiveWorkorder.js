/* eslint-disable */

import { View, Text, TextInput } from "react-native-web";
import {
  formatPhoneWithDashes,
  generateUPCBarcode,
  gray,
  log,
} from "../../../utils";
import {
  ScreenModal,
  SHADOW_RADIUS_NOTHING,
  DropdownMenu,
  Button_,
  Image_,
} from "../../../components";
import { C, COLOR_GRADIENTS, Colors, ICONS } from "../../../styles";
import {
  SETTINGS_OBJ,
  WORKORDER_PROTO,
  CUSTOMER_PROTO,
  TAB_NAMES,
  COLORS,
  NONREMOVABLE_STATUSES,
  CONTACT_RESTRICTIONS,
} from "../../../data";
import React, { useRef, useState } from "react";
import { cloneDeep } from "lodash";
import {
  useCurrentCustomerStore,
  useOpenWorkordersStore,
  useLoginStore,
  useSettingsStore,
  useTabNamesStore,
} from "../../../stores";
import { CustomerInfoScreenModalComponent } from "../modal_screens/CustomerInfoModalScreen";
const DROPDOWN_SELECTED_OPACITY = 0.3;

export const ActiveWorkorderComponent = ({}) => {
  // store setters /////////////////////////////////////////////////////////////////
  const _zSetWorkorder = useOpenWorkordersStore((state) => state.setWorkorder);
  const _zSetCustomer = useCurrentCustomerStore((state) => state.setCustomer);
  const _zSetInfoTabName = useTabNamesStore((state) => state.setInfoTabName);
  const _zSetOptionsTabName = useTabNamesStore(
    (state) => state.setOptionsTabName
  );
  const _zSetItemsTabName = useTabNamesStore((state) => state.setItemsTabName);

  const _zSetWorkorderField = useOpenWorkordersStore((s) => s.setField);

  // store getters ///////////////////////////////////////////////////////////////////
  let zOpenWorkorder = WORKORDER_PROTO;
  zOpenWorkorder = useOpenWorkordersStore((state) => state.getOpenWorkorder());
  let zCustomer = CUSTOMER_PROTO;
  zCustomer = useCurrentCustomerStore((state) => state.customer);
  var zSettings = SETTINGS_OBJ;
  zSettings = useSettingsStore((state) => state.settings);
  const zCurrentUser = useLoginStore((state) => state.currentUser);

  ///////////////////////////////////////////////////////////////////////////////
  const [sShowCustomerInfoScreen, _setShowCustomerInfoScreen] =
    React.useState(false);
  const [sCustomerScreenTextFocus, _setCustomerScreenTextFocus] = useState("");

  // Refs for dropdown components
  const bikesRef = useRef();
  const ebikeRef = useRef();
  const descriptionRef = useRef();
  const color1Ref = useRef();
  const color2Ref = useRef();
  const waitTimesRef = useRef();
  const statusRef = useRef();
  const partSourcesRef = useRef();

  // dev
  ///////////////////////////////////////////////////////////////////////////////
  ///////////////////////////////////////////////////////////////////////////////

  // log("wo", zWorkorderObj);
  function setBikeColor(incomingColorVal, fieldName) {
    let foundColor = false;
    let newColorObj = {};
    COLORS.forEach((bikeColorObj) => {
      if (bikeColorObj.label.toLowerCase() === incomingColorVal.toLowerCase()) {
        foundColor = true;
        newColorObj = cloneDeep(bikeColorObj);
      }
    });
    if (!foundColor) {
      newColorObj.label = incomingColorVal;
      newColorObj.backgroundColor = null;
      newColorObj.textColor = null;
    }

    _zSetWorkorderField(fieldName, newColorObj, zOpenWorkorder.id);
  }

  function handleStartStandaloneSalePress() {
    // log(zCurrentUser);
    // return;
    let wo = cloneDeep(WORKORDER_PROTO);
    wo.isStandaloneSale = true;
    wo.id = generateUPCBarcode();
    wo.startedBy = zCurrentUser.id;
    wo.startedOnMillis = new Date().getTime();

    useOpenWorkordersStore.setOpenWorkorderID(wo.id);
    _zSetInfoTabName(TAB_NAMES.infoTab.checkout);
    _zSetItemsTabName(TAB_NAMES.infoTab.workorder);
    _zSetOptionsTabName(TAB_NAMES.optionsTab.inventory);
  }

  function handleNewWorkorderPress() {
    null;
    _zSetCustomer(null);
    _zSetInfoTabName(TAB_NAMES.infoTab.customer);
  }

  function handleCustomerNewWorkorderPress(customer) {
    // log("here");
    // log("cust", zCurrentUser);
    // return;
    _setShowCustomerInfoScreen();
    let wo = cloneDeep(WORKORDER_PROTO);
    wo.customerID = customer.id;
    wo.changeLog = wo.changeLog.push(
      "Started by: " + zCurrentUser.first + " " + zCurrentUser.last[0]
    );
    wo.customerFirst = customer.first;
    wo.customerLast = customer.last;
    wo.customerPhone = customer.cell || customer.landline;
    wo.id = generateUPCBarcode();
    wo.startedOnMillis = new Date().getTime();
    wo.status = SETTINGS_OBJ.statuses[0];
    useOpenWorkordersStore.getState().setWorkorder(wo, false);
    useOpenWorkordersStore.getState().setOpenWorkorderID(wo.id);
  }

  const dropdownButtonStyle = {
    width: "100%",
    backgroundColor: C.buttonLightGreen,
    // ...SHADOW_RADIUS_NOTHING,
    borderColor: C.buttonLightGreenOutline,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    paddingVertical: 2,
    borderRadius: 5,
  };

  const dropdownButtonTextStyle = {
    fontSize: 13,
    color: gray(0.55),
    fontWeight: 500,
    // width: "100%",
  };

  return (
    <View
      style={{
        flex: 1,
        justifyContent: "space-between",
        alignItems: "center",
        paddingBottom: 11,
        paddingTop: 5,
        paddingHorizontal: 5,
        backgroundColor: C.backgroundWhite,
        borderRadius: 7,
      }}
    >
      <View
        style={{
          width: "100%",
          alignItems: "center",
        }}
      >
        <View
          style={{
            width: "100%",
            justifyContent: "center",
            alignItems: "center",
            paddingVertical: 11,
            backgroundColor: C.buttonLightGreen,
            borderColor: C.buttonLightGreenOutline,
            borderWidth: 1,
            borderRadius: 7,
          }}
        >
          <ScreenModal
            modalVisible={sShowCustomerInfoScreen}
            showOuterModal={true}
            buttonLabel={
              zOpenWorkorder.customerFirst + " " + zOpenWorkorder.customerLast
            }
            buttonIcon={ICONS.ridingBike}
            buttonIconStyle={{ width: 35, height: 35 }}
            buttonStyle={{
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: 5,
              borderRadius: 5,
              paddingHorizontal: 20,
              backgroundColor: "transparent",
            }}
            handleButtonPress={() => _setShowCustomerInfoScreen(true)}
            buttonTextStyle={{
              fontSize: 25,
              color: Colors.lightText,
            }}
            Component={() => (
              <CustomerInfoScreenModalComponent
                focus={sCustomerScreenTextFocus}
                setFocus={_setCustomerScreenTextFocus}
                incomingCustomer={useCurrentCustomerStore.getState().customer}
                button1Text={"New Workorder"}
                button2Text={"Close"}
                handleButton1Press={() =>
                  handleCustomerNewWorkorderPress(
                    useCurrentCustomerStore.getState().customer
                  )
                }
                handleButton2Press={() => _setShowCustomerInfoScreen(false)}
              />
            )}
          />
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              borderColor: C.buttonLightGreenOutline,
              borderRadius: 15,
              borderWidth: 1,
              marginTop: 5,
              padding: 5,
              width: "95%",
            }}
          >
            {zCustomer.cell.length > 0 && (
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Image_
                  icon={ICONS.cellPhone}
                  size={25}
                  style={{ marginRight: 5 }}
                />
                <Text style={{ color: C.text }}>
                  {formatPhoneWithDashes(zCustomer.cell)}
                </Text>
              </View>
            )}
            {zCustomer.landline.length > 0 && (
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Image_
                  icon={ICONS.home}
                  size={25}
                  style={{ marginRight: 5 }}
                />
                <Text style={{ color: C.text }}>
                  {formatPhoneWithDashes(zCustomer.landline)}
                </Text>
              </View>
            )}
            {zCustomer.contactRestriction === CONTACT_RESTRICTIONS.call && (
              <Text style={{ color: Colors.darkText }}>CALL ONLY</Text>
            )}
            {zCustomer.contactRestriction === CONTACT_RESTRICTIONS.email && (
              <Text style={{ color: Colors.darkText }}>EMAIL ONLY</Text>
            )}
          </View>
        </View>

        <View>
          <View
            style={{
              marginTop: 20,
              borderColor: gray(0.05),
              paddingHorizontal: 8,
              paddingVertical: 8,
              backgroundColor: C.backgroundListWhite,
              borderWidth: 1,
              borderRadius: 5,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "flex-start",
                alignItems: "center",
                width: "100%",
                // backgroundColor: "blue",
              }}
            >
              {/* <View style={{}}> */}
              <TextInputOnMainBackground
                placeholderText={"Brand"}
                style={{ width: "45%" }}
                value={zOpenWorkorder.brand}
                onTextChange={(val) =>
                  _zSetWorkorderField("brand", val, zOpenWorkorder.id)
                }
              />
              {/* </View> */}
              <View
                style={{
                  // marginTop: 11,
                  width: "55%",
                  flexDirection: "row",
                  paddingLeft: 5,
                  justifyContent: "flex-start",
                  alignItems: "center",
                  justifyContent: "space-between",
                  // backgroundColor: "green",
                }}
              >
                <View
                  style={{
                    width: "48%",
                    height: "100%",
                    // marginTop: 11,
                  }}
                >
                  <DropdownMenu
                    // openOnMouseOver=
                    buttonIcon={ICONS.menu2}
                    buttonIconSize={11}
                    dataArr={zSettings.bikeBrands}
                    onSelect={(item, idx) => {
                      _zSetWorkorderField("brand", item, zOpenWorkorder.id);
                    }}
                    // itemViewStyle={{ backgroundColor: "gray" }}
                    // itemTextStyle={{ fontSize: 18, color: "black" }}
                    buttonStyle={{
                      ...dropdownButtonStyle,
                      opacity: zOpenWorkorder.brand
                        ? DROPDOWN_SELECTED_OPACITY
                        : 1,
                    }}
                    modalCoordX={-6}
                    buttonTextStyle={dropdownButtonTextStyle}
                    ref={bikesRef}
                    buttonText={zSettings.bikeBrandsName}
                  />
                </View>
                <View style={{ width: 5 }} />
                <View
                  style={{
                    width: "48%",
                    alignItems: null,
                    justifyContent: "center",
                  }}
                >
                  <DropdownMenu
                    buttonIcon={ICONS.menu2}
                    buttonIconSize={11}
                    dataArr={zSettings.bikeOptionalBrands}
                    onSelect={(item, idx) => {
                      _zSetWorkorderField("brand", item, zOpenWorkorder.id);
                    }}
                    buttonStyle={{
                      ...dropdownButtonStyle,
                      opacity: zOpenWorkorder.brand
                        ? DROPDOWN_SELECTED_OPACITY
                        : 1,
                    }}
                    modalCoordX={0}
                    buttonTextStyle={dropdownButtonTextStyle}
                    ref={ebikeRef}
                    buttonText={zSettings.bikeOptionalBrandsName}
                  />
                </View>
              </View>
            </View>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "flex-start",
                width: "100%",
                alignItems: "center",

                marginTop: 11,
                // backgroundColor: "blue",
              }}
            >
              <TextInputOnMainBackground
                placeholderText={"Model/Description"}
                style={{ width: "45%" }}
                value={zOpenWorkorder.description}
                onTextChange={(val) => {
                  _zSetWorkorderField("description", val, zOpenWorkorder.id);
                }}
              />
              <View
                style={{
                  // marginTop: 11,
                  width: "55%",
                  flexDirection: "row",
                  paddingLeft: 5,
                  justifyContent: "center",
                  alignItems: "center",
                  // backgroundColor: "green",
                }}
              >
                <View style={{ width: "100%" }}>
                  <DropdownMenu
                    buttonIcon={ICONS.menu2}
                    buttonIconSize={11}
                    modalCoordX={55}
                    dataArr={zSettings.bikeDescriptions}
                    onSelect={(item, idx) => {
                      _zSetWorkorderField(
                        "description",
                        item,
                        zOpenWorkorder.id
                      );
                    }}
                    // modalCoordinateVars={{ x: 30, y: 30 }}
                    buttonStyle={{
                      ...dropdownButtonStyle,
                      opacity: zOpenWorkorder.description
                        ? DROPDOWN_SELECTED_OPACITY
                        : 1,
                    }}
                    buttonTextStyle={dropdownButtonTextStyle}
                    ref={descriptionRef}
                    buttonText={"Descriptions"}
                  />
                </View>
              </View>
            </View>

            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                width: "45%",
                alignItems: "center",
                width: "100%",
                marginTop: 11,
              }}
            >
              <TextInputOnMainBackground
                placeholderText={"Color 1"}
                value={zOpenWorkorder.color1.label}
                style={{
                  width: "48%",
                  backgroundColor: zOpenWorkorder.color1.backgroundColor,
                  color: zOpenWorkorder.color1.textColor,
                  // borderRadius: 8,
                }}
                onTextChange={(val) => {
                  setBikeColor(val, "color1");
                }}
              />
              <View style={{ width: 5 }} />
              <TextInputOnMainBackground
                placeholderText={"Color 2"}
                value={zOpenWorkorder.color2.label}
                style={{
                  width: "48%",
                  backgroundColor: zOpenWorkorder.color2.backgroundColor,
                  color: zOpenWorkorder.color2.textColor,
                }}
                onTextChange={(val) => {
                  setBikeColor(val, "color2");
                }}
              />
              <View
                style={{
                  // marginTop: 11,
                  width: "55%",
                  flexDirection: "row",
                  paddingLeft: 5,
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <View
                  style={{
                    width: "48%",
                    height: "100%",
                    justifyContent: "center",
                    // marginTop: 11,
                  }}
                >
                  <DropdownMenu
                    buttonIcon={ICONS.menu2}
                    buttonIconSize={11}
                    itemSeparatorStyle={{ height: 0 }}
                    dataArr={COLORS}
                    menuBorderColor={"transparent"}
                    onSelect={(item, idx) => {
                      let wo = cloneDeep(zOpenWorkorder);
                      wo.color1 = item;
                      _zSetWorkorder(wo);
                      _zSetWorkorderField("color1", item, zOpenWorkorder.id);
                    }}
                    buttonStyle={{
                      ...dropdownButtonStyle,
                      opacity: zOpenWorkorder.color1 ? 0.2 : 1,
                    }}
                    ref={color1Ref}
                    buttonText={"Color 1"}
                    modalCoordX={0}
                    buttonTextStyle={dropdownButtonTextStyle}
                  />
                </View>
                <View style={{ width: 5 }} />

                <View
                  style={{
                    width: "48%",
                    height: "100%",
                    justifyContent: "center",
                    // marginTop: 11,
                  }}
                >
                  <DropdownMenu
                    buttonIcon={ICONS.menu2}
                    menuBorderColor={"transparent"}
                    buttonIconSize={11}
                    itemSeparatorStyle={{ height: 0 }}
                    dataArr={COLORS}
                    onSelect={(item, idx) => {
                      _zSetWorkorderField("color2", item, zOpenWorkorder.id);
                      // ''(wo);
                    }}
                    modalCoordX={0}
                    buttonStyle={{
                      ...dropdownButtonStyle,
                      // backgroundColor: zWorkorderObj.color1.label
                      //   ? "lightgray"
                      //   : dropdownButtonStyle.backgroundColor,
                      opacity: zOpenWorkorder.color1
                        ? DROPDOWN_SELECTED_OPACITY
                        : 1,
                    }}
                    ref={color2Ref}
                    buttonText={"Color 2"}
                    buttonTextStyle={dropdownButtonTextStyle}
                  />
                </View>
              </View>
            </View>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "flex-start",
                width: "100%",
                alignItems: "center",
                marginTop: 11,
              }}
            >
              <TextInputOnMainBackground
                placeholderText={"Estimated Wait"}
                style={{ backgroundColor: "", width: "45%" }}
                value={zOpenWorkorder.waitTime?.label}
                editable={false}
              />
              <View
                style={{
                  // marginTop: 11,
                  width: "55%",
                  flexDirection: "row",
                  paddingLeft: 5,
                  justifyContent: "flex-start",
                  alignItems: "center",
                  // backgroundColor: "green",
                }}
              >
                <View style={{ width: "100%" }}>
                  <DropdownMenu
                    buttonIcon={ICONS.menu2}
                    buttonIconSize={11}
                    dataArr={zSettings.waitTimes}
                    onSelect={(item, idx) => {
                      _zSetWorkorderField("waitTime", item, zOpenWorkorder.id);
                    }}
                    buttonStyle={{
                      ...dropdownButtonStyle,
                      opacity: zOpenWorkorder.waitTime.label
                        ? DROPDOWN_SELECTED_OPACITY
                        : 1,
                    }}
                    buttonTextStyle={dropdownButtonTextStyle}
                    // modalCoordinateVars={{ x: 30, y: 50 }}
                    modalCoordX={50}
                    ref={waitTimesRef}
                    buttonText={"Wait Times"}
                  />
                </View>
              </View>
            </View>
            <DropdownMenu
              buttonIcon={ICONS.menu2}
              buttonIconSize={11}
              dataArr={zSettings.statuses}
              onSelect={(val) => {
                _zSetWorkorderField("status", val, zOpenWorkorder.id);
              }}
              buttonStyle={{
                width: "100%",
                backgroundColor: zOpenWorkorder.status.backgroundColor,
                marginTop: 11,
              }}
              buttonTextStyle={{
                ...dropdownButtonTextStyle,
                color: zOpenWorkorder.status.textColor,
                fontWeight: "normal",
                fontSize: 14,
              }}
              modalCoordX={100}
              modalCoordY={40}
              ref={statusRef}
              buttonText={zOpenWorkorder.status.label}
            />
          </View>

          <View
            style={{
              marginTop: 50,
              width: "100%",

              borderColor: gray(0.05),
              paddingHorizontal: 8,
              paddingVertical: 8,
              backgroundColor: C.backgroundListWhite,
              borderWidth: 1,
              borderRadius: 5,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "flex-start",
                alignItems: "center",
                width: "100%",
                marginTop: 5,
              }}
            >
              <TextInputOnMainBackground
                placeholderText={"Part Ordered"}
                style={{
                  width: "100%",
                  backgroundColor: C.backgroundWhite,
                }}
                value={zOpenWorkorder.partOrdered}
                onTextChange={(val) =>
                  _zSetWorkorderField("partOrdered", val, zOpenWorkorder.id)
                }
              />
            </View>

            <View
              style={{
                // marginTop: 8,
                flexDirection: "row",
                justifyContent: "flex-start",
                alignItems: "center",
                width: "100%",
                marginTop: 11,
              }}
            >
              <TextInputOnMainBackground
                value={zOpenWorkorder.partSource}
                placeholderText={"Part Source"}
                style={{
                  width: "50%",
                  backgroundColor: C.backgroundWhite,
                }}
                onTextChange={(val) => {
                  _zSetWorkorderField("partSource", val, zOpenWorkorder.id);
                }}
              />
              <View
                style={{
                  // marginTop: 11,
                  width: "50%",
                  flexDirection: "row",
                  paddingLeft: 5,
                  justifyContent: "",
                  alignItems: "center",
                  justifyContent: "center",
                  // backgroundColor: "blue",
                }}
              >
                <DropdownMenu
                  buttonIcon={ICONS.menu2}
                  buttonIconSize={11}
                  dataArr={zSettings.partSources}
                  onSelect={(item, idx) => {
                    _zSetWorkorderField("partSource", item, zOpenWorkorder.id);
                  }}
                  modalCoordX={20}
                  buttonStyle={{
                    ...dropdownButtonStyle,
                    opacity: zOpenWorkorder.brand
                      ? DROPDOWN_SELECTED_OPACITY
                      : 1,
                    paddingHorizontal: 40,
                  }}
                  buttonTextStyle={dropdownButtonTextStyle}
                  ref={partSourcesRef}
                  buttonText={"Part Sources"}
                />
              </View>
            </View>
          </View>
        </View>
      </View>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          width: "100%",
          alignItems: "center",
          borderRadius: 5,
          borderColor: C.listItemBorder,
          borderWidth: 1,
        }}
      >
        <Button_
          icon={ICONS.add}
          iconSize={50}
          buttonStyle={{}}
          onPress={handleNewWorkorderPress}
        />
        <Button_
          icon={ICONS.cashRed}
          iconSize={35}
          buttonStyle={{
            backgroundColor: "transparent",
          }}
          onPress={handleStartStandaloneSalePress}
        />
      </View>
    </View>
  );
};



const TextInputOnMainBackground = ({
  value,
  onTextChange,
  style = {},
  placeholderText,
  editable = true,
}) => {
  return (
    <TextInput
      editable={editable}
      value={value}
      placeholder={placeholderText}
      placeholderTextColor={"gray"}
      style={{
        borderWidth: 1,
        borderColor: C.buttonLightGreenOutline,
        color: C.text,
        paddingVertical: 2,
        paddingHorizontal: 4,
        fontSize: 15,
        outlineWidth: 0,
        borderRadius: 5,
        fontWeight: value ? "500" : null,
        ...style,
      }}
      onChangeText={(val) => onTextChange(val)}
    />
  );
};

/* eslint-disable */

import { View, Text, TextInput } from "react-native-web";
import {
  addDashesToPhone,
  clog,
  dim,
  generateRandomID,
  generateUPCBarcode,
  log,
  trimToTwoDecimals,
} from "../../../utils";
import {
  TabMenuDivider as Divider,
  ModalDropdown,
  // TextInputOnMainBackground,
  TextInputLabelOnMainBackground,
  ScreenModal,
  CustomerInfoScreenModalComponent,
  Button,
  SHADOW_RADIUS_NOTHING,
  SHADOW_RADIUS_PROTO,
  LoginModalScreen,
  DropdownMenu,
  Button_,
  Icon_,
  Image_,
  GradientView,
} from "../../../components";
import { C, COLOR_GRADIENTS, Colors, ICONS } from "../../../styles";
import {
  SETTINGS_OBJ,
  WORKORDER_PROTO,
  CUSTOMER_PROTO,
  TAB_NAMES,
  COLORS,
  NONREMOVABLE_STATUSES,
} from "../../../data";
import React, { useRef } from "react";
import { cloneDeep } from "lodash";
import {
  useCheckoutStore,
  useCurrentCustomerStore,
  useOpenWorkordersStore,
  useLoginStore,
  useSettingsStore,
  useTabNamesStore,
} from "../../../stores";
import { dbSetCustomerObj, dbSetWorkorder } from "../../../db_call_wrapper";

export const ActiveWorkorderComponent = ({}) => {
  // store setters /////////////////////////////////////////////////////////////////
  const _zSetIsCheckingOut = useCheckoutStore(
    (state) => state.setIsCheckingOut
  );
  const _zSetWorkorderObj = useOpenWorkordersStore(
    (state) => state.setWorkorder
  );
  const _zSetCustomerObj = useCurrentCustomerStore(
    (state) => state.setCustomerObj
  );
  const _zSetInfoTabName = useTabNamesStore((state) => state.setInfoTabName);
  const _zSetOptionsTabName = useTabNamesStore(
    (state) => state.setOptionsTabName
  );
  const _zSetItemsTabName = useTabNamesStore((state) => state.setItemsTabName);
  const _zSetInitialOpenWorkorderObj = useOpenWorkordersStore(
    (state) => state.setInitialOpenWorkorderObj
  );
  const _zExecute = useLoginStore((state) => state.execute);
  const _zSetWorkorder = useOpenWorkordersStore(
    (state) => state.setWorkorderObj
  );

  // store getters ///////////////////////////////////////////////////////////////////
  let zWorkorderObj = WORKORDER_PROTO;
  zWorkorderObj = useOpenWorkordersStore((state) =>
    state.getOpenWorkorderObj()
  );
  let zCustomerObj = CUSTOMER_PROTO;
  zCustomerObj = useCurrentCustomerStore((state) => state.getCustomerObj());
  var zSettingsObj = SETTINGS_OBJ;
  zSettingsObj = useSettingsStore((state) => state.getSettingsObj());
  const zShowLoginScreen = useLoginStore((state) => state.getShowLoginScreen());
  const zCurrentUser = useLoginStore((state) => state.getCurrentUserObj());

  ///////////////////////////////////////////////////////////////////////////////
  const [sShowCustomerInfoModal, _setShowCustomerInfoModal] =
    React.useState(false);
  const [sInfoTextFocus, _setInfoTextFocus] = React.useState(null);
  const [sInputMouseOver, _setInputMouseOver] = React.useState(null);

  const bikesRef = useRef();
  const ebikeRef = useRef();
  const descriptionRef = useRef();
  const color1Ref = useRef();
  const color2Ref = useRef();
  const waitTimesRef = useRef();
  const partSourcesRef = useRef();
  const statusRef = useRef();

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
      // log("not found", incomingColorVal);
      newColorObj.label = incomingColorVal;
      newColorObj.backgroundColor = null;
      newColorObj.textColor = null;
    }

    // log("setting", newColorObj);
    let wo = cloneDeep(zWorkorderObj);
    wo[fieldName] = newColorObj;
    _zSetWorkorderObj(wo);
  }

  function getBackgroundColor() {
    let backgroundColor;
    let textColor;
    let altTextColor;

    zSettingsObj.statusGroups.find((o) => {
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

  function handleStartStandaloneSalePress() {
    // log(zCurrentUser);
    // return;
    let wo = cloneDeep(WORKORDER_PROTO);
    wo.isStandaloneSale = true;
    wo.id = generateUPCBarcode();
    wo.startedBy = zCurrentUser.id;
    wo.startedOnMillis = new Date().getTime();

    _zSetInitialOpenWorkorderObj(wo, false);
    _zSetInfoTabName(TAB_NAMES.infoTab.checkout);
    _zSetItemsTabName(TAB_NAMES.infoTab.workorder);
    _zSetOptionsTabName(TAB_NAMES.optionsTab.quickItems);
  }
  function handleNewWorkorderPress() {
    null;
    _zSetCustomerObj(null);
    _zSetInfoTabName(TAB_NAMES.infoTab.customer);
  }

  const dropdownButtonStyle = {
    width: "100%",
    backgroundColor: C.buttonLightGreen,
    ...SHADOW_RADIUS_NOTHING,
    borderColor: C.buttonLightGreenOutline,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    paddingVertical: 2,
    borderRadius: 5,
  };

  const dropdownButtonTextStyle = {
    fontSize: 14,
    color: C.textMain,
    // width: "100%",
  };

  const DROPDOWN_SELECTED_OPACITY = 0.3;
  // clog("wo", zWorkorderObj);
  // clog("cust", zCustomerObj);
  function setComponent() {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "space-between",
          alignItems: "center",
          paddingBottom: 11,
          paddingTop: 5,
          paddingHorizontal: 5,
          backgroundColor: C.lightred,
          // borderRadius: 15,
          // shadowColor: APP_BASE_COLORS.green,
          backgroundColor: C.backgroundWhite,
          borderRadius: 15,
          // borderColor: APP_BASE_COLORS.buttonLightGreen,

          // shadowOffset: {
          //   width: 2,
          //   height: 2,
          // },
          // shadowOpacity: 0.5,
          // shadowRadius: 15,
        }}
      >
        <View
          style={{
            width: "100%",
            alignItems: "center",
            // backgroundColor: "blue",
            // paddingHorizontal: 5,
          }}
        >
          <LoginModalScreen modalVisible={zShowLoginScreen} />
          <View
            style={{
              width: "100%",
              justifyContent: "center",
              alignItems: "center",
              paddingVertical: 11,
              backgroundColor: C.backgroundGreen,
              borderColor: C.buttonLightGreenOutline,
              borderWidth: 1,
              borderRadius: 15,
            }}
          >
            <ScreenModal
              showShadow={false}
              modalVisible={sShowCustomerInfoModal}
              showOuterModal={true}
              buttonLabel={
                zWorkorderObj.customerFirst + " " + zWorkorderObj.customerLast
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
              mouseOverOptions={{ highlightColor: "transparent" }}
              handleButtonPress={() => _setShowCustomerInfoModal(true)}
              buttonTextStyle={{
                fontSize: 25,
                color: Colors.lightText,
              }}
              shadowProps={{ shadowColor: "transparent" }}
              handleOuterClick={() => _setShowCustomerInfoModal(false)}
              Component={() => (
                <CustomerInfoScreenModalComponent
                  ssCustomerInfoObj={zCustomerObj}
                  __setCustomerInfoObj={_zSetCustomerObj}
                  button1Text={"Close"}
                  ssInfoTextFocus={sInfoTextFocus}
                  __setInfoTextFocus={_setInfoTextFocus}
                  handleButton1Press={() => _setShowCustomerInfoModal(false)}
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
              {zCustomerObj.cell.length > 0 ? (
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Image_
                    icon={ICONS.cellPhone}
                    size={25}
                    style={{ marginRight: 5 }}
                  />
                  <Text style={{ color: C.textMain }}>
                    {addDashesToPhone(zCustomerObj.cell)}
                  </Text>
                </View>
              ) : null}
              {zCustomerObj.landline.length > 0 ? (
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Image_
                    icon={ICONS.home}
                    size={25}
                    style={{ marginRight: 5 }}
                  />
                  <Text style={{ color: C.textMain }}>
                    {addDashesToPhone(zCustomerObj.landline)}
                  </Text>
                </View>
              ) : null}
              {zCustomerObj.contactRestriction === "CALL" ? (
                <Text style={{ color: Colors.darkText }}>CALL ONLY</Text>
              ) : null}
              {zCustomerObj.contactRestriction === "EMAIL" ? (
                <Text style={{ color: Colors.darkText }}>EMAIL ONLY</Text>
              ) : null}
            </View>
          </View>

          <View>
            <View
              style={{
                marginTop: 20,
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
                style={{ width: "50%" }}
                value={zWorkorderObj.brand}
                onTextChange={(val) => {
                  // log(val);
                  wo.brand = val;
                  _zSetWorkorderObj(wo);
                }}
              />
              {/* </View> */}
              <View
                style={{
                  // marginTop: 11,
                  width: "50%",
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
                    dataArr={zSettingsObj.bikeBrands}
                    onSelect={(item, idx) => {
                      let wo = cloneDeep(zWorkorderObj);
                      wo.brand = item;
                      _zSetWorkorderObj(wo);
                    }}
                    // itemViewStyle={{ backgroundColor: "gray" }}
                    // itemTextStyle={{ fontSize: 18, color: "black" }}
                    buttonStyle={{
                      ...dropdownButtonStyle,
                      opacity: zWorkorderObj.brand
                        ? DROPDOWN_SELECTED_OPACITY
                        : 1,
                    }}
                    buttonTextStyle={dropdownButtonTextStyle}
                    ref={bikesRef}
                    buttonText={zSettingsObj.bikeBrandsName}
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
                    dataArr={zSettingsObj.bikeOptionalBrands}
                    onSelect={(item, idx) => {
                      let wo = cloneDeep(zWorkorderObj);
                      wo.brand = item;
                      _zSetWorkorderObj(wo);
                    }}
                    buttonStyle={{
                      ...dropdownButtonStyle,
                      opacity: zWorkorderObj.brand
                        ? DROPDOWN_SELECTED_OPACITY
                        : 1,
                    }}
                    buttonTextStyle={dropdownButtonTextStyle}
                    ref={ebikeRef}
                    buttonText={zSettingsObj.bikeOptionalBrandsName}
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
                style={{ width: "50%" }}
                value={zWorkorderObj.description}
                onTextChange={(val) => {
                  let wo = cloneDeep(zWorkorderObj);

                  wo.description = val;
                  _zSetWorkorderObj(wo);
                }}
              />
              <View
                style={{
                  // marginTop: 11,
                  width: "50%",
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
                    dataArr={zSettingsObj.bikeDescriptions}
                    onSelect={(item, idx) => {
                      let wo = cloneDeep(zWorkorderObj);
                      wo.description = item;
                      _zSetWorkorderObj(wo);
                    }}
                    modalCoordinateVars={{ x: 30, y: 30 }}
                    // itemViewStyle={{ borderRadius: 0 }}
                    // itemTextStyle={{ fontSize: 14, color: "black" }}
                    buttonStyle={{
                      ...dropdownButtonStyle,
                      opacity: zWorkorderObj.description
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

                alignItems: "center",
                width: "100%",
                marginTop: 11,
              }}
            >
              <TextInputOnMainBackground
                placeholderText={"Color 1"}
                value={zWorkorderObj.color1.label}
                style={{
                  width: "48%",
                  backgroundColor: zWorkorderObj.color1.backgroundColor,
                  color: zWorkorderObj.color1.textColor,
                  // borderRadius: 8,
                }}
                onTextChange={(val) => {
                  setBikeColor(val, "color1");
                }}
              />
              <View style={{ width: 5 }} />
              <TextInputOnMainBackground
                placeholderText={"Color 2"}
                value={zWorkorderObj.color2.label}
                style={{
                  width: "48%",
                  backgroundColor: zWorkorderObj.color2.backgroundColor,
                  color: zWorkorderObj.color2.textColor,
                }}
                onTextChange={(val) => {
                  setBikeColor(val, "color2");
                }}
              />
              <View
                style={{
                  // marginTop: 11,
                  width: "50%",
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
                      let wo = cloneDeep(zWorkorderObj);
                      wo.color1 = item;
                      _zSetWorkorderObj(wo);
                      // ''(wo);
                    }}
                    // itemViewStyle={{ borderRadius: 0 }}
                    // itemTextStyle={{ fontSize: 14 }}
                    buttonStyle={{
                      ...dropdownButtonStyle,
                      opacity: zWorkorderObj.color1 ? 0.2 : 1,
                      // backgroundColor: zWorkorderObj.color1.label
                      //   ? "lightgray"
                      //   : dropdownButtonStyle.backgroundColor
                    }}
                    ref={color1Ref}
                    buttonText={"Color 1"}
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
                      let wo = cloneDeep(zWorkorderObj);
                      wo.color2 = item;
                      _zSetWorkorderObj(wo);
                      // ''(wo);
                    }}
                    buttonStyle={{
                      ...dropdownButtonStyle,
                      // backgroundColor: zWorkorderObj.color1.label
                      //   ? "lightgray"
                      //   : dropdownButtonStyle.backgroundColor,
                      opacity: zWorkorderObj.color1
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
                style={{ backgroundColor: "", width: "50%" }}
                value={zWorkorderObj.waitTime?.label}
                editable={false}
              />
              <View
                style={{
                  // marginTop: 11,
                  width: "50%",
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
                    dataArr={zSettingsObj.waitTimes}
                    onSelect={(item, idx) => {
                      let wo = cloneDeep(zWorkorderObj);
                      wo.waitTime = item;
                      wo.status = NONREMOVABLE_STATUSES.find(
                        (o) => o.label == "Service"
                      );
                      _zSetWorkorderObj(wo);
                      // ''(wo);
                    }}
                    // itemViewStyle={{ backgroundColor: "gray", width: null }}
                    // itemTextStyle={{ fontSize: 14, color: "black" }}
                    buttonStyle={{
                      ...dropdownButtonStyle,
                      opacity: zWorkorderObj.waitTime.label
                        ? DROPDOWN_SELECTED_OPACITY
                        : 1,
                    }}
                    buttonTextStyle={dropdownButtonTextStyle}
                    modalCoordinateVars={{ x: 30, y: 50 }}
                    ref={waitTimesRef}
                    buttonText={"Wait Times"}
                  />
                </View>
              </View>
            </View>
            <DropdownMenu
              buttonIcon={ICONS.menu2}
              buttonIconSize={11}
              dataArr={zSettingsObj.statuses}
              onSelect={(val) => {
                let wo = cloneDeep(zWorkorderObj);
                wo.status = val;
                _zSetWorkorderObj(wo);
              }}
              // itemViewStyle={{ backgroundColor: "gray", width: null }}
              // itemTextStyle={{ color }}
              buttonStyle={{
                width: "100%",
                backgroundColor: zWorkorderObj.status.backgroundColor,
                marginTop: 11,
              }}
              buttonTextStyle={{
                ...dropdownButtonTextStyle,
                color: zWorkorderObj.status.textColor,
              }}
              modalCoordinateVars={{ x: 50, y: 50 }}
              ref={statusRef}
              buttonText={"Status: " + zWorkorderObj.status.label}
            />
            <View
              style={{
                marginTop: 50,
                borderColor: C.buttonLightGreenOutline,
                borderWidth: 1,
                borderRadius: 5,
                paddingHorizontal: 5,
                paddingVertical: 5,
                backgroundColor: C.buttonLightGreen,
                width: "100%",
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
                  value={zWorkorderObj.partOrdered}
                  onTextChange={(val) => {
                    let wo = cloneDeep(zWorkorderObj);

                    wo.partOrdered = val;
                    _zSetWorkorderObj(wo);
                  }}
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
                  value={zWorkorderObj.partSource}
                  placeholderText={"Part Source"}
                  style={{
                    width: "50%",
                    backgroundColor: C.backgroundWhite,
                  }}
                  onTextChange={(val) => {
                    let wo = cloneDeep(zWorkorderObj);
                    wo.partSource = val;
                    _zSetWorkorderObj(wo);
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
                    dataArr={zSettingsObj.partSources}
                    onSelect={(item, idx) => {
                      let wo = cloneDeep(zWorkorderObj);
                      wo.partSource = item;
                      _zSetWorkorderObj(wo);
                    }}
                    // itemViewStyle={{ backgroundColor: "gray" }}
                    // itemTextStyle={{ fontSize: 14, color: "black" }}
                    buttonStyle={{
                      ...dropdownButtonStyle,
                      opacity: zWorkorderObj.brand
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
            justifyContent: "space-around",
            width: "100%",
          }}
        >
          <Button_
            icon={ICONS.add}
            iconSize={20}
            // buttonStyle={{ width: 150 }}
            text={"Workorder"}
            colorGradientArr={COLOR_GRADIENTS.green}
            buttonStyle={{ paddingHorizontal: 25, paddingVertical: 5 }}
            onPress={handleNewWorkorderPress}
          />
          <Button_
            icon={ICONS.cashRed}
            iconSize={20}
            colorGradientArr={COLOR_GRADIENTS.green}
            buttonStyle={{ paddingHorizontal: 25, paddingVertical: 5 }}
            text={"New Sale"}
            onPress={handleStartStandaloneSalePress}
          />
        </View>
      </View>
    );
  }

  // return setComponent();

  try {
    return setComponent();
  } catch (e) {
    // log("Error returning ActiveWorkorderComponent", e);
    return null;
  }
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
        color: C.textMain,
        paddingVertical: 3,
        paddingHorizontal: 4,
        fontSize: 16,
        outlineWidth: 1,
        outlineColor: C.green,
        borderRadius: 5,
        fontWeight: value ? "500" : null,
        ...style,
      }}
      onChangeText={(val) => onTextChange(val)}
    />
  );
};

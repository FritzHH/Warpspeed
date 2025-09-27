/* eslint-disable */

import { View, Text, TextInput } from "react-native-web";
import {
  formatPhoneWithDashes,
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
  CONTACT_RESTRICTIONS,
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
import { CustomerInfoScreenModalComponent } from "../modal_screens/CustomerInfoModalScreen";

export const ActiveWorkorderComponent = ({}) => {
  // store setters /////////////////////////////////////////////////////////////////
  const _zSetIsCheckingOut = useCheckoutStore(
    (state) => state.setIsCheckingOut
  );
  const _zSetWorkorder = useOpenWorkordersStore((state) => state.setWorkorder);
  const _zSetCustomer = useCurrentCustomerStore((state) => state.setCustomer);
  const _zSetInfoTabName = useTabNamesStore((state) => state.setInfoTabName);
  const _zSetOptionsTabName = useTabNamesStore(
    (state) => state.setOptionsTabName
  );
  const _zSetItemsTabName = useTabNamesStore((state) => state.setItemsTabName);
  const _zSetInitialOpenWorkorder = useOpenWorkordersStore(
    (state) => state.setInitialOpenWorkorder
  );
  const _zExecute = useLoginStore((state) => state.execute);

  // store getters ///////////////////////////////////////////////////////////////////
  let zOpenWorkorder = WORKORDER_PROTO;
  zOpenWorkorder = useOpenWorkordersStore((state) => state.getOpenWorkorder());
  let zCustomer = CUSTOMER_PROTO;
  zCustomer = useCurrentCustomerStore((state) => state.getCustomer());
  var zSettings = SETTINGS_OBJ;
  zSettings = useSettingsStore((state) => state.getSettings());
  const zShowLoginScreen = useLoginStore((state) => state.getShowLoginScreen());
  const zCurrentUser = useLoginStore((state) => state.getCurrentUser());

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
    let wo = cloneDeep(zOpenWorkorder);
    wo[fieldName] = newColorObj;
    _zSetWorkorder(wo);
  }

  function handleStartStandaloneSalePress() {
    // log(zCurrentUser);
    // return;
    let wo = cloneDeep(WORKORDER_PROTO);
    wo.isStandaloneSale = true;
    wo.id = generateUPCBarcode();
    wo.startedBy = zCurrentUser.id;
    wo.startedOnMillis = new Date().getTime();

    _zSetInitialOpenWorkorder(wo, false);
    _zSetInfoTabName(TAB_NAMES.infoTab.checkout);
    _zSetItemsTabName(TAB_NAMES.infoTab.workorder);
    _zSetOptionsTabName(TAB_NAMES.optionsTab.quickItems);
  }

  function handleNewWorkorderPress() {
    null;
    _zSetCustomer(null);
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
          backgroundColor: C.backgroundWhite,
          borderRadius: 15,
        }}
      >
        <View
          style={{
            width: "100%",
            alignItems: "center",
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
                  ssCustomerInfoObj={zCustomer}
                  __setCustomerInfoObj={_zSetCustomer}
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
              {zCustomer.cell.length > 0 && (
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Image_
                    icon={ICONS.cellPhone}
                    size={25}
                    style={{ marginRight: 5 }}
                  />
                  <Text style={{ color: C.textMain }}>
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
                  <Text style={{ color: C.textMain }}>
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
                value={zOpenWorkorder.brand}
                onTextChange={(val) => {
                  // log(val);
                  wo.brand = val;
                  _zSetWorkorder(wo);
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
                    dataArr={zSettings.bikeBrands}
                    onSelect={(item, idx) => {
                      let wo = cloneDeep(zOpenWorkorder);
                      wo.brand = item;
                      _zSetWorkorder(wo);
                    }}
                    // itemViewStyle={{ backgroundColor: "gray" }}
                    // itemTextStyle={{ fontSize: 18, color: "black" }}
                    buttonStyle={{
                      ...dropdownButtonStyle,
                      opacity: zOpenWorkorder.brand
                        ? DROPDOWN_SELECTED_OPACITY
                        : 1,
                    }}
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
                      let wo = cloneDeep(zOpenWorkorder);
                      wo.brand = item;
                      _zSetWorkorder(wo);
                    }}
                    buttonStyle={{
                      ...dropdownButtonStyle,
                      opacity: zOpenWorkorder.brand
                        ? DROPDOWN_SELECTED_OPACITY
                        : 1,
                    }}
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
                style={{ width: "50%" }}
                value={zOpenWorkorder.description}
                onTextChange={(val) => {
                  let wo = cloneDeep(zOpenWorkorder);

                  wo.description = val;
                  _zSetWorkorder(wo);
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
                    dataArr={zSettings.bikeDescriptions}
                    onSelect={(item, idx) => {
                      let wo = cloneDeep(zOpenWorkorder);
                      wo.description = item;
                      _zSetWorkorder(wo);
                    }}
                    modalCoordinateVars={{ x: 30, y: 30 }}
                    // itemViewStyle={{ borderRadius: 0 }}
                    // itemTextStyle={{ fontSize: 14, color: "black" }}
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
                      let wo = cloneDeep(zOpenWorkorder);
                      wo.color1 = item;
                      _zSetWorkorder(wo);
                      // ''(wo);
                    }}
                    // itemViewStyle={{ borderRadius: 0 }}
                    // itemTextStyle={{ fontSize: 14 }}
                    buttonStyle={{
                      ...dropdownButtonStyle,
                      opacity: zOpenWorkorder.color1 ? 0.2 : 1,
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
                      let wo = cloneDeep(zOpenWorkorder);
                      wo.color2 = item;
                      _zSetWorkorder(wo);
                      // ''(wo);
                    }}
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
                style={{ backgroundColor: "", width: "50%" }}
                value={zOpenWorkorder.waitTime?.label}
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
                    dataArr={zSettings.waitTimes}
                    onSelect={(item, idx) => {
                      let wo = cloneDeep(zOpenWorkorder);
                      wo.waitTime = item;
                      wo.status = NONREMOVABLE_STATUSES.find(
                        (o) => o.label == "Service"
                      );
                      _zSetWorkorder(wo);
                      // ''(wo);
                    }}
                    // itemViewStyle={{ backgroundColor: "gray", width: null }}
                    // itemTextStyle={{ fontSize: 14, color: "black" }}
                    buttonStyle={{
                      ...dropdownButtonStyle,
                      opacity: zOpenWorkorder.waitTime.label
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
              dataArr={zSettings.statuses}
              onSelect={(val) => {
                let wo = cloneDeep(zOpenWorkorder);
                wo.status = val;
                _zSetWorkorder(wo);
              }}
              // itemViewStyle={{ backgroundColor: "gray", width: null }}
              // itemTextStyle={{ color }}
              buttonStyle={{
                width: "100%",
                backgroundColor: zOpenWorkorder.status.backgroundColor,
                marginTop: 11,
              }}
              buttonTextStyle={{
                ...dropdownButtonTextStyle,
                color: zOpenWorkorder.status.textColor,
              }}
              modalCoordinateVars={{ x: 50, y: 50 }}
              ref={statusRef}
              buttonText={"Status: " + zOpenWorkorder.status.label}
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
                  value={zOpenWorkorder.partOrdered}
                  onTextChange={(val) => {
                    let wo = cloneDeep(zOpenWorkorder);

                    wo.partOrdered = val;
                    _zSetWorkorder(wo);
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
                  value={zOpenWorkorder.partSource}
                  placeholderText={"Part Source"}
                  style={{
                    width: "50%",
                    backgroundColor: C.backgroundWhite,
                  }}
                  onTextChange={(val) => {
                    let wo = cloneDeep(zOpenWorkorder);
                    wo.partSource = val;
                    _zSetWorkorder(wo);
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
                      let wo = cloneDeep(zOpenWorkorder);
                      wo.partSource = item;
                      _zSetWorkorder(wo);
                    }}
                    // itemViewStyle={{ backgroundColor: "gray" }}
                    // itemTextStyle={{ fontSize: 14, color: "black" }}
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

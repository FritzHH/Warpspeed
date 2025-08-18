/* eslint-disable */

import { View, Text, TextInput } from "react-native-web";
import {
  addDashesToPhone,
  dim,
  generateRandomID,
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
  LoginScreenModalComponent,
  DropdownMenu,
  Button_,
  Icon_,
  Image_,
  GradientView,
} from "../../../components";
import {
  APP_BASE_COLORS,
  COLOR_GRADIENTS,
  Colors,
  ICONS,
} from "../../../styles";
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
import {
  dbSetCustomerObj,
  dbSetOpenWorkorderItem,
} from "../../../db_call_wrapper";

export const ActiveWorkorderComponent = ({}) => {
  // store setters /////////////////////////////////////////////////////////////////
  const _zSetWorkorderObj = useOpenWorkordersStore(
    (state) => state.setWorkorderObj
  );
  const _zSetCustomerObj = useCurrentCustomerStore(
    (state) => state.setCustomerObj
  );
  const _zSetInfoTabName = useTabNamesStore((state) => state.setInfoTabName);
  const _zSetOptionsTabName = useTabNamesStore(
    (state) => state.setOptionsTabName
  );
  const _zSetItemsTabName = useTabNamesStore((state) => state.setItemsTabName);
  // const _zSetOpenWorkorderIdx = useOpenWorkordersStore(
  //   (state) => state.setOpenWorkorderIdx
  // );
  const _zExecute = useLoginStore((state) => state.execute);
  const _zSetWorkorder = useOpenWorkordersStore(
    (state) => state.setWorkorderObj
  );

  // store getters ///////////////////////////////////////////////////////////////////
  let zWorkorderObj = WORKORDER_PROTO;
  zWorkorderObj = useOpenWorkordersStore((state) => state.getWorkorderObj());
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

  const bikesRef = useRef();
  const ebikeRef = useRef();
  const descriptionRef = useRef();
  const color1Ref = useRef();
  const color2Ref = useRef();
  const waitTimesRef = useRef();
  const partSourcesRef = useRef();
  const statusRef = useRef();

  ///////////////////////////////////////////////////////////////////////////////
  ///////////////////////////////////////////////////////////////////////////////

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
    let wo = cloneDeep(WORKORDER_PROTO);
    wo.isStandaloneSale = true;
    wo.id = generateRandomID();
    wo.startedBy = zCurrentUser.id;

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
    backgroundColor: APP_BASE_COLORS.buttonLightGreen,
    ...SHADOW_RADIUS_NOTHING,
    borderColor: APP_BASE_COLORS.buttonLightGreenOutline,
    // backgroundColor: "green",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    paddingVertical: 2,
    borderRadius: 5,
  };

  const dropdownButtonTextStyle = {
    fontSize: 14,
    color: APP_BASE_COLORS.textMain,
    // width: "100%",
  };

  function setComponent() {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "space-between",
          alignItems: "center",
          paddingBottom: 10,
          paddingTop: 5,
          paddingHorizontal: 5,
          backgroundColor: APP_BASE_COLORS.backgroundListWhite,
          borderRadius: 15,
          shadowColor: APP_BASE_COLORS.green,
          backgroundColor: APP_BASE_COLORS.backgroundWhite,
          borderColor: APP_BASE_COLORS.buttonLightGreen,
          borderWidth: 1,
          borderRadius: 15,
          shadowOffset: {
            width: 2,
            height: 2,
          },
          shadowOpacity: 0.5,
          shadowRadius: 15,
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
          <LoginScreenModalComponent modalVisible={zShowLoginScreen} />
          <View
            style={{
              width: "100%",
              justifyContent: "center",
              alignItems: "center",
              paddingVertical: 10,
              backgroundColor: APP_BASE_COLORS.backgroundGreen,
              borderColor: APP_BASE_COLORS.buttonLightGreenOutline,
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
                borderColor: APP_BASE_COLORS.buttonLightGreenOutline,
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
                    size={30}
                    style={{ marginRight: 5 }}
                  />
                  <Text style={{ color: APP_BASE_COLORS.textMain }}>
                    {addDashesToPhone(zCustomerObj.cell)}
                  </Text>
                </View>
              ) : null}
              {zCustomerObj.landline.length > 0 ? (
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Image_
                    icon={ICONS.home}
                    size={30}
                    style={{ marginRight: 5 }}
                  />
                  <Text style={{ color: APP_BASE_COLORS.textMain }}>
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
                  // marginTop: 10,
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
                    // marginTop: 10,
                  }}
                >
                  <DropdownMenu
                    dataArr={zSettingsObj.bikeBrands}
                    onSelect={(item, idx) => {
                      let wo = cloneDeep(zWorkorderObj);
                      wo.brand = item;
                      _zSetWorkorderObj(wo);
                    }}
                    itemViewStyle={{ backgroundColor: "gray" }}
                    itemTextStyle={{ fontSize: 18, color: "black" }}
                    buttonStyle={{
                      ...dropdownButtonStyle,
                      backgroundColor: zWorkorderObj.brand
                        ? dropdownButtonStyle.backgroundColor
                        : APP_BASE_COLORS.lightred,
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
                    dataArr={zSettingsObj.bikeOptionalBrands}
                    onSelect={(item, idx) => {
                      let wo = cloneDeep(zWorkorderObj);
                      wo.brand = item;
                      _zSetWorkorderObj(wo);
                    }}
                    itemViewStyle={{ backgroundColor: "gray" }}
                    itemTextStyle={{ fontSize: 14, color: "black" }}
                    buttonStyle={{
                      ...dropdownButtonStyle,
                      backgroundColor: zWorkorderObj.brand
                        ? dropdownButtonStyle.backgroundColor
                        : "red",
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

                marginTop: 10,
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
                  // marginTop: 10,
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
                    dataArr={zSettingsObj.bikeDescriptions}
                    onSelect={(item, idx) => {
                      let wo = cloneDeep(zWorkorderObj);
                      wo.description = item;
                      _zSetWorkorderObj(wo);
                    }}
                    modalCoordinateVars={{ x: 30, y: 30 }}
                    itemViewStyle={{ borderRadius: 0 }}
                    itemTextStyle={{ fontSize: 14, color: "black" }}
                    buttonStyle={{ ...dropdownButtonStyle }}
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
                marginTop: 10,
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
                  // marginTop: 10,
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
                    // marginTop: 10,
                  }}
                >
                  <DropdownMenu
                    itemSeparatorStyle={{ height: 0 }}
                    dataArr={COLORS}
                    onSelect={(item, idx) => {
                      let wo = cloneDeep(zWorkorderObj);
                      wo.color1 = item;
                      _zSetWorkorderObj(wo);
                      dbSetOpenWorkorderItem(wo);
                    }}
                    itemViewStyle={{ borderRadius: 0 }}
                    itemTextStyle={{ fontSize: 14 }}
                    buttonStyle={{
                      ...dropdownButtonStyle,
                      backgroundColor: zWorkorderObj.color1.label
                        ? dropdownButtonStyle.backgroundColor
                        : APP_BASE_COLORS.lightred,
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
                    // marginTop: 10,
                  }}
                >
                  <DropdownMenu
                    itemSeparatorStyle={{ height: 0 }}
                    mouseOverOptions={{
                      enable: true,
                      opacity: 0.6,
                      highlightColor: "white",
                    }}
                    dataArr={COLORS}
                    onSelect={(item, idx) => {
                      let wo = cloneDeep(zWorkorderObj);
                      wo.color2 = item;
                      _zSetWorkorderObj(wo);
                      dbSetOpenWorkorderItem(wo);
                    }}
                    itemViewStyle={{ borderRadius: 0 }}
                    itemTextStyle={{ fontSize: 14 }}
                    buttonStyle={dropdownButtonStyle}
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
                marginTop: 10,
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
                  // marginTop: 10,
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
                    dataArr={zSettingsObj.waitTimes}
                    onSelect={(item, idx) => {
                      let wo = cloneDeep(zWorkorderObj);
                      wo.waitTime = item;
                      wo.status = NONREMOVABLE_STATUSES.find(
                        (o) => o.label == "Service"
                      );
                      _zSetWorkorderObj(wo);
                      dbSetOpenWorkorderItem(wo);
                    }}
                    itemViewStyle={{ backgroundColor: "gray", width: null }}
                    itemTextStyle={{ fontSize: 14, color: "black" }}
                    buttonStyle={{
                      ...dropdownButtonStyle,
                      backgroundColor: zWorkorderObj.waitTime
                        ? dropdownButtonStyle.backgroundColor
                        : APP_BASE_COLORS.lightred,
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
              dataArr={zSettingsObj.statuses}
              onSelect={(val) => {
                let wo = cloneDeep(zWorkorderObj);
                wo.status = val;
                _zSetWorkorderObj(wo);
              }}
              itemViewStyle={{ backgroundColor: "gray", width: null }}
              // itemTextStyle={{ color }}
              buttonStyle={{
                width: "100%",
                backgroundColor: zWorkorderObj.status.backgroundColor,
                marginTop: 10,
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
                height: 1,
                backgroundColor: "lightgray",
                marginVertical: 30,
              }}
            />
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
                style={{ width: "50%" }}
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
                marginTop: 10,
              }}
            >
              <TextInputOnMainBackground
                value={zWorkorderObj.partSource}
                placeholderText={"Part Source"}
                style={{ width: "50%" }}
                onTextChange={(val) => {
                  let wo = cloneDeep(zWorkorderObj);
                  wo.partSource = val;
                  _zSetWorkorderObj(wo);
                }}
              />
              <View
                style={{
                  // marginTop: 10,
                  width: "50%",
                  flexDirection: "row",
                  paddingLeft: 5,
                  justifyContent: "flex-start",
                  alignItems: "center",
                  // backgroundColor: "green",
                }}
              >
                <DropdownMenu
                  dataArr={zSettingsObj.partSources}
                  onSelect={(item, idx) => {
                    let wo = cloneDeep(zWorkorderObj);
                    wo.partSource = item;
                    _zSetWorkorderObj(wo);
                  }}
                  itemViewStyle={{ backgroundColor: "gray" }}
                  itemTextStyle={{ fontSize: 14, color: "black" }}
                  buttonStyle={dropdownButtonStyle}
                  buttonTextStyle={dropdownButtonTextStyle}
                  ref={partSourcesRef}
                  buttonText={"Part Sources"}
                />
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
            // buttonStyle={{ width: 150 }}
            text={"Workorder"}
            colorGradientArr={COLOR_GRADIENTS.green}
            buttonStyle={{ paddingHorizontal: 25, paddingVertical: 5 }}
            onPress={handleNewWorkorderPress}
          />
          <Button_
            icon={ICONS.cashRed}
            colorGradientArr={COLOR_GRADIENTS.green}
            buttonStyle={{ paddingHorizontal: 25, paddingVertical: 5 }}
            text={"New Sale"}
            onPress={handleStartStandaloneSalePress}
          />
        </View>
      </View>
    );
  }

  return setComponent();

  try {
    return setComponent();
  } catch (e) {
    log("Error returning ActiveWorkorderComponent", e);
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
        borderColor: APP_BASE_COLORS.buttonLightGreenOutline,
        color: APP_BASE_COLORS.textMain,
        paddingVertical: 3,
        paddingHorizontal: 4,
        fontSize: 16,
        outlineWidth: 1,
        outlineColor: APP_BASE_COLORS.green,
        borderRadius: 5,
        fontWeight: value ? "500" : null,
        ...style,
      }}
      onChangeText={(val) => onTextChange(val)}
    />
  );
};

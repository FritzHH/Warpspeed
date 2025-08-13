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
} from "../../../components";
import { Colors } from "../../../styles";
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
  // const [sWaitTimeSelected] = React.useState(zWorkorderObj.waitTime)

  const bikesRef = useRef();
  const ebikeRef = useRef();
  const descriptionRef = useRef();
  const color1Ref = useRef();
  const color2Ref = useRef();
  const waitTimesRef = useRef();
  const partSourcesRef = useRef();
  const statusRef = useRef();

  // useRef(() => {
  //   if (zWorkorderObj.waitTime) return

  // }, [zWorkorderObj])

  ///////////////////////////////////////////////////////////////////////////////
  ///////////////////////////////////////////////////////////////////////////////
  // function setWorkorderObj(obj) {
  //   _zSetWorkorderObj(obj);
  //   dbSetOpenWorkorderItem(obj);
  // }

  function setCustomerObj(obj) {
    _zSetCustomerObj(obj);
    dbSetCustomerObj(obj);
    // });
  }

  function setBikeColor(incomingColorVal, fieldName) {
    let foundColor = false;
    let newColorObj = {};
    zSettingsObj.colors.forEach((bikeColorObj) => {
      if (bikeColorObj.label.toLowerCase() === incomingColorVal.toLowerCase()) {
        foundColor = true;
        newColorObj = cloneDeep(bikeColorObj);
      }
    });
    if (!foundColor) {
      // log("not found", incomingColorVal);
      // newColorObj.label = newColorObj.label;
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
    _zSetWorkorderObj(null);
    _zSetCustomerObj(null);
    _zSetInfoTabName(TAB_NAMES.infoTab.customer);
  }

  const dropdownButtonStyle = {
    width: "100%",
    backgroundColor: null,
    ...SHADOW_RADIUS_NOTHING,
    borderColor: "lightgray",
    borderWidth: 1,
    paddingVertical: 2,
  };

  const dropdownButtonTextStyle = {
    fontSize: 16,
    color: "white",
  };

  function setComponent() {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "space-between",
          alignItems: "center",
          // paddingRight: 7,
          paddingHorizontal: 5,
          backgroundColor: null,
        }}
      >
        <View
          style={{
            width: "100%",
            // paddingHorizontal: 5,
          }}
        >
          <LoginScreenModalComponent modalVisible={zShowLoginScreen} />
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
              modalVisible={sShowCustomerInfoModal}
              showOuterModal={true}
              buttonLabel={
                zWorkorderObj.customerFirst + " " + zWorkorderObj.customerLast
              }
              buttonStyle={{
                alignItems: "flex-start",
                justifyContent: "center",
                paddingLeft: 0,
                paddingVertical: 5,
                paddingRight: 10,
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
          </View>
          <View>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
              }}
            >
              {zCustomerObj.cell.length > 0 ? (
                <Text style={{ color: Colors.darkText }}>
                  {"Cell:  " + addDashesToPhone(zCustomerObj.cell)}
                </Text>
              ) : null}
              {zCustomerObj.landline.length > 0 ? (
                <Text style={{ color: Colors.darkText }}>
                  {"Land:  " + addDashesToPhone(zCustomerObj.landline)}
                </Text>
              ) : null}
              {zCustomerObj.contactRestriction === "CALL" ? (
                <Text style={{ color: Colors.darkText }}>CALL ONLY</Text>
              ) : null}
              {zCustomerObj.contactRestriction === "EMAIL" ? (
                <Text style={{ color: Colors.darkText }}>EMAIL ONLY</Text>
              ) : null}
            </View>

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
                  // backgroundColor: "green",
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
                    dataArr={zSettingsObj.bikeBrands}
                    onSelect={(item, idx) => {
                      let wo = cloneDeep(zWorkorderObj);
                      wo.brand = item;
                      _zSetWorkorderObj(wo);
                    }}
                    itemViewStyle={{ backgroundColor: "gray" }}
                    itemTextStyle={{ fontSize: 14, color: "black" }}
                    buttonStyle={dropdownButtonStyle}
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
                    buttonStyle={dropdownButtonStyle}
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
                marginTop: 5,
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
                    itemViewStyle={{ backgroundColor: "gray" }}
                    itemTextStyle={{ fontSize: 14, color: "black" }}
                    buttonStyle={{ ...dropdownButtonStyle, width: "100%" }}
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
                justifyContent: "flex-start",
                alignItems: "center",
                width: "100%",
                marginTop: 5,
              }}
            >
              <TextInputOnMainBackground
                placeholderText={"Color 1"}
                value={zWorkorderObj.color1.label}
                style={{
                  width: "48%",
                  backgroundColor: zWorkorderObj.color1.backgroundColor,
                  color: zWorkorderObj.color1.textColor,
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
                  justifyContent: "flex-start",
                  alignItems: "center",
                  // backgroundColor: "green",
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
                    itemViewStyle={{}}
                    itemTextStyle={{ fontSize: 14 }}
                    buttonStyle={{ ...dropdownButtonStyle }}
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
                    itemViewStyle={{}}
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
                marginTop: 5,
              }}
            >
              <TextInputOnMainBackground
                placeholderText={"Estimated Wait"}
                style={{ width: "50%" }}
                value={zWorkorderObj.waitTime?.label}
                onTextChange={(val) => {
                  let wo = cloneDeep(zWorkorderObj);
                  wo.waitTime = val;
                  _zSetWorkorderObj(wo);
                  dbSetOpenWorkorderItem(wo);
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
                      backgroundColor: zWorkorderObj.waitTime ? null : "red",
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
              itemTextStyle={{ color: getBackgroundColor().textColor }}
              buttonStyle={{
                width: "100%",
                backgroundColor: zWorkorderObj.status.backgroundColor,
                marginTop: 5,
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
                  _zExecute(() => _zSetWorkorderObj(wo));
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
                marginTop: 5,
              }}
            >
              <TextInputOnMainBackground
                value={zWorkorderObj.partSource}
                placeholderText={"Part Source"}
                style={{ width: "50%" }}
                onTextChange={(val) => {
                  let wo = cloneDeep(zWorkorderObj);
                  wo.partSource = val;
                  _zExecute(() => _zSetWorkorderObj(wo));
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
          <Button
            buttonStyle={{ width: 150 }}
            text={"New Workorder"}
            onPress={handleNewWorkorderPress}
          />
          <Button
            buttonStyle={{ width: 150 }}
            text={"New Sale"}
            onPress={handleStartStandaloneSalePress}
          />
        </View>
      </View>
    );
  }

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
}) => {
  return (
    <TextInput
      value={value}
      placeholder={placeholderText}
      placeholderTextColor={"lightgray"}
      style={{
        borderWidth: 2,
        borderColor: "gray",
        color: Colors.darkText,
        paddingVertical: 3,
        paddingHorizontal: 4,
        fontSize: 16,
        outlineWidth: 0,
        // width: "100%",
        // marginVertical: 5,
        ...style,
      }}
      onChangeText={(val) => onTextChange(val)}
    />
  );
};

/*eslint-disable*/
import {
  View,
  Text,
  Pressable,
  Modal,
  TouchableOpacity,
  FlatList,
  TextInput,
  TouchableWithoutFeedback,
} from "react-native-web";
import React, { Component, useCallback, useEffect, useRef } from "react";
import { Animated, Easing, Image } from "react-native-web";
import {
  addDashesToPhone,
  capitalizeAllWordsInSentence,
  capitalizeFirstLetterOfString,
  clog,
  formatDecimal,
  generateRandomID,
  getPreviousMondayDayJS,
  ifNumIsOdd,
  insertOpacityIntoRGBString,
  LETTERS,
  lightenRGBByPercent,
  log,
  NUMS,
  readAsBinaryString,
  removeDashesFromPhone,
  trimToTwoDecimals,
} from "./utils";
import {
  APP_BASE_COLORS,
  COLOR_GRADIENT_PROFILES,
  COLOR_GRADIENTS,
  Colors,
  Fonts,
  ICONS,
} from "./styles";
import { useState } from "react";
import {
  FOCUS_NAMES,
  INVENTORY_ITEM_PROTO,
  INVENTORY_CATEGORY_NAMES,
  SETTINGS_OBJ,
  PRIVILEDGE_LEVELS,
  COLORS,
} from "./data";
import { cloneDeep } from "lodash";
import { CUSTOMER_PROTO } from "./data";
import {
  useInventoryStore,
  useInvModalStore,
  useSettingsStore,
  useLoginStore,
  useStripePaymentStore,
  useCheckoutStore,
  useCurrentCustomerStore,
  useOpenWorkordersStore,
  useTabNamesStore,
  useAlertScreenStore,
} from "./stores";
import {
  dbCancelPaymentIntents,
  dbCancelServerDrivenStripePayment,
  dbGetStripeActivePaymentIntents,
  dbGetStripeConnectionToken,
  dbGetStripePaymentIntent,
  dbProcessServerDrivenStripePayment,
  dbRetrieveAvailableStripeReaders,
  dbSetCustomerObj,
  dbSetInventoryItem,
  dbSetSettings,
} from "./db_call_wrapper";
import {
  paymentIntentSubscribe,
  removePaymentIntentSub,
} from "./db_subscription_wrapper";
import Dropzone from "react-dropzone";
import { CheckBox_ as RNCheckBox_ } from "react-native-web";
import LinearGradient from "react-native-web-linear-gradient";
import { TextComponent } from "react-native";
// import DateTimePicker from "@react-native-community/datetimepicker";
import CalendarPicker, {
  DateType,
  useDefaultStyles,
} from "react-native-ui-datepicker";
import dayjs from "dayjs"; // Recommended for date manipulation

export const VertSpacer = ({ pix }) => <View style={{ height: pix }} />;
export const HorzSpacer = ({ pix }) => <View style={{ width: pix }} />;
const styles = {
  container: {
    // margin: 20,
  },
  button: {
    // padding: 5,
    backgroundColor: Colors.blueButtonBackground,
    borderRadius: 1,
  },
  buttonText: {
    color: Colors.blueButtonText,
    textAlign: "center",
  },
  modalBackground: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "40%",
    backgroundColor: "white",
    borderRadius: 10,
    padding: 20,
  },
  option: {
    padding: 18,
  },
  optionText: {
    fontSize: 16,
  },
  closeButton: {
    // width: 100,
    marginTop: 10,
    padding: 10,
    paddingHorizontal: 20,
    backgroundColor: "#e74c3c",
    borderRadius: 5,
  },
  removeButton: {
    // width: 200,
    marginTop: 10,
    padding: 10,
    paddingHorizontal: 20,
    backgroundColor: "#e74c3c",
    borderRadius: 5,
  },
  closeText: {
    color: "white",
    textAlign: "center",
  },
  removeText: {
    color: "white",
    textAlign: "center",
    width: 200,
  },
};

export const SHADOW_RADIUS_PROTO = {
  shadowColor: "black",
  shadowOffset: { width: 2, height: 2 },
  shadowOpacity: 0.25,
  shadowRadius: 1,
};

export const SHADOW_RADIUS_NOTHING = {
  shadowOffset: { width: 0, height: 0 },
  shadowRadius: 0,
  shadowColor: "transparent",
};

export const TabMenuDivider = () => {
  return (
    <View
      style={{
        // marginHorizontal: 2,
        width: 1,
        backgroundColor: "gray",
        height: "100%",
      }}
    ></View>
  );
};

export const TextInputLabelOnMainBackground = ({ value, styleProps = {} }) => {
  const text_style = {
    color: Colors.darkTextOnMainBackground,
    fontSize: 12,
    marginBottom: 1,
  };
  return <Text style={{ ...text_style, ...styleProps }}>{value}</Text>;
};

export const TextInputOnMainBackground = ({
  value,
  onTextChange,
  styleProps = {},
  placeholderText,
}) => {
  return (
    <TextInput
      value={value}
      placeholder={placeholderText}
      placeholderTextColor={"darkgray"}
      style={{
        borderWidth: 2,
        borderColor: "gray",
        color: Colors.lightTextOnMainBackground,
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

export const AlertBox_ = ({}) => {
  // store setters /////////////////////////////////////////////////////////////
  const _zResetAll = useAlertScreenStore((state) => state.resetAll);

  // store getters //////////////////////////////////////////////////////////////
  const zCanExitOnOuterClick = useAlertScreenStore((state) =>
    state.getCanExitOnOuterClick()
  );
  const zShowAlert = useAlertScreenStore((state) => state.getShowAlert());
  const zTitle = useAlertScreenStore((state) => state.getTitle());
  const zMessage = useAlertScreenStore((state) => state.getMessage());
  const zSubMessage = useAlertScreenStore((state) => state.getSubMessage());
  const zButton1Text = useAlertScreenStore((state) => state.getButton1Text());
  const zButton2Text = useAlertScreenStore((state) => state.getButton2Text());
  const zButton3Text = useAlertScreenStore((state) => state.getButton3Text());
  const zButton1Handler = useAlertScreenStore((state) =>
    state.getButton1Handler()
  );
  const zButton2Handler = useAlertScreenStore((state) =>
    state.getButton2Handler()
  );
  const zButton3Handler = useAlertScreenStore((state) =>
    state.getButton3Handler()
  );
  const zButton1Icon = useAlertScreenStore((state) => state.getButton1Icon());
  const zButton2Icon = useAlertScreenStore((state) => state.getButton2Icon());
  const zButton3Icon = useAlertScreenStore((state) => state.getButton3Icon());
  const zIcon1Size = useAlertScreenStore((state) => state.getIcon1Size());
  const zIcon2Size = useAlertScreenStore((state) => state.getIcon2Size());
  const zIcon3Size = useAlertScreenStore((state) => state.getIcon3Size());
  const zAlertBoxStyle = useAlertScreenStore((state) =>
    state.getAlertBoxStyle()
  );

  //////////////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////////////

  function handleButton1Press() {
    zButton1Handler();
    _zResetAll();
  }

  function handleButton2Press() {
    zButton2Handler();
    _zResetAll();
  }

  function handleButton3Press() {
    zButton3Handler();
    _zResetAll();
  }

  return (
    <TouchableWithoutFeedback
      onPress={() => (zCanExitOnOuterClick ? _zResetAll() : null)}
    >
      <Modal visible={zShowAlert} transparent>
        <View
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            alignItems: "center",
            justifyContent: "center",
            alignSelf: "center",
            justifySelf: "center",
            width: "100%",
            height: "100%",
          }}
        >
          <View
            style={{
              backgroundColor: APP_BASE_COLORS.backgroundWhite,
              borderRadius: 15,
              alignItems: "center",
              justifyContent: "space-around",
              minWidth: "30%",
              minHeight: "20%",
              ...zAlertBoxStyle,
            }}
          >
            {zTitle ? (
              <Text
                numberOfLines={3}
                style={{
                  fontWeight: "500",
                  marginTop: 25,
                  color: Colors.darkText,
                  fontSize: 25,
                  color: "red",
                }}
              >
                {zTitle || "Alert:"}
              </Text>
            ) : null}

            {zMessage ? (
              <Text
                style={{
                  textAlign: "center",
                  width: "90%",
                  marginTop: 10,
                  color: Colors.darkText,
                  fontSize: 18,
                }}
              >
                {zMessage}
              </Text>
            ) : null}
            {zSubMessage ? (
              <Text
                style={{
                  marginTop: 20,
                  width: "80%",
                  textAlign: "center",
                  color: Colors.darkText,
                  fontSize: 16,
                }}
              >
                {zSubMessage}
              </Text>
            ) : null}
            <View
              style={{
                marginTop: 25,
                flexDirection: "row",
                justifyContent: "center",
                marginBottom: 25,
                width: "100%",
              }}
            >
              <Button_
                colorGradientArr={zButton1Text ? COLOR_GRADIENTS.green : []}
                text={zButton1Text}
                buttonStyle={{ marginRight: 20 }}
                textStyle={{ color: APP_BASE_COLORS.textWhite }}
                onPress={handleButton1Press}
                iconSize={zIcon1Size || 60}
                icon={zButton1Icon || (zButton1Text ? null : ICONS.check1)}
              />
              {zButton2Handler ? (
                <Button_
                  colorGradientArr={zButton2Text ? COLOR_GRADIENTS.blue : []}
                  text={zButton2Text}
                  buttonStyle={{ marginRight: 20 }}
                  textStyle={
                    zButton2Text ? { color: APP_BASE_COLORS.textWhite } : {}
                  }
                  onPress={handleButton2Press}
                  iconSize={zIcon2Size || 60}
                  icon={zButton2Icon || (zButton2Text ? null : ICONS.close1)}
                />
              ) : null}
              {zButton3Handler ? (
                <Button_
                  colorGradientArr={zButton3Text ? COLOR_GRADIENTS.purple : []}
                  text={zButton3Text}
                  buttonStyle={zButton3Text ? {} : {}}
                  textStyle={
                    zButton3Text ? { color: APP_BASE_COLORS.textWhite } : {}
                  }
                  onPress={handleButton3Press}
                  iconSize={zIcon3Size || 60}
                  icon={zButton3Icon || (zButton3Text ? null : ICONS.close1)}
                />
              ) : null}
            </View>
          </View>
        </View>
      </Modal>
    </TouchableWithoutFeedback>
  );
};

export const DateTimePicker = ({ range, handleDateRangeChange = () => {} }) => {
  const defaultStyles = useDefaultStyles();

  function handleDateChange_(obj) {
    if (!obj.endDate) obj.endDate = obj.startDate;
    handleDateRangeChange(obj);
  }

  return (
    <View
      style={{
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 15,
      }}
    >
      <View
        style={{
          padding: 50,
          // backgroundColor: "lightgray",
          borderRadius: 15,
          alignItems: "center",
        }}
      >
        <CalendarPicker
          styles={{
            ...defaultStyles,
            today: {
              borderColor: APP_BASE_COLORS.lightred,
              borderWidth: 2,
              borderRadius: 100,
            }, // Add a border to today's date
            selected: {
              borderRadius: 100,
              backgroundColor: APP_BASE_COLORS.blue,
            },
            selected_label: { color: "white" },
          }}
          mode="range"
          startDate={range.startDate}
          endDate={range.endDate}
          onChange={handleDateChange_}
          // minDate={new Date()}
        />
      </View>
    </View>
  );
};

export const ScreenModal = ({
  enabled,
  ref,
  modalCoordinateVars = {
    // x: -30,
    // y: 40,
  },
  mouseOverOptions = {
    // enable: true,
    // opacity: 1,
    // highlightColor: Colors.tabMenuButton,
  },
  handleButtonPress = () => {},
  handleMouseOver,
  handleMouseExit,
  buttonLabel = "Modal Button",
  buttonVisible = true,
  showOuterModal = false,
  buttonIconSize,
  showShadow = true,
  buttonStyle = {},
  buttonTextStyle = {},
  Component,
  outerModalStyle = {},
  modalVisible = false,
  setModalVisibility = () => {},
  shadowStyle = { ...SHADOW_RADIUS_NOTHING },
  buttonIcon,
  buttonIconStyle = {},
  handleModalActionInternally = false,
  // canExitOnOuterModalClick = true,
  handleOuterClick = () => {},
}) => {
  const [sModalCoordinates, _setModalCoordinates] = useState({ x: 0, y: 0 });
  const [sMouseOver, _setMouseOver] = React.useState(false);
  const [sInternalModalShow, _setInternalModalShow] = useState(false);
  const _zSetModalVisible = useLoginStore((state) => state.setModalVisible);

  //////////////////////////////////////////////////////////////
  useEffect(() => {
    _zSetModalVisible(true);
    return () => {
      _zSetModalVisible(false);
    };
  });
  if (modalCoordinateVars.y < 0) modalCoordinateVars.y = 0;
  // log("ref in ScreenModal", ref);
  useEffect(() => {
    const el = ref ? ref.current : null;
    if (el) {
      let rect = el.getBoundingClientRect();
      _setModalCoordinates({ x: rect.x, y: rect.y });
    }
  }, [ref]);

  if (!showShadow) shadowStyle = SHADOW_RADIUS_NOTHING;
  if (!showOuterModal)
    outerModalStyle = { ...outerModalStyle, width: null, height: null };
  // if (sMouseOver) shadowStyle = { ...SHADOW_RADIUS_PROTO };
  /////////////////////////////////////////////////////////////////
  /////////////////////////////////////////////////////////////////
  if (mouseOverOptions.highlightColor) mouseOverOptions.enable = true;
  return (
    <TouchableWithoutFeedback
      ref={ref}
      onPress={() => {
        _setInternalModalShow(false);
        handleOuterClick();
      }}
    >
      <View style={{}}>
        {buttonVisible ? (
          <Button_
            enabled={enabled}
            handleMouseExit={handleMouseExit}
            handleMouseOver={handleMouseOver}
            icon={buttonIcon}
            iconSize={buttonIconSize}
            text={buttonLabel}
            onPress={() => {
              handleButtonPress();
              setModalVisibility(!modalVisible);
              _setInternalModalShow(!sInternalModalShow);
            }}
            onMouseOver={() =>
              mouseOverOptions.enable ? _setMouseOver(true) : null
            }
            onMouseLeave={() => {
              _setMouseOver(false);
            }}
            textStyle={{ ...buttonTextStyle }}
            buttonStyle={{
              alignItems: "center",
              justifyContent: "center",
              width: !buttonVisible ? 0 : null,
              height: !buttonVisible ? 0 : null,
              ...shadowStyle,
              ...buttonStyle,
            }}
          />
        ) : null}

        <Modal
          visible={
            handleModalActionInternally ? sInternalModalShow : modalVisible
          }
          transparent
        >
          <View
            style={{
              width: "100%",
              height: "100%",
              backgroundColor: showOuterModal ? "rgba(0, 0, 0, 0.5)" : null,
              justifyContent: "center",
              alignItems: "center",
              alignSelf: "center",
              justifySelf: "center",
              ...outerModalStyle,
              position: ref ? "absolute" : null,
              top: ref ? sModalCoordinates.y + modalCoordinateVars.y : null,
              left: ref ? sModalCoordinates.x + modalCoordinateVars.x : null,
            }}
          >
            <Component />
          </View>
        </Modal>
      </View>
    </TouchableWithoutFeedback>
  );
};

export const DropdownMenu = ({
  enabled,
  dataArr = [],
  onSelect,
  buttonIcon,
  buttonIconSize,
  itemTextStyle = {},
  itemStyle = {},
  buttonStyle = {},
  menuButtonStyle = {},
  buttonTextStyle = {},
  buttonText,
  ref,
  modalCoordinateVars = {
    x: -15,
    y: 50,
  },
  mouseOverOptions = {
    enable: true,
    // opacity: 1,
    highlightColor: lightenRGBByPercent(APP_BASE_COLORS.lightred, 10),
  },
  showButtonShadow,
  shadowStyle = {},
  itemSeparatorStyle = {},
  menuBorderColor,
  selectedIdx = 0,
  useSelectedAsButtonTitle = false,
}) => {
  const [sModalCoordinates, _setModalCoordinates] = useState({ x: 0, y: 0 });
  const [sModalVisible, _setModalVisible] = useState(false);

  function getBackgroundColor(rgbString = "", index) {
    // log(rgbString);
    if (!rgbString) return null;
    if (ifNumIsOdd(index) || !rgbString.includes("rgb")) {
      return rgbString;
    }
    return lightenRGBByPercent(rgbString, 20);
  }

  // log("ss", selectedIdx);
  if (useSelectedAsButtonTitle) {
    // log(selectedIdx);
    buttonText = dataArr[Number(selectedIdx)]?.label;
  }

  const DropdownComponent = () => {
    return (
      <View
        style={{
          // backgroundColor: "transparent",
          // borderWidth: 2,
          borderColor:
            menuBorderColor || APP_BASE_COLORS.buttonLightGreenOutline,
          // borderRadius: 10,
          borderRadius: 25,
        }}
      >
        <FlatList
          // style={{ borderRadius: 15, backgroundColor: "transparent" }}
          data={dataArr}
          ItemSeparatorComponent={() => (
            <View
              style={{
                // height: 1,
                backgroundColor: APP_BASE_COLORS.buttonLightGreen,
                width: "100%",

                ...itemSeparatorStyle,
              }}
            />
          )}
          renderItem={(item) => {
            let idx = item.index;
            // log(idx);
            item = item.item;
            // log(item);
            return (
              <Button_
                mouseOverOptions={mouseOverOptions}
                buttonStyle={{
                  padding: 10,
                  height: 40,
                  borderRadius: 0,
                  width: 130,
                  backgroundColor:
                    getBackgroundColor(item.backgroundColor, idx) ||
                    getBackgroundColor(
                      APP_BASE_COLORS.buttonLightGreenOutline,
                      idx
                    ),
                  borderTopLeftRadius:
                    idx == 0 ? menuButtonStyle.borderRadius : null,
                  borderTopRightRadius:
                    idx == 0 ? menuButtonStyle.borderRadius : null,
                  borderBottomLeftRadius:
                    idx == dataArr.length - 1
                      ? menuButtonStyle.borderRadius
                      : null,
                  borderBottomRightRadius:
                    idx == dataArr.length - 1
                      ? menuButtonStyle.borderRadius
                      : null,
                  ...itemStyle,
                }}
                textStyle={{
                  ...itemTextStyle,
                  color: item.textColor || APP_BASE_COLORS.textMain,
                }}
                text={item.label || item}
                onPress={() => {
                  onSelect(item, idx);
                  _setModalVisible(false);
                }}
              />
            );
          }}
        />
      </View>
    );
  };

  return (
    <ScreenModal
      Component={() => <DropdownComponent />}
      modalVisible={sModalVisible}
      handleButtonPress={() => _setModalVisible(!sModalVisible)}
      buttonStyle={buttonStyle}
      buttonTextStyle={buttonTextStyle}
      buttonLabel={buttonText}
      ref={ref}
      buttonIcon={buttonIcon}
      buttonIconSize={buttonIconSize}
      modalCoordinateVars={modalCoordinateVars}
      showShadow={showButtonShadow}
      mouseOverOptions={mouseOverOptions}
      shadowStyle={shadowStyle}
      handleOuterClick={() => _setModalVisible(false)}
      enabled={enabled}
    />
  );
};

export const ModalDropdown = ({
  // ref,
  data,
  onSelect,
  buttonLabel,
  buttonBackgroundColor,
  onRemoveSelection,
  currentSelection,
  removeButtonText,
  buttonStyle = {},
  textStyle = {},
  outerModalStyle = {},
  innerModalStyle = {},
  modalCoordinateVars = {
    x: 200,
    y: -300,
  },

  // modalStyle = {},
}) => {
  const _zSetModalVisible = useLoginStore((state) => state.setModalVisible);
  const [isModalVisible, setModalVisible] = useState(false);
  const [selectedValue, setSelectedValue] = useState(null);
  const [sModalCoordinates, _setModalCoordinates] = useState({ x: 0, y: 0 });

  useEffect(() => {
    _zSetModalVisible(true);
    return () => {
      _zSetModalVisible(false);
    };
  });

  useEffect(() => {
    // const el = ref ? ref.current : null;
    // if (el) {
    //   log("el", el);
    //   let rect = el.getBoundingClientRect();
    //   _setModalCoordinates({ x: rect.x, y: rect.y });
    // }
  }, []);

  const toggleModal = () => setModalVisible(!isModalVisible);
  if (modalCoordinateVars.y < 0) modalCoordinateVars.y = 0;

  const handleSelect = (item) => {
    setSelectedValue(item);
    onSelect(item);
    toggleModal();
  };
  // log(data);
  // log("ref", ref);
  return (
    <TouchableWithoutFeedback
      // ref={ref ? ref : null}
      onPress={() => toggleModal()}
    >
      <View>
        <TouchableOpacity onPress={toggleModal}>
          <View
            style={{
              backgroundColor: Colors.blueButtonBackground,
              borderRadius: 2,
              paddingHorizontal: 10,
              height: 25,
              padding: 3,
              alignItems: "center",
              justifyContent: "center",
              // position: ref ? "absolute" : null,
              // top: ref ? sModalCoordinates.y + modalCoordinateVars.y : null,
              // left: ref ? sModalCoordinates.x + modalCoordinateVars.x : null,
              ...SHADOW_RADIUS_PROTO,
              ...buttonStyle,
            }}
          >
            <Text
              style={{
                color: "white",
                textAlign: "center",
                fontSize: 15,
                ...textStyle,
              }}
            >
              {buttonLabel}
            </Text>
          </View>
        </TouchableOpacity>

        <Modal visible={isModalVisible} transparent={true}>
          <View
            style={{
              width: "100%",
              height: "100%",
              ...outerModalStyle,
            }}
          >
            <TouchableWithoutFeedback>
              <View style={{ width: "20%", ...innerModalStyle }}>
                <FlatList
                  data={data}
                  keyExtractor={(item, index) => index.toString()}
                  renderItem={({ item }) => {
                    let label = "";
                    let backgroundColor = null;
                    let textColor = null;
                    let fontSize = null;
                    let itemStyleProps = {};
                    if (typeof item === "object") {
                      // bike colors modal
                      if (Object.hasOwn(item, "backgroundColor")) {
                        label = item.label;
                        itemStyleProps.backgroundColor = item.backgroundColor;
                        textColor = item.textColor;
                        itemStyleProps.paddingVertical = 15;
                        fontSize = 15;
                        if (label === currentSelection.label) {
                          itemStyleProps.borderWidth = 10;
                          itemStyleProps.borderColor = Colors.mainBackground;
                        }
                      }
                    } else {
                      fontSize = 15;
                      label = item;
                      itemStyleProps.backgroundColor =
                        Colors.opacityBackgroundLight;
                      itemStyleProps.marginVertical = 2;
                      textColor = "white";
                    }
                    return (
                      <TouchableOpacity
                        style={{
                          ...styles.option,
                          backgroundColor,
                          // ...borderProps,
                          borderColor: "dimgray",
                          ...itemStyleProps,
                        }}
                        onPress={() => handleSelect(item)}
                      >
                        <Text style={{ fontSize, color: textColor }}>
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  }}
                />
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-around",
                  }}
                >
                  {currentSelection && (
                    <TouchableOpacity
                      style={styles.removeButton}
                      onPress={() => {
                        onRemoveSelection();
                        toggleModal();
                      }}
                    >
                      <Text style={styles.closeText}>{removeButtonText}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
          {/* </View> */}
        </Modal>
      </View>
    </TouchableWithoutFeedback>
  );
};

export const InventoryItemScreeenModalComponent = ({
  itemIdx,
  handleClosePress,
}) => {
  // store setters ////////////////////////////////////////////////////////
  const _zSetFocus = useInvModalStore((state) => state.setFocus);
  const _zModInventoryItem = useInventoryStore((state) => state.modItem);
  const _zSetSettingsObj = useSettingsStore((state) => state.setSettingsObj);
  const _zSetLoginFunctionCallback = useLoginStore(
    (state) => state.setLoginFunctionCallback
  );
  const _zSetShowLoginScreen = useLoginStore(
    (state) => state.setShowLoginScreen
  );
  const _zExecute = useLoginStore((state) => state.execute);
  // const _zSetModalVisible = useLoginStore((state) => state.setModalVisible);

  // store getters ///////////////////////////////////////////////////////
  const zSettingsObj = useSettingsStore((state) => state.getSettingsObj());
  const zFocus = useInvModalStore((state) => state.getFocus());
  const zInventoryArr = useInventoryStore((state) => state.getInventoryArr());
  const zShowLoginScreen = useLoginStore((state) => state.getShowLoginScreen());

  //////////////////////////////////////////////////////////////////////////

  const [sItem, _setItem] = React.useState(null);
  const [sNewItem, _setNewItem] = React.useState(false);

  // for automatic focus
  const INPUT_FIELD_NAMES = {
    formalName: "name",
    informalName: "informalName",
    price: "price",
    category: "category",
    sale: "sale",
    upc: "upc",
  };

  useEffect(() => {
    _setItem(zInventoryArr[itemIdx]);
  }, []);

  ///////////////////////////////////////////////////////////////////////

  function handleChangeItem(item, focusName) {
    _zSetFocus(focusName);
    _setItem(item);

    if (!sNewItem)
      // _zExecute(() => {
      _zModInventoryItem(item, "change");
    dbSetInventoryItem(item);
    // }, PRIVILEDGE_LEVELS.superUser);
  }

  function handleQuickButtonRemove(qBItemToRemove, objIdx) {
    const obj = zInventoryArr[objIdx];
    let idx = zSettingsObj.quickItemButtonNames.findIndex(
      (o) => o.name === qBItemToRemove.name
    );
    let assignments = { ...zSettingsObj.quickItemButtonNames[idx] }.assignments;
    let newAssignmentsArr = assignments.filter((id) => id != obj.id);
    let newSettingsObj = { ...zSettingsObj };
    newSettingsObj.quickItemButtonNames[idx] = newAssignmentsArr;
    _zSetSettingsObj(newSettingsObj);
    dbSetSettings(newSettingsObj);
  }

  // log(zSettingsObj);
  function handleQuickButtonAdd(itemName) {
    const invItem = { ...zInventoryArr[itemIdx] };
    let settingsObj = cloneDeep(zSettingsObj);
    let idx = zSettingsObj.quickItemButtonNames.findIndex(
      (o) => o.name === itemName
    );
    let obj = settingsObj.quickItemButtonNames[idx];
    // log("obj", obj);
    // return;
    if (!obj.assignments) {
      obj.assignments = [];
      obj.assignments.push(invItem.id);
    } else if (obj.assignments.find((o) => o === invItem.id)) {
      return;
    } else {
      obj.assignments.push(invItem.id);
    }
    // log(obj.assignments);
    settingsObj.quickItemButtonNames[idx] = obj;
    _zSetSettingsObj(settingsObj);
    dbSetSettings(settingsObj);
  }

  function handleNewItemPress() {
    log("new item", sItem);
    return;
    _zModInventoryItem(sItem, "add");
    dbSetInventoryItem(sItem);
    handleClosePress();
  }

  function handleRemoveItem() {
    _zExecute(() => {
      _zModInventoryItem(sItem, "remove");
      dbSetInventoryItem(sItem, true);
      handleClosePress();
    }, "Admin");
  }

  function setComponent() {
    return (
      <TouchableWithoutFeedback>
        <View
          style={{
            width: "40%",
            height: "60%",
            // backgroundColor: Colors.opacityBackgroundLight,
            ...SHADOW_RADIUS_PROTO,
            shadowOffset: { width: 3, height: 3 },
            padding: 15,
            backgroundColor: "white",
          }}
        >
          <LoginScreenModalComponent modalVisible={zShowLoginScreen} />
          <View
            style={{
              width: "100%",
              // height: "100%",
              // flexDirection: "row",
              justifyContent: "space-between",
            }}
          >
            <View>
              <Text style={{ fontStyle: "italic", color: "gray" }}>
                {"Catalog Name"}
              </Text>
              <TextInput
                numberOfLines={3}
                style={{
                  marginTop: 2,
                  fontSize: 16,
                  color: "black",
                  // borderBottomWidth: 1,
                }}
                autoFocus={zFocus === INPUT_FIELD_NAMES.formalName}
                onClick={() => _zSetFocus(INPUT_FIELD_NAMES.formalName)}
                onChangeText={(val) => {
                  let newItem = cloneDeep(sItem);
                  newItem.formalName = val;
                  handleChangeItem(newItem, INPUT_FIELD_NAMES.formalName);
                }}
                value={sItem.formalName}
              />
              <Text
                style={{ marginTop: 20, fontStyle: "italic", color: "gray" }}
              >
                Keyword/Short Name
              </Text>
              <TextInput
                numberOfLines={3}
                style={{
                  marginTop: 2,
                  fontSize: 16,
                  color: "black",
                  // borderWidth: 1,
                }}
                autoFocus={zFocus === INPUT_FIELD_NAMES.informalName}
                onClick={() => _zSetFocus(INPUT_FIELD_NAMES.informalName)}
                onChangeText={(val) => {
                  let newItem = cloneDeep(sItem);
                  newItem.informalName = val;
                  handleChangeItem(newItem, INPUT_FIELD_NAMES.informalName);
                }}
                value={sItem.informalName}
              />
            </View>
            <View
              style={{
                flexDirection: "row",
              }}
            >
              <View
                style={{
                  alignItems: "flex-end",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    color: "red",
                    fontSize: 16,
                  }}
                >
                  {"Regular"}
                </Text>
                <Text style={{ color: "red", fontSize: 16 }}>{"Sale"}</Text>
              </View>
              <View
                style={{
                  marginLeft: 10,
                  // alignItems: "flex-start",
                  // justifyContent: "center",
                }}
              >
                <TextInput
                  autoFocus={zFocus === INPUT_FIELD_NAMES.price}
                  onClick={() => _zSetFocus(INPUT_FIELD_NAMES.price)}
                  onChangeText={(val) => {
                    let newItem = cloneDeep(sItem);
                    newItem.price = val;
                    handleChangeItem(newItem, INPUT_FIELD_NAMES.price);
                  }}
                  value={"$" + sItem.price}
                  style={{ fontSize: 16 }}
                />
                <TextInput
                  autoFocus={zFocus === INPUT_FIELD_NAMES.sale}
                  onClick={() => _zSetFocus(INPUT_FIELD_NAMES.sale)}
                  onChangeText={(val) => {
                    let newItem = cloneDeep(sItem);
                    newItem.salePrice = val;
                    handleChangeItem(newItem, INPUT_FIELD_NAMES.sale);
                  }}
                  value={"$" + sItem.salePrice}
                  style={{ fontSize: 16 }}
                />
              </View>
            </View>
          </View>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginTop: 20,
            }}
          >
            <Text style={{ marginLeft: 10 }}>{sItem.catMain}</Text>
          </View>

          <View style={{ color: "dimgray", flexDirection: "row" }}>
            <Text
              style={{
                fontSize: 12,
                marginRight: 5,
              }}
            >
              Barcode:
            </Text>

            <TextInput
              autoFocus={zFocus === INPUT_FIELD_NAMES.upc}
              onClick={() => _zSetFocus(INPUT_FIELD_NAMES.upc)}
              style={{ fontSize: 12, color: "black", marginTop: 0 }}
              value={sItem.upc}
              onChangeText={(val) => {
                let newItem = cloneDeep(sItem);
                newItem.upc = val;
                handleChangeItem(newItem, INPUT_FIELD_NAMES.upc);
              }}
            />
          </View>
          <ModalDropdown
            buttonLabel={"Quick Items"}
            buttonStyle={{ width: 125, marginTop: 15, marginBottom: 25 }}
            data={
              zSettingsObj.quickItemButtonNames
                ? zSettingsObj.quickItemButtonNames.map((o) => o.name)
                : []
            }
            onSelect={(itemName) => handleQuickButtonAdd(itemName)}
          />
          <FlatList
            data={zSettingsObj.quickItemButtonNames.map((nameObj) => {
              let found;
              nameObj.assignments?.forEach((id) => {
                if (id == sItem.id) found = nameObj;
              });
              return found;
            })}
            renderItem={(item) => {
              // log("i", item);
              if (!item.item) return null;
              item = item.item;
              return (
                <TouchableWithoutFeedback
                  onLongPress={() => handleQuickButtonRemove(item)}
                >
                  <Text>{item.name}</Text>
                </TouchableWithoutFeedback>
              );
            }}
          />
          <View
            style={{
              alignItems: "center",
              justifyContent: "space-between",
              flexDirection: "row",
            }}
          >
            <Button
              buttonStyle={{ width: 125, marginVertical: 10 }}
              text={"Create Item"}
              onPress={handleNewItemPress}
            />

            <Button
              buttonStyle={{ width: 125, marginVertical: 10 }}
              text={"Delete Item"}
              onPress={handleRemoveItem}
            />

            {/* ) : null} */}
          </View>
        </View>
      </TouchableWithoutFeedback>
    );
  }
  try {
    return setComponent();
  } catch (e) {
    // log("Error setting component InventoryItemScreenModalComponent", e);
    return null;
  }
};

export const CustomerInfoScreenModalComponent = ({
  ssCustomerInfoObj = CUSTOMER_PROTO,
  __setCustomerInfoObj,
  button1Text,
  button2Text,
  handleButton1Press,
  handleButton2Press,
  ssInfoTextFocus,
  __setInfoTextFocus,
}) => {
  // store setters
  const _zSetCurrentCustomer = useCurrentCustomerStore(
    (state) => state.setCustomerObj
  );
  const _zSetNewWorkorderInArr = useOpenWorkordersStore(
    (state) => state.modItem
  );
  const _zSetOpenWorkorder = useOpenWorkordersStore(
    (state) => state.setWorkorderObj
  );
  const _zSetItemsTabName = useTabNamesStore((state) => state.setItemsTabName);
  const _zSetInfoTabName = useTabNamesStore((state) => state.setInfoTabName);
  const _zSetOptionsTabName = useTabNamesStore(
    (state) => state.setOptionsTabName
  );
  const _zExecute = useLoginStore((state) => state.execute);

  // store getters

  /////////////////////////////////////////////////////////////////////
  ////////////////////////////////////////////////////////////////////

  // automatically save customer changes if it is NOT a new customer creation
  useEffect(() => {
    if (ssCustomerInfoObj?.id)
      // _zExecute(() => {
      _zSetCurrentCustomer(ssCustomerInfoObj);
    dbSetCustomerObj(ssCustomerInfoObj);
    // });
  }, [ssCustomerInfoObj]);

  const TEXT_INPUT_STYLE = {
    width: 200,
    height: 40,
    borderColor: "gray",
    borderWidth: 1,
    marginLeft: 20,
    marginTop: 10,
    paddingHorizontal: 3,
    outlineWidth: 0,
  };

  // clog(sCustomerInfoObj);

  function setComponent() {
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
                let obj = cloneDeep(ssCustomerInfoObj);
                obj.cell = removeDashesFromPhone(val);
                __setCustomerInfoObj(obj);
              }}
              placeholderTextColor="darkgray"
              placeholder="Cell phone"
              style={{ ...TEXT_INPUT_STYLE }}
              value={addDashesToPhone(ssCustomerInfoObj.cell)}
              autoComplete="none"
              autoFocus={ssInfoTextFocus === FOCUS_NAMES.cell}
              onFocus={() => __setInfoTextFocus(FOCUS_NAMES.cell)}
            />
            <TextInput
              onChangeText={(val) => {
                let obj = cloneDeep(ssCustomerInfoObj);
                obj.landline = removeDashesFromPhone(val);
                __setCustomerInfoObj(obj);
              }}
              placeholderTextColor="darkgray"
              placeholder="Landline"
              style={{ ...TEXT_INPUT_STYLE }}
              value={addDashesToPhone(ssCustomerInfoObj.landline)}
              autoComplete="none"
              autoFocus={ssInfoTextFocus === FOCUS_NAMES.land}
              onFocus={() => __setInfoTextFocus(FOCUS_NAMES.land)}
            />
            <TextInput
              onChangeText={(val) => {
                let obj = cloneDeep(ssCustomerInfoObj);
                obj.first = capitalizeFirstLetterOfString(val);
                __setCustomerInfoObj(obj);
              }}
              placeholderTextColor="darkgray"
              placeholder="First name"
              style={{ ...TEXT_INPUT_STYLE }}
              value={ssCustomerInfoObj.first}
              autoComplete="none"
              autoFocus={ssInfoTextFocus === FOCUS_NAMES.first}
              onFocus={() => __setInfoTextFocus(FOCUS_NAMES.first)}
            />
            <TextInput
              onChangeText={(val) => {
                let obj = cloneDeep(ssCustomerInfoObj);
                obj.last = capitalizeFirstLetterOfString(val);
                __setCustomerInfoObj(obj);
              }}
              placeholderTextColor="darkgray"
              placeholder="Last name"
              style={{ ...TEXT_INPUT_STYLE }}
              value={ssCustomerInfoObj.last}
              autoComplete="none"
              autoFocus={ssInfoTextFocus === FOCUS_NAMES.last}
              onFocus={() => __setInfoTextFocus(FOCUS_NAMES.last)}
            />
            <TextInput
              onChangeText={(val) => {
                let obj = cloneDeep(ssCustomerInfoObj);
                obj.email = val.toLowerCase();
                __setCustomerInfoObj(obj);
              }}
              placeholderTextColor="darkgray"
              placeholder="Email address"
              style={{ ...TEXT_INPUT_STYLE }}
              value={ssCustomerInfoObj.email}
              autoComplete="none"
              autoFocus={ssInfoTextFocus === FOCUS_NAMES.email}
              onFocus={() => __setInfoTextFocus(FOCUS_NAMES.email)}
            />
            <TextInput
              onChangeText={(val) => {
                let obj = cloneDeep(ssCustomerInfoObj);
                obj.streetAddress = capitalizeAllWordsInSentence(val);
                __setCustomerInfoObj(obj);
              }}
              placeholderTextColor="darkgray"
              placeholder="Street address"
              style={{ ...TEXT_INPUT_STYLE }}
              value={ssCustomerInfoObj.streetAddress}
              autoComplete="none"
              autoFocus={ssInfoTextFocus === FOCUS_NAMES.street}
              onFocus={() => __setInfoTextFocus(FOCUS_NAMES.street)}
            />
            <TextInput
              onChangeText={(val) => {
                let obj = cloneDeep(ssCustomerInfoObj);
                obj.unit = val;
                __setCustomerInfoObj(obj);
              }}
              placeholderTextColor="darkgray"
              placeholder="Unit"
              style={{ ...TEXT_INPUT_STYLE }}
              value={ssCustomerInfoObj.unit}
              autoComplete="none"
              autoFocus={ssInfoTextFocus === FOCUS_NAMES.unit}
              onFocus={() => __setInfoTextFocus(FOCUS_NAMES.unit)}
            />
            <TextInput
              onChangeText={(val) => {
                let obj = cloneDeep(ssCustomerInfoObj);
                obj.city = capitalizeAllWordsInSentence(val);
                __setCustomerInfoObj(obj);
              }}
              placeholderTextColor="darkgray"
              placeholder="City"
              style={{ ...TEXT_INPUT_STYLE }}
              value={ssCustomerInfoObj.city}
              autoComplete="none"
              autoFocus={ssInfoTextFocus === FOCUS_NAMES.city}
              onFocus={() => __setInfoTextFocus(FOCUS_NAMES.city)}
            />
            <TextInput
              onChangeText={(val) => {
                let obj = cloneDeep(ssCustomerInfoObj);
                obj.state = val.toUpperCase();
                __setCustomerInfoObj(obj);
              }}
              placeholderTextColor="darkgray"
              placeholder="State"
              style={{ ...TEXT_INPUT_STYLE }}
              value={ssCustomerInfoObj.state}
              autoComplete="none"
              autoFocus={ssInfoTextFocus === FOCUS_NAMES.state}
              onFocus={() => __setInfoTextFocus(FOCUS_NAMES.state)}
            />
            <TextInput
              onChangeText={(val) => {
                let obj = cloneDeep(ssCustomerInfoObj);
                obj.zip = val;
                __setCustomerInfoObj(obj);
              }}
              placeholderTextColor="darkgray"
              placeholder="Zip code"
              style={{ ...TEXT_INPUT_STYLE }}
              value={ssCustomerInfoObj.zip}
              autoComplete="none"
              autoFocus={ssInfoTextFocus === FOCUS_NAMES.zip}
              onFocus={() => __setInfoTextFocus(FOCUS_NAMES.zip)}
            />
            <TextInput
              onChangeText={(val) => {
                let obj = cloneDeep(ssCustomerInfoObj);
                obj.notes = capitalizeFirstLetterOfString(val);
                __setCustomerInfoObj(obj);
              }}
              placeholderTextColor="darkgray"
              placeholder="Address notes"
              style={{ ...TEXT_INPUT_STYLE }}
              value={ssCustomerInfoObj.notes}
              autoComplete="none"
              autoFocus={ssInfoTextFocus === FOCUS_NAMES.notes}
              onFocus={() => __setInfoTextFocus(FOCUS_NAMES.notes)}
            />
            <CheckBox_
              text={"Call Only"}
              isChecked={ssCustomerInfoObj.contactRestriction === "CALL"}
              onCheck={() => {
                let obj = cloneDeep(ssCustomerInfoObj);
                __setInfoTextFocus(null);
                if (obj.contactRestriction === "CALL") {
                  obj.contactRestriction = "";
                } else {
                  obj.contactRestriction = "CALL";
                }
                __setCustomerInfoObj(obj);
              }}
            />
            <CheckBox_
              text={"Email Only"}
              isChecked={ssCustomerInfoObj.contactRestriction === "EMAIL"}
              onCheck={() => {
                let obj = cloneDeep(ssCustomerInfoObj);
                __setInfoTextFocus(null);
                // sCustomerInfo.emailOnlyOption = !sCustomerInfo.emailOnlyOption;
                // if (sCustomerInfo.callOnlyOption && sCustomerInfo.emailOnlyOption)
                //   sCustomerInfo.callOnlyOption = false;
                if (obj.contactRestriction === "EMAIL") {
                  obj.contactRestriction = "";
                } else {
                  obj.contactRestriction = "EMAIL";
                }
                __setCustomerInfoObj(obj);
              }}
            />
            <View
              style={{ flexDirection: "row", justifyContent: "space-between" }}
            >
              {button1Text ? (
                <Button
                  onPress={handleButton1Press}
                  viewStyle={{
                    marginTop: 30,
                    marginLeft: 20,
                    backgroundColor: "lightgray",
                    height: 40,
                    width: 200,
                  }}
                  textStyle={{ color: "dimgray" }}
                  text={button1Text}
                />
              ) : null}
              {button2Text ? (
                <Button
                  onPress={handleButton2Press}
                  viewStyle={{
                    marginTop: 30,
                    marginLeft: 20,
                    backgroundColor: "lightgray",
                    height: 40,
                    width: 200,
                  }}
                  textStyle={{ color: "dimgray" }}
                  text={button2Text}
                />
              ) : null}
            </View>
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
  try {
    let comp = setComponent();
    return comp;
  } catch (e) {
    // log("Error setting component CustomerInfoScreenModal", e);
  }
};

export const LoginScreenModalComponent = ({ modalVisible }) => {
  // setters /////////////////////////////////////////////////////////////
  const _zSetCurrentUserObj = useLoginStore((state) => state.setCurrentUserObj);
  const _zSetShowLoginScreen = useLoginStore(
    (state) => state.setShowLoginScreen
  );

  // getters ////////////////////////////////////////////////////////////
  const zRunPostLoginCallback = useLoginStore(
    (state) => state.runPostLoginFunction
  );
  const zAdminPrivilege = useLoginStore((state) => state.getAdminPrivilege());
  let zSettingsObj = SETTINGS_OBJ;
  zSettingsObj = useSettingsStore((state) => state.getSettingsObj());
  /////////////////////////////////////////////////////////////////////
  const [sBackgroundColor, _setBackgroundColor] = useState("green");
  const [sInput, _setInput] = useState("");

  function checkUserInput(input) {
    _setInput(input);
    let userObj;
    userObj = zSettingsObj.users.find((user) => user.pin == input);
    if (!userObj)
      userObj = zSettingsObj.users.find((user) => user.alternatePin == input);

    let failedAccessCheck = true;
    if (zAdminPrivilege && userObj) {
      hasAccess = false;
      if (
        priviledgeLevel == PRIVILEDGE_LEVELS.owner &&
        userObj.permissions == PRIVILEDGE_LEVELS.owner
      ) {
      }
      failedAccessCheck = false;
      if (
        priviledgeLevel == PRIVILEDGE_LEVELS.admin &&
        (userObj.permissions == PRIVILEDGE_LEVELS.owner ||
          userObj.permissions == PRIVILEDGE_LEVELS.admin)
      )
        failedAccessCheck = false;
      if (
        priviledgeLevel == PRIVILEDGE_LEVELS.superUser &&
        (userObj.permissions == PRIVILEDGE_LEVELS.owner ||
          userObj.permissions == PRIVILEDGE_LEVELS.admin ||
          userObj.permissions == PRIVILEDGE_LEVELS.superUser)
      )
        failedAccessCheck = false;
    }

    if (!zAdminPrivilege) failedAccessCheck = false;

    // log("user", userObj);
    // log("check", failedAccessCheck.toString());
    if (userObj && zAdminPrivilege && failedAccessCheck) {
      _zSetCurrentUserObj(userObj);
      _setInput("");
      _setBackgroundColor("red");
      setTimeout(() => {
        _setInput("");
        _zSetShowLoginScreen(false);
      }, 500);
      userObj = null;
    }

    if (userObj && !failedAccessCheck) {
      _zSetCurrentUserObj(userObj);
      _zSetShowLoginScreen(false);
      _setInput("");
      zRunPostLoginCallback();
    }
  }

  return (
    <ScreenModal
      modalVisible={modalVisible}
      showOuterModal={true}
      outerModalStyle={{
        backgroundColor: "rgba(50,50,50,.5)",
      }}
      buttonVisible={false}
      Component={() => (
        <View
          style={{
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: sBackgroundColor,
            width: 500,
            height: 500,
          }}
        >
          <TextInput
            autoFocus={true}
            style={{ outlineWidth: 0, borderWidth: 1, width: 200, height: 40 }}
            value={sInput}
            onChangeText={(val) => checkUserInput(val)}
          />
        </View>
      )}
    />
  );
};

const checkoutScreenStyle = {
  base: {
    alignItems: "center",
    paddingTop: 20,
    width: 500,
    height: 380,
    backgroundColor: "white",
  },
  titleText: {
    fontSize: 30,
    color: "dimgray",
  },
  boxDollarSign: {
    fontSize: 15,
    // marginRight: 5,
  },
  totalText: {
    fontSize: 10,
    color: "darkgray",
  },
  boxText: {
    outlineWidth: 0,
    fontSize: 25,
    textAlign: "right",
    placeholderTextColor: "lightgray",
    // backgroundColor: "green",
    width: "90%",
  },
  buttonText: {
    fontSize: 13,
    fontWeight: Fonts.weight.textRegular,
  },
  boxStyle: {
    marginTop: 5,
    borderColor: Colors.tabMenuButton,
    borderWidth: 2,
    backgroundColor: "whitesmoke",
    padding: 5,
    width: 100,
    height: 50,
    alignItems: "space-between",
    justifyContent: "space-between",
    flexDirection: "row",
  },
  totalTextStyle: {
    marginTop: 15,
  },
  titleStyle: {
    marginTop: 20,
  },
  buttonRowStyle: {
    marginTop: 20,
  },
  statusText: {
    width: "80%",
    textAlign: "center",
    marginTop: 15,
    color: "green",
    fontSize: 15,
    fontWeight: 600,
  },
  loadingIndicatorStyle: {
    marginTop: 10,
  },
};

export const CashSaleModalComponent = ({
  totalAmount,
  onCancel,
  isRefund,
  splitPayment,
  onComplete,
  acceptsChecks,
  paymentsArr,
}) => {
  const [sTenderAmount, _setTenderAmount] = useState("");
  const [sRequestedAmount, _setRequestedAmount] = useState("");
  const [sSplitTotalPaidAlready, _setSplitTotalPaidAlready] = useState("");
  const [sAmountLeftToPay, _setAmountLeftToPay] = useState("");
  const [sStatusMessage, _setStatusMessage] = useState("");
  const [sProcessButtonLabel, _setProcessButtonLabel] = useState("");
  const [sIsCheck, _setIsCheck] = useState(false);
  const [sInputBoxFocus, _setInputBoxFocus] = useState(null);
  const [sPaymentAmountTextColor, _setPaymentAmountTextColor] = useState(null);
  const [sTenderAmountTextColor, _setTenderAmountTextColor] = useState(null);

  useEffect(() => {
    let totalPaid = 0.0;
    paymentsArr.forEach((paymentObj) => {
      totalPaid += paymentObj.amount;
    });

    _setSplitTotalPaidAlready(trimToTwoDecimals(totalPaid));
    _setAmountLeftToPay(trimToTwoDecimals(totalAmount - totalPaid));
  }, []);

  function handleTextChange(val, boxName) {
    // log("text change val", val);
    if (LETTERS.includes(val[val.length - 1])) return;
    let formattedVal = val != "." ? formatDecimal(val) : "";

    let tendAmount = Number(sTenderAmount);
    let reqAmount = Number(sRequestedAmount);
    if (boxName == "tender") {
      tendAmount = formattedVal;
    } else {
      reqAmount = formattedVal;
    }

    if (boxName == "tender") {
      tendAmount = formattedVal;
    } else {
      reqAmount = formattedVal;
    }
    let buttonLabel = "Process";
    let textColor = null;

    const minVal = 0.5;
    if (
      splitPayment &&
      (reqAmount < minVal ||
        reqAmount > totalAmount ||
        reqAmount > sAmountLeftToPay ||
        reqAmount > tendAmount)
    ) {
      buttonLabel = null;
      textColor = "red";
    }
    if (
      tendAmount < minVal ||
      (splitPayment && tendAmount < reqAmount) ||
      (!splitPayment && tendAmount < Number(totalAmount))
    ) {
      // log("ten", tendAmount < Number(totalAmount));
      // log("total", totalAmount);
      // log("diff", tendAmount - Number(totalAmount));
      buttonLabel = null;
      textColor = "red";
    }

    boxName == "tender"
      ? _setTenderAmount(formattedVal)
      : _setRequestedAmount(formattedVal);

    _setProcessButtonLabel(buttonLabel);
    _setPaymentAmountTextColor(textColor);
    // _setTenderAmountTextColor(tenderTextColor);
  }

  function handleProcessButtonPress() {
    onComplete({
      amountTendered: Number(sTenderAmount),
      amount: Number(sRequestedAmount || totalAmount),
      isCheck: sIsCheck,
    });
    onCancel();
  }

  function handleKeyPress(event) {
    // log("event", event.nativeEvent.key);
    if (event.nativeEvent.key == "Enter") {
      if (!splitPayment) {
        handleProcessButtonPress();
      } else {
        if (sTenderAmount >= sRequestedAmount) {
          handleProcessButtonPress();
        } else {
          _setInputBoxFocus("tender");
        }
      }
    }
  }
  return (
    <View
      style={{
        ...checkoutScreenStyle.base,
      }}
    >
      {acceptsChecks ? (
        <View style={{ width: "100%" }}>
          <CheckBox_
            textStyle={{ fontSize: 12 }}
            boxStyle={{ width: 14, height: 14 }}
            text={"Paper Check"}
            onCheck={() => _setIsCheck(!sIsCheck)}
            isChecked={sIsCheck}
            viewStyle={{ alignSelf: "flex-end", marginRight: 20 }}
          />
        </View>
      ) : null}
      <Text
        style={{
          ...checkoutScreenStyle.titleText,
        }}
      >
        Cash Sale
      </Text>

      <Text style={{ ...checkoutScreenStyle.totalTextStyle }}>
        {"Total: $ " + totalAmount}
      </Text>
      {splitPayment ? (
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{ alignItems: "flex-end", marginRight: 10 }}>
            <Text
              style={{
                marginTop: 10,
                fontSize: 14,
                color: "gray",
              }}
            >
              {"Amount paid:"}
            </Text>

            <Text
              style={{
                marginTop: 10,
                fontSize: 14,
                color: "gray",
              }}
            >
              {"Amount left:"}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text
              style={{
                marginTop: 10,
                fontSize: 14,
                color: "",
              }}
            >
              {"$" + sSplitTotalPaidAlready}
            </Text>
            <Text
              style={{
                marginTop: 10,
                fontSize: 14,
                color: "red",
              }}
            >
              {"$" + sAmountLeftToPay}
            </Text>
          </View>
        </View>
      ) : null}
      <View style={{ flexDirection: "row" }}>
        {splitPayment ? (
          <View
            style={{
              ...checkoutScreenStyle.boxStyle,
              paddingBottom: 6,
              paddingRight: 7,
              marginTop: 10,
            }}
          >
            <Text style={{ ...checkoutScreenStyle.boxDollarSign }}>$</Text>

            <View
              style={{
                width: "100%",
                height: "100%",
                // backgroundColor: "green",
                alignItems: "flex-end",
                paddingRight: 5,
              }}
            >
              <TextInput
                style={{
                  ...checkoutScreenStyle.boxText,
                  height: "70%",
                  // backgroundColor: "blue",
                  color: sPaymentAmountTextColor,
                }}
                placeholder="0.00"
                placeholderTextColor={
                  checkoutScreenStyle.boxText.placeholderTextColor
                }
                value={sRequestedAmount}
                onChangeText={(val) => handleTextChange(val)}
                autoFocus={true}
                onKeyPress={handleKeyPress}
              />
              <Text
                style={{
                  fontStyle: "italic",
                  color: "darkgray",
                  fontSize: 12,
                }}
              >
                Pay Amount
              </Text>
            </View>
          </View>
        ) : null}
        <View
          style={{
            marginLeft: 20,
            ...checkoutScreenStyle.boxStyle,
            paddingBottom: 6,
            paddingRight: 7,
            marginTop: 10,
          }}
        >
          <Text style={{ ...checkoutScreenStyle.boxDollarSign }}>$</Text>

          <View
            style={{
              width: "100%",
              height: "100%",
              // backgroundColor: "green",
              alignItems: "flex-end",
              paddingRight: 5,
            }}
          >
            <TextInput
              style={{
                ...checkoutScreenStyle.boxText,
                height: "70%",
                color: sPaymentAmountTextColor,
                // backgroundColor: "blue",
              }}
              placeholder="0.00"
              placeholderTextColor={
                checkoutScreenStyle.boxText.placeholderTextColor
              }
              value={sTenderAmount}
              onChangeText={(val) => handleTextChange(val, "tender")}
              autoFocus={sInputBoxFocus == "tender" || !splitPayment}
              onKeyPress={handleKeyPress}
              // onFocus={() => _zSetPaymentAmount("")}
            />
            <Text
              style={{
                fontStyle: "italic",
                color: "darkgray",
                fontSize: 12,
              }}
            >
              Tender
            </Text>
          </View>
        </View>
      </View>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-around",
          width: "100%",
          marginTop: checkoutScreenStyle.buttonRowStyle.marginTop,
        }}
      >
        <Button
          buttonStyle={{ backgroundColor: "green" }}
          textStyle={{ color: "white" }}
          visible={sProcessButtonLabel}
          onPress={handleProcessButtonPress}
          text={sProcessButtonLabel ? sProcessButtonLabel : ""}
        />
        <Button onPress={onCancel} text={"Cancel"} />
      </View>
      <Text
        style={{
          ...checkoutScreenStyle.statusText,
          color: "red",
        }}
      >
        {sStatusMessage}
      </Text>

      {/* <View style={{ ...checkoutScreenStyle.loadingIndicatorStyle }}>
        <LoadingIndicator visible={sStatus} />
      </View> */}
    </View>
  );
};

export const StripeCreditCardModalComponent = ({
  onCancel,
  isRefund,
  splitPayment,
  totalAmount,
  onComplete,
  paymentsArr,
}) => {
  // store setters
  const _zSetPaymentIntentID = useStripePaymentStore(
    (state) => state.setPaymentIntentID
  );
  const zResetStripeStore = useStripePaymentStore((state) => state.reset);

  // store getters
  const zReader = useStripePaymentStore((state) => state.getReader());
  const zReadersArr = useStripePaymentStore((state) => state.getReadersArr());
  const zPaymentIntentID = useStripePaymentStore((state) =>
    state.getPaymentIntentID()
  );

  /////////////////////////////////////////////////////////////////////////
  const [sStatus, _sSetStatus] = useState(false);
  const [sStatusMessage, _sSetStatusMessage] = useState(
    !splitPayment ? "Starting payment intent..." : "Reader ready"
  );
  const [sStatusTextColor, _sSetStatusTextColor] = useState("green");
  const [sListenerArr, _sSetListenerArr] = useState(null);
  const [sCardWasDeclined, _sSetCardWasDeclined] = useState(false);
  const [sReaderBusy, _sSetReaderBudy] = useState(false);
  const [sPaymentAmount, _setPaymentAmount] = useState(totalAmount);
  const [sSplitTotalPaidAlready, _setSplitTotalPaidAlready] = useState("");
  const [sAmountLeftToPay, _setAmountLeftToPay] = useState("");
  const [sProcessButtonLabel, _setProcessButtonLabel] = useState("");
  const [sTextColor, _setTextColor] = useState(null);
  const [sRunningReader, _setRunningReader] = useState(false);

  //////////////////////////////////////////////////////////////////

  // gather the previous payments made on a split payment
  useEffect(() => {
    if (!splitPayment) return;

    let totalPaid = 0.0;
    paymentsArr.forEach((paymentObj) => {
      totalPaid += paymentObj.amount;
    });

    log("running");
    _setSplitTotalPaidAlready(trimToTwoDecimals(totalPaid));
    _setAmountLeftToPay(trimToTwoDecimals(totalAmount - totalPaid));
  }, []);

  // automatically start card process if not split payment
  useEffect(() => {
    if (!splitPayment && !sRunningReader) {
      startServerDrivenStripePaymentIntent(totalAmount);
      _setRunningReader(true);
    }

    return () => {
      zResetStripeStore();
      if (sListenerArr) {
        sListenerArr.forEach((listener) => listener());
      }
    };
  }, []);

  function handleTextChange(val) {
    if (LETTERS.includes(val[val.length - 1])) return;
    let formattedVal = val != "." ? formatDecimal(val) : "";

    let num = Number(formattedVal);
    let amountLeftToPay = Number(sAmountLeftToPay);

    if (!splitPayment) amountLeftToPay = totalAmount;
    let buttonLabel = "";
    let textColor = "red";
    // log("amount", amountLeftToPay);
    // log("num", num);
    if (num <= amountLeftToPay && num >= 0.5) {
      buttonLabel = "Process";
      textColor = null;
    }

    _setProcessButtonLabel(buttonLabel);
    _setTextColor(textColor);
    _setPaymentAmount(formattedVal);
  }

  function handleKeyPress(event) {
    if (event.nativeEvent.key != "Enter") return;

    let amountLeftToPay = Number(sAmountLeftToPay);
    if (!splitPayment) amountLeftToPay = totalAmount;
    let paymentAmount = Number(sPaymentAmount);

    if (
      splitPayment &&
      paymentAmount >= 0.5 &&
      paymentAmount > amountLeftToPay &&
      paymentAmount <= totalAmount
    ) {
      startServerDrivenStripePaymentIntent(paymentAmount);
    } else if (!splitPayment) {
      startServerDrivenStripePaymentIntent(totalAmount);
    }
  }

  // todo
  function setCurrentReader(reader) {
    // log("cur", reader);
    if (reader?.id) _zSetReader(reader);
  }

  async function startServerDrivenStripePaymentIntent(paymentAmount) {
    log("payment amouint", paymentAmount);
    if (!(paymentAmount > 0)) return;
    _sSetStatus(true);
    _sSetStatusTextColor("red");
    _sSetStatusMessage("Retrieving card reader activation...");
    log("starting server driven payment attempt, amount", paymentAmount);
    // return;

    // readerResult obj contains readerResult object key/val and paymentIntentID key/val
    let paymentIntentID = zPaymentIntentID;
    let readerResult = await dbProcessServerDrivenStripePayment(
      paymentAmount,
      zReader.id,
      false,
      paymentIntentID
    );
    console.log("reader result", readerResult);

    if (readerResult == "in_progress") {
      handleStripeReaderActivationError(readerResult);
      _sSetReaderBudy(true);
    } else {
      _sSetReaderBudy(false);
      _sSetStatusTextColor("green");
      _sSetStatusMessage("Waiting for customer...");
      _zSetPaymentIntentID(readerResult.paymentIntentID);
      // log("pi id", readerResult.paymentIntentID);
      let listenerArr = await paymentIntentSubscribe(
        readerResult.paymentIntentID,
        handleStripeCardPaymentDBSubscriptionUpdate,
        readerResult.paymentIntentID
      );
      _sSetListenerArr(listenerArr);
    }
  }

  async function handleStripeReaderActivationError(error) {
    _sSetStatusTextColor("red");
    _sSetStatus(false);
    log("Handling Stripe reader activation error", error);
    let message = "";
    if (error == "in_progress") {
      message =
        "Card Reader in use. Please wait until screen clears, or use a different reader.\n\n If not in use, try resetting the card reader";
    } else {
      switch (error.code) {
        case "terminal_reader_timeout":
          message =
            "Could not connect to reader, possible network issue\n" +
            error.code;
          break;
        case "terminal_reader_offline":
          message =
            "Reader appears to be offline. Please check power and internet connection\n" +
            error.code;
          break;
        case "terminal_reader_busy":
          message = "Reader busy. Please try a different reader\n" + error.code;
          break;
        case "intent_invalid_state":
          message =
            "Invalid payment intent state. Please clear the reader and try again";
          break;
        default:
          message = "Unknown processing error: \n" + error.code;
      }
    }
    _sSetStatusMessage(message);
  }

  function handleStripeCardPaymentDBSubscriptionUpdate(
    type,
    key,
    val,
    zzPaymentIntentID
  ) {
    // log("Stripe webhook properties", type + " : " + key);
    clog("Stripe webhook update Obj", val);
    let failureCode = val?.failure_code;
    if (failureCode == "card_declined") {
      let paymentIntentID = val?.process_payment_intent?.payment_intent;
      log("CARD DECLINED");
      // log("payment intent id", paymentIntentID);
      // log("z payment intent id", zzPaymentIntentID);
      if (paymentIntentID == zzPaymentIntentID) {
        _sSetCardWasDeclined(true);
        _sSetStatusTextColor("red");
        _sSetStatusMessage("Card Declined");
        _sSetStatus(false);
      }
    } else if (key == "complete") {
      _sSetCardWasDeclined(false);
      _sSetStatusTextColor("green");
      _sSetStatusMessage("Payment Complete!");
      _sSetStatus(false);
      clog("Payment complete object", val);
      let paymentMethodDetails = val.payment_method_details.card_present;
      // log("trimming", trimToTwoDecimals(Number(val.amount_captured) / 100));
      // log("num", Number(val.amountCaptured));
      let paymentDetailsObj = {
        last4: paymentMethodDetails.last4,
        cardType: paymentMethodDetails.description,
        issuer: paymentMethodDetails.receipt.application_preferred_name,
        authorizationCode: paymentMethodDetails.receipt.authorization_code,
        paymentIntentID: val.payment_intent,
        chargeID: val.id,
        amount: trimToTwoDecimals(val.amount_captured / 100),
        paymentProcessor: "stripe",
        totalCaptured: trimToTwoDecimals(val.amount_captured / 100),
      };
      clog("Successful Payment details obj", paymentDetailsObj);
      onComplete(paymentDetailsObj);
      setTimeout(() => {
        onCancel();
      }, 1500);
    }
  }

  async function cancelServerDrivenStripePaymentIntent() {
    _sSetStatusTextColor("red");
    _sSetStatusMessage("Canceling payment request...");
    log("canceling server driven payment attempt", zReader);
    if (!zPaymentIntentID) {
      onCancel();
      return;
    }
    let readerResult = await dbCancelServerDrivenStripePayment(
      zReader?.id,
      zPaymentIntentID
    );

    onCancel();
  }

  async function resetCardReader() {
    let readerResult = await dbCancelServerDrivenStripePayment(
      zReader?.id,
      zPaymentIntentID
    );
    onCancel();
  }

  async function clearReader() {
    let readerResult = await dbCancelServerDrivenStripePayment(
      zReader?.id,
      zPaymentIntentID
    );

    onCancel();
  }

  return (
    <View
      style={{
        ...checkoutScreenStyle.base,
      }}
    >
      <Text
        style={{
          ...checkoutScreenStyle.titleText,
        }}
      >
        Credit Card Sale
      </Text>
      <Text style={{ ...checkoutScreenStyle.totalTextStyle }}>
        {"Total: $ " + totalAmount}
      </Text>
      {splitPayment ? (
        <View style={{ alignItems: "center" }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={{ alignItems: "flex-end", marginRight: 10 }}>
              <Text
                style={{
                  marginTop: 10,
                  fontSize: 14,
                  color: "gray",
                }}
              >
                {"Amount paid:"}
              </Text>

              <Text
                style={{
                  marginTop: 10,
                  fontSize: 14,
                  color: "gray",
                }}
              >
                {"Amount left:"}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text
                style={{
                  marginTop: 10,
                  fontSize: 14,
                  color: "gray",
                }}
              >
                {"$" + sSplitTotalPaidAlready}
              </Text>
              <Text
                style={{
                  marginTop: 10,
                  fontSize: 14,
                  color: "red",
                  fontWeight: "500",
                }}
              >
                {"$" + sAmountLeftToPay}
              </Text>
            </View>
          </View>
          <View
            style={{
              ...checkoutScreenStyle.boxStyle,
            }}
          >
            <Text style={{ ...checkoutScreenStyle.boxDollarSign }}>$</Text>
            <TextInput
              style={{
                ...checkoutScreenStyle.boxText,
                color: sTextColor,
              }}
              placeholder="0.00"
              placeholderTextColor={
                checkoutScreenStyle.boxText.placeholderTextColor
              }
              value={sPaymentAmount}
              onChangeText={handleTextChange}
              autoFocus={true}
              onKeyPress={handleKeyPress}
            />
          </View>
        </View>
      ) : null}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-around",
          width: "100%",
          marginTop: checkoutScreenStyle.buttonRowStyle.marginTop,
        }}
      >
        {splitPayment ? (
          <Button
            onPress={() => startServerDrivenStripePaymentIntent(sPaymentAmount)}
            text={isRefund ? "Process Refund" : "Process Amount"}
            textStyle={{ color: "white" }}
            buttonStyle={{ backgroundColor: "green" }}
            visible={sProcessButtonLabel}
          />
        ) : null}
        <Button
          onPress={cancelServerDrivenStripePaymentIntent}
          text={"Cancel"}
        />
      </View>
      <Text
        style={{
          // fontFamily: "Inter",
          ...checkoutScreenStyle.statusText,
          color: sStatusTextColor,
        }}
      >
        {sStatusMessage}
      </Text>

      <View style={{ ...checkoutScreenStyle.loadingIndicatorStyle }}>
        <LoadingIndicator visible={sStatus} />
      </View>
      <View style={{ width: "100%", alignItems: "flex-end", marginRight: 5 }}>
        <Button
          text={"Reset Reader"}
          textStyle={{ fontSize: 12 }}
          buttonStyle={{
            backgroundColor: "lightgray",
            height: null,
            width: null,
            padding: 5,
            marginRight: 15,
            marginTop: 20,
          }}
          onPress={resetCardReader}
        />
      </View>
    </View>
  );
};

export const Button = ({
  visible = true,
  ref,
  onPress,
  onLongPress,
  numLines = 1,
  text,
  enableMouseOver = true,
  TextComponent,
  mouseOverOptions = {
    opacity: 1,
    highlightColor: Colors.tabMenuButton,
    textColor: "white",
  },
  shadow = true,
  allCaps = false,
  buttonStyle = {},
  textStyle = {},
  viewStyle = {},
}) => {
  const [sMouseOver, _setMouseOver] = React.useState(false);
  if (allCaps) text = text.toUpperCase();
  let shadowStyle = SHADOW_RADIUS_PROTO;
  if (!shadow) shadowStyle = SHADOW_RADIUS_NOTHING;
  /////////////////////////////////////////////////////
  //////////////////////////////////////////////////////
  const HEIGHT = null;
  const WIDTH = null;

  if (!visible) {
    return <View style={{ width: WIDTH, height: HEIGHT }}></View>;
  }

  function handleButtonPress() {
    if (visible) {
      _setMouseOver(false);
      onPress();
    }
  }

  function getBackgroundColor() {
    if (sMouseOver) {
      return mouseOverOptions.highlightColor;
    } else {
      if (buttonStyle.backgroundColor) return buttonStyle.backgroundColor;
      return Colors.tabMenuButton;
    }
  }

  return (
    <TouchableOpacity
      style={{ ...viewStyle }}
      ref={ref}
      onMouseOver={() => (enableMouseOver ? _setMouseOver(true) : null)}
      onMouseLeave={() => {
        _setMouseOver(false);
      }}
      // on={() => log("here")}
      onPress={handleButtonPress}
      onLongPress={visible ? onLongPress : () => {}}
    >
      <LinearGradient
        style={{
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 12,
          paddingVertical: 5,
          ...shadowStyle,
          ...buttonStyle,
          backgroundColor: getBackgroundColor(),
          // opacity: 0.1
          // opacity:
        }}
      >
        {TextComponent ? (
          <TextComponent />
        ) : (
          <Text
            numberOfLines={numLines}
            style={{
              textAlign: "center",
              textAlignVertical: "center",
              fontSize: 17,
              ...textStyle,
              color: sMouseOver ? "black" : textStyle.color || "white",
            }}
          >
            {text || "Button"}
          </Text>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
};

export const TabMenuButton = ({
  onPress,
  text,
  textColor,
  buttonStyle,
  textStyle,
  isSelected,
  onLongPress,
  height,
}) => {
  return (
    <Button_
      // mouseOverOptions={{ opacity: 0.7, backgroundColor: "gray" }}
      onLongPress={onLongPress}
      onPress={onPress}
      text={text}
      textStyle={{
        // textColor: Colors.tabMenuButtonText,
        color: APP_BASE_COLORS.textWhite,
        fontSize: 15,
        ...textStyle,
      }}
      colorGradientArr={COLOR_GRADIENTS.blue}
      buttonStyle={{
        height,
        // backgroundColor: ,
        opacity: isSelected ? 1 : 0.5,
        paddingHorizontal: 15,
        width: null,
        paddingVertical: 5,
        ...SHADOW_RADIUS_NOTHING,
        borderRadius: 0,
        ...buttonStyle,
      }}
    />
  );
};

export const LoadingIndicator = ({
  width = 100,
  height = 100,
  type = "bicycle",
  visible = false,
}) => {
  if (!visible) return <View style={{ width, height }} />;
  if (type == "bicycle") return BicycleSpinner({ width, height });
};

const BicycleSpinner = ({ width = 100, height = 100 }) => {
  const spinValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(spinValue, {
        toValue: 1,
        duration: 1000,
        easing: Easing.linear,
      })
    ).start();
  }, []);

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <View style={{}}>
      {/* Assuming you have a local image of a bicycle wheel */}
      <Animated.Image
        style={{
          resizeMode: "contain",
          width,
          height,
          transform: [{ rotate: spin }],
        }}
        // source={require("./assets/")}
      />
    </View>
  );
};

export const CheckBox_ = ({
  text,
  onCheck,
  item,
  iconSize = 25,
  // makeEntireViewCheckable = true,
  // roundButton = false,
  isChecked,
  buttonStyle = {},
  textStyle = {},
  viewStyle = {},

  boxStyle = {},
}) => {
  return (
    <Button_
      icon={isChecked ? ICONS.checkbox : ICONS.checkoxEmpty}
      iconSize={15}
      text={text}
      buttonStyle={buttonStyle}
      textStyle={textStyle}
      onPress={onCheck}
      enableMouseOver={false}
    />
  );
};

export const ColorSelectorModalComponent = ({ onSelect }) => {
  return (
    <View
      style={{
        width: 200,
        height: "90%",
        // alignSelf: "center",
        // justifySelf: "center",
        backgroundColor: "green",
      }}
    ></View>
  );
};

export const GradientView = ({
  gradientProfile = COLOR_GRADIENT_PROFILES.standard,
  colorArr = COLOR_GRADIENTS.blue,
  children,
  style,
  props,
}) => {
  return (
    <LinearGradient
      colors={[...colorArr]}
      start={gradientProfile.start}
      end={gradientProfile.end}
      style={{ justifyContent: "center", alignItems: "center", ...style }}
      {...props}
    >
      {children}
    </LinearGradient>
  );
};

export const Image_ = ({
  size,
  style = {},
  resizeMode = "contain",
  icon = "",
}) => {
  if (size) {
    style.width = size;
    style.height = size;
  } else if (!style.width || !style.height) {
    style.width ? null : (style.width = 30);
    style.height ? null : (style.height = 30);
  }
  return <Image source={icon} style={{ ...style }} />;
};

export const Button_ = ({
  handleMouseOver = () => {},
  handleMouseExit = () => {},
  visible = true,
  icon = null,
  ref,
  iconSize = 25,
  onPress,
  onLongPress,
  numLines = 1,
  text,
  enableMouseOver = true,
  TextComponent,
  mouseOverOptions = {
    opacity: 0.6,
    highlightColor: "lightgray",
    textColor: "white",
  },
  shadow = false,
  allCaps = false,
  colorGradientArr = [],
  gradientViewProps = {},
  buttonStyle = {},
  textStyle = {},
  iconStyle = {},
  viewStyle = {},
  enabled = true,
  autoFocus,
}) => {
  const [sMouseOver, _setMouseOver] = React.useState(false);
  if (allCaps) text = text.toUpperCase();
  let shadowStyle = SHADOW_RADIUS_PROTO;
  if (!shadow) shadowStyle = SHADOW_RADIUS_NOTHING;
  /////////////////////////////////////////////////////
  //////////////////////////////////////////////////////
  const HEIGHT = buttonStyle.height;
  const WIDTH = buttonStyle.width;

  if (!visible) {
    return (
      <View
        style={{ width: WIDTH, height: HEIGHT, backgroundColor: "transparent" }}
      ></View>
    );
  }

  function handleButtonPress() {
    if (visible) {
      _setMouseOver(false);
      onPress();
    }
  }

  function getBackgroundColor() {
    if (sMouseOver && enabled) {
      return mouseOverOptions.highlightColor;
    } else {
      if (buttonStyle.backgroundColor) return buttonStyle.backgroundColor;
      return APP_BASE_COLORS.buttonLightGreen;
    }
  }

  function getOpacity() {
    if (sMouseOver && enabled) {
      return mouseOverOptions.opacity;
    } else {
      // log(text, buttonStyle.opacity);
      if (buttonStyle.opacity) return buttonStyle.opacity;
      return 1;
    }
  }

  return (
    <TouchableOpacity
      style={{ ...viewStyle }}
      ref={ref}
      onMouseOver={() => {
        handleMouseOver();
        enableMouseOver ? _setMouseOver(true) : null;
      }}
      onMouseLeave={() => {
        handleMouseExit();
        _setMouseOver(false);
      }}
      // on={() => log("here")}
      onPress={handleButtonPress}
      onLongPress={visible ? onLongPress : () => {}}
    >
      <GradientView
        colorArr={enabled ? colorGradientArr : []}
        style={{
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          paddingHorizontal: 5,
          borderRadius: 15,
          paddingVertical: 5,
          paddingHorizontal: 20,
          ...shadowStyle,
          ...buttonStyle,
          backgroundColor: icon && !text ? null : getBackgroundColor(),
          opacity: enabled ? null : 0.3,
        }}
        {...gradientViewProps}
      >
        {icon ? (
          <Image_
            icon={icon}
            size={iconSize}
            style={{
              marginRight: text ? 10 : 0,
              ...iconStyle,
              opacity: sMouseOver
                ? mouseOverOptions.opacity
                : buttonStyle.opacity,
            }}
          />
        ) : null}
        {/* {text ? <Text style={{ ...textStyle }}>{text}</Text> : null} */}
        {TextComponent ? (
          <TextComponent />
        ) : (
          <Text
            numberOfLines={numLines}
            style={{
              textAlign: "center",
              textAlignVertical: "center",
              fontSize: 17,
              color: APP_BASE_COLORS.textMain,
              ...textStyle,
            }}
          >
            {text}
          </Text>
        )}
      </GradientView>
    </TouchableOpacity>
  );
};

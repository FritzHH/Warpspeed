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
  ActivityIndicator,
  ScrollView,
} from "react-native-web";
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import { Image } from "react-native-web";
import { gray, ifNumIsOdd, lightenRGBByPercent, log } from "./utils";
import { C, COLOR_GRADIENTS, Colors, Fonts, ICONS } from "./styles";
import { SETTINGS_OBJ, PRIVILEDGE_LEVELS } from "./data";
import { cloneDeep } from "lodash";
import { DEBOUNCE_DELAY } from "./constants";
import {
  useInventoryStore,
  useInvModalStore,
  useSettingsStore,
  useLoginStore,
  useAlertScreenStore,
} from "./stores";
import LinearGradient from "react-native-web-linear-gradient";
// import DateTimePicker from "@react-native-community/datetimepicker";
import CalendarPicker, { useDefaultStyles } from "react-native-ui-datepicker";
import { PanResponder } from "react-native";

import { StyleSheet } from "react-native";
import { Animated } from "react-native";
import { dbDeleteInventoryItem, dbSaveInventoryItem } from "./db_calls_wrapper";

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
  shadowColor: C.green,
  shadowOffset: { width: 2, height: 2 },
  shadowOpacity: 0.25,
  shadowRadius: 15,
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

export const AlertBox_ = ({ showAlert, pauseOnBaseScreen }) => {
  // store setters /////////////////////////////////////////////////////////////
  const _zResetAll = useAlertScreenStore((state) => state.resetAll);

  // store getters //////////////////////////////////////////////////////////////
  const zCanExitOnOuterClick = useAlertScreenStore((state) =>
    state.getCanExitOnOuterClick()
  );
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
  let zUseCancelButton = useAlertScreenStore((state) => state.useCancelButton);

  // Animation state ///////////////////////////////////////////////////////////
  const [sAnimation, _setAnimation] = useState("fade");

  //////////////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////////////

  function handleButton1Press() {
    zButton1Handler();
    useAlertScreenStore.getState().setShowAlert(false);
    setTimeout(() => {
      _zResetAll();
    }, 100);
  }

  function handleButton2Press() {
    zButton2Handler();
    useAlertScreenStore.getState().setShowAlert(false);
    setTimeout(() => {
      _zResetAll();
    }, 100);
  }

  function handleButton3Press() {
    zButton3Handler();
    useAlertScreenStore.getState().setShowAlert(false);
    setTimeout(() => {
      _zResetAll();
    }, 100);
  }

  // Animation control //////////////////////////////////////////////////////////
  useEffect(() => {
    if (showAlert) {
      _setAnimation("fade"); // Fade in when opening
    } else {
      _setAnimation("slide"); // Slide out when closing
    }
  }, [showAlert]);

  if ((!zButton2Handler && !zButton3Handler) || zUseCancelButton)
    zUseCancelButton = true;

  // log(zButton1Text, zButton2Text);
  return (
    <TouchableWithoutFeedback
      onPress={() => (zCanExitOnOuterClick ? _zResetAll() : null)}
    >
      <Modal animationType={sAnimation} visible={showAlert} transparent>
        <View
          style={{
            // backgroundColor: "rgba(0, 0, 0, 0.8)",
            // back
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
              justifyContent: "center",
              alignItems: "center",
              minWidth: "40%",
              minHeight: "40%",
              backgroundColor: "rgba(0, 0, 0, 0.4)",
              borderRadius: 15,
            }}
          >
            <View
              style={{
                backgroundColor: C.backgroundWhite,
                borderRadius: 15,
                alignItems: "center",
                justifyContent: "space-around",
                minWidth: "80%",
                minHeight: "60%",
                ...zAlertBoxStyle,
              }}
            >
              <View>
                {!!zTitle && (
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
                )}

                {!!zMessage && (
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
                )}
                {!!zSubMessage && (
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
                )}
              </View>
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
                  textStyle={{ color: C.textWhite }}
                  onPress={handleButton1Press}
                  iconSize={zIcon1Size || 60}
                  icon={zButton1Icon || (zButton1Text ? null : ICONS.check1)}
                />
                {!!zButton2Handler && (
                  <Button_
                    colorGradientArr={zButton2Text ? COLOR_GRADIENTS.blue : []}
                    text={zButton2Text}
                    buttonStyle={{ marginRight: 20 }}
                    textStyle={zButton2Text ? { color: C.textWhite } : {}}
                    onPress={handleButton2Press}
                    iconSize={zIcon2Size || 60}
                    icon={zButton2Icon || (zButton2Text ? null : ICONS.close1)}
                  />
                )}
                {!!zButton3Handler && (
                  <Button_
                    colorGradientArr={
                      zButton3Text ? COLOR_GRADIENTS.purple : []
                    }
                    text={zButton3Text}
                    buttonStyle={zButton3Text ? {} : {}}
                    textStyle={zButton3Text ? { color: C.textWhite } : {}}
                    onPress={handleButton3Press}
                    iconSize={zIcon3Size || 60}
                    icon={zButton3Icon || (zButton3Text ? null : ICONS.close1)}
                  />
                )}
              </View>
              <View style={{ width: "100%", justifyContent: "flex-end" }}>
                {zUseCancelButton && (
                  <Button_
                    textStyle={{ color: gray(0.4) }}
                    buttonStyle={{
                      backgroundColor: gray(0.09),
                      borderRadius: 0,
                      borderBottomRightRadius: 15,
                      borderBottomLeftRadius: 15,
                    }}
                    text={"CANCEL"}
                    onPress={() => {
                      useAlertScreenStore.getState().setShowAlert(false);
                      setTimeout(() => {
                        _zResetAll();
                      }, 100);
                    }}
                  />
                )}
              </View>
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
              borderColor: C.lightred,
              borderWidth: 2,
              borderRadius: 100,
            }, // Add a border to today's date
            selected: {
              borderRadius: 100,
              backgroundColor: C.blue,
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
  buttonLabel = "Modal Btn",
  buttonVisible = true,
  showOuterModal = false,
  buttonIconSize,
  showShadow = true,
  buttonStyle = {},
  buttonTextStyle = {},
  Component,
  ButtonComponent,
  outerModalStyle = {},
  modalVisible = false,
  setModalVisibility = () => {},
  shadowStyle = { ...SHADOW_RADIUS_NOTHING },
  buttonIcon,
  buttonIconStyle = {},
  handleModalActionInternally = false,
  handleOuterClick = () => {},
}) => {
  const [sModalCoordinates, _setModalCoordinates] = useState({ x: 0, y: 0 });
  const [sInternalModalShow, _setInternalModalShow] = useState(false);
  const [sAnimation, _setAnimation] = useState("fade");

  //////////////////////////////////////////////////////////////
  useEffect(() => {
    const isVisible = handleModalActionInternally
      ? sInternalModalShow
      : modalVisible;
    if (isVisible) {
      _setAnimation("fade"); // Fade in when opening
    } else {
      _setAnimation("slide"); // Slide out when closing
    }
  }, [modalVisible, sInternalModalShow]);

  useEffect(() => {
    // _zSetModalVisible(true);
    // return () => {
    //   _zSetModalVisible(false);
    // };
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
  let animation = "fade";
  return (
    <TouchableWithoutFeedback
      ref={ref}
      onPress={() => {
        _setInternalModalShow(false);
        handleOuterClick();
      }}
    >
      <View style={{}}>
        {buttonVisible && ButtonComponent && <ButtonComponent />}
        {buttonVisible && !ButtonComponent && (
          <Button_
            enabled={enabled}
            handleMouseExit={handleMouseExit}
            handleMouseOver={handleMouseOver}
            icon={buttonIcon}
            iconSize={buttonIconSize}
            text={buttonLabel}
            onPress={() => {
              handleButtonPress();
              setModalVisibility(false);
              _setInternalModalShow(!sInternalModalShow);
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
        )}

        <Modal
          animationType={sAnimation}
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
  buttonStyle,
  menuButtonStyle = { borderRadius: 5 },
  buttonTextStyle = {},
  buttonText,
  modalCoordX = -15,
  modalCoordY = 25,
  mouseOverOptions = {
    enable: true,
    opacity: 0.6,
  },
  showButtonShadow,
  shadowStyle = {},
  itemSeparatorStyle = {},
  menuBorderColor,
  selectedIdx = 0,
  useSelectedAsButtonTitle = false,
}) => {
  const [sModalVisible, _setModalVisible] = useState(false);
  const ref = useRef();

  const BUTTON_STYLE = {
    // width: "100%",
    backgroundColor: C.buttonLightGreen,
    borderColor: C.buttonLightGreenOutline,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    paddingVertical: 2,
    borderRadius: 5,
  };

  if (buttonStyle) {
    buttonStyle = { ...BUTTON_STYLE, ...buttonStyle };
  } else {
    buttonStyle = BUTTON_STYLE;
  }

  const TEXT_STYLE = {
    fontSize: 13,
    color: gray(0.55),
    fontWeight: 500,
  };

  if (buttonTextStyle) {
    buttonTextStyle = { ...TEXT_STYLE, ...buttonTextStyle };
  } else {
    buttonTextStyle = TEXT_STYLE;
  }

  if (!buttonIcon) buttonIcon = ICONS.menu2;
  if (!buttonIconSize) buttonIconSize = 11;

  function getBackgroundColor(rgbString = "", index) {
    // log(rgbString);
    if (!rgbString) return null;
    if (ifNumIsOdd(index) || !rgbString.includes("rgb")) {
      return rgbString;
    }
    return lightenRGBByPercent(rgbString, 40);
  }

  if (useSelectedAsButtonTitle) {
    buttonText = dataArr[Number(selectedIdx)]?.label;
  }

  const modalCoordinateVars = {
    x: modalCoordX,
    y: modalCoordY,
  };

  const DropdownComponent = () => {
    return (
      <View
        style={{
          borderColor: menuBorderColor || C.buttonLightGreenOutline,
          borderRadius: menuButtonStyle.borderRadius,
          borderWidth: 2,
          borderColor: gray(0.08),
          backgroundColor: "white",
        }}
      >
        <FlatList
          data={dataArr}
          ItemSeparatorComponent={() => (
            <View
              style={{
                width: "100%",
                ...itemSeparatorStyle,
              }}
            />
          )}
          renderItem={(item) => {
            let idx = item.index;
            item = item.item;
            return (
              <Button_
                mouseOverOptions={mouseOverOptions}
                buttonStyle={{
                  padding: 10,
                  height: 40,
                  // width: 130,
                  borderRadius: 0,
                  backgroundColor:
                    getBackgroundColor(item.backgroundColor, idx) ||
                    getBackgroundColor(gray(0.036), idx),
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
                  color: item.textColor || C.text,
                }}
                text={item.label || item}
                onPress={(e) => {
                  e?.stopPropagation?.();
                  _setModalVisible(false);
                  onSelect(item, idx);
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
      // handleModalActionInternally={true}
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
  const _zSetSettings = useSettingsStore((state) => state.setSettings);
  const _zSetLoginFunctionCallback = useLoginStore(
    (state) => state.setLoginFunctionCallback
  );
  const _zSetShowLoginScreen = useLoginStore(
    (state) => state.setShowLoginScreen
  );
  const _zExecute = useLoginStore((state) => state.execute);
  // const _zSetModalVisible = useLoginStore((state) => state.setModalVisible);

  // store getters ///////////////////////////////////////////////////////
  const zSettingsObj = useSettingsStore((state) => state.getSettings());
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
    dbSaveInventoryItem(item);
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
    _zSetSettings(newSettingsObj);
    // dbSaveSettings(newSettingsObj);
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
    _zSetSettings(settingsObj);
    // dbSaveSettings(settingsObj);
  }

  function handleNewItemPress() {
    log("new item", sItem);
    return;
  }

  function handleRemoveItem() {
    _zExecute(() => {
      _zModInventoryItem(sItem, "remove");
      dbDeleteInventoryItem(sItem.id);
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
          <LoginModalScreen modalVisible={zShowLoginScreen} />
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

export const LoginModalScreen = ({ modalVisible }) => {
  // setters /////////////////////////////////////////////////////////////
  const _zSetShowLoginScreen = useLoginStore(
    (state) => state.setShowLoginScreen
  );

  // getters ////////////////////////////////////////////////////////////
  const zRunPostLoginCallback = useLoginStore(
    (state) => state.runPostLoginFunction
  );
  const zAdminPrivilege = useLoginStore((state) => state.getAdminPrivilege());
  let zSettingsObj = SETTINGS_OBJ;
  zSettingsObj = useSettingsStore((state) => state.getSettings());
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
      useLoginStore.getState().setCurrentUser(userObj);
      _setInput("");
      _setBackgroundColor("red");
      setTimeout(() => {
        _setInput("");
        _zSetShowLoginScreen(false);
      }, 500);
      userObj = null;
    }

    if (userObj && !failedAccessCheck) {
      useLoginStore.getState().setCurrentUser(userObj);
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

export const SaleModalComponent = ({}) => {};

// Loading Indicator Components
export const LoadingIndicator = ({
  size = "medium",
  color = "#007bff",
  text = "",
  textStyle = {},
  containerStyle = {},
  centered = true,
  message = "Loading...",
  ...props
}) => {
  // Convert size to appropriate value
  const getSizeValue = () => {
    switch (size) {
      case "small":
        return 20;
      case "medium":
        return 40;
      case "large":
        return 60;
      default:
        return typeof size === "number" ? size : 40;
    }
  };

  const sizeValue = getSizeValue();

  const defaultContainerStyle = {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    ...(centered && {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(255, 255, 255, 0.8)",
      zIndex: 1000,
    }),
    ...containerStyle,
  };

  const defaultTextStyle = {
    marginTop: 10,
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    ...textStyle,
  };

  return (
    <View style={defaultContainerStyle} {...props}>
      <ActivityIndicator size={sizeValue} color={color} />
      {(text || message) && (
        <Text style={defaultTextStyle}>{text || message}</Text>
      )}
    </View>
  );
};

export const InlineLoadingIndicator = (props) => (
  <LoadingIndicator centered={false} {...props} />
);

export const FullScreenLoadingIndicator = (props) => (
  <LoadingIndicator centered={true} {...props} />
);

export const SmallLoadingIndicator = (props) => (
  <LoadingIndicator size="small" centered={false} {...props} />
);

export const LargeLoadingIndicator = (props) => (
  <LoadingIndicator size="large" {...props} />
);

export const PhoneNumberInput = ({
  width,
  height,
  value = "",
  onChangeText,
  placeholder = "",
  style = {},
  boxStyle = {},
  filledBoxStyle = {},
  placeholderBoxStyle = {},
  cursorBoxStyle = {},
  placeholderTextColor = "#999",
  cursorTextColor = "#fff",
  showDashes = true,
  dashStyle = {},
  dashColor = "#666",
  dashSize = 16,
  maxLength = 10,
  autoFocus = false,
  editable = true,
  handleEnterPress = () => {},
  highlightOnClick = true,
  onFocus,
  onBlur,
  fontSize,
  textColor = gray(0.55),
  ...props
}) => {
  const [cursorPosition, setCursorPosition] = React.useState(0);
  const [isFocused, setIsFocused] = React.useState(false);
  const textInputRef = React.useRef(null);

  // Ensure we only have digits and limit to maxLength
  const digits = value.replace(/\D/g, "").slice(0, maxLength);

  // Helper function to render a dash
  const renderDash = (key) => (
    <Text
      key={key}
      style={[
        {
          fontSize: dashSize,
          color: dashColor,
          fontWeight: "bold",
          marginHorizontal: 8,
          alignSelf: "center",
        },
        dashStyle,
      ]}
    >
      -
    </Text>
  );

  // Create array of 10 boxes with dashes
  const renderBoxes = () => {
    const elements = [];

    for (let i = 0; i < 10; i++) {
      // Add box
      const digit = digits[i] || "";
      const isEmpty = !digit;
      const isCursorPosition = isFocused && cursorPosition === i;

      // Debug logging
      // if (i === 0) {
      //   console.log("Box rendering debug:", {
      //     isFocused,
      //     cursorPosition,
      //     digits: digits,
      //     digitsLength: digits.length,
      //   });
      // }

      // Additional debug for cursor position
      // if (isCursorPosition) {
      //   console.log(`Box ${i} is cursor position!`, {
      //     isFocused,
      //     cursorPosition,
      //     i,
      //     digit,
      //   });
      // }

      elements.push(
        <View
          key={`box-${i}`}
          style={[
            {
              // width: 30,
              width: width || 30,
              height: height || 40,
              borderWidth: 2,
              borderColor: isCursorPosition
                ? C.cursorRed
                : isEmpty
                ? "#ddd"
                : "#007bff",
              borderRadius: 8,
              marginHorizontal: 2,
              justifyContent: "center",
              alignItems: "center",
              backgroundColor: isCursorPosition
                ? C.cursorRed
                : isEmpty
                ? "#f8f9fa"
                : "#fff",
              boxShadow: isCursorPosition
                ? "0 0 10px rgba(255, 107, 107, 0.5)"
                : "none",
            },
            boxStyle,
            isCursorPosition
              ? cursorBoxStyle
              : isEmpty
              ? placeholderBoxStyle
              : filledBoxStyle,
          ]}
        >
          <Text
            style={{
              fontSize: 18,
              fontWeight: "600",
              color: isCursorPosition
                ? cursorTextColor
                : isEmpty
                ? placeholderTextColor
                : textColor,
            }}
          >
            {digit}
          </Text>
        </View>
      );

      // Add dash after 3rd box (index 2) and 6th box (index 5)
      if (showDashes && (i === 2 || i === 5)) {
        elements.push(renderDash(`dash-${i}`));
      }
    }

    return elements;
  };

  const handleTextChange = (text) => {
    // Only allow digits and limit to maxLength
    const cleanText = text.replace(/\D/g, "").slice(0, maxLength);

    // Update cursor position to the end of the text
    setCursorPosition(cleanText.length);

    if (onChangeText) {
      onChangeText(cleanText);
    }
  };

  const handleSelectionChange = (event) => {
    const { start } = event.nativeEvent.selection;
    setCursorPosition(Math.min(start, digits.length));
  };

  const handleFocus = () => {
    setIsFocused(true);
    // Set cursor to the end of current text or 0 if empty
    setCursorPosition(digits.length);
    if (onFocus) {
      onFocus();
    }
  };

  const handleClick = (e) => {
    // When user clicks, highlight the last box to show cursor position
    console.log(
      "PhoneNumberInput clicked, highlightOnClick:",
      highlightOnClick
    );
    if (highlightOnClick) {
      e.preventDefault();
      setIsFocused(true);
      // Set cursor to the end of current text (last filled box or first empty box)
      const newCursorPosition = Math.min(digits.length, 9);
      setCursorPosition(newCursorPosition);
      console.log(
        "Setting cursor position to:",
        newCursorPosition,
        "digits.length:",
        digits.length
      );
      // Focus the hidden TextInput
      if (textInputRef.current) {
        textInputRef.current.focus();
      }
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    setCursorPosition(0);
    if (onBlur) {
      onBlur();
    }
  };

  const handleKeyPress = (e) => {
    // Allow backspace, delete, arrow keys, and digits
    const allowedKeys = [
      "Backspace",
      "Delete",
      "ArrowLeft",
      "ArrowRight",
      // "ArrowUp",
      // "ArrowDown",
      // "Tab",
      "Enter",
    ];

    if (e.key === "Enter") {
      handleEnterPress();
      return;
    }

    if (allowedKeys.includes(e.key) || /^\d$/.test(e.key)) {
      return; // Allow the key
    }

    e.preventDefault(); // Block other keys
  };

  return (
    <Pressable
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          // position: "relative",
          width: "100%",
          // backgroundColor: "blue",
        },
        style,
      ]}
      onPress={handleClick}
    >
      {renderBoxes()}
      <TextInput
        ref={textInputRef}
        value={digits}
        onChangeText={handleTextChange}
        onSelectionChange={handleSelectionChange}
        onKeyPress={handleKeyPress}
        placeholder={placeholder}
        autoFocus={autoFocus}
        editable={editable}
        onFocus={handleFocus}
        onBlur={handleBlur}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          opacity: 0,
          backgroundColor: "transparent",
          color: "transparent",
          borderWidth: 0,
          outline: "none",
        }}
        keyboardType="numeric"
        maxLength={maxLength}
        {...props}
      />
    </Pressable>
  );
};

export const TouchableOpacity_ = ({
  children,
  onPress,
  style = {},
  hoverStyle = {},
  activeOpacity = 0.6,
  hoverOpacity = 0.7,
  disabled = false,
  disabledStyle = {},
  ...props
}) => {
  const [isPressed, setIsPressed] = React.useState(false);
  const [isHovered, setIsHovered] = React.useState(false);

  const handlePressIn = () => {
    if (!disabled) {
      setIsPressed(true);
    }
  };

  const handlePressOut = () => {
    setIsPressed(false);
  };

  const handleMouseEnter = () => {
    if (!disabled) {
      setIsHovered(true);
    }
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  const handlePress = () => {
    if (!disabled && onPress) {
      onPress();
    }
  };

  const getOpacity = () => {
    if (disabled) return 0.3;
    if (isPressed) return Math.min(activeOpacity, 0.6); // Darker (lower opacity)
    if (isHovered) return hoverOpacity; // Lighter (higher opacity)
    return 1;
  };

  const combinedStyle = [
    {
      opacity: getOpacity(),
      cursor: disabled ? "not-allowed" : "pointer",
      transition: "opacity 0.2s ease",
    },
    style,
    isHovered && hoverStyle,
    disabled && disabledStyle,
  ];

  return (
    <TouchableOpacity
      style={combinedStyle}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      disabled={disabled}
      // activeOpacity={1} // We handle opacity manually
      {...props}
    >
      {children}
    </TouchableOpacity>
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
      onLongPress={onLongPress}
      onPress={onPress}
      text={text}
      textStyle={{
        // textColor: Colors.tabMenuButtonText,
        color: isSelected ? C.textWhite : "white",
        fontSize: 15,
        ...textStyle,
      }}
      colorGradientArr={
        isSelected ? COLOR_GRADIENTS.blue : COLOR_GRADIENTS.lightBlue
      }
      buttonStyle={{
        height,
        // backgroundColor: ,
        paddingHorizontal: 15,
        width: null,
        paddingVertical: 5,
        borderRadius: 0,
        ...buttonStyle,
      }}
    />
  );
};

export const CheckBox_ = ({
  text,
  onCheck,
  item,
  iconSize = 25,
  mouseOverOptions,
  makeEntireViewCheckable = true,
  // roundButton = false,
  isChecked,
  buttonStyle = {},
  textStyle = {},
  enabled,
}) => {
  return (
    <Button_
      enabled={enabled}
      mouseOverOptions={mouseOverOptions}
      icon={isChecked ? ICONS.checkbox : ICONS.checkoxEmpty}
      iconSize={15}
      text={text}
      buttonStyle={{
        backgroundColor: "transparent",
        paddingHorizontal: 0,
        paddingVertical: 0,
        ...buttonStyle,
      }}
      textStyle={{ color: C.text, fontSize: 15, ...textStyle }}
      onPress={onCheck}
      enableMouseOver={false}
    />
  );
};

export const GradientView = ({
  colorArr = COLOR_GRADIENTS.blue,
  children,
  style,
  props,
  pointerEvents,
}) => {
  return (
    <LinearGradient
      colors={[...colorArr]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
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
  // Create a new style object to avoid mutations
  const imageStyle = {
    ...style,
    resizeMode,
  };

  // Handle size assignment without mutating original style
  if (size) {
    imageStyle.width = size;
    imageStyle.height = size;
  } else {
    // Only set defaults if neither width nor height is provided
    if (!imageStyle.width && !imageStyle.height) {
      imageStyle.width = 30;
      imageStyle.height = 30;
    }
  }

  return <Image source={icon} style={imageStyle} />;
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
  opacity,
  TextComponent,
  mouseOverOptions = {
    opacity: 0.82,
    highlightColor: "",
    textColor: "",
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
    if (!enabled) return;
    if (visible) {
      _setMouseOver(false);
      onPress();
    }
  }

  function getBackgroundColor() {
    if (sMouseOver && enabled) {
      return mouseOverOptions.highlightColor || buttonStyle.backgroundColor;
    } else {
      if (buttonStyle.backgroundColor) return buttonStyle.backgroundColor;
      return C.buttonLightGreen;
    }
  }

  function getOpacity() {
    if (sMouseOver && enabled) {
      return mouseOverOptions.opacity;
    } else if (!enabled) {
      return null;
    } else {
      return 1;
    }
  }

  // log(enabled.toString());
  return (
    <View pointerEvents={!enabled ? "none" : "auto"}>
      <TouchableOpacity
        style={{
          opacity: getOpacity(),
          ...viewStyle,
        }}
        activeOpacity={enabled ? null : 1}
        ref={ref}
        onMouseOver={() => {
          if (!enabled) return;
          handleMouseOver();
          enableMouseOver ? _setMouseOver(true) : null;
        }}
        onMouseLeave={() => {
          handleMouseExit();
          _setMouseOver(false);
        }}
        // on={() => log("here")}
        onPress={() => (enabled ? handleButtonPress() : null)}
        onLongPress={visible ? onLongPress : () => {}}
      >
        <GradientView
          // colorArr={enabled ? colorGradientArr : []}
          colorArr={colorGradientArr || []}
          style={{
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row",
            borderRadius: 15,
            paddingVertical: 5,
            paddingHorizontal: 15,
            paddingLeft: icon ? 10 : 15,
            ...shadowStyle,
            ...buttonStyle,
            backgroundColor: icon && !text ? null : getBackgroundColor(),
            opacity: enabled ? 1 : 0.2,
          }}
          {...gradientViewProps}
        >
          {!!icon && (
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
          )}
          {/* {text ? <Text style={{ ...textStyle }}>{text}</Text> : null} */}
          {TextComponent ? (
            <TextComponent />
          ) : (
            <Text
              numberOfLines={numLines}
              style={{
                textAlign: "center",
                fontSize: 15,
                color: C.textWhite,
                ...textStyle,
              }}
            >
              {text}
            </Text>
          )}
        </GradientView>
      </TouchableOpacity>
    </View>
  );
};

const pad = (n, len = 2) => n.toString().padStart(len, "0");
export const NumberSpinner_ = ({
  min = 0,
  max = 100,
  value = 46,
  onChange = () => {},
  width = 80,
  style = {},
  itemStyle = {},
  visibleItems = 5,
  padZero = false,
}) => {
  const scrollRef = useRef(null);
  const [selected, setSelected] = useState(value);
  const styles1 = {
    item: {
      justifyContent: "center",
      alignItems: "center",
    },
    text: {},
  };
  const ITEM_HEIGHT = 48;
  // Generate number array
  const numbers = [];
  for (let i = min; i <= max; i++) {
    numbers.push(padZero ? pad(i) : i);
  }

  // When component mounts or value prop changes, scroll to correct offset
  React.useEffect(() => {
    if (scrollRef.current) {
      const idx = Math.max(0, numbers.indexOf(padZero ? pad(value) : value));
      scrollRef.current.scrollTo({ y: idx * ITEM_HEIGHT, animated: false });
      setSelected(numbers[idx]);
    }
  }, [value, min, max, padZero]);

  // On scroll end, snap to nearest item
  const onScrollEnd = (e) => {
    const y = e.nativeEvent.contentOffset.y;
    const idx = Math.round(y / ITEM_HEIGHT);
    const clampedIdx = Math.max(0, Math.min(numbers.length - 1, idx));
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        y: clampedIdx * ITEM_HEIGHT,
        animated: true,
      });
    }
    setSelected(numbers[clampedIdx]);
    onChange(padZero ? parseInt(numbers[clampedIdx], 10) : numbers[clampedIdx]);
  };

  // Calculate padding items to center selected
  const padCount = Math.floor(visibleItems / 2);

  return (
    <View
      style={[
        {
          width,
          height: ITEM_HEIGHT * visibleItems,
          overflow: "hidden",
          alignItems: "center",
        },
        style,
      ]}
    >
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        onMomentumScrollEnd={onScrollEnd}
        contentContainerStyle={{
          paddingVertical: ITEM_HEIGHT * padCount,
        }}
      >
        {numbers.map((num, idx) => (
          <View
            key={num + idx}
            style={[
              styles1.item,
              {
                height: ITEM_HEIGHT,
                width: width,
                opacity:
                  num === selected
                    ? 1
                    : Math.abs(
                        numbers.indexOf(num) - numbers.indexOf(selected)
                      ) === 1
                    ? 0.6
                    : 0.3,
              },
              itemStyle,
            ]}
          >
            <Text
              style={[
                styles1.text,
                {
                  fontWeight: num === selected ? "bold" : "normal",
                  fontSize: num === selected ? 26 : 20,
                  color: num === selected ? "#333" : "#999",
                },
              ]}
            >
              {num}
            </Text>
          </View>
        ))}
      </ScrollView>
      {/* Overlay center highlight */}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            justifyContent: "center",
            alignItems: "center",
          },
        ]}
      >
        <View
          style={{
            height: ITEM_HEIGHT,
            width: width,
            borderTopWidth: 2,
            borderBottomWidth: 2,
            borderColor: "#007AFF",
            position: "absolute",
          }}
        />
      </View>
    </View>
  );
};

// Generate time slots from 12:00 AM → 12:00 PM in 30 min increments
function generateTimes() {
  const times = [];
  for (let m = 0; m <= 12 * 60; m += 30) {
    let hours24 = Math.floor(m / 60);
    let minutes = m % 60;

    let period = hours24 < 12 ? "AM" : "PM";
    let hours12 = hours24 % 12;
    if (hours12 === 0) hours12 = 12;

    const label = `${hours12}:${minutes.toString().padStart(2, "0")} ${period}`;
    times.push({ label, minutes: m });
  }
  return times;
}

export function TimeSpinner({
  onChange = () => {},
  initialMinutes = 0,
  itemHeight = 20,
  style,
}) {
  const times = useMemo(() => generateTimes(), []);
  const [selected, setSelected] = useState(initialMinutes);

  const listRef = useRef(null);

  // Find index of initial selection
  const initialIndex = times.findIndex((t) => t.minutes === initialMinutes);

  const handleSelect = (item) => {
    setSelected(item.minutes);
    onChange(item);
  };
  const styles = {
    container: {
      width: 120,
      overflow: "hidden",
      alignSelf: "center",
    },
    item: {
      justifyContent: "center",
      alignItems: "center",
    },
    text: {
      fontSize: 18,
      color: "#555",
    },
    selectedText: {
      fontSize: 20,
      fontWeight: "600",
      color: "#000",
    },
    selector: {
      position: "absolute",
      left: 0,
      right: 0,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: "#aaa",
    },
  };

  return (
    <View style={[styles.container, { height: itemHeight * 5 }, style]}>
      <FlatList
        ref={listRef}
        data={times}
        keyExtractor={(item) => item.minutes.toString()}
        showsVerticalScrollIndicator={false}
        snapToInterval={itemHeight}
        decelerationRate="fast"
        getItemLayout={(_, index) => ({
          length: itemHeight,
          offset: itemHeight * index,
          index,
        })}
        initialScrollIndex={initialIndex > -1 ? initialIndex : 0}
        renderItem={({ item }) => {
          const isSelected = item.minutes === selected;
          return (
            <TouchableOpacity
              style={[styles.item, { height: itemHeight }]}
              onPress={() => handleSelect(item)}
              activeOpacity={0.7}
            >
              <Text style={[styles.text, isSelected && styles.selectedText]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        }}
        onMomentumScrollEnd={(e) => {
          const offsetY = e.nativeEvent.contentOffset.y;
          const index = Math.round(offsetY / itemHeight);
          if (times[index]) handleSelect(times[index]);
        }}
      />
      {/* Selection indicator (overlay) */}
      <View
        style={[
          styles.selector,
          { top: (itemHeight * 5) / 2 - itemHeight / 2, height: itemHeight },
        ]}
        pointerEvents="none"
      />
    </View>
  );
}

export function SliderButton_({
  onConfirm,
  toConfirmLabel = "Slide to confirm",
  confirmLabel = "Confirmed!",
  showLabel = false,
  style = {},
  // Text styling parameters
  textStyle = {},
  labelStyle = {},
  // Slider size parameters
  sliderWidth = 280,
  knobSize = 50,
  // Slider color parameters
  sliderBackgroundColor = "#eee",
  sliderBackgroundOpacity = 1,
  knobBackgroundColor = "#4CAF50",
  knobTextColor = "white",
  knobText = "➔",
  // Knob image parameters
  knobImage = "",
  knobImageSize = 20,
}) {
  const [confirmed, setConfirmed] = useState(false);
  const translateX = useRef(new Animated.Value(0)).current;

  const SLIDER_WIDTH = sliderWidth;
  const KNOB_SIZE = knobSize;

  const styles2 = StyleSheet.create({
    container: {
      alignItems: "center",
      justifyContent: "center",
      padding: 20,
      ...style,
    },
    label: {
      marginBottom: 10,
      fontSize: 16,
      fontWeight: "600",
      ...labelStyle,
    },
    slider: {
      width: SLIDER_WIDTH,
      height: KNOB_SIZE,
      borderRadius: KNOB_SIZE / 2,
      backgroundColor: sliderBackgroundColor,
      opacity: sliderBackgroundOpacity,
      justifyContent: "center",
      overflow: "hidden",
    },
    knob: {
      width: KNOB_SIZE,
      height: KNOB_SIZE,
      borderRadius: KNOB_SIZE / 2,
      backgroundColor: knobBackgroundColor,
      justifyContent: "center",
      alignItems: "center",
      position: "absolute",

      // 👇 Works only in react-native-web
      cursor: "pointer",
    },
    knobText: {
      color: knobTextColor,
      fontSize: 20,
      fontWeight: "bold",
      ...textStyle,
    },
  });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !confirmed,
      onMoveShouldSetPanResponder: () => !confirmed,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dx > 0) {
          const maxDistance = SLIDER_WIDTH - KNOB_SIZE;
          translateX.setValue(Math.min(gestureState.dx, maxDistance));
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        const maxDistance = SLIDER_WIDTH - KNOB_SIZE;
        const threshold = maxDistance - 10; // 10px tolerance

        if (gestureState.dx > threshold) {
          // Trigger action if slid to end
          setConfirmed(true);
          onConfirm?.();
          // Reset immediately after confirmation
          setConfirmed(false);
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        } else {
          // Reset back if not completed
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  return (
    <View style={styles2.container}>
      {!!showLabel && (
        <Text style={styles2.label}>
          {confirmed ? confirmLabel : toConfirmLabel}
        </Text>
      )}
      <View style={styles2.slider}>
        <Animated.View
          {...panResponder.panHandlers}
          style={[styles2.knob, { transform: [{ translateX }] }]}
        >
          {knobImage ? (
            <Image_
              icon={knobImage}
              size={knobImageSize}
              style={{ resizeMode: "contain" }}
            />
          ) : (
            <Text style={styles2.knobText}>{knobText}</Text>
          )}
        </Animated.View>
      </View>
    </View>
  );
}

export const TextInput_ = ({
  value = "",
  onChangeText,
  debounceMs = DEBOUNCE_DELAY,
  style = {},
  placeholder = "",
  placeholderTextColor = "gray",
  multiline = false,
  numberOfLines = 1,
  autoFocus = false,
  editable = true,
  onFocus,
  onBlur,
  onContentSizeChange,
  ...props
}) => {
  const [localValue, setLocalValue] = useState(value || "");
  const debounceRef = useRef(null);

  // Sync local state when value prop changes from external sources
  useEffect(() => {
    setLocalValue(value || "");
  }, [value]);

  // Debounced function to call onChangeText
  const debouncedOnChangeText = useCallback(
    (val) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        onChangeText?.(val);
      }, debounceMs);
    },
    [onChangeText, debounceMs]
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return (
    <TextInput
      value={localValue}
      onChangeText={(val) => {
        setLocalValue(val);
        debouncedOnChangeText(val);
      }}
      placeholder={placeholder}
      placeholderTextColor={placeholderTextColor}
      style={style}
      multiline={multiline}
      numberOfLines={numberOfLines}
      autoFocus={autoFocus}
      editable={editable}
      onFocus={onFocus}
      onBlur={onBlur}
      onContentSizeChange={onContentSizeChange}
      {...props}
    />
  );
};

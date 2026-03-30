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
import { formatCurrencyDisp, formatMillisForDisplay, gray, ifNumIsOdd, lightenRGBByPercent, localStorageWrapper, log, usdTypeMask, deepEqual } from "./utils";
import { C, COLOR_GRADIENTS, Colors, Fonts, ICONS } from "./styles";
import { SETTINGS_OBJ, PRIVILEDGE_LEVELS, CUSTOMER_DEPOST_TYPES } from "./data";
import { cloneDeep } from "lodash";
import { DEBOUNCE_DELAY, LOCAL_DB_KEYS, PAUSE_USER_CLOCK_IN_CHECK_MILLIS } from "./constants";
import {
  useInventoryStore,
  useInvModalStore,
  useSettingsStore,
  useLoginStore,
  useAlertScreenStore,
} from "./stores";
import LinearGradient from "react-native-web-linear-gradient";
import ReactDOM from "react-dom";
// import DateTimePicker from "@react-native-community/datetimepicker";
import CalendarPicker, { useDefaultStyles } from "react-native-ui-datepicker";
import { PanResponder } from "react-native";

import { StyleSheet } from "react-native";
import { Animated } from "react-native";
import { dbDeleteInventoryItem, dbSaveInventoryItem } from "./db_calls_wrapper";

export const VertSpacer = ({ pix }) => <View style={{ height: pix }} />;
export const HorzSpacer = ({ pix }) => <View style={{ width: pix }} />;

export const StaleBanner = ({ text, style, textStyle }) => {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return (
    <Animated.View
      style={{
        backgroundColor: C.orange,
        paddingVertical: 4,
        paddingHorizontal: 12,
        borderRadius: 5,
        alignItems: "center",
        opacity,
        ...style,
      }}
    >
      <Text style={{ color: "white", fontSize: 11, fontWeight: "600", ...textStyle }}>{text}</Text>
    </Animated.View>
  );
};

export const PrinterAlert = ({ visible, x, y, onDone }) => {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!visible) return;
    scale.setValue(1);
    opacity.setValue(1);
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.3, duration: 400, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 400, useNativeDriver: true }),
      ])
    );
    pulse.start();
    const timer = setTimeout(() => {
      pulse.stop();
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
        if (onDone) onDone();
      });
    }, 2000);
    return () => { pulse.stop(); clearTimeout(timer); };
  }, [visible]);

  if (!visible) return null;

  return ReactDOM.createPortal(
    <Animated.View
      style={{
        position: "fixed",
        left: (x || 0) - 25,
        top: (y || 0) - 25,
        width: 50,
        height: 50,
        justifyContent: "center",
        alignItems: "center",
        opacity,
        transform: [{ scale }],
        zIndex: 99999,
        pointerEvents: "none",
      }}
    >
      <Image_ source={ICONS.print} width={40} height={40} />
    </Animated.View>,
    document.body
  );
};

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
  // store getters //////////////////////////////////////////////////////////////
  const zCanExitOnOuterClick = useAlertScreenStore((state) => state.canExitOnOuterClick);
  const zTitle = useAlertScreenStore((state) => state.title);
  const zMessage = useAlertScreenStore((state) => state.message);
  const zSubMessage = useAlertScreenStore((state) => state.subMessage);
  const zButton1Text = useAlertScreenStore((state) => state.btn1Text);
  const zButton2Text = useAlertScreenStore((state) => state.btn2Text);
  const zButton3Text = useAlertScreenStore((state) => state.btn3Text);
  const zButton1Handler = useAlertScreenStore((state) => state.handleBtn1Press);
  const zButton2Handler = useAlertScreenStore((state) => state.handleBtn2Press);
  const zButton3Handler = useAlertScreenStore((state) => state.handleBtn3Press);
  const zButton1Icon = useAlertScreenStore((state) => state.btn1Icon);
  const zButton2Icon = useAlertScreenStore((state) => state.btn2Icon);
  const zButton3Icon = useAlertScreenStore((state) => state.btn3Icon);
  const zIcon1Size = useAlertScreenStore((state) => state.icon1Size);
  const zIcon2Size = useAlertScreenStore((state) => state.icon2Size);
  const zIcon3Size = useAlertScreenStore((state) => state.icon3Size);
  const zAlertBoxStyle = useAlertScreenStore((state) => state.alertBoxStyle);
  const zFullScreen = useAlertScreenStore((state) => state.fullScreen);
  let zUseCancelButton = useAlertScreenStore((state) => state.useCancelButton);

  // Animation state ///////////////////////////////////////////////////////////
  const [sAnimation, _setAnimation] = useState("fade");

  //////////////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////////////

  function handleButton1Press() {
    zButton1Handler();
    useAlertScreenStore.getState().setShowAlert(false);
    setTimeout(() => {
      useAlertScreenStore.getState().resetAll();
    }, 100);
  }

  function handleButton2Press() {
    zButton2Handler();
    useAlertScreenStore.getState().setShowAlert(false);
    setTimeout(() => {
      useAlertScreenStore.getState().resetAll();
    }, 100);
  }

  function handleButton3Press() {
    zButton3Handler();
    useAlertScreenStore.getState().setShowAlert(false);
    setTimeout(() => {
      useAlertScreenStore.getState().resetAll();
    }, 100);
  }

  // Animation control //////////////////////////////////////////////////////////
  useEffect(() => {
    if (showAlert) {
      _setAnimation("fade"); // Fade in when opening
    } else {
      _setAnimation("fade"); // Slide out when closing
    }
  }, [showAlert]);

  if ((!zButton2Handler && !zButton3Handler) || zUseCancelButton)
    zUseCancelButton = true;

  // log(zButton1Text, zButton2Text);
  return (
    <TouchableWithoutFeedback
      onPress={() => (zCanExitOnOuterClick ? useAlertScreenStore.getState().resetAll() : null)}
    >
      <Modal animationType={sAnimation} visible={showAlert} transparent>
        <View
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.4)",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: "100%",
          }}
        >
            <View
              style={{
                backgroundColor: C.backgroundWhite,
                borderRadius: 15,
                alignItems: "center",
                justifyContent: "space-around",
              minWidth: "32%",
              minHeight: "24%",
                ...zAlertBoxStyle,
              }}
            >
              <View style={{ alignItems: "center", width: "100%" }}>
                {!!zTitle && (
                  <Text
                    numberOfLines={3}
                    style={{
                      fontWeight: "500",
                      marginTop: 25,
                      color: Colors.darkText,
                      fontSize: 25,
                      color: "red",
                      textAlign: "center",
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
                        useAlertScreenStore.getState().resetAll();
                      }, 100);
                    }}
                  />
                )}
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
  buttonLabel,
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
  openUpward = false,
  centerMenuVertically = false,
  menuHeight,
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
      _setAnimation("fade"); // Slide out when closing
    }
  }, [modalVisible, sInternalModalShow]);

  useEffect(() => {
    // useLoginStore.getState().setModalVisible(true);
    // return () => {
    //   useLoginStore.getState().setModalVisible(false);
    // };
  });
  if (!openUpward && !centerMenuVertically && modalCoordinateVars.y < 0) modalCoordinateVars.y = 0;
  // log("ref in ScreenModal", ref);
  useEffect(() => {
    const el = ref ? ref.current : null;
    if (el) {
      let rect = el.getBoundingClientRect();
      _setModalCoordinates({ x: rect.x, y: rect.y, height: rect.height });
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
        {buttonVisible && ButtonComponent && ButtonComponent()}
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
              top: ref && !openUpward
                ? centerMenuVertically && menuHeight
                  ? Math.max(
                      10,
                      Math.min(
                        sModalCoordinates.y +
                          (sModalCoordinates.height || 30) / 2 -
                          menuHeight / 2,
                        window.innerHeight - menuHeight - 10
                      )
                    )
                  : sModalCoordinates.y + modalCoordinateVars.y
                : null,
              bottom: ref && openUpward ? window.innerHeight - sModalCoordinates.y : null,
              left: ref ? sModalCoordinates.x + modalCoordinateVars.x : null,
            }}
          >
            {Component()}
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
  openUpward = false,
  menuMaxHeight,
  centerMenuVertically = false,
}) => {
  const [sModalVisible, _setModalVisible] = useState(false);
  const ref = useRef();
  const calculatedMenuHeight = menuMaxHeight
    ? Math.min(dataArr.length * 40, menuMaxHeight)
    : dataArr.length * 40;

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
          maxHeight: menuMaxHeight || undefined,
          overflow: menuMaxHeight ? "hidden" : undefined,
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
      openUpward={openUpward}
      centerMenuVertically={centerMenuVertically}
      menuHeight={calculatedMenuHeight}
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
  const [isModalVisible, setModalVisible] = useState(false);
  const [selectedValue, setSelectedValue] = useState(null);
  const [sModalCoordinates, _setModalCoordinates] = useState({ x: 0, y: 0 });

  useEffect(() => {
    useLoginStore.getState().setModalVisible(true);
    return () => {
      useLoginStore.getState().setModalVisible(false);
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
  // store getters ///////////////////////////////////////////////////////
  const zSettingsObj = useSettingsStore((state) => state.settings);
  const zFocus = useInvModalStore((state) => state.currentFocusName);
  const zInventoryArr = useInventoryStore((state) => state.inventoryArr);
  const zShowLoginScreen = useLoginStore((state) => state.showLoginScreen);

  //////////////////////////////////////////////////////////////////////////

  const [sItem, _setItem] = React.useState(() => zInventoryArr[itemIdx] ?? null);
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
    _setItem(zInventoryArr[itemIdx] ?? null);
  }, [itemIdx]);

  ///////////////////////////////////////////////////////////////////////

  function handleChangeItem(item, focusName) {
    useInvModalStore.getState().setFocus(focusName);
    _setItem(item);

    if (!sNewItem) {
      useLoginStore.getState().requireLogin(() => {
        useInventoryStore.getState().modItem(item, "change");
        dbSaveInventoryItem(item);
      });
    }
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
    useSettingsStore.getState().setSettings(newSettingsObj);
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
    useSettingsStore.getState().setSettings(settingsObj);
    // dbSaveSettings(settingsObj);
  }

  function handleNewItemPress() {
    log("new item", sItem);
    return;
  }

  function handleRemoveItem() {
    useLoginStore.getState().execute(() => {
      useInventoryStore.getState().modItem(sItem, "remove");
      dbDeleteInventoryItem(sItem.id);
      handleClosePress();
    }, "Admin");
  }

  function setComponent() {
    if (!sItem) return null;
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
                onClick={() => useInvModalStore.getState().setFocus(INPUT_FIELD_NAMES.formalName)}
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
                onClick={() => useInvModalStore.getState().setFocus(INPUT_FIELD_NAMES.informalName)}
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
                  onClick={() => useInvModalStore.getState().setFocus(INPUT_FIELD_NAMES.price)}
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
                  onClick={() => useInvModalStore.getState().setFocus(INPUT_FIELD_NAMES.sale)}
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
              onClick={() => useInvModalStore.getState().setFocus(INPUT_FIELD_NAMES.upc)}
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
            data={(zSettingsObj.quickItemButtonNames || []).map((nameObj) => {
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
  const zAdminPrivilege = useLoginStore((state) => state.adminPrivilege);
  const zUsers = useSettingsStore((state) => state.settings?.users, deepEqual);
  const [sPin, _setPin] = useState("");
  const [sError, _setError] = useState("");
  const [sSuccess, _setSuccess] = useState(false);

  // Poll login status every 500ms — facial recognition may log the user in while modal is open
  useEffect(() => {
    if (!modalVisible || sSuccess) return;
    const interval = setInterval(() => {
      let store = useLoginStore.getState();
      let user = store.currentUser;
      if (!user) return;
      let timeout = useSettingsStore.getState().getSettings()?.activeLoginTimeoutSeconds || 60;
      let diff = (Date.now() - store.lastActionMillis) / 1000;
      if (diff > timeout) return;
      // Check privilege if required
      if (store.adminPrivilege) {
        let perm = user.permissions?.name || user.permissions;
        let level = store.adminPrivilege;
        let hasAccess = false;
        if (level === PRIVILEDGE_LEVELS.user) hasAccess = true;
        if (level === PRIVILEDGE_LEVELS.superUser &&
          (perm === PRIVILEDGE_LEVELS.superUser || perm === PRIVILEDGE_LEVELS.admin || perm === PRIVILEDGE_LEVELS.owner))
          hasAccess = true;
        if (level === PRIVILEDGE_LEVELS.admin &&
          (perm === PRIVILEDGE_LEVELS.admin || perm === PRIVILEDGE_LEVELS.owner))
          hasAccess = true;
        if (level === PRIVILEDGE_LEVELS.owner && perm === PRIVILEDGE_LEVELS.owner)
          hasAccess = true;
        if (!hasAccess) return;
      }
      // User is logged in with sufficient privileges — auto-close instantly
      clearInterval(interval);
      _setPin("");
      _setError("");
      store.setShowLoginScreen(false);
    }, 500);
    return () => clearInterval(interval);
  }, [modalVisible, sSuccess]);

  function handleClose() {
    _setPin("");
    _setError("");
    _setSuccess(false);
    useLoginStore.getState().setShowLoginScreen(false);
  }

  function handlePinChange(input) {
    _setPin(input);
    _setError("");

    let userObj = zUsers?.find((u) => u.pin == input);
    if (!userObj) userObj = zUsers?.find((u) => u.alternatePin == input);
    if (!userObj) return;

    // Check privilege level if required
    if (zAdminPrivilege) {
      let level = zAdminPrivilege;
      let perm = userObj.permissions?.name || userObj.permissions;
      let hasAccess = false;
      if (level === PRIVILEDGE_LEVELS.user) hasAccess = true;
      if (level === PRIVILEDGE_LEVELS.superUser &&
        (perm === PRIVILEDGE_LEVELS.superUser || perm === PRIVILEDGE_LEVELS.admin || perm === PRIVILEDGE_LEVELS.owner))
        hasAccess = true;
      if (level === PRIVILEDGE_LEVELS.admin &&
        (perm === PRIVILEDGE_LEVELS.admin || perm === PRIVILEDGE_LEVELS.owner))
        hasAccess = true;
      if (level === PRIVILEDGE_LEVELS.owner && perm === PRIVILEDGE_LEVELS.owner)
        hasAccess = true;

      if (!hasAccess) {
        _setError("Insufficient permissions");
        return;
      }
    }

    // Success
    _setSuccess(true);
    useLoginStore.getState().setCurrentUser(userObj);
    useLoginStore.getState().setLastActionMillis();
    setTimeout(() => {
      _setPin("");
      _setError("");
      _setSuccess(false);
      useLoginStore.getState().setShowLoginScreen(false);
      useLoginStore.getState().runPostLoginFunction();
      promptClockInIfNeeded(userObj);
    }, 400);
  }

  function promptClockInIfNeeded(userObj) {
    let punchClock = useLoginStore.getState().punchClock;
    if (punchClock[userObj.id]) return; // already clocked in

    // check localStorage pause
    let clockPauseObj = localStorageWrapper.getItem(LOCAL_DB_KEYS.userClockCheckPauseObj) || {};
    const lastCheckMillis = clockPauseObj[userObj.id];
    if (lastCheckMillis && (Date.now() - lastCheckMillis < PAUSE_USER_CLOCK_IN_CHECK_MILLIS)) {
      return; // still within pause window
    }

    useAlertScreenStore.getState().setValues({
      title: "PUNCH CLOCK",
      message: "Hi " + userObj.first + ", you are not clocked in. Would you like to punch in now?",
      btn1Text: "CLOCK IN",
      btn2Text: "NOT NOW",
      handleBtn1Press: () => {
        useLoginStore.getState().setCreateUserClock(userObj.id, new Date().getTime(), "in");
      },
      handleBtn2Press: () => {
        let freshPauseObj = localStorageWrapper.getItem(LOCAL_DB_KEYS.userClockCheckPauseObj) || {};
        freshPauseObj[userObj.id] = Date.now();
        localStorageWrapper.setItem(LOCAL_DB_KEYS.userClockCheckPauseObj, freshPauseObj);
      },
      showAlert: true,
    });
  }

  if (!modalVisible) return null;

  return ReactDOM.createPortal(
    <View
      style={{
        position: "fixed",
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 9999,
      }}
    >
      <TouchableOpacity
        activeOpacity={1}
        onPress={handleClose}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <View
        style={{
          width: 360,
          backgroundColor: sSuccess ? C.green : C.backgroundWhite,
          borderRadius: 12,
          borderWidth: 2,
          borderColor: sSuccess ? C.green : C.buttonLightGreenOutline,
          padding: 24,
        }}
      >
        {/* Header */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: Fonts.weight.textHeavy, color: sSuccess ? "white" : C.text }}>
            {sSuccess ? "Welcome!" : zAdminPrivilege ? "Authorization Required" : "Login"}
          </Text>
          <TouchableOpacity onPress={handleClose} style={{ padding: 4 }}>
            <Image_ icon={ICONS.close1} size={16} />
          </TouchableOpacity>
        </View>

        {/* Privilege badge */}
        {!!zAdminPrivilege && !sSuccess && (
          <View style={{ backgroundColor: gray(0.05), borderRadius: 6, padding: 8, marginBottom: 14 }}>
            <Text style={{ fontSize: 12, color: gray(0.5) }}>
              Requires: <Text style={{ fontWeight: Fonts.weight.textHeavy, color: C.text }}>{zAdminPrivilege}</Text> or higher
            </Text>
          </View>
        )}

        {/* PIN input */}
        {!sSuccess && (
          <View>
            <Text style={{ fontSize: 13, color: gray(0.5), marginBottom: 6 }}>Enter PIN</Text>
            <TextInput
              autoFocus={true}
              secureTextEntry={true}
              value={sPin}
              onChangeText={handlePinChange}
              placeholder="PIN"
              style={{
                borderWidth: 2,
                borderColor: sError ? C.red : C.buttonLightGreenOutline,
                borderRadius: 10,
                backgroundColor: C.listItemWhite,
                paddingVertical: 10,
                paddingHorizontal: 14,
                fontSize: 20,
                textAlign: "center",
                letterSpacing: 8,
                outlineStyle: "none",
              }}
            />
            {!!sError && (
              <Text style={{ fontSize: 12, color: C.red, marginTop: 6, textAlign: "center" }}>{sError}</Text>
            )}
          </View>
        )}

        {/* Success state */}
        {sSuccess && (
          <View style={{ alignItems: "center", paddingVertical: 10 }}>
            <Image_ icon={ICONS.check} size={30} style={{ tintColor: "white" }} />
          </View>
        )}
      </View>
    </View>,
    document.body
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
  icon,
  iconSize,
}) => {
  return (
    <Button_
      onLongPress={onLongPress}
      onPress={onPress}
      text={text}
      icon={icon}
      iconSize={iconSize}
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

  function handleButtonPress(e) {
    if (!enabled) return;
    if (visible) {
      _setMouseOver(false);
      onPress(e);
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
        onPress={(e) => (enabled ? handleButtonPress(e) : null)}
        onLongPress={visible ? onLongPress : () => {}}
      >
        <GradientView
          // colorArr={enabled ? colorGradientArr : []}
          colorArr={colorGradientArr || []}
          style={{
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row",
            borderRadius: 5,
            paddingVertical: 5,
            paddingHorizontal: 15,
            paddingLeft: icon ? 10 : null,
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

export const TimePicker_ = ({
  initialHour = 12,
  initialMinute = 0,
  initialPeriod = "PM",
  onConfirm = () => {},
  onCancel = () => {},
  style = {},
}) => {
  const [sHour, _sSetHour] = useState(initialHour);
  const [sMinute, _sSetMinute] = useState(initialMinute);
  const [sPeriod, _sSetPeriod] = useState(initialPeriod);

  const hourRef = useRef(null);
  const minuteRef = useRef(null);
  const hourReady = useRef(false);
  const minuteReady = useRef(false);
  const hourTimer = useRef(null);
  const minuteTimer = useRef(null);

  const ITEM_H = 36;
  const VISIBLE = 7;
  const PAD = Math.floor(VISIBLE / 2);
  const COL_W = 64;
  const BLUE = "#2979FF";

  const hours = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const mins = [];
  for (let i = 0; i < 60; i++) mins.push(i);

  const snapScroll = (e, items, ref, setter) => {
    const y = e.nativeEvent.contentOffset.y;
    const idx = Math.max(0, Math.min(items.length - 1, Math.round(y / ITEM_H)));
    ref.current?.scrollTo({ y: idx * ITEM_H, animated: true });
    setter(items[idx]);
  };

  const nudge = (ref, items, current, setter, dir) => {
    const idx = items.indexOf(current) + dir;
    if (idx >= 0 && idx < items.length) {
      ref.current?.scrollTo({ y: idx * ITEM_H, animated: true });
      setter(items[idx]);
    }
  };

  const renderScrollColumn = (items, selected, ref, setter, formatFn, readyRef, initVal, timerRef) => {
    const selIdx = items.indexOf(selected);
    return (
      <View style={{ width: COL_W, alignItems: "center" }}>
        <TouchableOpacity
          onPress={() => nudge(ref, items, selected, setter, -1)}
          style={{ height: 22, justifyContent: "center", alignItems: "center", width: COL_W }}
        >
          <Text style={{ fontSize: 9, color: gray(0.5) }}>▲</Text>
        </TouchableOpacity>

        <View style={{ height: ITEM_H * VISIBLE, overflow: "hidden" }}>
          <ScrollView
            ref={ref}
            showsVerticalScrollIndicator={false}
            snapToInterval={ITEM_H}
            decelerationRate="fast"
            scrollEventThrottle={16}
            onScroll={(e) => {
              clearTimeout(timerRef.current);
              const y = e.nativeEvent.contentOffset.y;
              timerRef.current = setTimeout(() => {
                const idx = Math.max(0, Math.min(items.length - 1, Math.round(y / ITEM_H)));
                ref.current?.scrollTo({ y: idx * ITEM_H, animated: true });
                setter(items[idx]);
              }, 75);
            }}
            onLayout={() => {
              if (!readyRef.current) {
                readyRef.current = true;
                const idx = items.indexOf(initVal);
                ref.current?.scrollTo({ y: Math.max(0, idx) * ITEM_H, animated: false });
              }
            }}
            contentContainerStyle={{ paddingVertical: ITEM_H * PAD }}
          >
            {items.map((item, i) => {
              const dist = Math.abs(i - selIdx);
              return (
                <TouchableOpacity
                  key={i}
                  onPress={() => {
                    ref.current?.scrollTo({ y: i * ITEM_H, animated: true });
                    setter(item);
                  }}
                  style={{ height: ITEM_H, justifyContent: "center", alignItems: "center" }}
                  activeOpacity={0.7}
                >
                  <Text
                    style={{
                      fontSize: i === selIdx ? 19 : 17,
                      fontWeight: i === selIdx ? "600" : "400",
                      color: i === selIdx ? "#fff" : gray(0.55),
                    }}
                  >
                    {formatFn(item)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <TouchableOpacity
          onPress={() => nudge(ref, items, selected, setter, 1)}
          style={{ height: 22, justifyContent: "center", alignItems: "center", width: COL_W }}
        >
          <Text style={{ fontSize: 9, color: gray(0.5) }}>▼</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const confirmResult = () => {
    const h24 = sPeriod === "PM" ? (sHour === 12 ? 12 : sHour + 12) : (sHour === 12 ? 0 : sHour);
    onConfirm({
      hour: sHour,
      minute: sMinute,
      period: sPeriod,
      totalMinutes: h24 * 60 + sMinute,
    });
  };

  return (
    <View style={[{ backgroundColor: "#fff", borderRadius: 10, paddingVertical: 4, width: COL_W * 3 + 16 }, style]}>
      <View style={{ position: "relative", paddingHorizontal: 8 }}>
        {/* Blue highlight bar */}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 4,
            right: 4,
            top: 22 + PAD * ITEM_H,
            height: ITEM_H,
            backgroundColor: BLUE,
            borderRadius: 8,
            zIndex: 0,
          }}
        />

        <View style={{ flexDirection: "row", zIndex: 1 }}>
          {renderScrollColumn(hours, sHour, hourRef, _sSetHour, (h) => String(h), hourReady, initialHour, hourTimer)}
          {renderScrollColumn(mins, sMinute, minuteRef, _sSetMinute, (m) => String(m).padStart(2, "0"), minuteReady, initialMinute, minuteTimer)}

          {/* AM/PM column */}
          <View style={{ width: COL_W, alignItems: "center" }}>
            <View style={{ height: 22 }} />
            <View style={{ height: ITEM_H * VISIBLE, overflow: "hidden" }}>
              <View style={{ marginTop: sPeriod === "AM" ? PAD * ITEM_H : (PAD - 1) * ITEM_H }}>
                <TouchableOpacity
                  onPress={() => _sSetPeriod("AM")}
                  style={{ height: ITEM_H, justifyContent: "center", alignItems: "center" }}
                >
                  <Text
                    style={{
                      fontSize: sPeriod === "AM" ? 19 : 17,
                      fontWeight: sPeriod === "AM" ? "600" : "400",
                      color: sPeriod === "AM" ? "#fff" : gray(0.55),
                    }}
                  >
                    AM
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => _sSetPeriod("PM")}
                  style={{ height: ITEM_H, justifyContent: "center", alignItems: "center" }}
                >
                  <Text
                    style={{
                      fontSize: sPeriod === "PM" ? 19 : 17,
                      fontWeight: sPeriod === "PM" ? "600" : "400",
                      color: sPeriod === "PM" ? "#fff" : gray(0.55),
                    }}
                  >
                    PM
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={{ height: 22 }} />
          </View>
        </View>
      </View>

      {/* Bottom buttons */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-evenly",
          paddingTop: 10,
          paddingBottom: 6,
          borderTopWidth: 1,
          borderColor: "#eee",
          marginTop: 4,
        }}
      >
        <TouchableOpacity onPress={confirmResult} style={{ padding: 8 }}>
          <Image_ style={{ width: 27, height: 27 }} icon={ICONS.check} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onCancel} style={{ padding: 8 }}>
          <Image_ style={{ width: 23, height: 23 }} icon={ICONS.close1} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

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
  capitalize = false,
  ...props
}) => {
  const [localValue, setLocalValue] = useState(value || "");
  const debounceRef = useRef(null);
  const inputRef = useRef(null);
  const [inputHeight, setInputHeight] = useState(undefined);

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

  // Compute dynamic height: be as thin as possible (1 line) and grow up to optional numberOfLines
  const baseLineHeight = (style && style.lineHeight) || 20;
  const minHeight = multiline ? baseLineHeight : undefined; // 1 line minimum
  const maxHeight =
    multiline && numberOfLines ? baseLineHeight * numberOfLines : undefined;

  const handleContentSizeChange = (e) => {
    // Let consumer receive the raw event first
    onContentSizeChange?.(e);

    if (!multiline) return;
    const nextHeight = e?.nativeEvent?.contentSize?.height;
    if (typeof nextHeight === "number" && nextHeight > 0) {
      // Clamp between min (1 line) and optional max (numberOfLines lines)
      const h = Math.max(minHeight || 0, Math.ceil(nextHeight));
      setInputHeight(maxHeight ? Math.min(h, maxHeight) : h);
    }
  };

  return (
    <TextInput
      ref={inputRef}
      value={localValue}
      onChangeText={(val) => {
        if (capitalize) {
          val = val.replace(/(^|[.!?]\s+|\n[-*]+\s*)([a-z])/g, (_, sep, char) => sep + char.toUpperCase());
        }
        setLocalValue(val);
        if (multiline && inputRef.current) {
          const node = inputRef.current;
          node.value = val;
          node.style.height = "0px";
          const scrollH = node.scrollHeight;
          const h = Math.max(minHeight || 0, Math.ceil(scrollH));
          const newH = maxHeight ? Math.min(h, maxHeight) : h;
          node.style.height = newH + "px";
          setInputHeight(newH);
        }
        debouncedOnChangeText(val);
      }}
      autoCapitalize={capitalize ? "sentences" : "none"}
      placeholder={placeholder}
      placeholderTextColor={placeholderTextColor}
      style={[
        style,
        multiline
          ? {
              height: inputHeight ?? minHeight,
              textAlignVertical: "top",
              outlineWidth: 0,
              outlineStyle: "none",
              borderWidth: 0,
            }
          : null,
      ]}
      multiline={multiline}
      // Do not pass numberOfLines down to avoid enforcing a fixed min-height;
      // we manage height via content size instead.
      autoFocus={autoFocus}
      editable={editable}
      onFocus={onFocus}
      onBlur={onBlur}
      onContentSizeChange={handleContentSizeChange}
      {...props}
    />
  );
};

export const Tooltip = ({
  text,
  children,
  position = "top",
  style = {},
}) => {
  const [sRect, _setRect] = useState(null);
  const GAP = 6;

  function handleMouseEnter(e) {
    _setRect(e.currentTarget.getBoundingClientRect());
  }

  function handleMouseLeave() {
    _setRect(null);
  }

  function getPortalStyle() {
    if (!sRect) return null;
    const base = { position: "fixed", zIndex: 99999, pointerEvents: "none" };
    if (position === "top")
      return { ...base, bottom: window.innerHeight - sRect.top + GAP, left: sRect.left, width: sRect.width, alignItems: "center" };
    if (position === "bottom")
      return { ...base, top: sRect.bottom + GAP, left: sRect.left, width: sRect.width, alignItems: "center" };
    if (position === "left")
      return { ...base, right: window.innerWidth - sRect.left + GAP, top: sRect.top, height: sRect.height, justifyContent: "center", alignItems: "flex-end" };
    if (position === "right")
      return { ...base, left: sRect.right + GAP, top: sRect.top, height: sRect.height, justifyContent: "center" };
  }

  const portalStyle = getPortalStyle();

  return (
    <View
      style={style}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {!!sRect && ReactDOM.createPortal(
        <View style={portalStyle}>
          <View
            style={{
              backgroundColor: "rgba(105,105,105,0.88)",
              borderRadius: 6,
              paddingHorizontal: 9,
              paddingVertical: 5,
            }}
          >
            <Text style={{ color: "white", fontSize: 12, whiteSpace: "pre" }}>
              {text}
            </Text>
          </View>
        </View>,
        document.body
      )}
    </View>
  );
};

export const Pressable_ = ({
  children,
  onPress,
  onDoublePress,
  onRightPress,
  tooltip = "",
  activeOpacity = 0.7,
  style = {},
}) => {
  const clickTimer = useRef(null);

  function handlePress(e) {
    if (onDoublePress) {
      if (clickTimer.current) {
        clearTimeout(clickTimer.current);
        clickTimer.current = null;
        onDoublePress(e);
      } else {
        clickTimer.current = setTimeout(() => {
          clickTimer.current = null;
          if (onPress) onPress(e);
        }, 350);
      }
    } else {
      if (onPress) onPress(e);
    }
  }

  function handleContextMenu(e) {
    if (onRightPress) {
      e.preventDefault();
      onRightPress();
    }
  }

  return (
    <View onContextMenu={handleContextMenu} title={tooltip || undefined}>
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={activeOpacity}
        style={style}
      >
        {children}
      </TouchableOpacity>
    </View>
  );
};

const StatusPickerRow = ({ status, idx, total, onPress }) => {
  const [sHovered, _setHovered] = useState(false);
  return (
    <TouchableOpacity
      onPress={onPress}
      onMouseEnter={() => _setHovered(true)}
      onMouseLeave={() => _setHovered(false)}
      style={{
        height: 40,
        justifyContent: "center",
        paddingHorizontal: 10,
        backgroundColor: status.backgroundColor || C.listItemWhite,
        borderBottomWidth: idx < total - 1 ? 1 : 0,
        borderBottomColor: "rgba(0,0,0,0.08)",
        opacity: sHovered ? 0.8 : 1,
      }}
    >
      <Text
        style={{
          color: status.textColor || C.text,
          fontSize: 13,
          fontWeight: "500",
        }}
        numberOfLines={1}
      >
        {status.label}
      </Text>
    </TouchableOpacity>
  );
};

/**
 * StatusPickerModal — reusable status selector with colored rows.
 * Opens a modal list of statuses, grows to fill viewport, scrolls overflow.
 * Uses fade-in / slide-out animation matching ScreenModal.
 *
 * Props:
 *   statuses       — array of status objects ({ id, label, backgroundColor, textColor })
 *   onSelect       — (statusObj) => void
 *   enabled        — boolean, default true
 *   buttonText     — string shown on the trigger button
 *   buttonStyle    — override trigger button style
 *   buttonTextStyle — override trigger button text style
 *   modalCoordX    — horizontal offset from button (default 0)
 *   modalCoordY    — vertical offset from button (default 30)
 */
export const StatusPickerModal = ({
  statuses = [],
  onSelect = () => {},
  enabled = true,
  buttonText = "+ Status",
  buttonStyle: buttonStyleProp = {},
  buttonTextStyle: buttonTextStyleProp = {},
  modalCoordX = 0,
  modalCoordY = 30,
}) => {
  const [sVisible, _setVisible] = useState(false);
  const [sAnimation, _setAnimation] = useState("fade");
  const [sCoords, _setCoords] = useState({ x: 0, y: 0, height: 0 });
  const ref = useRef();

  useEffect(() => {
    _setAnimation("fade");
  }, [sVisible]);

  useEffect(() => {
    const el = ref?.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      _setCoords({ x: rect.x, y: rect.y, height: rect.height });
    }
  }, [ref]);

  const MENU_WIDTH = 320;
  const ITEM_HEIGHT = 40;
  const VIEWPORT_PADDING = 10;
  const anchorLeft = sCoords.x + modalCoordX;
  const buttonCenterY = sCoords.y + (sCoords.height || 25) / 2;
  const listHeight = Math.min(
    statuses.length * ITEM_HEIGHT,
    window.innerHeight - VIEWPORT_PADDING * 2
  );
  const anchorTop = Math.max(
    VIEWPORT_PADDING,
    Math.min(
      buttonCenterY - listHeight / 2,
      window.innerHeight - listHeight - VIEWPORT_PADDING
    )
  );
  const maxHeight = listHeight;

  const defaultButtonStyle = {
    backgroundColor: C.buttonLightGreen,
    borderColor: C.buttonLightGreenOutline,
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 8,
    paddingVertical: 2,
    height: 25,
    alignItems: "center",
    justifyContent: "center",
  };

  const defaultTextStyle = {
    fontSize: 12,
    color: C.text,
    fontWeight: "500",
  };

  return (
    <View ref={ref}>
      <TouchableOpacity
        onPress={() => {
          if (!enabled) return;
          const el = ref?.current;
          if (el) {
            const rect = el.getBoundingClientRect();
            _setCoords({ x: rect.x, y: rect.y, height: rect.height });
          }
          _setVisible(true);
        }}
        style={{ ...defaultButtonStyle, ...buttonStyleProp }}
      >
        <Text style={{ ...defaultTextStyle, ...buttonTextStyleProp }}>
          {buttonText}
        </Text>
      </TouchableOpacity>

      <Modal
        animationType={sAnimation}
        visible={sVisible}
        transparent
      >
        <TouchableWithoutFeedback onPress={() => _setVisible(false)}>
          <View
            style={{
              width: "100%",
              height: "100%",
              backgroundColor: "transparent",
            }}
          >
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <View
                style={{
                  position: "absolute",
                  top: anchorTop,
                  left: anchorLeft,
                  width: MENU_WIDTH,
                  maxHeight,
                  borderRadius: 5,
                  overflow: "hidden",
                  backgroundColor: "#FFFFFF",
                }}
              >
                <ScrollView
                  style={{ maxHeight }}
                  showsVerticalScrollIndicator={true}
                >
                  {statuses.map((status, idx) => (
                    <StatusPickerRow
                      key={status.id || idx}
                      status={status}
                      idx={idx}
                      total={statuses.length}
                      onPress={() => {
                        onSelect(status);
                        _setVisible(false);
                      }}
                    />
                  ))}
                </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
};

export const DepositModal = ({ visible, onClose, onPay, onCredit, inline, inlineStyle }) => {
  const [sDepositType, _sSetDepositType] = useState(CUSTOMER_DEPOST_TYPES.deposit);
  const [sDepositAmount, _sSetDepositAmount] = useState("");
  const [sDepositAmountCents, _sSetDepositAmountCents] = useState(0);
  const [sDepositNote, _sSetDepositNote] = useState("");

  let isCredit = sDepositType === CUSTOMER_DEPOST_TYPES.credit;
  let isGiftCard = sDepositType === CUSTOMER_DEPOST_TYPES.giftcard;
  let creditReady = isCredit && sDepositAmountCents >= 100 && sDepositNote.trim().length > 3;
  let depositReady = (!isCredit && !isGiftCard) && sDepositAmountCents > 0;
  let giftCardReady = isGiftCard && sDepositAmountCents > 0;

  function resetAndClose() {
    _sSetDepositAmount("");
    _sSetDepositAmountCents(0);
    _sSetDepositNote("");
    _sSetDepositType(CUSTOMER_DEPOST_TYPES.deposit);
    onClose();
  }

  function handleCreditConfirm() {
    if (onCredit) {
      onCredit({
        amountCents: sDepositAmountCents,
        text: sDepositNote.trim(),
      });
    }
    resetAndClose();
  }

  if (!visible) return null;

  let innerCard = (
      <View
        style={{
          width: 350,
          backgroundColor: C.backgroundWhite,
          borderRadius: 12,
          borderWidth: 2,
          borderColor: C.buttonLightGreenOutline,
          padding: 20,
          ...(inline ? { position: "absolute", zIndex: 200, ...inlineStyle } : {}),
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: "600", color: C.text, marginBottom: 14 }}>
          Add Deposit / Credit / Gift Card
        </Text>
        <View style={{ flexDirection: "row", marginBottom: 14 }}>
          <CheckBox_
            text="Deposit"
            isChecked={sDepositType === CUSTOMER_DEPOST_TYPES.deposit}
            onCheck={() => _sSetDepositType(CUSTOMER_DEPOST_TYPES.deposit)}
            textStyle={{ fontSize: 14 }}
            buttonStyle={{ marginRight: 20 }}
          />
          <CheckBox_
            text="Credit"
            isChecked={sDepositType === CUSTOMER_DEPOST_TYPES.credit}
            onCheck={() => _sSetDepositType(CUSTOMER_DEPOST_TYPES.credit)}
            textStyle={{ fontSize: 14 }}
            buttonStyle={{ marginRight: 20 }}
          />
          <CheckBox_
            text="Gift Card"
            isChecked={sDepositType === CUSTOMER_DEPOST_TYPES.giftcard}
            onCheck={() => _sSetDepositType(CUSTOMER_DEPOST_TYPES.giftcard)}
            textStyle={{ fontSize: 14 }}
          />
        </View>

      {isCredit && (
        <View style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: "rgb(255,248,230)",
          borderWidth: 1,
          borderColor: "rgb(230,190,80)",
          borderRadius: 7,
          padding: 10,
          marginBottom: 12,
        }}>
          <Text style={{ fontSize: 18, marginRight: 8 }}>!</Text>
          <Text style={{ fontSize: 12, color: "rgb(140,100,20)", flex: 1, lineHeight: 17 }}>
            Applying a credit will give a customer future free money
          </Text>
        </View>
      )}

        <View style={{ flexDirection: "row", alignItems: "center", borderColor: C.buttonLightGreenOutline, borderWidth: 1, borderRadius: 7, backgroundColor: C.listItemWhite, marginBottom: 10, paddingHorizontal: 10, height: 40 }}>
          <Text style={{ fontSize: 16, color: gray(0.4), marginRight: 4 }}>$</Text>
          <TextInput_
            placeholder="0.00"
            placeholderTextColor={gray(0.35)}
            value={sDepositAmount}
            onChangeText={(val) => {
              let result = usdTypeMask(val);
              _sSetDepositAmount(result.display);
              _sSetDepositAmountCents(result.cents);
            }}
            debounceMs={0}
            autoFocus={true}
            style={{
              flex: 1,
              fontSize: 16,
              outlineWidth: 0,
              outlineStyle: "none",
              borderWidth: 0,
              height: 38,
              color: C.text,
            }}
          />
        </View>
        <TextInput_
        placeholder={isCredit ? "Reason (required)" : "Note (optional)"}
          placeholderTextColor={gray(0.35)}
          value={sDepositNote}
          onChangeText={(val) => _sSetDepositNote(val)}
          debounceMs={0}
          multiline={true}
          numberOfLines={5}
          blurOnSubmit={false}
          style={{
            borderColor: isCredit && sDepositNote.trim().length === 0 ? C.orange : gray(0.08),
            borderWidth: 1,
            borderRadius: 7,
            paddingHorizontal: 10,
            paddingVertical: 8,
            fontSize: 14,
            lineHeight: 20,
            backgroundColor: C.listItemWhite,
            marginBottom: 18,
            color: C.text,
          }}
        />
        <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
          <Button_
            text="Cancel"
            colorGradientArr={COLOR_GRADIENTS.red}
            textStyle={{ color: C.textWhite, fontSize: 13 }}
            buttonStyle={{ width: 90, height: 34, borderRadius: 5, marginRight: 10 }}
            onPress={resetAndClose}
          />
          <Button_
          text={isCredit ? "Apply Credit" : "Pay Amount"}
          colorGradientArr={isCredit ? COLOR_GRADIENTS.blue : isGiftCard ? COLOR_GRADIENTS.green : COLOR_GRADIENTS.green}
            textStyle={{ color: C.textWhite, fontSize: 13 }}
          enabled={isCredit ? creditReady : isGiftCard ? giftCardReady : depositReady}
          buttonStyle={{ width: 110, height: 34, borderRadius: 5, opacity: (isCredit ? creditReady : isGiftCard ? giftCardReady : depositReady) ? 1 : 0.4 }}
            onPress={() => {
              if (isCredit) {
                if (!creditReady) return;
                handleCreditConfirm();
              } else if (isGiftCard) {
                if (!giftCardReady) return;
                onPay({
                  type: sDepositType,
                  amountCents: sDepositAmountCents,
                  note: sDepositNote,
                });
                resetAndClose();
              } else {
                if (!depositReady) return;
                onPay({
                  type: sDepositType,
                  amountCents: sDepositAmountCents,
                  note: sDepositNote,
                });
                resetAndClose();
              }
            }}
          />
        </View>
      </View>
  );

  if (inline) return innerCard;

  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.4)",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 100,
        borderRadius: 15,
      }}
    >
      <TouchableOpacity
        activeOpacity={1}
        onPress={resetAndClose}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      />
      {innerCard}
    </View>
  );
};

export const DepositsList = ({ deposits, credits, onPress, onRemoveCredit }) => {
  let [sConfirmId, _sSetConfirmId] = useState(null);
  let activeDeposits = (deposits || []).filter((d) => d.amountCents > 0);
  let activeCredits = (credits || []).filter((d) => d.amountCents > 0);
  let allItems = [
    ...activeDeposits.map((d) => ({ ...d, _type: "deposit" })),
    ...activeCredits.map((d) => ({ ...d, _type: "credit" })),
  ];
  return (
    <View style={{ marginTop: 10, borderWidth: 1, borderColor: C.buttonLightGreenOutline, borderRadius: 10, padding: 10, backgroundColor: C.listItemWhite }}>
      <Text style={{ fontSize: 15, fontWeight: "600", marginBottom: 6, color: C.green }}>
        Deposits / Credits / Gift Cards
      </Text>
      {allItems.length === 0 && (
        <Text style={{ color: gray(0.4), fontSize: 12, textAlign: "center", marginTop: 4 }}>
          No deposits, credits, or gift cards on file
        </Text>
      )}
      {allItems.map((item) => {
        let isCredit = item._type === "credit";
        let isGiftCard = item.type === "giftcard";
        let badgeColor = isGiftCard ? C.orange : isCredit ? C.blue : C.green;
        let noteText = item.note || item.text || "";
        let isConfirming = sConfirmId === item.id;
        return (
          <View key={item.id}>
            {isConfirming && (
              <View style={{ flexDirection: "row", justifyContent: "flex-end", marginBottom: 4, gap: 6 }}>
                <TouchableOpacity
                  onPress={() => { _sSetConfirmId(null); if (onRemoveCredit) onRemoveCredit(item); }}
                  style={{ backgroundColor: C.red, borderRadius: 5, paddingVertical: 4, paddingHorizontal: 10 }}
                >
                  <Text style={{ color: C.textWhite, fontSize: 11, fontWeight: "600" }}>Confirm Remove</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => _sSetConfirmId(null)}
                  style={{ backgroundColor: gray(0.6), borderRadius: 5, paddingVertical: 4, paddingHorizontal: 10 }}
                >
                  <Text style={{ color: C.textWhite, fontSize: 11, fontWeight: "600" }}>Cancel</Text>
                </TouchableOpacity>
              </View>
            )}
            <TouchableOpacity_
              onPress={() => onPress && onPress(item)}
              hoverOpacity={onPress ? 0.7 : 1}
              style={{
                marginBottom: 4,
                borderRadius: 7,
                borderLeftWidth: 4,
                borderLeftColor: badgeColor,
                borderColor: C.buttonLightGreenOutline,
                borderWidth: 1,
                backgroundColor: C.listItemWhite,
                paddingVertical: 6,
                paddingHorizontal: 10,
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <View
                    style={{
                      backgroundColor: lightenRGBByPercent(badgeColor, 70),
                      paddingHorizontal: 6,
                      paddingVertical: 1,
                      borderRadius: 8,
                      marginRight: 6,
                    }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: "600", color: badgeColor }}>
                      {isGiftCard ? "Gift Card" : isCredit ? "Credit" : "Deposit"}
                    </Text>
                  </View>
                  {!!noteText && (
                    <Text numberOfLines={1} style={{ fontSize: 11, color: gray(0.5), flex: 1 }}>
                      {noteText}
                    </Text>
                  )}
                </View>
                <Text style={{ fontSize: 12, color: gray(0.4), marginTop: 2 }}>
                  {formatMillisForDisplay(item.millis)}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", marginRight: isCredit && onRemoveCredit ? 8 : 0 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: C.text }}>
                  {"$" + formatCurrencyDisp(item.amountCents)}
                </Text>
                {(item.reservedCents || 0) > 0 && (
                  <Text style={{ fontSize: 10, color: C.orange, fontWeight: "600", marginTop: 1 }}>
                    In use: {"$" + formatCurrencyDisp(item.reservedCents)}
                  </Text>
                )}
                {(item.reservedCents || 0) > 0 && item.amountCents > item.reservedCents && (
                  <Text style={{ fontSize: 10, color: C.green, fontWeight: "600", marginTop: 1 }}>
                    Available: {"$" + formatCurrencyDisp(item.amountCents - item.reservedCents)}
                  </Text>
                )}
              </View>
              {isCredit && onRemoveCredit && !(item.reservedCents > 0) && (
                <Tooltip text="This will remove the credit from the customer" position="left">
                  <TouchableOpacity
                    onPress={(e) => { e.stopPropagation(); _sSetConfirmId(item.id); }}
                    style={{ backgroundColor: C.red, borderRadius: 5, paddingVertical: 3, paddingHorizontal: 8 }}
                  >
                    <Text style={{ color: C.textWhite, fontSize: 10, fontWeight: "600" }}>Remove</Text>
                  </TouchableOpacity>
                </Tooltip>
              )}
            </TouchableOpacity_>
          </View>
        );
      })}
    </View>
  );
};

// Export ProtectedRoute for routing
export { ProtectedRoute } from "./components/ProtectedRoute";

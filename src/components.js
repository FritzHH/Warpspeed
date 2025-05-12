// "use client";
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
import React, { Component, useEffect, useRef } from "react";
import { log } from "./utils";
import { Colors } from "./styles";
import { useState } from "react";
import {
  bike_colors_db,
  bike_colors_arr_db,
  discounts_db,
  FOCUS_NAMES,
  INVENTORY_ITEM_PROTO,
  INVENTORY_CATEGORIES,
} from "./data";
import { cloneDeep, round } from "lodash";
import { CUSTOMER_PROTO } from "./data";
import { useInvModalStore } from "./stores";

const centerItem = {
  alignItems: "center",
  justifyContent: "center",
};

export const VertSpacer = ({ pix }) => <View style={{ height: pix }} />;
export const HorzSpacer = ({ pix }) => <View style={{ width: pix }} />;

export const TabMenuDivider = () => {
  return (
    <View style={{ width: 1, backgroundColor: "gray", height: "100%" }}></View>
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

export const AlertBox = ({
  message,
  btnText1,
  btnText2,
  btnText3,
  handleBtn1Press,
  handleBtn2Press,
  handleBtn3Press,
  showBox = false,
  onModalDismiss,
  canExitOnOuterClick = true,
  modalStyle = { width: "100%", height: "100%" },
  alertBoxStyle = { width: 700, height: 200, backgroundColor: "lightgray" },
}) => {
  const btnStyle = {
    width: 150,
    height: 40,
    backgroundColor: "dimgray",
    padding: 10,
    borderRadius: 4,
    ...SHADOW_RADIUS_PROTO,
  };

  const txtStyle = {
    color: "whitesmoke",
    fontSize: 17,
  };

  let hasButtons = false;
  if (btnText1 || btnText2 || btnText3) hasButtons = true;

  if (!hasButtons) alertBoxStyle.justifyContent = "center";

  return (
    <TouchableWithoutFeedback
      // onPress={() => log("here")}
      onPress={() => onModalDismiss()}
    >
      <Modal
        onDismiss={() => {
          onModalDismiss();
        }}
        visible={showBox}
        transparent
      >
        <View
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.4)",
            justifyContent: "center",
            alignItems: "center",
            alignSelf: "center",
            justifySelf: "center",
            // marginTop: 100,
            // width: 1000,
            // height: 800,
            ...modalStyle,
          }}
        >
          <View
            style={{
              shadowColor: "black",
              shadowOffset: { width: 5, height: 5 },
              shadowOpacity: 0.7,
              shadowRadius: 5,
              padding: 10,
              // justifyContent: "center",
              alignItems: "center",
              ...alertBoxStyle,
            }}
          >
            <Text
              numberOfLines={3}
              style={{ color: Colors.darkText, fontSize: 22, color: "red" }}
            >
              ALERT!
            </Text>

            <Text
              style={{ marginTop: 10, color: Colors.darkText, fontSize: 18 }}
            >
              {message}
            </Text>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-around",
                width: "100%",
                marginTop: 50,
              }}
            >
              {btnText1 && (
                <Button
                  textStyle={{ ...txtStyle }}
                  viewStyle={{ ...btnStyle }}
                  text={btnText1}
                  onPress={handleBtn1Press}
                />
              )}
            </View>
          </View>
        </View>
      </Modal>
    </TouchableWithoutFeedback>
  );
};

export const ScreenModal = ({
  ref,
  modalCoordinateVars = {
    x: -30,
    y: 40,
  },
  mouseOverOptions = {
    enable: true,
    opacity: 1,
    highlightColor: Colors.tabMenuButton,
  },
  handleButtonPress = () => {},
  buttonLabel = "Modal Button",
  buttonVisible = true,
  showButtonIcon = true,
  showOuterModal = false,
  showShadow = true,
  allCaps = false,
  buttonStyle = {},
  buttonTextStyle = {},
  Component,
  outerModalStyle = {},
  modalVisible = false,
  setModalVisibility = () => {},
  shadowStyle = { ...SHADOW_RADIUS_PROTO },
  buttonIcon,
  handleModalActionInternally = false,
  canExitOnOuterModalClick = true,
}) => {
  // const [sIsModalVisible, _modalVisible] = useState(showModal);
  const [sModalCoordinates, _setModalCoordinates] = useState({ x: 0, y: 0 });
  const [sMouseOver, _setMouseOver] = React.useState(false);
  const [sInternalModalShow, _setInternalModalShow] = useState(false);

  /////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////
  if (modalCoordinateVars.y < 0) modalCoordinateVars.y = 0;
  // log("ref in ScreenModal", ref);
  useEffect(() => {
    const el = ref ? ref.current : null;
    if (el) {
      // log("el", el);
      let rect = el.getBoundingClientRect();
      _setModalCoordinates({ x: rect.x, y: rect.y });
      // log("outer", rect);
    }
  }, []);

  // useEffect(() => {
  //   if (handleModalActionInternally) {}
  // }, [])

  // log("ref", ref);
  ////////////////////////////////////////////////////////////
  /////////////////////////////////////////////////////////////
  if (!buttonVisible) {
    buttonStyle = { width: 0, height: 0 };
    showButtonIcon = false;
    showShadow = false;
  }
  if (showButtonIcon && !buttonIcon) buttonIcon = "\u21b4";
  if (allCaps) buttonLabel = buttonLabel.toUpperCase();
  if (!showShadow) shadowStyle = {};
  let labelIconFontSize = buttonTextStyle.fontSize + 2 || 20;
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
        if (canExitOnOuterModalClick) {
          _setInternalModalShow(false);
          setModalVisibility(false);
        }
      }}
    >
      <View style={{}}>
        <Button
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
            backgroundColor: sMouseOver
              ? mouseOverOptions.highlightColor
              : buttonStyle.backgroundColor || "transparent",
            opacity: sMouseOver ? mouseOverOptions.opacity : null,
          }}
        />

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
              backgroundColor: "rgba(0, 0, 0, 0.5)",
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

export const ModalDropdown = ({
  data,
  onSelect,
  buttonLabel,
  buttonBackgroundColor,
  onRemoveSelection,
  currentSelection,
  removeButtonText,
  buttonStyle = {},
  outerModalStyle = {},
  innerModalStyle = {},
  // modalStyle = {},
}) => {
  const [isModalVisible, setModalVisible] = useState(false);
  const [selectedValue, setSelectedValue] = useState(null);

  const toggleModal = () => setModalVisible(!isModalVisible);

  const handleSelect = (item) => {
    setSelectedValue(item);
    onSelect(item);
    toggleModal();
  };
  // log(data);

  return (
    <TouchableWithoutFeedback
      // style={{ width: 500, height: 100 }}
      onPress={() => toggleModal()}
    >
      <View style={{ flex: 1 }}>
        <TouchableOpacity
          style={{
            backgroundColor: Colors.blueButtonBackground,
            borderRadius: 2,
            paddingHorizontal: 10,
            // width: 390,
            height: 25,
            paddingVertical: 1,
            alignItems: "center",
            justifyContent: "center",
            ...SHADOW_RADIUS_PROTO,
            ...buttonStyle,
          }}
          onPress={toggleModal}
        >
          <Text
            style={{
              color: buttonBackgroundColor || "white",
              textAlign: "center",
              fontSize: 15,
              ...buttonStyle,
            }}
          >
            {buttonLabel}
          </Text>
        </TouchableOpacity>

        <Modal visible={isModalVisible} transparent={true}>
          <View
            style={{
              // backgroundColor: "green",
              // backgroundColor: "black",
              // opacity: 0.2,
              width: "100%",
              height: "100%",
              ...outerModalStyle,
            }}
          >
            {/* <View style={{}}> */}
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

export const InventoryItemInModal = ({
  item,
  __setItem = () => {},
  handleClosePress = () => {},
}) => {
  if (!item) item = INVENTORY_ITEM_PROTO;
  const [sCatModalVisible, _setCatModalVisible] = useState(false);

  // zustand hooks, we are storing the inventory item internally until submitting
  // const resetPersistState = useInvModalStore((state) => state.reset);
  const _zSetFocus = useInvModalStore((state) => state.setFocus);
  const _zSetItem = useInvModalStore((state) => state.setItem);
  const _zReset = useInvModalStore((state) => state.reset);
  const zFocus = useInvModalStore((state) => state.getFocus());
  const zItem = useInvModalStore((state) => state.getItem());

  const isMounted = useRef(false);
  useEffect(() => {
    if (!isMounted.current && item.id.length > 0) {
      isMounted.current = true;
      _zSetItem(item);
    }
    return () => {
      isMounted.current = false;
      _zSetItem(INVENTORY_ITEM_PROTO);
    };
  }, []);

  const catRef = useRef(null);
  const FOCUS_NAMES = {
    name: "name",
    price: "price",
    sale: "sale",
    upc: "upc",
  };

  function setItem(item, focusName) {
    _zSetFocus(focusName);
    _zSetItem(item);
  }

  function handleSubmitPress() {
    __setItem(zItem);
    handleClosePress();
  }

  function handleCancelPress() {
    handleClosePress();
  }

  // log("zFocus", zFocus);
  return (
    <TouchableWithoutFeedback>
      <View
        style={{
          width: "40%",
          height: "60%",
          backgroundColor: Colors.opacityBackgroundLight,
          ...SHADOW_RADIUS_PROTO,
          shadowOffset: { width: 3, height: 3 },
          padding: 15,
          backgroundColor: "whitesmoke",
        }}
      >
        <View
          style={{
            width: "100%",
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <Text>name</Text>
          <TextInput
            numberOfLines={3}
            style={{
              marginTop: 10,
              fontSize: 16,
              color: "black",
              borderWidth: 1,
            }}
            autoFocus={zFocus === FOCUS_NAMES.name}
            onClick={() => _zSetFocus(FOCUS_NAMES.name)}
            onChangeText={(val) => {
              let item = { ...zItem, name: val };
              // zItem.name = val;
              setItem(item, FOCUS_NAMES.name);
            }}
            value={zItem.name}
          />
          <View>
            <Text style={{ color: "red", fontSize: 13 }}>
              {"Regular $ "}
              <TextInput
                autoFocus={zFocus === FOCUS_NAMES.price}
                onClick={() => _zSetFocus(FOCUS_NAMES.price)}
                onChangeText={(val) => {
                  zItem.price = val;
                  setItem(zItem, FOCUS_NAMES.price);
                }}
                value={zItem.price}
                style={{ fontSize: 16 }}
              />
            </Text>
            <Text style={{ alignSelf: "flex-end", color: "red", fontSize: 13 }}>
              {"Sale $ "}
              <TextInput
                autoFocus={zFocus === FOCUS_NAMES.sale}
                onClick={() => _zSetFocus(FOCUS_NAMES.sale)}
                onChangeText={(val) => {
                  zItem.salePrice = val;
                  setItem(zItem, FOCUS_NAMES.sale);
                }}
                value={zItem.salePrice}
                style={{ fontSize: 16 }}
              />
            </Text>
          </View>
        </View>
        <View
          style={{ flexDirection: "row", alignItems: "center", marginTop: 20 }}
        >
          <ScreenModal
            ref={catRef}
            setModalVisibility={() => _setCatModalVisible(!sCatModalVisible)}
            modalVisible={sCatModalVisible}
            buttonLabel="Category"
            outerModalStyle={{ width: null, height: null }}
            modalCoordinateVars={{ x: 0, y: 0 }}
            buttonStyle={{ backgroundColor: "lightgray" }}
            Component={() => (
              <View style={{}}>
                {Object.values(INVENTORY_CATEGORIES.main).map((i, idx) => (
                  <Button
                    text={i}
                    onPress={() => {
                      zItem.catMain = i;
                      setItem(zItem, null);
                      _setCatModalVisible(false);
                    }}
                    buttonStyle={{
                      backgroundColor: Colors.opacityBackgroundLight,
                      borderTopWidth: idx != 0 ? 2 : 0,
                      borderTopColor: "lightgray",
                    }}
                  />
                ))}
              </View>
            )}
          />
          <Text style={{ marginLeft: 10 }}>{zItem.catMain}</Text>
        </View>

        {zItem.catMain != INVENTORY_CATEGORIES.main.labor && (
          <View style={{ flexDirection: "row" }}>
            <Text
              style={{
                width: 70,
                marginTop: 0,
                fontSize: 12,
                marginRight: 10,
              }}
            >
              Barcode:
            </Text>

            <TextInput
              autoFocus={zFocus === FOCUS_NAMES.upc}
              onClick={() => _zSetFocus(FOCUS_NAMES.upc)}
              style={{ fontSize: 16, color: "black", marginTop: 0 }}
              value={zItem.upc}
              onChangeText={(val) => {
                zItem.upc = val;
                setItem(zItem, FOCUS_NAMES.upc);
              }}
            />
          </View>
        )}
        <View
          style={{ flexDirection: "row", alignItems: "center", marginTop: 10 }}
        >
          <Button text={"Save"} onPress={handleSubmitPress} />
          <Button text={"Cancel Changes"} onPress={handleCancelPress} />
        </View>
      </View>
    </TouchableWithoutFeedback>
  );
};

global.test = 1;
export const CustomerInfoComponent = ({
  sCustomerInfo = CUSTOMER_PROTO,
  ssCreateCustomerBtnText,
  ssCancelButtonText,
  ssInfoTextFocus,
  __setInfoTextFocus,
  __handleCreateCustomerPress,
  __handleCancelButtonPress,
  __setCustomerInfo,
}) => {
  const TEXT_INPUT_STYLE = {
    width: 200,
    height: 40,
    borderColor: "gray",
    borderWidth: 1,
    marginLeft: 20,
    marginTop: 10,
    paddingHorizontal: 3,
  };

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
              sCustomerInfo.phone.cell = val;
              __setCustomerInfo(sCustomerInfo);
            }}
            placeholderTextColor="darkgray"
            placeholder="Cell phone"
            style={{ ...TEXT_INPUT_STYLE }}
            value={sCustomerInfo.phone.cell}
            autoComplete="none"
            autoFocus={ssInfoTextFocus === FOCUS_NAMES.cell}
            onFocus={() => __setInfoTextFocus(FOCUS_NAMES.cell)}
          />
          <TextInput
            onChangeText={(val) => {
              sCustomerInfo.phone.landline = val;
              __setCustomerInfo(sCustomerInfo);
            }}
            placeholderTextColor="darkgray"
            placeholder="Landline"
            style={{ ...TEXT_INPUT_STYLE }}
            value={sCustomerInfo.phone.landline}
            autoComplete="none"
            autoFocus={ssInfoTextFocus === FOCUS_NAMES.land}
            onFocus={() => __setInfoTextFocus(FOCUS_NAMES.land)}
          />
          <TextInput
            onChangeText={(val) => {
              sCustomerInfo.first = val;
              __setCustomerInfo(sCustomerInfo);
            }}
            placeholderTextColor="darkgray"
            placeholder="First name"
            style={{ ...TEXT_INPUT_STYLE }}
            value={sCustomerInfo.first}
            autoComplete="none"
            autoFocus={ssInfoTextFocus === FOCUS_NAMES.first}
            onFocus={() => __setInfoTextFocus(FOCUS_NAMES.first)}
          />
          <TextInput
            onChangeText={(val) => {
              sCustomerInfo.last = val;
              __setCustomerInfo(sCustomerInfo);
            }}
            placeholderTextColor="darkgray"
            placeholder="Last name"
            style={{ ...TEXT_INPUT_STYLE }}
            value={sCustomerInfo.last}
            autoComplete="none"
            autoFocus={ssInfoTextFocus === FOCUS_NAMES.last}
            onFocus={() => __setInfoTextFocus(FOCUS_NAMES.last)}
          />
          <TextInput
            onChangeText={(val) => {
              sCustomerInfo.email = val;
              __setCustomerInfo(sCustomerInfo);
            }}
            placeholderTextColor="darkgray"
            placeholder="Email address"
            style={{ ...TEXT_INPUT_STYLE }}
            value={sCustomerInfo.email}
            autoComplete="none"
            autoFocus={ssInfoTextFocus === FOCUS_NAMES.email}
            onFocus={() => __setInfoTextFocus(FOCUS_NAMES.email)}
          />
          <TextInput
            onChangeText={(val) => {
              sCustomerInfo.address.streetAddress = val;
              __setCustomerInfo(sCustomerInfo);
            }}
            placeholderTextColor="darkgray"
            placeholder="Street address"
            style={{ ...TEXT_INPUT_STYLE }}
            value={sCustomerInfo.address.streetAddress}
            autoComplete="none"
            autoFocus={ssInfoTextFocus === FOCUS_NAMES.street}
            onFocus={() => __setInfoTextFocus(FOCUS_NAMES.street)}
          />
          <TextInput
            onChangeText={(val) => {
              sCustomerInfo.address.unit = val;
              __setCustomerInfo(sCustomerInfo);
            }}
            placeholderTextColor="darkgray"
            placeholder="Unit"
            style={{ ...TEXT_INPUT_STYLE }}
            value={sCustomerInfo.address.unit}
            autoComplete="none"
            autoFocus={ssInfoTextFocus === FOCUS_NAMES.unit}
            onFocus={() => __setInfoTextFocus(FOCUS_NAMES.unit)}
          />
          <TextInput
            onChangeText={(val) => {
              sCustomerInfo.address.city = val;
              __setCustomerInfo(sCustomerInfo);
            }}
            placeholderTextColor="darkgray"
            placeholder="City"
            style={{ ...TEXT_INPUT_STYLE }}
            value={sCustomerInfo.address.city}
            autoComplete="none"
            autoFocus={ssInfoTextFocus === FOCUS_NAMES.city}
            onFocus={() => __setInfoTextFocus(FOCUS_NAMES.city)}
          />
          <TextInput
            onChangeText={(val) => {
              sCustomerInfo.address.state = val;
              __setCustomerInfo(sCustomerInfo);
            }}
            placeholderTextColor="darkgray"
            placeholder="State"
            style={{ ...TEXT_INPUT_STYLE }}
            value={sCustomerInfo.address.state}
            autoComplete="none"
            autoFocus={ssInfoTextFocus === FOCUS_NAMES.state}
            onFocus={() => __setInfoTextFocus(FOCUS_NAMES.state)}
          />
          <TextInput
            onChangeText={(val) => {
              sCustomerInfo.address.zip = val;
              __setCustomerInfo(sCustomerInfo);
            }}
            placeholderTextColor="darkgray"
            placeholder="Zip code"
            style={{ ...TEXT_INPUT_STYLE }}
            value={sCustomerInfo.address.zip}
            autoComplete="none"
            autoFocus={ssInfoTextFocus === FOCUS_NAMES.zip}
            onFocus={() => __setInfoTextFocus(FOCUS_NAMES.zip)}
          />
          <TextInput
            onChangeText={(val) => {
              sCustomerInfo.address.notes = val;
              __setCustomerInfo(sCustomerInfo);
            }}
            placeholderTextColor="darkgray"
            placeholder="Address notes"
            style={{ ...TEXT_INPUT_STYLE }}
            value={sCustomerInfo.address.notes}
            autoComplete="none"
            autoFocus={ssInfoTextFocus === FOCUS_NAMES.notes}
            onFocus={() => __setInfoTextFocus(FOCUS_NAMES.notes)}
          />
          <CheckBox
            label={"Call Only"}
            isChecked={sCustomerInfo.phone.callOnlyOption}
            onCheck={() => {
              __setInfoTextFocus(null);
              sCustomerInfo.phone.callOnlyOption =
                !sCustomerInfo.phone.callOnlyOption;
              if (
                sCustomerInfo.phone.emailOnlyOption &&
                sCustomerInfo.phone.callOnlyOption
              )
                sCustomerInfo.phone.emailOnlyOption = false;
              __setCustomerInfo(sCustomerInfo);
            }}
          />
          <CheckBox
            label={"Email Only"}
            isChecked={sCustomerInfo.phone.emailOnlyOption}
            onCheck={() => {
              __setInfoTextFocus(null);
              sCustomerInfo.phone.emailOnlyOption =
                !sCustomerInfo.phone.emailOnlyOption;
              if (
                sCustomerInfo.phone.callOnlyOption &&
                sCustomerInfo.phone.emailOnlyOption
              )
                sCustomerInfo.phone.callOnlyOption = false;
              __setCustomerInfo(sCustomerInfo);
            }}
          />
          <View
            style={{ flexDirection: "row", justifyContent: "space-between" }}
          >
            <Button
              onPress={__handleCreateCustomerPress}
              viewStyle={{
                marginTop: 30,
                marginLeft: 20,
                backgroundColor: "lightgray",
                height: 40,
                width: 200,
              }}
              textStyle={{ color: "dimgray" }}
              text={ssCreateCustomerBtnText}
            />
            {
              <Button
                onPress={__handleCancelButtonPress}
                viewStyle={{
                  marginTop: 30,
                  marginLeft: 20,
                  backgroundColor: "lightgray",
                  height: 40,
                  width: 200,
                }}
                textStyle={{ color: "dimgray" }}
                text={ssCancelButtonText}
              />
            }
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
};

// export const

export const SHADOW_RADIUS_PROTO = {
  shadowColor: "black",
  shadowOffset: { width: 3, height: 3 },
  shadowOpacity: 0.25,
  shadowRadius: 1,
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

export const Button = ({
  ref,
  onPress,
  onLongPress,
  text,
  numLines = null,
  mouseOverOptions = {
    enable: true,
    opacity: 0.7,
    highlightColor: Colors.tabMenuButton,
  },
  shadow = true,
  allCaps = false,
  buttonStyle = {},
  textStyle = {},
}) => {
  const [sMouseOver, _setMouseOver] = React.useState(false);
  if (allCaps) text = text.toUpperCase();
  let shadowStyle = { ...SHADOW_RADIUS_PROTO };
  if (!shadow) shadowStyle = {};
  /////////////////////////////////////////////////////
  //////////////////////////////////////////////////////
  return (
    <TouchableOpacity
      ref={ref}
      onMouseOver={() => (mouseOverOptions.enable ? _setMouseOver(true) : null)}
      onMouseLeave={() => {
        _setMouseOver(false);
      }}
      onPress={onPress}
    >
      <View
        style={{
          alignItems: "center",
          justifyContent: "center",
          width: 130,
          height: 50,
          ...shadowStyle,
          ...buttonStyle,
          backgroundColor: sMouseOver
            ? mouseOverOptions.highlightColor
            : buttonStyle.backgroundColor,
          opacity: sMouseOver ? mouseOverOptions.opacity : buttonStyle.opacity,
        }}
      >
        <Text
          numberOfLines={numLines}
          style={{
            paddingHorizontal: 10,
            paddingVertical: 5,
            textAlign: "center",
            textAlignVertical: "center",
            fontSize: 17,
            ...textStyle,
            color: sMouseOver ? "white" : textStyle.color,
          }}
        >
          {text || "Button"}
        </Text>
      </View>
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
}) => {
  return (
    <Button
      onLongPress={onLongPress}
      onPress={onPress}
      text={text}
      textStyle={{
        textColor: Colors.tabMenuButtonText,
        color: "whitesmoke",
        fontSize: 15,
        ...textStyle,
      }}
      buttonStyle={{
        height: 30,
        // width: 130,
        backgroundColor: Colors.tabMenuButton,
        opacity: isSelected ? 1 : 0.45,
        paddingHorizontal: 15,
        width: null,
        paddingVertical: 5,
        ...SHADOW_RADIUS_PROTO,
        shadowOffset: { width: 0, height: 2 },
        ...buttonStyle,
      }}
    />
  );
};

export const CheckBox = ({
  text,
  onCheck,
  item,
  makeEntireViewCheckable = true,
  roundButton = false,
  handleCheckInternal = false,
  isChecked = false,
  buttonStyle = {},
  outerButtonStyle = {},
  textStyle = {},
  viewStyle = {},
  mouseOverOptions = {
    enable: true,
    opacity: 0.7,
    highlightColor: "dimgrey",
  },
}) => {
  const [sMouseOver, _setMouseOver] = React.useState(false);
  const [sIsChecked, _setIsChecked] = useState(false);
  const rgbText = "rgba(50,50,50,1)";
  if (roundButton) buttonStyle = { ...buttonStyle, borderRadius: 100 };

  let backgroundColor;
  if (sMouseOver) {
    if (!isChecked && !sIsChecked) {
      if (mouseOverOptions.enable) {
        if (mouseOverOptions.highlightColor) {
          backgroundColor = mouseOverOptions.highlightColor;
        } else {
          backgroundColor = "lightgray";
        }
      }
    }
  } else {
    backgroundColor =
      isChecked || sIsChecked ? Colors.tabMenuButton : "lightgray";
  }

  let dim = 25;
  return (
    <TouchableOpacity
      onPress={() => {
        if (makeEntireViewCheckable) {
          if (handleCheckInternal) {
            _setIsChecked(!sIsChecked);
            onCheck(item, !sIsChecked);
          } else {
            onCheck(item);
          }
        }
      }}
    >
      <View
        onMouseOver={() =>
          mouseOverOptions.enable ? _setMouseOver(true) : null
        }
        onMouseLeave={() => {
          _setMouseOver(false);
        }}
        style={{
          flexDirection: "row",
          justifyContent: "flex-start",
          alignItems: "center",
          ...viewStyle,
        }}
      >
        <TouchableOpacity
          onPress={() => {
            if (handleCheckInternal) {
              _setIsChecked(!sIsChecked);
              onCheck(item, !sIsChecked);
            } else {
              onCheck(item);
            }
          }}
          style={{
            width: buttonStyle.width || dim,
            height: buttonStyle.height || dim,
            borderRadius: 100,
            flexDirection: "row",
            justifyContent: "center",
            justifyItems: "center",
            alignItems: "center",
            paddingLeft: 7,
            ...outerButtonStyle,
          }}
        >
          <View
            style={{
              width: dim - 10,
              height: dim - 10,
              opacity: isChecked ? 1 : 0.4,
              backgroundColor,
              marginRight: 7,
              ...buttonStyle,
            }}
          />
        </TouchableOpacity>
        <Text style={{ fontSize: 14, color: rgbText, ...textStyle }}>
          {text}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

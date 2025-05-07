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
import React, { Component } from "react";
import { log } from "./utils";
import { Colors } from "./styles";
import { useState } from "react";
import {
  BIKE_COLORS,
  BIKE_COLORS_ARR,
  DISCOUNTS,
  FOCUS_NAMES,
  INVENTORY_ITEM,
} from "./data";
import { cloneDeep } from "lodash";
import { CUSTOMER } from "./data";

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
    ...shadow_radius,
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
  canExitOnOuterClick = true,
  buttonLabel,
  buttonStyle = {},
  handleButtonPress = () => {},
  containerStyle = {},
  buttonTextStyle = {},
  Component,
  shadowProps = {
    shadowColor: "black",
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  modalStyle,
  showModal = false,
  overrideShow = false,
  onModalDismiss = () => {},
}) => {
  const [sIsModalVisible, _modalVisible] = useState(overrideShow);

  return (
    <TouchableWithoutFeedback
      onPress={
        canExitOnOuterClick ? () => _modalVisible(!sIsModalVisible) : null
      }
    >
      <View style={{ ...styles.container, ...containerStyle }}>
        <TouchableOpacity
          style={{
            alignItems: "center",
            justifyContent: "center",
            ...shadowProps,
            ...buttonStyle,
          }}
          onPress={() => {
            _modalVisible(!sIsModalVisible);
            handleButtonPress();
          }}
        >
          <Text
            style={{
              color: "white",
              textAlign: "center",
              fontSize: 15,
              ...buttonTextStyle,
            }}
          >
            {buttonLabel}
          </Text>
        </TouchableOpacity>

        <Modal
          onDismiss={() => {
            _modalVisible(false);
            onModalDismiss();
          }}
          visible={sIsModalVisible && showModal}
          transparent
        >
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(0, 0, 0, 0.5)",
              justifyContent: "center",
              alignItems: "center",
              alignSelf: "center",
              justifySelf: "center",
              ...modalStyle,
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
  closeButtonText,
  removeButtonText,
  itemListStyle = {},
  buttonStyle = {},
  containerStyle = {},
  modalStyle = {},
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
    <TouchableWithoutFeedback onPress={() => toggleModal()}>
      <View style={{ ...styles.container, ...containerStyle }}>
        <TouchableOpacity
          style={{
            backgroundColor: Colors.blueButtonBackground,
            borderRadius: 2,
            margin: 2,
            paddingHorizontal: 6,
            paddingVertical: 1,
            alignItems: "center",
            justifyContent: "center",
            // opacity: 0.6,
            shadowColor: "black",
            shadowOffset: { width: 3, height: 3 },
            shadowOpacity: 0.3,
            shadowRadius: 5,
            // ...itemListStyle,
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

        <Modal style={{ width: "50%" }} visible={isModalVisible} transparent>
          <View
            style={{
              width: "50%",
              alignSelf: "center",
              justifySelf: "center",
              flex: 1,
              ...modalStyle,
            }}
          >
            <View style={styles.modalBackground}>
              <TouchableWithoutFeedback>
                <View style={styles.modalContent}>
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
          </View>
        </Modal>
      </View>
    </TouchableWithoutFeedback>
  );
};

export const InventoryItemInModal = ({ item = INVENTORY_ITEM }) => {
  return (
    <View
      style={{
        width: "80%",
        height: "40%",
        backgroundColor: Colors.opacityBackgroundLight,
        ...shadow_radius,
        shadowOffset: { width: 10, height: 10 },
        padding: 15,
        // alignItems: "center",
      }}
    >
      <View
        style={{
          width: "100%",
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        <Text
          numberOfLines={3}
          style={{
            //   marginTop: 10,
            fontSize: 16,
            color: "whitesmoke",
          }}
        >
          {item.name}
        </Text>
        <Text style={{ color: "red", fontSize: 13 }}>
          {"$ "}
          <Text style={{ fontSize: 16 }}>{item.price}</Text>
        </Text>
      </View>
      <View
        style={{ flexDirection: "row", alignItems: "center", marginTop: 20 }}
      >
        <Text
          style={{ width: 70, marginTop: 0, fontSize: 12, marginRight: 10 }}
        >
          Category:
        </Text>
        <Text style={{ fontSize: 16, color: "lightgray", marginVertical: 0 }}>
          {item.catMain}
        </Text>
      </View>
      <View
        style={{ flexDirection: "row", alignItems: "center", marginTop: 10 }}
      >
        <Text
          style={{ width: 70, marginTop: 0, fontSize: 12, marginRight: 10 }}
        >
          Description:
        </Text>

        <Text style={{ fontSize: 16, color: "lightgray", marginTop: 0 }}>
          {item.catDescrip}
        </Text>
      </View>
      <View
        style={{ flexDirection: "row", alignItems: "center", marginTop: 10 }}
      >
        <Text
          style={{ width: 70, marginTop: 0, fontSize: 12, marginRight: 10 }}
        >
          Location:
        </Text>

        <Text style={{ fontSize: 16, color: "lightgray", marginTop: 0 }}>
          {item.catLocation}
        </Text>
      </View>
      <View
        style={{ flexDirection: "row", alignItems: "center", marginTop: 10 }}
      >
        <Text
          style={{ width: 70, marginTop: 0, fontSize: 12, marginRight: 10 }}
        >
          Barcode:
        </Text>

        <Text style={{ fontSize: 16, color: "lightgray", marginTop: 0 }}>
          {item.upc}
        </Text>
      </View>
      <View
        style={{ flexDirection: "row", alignItems: "center", marginTop: 10 }}
      >
        <Text
          style={{ width: 70, marginTop: 0, fontSize: 12, marginRight: 10 }}
        >
          Vendor ID:
        </Text>

        <Text style={{ fontSize: 16, color: "lightgray", marginTop: 0 }}>
          {item.vendorID}
        </Text>
      </View>
    </View>
  );
};

global.test = 1;
export const CustomerInfoComponent = ({
  sCustomerInfo = CUSTOMER,
  _setCustomerInfo,
  handleExitScreenPress,
  exitScreenButtonText,
  ssInfoTextFocus,
  __setInfoTextFocus,
  __closeButtonText,
  __handleCloseButtonPress,
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
              _setCustomerInfo(sCustomerInfo);
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
              _setCustomerInfo(sCustomerInfo);
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
              _setCustomerInfo(sCustomerInfo);
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
              _setCustomerInfo(sCustomerInfo);
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
              _setCustomerInfo(sCustomerInfo);
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
              _setCustomerInfo(sCustomerInfo);
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
              _setCustomerInfo(sCustomerInfo);
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
              _setCustomerInfo(sCustomerInfo);
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
              _setCustomerInfo(sCustomerInfo);
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
              _setCustomerInfo(sCustomerInfo);
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
              _setCustomerInfo(sCustomerInfo);
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
              _setCustomerInfo(sCustomerInfo);
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
              _setCustomerInfo(sCustomerInfo);
            }}
          />
          <View
            style={{ flexDirection: "row", justifyContent: "space-between" }}
          >
            <Button
              onPress={handleExitScreenPress}
              viewStyle={{
                marginTop: 30,
                marginLeft: 20,
                backgroundColor: "lightgray",
                height: 40,
                width: 200,
              }}
              textStyle={{ color: "dimgray" }}
              text={exitScreenButtonText}
            />
            {
              <Button
                onPress={__handleCloseButtonPress}
                viewStyle={{
                  marginTop: 30,
                  marginLeft: 20,
                  backgroundColor: "lightgray",
                  height: 40,
                  width: 200,
                }}
                textStyle={{ color: "dimgray" }}
                text={__closeButtonText}
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

export const shadow_radius = {
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
  onPress,
  onLongPress,
  height,
  width,
  backgroundColor,
  textColor,
  text,
  fontSize,
  font,
  caps = false,
  viewStyle = {},
  textStyle = {},
}) => {
  if (caps) text = text.toUpperCase();
  return (
    <TouchableOpacity
      onLongPress={onLongPress}
      onPress={
        onPress ||
        (() => {
          log("button pressed no function handed to Button in components file");
        })
      }
    >
      <View
        style={{
          ...centerItem,
          width: width || null,
          height: height || null,
          backgroundColor: backgroundColor || "blue",
          ...viewStyle,
        }}
      >
        <Text
          style={{
            fontSize: fontSize || null,
            color: textColor || "gray",
            ...textStyle,
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
  viewStyle,
  textStyle,
  isSelected,
  onLongPress,
}) => {
  return (
    <Button
      onLongPress={onLongPress}
      textStyle={{ textColor: Colors.tabMenuButtonText }}
      viewStyle={{
        viewStyle,
        opacity: isSelected ? 1 : 0.45,
        paddingHorizontal: 20,
        paddingVertical: 5,
        ...shadow_radius,
        shadowOffset: { width: 0, height: 2 },
      }}
      onPress={onPress}
      text={text}
      backgroundColor={Colors.tabMenuButton}
      textColor={Colors.tabMenuButtonText}
    />
  );
};

export const CheckBox = ({
  label,
  onCheck,
  buttonStyle = {},
  labelStyle = {},
  viewStyle = {},
  isChecked = false,
}) => (
  <View
    style={{
      flexDirection: "row",
      justifyContent: "flex-start",
      width: 150,
      height: 30,
      borderWidth: 1,
      ...viewStyle,
    }}
  >
    <TouchableOpacity
      onPress={onCheck}
      style={{
        width: "20%",
        backgroundColor: isChecked ? "red" : "lightgray",
        ...buttonStyle,
      }}
    />
    <Text>{label}</Text>
  </View>
);

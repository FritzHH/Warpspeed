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
import React from "react";
import { log } from "./utils";
import { Colors } from "./styles";
import { useState } from "react";
import {
  BIKE_COLORS,
  BIKE_COLORS_ARR,
  DISCOUNTS,
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

export const ScreenModal = ({
  buttonLabel,
  buttonStyle = {
    backgroundColor: "green",
  },
  handleButtonPress,
  containerStyle = {},
  textStyle = {},
  Component,
  shadowProps,
  modalProps,
}) => {
  const [sIsModalVisible, _modalVisible] = useState(false);

  const toggleModal = () => _modalVisible(!sIsModalVisible);

  // toggleModal();

  return (
    <TouchableWithoutFeedback onPress={() => toggleModal()}>
      <View style={{ ...styles.container, ...containerStyle }}>
        <TouchableOpacity
          style={{
            // backgroundColor: Colors.blueButtonBackground,
            borderRadius: 2,
            margin: 2,
            paddingHorizontal: 6,
            paddingVertical: 0,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: "black",
            shadowOffset: { width: 2, height: 2 },
            shadowOpacity: 0.3,
            shadowRadius: 5,
            ...buttonStyle,
          }}
          onPress={() => {
            toggleModal();
            handleButtonPress();
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
        </TouchableOpacity>

        <Modal visible={sIsModalVisible} transparent>
          <View
            style={{
              justifySelf: "center",
              alignSelf: "center",
              flex: 1,
              width: "50%",
              height: "100%",
              ...modalProps,

              // ...modalStyle,
            }}
          >
            <View
              style={{
                flex: 1,
                backgroundColor: "rgba(0, 0, 0, 0.5)",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Component />
            </View>
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

export const CustomerInfoComponent = ({
  __setInfoComponentName,
  ssInfoComponentName,
  __setCustomerObj,
  ssCustomerObj,
  // sCustomerInfo,
  // _setCustomerInfo,
}) => {
  const [sBox1Val, _setBox1Val] = React.useState("");
  const [sBox2Val, _setBox2Val] = React.useState("");
  const [sShowCustomerModal, _setShowCustomerModal] = React.useState(false);
  const [sSearchingByName, _setSearchingByName] = React.useState(false);
  const [sFoundExistingCustomer, _setFoundExistingCustomer] =
    React.useState(false);
  const [sCustomerInfo, _setCustomerInfo] = React.useState(cloneDeep(CUSTOMER));

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
          />
          <TextInput
            onChangeText={(val) => {
              sCustomerInfo.last(val);
              _setCustomerInfo(sCustomerInfo);
            }}
            placeholderTextColor="darkgray"
            placeholder="Last name"
            style={{ ...TEXT_INPUT_STYLE }}
            value={sCustomerInfo.last}
            autoComplete="none"
          />
          <TextInput
            onChangeText={(val) => {
              sCustomerInfo.email(val);
              _setCustomerInfo(sCustomerInfo);
            }}
            placeholderTextColor="darkgray"
            placeholder="Email address"
            style={{ ...TEXT_INPUT_STYLE }}
            value={sCustomerInfo.email}
            autoComplete="none"
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
          />
          <TextInput
            onChangeText={(val) => {
              sCustomerInfo.address.notes(val);
              _setCustomerInfo(sCustomerInfo);
            }}
            placeholderTextColor="darkgray"
            placeholder="Address notes"
            style={{ ...TEXT_INPUT_STYLE }}
            value={sCustomerInfo.address.notes}
            autoComplete="none"
          />
          <Button
            onPress={() => {
              log("pressed");
            }}
            viewStyle={{
              marginTop: 30,
              marginLeft: 20,
              backgroundColor: "lightgray",
              height: 40,
              width: 200,
            }}
            textStyle={{ color: "dimgray" }}
            text={"Create New Customer"}
          />
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

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
import React, { Component, useEffect, useRef } from "react";
import { generateRandomID, log } from "./utils";
import { Colors } from "./styles";
import { useState } from "react";
import {
  bike_colors_db,
  bike_colors_arr_db,
  discounts_db,
  FOCUS_NAMES,
  INVENTORY_ITEM_PROTO,
  INVENTORY_CATEGORIES,
  SETTINGS_PROTO,
} from "./data";
import { cloneDeep, round } from "lodash";
import { CUSTOMER_PROTO } from "./data";
import {
  useCurrentUserStore,
  useInvModalStore,
  USER_ACTION_GLOBAL,
  useSettingsStore,
} from "./stores";

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
  // canExitOnOuterModalClick = true,
  handleOuterClick = () => {},
}) => {
  const [sModalCoordinates, _setModalCoordinates] = useState({ x: 0, y: 0 });
  const [sMouseOver, _setMouseOver] = React.useState(false);
  const [sInternalModalShow, _setInternalModalShow] = useState(false);

  //////////////////////////////////////////////////////////////
  if (modalCoordinateVars.y < 0) modalCoordinateVars.y = 0;
  // log("ref in ScreenModal", ref);
  useEffect(() => {
    const el = ref ? ref.current : null;
    if (el) {
      let rect = el.getBoundingClientRect();
      _setModalCoordinates({ x: rect.x, y: rect.y });
    }
  }, []);

  if (showButtonIcon && !buttonIcon) buttonIcon = "\u21b4";
  if (allCaps) buttonLabel = buttonLabel.toUpperCase();
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
  textStyle = {},
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
    <TouchableWithoutFeedback onPress={() => toggleModal()}>
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

export const InventoryItemInModal = ({
  item,
  quickItemButtonNames,
  quickItemButtonAssignments,
  handleClosePress,
  handleCreateItemPressed,
  handleDeleteItemPressed,
  handleChangeItem,
  handleQuickButtonAdd,
  handleQuickButtonRemove,
}) => {
  const _zSetFocus = useInvModalStore((state) => state.setFocus);
  ///
  const zFocus = useInvModalStore((state) => state.getFocus());

  ////////////////////////////////////////////////////////////////////
  const [sNewItem, _setNewItem] = useState(INVENTORY_ITEM_PROTO);
  const isMounted = useRef(false);
  if (!item) return null;
  // log("names", quickItemButtonNames);
  const isNewItem = item.upc && !item.id;
  useEffect(() => {
    if (!item) return;
    if (!isMounted.current) {
      isMounted.current = true;
      // _zModItem(item);
    }
    return () => {
      isMounted.current = false;
      // _zModItem(INVENTORY_ITEM_PROTO);
    };
  }, []);

  const FOCUS_NAMES = {
    formalName: "name",
    informalName: "informalName",
    price: "price",
    category: "category",
    sale: "sale",
    upc: "upc",
  };

  function changeItem(item, focusName) {
    // _zSetFocus(focusName);
    // log("item", item);
    handleChangeItem(item);
  }

  function handleNewItemPress() {
    let item = { ...sNewItem, id: generateRandomID() };
    handleCreateItemPressed(item);
    handleClosePress();
  }

  function handleRemoveItem() {
    handleDeleteItemPressed(item);
    handleClosePress();
  }

  function handleCancelPress() {
    handleClosePress();
  }
  return (
    <TouchableWithoutFeedback
      onLongPress={() => {
        () => handleRemoveItem();
      }}
    >
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
        <View
          style={{
            width: "100%",
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <View>
            <Text>Catalog Name</Text>
            <TextInput
              numberOfLines={3}
              style={{
                marginTop: 10,
                fontSize: 16,
                color: "black",
                borderWidth: 1,
              }}
              // selection={{ start: 2, end:  }}
              autoFocus={zFocus === FOCUS_NAMES.formalName}
              onClick={() => _zSetFocus(FOCUS_NAMES.formalName)}
              onChangeText={(val) => {
                let newItem = { ...item };
                newItem.formalName = val;
                isNewItem
                  ? _setNewItem(newItem)
                  : changeItem(newItem, FOCUS_NAMES.formalName);
              }}
              value={isNewItem ? sNewItem.formalName : item.formalName}
            />
            <Text>Keyword Name</Text>
            <TextInput
              numberOfLines={3}
              style={{
                marginTop: 10,
                fontSize: 16,
                color: "black",
                borderWidth: 1,
              }}
              autoFocus={zFocus === FOCUS_NAMES.informalName}
              onClick={() => _zSetFocus(FOCUS_NAMES.informalName)}
              onChangeText={(val) => {
                let newItem = { ...item };
                newItem.informalName = val;
                isNewItem
                  ? _setNewItem(newItem)
                  : changeItem(newItem, FOCUS_NAMES.informalName);
              }}
              value={isNewItem ? sNewItem.informalName : item.informalName}
            />
          </View>
          <View>
            <Text style={{ color: "red", fontSize: 13 }}>
              {"Regular $ "}
              <TextInput
                autoFocus={zFocus === FOCUS_NAMES.price}
                onClick={() => _zSetFocus(FOCUS_NAMES.price)}
                onChangeText={(val) => {
                  let newItem = { ...item };
                  newItem.price = val;
                  isNewItem
                    ? _setNewItem(newItem)
                    : changeItem(newItem, FOCUS_NAMES.price);
                }}
                value={isNewItem ? sNewItem.price : item.price}
                style={{ fontSize: 16 }}
              />
            </Text>
            <Text style={{ alignSelf: "flex-end", color: "red", fontSize: 13 }}>
              {"Sale $ "}
              <TextInput
                autoFocus={zFocus === FOCUS_NAMES.sale}
                onClick={() => _zSetFocus(FOCUS_NAMES.sale)}
                onChangeText={(val) => {
                  let newItem = { ...item };
                  newItem.salePrice = val;
                  isNewItem
                    ? _setNewItem(newItem)
                    : changeItem(newItem, FOCUS_NAMES.sale);
                }}
                value={isNewItem ? sNewItem.salePrice : item.salePrice}
                style={{ fontSize: 16 }}
              />
            </Text>
          </View>
        </View>
        <View
          style={{ flexDirection: "row", alignItems: "center", marginTop: 20 }}
        >
          <Text style={{ marginLeft: 10 }}>{item.catMain}</Text>
        </View>

        {item.category !== INVENTORY_CATEGORIES.labor ? (
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
              value={item.upc}
              onChangeText={(val) => {
                let newItem = { ...item };
                item.upc = val;
                isNewItem
                  ? _setNewItem(newItem)
                  : changeItem(newItem, FOCUS_NAMES.upc);
              }}
            />
          </View>
        ) : null}

        {isNewItem ? (
          <Button text={"Create Item"} onPress={handleNewItemPress} />
        ) : null}
        <ModalDropdown
          buttonLabel={"Quick Items"}
          buttonStyle={{ width: 200 }}
          data={
            quickItemButtonNames ? quickItemButtonNames.map((o) => o.name) : []
          }
          onSelect={(itemName) => handleQuickButtonAdd(itemName, item)}
        />
        <FlatList
          data={quickItemButtonAssignments}
          renderItem={(item) => {
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
      </View>
    </TouchableWithoutFeedback>
  );
};

export const CustomerInfoComponent = ({
  sCustomerInfo = CUSTOMER_PROTO,
  button1Text,
  button2Text,
  ssInfoTextFocus,
  __setInfoTextFocus,
  handleButton1Press,
  handleButton2Press,
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

  sCustomerInfo = { ...sCustomerInfo };
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
              sCustomerInfo.cell = val;
              __setCustomerInfo(sCustomerInfo);
            }}
            placeholderTextColor="darkgray"
            placeholder="Cell phone"
            style={{ ...TEXT_INPUT_STYLE }}
            value={sCustomerInfo.cell}
            autoComplete="none"
            autoFocus={ssInfoTextFocus === FOCUS_NAMES.cell}
            onFocus={() => __setInfoTextFocus(FOCUS_NAMES.cell)}
          />
          <TextInput
            onChangeText={(val) => {
              sCustomerInfo.landline = val;
              __setCustomerInfo(sCustomerInfo);
            }}
            placeholderTextColor="darkgray"
            placeholder="Landline"
            style={{ ...TEXT_INPUT_STYLE }}
            value={sCustomerInfo.landline}
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
              sCustomerInfo.streetAddress = val;
              __setCustomerInfo(sCustomerInfo);
            }}
            placeholderTextColor="darkgray"
            placeholder="Street address"
            style={{ ...TEXT_INPUT_STYLE }}
            value={sCustomerInfo.streetAddress}
            autoComplete="none"
            autoFocus={ssInfoTextFocus === FOCUS_NAMES.street}
            onFocus={() => __setInfoTextFocus(FOCUS_NAMES.street)}
          />
          <TextInput
            onChangeText={(val) => {
              sCustomerInfo.unit = val;
              __setCustomerInfo(sCustomerInfo);
            }}
            placeholderTextColor="darkgray"
            placeholder="Unit"
            style={{ ...TEXT_INPUT_STYLE }}
            value={sCustomerInfo.unit}
            autoComplete="none"
            autoFocus={ssInfoTextFocus === FOCUS_NAMES.unit}
            onFocus={() => __setInfoTextFocus(FOCUS_NAMES.unit)}
          />
          <TextInput
            onChangeText={(val) => {
              sCustomerInfo.city = val;
              __setCustomerInfo(sCustomerInfo);
            }}
            placeholderTextColor="darkgray"
            placeholder="City"
            style={{ ...TEXT_INPUT_STYLE }}
            value={sCustomerInfo.city}
            autoComplete="none"
            autoFocus={ssInfoTextFocus === FOCUS_NAMES.city}
            onFocus={() => __setInfoTextFocus(FOCUS_NAMES.city)}
          />
          <TextInput
            onChangeText={(val) => {
              sCustomerInfo.state = val;
              __setCustomerInfo(sCustomerInfo);
            }}
            placeholderTextColor="darkgray"
            placeholder="State"
            style={{ ...TEXT_INPUT_STYLE }}
            value={sCustomerInfo.state}
            autoComplete="none"
            autoFocus={ssInfoTextFocus === FOCUS_NAMES.state}
            onFocus={() => __setInfoTextFocus(FOCUS_NAMES.state)}
          />
          <TextInput
            onChangeText={(val) => {
              sCustomerInfo.zip = val;
              __setCustomerInfo(sCustomerInfo);
            }}
            placeholderTextColor="darkgray"
            placeholder="Zip code"
            style={{ ...TEXT_INPUT_STYLE }}
            value={sCustomerInfo.zip}
            autoComplete="none"
            autoFocus={ssInfoTextFocus === FOCUS_NAMES.zip}
            onFocus={() => __setInfoTextFocus(FOCUS_NAMES.zip)}
          />
          <TextInput
            onChangeText={(val) => {
              sCustomerInfo.notes = val;
              __setCustomerInfo(sCustomerInfo);
            }}
            placeholderTextColor="darkgray"
            placeholder="Address notes"
            style={{ ...TEXT_INPUT_STYLE }}
            value={sCustomerInfo.notes}
            autoComplete="none"
            autoFocus={ssInfoTextFocus === FOCUS_NAMES.notes}
            onFocus={() => __setInfoTextFocus(FOCUS_NAMES.notes)}
          />
          <CheckBox
            label={"Call Only"}
            isChecked={sCustomerInfo.contactRestriction === "CALL"}
            onCheck={() => {
              __setInfoTextFocus(null);
              if (sCustomerInfo.contactRestriction === "CALL") {
                sCustomerInfo.contactRestriction = "";
              } else {
                sCustomerInfo.contactRestriction = "CALL";
              }
              __setCustomerInfo(sCustomerInfo);
            }}
          />
          <CheckBox
            label={"Email Only"}
            isChecked={sCustomerInfo.contactRestriction === "EMAIL"}
            onCheck={() => {
              __setInfoTextFocus(null);
              // sCustomerInfo.emailOnlyOption = !sCustomerInfo.emailOnlyOption;
              // if (sCustomerInfo.callOnlyOption && sCustomerInfo.emailOnlyOption)
              //   sCustomerInfo.callOnlyOption = false;
              if (sCustomerInfo.contactRestriction === "EMAIL") {
                sCustomerInfo.contactRestriction = "";
              } else {
                sCustomerInfo.contactRestriction = "EMAIL";
              }
              __setCustomerInfo(sCustomerInfo);
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
            {
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

export const ColorGridPickerComponent = ({ onColorSelect }) => {
  let colorArr = [];
};

export const LoginScreenComponent = ({
  modalVisible,
  loginCallback,
  _setModalVisibility,
}) => {
  let zSettingsObj = SETTINGS_PROTO;
  zSettingsObj = useSettingsStore((state) => state.getSettingsObj());
  const [sInput, _setInput] = useState("");

  function checkUserInput(input) {
    _setInput(input);
    let user = zSettingsObj.users.find((user) => user.pin == input);
    if (user) {
      USER_ACTION_GLOBAL.setUser(user);
      _setModalVisibility();
      loginCallback();
      _setInput("");
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
            backgroundColor: "green",
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
          <Button
            onPress={() => {
              _setModalVisibility();
              loginCallback();
            }}
          />
        </View>
      )}
    />
  );
};

// export const

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
  let shadowStyle = SHADOW_RADIUS_PROTO;
  if (!shadow) shadowStyle = SHADOW_RADIUS_NOTHING;
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
          // backgroundColor: "blue",
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
            // backgroundColor: "green",
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
  height,
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
        height,
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

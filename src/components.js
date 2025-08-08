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
  clog,
  formatDecimal,
  generateRandomID,
  LETTERS,
  log,
  NUMS,
  readAsBinaryString,
  trimToTwoDecimals,
} from "./utils";
import { Colors, Fonts } from "./styles";
import { useState } from "react";
import {
  FOCUS_NAMES,
  INVENTORY_ITEM_PROTO,
  INVENTORY_CATEGORIES,
  SETTINGS_PROTO,
  PRIVILEDGE_LEVELS,
} from "./data";
import { cloneDeep } from "lodash";
import { CUSTOMER_PROTO } from "./data";
import {
  useAppCurrentUserStore,
  useInventoryStore,
  useInvModalStore,
  useSettingsStore,
  useLoginStore,
  useStripePaymentStore,
  useCheckoutStore,
} from "./stores";
import {
  dbCancelPaymentIntents,
  dbCancelServerDrivenStripePayment,
  dbGetStripeActivePaymentIntents,
  dbGetStripeConnectionToken,
  dbGetStripePaymentIntent,
  dbProcessServerDrivenStripePayment,
  dbRetrieveAvailableStripeReaders,
  dbSetInventoryItem,
  dbSetSettings,
} from "./db_call_wrapper";
import {
  paymentIntentSubscribe,
  removePaymentIntentSub,
} from "./db_subscriptions";
import Dropzone from "react-dropzone";
import { CheckBox as RNCheckBox } from "react-native-web";

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
  const _zSetModalVisible = useLoginStore((state) => state.setModalVisible);
  const [isModalVisible, setModalVisible] = useState(false);
  const [selectedValue, setSelectedValue] = useState(null);

  const toggleModal = () => setModalVisible(!isModalVisible);

  const handleSelect = (item) => {
    setSelectedValue(item);
    onSelect(item);
    toggleModal();
  };
  // log(data);

  useEffect(() => {
    _zSetModalVisible(true);
    return () => {
      _zSetModalVisible(false);
    };
  });

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

export const InventoryItemScreeenModalComponent = ({
  itemIdx,
  handleClosePress,
  newItemObj,
}) => {
  // setters ////////////////////////////////////////////////////////
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

  // getters ///////////////////////////////////////////////////////
  const zSettingsObj = useSettingsStore((state) => state.getSettingsObj());
  const zFocus = useInvModalStore((state) => state.getFocus());
  const zInventoryArr = useInventoryStore((state) => state.getInventoryArr());
  const zShowLoginScreen = useLoginStore((state) => state.getShowLoginScreen());

  ////////////////////////////////////////////////////////////////////
  const [sItem, _setItem] = React.useState({});
  const isMounted = useRef(false);
  const FOCUS_NAMES = {
    formalName: "name",
    informalName: "informalName",
    price: "price",
    category: "category",
    sale: "sale",
    upc: "upc",
  };

  useEffect(() => {
    if (newItemObj) {
      _setItem(newItemObj);
    } else {
      _setItem(cloneDeep(zInventoryArr[itemIdx]));
    }
  }, []);

  function handleChangeItem(item1, focusName) {
    _zSetFocus(focusName);
    _setItem(item1);

    if (!newItemObj)
      _zExecute(() => {
        _zModInventoryItem(item1, "change");
        dbSetInventoryItem(item1);
      }, PRIVILEDGE_LEVELS.superUser);
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
  if (!sItem) return null;
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
        <LoginScreenModalComponent modalVisible={zShowLoginScreen} />
        <View
          style={{
            width: "100%",
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <View>
            <Text>{"Catalog Name"}</Text>
            <TextInput
              numberOfLines={3}
              style={{
                marginTop: 10,
                fontSize: 16,
                color: "black",
                borderWidth: 1,
              }}
              autoFocus={zFocus === FOCUS_NAMES.formalName}
              onClick={() => _zSetFocus(FOCUS_NAMES.formalName)}
              onChangeText={(val) => {
                let newItem = cloneDeep(sItem);
                newItem.formalName = val;
                handleChangeItem(newItem, FOCUS_NAMES.formalName);
              }}
              value={sItem.formalName}
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
                let newItem = cloneDeep(sItem);
                newItem.informalName = val;
                handleChangeItem(newItem, FOCUS_NAMES.informalName);
              }}
              value={sItem.informalName}
            />
          </View>
          <View>
            <Text style={{ color: "red", fontSize: 13 }}>
              {"Regular $ "}
              <TextInput
                autoFocus={zFocus === FOCUS_NAMES.price}
                onClick={() => _zSetFocus(FOCUS_NAMES.price)}
                onChangeText={(val) => {
                  let newItem = cloneDeep(sItem);
                  newItem.price = val;
                  handleChangeItem(newItem, FOCUS_NAMES.price);
                }}
                value={sItem.price}
                style={{ fontSize: 16 }}
              />
            </Text>
            <Text style={{ alignSelf: "flex-end", color: "red", fontSize: 13 }}>
              {"Sale $ "}
              <TextInput
                autoFocus={zFocus === FOCUS_NAMES.sale}
                onClick={() => _zSetFocus(FOCUS_NAMES.sale)}
                onChangeText={(val) => {
                  let newItem = cloneDeep(sItem);
                  newItem.salePrice = val;
                  handleChangeItem(newItem, FOCUS_NAMES.sale);
                }}
                value={sItem.salePrice}
                style={{ fontSize: 16 }}
              />
            </Text>
          </View>
        </View>
        <View
          style={{ flexDirection: "row", alignItems: "center", marginTop: 20 }}
        >
          <Text style={{ marginLeft: 10 }}>{sItem.catMain}</Text>
        </View>

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
            value={sItem.upc}
            onChangeText={(val) => {
              let newItem = cloneDeep(sItem);
              newItem.upc = val;
              handleChangeItem(newItem, FOCUS_NAMES.upc);
            }}
          />
        </View>

        {/* {newItemObj ? ( */}
        <Button text={"Create Item"} onPress={handleNewItemPress} />
        <Button text={"Delete Item"} onPress={handleRemoveItem} />

        {/* ) : null} */}
        <ModalDropdown
          buttonLabel={"Quick Items"}
          buttonStyle={{ width: 200 }}
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
      </View>
    </TouchableWithoutFeedback>
  );
};

export const CustomerInfoScreenModalComponent = ({
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
  // log("here");
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
              sCustomerInfo = cloneDeep(sCustomerInfo);
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
              sCustomerInfo = cloneDeep(sCustomerInfo);
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
              sCustomerInfo = cloneDeep(sCustomerInfo);
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
              sCustomerInfo = cloneDeep(sCustomerInfo);
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
              sCustomerInfo = cloneDeep(sCustomerInfo);
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
              sCustomerInfo = cloneDeep(sCustomerInfo);
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
              sCustomerInfo = cloneDeep(sCustomerInfo);
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
              sCustomerInfo = cloneDeep(sCustomerInfo);
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
              sCustomerInfo = cloneDeep(sCustomerInfo);
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
              sCustomerInfo = cloneDeep(sCustomerInfo);
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
              sCustomerInfo = cloneDeep(sCustomerInfo);
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
              sCustomerInfo = cloneDeep(sCustomerInfo);
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
              sCustomerInfo = cloneDeep(sCustomerInfo);
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
  let zSettingsObj = SETTINGS_PROTO;
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
          <CheckBox
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

export const FileInput = ({
  handleBinaryString,
  buttonStyle = {},
  textStyle = {},
  text,
}) => {
  const fileInputRef = useRef(null);
  const onDrop = useCallback((acceptedFiles) => {
    acceptedFiles.forEach((file) => {
      const reader = new FileReader();

      reader.onabort = () => console.log("file reading was aborted");
      reader.onerror = () => console.log("file reading has failed");
      reader.onload = () => {
        const binaryStr = reader.result;
        handleBinaryString(binaryStr);
      };
      reader.readAsArrayBuffer(file);
    });
  }, []);

  const handleFileUpload = (e) => {
    // const file = e.target.files[0];
    // e.target.value = null;
    clog("files", e.target);
    return file;
    const binaryStr = readAsBinaryString(file);
    handleBinaryString(binaryStr);
  };

  return (
    <TouchableOpacity onPress={() => fileInputRef.current.open()}>
      <View
        style={{
          width: 170,
          height: 30,
          backgroundColor: null,
          alignItems: "center",
          justifyContent: "center",
          ...SHADOW_RADIUS_PROTO,
          ...buttonStyle,
        }}
      >
        <Text style={{ ...textStyle }}>{text || "Drag File / Click Here"}</Text>
        <Dropzone onDrop={onDrop} ref={fileInputRef}>
          {({ getInputProps }) => (
            <section>
              <input {...getInputProps()} />
            </section>
          )}
        </Dropzone>
      </View>
    </TouchableOpacity>
  );
  return (
    <TouchableOpacity onClick={() => openFilePicker()}>
      <View
        style={{
          width: 200,
          height: 30,
          backgroundColor: null,
          ...buttonStyle,
        }}
      >
        <input
          ref={fileInputRef}
          // style={{ display: "none" }}
          type="file"
          onChange={(e) => handleFileUpload(e)}
        />
        <Text style={{ ...textStyle }}>Upload File</Text>
      </View>
    </TouchableOpacity>
  );
};

export const Button = ({
  visible = true,
  ref,
  onPress,
  onLongPress,
  text,
  numLines = null,
  enableMouseOver = true,
  mouseOverOptions = {
    // opacity: 0.7,
    // highlightColor: Colors.tabMenuButton,
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
  // const HEIGHT = 50;
  // const WIDTH = 130;

  if (!visible) {
    return <View style={{ width: WIDTH, height: HEIGHT }}></View>;
  }

  return (
    <TouchableOpacity
      ref={ref}
      onMouseOver={() => (enableMouseOver ? _setMouseOver(true) : null)}
      onMouseLeave={() => {
        _setMouseOver(false);
      }}
      onPress={visible ? onPress : () => {}}
      onLongPress={visible ? onLongPress : () => {}}
    >
      <View
        style={{
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 15,
          paddingVertical: 5,
          // width: null,
          // height: HEIGHT,
          backgroundColor: Colors.tabMenuButton,
          ...shadowStyle,
          ...buttonStyle,
          backgroundColor: sMouseOver
            ? mouseOverOptions.highlightColor
            : buttonStyle.backgroundColor || Colors.tabMenuButton,
          opacity: sMouseOver ? mouseOverOptions.opacity : buttonStyle.opacity,
        }}
      >
        <Text
          numberOfLines={2}
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
        backgroundColor: Colors.tabMenuButton,
        opacity: isSelected ? 1 : 0.45,
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
        source={require("./assets/bicycle.png")}
      />
    </View>
  );
};

export const CheckBox = ({
  text,
  onCheck,
  item,
  makeEntireViewCheckable = true,
  roundButton = false,
  isChecked,
  buttonStyle = {},
  textStyle = {},
  viewStyle = {},
  checkedColor,
  uncheckedColor,
  mouseOverOptions = {
    enable: false,
    opacity: 0.7,
    highlightColor: "dimgrey",
  },
  boxStyle = {},
}) => {
  const [sMouseOver, _setMouseOver] = React.useState(false);
  // const [isChecked, onCheck] = useState(false);
  const rgbText = "rgba(50,50,50,1)";
  if (roundButton) buttonStyle = { ...buttonStyle, borderRadius: 100 };

  let backgroundColor;
  if (sMouseOver) {
    if (!isChecked && !isChecked) {
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
      isChecked || isChecked
        ? checkedColor || Colors.tabMenuButton
        : uncheckedColor || "lightgray";
  }

  return (
    <TouchableOpacity
      onPress={() => {
        if (makeEntireViewCheckable) {
          onCheck(!isChecked);
          onCheck(item, !isChecked);
        }
      }}
      style={{ padding: 1 }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          // backgroundColor: "green",
          ...viewStyle,
        }}
      >
        <RNCheckBox
          style={{
            width: 17,
            height: 17,
            borderColor: "lightgray",
            marginRight: 3,
            ...boxStyle,
          }}
          value={isChecked}
          color={Colors.tabMenuButton}
          onValueChange={onCheck}
        />
        <Text style={{ ...textStyle }}>{text}</Text>
      </View>
    </TouchableOpacity>
  );
};

// useEffect(() => {
//   async function initTerminal() {
//     const terminal = StripeTerminal.create({
//       onFetchConnectionToken: dbGetStripeConnectionToken,
//       onUnexpectedReaderDisconnect: onReaderDisconnect,
//     });
//     _sSetStatusTextColor("green");
//     _sSetStatus("Stripe token fetched...");
//     _sSetTerminal(terminal);
//   }
//   initTerminal();
// }, []);

// useEffect(() => {
//   if (sTerminal && !sReader) {
//     discoverReaders();
//   }
// }, [sReader, sTerminal]);

// const onReaderDisconnect = () => {
//   _sSetStatusTextColor("red");
//   _sSetStatus(
//     "Card Reader Disconnected! Refresh page then restart payment process."
//   );
// };

// async function discoverReaders() {
//   try {
//     _sSetStatusTextColor("green");
//     const config = {
//       simulated: false,
//       location: zSettingsObj.stripeBusinessLocationCode,
//     };
//     const discoverResult = await sTerminal.discoverReaders(config);
//     if (discoverResult.error) {
//       _sSetStatusTextColor("red");
//       console.log("Failed to discover: ", discoverResult.error);
//       _sSetStatus(
//         sStatus + "\nError during device discovery: " + discoverResult.error
//       );
//     } else if (discoverResult.discoveredReaders.length === 0) {
//       _sSetStatusTextColor("red");
//       console.log("No available Stripe readers.");
//       _sSetStatus("No available card readers! Check connections...");
//     } else {
//       log(
//         "discovered Stripe readers array",
//         discoverResult.discoveredReaders
//       );
//       let reader = discoverResult.discoveredReaders.find(
//         (o) => o.label == zSettingsObj.selectedCardReaderObj.label
//       );
//       if (reader) {
//         log("Our Stripe reader: ", reader);
//         _sSetStatusTextColor("green");
//         _sSetReader(reader);
//         if (zSettingsObj.autoConnectToCardReader) connectReader(reader);
//       }
//       // log("reader", reader);
//     }
//   } catch (e) {
//     _sSetStatusTextColor("red");
//     _sSetStatus(sStatus + "\nError discovering readers: " + e);
//     log("error discovering reader", e);
//   }
// }

// const connectReader = async (reader) => {
//   log("connecting to reader...");
//   _sSetStatus("Connecting to reader...");
//   const connectResult = await sTerminal.connectReader(reader, {
//     fail_if_in_use: true,
//   });

//   if (connectResult.error) {
//     _sSetStatusTextColor("red");
//     log("Stripe terminal connect result error", connectResult.error);
//     sTerminal.disconnectReader();
//     _sSetStatus("STRIPE CONNECTION ERRROR: " + connectResult.error.message);
//     return;
//   }
//   // log("connect result success!!", connectResult);
//   _sSetStatusTextColor("green");
//   _sSetConnectedReader(connectResult.reader);
//   _sSetStatus("Connected to card reader: " + connectResult.reader.label);
//   _setReaderReady(true);
//   log(`Stripe successfully connected to ${connectResult.reader.label}`);
// };

// async function startPayment() {
//   let paymentIntent;
//   if (
//     sPaymentIntent &&
//     Number(sPaymentIntent.amount) == Number(sPaymentAmount) * 100
//   ) {
//     log("Using previous payment intent");
//     paymentIntent = sPaymentIntent;
//   } else {
//     log("Retrieving new payment intent...");
//     _sSetStatus("Retrieving secure Payment Intent...");
//     paymentIntent = await dbGetStripePaymentIntent(sPaymentAmount);
//     _setPaymentIntent(paymentIntent);
//   }

//   clog("Active payment intent", paymentIntent);
//   _sSetStatus("Payment Intent retrieved...");
//   let res = await sTerminal.collectPaymentMethod(
//     paymentIntent.client_secret,
//     {
//       config_override: {
//         enable_customer_cancellation: true,
//         update_payment_intent: true,
//       },
//     }
//   );
//   let paymentMethod = res.paymentIntent.payment_method;
//   const card = paymentMethod?.card_present ?? paymentMethod?.interac_present;
//   // clog("method", paymentMethod);
//   // clog("card", card);

//   // return;
//   const paymentResult = await sTerminal.processPayment(res.paymentIntent);
//   _setPaymentIntent(paymentResult.paymentIntent);
//   if (paymentResult.error) {
//     log("payment result error", e);
//     _sSetStatus("Payment processing error: ", e.error);
//     // Placeholder for handling result.error
//   } else if (paymentResult.paymentIntent) {
//     _sSetStatus("");
//     clog("payment result", paymentResult);
//     let intent = paymentResult.paymentIntent;
//     let res = {
//       cardType: card.brand.toUpperCase(),
//       lastFour: card.last4,
//       expMonth: card.exp_month,
//       expYear: card.exp_year,
//       issuer: card.issuer,
//       millis: new Date().getTime(),
//       amount: trimToTwoDecimals(Number(intent.amount) / 100),
//       paymentIntent: intent.id,
//     };
//     log("payment detail obj", res);
//     onCardDetailObj(res);
//     onCancel();

//     // Placeholder for notifying your backend to capture result.paymentIntent.id
//   }
// }

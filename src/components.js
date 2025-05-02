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
import { log } from "./utils";
import { Colors } from "./styles";
import { useState } from "react";
import { Discounts } from "./data";

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
}) => {
  const info_styles = {
    textInput: {
      borderWidth: 2,
      borderColor: "gray",
      color: Colors.lightTextOnMainBackground,
      paddingVertical: 3,
      paddingHorizontal: 4,
      fontSize: 16,
      outlineWidth: 0,
    },
  };

  return (
    <TextInput
      value={value}
      placeholder="Brand"
      placeholderTextColor={"darkgray"}
      style={{ ...info_styles.textInput, ...styleProps }}
      onChangeText={(val) => onTextChange(val)}
    />
  );
};

export const ModalDropdown = ({
  data,
  onSelect,
  buttonLabel,
  onRemoveSelection,
  currentSelectionName,
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
              color: "white",
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
                      let backgroundColor = null;
                      // log("current", currentSelectionName);
                      // log("new", item);
                      if (currentSelectionName == item) {
                        backgroundColor = "lightgray";
                      }
                      return (
                        <TouchableOpacity
                          style={{
                            ...styles.option,
                            backgroundColor,
                            ...itemListStyle,
                          }}
                          onPress={() => handleSelect(item)}
                        >
                          <Text style={styles.optionText}>{item}</Text>
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
                    <TouchableOpacity
                      style={styles.closeButton}
                      onPress={toggleModal}
                    >
                      <Text style={styles.closeText}>{closeButtonText}</Text>
                    </TouchableOpacity>
                    {currentSelectionName && (
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
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
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
    <Pressable
      onPress={
        onPress ||
        (() => {
          log("button pressed");
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
    </Pressable>
  );
};

export const TabMenuButton = ({
  onPress,
  text,
  textColor,
  viewStyle,
  textStyle,
  isSelected,
}) => {
  return (
    <Button
      textStyle={{ textColor: Colors.tabMenuButtonText }}
      viewStyle={{
        viewStyle,
        opacity: isSelected ? 1 : 0.65,
        paddingHorizontal: 20,
        paddingVertical: 5,
      }}
      onPress={onPress}
      text={text}
      backgroundColor={Colors.tabMenuButton}
      textColor={Colors.tabMenuButtonText}
    />
  );
};

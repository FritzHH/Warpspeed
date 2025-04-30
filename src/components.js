// "use client";
import { View, Text, Pressable } from "react-native-web";
import { log } from "./utils";
import { Colors } from "./styles";

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

/* eslint-disable */

import React from "react";
import { View, Text, TouchableOpacity } from "react-native-web";
import { C, COLOR_GRADIENTS, ICONS } from "../styles";
import { Button_ } from "../components";
import { ROUTES } from "../routes";

const LINK_ITEMS = [
  { label: "Dashboard", path: ROUTES.dashboard, icon: ICONS.home },
  { label: "Login", path: ROUTES.login, icon: ICONS.userControl },
  { label: "Customer Display", path: ROUTES.display, icon: ICONS.eyeballs },
  { label: "Translate", path: ROUTES.translate, icon: ICONS.letterI },
];

export function HomeScreen() {
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        padding: 40,
      }}
    >
      <Text
        style={{
          fontSize: 28,
          fontWeight: "700",
          color: C.text,
          marginBottom: 30,
        }}
      >
        Warpspeed
      </Text>
      <View style={{ width: 300 }}>
        {LINK_ITEMS.map((item) => (
          <Button_
            key={item.path + item.label}
            onPress={() => (window.location.href = item.path)}
            text={item.label}
            icon={item.icon}
            iconSize={20}
            colorGradientArr={COLOR_GRADIENTS.blue}
            buttonStyle={{
              borderRadius: 10,
              paddingVertical: 12,
              paddingHorizontal: 20,
              marginBottom: 12,
              width: "100%",
            }}
            textStyle={{ fontSize: 16 }}
          />
        ))}
      </View>
    </View>
  );
}

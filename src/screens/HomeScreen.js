/* eslint-disable */

import React, { useState } from "react";
import { View, Text, TouchableOpacity } from "react-native-web";
import { C, COLOR_GRADIENTS, ICONS } from "../styles";
import { Button_, CheckBox_ } from "../components";
import { ROUTES } from "../routes";
import { useSettingsStore } from "../stores";

const LINK_ITEMS = [
  { label: "Dashboard", path: ROUTES.dashboard, icon: ICONS.home },
  { label: "Login", path: ROUTES.login, icon: ICONS.userControl },
  { label: "Customer Display", path: ROUTES.display, icon: ICONS.eyeballs, popup: true },
  { label: "Translate", path: ROUTES.translate, icon: ICONS.letterI },
];

export function HomeScreen() {
  const [sHasDisplay, _setHasDisplay] = useState(
    localStorage.getItem("warpspeed_has_secondary_display") === "true"
  );

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
            onPress={async () => {
              if (item.popup) {
                let storeName = useSettingsStore.getState().getSettings()?.storeInfo?.displayName || "";
                let title = storeName ? `${storeName} Checkout Display` : "Checkout Display";
                let screenDetails = null;
                let secondScreen = null;

                // Try to detect second screen via Multi-Screen Window Placement API
                if (window.getScreenDetails) {
                  try {
                    screenDetails = await window.getScreenDetails();
                    // Find the current screen the browser is on
                    let currentScreen = screenDetails.currentScreen;
                    // Pick a different screen (any screen that isn't the one the browser is on)
                    secondScreen = screenDetails.screens.find(
                      (s) => s.label !== currentScreen.label
                    );
                  } catch (e) {
                    // Permission denied or API error — fall back to single screen
                  }
                }

                let features = secondScreen
                  ? `popup,left=${secondScreen.left},top=${secondScreen.top},width=${secondScreen.width},height=${secondScreen.height}`
                  : "popup,width=1024,height=768";

                let win = window.open(item.path, "customerDisplay", features);
                if (win) {
                  win.addEventListener("load", () => {
                    win.document.title = title;
                  });
                }
              } else {
                window.location.href = item.path;
              }
            }}
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
      <CheckBox_
        text="Secondary display attached"
        isChecked={sHasDisplay}
        onCheck={() => {
          let newVal = !sHasDisplay;
          _setHasDisplay(newVal);
          localStorage.setItem("warpspeed_has_secondary_display", String(newVal));
        }}
        textStyle={{ fontSize: 14, color: C.lightText }}
        buttonStyle={{ marginTop: 20 }}
      />
    </View>
  );
}

/* eslint-disable */

import React, { useState } from "react";
import { View, Text, ScrollView } from "react-native-web";
import { C, COLOR_GRADIENTS, ICONS } from "../styles";
import { Button_, CheckBox_, Image_ } from "../components";
import { ROUTES } from "../routes";
import { useSettingsStore, useLayoutStore } from "../stores";
import { gray } from "../utils";

export function HomeScreen() {
  const deviceType = useLayoutStore((state) => state.deviceType);
  const [sHasDisplay, _setHasDisplay] = useState(
    localStorage.getItem("warpspeed_has_secondary_display") === "true"
  );

  let isMobileOrTablet = deviceType === "mobile" || deviceType === "tablet";
  let isDesktop = deviceType === "desktop";

  // Build link items based on device type
  let linkItems = [];

  if (deviceType === "tablet") {
    linkItems = [
      { label: "Bike Stand", path: ROUTES.stand, icon: ICONS.tools1, gradient: COLOR_GRADIENTS.green, recommended: true },
      { label: "Intake", path: ROUTES.intake, icon: ICONS.bicycle, gradient: COLOR_GRADIENTS.green },
      { label: "Workorders", path: ROUTES.dashboard, icon: ICONS.gears1, gradient: COLOR_GRADIENTS.blue },
      { label: "Login", path: ROUTES.login, icon: ICONS.userControl, gradient: COLOR_GRADIENTS.blue },
    ];
  } else if (deviceType === "mobile") {
    linkItems = [
      { label: "Workorders", path: ROUTES.dashboard, icon: ICONS.gears1, gradient: COLOR_GRADIENTS.green, recommended: true },
      { label: "Bike Stand", path: ROUTES.stand, icon: ICONS.tools1, gradient: COLOR_GRADIENTS.blue },
      { label: "Login", path: ROUTES.login, icon: ICONS.userControl, gradient: COLOR_GRADIENTS.blue },
    ];
  } else {
    // Desktop
    linkItems = [
      { label: "Workorders", path: ROUTES.dashboard, icon: ICONS.gears1, gradient: COLOR_GRADIENTS.blue },
      { label: "Intake", path: ROUTES.intake, icon: ICONS.bicycle, gradient: COLOR_GRADIENTS.blue },
      { label: "Bike Stand", path: ROUTES.stand, icon: ICONS.tools1, gradient: COLOR_GRADIENTS.blue },
      { label: "Login", path: ROUTES.login, icon: ICONS.userControl, gradient: COLOR_GRADIENTS.blue },
      { label: "Customer Display", path: ROUTES.display, icon: ICONS.eyeballs, gradient: COLOR_GRADIENTS.blue, popup: true },
      { label: "Translate", path: ROUTES.translate, icon: ICONS.letterI, gradient: COLOR_GRADIENTS.blue },
    ];
  }

  async function handleLinkPress(item) {
    if (item.popup) {
      let storeName = useSettingsStore.getState().getSettings()?.storeInfo?.displayName || "";
      let title = storeName ? `${storeName} Checkout Display` : "Checkout Display";
      let screenDetails = null;
      let secondScreen = null;

      if (window.getScreenDetails) {
        try {
          screenDetails = await window.getScreenDetails();
          let currentScreen = screenDetails.currentScreen;
          secondScreen = screenDetails.screens.find(
            (s) => s.label !== currentScreen.label
          );
        } catch (e) {}
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
  }

  return (
    <ScrollView
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: "center",
        alignItems: "center",
        padding: isMobileOrTablet ? 20 : 40,
      }}
      style={{ flex: 1, backgroundColor: C.backgroundWhite }}
    >
      <Text
        style={{
          fontSize: isMobileOrTablet ? 22 : 28,
          fontWeight: "700",
          color: C.text,
          marginBottom: isMobileOrTablet ? 6 : 20,
        }}
      >
        Warpspeed
      </Text>

      {/* Device type indicator */}
      <Text
        style={{
          fontSize: 11,
          color: gray(0.4),
          marginBottom: isMobileOrTablet ? 16 : 24,
          textTransform: "uppercase",
          letterSpacing: 1,
        }}
      >
        {deviceType} mode
      </Text>

      <View style={{ width: isMobileOrTablet ? "100%" : 300, maxWidth: 400 }}>
        {linkItems.map((item) => (
          <Button_
            key={item.path + item.label}
            onPress={() => handleLinkPress(item)}
            text={item.label}
            icon={item.icon}
            iconSize={isMobileOrTablet ? 24 : 20}
            colorGradientArr={item.gradient}
            buttonStyle={{
              borderRadius: 10,
              paddingVertical: isMobileOrTablet ? 16 : 12,
              paddingHorizontal: 20,
              marginBottom: isMobileOrTablet ? 10 : 12,
              width: "100%",
            }}
            textStyle={{ fontSize: isMobileOrTablet ? 18 : 16 }}
          />
        ))}
      </View>

      {/* Secondary display checkbox — desktop only */}
      {isDesktop && (
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
      )}
    </ScrollView>
  );
}

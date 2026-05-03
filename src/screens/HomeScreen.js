/* eslint-disable */

import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native-web";
import { useNavigate } from "react-router-dom";
import { C, COLOR_GRADIENTS, ICONS } from "../styles";
import { Button_, CheckBox_, Image_ } from "../components";
import { ROUTES } from "../routes";
import { useSettingsStore, useLayoutStore } from "../stores";
import { gray } from "../utils";
import { dbLogout } from "../db_calls_wrapper";

export function HomeScreen() {
  const navigate = useNavigate();
  const deviceType = useLayoutStore((state) => state.deviceType);
  const [sHasDisplay, _setHasDisplay] = useState(
    localStorage.getItem("warpspeed_has_secondary_display") === "true"
  );
  const [sSmsSound, _setSmsSound] = useState(
    localStorage.getItem("warpspeed_sms_sound") !== "false"
  );

  let isMobileOrTablet = deviceType === "mobile" || deviceType === "tablet";
  let isDesktop = deviceType === "desktop";

  // Build link items based on device type
  let linkItems = [];

  if (deviceType === "tablet") {
    linkItems = [
      { label: "Bike Stand", path: ROUTES.stand, icon: ICONS.tools1, gradient: COLOR_GRADIENTS.green, recommended: true },
      { label: "Workorders", path: ROUTES.dashboard, icon: ICONS.gears1, gradient: COLOR_GRADIENTS.blue },
    ];
  } else if (deviceType === "mobile") {
    linkItems = [
      { label: "Workorders", path: ROUTES.dashboard, icon: ICONS.gears1, gradient: COLOR_GRADIENTS.green, recommended: true },
      { label: "Bike Stand", path: ROUTES.stand, icon: ICONS.tools1, gradient: COLOR_GRADIENTS.blue },
    ];
  } else {
    // Desktop
    linkItems = [
      { label: "Workorders", path: ROUTES.dashboard, icon: ICONS.gears1, gradient: COLOR_GRADIENTS.blue },
      { label: "Bike Stand", path: ROUTES.stand, icon: ICONS.tools1, gradient: COLOR_GRADIENTS.blue },
      { label: "Phone", path: ROUTES.phone, icon: ICONS.cellPhone, gradient: COLOR_GRADIENTS.blue },
      { label: "Database Viewer", path: ROUTES.dbViewer, icon: ICONS.gears1, gradient: COLOR_GRADIENTS.purple },
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
              borderRadius: 5,
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
      {isDesktop && (
        <CheckBox_
          text="SMS notification sound"
          isChecked={sSmsSound}
          onCheck={() => {
            let newVal = !sSmsSound;
            _setSmsSound(newVal);
            localStorage.setItem("warpspeed_sms_sound", String(newVal));
          }}
          textStyle={{ fontSize: 14, color: C.lightText }}
          buttonStyle={{ marginTop: 10 }}
        />
      )}

      <Button_
        onPress={async () => { await dbLogout(); navigate(ROUTES.login); }}
        text="Logout"
        colorGradientArr={COLOR_GRADIENTS.red}
        buttonStyle={{
          borderRadius: 5,
          paddingVertical: isMobileOrTablet ? 14 : 10,
          paddingHorizontal: 20,
          marginTop: 30,
          width: isMobileOrTablet ? "100%" : 300,
          maxWidth: 400,
        }}
        textStyle={{ fontSize: isMobileOrTablet ? 16 : 14 }}
      />
    </ScrollView>
  );
}

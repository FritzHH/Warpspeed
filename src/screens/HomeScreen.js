import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { C, COLOR_GRADIENTS, ICONS } from "../styles";
import { getTheme, setTheme, subscribeTheme } from "../styles/theme";
import { Button, CheckBox } from "../dom_components";
import { ROUTES } from "../routes";
import { useSettingsStore, useLayoutStore } from "../stores";
import { dbLogout } from "../db_calls_wrapper";
import styles from "./HomeScreen.module.css";

export function HomeScreen() {
  const navigate = useNavigate();
  const deviceType = useLayoutStore((state) => state.deviceType);
  const [sHasDisplay, _setHasDisplay] = useState(
    localStorage.getItem("warpspeed_has_secondary_display") === "true"
  );
  const [sSmsSound, _setSmsSound] = useState(
    localStorage.getItem("warpspeed_sms_sound") !== "false"
  );
  const [sDarkMode, _setDarkMode] = useState(() => getTheme() === "dark");
  useEffect(() => subscribeTheme((t) => _setDarkMode(t === "dark")), []);

  const isMobileOrTablet = deviceType === "mobile" || deviceType === "tablet";
  const isDesktop = deviceType === "desktop";

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
    linkItems = [
      { label: "Workorders", path: ROUTES.dashboard, icon: ICONS.gears1, gradient: COLOR_GRADIENTS.blue },
      { label: "Bike Stand", path: ROUTES.stand, icon: ICONS.tools1, gradient: COLOR_GRADIENTS.blue },
      { label: "Phone", path: ROUTES.phone, icon: ICONS.cellPhone, gradient: COLOR_GRADIENTS.blue },
      { label: "Database Viewer", path: ROUTES.dbViewer, icon: ICONS.gears1, gradient: COLOR_GRADIENTS.purple },
    ];
  }

  async function handleLinkPress(item) {
    if (item.popup) {
      const storeName = useSettingsStore.getState().getSettings()?.storeInfo?.displayName || "";
      const title = storeName ? `${storeName} Checkout Display` : "Checkout Display";
      let screenDetails = null;
      let secondScreen = null;

      if (window.getScreenDetails) {
        try {
          screenDetails = await window.getScreenDetails();
          const currentScreen = screenDetails.currentScreen;
          secondScreen = screenDetails.screens.find(
            (s) => s.label !== currentScreen.label
          );
        } catch (e) {}
      }

      const features = secondScreen
        ? `popup,left=${secondScreen.left},top=${secondScreen.top},width=${secondScreen.width},height=${secondScreen.height}`
        : "popup,width=1024,height=768";

      const win = window.open(item.path, "customerDisplay", features);
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
    <div
      className={`${styles.root} ${isMobileOrTablet ? styles.rootMobile : styles.rootDesktop}`}
      style={{ backgroundColor: C.backgroundWhite }}
    >
      <h1
        className={`${styles.title} ${isMobileOrTablet ? styles.titleMobile : styles.titleDesktop}`}
        style={{ color: C.text }}
      >
        Warpspeed
      </h1>

      <div
        className={`${styles.deviceLabel} ${isMobileOrTablet ? styles.deviceLabelMobile : styles.deviceLabelDesktop}`}
        style={{ color: C.textMuted }}
      >
        {deviceType} mode
      </div>

      <div className={styles.linkGroup}>
        {linkItems.map((item) => (
          <Button
            key={item.path + item.label}
            onPress={() => handleLinkPress(item)}
            text={item.label}
            icon={item.icon}
            iconSize={isMobileOrTablet ? 24 : 20}
            colorGradientArr={item.gradient}
            buttonStyle={{
              borderRadius: 5,
              paddingTop: isMobileOrTablet ? 16 : 12,
              paddingBottom: isMobileOrTablet ? 16 : 12,
              paddingLeft: 20,
              paddingRight: 20,
              marginBottom: isMobileOrTablet ? 10 : 12,
              width: 300,
            }}
            textStyle={{ fontSize: isMobileOrTablet ? 18 : 16 }}
          />
        ))}
      </div>

      {isDesktop && (
        <CheckBox
          text="Secondary display attached"
          isChecked={sHasDisplay}
          onCheck={() => {
            const newVal = !sHasDisplay;
            _setHasDisplay(newVal);
            localStorage.setItem("warpspeed_has_secondary_display", String(newVal));
          }}
          textStyle={{ fontSize: 14, color: C.lightText }}
          buttonStyle={{ marginTop: 20 }}
        />
      )}
      {isDesktop && (
        <CheckBox
          text="SMS notification sound"
          isChecked={sSmsSound}
          onCheck={() => {
            const newVal = !sSmsSound;
            _setSmsSound(newVal);
            localStorage.setItem("warpspeed_sms_sound", String(newVal));
          }}
          textStyle={{ fontSize: 14, color: C.lightText }}
          buttonStyle={{ marginTop: 10 }}
        />
      )}
      {isDesktop && (
        <CheckBox
          text="Dark mode"
          isChecked={sDarkMode}
          onCheck={() => setTheme(sDarkMode ? "light" : "dark")}
          textStyle={{ fontSize: 14, color: C.lightText }}
          buttonStyle={{ marginTop: 10 }}
        />
      )}

      <Button
        onPress={async () => { await dbLogout(); navigate(ROUTES.login); }}
        text="Logout"
        colorGradientArr={COLOR_GRADIENTS.red}
        buttonStyle={{
          borderRadius: 5,
          paddingTop: isMobileOrTablet ? 14 : 10,
          paddingBottom: isMobileOrTablet ? 14 : 10,
          paddingLeft: 20,
          paddingRight: 20,
          marginTop: 30,
          width: 300,
        }}
        textStyle={{ fontSize: isMobileOrTablet ? 16 : 14 }}
      />
    </div>
  );
}

/* eslint-disable */

import { View, ActivityIndicator } from "react-native-web";
import {
  checkInternetConnection,
  dim,
  localStorageWrapper,
  log,
} from "../../utils";
import { TabMenuButton, Image_, Button_ } from "../../components";
import { C, ICONS } from "../../styles";
import { TAB_NAMES } from "../../data";
// import { QuickItemsTab } from "./Options_QuickItemsTab";
import React, { useEffect, useRef, useState } from "react";
import { WorkordersComponent } from "../screen_components/Options_Screen/Options_Workorders";
import { InventoryComponent } from "../screen_components/Options_Screen/Options_Inventory";
import { MessagesComponent } from "../screen_components/Options_Screen/Options_Messages";
import {
  useTabNamesStore,
  useLoginStore,
  useAlertScreenStore,
} from "../../stores";
import { INTERNET_CHECK_DELAY, LOCAL_DB_KEYS } from "../../constants";

export const Options_Section = React.memo(({}) => {
  // store getters ///////////////////////////////////////////////////////////////
  const zOptionsTabName = useTabNamesStore((state) => state.optionsTabName);

  //////////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////////

  function handleUserClockPress(user) {
    let millis = new Date().getTime();
    let option = useLoginStore.getState().punchClock[user.id] ? "out" : "in";

    // log("clocked in arr", zClockedInUsersArr);
    let clockinFun = () => {
      // _zCreateUserClockPunch(userObj.id, millis, option);
      useLoginStore.getState().setCreateUserClock(user.id, millis, option);

      // now we will pause the app asking if the user wants to clock in if they say "no". this is to let them use the app even if they aren't clocked in.

      // TODO administrator can set this to not allow the user to use the app if not clocked in, let it keep bugging them as a way to stop them from using it
      if (option === "out") {
        let clockPauseObj = localStorageWrapper.getItem(
          LOCAL_DB_KEYS.userClockCheckPauseObj
        );
        if (!clockPauseObj) clockPauseObj = {};
        clockPauseObj[user.id] = new Date().getTime();
        localStorageWrapper.setItem(
          LOCAL_DB_KEYS.userClockCheckPauseObj,
          clockPauseObj
        );
      }
    };

    let viewHistoryFun = () => {
      log("view history here");
    };

    useAlertScreenStore.getState().setShowAlert(true);
    useAlertScreenStore.getState().setValues({
      title: "PUNCH CLOCK",
      btn1Text: option == "in" ? "CLOCK IN" : "CLOCK OUT",
      btn2Text: "VIEW HISTORY",
      btn3Text: "CANCEL",
      btn1Icon: ICONS.clockGif,
      btn2Icon: ICONS.listGif,
      btn3Icon: ICONS.cancelGif,
      handleBtn1Press: clockinFun,
      handleBtn2Press: viewHistoryFun,
      handleBtn3Press: () => null,
      alertBoxStyle: { width: 700 },
    });
  }

  function ScreenComponent() {
    switch (zOptionsTabName) {
      case TAB_NAMES.optionsTab.inventory:
        return <InventoryComponent />;
      case TAB_NAMES.optionsTab.messages:
        return <MessagesComponent />;
      case TAB_NAMES.optionsTab.inventory:
        return <InventoryComponent />;
      case TAB_NAMES.optionsTab.workorders:
        return <WorkordersComponent />;
    }
    return null;
  }

  return (
    <View style={{ height: "100%", width: "100%", backgroundColor: null }}>
      <TabBar
        zOptionsTabName={zOptionsTabName}
        handleUserPress={handleUserClockPress}
      />
      {ScreenComponent()}
    </View>
  );
});

export const TabBar = ({
  zOptionsTabName,
  handleUserPress,
}) => {
  const zCurrentUser = useLoginStore((state) => state.currentUser);
  const zPunchClock = useLoginStore((state) => state.punchClock);
  const zCameraStatus = useLoginStore((state) => state.cameraStatus);
  const zCameraError = useLoginStore((state) => state.cameraError);
  // local state /////////////////////////////////////////////////////////////////////////
  const [sIsOnline, _setIsOnline] = useState(true);

  // run constant checks to check if interent is connected
  useEffect(() => {
    async function tick() {
      let isOnline = false;
      try {
        isOnline = await checkInternetConnection();
      } catch (e) {}
      _setIsOnline(isOnline);
    }
    let id = setInterval(tick, INTERNET_CHECK_DELAY);
    return () => clearInterval(id);
  }, []);

  let isClockedIn = zPunchClock[zCurrentUser?.id];

  function showCameraError() {
    useAlertScreenStore.getState().setValues({
      title: "CAMERA ERROR",
      message: zCameraError || "Unknown camera error",
      btn1Text: "OK",
      handleBtn1Press: () => null,
      showAlert: true,
    });
  }

  function UserButton() {
    return (
      <Button_
        onPress={() => handleUserPress(zCurrentUser)}
        icon={isClockedIn ? ICONS.check : ICONS.redx}
        text={
          zCurrentUser.first +
          " " +
          (zCurrentUser?.last?.length >= 0 ? zCurrentUser.last[0] : "") +
          "."
        }
        textStyle={{ fontSize: 13, color: C.text }}
        iconSize={13}
        buttonStyle={{
          paddingHorizontal: 7,
          paddingVertical: 2,
          marginRight: 5,
          borderWidth: 1,
          borderColor: C.buttonLightGreenOutline,
          backgroundColor: C.buttonLightGreen,
          borderRadius: 15,
        }}
      />
    );
  }

  function LoginButton() {
    return (
      <Button_
        onPress={() => useLoginStore.getState().setShowLoginScreen(true)}
        icon={ICONS.userControl}
        iconSize={13}
        text="Login"
        textStyle={{ fontSize: 13, color: C.text }}
        buttonStyle={{
          paddingHorizontal: 7,
          paddingVertical: 2,
          marginRight: 5,
          borderWidth: 1,
          borderColor: C.buttonLightGreenOutline,
          backgroundColor: C.buttonLightGreen,
          borderRadius: 15,
        }}
      />
    );
  }

  function CameraIcon() {
    return (
      <View title="Camera on and identifying">
        <Image_ style={{ width: 19, height: 19 }} icon={ICONS.camera} />
      </View>
    );
  }

  function ErrorIcon() {
    return (
      <Button_
        onPress={showCameraError}
        icon={ICONS.redx}
        iconSize={15}
        buttonStyle={{
          paddingHorizontal: 4,
          paddingVertical: 2,
          marginRight: 3,
        }}
      />
    );
  }

  function renderUserArea() {
    // loading — spinner only
    if (zCameraStatus === "loading") {
      return <ActivityIndicator size={16} color={C.green} />;
    }

    // failed — show user or login button + error icon
    if (zCameraStatus === "failed") {
      return (
        <>
          {zCurrentUser ? <UserButton /> : <LoginButton />}
          <ErrorIcon />
        </>
      );
    }

    // ready — camera started, searching for face
    if (zCameraStatus === "ready") {
      return (
        <>
          {zCurrentUser ? <UserButton /> : <ActivityIndicator size={16} color={C.green} />}
          <View style={{ width: 5 }} />
          <CameraIcon />
        </>
      );
    }

    // idle or matched — normal display
    return (
      <>
        {zCurrentUser ? <UserButton /> : <LoginButton />}
        <CameraIcon />
      </>
    );
  }

  return (
    <View
      style={{
        flexDirection: "row",
        width: "100%",
        justifyContent: "space-between",
        paddingRight: 5,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "flex-start" }}>
        <TabMenuButton
          buttonStyle={{ borderTopLeftRadius: 15 }}
          onPress={() => useTabNamesStore.getState().setOptionsTabName(TAB_NAMES.optionsTab.inventory)}
          text={TAB_NAMES.optionsTab.inventory}
          isSelected={zOptionsTabName === TAB_NAMES.optionsTab.inventory}
        />
        <TabMenuButton
          onPress={() => useTabNamesStore.getState().setOptionsTabName(TAB_NAMES.optionsTab.workorders)}
          text={TAB_NAMES.optionsTab.workorders}
          isSelected={zOptionsTabName === TAB_NAMES.optionsTab.workorders}
        />
        <TabMenuButton
          onPress={() => useTabNamesStore.getState().setOptionsTabName(TAB_NAMES.optionsTab.messages)}
          text={TAB_NAMES.optionsTab.messages}
          isSelected={zOptionsTabName === TAB_NAMES.optionsTab.messages}
        />
      </View>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        {renderUserArea()}
        <View style={{ width: 5 }} />
        <Image_
          style={{ width: 28, height: 28 }}
          icon={sIsOnline ? ICONS.wifi : ICONS.internetOfflineGIF}
        />
      </View>
    </View>
  );
};

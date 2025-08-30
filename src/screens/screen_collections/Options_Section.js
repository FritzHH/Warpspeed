/* eslint-disable */

import { Text, View } from "react-native-web";
import {
  checkInternetConnection,
  dim,
  generateRandomID,
  localStorageWrapper,
  log,
  trimToTwoDecimals,
} from "../../utils";
import {
  HorzSpacer,
  TabMenuButton,
  TabMenuDivider as Divider,
  Image_,
  Button_,
  DateTimePicker,
} from "../../components";
import { APP_BASE_COLORS, Colors, ICONS } from "../../styles";
import { WORKORDER_PROTO, TAB_NAMES } from "../../data";
// import { QuickItemsTab } from "./Options_QuickItemsTab";
import React, { useEffect, useRef, useState } from "react";
import { cloneDeep } from "lodash";
import { WorkordersComponent } from "../screen_components/Options_Screen/Options_Workorders";
import { QuickItemComponent } from "../screen_components/Options_Screen/Options_QuickItems";
import { InventoryComponent } from "../screen_components/Options_Screen/Options_Inventory";
import { MessagesComponent } from "../screen_components/Options_Screen/Options_Messages";
import {
  useTabNamesStore,
  useLoginStore,
  useAlertScreenStore,
} from "../../stores";
import { dbSetUserPunchAction } from "../../db_call_wrapper";
import { LOCAL_DB_KEYS } from "../../constants";
import { UserClockHistoryModal } from "../screen_components/modal_screens/UserClockHistoryModalScreen";

export function Options_Section({}) {
  // store setters ///////////////////////////////////////////////////////////
  const _zSetOptionsTabName = useTabNamesStore(
    (state) => state.setOptionsTabName
  );
  const _zSetClockedInUser = useLoginStore((state) => state.setClockedInUser);
  const _zSetShowAlert = useAlertScreenStore((state) => state.setShowAlert);
  const _zSetAlertValues = useAlertScreenStore((state) => state.setValues);

  // store getters ///////////////////////////////////////////////////////////////
  const zOptionsTabName = useTabNamesStore((state) =>
    state.getOptionsTabName()
  );
  const zCurrentUserObj = useLoginStore((state) => state.getCurrentUserObj());

  const zWebcamDetected = useLoginStore((state) => state.getWebcamDetected());
  const zClockedInUsersArr = useLoginStore((state) =>
    state.getClockedInUsers()
  );

  // local state /////////////////////////////////////////////////////////////////////////
  const [sIsOnline, _setIsOnline] = useState(true);
  const [sCurrentUserObj, _setCurrentUserObj] = useState({
    first: "",
    last: "",
    isClockedIn: false,
  });

  // run constant checks to check if interent is connected
  const INTERNET_CHECK_DELAY = 1000;
  useEffect(() => {
    // log("here");
    async function tick() {
      let isOnline = false;
      try {
        isOnline = await checkInternetConnection();
      } catch (e) {}
      // log(isOnline.toString());
      _setIsOnline(isOnline);
    }
    let id = setInterval(tick, INTERNET_CHECK_DELAY);
    return () => clearInterval(id);
  }, []);

  //////////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////////

  function handleUserPress(userObj) {
    let millis = new Date().getTime();
    let option = zClockedInUsersArr.find((o) => o.id === userObj.id)
      ? "out"
      : "in";
    // log("clocked in arr", zClockedInUsersArr);
    let clockinFun = () => {
      _zSetClockedInUser(userObj.id, millis, option);
      dbSetUserPunchAction({
        userID: userObj.id,
        millisIn: option === "in" ? millis : null,
        millisOut: option === "out" ? millis : null,
      });

      if (option === "out") {
        let clockPauseObj = localStorageWrapper.getItem(
          LOCAL_DB_KEYS.userClockCheckPauseObj
        );
        if (!clockPauseObj) clockPauseObj = {};
        clockPauseObj[userObj.id] = new Date().getTime();
        localStorageWrapper.setItem(
          LOCAL_DB_KEYS.userClockCheckPauseObj,
          clockPauseObj
        );
      }
    };

    let viewHistoryFun = () => {
      log("view history here");
    };

    _zSetShowAlert(true);
    _zSetAlertValues({
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
      case TAB_NAMES.optionsTab.quickItems:
        return <QuickItemComponent />;
      case TAB_NAMES.optionsTab.workorders:
        return <WorkordersComponent />;
    }
    return null;
  }

  return (
    <View style={{ height: "100%", width: "100%", backgroundColor: null }}>
      <TabBar
        userObj={zCurrentUserObj}
        isClockedIn={zClockedInUsersArr?.find(
          (o) => o.id === zCurrentUserObj?.id
        )}
        zOptionsTabName={zOptionsTabName}
        _zSetOptionsTabName={_zSetOptionsTabName}
        // __tabMenuHeight={}
        __isOnline={sIsOnline}
        webcamDetected={zWebcamDetected}
        handleUserPress={handleUserPress}
      />
      {ScreenComponent()}
    </View>
  );

  /////////////////////////////////////////////////////////////////
  ////////////////////////////////////////////////////////////////
}

export const TabBar = ({
  userObj,
  isClockedIn,
  webcamDetected,
  __isOnline,
  zOptionsTabName,
  _zSetOptionsTabName,
  handleUserPress,
}) => (
  <View
    style={{
      flexDirection: "row",
      width: "100%",
      // width: "100%",
      justifyContent: "space-between",
      paddingRight: 5,
    }}
  >
    <View style={{ flexDirection: "row", justifyContent: "flex-start" }}>
      <TabMenuButton
        // height={height}
        buttonStyle={{ borderTopLeftRadius: 15 }}
        onPress={() => _zSetOptionsTabName(TAB_NAMES.optionsTab.quickItems)}
        text={TAB_NAMES.optionsTab.quickItems}
        isSelected={
          zOptionsTabName === TAB_NAMES.optionsTab.quickItems ? true : false
        }
      />
      {/* <Divider /> */}
      <TabMenuButton
        // height={height}
        onPress={() => _zSetOptionsTabName(TAB_NAMES.optionsTab.workorders)}
        text={TAB_NAMES.optionsTab.workorders}
        isSelected={
          zOptionsTabName == TAB_NAMES.optionsTab.workorders ? true : false
        }
      />
      <TabMenuButton
        // height={height}
        onPress={() => _zSetOptionsTabName(TAB_NAMES.optionsTab.messages)}
        text={TAB_NAMES.optionsTab.messages}
        isSelected={
          zOptionsTabName == TAB_NAMES.optionsTab.messages ? true : false
        }
      />
    </View>
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      {userObj ? (
        <Button_
          onPress={() => handleUserPress(userObj)}
          icon={isClockedIn ? ICONS.check : ICONS.redx}
          text={
            userObj.first +
            " " +
            (userObj?.last?.length >= 0 ? userObj.last[0] : "") +
            "."
          }
          textStyle={{ fontSize: 13 }}
          iconSize={13}
          buttonStyle={{
            paddingHorizontal: 7,
            paddingVertical: 2,
            marginRight: 5,
            borderWidth: 1,
            borderColor: APP_BASE_COLORS.buttonLightGreenOutline,
            backgroundColor: APP_BASE_COLORS.buttonLightGreen,
            borderRadius: 15,
          }}
        />
      ) : null}

      {webcamDetected ? (
        <Image_ style={{ width: 19, height: 19 }} icon={ICONS.camera} />
      ) : null}
      <View style={{ width: 5 }} />
      <Image_
        style={{ width: 28, height: 28 }}
        icon={__isOnline ? ICONS.wifi : ICONS.internetOfflineGIF}
      />
    </View>
  </View>
);

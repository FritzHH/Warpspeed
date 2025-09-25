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
import { C, Colors, ICONS } from "../../styles";
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
import { dbCreateUserPunchAction } from "../../db_call_wrapper";
import { INTERNET_CHECK_DELAY, LOCAL_DB_KEYS } from "../../constants";
import { UserClockHistoryModal } from "../screen_components/modal_screens/UserClockHistoryModalScreen";

export function Options_Section({}) {
  // store setters ///////////////////////////////////////////////////////////
  const _zSetOptionsTabName = useTabNamesStore(
    (state) => state.setOptionsTabName
  );

  const _zSetShowAlert = useAlertScreenStore((state) => state.setShowAlert);
  const _zSetAlertValues = useAlertScreenStore((state) => state.setValues);

  // store getters ///////////////////////////////////////////////////////////////
  const zOptionsTabName = useTabNamesStore((state) =>
    state.getOptionsTabName()
  );

  const zWebcamDetected = useLoginStore((state) => state.getWebcamDetected());

  //////////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////////

  function handleUserClockPress(user) {
    let millis = new Date().getTime();
    let option = zPunchClock[user.id] ? "out" : "in";

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
        // userObj={zCurrentUser}
        // isClockedIn={zPunchClock[zCurrentUser?.id]}
        zOptionsTabName={zOptionsTabName}
        _zSetOptionsTabName={_zSetOptionsTabName}
        // __tabMenuHeight={}
        // __isOnline={sIsOnline}
        webcamDetected={zWebcamDetected}
        handleUserPress={handleUserClockPress}
      />
      {ScreenComponent()}
    </View>
  );

  /////////////////////////////////////////////////////////////////
  ////////////////////////////////////////////////////////////////
}

export const TabBar = ({
  webcamDetected,
  // sIsOnline,
  zOptionsTabName,
  _zSetOptionsTabName,
  handleUserPress,
}) => {
  const zCurrentUser = useLoginStore((state) => state.getCurrentUser());
  const zPunchClock = useLoginStore((state) => state.getPunchClock());
  // local state /////////////////////////////////////////////////////////////////////////
  const [sIsOnline, _setIsOnline] = useState(true);

  // run constant checks to check if interent is connected
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

  let isClockedIn = zPunchClock[zCurrentUser?.id];

  return (
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
        {!!zCurrentUser && (
          <Button_
            onPress={() => handleUserPress(zCurrentUser)}
            icon={isClockedIn ? ICONS.check : ICONS.redx}
            text={
              zCurrentUser.first +
              " " +
              (zCurrentUser?.last?.length >= 0 ? zCurrentUser.last[0] : "") +
              "."
            }
            textStyle={{ fontSize: 13, color: C.textMain }}
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
        )}

        {!!webcamDetected && (
          <Image_ style={{ width: 19, height: 19 }} icon={ICONS.camera} />
        )}
        <View style={{ width: 5 }} />
        <Image_
          style={{ width: 28, height: 28 }}
          icon={sIsOnline ? ICONS.wifi : ICONS.internetOfflineGIF}
        />
      </View>
    </View>
  );
};

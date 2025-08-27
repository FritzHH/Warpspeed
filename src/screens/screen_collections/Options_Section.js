/* eslint-disable */

import { Text, View } from "react-native-web";
import {
  checkInternetConnection,
  dim,
  generateRandomID,
  log,
  trimToTwoDecimals,
} from "../../utils";
import {
  HorzSpacer,
  TabMenuButton,
  TabMenuDivider as Divider,
  Image_,
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
import { useTabNamesStore, useLoginStore } from "../../stores";

export function Options_Section({}) {
  // store setters ///////////////////////////////////////////////////////////
  const _zSetOptionsTabName = useTabNamesStore(
    (state) => state.setOptionsTabName
  );

  // store getters ///////////////////////////////////////////////////////////////
  const zOptionsTabName = useTabNamesStore((state) =>
    state.getOptionsTabName()
  );
  const zUserObj = useLoginStore((state) => state.getCurrentUserObj());
  const zWebcamDetected = useLoginStore((state) => state.getWebcamDetected());

  /////////////////////////////////////////////////////////////////////////////
  const [sIsOnline, _setIsOnline] = useState(true);

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
        userObj={zUserObj}
        zOptionsTabName={zOptionsTabName}
        _zSetOptionsTabName={_zSetOptionsTabName}
        // __tabMenuHeight={}
        __isOnline={sIsOnline}
        webcamDetected={zWebcamDetected}
      />
      {ScreenComponent()}
    </View>
  );

  /////////////////////////////////////////////////////////////////
  ////////////////////////////////////////////////////////////////
}

export const TabBar = ({
  userObj,
  webcamDetected,
  __isOnline,
  zOptionsTabName,
  _zSetOptionsTabName,
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
      <Text style={{ color: APP_BASE_COLORS.textMain }}>
        {userObj.first + " " + userObj.last[0] + "."}
      </Text>
      <View style={{ width: 8 }} />
      <Image_
        style={{ width: 23, height: 23 }}
        icon={webcamDetected ? ICONS.camera : null}
      />
      <View style={{ width: 8 }} />
      <Image_
        icon={__isOnline ? ICONS.internetOnlineGIF : ICONS.internetOfflineGIF}
      />{" "}
    </View>
  </View>
);

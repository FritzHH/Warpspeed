/* eslint-disable */

import { View } from "react-native-web";
import { dim, generateRandomID, log, trimToTwoDecimals } from "../../utils";
import {
  HorzSpacer,
  TabMenuButton,
  TabMenuDivider as Divider,
} from "../../components";
import { Colors } from "../../styles";
import { WORKORDER_PROTO, TAB_NAMES } from "../../data";
// import { QuickItemsTab } from "./Options_QuickItemsTab";
import React, { useEffect, useRef, useState } from "react";
import { cloneDeep } from "lodash";
import { WorkordersComponent } from "../screen_components/Options_Screen/Options_Workorders";
import { QuickItemComponent } from "../screen_components/Options_Screen/Options_QuickItems";
import { InventoryComponent } from "../screen_components/Options_Screen/Options_Inventory";
import { MessagesComponent } from "../screen_components/Options_Screen/Options_Messages";
import { useTabNamesStore, useLoginStore } from "../../stores";

export function Options_Section({
  ssWorkorderObj = WORKORDER_PROTO,
  ssInventoryArr,
  ssAdjustableUserPreferences,
  __setWorkorderObj,
}) {
  // store setters
  const _zSetOptionsTabName = useTabNamesStore(
    (state) => state.setOptionsTabName
  );

  // store getters
  const zOptionsTabName = useTabNamesStore((state) =>
    state.getOptionsTabName()
  );

  /////////////////////////////////////////////////////////////////////////////
  const [sShowWorkorderModal, _setShowWorkorderModal] = React.useState(false);
  const [sShowInventoryModal, _setShowInventoryModal] = React.useState(false);

  const [screenWidth, _setScreenWidth] = useState(window.innerWidth);
  const [screenHeight, _setScreenHeight] = useState(window.innerHeight);

  const TAB_MENU_HEIGHT = Math.round(screenHeight * 0.03);
  const SCREEN_HEIGHT = Math.round(screenHeight * 0.97);

  useEffect(() => {
    const handleResize = () => {
      _setScreenWidth(window.innerWidth);
      _setScreenHeight(window.innerHeight);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // log("height", screenHeight);
  function ScreenComponent(tabName) {
    switch (tabName) {
      case TAB_NAMES.optionsTab.inventory:
        return <InventoryComponent __screenHeight={SCREEN_HEIGHT} />;
      case TAB_NAMES.optionsTab.messages:
        return <MessagesComponent __screenHeight={SCREEN_HEIGHT} />;
      case TAB_NAMES.optionsTab.quickItems:
        return <QuickItemComponent __screenHeight={SCREEN_HEIGHT} />;
      case TAB_NAMES.optionsTab.workorders:
        return <WorkordersComponent __screenHeight={SCREEN_HEIGHT} />;
    }
    return null;
  }

  return (
    <View style={{ height: "100%", width: "100%", backgroundColor: null }}>
      <TabBar
        zOptionsTabName={zOptionsTabName}
        _zSetOptionsTabName={_zSetOptionsTabName}
        __tabMenuHeight={TAB_MENU_HEIGHT}
      />
      {ScreenComponent(zOptionsTabName)}
    </View>
  );

  /////////////////////////////////////////////////////////////////
  ////////////////////////////////////////////////////////////////
}

export const TabBar = ({
  zOptionsTabName,
  _zSetOptionsTabName,
  __setShowWorkorderModal,
  __setShowInventoryModal,
  __tabMenuHeight,
}) => (
  <View
    style={{
      flexDirection: "row",
      // width: "100%",
      // justifyContent: "space-between",
      height: __tabMenuHeight,
    }}
  >
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
    {/* <TabMenuButton
      // height={height}
      onPress={() => __setShowWorkorderModal(true)}
      buttonStyle={{ width: 50 }}
      text={`\u2610`}
      isSelected={
        zOptionsTabName == TAB_NAMES.optionsTab.workorders ? true : false
      }
    /> */}
    {/* <Divider /> */}
    {/* <TabMenuButton
      // height={height}
      onPress={() => _zSetOptionsTabName(TAB_NAMES.optionsTab.inventory)}
      text={TAB_NAMES.optionsTab.inventory}
      isSelected={
        zOptionsTabName == TAB_NAMES.optionsTab.inventory ? true : false
      }
    />
    <TabMenuButton
      // height={height}
      onPress={() => __setShowInventoryModal(true)}
      buttonStyle={{ width: 50 }}
      text={`\u2610`}
      isSelected={
        zOptionsTabName == TAB_NAMES.optionsTab.inventory ? true : false
      }
    />
    <Divider /> */}
    <TabMenuButton
      // height={height}
      onPress={() => _zSetOptionsTabName(TAB_NAMES.optionsTab.messages)}
      text={TAB_NAMES.optionsTab.messages}
      isSelected={
        zOptionsTabName == TAB_NAMES.optionsTab.messages ? true : false
      }
    />
  </View>
);

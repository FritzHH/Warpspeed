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
import React, { useRef, useState } from "react";
import { cloneDeep } from "lodash";
import { WorkordersComponent } from "../screen_components/Options_Workorders";
import { QuickItemComponent } from "../screen_components/Options_QuickItems";
import { InventoryComponent } from "../screen_components/Options_Inventory";
import { WorkorderPreview } from "../screen_components/Items_WorkorderPreview";
import { MessagesComponent } from "../screen_components/Options_Messages";
import { useTabNamesStore, useLoginStore } from "../../stores";

export function Options_Section({
  ssWorkorderObj = WORKORDER_PROTO,
  ssInventoryArr,
  ssAdjustableUserPreferences,
  __setWorkorderObj,
}) {
  // setters
  const _zSetOptionsTabName = useTabNamesStore(
    (state) => state.setOptionsTabName
  );
  // const _zSetShowLoginScreen = useWaitForLoginStore(
  //   (state) => state.setShowLoginScreen
  // );
  // getters
  const zOptionsTabName = useTabNamesStore((state) =>
    state.getOptionsTabName()
  );
  // const zShowLoginScreen = useWaitForLoginStore((state) =>
  //   state.getShowLoginScreen()
  // );
  // const zLoginFunctionCallback = useWaitForLoginStore((state) =>
  //   state.getLoginFunctionCallback()
  // );

  /////////////////////////////////////////////////////////////////////////////
  const [sShowWorkorderModal, _setShowWorkorderModal] = React.useState(false);
  const [sShowInventoryModal, _setShowInventoryModal] = React.useState(false);

  /////////////////////////////////////////////////////////////////
  ////////////////////////////////////////////////////////////////
  return (
    <View style={{}}>
      <TabBar
        zOptionsTabName={zOptionsTabName}
        _zSetOptionsTabName={_zSetOptionsTabName}
        __setShowInventoryModal={_setShowInventoryModal}
        __setShowWorkorderModal={_setShowWorkorderModal}
      />
      {/* <LoginScreenComponent
        modalVisible={zShowLoginScreen}
        loginCallback={() => zLoginFunctionCallback()}
        _setModalVisibility={() => _zSetShowLoginScreen(false)}
      /> */}
      {zOptionsTabName === TAB_NAMES.optionsTab.quickItems && (
        <QuickItemComponent
          ssWorkorderObj={{}}
          __setWorkorderObj={__setWorkorderObj}
          ssAdjustableUserPreferences={ssAdjustableUserPreferences}
          ssInventoryArr={ssInventoryArr}
        />
      )}
      {zOptionsTabName === TAB_NAMES.optionsTab.inventory && (
        <InventoryComponent />
      )}
      {zOptionsTabName === TAB_NAMES.optionsTab.workorders && (
        <WorkordersComponent />
      )}
      {zOptionsTabName === TAB_NAMES.optionsTab.messages && (
        <MessagesComponent />
      )}
    </View>
  );
}

const TabBar = ({
  zOptionsTabName,
  _zSetOptionsTabName,
  __setShowWorkorderModal,
  __setShowInventoryModal,
}) => (
  <View
    style={{
      flexDirection: "row",
      width: "100%",
      justifyContent: "space-between",
      height: "3%",
    }}
  >
    <View
      style={{
        flexDirection: "row",
      }}
    >
      <TabMenuButton
        height={dim.windowHeight * 0.03}
        onPress={() => _zSetOptionsTabName(TAB_NAMES.optionsTab.quickItems)}
        text={TAB_NAMES.optionsTab.quickItems}
        isSelected={
          zOptionsTabName === TAB_NAMES.optionsTab.quickItems ? true : false
        }
      />
      <Divider />
      <TabMenuButton
        height={dim.windowHeight * 0.03}
        onPress={() => _zSetOptionsTabName(TAB_NAMES.optionsTab.workorders)}
        text={TAB_NAMES.optionsTab.workorders}
        isSelected={
          zOptionsTabName == TAB_NAMES.optionsTab.workorders ? true : false
        }
      />
      <TabMenuButton
        height={dim.windowHeight * 0.03}
        onPress={() => __setShowWorkorderModal(true)}
        buttonStyle={{ width: 50 }}
        text={`\u2610`}
        isSelected={
          zOptionsTabName == TAB_NAMES.optionsTab.workorders ? true : false
        }
      />
      <Divider />
      <TabMenuButton
        height={dim.windowHeight * 0.03}
        onPress={() => _zSetOptionsTabName(TAB_NAMES.optionsTab.inventory)}
        text={TAB_NAMES.optionsTab.inventory}
        isSelected={
          zOptionsTabName == TAB_NAMES.optionsTab.inventory ? true : false
        }
      />
      <TabMenuButton
        height={dim.windowHeight * 0.03}
        onPress={() => __setShowInventoryModal(true)}
        buttonStyle={{ width: 50 }}
        text={`\u2610`}
        isSelected={
          zOptionsTabName == TAB_NAMES.optionsTab.inventory ? true : false
        }
      />
      <Divider />
      <TabMenuButton
        height={dim.windowHeight * 0.03}
        onPress={() => _zSetOptionsTabName(TAB_NAMES.optionsTab.messages)}
        text={TAB_NAMES.optionsTab.messages}
        isSelected={
          zOptionsTabName == TAB_NAMES.optionsTab.messages ? true : false
        }
      />
    </View>
  </View>
);

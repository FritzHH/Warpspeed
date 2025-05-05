import { on } from "events";
import { Items_WorkorderItemsTab } from "../screen_components/Items_WorkorderItems";
import { Tab } from "react-tabs";
import { View, Text } from "react-native-web";
import React from "react";

import { TAB_NAMES } from "../../data";
import { TabMenuButton } from "../../components";
import { TabMenuDivider as Divider } from "../../components";
import { log } from "../../utils";
import { Colors } from "../../styles";
import { Items_Dashboard } from "../screen_components/Items_Dashboard";

export function Items_Section({
  ssWorkorderObj,
  __setWorkorderObj,
  ssItemsTabName,
  __setItemsTabName,
  fun_create_new_workorder,
}) {
  const Tab_WorkorderItems = (
    <Items_WorkorderItemsTab
      ssWorkorderObj={ssWorkorderObj}
      __setWorkorderObj={__setWorkorderObj}
    />
  );

  const Tab_ChangeLog = (
    <View>
      <Text>Change Log Tab</Text>
    </View>
  );
  const Tab_Dashboard = (
    <Items_Dashboard fun_create_new_workorder={fun_create_new_workorder} />
  );
  const New_Workorder = (
    <View
      style={{
        width: "100%",
        height: "90%",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Text
        style={{
          opacity: 0.17,
          fontSize: 100,
          width: "80%",
          textAlign: "center",
        }}
      >
        Empty Workorder
      </Text>
    </View>
  );

  function selectComponent() {
    if (ssItemsTabName == TAB_NAMES.itemsTab.workorderItems)
      return Tab_WorkorderItems;
    if (ssItemsTabName == TAB_NAMES.itemsTab.changeLog) return Tab_ChangeLog;
    if (ssItemsTabName == TAB_NAMES.itemsTab.dashboard) return Tab_Dashboard;
    if (ssItemsTabName == TAB_NAMES.itemsTab.creatingNewWorkorder)
      return New_Workorder;
  }

  return (
    <View style={{ width: "100%", height: "100%" }}>
      <TabBar
        __setItemsTabName={__setItemsTabName}
        ssItemsTabName={ssItemsTabName}
      />
      {selectComponent()}
    </View>
  );
}

const TabBar = ({ __setItemsTabName, ssItemsTabName }) => (
  <View
    style={{
      flexDirection: "row",
      width: "100%",
      justifyContent: "space-between",
    }}
  >
    <View
      style={{
        flexDirection: "row",
      }}
    >
      <TabMenuButton
        onPress={() => __setItemsTabName(TAB_NAMES.itemsTab.workorderItems)}
        text={TAB_NAMES.itemsTab.workorderItems}
        isSelected={
          ssItemsTabName === TAB_NAMES.itemsTab.workorderItems ? true : false
        }
      />
      <Divider />
      <TabMenuButton
        onPress={() => __setItemsTabName(TAB_NAMES.itemsTab.changeLog)}
        text={TAB_NAMES.itemsTab.changeLog}
        isSelected={
          ssItemsTabName === TAB_NAMES.itemsTab.changeLog ? true : false
        }
      />
    </View>
    <View
      style={{
        flexDirection: "row",
        // paddingRight: 10,
      }}
    >
      <TabMenuButton
        onPress={() => __setItemsTabName(TAB_NAMES.itemsTab.dashboard)}
        text={TAB_NAMES.itemsTab.dashboard}
        isSelected={
          ssItemsTabName === TAB_NAMES.itemsTab.dashboard ? true : false
        }
      />
    </View>
  </View>
);

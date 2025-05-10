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
import { CustomerSearchListComponent } from "../screen_components/Items_CustomerSearchList";
import { WorkorderGlimpse } from "../screen_components/Items_WorkorderGlimpse";

export function Items_Section({
  ssWorkorderObj,
  ssCustomerObj,
  ssItemsTabName,
  ssCustomerSearchArr,
  ssWorkorderPreviewObj,
  __setWorkorderObj,
  __setItemsTabName,
  __setCustomerObj,
  __setOptionsTabName,
  __setInfoComponentName,
  __setCustomerSearchArr,
  __setWorkorderPreviewObj,
}) {
  const Tab_WorkorderItems = (
    <Items_WorkorderItemsTab
      ssWorkorderObj={ssWorkorderObj}
      __setWorkorderObj={__setWorkorderObj}
    />
  );

  // log("preview", ssWorkorderPreviewObj);
  const Tab_Preview = ssWorkorderPreviewObj ? (
    <WorkorderGlimpse ssWorkorderPreviewObj={ssWorkorderPreviewObj} />
  ) : null;

  const Tab_ChangeLog = (
    <View>
      <Text>Change Log Tab</Text>
    </View>
  );
  const Tab_Dashboard = null;
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

  const Customer_List = (
    <CustomerSearchListComponent
      __setCustomerObj={__setCustomerObj}
      __setWorkorderObj={__setWorkorderObj}
      __setOptionsTabName={__setOptionsTabName}
      __setInfoComponentName={__setInfoComponentName}
      __setItemsTabName={__setItemsTabName}
      __setCustomerSearchArr={__setCustomerSearchArr}
      ssCustomerSearchArr={ssCustomerSearchArr}
      ssCustomerObj={ssCustomerObj}
    />
  );

  function selectComponent() {
    if (ssItemsTabName == TAB_NAMES.itemsTab.workorderItems)
      return Tab_WorkorderItems;
    if (ssItemsTabName == TAB_NAMES.itemsTab.changeLog) return Tab_ChangeLog;
    if (ssItemsTabName == TAB_NAMES.itemsTab.dashboard) return Tab_Dashboard;
    if (ssItemsTabName === TAB_NAMES.itemsTab.customerList)
      return Customer_List;
    if (ssItemsTabName === TAB_NAMES.itemsTab.preview) return Tab_Preview;
  }

  let excludeTabNames = [];
  if (ssItemsTabName === TAB_NAMES.itemsTab.customerList)
    excludeTabNames.push(TAB_NAMES.itemsTab.customerList);
  return (
    <View style={{ width: "100%", height: "100%" }}>
      <TabBar
        __setItemsTabName={__setItemsTabName}
        ssItemsTabName={ssItemsTabName}
        ssWorkorderObj={ssWorkorderObj}
        excludeTabNames={excludeTabNames}
      />
      {selectComponent()}
    </View>
  );
}

const TabBar = ({
  __setItemsTabName,
  ssItemsTabName,
  ssWorkorderObj,
  excludeTabNames = [],
}) => {
  let excludeWorkorder, excludeChangelog, excludeDashboard;
  if (ssItemsTabName === TAB_NAMES.itemsTab.customerList) {
    excludeWorkorder = true;
    excludeChangelog = true;
  }
  return (
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
        {ssWorkorderObj && !excludeWorkorder && (
          <TabMenuButton
            onPress={() => __setItemsTabName(TAB_NAMES.itemsTab.workorderItems)}
            text={TAB_NAMES.itemsTab.workorderItems}
            isSelected={
              ssItemsTabName === TAB_NAMES.itemsTab.workorderItems
                ? true
                : false
            }
          />
        )}
        <Divider />
        {ssWorkorderObj && !excludeChangelog && (
          <TabMenuButton
            onPress={() => __setItemsTabName(TAB_NAMES.itemsTab.changeLog)}
            text={TAB_NAMES.itemsTab.changeLog}
            isSelected={
              ssItemsTabName === TAB_NAMES.itemsTab.changeLog ? true : false
            }
          />
        )}
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
};

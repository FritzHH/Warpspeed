/* eslint-disable */

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
import { WorkorderPreview } from "../screen_components/Items_WorkorderPreview";
import {
  useCurrentWorkorderStore,
  useOpenWorkordersStore,
  useTabNamesStore,
  useWorkorderPreviewStore,
} from "../../stores";

export function Items_Section({ ssWorkorderObj, __setItemsTabName }) {
  const _zSetItemsTabName = useTabNamesStore((state) => state.setItemsTabName);
  ///
  const zWorkorderPreview = useWorkorderPreviewStore((state) =>
    state.getPreviewObj()
  );
  const zWorkorderObj = useCurrentWorkorderStore((state) =>
    state.getWorkorderObj()
  );
  const zItemsTabName = useTabNamesStore((state) => state.getItemsTabName());

  /////////////////////////////////////////////////////////////////////////////
  function selectComponent() {
    if (zWorkorderPreview) return <WorkorderPreview />;
    if (zItemsTabName == TAB_NAMES.itemsTab.workorderItems)
      return <Items_WorkorderItemsTab />;
    if (zItemsTabName == TAB_NAMES.itemsTab.changeLog)
      return (
        <View>
          <Text>Change Log Tab</Text>
        </View>
      );
    if (zItemsTabName == TAB_NAMES.itemsTab.dashboard)
      return (
        <View>
          <Text>Dashboard babes</Text>
        </View>
      );
    if (zItemsTabName === TAB_NAMES.itemsTab.customerList)
      return <CustomerSearchListComponent />;
  }

  return (
    <View style={{ width: "100%", height: "100%" }}>
      <TabBar
        _zSetItemsTabName={_zSetItemsTabName}
        zItemsTabName={zItemsTabName}
        zWorkorderObj={zWorkorderObj}
      />
      {selectComponent()}
    </View>
  );
}

const TabBar = ({ _zSetItemsTabName, zItemsTabName, zWorkorderObj }) => {
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
        {zWorkorderObj.id ? (
          <TabMenuButton
            onPress={() => _zSetItemsTabName(TAB_NAMES.itemsTab.workorderItems)}
            text={TAB_NAMES.itemsTab.workorderItems}
            isSelected={
              zItemsTabName === TAB_NAMES.itemsTab.workorderItems ? true : false
            }
          />
        ) : null}
        <Divider />
        {zWorkorderObj.id ? (
          <TabMenuButton
            onPress={() => _zSetItemsTabName(TAB_NAMES.itemsTab.changeLog)}
            text={TAB_NAMES.itemsTab.changeLog}
            isSelected={
              zItemsTabName === TAB_NAMES.itemsTab.changeLog ? true : false
            }
          />
        ) : null}
      </View>
      <View
        style={{
          flexDirection: "row",
          // paddingRight: 10,
        }}
      >
        <TabMenuButton
          onPress={() => _zSetItemsTabName(TAB_NAMES.itemsTab.dashboard)}
          text={TAB_NAMES.itemsTab.dashboard}
          isSelected={
            zItemsTabName === TAB_NAMES.itemsTab.dashboard ? true : false
          }
        />
      </View>
    </View>
  );
};

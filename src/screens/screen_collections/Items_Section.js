/* eslint-disable */

import { on } from "events";
import { Tab } from "react-tabs";
import { View, Text } from "react-native-web";
import React from "react";

import { TAB_NAMES, WORKORDER_ITEM_PROTO, WORKORDER_PROTO } from "../../data";
import { TabMenuButton } from "../../components";
import { TabMenuDivider as Divider } from "../../components";
import { clog, log } from "../../utils";
import { Colors } from "../../styles";
import { Items_Dashboard } from "../screen_components/Items_Screen/Items_Dashboard";
import { CustomerSearchListComponent } from "../screen_components/Items_Screen/Items_CustomerSearchList";
import { WorkorderPreview } from "../screen_components/Items_Screen/Items_WorkorderPreview";
import { Items_WorkorderItemsTab } from "../screen_components/Items_Screen/Items_WorkorderItems";

import {
  useCurrentWorkorderStore,
  useCustomerSearchStore,
  useTabNamesStore,
  useWorkorderPreviewStore,
} from "../../stores";
import { EmptyItemsComponent } from "../screen_components/Items_Screen/Items_Empty";

export function Items_Section({}) {
  // setters ///////////////////////////////////////////////////////////////////
  const _zSetItemsTabName = useTabNamesStore((state) => state.setItemsTabName);

  // getters ///////////////////////////////////////////////////////////////////
  const zWorkorderPreview = useWorkorderPreviewStore((state) =>
    state.getPreviewObj()
  );

  let zWorkorderObj = WORKORDER_PROTO;
  zWorkorderObj = useCurrentWorkorderStore((state) => state.getWorkorderObj());
  const zCustomerSearchArr = useCustomerSearchStore((state) =>
    state.getSearchResultsArr()
  );
  const zItemsTabName = useTabNamesStore((state) => state.getItemsTabName());

  /////////////////////////////////////////////////////////////////////////////

  function ScreenComponent(tabName) {
    switch (tabName) {
      case TAB_NAMES.itemsTab.changeLog:
        return <Text>Change Log Tab</Text>;
      case TAB_NAMES.itemsTab.customerList:
        // if (zCustomerSearchArr.length > 1)
        return <CustomerSearchListComponent />;
        break;
      case TAB_NAMES.itemsTab.dashboard:
        return <Items_Dashboard />;
      case TAB_NAMES.itemsTab.preview:
        return <WorkorderPreview />;
      case TAB_NAMES.itemsTab.workorderItems:
        return <Items_WorkorderItemsTab />;
      case TAB_NAMES.itemsTab.empty:
        return <EmptyItemsComponent />;
    }
    return null;
  }

  return (
    <View style={{ height: "100%" }}>
      <TabBar
        _zSetItemsTabName={_zSetItemsTabName}
        zItemsTabName={zItemsTabName}
        zWorkorderObj={zWorkorderObj}
      />
      {ScreenComponent(zItemsTabName)}
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
        {zWorkorderObj?.id ? (
          <View>
            <TabMenuButton
              onPress={() =>
                _zSetItemsTabName(TAB_NAMES.itemsTab.workorderItems)
              }
              text={
                zWorkorderObj.isStandaloneSale
                  ? "Sale Items"
                  : TAB_NAMES.itemsTab.workorderItems
              }
              isSelected={
                zItemsTabName === TAB_NAMES.itemsTab.workorderItems
                  ? true
                  : false
              }
            />
            <Divider />
          </View>
        ) : null}
        {zWorkorderObj?.id && !zWorkorderObj.isStandaloneSale ? (
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

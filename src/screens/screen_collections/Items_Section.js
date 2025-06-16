/* eslint-disable */

import { on } from "events";
import { Items_WorkorderItemsTab } from "../screen_components/Items_WorkorderItems";
import { Tab } from "react-tabs";
import { View, Text } from "react-native-web";
import React from "react";

import { TAB_NAMES, WORKORDER_ITEM_PROTO, WORKORDER_PROTO } from "../../data";
import { TabMenuButton } from "../../components";
import { TabMenuDivider as Divider } from "../../components";
import { clog, log } from "../../utils";
import { Colors } from "../../styles";
import { Items_Dashboard } from "../screen_components/Items_Dashboard";
import { CustomerSearchListComponent } from "../screen_components/Items_CustomerSearchList";
import { WorkorderPreview } from "../screen_components/Items_WorkorderPreview";
import {
  useCurrentWorkorderStore,
  useCustomerSearchStore,
  useTabNamesStore,
  useWorkorderPreviewStore,
} from "../../stores";

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

  function selectComponent() {
    if (zWorkorderPreview) return <WorkorderPreview />;
    if (
      zCustomerSearchArr.length > 1 &&
      zItemsTabName === TAB_NAMES.itemsTab.customerList
    )
      return <CustomerSearchListComponent />;
    if (zItemsTabName == TAB_NAMES.itemsTab.workorderItems)
      return <Items_WorkorderItemsTab />;
    if (zItemsTabName == TAB_NAMES.itemsTab.changeLog)
      return (
        <View>
          <Text>Change Log Tab</Text>
        </View>
      );
    return <Items_Dashboard />;
  }

  return (
    <View style={{ height: "100%" }}>
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
  clog(zWorkorderObj);
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
          <TabMenuButton
            onPress={() => _zSetItemsTabName(TAB_NAMES.itemsTab.workorderItems)}
            text={
              zWorkorderObj.isStandaloneSale
                ? "Sale Items"
                : TAB_NAMES.itemsTab.workorderItems
            }
            isSelected={
              zItemsTabName === TAB_NAMES.itemsTab.workorderItems ? true : false
            }
          />
        ) : null}
        <Divider />
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

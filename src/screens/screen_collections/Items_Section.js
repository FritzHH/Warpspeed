/* eslint-disable */

import { View, Text } from "react-native-web";
import React from "react";

import { TAB_NAMES } from "../../data";
import { TabMenuButton } from "../../components";
import { Items_Dashboard } from "../screen_components/Items_Screen/Items_Dashboard";
import { CustomerSearchListComponent } from "../screen_components/Items_Screen/Items_CustomerSearchList";
import { WorkorderPreview } from "../screen_components/Items_Screen/Items_WorkorderPreview";
import { Items_WorkorderItemsTab } from "../screen_components/Items_Screen/Items_WorkorderItems";

import {
  useOpenWorkordersStore,
  useCustomerSearchStore,
  useTabNamesStore,
} from "../../stores";
import { EmptyItemsComponent } from "../screen_components/Items_Screen/Items_Empty";

export const Items_Section = React.memo(({}) => {
  // setters ///////////////////////////////////////////////////////////////////
  const _zSetItemsTabName = useTabNamesStore((state) => state.setItemsTabName);

  // getters ///////////////////////////////////////////////////////////////////

  const zCustomerSearchResults = useCustomerSearchStore((s) => s.searchResults);
  const zItemsTabName = useTabNamesStore((state) => state.itemsTabName);
  const zOpenWorkorder = useOpenWorkordersStore((s) => s.zOpenWorkorder);
  ///////////////////////////////////////////////////////////////////////////
  // log("Items_Section render");
  function ScreenComponent() {
    switch (zItemsTabName) {
      case TAB_NAMES.itemsTab.changeLog:
        return <Text>Change Log Tab</Text>;
      case TAB_NAMES.itemsTab.customerList:
        return <CustomerSearchListComponent />;
      case TAB_NAMES.itemsTab.dashboard:
        return <Items_Dashboard />;
      case TAB_NAMES.itemsTab.preview:
        return <WorkorderPreview />;
      case TAB_NAMES.itemsTab.workorderItems:
        return <Items_WorkorderItemsTab />;
      case TAB_NAMES.itemsTab.empty:
        return <EmptyItemsComponent />;
      default:
        return null;
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <TabBar
        _zSetItemsTabName={_zSetItemsTabName}
        zItemsTabName={zItemsTabName}
        zWorkorderId={zOpenWorkorder?.id}
        zIsStandaloneSale={zOpenWorkorder?.isStandaloneSale}
      />
      {ScreenComponent(zItemsTabName)}
    </View>
  );
});

const TabBar = ({
  _zSetItemsTabName,
  zItemsTabName,
  zWorkorderId,
  zIsStandaloneSale,
}) => {
  // log("Items_Section TabBar render");
  return (
    <View
      style={{
        flexDirection: "row",
        width: "100%",
        justifyContent: "space-between",
        // backgroundColor: "green",
        // height: 50,
      }}
    >
      <View
        style={{
          flexDirection: "row",
        }}
      >
        {!!zWorkorderId && (
          <View>
            <TabMenuButton
              buttonStyle={{
                borderTopLeftRadius: 15,
              }}
              onPress={() =>
                _zSetItemsTabName(TAB_NAMES.itemsTab.workorderItems)
              }
              text={
                zIsStandaloneSale
                  ? "Sale Items"
                  : TAB_NAMES.itemsTab.workorderItems
              }
              isSelected={
                zItemsTabName === TAB_NAMES.itemsTab.workorderItems
                  ? true
                  : false
              }
            />
            {/* <View style={{ width: 20 }} /> */}
          </View>
        )}
        {zWorkorderId && !zIsStandaloneSale && (
          <TabMenuButton
            onPress={() => _zSetItemsTabName(TAB_NAMES.itemsTab.changeLog)}
            text={TAB_NAMES.itemsTab.changeLog}
            isSelected={
              zItemsTabName === TAB_NAMES.itemsTab.changeLog ? true : false
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
          buttonStyle={{
            borderTopRightRadius: 15,
          }}
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

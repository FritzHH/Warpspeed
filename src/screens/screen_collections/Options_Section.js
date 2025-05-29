/* eslint-disable */

import {
  View,
  Text,
  Pressable,
  TextInput,
  FlatList,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from "react-native-web";
import { dim, generateRandomID, log, trimToTwoDecimals } from "../../utils";
import {
  HorzSpacer,
  TabMenuButton,
  TabMenuDivider as Divider,
  ModalDropdown,
  TextInputOnMainBackground,
  TextInputLabelOnMainBackground,
  ScreenModal,
  CustomerInfoComponent,
  Button,
} from "../../components";
import { Colors } from "../../styles";
import {
  bike_colors_db,
  bike_brands_db,
  CUSTOMER_PROTO,
  bike_descriptions_db,
  discounts_db,
  part_sources_db,
  WORKORDER_PROTO,
  WORKORDER_ITEM_PROTO,
  bike_colors_arr_db,
  FOCUS_NAMES,
  TAB_NAMES,
} from "../../data";
// import { QuickItemsTab } from "./Options_QuickItemsTab";
import React, { useRef } from "react";
import { cloneDeep } from "lodash";
import { WorkordersComponent } from "../screen_components/Options_Workorders";
import { QuickItemComponent } from "../screen_components/Options_QuickItems";
import { InventoryComponent } from "../screen_components/Options_Inventory";
import { WorkorderPreview } from "../screen_components/Items_WorkorderPreview";
import { MessagesComponent } from "../screen_components/Options_Messages";
import { useTabNamesStore } from "../../stores";

export function Options_Section({
  ssWorkorderObj = WORKORDER_PROTO,
  ssInventoryArr,
  ssAdjustableUserPreferences,
  __setWorkorderObj,
}) {
  const _zSetOptionsTabName = useTabNamesStore(
    (state) => state.setOptionsTabName
  );
  ///
  const zOptionsTabName = useTabNamesStore((state) =>
    state.getOptionsTabName()
  );

  /////////////////////////////////////////////////////////////////////////////
  const [sShowWorkorderModal, _setShowWorkorderModal] = React.useState(false);
  const [sShowInventoryModal, _setShowInventoryModal] = React.useState(false);

  function addItemToWorkorder(inventoryItem) {
    // log("incoming item", inventoryItem);
    let cWorkorderObj = structuredClone(ssWorkorderObj);
    let newLine = { ...WORKORDER_ITEM_PROTO };
    let curLines = cWorkorderObj.workorderLines;
    let foundObj = curLines.find((line) => inventoryItem.id === line.itemID); // if (found)
    if (foundObj) {
      newLine = { ...foundObj };
      newLine.qty = foundObj.qty + 1;
      curLines = curLines.map((oldLine) => {
        if (oldLine.itemID === inventoryItem.id) return newLine;
        return oldLine;
      });
    } else {
      newLine.qty = 1;
      newLine.id = generateRandomID();
      newLine.itemID = inventoryItem.id;
      curLines.push(newLine);
      // cWorkorderObj.itemIdArr.push(inventoryItem.id);
    }
    cWorkorderObj.workorderLines = curLines;
    // log("finished", curLines);
    // log("here", cWorkorderObj);
    __setWorkorderObj(cWorkorderObj);
  }

  log("modal", zOptionsTabName);
  /////////////////////////////////////////////////////////////////
  ////////////////////////////////////////////////////////////////
  return (
    <View style={{ flex: 1 }}>
      <TabBar
        zOptionsTabName={zOptionsTabName}
        _zSetOptionsTabName={_zSetOptionsTabName}
        __setShowInventoryModal={_setShowInventoryModal}
        __setShowWorkorderModal={_setShowWorkorderModal}
      />
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
    }}
  >
    <View
      style={{
        flexDirection: "row",
      }}
    >
      <TabMenuButton
        onPress={() => _zSetOptionsTabName(TAB_NAMES.optionsTab.quickItems)}
        text={TAB_NAMES.optionsTab.quickItems}
        isSelected={
          zOptionsTabName === TAB_NAMES.optionsTab.quickItems ? true : false
        }
      />
      <Divider />
      <TabMenuButton
        onPress={() => _zSetOptionsTabName(TAB_NAMES.optionsTab.workorders)}
        text={TAB_NAMES.optionsTab.workorders}
        isSelected={
          zOptionsTabName == TAB_NAMES.optionsTab.workorders ? true : false
        }
      />
      <TabMenuButton
        onPress={() => __setShowWorkorderModal(true)}
        buttonStyle={{ width: 50 }}
        text={`\u2610`}
        isSelected={
          zOptionsTabName == TAB_NAMES.optionsTab.workorders ? true : false
        }
      />
      <Divider />
      <TabMenuButton
        onPress={() => _zSetOptionsTabName(TAB_NAMES.optionsTab.inventory)}
        text={TAB_NAMES.optionsTab.inventory}
        isSelected={
          zOptionsTabName == TAB_NAMES.optionsTab.inventory ? true : false
        }
      />
      <TabMenuButton
        onPress={() => __setShowInventoryModal(true)}
        buttonStyle={{ width: 50 }}
        text={`\u2610`}
        isSelected={
          zOptionsTabName == TAB_NAMES.optionsTab.inventory ? true : false
        }
      />
      <Divider />
      <TabMenuButton
        onPress={() => _zSetOptionsTabName(TAB_NAMES.optionsTab.messages)}
        text={TAB_NAMES.optionsTab.messages}
        isSelected={
          zOptionsTabName == TAB_NAMES.optionsTab.messages ? true : false
        }
      />
    </View>
  </View>
);

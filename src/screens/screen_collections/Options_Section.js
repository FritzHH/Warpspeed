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
  ssOptionsTabName,
  ssWorkorderObj = WORKORDER_PROTO,
  ssWorkordersArr,
  ssInventoryArr,
  ssAdjustableUserPreferences,
  ssMessagesArr,
  __setMessagesArr,
  __setOptionsTabName,
  __setWorkorderObj,
  __setInventoryArr,
  __setInventoryItem,
  __setWorkorderPreviewObj,
  __setInfoComponentName,
  __createNewWorkorder,
}) {
  const zOptionsTabName = useTabNamesStore((state) =>
    state.getOptionsTabName()
  );
  /////////////////////
  const [sShowWorkorderModal, _setShowWorkorderModal] = React.useState(false);
  const [sShowInventoryModal, _setShowInventoryModal] = React.useState(false);
  /////////////////////////////////
  // functions
  ////////////////////////////////
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

  // log("modal", sShowWorkorderModal);
  return (
    <View style={{ flex: 1 }}>
      <TabBar
        zOptionsTabName={zOptionsTabName}
        workorderBtnClicked={(workorderObj) => log("clicked", workorderObj)}
        ssWorkorderObj={ssWorkorderObj}
        ssShowWorkorderModal={sShowWorkorderModal}
        ssShowInventoryModal={sShowInventoryModal}
        __setShowInventoryModal={_setShowInventoryModal}
        __setShowWorkorderModal={_setShowWorkorderModal}
        __setOptionsTabName={__setOptionsTabName}
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
        <InventoryComponent
          ssInventoryArr={ssInventoryArr}
          ssWorkorderObj={ssWorkorderObj}
          __setInventoryItem={__setInventoryItem}
          __setOptionsTabName={__setOptionsTabName}
          __setWorkorderObj={__setWorkorderObj}
          __addItemToWorkorder={addItemToWorkorder}
        />
      )}
      {zOptionsTabName === TAB_NAMES.optionsTab.workorders && (
        <WorkordersComponent
          ssWorkordersArr={ssWorkordersArr}
          __setWorkorderObj={__setWorkorderObj}
          __setWorkorderPreviewObject={__setWorkorderPreviewObj}
          __setOptionsTabName={__setOptionsTabName}
          __setInfoComponentName={__setInfoComponentName}
        />
      )}
      {zOptionsTabName === TAB_NAMES.optionsTab.messages && (
        <MessagesComponent
          ssMessagesArr={ssMessagesArr}
          __setMessagesArr={__setMessagesArr}
        />
      )}
    </View>
  );
}

const TabBar = ({
  zOptionsTabName,
  workorderBtnClicked,
  ssWorkorderObj,
  ssShowWorkorderModal,
  ssShowInventoryModal,
  __setOptionsTabName,
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
        onPress={() => __setOptionsTabName(TAB_NAMES.optionsTab.quickItems)}
        text={TAB_NAMES.optionsTab.quickItems}
        isSelected={
          zOptionsTabName === TAB_NAMES.optionsTab.quickItems ? true : false
        }
      />
      <Divider />
      <TabMenuButton
        onPress={() => __setOptionsTabName(TAB_NAMES.optionsTab.workorders)}
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
        onPress={() => __setOptionsTabName(TAB_NAMES.optionsTab.inventory)}
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
        onPress={() => __setOptionsTabName(TAB_NAMES.optionsTab.messages)}
        text={TAB_NAMES.optionsTab.messages}
        isSelected={
          zOptionsTabName == TAB_NAMES.optionsTab.messages ? true : false
        }
      />
    </View>
  </View>
);

import {
  View,
  Text,
  Pressable,
  TextInput,
  FlatList,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from "react-native-web";
import { dim, log, trimToTwoDecimals } from "../../utils";
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
import { WorkorderGlimpse } from "../screen_components/Items_WorkorderGlimpse";

export function Options_Section({
  ssOptionsTabName,
  ssWorkorderObj,
  ssWorkordersArr,
  ssInventoryArr,
  ssAdjustableUserPreferences,
  __setOptionsTabName,
  __setWorkorderObj,
  __setInventoryArr,
  __setInventoryItem,
  __setWorkorderPreviewObj,
}) {
  const [sShowWorkorderModal, _setShowWorkorderModal] = React.useState(false);
  const [sShowInventoryModal, _setShowInventoryModal] = React.useState(false);
  /////////////////////////////////
  // functions
  ////////////////////////////////
  function selectComponent() {
    if (ssOptionsTabName == TAB_NAMES.optionsTab.quickItems)
      return <QuickItemsTab />;
    if (ssOptionsTabName == TAB_NAMES.optionsTab.workorders)
      return <WorkordersComponent />;
  }

  function QuickItemsTab() {}

  const WorkordersTab = (
    <View style={{ flex: 1 }}>
      <FlatList
        data={ssWorkordersArr}
        renderItem={(item) => {
          item = item.item;
          return (
            <View style={{ flexDirection: "row", width: "100%", height: 30 }}>
              <TouchableOpacity>
                <View style={{ height: "100%", width: "100%" }}>
                  <Text>{item.name}</Text>
                </View>
                <View style={{ height: "100%", width: "80%" }}>
                  <Text>{item.name}</Text>
                </View>
                <View style={{ width: "20%", height: "100%" }}></View>
              </TouchableOpacity>
            </View>
          );
        }}
      />
    </View>
  );

  // log("modal", sShowWorkorderModal);
  return (
    <View style={{ flex: 1 }}>
      <WorkordersFullscreenModal
        __setModalVisibility={(val) => _setShowWorkorderModal(val)}
        // __setShowWorkorderModal={_setShowWorkorderModal}
        ssShowWorkorderModal={sShowWorkorderModal}
        ssModalVisible={sShowWorkorderModal}
      />
      <TabBar
        ssOptionsTabName={ssOptionsTabName}
        workorderBtnClicked={(workorderObj) => log("clicked", workorderObj)}
        ssWorkorderObj={ssWorkorderObj}
        ssShowWorkorderModal={sShowWorkorderModal}
        ssShowInventoryModal={sShowInventoryModal}
        __setShowInventoryModal={_setShowInventoryModal}
        __setShowWorkorderModal={_setShowWorkorderModal}
        __setOptionsTabName={__setOptionsTabName}
      />
      {ssOptionsTabName === TAB_NAMES.optionsTab.quickItems && (
        <QuickItemComponent
          ssWorkorderObj={ssOptionsTabName}
          __setWorkorderObj={__setWorkorderObj}
          ssAdjustableUserPreferences={ssAdjustableUserPreferences}
          ssInventoryArr={ssInventoryArr}
        />
      )}
      {ssOptionsTabName === TAB_NAMES.optionsTab.inventory && (
        <InventoryComponent
          __setInventoryItem={__setInventoryItem}
          ssInventoryArr={ssInventoryArr}
        />
      )}
      {ssOptionsTabName === TAB_NAMES.optionsTab.workorders && (
        <WorkordersComponent
          __setWorkorderObj={__setWorkorderObj}
          __setWorkorderPreviewObject={__setWorkorderPreviewObj}
          ssWorkordersArr={ssWorkordersArr}
        />
      )}
    </View>
  );
}

const TabBar = ({
  ssOptionsTabName,
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
          ssOptionsTabName === TAB_NAMES.optionsTab.quickItems ? true : false
        }
      />
      <Divider />
      <TabMenuButton
        onPress={() => __setOptionsTabName(TAB_NAMES.optionsTab.workorders)}
        text={TAB_NAMES.optionsTab.workorders}
        isSelected={
          ssOptionsTabName == TAB_NAMES.optionsTab.workorders ? true : false
        }
      />
      <TabMenuButton
        onPress={() => __setShowWorkorderModal(true)}
        buttonStyle={{ width: 50 }}
        text={`\u2610`}
        isSelected={
          ssOptionsTabName == TAB_NAMES.optionsTab.workorders ? true : false
        }
      />
      <Divider />
      <TabMenuButton
        onPress={() => __setOptionsTabName(TAB_NAMES.optionsTab.inventory)}
        text={TAB_NAMES.optionsTab.inventory}
        isSelected={
          ssOptionsTabName == TAB_NAMES.optionsTab.inventory ? true : false
        }
      />
      <TabMenuButton
        onPress={() => __setShowInventoryModal(true)}
        buttonStyle={{ width: 50 }}
        text={`\u2610`}
        isSelected={
          ssOptionsTabName == TAB_NAMES.optionsTab.inventory ? true : false
        }
      />
    </View>
  </View>
);

function WorkordersFullscreenModal({
  ssWorkordersArr,
  onSelectWorkorder,
  ssModalVisible,
  ssShowWorkorderModal,
  __setShowWorkorderModal,
  __setModalVisibility,
}) {
  return (
    <ScreenModal
      modalVisible={ssModalVisible}
      setModalVisibility={__setModalVisibility}
      buttonVisible={false}
      showButtonIcon={false}
      Component={() => (
        <TouchableWithoutFeedback>
          <View
            style={{
              backgroundColor: "lightgray",
              width: "60%",
              height: "90%",
            }}
          ></View>
        </TouchableWithoutFeedback>
      )}
    />
  );
}

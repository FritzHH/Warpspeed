import { on } from "events";
import { Items_WorkorderItemsTab } from "../screen_components/Items_WorkorderItems";
import { Tab } from "react-tabs";
import { View, Text, Modal, TouchableWithoutFeedback } from "react-native-web";
import React from "react";
import { QuickItemsTab } from "../screen_components/Options_QuickItemsTab";
import { TAB_NAMES } from "../../data";
import { TabMenuButton, TabMenuDivider as Divider } from "../../components";
import { log } from "../../utils";

export function Options_Section({
  ssOptionsTabName,
  __setOptionsTabName,
  __setWorkorderObj,
  ssWorkorderObj,
}) {
  const [sWorkorderBtnLongPressed, _setWorkorderBtnLongPressed] =
    React.useState(false);

  function selectComponent() {
    if (ssOptionsTabName == TAB_NAMES.optionsTab.quickItems)
      return Quick_Items_Tab;
    if (ssOptionsTabName == TAB_NAMES.optionsTab.workorders)
      return WorkordersTab;
  }

  function workorderBtnClicked() {}

  const Quick_Items_Tab = (
    <QuickItemsTab
      ssWorkorderObj={ssOptionsTabName}
      __setWorkorderObj={__setOptionsTabName}
    />
  );

  const WorkordersTab = (
    <View>
      <Text>Workorders go here</Text>
    </View>
  );

  return (
    <View>
      <TabBar
        __setOptionsTabName={__setOptionsTabName}
        ssOptionsTabName={ssOptionsTabName}
        _setWorkorderBtnLongPressed={_setWorkorderBtnLongPressed}
        workorderBtnClicked={workorderBtnClicked}
        ssWorkorderObj={ssWorkorderObj}
      />
      <Modal visible={sWorkorderBtnLongPressed} transparent>
        <TouchableWithoutFeedback
          onPress={() => _setWorkorderBtnLongPressed(false)}
        >
          <View
            style={{
              height: "100%",
              // ...modalProps,
              // ...modalStyle,
            }}
          >
            <View
              style={{
                flex: 1,
                height: "100%",
                backgroundColor: "rgba(0, 0, 0, 0.5)",
                // backgroundColor: "lightgray",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  width: "50%",
                  height: "80%",
                  backgroundColor: "green",
                }}
              >
                MODAl!!
              </Text>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
      {selectComponent()}
    </View>
  );
}

const TabBar = ({
  __setOptionsTabName,
  ssOptionsTabName,
  _setWorkorderBtnLongPressed,
  workorderBtnClicked,
  ssWorkorderObj,
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
      {ssWorkorderObj && (
        <TabMenuButton
          onPress={() => __setOptionsTabName(TAB_NAMES.optionsTab.quickItems)}
          text={TAB_NAMES.optionsTab.quickItems}
          isSelected={
            ssOptionsTabName === TAB_NAMES.optionsTab.quickItems ? true : false
          }
        />
      )}
      <Divider />
      <TabMenuButton
        onPress={workorderBtnClicked}
        text={TAB_NAMES.optionsTab.workorders}
        isSelected={
          ssOptionsTabName == TAB_NAMES.optionsTab.workorders ? true : false
        }
        onLongPress={() => _setWorkorderBtnLongPressed(true)}
      />
    </View>
  </View>
);

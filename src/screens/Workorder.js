import React from "react";
import {
  View,
  Text,
  FlatList,
  TouchableWithoutFeedback,
} from "react-native-web";
import {
  CUSTOMER,
  INFO_COMPONENT_NAMES,
  TAB_NAMES,
  WORKORDER,
  WORKORDER_ITEM,
} from "../data";
import { Button } from "react-native-web";
import { Colors, ViewStyles } from "../styles";

import { dim, log } from "../utils";
import { shadow_radius } from "../components";
import { cloneDeep } from "lodash";
import { Items_WorkorderItemsTab } from "./screen_components/Items_WorkorderItems";
import { Notes_MainComponent } from "./screen_components/Notes_MainComponent";
import { Info_Section } from "./screen_collections/Info_Section";
import { Items_Section } from "./screen_collections/Items_Section";
import { Options_Section } from "./screen_collections/Options_Section";
import { Notes_Section } from "./screen_collections/Notes_Section";
// import { Tab, Tabs, TabList, TabPanel } from "react-tabs";
// import { TabView, SceneMap } from "react-native-tab-view";

let height = dim.windowHeight * 1;

const test_workorder_arr = () => {
  for (let i = 0; i == 2; i++) {}
};

let testWorkorder = { ...WORKORDER };
testWorkorder.color = {
  label: "buddy",
  backgroundColor: "",
  textColor: "",
};
log(testWorkorder);

export function WorkorderScreen() {
  const [sCustomerObj, _setCustomerObj] = React.useState({ ...CUSTOMER });
  const [sWorkorderObj, _setWorkorderObj] = React.useState(testWorkorder);
  const [sWorkordersArr, _setWorkordersArr] = React.useState([]);
  const [ssItemsTabName, __setItemsTabName] = React.useState(
    TAB_NAMES.itemsTab.creatingNewWorkorder
  );
  const [ssOptionsTabName, __setOptionsTabName] = React.useState(
    TAB_NAMES.optionsTab.workorders
  );
  const [ssInfoComponentName, __setInfoComponentName] = React.useState(
    INFO_COMPONENT_NAMES.phoneNumberEntry
  );

  // state setting functions
  function setCustomerObj(customerObj) {
    log("setting customer object to this", customerObj);
  }
  function setWorkorderObj(workorderObj) {
    log("setting workorder object to this", workorderObj);
    _setWorkorderObj(workorderObj);
  }

  function setWorkorderArr(workorderArr) {
    log("setting workorder arr to this ", workorderArr);
    _setWorkordersArr(workorderArr);
  }

  function setInfoComponentName(name) {
    log("setting info component name to ", name);
    __setInfoComponentName(name);
  }

  // internal functions
  function createNewWorkorder() {
    log("creating new workorder screen");
    __setItemsTabName(TAB_NAMES.itemsTab.creatingNewWorkorder);
  }

  return (
    // <TouchableWithoutFeedback onPress={() => log("pressed")}>
    <View
      style={{
        ...ViewStyles.fullScreen,
        flexDirection: "row",
        justifyContent: "space-around",
      }}
    >
      <View style={{ height: height, width: "64%" }}>
        <View
          style={{
            width: "100%",
            height: height * 0.65,
            flexDirection: "row",
            justifyContent: "flex-start",
          }}
        >
          <View
            style={{
              width: "33%",
            }}
          >
            <Info_Section
              ssCustomerObj={cloneDeep(sCustomerObj)}
              ssWorkorderJob={cloneDeep(sWorkorderObj)}
              ssInfoComponentName={ssInfoComponentName}
              __setCustomerObj={(obj) => setCustomerObj(cloneDeep(obj))}
              __setWorkorderObj={(obj) => setWorkorderObj(cloneDeep(obj))}
              __setInfoComponentName={(name) => setInfoComponentName(name)}
            />
          </View>
          <View
            style={{
              width: "68%",
              height: "100%",
              backgroundColor: Colors.opacityBackgroundLight,
              ...shadow_radius,
            }}
          >
            <Items_Section
              ssItemsTabName={ssItemsTabName}
              __setItemsTabName={__setItemsTabName}
              ssWorkorderObj={cloneDeep(sWorkorderObj)}
              __setWorkorderObj={_setWorkorderObj}
              fun_create_new_workorder={createNewWorkorder}
            />
          </View>
        </View>
        <View
          style={{
            width: "100%",
            height: height * 0.35,
          }}
        >
          <Notes_Section
            ssWorderObj={sWorkorderObj}
            __setWorkorderObj={_setWorkorderObj}
          />
        </View>
      </View>
      <View
        style={{
          width: "34%",
          height: height,
          backgroundColor: Colors.opacityBackgroundLight,
        }}
      >
        <Options_Section
          ssWorderObj={sWorkorderObj}
          ssOptionsTabName={ssOptionsTabName}
          __setWorkorderObj={_setWorkorderObj}
          __setOptionsTabName={__setOptionsTabName}
        />
      </View>
    </View>
    // </TouchableWithoutFeedback>
  );
}

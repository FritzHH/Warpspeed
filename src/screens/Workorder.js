import React from "react";
import {
  View,
  Text,
  FlatList,
  TouchableWithoutFeedback,
} from "react-native-web";
import {
  BIKE_COLORS_ARR,
  COLLECTION_NAMES,
  CUSTOMER,
  INFO_COMPONENT_NAMES,
  TAB_NAMES,
  WORKORDER,
  WORKORDER_ITEM,
} from "../data";
import { Button } from "react-native-web";
import { Colors, ViewStyles } from "../styles";

import { dim, log } from "../utils";
import { AlertBox, shadow_radius } from "../components";
import { cloneDeep } from "lodash";
import { Items_WorkorderItemsTab } from "./screen_components/Items_WorkorderItems";
import { Notes_MainComponent } from "./screen_components/Notes_MainComponent";
import { Info_Section } from "./screen_collections/Info_Section";
import { Items_Section } from "./screen_collections/Items_Section";
import { Options_Section } from "./screen_collections/Options_Section";
import { Notes_Section } from "./screen_collections/Notes_Section";
import { getNewCollectionRef, setCollectionItem } from "../dbCalls";
// import { Tab, Tabs, TabList, TabPanel } from "react-tabs";
// import { TabView, SceneMap } from "react-native-tab-view";

let height = dim.windowHeight * 1;

let testWorkorder = cloneDeep(WORKORDER);
testWorkorder.color = BIKE_COLORS_ARR[4];
testWorkorder.brand = "brand goes here";

let test_cust = cloneDeep(CUSTOMER);
test_cust.first = "big fat";
test_cust.last = "jones";
test_cust.phone.cell = "123-434-5456";

export function WorkorderScreen() {
  const [sCustomerObj, _setCustomerObj] = React.useState(test_cust);
  const [sWorkorderObj, _setWorkorderObj] = React.useState(testWorkorder);
  const [sWorkordersArr, _setWorkordersArr] = React.useState([]);
  const [sItemsTabName, _setItemsTabName] = React.useState(
    TAB_NAMES.itemsTab.workorderItems
  );
  const [sOptionsTabName, _setOptionsTabName] = React.useState(
    TAB_NAMES.optionsTab.workorders
  );
  const [sCurrentUser, _setCurrentUser] = React.useState(null);
  const [sShowAlertBox, _setShowAlertBox] = React.useState(false);

  function setCustomerObj(customerObj) {
    log("Workorder: setting customer object to this", customerObj);
    _setCustomerObj(customerObj);
  }
  function setWorkorderObj(workorderObj) {
    log("Workorder: setting workorder object to this", workorderObj);

    // this is a new workorder obj
    if (!workorderObj.id) {
      let ref = getNewCollectionRef(COLLECTION_NAMES.workorders);
      workorderObj.id = ref.id;
      _setOptionsTabName(TAB_NAMES.optionsTab.quickItems);
    }
    _setWorkorderObj(workorderObj);
    // setCollectionItem(COLLECTION_NAMES.workorders, workorderObj);
  }

  function setWorkorderArr(workorderArr) {
    log("Workorder: setting workorder arr to this ", workorderArr);
    _setWorkordersArr(workorderArr);
  }

  function createNewCustomer(customerObj) {
    log("Workorder: CREATING NEW customer object to this", customerObj);
    let ref = getNewCollectionRef(COLLECTION_NAMES.customers);
    customerObj.id = ref.id;
    _setCustomerObj(customerObj);
    // setCollectionItem(COLLECTION_NAMES.customers, customerObj);
    _setOptionsTabName(TAB_NAMES.optionsTab.quickItems);
  }

  return (
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
              ssWorkorderObj={cloneDeep(sWorkorderObj)}
              __createNewCustomer={createNewCustomer}
              __setCustomerObj={setCustomerObj}
              __setWorkorderObj={setWorkorderObj}
              __setShowAlertBox={_setShowAlertBox}
              __setOptionsTabName={() =>
                _setOptionsTabName(TAB_NAMES.optionsTab.quickItems)
              }
              ssShowAlertBox={sShowAlertBox}
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
              ssItemsTabName={sItemsTabName}
              __setItemsTabName={_setItemsTabName}
              ssWorkorderObj={cloneDeep(sWorkorderObj)}
              __setWorkorderObj={_setWorkorderObj}
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
          ssOptionsTabName={sOptionsTabName}
          __setWorkorderObj={_setWorkorderObj}
          __setOptionsTabName={_setOptionsTabName}
        />
      </View>
    </View>
    // </TouchableWithoutFeedback>
  );
}

import React, { useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableWithoutFeedback,
} from "react-native-web";
import {
  bike_colors_arr_db,
  COLLECTION_NAMES,
  system_users_db,
  CUSTOMER_PROTO,
  INFO_COMPONENT_NAMES,
  TAB_NAMES,
  WORKORDER_PROTO,
  WORKORDER_ITEM_PROTO,
  test_inventory,
  ADJUSTABLE_BUTTON_SIZE_OPTIONS_ARR,
  DEFAULT_USER_PREFERENCES,
  WORKORDER_STATUS_NAMES,
} from "../data";
import { Button } from "react-native-web";
import { Colors, ViewStyles } from "../styles";

import { dim, generateRandomID, log } from "../utils";
import { AlertBox, SHADOW_RADIUS_PROTO } from "../components";
import { cloneDeep } from "lodash";
import { Items_WorkorderItemsTab } from "./screen_components/Items_WorkorderItems";
import { Notes_MainComponent } from "./screen_components/Notes_MainComponent";
import { Info_Section } from "./screen_collections/Info_Section";
import { Items_Section } from "./screen_collections/Items_Section";
import { Options_Section } from "./screen_collections/Options_Section";
import { Notes_Section } from "./screen_collections/Notes_Section";
import {
  getCollection,
  getCollectionItem,
  getNewCollectionRef,
  setCollectionItem,
  subscribeToCollectionNode,
} from "../dbCalls";
// import { Tab, Tabs, TabList, TabPanel } from "react-tabs";
// import { TabView, SceneMap } from "react-native-tab-view";

let height = dim.windowHeight * 1;

let testWorkorder = cloneDeep(WORKORDER_PROTO);
testWorkorder.color = bike_colors_arr_db[4];
testWorkorder.brand = "brand goes here";

let test_cust = cloneDeep(CUSTOMER_PROTO);
test_cust.first = "big fat";
test_cust.last = "jones";
test_cust.phone.cell = "123-434-5456";

export function WorkorderScreen() {
  const [sInitFlag, _setInitFlag] = React.useState(false);
  const [sCustomerObj, _setCustomerObj] = React.useState(CUSTOMER_PROTO);
  const [sWorkorderObj, _setWorkorderObj] = React.useState(WORKORDER_PROTO);
  const [sWorkordersArr, _setWorkordersArr] = React.useState([]);
  const [sCustomersArr, _setCustomersArr] = React.useState([]);
  const [sShowUserPinInputBox, _setShowUserPinInputBox] = React.useState(false);
  const [sCustomerSearchArr, _setCustomerSearchArr] = React.useState([]);
  const [sSelectedCustomerSearchItem, _setSelectedCustomerSearchItem] =
    React.useState(null);
  const [sCurrentUser, _setCurrentUser] = React.useState(
    system_users_db[1389343]
  );
  const [sAdjustableUserPreferences, _setAdjustableUserPreferences] =
    React.useState(DEFAULT_USER_PREFERENCES);
  const [sInventoryArr, _setInventoryArr] = React.useState(test_inventory);
  const [sWorkorderPreviewObj, _setWorkorderPreviewObj] = useState(null);
  ////////////////// tab selections ///////////////////////////
  const [sItemsTabName, _setItemsTabName] = React.useState(
    TAB_NAMES.itemsTab.dashboard
  );
  const [sOptionsTabName, _setOptionsTabName] = React.useState(
    TAB_NAMES.optionsTab.workorders
  );
  const [sInfoComponentName, _setInfoComponentName] = React.useState(
    INFO_COMPONENT_NAMES.phoneNumberEntry
  );

  /////////
  //setter functions for db and state
  /////////
  function setCustomerObj(customerObj, setToDB = true) {
    log("WORKORDER: setting customer object to this", customerObj);
    _setCustomerObj(customerObj);
    // log("obj", customerObj);
    if (setToDB && customerObj.id)
      setCollectionItem(COLLECTION_NAMES.customers, customerObj);
  }

  function setWorkorderObj(workorderObj) {
    log("WORKORDER: setting workorder object to this", workorderObj);

    // new workorder obj
    if (!workorderObj.id) {
      log("WORKORDER:new workorder object");
      let ref = getNewCollectionRef(COLLECTION_NAMES.openWorkorders);
      workorderObj.id = ref.id;
      workorderObj.customerID = sCustomerObj.id;
      workorderObj.changes.startedBy = sCurrentUser.first;
      workorderObj.status = WORKORDER_STATUS_NAMES.open;
    }
    getCollectionItem(COLLECTION_NAMES.customers, workorderObj.customerID).then(
      (res) => {
        // log("res", res);
        if (res) {
          log("WORKORDER: setting customer obj", res);
          setCustomerObj(res, false);
        }
      }
    );
    _setWorkorderObj(workorderObj);
    _setInfoComponentName(INFO_COMPONENT_NAMES.workorder);
    setCollectionItem(COLLECTION_NAMES.openWorkorders, workorderObj);
  }

  function createNewCustomer(customerObj) {
    log("WORKORDER: CREATING NEW customer object to this", customerObj);
    let ref = getNewCollectionRef(COLLECTION_NAMES.customers);
    customerObj.id = ref.id;
    _setCustomerObj(customerObj);
    setCollectionItem(COLLECTION_NAMES.customers, customerObj);
    _setOptionsTabName(TAB_NAMES.optionsTab.quickItems);
    _setItemsTabName(TAB_NAMES.itemsTab.workorderItems);
  }

  /////////////////
  // side effects (db calls)
  /////////////////
  async function getAllCustomersArrFromDB() {
    let customersArr = await getCollection(COLLECTION_NAMES.customers);
    log("customers from db", customersArr);
    _setCustomersArr(customersArr);
  }

  async function getWorkordersFromDB(type = "open") {
    let collectionName;
    if (type == "open") {
      collectionName = COLLECTION_NAMES.openWorkorders;
    } else {
      collectionName = COLLECTION_NAMES.closedWorkorders;
    }
    let workordersArr = await getCollection(collectionName);
    // log("workorders from db", workordersArr);
    _setWorkordersArr(workordersArr);
  }

  async function setDBListeners() {
    let workordersCallback = (workordersArr) => {
      _setWorkordersArr(workordersArr);
      log("WORKORDER: incoming snapshot db workorders arr", workordersArr);
    };
    // let customersCallback = () => getAllCustomersArrFromDB();
    subscribeToCollectionNode(
      COLLECTION_NAMES.openWorkorders,
      workordersCallback
    );
    // subscribeToCollectionNode(COLLECTION_NAMES.customers, customersCallback);
  }

  /////////////////
  // init function runs once until refresh
  ////////////////
  function initialize() {
    if (!sInitFlag) {
      _setInitFlag(true);
      getAllCustomersArrFromDB();
      // getWorkordersFromDB();
      setDBListeners();
    }
  }
  initialize();

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
              ssCustomerObj={sCustomerObj}
              ssWorkorderObj={sWorkorderObj}
              ssSelectedCustomerSearchItem={sSelectedCustomerSearchItem}
              ssCustomersArr={sCustomersArr}
              ssInfoComponentName={sInfoComponentName}
              __setInfoComponentName={(data) =>
                _setInfoComponentName(cloneDeep(data))
              }
              __createNewCustomer={(data) => createNewCustomer(cloneDeep(data))}
              __setCustomerObj={(data) => setCustomerObj(cloneDeep(data))}
              __setWorkorderObj={(data) => setWorkorderObj(cloneDeep(data))}
              __setOptionsTabName={(data) =>
                _setOptionsTabName(cloneDeep(data))
              }
              __setItemsTabName={(data) => _setItemsTabName(cloneDeep(data))}
              __setCustomerSearchArr={(data) =>
                _setCustomerSearchArr(cloneDeep(data))
              }
            />
          </View>
          <View
            style={{
              width: "68%",
              height: "100%",
              backgroundColor: Colors.opacityBackgroundLight,
              ...SHADOW_RADIUS_PROTO,
            }}
          >
            <Items_Section
              ssItemsTabName={sItemsTabName}
              ssCustomerObj={sCustomerObj}
              ssWorkorderObj={sWorkorderObj}
              ssCustomerSearchArr={sCustomerSearchArr}
              ssWorkorderPreviewObj={sWorkorderPreviewObj}
              __setItemsTabName={(data) => _setItemsTabName(cloneDeep(data))}
              __setWorkorderObj={(data) => _setWorkorderObj(cloneDeep(data))}
              __setCustomerObj={(data) => _setCustomerObj(cloneDeep(data))}
              __setOptionsTabName={(data) =>
                _setOptionsTabName(cloneDeep(data))
              }
              __setInfoComponentName={(data) =>
                _setInfoComponentName(cloneDeep(data))
              }
              __setCustomerSearchArr={(data) =>
                _setCustomerSearchArr(cloneDeep(data))
              }
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
            __setWorkorderObj={(obj) => setWorkorderObj(obj)}
            ssCurrentUser={sCurrentUser}
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
          ssWorkordersArr={sWorkordersArr}
          ssInventoryArr={sInventoryArr}
          ssAdjustableUserPreferences={sAdjustableUserPreferences}
          __setWorkorderObj={(obj) => setWorkorderObj(cloneDeep(obj))}
          __setOptionsTabName={(data) => _setOptionsTabName(cloneDeep(data))}
          __setInventoryArr={(data) => _setInventoryArr(cloneDeep(data))}
          __setWorkorderPreviewObj={(obj) => {
            _setWorkorderPreviewObj(obj);
            if (obj) {
              _setItemsTabName(TAB_NAMES.itemsTab.preview);
            } else {
              _setItemsTabName(TAB_NAMES.itemsTab.workorderItems);
            }
          }}
        />
      </View>
    </View>
    // </TouchableWithoutFeedback>
  );
}

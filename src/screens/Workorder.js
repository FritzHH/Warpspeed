/* eslint-disable */

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
  RECEIPT_WORKORDER_PROTO,
  printer_names,
  RECEIPT_TYPES,
  SMS_PROTO,
} from "../data";
import { Button } from "react-native-web";
import { Colors, ViewStyles } from "../styles";

import {
  dim,
  formatDateTime,
  generateBarcode,
  generateRandomID,
  log,
} from "../utils";
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
  sendSMS,
  setCollectionItem,
  setCustomer,
  subscribeToCollectionNode,
} from "../dbCalls";
import { sendTestMessage, testNode, testPayment } from "../testing";
import { PaymentElement, PaymentElementComponent } from "../PaymentElement";
import {
  customerSubscribe,
  inventoryPull,
  inventorySubscribe,
} from "../data_transfer";
// import { Tab, Tabs, TabList, TabPanel } from "react-tabs";
// import { TabView, SceneMap } from "react-native-tab-view";

let height = dim.windowHeight * 1;

let testWorkorder = cloneDeep(WORKORDER_PROTO);
testWorkorder.color = bike_colors_arr_db[4];
testWorkorder.brand = "brand goes here";

// sendTestMessage();
// testPayment();
// testNode();

export function WorkorderScreen() {
  const [sInitFlag, _setInitFlag] = React.useState(false);
  const [sCustomerObj, _setCustomerObj] = React.useState(CUSTOMER_PROTO);
  const [sWorkorderObj, _setWorkorderObj] = React.useState(WORKORDER_PROTO);
  const [sWorkordersArr, _setWorkordersArr] = React.useState([]);
  const [sCustomersPreviewArr, _setCustomersPreviewArr] = React.useState([]);
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
  const [sMessagesArr, _setMessagesArr] = useState([]);
  ////////////////// tab selections ///////////////////////////
  const [sItemsTabName, _setItemsTabName] = React.useState(
    TAB_NAMES.itemsTab.dashboard
  );
  const [sOptionsTabName, _setOptionsTabName] = React.useState(
    TAB_NAMES.optionsTab.messages
  );
  const [sInfoComponentName, _setInfoComponentName] = React.useState(
    INFO_COMPONENT_NAMES.phoneNumberEntry
  );

  //setter functions for db and state  ///////////////////////

  function setCustomerObj(customerObj, setToDB = true) {
    // log("WORKORDER: setting customer object to this", customerObj);
    _setCustomerObj(customerObj);
    if (setToDB && customerObj.id) setCustomer(customerObj);
  }

  function setInventoryItem(item) {
    // log("WORKORDER: setting inventory item", item);
    let newInvArr;
    if (!item.id) {
      item.id = generateRandomID(COLLECTION_NAMES.inventory);
      item.upc = generateBarcode();
      newInvArr = cloneDeep(sInventoryArr);
      newInvArr.push(item);
    } else {
      newInvArr = sInventoryArr.map((invItem) =>
        invItem.id === item.id ? item : invItem
      );
    }
    setCollectionItem(COLLECTION_NAMES.inventory, item);
    _setInventoryArr(newInvArr);
  }

  function setMessagesArr(newArr) {}

  function setWorkorderObj(workorderObj = WORKORDER_PROTO) {
    if (!workorderObj) {
      // log("WORKORDER: no incoming workorder");
      return;
    }
    log("WORKORDER: setting workorder object to this", workorderObj);

    // check for new additions to workorder lines, we set an id in the "items"
    // array. need to go grab a fresh copy of the item from the inventory

    let idListLength = workorderObj.itemIdArr.length;
    let workorderLinesLength = workorderObj.workorderLines.length;
    // log("orig", sWorkorderObj);
    // log("new", workorderObj);

    // if (idListLength != workorderLinesLength) {
    //   if (idListLength > workorderLinesLength) {
    //     let lastIdAdded =
    //       workorderObj.itemIdArr[workorderObj.itemIdArr.length - 1];
    //     let workorderLine = { ...WORKORDER_ITEM_PROTO };
    //     workorderLine.itemID = lastIdAdded;

    //     workorderLine.id = generateRandomID();
    //     workorderObj.workorderLines.push(workorderLine);
    //   } else {
    //     let newArr = [];
    //     workorderObj.itemIdArr.forEach((itemId) => {
    //       // log("id", itemId);
    //       let workorderLine = workorderObj.workorderLines.find(
    //         (obj) => obj.itemID === itemId
    //       );
    //       // log("line", workorderLine);
    //       if (workorderLine) newArr.push(workorderLine);
    //     });
    //     workorderObj.workorderLines = newArr;
    //   }
    // }
    // log("obj", workorderObj);
    _setWorkorderObj(workorderObj);
    _setCustomerObj(
      sCustomersPreviewArr.find((obj) => obj.id === workorderObj.customerID)
    );
    setCollectionItem(COLLECTION_NAMES.openWorkorders, workorderObj);
  }

  function createNewCustomer(customerObj) {
    // log("WORKORDER: CREATING NEW customer object to this", customerObj);
    let ref = getNewCollectionRef(COLLECTION_NAMES.customers);
    customerObj.id = ref.id;
    _setCustomerObj(customerObj);
    setCollectionItem(COLLECTION_NAMES.customers, customerObj);
    _setOptionsTabName(TAB_NAMES.optionsTab.quickItems);
    _setItemsTabName(TAB_NAMES.itemsTab.workorderItems);
  }

  function createNewWorkorder(customerObj) {
    // log("WORKORDER: setting customer for new workorder", customerObj);
    let newWorkorder = structuredClone(WORKORDER_PROTO);
    newWorkorder.customerID = customerObj.id;
    let ref = getNewCollectionRef(COLLECTION_NAMES.openWorkorders);
    newWorkorder.id = ref.id;
    newWorkorder.changes.startedBy =
      sCurrentUser.first + " " + sCurrentUser.last;
    newWorkorder.status = WORKORDER_STATUS_NAMES.open;
    _setWorkorderObj(newWorkorder);
  }

  // side effects (db calls) ///////////////////////////////////
  async function getAllCustomersArrFromDB() {}

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

  async function setDBListeners() {}

  // init function runs once until refresh //////////////////////
  // need to change to useEffect ///////////////////////////////

  function initialize() {
    if (!sInitFlag) {
      // inventorySubscribe(sInventoryArr, _setInventoryArr);
      customerSubscribe(
        { ...CUSTOMER_PROTO, id: "13343" },
        sCustomersPreviewArr,
        setCustomerObj,
        _setCustomersPreviewArr
      );
      _setInitFlag(true);
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
      {/* <PaymentElementComponent amount={200} />F */}
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
              ssCustomersArr={sCustomersPreviewArr}
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
              ssInventoryArr={sInventoryArr}
              __setItemsTabName={(data) => _setItemsTabName(cloneDeep(data))}
              __setWorkorderObj={setWorkorderObj}
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
              __createNewWorkorder={createNewWorkorder}
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
          ssWorkorderObj={sWorkorderObj}
          ssOptionsTabName={sOptionsTabName}
          ssWorkordersArr={sWorkordersArr}
          ssInventoryArr={sInventoryArr}
          ssMessagesArr={sMessagesArr}
          ssAdjustableUserPreferences={sAdjustableUserPreferences}
          __setMessagesArr={setMessagesArr}
          __setWorkorderObj={_setWorkorderObj}
          __setOptionsTabName={_setOptionsTabName}
          __setInventoryArr={_setInventoryArr}
          __setInventoryItem={setInventoryItem}
          __setInfoComponentName={_setInfoComponentName}
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

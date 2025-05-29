/* eslint-disable */

import React, { useEffect, useState } from "react";
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
  setFirestoreCollectionItem,
  setCustomer,
  subscribeToCollectionNode,
  subscribeToNodeAddition,
  subscribeToNodeChange,
  subscribeToNodeRemoval,
} from "../db";
import {
  fillCustomers,
  fillInventory,
  fillOpenWorkorders,
  sendTestMessage,
  testNode,
  testPayment,
} from "../testing";
import { PaymentElement, PaymentElementComponent } from "../PaymentElement";
import {
  customerPreviewListSubscribe,
  customerSubscribe,
  inventoryPull,
  inventorySubscribe,
  openWorkordersSubscribe,
  removeCustomerSub,
  removeInventorySub,
} from "../db_subscriptions";
import {
  useCustomerPreviewStore,
  useCurrentCustomerStore,
  useInventoryStore,
  useOpenWorkordersStore,
  useCurrentWorkorderStore,
} from "../stores";
import {
  get,
  getDatabase,
  onChildAdded,
  onChildChanged,
  ref,
} from "firebase/database";
import { dbGetCustomerObj, dbGetOpenWorkorderItem } from "../db_calls";
// import { Tab, Tabs, TabList, TabPanel } from "react-tabs";
// import { TabView, SceneMap } from "react-native-tab-view";

let height = dim.windowHeight * 1;

// sendTestMessage();
// testPayment();
// testNode();

let customerSub;

export function WorkorderScreen() {
  const _zModCustPreviewItem = useCustomerPreviewStore(
    (state) => state.modItem
  );
  const _zModWorkorderItem = useOpenWorkordersStore((state) => state.modItem);
  const _zSetCustomerObj = useCurrentCustomerStore(
    (state) => state.setCustomerObj
  );
  const _zSetCurrentWorkorderObj = useCurrentWorkorderStore(
    (state) => state.setWorkorderObj
  );
  /////
  const zWorkorderArr = useOpenWorkordersStore((state) =>
    state.getWorkorderArr()
  );
  const zInventoryArr = useInventoryStore((state) => state.getInventoryArr());
  // const zCustPreviewArr = useCustomerPreviewStore((state) =>
  //   state.getPreviewArr()
  // );
  const zCustomerObj = useCurrentCustomerStore((state) =>
    state.getCustomerObj()
  );
  //////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////

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
  const [sInventoryArr, _setInventoryArr] = React.useState([]);
  const [sWorkorderPreviewObj, _setWorkorderPreviewObj] = useState(null);
  const [sMessagesArr, _setMessagesArr] = useState([]);
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

  //setter functions for db and state  ///////////////////////

  function setCustomerObj(customerObj, setToDB = true) {}

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
    setFirestoreCollectionItem(COLLECTION_NAMES.inventory, item);
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
    setFirestoreCollectionItem(COLLECTION_NAMES.openWorkorders, workorderObj);
  }

  function createNewCustomer(customerObj) {
    // log("WORKORDER: CREATING NEW customer object to this", customerObj);
    let ref = getNewCollectionRef(COLLECTION_NAMES.customers);
    customerObj.id = ref.id;
    _setCustomerObj(customerObj);
    setFirestoreCollectionItem(COLLECTION_NAMES.customers, customerObj);
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

  useEffect(() => {
    openWorkordersSubscribe(_zModWorkorderItem);
    inventorySubscribe(_zModCustPreviewItem);
    customerPreviewListSubscribe(_zModCustPreviewItem);
  }, []);

  async function initialize() {
    if (!sInitFlag) {
      // fillOpenWorkorders();
      setTimeout(async () => {
        // let wo = await dbGetOpenWorkorderItem("3zPg0cOKDV3eVlLtD4zB");
        // let cust = await dbGetCustomerObj('3zPg0cOKDV3eVlLtD4zB')
        // _zSetCurrentWorkorderObj(wo);
      }, 1000);
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
        <Button
          title="test"
          onPress={() => {
            removeCustomerSub();
            // customerSub();
            // fillOpenWorkorders();
            // removeCustomerSub();
            // removeInventorySub();
          }}
        />
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
              // zCustPreviewArr={zCustPreviewArr}
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
              // zCustPreviewArr={zCustPreviewArr}
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
          // ssWorkordersArr={sWorkordersArr}
          ssWorkordersArr={zWorkorderArr}
          // ssInventoryArr={sInventoryArr}
          ssInventoryArr={zInventoryArr}
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

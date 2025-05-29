/* eslint-disable */

//
//

import { cloneDeep } from "lodash";
import {
  getNodeObject,
  subscribeToCollectionNode,
  subscribeToDocument,
  subscribeToInventory,
  subscribeToNode,
  subscribeToNodeAddition,
  subscribeToNodeChange,
  subscribeToNodeRemoval,
} from "./db";
import { arrayAddObjCheckForDupes, log } from "./utils";
import { LocalPage } from "twilio/lib/rest/api/v2010/account/availablePhoneNumberCountry/local";

let inventoryChangeSub, inventoryAddSub, inventoryRemoveSub;
let workorderChangeSub, workorderAddSub, workorderRemoveSub;
let custPreviewChangeSub, custPreviewAddSub, custPreviewRemoveSub;
let customerObjSub;
let settingsSub;

// realtime database
function arrayChangeCallback(type, key, obj, targetArr, dataTargetSetterFun) {
  let arr = [];
  //   log(type, obj);
  switch (type) {
    case "removed":
      arr = targetArr.filter((o) => o.id != obj.id);
      //   log(targetArr);
      //   log("count", arr.length);
      break;
    case "added":
      arr = arrayAddObjCheckForDupes(targetArr, "id", obj, "id");
      //   log("count", targetArr.length);
      break;
    case "changed":
      arr = targetArr.map((o) => {
        if (o.id === obj.id) {
          return obj;
        }
        return o;
      });
      break;
  }
  dataTargetSetterFun([...arr]);
}

// firestore
function documentChangeCallback(dataObj, dataTargetSetterFun) {
  log("document changed", dataObj);
  dataTargetSetterFun(dataObj);
}

// subscriptions /////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////

// realtime database
export async function openWorkordersSubscribe(_zModWorkorderItem) {
  workorderAddSub = await subscribeToNodeAddition(
    "OPEN-WORKORDERS",
    (type, key, val) => _zModWorkorderItem(val, "add")
  );
  workorderRemoveSub = await subscribeToNodeRemoval(
    "OPEN-WORKORDERS",
    (type, key, val) => _zModWorkorderItem(val, "change")
  );
  workorderChangeSub = await subscribeToNodeChange(
    "OPEN-WORKORDERS",
    (type, key, val) => _zModWorkorderItem(val, "remove")
  );
}

// realtime database
export async function inventorySubscribe(zModInventoryItem) {
  inventoryChangeSub = await subscribeToNodeChange(
    "INVENTORY",
    (type, key, val) => zModInventoryItem(val, "change")
  );
  inventoryAddSub = await subscribeToNodeAddition(
    "INVENTORY",
    (type, key, val) => zModInventoryItem(val, "add")
  );
  inventoryRemoveSub = await subscribeToNodeRemoval(
    "INVENTORY",
    (type, key, val) => zModInventoryItem(val, "remove")
  );
}

// realtime database
export async function customerPreviewListSubscribe(_zModItemCustPreviewItem) {
  custPreviewChangeSub = await subscribeToNodeChange(
    "CUSTOMER-PREVIEWS",
    (type, key, val) => _zModItemCustPreviewItem(val, "change")
  );
  custPreviewAddSub = await subscribeToNodeAddition(
    "CUSTOMER-PREVIEWS",
    (type, key, val) => _zModItemCustPreviewItem(val, "add")
  );
  custPreviewRemoveSub = await subscribeToNodeRemoval(
    "CUSTOMER-PREVIEWS",
    (type, key, val) => _zModItemCustPreviewItem(val, "remove")
  );
}

export async function settingsSubscribe(_zSetSettingsItem) {
  settingsSub = await subscribeToNodeChange("SETTINGS", (type, key, val) => {
    // log("incoming", key);
    _zSetSettingsItem(key, val);
  });
}

// firestore
export async function customerSubscribe(id, _zCustomerObj) {
  customerObjSub = subscribeToDocument("CUSTOMERS", id, (obj) =>
    _zCustomerObj(obj)
  );
}

// remove subscriptions ///////////////////////////////////////////////////
export function removeCustomerSub() {
  try {
    customerObjSub();
  } catch (e) {}
}

export function removeCustomerPreviewSub() {
  try {
    custPreviewAddSub();
    custPreviewChangeSub();
    custPreviewRemoveSub();
  } catch (e) {}
}

export function removeInventorySub() {
  try {
    inventoryAddSub();
    inventoryRemoveSub();
    inventoryChangeSub();
  } catch (e) {}
}

export function removeOpenWorkordersSub() {
  try {
    workorderAddSub();
    workorderChangeSub();
    workorderRemoveSub();
  } catch (e) {}
}

// remove them all at once
export function removeAllDatabaseSubs() {
  removeCustomerSub();
  removeInventorySub();
  removeCustomerPreviewSub();
  removeOpenWorkordersSub();
}

// retrievals ///////////////////////////////////////////////////////////
export async function inventoryPull(__setInventoryArr) {
  //   let arr = await getNodeObject("INVENTORY");
  //   log("inventory obj", arr);
}

/* eslint-disable */

//
//

import { cloneDeep } from "lodash";
import {
  getNodeObject,
  subscribeToCollectionNode,
  subscribeToDocument,
  subscribeToFirestorePath,
  subscribeToInventory,
  subscribeToNode,
  subscribeToNodeAddition,
  subscribeToNodeChange,
  subscribeToNodeRemoval,
} from "./db";
import { arrayAddObjCheckForDupes, clog, log } from "./utils";
import { build_db_path, REALTIME_DATABASE_NODE_NAMES } from "./constants";
import { useOpenWorkordersStore } from "./stores";

let inventoryChangeSub, inventoryAddSub, inventoryRemoveSub;
let workorderChangeSub, workorderAddSub, workorderRemoveSub;
let incomingMessagesSub, outgoingMessagesSub;
let custPreviewChangeSub, custPreviewAddSub, custPreviewRemoveSub;
let customerObjSub;
let settingsSub;
let paymentIntentAddSub;
let paymentIntentChangeSub;
let punchClockChangeSub, punchClockAddSub, punchClockRemoveSub;

let listenerSubscriptions = [];

// new shit////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////
export function removeDatabaseListeners(name) {
  if (!name) {
    listenerSubscriptions.forEach((unsub) => unsub());
  } else {
  }
}

/**
 * stores and returns a subscription cancel function. The callback is the Zustand store setter
 * @param {string} option - option: "punch clock", "open workorders", "inventory", "
 * settings"
 * @param {function zustandCallback(val) {}} - zustandCallback - zustand store setter.
 */
export async function subscribeToDBNodeChanges({
  option,
  changeCallback,
  removeCallback,
  addCallback,
}) {
  let subscribeToChanges = async (path) => {
    let unsub = await subscribeToNodeChange(path, changeCallback);
    listenerSubscriptions.push(unsub);
    return unsub;
  };

  let subscribeToAddition = async (path) => {
    let unsub = await subscribeToNodeAddition(path, addCallback);
    listenerSubscriptions.push(unsub);
    return unsub;
  };

  let subscribeToRemoval = async (path) => {
    let unsub = await subscribeToNodeRemoval(path, removeCallback);
    listenerSubscriptions.push(unsub);
    return unsub;
  };

  let path;
  switch (option) {
    case "punch clock":
      path = build_db_path.punchClock();
      break;
    case "open workorders":
      path = build_db_path.openWorkorders();
      break;
    case "inventory":
      path = build_db_path.inventory();
      break;
    case "settings":
      path = build_db_path.settings();
      break;
  }
  // log(path);
  // return subscribeToChanges(path);
  if (addCallback) subscribeToAddition(path);
  if (removeCallback) subscribeToRemoval(path);
  if (changeCallback) subscribeToChanges(path);
}

// end new shit////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////

// subscriptions /////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////

// realtime database
export async function openWorkordersSubscribe(_zModWorkorderItem) {
  workorderAddSub = await subscribeToNodeAddition(
    "OPEN-WORKORDERS",
    (type, key, val) => _zModWorkorderItem(val, "add")
  );
  workorderChangeSub = await subscribeToNodeChange(
    "OPEN-WORKORDERS",
    (type, key, val) => _zModWorkorderItem(val, "change")
  );
  workorderRemoveSub = await subscribeToNodeRemoval(
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

// realtime database
export async function settingsSubscribe(_zSetSettingsItem) {
  settingsSub = await subscribeToNodeChange("SETTINGS", (type, key, val) => {
    // log("incoming", val);
    _zSetSettingsItem(key, val);
  });
}

// realtime database
export async function punchClockSubscribe(_zSetClockedInUserArr) {
  let path = build_db_path.punchClock();
  punchClockAddSub = await subscribeToFirestorePath(path, (val) => {
    log("incoming from punch clock sub", val);
    if (!val) val = [];
    _zSetClockedInUserArr(val);
  });
}

// realtime database
export async function messagesSubscribe(
  customerID,
  _zSetIncomingMessages,
  _zSetOutgoingMessages
) {
  incomingMessagesSub = await subscribeToNodeAddition(
    "INCOMING_MESSAGES/" + customerID,
    (type, key, val) => {
      _zSetIncomingMessages(val);
    }
  );
  outgoingMessagesSub = await subscribeToNodeAddition(
    "OUTGOING_MESSAGES/" + customerID,
    (type, key, val) => {
      _zSetOutgoingMessages(val);
    }
  );
}

// rdb payment process sub
export async function paymentIntentSubscribe(
  paymentIntentID,
  callback,
  zPaymentIntentID
) {
  paymentIntentAddSub = await subscribeToNodeChange(
    "PAYMENT_PROCESSING/" + paymentIntentID,
    (type, key, val) => callback(type, key, val, zPaymentIntentID)
  );
  paymentIntentChangeSub = await subscribeToNodeAddition(
    "PAYMENT_PROCESSING/" + paymentIntentID,
    (type, key, val) => callback(type, key, val, zPaymentIntentID)
  );

  return [paymentIntentAddSub, paymentIntentChangeSub];
}

// firestore
export async function customerSubscribe(id, _zCustomerObj) {
  customerObjSub = subscribeToDocument("CUSTOMERS", id, (obj) =>
    _zCustomerObj(obj)
  );
}

// remove subscriptions ///////////////////////////////////////////////////
export function removePaymentIntentSub() {
  try {
    // log("sub", paymentIntentAddSub);
    paymentIntentAddSub();
    paymentIntentChangeSub();
  } catch (e) {
    log("error removing sub", e);
  }
}

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

export function getListeners(type) {
  log("incoming", incomingMessagesSub);
  if (type === "messages") {
    return { incomingMessagesSub: incomingMessagesSub, outgoingMessagesSub };
  }
}

// retrievals ///////////////////////////////////////////////////////////
export async function inventoryPull(__setInventoryArr) {
  //   let arr = await getNodeObject("INVENTORY");
  //   log("inventory obj", arr);
}

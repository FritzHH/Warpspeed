/* eslint-disable */

//
//

import { cloneDeep } from "lodash";
import {
  getNodeObject,
  subscribeToInventory,
  subscribeToNode,
} from "./dbCalls";
import { log } from "./utils";

let inventorySubscriptionObj, customerSubscriptionObj;

// subscriptions //////////////////////////////////////////////////////////
export async function inventorySubscribe(ssInventoryArr, __setInventoryArr) {
  let changeCallback = (type, key, obj) => {
    let arr = [];
    log(type);
    log(key, obj);
    switch (type) {
      case "removed":
        arr = ssInventoryArr.filter((o) => o.id != obj.id);
        break;
      case "added":
        arr = ssInventoryArr.push(obj);
        break;
      case "changed":
        arr = ssInventoryArr.map((o) => {
          if (o.id === obj.id) {
            return obj;
          }
          return o;
        });
        break;
    }
    __setInventoryArr(arr);
  };
  inventorySubscriptionObj = await subscribeToNode("INVENTORY", changeCallback);
}

export async function customerSubscribe(
  ssCustomerObj,
  ssCustomerPreviewArr,
  __setCustomerObj,
  __setCustomerPreviewArr
) {
  let changeCallback = (type, key, val) => {
    // log(type);
    // log(key, obj);
    let arr = [];
    let custObj = {};
    if (type === "removed") {
      arr = ssCustomerPreviewArr.filter((o) => {
        if (o.id != key) {
          return o;
        }
      });
    } else {
      custObj = { ...ssCustomerObj, [key]: val };
      arr = ssCustomerPreviewArr.map((o) => {
        if (o.id === key) {
          return;
        }
      });
    }
    __setCustomerPreviewArr(arr);
    __setCustomerObj(custObj);
  };

  customerSubscriptionObj = await subscribeToNode(
    "CUSTOMERS/" + ssCustomerObj.id,
    changeCallback
  );
}

export function removeDatabaseSubscriptions() {}

// retrievals ///////////////////////////////////////////////////////////
export async function inventoryPull(__setInventoryArr) {
  //   let arr = await getNodeObject("INVENTORY");
  //   log("inventory obj", arr);
}

/* eslint-disable */

import React from "react";
import { View, Text, FlatList, TouchableOpacity } from "react-native-web";
import { generateRandomID, log } from "../../../utils";
import {
  Button,
  CustomerInfoScreenModalComponent,
  ScreenModal,
  SHADOW_RADIUS_PROTO,
} from "../../../components";
import { cloneDeep } from "lodash";
import {
  APP_USER,
  SETTINGS_PROTO,
  TAB_NAMES,
  WORKORDER_PROTO,
  WORKORDER_STATUS_NAMES,
} from "../../../data";
import {
  useCurrentCustomerStore,
  useCurrentWorkorderStore,
  useCustMessagesStore,
  useCustomerSearchStore,
  useLoginStore,
  useOpenWorkordersStore,
  useTabNamesStore,
} from "../../../stores";
import { messagesSubscribe } from "../../../db_subscriptions";
import { dbGetCustomerObj } from "../../../db_call_wrapper";

export function CustomerSearchListComponent({}) {
  // setters //////////////////////////////////////////////////////////////////////
  const _zSetSearchSelectedItem = useCustomerSearchStore(
    (state) => state.setSelectedItem
  );
  const _zSetIncomingMessage = useCustMessagesStore(
    (state) => state.setIncomingMessage
  );
  const _zSetOutgoingMessage = useCustMessagesStore(
    (state) => state.setOutgoingMessage
  );
  const _zSetCurrentCustomer = useCurrentCustomerStore(
    (state) => state.setCustomerObj
  );
  const _zSetOpenWorkorder = useCurrentWorkorderStore(
    (state) => state.setWorkorderObj
  );
  const _zSetInfoTabName = useTabNamesStore((state) => state.setInfoTabName);
  const _zSetItemsTabName = useTabNamesStore((state) => state.setItemsTabName);
  const _zExecute = useLoginStore((state) => state.execute);

  // getters //////////////////////////////////////////////////////////////////////
  const zSearchResultsArr = useCustomerSearchStore((state) =>
    state.getSearchResultsArr()
  );
  let zCurrentUserObj = APP_USER;
  zCurrentUserObj = useLoginStore((state) => state.getCurrentUserObj());

  ////////////////////////////////////////////////////////////////////////////////////////

  function handleCustomerSelected(customerObj) {
    dbGetCustomerObj(customerObj.id).then((res) => _zSetCurrentCustomer(res));
    let wo = cloneDeep(WORKORDER_PROTO);
    wo.customerID = customerObj.id;
    wo.changeLog = wo.changeLog.push(
      "Started by: " + zCurrentUserObj.first + " " + zCurrentUserObj.last[0]
    );
    wo.customerFirst = customerObj.first;
    wo.customerLast = customerObj.last;
    wo.customerPhone = customerObj.cell || customerObj.landline;
    wo.id = generateRandomID();
    wo.status = SETTINGS_PROTO.statuses[0];
    _zSetOpenWorkorder(wo);
    _zSetCurrentCustomer(customerObj);
    messagesSubscribe(
      customerObj.id,
      _zSetIncomingMessage,
      _zSetOutgoingMessage
    );
    _zSetSearchSelectedItem(null);
    _zSetInfoTabName(TAB_NAMES.infoTab.workorder);
    _zSetItemsTabName(TAB_NAMES.itemsTab.workorderItems);
  }

  // log("search res", zSearchResultsArr);
  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={zSearchResultsArr}
        key={(item) => item.id}
        renderItem={(item) => {
          item = item.item;
          return (
            <View
              style={{
                flexDirection: "row",
                // backgroundColor: "green",
                alignItems: "center",
                marginTop: 30,
              }}
            >
              <TouchableOpacity
                style={{ minWidth: 250, paddingVertical: 10 }}
                onPress={() => _zExecute(() => handleCustomerSelected(item))}
              >
                <Text
                  style={{ marginLeft: 10, fontSize: 17, color: "whitesmoke" }}
                >
                  {item.first + " " + item.last}
                </Text>
              </TouchableOpacity>

              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                {/* <Button
                  viewStyle={{
                    backgroundColor: "transparent",
                    ...shadow_radius,
                    marginHorizontal: 20,
                    width: 150,
                  }}
                  onPress={() => {}}
                  textStyle={{
                    fontSize: 17,
                    color: "whitesmoke",
                    paddingVertical: 10,
                  }}
                  text={"New Workorder"}
                /> */}
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

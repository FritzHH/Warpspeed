/* eslint-disable */

import React, { useState } from "react";
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
  FOCUS_NAMES,
  SETTINGS_OBJ,
  TAB_NAMES,
  WORKORDER_PROTO,
  WORKORDER_STATUS_NAMES,
} from "../../../data";
import {
  useAppCurrentUserStore,
  useCurrentCustomerStore,
  useCustMessagesStore,
  useCustomerSearchStore,
  useLoginStore,
  useOpenWorkordersStore,
  useTabNamesStore,
} from "../../../stores";
import { messagesSubscribe } from "../../../db_subscription_wrapper";
import { dbGetCustomerObj } from "../../../db_call_wrapper";

export function CustomerSearchListComponent({}) {
  // store setters //////////////////////////////////////////////////////////////////////
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
  const _zSetOpenWorkorder = useOpenWorkordersStore(
    (state) => state.setWorkorderObj
  );
  const _zSetInfoTabName = useTabNamesStore((state) => state.setInfoTabName);
  const _zSetItemsTabName = useTabNamesStore((state) => state.setItemsTabName);
  const _zExecute = useLoginStore((state) => state.execute);

  // store getters //////////////////////////////////////////////////////////////////////
  const zSearchResultsArr = useCustomerSearchStore((state) =>
    state.getSearchResultsArr()
  );
  const zCurrentUser = useAppCurrentUserStore((state) =>
    state.getCurrentUserObj()
  );

  ////////////////////////////////////////////////////////////////////////////////////////
  const [sInfoTextFocus, _setInfoTextFocus] = useState(FOCUS_NAMES.cell);
  const [sCustomerInfoObj, _setCustomerInfoObj] = useState(null);

  function handleCustomerSelected(customerObj) {
    _zSetCurrentCustomer(customerObj);
    let wo = cloneDeep(WORKORDER_PROTO);
    wo.customerID = customerObj.id;
    wo.changeLog = wo.changeLog.push(
      "Started by: " + zCurrentUser.first + " " + zCurrentUser.last[0]
    );
    wo.customerFirst = customerObj.first;
    wo.customerLast = customerObj.last;
    wo.customerPhone = customerObj.cell || customerObj.landline;
    wo.id = generateRandomID();
    wo.status = SETTINGS_OBJ.statuses[0];
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

  function handleViewEditCustomerSelected(customerObj) {}

  function handleClosePress() {
    _setCustomerInfoObj(null);
  }

  // log("search res", zSearchResultsArr);
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        // height: "100%",
        // backgroundColor: "green",
        justifySelf: "center",
      }}
    >
      <FlatList
        data={zSearchResultsArr}
        key={(item) => item.id}
        ItemSeparatorComponent={() => (
          <View
            style={{ width: "100%", height: 1, backgroundColor: "lightgray" }}
          />
        )}
        style={{ backgroundColor: null, marginTop: 20 }}
        renderItem={(item) => {
          let idx = item.index;
          item = item.item;
          return (
            <View
              style={{
                paddingVertical: 5,
                flexDirection: "row",
                // backgroundColor: "blue",
                alignItems: "center",
                width: "100%",
                justifyContent: "space-between",
                paddingHorizontal: 10,
              }}
            >
              <TouchableOpacity
                style={{ width: "80%" }}
                onPress={() => handleCustomerSelected(item)}
              >
                <Text style={{ marginLeft: 10, fontSize: 16, color: "black" }}>
                  {item.first + " " + item.last}
                </Text>
              </TouchableOpacity>
              <ScreenModal
                showOuterModal={true}
                outerModalStyle={{}}
                buttonStyle={{
                  backgroundColor: "lightgray",
                }}
                buttonVisible={true}
                buttonTextStyle={{ fontSize: 13, color: "black" }}
                handleButtonPress={() =>
                  _setCustomerInfoObj(zSearchResultsArr[idx])
                }
                buttonLabel={"View/Edit"}
                modalVisible={sCustomerInfoObj}
                canExitOnOuterClick={false}
                Component={() => (
                  <CustomerInfoScreenModalComponent
                    ssCustomerInfoObj={sCustomerInfoObj}
                    __setCustomerInfoObj={_setCustomerInfoObj}
                    button1Text={"Close"}
                    // button2Text={""}
                    ssInfoTextFocus={sInfoTextFocus}
                    __setInfoTextFocus={_setInfoTextFocus}
                    handleButton1Press={handleClosePress}
                    // handleButton2Press={handleCancelCreateNewCustomerPress}
                  />
                )}
              />
            </View>
          );
        }}
      />
    </View>
  );
}

/* eslint-disable */

import React, { useState } from "react";
import { View, Text, FlatList, TouchableOpacity } from "react-native-web";
import {
  formatPhoneForDisplay,
  formatPhoneWithDashes,
  generateRandomID,
  generateUPCBarcode,
  gray,
  log,
  unformatPhoneForDisplay,
} from "../../../utils";
import {
  Button,
  Button_,
  ScreenModal,
  SHADOW_RADIUS_PROTO,
  TouchableOpacity_,
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
  useCurrentCustomerStore,
  useCustMessagesStore,
  useCustomerSearchStore,
  useLoginStore,
  useOpenWorkordersStore,
  useTabNamesStore,
} from "../../../stores";
import { messagesSubscribe } from "../../../db_subscription_wrapper";
import { dbGetCustomerObj } from "../../../db_call_wrapper";
import { CustomerInfoScreenModalComponent } from "../modal_screens/CustomerInfoModalScreen";
import { C, ICONS } from "../../../styles";
import { Pressable } from "react-native";

export function CustomerSearchListComponent({}) {
  // store setters //////////////////////////////////////////////////////////////////////
  const _zSetSearchSelectedItem = useCustomerSearchStore(
    (state) => state.setSelectedItem
  );

  const _zSetCurrentCustomer = useCurrentCustomerStore(
    (state) => state.setCustomer
  );
  const _zSetOpenWorkorder = useOpenWorkordersStore(
    (state) => state.setWorkorder
  );

  const _zSetInfoTabName = useTabNamesStore((state) => state.setInfoTabName);
  const _zSetItemsTabName = useTabNamesStore((state) => state.setItemsTabName);

  // store getters //////////////////////////////////////////////////////////////////////
  const zSearchResults = useCustomerSearchStore((state) =>
    state.getSearchResults()
  );
  const zCurrentUser = useLoginStore((state) => state.getCurrentUser());

  ////////////////////////////////////////////////////////////////////////////////////////
  const [sInfoTextFocus, _setInfoTextFocus] = useState(FOCUS_NAMES.cell);
  const [sCustomerInfoObj, _setCustomerInfoObj] = useState(null);

  function handleCustomerSelected(customerObj) {
    // log("here");
    // log("cust", customerObj);
    _zSetCurrentCustomer(customerObj);
    let wo = cloneDeep(WORKORDER_PROTO);
    wo.customerID = customerObj.id;
    wo.changeLog = wo.changeLog.push(
      "Started by: " + zCurrentUser.first + " " + zCurrentUser.last[0]
    );
    wo.customerFirst = customerObj.first;
    wo.customerLast = customerObj.last;
    wo.customerPhone = customerObj.cell || customerObj.landline;
    wo.id = generateUPCBarcode();
    wo.startedOnMillis = new Date().getTime();
    wo.status = SETTINGS_OBJ.statuses[0];
    _zSetOpenWorkorder(wo, false);
    _zSetCurrentCustomer(customerObj);
    _zSetSearchSelectedItem(null);
    _zSetInfoTabName(TAB_NAMES.infoTab.workorder);
    _zSetItemsTabName(TAB_NAMES.itemsTab.workorderItems);
  }

  function handleViewEditCustomerSelected(customerObj) {}

  function handleClosePress() {
    _setCustomerInfoObj(null);
  }

  return (
    <View
      style={{
        width: "100%",
        height: "100%",
        justifyContent: "center",
        paddingHorizontal: 10,
        // alignItems: "center",
      }}
    >
      <FlatList
        style={{
          width: "100%",
          flexGrow: 0,
          maxHeight: "90%",
        }}
        contentContainerStyle={{
          justifyContent: "center",
          // alignItems: "center",
          flexGrow: 1,
          minHeight: "100%",
        }}
        data={zSearchResults}
        renderItem={(item) => {
          let idx = item.index;
          item = item.item;
          return (
            <View
              style={{
                paddingVertical: 7,
                flexDirection: "row",
                width: "100%",
                paddingHorizontal: 7,
                borderWidth: 1,
                borderColor: C.listItemBorder,
                backgroundColor: C.backgroundListWhite,
                borderLeftWidth: 3,
                borderLeftColor: C.buttonLightGreenOutline,
                borderRadius: 10,
                marginBottom: 5,
              }}
            >
              <TouchableOpacity_
                style={{ width: "100%", height: "100%", flexDirection: "row" }}
                onPress={() => handleCustomerSelected(item)}
              >
                <View style={{ width: "80%" }}>
                  <Text style={{ fontSize: 16, color: C.text, width: "30%" }}>
                    {item.first + " " + item.last}
                  </Text>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      marginTop: 5,
                    }}
                  >
                    <Text style={{ color: gray(0.35), fontSize: 12 }}>
                      {"cell:  "}
                    </Text>
                    <Text style={{ color: C.text, fontSize: 14 }}>
                      {formatPhoneForDisplay(item.cell)}
                    </Text>
                    {!!item.land && (
                      <Text
                        style={{ color: C.text, marginLeft: 30, fontSize: 14 }}
                      >
                        <Text style={{ color: gray(0.35), fontSize: 12 }}>
                          {"landline:  "}
                        </Text>
                        {item.land}
                      </Text>
                    )}
                    {!!item.email && (
                      <Text
                        style={{
                          color: C.text,
                          marginLeft: 30,
                          fontSize: 14,
                        }}
                      >
                        <Text style={{ color: gray(0.35), fontSize: 12 }}>
                          {"email:  "}
                        </Text>
                        {item.email}
                      </Text>
                    )}
                  </View>
                </View>
                <View
                  style={{
                    width: "20%",
                    flexDirection: "row",
                    height: "100%",
                    alignItems: "center",
                    justifyContent: "flex-end",
                  }}
                >
                  <Button_ onPress={() => {}} iconSize={25} icon={ICONS.info} />
                </View>
              </TouchableOpacity_>
            </View>
          );
        }}
      />
      {/* <ScreenModal
                showOuterModal={true}
                outerModalStyle={{}}
                buttonStyle={{
                  backgroundColor: "lightgray",
                }}
                buttonVisible={true}
                buttonTextStyle={{ fontSize: 13, color: "black" }}
                handleButtonPress={() =>
                  _setCustomerInfoObj(zSearchResults[idx])
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
              /> */}
    </View>
  );
}

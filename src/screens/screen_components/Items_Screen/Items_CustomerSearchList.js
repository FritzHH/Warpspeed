/* eslint-disable */

import React, { useMemo, useState } from "react";
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
  // store getters //////////////////////////////////////////////////////////////////////
  const zSearchResults = useCustomerSearchStore((state) => state.searchResults);
  const zCurrentUser = useLoginStore((state) => state.currentUser);

  ////////////////////////////////////////////////////////////////////////////////////////
  const [sCustomerInfo, _setCustomerInfo] = useState();

  function handleCustomerSelected(customer) {
    // log("here");
    // log("cust", zCurrentUser);
    // return;
    let wo = cloneDeep(WORKORDER_PROTO);
    wo.customerID = customer.id;
    wo.changeLog = wo.changeLog.push(
      "Started by: " + zCurrentUser.first + " " + zCurrentUser.last[0]
    );
    wo.customerFirst = customer.first;
    wo.customerLast = customer.last;
    wo.customerPhone = customer.cell || customer.landline;
    wo.id = generateUPCBarcode();
    wo.startedOnMillis = new Date().getTime();
    wo.status = SETTINGS_OBJ.statuses[0];

    useOpenWorkordersStore.getState().setWorkorder(wo, false);
    useOpenWorkordersStore.getState().setOpenWorkorder(wo);
    useCurrentCustomerStore.getState().setCustomer(customer, false);
    _setCustomerInfo();
    useCustomerSearchStore.getState().reset();
    useTabNamesStore.getState().setItems({
      infoTabName: TAB_NAMES.infoTab.workorder,
      itemsTabName: TAB_NAMES.itemsTab.workorderItems,
      optionsTabName: TAB_NAMES.optionsTab.quickItems,
    });
  }

  function handleCancelPress() {
    _setCustomerInfo();
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
        renderItem={(obj) => {
          let customer = obj.item;
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
                onPress={() => handleCustomerSelected(customer)}
              >
                <View style={{ width: "80%" }}>
                  <Text style={{ fontSize: 16, color: C.text, width: "30%" }}>
                    {customer?.first + " " + customer?.last}
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
                      {formatPhoneForDisplay(customer?.cell)}
                    </Text>
                    {!!customer?.land && (
                      <Text
                        style={{ color: C.text, marginLeft: 30, fontSize: 14 }}
                      >
                        <Text style={{ color: gray(0.35), fontSize: 12 }}>
                          {"landline:  "}
                        </Text>
                        {customer?.land}
                      </Text>
                    )}
                    {!!customer?.email && (
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
                        {customer?.email}
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
                  <Button_
                    onPress={() => _setCustomerInfo(customer)}
                    iconSize={25}
                    icon={ICONS.info}
                  />
                </View>
              </TouchableOpacity_>
            </View>
          );
        }}
      />
      {useMemo(
        () => (
          <ScreenModal
            showOuterModal={true}
            modalVisible={sCustomerInfo}
            buttonVisible={false}
            Component={() => (
              <CustomerInfoScreenModalComponent
                incomingCustomer={sCustomerInfo}
                button1Text={"New Workorder"}
                button2Text={"Close"}
                handleButton1Press={() => handleCustomerSelected(sCustomerInfo)}
                handleButton2Press={() => _setCustomerInfo()}
              />
            )}
          />
        ),
        [sCustomerInfo]
      )}
    </View>
  );
}

/* eslint-disable */

import { useMemo, useState } from "react";
import { View, Text, FlatList } from "react-native-web";
import {
  formatPhoneForDisplay,
  generateUPCBarcode,
  gray,
  log,
  createNewWorkorder
} from "../../../utils";
import {
  Button,
  Button_,
  ScreenModal,
  TouchableOpacity_,
} from "../../../components";
import { cloneDeep } from "lodash";
import { SETTINGS_OBJ, TAB_NAMES, WORKORDER_PROTO } from "../../../data";
import {
  useCurrentCustomerStore,
  useCustomerSearchStore,
  useLoginStore,
  useOpenWorkordersStore,
  useTabNamesStore,
} from "../../../stores";
import { CustomerInfoScreenModalComponent } from "../modal_screens/CustomerInfoModalScreen";
import { C, ICONS } from "../../../styles";

export function CustomerSearchListComponent({}) {
  // store getters //////////////////////////////////////////////////////////////////////
  const zSearchResults = useCustomerSearchStore((state) => state.searchResults);

  ////////////////////////////////////////////////////////////////////////////////////////
  const [sCustomerInfo, _setCustomerInfo] = useState();

  function handleCustomerSelected(customer) {
    // #region agent log
    (function () {
      var u = useLoginStore.getState().getCurrentUser();
      fetch("http://127.0.0.1:7294/ingest/14603333-b1b8-4a19-8543-f609c335e2a8", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "1a100b" },
        body: JSON.stringify({
          sessionId: "1a100b",
          location: "Items_CustomerSearchList.js:handleCustomerSelected",
          message: "handleCustomerSelected entry",
          data: {
            currentUserIsNull: u === null,
            currentUserFirst: u?.first,
            customerId: customer?.id,
            hasCustomer: !!customer,
          },
          timestamp: Date.now(),
          hypothesisId: "H1",
        }),
      }).catch(function () {});
    })();
    // #endregion
        let wo = createNewWorkorder({
          customerID: customer.id,
          customerFirst: customer.first,
          customerLast: customer.last,
          customerPhone: customer.cell || customer.landline,
          startedByFirst: useLoginStore.getState().getCurrentUser().first,
          startedByLast: useLoginStore.getState().getCurrentUser().last,
          status: SETTINGS_OBJ.statuses[0],
        });

    useOpenWorkordersStore.getState().setWorkorder(wo, false);
    useOpenWorkordersStore.getState().setOpenWorkorderID(wo.id);
    useCurrentCustomerStore.getState().setCustomer(customer);
    useTabNamesStore.getState().setItems({
      infoTabName: TAB_NAMES.infoTab.workorder,
      itemsTabName: TAB_NAMES.itemsTab.workorderItems,
      optionsTabName: TAB_NAMES.optionsTab.inventory,
    });
    _setCustomerInfo();
    useCustomerSearchStore.getState().reset();
  }

  return (
    <View
      style={{
        width: "100%",
        height: "100%",
        justifyContent: "center",
        paddingHorizontal: 10,
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
              <View
                style={{
                  width: "8%",
                  height: "100%",
                  alignItems: "flex-start",
                  justifyContent: "center",
                }}
              >
                <Button_
                  onPress={() => _setCustomerInfo(customer)}
                  iconSize={20}
                  icon={ICONS.info}
                />
              </View>
              <TouchableOpacity_
                style={{ width: "92%", height: "100%", flexDirection: "row" }}
                onPress={() => handleCustomerSelected(customer)}
              >
                <View style={{ width: "92%" }}>
                  <Text style={{ fontSize: 16, color: C.text }}>
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
                isCurrentCustomer={false}
                incomingCustomer={sCustomerInfo}
                button1Text={"New Workorder"}
                button2Text={"Close"}
                handleButton1Press={(customerInfo) =>
                  handleCustomerSelected(customerInfo)
                }
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

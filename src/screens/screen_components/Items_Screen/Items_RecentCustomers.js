/* eslint-disable */

import { useMemo, useState } from "react";
import { View, Text, FlatList } from "react-native-web";
import { Button_, Image_, ScreenModal, Tooltip, TouchableOpacity_ } from "../../../components";
import {
  useRecentCustomersStore,
  useCurrentCustomerStore,
  useOpenWorkordersStore,
  useTabNamesStore,
  useLoginStore,
  useCustomerSearchStore,
} from "../../../stores";
import { TAB_NAMES } from "../../../data";
import { startNewWorkorder, dbGetCustomer } from "../../../db_calls_wrapper";
import {
  capitalizeFirstLetterOfString,
  formatPhoneForDisplay,
  gray,
} from "../../../utils";
import { C, ICONS } from "../../../styles";
import { CustomerInfoScreenModalComponent } from "../modal_screens/CustomerInfoModalScreen";

export function RecentCustomersComponent() {
  const zRecentCustomers = useRecentCustomersStore((s) => s.recentCustomers);
  const [sCustomerInfo, _setCustomerInfo] = useState(null);

  function handleRecentCustomerSelected(customer) {
    useLoginStore.getState().requireLogin(async () => {
      useRecentCustomersStore.getState().addRecentCustomer(customer);
      useOpenWorkordersStore.getState().setWorkorderPreviewID(null);
      await startNewWorkorder(customer);
      useCurrentCustomerStore.getState().setCustomer(customer);
      useTabNamesStore.getState().setItems({
        infoTabName: TAB_NAMES.infoTab.workorder,
        itemsTabName: TAB_NAMES.itemsTab.workorderItems,
        optionsTabName: TAB_NAMES.optionsTab.inventory,
      });
      _setCustomerInfo(null);
      useCustomerSearchStore.getState().reset();
    });
  }

  async function handleInfoPress(slimCustomer) {
    let customer = await dbGetCustomer(slimCustomer.id);
    if (customer) {
      useRecentCustomersStore.getState().addRecentCustomer(customer);
      _setCustomerInfo(customer);
    }
  }

  if (zRecentCustomers.length === 0) {
    return (
      <View
        style={{
          width: "100%",
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Image_
          icon={require("../../../resources/default_app_logo_large.png")}
          style={{ opacity: 0.1, width: "90%", height: "90%" }}
        />
      </View>
    );
  }

  return (
    <View style={{ width: "100%", height: "100%", alignItems: "flex-start" }}>
      <Image_
        icon={require("../../../resources/default_app_logo_large.png")}
        style={{
          opacity: 0.1,
          width: "90%",
          height: "90%",
          position: "absolute",
          alignSelf: "center",
          top: "5%",
        }}
      />
      <View style={{ width: "35%", height: "100%", justifyContent: "center", marginLeft: 20 }}>
        <FlatList
          style={{ width: "100%", flexGrow: 0, maxHeight: "90%" }}
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
          data={zRecentCustomers}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View
              style={{
                flexDirection: "row",
                width: "100%",
                height: 60,
                paddingHorizontal: 10,
                backgroundColor: "transparent",
                borderBottomWidth: 1,
                borderColor: gray(0.1),
              }}
            >
              <View
                style={{
                  width: "15%",
                  height: "100%",
                  alignItems: "flex-start",
                  justifyContent: "center",
                }}
              >
                <Tooltip text="Customer info">
                  <Button_
                    onPress={() => handleInfoPress(item)}
                    iconSize={25}
                    icon={ICONS.info2}
                  />
                </Tooltip>
              </View>
              <Tooltip text="Start new workorder" style={{ flex: 1 }}>
                <TouchableOpacity_
                  style={{ flex: 1, height: "100%", justifyContent: "center", marginLeft: 10 }}
                  onPress={async () => {
                    let customer = await dbGetCustomer(item.id);
                    if (customer) handleRecentCustomerSelected(customer);
                  }}
                >
                  <Text style={{ fontSize: 16, color: C.text }}>
                    {capitalizeFirstLetterOfString(item.first) +
                      " " +
                      capitalizeFirstLetterOfString(item.last)}
                  </Text>
                  {!!item.customerCell && (
                    <Text
                      style={{
                        fontSize: 13,
                        color: gray(0.45),
                        fontStyle: "italic",
                        marginTop: 3,
                      }}
                    >
                      {formatPhoneForDisplay(item.customerCell)}
                    </Text>
                  )}
                </TouchableOpacity_>
              </Tooltip>
            </View>
          )}
        />
      </View>
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
                  handleRecentCustomerSelected(customerInfo)
                }
                handleButton2Press={() => _setCustomerInfo(null)}
              />
            )}
          />
        ),
        [sCustomerInfo]
      )}
    </View>
  );
}

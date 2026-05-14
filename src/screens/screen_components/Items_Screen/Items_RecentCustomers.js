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
import { C, COLOR_GRADIENTS, ICONS } from "../../../styles";
import { CustomerInfoScreenModalComponent } from "../modal_screens/CustomerInfoModalScreen";

export function RecentCustomersComponent() {
  const zRecentCustomers = useRecentCustomersStore((s) => s.recentCustomers);
  const [sCustomerInfo, _setCustomerInfo] = useState(null);
  const [sSelectedCustomer, _setSelectedCustomer] = useState(null);
  const [sModalY, _setModalY] = useState(0);
  const [sModalX, _setModalX] = useState(0);

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
              <TouchableOpacity_
                  style={{ flex: 1, height: "100%", justifyContent: "center", marginLeft: 10 }}
                  onPress={(e) => {
                    _setModalY(e.nativeEvent?.clientY ?? e.nativeEvent?.pageY ?? 0);
                    _setModalX(e.nativeEvent?.clientX ?? e.nativeEvent?.pageX ?? 0);
                    _setSelectedCustomer(item);
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
      {sSelectedCustomer && (
        <View
          onClick={() => _setSelectedCustomer(null)}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 999,
          }}
        >
          <View
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              top: sModalY,
              left: sModalX,
              backgroundColor: C.backgroundWhite,
              borderRadius: 10,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.25,
              shadowRadius: 4,
              elevation: 5,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "flex-end", padding: 10 }}>
              <TouchableOpacity_
                onPress={() => _setSelectedCustomer(null)}
              >
                <Image_ icon={ICONS.close1} style={{ width: 28, height: 28 }} />
              </TouchableOpacity_>
            </View>
            <View style={{ alignItems: "center", paddingHorizontal: 25, paddingBottom: 25 }}>
              <Button_
                text="New Workorder"
                colorGradientArr={COLOR_GRADIENTS.green}
                onPress={async () => {
                  let customer = await dbGetCustomer(sSelectedCustomer.id);
                  _setSelectedCustomer(null);
                  if (customer) handleRecentCustomerSelected(customer);
                }}
                buttonStyle={{ width: 200, height: 45 }}
                textStyle={{ fontSize: 16 }}
              />
              <Button_
                text="Customer Info"
                colorGradientArr={COLOR_GRADIENTS.blue}
                onPress={async () => {
                  let customer = await dbGetCustomer(sSelectedCustomer.id);
                  _setSelectedCustomer(null);
                  if (customer) {
                    useRecentCustomersStore.getState().addRecentCustomer(customer);
                    _setCustomerInfo(customer);
                  }
                }}
                buttonStyle={{ width: 200, height: 45, marginTop: 15 }}
                textStyle={{ fontSize: 16 }}
            />
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

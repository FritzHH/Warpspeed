/* eslint-disable */

import { View, Text, FlatList } from "react-native-web";
import { Image_, TouchableOpacity_ } from "../../../components";
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
import { C } from "../../../styles";

export function RecentCustomersComponent() {
  const zRecentCustomers = useRecentCustomersStore((s) => s.recentCustomers);

  function handleRecentCustomerSelected(slimCustomer) {
    useLoginStore.getState().requireLogin(async () => {
      let customer = await dbGetCustomer(slimCustomer.id);
      if (!customer) return;
      useRecentCustomersStore.getState().addRecentCustomer(customer);
      useOpenWorkordersStore.getState().setWorkorderPreviewID(null);
      await startNewWorkorder(customer);
      useCurrentCustomerStore.getState().setCustomer(customer);
      useTabNamesStore.getState().setItems({
        infoTabName: TAB_NAMES.infoTab.workorder,
        itemsTabName: TAB_NAMES.itemsTab.workorderItems,
        optionsTabName: TAB_NAMES.optionsTab.inventory,
      });
      useCustomerSearchStore.getState().reset();
    });
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
    <View style={{ width: "100%", height: "100%", alignItems: "flex-end" }}>
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
      <View style={{ width: "25%", height: "100%", justifyContent: "center" }}>
        <FlatList
          style={{ width: "100%", flexGrow: 0, maxHeight: "90%" }}
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
          data={zRecentCustomers}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity_
              onPress={() => handleRecentCustomerSelected(item)}
              style={{
                paddingVertical: 12,
                paddingHorizontal: 15,
                borderBottomWidth: 1,
                borderColor: gray(0.1),
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
          )}
        />
      </View>
    </View>
  );
}

/* eslint-disable */

import { useMemo, useState } from "react";
import { View, Text, FlatList } from "react-native-web";
import {
  capitalizeFirstLetterOfString,
  formatPhoneForDisplay,
  gray,
  log,
  createNewWorkorder
} from "../../../utils";
import {
  Button,
  Button_,
  Image_,
  ScreenModal,
  SmallLoadingIndicator,
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
  const zSearchQuery = useCustomerSearchStore((state) => state.searchQuery);
  const zSearchType = useCustomerSearchStore((state) => state.searchType);
  const zIsSearching = useCustomerSearchStore((state) => state.isSearching);

  const filteredResults = useMemo(() => {
    if (!zSearchQuery) return zSearchResults;

    if (zSearchType === "phone") {
      const digits = zSearchQuery.replace(/\D/g, "");
      if (!digits) return zSearchResults;
      return zSearchResults.filter((c) => {
        const cellDigits = (c.customerCell || "").replace(/\D/g, "");
        const landDigits = (c.customerLandline || c.land || "").replace(/\D/g, "");
        return cellDigits.includes(digits) || landDigits.includes(digits);
      });
    } else if (zSearchType === "email") {
      const emailQ = zSearchQuery.toLowerCase();
      return zSearchResults.filter((c) =>
        (c.email || "").toLowerCase().includes(emailQ)
      );
    } else {
      // name search — each word must match either first or last
      const words = zSearchQuery.toLowerCase().split(/\s+/).filter(Boolean);
      return zSearchResults.filter((c) => {
        const first = (c.first || "").toLowerCase();
        const last = (c.last || "").toLowerCase();
        return words.every((w) => first.includes(w) || last.includes(w));
      });
    }
  }, [zSearchResults, zSearchQuery, zSearchType]);
  ////////////////////////////////////////////////////////////////////////////////////////
  const [sCustomerInfo, _setCustomerInfo] = useState();

  function handleCustomerSelected(customer) {
    useLoginStore.getState().requireLogin(() => {
      let wo = createNewWorkorder({
        customerID: customer.id,
        customerFirst: customer.first,
        customerLast: customer.last,
        customerCell: customer.customerCell || customer.customerLandline,
        customerLandline: customer.customerLandline,
        customerEmail: customer.email,
        customerContactRestriction: customer.contactRestriction,
        startedByFirst: useLoginStore.getState().currentUser?.first,
        startedByLast: useLoginStore.getState().currentUser?.last,
        status: SETTINGS_OBJ.statuses[0]?.id || "",
      });

      let store = useOpenWorkordersStore.getState();
      store.setWorkorderPreviewID(null);
      store.setWorkorder(wo, false);
      store.setOpenWorkorderID(wo.id);
      useCurrentCustomerStore.getState().setCustomer(customer);
      useTabNamesStore.getState().setItems({
        infoTabName: TAB_NAMES.infoTab.workorder,
        itemsTabName: TAB_NAMES.itemsTab.workorderItems,
        optionsTabName: TAB_NAMES.optionsTab.inventory,
      });
      _setCustomerInfo();
      useCustomerSearchStore.getState().reset();
    });
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
      <Image_
        icon={require('../../../resources/bblogo_trans_high.png')}
        style={{ opacity: 0.1, width: "90%", height: "90%", position: "absolute", alignSelf: "center" }}
      />
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
        data={filteredResults}
        ListEmptyComponent={() => (
          <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 30 }}>
            {zIsSearching ? (
              <SmallLoadingIndicator message="Searching customers...." size={40} textStyle={{ fontSize: 16 }} />
            ) : (
              <Text style={{ color: gray(0.4), fontSize: 14 }}>No customers found</Text>
            )}
          </View>
        )}
        renderItem={(obj) => {
          let customer = obj.item;
          return (
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
                    {capitalizeFirstLetterOfString(customer?.first) + " " + capitalizeFirstLetterOfString(customer?.last)}
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
                      {formatPhoneForDisplay(customer?.customerCell)}
                    </Text>
                    {!!(customer?.customerLandline || customer?.land) && (
                      <Text
                        style={{ color: C.text, marginLeft: 30, fontSize: 14 }}
                      >
                        <Text style={{ color: gray(0.35), fontSize: 12 }}>
                          {"landline:  "}
                        </Text>
                        {customer?.customerLandline || customer?.land}
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

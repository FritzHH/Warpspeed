/* eslint-disable */

import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, View, Text, FlatList } from "react-native-web";
import {
  capitalizeFirstLetterOfString,
  formatPhoneForDisplay,
  gray,
  log,
} from "../../../utils";
import {
  Button_,
  Image_,
  ScreenModal,
  SmallLoadingIndicator,
  Tooltip,
  TouchableOpacity_,
} from "../../../components";
import cloneDeep from "lodash/cloneDeep";
import { SETTINGS_OBJ, TAB_NAMES, WORKORDER_PROTO } from "../../../data";
import {
  useCurrentCustomerStore,
  useCustomerSearchStore,
  useLoginStore,
  useOpenWorkordersStore,
  useRecentCustomersStore,
  useTabNamesStore,
} from "../../../stores";
import { CustomerInfoScreenModalComponent } from "../modal_screens/CustomerInfoModalScreen";
import { startNewWorkorder } from "../../../db_calls_wrapper";
import { C, COLOR_GRADIENTS, ICONS } from "../../../styles";
import defaultLogo from "../../../resources/default_app_logo_large.png";

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
  const [sSelectedCustomer, _setSelectedCustomer] = useState(null);
  const [sModalY, _setModalY] = useState(0);
  const [sModalX, _setModalX] = useState(0);

  function handleCustomerSelected(customer) {
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
      _setCustomerInfo();
      useCustomerSearchStore.getState().reset();
    });
  }

  // Spinning logo animation ///////////////////////////////////////////////////////////
  const spinValue = useRef(new Animated.Value(0)).current;
  const spinAnim = useRef(null);

  useEffect(() => {
    if (zIsSearching) {
      spinValue.setValue(0);
      spinAnim.current = Animated.loop(
        Animated.timing(spinValue, {
          toValue: 1,
          duration: 5000,
          useNativeDriver: false,
        })
      );
      spinAnim.current.start();
    } else {
      if (spinAnim.current) spinAnim.current.stop();
    }
  }, [zIsSearching]);

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });
  ///////////////////////////////////////////////////////////////////////////////////////

  return (
    <View
      style={{
        width: "100%",
        height: "100%",
        justifyContent: "center",
        paddingHorizontal: 10,
      }}
    >
      <Animated.Image
        source={defaultLogo}
        style={{
          opacity: 0.1,
          width: "90%",
          height: "90%",
          position: "absolute",
          alignSelf: "center",
          resizeMode: "contain",
          transform: [{ rotate: spin }],
        }}
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
            {!zIsSearching && (
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
              <TouchableOpacity_
                style={{ flex: 1, height: "100%", flexDirection: "row" }}
                onPress={(e) => {
                  _setModalY(e.nativeEvent?.clientY ?? e.nativeEvent?.pageY ?? 0);
                  _setModalX(e.nativeEvent?.clientX ?? e.nativeEvent?.pageX ?? 0);
                  _setSelectedCustomer(customer);
                }}
              >
                <View style={{ flex: 1 }}>
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
                    <Text style={{ color: C.text, fontSize: 14 }}>
                      <Text style={{ color: gray(0.35), fontSize: 12 }}>{"cell:  "}</Text>
                      {formatPhoneForDisplay(customer?.customerCell)}
                    </Text>
                    {!!(customer?.customerLandline || customer?.land) && (
                      <Text
                        style={{ color: C.text, marginLeft: 30, fontSize: 14 }}
                      >
                        <Text style={{ color: gray(0.35), fontSize: 12 }}>
                          {"landline:  "}
                        </Text>
                        {formatPhoneForDisplay(customer?.customerLandline || customer?.land)}
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
                onPress={() => {
                  let customer = sSelectedCustomer;
                  _setSelectedCustomer(null);
                  handleCustomerSelected(customer);
                }}
                buttonStyle={{ width: 200, height: 45 }}
                textStyle={{ fontSize: 16 }}
              />
              <Button_
                text="Customer Info"
                colorGradientArr={COLOR_GRADIENTS.blue}
                onPress={() => {
                  useRecentCustomersStore.getState().addRecentCustomer(sSelectedCustomer);
                  _setCustomerInfo(sSelectedCustomer);
                  _setSelectedCustomer(null);
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

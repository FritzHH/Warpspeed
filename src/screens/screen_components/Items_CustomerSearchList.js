/* eslint-disable */

import React from "react";
import { View, Text, FlatList, TouchableOpacity } from "react-native-web";
import { log } from "../../utils";
import {
  Button,
  CustomerInfoComponent,
  ScreenModal,
  SHADOW_RADIUS_PROTO,
} from "../../components";
import { cloneDeep } from "lodash";
import {
  INFO_COMPONENT_NAMES,
  TAB_NAMES,
  WORKORDER_ITEM_PROTO,
  WORKORDER_PROTO,
} from "../../data";
import { useCustomerSearchStore } from "../../stores";

export function CustomerSearchListComponent({}) {
  const zSearchResultsArr = useCustomerSearchStore((state) =>
    state.getSearchResultsArr()
  );
  const _zSetSearchSelectedItem = useCustomerSearchStore(
    (state) => state.setSelectedItem
  );

  const [sShowModal, _setShowModal] = React.useState(false);

  function handleNewWorkorderBtnPress(customerObj) {
    _zSetSearchSelectedItem(customerObj);
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
              {/* <ScreenModal
                modalStyle={{ height: "100%", width: "100%" }}
                modalProps={{ height: "90%", width: "90%" }}
                buttonStyle={{
                  paddingVertical: 5,
                  paddingHorizontal: 10,
                  marginRight: 20,
                  marginLeft: 10,
                }}
                buttonTextStyle={{ color: "whitesmoke" }}
                handleButtonPress={() => _setShowModal(true)}
                buttonLabel={"View"}
                showModal={sShowModal}
                canExitOnOuterClick={false}
                Component={() => (
                  <CustomerInfoComponent
                    sCustomerInfo={item}
                    _setCustomerInfo={_zSetSearchSelectedItem}
                    handleExitScreenPress={() => {
                      _setShowModal(false);
                    }}
                    exitScreenButtonText={"Exit screen"}
                    // ssInfoTextFocus={sInfoTextFocus}
                    // __setInfoTextFocus={_setInfoTextFocus}
                    // __closeButtonText={"Cancel"}
                    // __handleCloseButtonPress={() => {
                    //   _setBox1Val("");
                    //   _setBox2Val("");
                    //   _setSearchingByName(false);
                    //   _setShowEnterModal(false);
                    // }}
                  />
                )}
              /> */}
              <TouchableOpacity
                style={{ minWidth: 250, paddingVertical: 10 }}
                onPress={() => handleNewWorkorderBtnPress(item)}
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

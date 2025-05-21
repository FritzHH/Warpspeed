/* eslint-disable */

import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from "react-native-web";
import { dim, log, trimToTwoDecimals } from "../../utils";
import {
  TabMenuDivider as Divider,
  ScreenModal,
  Button,
  InventoryItemInModal,
  CheckBox,
} from "../../components";
import { Colors } from "../../styles";
import {
  INVENTORY_ITEM_PROTO,
  INVENTORY_CATEGORIES,
  TAB_NAMES,
} from "../../data";
import { IncomingCustomerComponent } from "./Info_CustomerInfoComponent";
import React, { useEffect, useRef, useState } from "react";
import { cloneDeep } from "lodash";

export function InventoryComponent({
  ssInventoryArr,
  ssWorkorderObj,
  __setInventoryItem,
  __setWorkorderObj,
  __setOptionsTabName,
  __addItemToWorkorder,
}) {
  /////////////////////////////////////////////////////////////
  const [sSearchTerm, _setSearchTerm] = React.useState("");
  const [sSearchResults, _setSearchResults] = React.useState(null);
  const [sCheckboxValue, _setCheckboxValue] = React.useState(null);
  const [sShowDropdownModal, _setShowDropdownModal] = React.useState(false);
  // const [sShowInventoryItemModal, _setShowInventoryItemModal] =
  // React.useState(false);
  const [sInventoryItemInModal, _setInventoryItemInModal] = useState(null);
  const [sInventoryModalVisible, _setInventoryModalVisible] = useState(false);
  const [sCategoriesDropdownSelected, _setCategoriesDropdownSelected] =
    useState(null);
  const [sCheckboxSelectedArr, _setCheckboxSelectedArr] = useState([]);

  /////////////////////////////////
  const categoriesModalBtnRef = useRef(null);

  //////////////////////////
  // functions
  ///////////////////////////

  function clearSearch() {
    _setSearchResults(ssInventoryArr);
    _setSearchTerm("");
    _setCheckboxValue(null);
    // _setCategoriesDropdownSelected(null);
  }

  function search(searchTerm) {
    _setSearchTerm(searchTerm);
    if (searchTerm.length == 0) {
      _setSearchResults([]);
      return;
    }
    if (searchTerm.length < 2) return;
    let res = {};
    let keys = Object.keys(INVENTORY_ITEM_PROTO);
    ssInventoryArr.forEach((invItem) => {
      keys.forEach((key) => {
        if (
          invItem[key]
            .toString()
            .toLowerCase()
            .includes(searchTerm.toLowerCase())
        )
          res[invItem.id] = invItem;
      });
    });
    res = Object.values(res);
    // log("search arr res", res);
    _setSearchResults(res);
  }

  function searchItemSelected(item) {
    _setCategoriesDropdownSelected(null);
  }

  function checkboxPressed(checkboxName) {
    _setCategoriesDropdownSelected(null);
    if (checkboxName === sCheckboxValue) checkboxName = null;
    _setCheckboxValue(checkboxName);
    // log(checkboxName);
    let res = [];
    ssInventoryArr.forEach((invItem) => {
      if (invItem.catMain === checkboxName) res.push(invItem);
    });
    _setSearchResults(res);
    // log(res);
  }

  function dropdownSelected(name) {
    _setCheckboxValue(null);
    _setCategoriesDropdownSelected(name);
    // log("name", name);
    let res = [];
    ssInventoryArr.forEach((invItem) => {
      if (invItem.catDescrip === name) res.push(invItem);
    });
    _setSearchResults(res);
    // log(res);
  }

  function handleAddInventoryPress() {
    _setInventoryItemInModal(INVENTORY_ITEM_PROTO);
  }

  // log("ssw", ssWorkorderObj);
  ///////////////////////////////////////////////////////////////
  /////////////////////////////////////////////////////////////////
  const tabMargin = 20;
  return (
    <View style={{ width: "100%", height: "100%" }}>
      <View
        style={{
          width: "100%",
          marginTop: 10,
          flexDirection: "row",
          marginHorizontal: 4,
        }}
      >
        <Button
          onPress={() => clearSearch()}
          text={"reset"}
          textStyle={{ color: "gray" }}
          buttonStyle={{ height: 30, width: 70 }}
        />
        <TextInput
          style={{
            borderBottomWidth: 1,
            borderBottomColor: sSearchTerm.length > 0 ? "dimgray" : "darkgray",
            fontSize: 20,
            color: Colors.darkTextOnMainBackground,
            outlineWidth: 0,
            width: "100%",
            marginLeft: 20,
            marginRight: 30,
          }}
          placeholder="Search inventory..."
          placeholderTextColor={"darkgray"}
          value={sSearchTerm}
          onChangeText={(val) => search(val)}
        />
      </View>
      {/** checkboxes and categories dropdown row */}
      <View
        style={{
          marginTop: 10,
          paddingRight: 50,
          flexDirection: "row",
          width: "100%",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <View style={{ flexDirection: "row" }}>
          <CheckBox
            viewStyle={{ marginRight: tabMargin, marginLeft: 10 }}
            buttonStyle={{ borderWidth: 1, borderColor: "brown" }}
            roundButton={true}
            text={INVENTORY_CATEGORIES.main.parts}
            onCheck={() => checkboxPressed(INVENTORY_CATEGORIES.main.parts)}
            isChecked={INVENTORY_CATEGORIES.main.parts === sCheckboxValue}
          />
          <CheckBox
            viewStyle={{ marginRight: tabMargin }}
            buttonStyle={{ borderWidth: 1, borderColor: "brown" }}
            roundButton={true}
            text={INVENTORY_CATEGORIES.main.accessories}
            onCheck={() =>
              checkboxPressed(INVENTORY_CATEGORIES.main.accessories)
            }
            isChecked={INVENTORY_CATEGORIES.main.accessories === sCheckboxValue}
          />
          <CheckBox
            viewStyle={{ marginRight: tabMargin }}
            buttonStyle={{ borderWidth: 1, borderColor: "brown" }}
            roundButton={true}
            text={INVENTORY_CATEGORIES.main.labor}
            onCheck={() => checkboxPressed(INVENTORY_CATEGORIES.main.labor)}
            isChecked={INVENTORY_CATEGORIES.main.labor === sCheckboxValue}
          />
          <CheckBox
            viewStyle={{ marginRight: tabMargin }}
            buttonStyle={{ borderWidth: 1, borderColor: "brown" }}
            roundButton={true}
            text={INVENTORY_CATEGORIES.main.bikes}
            onCheck={() => checkboxPressed(INVENTORY_CATEGORIES.main.bikes)}
            isChecked={INVENTORY_CATEGORIES.main.bikes === sCheckboxValue}
          />
        </View>
        {/* Categories dropdown modal*/}
        {/* <ScreenModal
          ref={categoriesModalBtnRef}
          buttonLabel={
            sCategoriesDropdownSelected
              ? sCategoriesDropdownSelected
              : "Categories"
          }
          buttonStyle={{
            marginLeft: 5,
            height: 30,
            backgroundColor: "lightgray",
            minWidth: 150,
          }}
          buttonTextStyle={{
            color: "rgba(50,50,50,1)",
            fontSize: 14,
          }}
          showOuterModal={false}
          modalVisible={sShowDropdownModal}
          setModalVisibility={_setShowDropdownModal}
          Component={() => (
            <View style={{}}>
              <FlatList
                data={Object.values(INVENTORY_CATEGORIES.descriptions)}
                keyExtractor={(item, index) => index}
                renderItem={(item) => {
                  let index = item.index;
                  item = item.item;
                  return (
                    <View style={{ backgroundColor: "lightgray" }}>
                      <Button
                        onPress={() => {
                          _setShowDropdownModal(false);
                          dropdownSelected(item);
                        }}
                        textStyle={{
                          color: Colors.darkText,
                          fontWeight: 500,
                          // paddingHorizontal: 50,
                        }}
                        buttonStyle={{
                          width: null,
                          paddingHorizontal: 20,
                          borderBottomWidth:
                            index ==
                            Object.values(INVENTORY_CATEGORIES.descriptions)
                              .length -
                              1
                              ? 0
                              : 1,
                          borderColor: Colors.tabMenuButton,
                          marginVertical: 0,
                          backgroundColor: "lightgray",
                        }}
                        text={item}
                      />
                    </View>
                  );
                }}
              />
            </View>
          )}
        /> */}
        {/** MODAL Plus button full screen inventory modal */}
        <ScreenModal
          mouseOverOptions={{ enable: false }}
          showShadow={false}
          buttonStyle={{
            color: "red",
            width: 40,
            height: 40,
            marginLeft: 40,
            marginBottom: 10,
          }}
          setModalVisibility={(val) => _setInventoryModalVisible(val)}
          handleButtonPress={() => {
            _setInventoryItemInModal(INVENTORY_ITEM_PROTO);
            _setInventoryModalVisible(true);
          }}
          buttonTextStyle={{
            fontSize: 50,
            color: "red",
            padding: 0,
          }}
          showButtonIcon={false}
          buttonLabel="+"
          showOuterModal={true}
          modalVisible={sInventoryModalVisible}
          Component={() => {
            return (
              <InventoryItemInModal
                __setItem={__setInventoryItem}
                item={sInventoryItemInModal}
                handleClosePress={() => _setInventoryModalVisible(false)}
              />
            );
          }}
        />
      </View>
      {/* inventory results flatLIST */}
      <FlatList
        style={{
          marginRight: 20,
          marginTop: 10,
          marginLeft: 10,
          // backgroundColor: "green",
        }}
        data={sSearchResults || ssInventoryArr}
        renderItem={(item) => {
          item = item.item;
          return (
            <TouchableOpacity onPress={() => searchItemSelected(item)}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "flex-start",
                  borderBottomWidth: 1,
                  borderColor: "darkgray",
                  paddingVertical: 5,
                  width: "100%",
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    width: "90%",
                    alignItems: "center",
                    // background: "red",
                  }}
                >
                  {/**MODAL search result list item full screen modal */}
                  <ScreenModal
                    buttonLabel={"i"}
                    showButtonIcon={false}
                    buttonTextStyle={{ color: "dimgray", fontSize: 17 }}
                    buttonStyle={{
                      paddingTop: 4,
                      paddingLeft: 13,
                      marginRight: 10,
                      width: null,
                      height: null,
                    }}
                    mouseOverOptions={{
                      enable: true,
                      highlightColor: Colors.tabMenuButton,
                    }}
                    handleButtonPress={() => {
                      _setInventoryModalVisible(true);
                      _setInventoryItemInModal(item);
                    }}
                    showShadow={false}
                    textStyle={{ fontSize: 14 }}
                    Component={() => {
                      return (
                        <InventoryItemInModal
                          __setItem={__setInventoryItem}
                          item={item}
                          handleClosePress={() => {
                            _setInventoryItemInModal(INVENTORY_ITEM_PROTO);
                            _setInventoryModalVisible(false);
                          }}
                        />
                      );
                    }}
                  />
                  <CheckBox
                    item={item}
                    handleCheckInternal={true}
                    mouseOverOptions={{
                      enable: true,
                      opacity: 0.2,
                      highlightColor: "gray",
                    }}
                    onCheck={(item, isChecked) => {
                      let arr;
                      if (isChecked) {
                        arr = cloneDeep(sCheckboxSelectedArr);
                        arr.push(item);
                      } else {
                        arr = sCheckboxSelectedArr.filter(
                          (o) => o.id != item.id
                        );
                      }
                      _setCheckboxSelectedArr(arr);
                    }}
                    buttonStyle={{
                      borderColor: "gray",
                      borderWidth: 1,
                      marginRight: 15,
                    }}
                  />

                  {/** this is where we grab an inventory item and toss it up to the
                   * workorder
                   */}
                  <Button
                    textStyle={{ width: "100%", fontSize: 14 }}
                    text={item.name}
                    shadow={false}
                    onPress={() => {
                      __addItemToWorkorder(item);
                    }}
                    buttonStyle={{
                      width: "100%",
                      height: 23,
                      // backgroundColor: "blue",
                    }}
                    mouseOverOptions={{
                      enable: true,
                      opacity: 0.3,
                    }}
                  />
                </View>
                <TouchableWithoutFeedback>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "flex-start",
                      alignItems: "center",
                      width: "20%",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                      }}
                    >
                      {"$ "}
                      <Text style={{ fontSize: 16 }}>{item.price}</Text>
                    </Text>
                  </View>
                </TouchableWithoutFeedback>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

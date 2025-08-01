/* eslint-disable */

import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from "react-native-web";
import {
  dim,
  generateBarcode,
  generateRandomID,
  log,
  trimToTwoDecimals,
} from "../../utils";
import {
  TabMenuDivider as Divider,
  ScreenModal,
  Button,
  InventoryItemScreeenModalComponent,
  CheckBox,
} from "../../components";
import { Colors } from "../../styles";
import {
  INVENTORY_ITEM_PROTO,
  INVENTORY_CATEGORIES,
  TAB_NAMES,
  WORKORDER_ITEM_PROTO,
} from "../../data";
import { IncomingCustomerComponent } from "./Info_CustomerInfoComponent";
import React, { useEffect, useRef, useState } from "react";
import { cloneDeep } from "lodash";
import {
  useCurrentCustomerStore,
  useCurrentWorkorderStore,
  useInventoryStore,
  useLoginStore,
  useOpenWorkordersStore,
  useSettingsStore,
  useTabNamesStore,
} from "../../stores";
import {
  dbSetInventoryItem,
  dbSetOpenWorkorderItem,
  dbSetSettings,
} from "../../db_call_wrapper";

const tabMargin = 20;
export function InventoryComponent({}) {
  /// setters ///////////////////////////////////////////////////////////////
  const _zSetWorkorderObj = useCurrentWorkorderStore(
    (state) => state.setWorkorderObj
  );
  const _zSetItemsTabName = useTabNamesStore((state) => state.setItemsTabName);
  const _zExecute = useLoginStore((state) => state.execute);
  /// getters /////////////////////////////////////////////////////////////
  const zInventoryArr = useInventoryStore((state) => state.getInventoryArr());
  const zWorkorderObj = useCurrentWorkorderStore((state) =>
    state.getWorkorderObj()
  );
  /////////////////////////////////////////////////////////////
  const [sSearchTerm, _setSearchTerm] = React.useState("");
  const [sSearchResults, _setSearchResults] = React.useState([]);
  const [sCheckboxValue, _setCheckboxValue] = React.useState(null);
  const [sNewItemObj, _setNewItemObject] = useState(null);
  const [sModalInventoryObjIdx, _setModalInventoryObjIdx] = useState(null);
  // testing
  useEffect(() => {
    if (zInventoryArr.length > 0 && !sCheckboxValue) {
      _setCheckboxValue("Parts");
      let res = [];
      zInventoryArr.forEach((invItem) => {
        if (invItem.category === "Parts") res.push(invItem);
      });
      _setSearchResults(res);
    }
  }, [zInventoryArr]);

  function clearSearch() {
    _setSearchResults([]);
    _setSearchTerm("");
    _setCheckboxValue(null);
  }

  function search(searchTerm, o) {
    searchTerm = searchTerm.toString();
    _setSearchTerm(searchTerm);
    if (searchTerm.length == 0 || searchTerm.length < 4) {
      _setSearchResults([]);
      return;
    }

    let res = {};
    let keys = Object.keys(INVENTORY_ITEM_PROTO);
    zInventoryArr.forEach((invItem) => {
      keys.forEach((key) => {
        try {
          if (
            invItem[key]
              .toString()
              .toLowerCase()
              .includes(searchTerm.toLowerCase())
          )
            res[invItem.id] = invItem;
        } catch (e) {}
      });
    });
    res = Object.values(res);

    if (res.length === 0 && searchTerm.length === 12) {
      _setNewItemObject({
        ...cloneDeep(INVENTORY_ITEM_PROTO),
        upc: searchTerm,
      });
      _setModalInventoryObjIdx(-1);
      _setSearchTerm("");
    }

    _setSearchResults(res);
  }

  function inventoryItemSelected(item) {
    if (!zWorkorderObj?.id) {
      let idx = zInventoryArr.findIndex((o) => o.id == item.id);
      _setModalInventoryObjIdx(idx);
      return;
    }

    let wo = cloneDeep(zWorkorderObj);
    if (!wo.workorderLines) wo.workorderLines = [];
    // log("item", item);
    let lineItem = cloneDeep(WORKORDER_ITEM_PROTO);
    lineItem.invItemID = item.id;
    lineItem.id = generateRandomID();
    wo.workorderLines.push(lineItem);
    _zExecute(() => {
      _zSetWorkorderObj(wo);
      if (!zWorkorderObj.isStandaloneSale) dbSetOpenWorkorderItem(wo);
      _zSetItemsTabName(TAB_NAMES.itemsTab.workorderItems);
    });
  }

  function checkboxPressed(checkboxName) {
    if (checkboxName === sCheckboxValue) checkboxName = null;
    _setCheckboxValue(checkboxName);
    // log(checkboxName);
    let res = [];
    zInventoryArr.forEach((invItem) => {
      if (invItem.category === checkboxName) res.push(invItem);
    });
    _setSearchResults(res);
    // log(res);
  }
  ///////////////////////////////////////////////////////////////
  /////////////////////////////////////////////////////////////////
  return (
    <View style={{ width: "100%", height: dim.windowHeight * 0.96 }}>
      <View
        style={{
          // width: "100%",
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
          // onChange={(ev) => log(ev)}
          // onSubmitEditing={(ev) => log(ev)}
          // onKeyPress={(ev) => log(ev)}
        />
      </View>
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
            buttonStyle={{ borderWidth: 1, borderColor: "gray" }}
            roundButton={true}
            text={INVENTORY_CATEGORIES.parts}
            onCheck={() => checkboxPressed(INVENTORY_CATEGORIES.parts)}
            isChecked={INVENTORY_CATEGORIES.parts === sCheckboxValue}
          />
          <CheckBox
            viewStyle={{ marginRight: tabMargin }}
            buttonStyle={{ borderWidth: 1, borderColor: "gray" }}
            roundButton={true}
            text={INVENTORY_CATEGORIES.accessories}
            onCheck={() => checkboxPressed(INVENTORY_CATEGORIES.accessories)}
            isChecked={INVENTORY_CATEGORIES.accessories === sCheckboxValue}
          />
          <CheckBox
            viewStyle={{ marginRight: tabMargin }}
            buttonStyle={{ borderWidth: 1, borderColor: "gray" }}
            roundButton={true}
            text={INVENTORY_CATEGORIES.labor}
            onCheck={() => checkboxPressed(INVENTORY_CATEGORIES.labor)}
            isChecked={INVENTORY_CATEGORIES.labor === sCheckboxValue}
          />
          <CheckBox
            viewStyle={{ marginRight: tabMargin }}
            buttonStyle={{ borderWidth: 1, borderColor: "gray" }}
            roundButton={true}
            text={INVENTORY_CATEGORIES.bikes}
            onCheck={() => checkboxPressed(INVENTORY_CATEGORIES.bikes)}
            isChecked={INVENTORY_CATEGORIES.bikes === sCheckboxValue}
          />
          <CheckBox
            viewStyle={{ marginRight: 0 }}
            buttonStyle={{ borderWidth: 1, borderColor: "gray" }}
            roundButton={true}
            text={INVENTORY_CATEGORIES.other}
            onCheck={() => checkboxPressed(INVENTORY_CATEGORIES.other)}
            isChecked={INVENTORY_CATEGORIES.other === sCheckboxValue}
          />
        </View>
        {/** MODAL Plus button full screen inventory modal */}
        {
          <Button
            text={"+"}
            onPress={() => {
              _setModalInventoryObjIdx(-1);
              _setNewItemObject(cloneDeep(INVENTORY_ITEM_PROTO));
            }}
          />
        }
      </View>
      {/* inventory results flatLIST */}
      <FlatList
        style={{
          marginRight: 20,
          marginTop: 10,
          marginLeft: 10,
          // backgroundColor: "green",
        }}
        data={sSearchResults}
        renderItem={(item) => {
          if (!item) return null;
          let itemIndex = item.index;
          item = item.item;
          return (
            <TouchableOpacity onPress={() => inventoryItemSelected(item)}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "flex-start",
                  borderBottomWidth: 1,
                  borderColor: "darkgray",
                  paddingVertical: 1,
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
                  {/* *MODAL search result list item full screen modal */}
                  {/* <ScreenModal
                    buttonVisible={zCurrentWorkorderObj.id ? true : false}
                    buttonLabel={"i"}
                    buttonTextStyle={{ color: "dimgray", fontSize: 17 }}
                    showShadow={false}
                    buttonStyle={{
                      marginRight: 2,
                    }}
                    mouseOverOptions={{
                      enable: true,
                      highlightColor: Colors.tabMenuButton,
                    }}
                    handleButtonPress={() => {
                      log("button pressed");
                    }}
                    handleOuterClick={() => _setModalInventoryObjIdx(null)}
                    modalVisible={sModalInventoryObjIdx == itemIndex}
                    textStyle={{ fontSize: 14 }}
                    showOuterModal={true}
                    outerModalStyle={{
                      backgroundColor: "rgba(50,50,50,.5)",
                    }}
                    Component={() => {
                      return (
                        <InventoryItemInModal
                          itemIdx={sModalInventoryObjIdx}
                          handleClosePress={() =>
                            _setModalInventoryObjIdx(null)
                          }
                        />
                      );
                    }}
                  /> */}
                  <Button
                    textStyle={{
                      textAlign: "left",
                      width: "100%",
                      fontSize: 14,
                    }}
                    text={
                      <Text style={{ fontSize: 15 }}>
                        {item.informalName || item.formalName}
                        {item.informalName ? (
                          <Text style={{ fontSize: 12, color: "gray" }}>
                            {"\n" + item.formalName}
                          </Text>
                        ) : null}
                      </Text>
                    }
                    shadow={false}
                    onPress={() => {
                      inventoryItemSelected(item);
                    }}
                    buttonStyle={{
                      width: "100%",
                      minHeight: 10,
                      // backgroundColor: "blue",
                    }}
                    mouseOverOptions={{
                      enable: true,
                      opacity: 0.9,
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
      <ScreenModal
        buttonVisible={false}
        handleOuterClick={() => {
          _setModalInventoryObjIdx(null);
          _setNewItemObject(null);
        }}
        modalVisible={sModalInventoryObjIdx}
        textStyle={{ fontSize: 14 }}
        showOuterModal={true}
        outerModalStyle={{
          backgroundColor: "rgba(50,50,50,.5)",
        }}
        Component={() => {
          return (
            <InventoryItemScreeenModalComponent
              itemIdx={sModalInventoryObjIdx}
              handleClosePress={() => _setModalInventoryObjIdx(null)}
              newItemObj={sNewItemObj}
            />
          );
        }}
      />
    </View>
  );
}

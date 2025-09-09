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
} from "../../../utils";
import {
  TabMenuDivider as Divider,
  ScreenModal,
  Button,
  InventoryItemScreeenModalComponent,
  CheckBox_,
  TabMenuButton,
  TabMenuDivider,
} from "../../../components";
import { Colors } from "../../../styles";
import {
  INVENTORY_ITEM_PROTO,
  INVENTORY_CATEGORY_NAMES,
  TAB_NAMES,
  WORKORDER_ITEM_PROTO,
} from "../../../data";
import React, { useEffect, useRef, useState } from "react";
import { cloneDeep } from "lodash";
import {
  useCurrentCustomerStore,
  useInventoryStore,
  useLoginStore,
  useOpenWorkordersStore,
  useSettingsStore,
  useTabNamesStore,
} from "../../../stores";
import { dbSetInventoryItem, dbSetSettings } from "../../../db_call_wrapper";

const tabMargin = 20;
export function InventoryComponent({}) {
  /// store setters ///////////////////////////////////////////////////////////////
  const _zSetWorkorderObj = useOpenWorkordersStore(
    (state) => state.setWorkorderObj
  );
  const _zSetItemsTabName = useTabNamesStore((state) => state.setItemsTabName);
  const _zExecute = useLoginStore((state) => state.execute);
  const _zSetOptionsTabName = useTabNamesStore(
    (state) => state.setOptionsTabName
  );

  /// store getters /////////////////////////////////////////////////////////////
  const zInventoryArr = useInventoryStore((state) => state.getInventoryArr());
  const zWorkorderObj = useOpenWorkordersStore((state) =>
    state.getWorkorderObj()
  );
  const zOptionsTabName = useTabNamesStore((state) =>
    state.getOptionsTabName()
  );

  // local state ////////////////////////////////////////////////////////
  const [sSearchTerm, _setSearchTerm] = React.useState("");
  const [sSearchResults, _setSearchResults] = React.useState([]);
  const [sCheckBox_Value, _setCheckBox_Value] = React.useState(null);
  const [sNewItemObj, _setNewItemObject] = useState(null);
  const [sModalInventoryObjIdx, _setModalInventoryObjIdx] = useState(null);

  //////////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////////

  useEffect(() => {
    let count = 0;
    let arr = [];
    if (sSearchResults.length > 20) return;
    for (let i = 0; i <= 10; i++) {
      // log(zInventoryArr[i]);
      if (zInventoryArr[i]) arr.push(zInventoryArr[i]);
    }
    _setSearchResults(arr);
  }, [zInventoryArr]);

  function clearSearch() {
    _setSearchResults([]);
    _setSearchTerm("");
    _setCheckBox_Value(null);
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
    // log(item);
    // return;
    if (!zWorkorderObj?.id) {
      _setModalInventoryObj(item);
      return;
    }

    let wo = cloneDeep(zWorkorderObj);
    if (!wo.workorderLines) wo.workorderLines = [];
    // log("item", item);
    let lineItem = cloneDeep(WORKORDER_ITEM_PROTO);
    lineItem.invItemID = item.id;
    lineItem.id = generateRandomID();
    wo.workorderLines.push(lineItem);
    _zSetWorkorderObj(wo);
    return;

    // if (!zWorkorderObj?.id) return;
    // let wo = cloneDeep(zWorkorderObj);
    // if (!wo.workorderLines) wo.workorderLines = [];
    // // log("item", item);
    // let lineItem = cloneDeep(WORKORDER_ITEM_PROTO);
    // lineItem.invItemID = item.id;
    // lineItem.id = generateRandomID();
    // wo.workorderLines.push(lineItem);

    // only save to db if not standalone sale
    _zSetWorkorderObj(wo, zWorkorderObj.isStandaloneSale);
    _zSetItemsTabName(TAB_NAMES.itemsTab.workorderItems);
  }

  function inventoryItemViewPressed(item) {
    let idx = zInventoryArr.findIndex((o) => o.id == item.id);
    _setModalInventoryObjIdx(idx);
  }

  ///////////////////////////////////////////////////////////////
  /////////////////////////////////////////////////////////////////
  // log("wo", zWorkorderObj);
  function setComponent() {
    return (
      <View
        style={{
          flex: 1,
          // width: "100%",
          // height: __screenHeight,
          paddingHorizontal: 5,
        }}
      >
        <View
          style={{
            width: "100%",
            height: "5%",
            flexDirection: "row",
            paddingHorizontal: 4,
            alignItems: "center",
            // backgroundColor: "blue",
          }}
        >
          <Button
            onPress={() => clearSearch()}
            text={"reset"}
            textStyle={{ color: "white" }}
            buttonStyle={{ height: 30 }}
          />
          <TextInput
            style={{
              borderBottomWidth: 1,
              borderBottomColor: "gray",
              fontSize: 20,
              color: Colors.darkTextOnMainBackground,
              outlineWidth: 0,
              width: "90%",
              marginLeft: 20,
              marginRight: 30,
            }}
            placeholder="Search inventory..."
            placeholderTextColor={"gray"}
            value={sSearchTerm}
            onChangeText={(val) => search(val)}
            // onChange={(ev) => log(ev)}
            // onSubmitEditing={(ev) => log(ev)}
            // onKeyPress={(ev) => log(ev)}
          />
          <Button
            buttonStyle={{ width: null }}
            text={"+"}
            onPress={() => {
              _setModalInventoryObjIdx(-1);
              _setNewItemObject(cloneDeep(INVENTORY_ITEM_PROTO));
            }}
          />
        </View>

        {/* inventory results flatLIST */}
        <View style={{ height: "95%", width: "100%", paddingTop: 10 }}>
          <FlatList
            style={{
              width: "100%",
              height: "100%",
            }}
            data={sSearchResults}
            ItemSeparatorComponent={() => (
              <View
                style={{
                  width: "100%",
                  backgroundColor: "gray",
                  height: 1,
                  // marginVertical: 1,
                }}
              />
            )}
            renderItem={(item) => {
              // if (!item.item) return null;
              let itemIndex = item.index;
              item = item.item;
              // log("item", item);
              return (
                <View
                  style={{
                    // backgroundColor: "green",
                    flexDirection: "row",
                    width: "100%",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Button
                    onPress={() =>
                      zWorkorderObj?.id
                        ? inventoryItemSelected(item)
                        : inventoryItemViewPressed(item)
                    }
                    shadow={false}
                    // mouseOverOptions={{ opacity: 1 }}
                    buttonStyle={{ backgroundColor: "transparent" }}
                    viewStyle={{ width: "100%" }}
                    TextComponent={() => (
                      <View
                        style={{
                          width: "100%",
                          flexDirection: "row",
                          // backgroundColor: "blue",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <Button
                          mouseOverOptions={{ highlightColor: "red" }}
                          buttonStyle={{
                            backgroundColor: "transparent",
                            // width: "8%",
                          }}
                          text={"i"}
                          onPress={() => {
                            _setModalInventoryObjIdx(-1);
                            _setNewItemObject(cloneDeep(INVENTORY_ITEM_PROTO));
                          }}
                        />
                        <Text
                          style={{ width: "85%", fontSize: 14, marginLeft: 20 }}
                        >
                          {item.informalName || item.formalName}
                          {item.informalName ? (
                            <Text style={{ fontSize: 12, color: "gray" }}>
                              {"\n" + item.formalName}
                            </Text>
                          ) : null}
                        </Text>
                        <View
                          style={{
                            borderLeftWidth: 1,
                            borderColor: "gray",
                            paddingLeft: 5,
                            width: "10%",
                            alignItems: "flex-end",
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 11,
                              color: "dimgray",
                              // width: "100%",
                            }}
                          >
                            {"$ "}
                            <Text style={{ fontSize: 16, color: null }}>
                              {item.price}
                            </Text>
                          </Text>
                        </View>
                      </View>
                    )}
                  />
                </View>
              );
            }}
          />
        </View>
        {/* Full screen inventory item modal */}
        <ScreenModal
          buttonVisible={false}
          handleOuterClick={() => {
            // log("screen modal clicked");
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
              />
            );
          }}
        />
      </View>
    );
  }
  try {
    return setComponent();
  } catch (e) {
    log("Error setting component InventoryComponent", e);
    return null;
  }
}

const height = 30;
const TabBar = ({
  zOptionsTabName,
  _zSetOptionsTabName,
  __setShowWorkorderModal,
  __setShowInventoryModal,
}) => (
  <View
    style={{
      flexDirection: "row",
      // width: "100%",
      // justifyContent: "space-between",
      height,
    }}
  >
    <TabMenuButton
      height={height}
      onPress={() => _zSetOptionsTabName(TAB_NAMES.optionsTab.quickItems)}
      text={TAB_NAMES.optionsTab.quickItems}
      isSelected={
        zOptionsTabName === TAB_NAMES.optionsTab.quickItems ? true : false
      }
    />
    <TabMenuDivider />
    <TabMenuButton
      height={height}
      onPress={() => _zSetOptionsTabName(TAB_NAMES.optionsTab.workorders)}
      text={TAB_NAMES.optionsTab.workorders}
      isSelected={
        zOptionsTabName == TAB_NAMES.optionsTab.workorders ? true : false
      }
    />
    <TabMenuButton
      height={height}
      onPress={() => __setShowWorkorderModal(true)}
      buttonStyle={{ width: 50 }}
      text={`\u2610`}
      isSelected={
        zOptionsTabName == TAB_NAMES.optionsTab.workorders ? true : false
      }
    />
    <TabMenuDivider />
    <TabMenuButton
      height={height}
      onPress={() => _zSetOptionsTabName(TAB_NAMES.optionsTab.inventory)}
      text={TAB_NAMES.optionsTab.inventory}
      isSelected={
        zOptionsTabName == TAB_NAMES.optionsTab.inventory ? true : false
      }
    />
    <TabMenuButton
      height={height}
      onPress={() => __setShowInventoryModal(true)}
      buttonStyle={{ width: 50 }}
      text={`\u2610`}
      isSelected={
        zOptionsTabName == TAB_NAMES.optionsTab.inventory ? true : false
      }
    />
    <TabMenuDivider />
    <TabMenuButton
      height={height}
      onPress={() => _zSetOptionsTabName(TAB_NAMES.optionsTab.messages)}
      text={TAB_NAMES.optionsTab.messages}
      isSelected={
        zOptionsTabName == TAB_NAMES.optionsTab.messages ? true : false
      }
    />
  </View>
);

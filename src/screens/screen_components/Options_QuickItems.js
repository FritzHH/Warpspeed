/*eslint-disable*/
import React, { useEffect, useRef, useState } from "react";
import { View, FlatList, TextInput } from "react-native-web";
import {
  WORKORDER_ITEM_PROTO,
  INVENTORY_ITEM_PROTO,
  WORKORDER_PROTO,
  SETTINGS_PROTO,
} from "../../data";
import { Colors } from "../../styles";

import { dim, generateRandomID, log, randomWordGenerator } from "../../utils";
import {
  AlertBox,
  Button,
  InventoryItemScreeenModalComponent,
  ScreenModal,
  SHADOW_RADIUS_NOTHING,
} from "../../components";
import { cloneDeep } from "lodash";
import {
  useSettingsStore,
  useCurrentWorkorderStore,
  useInventoryStore,
  useLoginStore,
} from "../../stores";
import { dbSetOpenWorkorderItem, dbSetSettings } from "../../db_calls";

const SEARCH_STRING_TIMER = 45 * 1000;

export function QuickItemComponent({}) {
  // setters ///////////////////////////////////////////////////////////////
  const _zSetWorkorderObj = useCurrentWorkorderStore(
    (state) => state.setWorkorderObj
  );
  const _zSetSettings = useSettingsStore((state) => state.setSettingsObj);
  const _zModInventoryItem = useInventoryStore((state) => state.modItem);
  const _zSetLoginFunctionCallback = useLoginStore(
    (state) => state.setLoginFunctionCallback
  );
  const _zSetShowLoginScreen = useLoginStore(
    (state) => state.setShowLoginScreen
  );
  const _zExecute = useLoginStore((state) => state.execute);
  const _zSetModalVisible = useLoginStore((state) => state.setModalVisible);

  // getters //////////////////////////////////////////////////////////////
  let zWorkorderObj = WORKORDER_PROTO;
  let zSettingsObj = SETTINGS_PROTO;
  zSettingsObj = useSettingsStore((state) => state.getSettingsObj());
  zWorkorderObj = useCurrentWorkorderStore((state) => state.getWorkorderObj());
  const zInventoryArr = useInventoryStore((state) => state.getInventoryArr());

  ///////////////////////////////////////////////////////////////////////
  const [sSearchTerm, _setSearchTerm] = React.useState("");
  const [sSearchResults, _setSearchResults] = React.useState([]);
  const [sModalInventoryObj, _setModalInventoryObj] = React.useState(null);
  const [sModalInventoryObjIdx, _setModalInventoryObjIdx] = useState(null);

  let lastSearchMillis = new Date().getTime();
  function setSearchTimer() {
    setInterval(() => {
      let curTime = new Date().getTime();
      let diff = curTime - lastSearchMillis;
      if (diff > SEARCH_STRING_TIMER) {
        clearSearch();
        lastSearchMillis = curTime;
      }
    }, SEARCH_STRING_TIMER);
  }

  function search(searchTerm) {
    lastSearchMillis = new Date().getTime();
    _setSearchTerm(searchTerm);
    if (searchTerm.length == 0) {
      _setSearchResults([]);
      return;
    }
    if (searchTerm.length < 2) return;
    let res = {};
    let keys = Object.keys(INVENTORY_ITEM_PROTO);
    zInventoryArr.forEach((invItem) => {
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

  function handleSearchItemSelected(item) {
    // log(item);
    // return;
    if (!zWorkorderObj) {
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
    if (!zWorkorderObj.isStandaloneSale) dbSetOpenWorkorderItem(wo);
  }

  function handleQuickButtonPress(buttonObj) {
    // log("here");
    let assignmentsArr = buttonObj.assignments;
    if (!assignmentsArr) return;
    let arr = [];
    let notFoundArr = [];
    assignmentsArr.forEach((id) => {
      let item = zInventoryArr.find((o) => o.id === id);
      if (item) {
        arr.push(item);
      } else {
        notFoundArr.push(id);
      }
    });
    // return;
    // log(notFoundArr);
    if (notFoundArr.length > 0) {
      notFoundArr.forEach((id) => {
        let idx = assignmentsArr.findIndex((o) => o === id);
        assignmentsArr[idx] = null;
      });
      let newAssignmentsArr = assignmentsArr.filter((o) => o !== null);
      buttonObj.assignments = newAssignmentsArr;
      let settingsObj = { ...zSettingsObj };
      let idx = settingsObj.quickItemButtonNames.findIndex(
        (o) => o.name === buttonObj.name
      );
      settingsObj[idx] = buttonObj;
      _zSetSettings(settingsObj);
      dbSetSettings(settingsObj);
      // log("settings", settingsObj);
      // log("idx", idx.toString());
    }
    // settingsObj.quickItemButtonNames
    _setSearchResults(arr);
  }

  function clearSearch() {
    _setSearchResults([]);
    _setSearchTerm("");
  }

  //////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////
  // log("refs", randomWordGenerator());
  return (
    <View style={{ width: "100%", height: "95%" }}>
      <View
        style={{
          // width: "100%",
          marginTop: 20,
          flexDirection: "row",
          marginHorizontal: 4,
          // marginTop: 10,
        }}
      >
        <Button
          onPress={() => clearSearch()}
          text={"reset"}
          textStyle={{ color: "darkgray" }}
          buttonStyle={{ height: 35 }}
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
      <View
        style={{
          width: "100%",
          flexDirection: "row",
          paddingTop: 15,
          justifyContent: "flex-start",
        }}
      >
        {/**Quick items buttons vertical list */}
        <FlatList
          style={{
            marginLeft: 5,
            // backgroundColor: "green",
          }}
          data={zSettingsObj.quickItemButtonNames}
          keyExtractor={(item, index) => index.toString()}
          renderItem={(item) => {
            let index = item.index;
            item = item.item;
            // log(item);
            if (!item) return null;
            return (
              <Button
                onPress={() => handleQuickButtonPress(item)}
                buttonStyle={{
                  ...SHADOW_RADIUS_NOTHING,
                  borderBottomWidth: 1,
                  borderColor: "darkgray",
                }}
                text={item.name}
              />
            );
          }}
        />
        <FlatList
          style={{
            marginRight: 25,
            marginLeft: 5,
            width: "70%",
            // backgroundColor: "green",
          }}
          data={sSearchResults}
          keyExtractor={(item, idx) => idx}
          renderItem={(item) => {
            // log("item", item.item);
            item = item.item;
            return (
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  borderBottomWidth: 1,
                  borderColor: Colors.opacityBackgoundDark,
                }}
              >
                <View style={{ width: "75%" }}>
                  <Button
                    onPress={() =>
                      _zExecute(
                        () => handleSearchItemSelected(item),
                        _zSetLoginFunctionCallback,
                        _zSetShowLoginScreen
                      )
                    }
                    numLines={2}
                    text={item.informalName || item.formalName}
                    shadow={false}
                    textStyle={{
                      width: "100%",
                      fontSize: 15,
                    }}
                    buttonStyle={{ width: "100%" }}
                  />
                </View>

                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    width: "15%",
                  }}
                >
                  {/**Information full screen inventory modal */}
                  <ScreenModal
                    buttonLabel={"i"}
                    handleButtonPress={() => {
                      _setModalInventoryObjIdx(
                        zInventoryArr.findIndex((o) => o.id == item.id)
                      );
                      _setModalInventoryObj(item);
                    }}
                    modalStyle={{ width: "40%", alignSelf: "flex-end" }}
                    buttonStyle={{}}
                    showShadow={false}
                    textStyle={{ fontSize: 14 }}
                    showOuterModal={true}
                    modalVisible={sModalInventoryObj === item}
                    outerModalStyle={{
                      backgroundColor: "rgba(50,50,50,.5)",
                    }}
                    handleOuterClick={() => _setModalInventoryObj(null)}
                    Component={() => (
                      <InventoryItemScreeenModalComponent
                        handleClosePress={() => _setModalInventoryObj(null)}
                        itemIdx={sModalInventoryObjIdx}
                      />
                    )}
                  />
                </View>
              </View>
            );
          }}
        />
      </View>
    </View>
  );
}

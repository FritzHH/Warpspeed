/*eslint-disable*/
import React, { useEffect, useRef, useState } from "react";
import { View, FlatList, TextInput, Text } from "react-native-web";
import {
  WORKORDER_ITEM_PROTO,
  INVENTORY_ITEM_PROTO,
  WORKORDER_PROTO,
  SETTINGS_OBJ,
  TAB_NAMES,
} from "../../../data";
import {
  APP_BASE_COLORS,
  COLOR_GRADIENTS,
  Colors,
  ICONS,
} from "../../../styles";

import {
  dim,
  generateRandomID,
  log,
  randomWordGenerator,
} from "../../../utils";
import {
  AlertBox,
  Button,
  Button_,
  InventoryItemScreeenModalComponent,
  ScreenModal,
  SHADOW_RADIUS_NOTHING,
  TabMenuButton,
  TabMenuDivider,
} from "../../../components";
import { cloneDeep } from "lodash";
import {
  useSettingsStore,
  useOpenWorkordersStore,
  useInventoryStore,
  useLoginStore,
  useTabNamesStore,
} from "../../../stores";
import {
  dbSetOpenWorkorderItem,
  dbSetSettings,
} from "../../../db_call_wrapper";

const SEARCH_STRING_TIMER = 45 * 1000;

export function QuickItemComponent({ __screenHeight }) {
  // store setters ///////////////////////////////////////////////////////////////
  const _zSetWorkorderObj = useOpenWorkordersStore(
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
  const _zSetOptionsTabName = useTabNamesStore(
    (state) => state.setOptionsTabName
  );

  // store getters //////////////////////////////////////////////////////////////
  let zWorkorderObj = WORKORDER_PROTO;
  let zSettingsObj = SETTINGS_OBJ;
  zSettingsObj = useSettingsStore((state) => state.getSettingsObj());
  zWorkorderObj = useOpenWorkordersStore((state) => state.getWorkorderObj());
  const zInventoryArr = useInventoryStore((state) => state.getInventoryArr());
  const zOptionsTabName = useTabNamesStore((state) =>
    state.getOptionsTabName()
  );

  ///////////////////////////////////////////////////////////////////////
  const [sSearchTerm, _setSearchTerm] = React.useState("");
  const [sSearchResults, _setSearchResults] = React.useState([]);
  const [sModalInventoryObj, _setModalInventoryObj] = React.useState(null);
  const [sModalInventoryObjIdx, _setModalInventoryObjIdx] = useState(null);
  const [sNewItemObj, _setNewItemObject] = useState(null);
  const [sLineItemBackgroundColor, _setLineItemBackgroundColor] =
    useState("transparent");

  useEffect(() => {
    let arr = [];
    if (sSearchResults.length > 20) return;
    for (let i = 0; i <= 10; i++) {
      // log(zInventoryArr[i]);
      if (zInventoryArr[i]) arr.push(zInventoryArr[i]);
    }
    _setSearchResults(arr);
  }, [zInventoryArr]);
  ///////////////////////////////////////////////////////////////////////////
  ///////////////////////////////////////////////////////////////////////////

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
    _zSetWorkorderObj(wo, !zWorkorderObj.isStandaloneSale);
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

  function inventoryItemSelected(item, buttonName) {
    let idx = zInventoryArr.findIndex((o) => o.id == item.id);

    // return;
    if (!zWorkorderObj?.id || buttonName == "info") {
      _setModalInventoryObjIdx(idx);
      // _setModalInventoryObjIdx(null);
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
  }

  function clearSearch() {
    _setSearchResults([]);
    _setSearchTerm("");
  }

  //////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////
  // log("refs", randomWordGenerator());
  // log("h", __screenHeight);
  // log(Math.round(__screenHeight * 0.03) + Math.round(__screenHeight * 0.97));
  let height1 = Math.round(__screenHeight * 0.03);
  let height2 = Math.round(__screenHeight * 0.97);

  return (
    <View
      style={{
        // width: "100%",
        // backgroundColor: "blue",
        // height: __screenHeight,
        flex: 1,
      }}
    >
      <View
        style={{
          width: "100%",
          height: "5%",
          // marginTop: 20,
          flexDirection: "row",
          paddingHorizontal: 4,
          alignItems: "center",
        }}
      >
        <Button_
          icon={ICONS.reset1}
          iconSize={30}
          onPress={() => clearSearch()}
          useColorGradient={false}
          // colorGradientArr={null}
          // text={"reset"}
          // textStyle={{ color: "darkgray", fontSize: 14 }}
          // buttonStyle={{ height: 30 }}
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
          placeholder="Search inventory"
          placeholderTextColor={"darkgray"}
          value={sSearchTerm}
          onChangeText={(val) => search(val)}
        />
        <Button_
          icon={ICONS.new}
          iconSize={35}
          useColorGradient={false}
          // buttonStyle={{ width: null }}
          // text={"+"}
          onPress={() => {
            _setModalInventoryObjIdx(-1);
            _setNewItemObject(cloneDeep(INVENTORY_ITEM_PROTO));
          }}
        />
      </View>
      <View
        style={{
          width: "100%",
          flexDirection: "row",
          paddingTop: 10,
          justifyContent: "flex-start",
          height: "95%",
          // backgroundColor: "green",
        }}
      >
        {/**Quick items buttons vertical list */}
        <View
          style={{
            justifyContent: "flex-start",
            // backgroundColor: "red",
            width: "20%",
            // borderRightWidth: 1,
            // borderColor: "gray",
            paddingHorizontal: 2,
            // marginBottom: 30,
            // paddingBottom: 20,
            // height: "50%",
            // maxHeight: "100%",
          }}
        >
          {zSettingsObj?.quickItemButtonNames?.map((item) => (
            <Button_
              onPress={() => handleQuickButtonPress(item)}
              colorGradientArr={COLOR_GRADIENTS.purple}
              buttonStyle={{
                ...SHADOW_RADIUS_NOTHING,
                borderWidth: 1,
                borderRadius: 5,
                borderColor: APP_BASE_COLORS.buttonLightGreen,
                borderColor: APP_BASE_COLORS.buttonLightGreenOutline,
                marginBottom: 10,
                // paddingHorizontal: 3,
                // height: 100,
                // marginVertical: 30,
              }}
              textStyle={{ fontSize: 14, fontWeight: 400 }}
              text={item.name.toUpperCase()}
            />
          ))}
        </View>

        <View
          style={{
            height: "100%",
            width: "80%",
            paddingTop: 10,
            paddingLeft: 3,
            paddingRight: 3,
            // backgroundColor: "green",
          }}
        >
          <FlatList
            style={{
              width: "100%",
              height: "100%",
              // backgroundColor: "green",
            }}
            data={[...sSearchResults]}
            ItemSeparatorComponent={() => (
              <View
                style={{
                  width: "100%",
                  backgroundColor: "gray",
                  height: 1,
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
                    // height: "100%",
                    justifyContent: "flex-start",
                    alignItems: "center",
                  }}
                >
                  <Button
                    onPress={() => inventoryItemSelected(item)}
                    shadow={false}
                    // mouseOverOptions={{ opacity: 1 }}
                    buttonStyle={{
                      backgroundColor: "transparent",
                      paddingLeft: 0,
                      paddingRight: 4,
                      // backgroundColor: "blue",
                    }}
                    viewStyle={{ width: "100%" }}
                    TextComponent={() => (
                      <View
                        style={{
                          width: "100%",
                          flexDirection: "row",
                          // backgroundColor: "blue",
                          justifyContent: "space-between",
                          alignItems: "center",
                          // justifyContent: "flex-start",
                        }}
                      >
                        <Text
                          style={{
                            width: "100%",
                            fontSize: 14,
                            paddingLeft: 7,
                            // backgroundColor: "blue",
                            // textAlign: "left",
                          }}
                        >
                          {item.informalName || item.formalName}
                          {item.informalName ? (
                            <Text style={{ fontSize: 12, color: "gray" }}>
                              {"\n" + item.formalName}
                            </Text>
                          ) : null}
                        </Text>
                        {!zWorkorderObj?.id ? (
                          <Button
                            mouseOverOptions={{ highlightColor: "red" }}
                            buttonStyle={{
                              backgroundColor: "transparent",
                              // paddingLeft: 0,
                              paddingHorizontal: 8,
                              // width: "8%",
                            }}
                            text={"i"}
                            onPress={() => {
                              _setLineItemBackgroundColor("transparent");
                              inventoryItemSelected(item, "info");
                            }}
                          />
                        ) : null}
                        <View
                          style={{
                            // borderLeftWidth: 1,
                            // borderColor: "gray",
                            paddingLeft: 0,
                            width: "12%",
                            alignItems: "flex-end",
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 10,
                              color: "dimgray",
                              // width: "100%",
                            }}
                          >
                            {"$ "}
                            <Text style={{ fontSize: 14, color: null }}>
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
    </View>
  );
}

// <View
//   style={{
//     flexDirection: "row",
//     justifyContent: "space-between",
//     borderBottomWidth: 1,
//     borderColor: Colors.opacityBackgoundDark,
//   }}
// >
//   <View style={{ width: "75%" }}>
//     <Button
//       onPress={() =>
//         _zExecute(
//           () => handleSearchItemSelected(item),
//           _zSetLoginFunctionCallback,
//           _zSetShowLoginScreen
//         )
//       }
//       numLines={2}
//       text={item.informalName || item.formalName}
//       shadow={false}
//       textStyle={{
//         width: "100%",
//         fontSize: 15,
//       }}
//       buttonStyle={{ width: "100%" }}
//     />
//   </View>

//   <View
//     style={{
//       flexDirection: "row",
//       justifyContent: "space-between",
//       alignItems: "center",
//       width: "15%",
//     }}
//   >
//     {/**Information full screen inventory modal */}
//     <ScreenModal
//       buttonLabel={"i"}
//       handleButtonPress={() => {
//         _setModalInventoryObjIdx(
//           zInventoryArr.findIndex((o) => o.id == item.id)
//         );
//         _setModalInventoryObj(item);
//       }}
//       modalStyle={{ width: "40%", alignSelf: "flex-end" }}
//       buttonStyle={{}}
//       showShadow={false}
//       textStyle={{ fontSize: 14 }}
//       showOuterModal={true}
//       modalVisible={sModalInventoryObj === item}
//       outerModalStyle={{
//         backgroundColor: "rgba(50,50,50,.5)",
//       }}
//       handleOuterClick={() => _setModalInventoryObj(null)}
//       Component={() => (
//         <InventoryItemScreeenModalComponent
//           handleClosePress={() => _setModalInventoryObj(null)}
//           itemIdx={sModalInventoryObjIdx}
//         />
//       )}
//     />
//   </View>
// </View>

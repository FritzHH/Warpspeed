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
import { C, COLOR_GRADIENTS, Colors, ICONS } from "../../../styles";

import {
  dim,
  generateUPCBarcode,
  generateRandomID,
  log,
  randomWordGenerator,
} from "../../../utils";
import {
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
} from "../../../storesOld";
import { dbSetSettings } from "../../../db_call_wrapper";

const SEARCH_STRING_TIMER = 45 * 1000;

export function QuickItemComponent({}) {
  // store setters ///////////////////////////////////////////////////////////////
  const _zSetWorkorderObj = useOpenWorkordersStore(
    (state) => state.setWorkorder
  );
  const _zSetSettings = useSettingsStore((state) => state.setSettingsObj);

  // store getters //////////////////////////////////////////////////////////////
  let zWorkorderObj = WORKORDER_PROTO;
  let zSettingsObj = SETTINGS_OBJ;
  zSettingsObj = useSettingsStore((state) => state.getSettingsObj());
  zWorkorderObj = useOpenWorkordersStore((state) =>
    state.getOpenWorkorderObj()
  );
  const zInventoryArr = useInventoryStore((state) => state.getInventoryArr());

  ///////////////////////////////////////////////////////////////////////
  const [sSearchTerm, _setSearchTerm] = React.useState("");
  const [sSearchResults, _setSearchResults] = React.useState([]);
  const [sModalInventoryObjIdx, _setModalInventoryObjIdx] = useState(null);

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

  // to do make sure that deleting an inventory item or button alse removes it from the settings button lists
  function handleQuickButtonPress(buttonObj) {
    let inventoryItemsForButton = [];
    buttonObj.items?.forEach((invItemID) => {
      let invItem = zInventoryArr.find((item) => item.id === invItem);
      if (invItem) inventoryItemsForButton.push(invItem);
    });
    let subMenuButtonsForButton = [];
    buttonObj.buttons?.forEach((buttonID) => {
      // let buttonObj = zSettingsObj.quickItemButtons.find(btn => btn.id ===)
    });
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
    lineItem.inventoryItem = item;
    lineItem.id = generateUPCBarcode();
    wo.workorderLines.push(lineItem);
    _zSetWorkorderObj(wo);
  }

  function clearSearch() {
    _setSearchResults([]);
    _setSearchTerm("");
  }

  //////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////
  return (
    <View
      style={{
        // width: "100%",
        // backgroundColor: "blue",
        paddingRight: 3,
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
          justifyContent: "space-between",
        }}
      >
        <Button_
          icon={ICONS.reset1}
          iconSize={30}
          onPress={() => clearSearch()}
          useColorGradient={false}
        />
        <TextInput
          style={{
            borderBottomWidth: 1,
            borderBottomColor: sSearchTerm.length > 0 ? "dimgray" : "darkgray",
            fontSize: 20,
            color: Colors.darkTextOnMainBackground,
            outlineWidth: 0,
            width: "80%",
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
            width: "20%",
            paddingHorizontal: 2,
          }}
        >
          {zSettingsObj?.quickItemButtons?.map((item) => (
            <Button_
              key={item.id}
              onPress={() => handleQuickButtonPress(item)}
              colorGradientArr={COLOR_GRADIENTS.lightBlue}
              buttonStyle={{
                ...SHADOW_RADIUS_NOTHING,
                borderWidth: 1,
                borderRadius: 5,
                borderColor: C.buttonLightGreen,
                borderColor: C.buttonLightGreenOutline,
                marginBottom: 10,
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
            renderItem={(item) => {
              // if (!item.item) return null;
              let idx = item.index;
              item = item.item;
              // log("item", item);
              return (
                <View
                  style={{
                    marginBottom: 2,
                    borderRadius: 7,
                    borderLeftWidth: 4,
                    borderLeftColor: C.buttonLightGreenOutline,
                    backgroundColor: C.listItemWhite,
                    flexDirection: "row",
                    width: "100%",
                    // height: "100%",
                    justifyContent: "flex-start",
                    alignItems: "center",
                  }}
                >
                  <Button_
                    onPress={() => inventoryItemSelected(item)}
                    shadow={false}
                    // mouseOverOptions={{ opacity: 1 }}
                    buttonStyle={{
                      backgroundColor: "transparent",
                      width: "100%",
                      height: "100%",
                      borderRadius: 7,
                      // paddingLeft: 0,
                      // paddingRight: 4,
                      // backgroundColor: "green",
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
                            width: "85%",
                            fontSize: 14,
                            paddingLeft: 7,
                            paddingRight: 5,
                            // backgroundColor: "blue",
                            // textAlign: "left",
                          }}
                        >
                          {item.informalName || item.formalName}
                          {!!item.informalName && (
                            <Text style={{ fontSize: 12, color: "gray" }}>
                              {"\n" + item.formalName}
                            </Text>
                          )}
                        </Text>
                        {!!zWorkorderObj?.id && (
                          <Button_
                            icon={ICONS.infoGear}
                            iconSize={22}
                            buttonStyle={{}}
                            onPress={() => {
                              _setLineItemBackgroundColor("transparent");
                              inventoryItemSelected(item, "info");
                            }}
                          />
                        )}
                        <View
                          style={{
                            // borderLeftWidth: 1,
                            borderWidth: 1,
                            borderColor: C.buttonLightGreenOutline,
                            paddingLeft: 4,
                            paddingRight: 4,
                            width: "15%",
                            height: "100%",
                            alignItems: "flex-end",
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                            borderRadius: 7,
                            // backgroundColor: APP_BASE_COLORS.buttonLightGreen,
                          }}
                        >
                          <Text
                            style={{
                              textAlign: "right",
                              fontSize: 10,
                              color: "dimgray",
                            }}
                          >
                            {"$ "}
                          </Text>

                          <Text
                            style={{
                              paddingVertical: 5,

                              fontSize: 14,
                              color: null,
                            }}
                          >
                            {item.price}
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

function QuickButtonViewComponent({ buttonArr }) {
  let invItems = buttonArr.inventoryItems;
  let subMenuButtons = buttonArr.subMenuButtons;
}

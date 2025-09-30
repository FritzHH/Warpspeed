/*eslint-disable*/
import React, { use, useEffect, useRef, useState } from "react";
import { View, FlatList, TextInput, Text } from "react-native-web";
import { WORKORDER_ITEM_PROTO, INVENTORY_ITEM_PROTO } from "../../../data";
import { C, COLOR_GRADIENTS, Colors, ICONS } from "../../../styles";

import { formatCurrencyDisp, generateUPCBarcode, log } from "../../../utils";
import {
  Button,
  Button_,
  InventoryItemScreeenModalComponent,
  ScreenModal,
  TouchableOpacity_,
} from "../../../components";
import { cloneDeep } from "lodash";
import {
  useSettingsStore,
  useOpenWorkordersStore,
  useInventoryStore,
} from "../../../stores";

export function InventoryComponent({}) {
  // store setters ///////////////////////////////////////////////////////////////

  // store getters //////////////////////////////////////////////////////////////
  const zQuickItemButtons = useSettingsStore(
    (state) => state.settings?.quickItemButtons
  );
  const zOpenWorkorderID = useOpenWorkordersStore(
    (state) => state.openWorkorderID
  );
  const zInventoryArr = useInventoryStore((state) => state.inventoryArr);

  // Check if all required data is loaded
  const isDataLoaded = zQuickItemButtons && zInventoryArr?.length > 0;

  ///////////////////////////////////////////////////////////////////////
  const [sSearchTerm, _setSearchTerm] = React.useState("");
  const [sSearchResults, _setSearchResults] = React.useState([]);
  const [sModalInventoryObjIdx, _setModalInventoryObjIdx] = useState(null);

  // Solution B: Delayed subscription to batch store updates
  const [isReady, setIsReady] = useState(false);

  // Timeout to batch all store updates and reduce re-renders
  useEffect(() => {
    const timer = setTimeout(() => setIsReady(true), 50);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let arr = [];
    if (sSearchResults.length > 20) return;
    for (let i = 0; i <= 10; i++) {
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

  function inventoryItemSelected(item) {
    let workorderLines = useOpenWorkordersStore
      .getState()
      .getOpenWorkorder().workorderLines;
    if (!workorderLines) workorderLines = [];
    let lineItem = cloneDeep(WORKORDER_ITEM_PROTO);
    lineItem.inventoryItem = item;
    lineItem.id = generateUPCBarcode();
    workorderLines.push(lineItem);
    useOpenWorkordersStore
      .getState()
      .setField("workorderLines", workorderLines);
  }

  function handleInventoryInfoPress(item) {
    _setModalInventoryObjIdx(idx);
  }

  function clearSearch() {
    _setSearchResults([]);
    _setSearchTerm("");
  }

  //////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////

  // Show loading state until all data is ready and component is ready
  if (!isDataLoaded || !isReady) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: C.listItemWhite,
        }}
      >
        <Text style={{ fontSize: 16, color: C.text, textAlign: "center" }}>
          {/* Loading Quick Items... */}
        </Text>
      </View>
    );
  }
  return (
    <View
      style={{
        paddingRight: 3,
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
          {zQuickItemButtons?.map((item) => (
            <Button_
              key={item.id}
              onPress={() => handleQuickButtonPress(item)}
              colorGradientArr={COLOR_GRADIENTS.blue}
              buttonStyle={{
                // ...SHADOW_RADIUS_NOTHING,
                borderWidth: 1,
                borderRadius: 5,
                borderColor: C.buttonLightGreen,
                borderColor: C.buttonLightGreenOutline,
                marginBottom: 10,
              }}
              textStyle={{ fontSize: 14, fontWeight: 400, color: C.textWhite }}
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
                    borderLeftWidth: 3,
                    borderLeftColor: C.buttonLightGreenOutline,
                    backgroundColor: C.listItemWhite,
                    flexDirection: "row",
                    alignItems: "center",
                  }}
                >
                  {!!zOpenWorkorderID && (
                    <View style={{ width: "5%" }}>
                      <Button_
                        icon={ICONS.info}
                        iconSize={15}
                        buttonStyle={{ width: 30 }}
                        onPress={() => {
                          handleInventoryInfoPress(item);
                        }}
                      />
                    </View>
                  )}
                  <TouchableOpacity_
                    style={{
                      width: zOpenWorkorderID ? "95%" : "100%",
                    }}
                    onPress={() => inventoryItemSelected(item)}
                  >
                    <View
                      style={{
                        width: "100%",
                        flexDirection: "row",
                      }}
                    >
                      <Text
                        style={{
                          width: "85%",
                          fontSize: 14,
                          paddingLeft: 7,
                          paddingRight: 5,
                        }}
                      >
                        {item.formalName}
                        {!!item.informalName && (
                          <Text style={{ fontSize: 12, color: "gray" }}>
                            {"\n" + item.informalName}
                          </Text>
                        )}
                      </Text>

                      <View
                        style={{
                          borderColor: C.buttonLightGreenOutline,
                          width: "15%",
                          height: "100%",
                          alignItems: "flex-end",
                          justifyContent: "center",
                          borderRadius: 7,
                        }}
                      >
                        <Text
                          style={{
                            textAlign: "right",
                            fontSize: 10,
                            color: C.text,
                          }}
                        >
                          {"$ "}
                          <Text
                            style={{
                              textAlignVertical: "top",
                              fontSize: 14,
                              color: C.text,
                            }}
                          >
                            {formatCurrencyDisp(item.price)}
                          </Text>
                        </Text>
                        <Text
                          style={{
                            textAlign: "right",
                            fontSize: 10,
                            color: C.red,
                          }}
                        >
                          {"$ "}
                          <Text
                            style={{
                              textAlignVertical: "top",
                              fontSize: 12,
                              color: C.red,
                            }}
                          >
                            {formatCurrencyDisp(934893)}
                          </Text>
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity_>
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

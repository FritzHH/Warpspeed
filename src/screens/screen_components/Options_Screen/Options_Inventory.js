/*eslint-disable*/
import React, { use, useEffect, useState } from "react";
import { View, FlatList, TextInput, Text } from "react-native-web";
import { WORKORDER_ITEM_PROTO, INVENTORY_ITEM_PROTO } from "../../../data";
import { C, COLOR_GRADIENTS, Colors, ICONS } from "../../../styles";

import {
  formatCurrencyDisp,
  generateUPCBarcode,
  gray,
  lightenRGBByPercent,
  log,
} from "../../../utils";
import {
  Button,
  Button_,
  ScreenModal,
  TouchableOpacity_,
  TextInput_,
} from "../../../components";
import { InventoryItemModalScreen } from "../modal_screens/InventoryItemModalScreen";
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
  const [sModalItem, _setModalItem] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [sCurrentParentID, _setCurrentParentID] = useState(null);
  const [sMenuPath, _setMenuPath] = useState([]);

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

  // Search function (now called by debounced TextInput_)
  const handleSearch = (searchTerm) => {
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
    _setSearchResults(res);
  };

  function handleQuickButtonPress(buttonObj) {
    let children = zQuickItemButtons.filter(
      (b) => b.parentID === buttonObj.id
    );
    if (children.length > 0) {
      _setMenuPath((prev) => [
        ...prev,
        { id: buttonObj.id, name: buttonObj.name },
      ]);
      _setCurrentParentID(buttonObj.id);
    }
    let items = [];
    buttonObj.items?.forEach((id) => {
      let item = zInventoryArr.find((i) => i.id === id);
      if (item) items.push(item);
    });
    _setSearchResults(items);
    _setSearchTerm("");
  }

  function handleBackPress() {
    let path = [...sMenuPath];
    path.pop();
    let newParentID = path.length > 0 ? path[path.length - 1].id : null;
    _setMenuPath(path);
    _setCurrentParentID(newParentID);
    if (newParentID) {
      let parentButton = zQuickItemButtons.find((b) => b.id === newParentID);
      let items = [];
      parentButton?.items?.forEach((id) => {
        let item = zInventoryArr.find((i) => i.id === id);
        if (item) items.push(item);
      });
      _setSearchResults(items);
    } else {
      _setSearchResults([]);
    }
    _setSearchTerm("");
  }

  function inventoryItemSelected(item) {
    const openWorkorder = useOpenWorkordersStore.getState().getOpenWorkorder();
    if (!openWorkorder) {
      _setModalItem(item);
      return;
    }
    let workorderLines = openWorkorder.workorderLines;
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
    _setModalItem(item);
  }

  function clearSearch() {
    _setSearchResults([]);
    _setSearchTerm("");
    _setCurrentParentID(null);
    _setMenuPath([]);
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
          flexDirection: "row",
          paddingHorizontal: 4,
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Button_
          icon={ICONS.reset1}
          iconSize={20}
          onPress={() => clearSearch()}
          useColorGradient={false}
        />
        <TextInput_
          style={{
            borderBottomWidth: 1,
            borderBottomColor: gray(0.2),
            fontSize: 18,
            color: C.text,
            outlineWidth: 0,
            width: "80%",
            marginLeft: 20,
            marginRight: 30,
          }}
          placeholder="Search inventory"
          placeholderTextColor={gray(0.2)}
          value={sSearchTerm}
          onChangeText={(val) => handleSearch(val)}
        />
        <Button_
          icon={ICONS.new}
          iconSize={25}
          useColorGradient={false}
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
          {sCurrentParentID !== null && (
            <Button_
              onPress={handleBackPress}
              buttonStyle={{
                borderWidth: 1,
                borderRadius: 5,
                borderColor: C.buttonLightGreenOutline,
                marginBottom: 10,
              }}
              textStyle={{ fontSize: 13, fontWeight: 400, color: C.text }}
              text={
                "\u25C0  " +
                (sMenuPath.length > 0
                  ? sMenuPath[sMenuPath.length - 1].name
                  : "Back")
              }
            />
          )}
          {zQuickItemButtons
            ?.filter((b) =>
              sCurrentParentID === null
                ? !b.parentID
                : b.parentID === sCurrentParentID
            )
            .map((item) => (
              <Button_
                key={item.id}
                onPress={() => handleQuickButtonPress(item)}
                colorGradientArr={COLOR_GRADIENTS.blue}
                buttonStyle={{
                  borderWidth: 1,
                  borderRadius: 5,
                  borderColor: C.buttonLightGreenOutline,
                  marginBottom: 10,
                }}
                textStyle={{
                  fontSize: 14,
                  fontWeight: 400,
                  color: C.textWhite,
                }}
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
            }}
            data={[...sSearchResults]}
            renderItem={(item) => {
              item = item.item;
              return (
                <View
                  style={{
                    borderRadius: 7,
                    borderLeftColor: C.buttonLightGreenOutline,
                    borderWidth: 1,
                    borderLeftWidth: 2,
                    borderColor: C.listItemBorder,
                    flexDirection: "row",
                    alignItems: "center",
                    height: "100%",
                    backgroundColor: C.backgroundListWhite,
                    paddingRight: 3,
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
                      height: "100%",
                      width: zOpenWorkorderID ? "95%" : "100%",
                    }}
                    onPress={() => inventoryItemSelected(item)}
                  >
                    <View
                      style={{
                        width: "100%",
                        flexDirection: "row",
                        height: "100%",
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
                          width: "15%",
                          height: "100%",
                          alignItems: "flex-end",
                          justifyContent: "center",
                          borderColor: "gray",
                          borderLeftWidth: 1,
                          borderColor: C.listItemBorder,
                          paddingRight: 5,
                          backgroundColor: C.backgroundListWhite,
                        }}
                      >
                        <Text
                          style={{
                            textAlign: "right",
                            fontSize: 10,
                            color: gray(0.4),
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
                        {!!item.salePrice && (
                          <Text
                            style={{
                              textAlign: "right",
                              fontSize: 10,
                              color: lightenRGBByPercent(C.red, 60),
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
                              {/* {formatCurrencyDisp(item.salePrice)} */}
                            </Text>
                          </Text>
                        )}
                      </View>
                    </View>
                  </TouchableOpacity_>
                </View>
              );
            }}
          />
        </View>
        {sModalItem && (
          <InventoryItemModalScreen
            item={sModalItem}
            handleExit={() => _setModalItem(null)}
          />
        )}
      </View>
    </View>
  );
}

import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableWithoutFeedback,
  TouchableOpacity,
  TextInput,
} from "react-native-web";
import {
  bike_colors_arr_db,
  COLLECTION_NAMES,
  system_users_db,
  CUSTOMER_PROTO,
  INFO_COMPONENT_NAMES,
  TAB_NAMES,
  WORKORDER_PROTO,
  WORKORDER_ITEM_PROTO,
  QUICK_BUTTON_NAMES,
  INVENTORY_ITEM_PROTO,
  ADJUSTABLE_BUTTON_SIZE_OPTIONS_ARR,
  DEFAULT_USER_PREFERENCES,
} from "../../data";
import { Colors, ViewStyles } from "../../styles";

import { dim, log } from "../../utils";
import {
  AlertBox,
  Button,
  InventoryItemInModal,
  ScreenModal,
  SHADOW_RADIUS_PROTO,
} from "../../components";
import { cloneDeep } from "lodash";
import { Items_WorkorderItemsTab } from "./Items_WorkorderItems";

let firstPass = false;
const SEARCH_STRING_TIMER = 45 * 1000;

export function QuickItemComponent({
  ssWorkorderObj = WORKORDER_PROTO,
  ssAdjustableUserPreferences = DEFAULT_USER_PREFERENCES,
  ssInventoryArr,
  __setWorkorderObj,
}) {
  ///////////////////////////////////////////////////////////////////////
  const [sSearchTerm, _setSearchTerm] = React.useState("");
  const [sSearchResults, _setSearchResults] = React.useState([]);
  const [sButtonSearchResults, _setButtonSearchResults] = React.useState({
    name: null,
    arr: [],
  });
  const [sInitDone, _setInitDone] = React.useState(false);
  const [sQuickItemsButtonArr, _setQuickItemsButtonArr] =
    React.useState(QUICK_BUTTON_NAMES);
  const [sQuickButtonContentsArr, setstateQuickButtonContentsArr] =
    React.useState([]);

  const [sRefs, _setRefs] = useState([]);
  // internal vars
  let lastSearchMillis = new Date().getTime();
  // const refs = useRef([]);

  useEffect(() => {
    _setRefs((sRefs) =>
      Array(sQuickItemsButtonArr.length)
        .fill()
        .map((_, i) => sRefs[i] || React.createRef())
    );
  }, [sQuickItemsButtonArr.length]);

  ///////////////////////////
  // functions
  //////////////////////////
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

  function init() {
    if (!sInitDone) {
      search("br");
      _setInitDone(true);
      // setSearchTimer();
    }
  }
  // init();

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

  function quickItemSelected(item) {
    // log(workorderOb);
    let newItem = { ...WORKORDER_ITEM_PROTO };
    // log("original", WORKORDER_ITEM_PROTO);
    // log("first workorder", ssWorkorderObj.items);
    Object.keys(WORKORDER_ITEM_PROTO).forEach((itemKey) => {
      if (Object.hasOwn(item, itemKey)) newItem[itemKey] = item[itemKey];
    });
    // log("new item", newItem);
    let work = JSON.parse(JSON.stringify(ssWorkorderObj));
    work.items.push(newItem);
    // log("second workorder", work.items);
    __setWorkorderObj(work);
  }

  function clearSearch() {
    _setSearchResults([]);
    _setSearchTerm("");
  }
  // log("here", ssInventoryArr);
  //////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////
  // log("refs", refs);
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
          textStyle={{ color: "lightgray" }}
          buttonStyle={{ height: 35 }}
        />
        <TextInput
          style={{
            borderBottomWidth: 1,
            borderBottomColor: "darkgray",
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
        <FlatList
          style={{
            marginLeft: 5,
          }}
          data={sQuickItemsButtonArr}
          keyExtractor={(item, index) => index.toString()}
          renderItem={(item) => {
            let index = item.index;
            item = item.item;
            return (
              <ScreenModal
                ref={sRefs[index]}
                modalVisible={
                  item.name === sButtonSearchResults.name &&
                  sButtonSearchResults.arr.length > 0
                }
                setModalVisibility={(val) => {
                  if (
                    item.name === sButtonSearchResults.name &&
                    sButtonSearchResults.arr.length > 0
                  ) {
                    _setButtonSearchResults({
                      name: null,
                      arr: [],
                    });
                  }
                }}
                modalCoordinateVars={{ x: 160, y: 0 }}
                showOuterModal={false}
                buttonStyle={{ paddingVertical: 5, marginVertical: 5 }}
                outerModalStyle={{}}
                buttonLabel={item.name}
                showButtonIcon={false}
                handleButtonPress={() => {
                  let arr = [];
                  ssInventoryArr.forEach((invItem) => {
                    if (invItem.id == item.id) arr.push(invItem);
                  });
                  // log("arr", arr);
                  _setButtonSearchResults({ name: item.name, arr });
                }}
                Component={() => {
                  return (
                    <View>
                      <FlatList
                        data={sButtonSearchResults.arr}
                        keyExtractor={(k, i) => i}
                        renderItem={(item) => {
                          let index = item.index;
                          item = item.item;
                          // log("item", item);
                          return (
                            // <View>{"TEZXT"}</View>
                            <Button
                              text={item.name}
                              textStyle={{
                                ...ssAdjustableUserPreferences
                                  .optionsTabButtonSizes.text,
                              }}
                              buttonStyle={{
                                marginVertical: 4,
                                ...ssAdjustableUserPreferences
                                  .optionsTabButtonSizes.view,
                              }}
                            />
                          );
                        }}
                      />
                    </View>
                  );
                }}
              />
            );
          }}
        />
        {/* search results list */}
        <FlatList
          style={{
            marginRight: 25,
            width: "70%",
            // backgroundColor: "green",
          }}
          data={sSearchResults}
          keyExtractor={(item) => item.id}
          renderItem={(item) => {
            item = item.item;
            // log(item.item);
            return (
              <TouchableOpacity onPress={() => quickItemSelected(item)}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    borderBottomWidth: 1,
                    borderColor: Colors.opacityBackgoundDark,
                  }}
                >
                  <Text
                    style={{
                      color: "whitesmoke",
                      fontSize: 15,
                      paddingVertical: 4,
                    }}
                    numberOfLines={2}
                  >
                    {item.name}
                  </Text>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      width: "15%",
                    }}
                  >
                    <ScreenModal
                      buttonLabel={"i"}
                      modalStyle={{ width: "40%", alignSelf: "flex-end" }}
                      Component={() => <InventoryItemInModal item={item} />}
                      buttonStyle={{}}
                      textStyle={{ fontSize: 14 }}
                    />
                    <Text
                      style={{
                        fontSize: 13,
                      }}
                    >
                      {"$ "}
                      <Text style={{ fontSize: 16 }}>{item.price}</Text>
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      </View>
    </View>
  );
}

const QuickItemButton = ({ title, onPress, color }) => {
  return (
    <TouchableOpacity
      style={{
        // minWidth: 50,
        // maxWidth: 150,
        width: 120,
        marginVertical: 4,
        justifyContent: "center",
        borderWidth: 0,
        alignItems: "center",
        marginLeft: 7,
        // borderColor: Colors.mainBackground,
        ...SHADOW_RADIUS_PROTO,
      }}
      onPress={onPress}
    >
      <Text
        numberOfLines={2}
        style={{
          textAlign: "center",
          color: "whitesmoke",
          width: "100%",
          paddingVertical: 11,
          paddingHorizontal: 2,
          fontSize: 15,
        }}
      >
        {title}
      </Text>
    </TouchableOpacity>
  );
};

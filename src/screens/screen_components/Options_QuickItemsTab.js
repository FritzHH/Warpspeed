import React from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  FlatList,
  TouchableOpacity,
} from "react-native-web";
import { dim, log, trimToTwoDecimals } from "../../utils";
import {
  HorzSpacer,
  TabMenuButton,
  TabMenuDivider as Divider,
  ModalDropdown,
  TextInputOnMainBackground,
  TextInputLabelOnMainBackground,
  shadow_radius,
  InventoryItemInModal,
  ScreenModal,
} from "../../components";
import { Colors } from "../../styles";
import {
  BIKE_COLORS,
  BRANDS,
  CUSTOMER,
  BIKE_DESCRIPTIONS,
  DISCOUNTS,
  INVENTORY_ITEM,
  PART_SOURCES,
  QUICK_BUTTON_NAMES,
  test_inventory,
  WORKORDER,
  WORKORDER_ITEM,
} from "../../data";
import { useActionData } from "react-router-dom";

let firstPass = false;
const SEARCH_STRING_TIMER = 45 * 1000;

export function QuickItemsTab({
  ssWorkorderObj = WORKORDER,
  __setWorkorderObj,
}) {
  const intervalRef = React.useRef(null);
  const [sSearchTerm, _setSearchTerm] = React.useState("");
  const [sSearchResults, _setSearchResults] = React.useState([]);
  const [sInventory, _setInventory] = React.useState(test_inventory);
  const [sInitDone, _setInitDone] = React.useState(false);
  const [sQuickItemsButtonArr, _setQuickItemsButtonArr] =
    React.useState(QUICK_BUTTON_NAMES);
  const [sQuickButtonContentsArr, setstateQuickButtonContentsArr] =
    React.useState([]);

  let lastSearchMillis = new Date().getTime();
  let quickItemButtonHit = true;

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
  init();

  function search(searchTerm) {
    lastSearchMillis = new Date().getTime();
    _setSearchTerm(searchTerm);
    quickItemButtonHit = false;
    if (searchTerm.length == 0) {
      _setSearchResults([]);
      return;
    }
    if (searchTerm.length < 2) return;
    let res = {};
    let keys = Object.keys(INVENTORY_ITEM);
    sInventory.forEach((invItem) => {
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
    let newItem = { ...WORKORDER_ITEM };
    log("original", WORKORDER_ITEM);
    log("first workorder", ssWorkorderObj.items);
    Object.keys(WORKORDER_ITEM).forEach((itemKey) => {
      if (Object.hasOwn(item, itemKey)) newItem[itemKey] = item[itemKey];
    });
    log("new item", newItem);
    let work = JSON.parse(JSON.stringify(ssWorkorderObj));
    work.items.push(newItem);
    log("second workorder", work.items);
    __setWorkorderObj(work);
  }

  function clearSearch() {
    _setSearchResults([]);
    _setSearchTerm("");
  }

  return (
    <View style={{}}>
      <View
        style={{
          width: "100%",
          marginTop: 10,
          flexDirection: "row",
          marginHorizontal: 4,
        }}
      >
        <TouchableOpacity
          onPress={() => clearSearch()}
          style={{
            // minWidth: 50,
            // maxWidth: 150,
            width: 120,
            marginVertical: 4,
            justifyContent: "center",
            borderWidth: 0,
            alignItems: "center",
            marginLeft: 7,
            backgroundColor: "darkgray",
            ...shadow_radius,
          }}
        >
          <Text
            style={{
              color: "white",
              paddingHorizontal: 15,
              paddingVertical: 4,
              fontSize: 18,
            }}
          >
            reset
          </Text>
        </TouchableOpacity>
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
          placeholder="Search..."
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
            return (
              <QuickItemButton
                onPress={() => {
                  _setSearchTerm("");
                  quickItemButtonHit = true;
                  // log("button obj", item);
                  let arr = [];
                  item.item.items.forEach((btnItem) => {
                    sInventory.forEach((invItem) => {
                      if (invItem.id == btnItem.id) arr.push(invItem);
                    });
                  });
                  //   log("arr", arr);
                  _setSearchResults(arr);
                }}
                title={item.item.name}
              />
            );
          }}
        />

        <FlatList
          style={{
            marginRight: 25,
            width: "70%",
            // backgroundColor: "green",
          }}
          data={sSearchResults}
          renderItem={(item) => {
            // log(item.item);
            return (
              <TouchableOpacity onPress={() => quickItemSelected(item.item)}>
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
                    {item.item.name}
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
                      Component={() => (
                        <InventoryItemInModal item={item.item} />
                      )}
                      buttonStyle={{}}
                      textStyle={{ fontSize: 14 }}
                    />
                    <Text
                      style={{
                        fontSize: 13,
                      }}
                    >
                      {"$ "}
                      <Text style={{ fontSize: 16 }}>{item.item.price}</Text>
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
        ...shadow_radius,
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

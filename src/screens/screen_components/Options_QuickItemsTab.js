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
} from "../../components";
import { Colors } from "../../styles";
import {
  BikeColors,
  Brands,
  Customer,
  Descriptions,
  Discounts,
  inventory_item,
  PartSources,
  quick_button_names,
  test_inventory,
  Workorder,
  WorkorderItem,
} from "../../data";
import { useActionData } from "react-router-dom";

let firstPass = false;
const SEARCH_STRING_TIMER = 30 * 1000;

export function QuickItemsTab({
  workorderOb = Workorder,
  customerObj = Customer,
}) {
  const intervalRef = React.useRef(null);
  const [sSearchTerm, setstateSearchTerm] = React.useState("");
  const [sSearchResults, setstateSearchResults] = React.useState([]);
  const [sInventory, setstateInventory] = React.useState(test_inventory);
  const [sInitDone, setstateInitDone] = React.useState(false);

  const quickButtonNames = quick_button_names;
  let lastSearchMillis = new Date().getTime();
  function setSearchTimer() {
    setInterval(() => {
      let curTime = new Date().getTime();
      let diff = curTime - lastSearchMillis;
      if (diff > SEARCH_STRING_TIMER) {
        setstateSearchResults([]);
        setstateSearchTerm("");
        lastSearchMillis = curTime;
      }
    }, SEARCH_STRING_TIMER);
  }

  function init() {
    if (!sInitDone) {
      setstateInitDone(true);
      setSearchTimer();
    }
  }
  init();

  function search(searchTerm) {
    lastSearchMillis = new Date().getTime();
    log("search term", searchTerm);
    setstateSearchTerm(searchTerm);
    if (searchTerm && searchTerm.length < 2) return;
    let res = {};
    let keys = Object.keys(inventory_item);
    sInventory.forEach((invItem) => {
      keys.forEach((key) => {
        // if (key == invItem.)
        if (invItem[key].toString().includes(searchTerm))
          res[invItem.id] = invItem;
      });
    });
    res = Object.values(res);
    // log(res);
    setstateSearchResults(res);
  }

  function searchItemSelected(item) {
    log("selected item", item);
  }

  function clearSearch() {
    setstateSearchResults([]);
    setstateSearchTerm("");
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
            backgroundColor: "darkgray",
            borderWidth: 1,
            borderColor: Colors.lightTextOnMainBackground,
            paddingHorizontal: 10,
            marginRight: 25,
            justifyContent: "center",
            ...shadow_radius,
          }}
        >
          <Text
            style={{
              color: "white",
              paddingHorizontal: 20,
              paddingVertical: 7,
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
            marginRight: 30,
          }}
          placeholder="Search..."
          placeholderTextColor={"darkgray"}
          value={sSearchTerm}
          onChangeText={(val) => search(val)}
        />
      </View>
      <View style={{ width: "100%" }}>
        <FlatList
          style={{ marginTop: 10, marginLeft: 5, marginRight: 25 }}
          data={sSearchResults}
          renderItem={(item) => {
            // log(item.item);
            return (
              <TouchableOpacity onPress={() => searchItemSelected(item.item)}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    borderBottomWidth: 1,
                    borderColor: Colors.mainBackground,
                  }}
                >
                  <Text
                    style={{
                      color: "blue",
                      fontSize: 16,
                      paddingVertical: 4,
                    }}
                  >
                    {item.item.name}
                  </Text>
                  <Text
                    style={{
                      color: "rgb(40,40,40)",
                      fontSize: 17,
                    }}
                  >
                    {"$ " + item.item.price}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      </View>
      <View
        style={{
          flexDirection: "row",
          marginTop: 5,
          width: "100%",
          // backgroundColor: "green",
        }}
      >
        {sSearchResults.length == 0 && (
          <View style={{}}>
            {quickButtonNames.map((item) => {
              return <QuickItemButton title={item.name} />;
            })}
          </View>
        )}
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
    >
      <Text
        numberOfLines={2}
        style={{
          textAlign: "center",
          color: "white",
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

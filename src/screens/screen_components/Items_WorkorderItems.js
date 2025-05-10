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
} from "../../components";
import { Colors } from "../../styles";
import {
  bike_colors_db,
  bike_brands_db,
  CUSTOMER_PROTO,
  bike_descriptions_db,
  discounts_db,
  part_sources_db,
  WORKORDER_PROTO,
  WORKORDER_ITEM_PROTO,
} from "../../data";

export const Items_WorkorderItemsTab = ({
  onPress,
  index = 0,
  ssWorkorderObj = WORKORDER_PROTO,
  __setWorkorderObj,
}) => {
  //   log("workorder items arr", workorderObj.items);
  // [const ]

  function deleteWorkorderItem(item) {
    let newItemList = ssWorkorderObj.items.filter((old) => old.id != item.id);
    ssWorkorderObj.items = newItemList;
    __setWorkorderObj(ssWorkorderObj);
  }

  function changeWorkorderItem(newItem) {
    let found = false;
    let newItemList = ssWorkorderObj.items.map((oldItem) => {
      if (oldItem.id == newItem.id) {
        found = true;
        return newItem;
      } else {
        return oldItem;
      }
    });
    if (!found) newItemList.push(newItem);
    ssWorkorderObj.items = newItemList;
    __setWorkorderObj(ssWorkorderObj);
  }

  if (!ssWorkorderObj) {
    return (
      <View
        style={{
          width: "100%",
          height: "100%",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Text
          style={{
            textAlign: "center",
            opacity: 0.05,
            color: "black",
            fontSize: 120,
          }}
        >
          Ready for Action
        </Text>
      </View>
    );
  }

  if (ssWorkorderObj.items.length == 0) {
    return (
      <View
        style={{
          width: "100%",
          height: "100%",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Text
          style={{
            textAlign: "center",
            opacity: 0.05,
            color: "black",
            fontSize: 120,
          }}
        >
          Empty Workorder
        </Text>
      </View>
    );
  }

  return (
    <View
      style={{
        width: "100%",
        height: "100%",
        justifyContent: "flex-start",
        // backgroundColor: "green",
      }}
    >
      <FlatList
        style={{ marginVertical: 3, marginRight: 5 }}
        data={ssWorkorderObj.items}
        renderItem={(item) => {
          return (
            <WorkorderItemComponent
              workorderItem={item.item}
              setWorkorderItemUp={(item) => changeWorkorderItem(item)}
              deleteWorkorderItem={() => deleteWorkorderItem(item.item)}
              keyExtractor={(item) => item.item.id}
            />
          );
        }}
      />
    </View>
  );
};

export const WorkorderItemComponent = ({
  workorderItem = WORKORDER_ITEM_PROTO,
  setWorkorderItemUp,
  deleteWorkorderItem,
}) => {
  //   log("rendering workorder item component", workorderItem);
  workorderItem = { ...workorderItem };

  function splitItems() {
    let itemList = [];

    for (let i = 0; i <= workorderItem.qty - 1; i++) {
      let item = { ...workorderItem };
      item.qty = 1;
      item.id = item.id + i.toString();
      delete item.discountObj;
      setWorkorderItemUp(item);
    }
    deleteWorkorderItem(workorderItem);
  }

  function applyDiscount(discountName) {
    let discountObj = {
      ...discounts_db.filter((obj) => obj.name == discountName)[0],
    };

    let newPrice;
    let savings;

    if (discountObj.value.includes("%")) {
      let multiplier = discountObj.value.slice(0, discountObj.value.length - 1);
      multiplier = "." + multiplier;
      multiplier = Number(multiplier);
      multiplier = 1 - multiplier;
      newPrice = workorderItem.price * workorderItem.qty * multiplier;
      savings = workorderItem.price * workorderItem.qty - newPrice;
    } else {
      newPrice =
        workorderItem.price * workorderItem.qty -
        workorderItem.qty * discountObj.value;
      savings = workorderItem.price * workorderItem.qty - newPrice;
    }

    if (newPrice > 0) {
      discountObj.discountedPrice = newPrice;
      discountObj.savings = savings;
      workorderItem.discountObj = discountObj;
      //   log("discount obj", discountObj);
      setWorkorderItemUp(workorderItem);
    }
  }

  function setWorkorderItem(item, discount = false) {
    if (Object.hasOwn(workorderItem, "discountObj")) {
      applyDiscount(workorderItem.discountObj.name);
      return;
    }
    setWorkorderItemUp(item);
  }

  return (
    <View
      style={{
        flexDirection: "row",
        width: "100%",
        backgroundColor: "whitesmoke",
        paddingVertical: 2,
        paddingHorizontal: 2,
        marginVertical: 1.5,
        marginHorizontal: 5,
      }}
    >
      <View style={{ width: "60%", justifyContent: "center" }}>
        {Object.hasOwn(workorderItem, "discountObj") && (
          <Text style={{ color: "magenta" }}>
            {workorderItem.discountObj.name}
          </Text>
        )}
        <Text
          style={{ fontSize: 15, color: Colors.darkText, fontWeight: "500" }}
        >
          {workorderItem.name}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
          <TextInput
            style={{ outlineWidth: 0, color: Colors.lightText }}
            onChangeText={(val) => {
              workorderItem.intakeNotes = val;
              setWorkorderItem(workorderItem);
            }}
            placeholder="Intake notes..."
            placeholderTextColor={"darkgray"}
            value={workorderItem.intakeNotes}
          />
        </View>
        {Object.hasOwn(workorderItem, "serviceNotes") && (
          <TextInput
            onChangeText={(val) => {
              workorderItem.serviceNotes = val;
              setWorkorderItem(workorderItem);
            }}
            value={workorderItem.serviceNotes}
            style={{ color: "red", outlineWidth: 0 }}
            autoFocus={workorderItem.serviceNotes.length < 1 ? true : false}
            selection={
              workorderItem.serviceNotes < 1 ? { start: 0, end: 0 } : null
            }
          />
        )}
      </View>
      <View
        style={{
          width: "40%",
          flexDirection: "row",
          justifyContent: "flex-start",
          alignItems: "center",
          height: "100%",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            // marginRight: 5,
          }}
        >
          {!Object.hasOwn(workorderItem, "serviceNotes") && (
            <TouchableOpacity
              onPress={() => {
                if (!workorderItem.serviceNotes) {
                  workorderItem.serviceNotes = "";
                  setWorkorderItem(workorderItem);
                }
              }}
              style={{
                width: 25,
                marginRight: 10,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  color: Colors.mainBackground,
                  fontSize: 28,
                }}
              >
                +
              </Text>
            </TouchableOpacity>
          )}
          {Object.hasOwn(workorderItem, "serviceNotes") && (
            <TouchableOpacity
              onPress={() => {
                delete workorderItem.serviceNotes;
                setWorkorderItem(workorderItem);
              }}
              style={{
                marginRight: 10,
                width: 25,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  color: "red",
                  fontSize: 40,
                }}
              >
                -
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={{
              paddingHorizontal: 5,
              borderRadius: 4,
              justifyContent: "center",
              alignItems: "center",
            }}
            onPress={() => {
              workorderItem.qty = workorderItem.qty + 1;
              setWorkorderItem(workorderItem);
            }}
          >
            <Text style={{ color: "gray", fontSize: 35 }}>{"\u2191"}</Text>
          </TouchableOpacity>
          <TextInput
            style={{
              marginHorizontal: 10,
              fontSize: 20,
              width: 35,
              textAlign: "center",
            }}
            value={workorderItem.qty}
            onChangeText={(val) => {
              if (isNaN(val)) return;
              if (workorderItem.qty > 0) {
                workorderItem.qty = val;
                setWorkorderItem(workorderItem);
              } else {
                deleteWorkorderItem();
              }
            }}
          ></TextInput>
          <TouchableOpacity
            style={{ paddingHorizontal: 5 }}
            onPress={
              workorderItem.qty > 1
                ? () => {
                    workorderItem.qty = workorderItem.qty - 1;
                    setWorkorderItem(workorderItem);
                  }
                : null
            }
          >
            <Text style={{ color: "gray", fontSize: 35 }}>{"\u2193"}</Text>
          </TouchableOpacity>
        </View>
        <View
          style={{
            alignItems: "flex-end",
            minWidth: 100,
            marginRight: 6,
          }}
        >
          <Text
            style={{
              paddingHorizontal: 5,
              minWidth: 30,
            }}
          >
            {"$ " + trimToTwoDecimals(workorderItem.price)}
          </Text>
          {Object.hasOwn(workorderItem, "discountObj") && (
            <Text
              style={{
                paddingHorizontal: 5,
                minWidth: 30,
                color: "magenta",
              }}
            >
              {"$ -" + trimToTwoDecimals(workorderItem.discountObj.savings)}
            </Text>
          )}
          {workorderItem.qty > 1 ||
          Object.hasOwn(workorderItem, "discountObj") ? (
            <Text
              style={{
                fontWeight: "bold",
                minWidth: 30,
                marginTop: 7,
                paddingHorizontal: 5,
                color: Colors.darkText,
              }}
            >
              {"$ " +
                trimToTwoDecimals(
                  workorderItem.discountObj
                    ? workorderItem.discountObj.discountedPrice
                    : workorderItem.price * workorderItem.qty
                )}
            </Text>
          ) : null}
        </View>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "flex-end",
          }}
        >
          <TouchableOpacity
            onPress={() => (workorderItem.qty > 1 ? splitItems() : null)}
            style={{
              backgroundColor: Colors.blueButtonBackground,
              borderRadius: 2,
              margin: 2,
              paddingHorizontal: 6,
              paddingVertical: 1,
              alignItems: "center",
              justifyContent: "center",
              shadowColor: "black",
              shadowOffset: { width: 2, height: 2 },
              shadowOpacity: 0.4,
              shadowRadius: 5,
              opacity: workorderItem.qty > 1 ? null : 0,
            }}
          >
            <Text style={{ color: Colors.tabMenuButton, fontSize: 15 }}>S</Text>
          </TouchableOpacity>
          <ModalDropdown
            buttonLabel={"D"}
            data={discounts_db.map((item) => item.name)}
            closeButtonText={"Close"}
            removeButtonText={"Remove Discount"}
            onSelect={(itemName) => {
              applyDiscount(itemName, workorderItem);
            }}
            onRemoveSelection={() => {
              delete workorderItem.discountObj;
              setWorkorderItem(workorderItem);
            }}
            currentSelectionName={
              workorderItem.discountObj ? workorderItem.discountObj.name : null
            }
          />
          <TouchableOpacity
            onPress={() => deleteWorkorderItem()}
            style={{
              backgroundColor: Colors.blueButtonBackground,
              borderRadius: 2,
              margin: 2,
              marginRight: 10,
              paddingHorizontal: 6,
              paddingVertical: 1,
              alignItems: "center",
              justifyContent: "center",
              shadowColor: "black",
              shadowOffset: { width: 3, height: 3 },
              shadowOpacity: 0.3,
              shadowRadius: 5,
            }}
          >
            <Text style={{ color: "red", fontSize: 15 }}>X</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

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
import { Customer, Discounts, Workorder, WorkorderItem } from "../../data";

export const WorkorderItemComponent = ({
  workorderItem = WorkorderItem,
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
    let discountObj = Discounts.filter((obj) => obj.name == discountName)[0];

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
        {Object.hasOwn(workorderItem, "discount") && (
          <Text style={{ color: "magenta" }}>
            {workorderItem.discount.name}
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
              backgroundColor: Colors.smallButtonBackground,
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
            data={Discounts.map((item) => item.name)}
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
              backgroundColor: Colors.smallButtonBackground,
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

export const InfoComponent = ({
  customerObj = Customer,
  setCustomerObj,
  setWorkorderObj,
  workorderObj = Workorder,
}) => {
  return (
    <View style={{ height: "100%", width: "100%", paddingRight: 7 }}>
      <Text style={{ color: Colors.darkTextOnMainBackground, fontSize: 30 }}>
        {customerObj.first + " " + customerObj.last}
      </Text>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        {customerObj.phone.cell ? (
          <Text style={{ color: Colors.lightTextOnMainBackground }}>
            {"Cell:  " + customerObj.phone.cell}
          </Text>
        ) : null}
        {customerObj.phone.cell ? (
          <Text style={{ color: Colors.lightTextOnMainBackground }}>
            {"Landline:  " + customerObj.phone.landline}
          </Text>
        ) : null}
        {customerObj.phone.callOnlyOption ? (
          <Text style={{ color: "pink" }}>CALL ONLY</Text>
        ) : null}
        {customerObj.phone.emailOnlyOption ? (
          <Text style={{ color: "pink" }}>EMAIL ONLY</Text>
        ) : null}
      </View>
      <TextInputLabelOnMainBackground
        value={"BRAND"}
        styleProps={{ marginTop: 10 }}
      />
      <View
        style={{
          // marginTop: 10,
          flexDirection: "row",
          justifyContent: "flex-start",
          width: "100%",
        }}
      >
        <TextInputOnMainBackground
          styleProps={{ marginRight: 20 }}
          value={workorderObj.brand}
          onTextChange={(val) => {
            log(val);
            workorderObj.brand = val;
            setWorkorderObj(workorderObj);
          }}
        />
        <ModalDropdown
          itemListStyle={{ width: 80 }}
          modalStyle={{
            alignSelf: "flex-start",
            marginVertical: "2%",
            width: "30%",
          }}
          closeButtonText={"Close"}
          removeButtonText={"Remove Color"}
          buttonLabel={"Brands"}
        />
        <View style={{ width: 10 }} />
        <ModalDropdown
          itemListStyle={{ width: 100 }}
          modalStyle={{
            alignSelf: "flex-start",
            marginVertical: "2%",
            width: "30%",
          }}
          buttonLabel={"More Brands"}
          closeButtonText={"Close"}
          removeButtonText={"Remove Color"}
        />
      </View>
      <TextInputLabelOnMainBackground
        value={"MODEL/DESCRIPTION"}
        styleProps={{ marginTop: 10, marginBottom: 2 }}
      />
      <View
        style={{
          flexDirection: "row",
          justifyContent: "flex-start",
          width: "100%",
          alignItems: "center",
        }}
      >
        <TextInputOnMainBackground
          styleProps={{ marginRight: 20 }}
          value={workorderObj.description}
          onTextChange={(val) => {
            workorderObj.description = val;
            setWorkorderObj(workorderObj);
          }}
        />
        <ModalDropdown
          itemListStyle={{ width: 100 }}
          modalStyle={{
            alignSelf: "flex-start",
            marginVertical: "2%",
            width: "30%",
          }}
          buttonLabel={"Descriptions"}
          closeButtonText={"Close"}
          removeButtonText={"Remove Description"}
        />
      </View>
      <TextInputLabelOnMainBackground
        value={"COLOR"}
        styleProps={{
          marginTop: 10,
          marginBottom: 2,
        }}
      />
      <View
        style={{
          flexDirection: "row",
          justifyContent: "flex-start",
          width: "100%",
        }}
      >
        <TextInputOnMainBackground
          value={workorderObj.color}
          styleProps={{
            marginRight: 20,
            color:
              workorderObj.color == "White" || workorderObj.color == "Tan"
                ? "dimgray"
                : Colors.lightTextOnMainBackground,
            backgroundColor: workorderObj.color.toLowerCase(),
          }}
          onTextChange={(val) => {
            workorderObj.color = val;
            setWorkorderObj(workorderObj);
          }}
        />
        <ModalDropdown
          itemListStyle={{ width: 80 }}
          modalStyle={{
            alignSelf: "flex-start",
            marginVertical: "2%",
            width: "30%",
          }}
          closeButtonText={"Close"}
          removeButtonText={"Remove Color"}
          buttonLabel={"Colors"}
        />
      </View>
      <TextInputLabelOnMainBackground
        value={"PART ORDERED"}
        styleProps={{ marginTop: 10, marginBottom: 2 }}
      />
      <View
        style={{
          flexDirection: "row",
          justifyContent: "flex-start",
          width: "100%",
        }}
      >
        <TextInputOnMainBackground
          styleProps={{ marginRight: 20 }}
          value={workorderObj.partOrdered}
          onTextChange={(val) => {
            log(val);
            workorderObj.partOrdered = val;
            setWorkorderObj(workorderObj);
          }}
        />
      </View>
      <TextInputLabelOnMainBackground
        value={"PART SOURCE"}
        styleProps={{ marginTop: 10, marginBottom: 2 }}
      />
      <View
        style={{
          // marginTop: 8,
          flexDirection: "row",
          justifyContent: "flex-start",
          width: "100%",
        }}
      >
        <TextInputOnMainBackground
          value={workorderObj.partSource}
          styleProps={{ marginRight: 20 }}
          onTextChange={(val) => {
            log(val);
            workorderObj.partSource = val;
            setWorkorderObj(workorderObj);
          }}
        />
        <ModalDropdown
          itemListStyle={{ width: 80 }}
          modalStyle={{
            alignSelf: "flex-start",
            marginVertical: "2%",
            width: "30%",
          }}
          closeButtonText={"Close"}
          removeButtonText={"Remove Source"}
          buttonLabel={"Sources"}
        />
      </View>
    </View>
  );
};

export const ItemsTab = ({
  onPress,
  index = 0,
  workorderObj = Workorder,
  setWorkorderObj,
}) => {
  //   log("workorder items arr", workorderObj.items);
  workorderObj = { ...workorderObj };
  function deleteWorkorderItem(item) {
    let newItemList = workorderObj.items.filter((old) => old.id != item.id);
    workorderObj.items = newItemList;
    setWorkorderObj(workorderObj);
  }

  function changeWorkorderItem(newItem) {
    log("setting new workorder item", newItem);
    let found = false;
    let newItemList = workorderObj.items.map((oldItem) => {
      if (oldItem.id == newItem.id) {
        found = true;
        log("found it");
        return newItem;
      } else {
        return oldItem;
      }
    });
    if (!found) newItemList.push(newItem);
    workorderObj.items = newItemList;
    setWorkorderObj(workorderObj);
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
      <View
        style={{
          flexDirection: "row",
          width: "100%",
          justifyContent: "space-between",
        }}
      >
        <View
          style={{
            flexDirection: "row",
          }}
        >
          <TabMenuButton
            onPress={() => onPress(0)}
            text={"Ticket Items"}
            isSelected={index == 0 ? true : false}
          />
          <Divider />
          <TabMenuButton
            onPress={() => onPress(1)}
            text={"Change Log"}
            isSelected={index == 1 ? true : false}
          />
        </View>
        <View
          style={{
            flexDirection: "row",
            // paddingRight: 10,
          }}
        >
          <TabMenuButton
            onPress={() => onPress(1)}
            text={"Dashboard"}
            isSelected={index == 4 ? true : false}
          />
        </View>
      </View>
      <FlatList
        style={{ marginVertical: 3, marginRight: 5 }}
        data={workorderObj.items}
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

export const OptionsTab = ({ onPress, index = 0, workorderObj }) => {
  let Component = () => (
    <View
      style={{
        width: "100%",
        backgroundColor: "yellow",
      }}
    ></View>
  );

  return (
    <View
      style={{
        width: "100%",
        justifyContent: "flex-start",
      }}
    >
      <View
        style={{
          flexDirection: "row",
          width: "100%",
          justifyContent: "flex-start",
          //   backgroundColor: Colors.opacityBackgroundLight,
        }}
      >
        <TabMenuButton
          onPress={() => onPress(0)}
          text={"Quick Items"}
          isSelected={index == 0 ? true : false}
        />
        <Divider />
        <TabMenuButton
          onPress={() => onPress(1)}
          text={"Inventory"}
          isSelected={index == 1 ? true : false}
        />
        <Divider />
        <TabMenuButton
          onPress={() => onPress(0)}
          text={"Workorders"}
          isSelected={index == 3 ? true : false}
        />
        <Divider />

        <TabMenuButton
          onPress={() => onPress(1)}
          text={"Customer Info"}
          isSelected={index == 2 ? true : false}
        />
      </View>
      <Component />
    </View>
  );
};

/// Notes Tab Component
export const NotesComponent = ({ workorderObj, height }) => {
  if (!workorderObj) {
    //dev
    workorderObj = {};
    workorderObj.notes = {};
    workorderObj.notes.customerNotes = "";
    workorderObj.notes.internalNotes = "";
  }

  return (
    <View style={{ width: "100%", height: "100%", paddingTop: 20 }}>
      <View
        style={{
          flexDirection: "row",
          width: "100%",
          height: "100%",
        }}
      >
        <View
          style={{
            width: "50%",
            height: "100%",
            backgroundColor: null,
            flexDirection: "column",
            paddingRight: 10,
          }}
        >
          <View>
            <Text style={{ color: "lightgray" }}>Customer Notes</Text>
          </View>
          <TextInput
            multiline={true}
            placeholderTextColor={"darkgray"}
            placeholder="Write as many notes as you can..."
            style={{
              marginTop: 5,
              width: "100%",
              height: "100%",
              outlineWidth: 0,
            }}
            value={workorderObj.notes.customerNotes}
          />
        </View>
        <View
          style={{
            width: "50%",
            height: "100%",
            backgroundColor: null,
            flexDirection: "column",
            borderLeftWidth: 1,
            borderColor: "lightgray",
            paddingLeft: 10,
          }}
        >
          <View>
            <Text
              style={{
                color: "lightgray",
              }}
            >
              Internal Notes
            </Text>
          </View>
          <TextInput
            multiline={true}
            placeholder="Please be detailed..."
            placeholderTextColor={"darkgray"}
            style={{
              marginTop: 5,
              width: "100%",
              height: "100%",
              outlineWidth: 0,
            }}
            // value={workorderObj.notes.internalNotes}
          />
        </View>
      </View>
    </View>
  );
};

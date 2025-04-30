import {
  View,
  Text,
  Pressable,
  TextInput,
  FlatList,
  TouchableHighlight,
} from "react-native-web";
import { dim, log, trimToTwoDecimals } from "../../utils";
import {
  HorzSpacer,
  TabMenuButton,
  TabMenuDivider as Divider,
} from "../../components";
import { Colors } from "../../styles";
import { Customer, Workorder, WorkorderItem } from "../../data";

export const WorkorderItemComponent = ({
  workorderItem = WorkorderItem,
  setWorkorderItem,
  deleteWorkorderItem,
}) => {
  //   log("rendering workorder item component", workorderItem);
  workorderItem = { ...workorderItem };
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
        <Text
          style={{ fontSize: 15, color: Colors.darkText, fontWeight: "500" }}
        >
          {workorderItem.name}
        </Text>
        <TextInput
          style={{ outlineWidth: 0, color: Colors.lightText }}
          onChangeText={(val) => {
            workorderItem.intakeNotes = val;
            setWorkorderItem(workorderItem);
          }}
          value={workorderItem.intakeNotes}
        />
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
          justifyContent: "space-between",
          alignItems: "center",
          height: "100%",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {!Object.hasOwn(workorderItem, "serviceNotes") && (
            <TouchableHighlight
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
            </TouchableHighlight>
          )}
          {Object.hasOwn(workorderItem, "serviceNotes") && (
            <TouchableHighlight
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
            </TouchableHighlight>
          )}
          <TouchableHighlight
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
          </TouchableHighlight>
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
          <TouchableHighlight
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
          </TouchableHighlight>
        </View>
        <View
          style={{
            alignItems: "flex-start",
            minWidth: 100,
          }}
        >
          <Text
            style={{
              paddingHorizontal: 5,
              minWidth: 30,
            }}
          >
            {"$" + trimToTwoDecimals(workorderItem.price)}
          </Text>
          {workorderItem.qty > 1 ? (
            <Text
              style={{
                fontWeight: "bold",
                minWidth: 30,
                marginTop: 7,
                paddingHorizontal: 5,
                color: Colors.darkText,
              }}
            >
              {"$" + trimToTwoDecimals(workorderItem.price * workorderItem.qty)}
            </Text>
          ) : null}
        </View>
        <TouchableHighlight
          onPress={() => deleteWorkorderItem()}
          style={{
            backgroundColor: Colors.opacityBackgoundDark,
            borderRadius: 2,
            marginRight: 15,
            paddingHorizontal: 6,
            paddingVertical: 1,
            alignItems: "center",
            justifyContent: "center",
            opacity: 0.6,
            shadowColor: "black",
            shadowOffset: { width: 3, height: 3 },
            shadowOpacity: 0.3,
            shadowRadius: 5,
          }}
        >
          <Text style={{ color: "red", fontSize: 20 }}>X</Text>
        </TouchableHighlight>
      </View>
    </View>
  );
};

export const InfoComponent = ({ customerObj = Customer, setCustomerObj }) => {
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
    let newItemList = workorderObj.items.map((oldItem) => {
      if (oldItem.id == newItem.id) {
        return newItem;
      } else {
        return oldItem;
      }
    });
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
              setWorkorderItem={(item) => changeWorkorderItem(item)}
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

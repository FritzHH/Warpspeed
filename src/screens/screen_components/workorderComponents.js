import { View, Text, Pressable, TextInput, FlatList } from "react-native-web";
import { dim, log } from "../../utils";
import {
  HorzSpacer,
  TabMenuButton,
  TabMenuDivider as Divider,
} from "../../components";
import { Colors } from "../../styles";
import { Customer, Workorder, WorkorderItem } from "../../data";

export const WorkorderItemComponent = ({ workorderItem, setWorkorderItem }) => {
  log("rendering workorder item component", workorderItem);
  return (
    <View
      style={{
        flexDirection: "row",
        width: "100%",
        height: 20,
        // backgroundColor: "black",
        paddingVertical: 2,
        paddingHorizontal: 2,
      }}
    >
      <View style={{ width: "60%" }}>
        <Text style={{ fontSize: 20 }}>{workorderItem.name}</Text>
        <Text>{workorderItem.intakeNotes}</Text>
        <Text style={{ color: "red" }}>{workorderItem.serviceNotes}</Text>
      </View>
      <View style={{ width: "40%" }}>
        <Pressable onPress={() => setWorkorderItem(workorderItem.qty++)}>
          <Text style={{ fontSize: 20 }}>{"\u2bb9"}</Text>
        </Pressable>
        <Text>{workorderItem.qty}</Text>
        <Pressable
          onPress={
            workorderItem.qty > 0
              ? () => setWorkorderItem(workorderItem.qty--)
              : null
          }
        >
          <Text style={{ fontSize: 20 }}>{"\u2bb9"}</Text>
        </Pressable>
        <View>
          <Text style={{}}>{"$" + workorderItem.price}</Text>
          {workorderItem.qty > 1 ? (
            <Text style={{ marginTop: 7 }}>
              {"$" + workorderItem.price * workorderItem.qty}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
};

export const InfoComponent = ({ customerObj = Customer, setCustomerObj }) => {
  return (
    <View style={{ height: "100%", width: "100%", paddingRight: 7 }}>
      <Text style={{ color: "darkgray", fontSize: 30 }}>
        {customerObj.first + " " + customerObj.last}
      </Text>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        {customerObj.phone.cell ? (
          <Text>{"Cell:  " + customerObj.phone.cell}</Text>
        ) : null}
        {customerObj.phone.cell ? (
          <Text>{"Landline:  " + customerObj.phone.landline}</Text>
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
  setWorkorderItem,
}) => {
  log("workorder items arr", workorderObj.items);

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
        data={workorderObj.items}
        renderItem={(item) => (
          <WorkorderItemComponent
            workorderItem={item.item}
            setWorkorderItem={setWorkorderItem}
            keyExtractor={(item) => item.id}
          />
        )}
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

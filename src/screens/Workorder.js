import React from "react";
import { View, Text, FlatList } from "react-native-web";
import { Customer, Workorder, WorkorderItem } from "../data";
import { Button } from "react-native-web";
import { Colors, ViewStyles } from "../styles";
import {
  InfoComponent,
  ItemsTab,
  NotesComponent,
  OptionsTab,
} from "./screen_components/workorderComponents";
import { dim, log } from "../utils";
// import { Tab, Tabs, TabList, TabPanel } from "react-tabs";
// import { TabView, SceneMap } from "react-native-tab-view";

let height = dim.windowHeight * 1;

export function WorkorderScreen() {
  const [sNotesTabIndex, setstateNoteTabIndex] = React.useState(0);
  const [sCustomerObj, setstateCustomerObj] = React.useState({ ...Customer });
  const [sWorkorderObj, setstateWorkorderObj] = React.useState({
    ...Workorder,
  });

  function setCustomerObj(customerObj) {
    log("setting customer object", customerObj);
  }
  function setWorkorderObj(workorderObj) {
    log("setting workorder object", workorderObj);
  }
  //   console.log("initial", notesTabIndex);
  return (
    <View
      style={{
        ...ViewStyles.fullScreen,
        flexDirection: "row",
        justifyContent: "space-around",
      }}
    >
      <View style={{ height: height, width: "64%" }}>
        <View
          style={{
            width: "100%",
            height: height * 0.65,
            flexDirection: "row",
            justifyContent: "flex-start",
          }}
        >
          <View
            style={{
              width: "33%",
            }}
          >
            <InfoComponent
              customerObj={sCustomerObj}
              setCustomerObj={(obj) => setCustomerObj(obj)}
            />
          </View>
          <View
            style={{
              width: "68%",
              backgroundColor: Colors.opacityBackgroundLight,
            }}
          >
            <ItemsTab
              workorderObj={sWorkorderObj}
              setWorkorderItem={(obj) => setWorkorderObj(obj)}
            />
          </View>
        </View>
        <View
          style={{
            width: "100%",
            height: height * 0.35,
          }}
        >
          <NotesComponent height={height * 0.3} />
        </View>
      </View>
      <View
        style={{
          width: "34%",
          height: height,
          backgroundColor: Colors.opacityBackgroundLight,
        }}
      >
        <OptionsTab />
      </View>
    </View>
  );
}

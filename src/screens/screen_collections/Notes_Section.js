import { on } from "events";
import { Items_WorkorderItemsTab } from "../screen_components/Items_WorkorderItems";
import { Tab } from "react-tabs";
import { View, Text } from "react-native-web";
import React from "react";
import { QuickItemsTab } from "../screen_components/Options_QuickItemsTab";
import { Notes_MainComponent } from "../screen_components/Notes_MainComponent";

export function Notes_Section({ ssWorderObj, __setWorkorderObj }) {
  return (
    <Notes_MainComponent
      ssWorkorderObj={ssWorderObj}
      __setWorkorderObj={__setWorkorderObj}
    />
  );
}

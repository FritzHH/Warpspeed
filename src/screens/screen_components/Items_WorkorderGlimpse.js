import React from "react";
import { View, Text, FlatList, TouchableOpacity } from "react-native-web";
import { log } from "../../utils";
import {
  Button,
  CustomerInfoComponent,
  ScreenModal,
  SHADOW_RADIUS_PROTO,
} from "../../components";
import { cloneDeep } from "lodash";
import {
  INFO_COMPONENT_NAMES,
  TAB_NAMES,
  WORKORDER_ITEM_PROTO,
  WORKORDER_PROTO,
} from "../../data";

export function WorkorderGlimpse({ ssWorkorderPreviewObj = WORKORDER_PROTO }) {
  // log("item", ssWorkorderPreviewObj);
  return (
    <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,.6)" }}>
      <Text>{ssWorkorderPreviewObj.brand}</Text>
    </View>
  );
}

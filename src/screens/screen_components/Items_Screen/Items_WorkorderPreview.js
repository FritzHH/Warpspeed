/*eslint-disable*/
import React from "react";
import { View, Text, FlatList, TouchableOpacity } from "react-native-web";
import { log } from "../../../utils";
import { WORKORDER_PROTO } from "../../../data";
import { useWorkorderPreviewStore } from "../../../stores";

export function WorkorderPreview() {
  let zWorkorderPreview = WORKORDER_PROTO;
  zWorkorderPreview = useWorkorderPreviewStore((state) =>
    state.getPreviewObj()
  );
  return (
    <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,.2)" }}>
      <Text>
        {zWorkorderPreview.customerFirst + " " + zWorkorderPreview.customerLast}
      </Text>
      <Text>{zWorkorderPreview.brand}</Text>
    </View>
  );
}

/*eslint-disable*/
import React from "react";
import { View, Text, FlatList, TouchableOpacity } from "react-native-web";
import { log } from "../../../utils";
import { WORKORDER_PROTO } from "../../../data";
import { useWorkorderPreviewStore } from "../../../storesOld";

export function WorkorderPreview() {
  let zWorkorderPreview = WORKORDER_PROTO;
  zWorkorderPreview = useWorkorderPreviewStore((state) =>
    state.getPreviewObj()
  );
  return (
    <View style={{ width: "100%", height: "100%", backgroundColor: "green" }}>
      <Text>
        {zWorkorderPreview.customerFirst + " " + zWorkorderPreview.customerLast}
      </Text>
      <Text>{zWorkorderPreview.brand}</Text>
    </View>
  );
}

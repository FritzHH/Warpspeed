/*eslint-disable*/
import React from "react";
import { View, Text, FlatList, TouchableOpacity } from "react-native-web";
import { capitalizeFirstLetterOfString, log } from "../../../utils";
import { WORKORDER_PROTO } from "../../../data";
import { useWorkorderPreviewStore } from "../../../stores";

export function WorkorderPreview() {
  let zWorkorderPreview = WORKORDER_PROTO;
  zWorkorderPreview = useWorkorderPreviewStore((state) => state.previewObj);
  return (
    <View style={{ width: "100%", height: "100%", backgroundColor: "green" }}>
      <Text>
        {capitalizeFirstLetterOfString(zWorkorderPreview.customerFirst) + " " + capitalizeFirstLetterOfString(zWorkorderPreview.customerLast)}
      </Text>
      <Text>{zWorkorderPreview.brand}</Text>
    </View>
  );
}

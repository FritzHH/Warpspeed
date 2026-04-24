/* eslint-disable */

import { View, Text, FlatList } from "react-native-web";
import { gray, deepEqual } from "../../../utils";
import { C, Fonts } from "../../../styles";
import { useOpenWorkordersStore } from "../../../stores";

function formatTimestamp(millis) {
  let d = new Date(millis);
  let month = d.getMonth() + 1;
  let day = d.getDate();
  let hour = d.getHours();
  let amPM = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  let min = d.getMinutes().toString().padStart(2, "0");
  return month + "/" + day + " " + hour + ":" + min + " " + amPM;
}

function describeEntry(entry) {
  if (entry.field === "workorderLines") {
    if (entry.action === "added") return "added '" + entry.to + "' to line items";
    if (entry.action === "removed") return "removed '" + entry.from + "' from line items";
    if (entry.action === "changed") return "changed " + entry.detail + " on '" + entry.item + "' from '" + entry.from + "' to '" + entry.to + "'";
  }
  if (entry.field === "status") return "changed status from '" + entry.from + "' to '" + entry.to + "'";
  if (entry.field === "color1" || entry.field === "color2") {
    let label = entry.field === "color1" ? "primary color" : "secondary color";
    return "changed " + label + (entry.from ? " from '" + entry.from + "'" : "") + " to '" + entry.to + "'";
  }
  if (entry.field === "taxFree") return "changed tax exempt from '" + entry.from + "' to '" + entry.to + "'";
  let fieldLabel = entry.field === "partOrdered" ? "part ordered" : entry.field === "partSource" ? "part source" : entry.field;
  return "changed " + fieldLabel + (entry.from ? " from '" + entry.from + "'" : "") + " to '" + entry.to + "'";
}

function ChangeLogRow({ entry, index }) {
  return (
    <View
      style={{
        flexDirection: "row",
        paddingVertical: 6,
        paddingHorizontal: 10,
        backgroundColor: index % 2 === 0 ? C.listItemWhite : gray(0.06),
        alignItems: "flex-start",
      }}
    >
      <Text
        style={{
          fontSize: 12,
          color: gray(0.45),
          width: 100,
          flexShrink: 0,
        }}
      >
        {formatTimestamp(entry.timestamp)}
      </Text>
      <Text
        style={{
          fontSize: 13,
          color: C.text,
          flex: 1,
        }}
      >
        <Text style={{ fontWeight: Fonts.weight.textHeavy }}>{entry.user}</Text>
        {"  "}
        {describeEntry(entry)}
      </Text>
    </View>
  );
}

export function Items_ChangeLog() {
  const zChangeLog = useOpenWorkordersStore((state) => {
    let id = state.openWorkorderID;
    return state.workorders.find((o) => o.id === id)?.changeLog || [];
  }, deepEqual);

  let changeLog = zChangeLog;
  let sorted = [...changeLog].sort((a, b) => b.timestamp - a.timestamp);

  if (sorted.length === 0) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text style={{ fontSize: 14, color: gray(0.5) }}>No changes recorded</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <View
        style={{
          flexDirection: "row",
          paddingVertical: 6,
          paddingHorizontal: 10,
          borderBottomWidth: 2,
          borderBottomColor: C.buttonLightGreenOutline,
          backgroundColor: C.listItemWhite,
        }}
      >
        <Text style={{ fontSize: 12, color: gray(0.45), width: 100, fontWeight: Fonts.weight.textHeavy }}>Time</Text>
        <Text style={{ fontSize: 12, color: gray(0.45), flex: 1, fontWeight: Fonts.weight.textHeavy }}>Change</Text>
      </View>
      <FlatList
        data={sorted}
        keyExtractor={(item, index) => item.timestamp + "-" + index}
        renderItem={({ item, index }) => <ChangeLogRow entry={item} index={index} />}
      />
    </View>
  );
}

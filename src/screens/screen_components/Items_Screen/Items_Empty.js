import { Text, View } from "react-native-web";

export function EmptyItemsComponent() {
  return (
    <View
      style={{
        width: "100%",
        height: "100%",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ fontSize: 50, color: "gray" }}>Empty</Text>
    </View>
  );
}

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
      <Text
        style={{
          textAlign: "center",
          width: "100%",
          fontSize: 50,
          color: "gray",
        }}
      >
        {"WarpSpeed\n"}
        <Text
          style={{
            textAlign: "center",
            width: "100%",
            fontSize: 20,
            color: "gray",
          }}
        >
          By Heliosoft
        </Text>
      </Text>
    </View>
  );
}

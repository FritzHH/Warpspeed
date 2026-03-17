/* eslint-disable */
import React from "react";
import { View } from "react-native-web";
import { useNavigate } from "react-router-dom";
import { Button_ } from "../../components";
import { C, COLOR_GRADIENTS, ICONS } from "../../styles";
import { useOpenWorkordersStore } from "../../stores";

export function MobileHomeScreen() {
  const navigate = useNavigate();
  const zWorkorderCount = useOpenWorkordersStore(
    (state) => state.workorders.filter((o) => !o.isStandaloneSale).length
  );

  return (
    <View
      style={{
        width: "100%",
        height: "100%",
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: 24,
        backgroundColor: C.backgroundWhite,
      }}
    >
      <Button_
        text={`Workorders (${zWorkorderCount})`}
        icon={ICONS.workorder}
        iconSize={40}
        colorGradientArr={COLOR_GRADIENTS.green}
        onPress={() => navigate("/workorders")}
        buttonStyle={{
          width: "100%",
          paddingVertical: 24,
          borderRadius: 12,
          marginBottom: 16,
        }}
        textStyle={{
          fontSize: 20,
          fontWeight: "600",
          color: C.textWhite,
        }}
      />
    </View>
  );
}

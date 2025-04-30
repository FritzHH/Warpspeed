import { View, Text as TextComp } from "react-native-web";
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";

import { ROUTES } from "../App";
import { Button } from "../components";
import { fetchIt, log, dim } from "../utils";

export function HomeScreen() {
  const navigate = useNavigate();
  function go() {
    log("printing..");
    navigate(ROUTES.workorderScreen);
  }

  return (
    <View
      style={{
        backgroundColor: "green",
        height: dim.height,
        width: dim.windowWidth,
      }}
    >
      <Button onPress={() => go()} text={"hello"}></Button>
    </View>
  );
}

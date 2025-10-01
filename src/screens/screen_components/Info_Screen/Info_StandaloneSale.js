/* eslint-disable */
import { FlatList, View, Text, TextInput } from "react-native-web";
import { TAB_NAMES, WORKORDER_PROTO } from "../../../data";
import {
  useInventoryStore,
  useOpenWorkordersStore,
  useSettingsStore,
  useTabNamesStore,
} from "../../../stores";

import {
  Button,
  CheckBox_,
  ScreenModal,
  SHADOW_RADIUS_PROTO,
  Button_,
} from "../../../components";
import {
  calculateRunningTotals,
  log,
  showAlert,
  trimToTwoDecimals,
} from "../../../utils";
import { useEffect, useState } from "react";
import { COLOR_GRADIENTS, Colors, Fonts, ICONS } from "../../../styles";

export const StandaloneSaleComponent = ({}) => {
  // store getters
  let zOpenWorkorder = WORKORDER_PROTO;
  zOpenWorkorder = useOpenWorkordersStore((state) => state.openWorkorder);

  //////////////////////////////////////////////////////////////////////

  return (
    <View
      style={{
        width: "100%",
        height: "100%",
        alignItems: "center",
        // backgroundColor: "green",
      }}
    ></View>
  );
};





const checkoutScreenStyle = {
  base: {
    alignItems: "center",
    paddingTop: 20,
    width: 500,
    height: 380,
    backgroundColor: "white",
  },
  titleText: {
    fontSize: 30,
    color: "dimgray",
  },
  boxDollarSign: {
    fontSize: 15,
    // marginRight: 5,
  },
  totalText: {
    fontSize: 10,
    color: "darkgray",
  },
  boxText: {
    outlineWidth: 0,
    fontSize: 25,
    textAlign: "right",
    placeholderTextColor: "lightgray",
    // backgroundColor: "green",
    width: "90%",
  },
  buttonText: {
    fontSize: 13,
    fontWeight: Fonts.weight.textRegular,
  },
  boxStyle: {
    marginTop: 5,
    borderColor: Colors.tabMenuButton,
    borderWidth: 2,
    backgroundColor: "whitesmoke",
    padding: 5,
    width: 100,
    height: 50,
    alignItems: "space-between",
    justifyContent: "space-between",
    flexDirection: "row",
  },
  totalTextStyle: {
    marginTop: 15,
  },
  titleStyle: {
    marginTop: 20,
  },
  buttonRowStyle: {
    marginTop: 20,
  },
  statusText: {
    width: "80%",
    textAlign: "center",
    marginTop: 15,
    color: "green",
    fontSize: 15,
    fontWeight: 600,
  },
  loadingIndicatorStyle: {
    marginTop: 10,
  },
};

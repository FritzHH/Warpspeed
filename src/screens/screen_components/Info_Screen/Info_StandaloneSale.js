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
  gray,
  log,
  printBuilder,
  showAlert,
  trimToTwoDecimals,
} from "../../../utils";
import { useEffect, useState } from "react";
import { COLOR_GRADIENTS, Colors, Fonts, ICONS } from "../../../styles";
import { dbSavePrintObj } from "../../../db_calls_wrapper";

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
    >
      <View style={{ height: "85%", justifyContent: "center" }}>
        <Text style={{ fontSize: 72, color: gray(0.08) }}>{"SALE"}</Text>
      </View>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          width: "100%",
          height: "15%",
        }}
      >
        <Button_
          onPress={() => {
            useTabNamesStore.getState().setItems({
              infoTabName: TAB_NAMES.infoTab.customer,
              itemsTabName: TAB_NAMES.itemsTab.empty,
              optionsTabName: TAB_NAMES.optionsTab.workorders,
            });
          }}
          icon={ICONS.bicycle}
          iconSize={55}
          buttonStyle={{ marginBottom: 0, paddingLeft: 15 }}
        />
        <Button_
          icon={ICONS.expandGreen}
          onPress={() =>
            dbSavePrintObj(printBuilder.testReceipt(), "8C:77:3B:60:33:22")
          }
        />
      </View>
    </View>
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

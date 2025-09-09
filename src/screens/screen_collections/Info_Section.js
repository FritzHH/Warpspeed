/* eslint-disable */

import { FlatList, View } from "react-native-web";
import {} from "../../components";
import { Colors } from "../../styles";
import { TAB_NAMES, WORKORDER_PROTO } from "../../data";
import { ActiveWorkorderComponent } from "../screen_components/Info_Screen/Info_ActiveWorkorder";
import { NewWorkorderComponent } from "../screen_components/Info_Screen/Info_NewWorkorder";
import { CheckoutComponent } from "../screen_components/Info_Screen/Info_Checkout";
import React from "react";
import {
  useOpenWorkordersStore,
  useTabNamesStore,
  useCheckoutStore,
} from "../../stores";
import { clog } from "../../utils";

export const Info_Section = ({}) => {
  // store getters
  const zInfoTabName = useTabNamesStore((state) => state.getInfoTabName());
  const zOpenWorkorder = useOpenWorkordersStore((state) =>
    state.getOpenWorkorderObj()
  );

  function ScreenComponent(tabName) {
    switch (tabName) {
      case TAB_NAMES.infoTab.workorder:
        // if (zOpenWorkorder?.id) return <ActiveWorkorderComponent />;
        return <ActiveWorkorderComponent />;
        break;
      case TAB_NAMES.infoTab.customer:
        return <NewWorkorderComponent />;
      case TAB_NAMES.infoTab.checkout:
        return <CheckoutComponent />;
    }
    return null;
  }

  return ScreenComponent(zInfoTabName);
};

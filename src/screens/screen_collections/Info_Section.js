/* eslint-disable */

import { View } from "react-native-web";
import {} from "../../components";
import { Colors } from "../../styles";
import { TAB_NAMES, WORKORDER_PROTO } from "../../data";
import { Info_WorkorderComponent } from "../screen_components/Info_WorkorderComponent";
import { Info_CustomerInfoComponent } from "../screen_components/Info_CustomerInfoComponent";
import React from "react";
import {
  useCurrentWorkorderStore,
  useTabNamesStore,
  useCheckoutStore,
} from "../../stores";
import { Info_CheckoutComponent } from "../screen_components/Info_CheckoutComponent";

export const Info_Section = ({}) => {
  const zInfoTabName = useTabNamesStore((state) => state.getInfoTabName());
  let zOpenWorkorder = WORKORDER_PROTO;
  zOpenWorkorder = useCurrentWorkorderStore((state) => state.getWorkorderObj());

  return (
    <View style={{ height: "100%", backgroundColor: null }}>
      <View style={{ height: "50%", backgroundColor: null }}>
        {zInfoTabName === TAB_NAMES.infoTab.workorder ||
        (zOpenWorkorder?.id && !zOpenWorkorder.isStandalaloneSale) ? (
          <Info_WorkorderComponent />
        ) : null}
        {zInfoTabName === TAB_NAMES.infoTab.customer ? (
          <Info_CustomerInfoComponent />
        ) : null}
      </View>
      <View style={{ height: "50%" }}>
        <Info_CheckoutComponent />
      </View>
    </View>
  );
};

/* eslint-disable */

import { FlatList, View } from "react-native-web";
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
import { clog } from "../../utils";

export const Info_Section = ({}) => {
  const zInfoTabName = useTabNamesStore((state) => state.getInfoTabName());
  let zOpenWorkorder = WORKORDER_PROTO;
  zOpenWorkorder = useCurrentWorkorderStore((state) => state.getWorkorderObj());
  let zIsCheckingOut = useCheckoutStore((state) => state.getIsCheckingOut());

  const TopHalf = () => {
    if (
      zInfoTabName === TAB_NAMES.infoTab.workorder &&
      zOpenWorkorder &&
      !zOpenWorkorder.isStandaloneSale
    )
      return <Info_WorkorderComponent />;

    if (
      zInfoTabName === TAB_NAMES.infoTab.customer &&
      !zOpenWorkorder?.isStandaloneSale
    )
      return <Info_CustomerInfoComponent />;
  };

  return (
    <View style={{ height: "100%" }}>
      <View style={{ height: "50%", backgroundColor: null }}>
        <TopHalf />
      </View>
      <View style={{ height: "50%", backgroundColor: null }}>
        <Info_CheckoutComponent />
      </View>
    </View>
  );

  return (
    <View style={{ height: "100%", backgroundColor: null }}>
      {!zOpenWorkorder?.isStandaloneSale ? (
        <View
          style={{
            height: "50%",
            backgroundColor: null,
          }}
        >
          {zInfoTabName === TAB_NAMES.infoTab.workorder ||
          (zOpenWorkorder?.id && !zOpenWorkorder.isStandaloneSale) ? (
            <Info_WorkorderComponent />
          ) : null}
          {zInfoTabName === TAB_NAMES.infoTab.customer ? (
            <Info_CustomerInfoComponent />
          ) : null}
        </View>
      ) : null}
      <View
        style={{ height: zOpenWorkorder?.isStandaloneSale ? "100%" : "50%" }}
      >
        <Info_CheckoutComponent />
      </View>
    </View>
  );
};

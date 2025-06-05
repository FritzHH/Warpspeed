/* eslint-disable */

import {} from "react-native-web";
import {} from "../../components";
import { Colors } from "../../styles";
import { TAB_NAMES } from "../../data";
import { Info_WorkorderComponent } from "../screen_components/Info_WorkorderComponent";
import { CustomerInfoScreenComponent } from "../screen_components/Info_CustomerInfoComponent";
import React from "react";
import { useCurrentWorkorderStore, useTabNamesStore } from "../../stores";

export const Info_Section = ({}) => {
  const zInfoTabName = useTabNamesStore((state) => state.getInfoTabName());
  const zOpenWorkorder = useCurrentWorkorderStore((state) =>
    state.getWorkorderObj()
  );

  if (zInfoTabName === TAB_NAMES.infoTab.workorder || zOpenWorkorder?.id)
    return <Info_WorkorderComponent />;

  // if (zInfoTabName === TAB_NAMES.infoTab.customer) {
  return <CustomerInfoScreenComponent />;
  // }
};

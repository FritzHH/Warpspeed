/* eslint-disable */

import {} from "react-native-web";
import {} from "../../components";
import { Colors } from "../../styles";
import { TAB_NAMES } from "../../data";
import { Info_WorkorderComponent } from "../screen_components/Info_WorkorderComponent";
import { CustomerInfoScreenComponent } from "../screen_components/Info_CustomerInfoComponent";
import React from "react";
import { useTabNamesStore } from "../../stores";

export const Info_Section = ({
  ssCustomerObj,
  ssWorkorderObj,
  __setCustomerObj,
  __setWorkorderObj,
}) => {
  const zInfoTabName = useTabNamesStore((state) => state.getInfoTabName());

  if (zInfoTabName === TAB_NAMES.infoTab.workorder)
    return (
      <Info_WorkorderComponent
        ssCustomerObj={ssCustomerObj}
        __setCustomerObj={__setCustomerObj}
        __setWorkorderObj={__setWorkorderObj}
        ssWorkorderObj={ssWorkorderObj}
      />
    );

  if (zInfoTabName === TAB_NAMES.infoTab.customer) {
    return <CustomerInfoScreenComponent />;
  }
};

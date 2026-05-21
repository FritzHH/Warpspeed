/* eslint-disable */

import { AnimatedSwitch } from "../../dom_components";
import { Colors } from "../../styles";
import { TAB_NAMES, WORKORDER_PROTO } from "../../data";
import { ActiveWorkorderComponent } from "../screen_components/Info_Screen/Info_ActiveWorkorder";
import { NewWorkorderComponent } from "../screen_components/Info_Screen/Info_NewWorkorder";
import { StandaloneSaleComponent } from "../screen_components/Info_Screen/Info_StandaloneSale";
import React from "react";
import {
  useTabNamesStore,
} from "../../stores";

export const Info_Section = React.memo(({}) => {
  // store getters
  const zInfoTabName = useTabNamesStore((state) => state.infoTabName);

  function ScreenComponent(tabName) {
    switch (tabName) {
      case TAB_NAMES.infoTab.workorder:
        return <ActiveWorkorderComponent key={tabName} />;
      case TAB_NAMES.infoTab.customer:
        return <NewWorkorderComponent key={tabName} />;
      case TAB_NAMES.infoTab.checkout:
        return <StandaloneSaleComponent key={tabName} />;
    }
    return null;
  }

  return (
    <AnimatedSwitch animationType="fade" duration={200}>
      {ScreenComponent(zInfoTabName)}
    </AnimatedSwitch>
  );
});

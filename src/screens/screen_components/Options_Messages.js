/* eslint-disable */

import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from "react-native-web";
import { dim, log, trimToTwoDecimals } from "../../utils";
import {
  TabMenuDivider as Divider,
  ScreenModal,
  Button,
  InventoryItemInModal,
  CheckBox,
} from "../../components";
import { Colors } from "../../styles";
import {
  INVENTORY_ITEM_PROTO,
  INVENTORY_CATEGORIES,
  TAB_NAMES,
} from "../../data";
import { IncomingCustomerComponent } from "./Info_CustomerInfoComponent";
import React, { useEffect, useRef, useState } from "react";
import { cloneDeep } from "lodash";

export function MessagesComponent({ ssMessagesArr, __setMessagesArr }) {
  /////////////////////////////////////////////////////////////

  /////////////////////////////////

  //////////////////////////
  // functions
  ///////////////////////////

  // log("ssw", ssWorkorderObj);
  ///////////////////////////////////////////////////////////////
  /////////////////////////////////////////////////////////////////
  return (
    <View
      style={{ width: "100%", height: "100%", backgroundColor: "green" }}
    ></View>
  );
}

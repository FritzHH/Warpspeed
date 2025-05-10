import {
  View,
  Text,
  Pressable,
  TextInput,
  FlatList,
  TouchableOpacity,
  Button,
} from "react-native-web";
import { dim, log, trimToTwoDecimals } from "../../utils";
import {
  TabMenuDivider as Divider,
  ModalDropdown,
  TextInputOnMainBackground,
  TextInputLabelOnMainBackground,
} from "../../components";
import { Colors } from "../../styles";
import {
  bike_colors_db,
  bike_brands_db,
  CUSTOMER_PROTO,
  bike_descriptions_db,
  discounts_db,
  part_sources_db,
  WORKORDER_PROTO,
  WORKORDER_ITEM_PROTO,
  COLLECTION_NAMES,
  INFO_COMPONENT_NAMES,
  TAB_NAMES,
} from "../../data";
import { Info_WorkorderComponent } from "../screen_components/Info_WorkorderComponent";
import {
  getFirestore,
  collection,
  addDoc,
  doc,
  setDoc,
} from "firebase/firestore";
import { initializeApp } from "firebase/app";
import {
  getCollectionItem,
  getNewCollectionRef,
  setCollectionItem,
} from "../../dbCalls";

import { CustomerInfoScreenComponent } from "../screen_components/Info_CustomerInfoComponent";
import React from "react";
import { cloneDeep } from "lodash";

export const Info_Section = ({
  ssCustomerObj,
  ssWorkorderObj,
  ssCustomersArr,
  ssSelectedCustomerSearchItem,
  ssInfoComponentName,
  __setInfoComponentName,
  __setCustomerObj,
  __setWorkorderObj,
  __createNewCustomer,
  __setOptionsTabName,
  __setCustomerSearchArr,
  __setItemsTabName,
}) => {
  function createNewCustomer(newCustomerObj) {
    __createNewCustomer(newCustomerObj);
    __setInfoComponentName(INFO_COMPONENT_NAMES.workorder);
  }

  function createNewWorkorderBtnPressed(customerObj) {
    __setWorkorderObj(WORKORDER_PROTO);
    __setCustomerObj(customerObj);
    __setInfoComponentName(INFO_COMPONENT_NAMES.phoneNumberEntry);
    __setOptionsTabName(TAB_NAMES.optionsTab.quickItems);
  }

  if (ssInfoComponentName === INFO_COMPONENT_NAMES.workorder)
    return (
      <Info_WorkorderComponent
        ssCustomerObj={ssCustomerObj}
        __setCustomerObj={__setCustomerObj}
        __setWorkorderObj={__setWorkorderObj}
        ssWorkorderObj={ssWorkorderObj}
        __handleCreateNewWorkorderPressed={createNewWorkorderBtnPressed}
      />
    );

  if (ssInfoComponentName === INFO_COMPONENT_NAMES.phoneNumberEntry) {
    // __setItemsTabName(TAB_NAMES.itemsTab.customerList);
    return (
      <CustomerInfoScreenComponent
        __createNewCustomer={(obj) => createNewCustomer(obj)}
        __setCustomerSearchArr={__setCustomerSearchArr}
        ssCustomersArr={ssCustomersArr}
        ssSelectedCustomerSearchItem={ssSelectedCustomerSearchItem}
      />
    );
  }
};

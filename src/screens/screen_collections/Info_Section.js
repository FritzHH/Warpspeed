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
  BIKE_COLORS,
  BRANDS,
  CUSTOMER,
  BIKE_DESCRIPTIONS,
  DISCOUNTS,
  PART_SOURCES,
  WORKORDER,
  WORKORDER_ITEM,
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

import { NewCustomerComponent } from "../screen_components/Info_CreateNewCustomerComponent";
import React from "react";
import { cloneDeep } from "lodash";

const firebaseConfig = {
  apiKey: "AIzaSyCFqFF3wG-8yNT8Z2O_j8ksL1SWxj9U0gg",
  authDomain: "warpspeed-original.firebaseapp.com",
  projectId: "warpspeed-original",
  storageBucket: "warpspeed-original.firebasestorage.app",
  messagingSenderId: "499618567073",
  appId: "1:499618567073:web:4e2ca2cf293cb6d96831e0",
  measurementId: "G-7SSYMNGKQS",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const Info_Section = ({
  ssCustomerObj,
  ssWorkorderObj,
  __setCustomerObj,
  __setWorkorderObj,
  __createNewCustomer,
  __setOptionsTabName,
}) => {
  const [sInfoComponentName, _setInfoComponentName] = React.useState(
    INFO_COMPONENT_NAMES.phoneNumberEntry
  );
  const [sNewCustomerObj, _setNewCustomerObj] = React.useState(CUSTOMER);
  // const[sCreateNewWorkorderPressed, _setCreateNewWorkorderPressed] = React.useState(false)
  let Component = null;

  function createNewCustomer(newCustomerObj) {
    // log("creating", newCustomerObj);
    __createNewCustomer(newCustomerObj);
    _setInfoComponentName(INFO_COMPONENT_NAMES.workorder);
  }

  function createNewWorkorderBtnPressed() {
    // _setInfoComponentName(INFO_COMPONENT_NAMES.phoneNumberEntry);
    __setWorkorderObj(cloneDeep(WORKORDER));
    __setCustomerObj(cloneDeep(CUSTOMER));
    _setInfoComponentName(INFO_COMPONENT_NAMES.phoneNumberEntry);
    __setOptionsTabName(TAB_NAMES.optionsTab.quickItems);
  }

  if (sInfoComponentName === INFO_COMPONENT_NAMES.workorder)
    return (
      <Info_WorkorderComponent
        ssCustomerObj={ssCustomerObj}
        __setCustomerObj={__setCustomerObj}
        __setWorkorderObj={__setWorkorderObj}
        ssWorkorderObj={ssWorkorderObj}
        __handleCreateNewWorkorderPressed={createNewWorkorderBtnPressed}

        // __handleExitScreenPressed={() => _setInfoComponentName(INFO_COMPONENT_NAMES.workorder)}
      />
    );

  if (sInfoComponentName === INFO_COMPONENT_NAMES.phoneNumberEntry)
    return (
      <NewCustomerComponent
        __createNewCustomer={(obj) => createNewCustomer(obj)}
        _setInfoComponentName={(name) => log("name", name)}
      />
    );

  return <Component />;
};

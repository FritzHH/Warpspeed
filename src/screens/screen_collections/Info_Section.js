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
  DB_DIRECTORY,
  INFO_COMPONENT_NAMES,
} from "../../data";
import { Info_MainComponent } from "../screen_components/Info_MainComponent";
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

import { NewCustomerComponent as IncomingCustomerComponent } from "../screen_components/Info_CreateNewWorkorderComponent";
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
  ssInfoComponentName,
  __setInfoComponentName,
  __setCustomerObj,
  __setWorkorderObj,
}) => {
  let Component = null;

  let Workorder_Component = () => (
    <Info_MainComponent
      ssCustomerObj={ssCustomerObj}
      ssWorkorderObj={ssWorkorderObj}
      __setCustomerObj={__setCustomerObj}
      __setWorkorderObj={__setWorkorderObj}
    />
  );

  let Incoming_Cust_Component = () => (
    <IncomingCustomerComponent
      __setInfoComponentName={__setInfoComponentName}
      ssInfoComponentName={ssInfoComponentName}
    />
  );

  if (ssInfoComponentName === INFO_COMPONENT_NAMES.workorder)
    Component = Workorder_Component;

  if (ssInfoComponentName === INFO_COMPONENT_NAMES.phoneNumberEntry)
    Component = Incoming_Cust_Component;

  return <Component />;
};

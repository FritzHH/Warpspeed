/* eslint-disable */
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { BrowserRouter, Route, Routes, Link } from "react-router-dom";

import { WorkorderScreen } from "./screens/Workorder";
import { View } from "react-native-web";

// const firebaseConfig = {
//   apiKey: "AIzaSyCFqFF3wG-8yNT8Z2O_j8ksL1SWxj9U0gg",
//   authDomain: "warpspeed-original.firebaseapp.com",
//   projectId: "warpspeed-original",
//   storageBucket: "warpspeed-original.firebasestorage.app",
//   messagingSenderId: "499618567073",
//   appId: "1:499618567073:web:4e2ca2cf293cb6d96831e0",
//   measurementId: "G-7SSYMNGKQS",
// };

// // Initialize Firebase
// const app = initializeApp(firebaseConfig);
// const analytics = getAnalytics(app);

export const ROUTES = {
  init: "/",
};

import { formatDateTime, generateRandomID, log } from "./utils";
import { cloneDeep } from "lodash";
import { COLLECTION_NAMES, RECEIPT_WORKORDER_PROTO } from "./data";
import {
  getNewCollectionRef,
  setCollectionItem,
  setSubCollectionItem,
} from "./dbCalls";

function App() {
  let proto = cloneDeep(RECEIPT_WORKORDER_PROTO);
  proto.dateTime = formatDateTime(new Date()).topTicketDateTimeString;
  (proto.workorderNumber = "1234"),
    (proto.customerContactBlurb =
      "Customer Name \n(239) 336 9177 \n123 Bonita Beach Rd \nNaples, FL");
  proto.workorderItem = "Trek Hybrid";
  proto.startedOnStr = formatDateTime(new Date()).topTicketDateTimeString;
  proto.itemArr = [
    { item: "Brake cable", price: "2.00", qty: 2, discount: "" },
  ];
  proto.laborCharges = "22.90";
  proto.partsCharges = "43.44";
  proto.taxCharges = "4.34";
  proto.total = "76.56";
  proto.customerNotes =
    "please was the damn bike and shit also \nclean the chain";
  proto.internalNotes =
    "The chain is falling off and so on and so forth so keep an eye on that or else bad shit will happen";
  proto.barcode = "123432756456";
  proto.id = generateRandomID();
  log("proto", proto);

  // setSubCollectionItem(
  //   COLLECTION_NAMES.printers.collectionName,
  //   "Left-Desk-Printer",
  //   "to-print",
  //   proto.id,
  //   proto
  // );

  return (
    <BrowserRouter>
      <Routes>
        <Route path={ROUTES.init} element={<WorkorderScreen />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

/* eslint-disable */

import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native-web";
import { C } from "../styles";
import { gray } from "../utils";
import { useSettingsStore } from "../stores";
import { firestoreSubscribeCollection, firestoreDelete, firestoreWrite, firestoreRead } from "../db_calls";
import { DB_NODES } from "../constants";
import { ROUTES } from "../routes";
import { cloneDeep } from "lodash";
import { formatCurrencyDisp } from "../utils";

const COLLECTIONS = [
  { key: "activeSales", label: "active-sales", node: DB_NODES.FIRESTORE.ACTIVE_SALES },
  { key: "completedSales", label: "completed-sales", node: DB_NODES.FIRESTORE.COMPLETED_SALES },
  { key: "openWorkorders", label: "open-workorders", node: DB_NODES.FIRESTORE.OPEN_WORKORDERS },
  { key: "completedWorkorders", label: "completed-workorders", node: DB_NODES.FIRESTORE.COMPLETED_WORKORDERS },
  { key: "customers", label: "customers", node: DB_NODES.FIRESTORE.CUSTOMERS },
  { key: "transactions", label: "transactions", node: DB_NODES.FIRESTORE.TRANSACTIONS },
];

const NOTIFY_HINT = " ";

const FRESH_WORKORDERS_DATA = {
  activeSales: [],
  completedSales: [],
  completedWorkorders: [],
  transactions: [],
  openWorkorders: [
    {"id":"1250000000008","hasNewSMS":false,"customerID":"b3cffc73-e0c0-4540-b1ad-1eb0578f88b5","customerContactRestriction":"email","partToBeOrdered":false,"customerLast":"Hieb","endedOnMillis":"","workorderLines":[{"warranty":false,"inventoryItem":{"cost":919,"salePrice":0,"customLabor":false,"primaryBarcode":"0727746323980","informalName":"","minutes":0,"category":"Part","brand":"","barcodes":[],"price":1878,"customPart":false,"id":"0727746323980","formalName":"TUBE SUNLT 26x2.75-3.00 SV32 FFW73mm"},"qty":1,"id":"ed6341b5-9dad-4dc6-a352-5065e0048f55","intakeNotes":"","useSalePrice":false,"receiptNotes":"","discountObj":""},{"inventoryItem":{"barcodes":[],"price":939,"customPart":false,"id":"0609149894831","formalName":"TUBE SUNLT 700x35-43 SV48mm FFW33mm","minutes":0,"category":"Part","brand":"","cost":289,"customLabor":false,"salePrice":0,"primaryBarcode":"0609149894831","informalName":""},"warranty":false,"intakeNotes":"","id":"83f308f3-ffe0-448b-90f6-68a34d461137","useSalePrice":false,"qty":1,"discountObj":"","receiptNotes":""},{"receiptNotes":"","discountObj":"","qty":2,"id":"d371a46d-5cbc-4167-802d-a83da807f07e","useSalePrice":false,"intakeNotes":"","warranty":false,"inventoryItem":{"minutes":0,"category":"Part","brand":"","barcodes":[],"customPart":false,"price":4000,"id":"0047853643756","formalName":"TIRE KEN KWICK TRAX 700x28 BK/BK/REF SRC/ICAP/60 WIRE 100psi","cost":2149,"salePrice":0,"customLabor":false,"primaryBarcode":"0047853643756","informalName":""}},{"receiptNotes":"","discountObj":{"name":"50% Off Item","type":"%","id":"1333k","newPrice":2500,"savings":2500,"value":"50"},"qty":2,"useSalePrice":false,"id":"efa92d35-1d94-4cd9-b0b6-8903f0313d52","intakeNotes":"","warranty":false,"inventoryItem":{"cost":1850,"customLabor":false,"salePrice":0,"informalName":"","primaryBarcode":"0072774596072","price":2500,"customPart":false,"barcodes":[],"id":"0072774596072","formalName":"TIRE SUNLT 26x2.25 BK/BK CRUISER K912 w/SUN LOGO WIRE","minutes":0,"brand":"","category":"Part"}},{"discountObj":"","receiptNotes":"","id":"5799981c-741b-45c5-8572-3c60706d5a8a","intakeNotes":"","useSalePrice":false,"qty":1,"inventoryItem":{"cost":1089,"customLabor":false,"salePrice":0,"primaryBarcode":"0072774600083","informalName":"","barcodes":[],"customPart":false,"price":3000,"id":"0072774600083","formalName":"TIRE SUNLT 700x38 BK/BK HYBRID K189 WIRE","minutes":0,"category":"Part","brand":""},"warranty":false},{"qty":1,"intakeNotes":"","id":"73ae3784-0fe0-4e72-899f-13578d9ab295","useSalePrice":false,"receiptNotes":"","discountObj":"","warranty":false,"inventoryItem":{"cost":249,"customLabor":false,"salePrice":0,"primaryBarcode":"0727740637890","informalName":"","barcodes":[],"customPart":false,"price":939,"id":"0727740637890","formalName":"TUBE SUNLT 700x28-35 (27x1-1/8x1-1/4) SV32 FFW30mm","minutes":0,"category":"Part","brand":""}},{"inventoryItem":{"primaryBarcode":"0330312449090","informalName":"","customLabor":false,"salePrice":0,"cost":249,"formalName":"TUBE SUNLT UTILIT 20x1.50-1.95 SV48 FFW 39mm","id":"0330312449090","barcodes":[],"customPart":false,"price":939,"category":"Part","brand":"","minutes":0},"warranty":false,"intakeNotes":"","id":"f7dcc26e-e209-4ddd-a352-4921c8f9727d","useSalePrice":false,"qty":1,"discountObj":"","receiptNotes":""}],"brand":"","description":"","activeSaleID":"","customerLandline":"","saleID":"","customerFirst":"Fritz","taxFreeReceiptNote":"","customerNotes":[],"partOrderEstimateMillis":"","waitTimeEstimateLabel":"","workorderNumber":"W12500APR26","startedOnMillis":1775268823968,"customerEmail":"hieb.fritz@gmail.com","internalNotes":[],"status":"finished","partOrderedMillis":"","color2":{"textColor":"","backgroundColor":"","label":""},"waitTime":"","media":[],"customerLanguage":"English","customerPin":"908","paidOnMillis":"","taxFree":false,"customerCell":"2393369177","paymentComplete":false,"changeLog":["Started by: Fritz Hieb",{"field":"status","to":"Finished","timestamp":1775268828419,"from":"Newly Created","user":"System","action":"changed"},{"to":"TUBE SUNLT 26x2.75-3.00 SV32 FFW73mm","field":"workorderLines","timestamp":1775268833697,"user":"Fritz","action":"added"},{"to":"TUBE SUNLT 700x35-43 SV48mm FFW33mm","field":"workorderLines","timestamp":1775268836136,"user":"Fritz","action":"added"},{"timestamp":1775268841923,"field":"workorderLines","to":"TIRE KEN KWICK TRAX 700x28 BK/BK/REF SRC/ICAP/60 WIRE 100psi","action":"added","user":"Fritz"},{"user":"Fritz","action":"added","field":"workorderLines","to":"TIRE SUNLT 26x2.25 BK/BK CRUISER K912 w/SUN LOGO WIRE","timestamp":1775268845473},{"field":"workorderLines","to":"TIRE SUNLT 700x38 BK/BK HYBRID K189 WIRE","timestamp":1775268850058,"user":"Fritz","action":"added"},{"to":"TUBE SUNLT 700x28-35 (27x1-1/8x1-1/4) SV32 FFW30mm","field":"workorderLines","timestamp":1775268856563,"user":"Fritz","action":"added"},{"user":"Fritz","action":"added","field":"workorderLines","to":"TUBE SUNLT UTILIT 20x1.50-1.95 SV48 FFW 39mm","timestamp":1775268861661},{"user":"Fritz","action":"changed","from":"1","detail":"qty","to":"2","field":"workorderLines","item":"TIRE SUNLT 26x2.25 BK/BK CRUISER K912 w/SUN LOGO WIRE","timestamp":1775269215353},{"user":"Fritz","action":"changed","from":"1","detail":"qty","to":"2","item":"TIRE KEN KWICK TRAX 700x28 BK/BK/REF SRC/ICAP/60 WIRE 100psi","field":"workorderLines","timestamp":1775269223605},{"user":"Fritz","action":"changed","to":"50% Off Item","item":"TIRE SUNLT 26x2.25 BK/BK CRUISER K912 w/SUN LOGO WIRE","field":"workorderLines","timestamp":1775269232910,"from":"none","detail":"discount"}],"archived":false,"partOrdered":"","startedBy":"Fritz Hieb","color1":{"textColor":"","label":"","backgroundColor":""},"partSource":""},
    {"id":"1350000000005","archived":false,"partOrdered":"","partSource":"","color1":{"backgroundColor":"","label":"","textColor":""},"startedBy":"Fritz Hieb","partOrderedMillis":"","status":"newly_created","internalNotes":[],"media":[],"color2":{"textColor":"","label":"","backgroundColor":""},"waitTime":"","changeLog":["Started by: Fritz Hieb",{"action":"added","user":"Fritz","timestamp":1775269035868,"field":"workorderLines","to":"TUBE SUNLT 26x2.75-3.00 SV32 FFW73mm"},{"user":"Fritz","action":"added","field":"workorderLines","to":"TUBE SUNLT 700x35-43 SV48mm FFW33mm","timestamp":1775269039069},{"user":"Fritz","action":"added","field":"workorderLines","to":"TIRE KEN KWICK TRAX 700x28 BK/BK/REF SRC/ICAP/60 WIRE 100psi","timestamp":1775269042864},{"field":"workorderLines","to":"TIRE SUNLT 26x2.25 BK/BK CRUISER K912 w/SUN LOGO WIRE","timestamp":1775269046941,"user":"Fritz","action":"added"},{"to":"TIRE SUNLT 700x38 BK/BK HYBRID K189 WIRE","field":"workorderLines","timestamp":1775269052526,"user":"Fritz","action":"added"},{"user":"Fritz","action":"changed","to":"2","item":"TIRE SUNLT 26x2.25 BK/BK CRUISER K912 w/SUN LOGO WIRE","field":"workorderLines","timestamp":1775269057872,"from":"1","detail":"qty"},{"timestamp":1775269065284,"field":"workorderLines","to":"TUBE SUNLT 700x28-35 (27x1-1/8x1-1/4) SV32 FFW30mm","action":"added","user":"Fritz"},{"to":"TUBE SUNLT UTILIT 20x1.50-1.95 SV48 FFW 39mm","field":"workorderLines","timestamp":1775269070444,"user":"Fritz","action":"added"},{"item":"TUBE SUNLT 700x28-35 (27x1-1/8x1-1/4) SV32 FFW30mm","field":"workorderLines","to":"40% Off Item","timestamp":1775269077799,"from":"none","detail":"discount","user":"Fritz","action":"changed"},{"action":"changed","user":"Fritz","timestamp":1775269085133,"to":"2","field":"workorderLines","item":"TUBE SUNLT 700x28-35 (27x1-1/8x1-1/4) SV32 FFW30mm","detail":"qty","from":"1"}],"paymentComplete":false,"customerCell":"2393369177","taxFree":false,"customerLanguage":"English","paidOnMillis":"","customerPin":"776","customerFirst":"Fritz","saleID":"","customerLandline":"","customerNotes":[],"taxFreeReceiptNote":"","workorderNumber":"W13500APR26","waitTimeEstimateLabel":"","partOrderEstimateMillis":"","startedOnMillis":1775269024302,"customerEmail":"hieb.fritz@gmail.com","customerContactRestriction":"email","customerID":"b3cffc73-e0c0-4540-b1ad-1eb0578f88b5","hasNewSMS":false,"workorderLines":[{"qty":1,"id":"954a31fe-aea2-467a-b61a-bba9d0784dcb","intakeNotes":"","useSalePrice":false,"receiptNotes":"","discountObj":"","warranty":false,"inventoryItem":{"primaryBarcode":"0727746323980","informalName":"","customLabor":false,"salePrice":0,"cost":919,"formalName":"TUBE SUNLT 26x2.75-3.00 SV32 FFW73mm","id":"0727746323980","barcodes":[],"customPart":false,"price":1878,"brand":"","category":"Part","minutes":0}},{"receiptNotes":"","discountObj":"","qty":1,"intakeNotes":"","useSalePrice":false,"id":"e8a519dd-8ec1-4ce8-806f-6316c0daec33","warranty":false,"inventoryItem":{"customLabor":false,"salePrice":0,"cost":289,"primaryBarcode":"0609149894831","informalName":"","minutes":0,"brand":"","category":"Part","id":"0609149894831","barcodes":[],"customPart":false,"price":939,"formalName":"TUBE SUNLT 700x35-43 SV48mm FFW33mm"}},{"warranty":false,"inventoryItem":{"barcodes":[],"price":4000,"customPart":false,"id":"0047853643756","formalName":"TIRE KEN KWICK TRAX 700x28 BK/BK/REF SRC/ICAP/60 WIRE 100psi","minutes":0,"category":"Part","brand":"","cost":2149,"salePrice":0,"customLabor":false,"primaryBarcode":"0047853643756","informalName":""},"qty":1,"useSalePrice":false,"id":"05bf69b7-119c-4941-87ba-8f6920395602","intakeNotes":"","receiptNotes":"","discountObj":""},{"warranty":false,"inventoryItem":{"brand":"","category":"Part","minutes":0,"formalName":"TIRE SUNLT 26x2.25 BK/BK CRUISER K912 w/SUN LOGO WIRE","barcodes":[],"price":2500,"customPart":false,"id":"0072774596072","primaryBarcode":"0072774596072","informalName":"","cost":1850,"salePrice":0,"customLabor":false},"receiptNotes":"","discountObj":"","qty":2,"useSalePrice":false,"intakeNotes":"","id":"fb20949c-4bc3-4e04-86bb-18ad1ec9042e"},{"qty":1,"id":"41fafa82-a78c-4363-b99f-a2d79e5a5f73","useSalePrice":false,"intakeNotes":"","receiptNotes":"","discountObj":"","warranty":false,"inventoryItem":{"cost":1089,"customLabor":false,"salePrice":0,"primaryBarcode":"0072774600083","informalName":"","minutes":0,"category":"Part","brand":"","barcodes":[],"customPart":false,"price":3000,"id":"0072774600083","formalName":"TIRE SUNLT 700x38 BK/BK HYBRID K189 WIRE"}},{"warranty":false,"inventoryItem":{"minutes":0,"brand":"","category":"Part","id":"0727740637890","customPart":false,"price":939,"barcodes":[],"formalName":"TUBE SUNLT 700x28-35 (27x1-1/8x1-1/4) SV32 FFW30mm","salePrice":0,"customLabor":false,"cost":249,"informalName":"","primaryBarcode":"0727740637890"},"qty":2,"intakeNotes":"","id":"2530388d-2176-40f4-b0c2-6654edd13b37","useSalePrice":false,"receiptNotes":"","discountObj":{"value":"40","name":"40% Off Item","newPrice":1127,"type":"%","id":"3943933","savings":751}},{"inventoryItem":{"minutes":0,"category":"Part","brand":"","id":"0330312449090","barcodes":[],"customPart":false,"price":939,"formalName":"TUBE SUNLT UTILIT 20x1.50-1.95 SV48 FFW 39mm","salePrice":0,"customLabor":false,"cost":249,"primaryBarcode":"0330312449090","informalName":""},"warranty":false,"discountObj":"","receiptNotes":"","intakeNotes":"","useSalePrice":false,"id":"d9c0bd0a-5d2f-4de4-9c38-9c8024514c47","qty":1}],"endedOnMillis":"","partToBeOrdered":false,"customerLast":"Hieb","description":"","brand":"","activeSaleID":""},
  ],
  customers: [
    {"id":"b3cffc73-e0c0-4540-b1ad-1eb0578f88b5","deposits":[],"unit":"#101","first":"Fritz","sales":[],"payments":[],"state":"FL","contactRestriction":"email","customerCell":"2393369177","last":"Hieb","gatedCommunity":true,"millisCreated":1774882480742,"interactionRating":"","language":"English","addressNotes":"","workorders":["1250000000008","1350000000005"],"previousBikes":[],"customerLandline":"","credits":[{"text":"test credit","amountCents":1500,"reservedCents":0,"id":"3587818371920","millis":1775178911702}],"city":"Bonita Springs","notes":"Bonita Bay","streetAddress":"13660 Bonita Beach Rd SE","email":"hieb.fritz@gmail.com","zip":"34135"},
  ],
};

const START_HERE_DATA = {
  activeSales: [],
  completedSales: [],
  completedWorkorders: [],
  openWorkorders: [
    {"id":"1450000000002","waitTimeEstimateLabel":"","customerCell":"2393369177","activeSaleID":"","partToBeOrdered":false,"customerPin":"439","customerLandline":"2392222222","status":"finished","taxFree":false,"paymentComplete":false,"internalNotes":[],"customerLast":"Hieb","workorderLines":[{"useSalePrice":false,"id":"aec217a0-2272-4f92-94fa-3a860e48bace","qty":1,"discountObj":"","receiptNotes":"","intakeNotes":"","warranty":false,"inventoryItem":{"barcodes":[],"customPart":false,"informalName":"","id":"0727746323980","formalName":"TUBE SUNLT 26x2.75-3.00 SV32 FFW73mm","salePrice":0,"cost":919,"brand":"","category":"Part","primaryBarcode":"0727746323980","price":1878,"minutes":0,"customLabor":false}},{"useSalePrice":false,"inventoryItem":{"barcodes":[],"customPart":false,"informalName":"","id":"0609149894831","formalName":"TUBE SUNLT 700x35-43 SV48mm FFW33mm","salePrice":0,"cost":289,"brand":"","category":"Part","primaryBarcode":"0609149894831","price":939,"minutes":0,"customLabor":false},"warranty":false,"receiptNotes":"","discountObj":"","intakeNotes":"","id":"78c08995-81be-419f-a88e-fe1ce753480c","qty":1},{"useSalePrice":false,"qty":1,"id":"a8ba2356-9b94-47c1-afce-edf053318052","discountObj":"","receiptNotes":"","intakeNotes":"","warranty":false,"inventoryItem":{"barcodes":[],"customPart":false,"informalName":"","id":"0047853643756","formalName":"TIRE KEN KWICK TRAX 700x28 BK/BK/REF SRC/ICAP/60 WIRE 100psi","salePrice":0,"brand":"","cost":2149,"primaryBarcode":"0047853643756","category":"Part","price":4000,"minutes":0,"customLabor":false}},{"useSalePrice":false,"id":"5b506450-4afb-4f77-a944-0440f0ea0ef6","qty":2,"receiptNotes":"","intakeNotes":"","discountObj":{"value":"30","savings":563,"type":"%","newPrice":1315,"name":"30% Off Item","id":"394393d"},"warranty":false,"inventoryItem":{"formalName":"TUBE SUNLT 700x28-35 (27x1-1/8x1-1/4) SV32 FFW30mm","salePrice":0,"primaryBarcode":"0727740637890","category":"Part","price":939,"cost":249,"brand":"","minutes":0,"customLabor":false,"customPart":false,"barcodes":[],"informalName":"","id":"0727740637890"}},{"useSalePrice":false,"id":"f9e3590e-ede0-41eb-b61f-eea1a950ad02","qty":2,"receiptNotes":"","discountObj":"","intakeNotes":"","warranty":false,"inventoryItem":{"customLabor":false,"minutes":0,"cost":249,"brand":"","price":939,"primaryBarcode":"0330312449090","category":"Part","salePrice":0,"formalName":"TUBE SUNLT UTILIT 20x1.50-1.95 SV48 FFW 39mm","id":"0330312449090","informalName":"","barcodes":[],"customPart":false}}],"startedBy":"Fritz Hieb","taxFreeReceiptNote":"","waitTime":"","customerEmail":"hieb.fritz@gmail.com","color2":{"textColor":"","label":"","backgroundColor":""},"hasNewSMS":false,"media":[],"customerFirst":"Fritz","customerLanguage":"English","customerContactRestriction":"","salesTax":"","description":"","workorderNumber":"W14500APR26","partOrdered":"","customerID":"48ce95ce-28e7-4418-b08c-24e3c749d98d","archived":false,"endedOnMillis":"","customerNotes":[],"saleID":"","startedOnMillis":1775303488345,"changeLog":["Started by: Fritz Hieb",{"action":"changed","to":"Finished","field":"status","user":"Fritz","from":"Newly Created","timestamp":1775303494841},{"timestamp":1775303498920,"user":"Fritz","action":"added","field":"workorderLines","to":"TUBE SUNLT 26x2.75-3.00 SV32 FFW73mm"},{"to":"TUBE SUNLT 700x35-43 SV48mm FFW33mm","field":"workorderLines","action":"added","timestamp":1775303500545,"user":"Fritz"},{"user":"Fritz","timestamp":1775303503493,"action":"added","field":"workorderLines","to":"TIRE KEN KWICK TRAX 700x28 BK/BK/REF SRC/ICAP/60 WIRE 100psi"},{"timestamp":1775303573280,"user":"Fritz","field":"workorderLines","to":"TUBE SUNLT 700x28-35 (27x1-1/8x1-1/4) SV32 FFW30mm","action":"added"},{"timestamp":1775303575690,"user":"Fritz","to":"TUBE SUNLT UTILIT 20x1.50-1.95 SV48 FFW 39mm","field":"workorderLines","action":"added"},{"from":"1","item":"TUBE SUNLT UTILIT 20x1.50-1.95 SV48 FFW 39mm","timestamp":1775303589533,"detail":"qty","user":"Fritz","action":"changed","to":"2","field":"workorderLines"},{"field":"workorderLines","to":"2","action":"changed","user":"Fritz","detail":"qty","item":"TUBE SUNLT 700x28-35 (27x1-1/8x1-1/4) SV32 FFW30mm","timestamp":1775303594191,"from":"1"},{"from":"none","item":"TUBE SUNLT 700x28-35 (27x1-1/8x1-1/4) SV32 FFW30mm","timestamp":1775303599603,"detail":"discount","user":"Fritz","action":"changed","to":"30% Off Item","field":"workorderLines"}],"paidOnMillis":"","partOrderedMillis":"","partOrderEstimateMillis":"","partSource":"","brand":"","color1":{"textColor":"","backgroundColor":"","label":""}},
    {"id":"1550000000009","waitTimeEstimateLabel":"","customerPin":"900","partToBeOrdered":false,"activeSaleID":"","customerCell":"2393369177","internalNotes":[],"customerLast":"Hieb","customerLandline":"2392222222","paymentComplete":false,"taxFree":false,"status":"finished","startedBy":"Fritz Hieb","taxFreeReceiptNote":"","workorderLines":[{"useSalePrice":false,"id":"1c7bbe73-2d0a-4b7c-88ed-358ae0c63e95","qty":1,"receiptNotes":"","discountObj":"","intakeNotes":"","warranty":false,"inventoryItem":{"salePrice":0,"formalName":"TUBE SUNLT 700x28-35 (27x1-1/8x1-1/4) SV32 FFW30mm","customLabor":false,"minutes":0,"cost":249,"brand":"","price":939,"primaryBarcode":"0727740637890","category":"Part","barcodes":[],"customPart":false,"id":"0727740637890","informalName":""}},{"useSalePrice":false,"id":"aedf113b-c57d-4c7e-b00d-5295b6cacca4","qty":1,"receiptNotes":"","discountObj":"","intakeNotes":"","inventoryItem":{"price":939,"primaryBarcode":"0330312449090","category":"Part","cost":249,"brand":"","customLabor":false,"minutes":0,"salePrice":0,"formalName":"TUBE SUNLT UTILIT 20x1.50-1.95 SV48 FFW 39mm","id":"0330312449090","informalName":"","customPart":false,"barcodes":[]},"warranty":false},{"receiptNotes":"","intakeNotes":"","discountObj":"","qty":1,"id":"fb3c916b-2631-49d0-ac33-b9e9c86ae59c","warranty":false,"inventoryItem":{"minutes":0,"customLabor":false,"brand":"","cost":919,"primaryBarcode":"0727746323980","category":"Part","price":1878,"formalName":"TUBE SUNLT 26x2.75-3.00 SV32 FFW73mm","salePrice":0,"informalName":"","id":"0727746323980","barcodes":[],"customPart":false},"useSalePrice":false},{"intakeNotes":"","receiptNotes":"","discountObj":"","qty":1,"id":"55f5acfc-b545-40bc-85d5-7ce50de546d7","inventoryItem":{"customLabor":false,"minutes":0,"cost":289,"brand":"","price":939,"primaryBarcode":"0609149894831","category":"Part","salePrice":0,"formalName":"TUBE SUNLT 700x35-43 SV48mm FFW33mm","id":"0609149894831","informalName":"","barcodes":[],"customPart":false},"warranty":false,"useSalePrice":false},{"qty":1,"id":"67e1114f-0924-405d-9c6b-6dbc233a14af","intakeNotes":"","receiptNotes":"","discountObj":"","inventoryItem":{"id":"0193751005926","informalName":"","barcodes":[],"customPart":false,"cost":4059,"brand":"","price":7000,"category":"Part","primaryBarcode":"0193751005926","customLabor":false,"minutes":0,"salePrice":0,"formalName":"TIRE LINER TANNUS ARMOUR INSERT 24x3.0-4.0"},"warranty":false,"useSalePrice":false},{"warranty":false,"inventoryItem":{"formalName":"TIRE SUNLT 26x2.125 BK/BK STREET K130 WIRE","salePrice":0,"minutes":0,"customLabor":false,"brand":"","cost":1399,"primaryBarcode":"0072774592340","category":"Part","price":2500,"barcodes":[],"customPart":false,"informalName":"","id":"0072774592340"},"discountObj":"","receiptNotes":"","intakeNotes":"","qty":2,"id":"469cdd4c-0796-4b4a-8cc2-1e622f46b2e4","useSalePrice":false},{"useSalePrice":false,"receiptNotes":"","intakeNotes":"","discountObj":"","id":"12d42a36-5ff5-44c6-8781-76265b951be3","qty":2,"warranty":false,"inventoryItem":{"primaryBarcode":"0072774598441","category":"Part","price":3000,"cost":1299,"brand":"","minutes":0,"customLabor":false,"formalName":"TIRE SUNLT 26x2.125 CST241 BK/BLK CRUISER WIRE","salePrice":0,"informalName":"","id":"0072774598441","customPart":false,"barcodes":[]}},{"inventoryItem":{"formalName":"TIRE SUNLT UTILIT 16x2.125 BK/BK ALPHABITE H518 WIRE","salePrice":0,"brand":"","cost":649,"primaryBarcode":"0124592505733","category":"Part","price":1500,"minutes":0,"customLabor":false,"barcodes":[],"customPart":false,"informalName":"","id":"0124592505733"},"warranty":false,"intakeNotes":"","receiptNotes":"","discountObj":{"id":"1333k","name":"50% Off Item","newPrice":750,"value":"50","savings":750,"type":"%"},"id":"f25f7435-51c0-49ae-a18b-278ac9ef7f9c","qty":1,"useSalePrice":false},{"warranty":false,"inventoryItem":{"customLabor":false,"minutes":0,"price":3000,"category":"Part","primaryBarcode":"0072774590087","cost":1149,"brand":"","salePrice":0,"formalName":"TIRE SUNLT 26x2.1 BK/BK ATB K850 WIRE MTB","id":"0072774590087","informalName":"","customPart":false,"barcodes":[]},"qty":1,"id":"0d61dc3a-2488-4002-9e8d-3e73a704c403","intakeNotes":"","receiptNotes":"","discountObj":"","useSalePrice":false}],"customerEmail":"hieb.fritz@gmail.com","media":[],"color2":{"textColor":"","backgroundColor":"","label":""},"hasNewSMS":false,"waitTime":"","partOrdered":"","salesTax":"","workorderNumber":"W15500APR26","description":"","customerContactRestriction":"","endedOnMillis":"","archived":false,"customerID":"48ce95ce-28e7-4418-b08c-24e3c749d98d","customerLanguage":"English","customerFirst":"Fritz","startedOnMillis":1775303620127,"customerNotes":[],"saleID":"","partSource":"","partOrderEstimateMillis":"","partOrderedMillis":"","color1":{"textColor":"","label":"","backgroundColor":""},"brand":"","paidOnMillis":"","changeLog":["Started by: Fritz Hieb",{"user":"Fritz","timestamp":1775303622862,"action":"added","field":"workorderLines","to":"TUBE SUNLT 700x28-35 (27x1-1/8x1-1/4) SV32 FFW30mm"},{"user":"Fritz","timestamp":1775303624553,"to":"TUBE SUNLT UTILIT 20x1.50-1.95 SV48 FFW 39mm","field":"workorderLines","action":"added"},{"action":"added","field":"workorderLines","to":"TUBE SUNLT 26x2.75-3.00 SV32 FFW73mm","timestamp":1775303628078,"user":"Fritz"},{"timestamp":1775303630061,"user":"Fritz","action":"added","to":"TUBE SUNLT 700x35-43 SV48mm FFW33mm","field":"workorderLines"},{"user":"Fritz","timestamp":1775303633356,"action":"added","field":"workorderLines","to":"TIRE LINER TANNUS ARMOUR INSERT 24x3.0-4.0"},{"timestamp":1775303635134,"user":"Fritz","action":"added","field":"workorderLines","to":"TIRE SUNLT 26x2.125 BK/BK STREET K130 WIRE"},{"field":"workorderLines","to":"2","action":"changed","item":"TIRE SUNLT 26x2.125 BK/BK STREET K130 WIRE","timestamp":1775303639092,"from":"1","detail":"qty","user":"Fritz"},{"timestamp":1775303642721,"user":"Fritz","action":"added","to":"TIRE SUNLT UTILIT 16x2.125 BK/BK ALPHABITE H518 WIRE","field":"workorderLines"},{"field":"workorderLines","to":"TIRE SUNLT 26x2.1 BK/BK ATB K850 WIRE MTB","action":"added","user":"Fritz","timestamp":1775303658779},{"action":"changed","to":"2","field":"workorderLines","from":"1","item":"TIRE SUNLT 26x2.125 CST241 BK/BLK CRUISER WIRE","timestamp":1775303664940,"user":"Fritz","detail":"qty"},{"action":"changed","to":"50% Off Item","field":"workorderLines","from":"none","item":"TIRE SUNLT UTILIT 16x2.125 BK/BK ALPHABITE H518 WIRE","timestamp":1775303670462,"user":"Fritz","detail":"discount"},{"user":"Fritz","timestamp":1775303809240,"from":"Newly Created","field":"status","to":"Finished","action":"changed"}]},
  ],
  customers: [
    {"id":"48ce95ce-28e7-4418-b08c-24e3c749d98d","contactRestriction":"","workorders":["1450000000002","1550000000009"],"customerLandline":"2392222222","state":"FL","last":"Hieb","email":"hieb.fritz@gmail.com","millisCreated":1775303488343,"sales":[],"notes":"9102 Bonita Beach Rd SE","gatedCommunity":true,"previousBikes":[],"language":"English","city":"Bonita Springs","addressNotes":"","streetAddress":"9102 Bonita Beach Rd SE","zip":"34135","interactionRating":"","credits":[{"millis":1775303841010,"text":"Test customer credit","reservedCents":0,"id":"2818478851462","amountCents":3500},{"text":"Another test customer credit","millis":1775303860205,"reservedCents":0,"id":"9990293694097","amountCents":2000}],"first":"Fritz","customerCell":"2393369177","deposits":[{"amountCents":2000,"transactionId":"3650000000004","type":"deposit","method":"cash","reservedCents":0,"note":"","id":"6746289475187","last4":"","millis":1775303764934},{"type":"deposit","transactionId":"3850000000008","method":"card","reservedCents":0,"amountCents":3000,"millis":1775303791014,"note":"","id":"3410113015827","last4":"4242"}],"unit":"#101"},
  ],
  transactions: [
    {"id":"3650000000004","receiptURL":"","paymentProcessor":"cash","amountCaptured":2000,"salesTax":0,"refunds":[],"chargeID":"","items":[],"paymentIntentID":"","authorizationCode":"","amountTendered":2000,"last4":"","cardType":"","expMonth":"","networkTransactionID":"","cardIssuer":"","expYear":"","millis":1775303764925,"method":"cash"},
    {"id":"3850000000008","expMonth":12,"cardIssuer":"Unknown","networkTransactionID":"122747278109561","millis":1775303791013,"expYear":2027,"cardType":"Visa Classic","last4":"4242","method":"card","amountCaptured":3000,"paymentProcessor":"stripe","salesTax":0,"refunds":[],"receiptURL":"https://pay.stripe.com/receipts/payment/CAcaFwoVYWNjdF8xUlJMQjlRSUpRcGNYUDlkKO74w84GMgb-Gib7SGQ6LBb9hfi3qdwI1Q0Qii4LPVTHDlBhwRXqYVtcBEoCC28pOD5lNq3AFfh8YEeU","authorizationCode":"980224","paymentIntentID":"pi_3TISoKQIJQpcXP9d19YOGIGV","chargeID":"ch_3TISoKQIJQpcXP9d1KS60Q0g","items":[],"amountTendered":0},
  ],
};

export function DatabaseViewerScreen() {
  const settings = useSettingsStore((state) => state.settings);
  const tenantID = settings?.tenantID || "";
  const storeID = settings?.storeID || "";

  const [sData, _setData] = useState({
    activeSales: [],
    completedSales: [],
    openWorkorders: [],
    completedWorkorders: [],
    customers: [],
    transactions: [],
  });

  useEffect(() => {
    if (!tenantID || !storeID) return;
    let unsubscribes = [];
    COLLECTIONS.forEach((col) => {
      let path = `tenants/${tenantID}/stores/${storeID}/${col.node}`;
      let unsub = firestoreSubscribeCollection(path, (docs) => {
        _setData((prev) => ({ ...prev, [col.key]: docs }));
      });
      unsubscribes.push(unsub);
    });
    return () => {
      unsubscribes.forEach((unsub) => { if (unsub) unsub(); });
    };
  }, [tenantID, storeID]);

  async function handleRefreshState() {
    _setReopenStatus("Refreshing state...");
    let basePath = `tenants/${tenantID}/stores/${storeID}`;
    try {
      // 1. Identify deposit-sale transaction IDs to preserve
      let depositTxnIDs = new Set();
      for (let sale of [...sData.completedSales, ...sData.activeSales]) {
        if (sale.isDepositSale) {
          for (let txnID of (sale.transactionIDs || [])) depositTxnIDs.add(txnID);
        }
      }

      // 2. Delete all active sales and completed sales
      for (let sale of sData.activeSales) {
        await firestoreDelete(`${basePath}/${DB_NODES.FIRESTORE.ACTIVE_SALES}/${sale.id}`);
      }
      for (let sale of sData.completedSales) {
        await firestoreDelete(`${basePath}/${DB_NODES.FIRESTORE.COMPLETED_SALES}/${sale.id}`);
      }

      // 3. Move first completed workorder back to open (cleaned), delete the rest
      let firstCompleted = sData.completedWorkorders[0];
      for (let i = 0; i < sData.completedWorkorders.length; i++) {
        let wo = sData.completedWorkorders[i];
        if (i === 0) {
          let cleaned = cleanWOForReopen(wo);
          cleaned.amountPaid = "";
          await firestoreWrite(`${basePath}/${DB_NODES.FIRESTORE.OPEN_WORKORDERS}/${cleaned.id}`, cleaned);
        }
        await firestoreDelete(`${basePath}/${DB_NODES.FIRESTORE.COMPLETED_WORKORDERS}/${wo.id}`);
      }

      // 4. Clean all open workorders of payment activity and sale links
      for (let wo of sData.openWorkorders) {
        if (wo.activeSaleID || wo.saleID || wo.paymentComplete || wo.amountPaid) {
          let cleaned = cleanWOForReopen(wo);
          cleaned.amountPaid = "";
          await firestoreWrite(`${basePath}/${DB_NODES.FIRESTORE.OPEN_WORKORDERS}/${cleaned.id}`, cleaned);
        }
      }

      // 5. Delete non-deposit transactions, preserve deposit ones
      let deletedTxns = 0;
      for (let txn of sData.transactions) {
        if (!depositTxnIDs.has(txn.id)) {
          await firestoreDelete(`${basePath}/${DB_NODES.FIRESTORE.TRANSACTIONS}/${txn.id}`);
          deletedTxns++;
        }
      }

      // 6. Reconcile customers - fix workorder refs, clear sales, restore credits/deposits
      let allOpenWOIDs = new Set(sData.openWorkorders.map((w) => w.id));
      if (firstCompleted) allOpenWOIDs.add(firstCompleted.id);

      for (let customer of sData.customers) {
        let updated = cloneDeep(customer);
        updated.workorders = (updated.workorders || []).filter((id) => allOpenWOIDs.has(id));
        updated.sales = [];
        for (let cred of (updated.credits || [])) cred.reservedCents = 0;
        for (let dep of (updated.deposits || [])) dep.reservedCents = 0;
        await firestoreWrite(`${basePath}/${DB_NODES.FIRESTORE.CUSTOMERS}/${customer.id}`, updated);
      }

      let reopened = firstCompleted ? 1 : 0;
      let deletedWOs = Math.max(0, sData.completedWorkorders.length - 1);
      _setReopenStatus(
        `Refreshed - ${reopened} WO reopened, ${deletedWOs} WO(s) deleted, ` +
        `${sData.activeSales.length + sData.completedSales.length} sale(s) deleted, ${deletedTxns} txn(s) deleted`
      );
    } catch (err) {
      _setReopenStatus("Error: " + (err.message || err));
    }
  }

  async function handleFreshWorkorders() {
    _setReopenStatus("Resetting to fresh...");
    let basePath = `tenants/${tenantID}/stores/${storeID}`;
    try {
      // 1. Clear all 6 collections
      for (let col of COLLECTIONS) {
        let docs = sData[col.key];
        for (let d of docs) {
          await firestoreDelete(`${basePath}/${col.node}/${d.id}`);
        }
      }
      // 2. Write fresh data
      let freshMap = {
        activeSales: FRESH_WORKORDERS_DATA.activeSales,
        completedSales: FRESH_WORKORDERS_DATA.completedSales,
        openWorkorders: FRESH_WORKORDERS_DATA.openWorkorders,
        completedWorkorders: FRESH_WORKORDERS_DATA.completedWorkorders,
        customers: FRESH_WORKORDERS_DATA.customers,
        transactions: FRESH_WORKORDERS_DATA.transactions,
      };
      for (let col of COLLECTIONS) {
        let docs = freshMap[col.key] || [];
        for (let doc of docs) {
          await firestoreWrite(`${basePath}/${col.node}/${doc.id}`, doc);
        }
      }
      let total = Object.values(freshMap).reduce((sum, arr) => sum + arr.length, 0);
      _setReopenStatus(`Fresh - ${total} doc(s) written`);
    } catch (err) {
      _setReopenStatus("Error: " + (err.message || err));
    }
  }

  async function handleStartHere() {
    _setReopenStatus("Resetting to Start Here...");
    let basePath = `tenants/${tenantID}/stores/${storeID}`;
    try {
      for (let col of COLLECTIONS) {
        let docs = sData[col.key];
        for (let d of docs) {
          await firestoreDelete(`${basePath}/${col.node}/${d.id}`);
        }
      }
      let freshMap = {
        activeSales: START_HERE_DATA.activeSales,
        completedSales: START_HERE_DATA.completedSales,
        openWorkorders: START_HERE_DATA.openWorkorders,
        completedWorkorders: START_HERE_DATA.completedWorkorders,
        customers: START_HERE_DATA.customers,
        transactions: START_HERE_DATA.transactions,
      };
      for (let col of COLLECTIONS) {
        let docs = freshMap[col.key] || [];
        for (let doc of docs) {
          await firestoreWrite(`${basePath}/${col.node}/${doc.id}`, doc);
        }
      }
      let total = Object.values(freshMap).reduce((sum, arr) => sum + arr.length, 0);
      _setReopenStatus(`Start Here - ${total} doc(s) written`);
    } catch (err) {
      _setReopenStatus("Error: " + (err.message || err));
    }
  }

  async function handleClearAll() {
    await Promise.all(COLLECTIONS.flatMap((col) => {
      let basePath = `tenants/${tenantID}/stores/${storeID}/${col.node}`;
      return sData[col.key].map((d) => firestoreDelete(`${basePath}/${d.id}`));
    }));
  }

  async function handleClearCollection(col) {
    let docs = sData[col.key];
    if (!docs.length) return;
    let basePath = `tenants/${tenantID}/stores/${storeID}/${col.node}`;
    await Promise.all(docs.map((d) => firestoreDelete(`${basePath}/${d.id}`)));
  }

  const [sReopenStatus, _setReopenStatus] = useState("");

  function cleanWOForReopen(wo) {
    let cleaned = cloneDeep(wo);
    cleaned.paymentComplete = false;
    cleaned.paidOnMillis = "";
    cleaned.saleID = "";
    cleaned.activeSaleID = "";
    cleaned.endedOnMillis = "";
    cleaned.status = "newly_created";
    cleaned.changeLog = (cleaned.changeLog || []).filter(
      (e) => !(e.field === "payment") &&
        !(e.action === "changed" && e.field === "status" && (e.to || "").toLowerCase().includes("paid"))
    );
    return cleaned;
  }

  async function restoreCreditsAndCleanCustomer(linkedSale, basePath) {
    let creditsApplied = [...(linkedSale.creditsApplied || []), ...(linkedSale.depositsApplied || [])];
    let customerID = linkedSale.customerID || "";
    if (!customerID) return;
    let customerPath = `${basePath}/${DB_NODES.FIRESTORE.CUSTOMERS}/${customerID}`;
    let customer = await firestoreRead(customerPath);
    if (!customer) return;
    let updated = cloneDeep(customer);
    for (let cred of creditsApplied) {
      let isCredit = cred.type === "credit";
      let arrKey = isCredit ? "credits" : "deposits";
      let arr = updated[arrKey] || [];
      let existing = arr.find((d) => d.id === cred.id);
      if (existing) {
        existing.amountCents = (existing.amountCents || 0) + cred.amount;
        existing.reservedCents = 0;
      } else {
        arr.push({
          id: cred.id, amountCents: cred.amount, reservedCents: 0,
          millis: Date.now(), method: "", note: "Restored by reopen",
          type: cred.type === "giftcard" ? "giftcard" : (isCredit ? "credit" : "deposit"),
          last4: "", text: isCredit ? "Restored by reopen" : "",
        });
        updated[arrKey] = arr;
      }
    }
    for (let dep of (updated.deposits || [])) {
      if ((dep.reservedCents || 0) > 0) dep.reservedCents = 0;
    }
    for (let cred of (updated.credits || [])) {
      if ((cred.reservedCents || 0) > 0) cred.reservedCents = 0;
    }
    updated.sales = (updated.sales || []).filter((sid) => sid !== linkedSale.id);
    await firestoreWrite(customerPath, updated);
  }

  async function handleCleanLogs() {
    _setReopenStatus("Cleaning...");
    let basePath = `tenants/${tenantID}/stores/${storeID}`;
    try {
      // 1. Delete all active sales
      for (let sale of sData.activeSales) {
        await firestoreDelete(`${basePath}/${DB_NODES.FIRESTORE.ACTIVE_SALES}/${sale.id}`);
      }
      // 2. Delete all completed sales
      for (let sale of sData.completedSales) {
        await firestoreDelete(`${basePath}/${DB_NODES.FIRESTORE.COMPLETED_SALES}/${sale.id}`);
      }
      // 3. Delete all completed workorders
      for (let wo of sData.completedWorkorders) {
        await firestoreDelete(`${basePath}/${DB_NODES.FIRESTORE.COMPLETED_WORKORDERS}/${wo.id}`);
      }
      // 4. Delete all transactions
      for (let txn of sData.transactions) {
        await firestoreDelete(`${basePath}/${DB_NODES.FIRESTORE.TRANSACTIONS}/${txn.id}`);
      }
      // 5. Clean open workorders (remove activeSaleID, saleID, payment fields)
      for (let wo of sData.openWorkorders) {
        if (wo.activeSaleID || wo.saleID || wo.paymentComplete) {
          let cleaned = cleanWOForReopen(wo);
          await firestoreWrite(`${basePath}/${DB_NODES.FIRESTORE.OPEN_WORKORDERS}/${cleaned.id}`, cleaned);
        }
      }
      // 6. Reconcile customers
      let openWOsByCustomer = {};
      for (let wo of sData.openWorkorders) {
        if (wo.customerID) {
          if (!openWOsByCustomer[wo.customerID]) openWOsByCustomer[wo.customerID] = [];
          openWOsByCustomer[wo.customerID].push(wo.id);
        }
      }
      let custUpdated = 0;
      for (let customer of sData.customers) {
        let updated = cloneDeep(customer);
        updated.workorders = openWOsByCustomer[customer.id] || [];
        updated.sales = [];
        updated.deposits = [];
        for (let cred of (updated.credits || [])) {
          if ((cred.reservedCents || 0) > 0) cred.reservedCents = 0;
        }
        await firestoreWrite(`${basePath}/${DB_NODES.FIRESTORE.CUSTOMERS}/${customer.id}`, updated);
        custUpdated++;
      }

      _setReopenStatus(
        `Done - ${sData.activeSales.length} active sale(s), ${sData.completedSales.length} closed sale(s), ` +
        `${sData.completedWorkorders.length} closed WO(s), ${sData.transactions.length} txn(s) removed, ` +
        `${custUpdated} customer(s) reconciled`
      );
    } catch (err) {
      _setReopenStatus("Error: " + (err.message || err));
    }
  }

  async function handleReopenFirst() {
    let firstWO = sData.completedWorkorders[0];
    if (!firstWO) {
      _setReopenStatus("No completed workorders");
      return;
    }
    _setReopenStatus("Reopening first...");
    let basePath = `tenants/${tenantID}/stores/${storeID}`;
    try {
      // Find the completed sale linked to this workorder via workorderIDs array or WO's saleID
      let linkedSale = sData.completedSales.find((s) => (s.workorderIDs || []).includes(firstWO.id));
      if (!linkedSale && firstWO.saleID) {
        linkedSale = sData.completedSales.find((s) => s.id === firstWO.saleID);
      }

      // 1. Restore deposits/credits and clean sale ID from customer
      if (linkedSale) {
        await restoreCreditsAndCleanCustomer(linkedSale, basePath);
      }

      // 2. Move the first completed workorder back to open-workorders (cleaned)
      let cleaned = cleanWOForReopen(firstWO);
      await firestoreWrite(`${basePath}/${DB_NODES.FIRESTORE.OPEN_WORKORDERS}/${cleaned.id}`, cleaned);
      await firestoreDelete(`${basePath}/${DB_NODES.FIRESTORE.COMPLETED_WORKORDERS}/${firstWO.id}`);
      let reopenedCount = 1;

      // 3. If sale is a combined sale, also reopen all sibling WOs
      if (linkedSale) {
        let siblingIDs = (linkedSale.workorderIDs || []).filter((id) => id !== firstWO.id);
        for (let sibID of siblingIDs) {
          let sibWO = sData.completedWorkorders.find((w) => w.id === sibID);
          if (sibWO) {
            let sibCleaned = cleanWOForReopen(sibWO);
            await firestoreWrite(`${basePath}/${DB_NODES.FIRESTORE.OPEN_WORKORDERS}/${sibCleaned.id}`, sibCleaned);
            await firestoreDelete(`${basePath}/${DB_NODES.FIRESTORE.COMPLETED_WORKORDERS}/${sibWO.id}`);
            reopenedCount++;
          }
        }
      }

      // 4. Delete linked sale and its transactions (looked up via sale.transactionIDs)
      let deletedTxnCount = 0;
      if (linkedSale) {
        await firestoreDelete(`${basePath}/${DB_NODES.FIRESTORE.COMPLETED_SALES}/${linkedSale.id}`);
        let activeSale = sData.activeSales.find((s) => s.id === linkedSale.id);
        if (activeSale) await firestoreDelete(`${basePath}/${DB_NODES.FIRESTORE.ACTIVE_SALES}/${activeSale.id}`);
        // Delete transactions using the sale's transactionIDs array
        let txnIDs = linkedSale.transactionIDs || [];
        for (let txnID of txnIDs) {
          await firestoreDelete(`${basePath}/${DB_NODES.FIRESTORE.TRANSACTIONS}/${txnID}`);
          deletedTxnCount++;
        }
        _setReopenStatus(`Done - ${reopenedCount} WO(s) reopened, 1 sale removed, ${deletedTxnCount} txn(s) deleted`);
      } else {
        _setReopenStatus("Done - 1 WO reopened (no linked sale found)");
      }
    } catch (err) {
      _setReopenStatus("Error: " + (err.message || err));
    }
  }

  async function handleReopenAll() {
    let completedWOs = sData.completedWorkorders;
    let completedSales = sData.completedSales;
    let transactions = sData.transactions;
    if (completedWOs.length === 0 && completedSales.length === 0) {
      _setReopenStatus("Nothing to reopen");
      return;
    }
    _setReopenStatus("Reopening...");
    let basePath = `tenants/${tenantID}/stores/${storeID}`;

    try {
      // 1. Restore deposits/credits and clean sale ID from customer
      for (let sale of completedSales) {
        await restoreCreditsAndCleanCustomer(sale, basePath);
      }

      // 2. Clear any remaining deposit reservations on all customers (from active sales)
      for (let customer of sData.customers) {
        let needsUpdate = false;
        let updated = cloneDeep(customer);
        for (let dep of (updated.deposits || [])) {
          if ((dep.reservedCents || 0) > 0) { dep.reservedCents = 0; needsUpdate = true; }
        }
        for (let cred of (updated.credits || [])) {
          if ((cred.reservedCents || 0) > 0) { cred.reservedCents = 0; needsUpdate = true; }
        }
        if (needsUpdate) {
          await firestoreWrite(`${basePath}/${DB_NODES.FIRESTORE.CUSTOMERS}/${customer.id}`, updated);
        }
      }

      // 3. Move completed workorders back to open-workorders (cleaned)
      for (let wo of completedWOs) {
        let cleaned = cleanWOForReopen(wo);
        await firestoreWrite(`${basePath}/${DB_NODES.FIRESTORE.OPEN_WORKORDERS}/${cleaned.id}`, cleaned);
        await firestoreDelete(`${basePath}/${DB_NODES.FIRESTORE.COMPLETED_WORKORDERS}/${wo.id}`);
      }

      // 4. Also clean any open workorders that have stale sale references
      for (let wo of sData.openWorkorders) {
        if (wo.activeSaleID || wo.saleID || wo.paymentComplete) {
          let cleaned = cleanWOForReopen(wo);
          await firestoreWrite(`${basePath}/${DB_NODES.FIRESTORE.OPEN_WORKORDERS}/${cleaned.id}`, cleaned);
        }
      }

      // 5. Delete all completed sales, active sales, and transactions
      for (let sale of completedSales) {
        await firestoreDelete(`${basePath}/${DB_NODES.FIRESTORE.COMPLETED_SALES}/${sale.id}`);
      }
      for (let sale of sData.activeSales) {
        await firestoreDelete(`${basePath}/${DB_NODES.FIRESTORE.ACTIVE_SALES}/${sale.id}`);
      }
      for (let txn of transactions) {
        await firestoreDelete(`${basePath}/${DB_NODES.FIRESTORE.TRANSACTIONS}/${txn.id}`);
      }

      let totalWOs = completedWOs.length + sData.openWorkorders.filter((w) => w.activeSaleID || w.saleID).length;
      _setReopenStatus(`Done - ${totalWOs} WO(s) cleaned, ${completedSales.length} sale(s) removed, ${transactions.length} txn(s) deleted`);
    } catch (err) {
      _setReopenStatus("Error: " + (err.message || err));
    }
  }

  return (
    <View style={{ height: "100vh", overflow: "hidden", backgroundColor: C.backgroundWhite }}>
      <View style={{ flexDirection: "row", alignItems: "center", padding: 10, borderBottomWidth: 1, borderBottomColor: gray(0.15) }}>
        <TouchableOpacity
          onPress={() => { window.location.href = ROUTES.home; }}
          style={{ paddingVertical: 6, paddingHorizontal: 14, borderRadius: 5, borderWidth: 1, borderColor: gray(0.3), marginRight: 16 }}
        >
          <Text style={{ fontSize: 14, color: C.text }}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleReopenFirst}
          style={{ paddingVertical: 6, paddingHorizontal: 14, borderRadius: 5, backgroundColor: C.orange, marginRight: 8 }}
        >
          <Text style={{ fontSize: 14, color: "white", fontWeight: "600" }}>Reopen First</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleReopenAll}
          style={{ paddingVertical: 6, paddingHorizontal: 14, borderRadius: 5, backgroundColor: C.orange, marginRight: 8 }}
        >
          <Text style={{ fontSize: 14, color: "white", fontWeight: "600" }}>Reopen All</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleCleanLogs}
          style={{ paddingVertical: 6, paddingHorizontal: 14, borderRadius: 5, backgroundColor: "rgb(103, 124, 231)", marginRight: 8 }}
        >
          <Text style={{ fontSize: 14, color: "white", fontWeight: "600" }}>Clean Logs</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleRefreshState}
          style={{ paddingVertical: 6, paddingHorizontal: 14, borderRadius: 5, backgroundColor: "rgb(0, 128, 128)", marginRight: 8 }}
        >
          <Text style={{ fontSize: 14, color: "white", fontWeight: "600" }}>Refresh State</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleFreshWorkorders}
          style={{ paddingVertical: 6, paddingHorizontal: 14, borderRadius: 5, backgroundColor: "rgb(34, 139, 34)", marginRight: 8 }}
        >
          <Text style={{ fontSize: 14, color: "white", fontWeight: "600" }}>Fresh workorders</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleStartHere}
          style={{ paddingVertical: 6, paddingHorizontal: 14, borderRadius: 5, backgroundColor: "rgb(75, 0, 130)", marginRight: 8 }}
        >
          <Text style={{ fontSize: 14, color: "white", fontWeight: "600" }}>Start Here</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: "700", color: C.text, flex: 1 }}>Database Viewer</Text>
        <TouchableOpacity
          onPress={() => {
            let output = COLLECTIONS.map((col) => {
              return `=== ${col.label} (${sData[col.key].length}) ===\n${JSON.stringify(sData[col.key], null, 2)}`;
            }).join("\n\n");
            navigator.clipboard.writeText(NOTIFY_HINT + "Examine the objects from the database after the transaction. Ignore change logs. summarize what happened, cross-check fields for errors, and make sure that any fields that were supposed to move or delete or change did so: " + output);
          }}
          style={{ paddingVertical: 6, paddingHorizontal: 14, borderRadius: 5, backgroundColor: C.blue, marginRight: 8 }}
        >
          <Text style={{ fontSize: 14, color: "white", fontWeight: "600" }}>Summarize</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            let output = COLLECTIONS.map((col) => {
              return `=== ${col.label} (${sData[col.key].length}) ===\n${JSON.stringify(sData[col.key], null, 2)}`;
            }).join("\n\n");
            navigator.clipboard.writeText(NOTIFY_HINT + "Examine the db contents. Cross-check for errors in math and field updates. You must cross-reference every field pre and post-operation, across every object. Summarize the action you saw take place and report any errors. for errors, provide a numbered list of each error accompanied with the best possible solution for us to discuss. " + output);
          }}
          style={{ paddingVertical: 6, paddingHorizontal: 14, borderRadius: 5, backgroundColor: C.purple, marginRight: 8 }}
        >
          <Text style={{ fontSize: 14, color: "white", fontWeight: "600", backgroundColor: 'green' }}>Compare</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            let output = COLLECTIONS.map((col) => `=== ${col.label} ===\n${JSON.stringify(sData[col.key], null, 2)}`).join("\n\n");
            navigator.clipboard.writeText(NOTIFY_HINT + output);
          }}
          style={{ paddingVertical: 6, paddingHorizontal: 14, borderRadius: 5, backgroundColor: C.green, marginRight: 8 }}
        >
          <Text style={{ fontSize: 14, color: "white", fontWeight: "600" }}>Contents Only</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            let output = COLLECTIONS.map((col) => `=== ${col.label} (${sData[col.key].length}) ===\n${JSON.stringify(sData[col.key], null, 2)}`).join("\n\n");
            navigator.clipboard.writeText(NOTIFY_HINT + "This is the current state of the database. Use it as a starting point for the upcoming tests of workorder changes, checkout screen and refund screen as well as any and other other changes to any object field. Ignore any outstanding logging issues, but check the logging moving forward from this point. Analyze it and report any inconsistencies or relics from previous delete operations, and summarize what has transpired." + output);
          }}
          style={{ paddingVertical: 6, paddingHorizontal: 14, borderRadius: 5, backgroundColor: C.orange, marginRight: 8 }}
        >
          <Text style={{ fontSize: 14, color: "white", fontWeight: "600" }}>Starting Point</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleClearAll}
          style={{ paddingVertical: 6, paddingHorizontal: 14, borderRadius: 5, backgroundColor: C.red }}
        >
          <Text style={{ fontSize: 14, color: "white", fontWeight: "600" }}>Clear All</Text>
        </TouchableOpacity>
      </View>
      <View style={{ flex: 1, padding: 8 }}>
        {[0, 1].map((row) => (
          <View key={row} style={{ flex: 1, flexDirection: "row" }}>
            {COLLECTIONS.slice(row * 3, row * 3 + 3).map((col) => {
              let docs = sData[col.key];
              return (
                <View key={col.key} style={{ flex: 1, margin: 4, borderWidth: 1, borderColor: gray(0.2), borderRadius: 6, overflow: "hidden" }}>
                  <View style={{ backgroundColor: gray(0.08), paddingVertical: 6, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: gray(0.2), flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={{ fontSize: 13, fontWeight: "600", color: C.text }}>{col.label} ({docs.length})</Text>
                    <View style={{ flexDirection: "row", gap: 4 }}>
                      <TouchableOpacity
                        onPress={() => {
                          let output = `=== ${col.label} (${docs.length}) ===\n${JSON.stringify(docs, null, 2)}`;
                          navigator.clipboard.writeText(NOTIFY_HINT + output);
                        }}
                        style={{ paddingVertical: 2, paddingHorizontal: 8, borderRadius: 4, backgroundColor: C.blue }}
                      >
                        <Text style={{ fontSize: 11, color: "white" }}>Copy</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleClearCollection(col)}
                        style={{ paddingVertical: 2, paddingHorizontal: 8, borderRadius: 4, backgroundColor: C.red }}
                      >
                        <Text style={{ fontSize: 11, color: "white" }}>Clear</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <ScrollView style={{ flex: 1, padding: 6 }}>
                    <Text style={{ fontSize: 11, fontFamily: "monospace", color: C.text, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                      {JSON.stringify(docs, null, 2)}
                    </Text>
                  </ScrollView>
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

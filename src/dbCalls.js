import {
  getFirestore,
  collection,
  addDoc,
  doc,
  setDoc,
  getDoc,
} from "firebase/firestore";
import { initializeApp } from "firebase/app";
import { log } from "./utils";

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
const DB = getFirestore(app);

export function getNewCollectionRef(collectionName) {
  let ref = doc(collection(DB, collectionName));
  return ref;
}

export function setCollectionItem(collectionName, item) {
  let docRef = doc(DB, collectionName, item.id);
  return setDoc(docRef, item)
    .then(() => {})
    .catch((err) => log("err", err));
}

// async call
export function getCollectionItem(collectionName, itemID) {
  let ref = doc(DB, collectionName, itemID);
  return getDoc(ref).then((res) => {
    if (res.exists()) {
      return res.data();
    } else {
      return null;
    }
  });
}

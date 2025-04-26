import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";

// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
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
const analytics = getAnalytics(app);

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

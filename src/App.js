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
/* eslint-disable */

export const ROUTES = {
  init: "/",
};

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path={ROUTES.init} element={<WorkorderScreen />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

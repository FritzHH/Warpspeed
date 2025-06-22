/* eslint-disable */
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { BrowserRouter, Route, Routes, Link } from "react-router-dom";

import { BaseScreen } from "./screens/BaseScreen";
import { View } from "react-native-web";
<script src="https://js.stripe.com/terminal/v1/"></script>;

export const ROUTES = {
  init: "/",
};

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path={ROUTES.init} element={<BaseScreen />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

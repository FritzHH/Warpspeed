/* eslint-disable */
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { BaseScreen } from "./screens/BaseScreen";

export const ROUTES = {
  init: "/",
};

/////////////////////////////////////
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

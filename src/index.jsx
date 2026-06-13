import React from "react";
import ReactDOM from "react-dom/client";
import "./styles/tokens.css";
import "./styles/themes/tenants.css";
import "./global.css";
import { initTheme } from "./styles/theme";
import App from "./App";

initTheme();

function syncAppHeight() {
  document.documentElement.style.setProperty(
    "--app-h",
    window.innerHeight + "px",
  );
}
syncAppHeight();
window.addEventListener("resize", syncAppHeight);
window.addEventListener("orientationchange", syncAppHeight);

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

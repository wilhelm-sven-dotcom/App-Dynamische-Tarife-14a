import React from "react";
import { createRoot } from "react-dom/client";
import App from "../pv-rechner.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

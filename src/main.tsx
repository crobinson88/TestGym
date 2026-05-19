import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { PwaUpdate } from "./components/PwaUpdate";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
    <PwaUpdate />
  </React.StrictMode>,
);

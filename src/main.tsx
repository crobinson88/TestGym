import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { PwaUpdate } from "./components/PwaUpdate";
import "./styles.css";

// After a new deploy the hashed chunk names change; a client still running the
// previous build (or served a stale precache) can fail to fetch a lazily-imported
// chunk, which otherwise dead-ends at a blank screen. Vite fires this event on
// such failures — reload once to pull the fresh assets. The session flag stops a
// reload loop if the fetch is failing for some other reason.
window.addEventListener("vite:preloadError", () => {
  if (sessionStorage.getItem("preload-reloaded")) return;
  sessionStorage.setItem("preload-reloaded", "1");
  location.reload();
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
      <PwaUpdate />
    </ErrorBoundary>
  </React.StrictMode>,
);

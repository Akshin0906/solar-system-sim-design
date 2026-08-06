import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import {
  installGlobalErrorDiagnostics,
  reportClientDiagnostic,
} from "./observability/clientDiagnostics";
import "./app/App.css";

installGlobalErrorDiagnostics();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}service-worker.js`, {
      scope: import.meta.env.BASE_URL,
    }).catch((error: unknown) => {
      // Offline support is best-effort; retain a local, copyable diagnostic while
      // leaving the online application fully usable.
      reportClientDiagnostic("service-worker-registration-failure", error, {
        scope: import.meta.env.BASE_URL,
      });
    });
  });
}

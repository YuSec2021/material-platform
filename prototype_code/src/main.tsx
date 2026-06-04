
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App";
import { registerWebVitalsTelemetry } from "./app/telemetry/webVitals";
import "./styles/index.css";

registerWebVitalsTelemetry();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

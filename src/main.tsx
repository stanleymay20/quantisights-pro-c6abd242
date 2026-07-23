import { createRoot } from "react-dom/client";
import { StrictMode } from "react";
import { installGlobalErrorHandlers } from "@/lib/error-reporter";
import { initSentry } from "@/lib/sentry";
import { recordObservabilityStartup } from "@/lib/sentry";
import { installChunkReloadGuard } from "@/lib/chunk-reload-guard";
import "@/lib/analytics";
import "./i18n";
import App from "./App.tsx";
import "./index.css";

// Initialize Sentry FIRST for maximum error capture
initSentry();
recordObservabilityStartup();
installGlobalErrorHandlers();
// Recover from stale lazy-chunk references after a redeploy (F-2 fix).
installChunkReloadGuard();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@astryxdesign/core/reset.css";
import "@astryxdesign/core/astryx.css";
import "./styles.css";
import { AppTheme } from "./app-theme";
import App from "./app.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppTheme>
      <App />
    </AppTheme>
  </StrictMode>,
);

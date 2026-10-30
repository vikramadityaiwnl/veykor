import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@astryxdesign/core/reset.css";
import "@astryxdesign/core/astryx.css";
import { Theme } from "@astryxdesign/core/theme";
import App from "./App.tsx";
import { veykorTheme } from "./veykor-theme";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Theme theme={veykorTheme}>
      <App />
    </Theme>
  </StrictMode>,
);

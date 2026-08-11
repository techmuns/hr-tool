import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { applyTheme, currentTheme } from "./theme";
import { installPerfLogger } from "./perfLog";
import "./styles.css";

applyTheme(currentTheme());
installPerfLogger();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

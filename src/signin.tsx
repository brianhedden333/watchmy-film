import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AuthPage } from "./auth";
import "./styles.css";
import "./signup.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthPage mode="signin" />
  </StrictMode>
);

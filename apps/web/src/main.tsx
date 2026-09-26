import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { useAuthStore } from "./account/authStore";
import { App } from "./App";
import "./index.css";

// Sign in (or create a guest) in the background; local games never wait for it.
void useAuthStore.getState().init();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

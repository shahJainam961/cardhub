import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { useAuthStore } from "./account/authStore";
import { App } from "./App";
import "@fontsource-variable/fredoka";
import "@fontsource-variable/nunito";
import { unlockAudio } from "./audio/sound";
import "./index.css";

// Browsers only allow audio after a user gesture, so start it on the first tap anywhere.
window.addEventListener("pointerdown", unlockAudio, { once: true });

// Sign in (or create a guest) in the background; local games never wait for it.
void useAuthStore.getState().init();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

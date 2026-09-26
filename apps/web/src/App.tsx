import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { AccountPage } from "./account/AccountPage";
import { UnoGamePage } from "./games/uno/UnoGamePage";
import { UnoSetupPage } from "./games/uno/UnoSetupPage";
import { HomePage } from "./pages/HomePage";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/uno/new" element={<UnoSetupPage />} />
        <Route path="/uno/play" element={<UnoGamePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

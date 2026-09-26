import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { AccountPage } from "./account/AccountPage";
import { MonopolyDealGamePage } from "./games/monopoly-deal/MonopolyDealGamePage";
import { MonopolyDealSetupPage } from "./games/monopoly-deal/MonopolyDealSetupPage";
import { OnlinePage } from "./games/uno/online/OnlinePage";
import { OnlineRoomPage } from "./games/uno/online/OnlineRoomPage";
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
        <Route path="/uno/online" element={<OnlinePage />} />
        <Route path="/monopoly-deal/new" element={<MonopolyDealSetupPage />} />
        <Route path="/monopoly-deal/play" element={<MonopolyDealGamePage />} />
        <Route path="/uno/room/:code" element={<OnlineRoomPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

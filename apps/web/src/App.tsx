import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { AccountPage } from "./account/AccountPage";
import { MonopolyDealGamePage } from "./games/monopoly-deal/MonopolyDealGamePage";
import { MonopolyDealSetupPage } from "./games/monopoly-deal/MonopolyDealSetupPage";
import { DealOnlinePage, DealRoomPage } from "./games/monopoly-deal/online/dealOnline";
import { UnoOnlinePage, UnoRoomPage } from "./games/uno/online/unoOnline";
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
        <Route path="/uno/online" element={<UnoOnlinePage />} />
        <Route path="/monopoly-deal/new" element={<MonopolyDealSetupPage />} />
        <Route path="/monopoly-deal/play" element={<MonopolyDealGamePage />} />
        <Route path="/monopoly-deal/online" element={<DealOnlinePage />} />
        <Route path="/monopoly-deal/room/:code" element={<DealRoomPage />} />
        <Route path="/uno/room/:code" element={<UnoRoomPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

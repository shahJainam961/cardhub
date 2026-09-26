import { motion, MotionConfig } from "motion/react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router";
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
    // Honors the device's "reduce motion" setting for every animation.
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <AnimatedRoutes />
      </BrowserRouter>
    </MotionConfig>
  );
}

/** Each page slides up into place as you arrive (no exit animation, so navigation never waits). */
function AnimatedRoutes() {
  const location = useLocation();
  return (
    <motion.div
      key={location.pathname}
      className="min-h-full"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
    >
      <Routes location={location}>
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
    </motion.div>
  );
}

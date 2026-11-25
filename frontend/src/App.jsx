import { useEffect } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { LanguageProvider } from "./i18n/LanguageContext";
import Navbar from "./components/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import AdminDashboard from "./pages/AdminDashboard";
import AddAthlete from "./pages/AddAthlete";
import EditAthlete from "./pages/EditAthlete";
import AthleteCardPage from "./pages/AthleteCardPage";
import AllCardsPage from "./pages/AllCardsPage";
import PrintCardBacksPage from "./pages/PrintCardBacksPage";
import VerifyPage from "./pages/VerifyPage";
import SearchPage from "./pages/SearchPage";
import ChatPage from "./pages/ChatPage";
import AboutUs from "./pages/AboutUs";
import CoachDashboard from "./pages/CoachDashboard";
import AdminUsers from "./pages/AdminUsers";
import AdminTeams from "./pages/AdminTeams";
import AdminSponsors from "./pages/AdminSponsors";
import AdminMatchDay from "./pages/AdminMatchDay";
import DebtReportPage from "./pages/DebtReportPage";
import StatsPage from "./pages/StatsPage";
import PlayerDashboard from "./pages/PlayerDashboard";
import PlayerEditProfile from "./pages/PlayerEditProfile";
import ChangePasswordPage from "./pages/ChangePasswordPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import SettingsPage from "./pages/SettingsPage";
import AdminTournaments from "./pages/AdminTournaments";
import TournamentsPage from "./pages/TournamentsPage";
import TournamentSquadPage from "./pages/TournamentSquadPage";
import PlayerSquadListPage from "./pages/PlayerSquadListPage";
import PlayerJerseyOrderPage from "./pages/PlayerJerseyOrderPage";
import AdminJerseyOrders from "./pages/AdminJerseyOrders";
import PricingPage from "./pages/PricingPage";
import PosterGenerator from "./pages/PosterGenerator";
import PaymentReturn from "./pages/PaymentReturn";
import RefereeSchedulePage from "./pages/RefereeSchedulePage";
import PlayerRegister from "./pages/PlayerRegister";
import AdminAnalytics from "./pages/AdminAnalytics";
import AdminTournamentPlans from "./pages/AdminTournamentPlans";
import CoachModePicker from "./pages/CoachModePicker";
import AdminTelegram from "./pages/AdminTelegram";
import TgShop from "./pages/TgShop";
import CoachModeBanner from "./components/CoachModeBanner";
import WelcomeGuide from "./components/WelcomeGuide";
import RouteMeta from "./components/RouteMeta";
import UpdateBanner from "./components/UpdateBanner";
import usePageTracking from "./hooks/usePageTracking";

// The shop is its own app now (shop.brathna.com): the public shop, products,
// stock, invoices, purchase plans, reports, money (finance) and KHQR settings.
// Links to those pages land here and leave for the same page on the shop site;
// direct visits are redirected by vercel.json.
const SHOP_URL = (import.meta.env.VITE_SHOP_URL || "https://shop.brathna.com").replace(/\/$/, "");
function GoToShop({ path }) {
  const location = useLocation();
  useEffect(() => {
    const target = path ?? location.pathname;
    window.location.replace(`${SHOP_URL}${target === "/shop" ? "/" : target}${path ? "" : location.search}`);
  }, [path, location.pathname, location.search]);
  return null;
}

export default function App() {
  // Counts every page opened, for the admin Analytics page.
  usePageTracking();
  const { pathname } = useLocation();

  // Telegram Mini App shop — full screen inside Telegram, no site navbar.
  if (pathname.startsWith("/tg-shop")) {
    return (
      <LanguageProvider>
        <TgShop />
      </LanguageProvider>
    );
  }

  return (
    <LanguageProvider>
      <Navbar />
      <CoachModeBanner />
      <WelcomeGuide />
      <RouteMeta />
      <UpdateBanner />
      <Routes>
        <Route
          path="/admin/telegram"
          element={
            <ProtectedRoute role="ADMIN">
              <AdminTelegram />
            </ProtectedRoute>
          }
        />
        {/* shop + money pages moved to shop.brathna.com */}
        <Route path="/admin/finance" element={<GoToShop />} />
        <Route path="/admin/khqr" element={<GoToShop />} />
        <Route
          path="/admin/coach-mode"
          element={
            <ProtectedRoute role={["ADMIN", "HEAD_COACH"]}>
              <CoachModePicker />
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route
          path="/change-password"
          element={
            <ProtectedRoute>
              <ChangePasswordPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/chat"
          element={
            <ProtectedRoute>
              <ChatPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <SettingsPage />
            </ProtectedRoute>
          }
        />
        <Route path="/verify/:verifyId" element={<VerifyPage />} />
        {/* Public player self-registration via a Head Coach's shared link —
            no login (the player doesn't have an account yet). The token in
            the URL authorizes it; see PlayerRegister.jsx. */}
        <Route path="/register/:token" element={<PlayerRegister />} />
        <Route path="/search" element={<SearchPage />} />
        {/* The shop moved to its own site (shop-project) — send visitors there */}
        <Route path="/shop" element={<GoToShop />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/about" element={<AboutUs />} />
        <Route
          path="/admin"
          element={
            <ProtectedRoute role="ADMIN">
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/new"
          element={
            <ProtectedRoute role={["ADMIN", "HEAD_COACH"]}>
              <AddAthlete />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/athlete/:id"
          element={
            <ProtectedRoute role={["ADMIN", "HEAD_COACH", "PLAYER"]}>
              <AthleteCardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/athlete/:id/edit"
          element={
            <ProtectedRoute role={["ADMIN", "HEAD_COACH"]}>
              <EditAthlete />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/cards"
          element={
            <ProtectedRoute role="ADMIN">
              <AllCardsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/cards/back"
          element={
            <ProtectedRoute role="ADMIN">
              <PrintCardBacksPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/users"
          element={
            <ProtectedRoute role="ADMIN">
              <AdminUsers />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/teams"
          element={
            <ProtectedRoute role="ADMIN">
              <AdminTeams />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/sponsors"
          element={
            <ProtectedRoute role="ADMIN">
              <AdminSponsors />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/matchday"
          element={
            <ProtectedRoute role="ADMIN">
              <AdminMatchDay />
            </ProtectedRoute>
          }
        />
        <Route path="/admin/shop" element={<GoToShop />} />
        <Route path="/admin/invoices" element={<GoToShop />} />
        <Route
          path="/admin/tournament-plans"
          element={
            <ProtectedRoute role="ADMIN">
              <AdminTournamentPlans />
            </ProtectedRoute>
          }
        />
        <Route path="/admin/purchase-plans" element={<GoToShop />} />
        <Route path="/admin/invoices/:id" element={<GoToShop />} />
        <Route
          path="/admin/analytics"
          element={
            <ProtectedRoute role="ADMIN">
              <AdminAnalytics />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/poster"
          element={
            <ProtectedRoute role="ADMIN">
              <PosterGenerator />
            </ProtectedRoute>
          }
        />
        <Route
          path="/coach"
          element={
            <ProtectedRoute role="HEAD_COACH">
              <CoachDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/debt-report"
          element={
            <ProtectedRoute role={["ADMIN", "HEAD_COACH"]}>
              <DebtReportPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/stats"
          element={
            <ProtectedRoute role={["ADMIN", "HEAD_COACH"]}>
              <StatsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/player"
          element={
            <ProtectedRoute role="PLAYER">
              <PlayerDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/player/edit"
          element={
            <ProtectedRoute role="PLAYER">
              <PlayerEditProfile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/tournaments"
          element={
            <ProtectedRoute role={["ADMIN", "HEAD_COACH"]}>
              <AdminTournaments />
            </ProtectedRoute>
          }
        />
        <Route
          path="/tournaments"
          element={
            <ProtectedRoute role="PLAYER">
              <TournamentsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/tournaments/:id/squad"
          element={
            <ProtectedRoute role={["ADMIN", "HEAD_COACH", "PLAYER"]}>
              <TournamentSquadPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/squad-list"
          element={
            <ProtectedRoute role="PLAYER">
              <PlayerSquadListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/jersey-orders"
          element={
            <ProtectedRoute role="PLAYER">
              <PlayerJerseyOrderPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/jersey-orders"
          element={
            <ProtectedRoute role="ADMIN">
              <AdminJerseyOrders />
            </ProtectedRoute>
          }
        />
        <Route
          path="/payment/return"
          element={
            <ProtectedRoute role={["ADMIN", "HEAD_COACH", "PLAYER"]}>
              <PaymentReturn />
            </ProtectedRoute>
          }
        />
        <Route
          path="/referee"
          element={
            <ProtectedRoute role="REFEREE">
              <RefereeSchedulePage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </LanguageProvider>
  );
}

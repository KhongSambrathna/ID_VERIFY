import { Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import AdminDashboard from "./pages/AdminDashboard";
import AddAthlete from "./pages/AddAthlete";
import EditAthlete from "./pages/EditAthlete";
import AthleteCardPage from "./pages/AthleteCardPage";
import AllCardsPage from "./pages/AllCardsPage";
import VerifyPage from "./pages/VerifyPage";
import SearchPage from "./pages/SearchPage";
import AboutUs from "./pages/AboutUs";
import CoachDashboard from "./pages/CoachDashboard";
import AdminUsers from "./pages/AdminUsers";
import AdminSponsors from "./pages/AdminSponsors";
import AdminMatchDay from "./pages/AdminMatchDay";
import AdminShop from "./pages/AdminShop";
import ShopPage from "./pages/ShopPage";
import DebtReportPage from "./pages/DebtReportPage";
import StatsPage from "./pages/StatsPage";
import RenewPage from "./pages/RenewPage";
import PlayerDashboard from "./pages/PlayerDashboard";

export default function App() {
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/verify/:verifyId" element={<VerifyPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/shop" element={<ShopPage />} />
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
          path="/admin/users"
          element={
            <ProtectedRoute role="ADMIN">
              <AdminUsers />
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
        <Route
          path="/admin/shop"
          element={
            <ProtectedRoute role="ADMIN">
              <AdminShop />
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
          path="/admin/renew"
          element={
            <ProtectedRoute role={["ADMIN", "HEAD_COACH"]}>
              <RenewPage />
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
      </Routes>
    </>
  );
}

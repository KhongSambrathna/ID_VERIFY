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
import CoachDashboard from "./pages/CoachDashboard";
import AdminUsers from "./pages/AdminUsers";

export default function App() {
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/verify/:verifyId" element={<VerifyPage />} />
        <Route path="/search" element={<SearchPage />} />
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
            <ProtectedRoute role="ADMIN">
              <AddAthlete />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/athlete/:id"
          element={
            <ProtectedRoute role="ADMIN">
              <AthleteCardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/athlete/:id/edit"
          element={
            <ProtectedRoute role="ADMIN">
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
          path="/coach"
          element={
            <ProtectedRoute role="HEAD_COACH">
              <CoachDashboard />
            </ProtectedRoute>
          }
        />
      </Routes>
    </>
  );
}

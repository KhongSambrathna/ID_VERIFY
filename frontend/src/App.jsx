import { Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import AdminDashboard from "./pages/AdminDashboard";
import AddAthlete from "./pages/AddAthlete";
import AthleteCardPage from "./pages/AthleteCardPage";
import AllCardsPage from "./pages/AllCardsPage";
import VerifyPage from "./pages/VerifyPage";

export default function App() {
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/verify/:verifyId" element={<VerifyPage />} />
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/new"
          element={
            <ProtectedRoute>
              <AddAthlete />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/athlete/:id"
          element={
            <ProtectedRoute>
              <AthleteCardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/cards"
          element={
            <ProtectedRoute>
              <AllCardsPage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </>
  );
}

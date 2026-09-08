import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// <ProtectedRoute> — any signed-in account.
// <ProtectedRoute role="ADMIN"> — only that role; anyone else is sent to
// their own dashboard instead of a login loop.
export default function ProtectedRoute({ children, role }) {
  const { isAuthed, role: userRole } = useAuth();

  if (!isAuthed) return <Navigate to="/login" replace />;

  if (role && userRole !== role) {
    return <Navigate to={userRole === "HEAD_COACH" ? "/coach" : "/admin"} replace />;
  }

  return children;
}

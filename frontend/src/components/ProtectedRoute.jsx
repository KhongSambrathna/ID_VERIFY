import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// <ProtectedRoute> — any signed-in account.
// <ProtectedRoute role="ADMIN"> — only that role.
// <ProtectedRoute role={["ADMIN", "HEAD_COACH"]}> — any of the listed
// roles (for a page shared by both, like the athlete add/edit forms).
// Anyone else is sent to their own dashboard instead of a login loop.
export default function ProtectedRoute({ children, role }) {
  const { isAuthed, role: userRole } = useAuth();

  if (!isAuthed) return <Navigate to="/login" replace />;

  const allowedRoles = Array.isArray(role) ? role : role ? [role] : null;
  if (allowedRoles && !allowedRoles.includes(userRole)) {
    return <Navigate to={userRole === "HEAD_COACH" ? "/coach" : "/admin"} replace />;
  }

  return children;
}

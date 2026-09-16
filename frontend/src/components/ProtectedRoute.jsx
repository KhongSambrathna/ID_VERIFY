import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// <ProtectedRoute> — any signed-in account.
// <ProtectedRoute role="ADMIN"> — only that role.
// <ProtectedRoute role={["ADMIN", "HEAD_COACH"]}> — any of the listed
// roles (for a page shared by both, like the athlete add/edit forms).
// Anyone else is sent to their own dashboard instead of a login loop.
export default function ProtectedRoute({ children, role }) {
  const { isAuthed, role: userRole, mustChangePassword } = useAuth();
  const location = useLocation();

  if (!isAuthed) return <Navigate to="/login" replace />;

  // A fresh individual Player account (still on the default password) can
  // only ever reach the change-password screen — everything else bounces
  // there first, same as a forced first-run setup step. Skip the bounce
  // when that's already where we're headed, or it'd redirect to itself.
  if (mustChangePassword && location.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }

  const allowedRoles = Array.isArray(role) ? role : role ? [role] : null;
  if (allowedRoles && !allowedRoles.includes(userRole)) {
    const ownDashboard =
      userRole === "HEAD_COACH" ? "/coach" : userRole === "PLAYER" ? "/player" : "/admin";
    return <Navigate to={ownDashboard} replace />;
  }

  return children;
}

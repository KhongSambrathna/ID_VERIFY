import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";

// Reached two ways: forced (ProtectedRoute redirects here automatically
// whenever the signed-in account still has mustChangePassword set — a
// fresh individual Player account on the default "12345", or one just
// reset by an Admin/Head Coach or the Telegram forgot-password flow) or
// voluntarily (anyone can navigate here to change their password anytime).
export default function ChangePasswordPage() {
  const { user, mustChangePassword, login, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation don't match");
      return;
    }
    if (newPassword.length < 4) {
      setError("New password must be at least 4 characters");
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post("/auth/change-password", { currentPassword, newPassword });
      login(data.token, data.admin);
      navigate(
        data.admin?.role === "HEAD_COACH" ? "/coach" : data.admin?.role === "PLAYER" ? "/player" : "/admin"
      );
    } catch (err) {
      setError(err.response?.data?.message || "Failed to change password");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="auth-wrap">
      <form className="card" onSubmit={handleSubmit}>
        <h2>{mustChangePassword ? "Set a new password" : "Change password"}</h2>
        {mustChangePassword && (
          <p className="help-text" style={{ marginTop: -8 }}>
            {user?.username ? `Signed in as ${user.username}. ` : ""}
            You're using a temporary password — set your own before continuing.
          </p>
        )}
        <div className="field">
          <label>Current password</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label>New password</label>
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
        </div>
        <div className="field">
          <label>Confirm new password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        </div>
        {error && <div className="error-text">{error}</div>}
        <button className="btn btn-primary" style={{ width: "100%" }} disabled={saving}>
          {saving ? "Saving…" : "Save new password"}
        </button>
        {mustChangePassword && (
          <button
            type="button"
            className="link-btn"
            style={{ marginTop: 10 }}
            onClick={() => {
              logout();
              navigate("/login");
            }}
          >
            Sign out instead
          </button>
        )}
      </form>
    </div>
  );
}

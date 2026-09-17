import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../i18n/LanguageContext";

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
  const { t } = useLanguage();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError(t("changePasswordPage.passwordMismatch"));
      return;
    }
    if (newPassword.length < 4) {
      setError(t("changePasswordPage.passwordTooShort"));
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
      setError(err.response?.data?.message || t("changePasswordPage.changeFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="auth-wrap">
      <form className="card" onSubmit={handleSubmit}>
        <h2>{mustChangePassword ? t("changePasswordPage.setNewPasswordTitle") : t("changePasswordPage.changePasswordTitle")}</h2>
        {mustChangePassword && (
          <p className="help-text" style={{ marginTop: -8 }}>
            {user?.username ? `${t("changePasswordPage.signedInAsPrefix")} ${user.username}. ` : ""}
            {t("changePasswordPage.temporaryPasswordNotice")}
          </p>
        )}
        <div className="field">
          <label>{t("changePasswordPage.currentPasswordLabel")}</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label>{t("changePasswordPage.newPasswordLabel")}</label>
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
        </div>
        <div className="field">
          <label>{t("changePasswordPage.confirmNewPasswordLabel")}</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        </div>
        {error && <div className="error-text">{error}</div>}
        <button className="btn btn-primary" style={{ width: "100%" }} disabled={saving}>
          {saving ? t("common.saving") : t("changePasswordPage.saveNewPassword")}
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
            {t("changePasswordPage.signOutInstead")}
          </button>
        )}
      </form>
    </div>
  );
}

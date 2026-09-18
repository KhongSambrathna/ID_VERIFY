import { useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";
import { useLanguage } from "../i18n/LanguageContext";

// Self-service password recovery — works for ANY account (Admin, Head
// Coach, or an individual Player) that has already linked its own
// Telegram chat id: Admin from the Admin dashboard, Head Coach from the
// Coach dashboard's "Player accounts" tab, and an individual Player from
// the Tournaments page, all via the same "Link my Telegram" card once
// signed in. Anyone who hasn't linked Telegram yet — or the older shared
// team-wide Player login, which has no self-service link of its own — asks
// an Admin/Head Coach to reset it for them instead (for a Player account:
// Manage users → Player accounts → Reset password). The response is
// always the same generic message either way, so this can't be used to
// check which usernames exist.
export default function ForgotPasswordPage() {
  const [username, setUsername] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { t } = useLanguage();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { username });
      setSubmitted(true);
    } catch (err) {
      setError(err.response?.data?.message || t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="card">
        <h2>{t("forgotPasswordPage.title")}</h2>
        {submitted ? (
          <>
            <p>{t("forgotPasswordPage.successMessage")}</p>
            <p className="help-text">{t("forgotPasswordPage.noTelegramHelp")}</p>
            <Link className="btn btn-outline" style={{ color: "var(--navy)", borderColor: "var(--navy)" }} to="/login">
              {t("forgotPasswordPage.backToSignIn")}
            </Link>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <p className="help-text" style={{ marginTop: 0 }}>
              {t("forgotPasswordPage.instructions")}
            </p>
            <div className="field">
              <label>{t("common.username")}</label>
              <input value={username} onChange={(e) => setUsername(e.target.value)} required />
            </div>
            {error && <div className="error-text">{error}</div>}
            <button className="btn btn-primary" style={{ width: "100%" }} disabled={loading}>
              {loading ? t("forgotPasswordPage.sending") : t("forgotPasswordPage.sendButton")}
            </button>
            <Link className="link-btn" style={{ marginTop: 10, display: "inline-block" }} to="/login">
              {t("forgotPasswordPage.backToSignIn")}
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}

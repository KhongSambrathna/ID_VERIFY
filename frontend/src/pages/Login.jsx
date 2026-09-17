import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../i18n/LanguageContext";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { username, password });
      login(data.token, data.admin);
      if (data.admin?.mustChangePassword) {
        navigate("/change-password");
        return;
      }
      navigate(
        data.admin?.role === "HEAD_COACH" ? "/coach" : data.admin?.role === "PLAYER" ? "/player" : "/admin"
      );
    } catch (err) {
      setError(err.response?.data?.message || t("login.loginFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrap">
      <form className="card" onSubmit={handleSubmit}>
        <h2>{t("login.signIn")}</h2>
        <div className="field">
          <label>{t("common.username")}</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} required />
        </div>
        <div className="field">
          <label>{t("common.password")}</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && <div className="error-text">{error}</div>}
        <button className="btn btn-primary" style={{ width: "100%" }} disabled={loading}>
          {loading ? t("login.signingIn") : t("login.signIn")}
        </button>
        <Link className="link-btn" style={{ marginTop: 10, display: "inline-block" }} to="/forgot-password">
          {t("login.forgotPassword")}
        </Link>
        <p className="help-text">{t("login.helpText")}</p>
      </form>
    </div>
  );
}

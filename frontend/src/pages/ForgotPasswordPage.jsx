import { useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";

// Self-service password recovery — only works for an individual Player
// account that has already linked its own Telegram chat id (set from the
// Tournaments page once signed in). Anyone else — Admin, Head Coach, a
// player who hasn't linked Telegram, or the older shared team-wide Player
// login — needs their Admin or Head Coach to reset it for them instead
// (Manage users → Player accounts → Reset password). The response is
// always the same generic message either way, so this can't be used to
// check which usernames exist.
export default function ForgotPasswordPage() {
  const [username, setUsername] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { username });
      setSubmitted(true);
    } catch (err) {
      setError(err.response?.data?.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="card">
        <h2>Forgot password</h2>
        {submitted ? (
          <>
            <p>
              If that account has a Telegram chat linked, a new temporary password was just sent there — sign
              in with it, then set your own password when asked.
            </p>
            <p className="help-text">
              Didn't get anything, or don't have Telegram linked yet? Ask your Admin or Head Coach to reset
              your password for you.
            </p>
            <Link className="btn btn-outline" style={{ color: "var(--navy)", borderColor: "var(--navy)" }} to="/login">
              Back to sign in
            </Link>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <p className="help-text" style={{ marginTop: 0 }}>
              Enter your username (your player ID, e.g. 001-100-2991). If it's an individual player account
              with Telegram linked, we'll send a temporary password there.
            </p>
            <div className="field">
              <label>Username</label>
              <input value={username} onChange={(e) => setUsername(e.target.value)} required />
            </div>
            {error && <div className="error-text">{error}</div>}
            <button className="btn btn-primary" style={{ width: "100%" }} disabled={loading}>
              {loading ? "Sending…" : "Send temporary password"}
            </button>
            <Link className="link-btn" style={{ marginTop: 10, display: "inline-block" }} to="/login">
              Back to sign in
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}

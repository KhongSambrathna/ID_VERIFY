import { useEffect, useState } from "react";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";

function formatDate(d) {
  const date = new Date(d);
  if (isNaN(date)) return "";
  return date.toISOString().slice(0, 10);
}

function ageRuleSummary(t) {
  if (!t.ageLimitYear) return "";
  let s = `Born ${t.ageLimitYear}+`;
  if (t.overageSlots > 0) {
    s += ` (or ${t.overageLimitYear || "—"}+ for up to ${t.overageSlots} over-age spots, ${t.overageUsed || 0} used)`;
  }
  return s;
}

// Individual Player account only — browse open tournaments and register
// yourself (blocked if you owe a fee on the team you'd be playing under).
// Also where you link your own Telegram chat id, needed for the
// self-service "forgot password" flow on the sign-in page.
export default function TournamentsPage() {
  const { user, team, athleteId, login } = useAuth();
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [registeringId, setRegisteringId] = useState(null);

  const [telegramDraft, setTelegramDraft] = useState(user?.telegramChatId || "");
  const [savingTelegram, setSavingTelegram] = useState(false);
  const [telegramSaved, setTelegramSaved] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/tournaments");
      setTournaments(data);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load tournaments");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const register = async (t) => {
    setRegisteringId(t._id);
    try {
      await api.post(`/tournaments/${t._id}/register`, { team });
      load();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to register");
    } finally {
      setRegisteringId(null);
    }
  };

  const unregister = async (t) => {
    if (!confirm(`Cancel your registration for "${t.name}"?`)) return;
    setRegisteringId(t._id);
    try {
      await api.delete(`/tournaments/${t._id}/registrations/${t.myRegistrationId}`);
      load();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to cancel");
    } finally {
      setRegisteringId(null);
    }
  };

  const saveTelegram = async () => {
    setSavingTelegram(true);
    setTelegramSaved(false);
    try {
      const { data } = await api.put("/auth/me/telegram", { telegramChatId: telegramDraft });
      login(localStorage.getItem("token"), data);
      setTelegramSaved(true);
    } catch (err) {
      alert(err.response?.data?.message || "Failed to save");
    } finally {
      setSavingTelegram(false);
    }
  };

  if (!athleteId) {
    return (
      <div className="container dash-body">
        <p className="error-text">This page is only for an individual player login.</p>
      </div>
    );
  }

  return (
    <div className="container dash-body">
      <div className="dash-header">
        <h2>Tournaments</h2>
        <p>Register yourself for an upcoming tournament. Owing a fee on your team blocks registration until it's paid.</p>
      </div>

      <div className="card" style={{ maxWidth: 420, marginBottom: 24 }}>
        <h4 style={{ marginTop: 0 }}>Link Telegram (for password recovery)</h4>
        <p className="help-text" style={{ marginTop: -6 }}>
          Message the club's Telegram bot once, then get your numeric chat ID from @userinfobot and paste it
          below. If you ever forget your password, use "Forgot password?" on the sign-in page to get a new
          temporary one sent here.
        </p>
        <div className="field">
          <label>Telegram chat ID</label>
          <input
            placeholder="e.g. 123456789"
            value={telegramDraft}
            onChange={(e) => {
              setTelegramDraft(e.target.value);
              setTelegramSaved(false);
            }}
          />
        </div>
        <button className="btn btn-outline" style={{ color: "var(--navy)", borderColor: "var(--navy)" }} onClick={saveTelegram} disabled={savingTelegram}>
          {savingTelegram ? "Saving…" : telegramSaved ? "Saved ✓" : "Save"}
        </button>
      </div>

      {loading && <p>Loading…</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && !error && (
        <div className="table-scroll">
          <table className="athletes">
            <thead>
              <tr>
                <th>Name</th>
                <th>Entry fee</th>
                <th>Dates</th>
                <th>Rules</th>
                <th>Spots</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tournaments.map((t) => (
                <tr key={t._id}>
                  <td data-label="Name">{t.name}</td>
                  <td data-label="Entry fee">${t.entryFee || 0}</td>
                  <td data-label="Dates">{t.matchDates?.length ? t.matchDates.map(formatDate).join(", ") : "—"}</td>
                  <td data-label="Rules">{ageRuleSummary(t) || "No age limit"}</td>
                  <td data-label="Spots">
                    {t.maxParticipants ? `${t.registrationCount}/${t.maxParticipants}` : t.registrationCount}
                  </td>
                  <td data-label="Actions" className="actions-cell">
                    {t.myRegistrationId ? (
                      <>
                        <span className="badge verified" style={{ marginRight: 6 }}>
                          Registered
                        </span>
                        <button className="action-btn danger" disabled={registeringId === t._id} onClick={() => unregister(t)}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button className="action-btn positive" disabled={registeringId === t._id} onClick={() => register(t)}>
                        {registeringId === t._id ? "Registering…" : "Register"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {tournaments.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", color: "#777" }}>
                    No tournaments open right now.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import TeamSelect from "../components/TeamSelect";

const ROLE_OPTIONS = [
  { value: "ADMIN", label: "Admin" },
  { value: "HEAD_COACH", label: "Head Coach" },
  { value: "PLAYER", label: "Player (read-only, shared)" },
];

const ROLE_LABELS = { HEAD_COACH: "Head Coach", PLAYER: "Player", ADMIN: "Admin" };

export default function AdminUsers() {
  const { user: currentUser, isAdmin } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    username: "",
    password: "",
    role: "HEAD_COACH",
    team: "",
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [telegramDrafts, setTelegramDrafts] = useState({});
  const [savingTelegramId, setSavingTelegramId] = useState(null);

  // Individual per-athlete Player logins (tournament self-registration) —
  // kept separate from the table above since there can be one per athlete.
  const [playerAccounts, setPlayerAccounts] = useState([]);
  const [playerAccountsLoading, setPlayerAccountsLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generateSummary, setGenerateSummary] = useState(null);
  const [resettingId, setResettingId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/auth/users");
      setUsers(data);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  const loadPlayerAccounts = async () => {
    setPlayerAccountsLoading(true);
    try {
      const { data } = await api.get("/auth/player-accounts");
      setPlayerAccounts(data);
    } catch {
      // Head Coach role also has access, so a failure here is unusual —
      // just leave the list empty rather than blocking the whole page.
    } finally {
      setPlayerAccountsLoading(false);
    }
  };

  useEffect(() => {
    load();
    loadPlayerAccounts();
  }, []);

  const generatePlayerAccounts = async () => {
    setGenerating(true);
    setGenerateSummary(null);
    try {
      const { data } = await api.post("/auth/player-accounts/generate");
      setGenerateSummary(data);
      loadPlayerAccounts();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to generate player accounts");
    } finally {
      setGenerating(false);
    }
  };

  const resetPlayerPassword = async (account) => {
    if (!confirm(`Reset ${account.username}'s password back to the default? They'll be asked to change it at next sign-in.`)) return;
    setResettingId(account._id);
    try {
      await api.put(`/auth/player-accounts/${account._id}/reset-password`);
      loadPlayerAccounts();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to reset password");
    } finally {
      setResettingId(null);
    }
  };

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const handleCreate = async (e) => {
    e.preventDefault();
    setFormError("");
    setSaving(true);
    try {
      await api.post("/auth/users", {
        username: form.username,
        password: form.password,
        role: form.role,
        team: form.role === "HEAD_COACH" || form.role === "PLAYER" ? form.team : undefined,
      });
      setForm({ username: "", password: "", role: "HEAD_COACH", team: "" });
      load();
    } catch (err) {
      setFormError(err.response?.data?.message || "Failed to create user");
    } finally {
      setSaving(false);
    }
  };

  // Telegram chat id — the only thing an existing account can have edited
  // (username/role/team are fixed at creation). Skipped entirely if
  // TELEGRAM_BOT_TOKEN isn't set on the backend; that's fine, the field is
  // just never used and nothing breaks.
  const saveTelegram = async (u) => {
    setSavingTelegramId(u._id);
    try {
      await api.put(`/auth/users/${u._id}`, {
        telegramChatId: telegramDrafts[u._id] ?? u.telegramChatId ?? "",
      });
      load();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to save");
    } finally {
      setSavingTelegramId(null);
    }
  };

  const remove = async (id) => {
    if (!confirm("Delete this user login? They won't be able to sign in anymore.")) return;
    try {
      await api.delete(`/auth/users/${id}`);
      load();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to delete user");
    }
  };

  return (
    <div className="container dash-body">
      <div className="dash-header">
        <h2>Users &amp; roles</h2>
        <p>
          Create Head Coach logins so coaches can build their own team's lineups — they can only pull
          athletes already registered in their team, never add new ones. Create a Player login (one shared
          account per team) so players can view their team's roster and fee/debt status — read-only, no
          editing.
        </p>
        <p className="help-text" style={{ maxWidth: 640 }}>
          Telegram alerts (new pending approvals, approve/reject, new fees) need a bot token set on the
          backend first (message @BotFather on Telegram → /newbot → put the token in Render's environment
          variables as TELEGRAM_BOT_TOKEN). Once that's done, each user below opens a chat with that bot,
          sends it any message, looks up their own numeric chat id (e.g. via @userinfobot), and pastes it
          in the "Telegram chat ID" column.
        </p>
      </div>

      <form className="card" style={{ maxWidth: 480, marginBottom: 24 }} onSubmit={handleCreate}>
        <h3 style={{ marginTop: 0 }}>Create new user</h3>
        <div className="field">
          <label>Username</label>
          <input value={form.username} onChange={update("username")} required />
        </div>
        <div className="field">
          <label>Password</label>
          <input type="password" value={form.password} onChange={update("password")} required />
        </div>
        <div className="field">
          <label>Role</label>
          <select value={form.role} onChange={update("role")}>
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        {(form.role === "HEAD_COACH" || form.role === "PLAYER") && (
          <TeamSelect value={form.team} onChange={(team) => setForm({ ...form, team })} required />
        )}
        {form.role === "PLAYER" && (
          <p className="help-text" style={{ marginTop: -8 }}>
            One shared login for every player on this team — they can see the whole team's roster and
            fee/debt status, but can never add, edit, or remove anything.
          </p>
        )}
        {formError && <div className="error-text">{formError}</div>}
        <button className="btn btn-primary" disabled={saving}>
          {saving ? "Creating…" : "Create user"}
        </button>
      </form>

      {loading && <p>Loading…</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && !error && (
        <div className="table-scroll">
          <table className="athletes">
            <thead>
              <tr>
                <th>Username</th>
                <th>Role</th>
                <th>Team</th>
                <th>Telegram chat ID</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u._id}>
                  <td data-label="Username">{u.username}</td>
                  <td data-label="Role">{ROLE_LABELS[u.role] || "Admin"}</td>
                  <td data-label="Team">{u.team || "—"}</td>
                  <td data-label="Telegram chat ID">
                    <input
                      type="text"
                      style={{ width: 120 }}
                      placeholder="e.g. 123456789"
                      value={telegramDrafts[u._id] ?? u.telegramChatId ?? ""}
                      onChange={(e) => setTelegramDrafts({ ...telegramDrafts, [u._id]: e.target.value })}
                      disabled={savingTelegramId === u._id}
                    />
                    {(telegramDrafts[u._id] ?? u.telegramChatId ?? "") !== (u.telegramChatId ?? "") && (
                      <button
                        type="button"
                        className="link-btn"
                        disabled={savingTelegramId === u._id}
                        onClick={() => saveTelegram(u)}
                      >
                        {savingTelegramId === u._id ? "Saving…" : "Save"}
                      </button>
                    )}
                  </td>
                  <td data-label="Actions" className="actions-cell">
                    {u._id !== currentUser?.id && (
                      <button className="link-btn" onClick={() => remove(u._id)}>
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", color: "#777" }}>
                    No users yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="dash-header" style={{ marginTop: 40 }}>
        <h3>Player accounts (tournament sign-in)</h3>
        <p>
          One individual login per athlete — username is their own player ID (e.g. 001-100-2991), default
          password "12345", forced to set their own at first sign-in. Used for tournament self-registration;
          separate from the shared team Player login above.
        </p>
        {isAdmin && (
          <div className="dash-actions">
            <button className="btn btn-outline" style={{ color: "var(--navy)", borderColor: "var(--navy)" }} onClick={generatePlayerAccounts} disabled={generating}>
              {generating ? "Generating…" : "Generate missing player logins"}
            </button>
          </div>
        )}
        {generateSummary && (
          <p className="help-text">
            Created {generateSummary.created.length}, skipped {generateSummary.skipped.length}
            {generateSummary.skipped.length > 0 ? " (already had a login, or no verify ID yet)" : ""}.
          </p>
        )}
      </div>

      {playerAccountsLoading && <p>Loading…</p>}

      {!playerAccountsLoading && (
        <div className="table-scroll">
          <table className="athletes">
            <thead>
              <tr>
                <th>Username</th>
                <th>Team</th>
                <th>Must change password</th>
                <th>Telegram linked</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {playerAccounts.map((a) => (
                <tr key={a._id}>
                  <td data-label="Username">{a.username}</td>
                  <td data-label="Team">{a.team || "—"}</td>
                  <td data-label="Must change password">{a.mustChangePassword ? "Yes" : "No"}</td>
                  <td data-label="Telegram linked">{a.telegramChatId ? "Yes" : "No"}</td>
                  <td data-label="Actions" className="actions-cell">
                    <button
                      className="action-btn"
                      disabled={resettingId === a._id}
                      onClick={() => resetPlayerPassword(a)}
                    >
                      {resettingId === a._id ? "Resetting…" : "Reset password"}
                    </button>
                  </td>
                </tr>
              ))}
              {playerAccounts.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", color: "#777" }}>
                    No individual player logins yet.
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

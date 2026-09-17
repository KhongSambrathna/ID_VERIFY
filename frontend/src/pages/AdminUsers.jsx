import { useEffect, useState } from "react";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import TeamSelect from "../components/TeamSelect";
import { useLanguage } from "../i18n/LanguageContext";

export default function AdminUsers() {
  const { t } = useLanguage();
  const { user: currentUser, isAdmin } = useAuth();

  const ROLE_OPTIONS = [
    { value: "ADMIN", label: t("adminUsers.roleAdmin") },
    { value: "HEAD_COACH", label: t("adminUsers.roleHeadCoach") },
    { value: "PLAYER", label: t("adminUsers.rolePlayer") },
  ];

  const ROLE_LABELS = {
    HEAD_COACH: t("adminUsers.roleHeadCoach"),
    PLAYER: t("adminUsers.rolePlayerLabel"),
    ADMIN: t("adminUsers.roleAdmin"),
  };
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
      setError(err.response?.data?.message || t("adminUsers.failedToLoadUsers"));
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
      alert(err.response?.data?.message || t("adminUsers.failedToGenerate"));
    } finally {
      setGenerating(false);
    }
  };

  const resetPlayerPassword = async (account) => {
    if (
      !confirm(
        `${t("adminUsers.confirmResetPasswordPrefix")} ${account.username}${t("adminUsers.confirmResetPasswordSuffix")}`
      )
    )
      return;
    setResettingId(account._id);
    try {
      await api.put(`/auth/player-accounts/${account._id}/reset-password`);
      loadPlayerAccounts();
    } catch (err) {
      alert(err.response?.data?.message || t("adminUsers.failedToResetPassword"));
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
      setFormError(err.response?.data?.message || t("adminUsers.failedToCreateUser"));
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
      alert(err.response?.data?.message || t("common.failedToSave"));
    } finally {
      setSavingTelegramId(null);
    }
  };

  const remove = async (id) => {
    if (!confirm(t("adminUsers.confirmDeleteUser"))) return;
    try {
      await api.delete(`/auth/users/${id}`);
      load();
    } catch (err) {
      alert(err.response?.data?.message || t("common.failedToDelete"));
    }
  };

  return (
    <div className="container dash-body">
      <div className="dash-header">
        <h2>{t("adminUsers.title")}</h2>
        <p>{t("adminUsers.intro")}</p>
        <p className="help-text" style={{ maxWidth: 640 }}>
          {t("adminUsers.telegramHelp")}
        </p>
      </div>

      <form className="card" style={{ maxWidth: 480, marginBottom: 24 }} onSubmit={handleCreate}>
        <h3 style={{ marginTop: 0 }}>{t("adminUsers.createNewUser")}</h3>
        <div className="field">
          <label>{t("common.username")}</label>
          <input value={form.username} onChange={update("username")} required />
        </div>
        <div className="field">
          <label>{t("common.password")}</label>
          <input type="password" value={form.password} onChange={update("password")} required />
        </div>
        <div className="field">
          <label>{t("common.role")}</label>
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
            {t("adminUsers.playerHelp")}
          </p>
        )}
        {formError && <div className="error-text">{formError}</div>}
        <button className="btn btn-primary" disabled={saving}>
          {saving ? t("adminUsers.creating") : t("adminUsers.createUser")}
        </button>
      </form>

      {loading && <p>{t("common.loading")}</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && !error && (
        <div className="table-scroll">
          <table className="athletes">
            <thead>
              <tr>
                <th>{t("common.username")}</th>
                <th>{t("common.role")}</th>
                <th>{t("common.team")}</th>
                <th>{t("adminUsers.telegramChatId")}</th>
                <th>{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u._id}>
                  <td data-label={t("common.username")}>{u.username}</td>
                  <td data-label={t("common.role")}>{ROLE_LABELS[u.role] || t("adminUsers.roleAdmin")}</td>
                  <td data-label={t("common.team")}>{u.team || "—"}</td>
                  <td data-label={t("adminUsers.telegramChatId")}>
                    <input
                      type="text"
                      style={{ width: 120 }}
                      placeholder={t("adminUsers.telegramPlaceholder")}
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
                        {savingTelegramId === u._id ? t("common.saving") : t("common.save")}
                      </button>
                    )}
                  </td>
                  <td data-label={t("common.actions")} className="actions-cell">
                    {u._id !== currentUser?.id && (
                      <button className="link-btn" onClick={() => remove(u._id)}>
                        {t("common.delete")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", color: "#777" }}>
                    {t("adminUsers.noUsers")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="dash-header" style={{ marginTop: 40 }}>
        <h3>{t("adminUsers.playerAccountsTitle")}</h3>
        <p>{t("adminUsers.playerAccountsIntro")}</p>
        {isAdmin && (
          <div className="dash-actions">
            <button className="btn btn-outline" style={{ color: "var(--navy)", borderColor: "var(--navy)" }} onClick={generatePlayerAccounts} disabled={generating}>
              {generating ? t("adminUsers.generating") : t("adminUsers.generateMissing")}
            </button>
          </div>
        )}
        {generateSummary && (
          <p className="help-text">
            {t("adminUsers.created")} {generateSummary.created.length}, {t("adminUsers.skipped")}{" "}
            {generateSummary.skipped.length}
            {generateSummary.skipped.length > 0 ? t("adminUsers.alreadyHadLogin") : ""}.
          </p>
        )}
      </div>

      {playerAccountsLoading && <p>{t("common.loading")}</p>}

      {!playerAccountsLoading && (
        <div className="table-scroll">
          <table className="athletes">
            <thead>
              <tr>
                <th>{t("common.username")}</th>
                <th>{t("common.team")}</th>
                <th>{t("adminUsers.mustChangePassword")}</th>
                <th>{t("adminUsers.telegramLinked")}</th>
                <th>{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {playerAccounts.map((a) => (
                <tr key={a._id}>
                  <td data-label={t("common.username")}>{a.username}</td>
                  <td data-label={t("common.team")}>{a.team || "—"}</td>
                  <td data-label={t("adminUsers.mustChangePassword")}>
                    {a.mustChangePassword ? t("common.yes") : t("common.no")}
                  </td>
                  <td data-label={t("adminUsers.telegramLinked")}>
                    {a.telegramChatId ? t("common.yes") : t("common.no")}
                  </td>
                  <td data-label={t("common.actions")} className="actions-cell">
                    <button
                      className="action-btn"
                      disabled={resettingId === a._id}
                      onClick={() => resetPlayerPassword(a)}
                    >
                      {resettingId === a._id ? t("adminUsers.resetting") : t("adminUsers.resetPassword")}
                    </button>
                  </td>
                </tr>
              ))}
              {playerAccounts.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", color: "#777" }}>
                    {t("adminUsers.noPlayerAccounts")}
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

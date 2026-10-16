import { useCallback, useEffect, useState } from "react";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../i18n/LanguageContext";

// Head Coach's tool for sending self-registration links to players. Creates a
// link, shows it with a copy button so it can be pasted into Telegram/Facebook,
// and lists every link sent so far — how many players used each one, and who
// they were. The backend forces each link to the coach's OWN team — nothing
// here picks a team. Scoped per the same active-subscription rule as adding an
// athlete (a lapsed team can still revoke links, but not create new ones).
//
// A link can serve ONE player (the classic single-use link) or MANY: pick
// "anyone" for an unlimited shared link to paste in the team group chat, or a
// specific number for a capped one. Everyone who registers still starts out
// "pending" until an Admin approves.
export default function RegistrationInviteManager() {
  const { t } = useLanguage();
  const { isAdmin } = useAuth();
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [revokingId, setRevokingId] = useState(null);
  // Teams an Admin can issue a registration link for — a link must target an
  // EXISTING team (no inventing new team names through the link).
  const [teams, setTeams] = useState([]);
  const [team, setTeam] = useState("");

  // Who the new link is for: "unlimited" (share with the whole team),
  // "one" (a single player), or "custom" (a specific number of players).
  const [usage, setUsage] = useState("unlimited");
  const [customUses, setCustomUses] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/registration/invites");
      setInvites(data);
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || t("common.failedToLoad"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  // Only an Admin can issue links, and a link must target an existing team.
  useEffect(() => {
    if (!isAdmin) return;
    api
      .get("/teams")
      .then(({ data }) => setTeams(data || []))
      .catch(() => setTeams([]));
  }, [isAdmin]);

  const createInvite = async () => {
    setCreating(true);
    setError("");
    // maxUses: null = unlimited, 1 = one player, N = N players.
    let maxUses = null;
    if (usage === "one") maxUses = 1;
    if (usage === "custom") {
      const n = Number.parseInt(customUses, 10);
      if (!Number.isFinite(n) || n < 1) {
        setError(t("registrationInvites.invalidCustom"));
        setCreating(false);
        return;
      }
      maxUses = n;
    }
    if (!isAdmin) {
      setError(t("registrationInvites.adminOnly"));
      setCreating(false);
      return;
    }
    if (!team) {
      setError(t("registrationInvites.teamRequired"));
      setCreating(false);
      return;
    }
    try {
      await api.post("/registration/invites", { team, maxUses });
      await load();
      setTeam("");
    } catch (err) {
      setError(err.response?.data?.message || t("registrationInvites.createFailed"));
    } finally {
      setCreating(false);
    }
  };

  // The shareable URL is the frontend's own origin + the token, so it works
  // whether running locally or deployed without any backend config.
  const linkFor = (token) => `${window.location.origin}/register/${token}`;

  const copyLink = async (invite) => {
    const link = linkFor(invite.token);
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(invite._id);
      setTimeout(() => setCopiedId((cur) => (cur === invite._id ? null : cur)), 2000);
    } catch {
      // Clipboard can be unavailable (insecure context, denied permission) —
      // fall back to selecting the text in the read-only input so the user
      // can copy it manually.
      const input = document.getElementById(`invite-link-${invite._id}`);
      if (input) input.select();
    }
  };

  const revokeInvite = async (invite) => {
    if (!confirm(t("registrationInvites.confirmRevoke"))) return;
    setRevokingId(invite._id);
    try {
      await api.delete(`/registration/invites/${invite._id}`);
      await load();
    } catch (err) {
      alert(err.response?.data?.message || t("registrationInvites.revokeFailed"));
    } finally {
      setRevokingId(null);
    }
  };

  // "3 / 10 used", "1 used", or "unlimited" — how many players a link has
  // served out of its cap.
  const usageLabel = (invite) => {
    const max = invite.maxUses;
    if (max === null || max === undefined) return t("registrationInvites.usageUnlimited");
    return `${invite.useCount || 0} / ${max}`;
  };

  const statusBadge = (invite) => {
    if (invite.status === "used") {
      return <span className="badge verified">{t("registrationInvites.statusUsed")}</span>;
    }
    if (invite.status === "revoked") {
      return <span className="badge rejected">{t("registrationInvites.statusRevoked")}</span>;
    }
    return <span className="badge pending">{t("registrationInvites.statusActive")}</span>;
  };

  // Everyone who registered through this link — the whole point of a shared
  // link, so the coach can see the roster it signed up.
  const playerNames = (invite) => {
    const names = (invite.players || []).map((p) => p.fullName || p.khmerName).filter(Boolean);
    return names.length ? names.join(", ") : "—";
  };

  return (
    <div className="tab-content">
      <div className="dash-header" style={{ marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>{t("registrationInvites.title")}</h3>
      </div>
      {isAdmin ? (
        <div className="card" style={{ maxWidth: 720, marginBottom: 24 }}>
          <p className="help-text" style={{ marginTop: 0 }}>
            {t("registrationInvites.intro")}
          </p>
          <div className="field">
            <label>{t("common.team")}</label>
            <select
              value={team}
              onChange={(e) => setTeam(e.target.value)}
              disabled={loading || teams.length === 0}
            >
              <option value="">
                {loading ? t("teamSelect.loadingTeams") : t("teamSelect.selectTeam")}
              </option>
              {teams.map((tTeam) => (
                <option key={tTeam._id} value={tTeam.name}>
                  {tTeam.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>{t("registrationInvites.usageLabel")}</label>
            <select value={usage} onChange={(e) => setUsage(e.target.value)}>
              <option value="unlimited">{t("registrationInvites.usageAnyone")}</option>
              <option value="one">{t("registrationInvites.usageOnePlayer")}</option>
              <option value="custom">{t("registrationInvites.usageCustom")}</option>
            </select>
          </div>
          {usage === "custom" && (
            <div className="field">
              <label>{t("registrationInvites.usageCustomCount")}</label>
              <input
                type="number"
                min="1"
                value={customUses}
                onChange={(e) => setCustomUses(e.target.value)}
                placeholder={t("registrationInvites.usageCustomPlaceholder")}
              />
            </div>
          )}
          <button
            className="btn btn-primary"
            onClick={createInvite}
            disabled={creating || !team}
          >
            {creating ? t("registrationInvites.creating") : t("registrationInvites.createLink")}
          </button>
          {error && <p className="error-text">{error}</p>}
        </div>
      ) : (
        <div className="card" style={{ maxWidth: 720, marginBottom: 24 }}>
          <p className="help-text" style={{ marginTop: 0 }}>
            {t("registrationInvites.adminOnlyCreate")}
          </p>
        </div>
      )}

      {loading ? (
        <p>{t("common.loading")}</p>
      ) : (
        <div className="table-scroll">
          <table className="athletes">
            <thead>
              <tr>
                <th>{t("registrationInvites.colLink")}</th>
                <th>{t("common.team")}</th>
                <th>{t("registrationInvites.colUsage")}</th>
                <th>{t("common.status")}</th>
                <th>{t("registrationInvites.colPlayers")}</th>
                <th>{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {invites.map((invite) => (
                <tr key={invite._id}>
                  <td data-label={t("registrationInvites.colLink")}>
                    <input
                      id={`invite-link-${invite._id}`}
                      readOnly
                      value={linkFor(invite.token)}
                      onFocus={(e) => e.target.select()}
                      style={{ width: "100%", minWidth: 220 }}
                    />
                  </td>
                  <td data-label={t("common.team")} className="caps-display">
                    {invite.team}
                  </td>
                  <td data-label={t("registrationInvites.colUsage")} className="caps-display">
                    {usageLabel(invite)}
                  </td>
                  <td data-label={t("common.status")}>{statusBadge(invite)}</td>
                  <td data-label={t("registrationInvites.colPlayers")} className="caps-display">
                    {playerNames(invite)}
                  </td>
                  <td data-label={t("common.actions")} className="actions-cell">
                    {invite.status === "active" && (
                      <>
                        <button className="action-btn" onClick={() => copyLink(invite)}>
                          {copiedId === invite._id
                            ? t("registrationInvites.copied")
                            : t("registrationInvites.copyLink")}
                        </button>
                        <button
                          className="action-btn danger"
                          disabled={revokingId === invite._id}
                          onClick={() => revokeInvite(invite)}
                        >
                          {t("registrationInvites.revoke")}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {invites.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", color: "#777" }}>
                    {t("registrationInvites.noInvites")}
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


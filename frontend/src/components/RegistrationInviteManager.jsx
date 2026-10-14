import { useCallback, useEffect, useState } from "react";
import api from "../api/axios";
import { useLanguage } from "../i18n/LanguageContext";

// Head Coach's tool for sending self-registration links to players. Creates a
// single-use link, shows it with a copy button so it can be pasted into
// Telegram/Facebook, and lists every link sent so far (who's used it, who's
// still active). The backend forces the link to the coach's OWN team — nothing
// here picks a team. Scoped per the same active-subscription rule as adding an
// athlete (a lapsed team can still revoke links, but not create new ones).
export default function RegistrationInviteManager() {
  const { t } = useLanguage();
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [revokingId, setRevokingId] = useState(null);

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

  const createInvite = async () => {
    setCreating(true);
    setError("");
    try {
      await api.post("/registration/invites", {});
      await load();
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

  const statusBadge = (invite) => {
    if (invite.status === "used") {
      return <span className="badge verified">{t("registrationInvites.statusUsed")}</span>;
    }
    if (invite.status === "revoked") {
      return <span className="badge rejected">{t("registrationInvites.statusRevoked")}</span>;
    }
    return <span className="badge pending">{t("registrationInvites.statusActive")}</span>;
  };

  return (
    <div className="tab-content">
      <div className="dash-header" style={{ marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>{t("registrationInvites.title")}</h3>
      </div>
      <div className="card" style={{ maxWidth: 720, marginBottom: 24 }}>
        <p className="help-text" style={{ marginTop: 0 }}>
          {t("registrationInvites.intro")}
        </p>
        <button className="btn btn-primary" onClick={createInvite} disabled={creating}>
          {creating ? t("registrationInvites.creating") : t("registrationInvites.createLink")}
        </button>
        {error && <p className="error-text">{error}</p>}
      </div>

      {loading ? (
        <p>{t("common.loading")}</p>
      ) : (
        <div className="table-scroll">
          <table className="athletes">
            <thead>
              <tr>
                <th>{t("registrationInvites.colLink")}</th>
                <th>{t("common.team")}</th>
                <th>{t("common.status")}</th>
                <th>{t("registrationInvites.colPlayer")}</th>
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
                  <td data-label={t("common.status")}>{statusBadge(invite)}</td>
                  <td data-label={t("registrationInvites.colPlayer")} className="caps-display">
                    {invite.fullName || "—"}
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
                  <td colSpan={5} style={{ textAlign: "center", color: "#777" }}>
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


import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { resolveFileUrl } from "../utils/fileUrl";
import SquadListManager from "../components/SquadListManager";
import FormationManager from "../components/FormationManager";
import StartingXIManager from "../components/StartingXIManager";
import RequireActiveSubscription from "../components/RequireActiveSubscription";
import { useLanguage } from "../i18n/LanguageContext";

function formatDob(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d)) return null;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}

export default function CoachDashboard() {
  const { t } = useLanguage();
  const { team, user, login } = useAuth();
  const [athletes, setAthletes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchParams] = useSearchParams();
  // Lets a link from elsewhere (e.g. a tournament's squad page) land
  // directly on a specific tab, e.g. /coach?tab=lineups.
  const validTabs = ["athletes", "lineups", "formations", "startingxi", "accounts"];
  const tabFromUrl = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState(validTabs.includes(tabFromUrl) ? tabFromUrl : "athletes");

  // Individual per-athlete Player logins (tournament self-registration) on
  // this Head Coach's own team — the backend already scopes both endpoints
  // to req.adminTeam, so nothing here needs to filter again. Only their
  // password can be reset from here; creating/generating accounts stays an
  // Admin-only action on the Users page.
  const [playerAccounts, setPlayerAccounts] = useState([]);
  const [playerAccountsLoading, setPlayerAccountsLoading] = useState(true);
  const [resettingId, setResettingId] = useState(null);

  // This Head Coach's OWN Telegram chat id — needed for the self-service
  // "forgot password" flow on the sign-in page (own account, not one of the
  // player accounts managed below).
  const [telegramDraft, setTelegramDraft] = useState(user?.telegramChatId || "");
  const [savingTelegram, setSavingTelegram] = useState(false);
  const [telegramSaved, setTelegramSaved] = useState(false);

  // This team's static ABA Merchant KHQR image — the "scan to pay" fallback
  // for a team that only has the ABA Merchant app (no PayWay API access).
  // See backend/models/Team.js for why this exists.
  const [khqrImageUrl, setKhqrImageUrl] = useState(null);
  const [khqrLoading, setKhqrLoading] = useState(true);
  const [khqrFile, setKhqrFile] = useState(null);
  const [khqrUploading, setKhqrUploading] = useState(false);
  const [khqrRemoving, setKhqrRemoving] = useState(false);
  const [khqrError, setKhqrError] = useState("");

  useEffect(() => {
    loadData();
    loadPlayerAccounts();
    loadKhqr();
  }, []);

  const saveTelegram = async () => {
    setSavingTelegram(true);
    setTelegramSaved(false);
    try {
      const { data } = await api.put("/auth/me/telegram", { telegramChatId: telegramDraft });
      login(localStorage.getItem("token"), data);
      setTelegramSaved(true);
    } catch (err) {
      alert(err.response?.data?.message || t("common.failedToSave"));
    } finally {
      setSavingTelegram(false);
    }
  };

  const loadKhqr = async () => {
    setKhqrLoading(true);
    try {
      const { data } = await api.get("/teams/mine/khqr");
      setKhqrImageUrl(data.khqrImageUrl || null);
    } catch {
      // Leave it blank rather than blocking the rest of the dashboard.
    } finally {
      setKhqrLoading(false);
    }
  };

  const uploadKhqr = async () => {
    if (!khqrFile) return;
    setKhqrUploading(true);
    setKhqrError("");
    try {
      const formData = new FormData();
      formData.append("khqr", khqrFile);
      const { data } = await api.put("/teams/mine/khqr", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setKhqrImageUrl(data.khqrImageUrl || null);
      setKhqrFile(null);
    } catch (err) {
      setKhqrError(err.response?.data?.message || t("coachDashboard.khqrUploadFailed"));
    } finally {
      setKhqrUploading(false);
    }
  };

  const removeKhqr = async () => {
    if (!confirm(t("coachDashboard.confirmRemoveKhqr"))) return;
    setKhqrRemoving(true);
    setKhqrError("");
    try {
      await api.delete("/teams/mine/khqr");
      setKhqrImageUrl(null);
    } catch (err) {
      setKhqrError(err.response?.data?.message || t("coachDashboard.khqrRemoveFailed"));
    } finally {
      setKhqrRemoving(false);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/coach/my-team");
      setAthletes(data);
    } catch (err) {
      setError(err.response?.data?.message || t("common.failedToLoad"));
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
      // Leave the list empty rather than blocking the rest of the dashboard.
    } finally {
      setPlayerAccountsLoading(false);
    }
  };

  const resetPlayerPassword = async (account) => {
    if (
      !confirm(
        `${t("coachDashboard.confirmResetPasswordPrefix")} ${account.username}${t("coachDashboard.confirmResetPasswordSuffix")}`
      )
    )
      return;
    setResettingId(account._id);
    try {
      await api.put(`/auth/player-accounts/${account._id}/reset-password`);
      loadPlayerAccounts();
    } catch (err) {
      alert(err.response?.data?.message || t("coachDashboard.failedToResetPassword"));
    } finally {
      setResettingId(null);
    }
  };

  // Each row is one team/role assignment on your team (someone with 2 roles
  // here shows up as 2 cards). Removing one isn't immediate — it's flagged
  // for an Admin to confirm, same as adding a new one needs their approval.
  const removeAssignment = async (athlete) => {
    if (!confirm(t("coachDashboard.confirmRemoveAssignment"))) return;
    try {
      await api.delete(`/athletes/${athlete._id}/assignments/${athlete.assignmentId}`);
      loadData();
    } catch (err) {
      alert(err.response?.data?.message || t("coachDashboard.failedToRequestRemoval"));
    }
  };

  const pendingCount = athletes.filter((a) => a.approvalStatus === "pending" || a.pendingRemoval).length;

  // loading/error are checked INSIDE RequireActiveSubscription, not as an
  // early return before it. This dashboard's own data fetch
  // (GET /coach/my-team) is gated by the exact same subscription check as
  // everything else on the coach router, so an expired Head Coach's fetch
  // always fails with a 402 — if that failure short-circuited the render
  // before reaching the wrapper below, they'd see this raw error text
  // instead of the proper "subscription required" lock screen every time
  // they opened this page.
  return (
    <RequireActiveSubscription>
    {loading ? (
      <div className="container"><p>{t("common.loading")}</p></div>
    ) : error ? (
      <div className="container"><p className="error-text">{error}</p></div>
    ) : (
    <div className="container dash-body">
      <div className="dash-header">
        <h2>{t("coachDashboard.title")}</h2>
        <p>
          {t("coachDashboard.descBefore")}{" "}
          <strong>{t("common.pending")}</strong>{t("coachDashboard.descAfter")}
        </p>
        <Link to="/admin/stats" className="btn btn-outline" style={{ color: "var(--navy)", borderColor: "var(--navy)" }}>
          {t("coachDashboard.pendingDebtReport")}
        </Link>
        <Link to="/admin/renew" className="btn btn-outline" style={{ color: "var(--navy)", borderColor: "var(--navy)" }}>
          {t("coachDashboard.idRenewal")}
        </Link>
      </div>

      <div className="tabs">
        <button
          className={`tab-btn ${activeTab === "athletes" ? "active" : ""}`}
          onClick={() => setActiveTab("athletes")}
        >
          {t("coachDashboard.tabMyTeam")} ({athletes.length})
        </button>
        <button
          className={`tab-btn ${activeTab === "lineups" ? "active" : ""}`}
          onClick={() => setActiveTab("lineups")}
        >
          {t("coachDashboard.tabSquadList")}
        </button>
        <button
          className={`tab-btn ${activeTab === "formations" ? "active" : ""}`}
          onClick={() => setActiveTab("formations")}
        >
          {t("coachDashboard.tabFormation")}
        </button>
        <button
          className={`tab-btn ${activeTab === "startingxi" ? "active" : ""}`}
          onClick={() => setActiveTab("startingxi")}
        >
          {t("coachDashboard.tabStartingXI")}
        </button>
        <button
          className={`tab-btn ${activeTab === "accounts" ? "active" : ""}`}
          onClick={() => setActiveTab("accounts")}
        >
          {t("coachDashboard.tabPlayerAccounts")}
        </button>
      </div>

      {/* ATHLETES TAB */}
      {activeTab === "athletes" && (
        <div className="tab-content">
          <div className="dash-header" style={{ marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>
              {t("coachDashboard.myTeamAthletes")}{" "}
              {pendingCount > 0 && `(${pendingCount} ${t("coachDashboard.pendingApproval")})`}
            </h3>
            <Link to="/admin/new" className="btn btn-primary">
              {t("coachDashboard.addAthlete")}
            </Link>
          </div>
          {athletes.length === 0 ? (
            <p>{t("coachDashboard.noAthletes")}</p>
          ) : (
            <div className="athletes-grid">
              {athletes.map((athlete) => (
                <div key={athlete.assignmentId} className="athlete-card">
                  <img
                    src={
                      athlete.photoUrl
                        ? resolveFileUrl(athlete.photoUrl)
                        : "https://placehold.co/150x150?text=Photo"
                    }
                    alt={athlete.fullName}
                    className="athlete-photo"
                  />
                  <h4 className="caps-display">{athlete.fullName}</h4>
                  {athlete.khmerName && <p className="khmer-name">{athlete.khmerName}</p>}
                  <p className="role">
                    {athlete.role || "PLAYER"}
                    {athlete.jerseyNumber != null && ` · #${athlete.jerseyNumber}`}
                  </p>
                  <p className="verify-id">{t("common.verifyId")}: {athlete.verifyId}</p>
                  <p className="athlete-meta">
                    {formatDob(athlete.dateOfBirth) || t("coachDashboard.dobDash")} · {athlete.gender || "—"}
                  </p>
                  <div className="athlete-status">
                    <span className={`badge ${athlete.isAvailable ? "verified" : "rejected"}`}>
                      {athlete.isAvailable ? t("common.available") : t("common.notAvailable")}
                    </span>
                    {athlete.pendingRemoval ? (
                      <span className="badge rejected">{t("coachDashboard.removalRequested")}</span>
                    ) : (
                      athlete.approvalStatus === "pending" && (
                        <span className="badge rejected">{t("coachDashboard.pendingApprovalBadge")}</span>
                      )
                    )}
                    {athlete.feeOwed > 0 && (
                      <span
                        className="badge rejected"
                        title={(athlete.fees || [])
                          .map((f) => `$${f.amount}${f.note ? ` — ${f.note}` : ""}`)
                          .join(", ")}
                      >
                        {t("coachDashboard.owes")} ${athlete.feeOwed}
                      </span>
                    )}
                    {(!athlete.lastVerifiedAt ||
                      Date.now() - new Date(athlete.lastVerifiedAt).getTime() > 365 * 24 * 60 * 60 * 1000) && (
                      <span className="badge rejected">{t("coachDashboard.needsRenewal")}</span>
                    )}
                  </div>
                  <div className="athlete-status" style={{ marginTop: 8 }}>
                    <Link
                      className="link-btn"
                      to={`/admin/athlete/${athlete._id}?team=${encodeURIComponent(athlete.team)}`}
                    >
                      {t("common.viewCard")}
                    </Link>
                    <Link className="link-btn" to={`/admin/athlete/${athlete._id}/edit`}>
                      {t("common.edit")}
                    </Link>
                    {!athlete.pendingRemoval && (
                      <button className="link-btn" onClick={() => removeAssignment(athlete)}>
                        {t("coachDashboard.requestRemoval")}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SQUAD LIST TAB */}
      {activeTab === "lineups" && (
        <div className="tab-content">
          <SquadListManager team={team} athletes={athletes} />
        </div>
      )}

      {/* FORMATION TAB */}
      {activeTab === "formations" && (
        <div className="tab-content">
          <FormationManager team={team} athletes={athletes} />
        </div>
      )}

      {/* STARTING XI TAB */}
      {activeTab === "startingxi" && (
        <div className="tab-content">
          <StartingXIManager team={team} />
        </div>
      )}

      {/* PLAYER ACCOUNTS TAB */}
      {activeTab === "accounts" && (
        <div className="tab-content">
          <div className="card" style={{ maxWidth: 420, marginBottom: 24 }}>
            <h4 style={{ marginTop: 0 }}>{t("coachDashboard.myTelegramCardTitle")}</h4>
            <p className="help-text" style={{ marginTop: -6 }}>
              {t("coachDashboard.myTelegramHelp")}
            </p>
            <div className="field">
              <label>{t("coachDashboard.myTelegramLabel")}</label>
              <input
                placeholder={t("coachDashboard.myTelegramPlaceholder")}
                value={telegramDraft}
                onChange={(e) => {
                  setTelegramDraft(e.target.value);
                  setTelegramSaved(false);
                }}
              />
            </div>
            <button
              className="btn btn-outline"
              style={{ color: "var(--navy)", borderColor: "var(--navy)" }}
              onClick={saveTelegram}
              disabled={savingTelegram}
            >
              {savingTelegram ? t("coachDashboard.savingTelegram") : telegramSaved ? t("coachDashboard.telegramSaved") : t("common.save")}
            </button>
          </div>

          <div className="card" style={{ maxWidth: 420, marginBottom: 24 }}>
            <h4 style={{ marginTop: 0 }}>{t("coachDashboard.khqrCardTitle")}</h4>
            <p className="help-text" style={{ marginTop: -6 }}>
              {t("coachDashboard.khqrHelp")}
            </p>
            {khqrLoading ? (
              <p>{t("common.loading")}</p>
            ) : (
              <>
                {khqrImageUrl && (
                  <img
                    src={resolveFileUrl(khqrImageUrl)}
                    alt="ABA KHQR"
                    style={{ width: 180, height: 180, objectFit: "contain", display: "block", marginBottom: 10 }}
                  />
                )}
                <div className="field">
                  <label>{khqrImageUrl ? t("coachDashboard.khqrReplaceLabel") : t("coachDashboard.khqrUploadLabel")}</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setKhqrFile(e.target.files[0])}
                  />
                </div>
                {khqrError && <p className="error-text" style={{ margin: "4px 0" }}>{khqrError}</p>}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    className="btn btn-outline"
                    style={{ color: "var(--navy)", borderColor: "var(--navy)" }}
                    onClick={uploadKhqr}
                    disabled={!khqrFile || khqrUploading}
                  >
                    {khqrUploading ? t("coachDashboard.khqrUploading") : t("coachDashboard.khqrSave")}
                  </button>
                  {khqrImageUrl && (
                    <button
                      type="button"
                      className="link-btn"
                      onClick={removeKhqr}
                      disabled={khqrRemoving}
                    >
                      {khqrRemoving ? t("coachDashboard.khqrRemoving") : t("coachDashboard.khqrRemove")}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="dash-header" style={{ marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>{t("coachDashboard.playerAccountsTitle")}</h3>
            <p>{t("coachDashboard.playerAccountsIntro")}</p>
          </div>
          {playerAccountsLoading ? (
            <p>{t("common.loading")}</p>
          ) : (
            <div className="table-scroll">
              <table className="athletes">
                <thead>
                  <tr>
                    <th>{t("common.username")}</th>
                    <th>{t("coachDashboard.mustChangePassword")}</th>
                    <th>{t("coachDashboard.telegramLinked")}</th>
                    <th>{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {playerAccounts.map((a) => (
                    <tr key={a._id}>
                      <td data-label={t("common.username")}>{a.username}</td>
                      <td data-label={t("coachDashboard.mustChangePassword")}>
                        {a.mustChangePassword ? t("common.yes") : t("common.no")}
                      </td>
                      <td data-label={t("coachDashboard.telegramLinked")}>
                        {a.telegramChatId ? t("common.yes") : t("common.no")}
                      </td>
                      <td data-label={t("common.actions")} className="actions-cell">
                        <button
                          className="action-btn"
                          disabled={resettingId === a._id}
                          onClick={() => resetPlayerPassword(a)}
                        >
                          {resettingId === a._id ? t("coachDashboard.resetting") : t("coachDashboard.resetPassword")}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {playerAccounts.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ textAlign: "center", color: "#777" }}>
                        {t("coachDashboard.noPlayerAccounts")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
    )}
    </RequireActiveSubscription>
  );
}

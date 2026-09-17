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
  const { team } = useAuth();
  const [athletes, setAthletes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchParams] = useSearchParams();
  // Lets a link from elsewhere (e.g. a tournament's squad page) land
  // directly on a specific tab, e.g. /coach?tab=lineups.
  const validTabs = ["athletes", "lineups", "formations", "startingxi"];
  const tabFromUrl = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState(validTabs.includes(tabFromUrl) ? tabFromUrl : "athletes");

  useEffect(() => {
    loadData();
  }, []);

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
    </div>
    )}
    </RequireActiveSubscription>
  );
}

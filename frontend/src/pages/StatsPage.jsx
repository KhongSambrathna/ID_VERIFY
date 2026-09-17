import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../i18n/LanguageContext";

// Pulled out of AdminDashboard/CoachDashboard into its own page so the main
// roster views stay focused on the table — this is purely a report. The
// backend already scopes /athletes/stats to the caller's own team for a
// Head Coach and to the whole club for Admin, so this one page works for
// both roles unchanged.
export default function StatsPage() {
  const { t } = useLanguage();
  const { isHeadCoach } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/athletes/stats")
      .then(({ data }) => setStats(data))
      .catch((err) => setError(err.response?.data?.message || t("statsPage.failedToLoadReport")))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="container dash-body">
      <div className="dash-header">
        <h2>{t("statsPage.title")}</h2>
        <Link to={isHeadCoach ? "/coach" : "/admin"} className="link-btn">
          {t("statsPage.backToDashboard")}
        </Link>
      </div>

      {loading && <p>{t("common.loading")}</p>}
      {error && <p className="error-text">{error}</p>}

      {stats && (
        <>
          <div className="card" style={{ marginBottom: 16, padding: 16 }}>
            <div className="dash-actions" style={{ gap: 24, flexWrap: "wrap" }}>
              <div>
                <div className="detail-label">{t("statsPage.totalAthletes")}</div>
                <div className="detail-value" style={{ fontSize: 20, fontWeight: 700 }}>
                  {stats.totalAthletes}
                </div>
              </div>
              <div>
                <div className="detail-label">{t("statsPage.pendingApprovals")}</div>
                <div className="detail-value" style={{ fontSize: 20, fontWeight: 700 }}>
                  {stats.totalPendingApprovals}
                </div>
              </div>
              <div>
                <div className="detail-label">
                  {isHeadCoach ? t("statsPage.totalDebt") : t("statsPage.totalDebtClubWide")}
                </div>
                <div className="detail-value" style={{ fontSize: 20, fontWeight: 700 }}>
                  ${stats.totalDebt}
                </div>
              </div>
            </div>
          </div>

          {stats.teams?.length > 0 && (
            <div className="table-scroll">
              <table className="athletes">
                <thead>
                  <tr>
                    <th>{t("common.team")}</th>
                    <th>{t("statsPage.athletes")}</th>
                    <th>{t("statsPage.pending")}</th>
                    <th>{t("statsPage.debt")}</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.teams.map((teamRow) => (
                    <tr key={teamRow.team}>
                      <td data-label={t("common.team")} className="caps-display">{teamRow.team}</td>
                      <td data-label={t("statsPage.athletes")}>{teamRow.athleteCount}</td>
                      <td data-label={t("statsPage.pending")}>{teamRow.pendingCount}</td>
                      <td data-label={t("statsPage.debt")}>${teamRow.totalDebt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

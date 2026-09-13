import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";

// Pulled out of AdminDashboard/CoachDashboard into its own page so the main
// roster views stay focused on the table — this is purely a report. The
// backend already scopes /athletes/stats to the caller's own team for a
// Head Coach and to the whole club for Admin, so this one page works for
// both roles unchanged.
export default function StatsPage() {
  const { isHeadCoach } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/athletes/stats")
      .then(({ data }) => setStats(data))
      .catch((err) => setError(err.response?.data?.message || "Failed to load report"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="container dash-body">
      <div className="dash-header">
        <h2>Pending &amp; debt report</h2>
        <Link to={isHeadCoach ? "/coach" : "/admin"} className="link-btn">
          ← Back to dashboard
        </Link>
      </div>

      {loading && <p>Loading…</p>}
      {error && <p className="error-text">{error}</p>}

      {stats && (
        <>
          <div className="card" style={{ marginBottom: 16, padding: 16 }}>
            <div className="dash-actions" style={{ gap: 24, flexWrap: "wrap" }}>
              <div>
                <div className="detail-label">Total athletes</div>
                <div className="detail-value" style={{ fontSize: 20, fontWeight: 700 }}>
                  {stats.totalAthletes}
                </div>
              </div>
              <div>
                <div className="detail-label">Pending approvals</div>
                <div className="detail-value" style={{ fontSize: 20, fontWeight: 700 }}>
                  {stats.totalPendingApprovals}
                </div>
              </div>
              <div>
                <div className="detail-label">{isHeadCoach ? "Total debt" : "Total debt (club-wide)"}</div>
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
                    <th>Team</th>
                    <th>Athletes</th>
                    <th>Pending</th>
                    <th>Debt</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.teams.map((t) => (
                    <tr key={t.team}>
                      <td data-label="Team">{t.team}</td>
                      <td data-label="Athletes">{t.athleteCount}</td>
                      <td data-label="Pending">{t.pendingCount}</td>
                      <td data-label="Debt">${t.totalDebt}</td>
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

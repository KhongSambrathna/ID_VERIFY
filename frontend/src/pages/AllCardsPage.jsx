import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";
import IDCard from "../components/IDCard";

const ROLE_OPTIONS = ["PLAYER", "ASSISTAN COACH", "HEAD COACH", "TECHNICAL", "MEDIC"];

export default function AllCardsPage() {
  const [athletes, setAthletes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [teamFilter, setTeamFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");

  useEffect(() => {
    api
      .get("/athletes")
      .then(({ data }) => setAthletes(data))
      .catch((err) => setError(err.response?.data?.message || "Failed to load athletes"))
      .finally(() => setLoading(false));
  }, []);

  const teams = useMemo(
    () => [...new Set(athletes.map((a) => a.team).filter(Boolean))].sort(),
    [athletes]
  );

  const filtered = athletes.filter((a) => {
    if (teamFilter !== "all" && a.team !== teamFilter) return false;
    if (roleFilter !== "all" && a.role !== roleFilter) return false;
    return true;
  });

  return (
    <div className="container" style={{ paddingBottom: 60 }}>
      <div className="dash-header no-print">
        <h2>All ID cards ({filtered.length})</h2>
        <div style={{ display: "flex", gap: 10 }}>
          <Link to="/admin" className="link-btn">
            ← Back to dashboard
          </Link>
          <button className="btn btn-primary" onClick={() => window.print()}>
            Export / Print selected
          </button>
        </div>
      </div>

      <div className="no-print" style={{ display: "flex", gap: 16, marginBottom: 24 }}>
        <div className="field" style={{ marginBottom: 0, minWidth: 180 }}>
          <label>Filter by team</label>
          <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
            <option value="all">All teams</option>
            {teams.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0, minWidth: 180 }}>
          <label>Filter by role</label>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="all">All roles</option>
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && <p>Loading…</p>}
      {error && <p className="error-text">{error}</p>}
      {!loading && !error && filtered.length === 0 && (
        <p>No athletes match this filter.</p>
      )}

      <div className="cards-grid">
        {filtered.map((a) => (
          <IDCard key={a._id} athlete={a} hideActions />
        ))}
      </div>
    </div>
  );
}

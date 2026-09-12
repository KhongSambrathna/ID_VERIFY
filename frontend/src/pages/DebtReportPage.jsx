import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";

// Debt/fee report — Admin sees every team; a Head Coach only ever sees their
// own team's people (the backend already scopes GET /athletes that way for
// a HEAD_COACH caller, same as the main dashboard table). Fee data never
// appears on a printed card or any public page — this list, the roster
// tables, and the Edit page are the only places it's ever shown, and only
// to these two roles.
export default function DebtReportPage() {
  const { isAdmin } = useAuth();
  const [athletes, setAthletes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [teamFilter, setTeamFilter] = useState("");

  useEffect(() => {
    setLoading(true);
    api
      .get("/athletes")
      .then(({ data }) => {
        setAthletes(data);
        setError("");
      })
      .catch((err) => setError(err.response?.data?.message || "Failed to load athletes"))
      .finally(() => setLoading(false));
  }, []);

  const teams = useMemo(
    () => [...new Set(athletes.map((a) => a.team).filter(Boolean))].sort(),
    [athletes]
  );

  const owing = useMemo(() => {
    return athletes
      .filter((a) => a.feeOwed > 0)
      .filter((a) => !teamFilter || a.team === teamFilter)
      .sort((a, b) => b.feeOwed - a.feeOwed);
  }, [athletes, teamFilter]);

  const total = owing.reduce((sum, a) => sum + (a.feeOwed || 0), 0);

  return (
    <div className="container dash-body">
      <div className="dash-header">
        <h2>Debt report</h2>
        <p>Everyone who currently owes a playing fee. Visible only to Admin and Head Coach — never shown on a card, export, or public page.</p>
      </div>

      {isAdmin && teams.length > 1 && (
        <div className="field search-field" style={{ maxWidth: 260 }}>
          <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
            <option value="">All teams</option>
            {teams.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      )}

      {loading && <p>Loading…</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && !error && (
        <>
          <p className="help-text" style={{ fontWeight: 600 }}>
            {owing.length === 0
              ? "No one currently owes a fee."
              : `${owing.length} ${owing.length === 1 ? "person" : "people"} owing — $${total} total`}
          </p>

          {owing.length > 0 && (
            <div className="table-scroll">
              <table className="athletes">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Team</th>
                    <th>Role</th>
                    <th>Owes</th>
                    <th>Note</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {owing.map((a) => (
                    <tr key={a.assignmentId}>
                      <td data-label="ID">{a.verifyId}</td>
                      <td data-label="Name">{a.fullName}</td>
                      <td data-label="Team">{a.team || "—"}</td>
                      <td data-label="Role">{a.role || "—"}</td>
                      <td data-label="Owes">
                        <span className="badge rejected">${a.feeOwed}</span>
                      </td>
                      <td data-label="Note">
                        {(a.fees || []).length
                          ? a.fees.map((f) => `$${f.amount}${f.note ? ` — ${f.note}` : ""}`).join(", ")
                          : "—"}
                      </td>
                      <td data-label="Actions" className="actions-cell">
                        <Link className="link-btn" to={`/admin/athlete/${a._id}/edit`}>
                          Edit
                        </Link>
                      </td>
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

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

function needsRenewal(lastVerifiedAt) {
  return !lastVerifiedAt || Date.now() - new Date(lastVerifiedAt).getTime() > YEAR_MS;
}

// Its own page (not a column on the main roster table) specifically so it
// can list every person one-per-row regardless of how many teams they're
// on, and so renewing can be done one at a time, several selected at once,
// or all at once — the main dashboard table was getting too wide for this.
export default function RenewPage() {
  const { isHeadCoach } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [onlyNeeding, setOnlyNeeding] = useState(true);
  const [renewingId, setRenewingId] = useState(null);
  const [bulkRenewing, setBulkRenewing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      // GET /athletes returns one flattened row per team assignment; fold
      // that down to one row per person here since lastVerifiedAt is a
      // whole-person field, not per-team.
      const { data } = await api.get("/athletes");
      const byId = new Map();
      for (const a of data) {
        const existing = byId.get(a._id);
        if (existing) {
          if (a.team && !existing.teams.includes(a.team)) existing.teams.push(a.team);
        } else {
          byId.set(a._id, {
            _id: a._id,
            fullName: a.fullName,
            khmerName: a.khmerName,
            verifyId: a.verifyId,
            lastVerifiedAt: a.lastVerifiedAt,
            teams: a.team ? [a.team] : [],
          });
        }
      }
      setRows([...byId.values()].sort((x, y) => x.fullName.localeCompare(y.fullName)));
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load athletes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const visible = useMemo(
    () => (onlyNeeding ? rows.filter((r) => needsRenewal(r.lastVerifiedAt)) : rows),
    [rows, onlyNeeding]
  );

  const allVisibleSelected = visible.length > 0 && visible.every((r) => selected.has(r._id));

  const toggleOne = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelected((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev);
        visible.forEach((r) => next.delete(r._id));
        return next;
      }
      const next = new Set(prev);
      visible.forEach((r) => next.add(r._id));
      return next;
    });
  };

  const renewOne = async (id) => {
    setRenewingId(id);
    try {
      await api.put(`/athletes/${id}/renew`);
      load();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to renew");
    } finally {
      setRenewingId(null);
    }
  };

  const renewSelected = async () => {
    if (selected.size === 0) return;
    setBulkRenewing(true);
    try {
      await api.put("/athletes/bulk-renew", { athleteIds: [...selected] });
      setSelected(new Set());
      load();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to renew selected");
    } finally {
      setBulkRenewing(false);
    }
  };

  const renewAllVisible = async () => {
    if (visible.length === 0) return;
    if (!confirm(`Renew all ${visible.length} listed people now?`)) return;
    setBulkRenewing(true);
    try {
      await api.put("/athletes/bulk-renew", { athleteIds: visible.map((r) => r._id) });
      setSelected(new Set());
      load();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to renew");
    } finally {
      setBulkRenewing(false);
    }
  };

  return (
    <div className="container dash-body">
      <div className="dash-header">
        <h2>ID renewal</h2>
        <Link to={isHeadCoach ? "/coach" : "/admin"} className="link-btn">
          ← Back to dashboard
        </Link>
      </div>
      <p className="help-text" style={{ maxWidth: 640 }}>
        Renewing just confirms someone's identity documents were checked again in person — it doesn't
        expire or hide anyone, it only clears the "Needs renewal" flag for another year.
      </p>

      <div className="dash-actions" style={{ marginBottom: 12, flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={onlyNeeding} onChange={(e) => setOnlyNeeding(e.target.checked)} />
          Only show people needing renewal
        </label>
        <button className="btn btn-outline" onClick={renewAllVisible} disabled={bulkRenewing || visible.length === 0}>
          {bulkRenewing ? "Renewing…" : `Renew all listed (${visible.length})`}
        </button>
        {selected.size > 0 && (
          <button className="btn btn-primary" onClick={renewSelected} disabled={bulkRenewing}>
            {bulkRenewing ? "Renewing…" : `Renew selected (${selected.size})`}
          </button>
        )}
      </div>

      {loading && <p>Loading…</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && !error && (
        <div className="table-scroll">
          <table className="athletes">
            <thead>
              <tr>
                <th>
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} />
                </th>
                <th>ID</th>
                <th>Name</th>
                <th>Team(s)</th>
                <th>Last verified</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r._id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(r._id)}
                      onChange={() => toggleOne(r._id)}
                    />
                  </td>
                  <td data-label="ID">{r.verifyId}</td>
                  <td data-label="Name">
                    {r.fullName}
                    {r.khmerName && <span className="khmer-name"> {r.khmerName}</span>}
                  </td>
                  <td data-label="Team(s)">{r.teams.join(", ") || "—"}</td>
                  <td data-label="Last verified">
                    {r.lastVerifiedAt ? new Date(r.lastVerifiedAt).toLocaleDateString() : "Never"}
                    {needsRenewal(r.lastVerifiedAt) && (
                      <span className="badge rejected" style={{ marginLeft: 6 }}>
                        Needs renewal
                      </span>
                    )}
                  </td>
                  <td data-label="Actions" className="actions-cell">
                    <button
                      className="link-btn"
                      onClick={() => renewOne(r._id)}
                      disabled={renewingId === r._id}
                    >
                      {renewingId === r._id ? "Renewing…" : "Renew"}
                    </button>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", color: "#777" }}>
                    {rows.length === 0 ? "No athletes yet." : "No one currently needs renewal."}
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

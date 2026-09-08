import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";

export default function AdminDashboard() {
  const [athletes, setAthletes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/athletes");
      setAthletes(data);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load athletes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const setStatus = async (id, status) => {
    await api.put(`/athletes/${id}`, { status });
    load();
  };

  const setAvailable = async (id, isAvailable) => {
    await api.put(`/athletes/${id}`, { isAvailable });
    load();
  };

  const approve = async (id) => {
    await api.put(`/athletes/${id}/approve`);
    load();
  };

  const remove = async (id) => {
    if (!confirm("Delete this athlete record?")) return;
    await api.delete(`/athletes/${id}`);
    load();
  };

  const q = search.trim().toLowerCase();
  const filtered = !q
    ? athletes
    : athletes.filter((a) =>
        [a.fullName, a.khmerName, a.team, a.role, a.verifyId]
          .filter(Boolean)
          .some((field) => field.toLowerCase().includes(q))
      );

  const pendingCount = athletes.filter((a) => a.approvalStatus === "pending").length;

  return (
    <div className="container dash-body">
      <div className="dash-header">
        <h2>Athlete records</h2>
        <div className="dash-actions">
          <Link to="/admin/users" className="btn btn-outline" style={{ color: "var(--navy)", borderColor: "var(--navy)" }}>
            Manage users
          </Link>
          <Link to="/admin/sponsors" className="btn btn-outline" style={{ color: "var(--navy)", borderColor: "var(--navy)" }}>
            Trusted by logos
          </Link>
          <Link to="/admin/matchday" className="btn btn-outline" style={{ color: "var(--navy)", borderColor: "var(--navy)" }}>
            Match day
          </Link>
          <Link to="/admin/shop" className="btn btn-outline" style={{ color: "var(--navy)", borderColor: "var(--navy)" }}>
            Shop
          </Link>
          <Link to="/admin/cards" className="btn btn-outline" style={{ color: "var(--navy)", borderColor: "var(--navy)" }}>
            Export all cards
          </Link>
          <Link to="/admin/new" className="btn btn-primary">
            + Add athlete
          </Link>
        </div>
      </div>

      {pendingCount > 0 && (
        <p className="help-text" style={{ color: "var(--navy)", fontWeight: 600 }}>
          {pendingCount} record{pendingCount > 1 ? "s" : ""} pending approval — hidden from public search and QR
          verify until approved.
        </p>
      )}

      <div className="field search-field">
        <input
          placeholder="Search by name, team, role, or ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading && <p>Loading…</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && !error && (
        <div className="table-scroll">
          <table className="athletes">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Role</th>
                <th>Team</th>
                <th>Available</th>
                <th>Status</th>
                <th>Approval</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a._id}>
                  <td data-label="ID">{a.verifyId}</td>
                  <td data-label="Name">{a.fullName}</td>
                  <td data-label="Role">{a.role || "—"}</td>
                  <td data-label="Team">{a.team || "—"}</td>
                  <td data-label="Available">
                    <span className={`badge ${a.isAvailable ? "verified" : "rejected"}`}>
                      {a.isAvailable ? "Available" : "Not available"}
                    </span>
                  </td>
                  <td data-label="Status">
                    <span className={`badge ${a.status}`}>{a.status}</span>
                  </td>
                  <td data-label="Approval">
                    {a.approvalStatus === "pending" ? (
                      <span className="badge rejected">Pending</span>
                    ) : (
                      <span className="badge verified">Approved</span>
                    )}
                  </td>
                  <td data-label="Actions" className="actions-cell">
                    <Link className="link-btn" to={`/admin/athlete/${a._id}`}>
                      View card
                    </Link>
                    <Link className="link-btn" to={`/admin/athlete/${a._id}/edit`}>
                      Edit
                    </Link>
                    {a.approvalStatus === "pending" && (
                      <button className="link-btn" onClick={() => approve(a._id)}>
                        Approve
                      </button>
                    )}
                    {a.status !== "verified" ? (
                      <button className="link-btn" onClick={() => setStatus(a._id, "verified")}>
                        Verify
                      </button>
                    ) : (
                      <button className="link-btn" onClick={() => setStatus(a._id, "unverified")}>
                        Unverify
                      </button>
                    )}
                    <button
                      className="link-btn"
                      onClick={() => setAvailable(a._id, !a.isAvailable)}
                    >
                      {a.isAvailable ? "Mark unavailable" : "Mark available"}
                    </button>
                    <button className="link-btn" onClick={() => remove(a._id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", color: "#777" }}>
                    {athletes.length === 0
                      ? "No athletes yet — add your first one."
                      : "No matches for your search."}
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

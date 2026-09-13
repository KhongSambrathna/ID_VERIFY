import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";

export default function AdminDashboard() {
  const [athletes, setAthletes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedPending, setSelectedPending] = useState([]);
  const [bulkApproving, setBulkApproving] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);

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

  const exportCsv = async () => {
    setExportingCsv(true);
    try {
      const { data } = await api.get("/athletes/export.csv", { responseType: "blob" });
      const url = window.URL.createObjectURL(data);
      const link = document.createElement("a");
      link.href = url;
      link.download = "roster.csv";
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.response?.data?.message || "Failed to export roster");
    } finally {
      setExportingCsv(false);
    }
  };

  const togglePendingSelected = (a) => {
    setSelectedPending((prev) =>
      prev.some((x) => x.assignmentId === a.assignmentId)
        ? prev.filter((x) => x.assignmentId !== a.assignmentId)
        : [...prev, { athleteId: a._id, assignmentId: a.assignmentId }]
    );
  };

  const bulkApproveSelected = async () => {
    if (selectedPending.length === 0) return;
    setBulkApproving(true);
    try {
      await api.put("/athletes/bulk-approve", { items: selectedPending });
      setSelectedPending([]);
      load();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to bulk-approve");
    } finally {
      setBulkApproving(false);
    }
  };

  const setStatus = async (id, status) => {
    await api.put(`/athletes/${id}`, { status });
    load();
  };

  const setAvailable = async (id, isAvailable) => {
    await api.put(`/athletes/${id}`, { isAvailable });
    load();
  };

  // Each row is one team/role assignment (a person on 2 teams shows up as 2
  // rows), so every action below targets `a.assignmentId`, not just `a._id`.
  const approveAssignment = async (a) => {
    await api.put(`/athletes/${a._id}/assignments/${a.assignmentId}/approve`);
    load();
  };

  const rejectAssignment = async (a) => {
    await api.put(`/athletes/${a._id}/assignments/${a.assignmentId}/reject`);
    load();
  };

  const removeAssignment = async (a) => {
    const isLast = athletes.filter((x) => x._id === a._id).length === 1;
    const msg = isLast
      ? "This is their only team — removing it will delete this person's whole record. Continue?"
      : "Remove this team/role?";
    if (!confirm(msg)) return;
    await api.delete(`/athletes/${a._id}/assignments/${a.assignmentId}`);
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

  const pendingCount = athletes.filter((a) => a.approvalStatus === "pending" || a.pendingRemoval).length;

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
          <Link to="/admin/stats" className="btn btn-outline" style={{ color: "var(--navy)", borderColor: "var(--navy)" }}>
            Pending &amp; debt report
          </Link>
          <Link to="/admin/renew" className="btn btn-outline" style={{ color: "var(--navy)", borderColor: "var(--navy)" }}>
            ID renewal
          </Link>
          <button
            type="button"
            className="btn btn-outline"
            style={{ color: "var(--navy)", borderColor: "var(--navy)" }}
            onClick={exportCsv}
            disabled={exportingCsv}
          >
            {exportingCsv ? "Exporting…" : "Export roster (CSV)"}
          </button>
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

      {selectedPending.length > 0 && (
        <div className="dash-actions" style={{ marginBottom: 12 }}>
          <button className="btn btn-primary" onClick={bulkApproveSelected} disabled={bulkApproving}>
            {bulkApproving ? "Approving…" : `Approve selected (${selectedPending.length})`}
          </button>
          <button className="btn btn-outline" onClick={() => setSelectedPending([])} disabled={bulkApproving}>
            Clear selection
          </button>
        </div>
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
                <th></th>
                <th>ID</th>
                <th>Name</th>
                <th>Role</th>
                <th>Team</th>
                <th>Jersey #</th>
                <th>Available</th>
                <th>Status</th>
                <th>Approval</th>
                <th>Fee</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.assignmentId}>
                  <td data-label="">
                    {a.approvalStatus === "pending" && !a.pendingRemoval && (
                      <input
                        type="checkbox"
                        checked={selectedPending.some((x) => x.assignmentId === a.assignmentId)}
                        onChange={() => togglePendingSelected(a)}
                      />
                    )}
                  </td>
                  <td data-label="ID">{a.verifyId}</td>
                  <td data-label="Name">{a.fullName}</td>
                  <td data-label="Role">{a.role || "—"}</td>
                  <td data-label="Team">{a.team || "—"}</td>
                  <td data-label="Jersey #">{a.jerseyNumber ?? "—"}</td>
                  <td data-label="Available">
                    <span className={`badge ${a.isAvailable ? "verified" : "rejected"}`}>
                      {a.isAvailable ? "Available" : "Not available"}
                    </span>
                  </td>
                  <td data-label="Status">
                    <span className={`badge ${a.status}`}>{a.status}</span>
                  </td>
                  <td data-label="Approval">
                    {a.pendingRemoval ? (
                      <span className="badge rejected">Removal requested</span>
                    ) : a.approvalStatus === "pending" ? (
                      <span className="badge rejected">Pending</span>
                    ) : (
                      <span className="badge verified">Approved</span>
                    )}
                  </td>
                  <td data-label="Fee">
                    {a.feeOwed > 0 ? (
                      <span
                        className="badge rejected"
                        title={(a.fees || []).map((f) => `$${f.amount}${f.note ? ` — ${f.note}` : ""}`).join(", ")}
                      >
                        Owes ${a.feeOwed}
                      </span>
                    ) : (
                      <span className="badge verified">Paid</span>
                    )}
                  </td>
                  <td data-label="Actions" className="actions-cell">
                    <Link className="link-btn" to={`/admin/athlete/${a._id}?team=${encodeURIComponent(a.team)}`}>
                      View card
                    </Link>
                    <Link className="link-btn" to={`/admin/athlete/${a._id}/edit`}>
                      Edit
                    </Link>
                    {a.pendingRemoval ? (
                      <>
                        <button className="link-btn" onClick={() => approveAssignment(a)}>
                          Confirm removal
                        </button>
                        <button className="link-btn" onClick={() => rejectAssignment(a)}>
                          Keep
                        </button>
                      </>
                    ) : (
                      <>
                        {a.approvalStatus === "pending" && (
                          <>
                            <button className="link-btn" onClick={() => approveAssignment(a)}>
                              Approve
                            </button>
                            <button className="link-btn" onClick={() => rejectAssignment(a)}>
                              Reject
                            </button>
                          </>
                        )}
                        <button className="link-btn" onClick={() => removeAssignment(a)}>
                          Remove from team
                        </button>
                      </>
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
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={11} style={{ textAlign: "center", color: "#777" }}>
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

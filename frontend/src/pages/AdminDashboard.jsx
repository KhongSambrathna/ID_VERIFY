import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";

// Secondary tools tucked into one dropdown instead of a row of buttons —
// this page was accumulating one new button per feature and getting
// cluttered. "+ Add athlete" stays a primary button since it's the most
// common action; everything else lives here.
const TOOL_LINKS = [
  { to: "/admin/users", label: "Manage users" },
  { to: "/admin/sponsors", label: "Trusted by logos" },
  { to: "/admin/matchday", label: "Match day" },
  { to: "/admin/shop", label: "Shop" },
  { to: "/admin/cards", label: "Export all cards" },
  { to: "/admin/stats", label: "Pending & debt report" },
  { to: "/admin/renew", label: "ID renewal" },
];

export default function AdminDashboard() {
  const [athletes, setAthletes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("all"); // "all" | "pending"
  const [selectedPending, setSelectedPending] = useState([]);
  const [bulkApproving, setBulkApproving] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsRef = useRef(null);

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

  // Close the Tools dropdown on an outside click, same pattern as the navbar.
  useEffect(() => {
    if (!toolsOpen) return;
    const onClickOutside = (e) => {
      if (toolsRef.current && !toolsRef.current.contains(e.target)) setToolsOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [toolsOpen]);

  const exportCsv = async () => {
    setToolsOpen(false);
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
  const matchesSearch = (a) =>
    !q ||
    [a.fullName, a.khmerName, a.team, a.role, a.verifyId]
      .filter(Boolean)
      .some((field) => field.toLowerCase().includes(q));

  const all = athletes.filter(matchesSearch);
  const pending = athletes.filter((a) => (a.approvalStatus === "pending" || a.pendingRemoval) && matchesSearch(a));
  const pendingCount = athletes.filter((a) => a.approvalStatus === "pending" || a.pendingRemoval).length;

  const allPendingSelected =
    pending.length > 0 && pending.every((a) => selectedPending.some((x) => x.assignmentId === a.assignmentId));

  const toggleAllPending = () => {
    if (allPendingSelected) {
      setSelectedPending((prev) => prev.filter((x) => !pending.some((p) => p.assignmentId === x.assignmentId)));
    } else {
      setSelectedPending((prev) => {
        const have = new Set(prev.map((x) => x.assignmentId));
        const additions = pending
          .filter((p) => !have.has(p.assignmentId))
          .map((p) => ({ athleteId: p._id, assignmentId: p.assignmentId }));
        return [...prev, ...additions];
      });
    }
  };

  return (
    <div className="container dash-body">
      <div className="dash-header">
        <h2>Athlete records</h2>
        <div className="dash-actions">
          <Link to="/admin/new" className="btn btn-primary">
            + Add athlete
          </Link>
          <div className="tools-dropdown" ref={toolsRef}>
            <button
              type="button"
              className="btn btn-outline"
              style={{ color: "var(--navy)", borderColor: "var(--navy)" }}
              onClick={() => setToolsOpen((v) => !v)}
            >
              Tools ▾
            </button>
            {toolsOpen && (
              <div className="tools-dropdown-menu">
                {TOOL_LINKS.map((l) => (
                  <Link key={l.to} to={l.to} onClick={() => setToolsOpen(false)}>
                    {l.label}
                  </Link>
                ))}
                <button type="button" onClick={exportCsv} disabled={exportingCsv}>
                  {exportingCsv ? "Exporting…" : "Export roster (CSV)"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="field search-field">
        <input
          placeholder="Search by name, team, role, or ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="tabs">
        <button className={`tab-btn ${activeTab === "all" ? "active" : ""}`} onClick={() => setActiveTab("all")}>
          All athletes ({all.length})
        </button>
        <button
          className={`tab-btn ${activeTab === "pending" ? "active" : ""}`}
          onClick={() => setActiveTab("pending")}
        >
          Pending approval ({pendingCount})
        </button>
      </div>

      {loading && <p>Loading…</p>}
      {error && <p className="error-text">{error}</p>}

      {/* ALL ATHLETES TAB — browse/manage everything; approve/reject moved to
          the Pending tab to keep this table's Actions column short. */}
      {!loading && !error && activeTab === "all" && (
        <div className="table-scroll">
          <table className="athletes">
            <thead>
              <tr>
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
              {all.map((a) => (
                <tr key={a.assignmentId}>
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
                    <Link className="action-btn" to={`/admin/athlete/${a._id}?team=${encodeURIComponent(a.team)}`}>
                      View card
                    </Link>
                    <Link className="action-btn" to={`/admin/athlete/${a._id}/edit`}>
                      Edit
                    </Link>
                    <button className="action-btn danger" onClick={() => removeAssignment(a)}>
                      Remove from team
                    </button>
                  </td>
                </tr>
              ))}
              {all.length === 0 && (
                <tr>
                  <td colSpan={10} style={{ textAlign: "center", color: "#777" }}>
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

      {/* PENDING APPROVAL TAB — the actionable queue: approve/reject,
          confirm/decline removals, one at a time or in bulk. */}
      {!loading && !error && activeTab === "pending" && (
        <>
          <p className="help-text" style={{ marginTop: 0 }}>
            Hidden from public search and QR verify until approved.
          </p>
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
          <div className="table-scroll">
            <table className="athletes">
              <thead>
                <tr>
                  <th>
                    <input type="checkbox" checked={allPendingSelected} onChange={toggleAllPending} />
                  </th>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Team</th>
                  <th>Approval</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((a) => (
                  <tr key={a.assignmentId}>
                    <td data-label="">
                      {!a.pendingRemoval && (
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
                    <td data-label="Approval">
                      {a.pendingRemoval ? (
                        <span className="badge rejected">Removal requested</span>
                      ) : (
                        <span className="badge rejected">Pending</span>
                      )}
                    </td>
                    <td data-label="Actions" className="actions-cell">
                      <Link className="action-btn" to={`/admin/athlete/${a._id}?team=${encodeURIComponent(a.team)}`}>
                        View card
                      </Link>
                      {a.pendingRemoval ? (
                        <>
                          <button className="action-btn danger" onClick={() => approveAssignment(a)}>
                            Confirm removal
                          </button>
                          <button className="action-btn positive" onClick={() => rejectAssignment(a)}>
                            Keep
                          </button>
                        </>
                      ) : (
                        <>
                          <button className="action-btn positive" onClick={() => approveAssignment(a)}>
                            Approve
                          </button>
                          <button className="action-btn danger" onClick={() => rejectAssignment(a)}>
                            Reject
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {pending.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", color: "#777" }}>
                      Nothing pending.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

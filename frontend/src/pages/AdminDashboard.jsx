import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";
import { useLanguage } from "../i18n/LanguageContext";

export default function AdminDashboard() {
  const { t } = useLanguage();
  const [athletes, setAthletes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("all"); // "all" | "pending"
  const [selectedPending, setSelectedPending] = useState([]);
  const [bulkApproving, setBulkApproving] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/athletes");
      setAthletes(data);
    } catch (err) {
      setError(err.response?.data?.message || t("adminDashboard.failedToLoadAthletes"));
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
      alert(err.response?.data?.message || t("adminDashboard.failedToExportRoster"));
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
      alert(err.response?.data?.message || t("adminDashboard.failedToBulkApprove"));
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
      ? t("adminDashboard.confirmDeleteWholeRecord")
      : t("adminDashboard.confirmRemoveAssignment");
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
        <h2>{t("adminDashboard.title")}</h2>
        <div className="dash-actions">
          <Link to="/admin/new" className="btn btn-primary">
            {t("adminDashboard.addAthlete")}
          </Link>
          <Link
            to="/admin/cards"
            className="btn btn-outline"
            style={{ color: "var(--navy)", borderColor: "var(--navy)" }}
          >
            {t("adminDashboard.exportAllCards")}
          </Link>
          <button
            type="button"
            className="btn btn-outline"
            style={{ color: "var(--navy)", borderColor: "var(--navy)" }}
            onClick={exportCsv}
            disabled={exportingCsv}
          >
            {exportingCsv ? t("adminDashboard.exporting") : t("adminDashboard.exportRosterCsv")}
          </button>
        </div>
      </div>

      <div className="field search-field">
        <input
          placeholder={t("adminDashboard.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="tabs">
        <button className={`tab-btn ${activeTab === "all" ? "active" : ""}`} onClick={() => setActiveTab("all")}>
          {t("adminDashboard.allAthletesTab").replace("{count}", all.length)}
        </button>
        <button
          className={`tab-btn ${activeTab === "pending" ? "active" : ""}`}
          onClick={() => setActiveTab("pending")}
        >
          {t("adminDashboard.pendingApprovalTab").replace("{count}", pendingCount)}
        </button>
      </div>

      {loading && <p>{t("adminDashboard.loading")}</p>}
      {error && <p className="error-text">{error}</p>}

      {/* ALL ATHLETES TAB — browse/manage everything; approve/reject moved to
          the Pending tab to keep this table's Actions column short. */}
      {!loading && !error && activeTab === "all" && (
        <div className="table-scroll">
          <table className="athletes">
            <thead>
              <tr>
                <th>{t("adminDashboard.colId")}</th>
                <th>{t("adminDashboard.colName")}</th>
                <th>{t("adminDashboard.colRole")}</th>
                <th>{t("adminDashboard.colTeam")}</th>
                <th>{t("adminDashboard.colJersey")}</th>
                <th>{t("adminDashboard.colAvailable")}</th>
                <th>{t("adminDashboard.colStatus")}</th>
                <th>{t("adminDashboard.colApproval")}</th>
                <th>{t("adminDashboard.colFee")}</th>
                <th>{t("adminDashboard.colActions")}</th>
              </tr>
            </thead>
            <tbody>
              {all.map((a) => (
                <tr key={a.assignmentId}>
                  <td data-label={t("adminDashboard.colId")}>{a.verifyId}</td>
                  <td data-label={t("adminDashboard.colName")} className="caps-display">{a.fullName}</td>
                  <td data-label={t("adminDashboard.colRole")}>{a.role || "—"}</td>
                  <td data-label={t("adminDashboard.colTeam")} className="caps-display">{a.team || "—"}</td>
                  <td data-label={t("adminDashboard.colJersey")}>{a.jerseyNumber ?? "—"}</td>
                  <td data-label={t("adminDashboard.colAvailable")}>
                    <span className={`badge ${a.isAvailable ? "verified" : "rejected"}`}>
                      {a.isAvailable ? t("adminDashboard.available") : t("adminDashboard.notAvailable")}
                    </span>
                  </td>
                  <td data-label={t("adminDashboard.colStatus")}>
                    <span className={`badge ${a.status}`}>{a.status}</span>
                  </td>
                  <td data-label={t("adminDashboard.colApproval")}>
                    {a.pendingRemoval ? (
                      <span className="badge rejected">{t("adminDashboard.removalRequested")}</span>
                    ) : a.approvalStatus === "pending" ? (
                      <span className="badge rejected">{t("adminDashboard.pending")}</span>
                    ) : (
                      <span className="badge verified">{t("adminDashboard.approved")}</span>
                    )}
                  </td>
                  <td data-label={t("adminDashboard.colFee")}>
                    {a.feeOwed > 0 ? (
                      <span
                        className="badge rejected"
                        title={(a.fees || []).map((f) => `$${f.amount}${f.note ? ` — ${f.note}` : ""}`).join(", ")}
                      >
                        {t("adminDashboard.owes").replace("{amount}", a.feeOwed)}
                      </span>
                    ) : (
                      <span className="badge verified">{t("adminDashboard.paid")}</span>
                    )}
                  </td>
                  <td data-label={t("adminDashboard.colActions")} className="actions-cell">
                    <Link className="action-btn" to={`/admin/athlete/${a._id}?team=${encodeURIComponent(a.team)}`}>
                      {t("adminDashboard.view")}
                    </Link>
                    <Link className="action-btn" to={`/admin/athlete/${a._id}/edit`}>
                      {t("adminDashboard.edit")}
                    </Link>
                    <button className="action-btn danger" onClick={() => removeAssignment(a)}>
                      {t("adminDashboard.delete")}
                    </button>
                  </td>
                </tr>
              ))}
              {all.length === 0 && (
                <tr>
                  <td colSpan={10} style={{ textAlign: "center", color: "#777" }}>
                    {athletes.length === 0
                      ? t("adminDashboard.noAthletesYet")
                      : t("adminDashboard.noSearchMatches")}
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
            {t("adminDashboard.hiddenUntilApproved")}
          </p>
          {selectedPending.length > 0 && (
            <div className="dash-actions" style={{ marginBottom: 12 }}>
              <button className="btn btn-primary" onClick={bulkApproveSelected} disabled={bulkApproving}>
                {bulkApproving
                  ? t("adminDashboard.approving")
                  : t("adminDashboard.approveSelected").replace("{count}", selectedPending.length)}
              </button>
              <button className="btn btn-outline" onClick={() => setSelectedPending([])} disabled={bulkApproving}>
                {t("adminDashboard.clearSelection")}
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
                  <th>{t("adminDashboard.colId")}</th>
                  <th>{t("adminDashboard.colName")}</th>
                  <th>{t("adminDashboard.colRole")}</th>
                  <th>{t("adminDashboard.colTeam")}</th>
                  <th>{t("adminDashboard.colApproval")}</th>
                  <th>{t("adminDashboard.colActions")}</th>
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
                    <td data-label={t("adminDashboard.colId")}>{a.verifyId}</td>
                    <td data-label={t("adminDashboard.colName")} className="caps-display">{a.fullName}</td>
                    <td data-label={t("adminDashboard.colRole")}>{a.role || "—"}</td>
                    <td data-label={t("adminDashboard.colTeam")} className="caps-display">{a.team || "—"}</td>
                    <td data-label={t("adminDashboard.colApproval")}>
                      {a.pendingRemoval ? (
                        <span className="badge rejected">{t("adminDashboard.removalRequested")}</span>
                      ) : (
                        <span className="badge rejected">{t("adminDashboard.pending")}</span>
                      )}
                    </td>
                    <td data-label={t("adminDashboard.colActions")} className="actions-cell">
                      <Link className="action-btn" to={`/admin/athlete/${a._id}?team=${encodeURIComponent(a.team)}`}>
                        {t("adminDashboard.view")}
                      </Link>
                      {a.pendingRemoval ? (
                        <>
                          <button className="action-btn danger" onClick={() => approveAssignment(a)}>
                            {t("adminDashboard.confirmRemoval")}
                          </button>
                          <button className="action-btn positive" onClick={() => rejectAssignment(a)}>
                            {t("adminDashboard.keep")}
                          </button>
                        </>
                      ) : (
                        <>
                          <button className="action-btn positive" onClick={() => approveAssignment(a)}>
                            {t("adminDashboard.approve")}
                          </button>
                          <button className="action-btn danger" onClick={() => rejectAssignment(a)}>
                            {t("adminDashboard.reject")}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {pending.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", color: "#777" }}>
                      {t("adminDashboard.nothingPending")}
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

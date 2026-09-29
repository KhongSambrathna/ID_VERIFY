import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";
import { resolveFileUrl } from "../utils/fileUrl";
import { useLanguage } from "../i18n/LanguageContext";
import useScrollRestoration from "../hooks/useScrollRestoration";

const PAGE_SIZE = 15;

export default function AdminDashboard() {
  const { t } = useLanguage();
  const [search, setSearch] = useState("");
  // Debounced copy of `search` — only this one actually triggers the "All
  // athletes" server fetch (see the effect below), so the API isn't hit on
  // every keystroke. The Pending tabs filter instantly off the un-debounced
  // `search` instead, since their dataset is already small and in memory.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  // "all" | "pendingNew" | "pendingEdit" — pending is split in two so
  // Admin can tell an item that still needs identity/documents checked
  // apart from a routine re-approval of someone already verified. See
  // isPendingNew/isPendingEdit below for exactly what puts a row in each.
  const [activeTab, setActiveTab] = useState("all");
  const [selectedPending, setSelectedPending] = useState([]);
  const [bulkApproving, setBulkApproving] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);

  // "All athletes" tab — fetched a PAGE at a time (default 15 rows) from
  // the server instead of the whole roster, so this stays fast no matter
  // how big the club's roster grows. See getAllAthletes' ?page/?limit.
  const [allRows, setAllRows] = useState([]);
  const [allTotal, setAllTotal] = useState(0);
  const [allPage, setAllPage] = useState(1);
  const [allTotalPages, setAllTotalPages] = useState(1);
  const [allLoading, setAllLoading] = useState(true);
  const [allError, setAllError] = useState("");

  // Pending tabs — fetched separately via ?pendingOnly=true, which stays
  // small regardless of roster size (only people with something actually
  // awaiting Admin action come back at all).
  const [pendingAthletes, setPendingAthletes] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [pendingError, setPendingError] = useState("");

  // Restores scroll position when returning to this page (e.g. after
  // clicking Edit on a row and coming back) — see the hook's own comment
  // for why this needs to be handled explicitly rather than left to the
  // browser. "Ready" once both fetches this page depends on have settled.
  useScrollRestoration(!allLoading && !pendingLoading);

  const loadPending = async () => {
    setPendingLoading(true);
    try {
      const { data } = await api.get("/athletes", { params: { pendingOnly: true } });
      setPendingAthletes(data);
      setPendingError("");
    } catch (err) {
      setPendingError(err.response?.data?.message || t("adminDashboard.failedToLoadAthletes"));
    } finally {
      setPendingLoading(false);
    }
  };

  const loadAllPage = async (page, q) => {
    setAllLoading(true);
    try {
      const { data } = await api.get("/athletes", {
        params: { page, limit: PAGE_SIZE, q: q || undefined },
      });
      setAllRows(data.rows || []);
      setAllTotal(data.total || 0);
      setAllTotalPages(data.totalPages || 1);
      setAllPage(data.page || page);
      setAllError("");
    } catch (err) {
      setAllError(err.response?.data?.message || t("adminDashboard.failedToLoadAthletes"));
    } finally {
      setAllLoading(false);
    }
  };

  // Refreshes both after any action that could change either list (a
  // pending item can move teams/be resolved, which also affects what the
  // "All athletes" page shows) — stays on whichever "All athletes" page
  // the admin was on rather than resetting to page 1.
  const refreshAll = () => {
    loadPending();
    loadAllPage(allPage, debouncedSearch);
  };

  useEffect(() => {
    loadPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounce the search box before it triggers a server fetch.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(id);
  }, [search]);

  // Any change to the debounced search term re-queries from page 1.
  useEffect(() => {
    loadAllPage(1, debouncedSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const goToPage = (page) => {
    const clamped = Math.min(Math.max(1, page), allTotalPages);
    if (clamped === allPage) return;
    loadAllPage(clamped, debouncedSearch);
    window.scrollTo(0, 0);
  };

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
      refreshAll();
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
    refreshAll();
  };

  // Reason is optional — leaving the prompt blank and pressing OK sends no
  // reason at all, same as before this existed. Pressing Cancel on the
  // prompt aborts the whole action (nothing is sent), so it never silently
  // "skips" the reason. It's included in the Head Coach's Telegram
  // notification so they know WHY, not just that it happened.
  const rejectAssignment = async (a) => {
    const reason = prompt(t("adminDashboard.rejectReasonPrompt"));
    if (reason === null) return;
    await api.put(`/athletes/${a._id}/assignments/${a.assignmentId}/reject`, { reason: reason.trim() });
    refreshAll();
  };

  // Which confirmation to show (whole-record delete vs just-this-team)
  // depends on whether this is the person's ONLY assignment — with the
  // roster now paginated, the client no longer has everyone's full record
  // in memory to check that from, so this looks it up fresh instead.
  const removeAssignment = async (a) => {
    let isLast = false;
    try {
      const { data: full } = await api.get(`/athletes/${a._id}`);
      isLast = (full.assignments || []).length === 1;
    } catch {
      // best effort — if this lookup fails, fall through to the more
      // general confirmation rather than guessing wrong about a
      // whole-record delete
    }
    const msg = isLast
      ? t("adminDashboard.confirmDeleteWholeRecord")
      : t("adminDashboard.confirmRemoveAssignment");
    if (!confirm(msg)) return;
    const reason = prompt(t("adminDashboard.removeReasonPrompt"));
    if (reason === null) return;
    await api.delete(`/athletes/${a._id}/assignments/${a.assignmentId}`, { data: { reason: reason.trim() } });
    refreshAll();
  };

  const q = search.trim().toLowerCase();
  const matchesSearch = (a) =>
    !q ||
    [a.fullName, a.khmerName, a.team, a.role, a.verifyId]
      .filter(Boolean)
      .some((field) => field.toLowerCase().includes(q));

  // Whether a pending edit specifically touched this person's reference
  // documents (added or removed one) — see pendingChanges.addedDocumentLabels
  // /removedDocumentLabels in the Athlete model and updateAthlete.
  const hasDocumentEdit = (a) =>
    !!(
      a.pendingChanges &&
      ((a.pendingChanges.addedDocumentLabels || []).length > 0 ||
        (a.pendingChanges.removedDocumentLabels || []).length > 0)
    );

  // "Pending Verify Document" — Admin still needs to check this person's
  // identity/documents: a first-time submission never approved before, an
  // athlete who's never been verified in person at all (no "Renew" yet, see
  // lastVerifiedAt), or any pending edit that touched their reference
  // documents specifically — regardless of whether this team/role was
  // approved before.
  const isPendingNew = (a) =>
    a.approvalStatus === "pending" &&
    !a.pendingRemoval &&
    (!a.everApproved || !a.lastVerifiedAt || hasDocumentEdit(a));
  // "Editing Approval" — a routine re-approval: this team/role was already
  // approved before, the person has already been verified in person, and
  // nothing about their documents changed (just a name/DOB/address/photo/
  // etc. tweak) — or a Head Coach's removal request, which isn't a
  // document matter at all.
  const isPendingEdit = (a) =>
    a.pendingRemoval ||
    (a.approvalStatus === "pending" && a.everApproved && !!a.lastVerifiedAt && !hasDocumentEdit(a));

  const pendingNewRows = pendingAthletes.filter((a) => isPendingNew(a) && matchesSearch(a));
  const pendingEditRows = pendingAthletes.filter((a) => isPendingEdit(a) && matchesSearch(a));

  const pendingNewCount = pendingAthletes.filter(isPendingNew).length;
  const pendingEditCount = pendingAthletes.filter(isPendingEdit).length;

  // Whichever pending list the current tab is showing — bulk-select/approve
  // below always act on this, never on the other pending tab's rows.
  const visiblePendingRows =
    activeTab === "pendingNew" ? pendingNewRows : activeTab === "pendingEdit" ? pendingEditRows : [];
  const pendingEmptyText =
    activeTab === "pendingNew" ? t("adminDashboard.noNewPending") : t("adminDashboard.noEditPending");

  const switchTab = (tab) => {
    setActiveTab(tab);
    setSelectedPending([]); // avoid carrying a selection over from a different tab
  };

  const allPendingSelected =
    visiblePendingRows.length > 0 &&
    visiblePendingRows.every((a) => selectedPending.some((x) => x.assignmentId === a.assignmentId));

  const toggleAllPending = () => {
    if (allPendingSelected) {
      setSelectedPending((prev) => prev.filter((x) => !visiblePendingRows.some((p) => p.assignmentId === x.assignmentId)));
    } else {
      setSelectedPending((prev) => {
        const have = new Set(prev.map((x) => x.assignmentId));
        const additions = visiblePendingRows
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
        <button className={`tab-btn ${activeTab === "all" ? "active" : ""}`} onClick={() => switchTab("all")}>
          {t("adminDashboard.allAthletesTab").replace("{count}", allTotal)}
        </button>
        <button
          className={`tab-btn ${activeTab === "pendingNew" ? "active" : ""}`}
          onClick={() => switchTab("pendingNew")}
        >
          {t("adminDashboard.pendingNewTab").replace("{count}", pendingNewCount)}
        </button>
        <button
          className={`tab-btn ${activeTab === "pendingEdit" ? "active" : ""}`}
          onClick={() => switchTab("pendingEdit")}
        >
          {t("adminDashboard.pendingEditTab").replace("{count}", pendingEditCount)}
        </button>
      </div>

      {/* ALL ATHLETES TAB — browse/manage everything; approve/reject moved to
          the Pending tab to keep this table's Actions column short. Fetched
          one page (PAGE_SIZE rows) at a time — see loadAllPage. */}
      {activeTab === "all" && (
        <>
          {allLoading && <p>{t("adminDashboard.loading")}</p>}
          {allError && <p className="error-text">{allError}</p>}
          {!allLoading && !allError && (
            <div className="table-scroll">
              <table className="athletes">
                <thead>
                  <tr>
                    <th>{t("common.photo")}</th>
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
                  {allRows.map((a) => (
                    <tr key={a.assignmentId}>
                      <td data-label={t("common.photo")}>
                        <img
                          src={a.photoUrl ? resolveFileUrl(a.photoUrl) : "https://placehold.co/50x50?text=Photo"}
                          alt={a.fullName}
                          className="small-photo"
                        />
                      </td>
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
                  {allRows.length === 0 && (
                    <tr>
                      <td colSpan={11} style={{ textAlign: "center", color: "#777" }}>
                        {allTotal === 0 && !debouncedSearch
                          ? t("adminDashboard.noAthletesYet")
                          : t("adminDashboard.noSearchMatches")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {!allLoading && !allError && allTotalPages > 1 && (
            <div className="pagination-row no-print">
              <button
                type="button"
                className="btn btn-outline"
                disabled={allPage <= 1}
                onClick={() => goToPage(allPage - 1)}
              >
                {t("adminDashboard.prevPage")}
              </button>
              <span className="help-text" style={{ margin: 0 }}>
                {t("adminDashboard.pageOf")
                  .replace("{page}", allPage)
                  .replace("{totalPages}", allTotalPages)}
              </span>
              <button
                type="button"
                className="btn btn-outline"
                disabled={allPage >= allTotalPages}
                onClick={() => goToPage(allPage + 1)}
              >
                {t("adminDashboard.nextPage")}
              </button>
            </div>
          )}
        </>
      )}

      {/* PENDING TABS (new-submission / editing-approval) — the actionable
          queue: approve/reject, confirm/decline removals, one at a time or
          in bulk. Same table shape for both — only which rows feed it, and
          the empty-state text, differ by tab. */}
      {(activeTab === "pendingNew" || activeTab === "pendingEdit") && (
        <>
          <p className="help-text" style={{ marginTop: 0 }}>
            {t("adminDashboard.hiddenUntilApproved")}
          </p>
          {pendingLoading && <p>{t("adminDashboard.loading")}</p>}
          {pendingError && <p className="error-text">{pendingError}</p>}
          {!pendingLoading && !pendingError && (
            <>
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
                      <th>{t("common.photo")}</th>
                      <th>{t("adminDashboard.colId")}</th>
                      <th>{t("adminDashboard.colName")}</th>
                      <th>{t("adminDashboard.colRole")}</th>
                      <th>{t("adminDashboard.colTeam")}</th>
                      <th>{t("adminDashboard.colApproval")}</th>
                      <th>{t("adminDashboard.colActions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visiblePendingRows.map((a) => (
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
                        <td data-label={t("common.photo")}>
                          <img
                            src={a.photoUrl ? resolveFileUrl(a.photoUrl) : "https://placehold.co/50x50?text=Photo"}
                            alt={a.fullName}
                            className="small-photo"
                          />
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
                    {visiblePendingRows.length === 0 && (
                      <tr>
                        <td colSpan={8} style={{ textAlign: "center", color: "#777" }}>
                          {pendingEmptyText}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

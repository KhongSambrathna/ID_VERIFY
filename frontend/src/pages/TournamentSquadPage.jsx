import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { resolveFileUrl } from "../utils/fileUrl";
import { useLanguage } from "../i18n/LanguageContext";

function formatDate(d) {
  const date = new Date(d);
  if (isNaN(date)) return "";
  return date.toISOString().slice(0, 10);
}

function formatDob(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d)) return null;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}

// Off-screen sheet captured with html2canvas for both export paths — same
// classes/layout as SquadListManager's SquadExportSheet, adapted to the
// flat registration-row shape (name/photo/etc are already snapshotted
// directly on each row, no nested athlete doc to dig through).
function TournamentExportSheet({ innerRef, tournament }) {
  return (
    <div className="squad-export-sheet" ref={innerRef}>
      <div className="squad-export-header">
        <div className="squad-export-title">Countryside Football ID Verify</div>
        <div className="squad-export-team">{tournament.team || "All teams"}</div>
        <div className="squad-export-name">{tournament.name}</div>
      </div>
      <div className="squad-export-grid">
        {tournament.registrations.map((r, idx) => (
          <div key={r._id || idx} className="squad-export-row">
            <span className="squad-export-num">{r.jerseyNumber ?? idx + 1}</span>
            <img
              src={r.photoUrl ? resolveFileUrl(r.photoUrl) : "https://placehold.co/60x60?text=Photo"}
              alt={r.fullName}
              className="squad-export-photo"
            />
            <div className="squad-export-info">
              <p className="squad-export-name-en">{r.fullName}</p>
              {r.khmerName && <p className="squad-export-name-kh">{r.khmerName}</p>}
              <p className="squad-export-meta">
                DOB {formatDob(r.dateOfBirth) || "—"} · {r.team}
                {r.isOverage ? " · over-age" : ""}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Shown right after registering (or reached any time via "View squad" from
// the tournament list) — everyone signed up for this tournament, with
// buttons to export the list as a JPG image or a PDF, same pattern as the
// coach's squad-list export.
export default function TournamentSquadPage() {
  const { t } = useLanguage();
  const { id } = useParams();
  const navigate = useNavigate();
  const { isPlayer, isAdmin, athleteId } = useAuth();

  const [tournament, setTournament] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(null);
  const [actingId, setActingId] = useState(null);

  const [athleteSearch, setAthleteSearch] = useState("");
  const [athleteResults, setAthleteResults] = useState([]);

  const [payOpenId, setPayOpenId] = useState(null);
  const [payAmount, setPayAmount] = useState("");
  const [paySaving, setPaySaving] = useState(false);
  const [payError, setPayError] = useState("");
  const [settling, setSettling] = useState(false);
  const [closing, setClosing] = useState(false);

  const exportRef = useRef(null);
  const [showExportSheet, setShowExportSheet] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/tournaments/${id}`);
      setTournament(data);
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || t("tournamentSquadPage.failedToLoad"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Admin/Head Coach only — same register-on-behalf search as the
  // Tournaments list page, ported here so landing on this page right after
  // creating a tournament (still empty) isn't a dead end.
  const searchAthletes = async (q) => {
    setAthleteSearch(q);
    if (!q.trim()) {
      setAthleteResults([]);
      return;
    }
    try {
      const { data } = await api.get("/athletes");
      const lower = q.trim().toLowerCase();
      setAthleteResults(
        data.filter(
          (a) =>
            [a.fullName, a.khmerName, a.verifyId].filter(Boolean).some((f) => f.toLowerCase().includes(lower)) &&
            !tournament?.registrations?.some((r) => String(r.athlete) === String(a._id))
        )
      );
    } catch {
      setAthleteResults([]);
    }
  };

  const registerOnBehalf = async (athlete) => {
    setActingId(athlete._id);
    try {
      await api.post(`/tournaments/${id}/register-admin`, { athleteId: athlete._id, team: athlete.team });
      setAthleteSearch("");
      setAthleteResults([]);
      load();
    } catch (err) {
      alert(err.response?.data?.message || t("tournamentSquadPage.failedToRegister"));
    } finally {
      setActingId(null);
    }
  };

  // Same DELETE endpoint for three different situations, so the confirm
  // wording has to match which one this actually is: a Player requesting
  // their OWN withdrawal (needs Admin/Head Coach approval — doesn't remove
  // them yet), staff confirming a request that's already pending, or staff
  // removing someone outright (immediate, as always).
  const removeRegistration = async (r) => {
    const isMine = isPlayer && athleteId && String(r.athlete) === String(athleteId);
    const confirmMsg = isMine
      ? t("tournamentSquadPage.confirmWithdrawRequest")
      : r.pendingRemoval
      ? t("tournamentSquadPage.confirmConfirmWithdrawal").replace("{name}", r.fullName)
      : t("tournamentSquadPage.confirmRemove").replace("{name}", r.fullName);
    if (!confirm(confirmMsg)) return;
    setActingId(r._id);
    try {
      await api.delete(`/tournaments/${id}/registrations/${r._id}`);
      load();
    } catch (err) {
      alert(err.response?.data?.message || t("tournamentSquadPage.failedToRemove"));
    } finally {
      setActingId(null);
    }
  };

  // Declines a player's own pending withdrawal request — they stay
  // registered, same "keep" idea as the athlete-assignment removal flow.
  const keepRegistration = async (r) => {
    setActingId(r._id);
    try {
      await api.patch(`/tournaments/${id}/registrations/${r._id}/keep`);
      load();
    } catch (err) {
      alert(err.response?.data?.message || t("tournamentSquadPage.failedToKeep"));
    } finally {
      setActingId(null);
    }
  };

  const toggleRegistrationClosed = async () => {
    setClosing(true);
    try {
      await api.patch(`/tournaments/${id}/registration-status`, { closed: !tournament.registrationClosed });
      load();
    } catch (err) {
      alert(err.response?.data?.message || t("tournamentSquadPage.failedToUpdateClosed"));
    } finally {
      setClosing(false);
    }
  };

  const openPayForm = (row) => {
    setPayOpenId(row._id);
    setPayAmount(String(row.feePaidAmount > 0 ? row.feePaidAmount : tournament.entryFee));
    setPayError("");
  };

  const closePayForm = () => {
    setPayOpenId(null);
    setPayError("");
  };

  const savePayAmount = async (row) => {
    const amount = Number(payAmount);
    if (!Number.isFinite(amount) || amount < 0 || amount > tournament.entryFee) {
      setPayError(t("tournamentSquadPage.payAmountInvalid"));
      return;
    }
    setPaySaving(true);
    setPayError("");
    try {
      await api.patch(`/tournaments/${id}/registrations/${row._id}/paid`, { amount });
      setPayOpenId(null);
      load();
    } catch (err) {
      setPayError(err.response?.data?.message || t("tournamentSquadPage.failedToUpdatePaid"));
    } finally {
      setPaySaving(false);
    }
  };

  const settleNow = async () => {
    if (!confirm(t("tournamentSquadPage.confirmSettleNow"))) return;
    setSettling(true);
    try {
      await api.post(`/tournaments/${id}/settle-debts`);
      load();
    } catch (err) {
      alert(err.response?.data?.message || t("tournamentSquadPage.failedToSettle"));
    } finally {
      setSettling(false);
    }
  };

  const withExportSheet = async (run) => {
    setShowExportSheet(true);
    await new Promise((resolve) => setTimeout(resolve, 60));
    try {
      if (!exportRef.current) return;
      await run(exportRef.current);
    } finally {
      setShowExportSheet(false);
    }
  };

  const exportJpg = async () => {
    setExporting("jpg");
    try {
      await withExportSheet(async (node) => {
        const canvas = await html2canvas(node, { useCORS: true, scale: 2, backgroundColor: "#ffffff" });
        const link = document.createElement("a");
        link.download = `${tournament.name || "squad-list"}.jpg`;
        link.href = canvas.toDataURL("image/jpeg", 0.95);
        link.click();
      });
    } catch (err) {
      console.error(err);
      alert(t("tournamentSquadPage.exportJpgFailed"));
    } finally {
      setExporting(null);
    }
  };

  const exportPdf = async () => {
    setExporting("pdf");
    try {
      await withExportSheet(async (node) => {
        const canvas = await html2canvas(node, { useCORS: true, scale: 2, backgroundColor: "#ffffff" });
        const imgData = canvas.toDataURL("image/jpeg", 0.95);
        const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const imgWidth = pageWidth;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        let heightLeft = imgHeight;
        let position = 0;
        pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
        while (heightLeft > 0) {
          position = heightLeft - imgHeight;
          pdf.addPage();
          pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
          heightLeft -= pageHeight;
        }
        pdf.save(`${tournament.name || "squad-list"}.pdf`);
      });
    } catch (err) {
      console.error(err);
      alert(t("tournamentSquadPage.exportPdfFailed"));
    } finally {
      setExporting(null);
    }
  };

  const backTo = isPlayer && athleteId ? "/tournaments" : "/admin/tournaments";

  if (loading) return <div className="container dash-body"><p>{t("common.loading")}</p></div>;
  if (error) return <div className="container dash-body"><p className="error-text">{error}</p></div>;
  if (!tournament) return null;

  return (
    <div className="container dash-body">
      <div className="dash-header">
        <h2>
          {tournament.name} {t("tournamentSquadPage.squadListSuffix")}
          {tournament.registrationClosed && (
            <span className="badge rejected" style={{ marginLeft: 8, verticalAlign: "middle" }}>
              {t("tournamentSquadPage.closedBadge")}
            </span>
          )}
        </h2>
        <p>
          {t("tournamentSquadPage.registeredCount").replace("{count}", tournament.registrations.length)}
          {tournament.matchDates?.length ? ` · ${tournament.matchDates.map(formatDate).join(", ")}` : ""}
        </p>
      </div>

      <div className="dash-actions" style={{ marginBottom: 16 }}>
        {!isPlayer && (
          <button className="btn btn-outline" disabled={closing} onClick={toggleRegistrationClosed}>
            {tournament.registrationClosed ? t("tournamentSquadPage.openRegistrationButton") : t("tournamentSquadPage.closeRegistrationButton")}
          </button>
        )}
        <button className="btn btn-outline" onClick={exportJpg} disabled={exporting !== null}>
          {exporting === "jpg" ? t("tournamentSquadPage.exporting") : t("tournamentSquadPage.exportImage")}
        </button>
        <button className="btn btn-outline" onClick={exportPdf} disabled={exporting !== null}>
          {exporting === "pdf" ? t("tournamentSquadPage.exporting") : t("tournamentSquadPage.exportPdf")}
        </button>
        <Link className="link-btn" to={backTo} onClick={(e) => { e.preventDefault(); navigate(backTo); }}>
          {t("tournamentSquadPage.backToTournaments")}
        </Link>
        {!isPlayer && tournament.entryFee > 0 && !tournament.debtSettledAt && tournament.registrations.length > 0 && (
          <button className="btn btn-outline" disabled={settling} onClick={settleNow}>
            {settling ? t("tournamentSquadPage.settling") : t("tournamentSquadPage.settleNowButton")}
          </button>
        )}
        {!isPlayer && tournament.entryFee > 0 && tournament.debtSettledAt && (
          <span className="badge verified">{t("tournamentSquadPage.settledBadge")}</span>
        )}
      </div>

      {!isPlayer && tournament.teamLineups?.length > 0 && (
        <p className="help-text" style={{ marginTop: -8, marginBottom: 16 }}>
          {t("tournamentSquadPage.syncHelpPrefix")}{" "}
          {tournament.teamLineups.map((tl, i) => (
            <span key={tl.team}>
              {i > 0 && " · "}
              <Link
                className="link-btn"
                to={isAdmin ? `/admin/matchday?team=${encodeURIComponent(tl.team)}&tab=lineups` : `/coach?tab=lineups`}
              >
                {t("tournamentSquadPage.openSquadList").replace("{team}", tl.team)}
              </Link>
            </span>
          ))}
        </p>
      )}

      {!isPlayer && (
        <div className="field search-field" style={{ maxWidth: 340, marginBottom: 16 }}>
          <label>{t("tournamentSquadPage.registerLabel")}</label>
          <input
            placeholder={t("tournamentSquadPage.searchPlaceholder")}
            value={athleteSearch}
            onChange={(e) => searchAthletes(e.target.value)}
          />
          {athleteResults.length > 0 && (
            <ul className="fee-items">
              {athleteResults.map((a) => (
                <li key={a.assignmentId || a._id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>
                    <span className="caps-display">{a.fullName} — {a.team}</span>
                    {a.feeOwed > 0 ? ` ${t("tournamentSquadPage.owesAmount").replace("{amount}", a.feeOwed)}` : ""}
                  </span>
                  <button className="action-btn positive" disabled={actingId === a._id} onClick={() => registerOnBehalf(a)}>
                    {actingId === a._id ? t("tournamentSquadPage.registering") : t("tournamentSquadPage.registerBtn")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tournament.registrations.length === 0 ? (
        <p>{t("tournamentSquadPage.noOneRegistered")}</p>
      ) : (
        <div className="lineup-athletes">
          {tournament.registrations.map((r, idx) => {
            const isMine = isPlayer && athleteId && String(r.athlete) === String(athleteId);
            return (
              <div key={r._id || idx} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div className="lineup-athlete">
                  <span className="number">{r.jerseyNumber ?? idx + 1}</span>
                  <img
                    src={r.photoUrl ? resolveFileUrl(r.photoUrl) : "https://placehold.co/40x40?text=Photo"}
                    alt={r.fullName}
                    className="tiny-photo"
                  />
                  <div className="athlete-info">
                    <p className="name">
                      {r.fullName}
                      {r.isOverage && <span className="badge pending" style={{ marginLeft: 6 }}>{t("tournamentSquadPage.overAge")}</span>}
                    </p>
                    <p className="role">
                      {r.khmerName ? `${r.khmerName} · ` : ""}
                      {t("tournamentSquadPage.dobLabel")} {formatDob(r.dateOfBirth) || "—"} · <span className="caps-display">{r.team}</span>
                      {r.registeredBy ? t("tournamentSquadPage.registeredByStaff") : ""}
                    </p>
                  </div>
                  {!isPlayer && tournament.entryFee > 0 && (
                    r.convertedToDebt ? (
                      <span className="badge rejected">{t("tournamentSquadPage.convertedToDebtBadge")}</span>
                    ) : r.feePaid ? (
                      <span className="badge verified">{t("tournamentSquadPage.paidBadge")}</span>
                    ) : r.feePaidAmount > 0 ? (
                      <span className="badge pending">
                        {t("tournamentSquadPage.partialBadge")
                          .replace("{amount}", r.feePaidAmount)
                          .replace("{fee}", tournament.entryFee)}
                      </span>
                    ) : (
                      <span className="badge pending">{t("tournamentSquadPage.unpaidBadge")}</span>
                    )
                  )}
                  {!isPlayer && tournament.entryFee > 0 && !r.convertedToDebt && (
                    <button className="link-btn" onClick={() => openPayForm(r)}>
                      {t("tournamentSquadPage.setAmountButton")}
                    </button>
                  )}
                  {!isPlayer && r.pendingRemoval && (
                    <span className="badge pending" style={{ marginRight: 6 }}>
                      {t("tournamentSquadPage.withdrawalRequestedBadge")}
                    </span>
                  )}
                  {!isPlayer && r.pendingRemoval && (
                    <button className="action-btn positive" disabled={actingId === r._id} onClick={() => keepRegistration(r)}>
                      {t("tournamentSquadPage.keepButton")}
                    </button>
                  )}
                  {!isPlayer && (
                    <button className="link-btn" disabled={actingId === r._id} onClick={() => removeRegistration(r)}>
                      {r.pendingRemoval ? t("tournamentSquadPage.confirmWithdrawalButton") : t("common.remove")}
                    </button>
                  )}
                  {isPlayer && isMine && !tournament.registrationClosed && (
                    r.pendingRemoval ? (
                      <span className="badge pending">{t("tournamentSquadPage.withdrawalRequestedBadge")}</span>
                    ) : (
                      <button className="link-btn" disabled={actingId === r._id} onClick={() => removeRegistration(r)}>
                        {t("common.cancel")}
                      </button>
                    )
                  )}
                </div>
                {payOpenId === r._id && (
                  <div className="field" style={{ maxWidth: 260, marginLeft: 44 }}>
                    <label>{t("tournamentSquadPage.payAmountLabel").replace("{fee}", tournament.entryFee)}</label>
                    <input
                      type="number"
                      min="0"
                      max={tournament.entryFee}
                      step="0.01"
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                    />
                    {payError && (
                      <p className="error-text" style={{ margin: "4px 0" }}>
                        {payError}
                      </p>
                    )}
                    <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                      <button type="button" className="btn btn-primary" disabled={paySaving} onClick={() => savePayAmount(r)}>
                        {paySaving ? t("tournamentSquadPage.payingSavingBtn") : t("tournamentSquadPage.paySaveBtn")}
                      </button>
                      <button type="button" className="btn btn-outline" onClick={closePayForm}>
                        {t("common.cancel")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showExportSheet && (
        <div className="card-export-target">
          <TournamentExportSheet innerRef={exportRef} tournament={tournament} />
        </div>
      )}
    </div>
  );
}

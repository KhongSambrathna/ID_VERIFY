import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import html2canvas from "html2canvas";
import api from "../api/axios";
import IDCard from "../components/IDCard";
import { resolveFileUrl } from "../utils/fileUrl";
import { saveCanvasAsImage } from "../utils/saveCanvasAsImage";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../i18n/LanguageContext";

function formatDob(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d)) return null;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}

// Which fields to show, in which order, in the "pending edit" old-vs-new
// box below — see athlete.pendingChanges (Athlete model / updateAthlete).
// `format` renders each side the same way the read-only detail-grid below
// already does, so the comparison reads consistently with the rest of the
// page.
const PENDING_FIELD_ORDER = [
  { key: "fullName", labelKey: "common.fullName" },
  { key: "khmerName", labelKey: "common.khmerName" },
  { key: "dateOfBirth", labelKey: "athleteCardPage.dateOfBirth", format: (v) => formatDob(v) || "—" },
  { key: "gender", labelKey: "athleteCardPage.gender" },
  { key: "address", labelKey: "athleteCardPage.address" },
];

export default function AthleteCardPage() {
  const { t } = useLanguage();
  const { id } = useParams();
  const { isPlayer, isHeadCoach } = useAuth();
  const [searchParams] = useSearchParams();
  const requestedTeam = searchParams.get("team");
  const [athlete, setAthlete] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [feeExpanded, setFeeExpanded] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const [scanLogs, setScanLogs] = useState(null);
  const [scanLogsOpen, setScanLogsOpen] = useState(false);
  const [autoRenewing, setAutoRenewing] = useState(false);
  const [pendingAction, setPendingAction] = useState(null); // "print" | "jpg" | null
  const exportWrapRef = useRef(null);

  useEffect(() => {
    api
      .get(`/athletes/${id}`)
      .then(({ data }) => {
        setAthlete(data);
        const teams = [...new Set((data.assignments || []).map((a) => a.team))];
        setSelectedTeam(requestedTeam && teams.includes(requestedTeam) ? requestedTeam : teams[0] || null);
      })
      .catch((err) => setError(err.response?.data?.message || t("athleteCardPage.failedToLoad")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Admin any record; Head Coach their own team — just stamps
  // lastVerifiedAt to today, clearing the "needs renewal" badge.
  const renewVerification = async () => {
    setRenewing(true);
    try {
      const { data } = await api.put(`/athletes/${id}/renew`);
      setAthlete(data);
    } catch {
      // non-critical — silently ignore, the badge just stays as-is
    } finally {
      setRenewing(false);
    }
  };

  // QR-verify scan history — timestamp + IP/device only (that page has no
  // login, so there's no "who" to show). Admin/Head Coach only, loaded on
  // demand since most viewers of this page will never need it.
  const loadScanLogs = async () => {
    if (scanLogsOpen) {
      setScanLogsOpen(false);
      return;
    }
    setScanLogsOpen(true);
    if (scanLogs) return;
    try {
      const { data } = await api.get(`/athletes/${id}/scan-logs`);
      setScanLogs(data);
    } catch {
      setScanLogs([]);
    }
  };

  // This person's teams, one card per team — roles on that same team are
  // joined together onto the one card ("PLAYER, ASSISTANT COACH").
  const teams = useMemo(
    () => [...new Set((athlete?.assignments || []).map((a) => a.team))],
    [athlete]
  );

  const cardAthlete = useMemo(() => {
    if (!athlete) return null;
    if (!selectedTeam) return { ...athlete, team: "", role: "" };
    const roles = athlete.assignments.filter((a) => a.team === selectedTeam).map((a) => a.role);
    return { ...athlete, team: selectedTeam, role: roles.join(", ") };
  }, [athlete, selectedTeam]);

  // Fee/debt info for the currently selected team only — Admin/Head
  // Coach/Player viewers only (this whole page is), and never part of the
  // printed/exported card below. Only the TOTAL shows by default; the
  // itemized breakdown only appears once the viewer clicks it.
  const teamFee = useMemo(() => {
    if (!athlete || !selectedTeam) return { owed: 0, items: [] };
    const onTeam = athlete.assignments.filter((a) => a.team === selectedTeam);
    const items = onTeam.flatMap((a) => a.fees || []);
    return {
      owed: items.reduce((sum, f) => sum + (f.amount || 0), 0),
      items,
    };
  }, [athlete, selectedTeam]);

  // Collapse the breakdown again whenever a different team's card is shown.
  useEffect(() => {
    setFeeExpanded(false);
  }, [selectedTeam]);

  const handleSaveAsJpg = async () => {
    const cardNode = exportWrapRef.current?.querySelector(".id-card");
    if (!cardNode) return;
    setSaving(true);
    try {
      const canvas = await html2canvas(cardNode, {
        useCORS: true,
        scale: 3,
        backgroundColor: "#ffffff",
      });
      await saveCanvasAsImage(canvas, `${cardAthlete.verifyId || cardAthlete.fullName || "id-card"}.jpg`);
    } catch (err) {
      console.error("Failed to save card as JPG:", err);
      alert(t("athleteCardPage.couldNotSaveJpg"));
    } finally {
      setSaving(false);
    }
  };

  // Stamps verification to today before every print/export, so the VALID
  // date on the card is always current without a separate manual Renew
  // step. Only sets pendingAction — the actual print/capture happens in
  // the effect below, once React has committed the refreshed athlete (and
  // so the updated VALID date) to the DOM.
  const requestExport = async (action) => {
    setAutoRenewing(true);
    try {
      const { data } = await api.put(`/athletes/${id}/renew`);
      setAthlete(data);
      setPendingAction(action);
    } catch (err) {
      alert(err.response?.data?.message || t("athleteCardPage.failedToRenew"));
    } finally {
      setAutoRenewing(false);
    }
  };

  useEffect(() => {
    if (!pendingAction) return;
    setPendingAction(null);
    if (pendingAction === "print") {
      window.print();
    } else if (pendingAction === "jpg") {
      handleSaveAsJpg();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAction, athlete]);

  return (
    <div className="container" style={{ paddingBottom: 60 }}>
      {/* Plain data view — this is what shows on screen. The actual branded
          ID card is only rendered when exporting (print or save-as-JPG),
          via the hidden card below. */}
      <div className="dash-header no-print">
        <h2>{t("athleteCardPage.title")}</h2>
        <Link to={isPlayer ? "/player" : isHeadCoach ? "/coach" : "/admin"} className="link-btn">
          {t("athleteCardPage.backToDashboard")}
        </Link>
      </div>

      {error && <p className="error-text no-print">{error}</p>}

      {athlete && cardAthlete && (
        <>
          <div className="athlete-detail card no-print">
            <div className="athlete-detail-top">
              <div>
                <img
                  className="athlete-detail-photo"
                  src={
                    athlete.photoUrl
                      ? resolveFileUrl(athlete.photoUrl)
                      : "https://placehold.co/120x150?text=Photo"
                  }
                  alt={athlete.fullName}
                />
                {athlete.pendingPhotoUrl && (
                  <div style={{ marginTop: 6, textAlign: "center" }}>
                    <img
                      src={resolveFileUrl(athlete.pendingPhotoUrl)}
                      alt={t("athleteCardPage.pendingPhotoAlt")}
                      className="athlete-detail-photo"
                      style={{ width: 60, height: "auto", opacity: 0.9 }}
                    />
                    <p className="help-text" style={{ margin: "2px 0 0", fontSize: 11 }}>
                      {t("athleteCardPage.pendingPhotoLabel")}
                    </p>
                  </div>
                )}
              </div>
              <div>
                <h3 className="caps-display" style={{ margin: "0 0 2px" }}>{athlete.fullName}</h3>
                {athlete.khmerName && <p className="khmer-name">{athlete.khmerName}</p>}
                <p className="verify-id">{t("athleteCardPage.idLabel")} {athlete.verifyId}</p>
                <div className="athlete-detail-badges">
                  <span className={`badge ${athlete.status}`}>{athlete.status}</span>
                  <span className={`badge ${athlete.isAvailable ? "verified" : "rejected"}`}>
                    {athlete.isAvailable ? t("athleteCardPage.available") : t("athleteCardPage.notAvailable")}
                  </span>
                </div>
              </div>
            </div>

            {!isPlayer && athlete.pendingChanges && Object.keys(athlete.pendingChanges).length > 0 && (
              <div
                className="no-print"
                style={{
                  margin: "12px 0 0",
                  padding: "8px 10px",
                  border: "1px solid #f0c36d",
                  borderRadius: 6,
                  background: "#fff8e6",
                }}
              >
                <p className="help-text" style={{ margin: "0 0 6px", fontWeight: 600 }}>
                  {t("athleteCardPage.pendingEditTitle")}
                </p>
                <ul className="fee-items" style={{ margin: 0 }}>
                  {PENDING_FIELD_ORDER.filter((f) => athlete.pendingChanges[f.key] !== undefined).map((f) => (
                    <li key={f.key}>
                      <strong>{t(f.labelKey)}:</strong>{" "}
                      {f.format ? f.format(athlete[f.key]) : athlete[f.key] || "—"}
                      {" → "}
                      <span style={{ color: "#b45309" }}>
                        {f.format ? f.format(athlete.pendingChanges[f.key]) : athlete.pendingChanges[f.key]}
                      </span>
                    </li>
                  ))}
                  {athlete.pendingChanges.addedDocumentLabels?.length > 0 && (
                    <li>
                      <strong>{t("athleteCardPage.pendingAddedDocs")}:</strong>{" "}
                      {athlete.pendingChanges.addedDocumentLabels.join(", ")}
                    </li>
                  )}
                  {athlete.pendingChanges.removedDocumentLabels?.length > 0 && (
                    <li>
                      <strong>{t("athleteCardPage.pendingRemovedDocs")}:</strong>{" "}
                      {athlete.pendingChanges.removedDocumentLabels.join(", ")}
                    </li>
                  )}
                </ul>
              </div>
            )}

            {teams.length > 1 && (
              <div className="field" style={{ maxWidth: 280, margin: "12px 0 0" }}>
                <label>{t("athleteCardPage.cardForTeam")}</label>
                <select value={selectedTeam || ""} onChange={(e) => setSelectedTeam(e.target.value)}>
                  {teams.map((team) => (
                    <option key={team} value={team}>
                      {team}
                    </option>
                  ))}
                </select>
                <p className="help-text">
                  {t("athleteCardPage.multiTeamNote").replace("{count}", teams.length)}
                </p>
              </div>
            )}

            <div className="detail-grid">
              <div className="detail-item">
                <div className="detail-label">{t("athleteCardPage.dateOfBirth")}</div>
                <div className="detail-value">{formatDob(athlete.dateOfBirth) || "—"}</div>
              </div>
              <div className="detail-item">
                <div className="detail-label">{t("athleteCardPage.gender")}</div>
                <div className="detail-value">{athlete.gender || "—"}</div>
              </div>
              <div className="detail-item">
                <div className="detail-label">{t("athleteCardPage.team")}</div>
                <div className="detail-value">{cardAthlete.team || "—"}</div>
              </div>
              <div className="detail-item">
                <div className="detail-label">{t("athleteCardPage.role")}</div>
                <div className="detail-value">{cardAthlete.role || "—"}</div>
              </div>
              {!isPlayer && (
                <div className="detail-item">
                  <div className="detail-label">{t("athleteCardPage.jersey")}</div>
                  <div className="detail-value">
                    {athlete.assignments
                      ?.filter((a) => a.team === selectedTeam)
                      .map((a) => a.jerseyNumber)
                      .find((n) => n !== null && n !== undefined) ?? "—"}
                  </div>
                </div>
              )}
              <div className="detail-item detail-item-wide">
                <div className="detail-label">{t("athleteCardPage.address")}</div>
                <div className="detail-value">{athlete.address || "—"}</div>
              </div>
              {!isPlayer && (
                <div className="detail-item detail-item-wide">
                  <div className="detail-label">{t("athleteCardPage.verification")}</div>
                  <div className="detail-value">
                    {athlete.lastVerifiedAt
                      ? t("athleteCardPage.lastVerified").replace(
                          "{date}",
                          new Date(athlete.lastVerifiedAt).toLocaleDateString()
                        )
                      : t("athleteCardPage.neverVerified")}
                    {(!athlete.lastVerifiedAt ||
                      Date.now() - new Date(athlete.lastVerifiedAt).getTime() > 365 * 24 * 60 * 60 * 1000) && (
                      <span className="badge rejected" style={{ marginLeft: 8 }}>
                        {t("athleteCardPage.needsRenewal")}
                      </span>
                    )}
                    <button
                      type="button"
                      className="link-btn"
                      style={{ marginLeft: 8 }}
                      onClick={renewVerification}
                      disabled={renewing}
                    >
                      {renewing ? t("athleteCardPage.renewing") : t("athleteCardPage.renewVerifiedToday")}
                    </button>
                    <div style={{ marginTop: 4 }}>
                      <button type="button" className="link-btn" onClick={loadScanLogs}>
                        {scanLogsOpen
                          ? t("athleteCardPage.hideScanHistory")
                          : t("athleteCardPage.showScanHistory")}
                      </button>
                      {scanLogsOpen && (
                        <ul className="fee-items" style={{ marginTop: 4 }}>
                          {scanLogs === null && <li>{t("athleteCardPage.loading")}</li>}
                          {scanLogs?.length === 0 && <li>{t("athleteCardPage.noScansRecorded")}</li>}
                          {scanLogs?.map((log) => (
                            <li key={log._id}>
                              <span>
                                {new Date(log.scannedAt).toLocaleString()} —{" "}
                                {log.ip || t("athleteCardPage.unknownIp")}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {!isPlayer && (
                <div className="detail-item detail-item-wide">
                  <div className="detail-label">{t("athleteCardPage.referenceDocuments")}</div>
                  <div className="detail-value">
                    {athlete.supportingDocuments?.length ? (
                      <ul className="fee-items">
                        {athlete.supportingDocuments.map((doc) => (
                          <li key={doc._id}>
                            <a href={resolveFileUrl(doc.fileUrl)} target="_blank" rel="noreferrer">
                              {doc.label || t("athleteCardPage.document")}
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="help-text">{t("athleteCardPage.noneOnFile")}</span>
                    )}
                  </div>
                </div>
              )}
              <div className="detail-item detail-item-wide">
                <div className="detail-label">{t("athleteCardPage.feeDebtThisTeam")}</div>
                <div className="detail-value">
                  {teamFee.owed > 0 ? (
                    <>
                      <button
                        type="button"
                        className="badge rejected fee-toggle"
                        onClick={() => setFeeExpanded((v) => !v)}
                      >
                        {t("athleteCardPage.owes").replace("{amount}", teamFee.owed)} {feeExpanded ? "▲" : "▼"}
                      </button>
                      {feeExpanded && (
                        <ul className="fee-items" style={{ marginTop: 6 }}>
                          {teamFee.items.map((f) => (
                            <li key={f._id}>
                              <span>
                                ${f.amount}
                                {f.note ? ` — ${f.note}` : ""}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  ) : (
                    <span className="badge verified">{t("athleteCardPage.feePaid")}</span>
                  )}
                </div>
              </div>
            </div>

            <div className="dash-actions" style={{ marginTop: 20 }}>
              {!isPlayer && (
                <Link
                  to={`/admin/athlete/${athlete._id}/edit`}
                  className="btn btn-outline"
                  style={{ color: "var(--navy)", borderColor: "var(--navy)" }}
                >
                  {t("athleteCardPage.edit")}
                </Link>
              )}
              <button
                className="btn btn-primary"
                onClick={() => requestExport("print")}
                disabled={autoRenewing}
              >
                {autoRenewing ? t("athleteCardPage.renewing") : t("athleteCardPage.exportPrint")}
              </button>
              <button
                className="btn btn-outline"
                style={{ color: "var(--navy)", borderColor: "var(--navy)" }}
                onClick={() => requestExport("jpg")}
                disabled={autoRenewing || saving}
              >
                {saving
                  ? t("athleteCardPage.saving")
                  : autoRenewing
                  ? t("athleteCardPage.renewing")
                  : t("athleteCardPage.saveAsJpg")}
              </button>
            </div>
          </div>

          {/* Hidden on screen (off-canvas, still fully rendered so print /
              html2canvas can use it); becomes the visible content when printing. */}
          <div className="card-export-target" ref={exportWrapRef}>
            <div className="cards-grid">
              <IDCard athlete={cardAthlete} hideActions />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

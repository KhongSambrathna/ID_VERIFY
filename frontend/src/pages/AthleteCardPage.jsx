import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import html2canvas from "html2canvas";
import api from "../api/axios";
import IDCard from "../components/IDCard";
import { resolveFileUrl } from "../utils/fileUrl";
import { useAuth } from "../context/AuthContext";

function formatDob(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d)) return null;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}

export default function AthleteCardPage() {
  const { id } = useParams();
  const { isPlayer } = useAuth();
  const [searchParams] = useSearchParams();
  const requestedTeam = searchParams.get("team");
  const [athlete, setAthlete] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [feeExpanded, setFeeExpanded] = useState(false);
  const exportWrapRef = useRef(null);

  useEffect(() => {
    api
      .get(`/athletes/${id}`)
      .then(({ data }) => {
        setAthlete(data);
        const teams = [...new Set((data.assignments || []).map((a) => a.team))];
        setSelectedTeam(requestedTeam && teams.includes(requestedTeam) ? requestedTeam : teams[0] || null);
      })
      .catch((err) => setError(err.response?.data?.message || "Failed to load"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

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
      const link = document.createElement("a");
      link.download = `${cardAthlete.verifyId || cardAthlete.fullName || "id-card"}.jpg`;
      link.href = canvas.toDataURL("image/jpeg", 0.95);
      link.click();
    } catch (err) {
      console.error("Failed to save card as JPG:", err);
      alert("Couldn't save the card as an image. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container" style={{ paddingBottom: 60 }}>
      {/* Plain data view — this is what shows on screen. The actual branded
          ID card is only rendered when exporting (print or save-as-JPG),
          via the hidden card below. */}
      <div className="dash-header no-print">
        <h2>Athlete record</h2>
        <Link to={isPlayer ? "/player" : "/admin"} className="link-btn">
          ← Back to dashboard
        </Link>
      </div>

      {error && <p className="error-text no-print">{error}</p>}

      {athlete && cardAthlete && (
        <>
          <div className="athlete-detail card no-print">
            <div className="athlete-detail-top">
              <img
                className="athlete-detail-photo"
                src={
                  athlete.photoUrl
                    ? resolveFileUrl(athlete.photoUrl)
                    : "https://placehold.co/120x150?text=Photo"
                }
                alt={athlete.fullName}
              />
              <div>
                <h3 style={{ margin: "0 0 2px" }}>{athlete.fullName}</h3>
                {athlete.khmerName && <p className="khmer-name">{athlete.khmerName}</p>}
                <p className="verify-id">ID: {athlete.verifyId}</p>
                <div className="athlete-detail-badges">
                  <span className={`badge ${athlete.status}`}>{athlete.status}</span>
                  <span className={`badge ${athlete.isAvailable ? "verified" : "rejected"}`}>
                    {athlete.isAvailable ? "Available" : "Not available"}
                  </span>
                </div>
              </div>
            </div>

            {teams.length > 1 && (
              <div className="field" style={{ maxWidth: 280, margin: "12px 0 0" }}>
                <label>Card for team</label>
                <select value={selectedTeam || ""} onChange={(e) => setSelectedTeam(e.target.value)}>
                  {teams.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <p className="help-text">This person has {teams.length} teams — each prints its own card.</p>
              </div>
            )}

            <div className="detail-grid">
              <div className="detail-item">
                <div className="detail-label">Date of birth</div>
                <div className="detail-value">{formatDob(athlete.dateOfBirth) || "—"}</div>
              </div>
              <div className="detail-item">
                <div className="detail-label">Gender</div>
                <div className="detail-value">{athlete.gender || "—"}</div>
              </div>
              <div className="detail-item">
                <div className="detail-label">Team</div>
                <div className="detail-value">{cardAthlete.team || "—"}</div>
              </div>
              <div className="detail-item">
                <div className="detail-label">Role</div>
                <div className="detail-value">{cardAthlete.role || "—"}</div>
              </div>
              <div className="detail-item detail-item-wide">
                <div className="detail-label">Address</div>
                <div className="detail-value">{athlete.address || "—"}</div>
              </div>
              <div className="detail-item detail-item-wide">
                <div className="detail-label">Fee / debt (this team)</div>
                <div className="detail-value">
                  {teamFee.owed > 0 ? (
                    <>
                      <button
                        type="button"
                        className="badge rejected fee-toggle"
                        onClick={() => setFeeExpanded((v) => !v)}
                      >
                        Owes ${teamFee.owed} {feeExpanded ? "▲" : "▼"}
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
                    <span className="badge verified">Fee paid</span>
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
                  Edit
                </Link>
              )}
              <button className="btn btn-primary" onClick={() => window.print()}>
                Export / Print card
              </button>
              <button
                className="btn btn-outline"
                style={{ color: "var(--navy)", borderColor: "var(--navy)" }}
                onClick={handleSaveAsJpg}
                disabled={saving}
              >
                {saving ? "Saving…" : "Save as JPG"}
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

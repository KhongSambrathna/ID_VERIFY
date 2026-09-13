import { useEffect, useRef, useState } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import api from "../api/axios";
import { resolveFileUrl } from "../utils/fileUrl";
import { jerseyNumberForTeam } from "../utils/rolesForTeam";

const MIN_SQUAD = 15;
const MAX_SQUAD = 22;

function formatDob(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d)) return null;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}

// `athlete` here can be either the flattened team-scoped roster shape
// (a plain `.role` string, already just this team's) or a raw/populated
// Athlete document (an `.assignments` array covering every team they're
// on) — a saved Lineup's `athletes[].athleteId` is the latter. Either way,
// this returns the role(s) that apply to THIS team, comma-joined if the
// person holds more than one role on it.
function rolesForTeam(athlete, team) {
  if (!athlete) return "";
  if (!athlete.assignments) return athlete.role || "";
  return athlete.assignments
    .filter((a) => a.team === team)
    .map((a) => a.role)
    .join(", ");
}

// Same dual-shape handling as rolesForTeam above, but for the total fee
// owed on this team's assignment (the flattened shape already carries the
// summed `.feeOwed`; a raw/populated doc only has the itemized `.fees`
// rows, so sum those instead). Admin/Head Coach only — never used by
// SquadExportSheet (the printable/exportable sheet), so it never reaches a
// downloaded roster or a printed card.
function feeOwedForTeam(athlete, team) {
  if (!athlete) return 0;
  if (!athlete.assignments) return athlete.feeOwed || 0;
  const match = athlete.assignments.find((a) => a.team === team);
  return (match?.fees || []).reduce((sum, f) => sum + (f.amount || 0), 0);
}

// A joined "$10 — Uniform fee, $15 — Registration" string for a tooltip —
// same dual-shape handling as above.
function feeSummaryForTeam(athlete, team) {
  if (!athlete) return "";
  const fees = !athlete.assignments
    ? athlete.fees || []
    : athlete.assignments.find((a) => a.team === team)?.fees || [];
  return fees.map((f) => `$${f.amount}${f.note ? ` — ${f.note}` : ""}`).join(", ");
}

function SquadCountNote({ count }) {
  const inRange = count >= MIN_SQUAD && count <= MAX_SQUAD;
  return (
    <p className={`squad-count-note ${inRange ? "ok" : "warn"}`}>
      {inRange ? "✓" : "⚠"} {count} selected — a match squad is usually {MIN_SQUAD}–{MAX_SQUAD} people
      (players plus head coach, assistant coach, and medic).
    </p>
  );
}

function AthletePicker({ athletes, selected, onToggle }) {
  return (
    <div className="athletes-select">
      {athletes.map((athlete) => (
        <label key={athlete._id} className="athlete-checkbox">
          <input
            type="checkbox"
            checked={selected.includes(athlete._id)}
            onChange={() => onToggle(athlete._id)}
          />
          <span className="checkbox-label">
            <img
              src={
                athlete.photoUrl
                  ? resolveFileUrl(athlete.photoUrl)
                  : "https://placehold.co/50x50?text=Photo"
              }
              alt={athlete.fullName}
              className="small-photo"
            />
            <span>
              {athlete.jerseyNumber !== null && athlete.jerseyNumber !== undefined && (
                <span className="picker-meta">#{athlete.jerseyNumber} </span>
              )}
              {athlete.fullName} <span className="picker-meta">({athlete.role || "PLAYER"} · {formatDob(athlete.dateOfBirth) || "DOB —"})</span>
              {athlete.feeOwed > 0 && (
                <span
                  className="badge rejected picker-debt-badge"
                  title={(athlete.fees || []).map((f) => `$${f.amount}${f.note ? ` — ${f.note}` : ""}`).join(", ")}
                >
                  Owes ${athlete.feeOwed}
                </span>
              )}
            </span>
          </span>
        </label>
      ))}
    </div>
  );
}

// The printable/exportable roster sheet — rendered off-screen and captured
// with html2canvas for both the JPG and PDF export paths.
function SquadExportSheet({ innerRef, team, squadName, members }) {
  return (
    <div className="squad-export-sheet" ref={innerRef}>
      <div className="squad-export-header">
        <div className="squad-export-title">Countryside Football ID Verify</div>
        <div className="squad-export-team">{team}</div>
        <div className="squad-export-name">{squadName}</div>
      </div>
      <div className="squad-export-grid">
        {members.map((item, idx) => {
          const a = item.athleteId;
          if (!a) return null;
          const jersey = jerseyNumberForTeam(a, team);
          return (
            <div key={item.athleteId?._id || idx} className="squad-export-row">
              <span className="squad-export-num">{jersey ?? idx + 1}</span>
              <img
                src={a.photoUrl ? resolveFileUrl(a.photoUrl) : "https://placehold.co/60x60?text=Photo"}
                alt={a.fullName}
                className="squad-export-photo"
              />
              <div className="squad-export-info">
                <p className="squad-export-name-en">{a.fullName}</p>
                {a.khmerName && <p className="squad-export-name-kh">{a.khmerName}</p>}
                <p className="squad-export-meta">
                  {rolesForTeam(a, team) || "PLAYER"} · DOB {formatDob(a.dateOfBirth) || "—"}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function SquadListManager({ team, athletes }) {
  const [lineups, setLineups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedAthletes, setSelectedAthletes] = useState([]);
  const [newLineupName, setNewLineupName] = useState("");
  const [showNewLineupForm, setShowNewLineupForm] = useState(false);

  const [editingLineupId, setEditingLineupId] = useState(null);
  const [editSelectedAthletes, setEditSelectedAthletes] = useState([]);
  const [editLineupName, setEditLineupName] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [exportingId, setExportingId] = useState(null);
  const exportRef = useRef(null);
  const [exportTarget, setExportTarget] = useState(null); // lineup being rendered off-screen for export

  useEffect(() => {
    if (team) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team]);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/coach/lineups", { params: { team } });
      setLineups(data);
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load squad lists");
    } finally {
      setLoading(false);
    }
  };

  const toggleAthlete = (id) =>
    setSelectedAthletes((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const toggleEditAthlete = (id) =>
    setEditSelectedAthletes((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const createLineup = async () => {
    if (!newLineupName.trim()) {
      alert("Please enter a name for this squad list");
      return;
    }
    try {
      await api.post("/coach/lineup", {
        team,
        name: newLineupName,
        athletes: selectedAthletes.map((id) => ({ athleteId: id })),
      });
      setNewLineupName("");
      setSelectedAthletes([]);
      setShowNewLineupForm(false);
      load();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to create squad list");
    }
  };

  const deleteLineup = async (id) => {
    if (!confirm("Delete this squad list?")) return;
    try {
      await api.delete(`/coach/lineup/${id}`);
      load();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to delete squad list");
    }
  };

  const startEditLineup = (lineup) => {
    setEditingLineupId(lineup._id);
    setEditLineupName(lineup.name);
    setEditSelectedAthletes(lineup.athletes.map((item) => item.athleteId?._id).filter(Boolean));
  };

  const cancelEditLineup = () => {
    setEditingLineupId(null);
    setEditLineupName("");
    setEditSelectedAthletes([]);
  };

  const saveEditLineup = async () => {
    if (!editLineupName.trim()) {
      alert("Please enter a name for this squad list");
      return;
    }
    setSavingEdit(true);
    try {
      await api.put(`/coach/lineup/${editingLineupId}`, {
        team,
        name: editLineupName,
        athletes: editSelectedAthletes.map((id) => ({ athleteId: id })),
      });
      cancelEditLineup();
      load();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to update squad list");
    } finally {
      setSavingEdit(false);
    }
  };

  // Renders the given lineup into the off-screen export sheet, waits a tick
  // for the DOM/images to paint, then captures it.
  const withExportSheet = async (lineup, run) => {
    setExportTarget(lineup);
    await new Promise((resolve) => setTimeout(resolve, 60));
    try {
      if (!exportRef.current) return;
      await run(exportRef.current);
    } finally {
      setExportTarget(null);
    }
  };

  const exportJpg = async (lineup) => {
    setExportingId(`${lineup._id}-jpg`);
    try {
      await withExportSheet(lineup, async (node) => {
        const canvas = await html2canvas(node, { useCORS: true, scale: 2, backgroundColor: "#ffffff" });
        const link = document.createElement("a");
        link.download = `${lineup.name || "squad-list"}.jpg`;
        link.href = canvas.toDataURL("image/jpeg", 0.95);
        link.click();
      });
    } catch (err) {
      console.error(err);
      alert("Couldn't export the squad list as a JPG. Please try again.");
    } finally {
      setExportingId(null);
    }
  };

  const exportPdf = async (lineup) => {
    setExportingId(`${lineup._id}-pdf`);
    try {
      await withExportSheet(lineup, async (node) => {
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
        pdf.save(`${lineup.name || "squad-list"}.pdf`);
      });
    } catch (err) {
      console.error(err);
      alert("Couldn't export the squad list as a PDF. Please try again.");
    } finally {
      setExportingId(null);
    }
  };

  if (!team) return <p className="help-text">Choose a team first.</p>;
  if (loading) return <p>Loading…</p>;
  if (error) return <p className="error-text">{error}</p>;

  return (
    <div>
      <div className="lineup-header">
        <h3>Squad lists — {team}</h3>
        {!showNewLineupForm && (
          <button className="btn btn-primary" onClick={() => setShowNewLineupForm(true)}>
            + Create squad list
          </button>
        )}
      </div>

      {showNewLineupForm && (
        <div className="lineup-form card">
          <h4>Create squad list</h4>
          <div className="field">
            <label>Name</label>
            <input
              type="text"
              placeholder="e.g., vs Angkor FC — Round 3"
              value={newLineupName}
              onChange={(e) => setNewLineupName(e.target.value)}
            />
          </div>

          <SquadCountNote count={selectedAthletes.length} />

          <AthletePicker athletes={athletes} selected={selectedAthletes} onToggle={toggleAthlete} />

          <div className="form-actions">
            <button className="btn btn-primary" onClick={createLineup}>
              Create squad list
            </button>
            <button
              className="btn btn-outline"
              onClick={() => {
                setShowNewLineupForm(false);
                setSelectedAthletes([]);
                setNewLineupName("");
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {lineups.length === 0 ? (
        <p>No squad lists yet. Create one to get started.</p>
      ) : (
        <div className="lineups-list">
          {lineups.map((lineup) => {
            const isEditing = editingLineupId === lineup._id;
            return (
              <div key={lineup._id} className="lineup-card card">
                {isEditing ? (
                  <>
                    <div className="field">
                      <label>Name</label>
                      <input
                        type="text"
                        value={editLineupName}
                        onChange={(e) => setEditLineupName(e.target.value)}
                      />
                    </div>

                    <SquadCountNote count={editSelectedAthletes.length} />

                    <AthletePicker
                      athletes={athletes}
                      selected={editSelectedAthletes}
                      onToggle={toggleEditAthlete}
                    />

                    <div className="form-actions">
                      <button className="btn btn-primary" onClick={saveEditLineup} disabled={savingEdit}>
                        {savingEdit ? "Saving…" : "Save changes"}
                      </button>
                      <button className="btn btn-outline" onClick={cancelEditLineup}>
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="lineup-header-card">
                      <h4>{lineup.name}</h4>
                      <div className="dash-actions">
                        <button className="link-btn" onClick={() => startEditLineup(lineup)}>
                          Edit
                        </button>
                        <button
                          className="link-btn"
                          onClick={() => exportJpg(lineup)}
                          disabled={exportingId === `${lineup._id}-jpg`}
                        >
                          {exportingId === `${lineup._id}-jpg` ? "Exporting…" : "Export JPG"}
                        </button>
                        <button
                          className="link-btn"
                          onClick={() => exportPdf(lineup)}
                          disabled={exportingId === `${lineup._id}-pdf`}
                        >
                          {exportingId === `${lineup._id}-pdf` ? "Exporting…" : "Export PDF"}
                        </button>
                        <button className="btn btn-danger" onClick={() => deleteLineup(lineup._id)}>
                          Delete
                        </button>
                      </div>
                    </div>

                    <SquadCountNote count={lineup.athletes.length} />

                    <div className="lineup-athletes">
                      {lineup.athletes.map((item, idx) => (
                        <div key={idx} className="lineup-athlete">
                          <span className="number">
                            {jerseyNumberForTeam(item.athleteId, lineup.team) ?? idx + 1}
                          </span>
                          <img
                            src={
                              item.athleteId?.photoUrl
                                ? resolveFileUrl(item.athleteId.photoUrl)
                                : "https://placehold.co/40x40?text=Photo"
                            }
                            alt={item.athleteId?.fullName || "Athlete"}
                            className="tiny-photo"
                          />
                          <div className="athlete-info">
                            <p className="name">
                              {item.athleteId?.fullName || "Unknown"}
                              {feeOwedForTeam(item.athleteId, lineup.team) > 0 && (
                                <span
                                  className="badge rejected picker-debt-badge"
                                  title={feeSummaryForTeam(item.athleteId, lineup.team)}
                                >
                                  Owes ${feeOwedForTeam(item.athleteId, lineup.team)}
                                </span>
                              )}
                            </p>
                            <p className="role">
                              {rolesForTeam(item.athleteId, lineup.team) || "PLAYER"} ·{" "}
                              {formatDob(item.athleteId?.dateOfBirth) || "DOB —"} ·{" "}
                              {item.athleteId?.gender || "—"}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Off-canvas export sheet, rendered only while exporting a specific squad list */}
      {exportTarget && (
        <div className="card-export-target">
          <SquadExportSheet
            innerRef={exportRef}
            team={team}
            squadName={exportTarget.name}
            members={exportTarget.athletes}
          />
        </div>
      )}
    </div>
  );
}

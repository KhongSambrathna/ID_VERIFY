import { useEffect, useRef, useState } from "react";
import api from "../api/axios";
import { resolveFileUrl } from "../utils/fileUrl";
import { exportPosterAsImage } from "../utils/exportPoster";

// Four fixed lines, top (attack) to bottom (goalkeeper) — matches how a
// "combined XI" graphic is normally read. Only 4-line shapes are offered
// (no 4-2-3-1 etc.) since the Athlete model has no fine-grained playing
// position — a coach just decides who plays where by which slot they pick.
// Shapes are grouped by match format — this club mostly plays 8, 9, 10, or
// 11-a-side, not 5/7-a-side, so those are the four groups offered.
const ROWS_ORDER = ["FWD", "MID", "DEF", "GK"];
const ROW_LABELS = { FWD: "Forwards", MID: "Midfielders", DEF: "Defenders", GK: "Goalkeeper" };
const ROW_Y = { FWD: 16, MID: 40, DEF: 64, GK: 90 };
const SHAPES = {
  // 11-a-side
  "4-3-3": { FWD: 3, MID: 3, DEF: 4, GK: 1 },
  "4-4-2": { FWD: 2, MID: 4, DEF: 4, GK: 1 },
  "3-4-3": { FWD: 3, MID: 4, DEF: 3, GK: 1 },
  "3-5-2": { FWD: 2, MID: 5, DEF: 3, GK: 1 },
  // 10-a-side
  "4-3-2": { FWD: 2, MID: 3, DEF: 4, GK: 1 },
  "3-4-2": { FWD: 2, MID: 4, DEF: 3, GK: 1 },
  "4-2-3": { FWD: 3, MID: 2, DEF: 4, GK: 1 },
  "3-3-3": { FWD: 3, MID: 3, DEF: 3, GK: 1 },
  // 9-a-side
  "3-3-2": { FWD: 2, MID: 3, DEF: 3, GK: 1 },
  "3-2-3": { FWD: 3, MID: 2, DEF: 3, GK: 1 },
  "2-3-3": { FWD: 3, MID: 3, DEF: 2, GK: 1 },
  // 8-a-side
  "3-3-1": { FWD: 1, MID: 3, DEF: 3, GK: 1 },
  "3-2-2": { FWD: 2, MID: 2, DEF: 3, GK: 1 },
  "2-3-2": { FWD: 2, MID: 3, DEF: 2, GK: 1 },
  "2-2-3": { FWD: 3, MID: 2, DEF: 2, GK: 1 },
};
// Groups shapes under a <select> so the coach can find "9-a-side" etc. at a
// glance instead of scanning a flat list of every shape.
const SHAPE_GROUPS = [
  { label: "11-a-side", keys: ["4-3-3", "4-4-2", "3-4-3", "3-5-2"] },
  { label: "10-a-side", keys: ["4-3-2", "3-4-2", "4-2-3", "3-3-3"] },
  { label: "9-a-side", keys: ["3-3-2", "3-2-3", "2-3-3"] },
  { label: "8-a-side", keys: ["3-3-1", "3-2-2", "2-3-2", "2-2-3"] },
];
// Position abbreviation shown under each player's name — e.g. LW/ST/RW for
// a 3-forward line, CB/LB/RB for a 4-back line. Purely cosmetic labeling;
// the coach still just picks who fills which slot.
const POSITION_LABELS = {
  "4-3-3": { FWD: ["LW", "ST", "RW"], MID: ["CM", "CDM", "CM"], DEF: ["LB", "CB", "CB", "RB"], GK: ["GK"] },
  "4-4-2": { FWD: ["ST", "ST"], MID: ["LM", "CM", "CM", "RM"], DEF: ["LB", "CB", "CB", "RB"], GK: ["GK"] },
  "3-4-3": { FWD: ["LW", "ST", "RW"], MID: ["LM", "CM", "CM", "RM"], DEF: ["CB", "CB", "CB"], GK: ["GK"] },
  "3-5-2": { FWD: ["ST", "ST"], MID: ["LM", "CM", "CDM", "CM", "RM"], DEF: ["CB", "CB", "CB"], GK: ["GK"] },
  "4-3-2": { FWD: ["ST", "ST"], MID: ["LM", "CM", "RM"], DEF: ["LB", "CB", "CB", "RB"], GK: ["GK"] },
  "3-4-2": { FWD: ["ST", "ST"], MID: ["LM", "CM", "CM", "RM"], DEF: ["CB", "CB", "CB"], GK: ["GK"] },
  "4-2-3": { FWD: ["LW", "ST", "RW"], MID: ["CM", "CM"], DEF: ["LB", "CB", "CB", "RB"], GK: ["GK"] },
  "3-3-3": { FWD: ["LW", "ST", "RW"], MID: ["LM", "CM", "RM"], DEF: ["CB", "CB", "CB"], GK: ["GK"] },
  "3-3-2": { FWD: ["ST", "ST"], MID: ["LM", "CM", "RM"], DEF: ["LB", "CB", "RB"], GK: ["GK"] },
  "3-2-3": { FWD: ["LW", "ST", "RW"], MID: ["CM", "CM"], DEF: ["LB", "CB", "RB"], GK: ["GK"] },
  "2-3-3": { FWD: ["LW", "ST", "RW"], MID: ["LM", "CM", "RM"], DEF: ["CB", "CB"], GK: ["GK"] },
  "3-3-1": { FWD: ["ST"], MID: ["LM", "CM", "RM"], DEF: ["LB", "CB", "RB"], GK: ["GK"] },
  "3-2-2": { FWD: ["ST", "ST"], MID: ["CM", "CM"], DEF: ["LB", "CB", "RB"], GK: ["GK"] },
  "2-3-2": { FWD: ["ST", "ST"], MID: ["LM", "CM", "RM"], DEF: ["CB", "CB"], GK: ["GK"] },
  "2-2-3": { FWD: ["LW", "ST", "RW"], MID: ["CM", "CM"], DEF: ["CB", "CB"], GK: ["GK"] },
};

// Evenly spaces `count` slots across the pitch width (as % from left),
// staying well clear of the edges.
function slotXs(count) {
  if (count <= 1) return [50];
  const margin = 14;
  const span = 100 - margin * 2;
  return Array.from({ length: count }, (_, i) => margin + (span * i) / (count - 1));
}

// Builds the row → slots → athlete structure the poster renders from,
// given the current shape, the coach's slot assignments, and the pool of
// athletes those assignments are allowed to reference.
function buildRowsData(shapeKey, slotAssignments, pool) {
  const shapeRows = SHAPES[shapeKey] || SHAPES["4-3-3"];
  const labels = POSITION_LABELS[shapeKey] || POSITION_LABELS["4-3-3"];
  return ROWS_ORDER.filter((row) => (shapeRows[row] || 0) > 0).map((row) => {
    const count = shapeRows[row];
    const xs = slotXs(count);
    const items = Array.from({ length: count }, (_, i) => {
      const athleteId = slotAssignments[`${row}-${i}`];
      const athlete = athleteId ? pool.find((a) => a._id === athleteId) : null;
      return { slot: i, x: xs[i], label: labels[row]?.[i] || row, athlete: athlete || null };
    });
    return { row, y: ROW_Y[row], items };
  });
}

function PlayerToken({ athlete, label }) {
  return (
    <div className="pitch-token">
      <span className="pitch-token-photo-wrap">
        <img
          src={athlete.photoUrl ? resolveFileUrl(athlete.photoUrl) : "https://placehold.co/60x60?text=Photo"}
          alt={athlete.fullName}
        />
      </span>
      <span className="pitch-token-labelbox">
        <span className="pitch-token-name">{athlete.fullName}</span>
        <span className="pitch-token-position">{label}</span>
      </span>
    </div>
  );
}

// The whole poster — club crest/title header, the pitch itself, the
// substitutes list, and a footer strip — captured together by html2canvas
// so "Save as JPG/PNG" produces something postable, not just a bare green
// rectangle.
function PitchBoard({ posterRef, team, formationName, rowsData, subAthletes }) {
  return (
    <div className="formation-poster" ref={posterRef}>
      <div className="formation-poster-header">
        <img src="/icon-192.png" alt="" className="formation-poster-crest" />
        <div className="formation-poster-titles">
          <div className="formation-poster-club">Countryside Football</div>
          <div className="formation-poster-team">{team}</div>
        </div>
      </div>
      {formationName && <div className="formation-poster-subtitle">{formationName}</div>}

      <div className="pitch-board">
        <div className="pitch-outline" />
        <div className="pitch-halfway-line" />
        <div className="pitch-center-circle" />
        <div className="pitch-center-spot" />
        <div className="pitch-box pitch-box-top" />
        <div className="pitch-box pitch-box-bottom" />
        <div className="pitch-spot pitch-spot-top" />
        <div className="pitch-spot pitch-spot-bottom" />
        {rowsData.map(({ row, y, items }) => (
          <div key={row} className="pitch-row" style={{ top: `${y}%` }}>
            {items.map((item) =>
              item.athlete ? (
                <PlayerToken key={item.athlete._id} athlete={item.athlete} label={item.label} />
              ) : (
                <div key={item.slot} className="pitch-token">
                  <span className="pitch-token-photo-wrap">
                    <div className="pitch-token-empty" />
                  </span>
                </div>
              )
            )}
          </div>
        ))}
      </div>

      {subAthletes.length > 0 && (
        <div className="formation-subs">
          <p className="formation-subs-title">Substitutes</p>
          <ul className="formation-subs-list">
            {subAthletes.map((a) => (
              <li key={a._id}>{a.fullName}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="formation-poster-footer">Countryside Football ID Verify</div>
    </div>
  );
}

export default function FormationManager({ team }) {
  const [formations, setFormations] = useState([]);
  const [lineups, setLineups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [mode, setMode] = useState("list"); // "list" | "board"
  const [editingId, setEditingId] = useState(null);
  const [formationName, setFormationName] = useState("");
  const [shape, setShape] = useState("4-3-3");
  const [selectedLineupId, setSelectedLineupId] = useState("");
  const [slotAssignments, setSlotAssignments] = useState({}); // { "ROW-slotIndex": athleteId }
  // Athletes from a formation's ORIGINAL positions that no longer appear in
  // the currently-selected squad list (e.g. it changed later) — kept around
  // just so an already-assigned player still shows up instead of silently
  // vanishing from the poster when reopened for edit.
  const [extraAthletes, setExtraAthletes] = useState([]);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(null); // null | "jpg" | "png"
  const posterRef = useRef(null);

  useEffect(() => {
    if (team) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team]);

  const load = async () => {
    setLoading(true);
    try {
      const [formationsRes, lineupsRes] = await Promise.all([
        api.get("/coach/formations", { params: { team } }),
        api.get("/coach/lineups", { params: { team } }),
      ]);
      setFormations(formationsRes.data);
      setLineups(lineupsRes.data);
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const selectedLineup = lineups.find((l) => l._id === selectedLineupId);
  // Only players from the chosen squad list (role "PLAYER") can be placed —
  // a formation can no longer be built from the full team roster directly.
  const basePool = (selectedLineup?.athletes || [])
    .map((item) => item.athleteId)
    .filter((a) => a && (a.role || "PLAYER") === "PLAYER");
  const pool = [...basePool, ...extraAthletes.filter((a) => !basePool.some((b) => b._id === a._id))];

  const assignedIds = new Set(Object.values(slotAssignments).filter(Boolean));

  const startNew = () => {
    if (lineups.length === 0) {
      alert("Create a squad list first — a formation can only use players who are already in one.");
      return;
    }
    setEditingId(null);
    setFormationName("");
    setShape("4-3-3");
    setSelectedLineupId(lineups[0]._id);
    setSlotAssignments({});
    setExtraAthletes([]);
    setMode("board");
  };

  const openFormation = (f) => {
    setEditingId(f._id);
    setFormationName(f.name);
    setShape(f.shape && SHAPES[f.shape] ? f.shape : "4-3-3");
    setSelectedLineupId(
      (f.sourceLineup && lineups.some((l) => l._id === f.sourceLineup) && f.sourceLineup) ||
        lineups[0]?._id ||
        ""
    );
    const assignments = {};
    (f.positions || []).forEach((p) => {
      if (p.row && p.slot !== undefined && p.slot !== null) {
        assignments[`${p.row}-${p.slot}`] = p.athleteId?._id || p.athleteId;
      }
    });
    setSlotAssignments(assignments);
    setExtraAthletes((f.positions || []).map((p) => p.athleteId).filter((a) => a && a._id));
    setMode("board");
  };

  const backToList = () => {
    setMode("list");
    setEditingId(null);
    setSlotAssignments({});
    setExtraAthletes([]);
    setFormationName("");
  };

  const changeShape = (newShape) => {
    if (Object.keys(slotAssignments).length > 0) {
      if (!confirm("Changing the formation shape clears the players already assigned to slots. Continue?")) return;
    }
    setShape(newShape);
    setSlotAssignments({});
  };

  const changeLineup = (id) => {
    if (Object.keys(slotAssignments).length > 0) {
      if (!confirm("Switching squad lists clears the players already assigned to slots. Continue?")) return;
    }
    setSelectedLineupId(id);
    setSlotAssignments({});
    setExtraAthletes([]);
  };

  const assignSlot = (row, slotIndex, athleteId) => {
    setSlotAssignments((prev) => {
      const next = { ...prev };
      const key = `${row}-${slotIndex}`;
      if (!athleteId) delete next[key];
      else next[key] = athleteId;
      return next;
    });
  };

  const rowsData = buildRowsData(shape, slotAssignments, pool);
  const filledCount = Object.keys(slotAssignments).length;
  const subAthletes = pool.filter((a) => !assignedIds.has(a._id));

  const saveFormation = async () => {
    if (!formationName.trim()) {
      alert("Please enter a name for this formation");
      return;
    }
    if (!selectedLineupId) {
      alert("Please choose a squad list first");
      return;
    }
    const builtPositions = [];
    rowsData.forEach(({ row, y, items }) => {
      items.forEach((item) => {
        if (item.athlete) {
          builtPositions.push({ athleteId: item.athlete._id, row, slot: item.slot, x: item.x, y });
        }
      });
    });
    if (builtPositions.length === 0) {
      alert("Assign at least one player to a slot first");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        team,
        name: formationName,
        shape,
        sourceLineup: selectedLineupId,
        positions: builtPositions,
      };
      if (editingId) {
        await api.put(`/coach/formation/${editingId}`, payload);
      } else {
        await api.post("/coach/formation", payload);
      }
      await load();
      backToList();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to save formation");
    } finally {
      setSaving(false);
    }
  };

  const deleteFormation = async (id) => {
    if (!confirm("Delete this formation?")) return;
    try {
      await api.delete(`/coach/formation/${id}`);
      load();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to delete formation");
    }
  };

  // Captures the whole poster (header + pitch + footer), not just the pitch
  // itself, composed onto a fixed portrait (4:5) frame so the saved image is
  // always ready to post as-is. PNG is lossless (bigger file, crisper
  // edges/text) — JPG is smaller and fine for quick sharing.
  const exportImage = async (format) => {
    if (!posterRef.current) return;
    setExporting(format);
    try {
      await exportPosterAsImage(posterRef.current, {
        filename: formationName || "formation",
        format,
        backgroundColor: "#0a1830",
      });
    } catch (err) {
      console.error(err);
      alert(`Couldn't export the formation as a ${format.toUpperCase()}. Please try again.`);
    } finally {
      setExporting(null);
    }
  };

  if (!team) return <p className="help-text">Choose a team first.</p>;
  if (loading) return <p>Loading…</p>;
  if (error) return <p className="error-text">{error}</p>;

  if (mode === "board") {
    return (
      <div>
        <div className="lineup-header">
          <h3>{editingId ? "Edit formation" : "New formation"} — {team}</h3>
          <button className="link-btn" onClick={backToList}>
            ← Back to formations
          </button>
        </div>

        <div className="formation-setup-row">
          <div className="field">
            <label>Formation name</label>
            <input
              type="text"
              placeholder="e.g., vs Angkor FC — Starting XI"
              value={formationName}
              onChange={(e) => setFormationName(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Squad list</label>
            <select value={selectedLineupId} onChange={(e) => changeLineup(e.target.value)}>
              {lineups.map((l) => (
                <option key={l._id} value={l._id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Formation shape</label>
            <select value={shape} onChange={(e) => changeShape(e.target.value)}>
              {SHAPE_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.keys.map((key) => (
                    <option key={key} value={key}>
                      {key}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        </div>

        <div className="form-actions" style={{ marginBottom: 14 }}>
          <button className="btn btn-primary" onClick={saveFormation} disabled={saving}>
            {saving ? "Saving…" : "Save formation"}
          </button>
          <button
            className="btn btn-outline"
            style={{ color: "var(--navy)", borderColor: "var(--navy)" }}
            onClick={() => exportImage("jpg")}
            disabled={!!exporting}
          >
            {exporting === "jpg" ? "Exporting…" : "Save as JPG"}
          </button>
          <button
            className="btn btn-outline"
            style={{ color: "var(--navy)", borderColor: "var(--navy)" }}
            onClick={() => exportImage("png")}
            disabled={!!exporting}
          >
            {exporting === "png" ? "Exporting…" : "Save as PNG"}
          </button>
        </div>

        <p className="help-text" style={{ marginBottom: 10 }}>
          Assign a player from "{selectedLineup?.name || "—"}" to each slot below ({filledCount} placed).
        </p>

        <div className="formation-slot-groups">
          {ROWS_ORDER.filter((row) => (SHAPES[shape][row] || 0) > 0).map((row) => {
            const count = SHAPES[shape][row];
            const labels = POSITION_LABELS[shape]?.[row] || [];
            return (
              <div key={row} className="formation-slot-group">
                <p className="formation-slot-group-title">{ROW_LABELS[row]}</p>
                <div className="formation-slot-row">
                  {Array.from({ length: count }, (_, i) => {
                    const current = slotAssignments[`${row}-${i}`] || "";
                    return (
                      <label key={i} className="formation-slot-field">
                        <span className="formation-slot-field-label">{labels[i] || row}</span>
                        <select
                          className="formation-slot-select"
                          value={current}
                          onChange={(e) => assignSlot(row, i, e.target.value)}
                        >
                          <option value="">— empty —</option>
                          {pool
                            .filter((a) => a._id === current || !assignedIds.has(a._id))
                            .map((a) => (
                              <option key={a._id} value={a._id}>
                                {a.fullName}
                              </option>
                            ))}
                        </select>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        {pool.length === 0 && (
          <p className="help-text">This squad list has no players (role "PLAYER") to place.</p>
        )}

        <PitchBoard
          posterRef={posterRef}
          team={team}
          formationName={formationName}
          rowsData={rowsData}
          subAthletes={subAthletes}
        />
      </div>
    );
  }

  return (
    <div>
      <div className="lineup-header">
        <h3>Formations — {team}</h3>
        <button className="btn btn-primary" onClick={startNew} disabled={lineups.length === 0}>
          + New formation
        </button>
      </div>

      {lineups.length === 0 && (
        <p className="help-text">
          Create a squad list first (Squad list tab) — a formation can only place players who are already in one.
        </p>
      )}

      {formations.length === 0 ? (
        <p>No formations yet. Create one to lay out your starting XI on the pitch.</p>
      ) : (
        <div className="lineups-list">
          {formations.map((f) => (
            <div key={f._id} className="lineup-card card">
              <div className="lineup-header-card">
                <h4>{f.name}</h4>
                <div className="dash-actions">
                  <button className="link-btn" onClick={() => openFormation(f)}>
                    Open
                  </button>
                  <button className="btn btn-danger" onClick={() => deleteFormation(f._id)}>
                    Delete
                  </button>
                </div>
              </div>
              <p className="lineup-count">
                {f.shape || "4-3-3"} · {f.positions.length} player{f.positions.length !== 1 ? "s" : ""} placed
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import html2canvas from "html2canvas";
import api from "../api/axios";
import { resolveFileUrl } from "../utils/fileUrl";

function PlayerToken({ item, index, onDrag }) {
  const a = item.athleteId;
  const tokenRef = useRef(null);

  const handlePointerDown = (e) => {
    e.preventDefault();
    const board = tokenRef.current?.closest(".pitch-board");
    if (!board) return;
    const boardRect = board.getBoundingClientRect();

    const move = (clientX, clientY) => {
      let x = ((clientX - boardRect.left) / boardRect.width) * 100;
      let y = ((clientY - boardRect.top) / boardRect.height) * 100;
      x = Math.max(3, Math.min(97, x));
      y = Math.max(3, Math.min(97, y));
      onDrag(item.athleteId._id, x, y);
    };

    const onMouseMove = (ev) => move(ev.clientX, ev.clientY);
    const onTouchMove = (ev) => {
      const t = ev.touches[0];
      if (t) move(t.clientX, t.clientY);
    };
    const stop = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", stop);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", stop);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", stop);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", stop);
  };

  if (!a) return null;

  return (
    <div
      ref={tokenRef}
      className="pitch-token"
      style={{ left: `${item.x}%`, top: `${item.y}%` }}
      onMouseDown={handlePointerDown}
      onTouchStart={handlePointerDown}
    >
      <span className="pitch-token-photo-wrap">
        <img
          src={a.photoUrl ? resolveFileUrl(a.photoUrl) : "https://placehold.co/60x60?text=Photo"}
          alt={a.fullName}
          draggable={false}
        />
        <span className="pitch-token-num">{index}</span>
      </span>
      <span className="pitch-token-name">{a.fullName}</span>
    </div>
  );
}

// The whole poster — club crest/title header, the pitch itself, and a
// footer strip — captured together by html2canvas so "Save as JPG" produces
// something postable, not just a bare green rectangle.
function PitchBoard({ boardRef, posterRef, team, formationName, positions, onDrag }) {
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

      <div className="pitch-board" ref={boardRef}>
        <div className="pitch-halfway-line" />
        <div className="pitch-center-circle" />
        <div className="pitch-spot pitch-spot-top" />
        <div className="pitch-spot pitch-spot-bottom" />
        <div className="pitch-box pitch-box-top" />
        <div className="pitch-box pitch-box-bottom" />
        <div className="pitch-goal pitch-goal-top" />
        <div className="pitch-goal pitch-goal-bottom" />
        {positions.map((item, idx) =>
          item.athleteId ? (
            <PlayerToken key={item.athleteId._id} item={item} index={idx + 1} onDrag={onDrag} />
          ) : null
        )}
      </div>

      <div className="formation-poster-footer">Countryside Football ID Verify</div>
    </div>
  );
}

export default function FormationManager({ team, athletes }) {
  const [formations, setFormations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [mode, setMode] = useState("list"); // "list" | "board"
  const [editingId, setEditingId] = useState(null);
  const [formationName, setFormationName] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [positions, setPositions] = useState([]); // [{ athleteId: {...} | id, x, y }]
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const boardRef = useRef(null);
  const posterRef = useRef(null);

  const players = athletes.filter((a) => (a.role || "PLAYER") === "PLAYER");

  useEffect(() => {
    if (team) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team]);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/coach/formations", { params: { team } });
      setFormations(data);
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load formations");
    } finally {
      setLoading(false);
    }
  };

  const startNew = () => {
    setEditingId(null);
    setFormationName("");
    setPositions([]);
    setPickerOpen(true);
    setMode("board");
  };

  const openFormation = (f) => {
    setEditingId(f._id);
    setFormationName(f.name);
    setPositions(f.positions.filter((p) => p.athleteId));
    setPickerOpen(false);
    setMode("board");
  };

  const backToList = () => {
    setMode("list");
    setEditingId(null);
    setPositions([]);
    setFormationName("");
  };

  const isSelected = (athleteId) => positions.some((p) => p.athleteId?._id === athleteId);

  const togglePlayer = (athlete) => {
    if (isSelected(athlete._id)) {
      // Only remove that one player — everyone else keeps the spot the coach
      // already dragged them to.
      setPositions((prev) => prev.filter((p) => p.athleteId?._id !== athlete._id));
      return;
    }
    setPositions((prev) => {
      // A freshly-checked player starts in a staging strip near the bottom
      // rather than re-running the auto-layout — recomputing everyone's spot
      // here would undo any dragging already done for the rest of the squad.
      const idx = prev.length;
      const col = idx % 6;
      const row = Math.floor(idx / 6);
      const x = 12 + col * 15;
      const y = Math.min(96, 94 - row * 8);
      return [...prev, { athleteId: athlete, x, y }];
    });
  };

  const handleDrag = (athleteId, x, y) => {
    setPositions((prev) => prev.map((p) => (p.athleteId?._id === athleteId ? { ...p, x, y } : p)));
  };

  const saveFormation = async () => {
    if (!formationName.trim()) {
      alert("Please enter a name for this formation");
      return;
    }
    if (positions.length === 0) {
      alert("Select at least one player first");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        team,
        name: formationName,
        positions: positions.map((p) => ({ athleteId: p.athleteId._id || p.athleteId, x: p.x, y: p.y })),
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
  // itself, so the JPG is ready to post as-is.
  const exportJpg = async () => {
    if (!posterRef.current) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(posterRef.current, {
        useCORS: true,
        scale: 2,
        backgroundColor: "#0a1830",
      });
      const link = document.createElement("a");
      link.download = `${formationName || "formation"}.jpg`;
      link.href = canvas.toDataURL("image/jpeg", 0.95);
      link.click();
    } catch (err) {
      console.error(err);
      alert("Couldn't export the formation as a JPG. Please try again.");
    } finally {
      setExporting(false);
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

        <div className="field" style={{ maxWidth: 420 }}>
          <label>Formation name</label>
          <input
            type="text"
            placeholder="e.g., vs Angkor FC — Starting XI"
            value={formationName}
            onChange={(e) => setFormationName(e.target.value)}
          />
        </div>

        <div className="form-actions" style={{ marginBottom: 14 }}>
          <button className="btn btn-outline" style={{ color: "var(--navy)", borderColor: "var(--navy)" }} onClick={() => setPickerOpen((v) => !v)}>
            {pickerOpen ? "Hide player list" : `Players (${positions.length})`}
          </button>
          <button className="btn btn-primary" onClick={saveFormation} disabled={saving}>
            {saving ? "Saving…" : "Save formation"}
          </button>
          <button className="btn btn-outline" style={{ color: "var(--navy)", borderColor: "var(--navy)" }} onClick={exportJpg} disabled={exporting}>
            {exporting ? "Exporting…" : "Save as JPG"}
          </button>
        </div>

        {pickerOpen && (
          <div className="athletes-select" style={{ marginBottom: 16 }}>
            {players.map((a) => (
              <label key={a._id} className="athlete-checkbox">
                <input type="checkbox" checked={isSelected(a._id)} onChange={() => togglePlayer(a)} />
                <span className="checkbox-label">
                  <img
                    src={a.photoUrl ? resolveFileUrl(a.photoUrl) : "https://placehold.co/50x50?text=Photo"}
                    alt={a.fullName}
                    className="small-photo"
                  />
                  {a.fullName}
                </span>
              </label>
            ))}
            {players.length === 0 && <p className="help-text">No players (role "PLAYER") found on this team.</p>}
          </div>
        )}

        <p className="help-text" style={{ marginBottom: 10 }}>
          Drag any player to move them on the pitch.
        </p>
        <PitchBoard
          boardRef={boardRef}
          posterRef={posterRef}
          team={team}
          formationName={formationName}
          positions={positions}
          onDrag={handleDrag}
        />
      </div>
    );
  }

  return (
    <div>
      <div className="lineup-header">
        <h3>Formations — {team}</h3>
        <button className="btn btn-primary" onClick={startNew}>
          + New formation
        </button>
      </div>

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
              <p className="lineup-count">{f.positions.length} player{f.positions.length !== 1 ? "s" : ""} placed</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

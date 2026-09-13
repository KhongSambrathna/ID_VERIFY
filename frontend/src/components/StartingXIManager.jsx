import { useEffect, useRef, useState } from "react";
import api from "../api/axios";
import { resolveFileUrl } from "../utils/fileUrl";
import { exportPosterAsImage } from "../utils/exportPoster";
import { isPlayerOnTeam, jerseyNumberForTeam } from "../utils/rolesForTeam";

// This club mostly plays 8, 9, 10, or 11-a-side — this only changes the
// "usually N players" hint below, it never caps how many starters can be
// picked.
const SQUAD_SIZES = [11, 10, 9, 8];

// The card-grid "Starting XI" matchday announcement — club vs opponent
// header, starter photo cards, substitutes list. Deliberately separate
// from FormationManager's tactical pitch diagram; this is just a lineup
// announcement graphic, not a positional layout.
function StartingXIPoster({ posterRef, team, name, opponent, competition, starterAthletes, subAthletes }) {
  return (
    <div className="startingxi-poster" ref={posterRef}>
      <div className="startingxi-header">
        <div className="startingxi-matchup">
          {team} <span className="startingxi-vs">vs</span> {opponent || "Opponent"}
        </div>
        {name && <div className="startingxi-subtitle">{name}</div>}
      </div>

      <div className="startingxi-body">
        <div className="startingxi-grid">
          {starterAthletes.map((a) => (
            <div key={a._id} className="startingxi-card">
              <img
                src={a.photoUrl ? resolveFileUrl(a.photoUrl) : "https://placehold.co/200x260?text=Photo"}
                alt={a.fullName}
              />
              <span className="startingxi-card-name">
                {jerseyNumberForTeam(a, team) !== null && `#${jerseyNumberForTeam(a, team)} `}
                {a.fullName}
              </span>
            </div>
          ))}
          {starterAthletes.length === 0 && <p className="startingxi-empty">No starters selected yet.</p>}
        </div>

        <div className="startingxi-side">
          <div className="startingxi-side-title">Starting XI</div>
          {subAthletes.length > 0 && (
            <>
              <p className="startingxi-subs-title">Substitutes</p>
              <ul className="startingxi-subs-list">
                {subAthletes.map((a) => (
                  <li key={a._id}>
                    {jerseyNumberForTeam(a, team) !== null && `#${jerseyNumberForTeam(a, team)} `}
                    {a.fullName}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      <div className="startingxi-footer">{competition || "Countryside Football ID Verify"}</div>
    </div>
  );
}

export default function StartingXIManager({ team }) {
  const [list, setList] = useState([]);
  const [lineups, setLineups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [mode, setMode] = useState("list"); // "list" | "board"
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState("");
  const [opponent, setOpponent] = useState("");
  const [competition, setCompetition] = useState("");
  const [squadSize, setSquadSize] = useState(11);
  const [selectedLineupId, setSelectedLineupId] = useState("");
  const [starterIds, setStarterIds] = useState([]);
  // Same safety net as FormationManager — keeps an already-picked player
  // visible even if they later fall out of the currently-selected squad list.
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
      const [listRes, lineupsRes] = await Promise.all([
        api.get("/coach/startingxis", { params: { team } }),
        api.get("/coach/lineups", { params: { team } }),
      ]);
      setList(listRes.data);
      setLineups(lineupsRes.data);
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const selectedLineup = lineups.find((l) => l._id === selectedLineupId);
  // Only players from the chosen squad list (role "PLAYER") are eligible —
  // same rule as Formation, so a Starting XI can't include an unregistered
  // or unrelated athlete.
  const basePool = (selectedLineup?.athletes || [])
    .map((item) => item.athleteId)
    .filter((a) => a && isPlayerOnTeam(a, team));
  const pool = [...basePool, ...extraAthletes.filter((a) => !basePool.some((b) => b._id === a._id))];

  const starterAthletes = starterIds.map((id) => pool.find((a) => a._id === id)).filter(Boolean);
  const subAthletes = pool.filter((a) => !starterIds.includes(a._id));

  const startNew = () => {
    if (lineups.length === 0) {
      alert("Create a squad list first — a Starting XI can only use players who are already in one.");
      return;
    }
    setEditingId(null);
    setName("");
    setOpponent("");
    setCompetition("");
    setSquadSize(11);
    setSelectedLineupId(lineups[0]._id);
    setStarterIds([]);
    setExtraAthletes([]);
    setMode("board");
  };

  const openItem = (item) => {
    setEditingId(item._id);
    setName(item.name);
    setOpponent(item.opponent || "");
    setCompetition(item.competition || "");
    setSquadSize(item.squadSize || 11);
    setSelectedLineupId(
      (item.sourceLineup && lineups.some((l) => l._id === item.sourceLineup) && item.sourceLineup) ||
        lineups[0]?._id ||
        ""
    );
    setStarterIds((item.starters || []).map((a) => a?._id || a).filter(Boolean));
    setExtraAthletes([...(item.starters || []), ...(item.substitutes || [])].filter((a) => a && a._id));
    setMode("board");
  };

  const backToList = () => {
    setMode("list");
    setEditingId(null);
    setStarterIds([]);
    setExtraAthletes([]);
    setName("");
    setOpponent("");
    setCompetition("");
    setSquadSize(11);
  };

  const changeLineup = (id) => {
    if (starterIds.length > 0) {
      if (!confirm("Switching squad lists clears the players already picked. Continue?")) return;
    }
    setSelectedLineupId(id);
    setStarterIds([]);
    setExtraAthletes([]);
  };

  const toggleStarter = (athleteId) => {
    setStarterIds((prev) =>
      prev.includes(athleteId) ? prev.filter((id) => id !== athleteId) : [...prev, athleteId]
    );
  };

  const saveItem = async () => {
    if (!name.trim()) {
      alert("Please enter a name for this Starting XI");
      return;
    }
    if (!selectedLineupId) {
      alert("Please choose a squad list first");
      return;
    }
    if (starterIds.length === 0) {
      alert("Pick at least one starter first");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        team,
        name,
        opponent,
        competition,
        squadSize,
        sourceLineup: selectedLineupId,
        starters: starterIds,
        substitutes: subAthletes.map((a) => a._id),
      };
      if (editingId) {
        await api.put(`/coach/startingxi/${editingId}`, payload);
      } else {
        await api.post("/coach/startingxi", payload);
      }
      await load();
      backToList();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const deleteItem = async (id) => {
    if (!confirm("Delete this Starting XI?")) return;
    try {
      await api.delete(`/coach/startingxi/${id}`);
      load();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to delete");
    }
  };

  // Captures the whole poster (header + card grid + side banner + footer),
  // composed onto a fixed portrait (4:5) frame so the saved image is always
  // ready to post as-is. PNG is lossless (bigger file, crisper edges/text)
  // — JPG is smaller and fine for quick sharing.
  const exportImage = async (format) => {
    if (!posterRef.current) return;
    setExporting(format);
    try {
      await exportPosterAsImage(posterRef.current, {
        filename: name || "starting-xi",
        format,
        backgroundColor: "#0a1830",
      });
    } catch (err) {
      console.error(err);
      alert(`Couldn't export the Starting XI as a ${format.toUpperCase()}. Please try again.`);
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
          <h3>{editingId ? "Edit Starting XI" : "New Starting XI"} — {team}</h3>
          <button className="link-btn" onClick={backToList}>
            ← Back to Starting XIs
          </button>
        </div>

        <div className="formation-setup-row">
          <div className="field">
            <label>Name</label>
            <input
              type="text"
              placeholder="e.g., vs Angkor FC — Round 5"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Opponent</label>
            <input
              type="text"
              placeholder="e.g., Angkor FC"
              value={opponent}
              onChange={(e) => setOpponent(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Competition (optional)</label>
            <input
              type="text"
              placeholder="e.g., Cambodian League 2A"
              value={competition}
              onChange={(e) => setCompetition(e.target.value)}
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
            <label>Match format</label>
            <select value={squadSize} onChange={(e) => setSquadSize(Number(e.target.value))}>
              {SQUAD_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}-a-side
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-actions" style={{ marginBottom: 14 }}>
          <button className="btn btn-primary" onClick={saveItem} disabled={saving}>
            {saving ? "Saving…" : "Save Starting XI"}
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

        <p className={`squad-count-note ${starterIds.length === squadSize ? "ok" : "warn"}`}>
          {starterIds.length === squadSize ? "✓" : "⚠"} {starterIds.length} starter
          {starterIds.length !== 1 ? "s" : ""} selected — a {squadSize}-a-side Starting XI is usually {squadSize}.
        </p>

        <div className="athletes-select" style={{ marginBottom: 16 }}>
          {pool.map((a) => (
            <label key={a._id} className="athlete-checkbox">
              <input type="checkbox" checked={starterIds.includes(a._id)} onChange={() => toggleStarter(a._id)} />
              <span className="checkbox-label">
                <img
                  src={a.photoUrl ? resolveFileUrl(a.photoUrl) : "https://placehold.co/50x50?text=Photo"}
                  alt={a.fullName}
                  className="small-photo"
                />
                {jerseyNumberForTeam(a, team) !== null && `#${jerseyNumberForTeam(a, team)} `}
                {a.fullName}
              </span>
            </label>
          ))}
          {pool.length === 0 && <p className="help-text">This squad list has no players (role "PLAYER").</p>}
        </div>

        <p className="help-text" style={{ marginBottom: 10 }}>
          Everyone checked above becomes a starter card; everyone else in "{selectedLineup?.name || "—"}" is
          listed as a substitute automatically.
        </p>

        <StartingXIPoster
          posterRef={posterRef}
          team={team}
          name={name}
          opponent={opponent}
          competition={competition}
          starterAthletes={starterAthletes}
          subAthletes={subAthletes}
        />
      </div>
    );
  }

  return (
    <div>
      <div className="lineup-header">
        <h3>Starting XI — {team}</h3>
        <button className="btn btn-primary" onClick={startNew} disabled={lineups.length === 0}>
          + New Starting XI
        </button>
      </div>

      {lineups.length === 0 && (
        <p className="help-text">
          Create a squad list first (Squad list tab) — a Starting XI can only place players who are already in
          one.
        </p>
      )}

      {list.length === 0 ? (
        <p>No Starting XI graphics yet. Create one to announce your lineup.</p>
      ) : (
        <div className="lineups-list">
          {list.map((item) => (
            <div key={item._id} className="lineup-card card">
              <div className="lineup-header-card">
                <h4>{item.name}</h4>
                <div className="dash-actions">
                  <button className="link-btn" onClick={() => openItem(item)}>
                    Open
                  </button>
                  <button className="btn btn-danger" onClick={() => deleteItem(item._id)}>
                    Delete
                  </button>
                </div>
              </div>
              <p className="lineup-count">
                vs {item.opponent || "—"} · {item.squadSize || 11}-a-side · {item.starters.length} starter
                {item.starters.length !== 1 ? "s" : ""} · {item.substitutes.length} sub
                {item.substitutes.length !== 1 ? "s" : ""}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

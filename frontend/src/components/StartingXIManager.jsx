import { useEffect, useRef, useState } from "react";
import api from "../api/axios";
import { resolveFileUrl } from "../utils/fileUrl";
import { exportPosterAsImage } from "../utils/exportPoster";
import { isPlayerOnTeam, jerseyNumberForTeam } from "../utils/rolesForTeam";
import { useLanguage } from "../i18n/LanguageContext";

// This club mostly plays 8, 9, 10, or 11-a-side — this only changes the
// "usually N players" hint below, it never caps how many starters can be
// picked.
const SQUAD_SIZES = [11, 10, 9, 8];

// The card-grid "Starting XI" matchday announcement — club vs opponent
// header, starter photo cards, substitutes list. Deliberately separate
// from FormationManager's tactical pitch diagram; this is just a lineup
// announcement graphic, not a positional layout.
function StartingXIPoster({ posterRef, team, name, opponent, competition, starterAthletes, subAthletes }) {
  const { t } = useLanguage();
  return (
    <div className="startingxi-poster" ref={posterRef}>
      <div className="startingxi-header">
        <div className="startingxi-matchup">
          {team} <span className="startingxi-vs">{t("startingXIManager.vs")}</span> {opponent || t("startingXIManager.opponentFallback")}
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
          {starterAthletes.length === 0 && <p className="startingxi-empty">{t("startingXIManager.noStartersYet")}</p>}
        </div>

        <div className="startingxi-side">
          <div className="startingxi-side-title">{t("startingXIManager.startingXI")}</div>
          {subAthletes.length > 0 && (
            <>
              <p className="startingxi-subs-title">{t("startingXIManager.substitutes")}</p>
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
  const { t } = useLanguage();
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
      setError(err.response?.data?.message || t("common.failedToLoad"));
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
      alert(t("startingXIManager.needSquadFirst"));
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
      if (!confirm(t("startingXIManager.confirmChangeLineup"))) return;
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
      alert(t("startingXIManager.nameRequired"));
      return;
    }
    if (!selectedLineupId) {
      alert(t("startingXIManager.lineupRequired"));
      return;
    }
    if (starterIds.length === 0) {
      alert(t("startingXIManager.pickStarterFirst"));
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
      alert(err.response?.data?.message || t("startingXIManager.failedToSave"));
    } finally {
      setSaving(false);
    }
  };

  const deleteItem = async (id) => {
    if (!confirm(t("startingXIManager.confirmDelete"))) return;
    try {
      await api.delete(`/coach/startingxi/${id}`);
      load();
    } catch (err) {
      alert(err.response?.data?.message || t("startingXIManager.failedToDelete"));
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
      alert(
        `${t("startingXIManager.exportFailedPrefix")} ${format.toUpperCase()}. ${t("startingXIManager.exportFailedSuffix")}`
      );
    } finally {
      setExporting(null);
    }
  };

  if (!team) return <p className="help-text">{t("startingXIManager.chooseTeamFirst")}</p>;
  if (loading) return <p>{t("common.loading")}</p>;
  if (error) return <p className="error-text">{error}</p>;

  if (mode === "board") {
    return (
      <div>
        <div className="lineup-header">
          <h3>{editingId ? t("startingXIManager.editStartingXI") : t("startingXIManager.newStartingXI")} — {team}</h3>
          <button className="link-btn" onClick={backToList}>
            {t("startingXIManager.backToList")}
          </button>
        </div>

        <div className="formation-setup-row">
          <div className="field">
            <label>{t("common.name")}</label>
            <input
              type="text"
              placeholder={t("startingXIManager.namePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="field">
            <label>{t("startingXIManager.opponentLabel")}</label>
            <input
              type="text"
              placeholder={t("startingXIManager.opponentPlaceholder")}
              value={opponent}
              onChange={(e) => setOpponent(e.target.value)}
            />
          </div>
          <div className="field">
            <label>{t("startingXIManager.competitionLabel")}</label>
            <input
              type="text"
              placeholder={t("startingXIManager.competitionPlaceholder")}
              value={competition}
              onChange={(e) => setCompetition(e.target.value)}
            />
          </div>
          <div className="field">
            <label>{t("startingXIManager.squadListLabel")}</label>
            <select value={selectedLineupId} onChange={(e) => changeLineup(e.target.value)}>
              {lineups.map((l) => (
                <option key={l._id} value={l._id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>{t("startingXIManager.matchFormat")}</label>
            <select value={squadSize} onChange={(e) => setSquadSize(Number(e.target.value))}>
              {SQUAD_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}{t("startingXIManager.asideSuffix")}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-actions" style={{ marginBottom: 14 }}>
          <button className="btn btn-primary" onClick={saveItem} disabled={saving}>
            {saving ? t("common.saving") : t("startingXIManager.saveButton")}
          </button>
          <button
            className="btn btn-outline"
            style={{ color: "var(--navy)", borderColor: "var(--navy)" }}
            onClick={() => exportImage("jpg")}
            disabled={!!exporting}
          >
            {exporting === "jpg" ? t("startingXIManager.exporting") : t("startingXIManager.saveAsJpg")}
          </button>
          <button
            className="btn btn-outline"
            style={{ color: "var(--navy)", borderColor: "var(--navy)" }}
            onClick={() => exportImage("png")}
            disabled={!!exporting}
          >
            {exporting === "png" ? t("startingXIManager.exporting") : t("startingXIManager.saveAsPng")}
          </button>
        </div>

        <p className={`squad-count-note ${starterIds.length === squadSize ? "ok" : "warn"}`}>
          {starterIds.length === squadSize ? "✓" : "⚠"} {starterIds.length}{" "}
          {starterIds.length !== 1 ? t("startingXIManager.starterPlural") : t("startingXIManager.starterSingular")} —{" "}
          {t("startingXIManager.usualPrefix")} {squadSize}{t("startingXIManager.asideSuffix")}{" "}
          {t("startingXIManager.usualSuffix")} {squadSize}.
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
          {pool.length === 0 && <p className="help-text">{t("startingXIManager.noPlayersInList")}</p>}
        </div>

        <p className="help-text" style={{ marginBottom: 10 }}>
          {t("startingXIManager.everyoneCheckedPrefix")} "{selectedLineup?.name || "—"}"{" "}
          {t("startingXIManager.everyoneCheckedSuffix")}
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
        <h3>{t("startingXIManager.startingXI")} — {team}</h3>
        <button className="btn btn-primary" onClick={startNew} disabled={lineups.length === 0}>
          {t("startingXIManager.newButton")}
        </button>
      </div>

      {lineups.length === 0 && (
        <p className="help-text">
          {t("startingXIManager.needSquadListNote")}
        </p>
      )}

      {list.length === 0 ? (
        <p>{t("startingXIManager.noneYet")}</p>
      ) : (
        <div className="lineups-list">
          {list.map((item) => (
            <div key={item._id} className="lineup-card card">
              <div className="lineup-header-card">
                <h4>{item.name}</h4>
                <div className="dash-actions">
                  <button className="link-btn" onClick={() => openItem(item)}>
                    {t("startingXIManager.open")}
                  </button>
                  <button className="btn btn-danger" onClick={() => deleteItem(item._id)}>
                    {t("common.delete")}
                  </button>
                </div>
              </div>
              <p className="lineup-count">
                {t("startingXIManager.vs")} {item.opponent || "—"} · {item.squadSize || 11}
                {t("startingXIManager.asideSuffix")} · {item.starters.length}{" "}
                {item.starters.length !== 1 ? t("startingXIManager.startersWord") : t("startingXIManager.starterWord")} ·{" "}
                {item.substitutes.length}{" "}
                {item.substitutes.length !== 1 ? t("startingXIManager.subsWord") : t("startingXIManager.subWord")}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

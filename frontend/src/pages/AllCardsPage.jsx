import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import html2canvas from "html2canvas";
import JSZip from "jszip";
import api from "../api/axios";
import IDCard from "../components/IDCard";

const ROLE_OPTIONS = ["PLAYER", "ASSISTAN COACH", "HEAD COACH", "TECHNICAL", "MEDIC"];

function sanitizeFilename(s) {
  return (s || "card")
    .toString()
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "_");
}

export default function AllCardsPage() {
  const [athletes, setAthletes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [teamFilter, setTeamFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [exportingPng, setExportingPng] = useState(false);
  const gridRef = useRef(null);

  useEffect(() => {
    api
      .get("/athletes")
      .then(({ data }) => setAthletes(data))
      .catch((err) => setError(err.response?.data?.message || "Failed to load athletes"))
      .finally(() => setLoading(false));
  }, []);

  // The API returns one row per team/role assignment (a person on 2 teams
  // is 2 rows). For printing, a person's several roles on the SAME team
  // belong on ONE card together ("PLAYER, ASSISTANT COACH") rather than as
  // separate cards, so group rows by (person, team) before rendering.
  const cards = useMemo(() => {
    const groups = new Map();
    athletes.forEach((a) => {
      const key = `${a._id}:${a.team}`;
      if (!groups.has(key)) {
        groups.set(key, { ...a, cardKey: key, roles: [] });
      }
      groups.get(key).roles.push(a.role);
    });
    return [...groups.values()].map((c) => ({ ...c, role: c.roles.join(", ") }));
  }, [athletes]);

  const teams = useMemo(
    () => [...new Set(cards.map((a) => a.team).filter(Boolean))].sort(),
    [cards]
  );

  const filtered = cards.filter((a) => {
    if (teamFilter !== "all" && a.team !== teamFilter) return false;
    if (roleFilter !== "all" && !a.roles.includes(roleFilter)) return false;
    return true;
  });

  // Captures every currently-filtered card as its own separate PNG (not one
  // combined image) — a single card downloads directly, multiple cards are
  // bundled into one ZIP so the browser isn't asked to save a pile of files
  // at once.
  const exportPng = async () => {
    if (!gridRef.current || filtered.length === 0) return;
    setExportingPng(true);
    try {
      const cardNodes = gridRef.current.querySelectorAll(".id-card");
      const count = Math.min(cardNodes.length, filtered.length);
      const files = [];

      for (let i = 0; i < count; i++) {
        const canvas = await html2canvas(cardNodes[i], {
          useCORS: true,
          scale: 3, // higher resolution than the on-screen card
          backgroundColor: "#ffffff",
        });
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
        if (!blob) continue;
        const athlete = filtered[i];
        const name = `${sanitizeFilename(athlete?.verifyId)}_${sanitizeFilename(athlete?.fullName)}.png`;
        files.push({ name, blob });
      }

      if (files.length === 0) {
        alert("Nothing to export.");
        return;
      }

      if (files.length === 1) {
        const url = URL.createObjectURL(files[0].blob);
        const link = document.createElement("a");
        link.download = files[0].name;
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
      } else {
        const zip = new JSZip();
        files.forEach(({ name, blob }) => zip.file(name, blob));
        const zipBlob = await zip.generateAsync({ type: "blob" });

        const nameParts = ["id-cards"];
        if (teamFilter !== "all") nameParts.push(teamFilter);
        if (roleFilter !== "all") nameParts.push(roleFilter);
        nameParts.push(new Date().toISOString().slice(0, 10));

        const url = URL.createObjectURL(zipBlob);
        const link = document.createElement("a");
        link.download = `${sanitizeFilename(nameParts.join("-"))}.zip`;
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error(err);
      alert("Couldn't export cards as PNG. Please try again.");
    } finally {
      setExportingPng(false);
    }
  };

  return (
    <div className="container" style={{ paddingBottom: 60 }}>
      <div className="dash-header no-print">
        <h2>All ID cards ({filtered.length})</h2>
        <div className="dash-actions">
          <Link to="/admin" className="link-btn">
            ← Back to dashboard
          </Link>
          <button className="btn btn-primary" onClick={() => window.print()}>
            Export / Print selected
          </button>
          <button
            className="btn btn-outline"
            style={{ color: "var(--navy)", borderColor: "var(--navy)" }}
            onClick={exportPng}
            disabled={exportingPng || filtered.length === 0}
          >
            {exportingPng ? "Exporting…" : "Export PNG"}
          </button>
        </div>
      </div>

      <div className="no-print filter-row">
        <div className="field" style={{ marginBottom: 0, minWidth: 180 }}>
          <label>Filter by team</label>
          <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
            <option value="all">All teams</option>
            {teams.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0, minWidth: 180 }}>
          <label>Filter by role</label>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="all">All roles</option>
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && <p>Loading…</p>}
      {error && <p className="error-text">{error}</p>}
      {!loading && !error && filtered.length === 0 && (
        <p>No athletes match this filter.</p>
      )}

      <div className="cards-grid" ref={gridRef}>
        {filtered.map((a) => (
          <IDCard key={a.cardKey} athlete={a} hideActions />
        ))}
      </div>
    </div>
  );
}

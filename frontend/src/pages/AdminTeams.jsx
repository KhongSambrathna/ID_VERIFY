import { useEffect, useMemo, useState } from "react";
import api from "../api/axios";
import { resolveFileUrl } from "../utils/fileUrl";
import DeleteForeverButton from "../components/DeleteForeverButton";
import { useLanguage } from "../i18n/LanguageContext";
import CoachPermsCard, { PERM_KEYS } from "../components/CoachPermsCard";

const PERM_DEFAULTS = { athletes: true, debts: true, tournaments: true, invites: false, jersey: true };
const permsOf = (team) => ({ ...PERM_DEFAULTS, ...(team.coachPerms || {}) });
const saved = (k, d) => {
  try {
    return JSON.parse(sessionStorage.getItem(`adminTeams.${k}`)) ?? d;
  } catch {
    return d;
  }
};

// Admin only — every team in the system: add a team, change its logo, and
// delete a team permanently (with everything that belongs to it — see
// backend utils/purge.js). Head Coaches never see this page; they only
// manage their own team's players.
export default function AdminTeams() {
  const { t } = useLanguage();
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState("");
  const [uploadingId, setUploadingId] = useState(null);
  const [coachAccounts, setCoachAccounts] = useState([]);
  // search / sort / filters (kept while you move around the app)
  const [q, setQ] = useState(() => saved("q", ""));
  const [sort, setSort] = useState(() => saved("sort", "name"));
  const [logo, setLogo] = useState(() => saved("logo", "all"));
  const [coach, setCoach] = useState(() => saved("coach", "all"));
  const [linked, setLinked] = useState(() => saved("linked", "all"));
  const [permFilter, setPermFilter] = useState(() => saved("perm", {})); // { athletes: "on" | "off" }
  const [bulkKey, setBulkKey] = useState("athletes");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState("");
  useEffect(() => {
    const all = { q, sort, logo, coach, linked, perm: permFilter };
    Object.entries(all).forEach(([k, v]) => sessionStorage.setItem(`adminTeams.${k}`, JSON.stringify(v)));
  }, [q, sort, logo, coach, linked, permFilter]);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/teams", { noCoachMode: true });
      setTeams(data);
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || t("common.failedToLoad"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api
      .get("/auth/users", { noCoachMode: true })
      .then(({ data }) => setCoachAccounts((data || []).filter((u) => u.role === "HEAD_COACH")))
      .catch(() => {});
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const coachesOf = (team) => coachAccounts.filter((c) => c.team === team.name);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = teams.filter((tm) => {
      if (needle) {
        const hay = [tm.name, tm.nameKm, ...coachesOf(tm).map((c) => `${c.fullName || ""} ${c.username || ""}`)].join(" ").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (logo === "yes" && !tm.logoUrl) return false;
      if (logo === "no" && tm.logoUrl) return false;
      const hasCoach = coachesOf(tm).length > 0;
      if (coach === "yes" && !hasCoach) return false;
      if (coach === "no" && hasCoach) return false;
      if (linked === "yes" && !tm.tournamentClubId) return false;
      if (linked === "no" && tm.tournamentClubId) return false;
      const p = permsOf(tm);
      for (const [k, v] of Object.entries(permFilter)) {
        if (v === "on" && !p[k]) return false;
        if (v === "off" && p[k]) return false;
      }
      if (permFilter.anyOff === "yes" && !PERM_KEYS.some((k) => p[k] === false)) return false;
      return true;
    });
    const by = {
      name: (a, b) => a.name.localeCompare(b.name),
      nameDesc: (a, b) => b.name.localeCompare(a.name),
      most: (a, b) => (b.playerCount || 0) - (a.playerCount || 0) || a.name.localeCompare(b.name),
      fewest: (a, b) => (a.playerCount || 0) - (b.playerCount || 0) || a.name.localeCompare(b.name),
      newest: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
      oldest: (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
    }[sort];
    return [...list].sort(by || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teams, coachAccounts, q, sort, logo, coach, linked, permFilter]);

  const filtersOn = q || logo !== "all" || coach !== "all" || linked !== "all" || Object.keys(permFilter).length > 0;
  const clearFilters = () => {
    setQ("");
    setLogo("all");
    setCoach("all");
    setLinked("all");
    setPermFilter({});
  };
  const cyclePerm = (k) =>
    setPermFilter((f) => {
      const next = { ...f };
      if (!f[k]) next[k] = "on";
      else if (f[k] === "on") next[k] = "off";
      else delete next[k];
      return next;
    });

  // one permission → every team in the list below
  const bulkSet = async (value) => {
    const targets = shown.filter((tm) => permsOf(tm)[bulkKey] !== value);
    if (!targets.length) return setBulkMsg(t("adminTeams.bulkNothing"));
    const label = `${t(`coachPerms.${bulkKey}`)} → ${value ? t("adminTeams.on") : t("adminTeams.off")}`;
    if (!window.confirm(t("adminTeams.bulkConfirm").replace("{n}", targets.length).replace("{what}", label))) return;
    setBulkBusy(true);
    setBulkMsg("");
    let ok = 0;
    for (const tm of targets) {
      try {
        const { data } = await api.put(`/teams/${tm._id}/coach-perms`, { [bulkKey]: value }, { noCoachMode: true });
        tm.coachPerms = data.coachPerms;
        ok += 1;
      } catch {
        /* keep going */
      }
    }
    setTeams((list) => [...list]);
    setBulkBusy(false);
    setBulkMsg(t("adminTeams.bulkDone").replace("{n}", ok));
  };

  const addTeam = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setAdding(true);
    setMessage("");
    try {
      await api.post("/teams", { name: newName.trim() });
      setNewName("");
      await load();
    } catch (err) {
      setMessage(err.response?.data?.message || t("adminTeams.failedToAdd"));
    } finally {
      setAdding(false);
    }
  };

  const uploadLogo = async (team, file) => {
    if (!file) return;
    setUploadingId(team._id);
    try {
      const data = new FormData();
      data.append("logo", file);
      await api.put(`/teams/${team._id}/logo`, data, { headers: { "Content-Type": "multipart/form-data" } });
      await load();
    } catch (err) {
      alert(err.response?.data?.message || t("adminTeams.failedToUpload"));
    } finally {
      setUploadingId(null);
    }
  };

  return (
    <div className="container dash-body">
      <div className="dash-header">
        <h2>{t("adminTeams.title")}</h2>
        <p>{t("adminTeams.subtitle")}</p>
      </div>

      <form className="card" style={{ maxWidth: 520, marginBottom: 20, display: "flex", gap: 10, alignItems: "flex-end" }} onSubmit={addTeam}>
        <div className="field" style={{ flex: 1, marginBottom: 0 }}>
          <label>{t("adminTeams.newTeamLabel")}</label>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} />
        </div>
        <button className="btn btn-primary" disabled={adding || !newName.trim()}>
          {adding ? t("adminTeams.adding") : t("adminTeams.addButton")}
        </button>
      </form>
      {message && <div className="error-text">{message}</div>}

      <div className="card team-tools">
        <div className="team-tools-row">
          <input
            className="team-search"
            type="search"
            placeholder={t("adminTeams.search")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label={t("adminTeams.sort")}>
            <option value="name">{t("adminTeams.sortName")}</option>
            <option value="nameDesc">{t("adminTeams.sortNameDesc")}</option>
            <option value="most">{t("adminTeams.sortMost")}</option>
            <option value="fewest">{t("adminTeams.sortFewest")}</option>
            <option value="newest">{t("adminTeams.sortNewest")}</option>
            <option value="oldest">{t("adminTeams.sortOldest")}</option>
          </select>
        </div>
        <div className="team-tools-row">
          <select value={logo} onChange={(e) => setLogo(e.target.value)}>
            <option value="all">{t("adminTeams.logoAll")}</option>
            <option value="yes">{t("adminTeams.logoYes")}</option>
            <option value="no">{t("adminTeams.logoNo")}</option>
          </select>
          <select value={coach} onChange={(e) => setCoach(e.target.value)}>
            <option value="all">{t("adminTeams.coachAll")}</option>
            <option value="yes">{t("adminTeams.coachYes")}</option>
            <option value="no">{t("adminTeams.coachNo")}</option>
          </select>
          <select value={linked} onChange={(e) => setLinked(e.target.value)}>
            <option value="all">{t("adminTeams.linkAll")}</option>
            <option value="yes">{t("adminTeams.linkYes")}</option>
            <option value="no">{t("adminTeams.linkNo")}</option>
          </select>
        </div>
        <div className="team-perm-filter">
          <span className="help-text" style={{ margin: 0 }}>🔐 {t("adminTeams.permFilter")}</span>
          {PERM_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              className={`perm-chip ${permFilter[k] || ""}`}
              onClick={() => cyclePerm(k)}
              title={t("adminTeams.permChipHint")}
            >
              {permFilter[k] === "on" ? "✓ " : permFilter[k] === "off" ? "✕ " : ""}
              {t(`coachPerms.${k}`)}
            </button>
          ))}
          <button
            type="button"
            className={`perm-chip ${permFilter.anyOff ? "off" : ""}`}
            onClick={() => setPermFilter((f) => { const n = { ...f }; if (n.anyOff) delete n.anyOff; else n.anyOff = "yes"; return n; })}
          >
            {t("adminTeams.anyOff")}
          </button>
        </div>
        <div className="team-tools-row team-tools-foot">
          <span className="help-text" style={{ margin: 0 }}>
            {t("adminTeams.showing").replace("{n}", shown.length).replace("{total}", teams.length)}
          </span>
          {filtersOn && (
            <button type="button" className="btn btn-outline btn-sm" onClick={clearFilters}>
              {t("adminTeams.clear")}
            </button>
          )}
        </div>
        <details className="team-bulk">
          <summary>{t("adminTeams.bulkTitle").replace("{n}", shown.length)}</summary>
          <div className="team-tools-row">
            <select value={bulkKey} onChange={(e) => setBulkKey(e.target.value)}>
              {PERM_KEYS.map((k) => (
                <option key={k} value={k}>{t(`coachPerms.${k}`)}</option>
              ))}
            </select>
            <button type="button" className="btn btn-outline btn-sm" disabled={bulkBusy || !shown.length} onClick={() => bulkSet(true)}>
              ✓ {t("adminTeams.turnOn")}
            </button>
            <button type="button" className="btn btn-outline btn-sm" disabled={bulkBusy || !shown.length} onClick={() => bulkSet(false)}>
              ✕ {t("adminTeams.turnOff")}
            </button>
            {bulkBusy && <span className="help-text" style={{ margin: 0 }}>{t("common.loading")}</span>}
          </div>
          {bulkMsg && <div className="help-text">{bulkMsg}</div>}
        </details>
      </div>

      {loading ? (
        <p>{t("common.loading")}</p>
      ) : error ? (
        <div className="error-text">{error}</div>
      ) : teams.length === 0 ? (
        <p>{t("adminTeams.none")}</p>
      ) : shown.length === 0 ? (
        <p>{t("adminTeams.noMatch")}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {shown.map((team) => (
            <div key={team._id} className="card">
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                {team.logoUrl ? (
                  <img src={resolveFileUrl(team.logoUrl)} alt={team.name} style={{ width: 48, height: 48, objectFit: "contain" }} />
                ) : (
                  <div style={{ width: 48, height: 48, borderRadius: 8, background: "#eee" }} />
                )}
                <div style={{ flex: 1 }}>
                  <b className="caps-display">{team.name}</b>
                  {team.nameKm && <span className="help-text" style={{ margin: "0 0 0 6px" }}>{team.nameKm}</span>}
                  <div className="help-text" style={{ margin: 0 }}>
                    {t("adminTeams.playerCount").replace("{count}", team.playerCount || 0)}
                    {coachesOf(team).length > 0 && ` · 🧢 ${coachesOf(team).map((c) => c.fullName || c.username).join(", ")}`}
                    {team.tournamentClubId && ` · 🏆 ${t("adminTeams.linkedBadge")}`}
                  </div>
                </div>
                <label className="btn btn-outline" style={{ cursor: "pointer" }}>
                  {uploadingId === team._id ? t("adminTeams.uploading") : t("adminTeams.logoButton")}
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={(e) => uploadLogo(team, e.target.files?.[0])}
                  />
                </label>
              </div>
              <CoachPermsCard
                key={`${team._id}:${JSON.stringify(team.coachPerms || {})}`}
                team={team}
                coaches={coachesOf(team)}
                onSaved={(perms) => {
                  team.coachPerms = perms;
                  setTeams((list) => [...list]);
                }}
              />
              <div style={{ marginTop: 10 }}>
                <DeleteForeverButton
                  kind="team"
                  label={t("adminTeams.deleteButton")}
                  previewUrl={`/teams/${team._id}/delete-preview`}
                  deleteUrl={`/teams/${team._id}`}
                  confirmName={team.name}
                  onDeleted={load}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";
import TeamSelect from "../components/TeamSelect";
import { useLanguage } from "../i18n/LanguageContext";

// 🏫 Admin → Import students from the school-management app.
// Pick a class (or search a name), tick your students, choose the team,
// Import. Backend: /api/school-import (controllers/schoolImportController.js).

const DEFAULT_TEAM = "SBT ACADEMY - MOUNG";

function formatDate(date) {
  if (!date) return "—";
  const d = new Date(date);
  if (isNaN(d)) return "—";
  return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
}

export default function AdminSchoolImport() {
  const { t } = useLanguage();
  const [team, setTeam] = useState(DEFAULT_TEAM);
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState({}); // id → row (kept across searches)
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  // 🔄 copy the school app's latest changes onto imported athletes now
  // (the server also does this by itself every hour)
  const syncNow = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const { data } = await api.post("/school-import/sync", {}, { noCoachMode: true });
      setSyncResult(data);
    } catch (err) {
      alert(err.response?.data?.message || t("schoolImport.failed"));
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    api
      .get("/school-import/classes", { noCoachMode: true })
      .then(({ data }) => setClasses(data))
      .catch((err) => setError(err.response?.data?.message || t("schoolImport.failed")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const search = async (cls = classId, text = q) => {
    if (!cls && !text.trim()) return setRows([]);
    setLoading(true);
    try {
      const { data } = await api.get("/school-import/students", {
        params: { classId: cls || undefined, q: text.trim() || undefined },
        noCoachMode: true,
      });
      setRows(data.rows || []);
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || t("schoolImport.failed"));
    } finally {
      setLoading(false);
    }
  };

  const onTeam = (s) => s.existing && s.existing.teams.includes(team);
  const toggle = (s) =>
    setSelected((prev) => {
      const next = { ...prev };
      if (next[s._id]) delete next[s._id];
      else next[s._id] = s;
      return next;
    });
  const selectAllShown = () =>
    setSelected((prev) => {
      const next = { ...prev };
      rows.filter((s) => !onTeam(s)).forEach((s) => (next[s._id] = s));
      return next;
    });

  const doImport = async () => {
    const ids = Object.keys(selected);
    if (!team) return alert(t("schoolImport.pickTeam"));
    if (!ids.length) return;
    if (!window.confirm(t("schoolImport.confirm").replace("{n}", ids.length).replace("{team}", team))) return;
    setImporting(true);
    setResult(null);
    try {
      const { data } = await api.post("/school-import/import", { team, studentIds: ids }, { noCoachMode: true });
      setResult(data);
      setSelected({});
      await search();
    } catch (err) {
      alert(err.response?.data?.message || t("schoolImport.failed"));
    } finally {
      setImporting(false);
    }
  };

  const selectedList = Object.values(selected);

  return (
    <div className="container dash-body">
      <div className="dash-header">
        <h2>{t("schoolImport.title")}</h2>
        <p>{t("schoolImport.description")}</p>
      </div>

      <div className="card" style={{ padding: 12, marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button className="btn btn-outline" style={{ color: "var(--navy)", borderColor: "var(--navy)" }} disabled={syncing} onClick={syncNow}>
            {syncing ? t("schoolImport.syncing") : t("schoolImport.syncBtn")}
          </button>
          <span className="help-text" style={{ margin: 0 }}>{t("schoolImport.syncHelp")}</span>
        </div>
        {syncResult && (
          <div style={{ marginTop: 8 }}>
            <b>
              {t("schoolImport.syncSummary")
                .replace("{checked}", syncResult.checked)
                .replace("{updated}", syncResult.updated)}
            </b>
            {syncResult.missing > 0 && (
              <div className="help-text" style={{ margin: 0 }}>{t("schoolImport.syncMissing").replace("{n}", syncResult.missing)}</div>
            )}
            {syncResult.changes.map((c) => (
              <div key={c.athleteId} className="help-text" style={{ margin: 0 }}>
                • {c.name}: {c.fields.map((f) => t(`schoolImport.field.${f}`, f)).join(", ")}
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="formation-setup-row" style={{ flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ minWidth: 260 }}>
          <TeamSelect value={team} onChange={setTeam} label={t("schoolImport.toTeam")} />
        </div>
        <div className="field">
          <label>{t("schoolImport.class")}</label>
          <select
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              search(e.target.value, q);
            }}
          >
            <option value="">{t("schoolImport.anyClass")}</option>
            {classes.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name} · {c.academicYear}
                {c.school ? ` · ${c.school}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>{t("schoolImport.search")}</label>
          <input
            type="text"
            value={q}
            placeholder={t("schoolImport.searchPlaceholder")}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
          />
        </div>
        <button className="btn btn-outline" style={{ color: "var(--navy)", borderColor: "var(--navy)" }} onClick={() => search()}>
          🔍 {t("schoolImport.searchBtn")}
        </button>
      </div>

      {/* sticky bar: what's ticked + Import */}
      <div className="card" style={{ padding: 12, margin: "14px 0", position: "sticky", top: 70, zIndex: 5 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <b>{t("schoolImport.selected").replace("{n}", selectedList.length)}</b>
          {selectedList.length > 0 && (
            <button className="link-btn" onClick={() => setSelected({})}>
              {t("schoolImport.clear")}
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button className="btn btn-primary" disabled={!selectedList.length || importing || !team} onClick={doImport}>
            {importing ? t("schoolImport.importing") : `⬇️ ${t("schoolImport.import").replace("{team}", team || "…")}`}
          </button>
        </div>
        {selectedList.length > 0 && (
          <div className="help-text" style={{ margin: "6px 0 0" }}>
            {selectedList.map((s) => s.fullNameKh || s.fullNameLatin).join(", ")}
          </div>
        )}
      </div>

      {result && (
        <div className="card" style={{ padding: 12, marginBottom: 14 }}>
          <b>✓ {t("schoolImport.done")}</b>{" "}
          {t("schoolImport.summary")
            .replace("{created}", result.created)
            .replace("{added}", result.addedToTeam)
            .replace("{skipped}", result.skipped)
            .replace("{failed}", result.failed)}
          {result.results.some((r) => r.result === "created" && !r.photo) && (
            <div className="help-text" style={{ margin: "4px 0 0" }}>{t("schoolImport.noPhotoNote")}</div>
          )}
          {result.results
            .filter((r) => r.result === "failed")
            .map((r) => (
              <div key={r.studentId} className="error-text">
                {r.name}: {r.message}
              </div>
            ))}
          <div style={{ marginTop: 6 }}>
            <Link to="/admin">{t("schoolImport.viewTeam")}</Link>
          </div>
        </div>
      )}

      {loading && <p className="help-text">{t("schoolImport.loading")}</p>}
      {!loading && !rows.length && <p className="help-text">{t("schoolImport.hint")}</p>}

      {rows.length > 0 && (
        <>
          <div style={{ marginBottom: 8 }}>
            <button className="action-btn" onClick={selectAllShown}>
              {t("schoolImport.selectAll")}
            </button>
          </div>
          <div className="table-scroll">
            <table className="athletes">
              <thead>
                <tr>
                  <th></th>
                  <th>{t("schoolImport.colStudent")}</th>
                  <th>{t("schoolImport.class")}</th>
                  <th>{t("schoolImport.colDob")}</th>
                  <th>{t("schoolImport.colBirthplace")}</th>
                  <th>{t("schoolImport.colStatus")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const done = onTeam(s);
                  return (
                    <tr key={s._id} style={{ opacity: done ? 0.55 : 1, cursor: done ? "default" : "pointer" }} onClick={() => !done && toggle(s)}>
                      <td>
                        <input type="checkbox" checked={!!selected[s._id]} disabled={done} onChange={() => toggle(s)} onClick={(e) => e.stopPropagation()} />
                      </td>
                      <td data-label={t("schoolImport.colStudent")}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {s.photoUrl ? (
                            <img className="small-photo" src={s.photoUrl} alt="" />
                          ) : (
                            <span className="small-photo" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>👤</span>
                          )}
                          <div>
                            <div style={{ fontWeight: 600 }}>{s.fullNameKh || s.fullNameLatin}</div>
                            <div className="help-text" style={{ margin: 0 }}>
                              {s.fullNameLatin}
                              {s.gender ? ` · ${t(`schoolImport.gender.${s.gender}`, s.gender)}` : ""}
                              {s.studentId ? ` · #${s.studentId}` : ""}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td data-label={t("schoolImport.class")}>{s.className || "—"}</td>
                      <td data-label={t("schoolImport.colDob")}>{formatDate(s.dateOfBirth)}</td>
                      <td data-label={t("schoolImport.colBirthplace")}>{s.placeOfBirth || "—"}</td>
                      <td data-label={t("schoolImport.colStatus")}>
                        {done ? (
                          <span className="badge verified">{t("schoolImport.onTeam")}</span>
                        ) : s.existing ? (
                          <span className="badge pending" title={s.existing.teams.join(", ")}>
                            {t("schoolImport.inOtherTeam")}
                          </span>
                        ) : (
                          <span className="badge">{t("schoolImport.new")}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

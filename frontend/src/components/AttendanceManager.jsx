import { useEffect, useState } from "react";
import api from "../api/axios";
import { resolveFileUrl } from "../utils/fileUrl";
import { useLanguage } from "../i18n/LanguageContext";

// Status options, in the order they're shown in each row's selector.
const STATUSES = ["present", "absent", "late", "excused"];
// A CSS badge class per status — reuses the existing .badge.pending/verified/
// rejected palette (see index.css) so attendance colors match the rest of the
// app without new styles.
const STATUS_BADGE = {
  present: "verified",
  late: "pending",
  absent: "rejected",
  excused: "pending",
};

// yyyy-mm-dd in LOCAL time — a <input type="date"> value, and the format the
// API stores the session date as. Built from local getters (not toISOString,
// which is UTC and would shift the day for anyone behind UTC).
function toDateInputValue(date) {
  const d = date ? new Date(date) : new Date();
  if (isNaN(d)) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// "13-10-2026" — a readable date for the sessions list / summary tables.
function formatDate(date) {
  if (!date) return "—";
  const d = new Date(date);
  if (isNaN(d)) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}

// One row per person (not per assignment) — a person holding two roles on
// this team is still one attendee. Keeps the FIRST occurrence so their
// primary role shows, and preserves roster order.
function uniqueRoster(athletes) {
  const seen = new Set();
  const out = [];
  for (const a of athletes || []) {
    if (!a || seen.has(a._id)) continue;
    seen.add(a._id);
    out.push(a);
  }
  return out;
}

export default function AttendanceManager({ team, athletes }) {
  const { t } = useLanguage();

  // "sessions" | "summary" — which of the two main views is showing.
  const [view, setView] = useState("sessions");
  const [sessions, setSessions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // The editor. `editing` is the session being edited (null = creating a new
  // one). `draft` holds the form + per-athlete records while editing.
  const [editing, setEditing] = useState(null); // null | { isNew, id?, type, date, title, notes, records: { [athleteId]: { status, note } } }
  const [saving, setSaving] = useState(false);

  const roster = uniqueRoster(athletes);

  useEffect(() => {
    if (team) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team]);

  const load = async () => {
    setLoading(true);
    try {
      const [sessionsRes, summaryRes] = await Promise.all([
        api.get("/attendance", { params: { team } }),
        api.get("/attendance/summary", { params: { team } }),
      ]);
      setSessions(sessionsRes.data);
      setSummary(summaryRes.data);
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || t("attendance.failedToLoad"));
    } finally {
      setLoading(false);
    }
  };

  // A blank draft for a brand-new session — every roster member starts as
  // "present" so the common case (nearly everyone shows up) needs the fewest
  // clicks; staff only change the exceptions.
  const startNew = () => {
    const records = {};
    roster.forEach((a) => {
      records[a._id] = { status: "present", note: "" };
    });
    setEditing({
      isNew: true,
      type: "training",
      date: toDateInputValue(),
      title: "",
      notes: "",
      records,
    });
  };

  // Open a past session for editing — fetch its full records, then merge onto
  // the current roster so anyone added to the team since is still listed
  // (defaulting to present) rather than silently dropped.
  const openSession = async (id) => {
    try {
      const { data } = await api.get(`/attendance/${id}`);
      const records = {};
      roster.forEach((a) => {
        records[a._id] = { status: "present", note: "" };
      });
      for (const rec of data.records || []) {
        const key = rec.athlete?._id || rec.athlete;
        records[key] = { status: rec.status, note: rec.note || "" };
      }
      setEditing({
        isNew: false,
        id: data._id,
        type: data.type,
        date: toDateInputValue(data.date),
        title: data.title || "",
        notes: data.notes || "",
        records,
      });
    } catch (err) {
      alert(err.response?.data?.message || t("common.failedToLoad"));
    }
  };

  const setStatus = (athleteId, status) => {
    setEditing((prev) =>
      prev
        ? { ...prev, records: { ...prev.records, [athleteId]: { ...prev.records[athleteId], status } } }
        : prev
    );
  };

  const setNote = (athleteId, note) => {
    setEditing((prev) =>
      prev
        ? { ...prev, records: { ...prev.records, [athleteId]: { ...prev.records[athleteId], note } } }
        : prev
    );
  };

  const markAll = (status) => {
    setEditing((prev) => {
      if (!prev) return prev;
      const records = {};
      for (const key of Object.keys(prev.records)) {
        records[key] = { ...prev.records[key], status };
      }
      return { ...prev, records };
    });
  };

  const saveSession = async () => {
    if (!editing.date) {
      alert(t("attendance.dateRequired"));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        team,
        type: editing.type,
        date: editing.date,
        title: editing.title,
        notes: editing.notes,
        records: Object.entries(editing.records).map(([athlete, { status, note }]) => ({
          athlete,
          status,
          note,
        })),
      };
      if (editing.isNew) {
        await api.post("/attendance", payload);
      } else {
        await api.put(`/attendance/${editing.id}`, payload);
      }
      setEditing(null);
      await load();
    } catch (err) {
      alert(err.response?.data?.message || t("common.failedToSave"));
    } finally {
      setSaving(false);
    }
  };

  const deleteSession = async (id) => {
    if (!confirm(t("attendance.deleteConfirm"))) return;
    try {
      await api.delete(`/attendance/${id}`);
      await load();
    } catch (err) {
      alert(err.response?.data?.message || t("common.failedToDelete"));
    }
  };

  if (!team) return <p className="help-text">{t("attendance.chooseTeamPrompt")}</p>;
  if (loading) return <p>{t("attendance.loading")}</p>;
  if (error) return <p className="error-text">{error}</p>;


  // ---------- EDITOR ----------
  // Creating or editing a single session: a small form (type/date/title/notes)
  // plus one row per roster athlete to set present/absent/late/excused and an
  // optional reason. "All present"/"All absent" shortcuts cover the common
  // bulk case.
  if (editing) {
    return (
      <div>
        <div className="lineup-header">
          <h3>
            {editing.isNew ? t("attendance.newSession") : t("attendance.editSession")} — {team}
          </h3>
        </div>

        <div className="formation-setup-row">
          <div className="field">
            <label>{t("attendance.type")}</label>
            <select
              value={editing.type}
              onChange={(e) => setEditing((prev) => ({ ...prev, type: e.target.value }))}
            >
              <option value="training">{t("attendance.typeTraining")}</option>
              <option value="match">{t("attendance.typeMatch")}</option>
            </select>
          </div>

          <div className="field">
            <label>{t("attendance.date")}</label>
            <input
              type="date"
              value={editing.date}
              onChange={(e) => setEditing((prev) => ({ ...prev, date: e.target.value }))}
            />
          </div>

          <div className="field">
            <label>{t("attendance.title")}</label>
            <input
              type="text"
              placeholder={t("attendance.titlePlaceholder")}
              value={editing.title}
              onChange={(e) => setEditing((prev) => ({ ...prev, title: e.target.value }))}
            />
          </div>

          <div className="field">
            <label>{t("attendance.notes")}</label>
            <input
              type="text"
              placeholder={t("attendance.notesPlaceholder")}
              value={editing.notes}
              onChange={(e) => setEditing((prev) => ({ ...prev, notes: e.target.value }))}
            />
          </div>
        </div>

        <div className="dash-header" style={{ margin: "18px 0 10px" }}>
          <h4 style={{ margin: 0 }}>{t("attendance.roster")}</h4>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="action-btn" onClick={() => markAll("present")}>
              {t("attendance.markAllPresent")}
            </button>
            <button type="button" className="action-btn" onClick={() => markAll("absent")}>
              {t("attendance.markAllAbsent")}
            </button>
          </div>
        </div>

        {roster.length === 0 ? (
          <p className="help-text">{t("attendance.noRoster")}</p>
        ) : (
          <div className="table-scroll">
            <table className="athletes">
              <thead>
                <tr>
                  <th>{t("attendance.colAthlete")}</th>
                  <th>{t("attendance.colStatus")}</th>
                  <th>{t("attendance.colNote")}</th>
                </tr>
              </thead>
              <tbody>
                {roster.map((a) => {
                  const rec = editing.records[a._id] || { status: "present", note: "" };
                  return (
                    <tr key={a._id}>
                      <td data-label={t("attendance.colAthlete")}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <img
                            src={a.photoUrl ? resolveFileUrl(a.photoUrl) : "https://placehold.co/40x40?text=Photo"}
                            alt={a.fullName}
                            className="small-photo"
                          />
                          <div>
                            <div>
                              {a.jerseyNumber != null && `#${a.jerseyNumber} `}
                              {a.fullName}
                            </div>
                            <div className="role">{a.role || "PLAYER"}</div>
                          </div>
                        </div>
                      </td>
                      <td data-label={t("attendance.colStatus")}>
                        <select
                          value={rec.status}
                          onChange={(e) => setStatus(a._id, e.target.value)}
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {t(`attendance.status${s.charAt(0).toUpperCase()}${s.slice(1)}`)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td data-label={t("attendance.colNote")}>
                        <input
                          type="text"
                          placeholder={t("attendance.notePlaceholder")}
                          value={rec.note}
                          onChange={(e) => setNote(a._id, e.target.value)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="form-actions" style={{ marginTop: 16 }}>
          <button className="btn btn-primary" onClick={saveSession} disabled={saving}>
            {saving ? t("attendance.saving") : t("attendance.save")}
          </button>
          <button
            type="button"
            className="btn btn-outline"
            style={{ color: "var(--navy)", borderColor: "var(--navy)" }}
            onClick={() => setEditing(null)}
            disabled={saving}
          >
            {t("attendance.cancel")}
          </button>
        </div>
      </div>
    );
  }


  // ---------- MAIN VIEW ----------
  // Two sub-views toggled by tabs: a list of past sessions (open to edit,
  // delete) and a per-athlete attendance summary across all sessions.
  return (
    <div>
      <div className="lineup-header">
        <h3>{t("attendance.title")} — {team}</h3>
        <button className="btn btn-primary" onClick={startNew}>
          {t("attendance.newSession")}
        </button>
      </div>

      <div className="tabs">
        <button className={`tab-btn ${view === "sessions" ? "active" : ""}`} onClick={() => setView("sessions")}>
          {t("attendance.tabSessions")} ({sessions.length})
        </button>
        <button className={`tab-btn ${view === "summary" ? "active" : ""}`} onClick={() => setView("summary")}>
          {t("attendance.tabSummary")}
        </button>
      </div>

      <div className="tab-content">
        {view === "sessions" && (
          <>
            {sessions.length === 0 ? (
              <p className="help-text">{t("attendance.noneYet")}</p>
            ) : (
              <div className="lineups-list">
                {sessions.map((s) => (
                  <div key={s._id} className="lineup-card card">
                    <div className="lineup-header-card">
                      <h4>
                        <span className={`badge ${s.type === "match" ? "verified" : "pending"}`}>
                          {s.type === "match" ? t("attendance.typeMatch") : t("attendance.typeTraining")}
                        </span>{" "}
                        {formatDate(s.date)}
                        {s.title ? ` — ${s.title}` : ""}
                      </h4>
                      <div className="dash-actions">
                        <button className="link-btn" onClick={() => openSession(s._id)}>
                          {t("common.view")}
                        </button>
                        <button className="btn btn-danger" onClick={() => deleteSession(s._id)}>
                          {t("common.delete")}
                        </button>
                      </div>
                    </div>
                    <p className="lineup-count">
                      {t("attendance.presentCount")}: {s.counts.present} · {t("attendance.lateCount")}: {s.counts.late} ·{" "}
                      {t("attendance.absentCount")}: {s.counts.absent} · {t("attendance.excusedCount")}: {s.counts.excused} ·{" "}
                      {t("attendance.totalCount")}: {s.counts.total}
                    </p>
                    {s.notes && <p className="lineup-count">{s.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {view === "summary" && (
          <>
            {!summary || summary.rows.length === 0 ? (
              <p className="help-text">{t("attendance.noSummaryYet")}</p>
            ) : (
              <>
                <p className="selected-count">
                  {summary.sessionCount} {t("attendance.tabSessions").toLowerCase()}
                </p>
                <div className="table-scroll">
                  <table className="athletes">
                    <thead>
                      <tr>
                        <th>{t("attendance.colAthlete")}</th>
                        <th>{t("common.role")}</th>
                        <th>{t("attendance.attendedCount")}</th>
                        <th>{t("attendance.presentCount")}</th>
                        <th>{t("attendance.lateCount")}</th>
                        <th>{t("attendance.absentCount")}</th>
                        <th>{t("attendance.excusedCount")}</th>
                        <th>{t("attendance.rate")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.rows.map((row) => (
                        <tr key={String(row.athlete)}>
                          <td data-label={t("attendance.colAthlete")}>
                            {row.jerseyNumber != null && `#${row.jerseyNumber} `}
                            {row.fullName}
                          </td>
                          <td data-label={t("common.role")}>{row.role || "PLAYER"}</td>
                          <td data-label={t("attendance.attendedCount")}>
                            {row.attended}/{row.total}
                          </td>
                          <td data-label={t("attendance.presentCount")}>{row.present}</td>
                          <td data-label={t("attendance.lateCount")}>{row.late}</td>
                          <td data-label={t("attendance.absentCount")}>{row.absent}</td>
                          <td data-label={t("attendance.excusedCount")}>{row.excused}</td>
                          <td data-label={t("attendance.rate")}>
                            <span
                              className={`badge ${row.rate >= 80 ? "verified" : row.rate >= 50 ? "pending" : "rejected"}`}
                            >
                              {row.rate}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}


import { useEffect, useMemo, useState } from "react";
import api from "../api/axios";
import { useLanguage } from "../i18n/LanguageContext";

// Admin — trophy / tournament planning calendar: what's coming up, which
// days each one is played, which trophy, which kit, which age group (U13,
// U15…), men / women / mixed, where and how many teams.
const AGE_GROUPS = ["U9", "U11", "U13", "U15", "U17", "U19", "U21", "U23", "Open"];
const STATUSES = ["planned", "confirmed", "done", "cancelled"];
const STATUS_BADGE = { planned: "pending", confirmed: "verified", done: "", cancelled: "rejected" };
const GENDER_ICON = { male: "👦", female: "👧", mixed: "👫" };

function dateInput(d) {
  if (!d) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Phnom_Penh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(d));
}
const todayStr = () => dateInput(new Date());
const blankDay = () => ({ date: "", time: "", note: "" });
const blankForm = () => ({
  title: "",
  trophy: "",
  kit: "",
  ageGroup: "",
  gender: "male",
  location: "",
  teamsCount: "",
  teams: "",
  status: "planned",
  note: "",
  playDays: [{ ...blankDay(), date: todayStr() }],
});

export default function AdminTournamentPlans() {
  const { t, language } = useLanguage();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | "new" | _id
  const [form, setForm] = useState(blankForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fGender, setFGender] = useState("");
  const [fAge, setFAge] = useState("");
  const [showPast, setShowPast] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get("/tournament-plans");
      setList(data);
    } catch {
      setList([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const fmtDay = (d) =>
    new Intl.DateTimeFormat(language === "en" ? "en-GB" : "km-KH", {
      timeZone: "Asia/Phnom_Penh",
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(d));
  const monthKey = (d) => dateInput(d).slice(0, 7);
  const fmtMonth = (key) =>
    new Intl.DateTimeFormat(language === "en" ? "en-GB" : "km-KH", { month: "long", year: "numeric" }).format(new Date(`${key}-15T12:00:00+07:00`));

  // Suggestions from earlier plans (kits, trophies, places).
  const suggest = (k) => [...new Set(list.map((p) => p[k]).filter(Boolean))];

  const openForm = (plan) => {
    setFormError("");
    if (!plan) {
      setEditing("new");
      setForm(blankForm());
    } else {
      setEditing(plan._id);
      setForm({
        title: plan.title || "",
        trophy: plan.trophy || "",
        kit: plan.kit || "",
        ageGroup: plan.ageGroup || "",
        gender: plan.gender || "male",
        location: plan.location || "",
        teamsCount: plan.teamsCount === null || plan.teamsCount === undefined ? "" : String(plan.teamsCount),
        teams: plan.teams || "",
        status: plan.status || "planned",
        note: plan.note || "",
        playDays: (plan.playDays || []).map((d) => ({ date: dateInput(d.date), time: d.time || "", note: d.note || "" })),
      });
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setDay = (i, patch) => setForm((f) => ({ ...f, playDays: f.playDays.map((d, j) => (j === i ? { ...d, ...patch } : d)) }));
  // Copy an existing plan (e.g. same trophy for another age group).
  const copyPlan = (plan) => {
    openForm(plan);
    setEditing("new");
  };

  const save = async (e) => {
    e.preventDefault();
    setFormError("");
    if (!form.title.trim()) return setFormError(t("tPlan.enterTitle"));
    const days = form.playDays.filter((d) => d.date || d.time || d.note);
    if (days.some((d) => !d.date)) return setFormError(t("tPlan.enterDate"));
    setSaving(true);
    try {
      const body = { ...form, playDays: days, teamsCount: form.teamsCount === "" ? null : Number(form.teamsCount) };
      if (editing === "new") await api.post("/tournament-plans", body);
      else await api.put(`/tournament-plans/${editing}`, body);
      setEditing(null);
      load();
    } catch (err) {
      setFormError(err.response?.data?.message || t("invoices.failedToSave"));
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (plan, status) => {
    try {
      await api.put(`/tournament-plans/${plan._id}`, { status });
      load();
    } catch (err) {
      alert(err.response?.data?.message || t("invoices.failedToSave"));
    }
  };
  const remove = async (plan) => {
    if (!confirm(t("tPlan.confirmDelete").replace("{name}", plan.title))) return;
    try {
      await api.delete(`/tournament-plans/${plan._id}`);
      load();
    } catch (err) {
      alert(err.response?.data?.message || t("invoices.failedToSave"));
    }
  };

  // Filter, hide finished/past ones unless asked, group by month of the first play day.
  const today = todayStr();
  const lastDay = (p) => (p.playDays && p.playDays.length ? dateInput(p.playDays[p.playDays.length - 1].date) : "");
  const groups = useMemo(() => {
    const rows = list.filter((p) => {
      if (fStatus && p.status !== fStatus) return false;
      if (fGender && p.gender !== fGender) return false;
      if (fAge && p.ageGroup !== fAge) return false;
      const past = p.status === "done" || p.status === "cancelled" || (lastDay(p) && lastDay(p) < today);
      return showPast || fStatus ? true : !past;
    });
    const m = new Map();
    rows.forEach((p) => {
      const key = p.playDays && p.playDays.length ? monthKey(p.playDays[0].date) : "none";
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(p);
    });
    return [...m.entries()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, fStatus, fGender, fAge, showPast]);
  const ageOptions = [...new Set([...AGE_GROUPS, ...suggest("ageGroup")])];

  return (
    <div className="container dash-body">
      <div className="dash-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2>📅 {t("tPlan.title")}</h2>
          <p>{t("tPlan.intro")}</p>
        </div>
        {!editing && (
          <button className="btn btn-primary" onClick={() => openForm(null)}>
            ➕ {t("tPlan.new")}
          </button>
        )}
      </div>

      {editing && (
        <form className="card invoice-form" onSubmit={save} style={{ marginBottom: 24 }}>
          <h3 style={{ marginTop: 0 }}>{editing === "new" ? t("tPlan.new") : t("tPlan.edit")}</h3>
          <div className="filter-row" style={{ marginBottom: 0 }}>
            <div className="field" style={{ flex: 2, minWidth: 200 }}>
              <label>{t("tPlan.name")} *</label>
              <input value={form.title} onChange={set("title")} placeholder={t("tPlan.namePh")} />
            </div>
            <div className="field" style={{ flex: 2, minWidth: 180 }}>
              <label>🏆 {t("tPlan.trophy")}</label>
              <input value={form.trophy} onChange={set("trophy")} placeholder={t("tPlan.trophyPh")} list="tplan-trophy" />
              <datalist id="tplan-trophy">{suggest("trophy").map((v) => <option key={v} value={v} />)}</datalist>
            </div>
          </div>
          <div className="filter-row" style={{ marginBottom: 0 }}>
            <div className="field" style={{ flex: 1, minWidth: 120 }}>
              <label>{t("tPlan.ageGroup")}</label>
              <input value={form.ageGroup} onChange={set("ageGroup")} placeholder="U15" list="tplan-age" />
              <datalist id="tplan-age">{ageOptions.map((v) => <option key={v} value={v} />)}</datalist>
            </div>
            <div className="field" style={{ flex: 1, minWidth: 140 }}>
              <label>{t("tPlan.gender")}</label>
              <select value={form.gender} onChange={set("gender")}>
                <option value="male">{GENDER_ICON.male} {t("tPlan.male")}</option>
                <option value="female">{GENDER_ICON.female} {t("tPlan.female")}</option>
                <option value="mixed">{GENDER_ICON.mixed} {t("tPlan.mixed")}</option>
              </select>
            </div>
            <div className="field" style={{ flex: 2, minWidth: 160 }}>
              <label>👕 {t("tPlan.kit")}</label>
              <input value={form.kit} onChange={set("kit")} placeholder={t("tPlan.kitPh")} list="tplan-kit" />
              <datalist id="tplan-kit">{suggest("kit").map((v) => <option key={v} value={v} />)}</datalist>
            </div>
          </div>
          <div className="filter-row" style={{ marginBottom: 0 }}>
            <div className="field" style={{ flex: 2, minWidth: 180 }}>
              <label>📍 {t("tPlan.location")}</label>
              <input value={form.location} onChange={set("location")} placeholder={t("tPlan.locationPh")} list="tplan-loc" />
              <datalist id="tplan-loc">{suggest("location").map((v) => <option key={v} value={v} />)}</datalist>
            </div>
            <div className="field" style={{ flex: 1, minWidth: 110 }}>
              <label>{t("tPlan.teamsCount")}</label>
              <input type="number" min="0" step="1" value={form.teamsCount} onChange={set("teamsCount")} />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 140 }}>
              <label>{t("tPlan.status")}</label>
              <select value={form.status} onChange={set("status")}>
                {STATUSES.map((s) => <option key={s} value={s}>{t(`tPlan.status.${s}`)}</option>)}
              </select>
            </div>
          </div>
          <div className="field">
            <label>{t("tPlan.teams")}</label>
            <textarea rows={2} value={form.teams} onChange={set("teams")} placeholder={t("tPlan.teamsPh")} />
          </div>

          <h4 className="invoice-form-h">🗓 {t("tPlan.playDays")}</h4>
          <div className="invoice-lines">
            {form.playDays.map((d, i) => (
              <div key={i} className="tplan-day-row">
                <span>{i + 1}.</span>
                <input type="date" value={d.date} onChange={(e) => setDay(i, { date: e.target.value })} aria-label={t("tPlan.date")} />
                <input type="time" value={d.time} onChange={(e) => setDay(i, { time: e.target.value })} aria-label={t("tPlan.time")} />
                <button type="button" className="link-btn" onClick={() => setForm((f) => ({ ...f, playDays: f.playDays.filter((_, j) => j !== i) }))}>
                  ✕
                </button>
                <input className="tplan-day-note" value={d.note} onChange={(e) => setDay(i, { note: e.target.value })} placeholder={t("tPlan.dayNotePh")} />
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-outline"
            style={{ margin: "4px 0 14px" }}
            onClick={() =>
              setForm((f) => {
                const last = f.playDays[f.playDays.length - 1];
                // Next day after the last one, same time.
                let date = todayStr();
                if (last && last.date) {
                  const n = new Date(`${last.date}T12:00:00+07:00`);
                  n.setDate(n.getDate() + 1);
                  date = dateInput(n);
                }
                return { ...f, playDays: [...f.playDays, { date, time: last ? last.time : "", note: "" }] };
              })
            }
          >
            + {t("tPlan.addDay")}
          </button>

          <div className="field">
            <label>{t("tPlan.note")}</label>
            <textarea rows={2} value={form.note} onChange={set("note")} />
          </div>
          {formError && <div className="error-text">{formError}</div>}
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <button className="btn btn-primary" disabled={saving}>{saving ? t("common.saving") : t("common.save")}</button>
            <button type="button" className="btn btn-outline" onClick={() => setEditing(null)}>{t("common.cancel")}</button>
          </div>
        </form>
      )}

      <div className="filter-row">
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
          <option value="">{t("tPlan.allStatus")}</option>
          {STATUSES.map((s) => <option key={s} value={s}>{t(`tPlan.status.${s}`)}</option>)}
        </select>
        <select value={fGender} onChange={(e) => setFGender(e.target.value)}>
          <option value="">{t("tPlan.allGender")}</option>
          <option value="male">{t("tPlan.male")}</option>
          <option value="female">{t("tPlan.female")}</option>
          <option value="mixed">{t("tPlan.mixed")}</option>
        </select>
        <select value={fAge} onChange={(e) => setFAge(e.target.value)}>
          <option value="">{t("tPlan.allAge")}</option>
          {[...new Set(list.map((p) => p.ageGroup).filter(Boolean))].map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <label className="check-row">
          <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} /> {t("tPlan.showPast")}
        </label>
      </div>

      {loading ? (
        <p>{t("common.loading")}</p>
      ) : groups.length === 0 ? (
        <p className="mini-empty">{t("tPlan.none")}</p>
      ) : (
        groups.map(([key, plans]) => (
          <section key={key} className="tplan-month">
            <h3 className="tplan-month-h">{key === "none" ? t("tPlan.noDate") : fmtMonth(key)}</h3>
            <div className="package-grid">
              {plans.map((p) => {
                const upcoming = (p.playDays || []).find((d) => dateInput(d.date) >= today);
                return (
                  <div key={p._id} className={`card package-card ${p.status === "cancelled" ? "inactive" : ""}`}>
                    <div className="package-card-head">
                      <h3>🏆 {p.title}</h3>
                      <span className={`badge ${STATUS_BADGE[p.status]}`}>{t(`tPlan.status.${p.status}`)}</span>
                    </div>
                    <div className="package-meta" style={{ marginBottom: 8 }}>
                      {p.ageGroup && <span className="badge">{p.ageGroup}</span>}
                      <span className="badge">{GENDER_ICON[p.gender]} {t(`tPlan.${p.gender}`)}</span>
                      {p.teamsCount ? <span className="badge">{t("tPlan.nTeams").replace("{n}", p.teamsCount)}</span> : null}
                    </div>
                    <ul className="package-items">
                      {p.trophy && <li><span>🏆 {t("tPlan.trophy")}</span><span>{p.trophy}</span></li>}
                      {p.kit && <li><span>👕 {t("tPlan.kit")}</span><span>{p.kit}</span></li>}
                      {p.location && <li><span>📍 {t("tPlan.location")}</span><span>{p.location}</span></li>}
                    </ul>
                    {(p.playDays || []).length > 0 && (
                      <ul className="tplan-days">
                        {p.playDays.map((d) => (
                          <li key={d._id} className={upcoming && upcoming._id === d._id ? "next" : dateInput(d.date) < today ? "past" : ""}>
                            🗓 {fmtDay(d.date)}
                            {d.time && ` · ${d.time}`}
                            {d.note && ` — ${d.note}`}
                          </li>
                        ))}
                      </ul>
                    )}
                    {p.teams && <p className="package-desc">👥 {p.teams}</p>}
                    {p.note && <p className="package-desc">📝 {p.note}</p>}
                    <div className="package-actions">
                      {p.status === "planned" && (
                        <button className="btn btn-primary" onClick={() => setStatus(p, "confirmed")}>✅ {t("tPlan.confirm")}</button>
                      )}
                      {p.status === "confirmed" && (
                        <button className="btn btn-outline" onClick={() => setStatus(p, "done")}>🏁 {t("tPlan.markDone")}</button>
                      )}
                      <button className="link-btn" onClick={() => openForm(p)}>✏️ {t("common.edit")}</button>
                      <button className="link-btn" onClick={() => copyPlan(p)}>📄 {t("tPlan.copy")}</button>
                      <button className="link-btn" onClick={() => remove(p)}>{t("common.delete")}</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

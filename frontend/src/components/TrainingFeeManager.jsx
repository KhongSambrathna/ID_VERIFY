import { useEffect, useState } from "react";
import api from "../api/axios";
import { formatKHR } from "../utils/currency";
import { resolveFileUrl } from "../utils/fileUrl";
import { useLanguage } from "../i18n/LanguageContext";

// 🏃 Training tab on the coach dashboard — training fees for one team.
// Students pay ahead (day / week / month) into a balance; each training
// session they attend costs the per-session price. Attendance itself is
// recorded in the Attendance tab (type "Training"). Backend:
// /api/training-fees (controllers/trainingFeeController.js).

const PLANS = ["day", "week", "month"];

function thisMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function formatDate(date) {
  const d = new Date(date);
  if (isNaN(d)) return "—";
  return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
}
const fill = (text, vars) => Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, v), text);

export default function TrainingFeeManager({ team, onSettingsChange }) {
  const { t } = useLanguage();
  const [month, setMonth] = useState(thisMonth());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // settings form
  const [form, setForm] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState("");

  // pay form / history (one student at a time)
  const [paying, setPaying] = useState(null); // { row, plan, amount, date, note }
  const [savingPay, setSavingPay] = useState(false);
  const [historyFor, setHistoryFor] = useState(null); // athlete id
  const [history, setHistory] = useState([]);

  useEffect(() => {
    if (team) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team, month]);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/training-fees/summary", { params: { team, month } });
      setData(data);
      setForm((f) => f || { ...data.settings });
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || t("trainingFee.failed"));
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async (extra = {}) => {
    setSavingSettings(true);
    setSettingsMsg("");
    try {
      const body = {
        team,
        pricePerSession: Number(form.pricePerSession) || 0,
        monthlyFee: Number(form.monthlyFee) || 0,
        sessionsPerWeek: Number(form.sessionsPerWeek) || 1,
        ...extra,
      };
      const { data: s } = await api.put("/training-fees/settings", body);
      setForm({ ...s });
      setSettingsMsg(t("trainingFee.saved"));
      onSettingsChange?.(s);
      await load();
    } catch (err) {
      setSettingsMsg(err.response?.data?.message || t("trainingFee.failed"));
    } finally {
      setSavingSettings(false);
    }
  };

  const suggestedAmount = (row, plan) => {
    const s = data.settings;
    if (plan === "day") return s.pricePerSession;
    if (plan === "week") return s.pricePerSession * s.sessionsPerWeek;
    const topUp = s.monthlyFee - row.balance;
    return topUp > 0 ? topUp : s.monthlyFee;
  };

  const startPay = (row) => {
    setHistoryFor(null);
    setPaying({ row, plan: row.plan, amount: suggestedAmount(row, row.plan), date: today(), note: "" });
  };

  const savePayment = async () => {
    const amount = Math.round(Number(paying.amount) || 0);
    if (amount <= 0) return alert(t("trainingFee.amountRequired"));
    setSavingPay(true);
    try {
      await api.post("/training-fees/payments", {
        team,
        athlete: paying.row.athlete,
        amount,
        plan: paying.plan,
        date: paying.date,
        note: paying.note,
      });
      setPaying(null);
      await load();
    } catch (err) {
      alert(err.response?.data?.message || t("trainingFee.failed"));
    } finally {
      setSavingPay(false);
    }
  };

  const openHistory = async (row) => {
    setPaying(null);
    if (historyFor === row.athlete) return setHistoryFor(null);
    setHistoryFor(row.athlete);
    setHistory([]);
    try {
      const { data } = await api.get("/training-fees/payments", { params: { team, athlete: row.athlete } });
      setHistory(data);
    } catch (err) {
      alert(err.response?.data?.message || t("trainingFee.failed"));
    }
  };

  const deletePayment = async (p) => {
    if (!window.confirm(fill(t("trainingFee.deleteConfirm"), { amount: formatKHR(p.amount) }))) return;
    try {
      await api.delete(`/training-fees/payments/${p._id}`);
      setHistory((h) => h.filter((x) => x._id !== p._id));
      await load();
    } catch (err) {
      alert(err.response?.data?.message || t("trainingFee.failed"));
    }
  };

  if (loading && !data) return <p className="help-text">{t("trainingFee.loading")}</p>;
  if (error && !data) return <p className="error-text">{error}</p>;
  if (!data || !form) return null;

  const s = data.settings;
  const perMonth = s.pricePerSession > 0 ? Math.round((s.monthlyFee / s.pricePerSession) * 10) / 10 : 0;

  const settingsFields = (
    <div className="formation-setup-row" style={{ flexWrap: "wrap" }}>
      <div className="field">
        <label>{t("trainingFee.pricePerSession")}</label>
        <input
          type="number"
          min="0"
          step="100"
          value={form.pricePerSession}
          onChange={(e) => setForm({ ...form, pricePerSession: e.target.value })}
        />
      </div>
      <div className="field">
        <label>{t("trainingFee.monthlyFee")}</label>
        <input
          type="number"
          min="0"
          step="500"
          value={form.monthlyFee}
          onChange={(e) => setForm({ ...form, monthlyFee: e.target.value })}
        />
      </div>
      <div className="field">
        <label>{t("trainingFee.sessionsPerWeek")}</label>
        <input
          type="number"
          min="1"
          max="7"
          value={form.sessionsPerWeek}
          onChange={(e) => setForm({ ...form, sessionsPerWeek: e.target.value })}
        />
      </div>
    </div>
  );

  // ---- feature switched off ----
  if (!s.enabled) {
    return (
      <div className="card" style={{ padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>{t("trainingFee.title")}</h3>
        {s.canToggle ? (
          <>
            <p className="help-text">{t("trainingFee.offAdmin")}</p>
            {settingsFields}
            <div className="form-actions">
              <button className="btn btn-primary" disabled={savingSettings} onClick={() => saveSettings({ enabled: true })}>
                {t("trainingFee.enable")}
              </button>
            </div>
            {settingsMsg && <p className="help-text">{settingsMsg}</p>}
          </>
        ) : (
          <p className="help-text">{t("trainingFee.offCoach")}</p>
        )}
      </div>
    );
  }

  // ---- feature on ----
  const stat = (label, value, color) => (
    <div className="card" style={{ padding: "10px 14px", flex: "1 1 140px" }}>
      <div className="help-text" style={{ margin: 0 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
    </div>
  );

  return (
    <div>
      <div className="dash-header" style={{ marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>{t("trainingFee.title")}</h3>
        <div className="dash-actions" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <label className="help-text" style={{ margin: 0 }}>{t("trainingFee.month")}</label>
          <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
          <button className="btn btn-outline" onClick={() => setShowSettings((v) => !v)}>
            {t("trainingFee.settings")}
          </button>
        </div>
      </div>

      <p className="help-text">{fill(t("trainingFee.howItWorks"), { price: formatKHR(s.pricePerSession) })}</p>

      {showSettings && (
        <div className="card" style={{ padding: 14, marginBottom: 12 }}>
          {settingsFields}
          <p className="help-text">
            {fill(t("trainingFee.monthEquals"), { n: perMonth })} · {t("trainingFee.priceNote")}
          </p>
          <div className="form-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn-primary" disabled={savingSettings} onClick={() => saveSettings()}>
              {t("trainingFee.save")}
            </button>
            {s.canToggle && (
              <button
                className="btn btn-danger"
                disabled={savingSettings}
                onClick={() => window.confirm(t("trainingFee.disableConfirm")) && saveSettings({ enabled: false })}
              >
                {t("trainingFee.disable")}
              </button>
            )}
          </div>
          {settingsMsg && <p className="help-text">{settingsMsg}</p>}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        {stat(t("trainingFee.sessionsMonth"), data.sessionsMonth)}
        {stat(t("trainingFee.paidMonth"), formatKHR(data.totals.paidMonth), "var(--green, #15803d)")}
        {stat(t("trainingFee.toCollect"), formatKHR(data.totals.toPay), "var(--navy, #1e3a8a)")}
        {stat(t("trainingFee.owed"), formatKHR(data.totals.owed), data.totals.owed ? "#b91c1c" : undefined)}
      </div>

      {error && <p className="error-text">{error}</p>}

      {data.rows.length === 0 ? (
        <p className="help-text">{t("trainingFee.noRoster")}</p>
      ) : (
        <div className="table-scroll">
          <table className="athletes">
            <thead>
              <tr>
                <th>{t("trainingFee.colAthlete")}</th>
                <th>{t("trainingFee.colPlan")}</th>
                <th>{t("trainingFee.colCame")}</th>
                <th>{t("trainingFee.colPaid")}</th>
                <th>{t("trainingFee.colBalance")}</th>
                <th>{t("trainingFee.colToPay")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => {
                const isPaying = paying && paying.row.athlete === r.athlete;
                const isHistory = historyFor === r.athlete;
                return [
                  <tr key={r.athlete}>
                    <td data-label={t("trainingFee.colAthlete")}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {r.photoUrl && <img className="small-photo" src={resolveFileUrl(r.photoUrl)} alt="" />}
                        <div>
                          <div style={{ fontWeight: 600 }}>
                            {r.jerseyNumber != null ? `#${r.jerseyNumber} ` : ""}
                            {r.khmerName || r.fullName}
                          </div>
                          {r.khmerName && <div className="help-text" style={{ margin: 0 }}>{r.fullName}</div>}
                        </div>
                      </div>
                    </td>
                    <td data-label={t("trainingFee.colPlan")}>{t(`trainingFee.plan.${r.plan}`)}</td>
                    <td data-label={t("trainingFee.colCame")}>
                      <span className="badge verified">{r.attendedMonth}</span>{" "}
                      <span className="badge rejected">{r.missedMonth}</span>
                    </td>
                    <td data-label={t("trainingFee.colPaid")}>{formatKHR(r.paidMonth)}</td>
                    <td data-label={t("trainingFee.colBalance")} style={{ color: r.balance < 0 ? "#b91c1c" : undefined }}>
                      {formatKHR(r.balance)}
                      {r.sessionsLeft != null && r.balance > 0 && (
                        <div className="help-text" style={{ margin: 0 }}>
                          {fill(t("trainingFee.sessionsLeft"), { n: r.sessionsLeft })}
                        </div>
                      )}
                    </td>
                    <td data-label={t("trainingFee.colToPay")} style={{ fontWeight: 700 }}>
                      {r.toPay > 0 ? formatKHR(r.toPay) : "✓"}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="action-btn" onClick={() => (isPaying ? setPaying(null) : startPay(r))}>
                          {t("trainingFee.pay")}
                        </button>
                        <button className="action-btn" onClick={() => openHistory(r)}>
                          {t("trainingFee.history")}
                        </button>
                      </div>
                    </td>
                  </tr>,
                  isPaying && (
                    <tr key={`${r.athlete}-pay`}>
                      <td colSpan={7}>
                        <div className="card" style={{ padding: 12 }}>
                          <b>{fill(t("trainingFee.payTitle"), { name: r.khmerName || r.fullName })}</b>
                          <div className="formation-setup-row" style={{ flexWrap: "wrap", marginTop: 8 }}>
                            <div className="field">
                              <label>{t("trainingFee.colPlan")}</label>
                              <select
                                value={paying.plan}
                                onChange={(e) =>
                                  setPaying({ ...paying, plan: e.target.value, amount: suggestedAmount(r, e.target.value) })
                                }
                              >
                                {PLANS.map((p) => (
                                  <option key={p} value={p}>
                                    {t(`trainingFee.plan.${p}`)}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="field">
                              <label>{t("trainingFee.amount")}</label>
                              <input
                                type="number"
                                min="0"
                                step="100"
                                value={paying.amount}
                                onChange={(e) => setPaying({ ...paying, amount: e.target.value })}
                              />
                            </div>
                            <div className="field">
                              <label>{t("trainingFee.date")}</label>
                              <input type="date" value={paying.date} onChange={(e) => setPaying({ ...paying, date: e.target.value })} />
                            </div>
                            <div className="field">
                              <label>{t("trainingFee.note")}</label>
                              <input type="text" value={paying.note} onChange={(e) => setPaying({ ...paying, note: e.target.value })} />
                            </div>
                          </div>
                          <div className="form-actions" style={{ display: "flex", gap: 8 }}>
                            <button className="btn btn-primary" disabled={savingPay} onClick={savePayment}>
                              {t("trainingFee.savePayment")}
                            </button>
                            <button className="btn btn-outline" onClick={() => setPaying(null)}>
                              {t("trainingFee.cancel")}
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ),
                  isHistory && (
                    <tr key={`${r.athlete}-history`}>
                      <td colSpan={7}>
                        {history.length === 0 ? (
                          <p className="help-text">{t("trainingFee.noPayments")}</p>
                        ) : (
                          <ul style={{ margin: 0, paddingLeft: 18 }}>
                            {history.map((p) => (
                              <li key={p._id} style={{ marginBottom: 4 }}>
                                {formatDate(p.date)} — <b>{formatKHR(p.amount)}</b> ({t(`trainingFee.plan.${p.plan}`)})
                                {p.note ? ` · ${p.note}` : ""}{" "}
                                <button className="link-btn" onClick={() => deletePayment(p)}>
                                  {t("trainingFee.deletePayment")}
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

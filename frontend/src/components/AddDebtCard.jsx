import { useMemo, useState } from "react";
import api from "../api/axios";
import { useLanguage } from "../i18n/LanguageContext";
import { formatUSD, formatUSDwithKHR } from "../utils/currency";

// Debt report → "➕ Record a debt": add an owed amount (in dollars) to one
// student — or to everyone on a team at once (e.g. a jersey fee). Uses the
// same per-assignment fee rows as the athlete Edit page, so the debt shows
// up everywhere (debt report, dashboards, KHQR payment).
const QUICK = [1, 2, 5, 10, 20];

export default function AddDebtCard({ rows, teams, onDone }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("one"); // one | team
  const [q, setQ] = useState("");
  const [pick, setPick] = useState(null); // a row (athlete + assignment)
  const [team, setTeam] = useState(teams.length === 1 ? teams[0] : "");
  const [playersOnly, setPlayersOnly] = useState(true);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s || pick) return [];
    return rows
      .filter((r) => [r.fullName, r.khmerName, r.verifyId, r.team].filter(Boolean).some((v) => String(v).toLowerCase().includes(s)))
      .slice(0, 8);
  }, [q, rows, pick]);

  const teamRows = useMemo(
    () => rows.filter((r) => r.team === team && (!playersOnly || !r.role || r.role === "PLAYER")),
    [rows, team, playersOnly]
  );

  const reset = () => {
    setPick(null);
    setQ("");
    setAmount("");
    setNote("");
  };

  const save = async (e) => {
    e.preventDefault();
    setErr("");
    setMsg("");
    const n = Math.round(Number(amount) * 100) / 100;
    if (!Number.isFinite(n) || n <= 0) return setErr(t("addDebt.enterAmount"));
    const targets = mode === "one" ? (pick ? [pick] : []) : teamRows;
    if (!targets.length) return setErr(mode === "one" ? t("addDebt.pickStudent") : t("addDebt.noOneInTeam"));
    if (mode === "team" && !confirm(t("addDebt.confirmTeam").replace("{n}", targets.length).replace("{amount}", formatUSDwithKHR(n)).replace("{team}", team))) return;
    setSaving(true);
    let done = 0;
    const failed = [];
    for (const r of targets) {
      try {
        await api.post(`/athletes/${r._id}/assignments/${r.assignmentId}/fees`, { amount: n, note: note.trim() });
        done += 1;
      } catch {
        failed.push(r.fullName);
      }
    }
    setSaving(false);
    if (failed.length) setErr(`${t("addDebt.failedFor")}: ${failed.join(", ")}`);
    if (done) {
      setMsg(t("addDebt.saved").replace("{n}", done).replace("{amount}", formatUSDwithKHR(n)));
      reset();
      onDone();
    }
  };

  if (!open) {
    return (
      <button type="button" className="btn btn-primary no-print" style={{ marginBottom: 14 }} onClick={() => setOpen(true)}>
        ➕ {t("addDebt.open")}
      </button>
    );
  }

  return (
    <form className="card invoice-form no-print" onSubmit={save} style={{ marginBottom: 18 }}>
      <h3 style={{ marginTop: 0 }}>➕ {t("addDebt.title")}</h3>
      <div className="tg-filter" style={{ marginBottom: 10 }}>
        <button type="button" className={`chip ${mode === "one" ? "active" : ""}`} onClick={() => setMode("one")}>
          👤 {t("addDebt.oneStudent")}
        </button>
        <button type="button" className={`chip ${mode === "team" ? "active" : ""}`} onClick={() => setMode("team")}>
          👥 {t("addDebt.wholeTeam")}
        </button>
      </div>

      {mode === "one" ? (
        <div className="field" style={{ position: "relative" }}>
          <label>{t("addDebt.student")} *</label>
          {pick ? (
            <div className="add-debt-pick">
              <span>
                <b className="caps-display">{pick.fullName}</b>
                {pick.khmerName ? ` (${pick.khmerName})` : ""} · <span className="caps-display">{pick.team}</span> · {pick.verifyId}
                {pick.feeOwed > 0 && <small className="mini-empty"> · {t("addDebt.alreadyOwes")} {formatUSDwithKHR(pick.feeOwed)}</small>}
              </span>
              <button type="button" className="link-btn" onClick={() => setPick(null)}>✕</button>
            </div>
          ) : (
            <>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("addDebt.searchPh")} autoFocus />
              {matches.length > 0 && (
                <ul className="add-debt-list">
                  {matches.map((r) => (
                    <li key={r.assignmentId}>
                      <button type="button" onClick={() => setPick(r)}>
                        <b className="caps-display">{r.fullName}</b>
                        {r.khmerName ? ` (${r.khmerName})` : ""} · <span className="caps-display">{r.team}</span> · {r.verifyId}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="filter-row" style={{ marginBottom: 0, alignItems: "flex-end" }}>
          <div className="field" style={{ flex: 1, minWidth: 180 }}>
            <label>{t("common.team")} *</label>
            <select value={team} onChange={(e) => setTeam(e.target.value)}>
              <option value="">—</option>
              {teams.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>
          <label className="check-row" style={{ marginBottom: 14 }}>
            <input type="checkbox" checked={playersOnly} onChange={(e) => setPlayersOnly(e.target.checked)} /> {t("addDebt.playersOnly")}
          </label>
          {team && <p className="help-text" style={{ width: "100%", margin: "0 0 8px" }}>👥 {t("addDebt.willAdd").replace("{n}", teamRows.length)}</p>}
        </div>
      )}

      <div className="filter-row" style={{ marginBottom: 0 }}>
        <div className="field" style={{ flex: 1, minWidth: 140 }}>
          <label>{t("addDebt.amount")} ($) *</label>
          <input type="number" min="0" step="any" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="5" />
          {Number(amount) > 0 && <small className="mini-empty">{formatUSDwithKHR(Number(amount))}</small>}
          <div className="wgift-quick">
            {QUICK.map((v) => (
              <button type="button" key={v} className={`chip ${Number(amount) === v ? "active" : ""}`} onClick={() => setAmount(String(v))}>
                {formatUSD(v)}
              </button>
            ))}
          </div>
        </div>
        <div className="field" style={{ flex: 2, minWidth: 180 }}>
          <label>{t("addDebt.note")}</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("addDebt.notePh")} />
        </div>
      </div>
      {err && <p className="error-text">{err}</p>}
      {msg && <p className="success-text">✅ {msg}</p>}
      <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
        <button className="btn btn-primary" disabled={saving}>{saving ? t("common.saving") : t("common.save")}</button>
        <button type="button" className="btn btn-outline" onClick={() => { setOpen(false); setErr(""); setMsg(""); }}>
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}

import { useEffect, useState } from "react";
import api from "../api/axios";
import { useLanguage } from "../i18n/LanguageContext";
import { formatUSD, approxKHR } from "../utils/currency";
import { StatTile } from "./MiniCharts";
import { fmtMoney, ACCOUNT_ICON } from "./FinanceExtras";

// 📈 Investments / betting — record each day's win or loss, money put in
// and taken out, and see the honest totals (profit/loss, win days, worst
// losing streak, own limits).
const TZ = "Asia/Phnom_Penh";
const ymd = (d = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(d));
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-GB", { timeZone: TZ }) : "");
const dmy = (s) => (s ? s.split("-").reverse().join("/") : "");
const shiftMonth = (m, n) => {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
export const INVEST_KINDS = { betting: "🎲", gold: "🥇", crypto: "🪙", stock: "📈", business: "🏪", other: "💼" };
const signed = (n, cur) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${fmtMoney(Math.abs(n), cur)}`;
const signedUSD = (n) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${formatUSD(Math.abs(n))}`;
const tone = (n) => (n > 0 ? "ok" : n < 0 ? "bad" : undefined);
const blankInv = () => ({ name: "", kind: "betting", currency: "USD", monthlyLossLimit: "", dailyStakeLimit: "", note: "" });

export default function InvestTab() {
  const { t } = useLanguage();
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null); // investment id
  const [form, setForm] = useState(null);
  const [err, setErr] = useState("");

  const load = async () => {
    try {
      const { data } = await api.get("/finance/invest");
      setData(data);
      return data;
    } catch {
      setData(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setErr("");
    if (!form.name.trim()) return setErr(t("invest.enterName"));
    try {
      if (form._id) await api.put(`/finance/invest/${form._id}`, form);
      else {
        const { data: created } = await api.post("/finance/invest", form);
        setOpen(created._id);
      }
      setForm(null);
      load();
    } catch (e2) {
      setErr(e2.response?.data?.message || t("finance.failedToSave"));
    }
  };

  if (data === null) return <p>{t("common.loading")}</p>;
  if (data === false) return <p className="error-text">{t("finance.failedToLoad")}</p>;

  const active = data.investments.filter((i) => !i.archived);
  const current = data.investments.find((i) => i._id === open);

  const formView = form && (
    <form className="card fin-form" onSubmit={save} style={{ maxWidth: 720 }}>
      <h3 style={{ marginTop: 0 }}>{form._id ? t("invest.edit") : t("invest.new")}</h3>
      <div className="invest-kinds">
        {Object.keys(INVEST_KINDS).map((k) => (
          <button type="button" key={k} className={`chip ${form.kind === k ? "active" : ""}`} onClick={() => setForm((p) => ({ ...p, kind: k, name: p.name || t(`invest.kind_${k}`) }))}>
            {INVEST_KINDS[k]} {t(`invest.kind_${k}`)}
          </button>
        ))}
      </div>
      <div className="filter-row" style={{ marginBottom: 0 }}>
        <div className="field" style={{ flex: 2, minWidth: 180 }}>
          <label>{t("invest.name")}</label>
          <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder={t("invest.namePh")} />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 90 }}>
          <label>{t("financeX.currency")}</label>
          <select value={form.currency} disabled={!!form._id} onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value }))}>
            <option value="USD">$ USD</option>
            <option value="KHR">៛ KHR</option>
          </select>
        </div>
      </div>
      <div className="filter-row" style={{ marginBottom: 0 }}>
        <div className="field" style={{ flex: 1, minWidth: 160 }}>
          <label>🛑 {t("invest.monthlyLossLimit")}</label>
          <input type="number" min="0" step="any" value={form.monthlyLossLimit} onChange={(e) => setForm((p) => ({ ...p, monthlyLossLimit: e.target.value }))} placeholder={t("invest.noLimit")} />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 160 }}>
          <label>🎯 {t("invest.dailyStakeLimit")}</label>
          <input type="number" min="0" step="any" value={form.dailyStakeLimit} onChange={(e) => setForm((p) => ({ ...p, dailyStakeLimit: e.target.value }))} placeholder={t("invest.noLimit")} />
        </div>
      </div>
      <p className="mini-empty" style={{ margin: "0 0 8px" }}>{t("invest.limitHelp")}</p>
      <div className="field">
        <label>{t("finance.note")}</label>
        <input value={form.note} onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))} />
      </div>
      {err && <div className="error-text">{err}</div>}
      <div style={{ display: "flex", gap: 10 }}>
        <button className="btn btn-primary">{t("common.save")}</button>
        <button type="button" className="btn btn-outline" onClick={() => setForm(null)}>{t("common.cancel")}</button>
      </div>
    </form>
  );

  if (current && !form) {
    return (
      <Detail
        inv={current}
        onBack={() => setOpen(null)}
        onEdit={() =>
          setForm({
            ...current,
            monthlyLossLimit: current.monthlyLossLimit ? String(current.monthlyLossLimit) : "",
            dailyStakeLimit: current.dailyStakeLimit ? String(current.dailyStakeLimit) : "",
          })
        }
        onChanged={load}
        onDeleted={() => {
          setOpen(null);
          load();
        }}
      />
    );
  }

  return (
    <>
      <div className="stat-grid">
        <StatTile label={t("invest.totalPnl")} value={signedUSD(data.totals.pnlUSD)} sub={approxKHR(Math.abs(data.totals.pnlUSD))} tone={tone(data.totals.pnlUSD)} />
        <StatTile label={t("invest.monthPnl")} value={signedUSD(data.totals.monthPnlUSD)} tone={tone(data.totals.monthPnlUSD)} />
        <StatTile label={t("invest.todayPnl")} value={signedUSD(data.totals.todayPnlUSD)} tone={tone(data.totals.todayPnlUSD)} />
        <StatTile label={t("invest.moneyInside")} value={formatUSD(data.totals.balanceUSD)} sub={`${t("invest.myMoneyIn")} ${formatUSD(data.totals.netPutInUSD)}`} />
      </div>
      <p className="mini-empty">{t("invest.intro")}</p>

      {formView || (
        <button className="btn btn-primary" style={{ marginBottom: 16 }} onClick={() => { setErr(""); setForm(blankInv()); }}>
          ➕ {t("invest.new")}
        </button>
      )}

      {active.length === 0 && !form && <p className="mini-empty">{t("invest.none")}</p>}
      <div className="package-grid">
        {data.investments.map((i) => (
          <div key={i._id} className={`card invest-card ${i.archived ? "closed" : ""} ${i.stats.overMonthlyLimit ? "over" : ""}`} onClick={() => setOpen(i._id)}>
            <div className="package-card-head">
              <h3>{INVEST_KINDS[i.kind]} {i.name}</h3>
              <div className={`package-price pnl ${tone(i.stats.pnl) || ""}`}>{signed(i.stats.pnl, i.currency)}</div>
            </div>
            <div className="invest-mini">
              <span>{t("invest.thisMonth")}: <b className={`pnl ${tone(i.stats.monthPnl) || ""}`}>{signed(i.stats.monthPnl, i.currency)}</b></span>
              <span>{t("invest.today")}: <b className={`pnl ${tone(i.stats.todayPnl) || ""}`}>{signed(i.stats.todayPnl, i.currency)}</b></span>
              <span>🟢 {i.stats.winDays} · 🔴 {i.stats.lossDays}</span>
              <span>{t("invest.balance")}: {fmtMoney(i.stats.balance, i.currency)}</span>
            </div>
            {i.monthlyLossLimit > 0 && <LimitBar inv={i} />}
            <button className="btn btn-outline" style={{ marginTop: 10 }}>{t("invest.openRecord")} →</button>
          </div>
        ))}
      </div>
    </>
  );
}

function LimitBar({ inv }) {
  const { t } = useLanguage();
  const pct = Math.min(Math.round((inv.stats.monthLoss / inv.monthlyLossLimit) * 100), 100);
  return (
    <div className={`invest-limit ${inv.stats.overMonthlyLimit ? "over" : inv.stats.nearMonthlyLimit ? "near" : ""}`}>
      <div className="invest-limit-text">
        🛑 {t("invest.lossThisMonth")} {fmtMoney(inv.stats.monthLoss, inv.currency)} / {fmtMoney(inv.monthlyLossLimit, inv.currency)}
      </div>
      <div className="fin-progress"><div style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

// Daily bars: up = win (green), down = loss (red)
function PnlBars({ daily, currency }) {
  const max = Math.max(1, ...daily.map((d) => Math.abs(d.pnl)));
  return (
    <div className="pnl-bars">
      {daily.map((d, i) => (
        <div key={d.date} className="pnl-col" title={`${dmy(d.date)}: ${signed(d.pnl, currency)}`}>
          <div className="pnl-half up">{d.pnl > 0 && <div style={{ height: `${(d.pnl / max) * 100}%` }} />}</div>
          <div className="pnl-half down">{d.pnl < 0 && <div style={{ height: `${(-d.pnl / max) * 100}%` }} />}</div>
          <small>{(i + 1) % 5 === 1 ? i + 1 : ""}</small>
        </div>
      ))}
    </div>
  );
}

// Running total of profit/loss over time.
function CumLine({ points, currency }) {
  if (points.length < 2) return null;
  const W = 600, H = 140, P = 6;
  const vals = points.map((p) => p.pnl);
  const min = Math.min(0, ...vals), max = Math.max(0, ...vals);
  const span = max - min || 1;
  const x = (i) => P + (i / (points.length - 1)) * (W - 2 * P);
  const y = (v) => P + (1 - (v - min) / span) * (H - 2 * P);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.pnl).toFixed(1)}`).join(" ");
  const last = vals[vals.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="cum-line" preserveAspectRatio="none">
      <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="#bbb" strokeDasharray="4 4" />
      <path d={d} fill="none" stroke={last >= 0 ? "#2e7d4f" : "#b3392b"} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
      <title>{signed(last, currency)}</title>
    </svg>
  );
}

function Detail({ inv: invProp, onBack, onEdit, onChanged, onDeleted }) {
  const { t } = useLanguage();
  const [month, setMonth] = useState(ymd().slice(0, 7));
  const [d, setD] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [entry, setEntry] = useState({ win: true, amount: "", stake: "", date: ymd(), note: "" });
  const [move, setMove] = useState(null); // { type: deposit|withdraw, amount, account, date, note }
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const load = async () => {
    try {
      const { data } = await api.get(`/finance/invest/${invProp._id}/entries?month=${month}`);
      setD(data);
    } catch {
      setD(false);
    }
  };
  useEffect(() => {
    load();
  }, [month, invProp._id]);
  useEffect(() => {
    api.get("/finance/accounts").then(({ data }) => setAccounts(data.accounts.filter((a) => !a.archived))).catch(() => {});
  }, []);

  if (d === null) return <p>{t("common.loading")}</p>;
  if (d === false) return <p className="error-text">{t("finance.failedToLoad")}</p>;
  const inv = d.investment;
  const s = inv.stats;
  const cur = inv.currency;
  const sym = cur === "KHR" ? "៛" : "$";

  const addResult = async (e) => {
    e.preventDefault();
    setMsg("");
    if (!(Number(entry.amount) >= 0) || entry.amount === "") return setMsg(t("finance.enterAmount"));
    setSaving(true);
    try {
      await api.post(`/finance/invest/${inv._id}/entries`, { type: "result", ...entry });
      setEntry((p) => ({ ...p, amount: "", stake: "", note: "" }));
      await load();
      onChanged();
    } catch (e2) {
      setMsg(e2.response?.data?.message || t("finance.failedToSave"));
    } finally {
      setSaving(false);
    }
  };
  const saveMove = async (e) => {
    e.preventDefault();
    if (!(Number(move.amount) > 0)) return;
    try {
      await api.post(`/finance/invest/${inv._id}/entries`, move);
      setMove(null);
      await load();
      onChanged();
    } catch (e2) {
      alert(e2.response?.data?.message || t("finance.failedToSave"));
    }
  };
  const delEntry = async (en) => {
    if (!confirm(t("finance.confirmDelete"))) return;
    await api.delete(`/finance/invest/${inv._id}/entries/${en._id}`).catch(() => {});
    await load();
    onChanged();
  };
  const archive = async () => {
    await api.put(`/finance/invest/${inv._id}`, { archived: !inv.archived }).catch(() => {});
    onChanged();
    load();
  };
  const remove = async () => {
    if (!confirm(t("invest.confirmDelete").replace("{n}", inv.name))) return;
    await api.delete(`/finance/invest/${inv._id}`).catch(() => {});
    onDeleted();
  };

  const stakeAfter = (s.todayStaked || 0) + (Number(entry.stake) || 0);
  const dailyStakeWarn = inv.dailyStakeLimit > 0 && entry.date === ymd() && stakeAfter > inv.dailyStakeLimit;

  return (
    <div className="invest-detail">
      <div className="invest-head">
        <button className="link-btn" onClick={onBack}>← {t("invest.all")}</button>
        <h3>{INVEST_KINDS[inv.kind]} {inv.name}</h3>
        <span className="invest-head-actions">
          <button className="link-btn" onClick={onEdit}>✏️</button>
          <button className="link-btn" onClick={archive}>{inv.archived ? t("finance.resume") : t("financeX.archive")}</button>
          <button className="link-btn" onClick={remove}>🗑</button>
        </span>
      </div>

      {/* Limits */}
      {inv.kind === "betting" && !(inv.monthlyLossLimit > 0) && (
        <div className="invest-suggest">
          🛑 {t("invest.suggestLimit")} <button className="link-btn" onClick={onEdit}>{t("invest.setLimit")}</button>
        </div>
      )}
      {s.overMonthlyLimit && <div className="invest-warn">⛔ {t("invest.overLimit").replace("{amt}", fmtMoney(inv.monthlyLossLimit, cur))}</div>}
      {!s.overMonthlyLimit && s.nearMonthlyLimit && <div className="invest-warn near">⚠️ {t("invest.nearLimit")}</div>}
      {s.currentLossRun >= 3 && <div className="invest-warn near">📉 {t("invest.lossRun").replace("{n}", s.currentLossRun)}</div>}

      <div className="stat-grid">
        <StatTile label={t("invest.totalPnl")} value={signed(s.pnl, cur)} sub={s.roi !== null ? `${t("invest.roi")} ${s.roi > 0 ? "+" : ""}${s.roi}%` : ""} tone={tone(s.pnl)} />
        <StatTile label={t("invest.monthPnl")} value={signed(s.monthPnl, cur)} sub={s.monthStaked ? `${t("invest.staked")} ${fmtMoney(s.monthStaked, cur)}` : ""} tone={tone(s.monthPnl)} />
        <StatTile label={t("invest.winLossDays")} value={`🟢 ${s.winDays} · 🔴 ${s.lossDays}`} sub={s.winRate !== null ? `${t("invest.winRate")} ${s.winRate}% · ${t("invest.worstRun")} ${s.worstRun}` : ""} />
        <StatTile label={t("invest.balance")} value={fmtMoney(s.balance, cur)} sub={`${t("invest.myMoneyIn")} ${fmtMoney(s.netPutIn, cur)}`} />
      </div>
      {inv.monthlyLossLimit > 0 && <LimitBar inv={inv} />}

      {/* Today's result */}
      <form className="card fin-form invest-entry" onSubmit={addResult}>
        <h4 style={{ margin: "0 0 10px" }}>📝 {t("invest.recordResult")}</h4>
        <div className="seg-toggle fin-type" style={{ marginBottom: 10 }}>
          <button type="button" className={entry.win ? "active income" : ""} onClick={() => setEntry((p) => ({ ...p, win: true }))}>🟢 {t("invest.win")}</button>
          <button type="button" className={!entry.win ? "active expense" : ""} onClick={() => setEntry((p) => ({ ...p, win: false }))}>🔴 {t("invest.loss")}</button>
        </div>
        <div className="filter-row" style={{ marginBottom: 0 }}>
          <div className="field" style={{ flex: 1, minWidth: 130 }}>
            <label>{entry.win ? t("invest.wonAmount") : t("invest.lostAmount")} ({sym})</label>
            <input type="number" min="0" step="any" value={entry.amount} onChange={(e) => setEntry((p) => ({ ...p, amount: e.target.value }))} autoFocus />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 130 }}>
            <label>{t("invest.stakeOptional")} ({sym})</label>
            <input type="number" min="0" step="any" value={entry.stake} onChange={(e) => setEntry((p) => ({ ...p, stake: e.target.value }))} />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 140 }}>
            <label>{t("finance.date")}</label>
            <input type="date" value={entry.date} onChange={(e) => setEntry((p) => ({ ...p, date: e.target.value }))} />
          </div>
          <div className="field" style={{ flex: 2, minWidth: 160 }}>
            <label>{t("finance.note")}</label>
            <input value={entry.note} onChange={(e) => setEntry((p) => ({ ...p, note: e.target.value }))} placeholder={t("invest.notePh")} />
          </div>
        </div>
        {dailyStakeWarn && <div className="invest-warn near">⚠️ {t("invest.overDailyStake").replace("{amt}", fmtMoney(inv.dailyStakeLimit, cur))}</div>}
        {msg && <div className="error-text">{msg}</div>}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button className="btn btn-primary" disabled={saving}>{t("common.save")}</button>
          <button type="button" className="btn btn-outline" onClick={() => setMove({ type: "deposit", amount: "", account: "", date: ymd(), note: "" })}>⬇ {t("invest.deposit")}</button>
          <button type="button" className="btn btn-outline" onClick={() => setMove({ type: "withdraw", amount: "", account: "", date: ymd(), note: "" })}>⬆ {t("invest.withdraw")}</button>
        </div>
      </form>

      {move && (
        <form className="card fin-form" onSubmit={saveMove} style={{ maxWidth: 720 }}>
          <h4 style={{ margin: "0 0 8px" }}>{move.type === "deposit" ? `⬇ ${t("invest.deposit")}` : `⬆ ${t("invest.withdraw")}`}</h4>
          <div className="filter-row" style={{ marginBottom: 0 }}>
            <div className="field" style={{ flex: 1, minWidth: 120 }}>
              <label>{t("financeX.amount")} ({sym})</label>
              <input type="number" min="0" step="any" value={move.amount} onChange={(e) => setMove((p) => ({ ...p, amount: e.target.value }))} autoFocus />
            </div>
            {accounts.length > 0 && (
              <div className="field" style={{ flex: 1, minWidth: 150 }}>
                <label>{move.type === "deposit" ? t("financeX.fromAccount") : t("financeX.intoAccount")}</label>
                <select value={move.account} onChange={(e) => setMove((p) => ({ ...p, account: e.target.value }))}>
                  <option value="">— {t("financeX.noAccount")} —</option>
                  {accounts.map((a) => <option key={a._id} value={a._id}>{ACCOUNT_ICON[a.kind]} {a.name}</option>)}
                </select>
              </div>
            )}
            <div className="field" style={{ flex: 1, minWidth: 140 }}>
              <label>{t("finance.date")}</label>
              <input type="date" value={move.date} onChange={(e) => setMove((p) => ({ ...p, date: e.target.value }))} />
            </div>
          </div>
          <p className="mini-empty" style={{ margin: "0 0 8px" }}>{t("invest.moveHelp")}</p>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-primary">{t("common.save")}</button>
            <button type="button" className="btn btn-outline" onClick={() => setMove(null)}>{t("common.cancel")}</button>
          </div>
        </form>
      )}

      {/* Month chart + list */}
      <div className="month-switch">
        <button type="button" className="btn btn-outline" onClick={() => setMonth(shiftMonth(month, -1))}>◀</button>
        <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        <button type="button" className="btn btn-outline" onClick={() => setMonth(shiftMonth(month, 1))}>▶</button>
      </div>
      <div className="card" style={{ padding: 14, marginBottom: 14 }}>
        <h4 style={{ margin: "0 0 8px" }}>{t("invest.dailyChart")}</h4>
        <PnlBars daily={d.daily} currency={cur} />
        {d.cumulative.length > 1 && (
          <>
            <h4 style={{ margin: "14px 0 6px" }}>{t("invest.runningTotal")}: <span className={`pnl ${tone(s.pnl) || ""}`}>{signed(s.pnl, cur)}</span></h4>
            <CumLine points={d.cumulative} currency={cur} />
            <div className="cum-axis"><span>{dmy(d.cumulative[0].date)}</span><span>{dmy(d.cumulative[d.cumulative.length - 1].date)}</span></div>
          </>
        )}
        {(s.bestDay || s.worstDay) && (
          <p className="mini-empty" style={{ margin: "8px 0 0" }}>
            {s.bestDay && <>🏆 {t("invest.bestDay")} {dmy(s.bestDay.date)} {signed(s.bestDay.amount, cur)} · </>}
            {s.worstDay && <>💥 {t("invest.worstDay")} {dmy(s.worstDay.date)} {signed(s.worstDay.amount, cur)}</>}
          </p>
        )}
      </div>

      <h4>{t("invest.entries")} ({d.entries.length})</h4>
      {d.entries.length === 0 ? (
        <p className="mini-empty">{t("invest.noEntries")}</p>
      ) : (
        <ul className="package-items card" style={{ padding: 12 }}>
          {d.entries.map((en) => (
            <li key={en._id}>
              <span>
                {fmtDate(en.date)}{" "}
                {en.type === "result" ? (en.amount >= 0 ? "🟢" : "🔴") : en.type === "deposit" ? `⬇ ${t("invest.deposit")}` : `⬆ ${t("invest.withdraw")}`}
                {en.stake > 0 && <small className="mini-empty"> · {t("invest.staked")} {fmtMoney(en.stake, cur)}</small>}
                {en.note && <small className="mini-empty"> · {en.note}</small>}
              </span>
              <span>
                <b className={en.type === "result" ? `pnl ${tone(en.amount) || ""}` : ""}>
                  {en.type === "result" ? signed(en.amount, cur) : fmtMoney(en.amount, cur)}
                </b>{" "}
                <button className="link-btn" onClick={() => delEntry(en)}>✕</button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

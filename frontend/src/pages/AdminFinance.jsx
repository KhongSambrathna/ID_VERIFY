import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../api/axios";
import { useLanguage } from "../i18n/LanguageContext";
import { formatUSD, approxKHR } from "../utils/currency";
import { BarChart, StatTile } from "../components/MiniCharts";
import { AccountsTab, ReceivablesTab, ACCOUNT_ICON } from "../components/FinanceExtras";

// ---- helpers --------------------------------------------------------------
const TZ = "Asia/Phnom_Penh";
const ymd = (d = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(d));
const thisMonth = () => ymd().slice(0, 7);
function shiftMonth(ym, n) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function fmtMoney(amount, currency) {
  if (currency === "KHR") return `៛${Math.round(Number(amount) || 0).toLocaleString("en-US")}`;
  return formatUSD(amount);
}
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-GB", { timeZone: TZ }) : "");

// Category keys → labels come from i18n ("finance.cat_food", …).
const EXPENSE_CATS = ["food", "transport", "phone", "rent", "utilities", "family", "health", "education", "shopping", "fun", "football", "debt", "other"];
const INCOME_CATS = ["salary", "football", "shop", "bonus", "gift", "other"];
const CAT_ICON = {
  food: "🍚", transport: "⛽", phone: "📱", rent: "🏠", utilities: "💡", family: "👨‍👩‍👧", health: "💊", education: "📚",
  shopping: "🛍", fun: "🎉", football: "⚽", debt: "💳", other: "📦", salary: "💼", shop: "🏪", bonus: "⭐", gift: "🎁", transfer: "🔁",
};

// Personal money for the Admin: daily income & expenses, debts, and the
// expected monthly income/expenses — with plan vs actual for each month.
// Everything here is private to the signed-in Admin account.
export default function AdminFinance() {
  const { t } = useLanguage();
  const [params, setParams] = useSearchParams();
  const tab = ["overview", "daily", "money", "owed", "debts", "plan"].includes(params.get("tab")) ? params.get("tab") : "overview";
  const setTab = (k) => setParams(k === "overview" ? {} : { tab: k }, { replace: true });
  const [month, setMonth] = useState(thisMonth());
  const catLabel = (c) => `${CAT_ICON[c] || "📦"} ${t(`finance.cat_${c}`, c)}`;

  return (
    <div className="container dash-body">
      <div className="dash-header">
        <h2>💰 {t("finance.title")}</h2>
        <p>{t("finance.intro")}</p>
      </div>

      <div className="tabs">
        {[
          ["overview", `📊 ${t("finance.tabOverview")}`],
          ["daily", `📝 ${t("finance.tabDaily")}`],
          ["money", `💼 ${t("financeX.tabMoney")}`],
          ["owed", `🤝 ${t("financeX.tabOwed")}`],
          ["debts", `💳 ${t("finance.tabDebts")}`],
          ["plan", `🗓 ${t("finance.tabPlan")}`],
        ].map(([k, label]) => (
          <button key={k} className={`tab-btn ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      {(tab === "overview" || tab === "daily") && (
        <div className="month-switch">
          <button type="button" className="btn btn-outline" onClick={() => setMonth(shiftMonth(month, -1))}>◀</button>
          <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
          <button type="button" className="btn btn-outline" onClick={() => setMonth(shiftMonth(month, 1))}>▶</button>
          {month !== thisMonth() && (
            <button type="button" className="link-btn" onClick={() => setMonth(thisMonth())}>{t("finance.thisMonth")}</button>
          )}
        </div>
      )}

      {tab === "overview" && <Overview month={month} catLabel={catLabel} />}
      {tab === "daily" && <Daily month={month} catLabel={catLabel} />}
      {tab === "money" && <AccountsTab />}
      {tab === "owed" && <ReceivablesTab onOpenDebts={() => setTab("debts")} />}
      {tab === "debts" && <Debts />}
      {tab === "plan" && <Plan catLabel={catLabel} />}
    </div>
  );
}

// ---- Overview -------------------------------------------------------------
function Overview({ month, catLabel }) {
  const { t } = useLanguage();
  const [s, setS] = useState(null);
  useEffect(() => {
    setS(null);
    api.get(`/finance/summary?month=${month}`).then(({ data }) => setS(data)).catch(() => setS(false));
  }, [month]);
  const chart = useMemo(
    () => (s?.series || []).map((d) => ({ label: d.day.slice(8), values: [d.income, d.expense] })),
    [s]
  );
  if (s === null) return <p>{t("common.loading")}</p>;
  if (s === false) return <p className="error-text">{t("finance.failedToLoad")}</p>;
  const tone = (n) => (n >= 0 ? "ok" : "bad");

  return (
    <>
      <div className="stat-grid">
        {s.accountCount > 0 && <StatTile label={`💼 ${t("financeX.moneyNow")}`} value={formatUSD(s.moneyNowUSD)} sub={approxKHR(s.moneyNowUSD)} tone="ok" />}
        <StatTile label={t("finance.income")} value={formatUSD(s.income)} sub={`${t("finance.planned")} ${formatUSD(s.plannedIncome)}`} tone="ok" />
        <StatTile label={t("finance.expense")} value={formatUSD(s.expense)} sub={`${t("finance.planned")} ${formatUSD(s.plannedExpense + s.monthlyDebtPayments)}`} tone="bad" />
        <StatTile label={t("finance.net")} value={formatUSD(s.net)} sub={approxKHR(s.net)} tone={tone(s.net)} />
        <StatTile
          label={t("finance.projectedNet")}
          value={formatUSD(s.projectedNet)}
          sub={`${t("finance.monthElapsed").replace("{pct}", s.monthElapsedPct)}`}
          tone={tone(s.projectedNet)}
        />
        <StatTile
          label={t("finance.debtOwe")}
          value={formatUSD(s.debts.oweUSD)}
          sub={`${t("finance.interestPerMonth")} ${formatUSD(s.debts.monthlyInterestUSD)}`}
          tone={s.debts.oweUSD > 0 ? "bad" : "ok"}
        />
        <StatTile label={t("finance.debtLend")} value={formatUSD(s.debts.lendUSD)} sub={`${s.debts.openLend} ${t("finance.people")}`} />
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>{t("finance.dailyChart")}</h3>
        <BarChart
          data={chart}
          format={formatUSD}
          keys={[
            { name: t("finance.income"), color: "var(--ok)" },
            { name: t("finance.expense"), color: "var(--bad)" },
          ]}
        />
      </div>

      <div className="report-two-col">
        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>{t("finance.planVsActual")}</h3>
          {s.categories.length === 0 && <p className="mini-empty">{t("finance.noData")}</p>}
          {["income", "expense"].map((type) => {
            const rows = s.categories.filter((c) => c.type === type);
            if (!rows.length) return null;
            return (
              <div key={type} style={{ marginBottom: 12 }}>
                <h4 style={{ margin: "6px 0" }}>{type === "income" ? `⬇ ${t("finance.income")}` : `⬆ ${t("finance.expense")}`}</h4>
                {rows.map((c) => {
                  const pct = c.planned > 0 ? Math.round((c.actual / c.planned) * 100) : null;
                  const over = type === "expense" && pct !== null && pct > 100;
                  return (
                    <div className="fin-cat-row" key={c.category}>
                      <div className="fin-cat-top">
                        <span>{catLabel(c.category)}</span>
                        <span>
                          <b>{formatUSD(c.actual)}</b>
                          {c.planned > 0 && <small> / {formatUSD(c.planned)}</small>}
                        </span>
                      </div>
                      {c.planned > 0 && (
                        <div className="hbar-track">
                          <div
                            className="hbar-fill"
                            style={{
                              width: `${Math.min(pct, 100)}%`,
                              background: over ? "var(--bad)" : type === "income" ? "var(--ok)" : "var(--gold)",
                            }}
                          />
                        </div>
                      )}
                      {over && <small style={{ color: "var(--bad)" }}>{t("finance.overBudget").replace("{amt}", formatUSD(c.actual - c.planned))}</small>}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>{t("finance.monthPlan")}</h3>
          <div className="kv-list">
            <div><span>{t("finance.expectedIncome")}</span><b style={{ color: "var(--ok)" }}>{formatUSD(s.plannedIncome)}</b></div>
            <div><span>{t("finance.expectedExpense")}</span><b>{formatUSD(s.plannedExpense)}</b></div>
            <div><span>{t("finance.debtPayments")}</span><b>{formatUSD(s.monthlyDebtPayments)}</b></div>
            <div>
              <span>{t("finance.expectedLeftover")}</span>
              <b style={{ color: s.plannedNet >= 0 ? "var(--ok)" : "var(--bad)" }}>{formatUSD(s.plannedNet)}</b>
            </div>
          </div>
          <h4 style={{ marginBottom: 6 }}>{t("finance.upcomingPayments")}</h4>
          {s.debts.upcoming.length === 0 ? (
            <p className="mini-empty">{t("finance.noUpcoming")}</p>
          ) : (
            <ul className="low-stock-list">
              {s.debts.upcoming.map((d) => (
                <li key={d._id}>
                  <span>
                    💳 {d.party}
                    {d.paymentDay > 0 && <small className="mini-empty"> · {t("finance.everyDay").replace("{d}", d.paymentDay)}</small>}
                  </span>
                  <b>{d.monthlyPayment > 0 ? fmtMoney(d.monthlyPayment, d.currency) : fmtMoney(d.remaining, d.currency)}</b>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

// ---- Daily log ------------------------------------------------------------
const blankTxn = () => ({ type: "expense", amount: "", currency: "USD", category: "food", method: "cash", account: "", date: ymd(), note: "" });

function Daily({ month, catLabel }) {
  const { t } = useLanguage();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [f, setF] = useState(blankTxn());
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("");
  const [accounts, setAccounts] = useState([]);
  useEffect(() => {
    api
      .get("/finance/accounts")
      .then(({ data }) => {
        const list = data.accounts.filter((a) => !a.archived);
        setAccounts(list);
        // Pre-pick the account used last time (or the first one) so new
        // income/expenses move a balance unless I choose "no account".
        let last = "";
        try { last = localStorage.getItem("fin.lastAccount") || ""; } catch { /* ignore */ }
        const pick = list.find((x) => x._id === last) || list[0];
        if (pick && last !== "none") setF((p) => (p.account || editId ? p : { ...p, account: pick._id }));
      })
      .catch(() => {});
  }, []);
  const accName = (id) => {
    const a = accounts.find((x) => x._id === id);
    return a ? `${ACCOUNT_ICON[a.kind]} ${a.name}` : "";
  };

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/finance/txns?month=${month}`);
      setRows(data);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, [month]);

  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const cats = f.type === "income" ? INCOME_CATS : EXPENSE_CATS;

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    if (!(Number(f.amount) > 0)) return setErr(t("finance.enterAmount"));
    setSaving(true);
    try {
      if (editId) await api.put(`/finance/txns/${editId}`, f);
      else await api.post("/finance/txns", f);
      try { localStorage.setItem("fin.lastAccount", f.account || "none"); } catch { /* ignore */ }
      setF({ ...blankTxn(), type: f.type, category: f.type === "income" ? "salary" : f.category, currency: f.currency, date: f.date, account: f.account });
      setEditId(null);
      load();
    } catch (e2) {
      setErr(e2.response?.data?.message || t("finance.failedToSave"));
    } finally {
      setSaving(false);
    }
  };
  const startEdit = (r) => {
    setEditId(r._id);
    setF({ type: r.type, amount: String(r.amount), currency: r.currency, category: r.category, method: r.method, account: r.account || "", date: ymd(r.date), note: r.note });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const remove = async (r) => {
    if (!confirm(t("finance.confirmDelete"))) return;
    try {
      await api.delete(`/finance/txns/${r._id}`);
      load();
    } catch (e2) {
      alert(e2.response?.data?.message || t("finance.failedToSave"));
    }
  };

  const shown = filter ? rows.filter((r) => r.type === filter) : rows;
  const byDay = useMemo(() => {
    const m = new Map();
    shown.forEach((r) => {
      const k = ymd(r.date);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    });
    return [...m.entries()];
  }, [shown]);
  // Transfers between my own accounts aren't income or spending.
  const real = rows.filter((r) => r.category !== "transfer");
  const totIn = real.filter((r) => r.type === "income").reduce((s, r) => s + r.amountUSD, 0);
  const totOut = real.filter((r) => r.type === "expense").reduce((s, r) => s + r.amountUSD, 0);

  return (
    <>
      <form className="card fin-form" onSubmit={submit}>
        <div className="seg-toggle fin-type">
          <button type="button" className={f.type === "expense" ? "active expense" : ""} onClick={() => setF((p) => ({ ...p, type: "expense", category: "food" }))}>
            ⬆ {t("finance.expense")}
          </button>
          <button type="button" className={f.type === "income" ? "active income" : ""} onClick={() => setF((p) => ({ ...p, type: "income", category: "salary" }))}>
            ⬇ {t("finance.income")}
          </button>
        </div>
        <div className="fin-amount-row">
          <input className="fin-amount" type="number" min="0" step={f.currency === "KHR" ? "100" : "0.01"} value={f.amount} onChange={set("amount")} placeholder="0" autoFocus />
          <div className="seg-toggle">
            <button type="button" className={f.currency === "USD" ? "active" : ""} onClick={() => setF((p) => ({ ...p, currency: "USD" }))}>$</button>
            <button type="button" className={f.currency === "KHR" ? "active" : ""} onClick={() => setF((p) => ({ ...p, currency: "KHR" }))}>៛</button>
          </div>
        </div>
        <div className="fin-cats">
          {cats.map((c) => (
            <button type="button" key={c} className={`fin-cat ${f.category === c ? "active" : ""}`} onClick={() => setF((p) => ({ ...p, category: c }))}>
              {catLabel(c)}
            </button>
          ))}
        </div>
        <div className="filter-row" style={{ marginBottom: 0 }}>
          <div className="field" style={{ flex: 1, minWidth: 140 }}>
            <label>{t("finance.date")}</label>
            <input type="date" value={f.date} onChange={set("date")} />
          </div>
          {accounts.length > 0 ? (
            <div className="field" style={{ flex: 1, minWidth: 150 }}>
              <label>{f.type === "income" ? t("financeX.intoAccount") : t("financeX.fromAccount")}</label>
              <select value={f.account} onChange={set("account")}>
                <option value="">— {t("financeX.noAccount")} —</option>
                {accounts.map((a) => (
                  <option key={a._id} value={a._id}>{ACCOUNT_ICON[a.kind]} {a.name}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="field" style={{ flex: 1, minWidth: 120 }}>
              <label>{t("finance.method")}</label>
              <select value={f.method} onChange={set("method")}>
                <option value="cash">💵 {t("finance.method_cash")}</option>
                <option value="bank">🏦 {t("finance.method_bank")}</option>
                <option value="other">{t("finance.method_other")}</option>
              </select>
            </div>
          )}
          <div className="field" style={{ flex: 2, minWidth: 180 }}>
            <label>{t("finance.note")}</label>
            <input value={f.note} onChange={set("note")} placeholder={t("finance.notePh")} />
          </div>
        </div>
        {err && <div className="error-text">{err}</div>}
        <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
          <button className="btn btn-primary" disabled={saving}>{saving ? t("common.saving") : editId ? t("common.save") : t("finance.add")}</button>
          {editId && (
            <button type="button" className="btn btn-outline" onClick={() => { setEditId(null); setF(blankTxn()); }}>{t("common.cancel")}</button>
          )}
        </div>
      </form>

      <div className="fin-month-tot">
        <span>⬇ {t("finance.income")}: <b style={{ color: "var(--ok)" }}>{formatUSD(totIn)}</b></span>
        <span>⬆ {t("finance.expense")}: <b style={{ color: "var(--bad)" }}>{formatUSD(totOut)}</b></span>
        <span>= <b>{formatUSD(totIn - totOut)}</b></span>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">{t("finance.all")}</option>
          <option value="income">{t("finance.income")}</option>
          <option value="expense">{t("finance.expense")}</option>
        </select>
      </div>

      {loading ? (
        <p>{t("common.loading")}</p>
      ) : byDay.length === 0 ? (
        <p className="mini-empty">{t("finance.noEntries")}</p>
      ) : (
        byDay.map(([d, list]) => {
          const inc = list.filter((r) => r.type === "income" && r.category !== "transfer").reduce((s, r) => s + r.amountUSD, 0);
          const exp = list.filter((r) => r.type === "expense" && r.category !== "transfer").reduce((s, r) => s + r.amountUSD, 0);
          return (
            <div className="fin-day" key={d}>
              <div className="fin-day-head">
                <b>{fmtDate(d + "T12:00:00+07:00")}</b>
                <span>
                  {inc > 0 && <span style={{ color: "var(--ok)" }}>+{formatUSD(inc)} </span>}
                  {exp > 0 && <span style={{ color: "var(--bad)" }}>−{formatUSD(exp)}</span>}
                </span>
              </div>
              {list.map((r) => (
                <div className="fin-row" key={r._id}>
                  <span className="fin-row-cat">{catLabel(r.category)}</span>
                  <span className="fin-row-note">
                    {r.note}
                    {r.account ? <small className="mini-empty"> · {accName(r.account)}</small> : r.method === "bank" && <small> 🏦</small>}
                  </span>
                  <b className={r.type === "income" ? "fin-in" : "fin-out"}>
                    {r.type === "income" ? "+" : "−"}
                    {fmtMoney(r.amount, r.currency)}
                  </b>
                  <span className="fin-row-actions">
                    {!r.debt && r.category !== "transfer" && <button className="link-btn" onClick={() => startEdit(r)}>✏️</button>}
                    <button className="link-btn" onClick={() => remove(r)}>🗑</button>
                  </span>
                </div>
              ))}
            </div>
          );
        })
      )}
    </>
  );
}

// ---- Debts ----------------------------------------------------------------
const blankDebt = () => ({
  direction: "owe", repayType: "fixed", party: "", phone: "", amount: "", currency: "USD", interestRate: "", monthlyPayment: "",
  paymentDay: "", startDate: ymd(), dueDate: "", note: "", autoPay: true, payAccount: "",
});

function Debts() {
  const { t } = useLanguage();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null); // null | { ...fields, _id? }
  const [err, setErr] = useState("");
  const [payFor, setPayFor] = useState(null);
  const [pay, setPay] = useState({ amount: "", date: ymd(), note: "", account: "" });
  const [accounts, setAccounts] = useState([]);
  useEffect(() => {
    api.get("/finance/accounts").then(({ data }) => setAccounts(data.accounts.filter((a) => !a.archived))).catch(() => {});
  }, []);
  const [openHist, setOpenHist] = useState(null);
  const [showClosed, setShowClosed] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get("/finance/debts");
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

  const setD = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));
  const save = async (e) => {
    e.preventDefault();
    setErr("");
    if (!form.party.trim()) return setErr(t("finance.enterParty"));
    if (!(Number(form.amount) > 0)) return setErr(t("finance.enterAmount"));
    try {
      if (form._id) await api.put(`/finance/debts/${form._id}`, form);
      else await api.post("/finance/debts", form);
      setForm(null);
      load();
    } catch (e2) {
      setErr(e2.response?.data?.message || t("finance.failedToSave"));
    }
  };
  const edit = (d) =>
    setForm({
      _id: d._id, direction: d.direction, repayType: d.repayType || "fixed", party: d.party, phone: d.phone || "", amount: String(d.amount), currency: d.currency,
      interestRate: d.interestRate ? String(d.interestRate) : "", monthlyPayment: d.monthlyPayment ? String(d.monthlyPayment) : "",
      paymentDay: d.paymentDay ? String(d.paymentDay) : "", startDate: d.startDate ? ymd(d.startDate) : "",
      dueDate: d.dueDate ? ymd(d.dueDate) : "", note: d.note || "",
      autoPay: d.autoPay !== false, payAccount: d.payAccount || "",
    });
  const remove = async (d) => {
    if (!confirm(t("finance.confirmDeleteDebt").replace("{p}", d.party))) return;
    await api.delete(`/finance/debts/${d._id}`).catch(() => {});
    load();
  };
  const savePay = async (d) => {
    if (!(Number(pay.amount) > 0)) return alert(t("finance.enterAmount"));
    try {
      await api.post(`/finance/debts/${d._id}/payments`, pay);
      setPayFor(null);
      setPay({ amount: "", date: ymd(), note: "", account: "" });
      load();
    } catch (e2) {
      alert(e2.response?.data?.message || t("finance.failedToSave"));
    }
  };
  const delPay = async (d, p) => {
    if (!confirm(t("finance.confirmDeletePayment"))) return;
    await api.delete(`/finance/debts/${d._id}/payments/${p._id}`).catch(() => {});
    load();
  };

  const owe = list.filter((d) => d.direction === "owe" && !d.closed);
  const lend = list.filter((d) => d.direction === "lend" && !d.closed);
  const closed = list.filter((d) => d.closed);
  const sumUSD = (arr) => arr.reduce((s, d) => s + d.remainingUSD, 0);

  // Plain render function (not a nested component) so the payment inputs
  // keep focus while typing.
  const renderDebt = (d) => {
    const days = d.dueDate ? Math.round((new Date(ymd(d.dueDate) + "T00:00:00+07:00") - new Date(ymd() + "T00:00:00+07:00")) / 86400000) : null;
    return (
      <div key={d._id} className={`card fin-debt ${d.direction} ${d.closed ? "closed" : ""}`}>
        <div className="package-card-head">
          <h3>{d.direction === "owe" ? "💳" : "🤝"} {d.party}</h3>
          <div className="package-price">
            {fmtMoney(d.remaining, d.currency)}
            <small className="price-khr">{t("finance.of")} {fmtMoney(d.amount, d.currency)}</small>
          </div>
        </div>
        <div className="hbar-track" style={{ height: 8, margin: "8px 0" }}>
          <div className="hbar-fill" style={{ width: `${d.progress}%`, background: "var(--ok)" }} />
        </div>
        <div className="plan-meta">
          <div>
            <span className={`badge repay-${d.repayType}`}>{t(`debtType.${d.repayType}`)}</span>
          </div>
          <div>✅ {t("debtType.principalPaid")} {fmtMoney(d.paid, d.currency)} ({d.progress}%)</div>
          {d.interestPaid > 0 && <div>💸 {t("debtType.interestPaid")} {fmtMoney(d.interestPaid, d.currency)}</div>}
          {d.interestRate > 0 && <div>📈 {d.interestRate}%/{t("finance.month")} ≈ {fmtMoney(d.monthlyInterest, d.currency)}/{t("finance.month")}</div>}
          {d.repayType === "interest_only" ? (
            <div>
              🗓 {t("debtType.payInterestMonthly").replace("{amt}", fmtMoney(d.monthlyDue, d.currency))}
              {d.paymentDay > 0 && ` · ${t("finance.everyDay").replace("{d}", d.paymentDay)}`}
              <div className="mini-empty">{t("debtType.principalAtEnd").replace("{amt}", fmtMoney(d.remaining, d.currency))}</div>
            </div>
          ) : (
            d.monthlyPayment > 0 && (
              <div>
                🗓 {fmtMoney(d.monthlyPayment, d.currency)}/{t("finance.month")}
                {d.paymentDay > 0 && ` · ${t("finance.everyDay").replace("{d}", d.paymentDay)}`}
                {d.monthsLeft ? ` · ≈ ${d.monthsLeft} ${t("finance.monthsLeft")}` : ""}
              </div>
            )
          )}
          {d.nextAutoDate && (
            <div className="auto-pay-line">
              🤖 {t("autoPay.next").replace("{d}", fmtDate(d.nextAutoDate)).replace("{amt}", fmtMoney(d.monthlyDue, d.currency))}
              {d.payAccount && accounts.find((a) => a._id === d.payAccount) && (
                <> · {ACCOUNT_ICON[accounts.find((a) => a._id === d.payAccount).kind]} {accounts.find((a) => a._id === d.payAccount).name}</>
              )}
            </div>
          )}
          {d.dueDate && (
            <div>
              ⏰ {t("finance.dueDate")} {fmtDate(d.dueDate)}
              {days !== null && !d.closed && (
                <span className={`badge ${days < 0 ? "rejected" : days <= 7 ? "pending" : ""}`} style={{ marginLeft: 6 }}>
                  {days < 0 ? t("finance.lateBy").replace("{n}", -days) : t("finance.inDays").replace("{n}", days)}
                </span>
              )}
            </div>
          )}
          {d.phone && <div>📞 {d.phone}</div>}
          {d.note && <div>📝 {d.note}</div>}
        </div>

        {payFor === d._id ? (
          <div className="fin-pay">
            <input type="number" min="0" step={d.currency === "KHR" ? "100" : "0.01"} value={pay.amount} onChange={(e) => setPay((p) => ({ ...p, amount: e.target.value }))}
              placeholder={d.currency === "KHR" ? "៛" : "$"} autoFocus />
            <input type="date" value={pay.date} onChange={(e) => setPay((p) => ({ ...p, date: e.target.value }))} />
            <input value={pay.note} onChange={(e) => setPay((p) => ({ ...p, note: e.target.value }))} placeholder={t("finance.note")} />
            {accounts.length > 0 && (
              <select value={pay.account} onChange={(e) => setPay((p) => ({ ...p, account: e.target.value }))}>
                <option value="">— {t("financeX.noAccount")} —</option>
                {accounts.map((a) => (
                  <option key={a._id} value={a._id}>{ACCOUNT_ICON[a.kind]} {a.name}</option>
                ))}
              </select>
            )}
            <select value={pay.split || "auto"} onChange={(e) => setPay((p) => ({ ...p, split: e.target.value }))}>
              <option value="auto">{t("debtType.splitAuto")}</option>
              <option value="interest">{t("debtType.splitInterest")}</option>
              <option value="principal">{t("debtType.splitPrincipal")}</option>
            </select>
            {(() => {
              const amt = Number(pay.amount) || 0;
              const r = (n) => (d.currency === "KHR" ? Math.round(n) : Math.round(n * 100) / 100);
              let i = pay.split === "interest" ? amt : pay.split === "principal" ? 0 : Math.min(amt, d.monthlyInterest || 0);
              if (amt - i > d.remaining) i = amt - d.remaining;
              if (!amt) return null;
              return (
                <small className="mini-empty" style={{ flexBasis: "100%" }}>
                  = 💸 {t("debtType.interest")} {fmtMoney(r(i), d.currency)} + ✅ {t("debtType.principal")} {fmtMoney(r(amt - i), d.currency)}
                </small>
              );
            })()}
            <button className="btn btn-primary" onClick={() => savePay(d)}>{t("common.save")}</button>
            <button className="link-btn" onClick={() => setPayFor(null)}>{t("common.cancel")}</button>
            <small className="mini-empty" style={{ flexBasis: "100%" }}>
              {d.direction === "owe" ? t("finance.payNoteOwe") : t("finance.payNoteLend")}
            </small>
          </div>
        ) : (
          <div className="package-actions">
            {!d.closed && (
              <button className="btn btn-primary" onClick={() => { setPayFor(d._id); setPay({ amount: d.monthlyDue ? String(d.monthlyDue) : "", date: ymd(), note: "", account: "", split: "auto" }); }}>
                {d.direction === "owe" ? `💸 ${t("finance.recordPayment")}` : `💰 ${t("finance.recordRepaid")}`}
              </button>
            )}
            <button className="link-btn" onClick={() => setOpenHist(openHist === d._id ? null : d._id)}>
              📜 {t("finance.history")} ({d.payments.length})
            </button>
            <button className="link-btn" onClick={() => edit(d)}>✏️</button>
            <button className="link-btn" onClick={() => remove(d)}>🗑</button>
          </div>
        )}
        {openHist === d._id && (
          <ul className="package-items">
            {d.payments.length === 0 && <li className="mini-empty">{t("finance.noPayments")}</li>}
            {[...d.payments].reverse().map((p) => (
              <li key={p._id}>
                <span>
                  {fmtDate(p.date)} {p.auto && <span className="badge auto-badge" title={t("autoPay.autoRecorded")}>🤖 {t("autoPay.auto")}</span>}{" "}
                  {p.note && <small className="mini-empty">· {p.note}</small>}
                </span>
                <span>
                  {fmtMoney(p.amount, p.currency)}
                  {p.interest > 0 && (
                    <small className="mini-empty">
                      {" "}({p.interest >= p.amount ? t("debtType.interest") : `${t("debtType.interest")} ${fmtMoney(p.interest, p.currency)}`})
                    </small>
                  )}{" "}
                  <button className="link-btn" onClick={() => delPay(d, p)}>✕</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="stat-grid">
        <StatTile label={t("finance.debtOwe")} value={formatUSD(sumUSD(owe))} sub={`${owe.length} ${t("finance.debtsCount")}`} tone={owe.length ? "bad" : "ok"} />
        <StatTile label={t("finance.debtLend")} value={formatUSD(sumUSD(lend))} sub={`${lend.length} ${t("finance.people")}`} />
      </div>

      {form ? (
        <form className="card fin-form" onSubmit={save} style={{ maxWidth: 760 }}>
          <h3 style={{ marginTop: 0 }}>{form._id ? t("finance.editDebt") : t("finance.newDebt")}</h3>
          <div className="seg-toggle" style={{ marginBottom: 10 }}>
            <button type="button" className={form.direction === "owe" ? "active" : ""} onClick={() => setForm((p) => ({ ...p, direction: "owe" }))}>💳 {t("finance.iOwe")}</button>
            <button type="button" className={form.direction === "lend" ? "active" : ""} onClick={() => setForm((p) => ({ ...p, direction: "lend" }))}>🤝 {t("finance.owedToMe")}</button>
          </div>
          <div className="repay-types">
            {["fixed", "interest_only", "flexible"].map((k) => (
              <button
                type="button"
                key={k}
                className={`repay-type ${form.repayType === k ? "active" : ""}`}
                onClick={() => setForm((p) => ({ ...p, repayType: k, ...(k === "flexible" && !p._id ? { interestRate: "" } : {}) }))}
              >
                <b>{t(`debtType.${k}`)}</b>
                <small>{t(`debtType.${k}_help`)}</small>
              </button>
            ))}
          </div>
          <div className="filter-row" style={{ marginBottom: 0 }}>
            <div className="field" style={{ flex: 2, minWidth: 180 }}>
              <label>{form.direction === "owe" ? t("finance.lender") : t("finance.borrower")}</label>
              <input value={form.party} onChange={setD("party")} placeholder={t("finance.partyPh")} />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 130 }}>
              <label>{t("finance.phone")}</label>
              <input value={form.phone} onChange={setD("phone")} inputMode="tel" />
            </div>
          </div>
          <div className="filter-row" style={{ marginBottom: 0 }}>
            <div className="field" style={{ flex: 1, minWidth: 140 }}>
              <label>{t("finance.debtAmount")}</label>
              <div style={{ display: "flex", gap: 6 }}>
                <input type="number" min="0" step="any" value={form.amount} onChange={setD("amount")} style={{ flex: 1 }} />
                <select value={form.currency} onChange={setD("currency")} style={{ width: 70 }}>
                  <option value="USD">$</option>
                  <option value="KHR">៛</option>
                </select>
              </div>
            </div>
            <div className="field" style={{ flex: 1, minWidth: 120 }}>
              <label>{t("finance.interestRate")}</label>
              <input type="number" min="0" step="0.1" value={form.interestRate} onChange={setD("interestRate")} placeholder="0" />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 120 }}>
              <label>{form.repayType === "interest_only" ? t("debtType.monthlyInterestPay") : t("finance.monthlyPayment")}</label>
              <input
                type="number"
                min="0"
                step="any"
                value={form.monthlyPayment}
                onChange={setD("monthlyPayment")}
                placeholder={
                  form.repayType === "interest_only" && form.amount && form.interestRate
                    ? String(Math.round(((Number(form.amount) * Number(form.interestRate)) / 100) * 100) / 100)
                    : form.repayType === "flexible"
                      ? t("debtType.optional")
                      : "0"
                }
              />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 100 }}>
              <label>{t("finance.paymentDay")}</label>
              <input type="number" min="0" max="31" value={form.paymentDay} onChange={setD("paymentDay")} placeholder="1–31" />
            </div>
          </div>
          <div className="filter-row" style={{ marginBottom: 0 }}>
            <div className="field" style={{ flex: 1, minWidth: 140 }}>
              <label>{t("finance.startDate")}</label>
              <input type="date" value={form.startDate} onChange={setD("startDate")} />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 140 }}>
              <label>{t("finance.dueDate")}</label>
              <input type="date" value={form.dueDate} onChange={setD("dueDate")} />
            </div>
            <div className="field" style={{ flex: 2, minWidth: 180 }}>
              <label>{t("finance.note")}</label>
              <input value={form.note} onChange={setD("note")} />
            </div>
          </div>
          {form.direction === "owe" && form.repayType !== "flexible" && (
            <div className="auto-pay-box">
              <label className="auto-pay-check">
                <input type="checkbox" checked={form.autoPay} onChange={(e) => setForm((p) => ({ ...p, autoPay: e.target.checked }))} />
                <span>
                  <b>🤖 {t("autoPay.label")}</b>
                  <small className="mini-empty">{t("autoPay.help")}</small>
                </span>
              </label>
              {form.autoPay && !(Number(form.paymentDay) > 0) && <div className="mini-empty" style={{ color: "var(--warn, #b7791f)" }}>{t("autoPay.needDay")}</div>}
              {form.autoPay && accounts.length > 0 && (
                <div className="field" style={{ maxWidth: 280, marginTop: 8 }}>
                  <label>{t("autoPay.fromAccount")}</label>
                  <select value={form.payAccount} onChange={setD("payAccount")}>
                    <option value="">— {t("financeX.noAccount")} —</option>
                    {accounts.map((a) => (
                      <option key={a._id} value={a._id}>{ACCOUNT_ICON[a.kind]} {a.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
          {err && <div className="error-text">{err}</div>}
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <button className="btn btn-primary">{t("common.save")}</button>
            <button type="button" className="btn btn-outline" onClick={() => setForm(null)}>{t("common.cancel")}</button>
          </div>
        </form>
      ) : (
        <button className="btn btn-primary" style={{ marginBottom: 16 }} onClick={() => { setErr(""); setForm(blankDebt()); }}>
          ➕ {t("finance.newDebt")}
        </button>
      )}

      {loading && <p>{t("common.loading")}</p>}
      {owe.length > 0 && <h3>💳 {t("finance.iOwe")}</h3>}
      <div className="package-grid">{owe.map(renderDebt)}</div>
      {lend.length > 0 && <h3 style={{ marginTop: 20 }}>🤝 {t("finance.owedToMe")}</h3>}
      <div className="package-grid">{lend.map(renderDebt)}</div>
      {!loading && list.length === 0 && <p className="mini-empty">{t("finance.noDebts")}</p>}
      {closed.length > 0 && (
        <>
          <button className="link-btn" style={{ marginTop: 16 }} onClick={() => setShowClosed((v) => !v)}>
            ✅ {t("finance.paidOff")} ({closed.length}) {showClosed ? "▲" : "▼"}
          </button>
          {showClosed && <div className="package-grid" style={{ marginTop: 8 }}>{closed.map(renderDebt)}</div>}
        </>
      )}
    </>
  );
}

// ---- Monthly plan ---------------------------------------------------------
const blankPlan = (kind = "income") => ({ kind, name: "", category: kind === "income" ? "salary" : "food", amount: "", currency: "USD", timesPerMonth: "1", active: true });

function Plan({ catLabel }) {
  const { t } = useLanguage();
  const [list, setList] = useState([]);
  const [debtPay, setDebtPay] = useState(0);
  const [form, setForm] = useState(null);
  const [err, setErr] = useState("");

  const load = async () => {
    try {
      const [{ data: plans }, { data: s }] = await Promise.all([api.get("/finance/plans"), api.get("/finance/summary")]);
      setList(plans);
      setDebtPay(s.monthlyDebtPayments || 0);
    } catch {
      /* ignore */
    }
  };
  useEffect(() => {
    load();
  }, []);

  const setP = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));
  const save = async (e) => {
    e.preventDefault();
    setErr("");
    if (!form.name.trim()) return setErr(t("finance.enterName"));
    if (!(Number(form.amount) >= 0) || form.amount === "") return setErr(t("finance.enterAmount"));
    try {
      if (form._id) await api.put(`/finance/plans/${form._id}`, form);
      else await api.post("/finance/plans", form);
      setForm(null);
      load();
    } catch (e2) {
      setErr(e2.response?.data?.message || t("finance.failedToSave"));
    }
  };
  const toggle = async (p) => {
    await api.put(`/finance/plans/${p._id}`, { active: !p.active }).catch(() => {});
    load();
  };
  const remove = async (p) => {
    if (!confirm(t("finance.confirmDelete"))) return;
    await api.delete(`/finance/plans/${p._id}`).catch(() => {});
    load();
  };
  const monthly = (p) => p.amountUSD * (p.timesPerMonth ?? 1);
  const inc = list.filter((p) => p.kind === "income" && p.active).reduce((s, p) => s + monthly(p), 0);
  const exp = list.filter((p) => p.kind === "expense" && p.active).reduce((s, p) => s + monthly(p), 0);
  const left = inc - exp - debtPay;

  return (
    <>
      <p className="mini-empty">{t("finance.planIntro")}</p>
      <div className="stat-grid">
        <StatTile label={t("finance.expectedIncome")} value={formatUSD(inc)} sub={approxKHR(inc)} tone="ok" />
        <StatTile label={t("finance.expectedExpense")} value={formatUSD(exp)} sub={approxKHR(exp)} tone="bad" />
        <StatTile label={t("finance.debtPayments")} value={formatUSD(debtPay)} sub={t("finance.fromDebts")} />
        <StatTile
          label={t("finance.expectedLeftover")}
          value={formatUSD(left)}
          sub={inc > 0 ? t("finance.savingRate").replace("{pct}", Math.round((left / inc) * 100)) : ""}
          tone={left >= 0 ? "ok" : "bad"}
        />
      </div>

      {form ? (
        <form className="card fin-form" onSubmit={save} style={{ maxWidth: 720 }}>
          <div className="seg-toggle fin-type" style={{ marginBottom: 10 }}>
            <button type="button" className={form.kind === "income" ? "active income" : ""} onClick={() => setForm((p) => ({ ...p, kind: "income", category: "salary" }))}>⬇ {t("finance.expectedIncome")}</button>
            <button type="button" className={form.kind === "expense" ? "active expense" : ""} onClick={() => setForm((p) => ({ ...p, kind: "expense", category: "food" }))}>⬆ {t("finance.expectedExpense")}</button>
          </div>
          <div className="filter-row" style={{ marginBottom: 0 }}>
            <div className="field" style={{ flex: 2, minWidth: 180 }}>
              <label>{t("finance.planName")}</label>
              <input value={form.name} onChange={setP("name")} placeholder={form.kind === "income" ? t("finance.planNamePhIncome") : t("finance.planNamePhExpense")} />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 150 }}>
              <label>{t("finance.category")}</label>
              <select value={form.category} onChange={setP("category")}>
                {(form.kind === "income" ? INCOME_CATS : EXPENSE_CATS).map((c) => (
                  <option key={c} value={c}>{catLabel(c)}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="filter-row" style={{ marginBottom: 0 }}>
            <div className="field" style={{ flex: 1, minWidth: 150 }}>
              <label>{t("finance.amountEachTime")}</label>
              <div style={{ display: "flex", gap: 6 }}>
                <input type="number" min="0" step="any" value={form.amount} onChange={setP("amount")} style={{ flex: 1 }} />
                <select value={form.currency} onChange={setP("currency")} style={{ width: 70 }}>
                  <option value="USD">$</option>
                  <option value="KHR">៛</option>
                </select>
              </div>
            </div>
            <div className="field" style={{ flex: 1, minWidth: 140 }}>
              <label>{t("finance.timesPerMonth")}</label>
              <input type="number" min="0" max="31" step="1" value={form.timesPerMonth} onChange={setP("timesPerMonth")} />
            </div>
          </div>
          <p className="mini-empty" style={{ margin: "0 0 6px" }}>{t("finance.timesHelp")}</p>
          {err && <div className="error-text">{err}</div>}
          <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
            <button className="btn btn-primary">{t("common.save")}</button>
            <button type="button" className="btn btn-outline" onClick={() => setForm(null)}>{t("common.cancel")}</button>
          </div>
        </form>
      ) : (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          <button className="btn btn-primary" onClick={() => { setErr(""); setForm(blankPlan("income")); }}>➕ {t("finance.expectedIncome")}</button>
          <button className="btn btn-outline" onClick={() => { setErr(""); setForm(blankPlan("expense")); }}>➕ {t("finance.expectedExpense")}</button>
        </div>
      )}

      {["income", "expense"].map((kind) => {
        const rows = list.filter((p) => p.kind === kind);
        if (!rows.length) return null;
        return (
          <div key={kind} style={{ marginBottom: 18 }}>
            <h3>{kind === "income" ? `⬇ ${t("finance.expectedIncome")}` : `⬆ ${t("finance.expectedExpense")}`}</h3>
            <div className="table-scroll">
              <table className="athletes">
                <thead>
                  <tr>
                    <th>{t("finance.planName")}</th>
                    <th>{t("finance.category")}</th>
                    <th>{t("finance.amountEachTime")}</th>
                    <th>{t("finance.timesPerMonth")}</th>
                    <th>{t("finance.perMonth")}</th>
                    <th>{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p._id} style={p.active ? undefined : { opacity: 0.5 }}>
                      <td data-label={t("finance.planName")}><b>{p.name}</b></td>
                      <td data-label={t("finance.category")}>{catLabel(p.category)}</td>
                      <td data-label={t("finance.amountEachTime")}>{fmtMoney(p.amount, p.currency)}</td>
                      <td data-label={t("finance.timesPerMonth")}>×{p.timesPerMonth}</td>
                      <td data-label={t("finance.perMonth")}><b>{formatUSD(monthly(p))}</b></td>
                      <td data-label={t("common.actions")}>
                        <button className="link-btn" onClick={() => setForm({ ...p, amount: String(p.amount), timesPerMonth: String(p.timesPerMonth) })}>✏️</button>
                        <button className="link-btn" onClick={() => toggle(p)}>{p.active ? `⏸ ${t("finance.pause")}` : `▶ ${t("finance.resume")}`}</button>
                        <button className="link-btn" onClick={() => remove(p)}>🗑</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
      {list.length === 0 && <p className="mini-empty">{t("finance.noPlans")}</p>}
    </>
  );
}

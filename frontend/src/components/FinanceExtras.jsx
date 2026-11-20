import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";
import { useLanguage } from "../i18n/LanguageContext";
import { formatUSD, formatKHR, approxKHR, USD_TO_KHR } from "../utils/currency";
import { StatTile } from "./MiniCharts";

const TZ = "Asia/Phnom_Penh";
const ymd = (d = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(d));
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-GB", { timeZone: TZ }) : "");
export function fmtMoney(amount, currency) {
  if (currency === "KHR") return `៛${Math.round(Number(amount) || 0).toLocaleString("en-US")}`;
  return formatUSD(amount);
}
export const ACCOUNT_ICON = { cash: "💵", bank: "🏦", wallet: "📲", other: "💼" };
const QUICK_CATS = {
  income: ["salary", "football", "shop", "bonus", "gift", "other"],
  expense: ["food", "transport", "phone", "rent", "utilities", "family", "health", "education", "shopping", "fun", "football", "debt", "other"],
};

// ---------------------------------------------------------------------------
// 💼 My money — where it is right now (cash, ABA, ACLEDA, Wing…)
// ---------------------------------------------------------------------------
const blankAcc = () => ({ name: "", kind: "bank", currency: "USD", openingBalance: "", note: "" });

export function AccountsTab() {
  const { t } = useLanguage();
  const [data, setData] = useState({ accounts: [], totalUSD: 0 });
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [err, setErr] = useState("");
  const [balFor, setBalFor] = useState(null);
  const [balVal, setBalVal] = useState("");
  const [tr, setTr] = useState(null); // transfer form
  const [showArchived, setShowArchived] = useState(false);
  const [quick, setQuick] = useState(null); // { account, type, amount, category, date, note }
  const [flash, setFlash] = useState(null); // { id, text } — shows "+$20" after saving

  const load = async () => {
    try {
      const { data } = await api.get("/finance/accounts");
      setData(data);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));
  const save = async (e) => {
    e.preventDefault();
    setErr("");
    if (!form.name.trim()) return setErr(t("financeX.enterAccountName"));
    try {
      const body = { name: form.name, kind: form.kind, currency: form.currency, note: form.note };
      if (!form._id || form.openingBalance !== "") body.openingBalance = form.openingBalance === "" ? 0 : form.openingBalance;
      if (form._id) await api.put(`/finance/accounts/${form._id}`, body);
      else await api.post("/finance/accounts", body);
      setForm(null);
      load();
    } catch (e2) {
      setErr(e2.response?.data?.message || t("finance.failedToSave"));
    }
  };
  const setBalance = async (a) => {
    if (balVal === "" || Number.isNaN(Number(balVal))) return;
    await api.put(`/finance/accounts/${a._id}`, { openingBalance: balVal }).catch(() => {});
    setBalFor(null);
    load();
  };
  const archive = async (a) => {
    await api.put(`/finance/accounts/${a._id}`, { archived: !a.archived }).catch(() => {});
    load();
  };
  const remove = async (a) => {
    if (!confirm(t("financeX.confirmDeleteAccount").replace("{n}", a.name))) return;
    await api.delete(`/finance/accounts/${a._id}`).catch(() => {});
    load();
  };
  // ➕ income / ➖ expense straight into one account — it is saved in the
  // daily log too, and the balance goes up / down right away.
  const openQuick = (a, type) =>
    setQuick({ account: a._id, type, amount: "", category: type === "income" ? "salary" : "food", date: ymd(), note: "" });
  const saveQuick = async (e, a) => {
    e.preventDefault();
    const amt = Number(quick.amount);
    if (!(amt > 0)) return;
    try {
      await api.post("/finance/txns", { ...quick, amount: amt, currency: a.currency });
      setFlash({ id: a._id, text: `${quick.type === "income" ? "+" : "−"}${fmtMoney(amt, a.currency)}`, type: quick.type });
      setTimeout(() => setFlash(null), 2500);
      setQuick(null);
      load();
    } catch (e2) {
      alert(e2.response?.data?.message || t("finance.failedToSave"));
    }
  };
  const doTransfer = async (e) => {
    e.preventDefault();
    try {
      await api.post("/finance/accounts/transfer", tr);
      setTr(null);
      load();
    } catch (e2) {
      alert(e2.response?.data?.message || t("finance.failedToSave"));
    }
  };

  const active = data.accounts.filter((a) => !a.archived);
  const archived = data.accounts.filter((a) => a.archived);

  const card = (a) => (
    <div key={a._id} className={`card fin-account ${a.kind} ${a.archived ? "closed" : ""}`}>
      <div className="package-card-head">
        <h3>{ACCOUNT_ICON[a.kind]} {a.name}</h3>
        <div className="package-price" style={{ color: a.balance < 0 ? "var(--bad)" : undefined }}>
          {flash?.id === a._id && <span className={`acc-flash ${flash.type}`}>{flash.text}</span>}
          {fmtMoney(a.balance, a.currency)}
          {a.currency === "KHR" ? <small className="price-khr">≈ {formatUSD(a.balanceUSD)}</small> : <small className="price-khr">{approxKHR(a.balance)}</small>}
        </div>
      </div>
      {a.note && <p className="package-desc">{a.note}</p>}
      <p className="mini-empty" style={{ margin: "6px 0 0" }}>
        {t("financeX.countedFrom").replace("{d}", fmtDate(a.openingDate)).replace("{amt}", fmtMoney(a.openingBalance, a.currency))}
      </p>
      {quick?.account === a._id ? (
        <form className="acc-quick" onSubmit={(e) => saveQuick(e, a)}>
          <b className={quick.type}>{quick.type === "income" ? `➕ ${t("finance.income")}` : `➖ ${t("finance.expense")}`}</b>
          <input type="number" min="0" step="any" value={quick.amount} onChange={(e) => setQuick((q) => ({ ...q, amount: e.target.value }))} placeholder={a.currency === "KHR" ? "៛" : "$"} autoFocus required />
          <select value={quick.category} onChange={(e) => setQuick((q) => ({ ...q, category: e.target.value }))}>
            {QUICK_CATS[quick.type].map((c) => <option key={c} value={c}>{t(`finance.cat_${c}`, c)}</option>)}
          </select>
          <input type="date" value={quick.date} onChange={(e) => setQuick((q) => ({ ...q, date: e.target.value }))} />
          <input value={quick.note} onChange={(e) => setQuick((q) => ({ ...q, note: e.target.value }))} placeholder={t("finance.note")} />
          {Number(quick.amount) > 0 && (
            <small className="mini-empty">
              {fmtMoney(a.balance, a.currency)} → <b>{fmtMoney(a.balance + (quick.type === "income" ? 1 : -1) * Number(quick.amount), a.currency)}</b>
            </small>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary">{t("common.save")}</button>
            <button type="button" className="link-btn" onClick={() => setQuick(null)}>{t("common.cancel")}</button>
          </div>
        </form>
      ) : balFor === a._id ? (
        <div className="fin-pay">
          <input type="number" step="any" value={balVal} onChange={(e) => setBalVal(e.target.value)} placeholder={a.currency === "KHR" ? "៛" : "$"} autoFocus />
          <button className="btn btn-primary" onClick={() => setBalance(a)}>{t("common.save")}</button>
          <button className="link-btn" onClick={() => setBalFor(null)}>{t("common.cancel")}</button>
          <small className="mini-empty" style={{ flexBasis: "100%" }}>{t("financeX.setBalanceHelp")}</small>
        </div>
      ) : (
        <div className="package-actions">
          {!a.archived && (
            <>
              <button className="btn btn-primary acc-in" onClick={() => openQuick(a, "income")}>➕ {t("finance.income")}</button>
              <button className="btn btn-outline acc-out" onClick={() => openQuick(a, "expense")}>➖ {t("finance.expense")}</button>
            </>
          )}
          <button className="btn btn-outline" onClick={() => { setBalFor(a._id); setBalVal(String(a.balance)); }}>🔄 {t("financeX.setBalance")}</button>
          <button className="link-btn" onClick={() => setForm({ ...a, openingBalance: "" })}>✏️</button>
          <button className="link-btn" onClick={() => archive(a)}>{a.archived ? t("finance.resume") : t("financeX.archive")}</button>
          <button className="link-btn" onClick={() => remove(a)}>🗑</button>
        </div>
      )}
    </div>
  );

  return (
    <>
      <div className="stat-grid">
        <StatTile label={t("financeX.moneyNow")} value={formatUSD(data.totalUSD)} sub={approxKHR(data.totalUSD)} tone="ok" />
        {["cash", "bank", "wallet"].map((k) => {
          const v = active.filter((a) => a.kind === k).reduce((s, a) => s + a.balanceUSD, 0);
          return active.some((a) => a.kind === k) ? <StatTile key={k} label={`${ACCOUNT_ICON[k]} ${t(`financeX.kind_${k}`)}`} value={formatUSD(v)} /> : null;
        })}
      </div>
      <p className="mini-empty">{t("financeX.accountsIntro")}</p>

      {form ? (
        <form className="card fin-form" onSubmit={save} style={{ maxWidth: 640 }}>
          <h3 style={{ marginTop: 0 }}>{form._id ? t("financeX.editAccount") : t("financeX.newAccount")}</h3>
          <div className="filter-row" style={{ marginBottom: 0 }}>
            <div className="field" style={{ flex: 2, minWidth: 180 }}>
              <label>{t("financeX.accountName")}</label>
              <input value={form.name} onChange={set("name")} placeholder={t("financeX.accountNamePh")} />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 130 }}>
              <label>{t("financeX.kind")}</label>
              <select value={form.kind} onChange={set("kind")}>
                {["cash", "bank", "wallet", "other"].map((k) => (
                  <option key={k} value={k}>{ACCOUNT_ICON[k]} {t(`financeX.kind_${k}`)}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ flex: 1, minWidth: 90 }}>
              <label>{t("financeX.currency")}</label>
              <select value={form.currency} onChange={set("currency")} disabled={!!form._id}>
                <option value="USD">$ USD</option>
                <option value="KHR">៛ KHR</option>
              </select>
            </div>
          </div>
          <div className="filter-row" style={{ marginBottom: 0 }}>
            <div className="field" style={{ flex: 1, minWidth: 160 }}>
              <label>{form._id ? t("financeX.balanceNowOptional") : t("financeX.balanceNow")}</label>
              <input type="number" step="any" value={form.openingBalance} onChange={set("openingBalance")} placeholder="0" />
            </div>
            <div className="field" style={{ flex: 2, minWidth: 180 }}>
              <label>{t("finance.note")}</label>
              <input value={form.note} onChange={set("note")} />
            </div>
          </div>
          {err && <div className="error-text">{err}</div>}
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-primary">{t("common.save")}</button>
            <button type="button" className="btn btn-outline" onClick={() => setForm(null)}>{t("common.cancel")}</button>
          </div>
        </form>
      ) : tr ? (
        <form className="card fin-form" onSubmit={doTransfer} style={{ maxWidth: 640 }}>
          <h3 style={{ marginTop: 0 }}>🔁 {t("financeX.transfer")}</h3>
          <div className="filter-row" style={{ marginBottom: 0 }}>
            <div className="field" style={{ flex: 1, minWidth: 150 }}>
              <label>{t("financeX.from")}</label>
              <select value={tr.from} onChange={(e) => setTr((p) => ({ ...p, from: e.target.value }))}>
                {active.map((a) => <option key={a._id} value={a._id}>{ACCOUNT_ICON[a.kind]} {a.name}</option>)}
              </select>
            </div>
            <div className="field" style={{ flex: 1, minWidth: 150 }}>
              <label>{t("financeX.to")}</label>
              <select value={tr.to} onChange={(e) => setTr((p) => ({ ...p, to: e.target.value }))}>
                {active.map((a) => <option key={a._id} value={a._id}>{ACCOUNT_ICON[a.kind]} {a.name}</option>)}
              </select>
            </div>
            <div className="field" style={{ flex: 1, minWidth: 120 }}>
              <label>
                {t("financeX.amount")} ({(active.find((a) => a._id === tr.from)?.currency || "USD") === "KHR" ? "៛" : "$"})
              </label>
              <input type="number" min="0" step="any" value={tr.amount} onChange={(e) => setTr((p) => ({ ...p, amount: e.target.value }))} />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 140 }}>
              <label>{t("finance.date")}</label>
              <input type="date" value={tr.date} onChange={(e) => setTr((p) => ({ ...p, date: e.target.value }))} />
            </div>
          </div>
          <p className="mini-empty">{t("financeX.transferHelp")}</p>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-primary">{t("common.save")}</button>
            <button type="button" className="btn btn-outline" onClick={() => setTr(null)}>{t("common.cancel")}</button>
          </div>
        </form>
      ) : (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          <button className="btn btn-primary" onClick={() => { setErr(""); setForm(blankAcc()); }}>➕ {t("financeX.newAccount")}</button>
          {active.length >= 2 && (
            <button className="btn btn-outline" onClick={() => setTr({ from: active[0]._id, to: active[1]._id, amount: "", date: ymd(), note: "" })}>
              🔁 {t("financeX.transfer")}
            </button>
          )}
        </div>
      )}

      {loading && <p>{t("common.loading")}</p>}
      {!loading && data.accounts.length === 0 && <p className="mini-empty">{t("financeX.noAccounts")}</p>}
      <div className="package-grid">{active.map(card)}</div>
      {archived.length > 0 && (
        <>
          <button className="link-btn" style={{ marginTop: 16 }} onClick={() => setShowArchived((v) => !v)}>
            {t("financeX.archived")} ({archived.length}) {showArchived ? "▲" : "▼"}
          </button>
          {showArchived && <div className="package-grid" style={{ marginTop: 8 }}>{archived.map(card)}</div>}
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// 🤝 Owed to me — students' unpaid fees (chosen teams), unpaid invoices,
// money I lent
// ---------------------------------------------------------------------------
export function ReceivablesTab({ onOpenDebts }) {
  const { t } = useLanguage();
  const [data, setData] = useState(null);
  const [allTeams, setAllTeams] = useState([]);
  const [picking, setPicking] = useState(false);
  const [chosen, setChosen] = useState([]);
  const [team, setTeam] = useState("");
  const [q, setQ] = useState("");

  const load = async () => {
    try {
      const { data } = await api.get("/finance/receivables");
      setData(data);
      setChosen(data.settings.receivableTeams || []);
      if (!(data.settings.receivableTeams || []).length) setPicking(true);
    } catch {
      setData(false);
    }
  };
  useEffect(() => {
    load();
    api.get("/teams", { noCoachMode: true }).then(({ data }) => setAllTeams(data.map((x) => x.name))).catch(() => {});
  }, []);

  const saveTeams = async () => {
    await api.put("/finance/settings", { receivableTeams: chosen }).catch(() => {});
    setPicking(false);
    load();
  };
  const saveExcluded = async (ids) => {
    setData((d) => ({ ...d, invoices: d.invoices.map((i) => ({ ...i, included: !ids.includes(String(i._id)) })) }));
    await api.put("/finance/settings", { excludedInvoices: ids }).catch(() => {});
    load();
  };
  const currentExcluded = () => data.invoices.filter((i) => !i.included).map((i) => String(i._id));
  const toggleInvoice = (id) => {
    const ex = currentExcluded();
    saveExcluded(ex.includes(String(id)) ? ex.filter((x) => x !== String(id)) : [...ex, String(id)]);
  };
  const toggleInvoices = async () => {
    await api.put("/finance/settings", { includeInvoices: !data.settings.includeInvoices }).catch(() => {});
    load();
  };

  if (data === null) return <p>{t("common.loading")}</p>;
  if (data === false) return <p className="error-text">{t("finance.failedToLoad")}</p>;

  const needle = q.trim().toLowerCase();
  const students = data.students.filter(
    (s) => (!team || s.team === team) && (!needle || s.fullName.toLowerCase().includes(needle) || (s.khmerName || "").includes(q.trim()))
  );

  return (
    <>
      <div className="stat-grid">
        <StatTile label={t("financeX.owedTotal")} value={formatUSD(data.totals.allUSD)} sub={approxKHR(data.totals.allUSD)} tone="ok" />
        <StatTile label={`🎓 ${t("financeX.students")}`} value={formatKHR(data.totals.studentsKHR)} sub={`${data.students.length} ${t("finance.people")} · ${formatUSD(data.totals.studentsUSD)}`} />
        <StatTile label={`🧾 ${t("financeX.unpaidInvoices")}`} value={formatUSD(data.totals.invoicesUSD)} sub={`${data.totals.invoicesCounted ?? data.invoices.length}/${data.invoices.length} ${t("financeX.invoicesCount")}`} />
        <StatTile label={`🤝 ${t("financeX.lent")}`} value={formatUSD(data.totals.lentUSD)} sub={`${data.lent.length} ${t("finance.people")}`} />
      </div>
      <p className="mini-empty rate-note">💱 {t("financeX.rateNote").replace("{r}", (data.rate || USD_TO_KHR).toLocaleString("en-US"))}</p>

      {/* Which teams count */}
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <b>{t("financeX.myTeams")}:</b>{" "}
            {data.settings.receivableTeams.length ? data.settings.receivableTeams.join(", ") : <span className="mini-empty">{t("financeX.noTeamsChosen")}</span>}
          </div>
          {!picking && <button className="link-btn" onClick={() => setPicking(true)}>✏️ {t("financeX.chooseTeams")}</button>}
        </div>
        {picking && (
          <>
            <p className="mini-empty">{t("financeX.chooseTeamsHelp")}</p>
            <div className="fin-cats">
              {allTeams.map((n) => (
                <label key={n} className={`fin-cat ${chosen.includes(n) ? "active" : ""}`}>
                  <input
                    type="checkbox"
                    checked={chosen.includes(n)}
                    onChange={() => setChosen((c) => (c.includes(n) ? c.filter((x) => x !== n) : [...c, n]))}
                    style={{ display: "none" }}
                  />
                  {chosen.includes(n) ? "✔ " : ""}{n}
                </label>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-primary" onClick={saveTeams}>{t("common.save")}</button>
              {data.settings.receivableTeams.length > 0 && (
                <button className="btn btn-outline" onClick={() => { setChosen(data.settings.receivableTeams); setPicking(false); }}>{t("common.cancel")}</button>
              )}
            </div>
          </>
        )}
        <label className="check-row" style={{ marginTop: 10 }}>
          <input type="checkbox" checked={data.settings.includeInvoices} onChange={toggleInvoices} /> {t("financeX.includeInvoices")}
        </label>
      </div>

      {/* Students */}
      {data.byTeam.length > 0 && (
        <>
          <h3>🎓 {t("financeX.studentsOwing")}</h3>
          <div className="filter-row">
            <select value={team} onChange={(e) => setTeam(e.target.value)}>
              <option value="">{t("finance.all")} ({data.students.length})</option>
              {data.byTeam.map((b) => (
                <option key={b.team} value={b.team}>{b.team} — {b.count} · {formatKHR(b.totalKHR)}</option>
              ))}
            </select>
            <input placeholder={`🔍 ${t("financeX.searchName")}`} value={q} onChange={(e) => setQ(e.target.value)} />
            <Link className="btn btn-outline" to="/debt-report">💰 {t("financeX.collectInDebtReport")}</Link>
          </div>
          <div className="table-scroll">
            <table className="athletes">
              <thead>
                <tr>
                  <th>{t("financeX.name")}</th>
                  <th>{t("common.team")}</th>
                  <th>{t("financeX.forWhat")}</th>
                  <th>{t("financeX.owes")}</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.assignmentId}>
                    <td data-label={t("financeX.name")}>
                      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {s.photoUrl ? <img src={s.photoUrl} alt="" className="small-photo" /> : null}
                        <span>
                          <b>{s.khmerName || s.fullName}</b>
                          {s.khmerName && <div className="mini-empty">{s.fullName}</div>}
                        </span>
                      </span>
                    </td>
                    <td data-label={t("common.team")}>{s.team}</td>
                    <td data-label={t("financeX.forWhat")} style={{ fontSize: 13 }}>
                      {s.fees.map((f, i) => (
                        <div key={i}>{f.note || "—"}: {formatKHR(f.amountKHR)} <small className="mini-empty">({formatUSD(f.amount)})</small></div>
                      ))}
                    </td>
                    <td data-label={t("financeX.owes")}>
                      <b style={{ color: "var(--bad)" }}>{formatKHR(s.totalKHR)}</b>
                      <div className="mini-empty">{formatUSD(s.totalUSD)}</div>
                    </td>
                  </tr>
                ))}
                {students.length === 0 && (
                  <tr><td colSpan={4} style={{ textAlign: "center", color: "#777" }}>{t("financeX.nobodyOwes")}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Unpaid invoices */}
      {data.settings.includeInvoices && (
        <>
          <h3 style={{ marginTop: 22 }}>🧾 {t("financeX.unpaidInvoices")}</h3>
          {data.invoices.length === 0 ? (
            <p className="mini-empty">{t("financeX.noUnpaidInvoices")}</p>
          ) : (
            <>
            <div className="inv-pick-bar">
              <span className="mini-empty">{t("financeX.pickInvoicesHint")}</span>
              <button type="button" className="btn btn-outline" onClick={() => saveExcluded([])}>{t("financeX.countAll")}</button>
              <button type="button" className="btn btn-outline" onClick={() => saveExcluded(data.invoices.map((i) => String(i._id)))}>{t("financeX.countNone")}</button>
            </div>
            <div className="table-scroll">
              <table className="athletes">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>✔</th>
                    <th>{t("invoices.invoiceNo")}</th>
                    <th>{t("invoices.date")}</th>
                    <th>{t("invoices.customer")}</th>
                    <th>{t("invoices.total")}</th>
                    <th>{t("finance.paidSoFar")}</th>
                    <th>{t("financeX.owes")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.invoices.map((i) => (
                    <tr key={i._id} className={i.included ? "" : "inv-excluded"}>
                      <td data-label={t("financeX.countIt")}>
                        <input type="checkbox" checked={i.included} onChange={() => toggleInvoice(i._id)} aria-label={t("financeX.countIt")} />
                      </td>
                      <td data-label={t("invoices.invoiceNo")}><Link to={`/admin/invoices/${i._id}`}>{i.invoiceNo}</Link></td>
                      <td data-label={t("invoices.date")}>{fmtDate(i.date)}</td>
                      <td data-label={t("invoices.customer")}>
                        {i.customer?.name || "—"}
                        {i.customer?.phone && <div className="mini-empty">{i.customer.phone}</div>}
                      </td>
                      <td data-label={t("invoices.total")}>{formatUSD(i.total)}</td>
                      <td data-label={t("finance.paidSoFar")}>{formatUSD(i.paid)}</td>
                      <td data-label={t("financeX.owes")}><b style={{ color: i.included ? "var(--bad)" : "inherit" }}>{formatUSD(i.balanceUSD)}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </>
      )}

      {/* Money I lent */}
      <h3 style={{ marginTop: 22 }}>🤝 {t("financeX.lent")}</h3>
      {data.lent.length === 0 ? (
        <p className="mini-empty">{t("financeX.noLent")}</p>
      ) : (
        <ul className="low-stock-list card" style={{ padding: 12 }}>
          {data.lent.map((d) => (
            <li key={d._id}>
              <span>
                🤝 {d.party}
                {d.dueDate && <small className="mini-empty"> · {t("finance.dueDate")} {fmtDate(d.dueDate)}</small>}
              </span>
              <b>{fmtMoney(d.remaining, d.currency)}</b>
            </li>
          ))}
        </ul>
      )}
      <button className="link-btn" onClick={onOpenDebts}>➕ {t("financeX.addLent")}</button>
    </>
  );
}

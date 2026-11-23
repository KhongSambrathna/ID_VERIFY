import { useEffect, useState } from "react";
import api from "../api/axios";
import { useLanguage } from "../i18n/LanguageContext";
import { formatUSD } from "../utils/currency";
import { ACCOUNT_ICON } from "./FinanceExtras";

// Finance → "Wedding gifts" (ចំណងដៃ): a list of the wedding gifts I gave —
// whose wedding, when, where, how much. Optionally also recorded as a Daily
// expense (category "ceremony") taken from one of my money accounts.
const TZ = "Asia/Phnom_Penh";
const ymd = (d = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(d));
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-GB", { timeZone: TZ }) : "");
const fmtMoney = (amount, currency) =>
  currency === "KHR" ? `៛${Math.round(Number(amount) || 0).toLocaleString("en-US")}` : formatUSD(amount);

// Common amounts, one tap.
const QUICK = { USD: [10, 20, 30, 50, 100], KHR: [40000, 50000, 80000, 100000, 200000] };

const blank = () => ({
  person: "",
  relation: "",
  place: "",
  phone: "",
  date: ymd(),
  amount: "",
  currency: "USD",
  note: "",
  recordExpense: true,
  account: "",
});

export default function WeddingGiftsTab() {
  const { t } = useLanguage();
  const [data, setData] = useState({ gifts: [], totals: { count: 0, KHR: 0, USD: 0, totalUSD: 0 }, years: [] });
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState("");
  const [q, setQ] = useState("");
  const [f, setF] = useState(blank());
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [accounts, setAccounts] = useState([]);

  useEffect(() => {
    api
      .get("/finance/accounts")
      .then(({ data: d }) => setAccounts(d.accounts.filter((a) => !a.archived)))
      .catch(() => {});
  }, []);

  const load = async () => {
    try {
      const params = new URLSearchParams();
      if (year) params.set("year", year);
      if (q.trim()) params.set("q", q.trim());
      const { data: d } = await api.get(`/finance/wedding-gifts?${params}`);
      setData(d);
    } catch {
      /* keep old list */
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    const h = setTimeout(load, 250);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, q]);

  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const openNew = () => {
    let last = "";
    try {
      last = localStorage.getItem("fin.lastAccount") || "";
    } catch {
      /* ignore */
    }
    const pick = accounts.find((a) => a._id === last) || accounts[0];
    setF({ ...blank(), account: pick && last !== "none" ? pick._id : "" });
    setEditId(null);
    setErr("");
    setShowForm(true);
  };
  const openEdit = (g) => {
    setF({
      person: g.person || "",
      relation: g.relation || "",
      place: g.place || "",
      phone: g.phone || "",
      date: ymd(g.date),
      amount: String(g.amount),
      currency: g.currency || "USD",
      note: g.note || "",
      recordExpense: Boolean(g.txn),
      account: "",
    });
    setEditId(g._id);
    setErr("");
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const save = async (e) => {
    e.preventDefault();
    setErr("");
    if (!f.person.trim()) return setErr(t("wgift.enterPerson"));
    if (!(Number(f.amount) > 0)) return setErr(t("wgift.enterAmount"));
    setSaving(true);
    try {
      const body = { ...f, amount: Number(f.amount) };
      // When editing, only change the account if one was picked.
      if (editId && !f.account) delete body.account;
      if (editId) await api.put(`/finance/wedding-gifts/${editId}`, body);
      else await api.post("/finance/wedding-gifts", body);
      setShowForm(false);
      setEditId(null);
      load();
    } catch (e2) {
      setErr(e2.response?.data?.message || t("invoices.failedToSave"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (g) => {
    if (!confirm(t("wgift.confirmDelete").replace("{name}", g.person))) return;
    await api.delete(`/finance/wedding-gifts/${g._id}`).catch(() => {});
    load();
  };

  // Gifts already given to the name being typed — handy to see last time.
  const earlier = f.person.trim().length >= 2 && !editId
    ? data.gifts.filter((g) => g.person.toLowerCase().includes(f.person.trim().toLowerCase())).slice(0, 3)
    : [];

  const { totals } = data;

  return (
    <div>
      <p className="help-text" style={{ marginTop: 0 }}>{t("wgift.intro")}</p>

      <div className="stat-tiles" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <div className="card wgift-tile">
          <small>{t("wgift.count")}</small>
          <b>{totals.count}</b>
        </div>
        {totals.USD > 0 && (
          <div className="card wgift-tile">
            <small>{t("wgift.totalUSD")}</small>
            <b>{formatUSD(totals.USD)}</b>
          </div>
        )}
        {totals.KHR > 0 && (
          <div className="card wgift-tile">
            <small>{t("wgift.totalKHR")}</small>
            <b>{fmtMoney(totals.KHR, "KHR")}</b>
          </div>
        )}
        {totals.USD > 0 && totals.KHR > 0 && (
          <div className="card wgift-tile">
            <small>{t("wgift.allInUSD")}</small>
            <b>≈ {formatUSD(totals.totalUSD)}</b>
          </div>
        )}
      </div>

      {!showForm && (
        <button className="btn btn-primary" style={{ marginBottom: 14 }} onClick={openNew}>
          ➕ {t("wgift.add")}
        </button>
      )}

      {showForm && (
        <form className="card invoice-form" onSubmit={save} style={{ marginBottom: 18 }}>
          <h3 style={{ marginTop: 0 }}>💌 {editId ? t("wgift.edit") : t("wgift.add")}</h3>
          <div className="field">
            <label>{t("wgift.person")} *</label>
            <input value={f.person} onChange={set("person")} placeholder={t("wgift.personPh")} autoFocus />
            {earlier.length > 0 && (
              <small className="mini-empty">
                {t("wgift.givenBefore")}{" "}
                {earlier.map((g) => `${g.person} · ${fmtDate(g.date)} · ${fmtMoney(g.amount, g.currency)}`).join(" | ")}
              </small>
            )}
          </div>
          <div className="filter-row" style={{ marginBottom: 0 }}>
            <div className="field" style={{ flex: 1, minWidth: 140 }}>
              <label>{t("wgift.date")}</label>
              <input type="date" value={f.date} onChange={set("date")} />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 140 }}>
              <label>{t("wgift.relation")}</label>
              <input value={f.relation} onChange={set("relation")} placeholder={t("wgift.relationPh")} list="wgift-rel" />
              <datalist id="wgift-rel">
                {[...new Set(data.gifts.map((g) => g.relation).filter(Boolean))].map((v) => <option key={v} value={v} />)}
              </datalist>
            </div>
          </div>
          <div className="field">
            <label>{t("wgift.amount")} *</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input type="number" min="0" step="any" inputMode="decimal" value={f.amount} onChange={set("amount")} style={{ flex: 1, minWidth: 0 }} />
              <select value={f.currency} onChange={set("currency")} style={{ width: 90 }}>
                <option value="USD">$ USD</option>
                <option value="KHR">៛ Riel</option>
              </select>
            </div>
            <div className="wgift-quick">
              {QUICK[f.currency].map((v) => (
                <button type="button" key={v} className={`chip ${Number(f.amount) === v ? "active" : ""}`} onClick={() => setF((p) => ({ ...p, amount: String(v) }))}>
                  {fmtMoney(v, f.currency)}
                </button>
              ))}
            </div>
          </div>
          <div className="filter-row" style={{ marginBottom: 0 }}>
            <div className="field" style={{ flex: 2, minWidth: 160 }}>
              <label>{t("wgift.place")}</label>
              <input value={f.place} onChange={set("place")} placeholder={t("wgift.placePh")} />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 130 }}>
              <label>{t("wgift.phone")}</label>
              <input value={f.phone} onChange={set("phone")} inputMode="tel" />
            </div>
          </div>
          <div className="field">
            <label>{t("wgift.note")}</label>
            <input value={f.note} onChange={set("note")} placeholder={t("wgift.notePh")} />
          </div>

          <label className="check-row">
            <input type="checkbox" checked={f.recordExpense} onChange={(e) => setF((p) => ({ ...p, recordExpense: e.target.checked }))} />{" "}
            {t("wgift.recordExpense")}
          </label>
          {f.recordExpense && accounts.length > 0 && (
            <div className="field" style={{ maxWidth: 320 }}>
              <label>{t("wgift.fromAccount")}</label>
              <select value={f.account} onChange={set("account")}>
                <option value="">{editId ? t("wgift.keepAccount") : t("wgift.noAccount")}</option>
                {accounts.map((a) => (
                  <option key={a._id} value={a._id}>
                    {ACCOUNT_ICON[a.kind]} {a.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {err && <div className="error-text">{err}</div>}
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <button className="btn btn-primary" disabled={saving}>{saving ? t("common.saving") : t("common.save")}</button>
            <button type="button" className="btn btn-outline" onClick={() => { setShowForm(false); setEditId(null); }}>
              {t("common.cancel")}
            </button>
          </div>
        </form>
      )}

      <div className="filter-row">
        <input placeholder={`🔍 ${t("wgift.search")}`} value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 0 }} />
        <select value={year} onChange={(e) => setYear(e.target.value)}>
          <option value="">{t("wgift.allYears")}</option>
          {data.years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {loading ? (
        <p>{t("common.loading")}</p>
      ) : data.gifts.length === 0 ? (
        <p className="mini-empty">{q || year ? t("wgift.noneFound") : t("wgift.none")}</p>
      ) : (
        <div className="wgift-list">
          {data.gifts.map((g) => (
            <div key={g._id} className="card wgift-row">
              <div className="wgift-main">
                <strong>💒 {g.person}</strong>
                <small>
                  📅 {fmtDate(g.date)}
                  {g.relation && ` · ${g.relation}`}
                  {g.place && ` · 📍 ${g.place}`}
                  {g.phone && ` · 📞 ${g.phone}`}
                </small>
                {g.note && <small>📝 {g.note}</small>}
                {g.txn && <small className="mini-empty">✓ {t("wgift.inDaily")}</small>}
              </div>
              <div className="wgift-side">
                <b className="wgift-amount">{fmtMoney(g.amount, g.currency)}</b>
                <span>
                  <button className="link-btn" onClick={() => openEdit(g)}>✏️</button>
                  <button className="link-btn" onClick={() => remove(g)}>🗑</button>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

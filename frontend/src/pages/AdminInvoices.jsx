import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api from "../api/axios";
import { useLanguage } from "../i18n/LanguageContext";
import { formatUSD, approxKHR } from "../utils/currency";

function todayStr() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Phnom_Penh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
const STATUS_BADGE = { PAID: "verified", PARTIAL: "pending", UNPAID: "rejected", VOID: "" };
const blankLine = (kind = "stock") => ({ kind, productId: "", name: "", quantity: "1", unitPrice: "", group: "" });

// Admin shop invoices: list + "new invoice" form. Each line is either
//   • from stock — pick a product; saving the invoice cuts its stock
//     automatically and records the sale (and profit) in the shop report, or
//   • manual — type any description and price; no effect on stock.
// Opening an invoice shows the printable version (InvoiceView).
export default function AdminInvoices() {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [packages, setPackages] = useState([]);
  const [list, setList] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showForm, setShowForm] = useState(false);

  // form
  const [date, setDate] = useState(todayStr());
  const [invLang, setInvLang] = useState(language === "en" ? "en" : "km");
  const [cName, setCName] = useState("");
  const [cPhone, setCPhone] = useState("");
  const [cAddress, setCAddress] = useState("");
  const [lines, setLines] = useState([blankLine()]);
  const [discount, setDiscount] = useState("");
  const [paid, setPaid] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (statusFilter) params.set("status", statusFilter);
      const { data } = await api.get(`/invoices?${params}`);
      setList(data);
    } catch {
      setList([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const id = setTimeout(load, 250);
    return () => clearTimeout(id);
  }, [q, statusFilter]);

  useEffect(() => {
    api.get("/products").then(({ data }) => setProducts(data)).catch(() => {});
    api.get("/packages").then(({ data }) => setPackages(data.filter((p) => p.active))).catch(() => {});
  }, []);

  // Add a whole package: its stock items + service/fee lines, grouped under
  // the package name; a cheaper package price is added to the discount.
  const addPackage = (pkg) => {
    if (!pkg) return;
    const newLines = pkg.items.map((it) => ({
      kind: it.product ? "stock" : "manual",
      productId: it.product ? String(it.product) : "",
      name: it.product ? "" : it.name,
      quantity: String(it.quantity),
      unitPrice: String(it.unitPrice),
      group: pkg.name,
    }));
    setLines((ls) => {
      const kept = ls.filter((l) => l.productId || l.name.trim() || l.group);
      return [...kept, ...newLines];
    });
    if (pkg.saving > 0) setDiscount((d) => String(Math.round(((Number(d) || 0) + pkg.saving) * 100) / 100));
    setShowForm(true);
  };

  // "Sell" button on a package → /admin/invoices?package=<id>
  useEffect(() => {
    const id = params.get("package");
    if (!id || packages.length === 0) return;
    addPackage(packages.find((p) => p._id === id));
    setParams({}, { replace: true });
  }, [packages]);

  const setLine = (i, patch) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const pickProduct = (i, id) => {
    const p = products.find((x) => x._id === id);
    setLine(i, { productId: id, name: p ? p.name : "", unitPrice: p ? String(p.price) : "" });
  };

  const subtotal = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0);
  const disc = Math.min(Number(discount) || 0, subtotal);
  const total = subtotal - disc;

  // Stock needed per product across all lines (same product on two lines).
  const needByProduct = useMemo(() => {
    const m = {};
    lines.forEach((l) => {
      if (l.kind === "stock" && l.productId) m[l.productId] = (m[l.productId] || 0) + (Number(l.quantity) || 0);
    });
    return m;
  }, [lines]);

  const resetForm = () => {
    setDate(todayStr());
    setCName("");
    setCPhone("");
    setCAddress("");
    setLines([blankLine()]);
    setDiscount("");
    setPaid("");
    setNote("");
    setFormError("");
  };

  const submit = async (e) => {
    e.preventDefault();
    setFormError("");
    const items = [];
    for (const [i, l] of lines.entries()) {
      if (l.kind === "stock" && !l.productId) return setFormError(`${t("invoices.line")} ${i + 1}: ${t("invoices.chooseProduct")}`);
      if (l.kind === "manual" && !l.name.trim()) return setFormError(`${t("invoices.line")} ${i + 1}: ${t("invoices.enterDescription")}`);
      if (!(Number(l.quantity) > 0)) return setFormError(`${t("invoices.line")} ${i + 1}: ${t("invoices.enterQty")}`);
      if (l.unitPrice === "" || Number(l.unitPrice) < 0) return setFormError(`${t("invoices.line")} ${i + 1}: ${t("invoices.enterPrice")}`);
      items.push(
        l.kind === "stock"
          ? { productId: l.productId, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) }
          : { name: l.name.trim(), quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) }
      );
      items[items.length - 1].group = l.group || "";
    }
    for (const [pid, need] of Object.entries(needByProduct)) {
      const p = products.find((x) => x._id === pid);
      if (p && need > p.stock) return setFormError(`${p.name}: ${t("invoices.notEnoughStock")} (${p.stock})`);
    }
    setSaving(true);
    try {
      const { data } = await api.post("/invoices", {
        date,
        language: invLang,
        customer: { name: cName, phone: cPhone, address: cAddress },
        items,
        discount: Number(discount) || 0,
        paidAmount: paid === "" ? 0 : Number(paid),
        note,
      });
      resetForm();
      navigate(`/admin/invoices/${data._id}`);
    } catch (err) {
      setFormError(err.response?.data?.message || t("invoices.failedToSave"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container dash-body">
      <div className="dash-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2>{t("invoices.title")}</h2>
          <p>{t("invoices.intro")}</p>
        </div>
        {!showForm && (
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            ➕ {t("invoices.newInvoice")}
          </button>
        )}
      </div>

      {showForm && (
        <form className="card invoice-form" onSubmit={submit}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h3 style={{ margin: 0 }}>{t("invoices.newInvoice")}</h3>
            <div className="seg-toggle">
              <button type="button" className={invLang === "km" ? "active" : ""} onClick={() => setInvLang("km")}>
                ខ្មែរ
              </button>
              <button type="button" className={invLang === "en" ? "active" : ""} onClick={() => setInvLang("en")}>
                English
              </button>
            </div>
          </div>
          <p className="mini-empty" style={{ margin: "4px 0 12px" }}>{t("invoices.langHint")}</p>

          <h4 className="invoice-form-h">{t("invoices.customer")}</h4>
          <div className="filter-row" style={{ marginBottom: 0 }}>
            <div className="field" style={{ flex: 2, minWidth: 180 }}>
              <label>{t("invoices.customerName")}</label>
              <input value={cName} onChange={(e) => setCName(e.target.value)} />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 140 }}>
              <label>{t("invoices.customerPhone")}</label>
              <input value={cPhone} onChange={(e) => setCPhone(e.target.value)} inputMode="tel" />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 140 }}>
              <label>{t("invoices.date")}</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>{t("invoices.customerAddress")}</label>
            <input value={cAddress} onChange={(e) => setCAddress(e.target.value)} />
          </div>

          <h4 className="invoice-form-h">{t("invoices.items")}</h4>
          <div className="invoice-lines">
            {lines.map((l, i) => {
              const p = products.find((x) => x._id === l.productId);
              const over = p && needByProduct[p._id] > p.stock;
              return (
                <div className={`invoice-line ${l.group ? "in-package" : ""}`} key={i}>
                  {l.group && (i === 0 || lines[i - 1].group !== l.group) && (
                    <div className="invoice-line-group">🎁 {l.group}</div>
                  )}
                  <div className="invoice-line-kind">
                    <span>{i + 1}.</span>
                    <select value={l.kind} onChange={(e) => setLine(i, { ...blankLine(e.target.value), quantity: l.quantity })}>
                      <option value="stock">📦 {t("invoices.fromStock")}</option>
                      <option value="manual">✍️ {t("invoices.manual")}</option>
                    </select>
                  </div>
                  <div className="invoice-line-desc">
                    {l.kind === "stock" ? (
                      <select value={l.productId} onChange={(e) => pickProduct(i, e.target.value)}>
                        <option value="">{t("invoices.chooseProduct")}</option>
                        {products.map((x) => (
                          <option key={x._id} value={x._id} disabled={x.stock <= 0}>
                            {x.name} — {t("invoices.inStock")} {x.stock}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input value={l.name} onChange={(e) => setLine(i, { name: e.target.value })} placeholder={t("invoices.descriptionPh")} />
                    )}
                    {over && <small className="error-text">{t("invoices.notEnoughStock")} ({p.stock})</small>}
                  </div>
                  <input
                    className="invoice-line-qty"
                    type="number"
                    min="0"
                    step={l.kind === "stock" ? 1 : "any"}
                    value={l.quantity}
                    onChange={(e) => setLine(i, { quantity: e.target.value })}
                    aria-label={t("invoices.qty")}
                    placeholder={t("invoices.qty")}
                  />
                  <input
                    className="invoice-line-price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={l.unitPrice}
                    onChange={(e) => setLine(i, { unitPrice: e.target.value })}
                    aria-label={t("invoices.unitPrice")}
                    placeholder="$"
                  />
                  <div className="invoice-line-total">{formatUSD((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0))}</div>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : ls))}
                    disabled={lines.length === 1}
                    title={t("common.delete")}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0 16px" }}>
            <button type="button" className="btn btn-outline" onClick={() => setLines((ls) => [...ls, blankLine("stock")])}>
              + 📦 {t("invoices.addStockLine")}
            </button>
            <button type="button" className="btn btn-outline" onClick={() => setLines((ls) => [...ls, blankLine("manual")])}>
              + ✍️ {t("invoices.addManualLine")}
            </button>
            {packages.length > 0 && (
              <select
                className="package-picker"
                value=""
                onChange={(e) => addPackage(packages.find((p) => p._id === e.target.value))}
              >
                <option value="">🎁 {t("packages.addToInvoice")}</option>
                {packages.map((p) => (
                  <option key={p._id} value={p._id} disabled={p.canMake === 0}>
                    {p.name} — {formatUSD(p.finalPrice)}
                    {p.canMake === 0 ? ` (${t("invoices.notEnoughStock")})` : ""}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="invoice-form-bottom">
            <div className="field" style={{ flex: 2, minWidth: 220 }}>
              <label>{t("invoices.note")}</label>
              <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div className="invoice-totals-box">
              <div><span>{t("invoices.subtotal")}</span><b>{formatUSD(subtotal)}</b></div>
              <div>
                <span>{t("invoices.discount")} ($)</span>
                <input type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" />
              </div>
              <div className="invoice-grand"><span>{t("invoices.total")}</span><b>{formatUSD(total)}</b></div>
              <div className="price-khr" style={{ textAlign: "right" }}>{approxKHR(total)}</div>
              <div>
                <span>{t("invoices.paidNow")} ($)</span>
                <input type="number" min="0" step="0.01" value={paid} onChange={(e) => setPaid(e.target.value)} placeholder="0" />
              </div>
              <button type="button" className="link-btn" style={{ alignSelf: "flex-end" }} onClick={() => setPaid(String(Math.round(total * 100) / 100))}>
                {t("invoices.paidInFull")}
              </button>
            </div>
          </div>

          {formError && <div className="error-text">{formError}</div>}
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button className="btn btn-primary" disabled={saving}>
              {saving ? t("common.saving") : t("invoices.saveInvoice")}
            </button>
            <button type="button" className="btn btn-outline" onClick={() => { resetForm(); setShowForm(false); }}>
              {t("common.cancel")}
            </button>
          </div>
        </form>
      )}

      <div className="filter-row" style={{ marginTop: 20 }}>
        <input placeholder={t("invoices.searchPh")} value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 280 }} />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">{t("invoices.allStatuses")}</option>
          {["UNPAID", "PARTIAL", "PAID", "VOID"].map((s) => (
            <option key={s} value={s}>{t(`invoices.status_${s}`)}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <p>{t("common.loading")}</p>
      ) : (
        <div className="table-scroll">
          <table className="athletes">
            <thead>
              <tr>
                <th>{t("invoices.invoiceNo")}</th>
                <th>{t("invoices.date")}</th>
                <th>{t("invoices.customer")}</th>
                <th>{t("invoices.total")}</th>
                <th>{t("invoices.paid")}</th>
                <th>{t("common.status")}</th>
                <th>{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {list.map((inv) => (
                <tr key={inv._id} style={inv.voided ? { opacity: 0.55 } : undefined}>
                  <td data-label={t("invoices.invoiceNo")}><b>{inv.invoiceNo}</b></td>
                  <td data-label={t("invoices.date")}>{new Date(inv.date).toLocaleDateString("en-GB")}</td>
                  <td data-label={t("invoices.customer")}>
                    {inv.customer?.name || "—"}
                    {inv.customer?.phone && <div style={{ fontSize: 12, color: "#888" }}>{inv.customer.phone}</div>}
                  </td>
                  <td data-label={t("invoices.total")}>
                    {formatUSD(inv.total)}
                    <div className="price-khr">{approxKHR(inv.total)}</div>
                  </td>
                  <td data-label={t("invoices.paid")}>{formatUSD(inv.paidAmount)}</td>
                  <td data-label={t("common.status")}>
                    <span className={`badge ${STATUS_BADGE[inv.status]}`}>{t(`invoices.status_${inv.status}`)}</span>
                  </td>
                  <td data-label={t("common.actions")}>
                    <Link className="link-btn" to={`/admin/invoices/${inv._id}`}>🧾 {t("invoices.openPrint")}</Link>
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", color: "#777" }}>{t("invoices.none")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

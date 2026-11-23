import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api from "../api/axios";
import { useLanguage } from "../i18n/LanguageContext";
import { formatUSD, approxKHR } from "../utils/currency";
import { effectivePrice } from "../utils/pricing";
import ProductPicker from "../components/ProductPicker";

function todayStr() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Phnom_Penh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
const STATUS_BADGE = { PAID: "verified", PARTIAL: "pending", UNPAID: "rejected", VOID: "", PLANNED: "planned" };
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
  // Retail or wholesale customer — wholesale gets each product's wholesale price.
  const [customerType, setCustomerType] = useState("retail");
  const [cName, setCName] = useState("");
  const [cPhone, setCPhone] = useState("");
  const [cAddress, setCAddress] = useState("");
  const [lines, setLines] = useState([blankLine()]);
  // Packages added to this invoice: { packageId: count }.
  const [pkgCounts, setPkgCounts] = useState({});
  const [discount, setDiscount] = useState("");
  const [paid, setPaid] = useState("");
  const [note, setNote] = useState("");
  // Planned sale (quotation): stock isn't cut until it's sold for real.
  const [planned, setPlanned] = useState(false);
  const [expectedDate, setExpectedDate] = useState(todayStr());
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

  // Stock needed per product across all lines (same product on two lines).
  const needByProduct = useMemo(() => {
    const m = {};
    lines.forEach((l) => {
      if (l.kind === "stock" && l.productId) m[l.productId] = (m[l.productId] || 0) + (Number(l.quantity) || 0);
    });
    return m;
  }, [lines]);

  // Stock that already-packed packages bring: { productId: qty } for the
  // given package counts (packed ones are used first when selling).
  const packedExtra = (counts) => {
    const m = {};
    Object.entries(counts).forEach(([id, n]) => {
      const pkg = packages.find((p) => p._id === id);
      if (!pkg) return;
      const use = Math.min(n, pkg.packed || 0);
      pkg.items.forEach((it) => {
        if (it.product) m[String(it.product)] = (m[String(it.product)] || 0) + it.quantity * use;
      });
    });
    return m;
  };

  // Add a whole package: its stock items + service/fee lines, grouped under
  // the package name; a cheaper package price is added to the discount.
  // Adding the same package again adds its quantities to the existing group
  // (2 packages = 2× everything). If stock can't cover it (counting what's
  // already on the invoice), show an alert and don't add it.
  const addPackage = (pkg) => {
    if (!pkg) return;
    const nextCounts = { ...pkgCounts, [pkg._id]: (pkgCounts[pkg._id] || 0) + 1 };
    if (!planned) {
      const need = { ...needByProduct };
      const extra = packedExtra(nextCounts);
      const short = [];
      pkg.items.forEach((it) => {
        if (!it.product) return;
        const id = String(it.product);
        need[id] = (need[id] || 0) + it.quantity;
      });
      pkg.items.forEach((it) => {
        if (!it.product) return;
        const id = String(it.product);
        const p = products.find((x) => x._id === id);
        const stock = (p ? p.stock : 0) + (extra[id] || 0);
        if (need[id] > stock && !short.some((s) => s.id === id)) short.push({ id, name: p ? p.name : it.name, need: need[id], stock });
      });
      if (short.length) {
        alert(
          `${t("packages.notEnoughTitle").replace("{name}", pkg.name)}\n` +
            short.map((s) => `• ${s.name}: ${t("packages.needHave").replace("{need}", s.need).replace("{have}", s.stock)}`).join("\n")
        );
        return;
      }
    }
    setPkgCounts(nextCounts);
    setLines((ls) => {
      const kept = ls.filter((l) => l.productId || l.name.trim() || l.group);
      if (kept.some((l) => l.group === pkg.name)) {
        // Same package again → bump the quantities of its lines.
        const left = [...pkg.items];
        return kept.map((l) => {
          if (l.group !== pkg.name) return l;
          const k = left.findIndex((it) => (it.product ? String(it.product) === l.productId : !l.productId && it.name === l.name));
          if (k < 0) return l;
          const [it] = left.splice(k, 1);
          return { ...l, quantity: String((Number(l.quantity) || 0) + it.quantity) };
        });
      }
      const newLines = pkg.items.map((it) => ({
        kind: it.product ? "stock" : "manual",
        productId: it.product ? String(it.product) : "",
        name: it.product ? "" : it.name,
        quantity: String(it.quantity),
        unitPrice: String(it.unitPrice),
        priceManual: true, // keep the package's own prices
        group: pkg.name,
      }));
      return [...kept, ...newLines];
    });
    if (pkg.saving > 0) setDiscount((d) => String(Math.round(((Number(d) || 0) + pkg.saving) * 100) / 100));
    setShowForm(true);
  };

  // "Sell" button on a package → /admin/invoices?package=<id>
  useEffect(() => {
    const id = params.get("package");
    // Wait for products too — the stock check needs them.
    if (!id || packages.length === 0 || products.length === 0) return;
    addPackage(packages.find((p) => p._id === id));
    setParams({}, { replace: true });
  }, [packages, products]);

  const setLine = (i, patch) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  // Price for a stock line from the product's rules: sale discount,
  // wholesale customer, or wholesale quantity — unless typed in by hand.
  const autoPrice = (productId, qty, type = customerType) => {
    const p = products.find((x) => x._id === productId);
    return p ? String(effectivePrice(p, Number(qty) || 0, type === "wholesale").unitPrice) : "";
  };
  const pickProduct = (i, id) => {
    const p = products.find((x) => x._id === id);
    setLine(i, { productId: id, name: p ? p.name : "", unitPrice: autoPrice(id, lines[i].quantity), priceManual: false });
  };
  const setQty = (i, qty) => {
    const l = lines[i];
    const patch = { quantity: qty };
    if (l.kind === "stock" && l.productId && !l.priceManual) patch.unitPrice = autoPrice(l.productId, qty);
    setLine(i, patch);
  };
  const changeCustomerType = (type) => {
    setCustomerType(type);
    setLines((ls) =>
      ls.map((l) => (l.kind === "stock" && l.productId && !l.priceManual ? { ...l, unitPrice: autoPrice(l.productId, l.quantity, type) } : l))
    );
  };

  const packedExtraNow = packedExtra(pkgCounts);
  const subtotal = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0);
  const disc = Math.min(Number(discount) || 0, subtotal);
  const total = subtotal - disc;

  const finalize = async (inv) => {
    if (!confirm(t("invoicesPlan.confirmFinalize").replace("{no}", inv.invoiceNo))) return;
    try {
      const { data } = await api.post(`/invoices/${inv._id}/finalize`, {});
      navigate(`/admin/invoices/${data._id}`);
    } catch (err) {
      alert(err.response?.data?.message || t("invoices.failedToSave"));
    }
  };
  const resetForm = () => {
    setDate(todayStr());
    setCName("");
    setCPhone("");
    setCAddress("");
    setLines([blankLine()]);
    setPkgCounts({});
    setCustomerType("retail");
    setDiscount("");
    setPaid("");
    setNote("");
    setFormError("");
    setPlanned(false);
    setExpectedDate(todayStr());
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
    // Only packages whose lines are still on the invoice.
    const usedCounts = Object.fromEntries(
      Object.entries(pkgCounts).filter(([id]) => {
        const pkg = packages.find((p) => p._id === id);
        return pkg && lines.some((l) => l.group === pkg.name);
      })
    );
    const extra = packedExtra(usedCounts);
    for (const [pid, need] of Object.entries(needByProduct)) {
      const p = products.find((x) => x._id === pid);
      const have = p ? p.stock + (extra[pid] || 0) : 0;
      if (!planned && p && need > have) {
        alert(`${p.name}: ${t("invoices.notEnoughStock")} (${have})`);
        return setFormError(`${p.name}: ${t("invoices.notEnoughStock")} (${have})`);
      }
    }
    setSaving(true);
    try {
      const { data } = await api.post("/invoices", {
        date,
        language: invLang,
        customerType,
        customer: { name: cName, phone: cPhone, address: cAddress },
        items,
        discount: Number(discount) || 0,
        paidAmount: paid === "" ? 0 : Number(paid),
        note,
        planned,
        expectedDate: planned ? expectedDate : undefined,
        packages: Object.entries(usedCounts).map(([packageId, count]) => ({ packageId, count })),
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
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn-primary" onClick={() => { setPlanned(false); setShowForm(true); }}>
              ➕ {t("invoices.newInvoice")}
            </button>
            <button className="btn btn-outline" onClick={() => { setPlanned(true); setShowForm(true); }}>
              📝 {t("invoicesPlan.newPlanned")}
            </button>
          </div>
        )}
      </div>

      {showForm && (
        <form className="card invoice-form" onSubmit={submit}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h3 style={{ margin: 0 }}>{planned ? t("invoicesPlan.newPlanned") : t("invoices.newInvoice")}</h3>
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
          <div className="seg-toggle fin-type invoice-kind">
            <button type="button" className={!planned ? "active income" : ""} onClick={() => setPlanned(false)}>🧾 {t("invoicesPlan.sellNow")}</button>
            <button type="button" className={planned ? "active planned" : ""} onClick={() => setPlanned(true)}>📝 {t("invoicesPlan.planSale")}</button>
          </div>
          {planned && (
            <div className="invoice-plan-box">
              <div className="field" style={{ maxWidth: 220, margin: 0 }}>
                <label>{t("invoicesPlan.expectedDate")}</label>
                <input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
              </div>
              <p className="mini-empty" style={{ margin: 0 }}>{t("invoicesPlan.planHelp")}</p>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 14 }}>
            <h4 className="invoice-form-h" style={{ margin: 0 }}>{t("invoices.customer")}</h4>
            <div className="seg-toggle">
              <button type="button" className={customerType === "retail" ? "active" : ""} onClick={() => changeCustomerType("retail")}>
                🛍 {t("pricing.retail")}
              </button>
              <button type="button" className={customerType === "wholesale" ? "active" : ""} onClick={() => changeCustomerType("wholesale")}>
                📦 {t("pricing.wholesaleCustomer")}
              </button>
            </div>
          </div>
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
              const over = p && needByProduct[p._id] > p.stock + (packedExtraNow[p._id] || 0);
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
                      <ProductPicker products={products} value={l.productId} onChange={(id) => pickProduct(i, id)} />
                    ) : (
                      <input value={l.name} onChange={(e) => setLine(i, { name: e.target.value })} placeholder={t("invoices.descriptionPh")} />
                    )}
                    {over && <small className="error-text">{t("invoices.notEnoughStock")} ({p.stock + (packedExtraNow[p._id] || 0)})</small>}
                    {p && !l.priceManual && (() => {
                      const ep = effectivePrice(p, Number(l.quantity) || 0, customerType === "wholesale");
                      if (!ep.reason) return null;
                      return (
                        <small className={`price-reason ${ep.reason}`}>
                          {ep.reason === "discount" ? `🏷 -${p.discountPercent}%` : `📦 ${t("pricing.wholesalePrice")}`} ·{" "}
                          <s>{formatUSD(ep.listPrice)}</s> → {formatUSD(ep.unitPrice)}
                        </small>
                      );
                    })()}
                    {p && !l.priceManual && customerType !== "wholesale" && p.wholesalePrice > 0 && p.wholesaleMinQty > 0 &&
                      (Number(l.quantity) || 0) < p.wholesaleMinQty && (
                        <small className="mini-empty">
                          {t("pricing.wholesaleHint").replace("{n}", p.wholesaleMinQty).replace("{price}", formatUSD(p.wholesalePrice))}
                        </small>
                      )}
                  </div>
                  <input
                    className="invoice-line-qty"
                    type="number"
                    min="0"
                    step={l.kind === "stock" ? 1 : "any"}
                    value={l.quantity}
                    onChange={(e) => setQty(i, e.target.value)}
                    aria-label={t("invoices.qty")}
                    placeholder={t("invoices.qty")}
                  />
                  <input
                    className="invoice-line-price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={l.unitPrice}
                    onChange={(e) => setLine(i, { unitPrice: e.target.value, priceManual: true })}
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
                    {p.packed > 0 ? ` · 📦 ${p.packed}` : ""}
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
              {saving ? t("common.saving") : planned ? t("invoicesPlan.savePlanned") : t("invoices.saveInvoice")}
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
          {["PLANNED", "UNPAID", "PARTIAL", "PAID", "VOID"].map((s) => (
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
                  <td data-label={t("invoices.date")}>
                    {new Date(inv.date).toLocaleDateString("en-GB")}
                    {inv.planned && inv.expectedDate && (
                      <div className="mini-empty">📅 {t("invoicesPlan.expectedShort")} {new Date(inv.expectedDate).toLocaleDateString("en-GB")}</div>
                    )}
                  </td>
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
                    {inv.planned && !inv.voided && (
                      <button className="link-btn" style={{ marginLeft: 10 }} onClick={() => finalize(inv)}>✅ {t("invoicesPlan.finalize")}</button>
                    )}
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

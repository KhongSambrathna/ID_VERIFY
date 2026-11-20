import { useEffect, useState } from "react";
import api from "../api/axios";
import { useLanguage } from "../i18n/LanguageContext";
import { formatUSD, approxKHR } from "../utils/currency";
import ProductPicker from "../components/ProductPicker";

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
function todayStr(offset = 0) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Phnom_Penh", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(Date.now() + offset * 86400000)
  );
}
function dateInput(d) {
  return d ? todayStrFrom(d) : "";
}
function todayStrFrom(d) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Phnom_Penh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(d));
}
const blankLine = (kind = "existing") => ({ kind, productId: "", name: "", unit: "pcs", quantity: "", unitCost: "", expectedSellPrice: "" });
const STATUS_BADGE = { draft: "", ordered: "pending", received: "verified", cancelled: "rejected" };

// Same maths as the server: shipping + other costs are shared over the
// lines by value → landed cost per unit → expected profit.
function calcPlan(lines, shipping, other) {
  const rows = lines.map((l) => ({ q: Number(l.quantity) || 0, c: Number(l.unitCost) || 0, s: Number(l.expectedSellPrice) || 0 }));
  const goods = rows.reduce((a, r) => a + r.q * r.c, 0);
  const extra = (Number(shipping) || 0) + (Number(other) || 0);
  const lineCalc = rows.map((r) => {
    const g = r.q * r.c;
    const share = goods > 0 ? (extra * g) / goods : rows.length ? extra / rows.length : 0;
    const cost = g + share;
    const revenue = r.q * r.s;
    return { landed: r.q > 0 ? cost / r.q : 0, revenue, profit: revenue - cost, margin: revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0 };
  });
  const totalCost = goods + extra;
  const revenue = lineCalc.reduce((a, l) => a + l.revenue, 0);
  return {
    lineCalc,
    goods,
    extra,
    totalCost,
    revenue,
    profit: revenue - totalCost,
    margin: revenue > 0 ? ((revenue - totalCost) / revenue) * 100 : 0,
    roi: totalCost > 0 ? ((revenue - totalCost) / totalCost) * 100 : 0,
    breakEven: revenue > 0 ? (totalCost / revenue) * 100 : 0,
  };
}

function daysUntil(d) {
  const a = new Date(todayStr() + "T00:00:00+07:00");
  const b = new Date(todayStrFrom(d) + "T00:00:00+07:00");
  return Math.round((b - a) / 86400000);
}

// Admin — plan purchases before buying: supplier, buying prices, shipping
// and other costs, delivery date, and the expected selling prices → landed
// cost per unit, expected profit, margin and return on the money spent.
// When the goods arrive, "Receive into stock" records the purchase.
export default function AdminPurchasePlans() {
  const { t } = useLanguage();
  const [plans, setPlans] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | "new" | id
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  const [title, setTitle] = useState("");
  const [supName, setSupName] = useState("");
  const [supPhone, setSupPhone] = useState("");
  const [orderDate, setOrderDate] = useState("");
  const [delivery, setDelivery] = useState("");
  const [status, setStatus] = useState("draft");
  const [lines, setLines] = useState([blankLine()]);
  const [shipping, setShipping] = useState("");
  const [other, setOther] = useState("");
  const [otherNote, setOtherNote] = useState("");
  const [note, setNote] = useState("");

  const load = async () => {
    try {
      const [{ data: pl }, { data: pr }] = await Promise.all([api.get("/purchase-plans"), api.get("/products")]);
      setPlans(pl);
      setProducts(pr);
    } catch {
      /* keep what we have */
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const openForm = (plan) => {
    setFormError("");
    if (!plan) {
      setEditing("new");
      setTitle("");
      setSupName("");
      setSupPhone("");
      setOrderDate(todayStr());
      setDelivery(todayStr(7));
      setStatus("draft");
      setLines([blankLine()]);
      setShipping("");
      setOther("");
      setOtherNote("");
      setNote("");
    } else {
      setEditing(plan._id);
      setTitle(plan.title);
      setSupName(plan.supplier?.name || "");
      setSupPhone(plan.supplier?.phone || "");
      setOrderDate(dateInput(plan.orderDate));
      setDelivery(dateInput(plan.expectedDelivery));
      setStatus(plan.status);
      setLines(
        plan.items.map((it) => ({
          kind: it.product ? "existing" : "new",
          productId: it.product ? String(it.product) : "",
          name: it.product ? "" : it.name,
          unit: it.unit || "pcs",
          quantity: String(it.quantity),
          unitCost: String(it.unitCost),
          expectedSellPrice: String(it.expectedSellPrice || ""),
        }))
      );
      setShipping(plan.shippingCost ? String(plan.shippingCost) : "");
      setOther(plan.otherCost ? String(plan.otherCost) : "");
      setOtherNote(plan.otherCostNote || "");
      setNote(plan.note || "");
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const setLine = (i, patch) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const pick = (i, id) => {
    const p = products.find((x) => x._id === id);
    setLine(i, {
      productId: id,
      unitCost: lines[i].unitCost || (p?.costPrice ? String(p.costPrice) : ""),
      expectedSellPrice: p ? String(p.price) : "",
    });
  };
  const c = calcPlan(lines, shipping, other);

  const save = async (e) => {
    e.preventDefault();
    setFormError("");
    if (!title.trim()) return setFormError(t("purchasePlans.enterTitle"));
    const items = [];
    for (const [i, l] of lines.entries()) {
      const n = `${t("invoices.line")} ${i + 1}: `;
      if (l.kind === "existing" && !l.productId) return setFormError(n + t("invoices.chooseProduct"));
      if (l.kind === "new" && !l.name.trim()) return setFormError(n + t("purchasePlans.enterItemName"));
      if (!(Number(l.quantity) > 0) || !Number.isInteger(Number(l.quantity))) return setFormError(n + t("invoices.enterQty"));
      if (l.unitCost === "" || Number(l.unitCost) < 0) return setFormError(n + t("purchasePlans.enterBuyPrice"));
      items.push(
        l.kind === "existing"
          ? { productId: l.productId, quantity: Number(l.quantity), unitCost: Number(l.unitCost), expectedSellPrice: Number(l.expectedSellPrice) || 0 }
          : { name: l.name.trim(), unit: l.unit, quantity: Number(l.quantity), unitCost: Number(l.unitCost), expectedSellPrice: Number(l.expectedSellPrice) || 0 }
      );
    }
    setBusy(true);
    try {
      const body = {
        title: title.trim(),
        supplier: { name: supName, phone: supPhone },
        orderDate,
        expectedDelivery: delivery,
        status,
        items,
        shippingCost: Number(shipping) || 0,
        otherCost: Number(other) || 0,
        otherCostNote: otherNote,
        note,
      };
      if (editing === "new") await api.post("/purchase-plans", body);
      else await api.put(`/purchase-plans/${editing}`, body);
      setEditing(null);
      load();
    } catch (err) {
      setFormError(err.response?.data?.message || t("invoices.failedToSave"));
    } finally {
      setBusy(false);
    }
  };

  const receive = async (plan) => {
    if (!confirm(t("purchasePlans.confirmReceive").replace("{title}", plan.title))) return;
    setBusy(true);
    try {
      await api.post(`/purchase-plans/${plan._id}/receive`, { date: todayStr() });
      load();
    } catch (err) {
      alert(err.response?.data?.message || t("invoices.failedToSave"));
    } finally {
      setBusy(false);
    }
  };
  const remove = async (plan) => {
    if (!confirm(t("purchasePlans.confirmDelete").replace("{title}", plan.title))) return;
    try {
      await api.delete(`/purchase-plans/${plan._id}`);
      load();
    } catch (err) {
      alert(err.response?.data?.message || t("invoices.failedToSave"));
    }
  };
  const quickStatus = async (plan, s) => {
    try {
      await api.put(`/purchase-plans/${plan._id}`, { status: s });
      load();
    } catch (err) {
      alert(err.response?.data?.message || t("invoices.failedToSave"));
    }
  };

  const tone = (n) => (n >= 0 ? "var(--ok)" : "var(--bad)");

  return (
    <div className="container dash-body">
      <div className="dash-header" style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <h2>{t("purchasePlans.title")}</h2>
          <p>{t("purchasePlans.intro")}</p>
        </div>
        {!editing && (
          <button className="btn btn-primary" onClick={() => openForm(null)}>
            ➕ {t("purchasePlans.newPlan")}
          </button>
        )}
      </div>

      {editing && (
        <form className="card invoice-form plan-form" onSubmit={save}>
          <h3 style={{ marginTop: 0 }}>{editing === "new" ? t("purchasePlans.newPlan") : t("purchasePlans.editPlan")}</h3>
          <div className="filter-row" style={{ marginBottom: 0 }}>
            <div className="field" style={{ flex: 2, minWidth: 220 }}>
              <label>{t("purchasePlans.planTitle")}</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("purchasePlans.planTitlePh")} />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 150 }}>
              <label>{t("common.status")}</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                {["draft", "ordered", "cancelled"].map((s) => (
                  <option key={s} value={s}>{t(`purchasePlans.status_${s}`)}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="filter-row" style={{ marginBottom: 0 }}>
            <div className="field" style={{ flex: 2, minWidth: 180 }}>
              <label>{t("purchasePlans.supplier")}</label>
              <input value={supName} onChange={(e) => setSupName(e.target.value)} />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 140 }}>
              <label>{t("purchasePlans.supplierPhone")}</label>
              <input value={supPhone} onChange={(e) => setSupPhone(e.target.value)} inputMode="tel" />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 140 }}>
              <label>{t("purchasePlans.orderDate")}</label>
              <input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 140 }}>
              <label>🚚 {t("purchasePlans.deliveryDate")}</label>
              <input type="date" value={delivery} onChange={(e) => setDelivery(e.target.value)} />
            </div>
          </div>

          <h4 className="invoice-form-h">{t("purchasePlans.items")}</h4>
          <div className="plan-lines">
            <div className="plan-line plan-line-head">
              <span>{t("adminShop.product")}</span>
              <span>{t("invoices.qty")}</span>
              <span>{t("purchasePlans.buyPrice")}</span>
              <span>{t("purchasePlans.sellPrice")}</span>
              <span>{t("purchasePlans.landedCost")}</span>
              <span>{t("purchasePlans.expectedProfit")}</span>
              <span></span>
            </div>
            {lines.map((l, i) => {
              const p = products.find((x) => x._id === l.productId);
              const lc = c.lineCalc[i];
              return (
                <div className="plan-line" key={i}>
                  <div className="plan-line-product">
                    <select value={l.kind} onChange={(e) => setLine(i, { ...blankLine(e.target.value), quantity: l.quantity })}>
                      <option value="existing">📦 {t("purchasePlans.existingItem")}</option>
                      <option value="new">✨ {t("purchasePlans.newItem")}</option>
                    </select>
                    {l.kind === "existing" ? (
                      <ProductPicker products={products} value={l.productId} onChange={(id) => pick(i, id)} allowOutOfStock />
                    ) : (
                      <div style={{ display: "flex", gap: 6 }}>
                        <input value={l.name} onChange={(e) => setLine(i, { name: e.target.value })} placeholder={t("purchasePlans.itemNamePh")} style={{ flex: 1 }} />
                        <input value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value })} placeholder="pcs" style={{ width: 60 }} />
                      </div>
                    )}
                    {p && (
                      <small className="mini-empty">
                        {t("purchasePlans.nowInStock")} {p.stock} · {t("purchasePlans.currentCost")} {formatUSD(p.costPrice || 0)}
                        {l.unitCost !== "" && p.costPrice > 0 && Number(l.unitCost) !== p.costPrice && (
                          <b style={{ color: Number(l.unitCost) < p.costPrice ? "var(--ok)" : "var(--bad)" }}>
                            {" "}({Number(l.unitCost) < p.costPrice ? "▼" : "▲"} {formatUSD(Math.abs(Number(l.unitCost) - p.costPrice))})
                          </b>
                        )}
                      </small>
                    )}
                  </div>
                  <input type="number" min="1" step="1" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} placeholder="0" />
                  <input type="number" min="0" step="0.01" value={l.unitCost} onChange={(e) => setLine(i, { unitCost: e.target.value })} placeholder="$" />
                  <input type="number" min="0" step="0.01" value={l.expectedSellPrice} onChange={(e) => setLine(i, { expectedSellPrice: e.target.value })} placeholder="$" />
                  <div className="plan-num">{formatUSD(lc.landed)}</div>
                  <div className="plan-num" style={{ color: tone(lc.profit) }}>
                    {formatUSD(lc.profit)}
                    <small>{lc.margin.toFixed(1)}%</small>
                  </div>
                  <button type="button" className="link-btn" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0 16px" }}>
            <button type="button" className="btn btn-outline" onClick={() => setLines((ls) => [...ls, blankLine("existing")])}>
              + 📦 {t("purchasePlans.existingItem")}
            </button>
            <button type="button" className="btn btn-outline" onClick={() => setLines((ls) => [...ls, blankLine("new")])}>
              + ✨ {t("purchasePlans.newItem")}
            </button>
          </div>

          <div className="invoice-form-bottom">
            <div style={{ flex: 2, minWidth: 240 }}>
              <div className="filter-row" style={{ marginBottom: 0 }}>
                <div className="field" style={{ flex: 1, minWidth: 120 }}>
                  <label>🚚 {t("purchasePlans.shipping")} ($)</label>
                  <input type="number" min="0" step="0.01" value={shipping} onChange={(e) => setShipping(e.target.value)} placeholder="0" />
                </div>
                <div className="field" style={{ flex: 1, minWidth: 120 }}>
                  <label>{t("purchasePlans.otherCost")} ($)</label>
                  <input type="number" min="0" step="0.01" value={other} onChange={(e) => setOther(e.target.value)} placeholder="0" />
                </div>
              </div>
              <div className="field">
                <label>{t("purchasePlans.otherCostNote")}</label>
                <input value={otherNote} onChange={(e) => setOtherNote(e.target.value)} placeholder={t("purchasePlans.otherCostNotePh")} />
              </div>
              <div className="field">
                <label>{t("invoices.note")}</label>
                <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            </div>
            <div className="invoice-totals-box plan-summary">
              <div><span>{t("purchasePlans.goodsCost")}</span><b>{formatUSD(c.goods)}</b></div>
              <div><span>{t("purchasePlans.extraCosts")}</span><b>{formatUSD(c.extra)}</b></div>
              <div className="invoice-grand"><span>{t("purchasePlans.totalCost")}</span><b>{formatUSD(c.totalCost)}</b></div>
              <div className="price-khr" style={{ textAlign: "right" }}>{approxKHR(c.totalCost)}</div>
              <div><span>{t("purchasePlans.expectedRevenue")}</span><b>{formatUSD(c.revenue)}</b></div>
              <div className="invoice-grand" style={{ color: tone(c.profit) }}>
                <span>{t("purchasePlans.expectedProfit")}</span>
                <b>{formatUSD(c.profit)}</b>
              </div>
              <div><span>{t("adminShop.margin")}</span><b>{c.margin.toFixed(1)}%</b></div>
              <div><span>{t("purchasePlans.roi")}</span><b>{c.roi.toFixed(1)}%</b></div>
              {c.revenue > 0 && (
                <p className="mini-empty" style={{ margin: 0 }}>
                  {t("purchasePlans.breakEven").replace("{pct}", Math.min(c.breakEven, 999).toFixed(0))}
                </p>
              )}
            </div>
          </div>

          {formError && <div className="error-text">{formError}</div>}
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button className="btn btn-primary" disabled={busy}>{busy ? t("common.saving") : t("common.save")}</button>
            <button type="button" className="btn btn-outline" onClick={() => setEditing(null)}>{t("common.cancel")}</button>
          </div>
        </form>
      )}

      {loading ? (
        <p>{t("common.loading")}</p>
      ) : plans.length === 0 ? (
        <p className="mini-empty">{t("purchasePlans.none")}</p>
      ) : (
        <div className="package-grid plan-grid">
          {plans.map((pl) => {
            const d = pl.expectedDelivery && pl.status !== "received" && pl.status !== "cancelled" ? daysUntil(pl.expectedDelivery) : null;
            return (
              <div key={pl._id} className={`card package-card plan-card status-${pl.status}`}>
                <div className="package-card-head">
                  <h3>🛒 {pl.title}</h3>
                  <span className={`badge ${STATUS_BADGE[pl.status]}`}>{t(`purchasePlans.status_${pl.status}`)}</span>
                </div>
                <div className="plan-meta">
                  {pl.supplier?.name && <div>🏭 {pl.supplier.name}{pl.supplier.phone ? ` · ${pl.supplier.phone}` : ""}</div>}
                  {pl.expectedDelivery && (
                    <div>
                      🚚 {new Date(pl.expectedDelivery).toLocaleDateString("en-GB")}
                      {d !== null && (
                        <span className={`badge ${d < 0 ? "rejected" : d <= 2 ? "pending" : ""}`} style={{ marginLeft: 6 }}>
                          {d < 0
                            ? t("purchasePlans.lateBy").replace("{n}", -d)
                            : d === 0
                              ? t("purchasePlans.today")
                              : t("purchasePlans.inDays").replace("{n}", d)}
                        </span>
                      )}
                    </div>
                  )}
                  {pl.status === "received" && pl.receivedAt && <div>✅ {t("purchasePlans.receivedOn")} {new Date(pl.receivedAt).toLocaleDateString("en-GB")}</div>}
                </div>
                <ul className="package-items">
                  {pl.items.map((it) => (
                    <li key={it._id}>
                      <span>
                        {it.product ? "📦" : "✨"} {it.quantity} {it.unit || ""} {it.name}
                      </span>
                      <span>{formatUSD(it.landedUnitCost)}/{t("purchasePlans.unitShort")}</span>
                    </li>
                  ))}
                </ul>
                <div className="kv-list plan-kv">
                  <div><span>{t("purchasePlans.totalCost")}</span><b>{formatUSD(pl.totals.totalCost)}</b></div>
                  <div><span>{t("purchasePlans.expectedRevenue")}</span><b>{formatUSD(pl.totals.expectedRevenue)}</b></div>
                  <div>
                    <span>{t("purchasePlans.expectedProfit")}</span>
                    <b style={{ color: tone(pl.totals.expectedProfit) }}>
                      {formatUSD(pl.totals.expectedProfit)} ({pl.totals.margin}%)
                    </b>
                  </div>
                </div>
                <div className="package-actions">
                  {pl.status !== "received" && pl.status !== "cancelled" && (
                    <button className="btn btn-primary" disabled={busy} onClick={() => receive(pl)}>📥 {t("purchasePlans.receive")}</button>
                  )}
                  {pl.status === "draft" && (
                    <button className="link-btn" onClick={() => quickStatus(pl, "ordered")}>✔ {t("purchasePlans.markOrdered")}</button>
                  )}
                  {pl.status !== "received" && <button className="link-btn" onClick={() => openForm(pl)}>✏️ {t("common.edit")}</button>}
                  <button className="link-btn" onClick={() => remove(pl)}>{t("common.delete")}</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

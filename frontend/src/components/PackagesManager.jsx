import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";
import { useLanguage } from "../i18n/LanguageContext";
import { formatUSD, approxKHR } from "../utils/currency";

const blankLine = (kind = "stock") => ({ kind, productId: "", name: "", quantity: "1", unitPrice: "" });

// Admin — ready-made packages (bundles), e.g. "Tournament package":
//   📦 1 trophy + 15 medals   (from stock — cut automatically when sold)
//   ✍️ referee fee, fixture-table fee   (services — no stock)
// A package can have its own price (cheaper than the items added up — the
// difference becomes a discount on the invoice). Packages can be shown on
// the public shop page and added to an invoice in one click.
export default function PackagesManager({ products }) {
  const { t } = useLanguage();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | "new" | package _id

  // form
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState([blankLine()]);
  const [price, setPrice] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const load = async () => {
    try {
      const { data } = await api.get("/packages");
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

  const openForm = (pkg) => {
    setFormError("");
    if (!pkg) {
      setEditing("new");
      setName("");
      setDescription("");
      setLines([blankLine("stock"), blankLine("manual")]);
      setPrice("");
      setIsPublic(true);
      setActive(true);
    } else {
      setEditing(pkg._id);
      setName(pkg.name);
      setDescription(pkg.description || "");
      setLines(
        pkg.items.map((it) =>
          it.product
            ? { kind: "stock", productId: String(it.product), name: "", quantity: String(it.quantity), unitPrice: String(it.unitPrice) }
            : { kind: "manual", productId: "", name: it.name, quantity: String(it.quantity), unitPrice: String(it.unitPrice) }
        )
      );
      setPrice(pkg.price === null || pkg.price === undefined ? "" : String(pkg.price));
      setIsPublic(pkg.isPublic !== false);
      setActive(pkg.active !== false);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const setLine = (i, patch) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const pickProduct = (i, id) => {
    const p = products.find((x) => x._id === id);
    setLine(i, { productId: id, unitPrice: p ? String(p.price) : "" });
  };
  const itemsTotal = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0);
  const finalPrice = price === "" ? itemsTotal : Number(price) || 0;

  const save = async (e) => {
    e.preventDefault();
    setFormError("");
    if (!name.trim()) return setFormError(t("packages.enterName"));
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
    }
    setSaving(true);
    try {
      const body = { name: name.trim(), description, items, price: price === "" ? null : Number(price), isPublic, active };
      if (editing === "new") await api.post("/packages", body);
      else await api.put(`/packages/${editing}`, body);
      setEditing(null);
      load();
    } catch (err) {
      setFormError(err.response?.data?.message || t("invoices.failedToSave"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (pkg) => {
    if (!confirm(t("packages.confirmDelete").replace("{name}", pkg.name))) return;
    try {
      await api.delete(`/packages/${pkg._id}`);
      load();
    } catch (err) {
      alert(err.response?.data?.message || t("invoices.failedToSave"));
    }
  };

  return (
    <>
      <p className="mini-empty" style={{ marginBottom: 12 }}>{t("packages.intro")}</p>

      {editing ? (
        <form className="card invoice-form" onSubmit={save} style={{ marginBottom: 24 }}>
          <h3 style={{ marginTop: 0 }}>{editing === "new" ? t("packages.newPackage") : t("packages.editPackage")}</h3>
          <div className="field">
            <label>{t("packages.name")}</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("packages.namePh")} />
          </div>
          <div className="field">
            <label>{t("packages.description")}</label>
            <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("packages.descriptionPh")} />
          </div>

          <h4 className="invoice-form-h">{t("packages.contents")}</h4>
          <div className="invoice-lines">
            {lines.map((l, i) => {
              const p = products.find((x) => x._id === l.productId);
              return (
                <div className="invoice-line" key={i}>
                  <div className="invoice-line-kind">
                    <span>{i + 1}.</span>
                    <select value={l.kind} onChange={(e) => setLine(i, { ...blankLine(e.target.value), quantity: l.quantity })}>
                      <option value="stock">📦 {t("invoices.fromStock")}</option>
                      <option value="manual">✍️ {t("packages.serviceFee")}</option>
                    </select>
                  </div>
                  <div className="invoice-line-desc">
                    {l.kind === "stock" ? (
                      <select value={l.productId} onChange={(e) => pickProduct(i, e.target.value)}>
                        <option value="">{t("invoices.chooseProduct")}</option>
                        {products.map((x) => (
                          <option key={x._id} value={x._id}>
                            {x.name} — {t("invoices.inStock")} {x.stock}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input value={l.name} onChange={(e) => setLine(i, { name: e.target.value })} placeholder={t("packages.servicePh")} />
                    )}
                    {p && <small className="mini-empty">{t("invoices.inStock")}: {p.stock} {p.unit || "pcs"}</small>}
                  </div>
                  <input
                    className="invoice-line-qty"
                    type="number"
                    min="0"
                    step={l.kind === "stock" ? 1 : "any"}
                    value={l.quantity}
                    onChange={(e) => setLine(i, { quantity: e.target.value })}
                    placeholder={t("invoices.qty")}
                  />
                  <input
                    className="invoice-line-price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={l.unitPrice}
                    onChange={(e) => setLine(i, { unitPrice: e.target.value })}
                    placeholder="$"
                  />
                  <div className="invoice-line-total">{formatUSD((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0))}</div>
                  <button
                    type="button"
                    className="link-btn"
                    disabled={lines.length === 1}
                    onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : ls))}
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
              + ✍️ {t("packages.addService")}
            </button>
          </div>

          <div className="invoice-form-bottom">
            <div style={{ flex: 2, minWidth: 220, display: "flex", flexDirection: "column", gap: 8 }}>
              <label className="check-row">
                <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} /> {t("packages.showOnShop")}
              </label>
              <label className="check-row">
                <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> {t("packages.active")}
              </label>
            </div>
            <div className="invoice-totals-box">
              <div><span>{t("packages.itemsTotal")}</span><b>{formatUSD(itemsTotal)}</b></div>
              <div>
                <span>{t("packages.packagePrice")} ($)</span>
                <input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder={itemsTotal.toFixed(2)} />
              </div>
              <div className="invoice-grand"><span>{t("packages.finalPrice")}</span><b>{formatUSD(finalPrice)}</b></div>
              <div className="price-khr" style={{ textAlign: "right" }}>{approxKHR(finalPrice)}</div>
              {itemsTotal - finalPrice > 0.004 && (
                <div style={{ color: "var(--ok)", fontSize: 13 }}>
                  {t("packages.saving")}: {formatUSD(itemsTotal - finalPrice)}
                </div>
              )}
            </div>
          </div>

          {formError && <div className="error-text">{formError}</div>}
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button className="btn btn-primary" disabled={saving}>{saving ? t("common.saving") : t("common.save")}</button>
            <button type="button" className="btn btn-outline" onClick={() => setEditing(null)}>{t("common.cancel")}</button>
          </div>
        </form>
      ) : (
        <button className="btn btn-primary" style={{ marginBottom: 16 }} onClick={() => openForm(null)}>
          ➕ {t("packages.newPackage")}
        </button>
      )}

      {loading ? (
        <p>{t("common.loading")}</p>
      ) : list.length === 0 ? (
        <p className="mini-empty">{t("packages.none")}</p>
      ) : (
        <div className="package-grid">
          {list.map((pkg) => (
            <div key={pkg._id} className={`card package-card ${pkg.active ? "" : "inactive"}`}>
              <div className="package-card-head">
                <h3>🎁 {pkg.name}</h3>
                <div className="package-price">
                  {formatUSD(pkg.finalPrice)}
                  <small className="price-khr">{approxKHR(pkg.finalPrice)}</small>
                </div>
              </div>
              {pkg.description && <p className="package-desc">{pkg.description}</p>}
              <ul className="package-items">
                {pkg.items.map((it) => (
                  <li key={it._id}>
                    <span>
                      {it.product ? "📦" : "✍️"} {it.quantity}
                      {it.unit ? ` ${it.unit}` : "×"} {it.name}
                      {it.product && it.stock < it.quantity && <span className="badge rejected" style={{ marginLeft: 6 }}>{t("invoices.notEnoughStock")}</span>}
                    </span>
                    <span>{formatUSD(it.total)}</span>
                  </li>
                ))}
              </ul>
              <div className="package-meta">
                {pkg.saving > 0 && <span className="badge verified">{t("packages.saving")} {formatUSD(pkg.saving)}</span>}
                {pkg.canMake !== null && (
                  <span className={`badge ${pkg.canMake > 0 ? "" : "rejected"}`}>
                    {t("packages.canMake").replace("{n}", pkg.canMake)}
                  </span>
                )}
                {!pkg.isPublic && <span className="badge">{t("packages.hiddenFromShop")}</span>}
                {!pkg.active && <span className="badge">{t("packages.inactive")}</span>}
              </div>
              <div className="package-actions">
                <Link className="btn btn-primary" to={`/admin/invoices?package=${pkg._id}`}>🧾 {t("packages.sell")}</Link>
                <button className="link-btn" onClick={() => openForm(pkg)}>✏️ {t("common.edit")}</button>
                <button className="link-btn" onClick={() => remove(pkg)}>{t("common.delete")}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

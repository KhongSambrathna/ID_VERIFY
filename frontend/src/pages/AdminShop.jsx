import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../api/axios";
import { useLanguage } from "../i18n/LanguageContext";
import { formatUSD, approxKHR } from "../utils/currency";
import { BarChart, HBarList, StatTile } from "../components/MiniCharts";
import PackagesManager from "../components/PackagesManager";

function stockBadge(p, t) {
  const alertAt = p.lowStockAlert ?? 5;
  if (p.stock <= 0) return { cls: "rejected", text: t("adminShop.outOfStock") };
  if (p.stock <= alertAt) return { cls: "pending", text: t("adminShop.lowStock") };
  return { cls: "verified", text: t("adminShop.inStock") };
}

// Today in Phnom Penh as "YYYY-MM-DD" (for date inputs).
function todayStr(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 24 * 3600 * 1000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Phnom_Penh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function shortDate(d) {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// Admin page for the sports-equipment shop, in three tabs:
//   1. Products — add/edit items: photo, selling price, buying cost, stock
//   2. Stock in / out — record purchases (stock in) and sales (stock out),
//      with the full history; deleting a record rolls the stock back
//   3. Report — purchases, sales, cost, profit and margin for any date range,
//      a daily chart, best sellers, stock value and low-stock alerts
// Products with a photo also show up on the public /shop page (buying cost
// is never shown there).
export default function AdminShop() {
  const { t } = useLanguage();
  const [params, setParams] = useSearchParams();
  const tab = ["products", "stock", "packages", "report"].includes(params.get("tab")) ? params.get("tab") : "products";
  const setTab = (next) => setParams(next === "products" ? {} : { tab: next }, { replace: true });

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadProducts = async () => {
    try {
      const { data } = await api.get("/products");
      setProducts(data);
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || t("adminShop.failedToLoadProducts"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  return (
    <div className="container dash-body">
      <div className="dash-header">
        <h2>{t("adminShop.title")}</h2>
        <p>{t("adminShop.intro")}</p>
      </div>

      <div className="tabs">
        <button className={`tab-btn ${tab === "products" ? "active" : ""}`} onClick={() => setTab("products")}>
          {t("adminShop.tabProducts")}
        </button>
        <button className={`tab-btn ${tab === "stock" ? "active" : ""}`} onClick={() => setTab("stock")}>
          {t("adminShop.tabStock")}
        </button>
        <button className={`tab-btn ${tab === "packages" ? "active" : ""}`} onClick={() => setTab("packages")}>
          🎁 {t("packages.tab")}
        </button>
        <button className={`tab-btn ${tab === "report" ? "active" : ""}`} onClick={() => setTab("report")}>
          {t("adminShop.tabReport")}
        </button>
      </div>

      {loading && <p>{t("common.loading")}</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && !error && tab === "products" && <ProductsTab products={products} reload={loadProducts} />}
      {!loading && !error && tab === "stock" && <StockTab products={products} reload={loadProducts} />}
      {!loading && !error && tab === "packages" && <PackagesManager products={products} />}
      {!loading && !error && tab === "report" && <ReportTab />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 1 — products
// ---------------------------------------------------------------------------
function ProductsTab({ products, reload }) {
  const { t } = useLanguage();

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [stock, setStock] = useState("");
  const [unit, setUnit] = useState("pcs");
  const [lowStockAlert, setLowStockAlert] = useState("5");
  const [image, setImage] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [edit, setEdit] = useState({});
  const [editImage, setEditImage] = useState(null);
  const editPreview = useMemo(() => (editImage ? URL.createObjectURL(editImage) : null), [editImage]);
  useEffect(() => () => editPreview && URL.revokeObjectURL(editPreview), [editPreview]);
  const [savingEdit, setSavingEdit] = useState(false);
  const [adjustingId, setAdjustingId] = useState(null);

  const resetCreateForm = () => {
    setName("");
    setPrice("");
    setCostPrice("");
    setStock("");
    setUnit("pcs");
    setLowStockAlert("5");
    setImage(null);
    const fileInput = document.getElementById("product-image-input");
    if (fileInput) fileInput.value = "";
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setFormError("");
    if (!name.trim()) return setFormError(t("adminShop.pleaseEnterProductName"));
    if (price === "" || Number(price) < 0) return setFormError(t("adminShop.pleaseEnterValidPrice"));
    if (costPrice !== "" && Number(costPrice) < 0) return setFormError(t("adminShop.pleaseEnterValidCost"));
    if (stock !== "" && Number(stock) < 0) return setFormError(t("adminShop.stockCannotBeNegative"));
    if (!image) return setFormError(t("adminShop.pleaseChoosePhoto"));
    setSaving(true);
    try {
      const data = new FormData();
      data.append("name", name.trim());
      data.append("price", price);
      data.append("costPrice", costPrice === "" ? "0" : costPrice);
      data.append("stock", stock === "" ? "0" : stock);
      data.append("unit", unit.trim() || "pcs");
      data.append("lowStockAlert", lowStockAlert === "" ? "5" : lowStockAlert);
      data.append("image", image);
      await api.post("/products", data, { headers: { "Content-Type": "multipart/form-data" } });
      resetCreateForm();
      reload();
    } catch (err) {
      setFormError(err.response?.data?.message || t("adminShop.failedToAddProduct"));
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (p) => {
    setEditingId(p._id);
    setEdit({
      name: p.name,
      price: String(p.price),
      costPrice: String(p.costPrice ?? 0),
      stock: String(p.stock),
      unit: p.unit || "pcs",
      lowStockAlert: String(p.lowStockAlert ?? 5),
    });
    setEditImage(null);
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEdit({});
    setEditImage(null);
  };
  const setE = (k) => (e) => setEdit((prev) => ({ ...prev, [k]: e.target.value }));

  const saveEdit = async (id) => {
    if (!edit.name?.trim()) return alert(t("adminShop.pleaseEnterProductName"));
    if (edit.price === "" || Number(edit.price) < 0) return alert(t("adminShop.pleaseEnterValidPrice"));
    if (edit.costPrice !== "" && Number(edit.costPrice) < 0) return alert(t("adminShop.pleaseEnterValidCost"));
    if (edit.stock === "" || Number(edit.stock) < 0) return alert(t("adminShop.pleaseEnterValidStock"));
    setSavingEdit(true);
    try {
      const data = new FormData();
      data.append("name", edit.name.trim());
      data.append("price", edit.price);
      data.append("costPrice", edit.costPrice === "" ? "0" : edit.costPrice);
      data.append("stock", edit.stock);
      data.append("unit", edit.unit.trim() || "pcs");
      data.append("lowStockAlert", edit.lowStockAlert === "" ? "5" : edit.lowStockAlert);
      if (editImage) data.append("image", editImage);
      await api.put(`/products/${id}`, data, { headers: { "Content-Type": "multipart/form-data" } });
      cancelEdit();
      reload();
    } catch (err) {
      alert(err.response?.data?.message || t("adminShop.failedToSaveChanges"));
    } finally {
      setSavingEdit(false);
    }
  };

  const remove = async (id) => {
    if (!confirm(t("adminShop.confirmDeleteProduct"))) return;
    try {
      await api.delete(`/products/${id}`);
      reload();
    } catch (err) {
      alert(err.response?.data?.message || t("adminShop.failedToDeleteProduct"));
    }
  };

  // Quick ± stepper — logged on the server as a manual adjustment.
  const adjustStock = async (p, delta) => {
    const next = p.stock + delta;
    if (next < 0) return;
    setAdjustingId(p._id);
    try {
      await api.put(`/products/${p._id}`, { stock: next });
      reload();
    } catch (err) {
      alert(err.response?.data?.message || t("adminShop.failedToUpdateStock"));
    } finally {
      setAdjustingId(null);
    }
  };

  const unitProfit = Number(price || 0) - Number(costPrice || 0);

  return (
    <>
      <form className="card" style={{ maxWidth: 640, marginBottom: 24 }} onSubmit={handleCreate}>
        <h3 style={{ marginTop: 0 }}>{t("adminShop.addProduct")}</h3>
        <div className="field">
          <label>{t("adminShop.productName")}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("adminShop.productNamePlaceholder")} required />
        </div>
        <div className="field">
          <label>{t("adminShop.photo")}</label>
          <input id="product-image-input" type="file" accept="image/*" onChange={(e) => setImage(e.target.files[0])} required />
        </div>
        <div className="filter-row" style={{ marginBottom: 0 }}>
          <div className="field" style={{ flex: 1, minWidth: 130 }}>
            <label>{t("adminShop.costPrice")}</label>
            <input type="number" min="0" step="0.01" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} placeholder="0" />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 130 }}>
            <label>{t("adminShop.price")}</label>
            <input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} required />
          </div>
        </div>
        {price !== "" && (
          <p className={unitProfit >= 0 ? "profit-hint ok" : "profit-hint bad"}>
            {t("adminShop.profitPerUnit")}: <b>{formatUSD(unitProfit)}</b> <small>{approxKHR(unitProfit)}</small>
          </p>
        )}
        <div className="filter-row" style={{ marginBottom: 0 }}>
          <div className="field" style={{ flex: 1, minWidth: 110 }}>
            <label>{t("adminShop.startingStock")}</label>
            <input type="number" min="0" step="1" value={stock} onChange={(e) => setStock(e.target.value)} placeholder="0" />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 90 }}>
            <label>{t("adminShop.unit")}</label>
            <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="pcs" />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 110 }}>
            <label>{t("adminShop.lowStockAlert")}</label>
            <input type="number" min="0" step="1" value={lowStockAlert} onChange={(e) => setLowStockAlert(e.target.value)} />
          </div>
        </div>
        {formError && <div className="error-text">{formError}</div>}
        <button className="btn btn-primary" disabled={saving} style={{ marginTop: 14 }}>
          {saving ? t("adminShop.adding") : t("adminShop.addProductButton")}
        </button>
      </form>

      <div className="table-scroll">
        <table className="athletes">
          <thead>
            <tr>
              <th>{t("adminShop.photo")}</th>
              <th>{t("adminShop.product")}</th>
              <th>{t("adminShop.costHeader")}</th>
              <th>{t("adminShop.priceHeader")}</th>
              <th>{t("adminShop.profitHeader")}</th>
              <th>{t("adminShop.stock")}</th>
              <th>{t("adminShop.soldHeader")}</th>
              <th>{t("common.status")}</th>
              <th>{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p, idx) => {
              const badge = stockBadge(p, t);
              const isEditing = editingId === p._id;
              const profit = (p.price || 0) - (p.costPrice || 0);
              return (
                <tr key={p._id}>
                  <td data-label={t("adminShop.photo")}>
                    <img
                      src={(isEditing && editPreview) || p.imageUrl || "https://placehold.co/50x50?text=No+Photo"}
                      alt={p.name}
                      className="small-photo"
                    />
                    {isEditing && (
                      <label className="change-photo-btn">
                        📷 {t("adminShop.changePhoto")}
                        <input type="file" accept="image/*" onChange={(e) => setEditImage(e.target.files[0] || null)} hidden />
                      </label>
                    )}
                  </td>
                  <td data-label={t("adminShop.product")}>
                    {isEditing ? (
                      <input value={edit.name} onChange={setE("name")} style={{ maxWidth: 180 }} placeholder={t("adminShop.productName")} />
                    ) : (
                      <>
                        {p.soldCount > 0 && idx < 3 && <span title={t("adminShop.bestSeller")}>🔥 </span>}
                        {p.name}
                      </>
                    )}
                  </td>
                  <td data-label={t("adminShop.costHeader")}>
                    {isEditing ? (
                      <input type="number" min="0" step="0.01" value={edit.costPrice} onChange={setE("costPrice")} style={{ maxWidth: 100 }} />
                    ) : (
                      <>
                        {formatUSD(p.costPrice || 0)}
                        <div className="price-khr">{approxKHR(p.costPrice || 0)}</div>
                      </>
                    )}
                  </td>
                  <td data-label={t("adminShop.priceHeader")}>
                    {isEditing ? (
                      <input type="number" min="0" step="0.01" value={edit.price} onChange={setE("price")} style={{ maxWidth: 100 }} />
                    ) : (
                      <>
                        {formatUSD(p.price)}
                        <div className="price-khr">{approxKHR(p.price)}</div>
                      </>
                    )}
                  </td>
                  <td data-label={t("adminShop.profitHeader")} style={{ color: profit >= 0 ? "var(--ok)" : "var(--bad)" }}>
                    {formatUSD(profit)}
                  </td>
                  <td data-label={t("adminShop.stock")}>
                    {isEditing ? (
                      <span style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                        <input type="number" min="0" step="1" value={edit.stock} onChange={setE("stock")} style={{ maxWidth: 70 }} />
                        <input value={edit.unit} onChange={setE("unit")} placeholder="pcs" style={{ maxWidth: 60 }} />
                        <label style={{ fontSize: 12, color: "#777" }}>
                          {t("adminShop.alertAt")}
                          <input type="number" min="0" step="1" value={edit.lowStockAlert} onChange={setE("lowStockAlert")} style={{ maxWidth: 55, marginLeft: 4 }} />
                        </label>
                      </span>
                    ) : (
                      <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <button
                          type="button"
                          className="link-btn"
                          style={{ marginRight: 0 }}
                          onClick={() => adjustStock(p, -1)}
                          disabled={adjustingId === p._id || p.stock <= 0}
                        >
                          −
                        </button>
                        {p.stock} {p.unit || "pcs"}
                        <button
                          type="button"
                          className="link-btn"
                          style={{ marginRight: 0 }}
                          onClick={() => adjustStock(p, 1)}
                          disabled={adjustingId === p._id}
                        >
                          +
                        </button>
                      </span>
                    )}
                  </td>
                  <td data-label={t("adminShop.soldHeader")}>{p.soldCount || 0}</td>
                  <td data-label={t("common.status")}>
                    <span className={`badge ${badge.cls}`}>{badge.text}</span>
                    {p.stock <= 0 && <div style={{ fontSize: 11, color: "#999", marginTop: 3 }}>{t("adminShop.hiddenFromShop")}</div>}
                  </td>
                  <td data-label={t("common.actions")} className="actions-cell">
                    {isEditing ? (
                      <>
                        <button className="link-btn" onClick={() => saveEdit(p._id)} disabled={savingEdit}>
                          {savingEdit ? t("common.saving") : t("common.save")}
                        </button>
                        <button className="link-btn" onClick={cancelEdit}>
                          {t("common.cancel")}
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="link-btn" onClick={() => startEdit(p)}>
                          ✏️ {t("adminShop.editProduct")}
                        </button>
                        <button className="link-btn" onClick={() => remove(p._id)}>
                          {t("common.delete")}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
            {products.length === 0 && (
              <tr>
                <td colSpan={9} style={{ textAlign: "center", color: "#777" }}>
                  {t("adminShop.noProducts")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Tab 2 — stock in (purchases) / stock out (sales) / adjustments
// ---------------------------------------------------------------------------
function StockTab({ products, reload }) {
  const { t } = useLanguage();
  const [type, setType] = useState("OUT");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [party, setParty] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayStr());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [okMsg, setOkMsg] = useState("");

  const [rows, setRows] = useState([]);
  const [loadingRows, setLoadingRows] = useState(true);
  const [filterType, setFilterType] = useState("");
  const [filterProduct, setFilterProduct] = useState("");

  const product = products.find((p) => p._id === productId);

  // Pre-fill the price from the product: buying cost for stock-in, selling
  // price for a sale. The admin can still type a different price (discount,
  // new supplier price…).
  useEffect(() => {
    if (!product) return setUnitPrice("");
    if (type === "IN") setUnitPrice(String(product.costPrice || 0));
    else if (type === "OUT") setUnitPrice(String(product.price || 0));
  }, [productId, type]);

  const loadRows = async () => {
    setLoadingRows(true);
    try {
      const q = new URLSearchParams();
      if (filterType) q.set("type", filterType);
      if (filterProduct) q.set("productId", filterProduct);
      const { data } = await api.get(`/products/movements?${q.toString()}`);
      setRows(data);
    } catch {
      setRows([]);
    } finally {
      setLoadingRows(false);
    }
  };

  useEffect(() => {
    loadRows();
  }, [filterType, filterProduct]);

  const qtyNum = Number(quantity) || 0;
  const total = qtyNum * (Number(unitPrice) || 0);
  const saleProfit = product && type === "OUT" ? qtyNum * ((Number(unitPrice) || 0) - (product.costPrice || 0)) : 0;

  const submit = async (e) => {
    e.preventDefault();
    setFormError("");
    setOkMsg("");
    if (!productId) return setFormError(t("adminShop.chooseProduct"));
    if (!Number.isInteger(qtyNum) || qtyNum === 0 || (type !== "ADJUST" && qtyNum < 0)) {
      return setFormError(t("adminShop.enterValidQty"));
    }
    if (type === "OUT" && product && qtyNum > product.stock) {
      return setFormError(`${t("adminShop.notEnoughStock")} (${product.stock} ${product.unit || "pcs"})`);
    }
    setSaving(true);
    try {
      await api.post("/products/movements", {
        productId,
        type,
        quantity: qtyNum,
        unitPrice: type === "ADJUST" ? undefined : unitPrice,
        party,
        note,
        date,
      });
      setOkMsg(t("adminShop.recordSaved"));
      setQuantity("1");
      setParty("");
      setNote("");
      reload();
      loadRows();
    } catch (err) {
      setFormError(err.response?.data?.message || t("adminShop.failedToSaveRecord"));
    } finally {
      setSaving(false);
    }
  };

  const removeRow = async (row) => {
    if (!confirm(t("adminShop.confirmDeleteRecord"))) return;
    try {
      await api.delete(`/products/movements/${row._id}`);
      reload();
      loadRows();
    } catch (err) {
      alert(err.response?.data?.message || t("adminShop.failedToDeleteRecord"));
    }
  };

  const typeLabel = { IN: t("adminShop.typeIn"), OUT: t("adminShop.typeOut"), ADJUST: t("adminShop.typeAdjust") };
  const typeBadge = { IN: "verified", OUT: "pending", ADJUST: "" };

  return (
    <>
      <form className="card" style={{ maxWidth: 640, marginBottom: 24 }} onSubmit={submit}>
        <h3 style={{ marginTop: 0 }}>{t("adminShop.recordMovement")}</h3>
        <div className="seg-toggle">
          {["OUT", "IN", "ADJUST"].map((k) => (
            <button type="button" key={k} className={type === k ? "active" : ""} onClick={() => setType(k)}>
              {typeLabel[k]}
            </button>
          ))}
        </div>
        <p className="mini-empty" style={{ marginTop: 6 }}>
          {type === "IN" ? t("adminShop.helpIn") : type === "OUT" ? t("adminShop.helpOut") : t("adminShop.helpAdjust")}
        </p>

        <div className="field">
          <label>{t("adminShop.product")}</label>
          <select value={productId} onChange={(e) => setProductId(e.target.value)} required>
            <option value="">{t("adminShop.chooseProduct")}</option>
            {products.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name} — {t("adminShop.stock")}: {p.stock} {p.unit || "pcs"}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-row" style={{ marginBottom: 0 }}>
          <div className="field" style={{ flex: 1, minWidth: 100 }}>
            <label>{type === "ADJUST" ? t("adminShop.qtySigned") : t("adminShop.quantity")}</label>
            <input type="number" step="1" min={type === "ADJUST" ? undefined : 1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          {type !== "ADJUST" && (
            <div className="field" style={{ flex: 1, minWidth: 130 }}>
              <label>{type === "IN" ? t("adminShop.buyPricePerUnit") : t("adminShop.sellPricePerUnit")}</label>
              <input type="number" min="0" step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
            </div>
          )}
          <div className="field" style={{ flex: 1, minWidth: 140 }}>
            <label>{t("adminShop.date")}</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>

        {type !== "ADJUST" && (
          <div className="field">
            <label>{type === "IN" ? t("adminShop.supplier") : t("adminShop.customer")}</label>
            <input value={party} onChange={(e) => setParty(e.target.value)} placeholder={t("adminShop.optional")} />
          </div>
        )}
        <div className="field">
          <label>{t("adminShop.note")}</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={type === "ADJUST" ? t("adminShop.adjustNotePh") : t("adminShop.optional")} />
        </div>

        {product && type !== "ADJUST" && (
          <div className="movement-summary">
            <span>
              {t("adminShop.total")}: <b>{formatUSD(total)}</b> <small>{approxKHR(total)}</small>
            </span>
            {type === "OUT" && (
              <span style={{ color: saleProfit >= 0 ? "var(--ok)" : "var(--bad)" }}>
                {t("adminShop.profitHeader")}: <b>{formatUSD(saleProfit)}</b>
                <small> ({t("adminShop.avgCost")} {formatUSD(product.costPrice || 0)})</small>
              </span>
            )}
          </div>
        )}

        {formError && <div className="error-text">{formError}</div>}
        {okMsg && <div style={{ color: "var(--ok)", marginTop: 6 }}>{okMsg}</div>}
        <button className="btn btn-primary" disabled={saving} style={{ marginTop: 14 }}>
          {saving ? t("common.saving") : t("adminShop.saveRecord")}
        </button>
      </form>

      <h3>{t("adminShop.history")}</h3>
      <div className="filter-row">
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
          <option value="">{t("adminShop.allTypes")}</option>
          <option value="IN">{typeLabel.IN}</option>
          <option value="OUT">{typeLabel.OUT}</option>
          <option value="ADJUST">{typeLabel.ADJUST}</option>
        </select>
        <select value={filterProduct} onChange={(e) => setFilterProduct(e.target.value)}>
          <option value="">{t("adminShop.allProducts")}</option>
          {products.map((p) => (
            <option key={p._id} value={p._id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {loadingRows ? (
        <p>{t("common.loading")}</p>
      ) : (
        <div className="table-scroll">
          <table className="athletes">
            <thead>
              <tr>
                <th>{t("adminShop.date")}</th>
                <th>{t("adminShop.type")}</th>
                <th>{t("adminShop.product")}</th>
                <th>{t("adminShop.quantity")}</th>
                <th>{t("adminShop.unitPrice")}</th>
                <th>{t("adminShop.total")}</th>
                <th>{t("adminShop.profitHeader")}</th>
                <th>{t("adminShop.partyNote")}</th>
                <th>{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r._id}>
                  <td data-label={t("adminShop.date")}>{shortDate(r.date)}</td>
                  <td data-label={t("adminShop.type")}>
                    <span className={`badge ${typeBadge[r.type]}`}>{typeLabel[r.type]}</span>
                  </td>
                  <td data-label={t("adminShop.product")}>{r.productName}</td>
                  <td data-label={t("adminShop.quantity")}>
                    {r.type === "ADJUST" && r.quantity > 0 ? "+" : ""}
                    {r.type === "OUT" ? "−" : ""}
                    {r.quantity}
                  </td>
                  <td data-label={t("adminShop.unitPrice")}>{r.type === "ADJUST" ? "—" : formatUSD(r.unitPrice)}</td>
                  <td data-label={t("adminShop.total")}>{r.type === "ADJUST" ? "—" : formatUSD(r.totalAmount)}</td>
                  <td data-label={t("adminShop.profitHeader")} style={{ color: r.profit >= 0 ? "var(--ok)" : "var(--bad)" }}>
                    {r.type === "OUT" ? formatUSD(r.profit) : "—"}
                  </td>
                  <td data-label={t("adminShop.partyNote")} style={{ fontSize: 13 }}>
                    {[r.party, r.note].filter(Boolean).join(" · ") || "—"}
                    {r.createdBy?.username && <div style={{ color: "#999", fontSize: 11 }}>{r.createdBy.username}</div>}
                  </td>
                  <td data-label={t("common.actions")} className="actions-cell">
                    <button className="link-btn" onClick={() => removeRow(r)}>
                      {t("common.delete")}
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: "center", color: "#777" }}>
                    {t("adminShop.noRecords")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Tab 3 — report / analysis
// ---------------------------------------------------------------------------
function ReportTab() {
  const { t } = useLanguage();
  const [preset, setPreset] = useState("30");
  const [from, setFrom] = useState(todayStr(-29));
  const [to, setTo] = useState(todayStr());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const applyPreset = (p) => {
    setPreset(p);
    if (p === "month") {
      const today = todayStr();
      setFrom(`${today.slice(0, 8)}01`);
      setTo(today);
    } else if (p !== "custom") {
      setFrom(todayStr(-(Number(p) - 1)));
      setTo(todayStr());
    }
  };

  useEffect(() => {
    setLoading(true);
    api
      .get(`/products/report?from=${from}&to=${to}`)
      .then(({ data }) => {
        setData(data);
        setError("");
      })
      .catch((err) => setError(err.response?.data?.message || t("adminShop.failedToLoadReport")))
      .finally(() => setLoading(false));
  }, [from, to]);

  const chartData = useMemo(
    () =>
      (data?.series || []).map((d) => ({
        label: d.day.slice(5).split("-").reverse().join("/"),
        values: [d.sales, d.purchases, d.profit],
      })),
    [data]
  );

  return (
    <>
      <div className="filter-row" style={{ alignItems: "flex-end" }}>
        <div className="seg-toggle">
          {[
            ["7", t("adminShop.last7")],
            ["30", t("adminShop.last30")],
            ["90", t("adminShop.last90")],
            ["month", t("adminShop.thisMonth")],
            ["custom", t("adminShop.custom")],
          ].map(([k, label]) => (
            <button type="button" key={k} className={preset === k ? "active" : ""} onClick={() => applyPreset(k)}>
              {label}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <>
            <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
            <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </>
        )}
      </div>

      {loading && <p>{t("common.loading")}</p>}
      {error && <p className="error-text">{error}</p>}

      {data && !loading && (
        <>
          <div className="stat-grid">
            <StatTile label={t("adminShop.salesRevenue")} value={formatUSD(data.totals.revenue)} sub={`${data.totals.qtySold} ${t("adminShop.unitsSold")}`} />
            <StatTile label={t("adminShop.purchases")} value={formatUSD(data.totals.purchases)} sub={`${data.totals.qtyPurchased} ${t("adminShop.unitsIn")}`} />
            <StatTile label={t("adminShop.cogs")} value={formatUSD(data.totals.cogs)} />
            <StatTile
              label={t("adminShop.grossProfit")}
              value={formatUSD(data.totals.profit)}
              sub={`${t("adminShop.margin")} ${data.totals.margin}%`}
              tone={data.totals.profit >= 0 ? "ok" : "bad"}
            />
            <StatTile
              label={t("adminShop.cashFlow")}
              value={formatUSD(data.totals.revenue - data.totals.purchases)}
              sub={t("adminShop.cashFlowSub")}
              tone={data.totals.revenue - data.totals.purchases >= 0 ? "ok" : "bad"}
            />
          </div>

          <div className="card" style={{ padding: 16, marginBottom: 16 }}>
            <h3 style={{ marginTop: 0 }}>{t("adminShop.dailyChart")}</h3>
            <BarChart
              data={chartData}
              format={formatUSD}
              keys={[
                { name: t("adminShop.salesRevenue"), color: "var(--navy)" },
                { name: t("adminShop.purchases"), color: "var(--gold)" },
                { name: t("adminShop.grossProfit"), color: "var(--ok)" },
              ]}
            />
          </div>

          <div className="report-two-col">
            <div className="card" style={{ padding: 16 }}>
              <h3 style={{ marginTop: 0 }}>{t("adminShop.bestSellers")}</h3>
              <HBarList
                rows={data.byProduct.filter((r) => r.revenue > 0).slice(0, 8).map((r) => ({ key: r.name, value: r.revenue, sub: `${r.qtySold}` }))}
                format={formatUSD}
                empty={t("adminShop.noSalesInRange")}
              />
            </div>
            <div className="card" style={{ padding: 16 }}>
              <h3 style={{ marginTop: 0 }}>{t("adminShop.stockPosition")}</h3>
              <div className="kv-list">
                <div><span>{t("adminShop.productCount")}</span><b>{data.stock.productCount}</b></div>
                <div><span>{t("adminShop.unitsOnHand")}</span><b>{data.stock.totalUnits}</b></div>
                <div><span>{t("adminShop.stockValueCost")}</span><b>{formatUSD(data.stock.valueAtCost)}</b></div>
                <div><span>{t("adminShop.stockValueRetail")}</span><b>{formatUSD(data.stock.valueAtRetail)}</b></div>
                <div><span>{t("adminShop.potentialProfit")}</span><b style={{ color: "var(--ok)" }}>{formatUSD(data.stock.potentialProfit)}</b></div>
              </div>
              <h4 style={{ marginBottom: 6 }}>{t("adminShop.lowStockList")}</h4>
              {data.stock.lowStock.length === 0 ? (
                <p className="mini-empty">{t("adminShop.allStocked")}</p>
              ) : (
                <ul className="low-stock-list">
                  {data.stock.lowStock.map((p) => (
                    <li key={p._id}>
                      <span>{p.name}</span>
                      <span className={`badge ${p.stock <= 0 ? "rejected" : "pending"}`}>
                        {p.stock} {p.unit || "pcs"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <h3>{t("adminShop.byProduct")}</h3>
          <div className="table-scroll">
            <table className="athletes">
              <thead>
                <tr>
                  <th>{t("adminShop.product")}</th>
                  <th>{t("adminShop.qtyIn")}</th>
                  <th>{t("adminShop.purchases")}</th>
                  <th>{t("adminShop.qtySold")}</th>
                  <th>{t("adminShop.salesRevenue")}</th>
                  <th>{t("adminShop.grossProfit")}</th>
                  <th>{t("adminShop.margin")}</th>
                </tr>
              </thead>
              <tbody>
                {data.byProduct.map((r) => (
                  <tr key={r._id}>
                    <td data-label={t("adminShop.product")}>{r.name}</td>
                    <td data-label={t("adminShop.qtyIn")}>{r.qtyIn}</td>
                    <td data-label={t("adminShop.purchases")}>{formatUSD(r.purchaseAmount)}</td>
                    <td data-label={t("adminShop.qtySold")}>{r.qtySold}</td>
                    <td data-label={t("adminShop.salesRevenue")}>{formatUSD(r.revenue)}</td>
                    <td data-label={t("adminShop.grossProfit")} style={{ color: r.profit >= 0 ? "var(--ok)" : "var(--bad)" }}>
                      {formatUSD(r.profit)}
                    </td>
                    <td data-label={t("adminShop.margin")}>{r.margin}%</td>
                  </tr>
                ))}
                {data.byProduct.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", color: "#777" }}>
                      {t("adminShop.noRecordsInRange")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

import { useEffect, useState } from "react";
import api from "../api/axios";
import { useLanguage } from "../i18n/LanguageContext";

function stockBadge(stock, t) {
  if (stock <= 0) return { cls: "rejected", text: t("adminShop.outOfStock") };
  if (stock <= 5) return { cls: "pending", text: t("adminShop.lowStock") };
  return { cls: "verified", text: t("adminShop.inStock") };
}

function money(n) {
  const num = Number(n);
  return Number.isFinite(num) ? `$${num.toFixed(2)}` : "—";
}

// Admin page for the sports-equipment shop/inventory: add products with a
// photo, price, and starting stock count, then adjust stock (± steppers for
// quick sales/restocks, or full edit for name/price/photo/an exact count)
// any time. Products with a photo also show up on the public /shop page.
export default function AdminShop() {
  const { t } = useLanguage();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [unit, setUnit] = useState("pcs");
  const [image, setImage] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editStock, setEditStock] = useState("");
  const [editUnit, setEditUnit] = useState("");
  const [editImage, setEditImage] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const [adjustingId, setAdjustingId] = useState(null);

  const load = async () => {
    setLoading(true);
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
    load();
  }, []);

  const resetCreateForm = () => {
    setName("");
    setPrice("");
    setStock("");
    setUnit("pcs");
    setImage(null);
    const fileInput = document.getElementById("product-image-input");
    if (fileInput) fileInput.value = "";
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setFormError("");
    if (!name.trim()) {
      setFormError(t("adminShop.pleaseEnterProductName"));
      return;
    }
    if (price === "" || Number(price) < 0) {
      setFormError(t("adminShop.pleaseEnterValidPrice"));
      return;
    }
    if (stock !== "" && Number(stock) < 0) {
      setFormError(t("adminShop.stockCannotBeNegative"));
      return;
    }
    if (!image) {
      setFormError(t("adminShop.pleaseChoosePhoto"));
      return;
    }
    setSaving(true);
    try {
      const data = new FormData();
      data.append("name", name.trim());
      data.append("price", price);
      data.append("stock", stock === "" ? "0" : stock);
      data.append("unit", unit.trim() || "pcs");
      data.append("image", image);
      await api.post("/products", data, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      resetCreateForm();
      load();
    } catch (err) {
      setFormError(err.response?.data?.message || t("adminShop.failedToAddProduct"));
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (p) => {
    setEditingId(p._id);
    setEditName(p.name);
    setEditPrice(String(p.price));
    setEditStock(String(p.stock));
    setEditUnit(p.unit || "pcs");
    setEditImage(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditPrice("");
    setEditStock("");
    setEditUnit("");
    setEditImage(null);
  };

  const saveEdit = async (id) => {
    if (!editName.trim()) {
      alert(t("adminShop.pleaseEnterProductName"));
      return;
    }
    if (editPrice === "" || Number(editPrice) < 0) {
      alert(t("adminShop.pleaseEnterValidPrice"));
      return;
    }
    if (editStock === "" || Number(editStock) < 0) {
      alert(t("adminShop.pleaseEnterValidStock"));
      return;
    }
    setSavingEdit(true);
    try {
      const data = new FormData();
      data.append("name", editName.trim());
      data.append("price", editPrice);
      data.append("stock", editStock);
      data.append("unit", editUnit.trim() || "pcs");
      if (editImage) data.append("image", editImage);
      await api.put(`/products/${id}`, data, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      cancelEdit();
      load();
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
      load();
    } catch (err) {
      alert(err.response?.data?.message || t("adminShop.failedToDeleteProduct"));
    }
  };

  // Quick ± stepper for fast restock/sale adjustments — no need to open
  // the full edit row just to bump the count by one. Sent as plain JSON,
  // which the same PUT route also accepts (see productController.js).
  const adjustStock = async (p, delta) => {
    const next = p.stock + delta;
    if (next < 0) return;
    setAdjustingId(p._id);
    try {
      await api.put(`/products/${p._id}`, { stock: next });
      load();
    } catch (err) {
      alert(err.response?.data?.message || t("adminShop.failedToUpdateStock"));
    } finally {
      setAdjustingId(null);
    }
  };

  return (
    <div className="container dash-body">
      <div className="dash-header">
        <h2>{t("adminShop.title")}</h2>
        <p>{t("adminShop.intro")}</p>
      </div>

      <form className="card" style={{ maxWidth: 560, marginBottom: 24 }} onSubmit={handleCreate}>
        <h3 style={{ marginTop: 0 }}>{t("adminShop.addProduct")}</h3>
        <div className="field">
          <label>{t("adminShop.productName")}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("adminShop.productNamePlaceholder")} required />
        </div>
        <div className="field">
          <label>{t("adminShop.photo")}</label>
          <input
            id="product-image-input"
            type="file"
            accept="image/*"
            onChange={(e) => setImage(e.target.files[0])}
            required
          />
        </div>
        <div className="filter-row" style={{ marginBottom: 0 }}>
          <div className="field" style={{ flex: 1, minWidth: 120 }}>
            <label>{t("adminShop.price")}</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
            />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 120 }}>
            <label>{t("adminShop.startingStock")}</label>
            <input
              type="number"
              min="0"
              step="1"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 100 }}>
            <label>{t("adminShop.unit")}</label>
            <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="pcs" />
          </div>
        </div>
        {formError && <div className="error-text">{formError}</div>}
        <button className="btn btn-primary" disabled={saving} style={{ marginTop: 14 }}>
          {saving ? t("adminShop.adding") : t("adminShop.addProductButton")}
        </button>
      </form>

      {loading && <p>{t("common.loading")}</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && !error && (
        <div className="table-scroll">
          <table className="athletes">
            <thead>
              <tr>
                <th>{t("adminShop.photo")}</th>
                <th>{t("adminShop.product")}</th>
                <th>{t("adminShop.priceHeader")}</th>
                <th>{t("adminShop.stock")}</th>
                <th>{t("common.status")}</th>
                <th>{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const badge = stockBadge(p.stock, t);
                const isEditing = editingId === p._id;
                return (
                  <tr key={p._id}>
                    <td data-label={t("adminShop.photo")}>
                      <img
                        src={p.imageUrl || "https://placehold.co/50x50?text=No+Photo"}
                        alt={p.name}
                        className="small-photo"
                      />
                      {isEditing && (
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => setEditImage(e.target.files[0])}
                          style={{ display: "block", marginTop: 6, maxWidth: 140 }}
                        />
                      )}
                    </td>
                    <td data-label={t("adminShop.product")}>
                      {isEditing ? (
                        <input value={editName} onChange={(e) => setEditName(e.target.value)} style={{ maxWidth: 180 }} />
                      ) : (
                        p.name
                      )}
                    </td>
                    <td data-label={t("adminShop.priceHeader")}>
                      {isEditing ? (
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={editPrice}
                          onChange={(e) => setEditPrice(e.target.value)}
                          style={{ maxWidth: 90 }}
                        />
                      ) : (
                        money(p.price)
                      )}
                    </td>
                    <td data-label={t("adminShop.stock")}>
                      {isEditing ? (
                        <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={editStock}
                            onChange={(e) => setEditStock(e.target.value)}
                            style={{ maxWidth: 70 }}
                          />
                          <input
                            value={editUnit}
                            onChange={(e) => setEditUnit(e.target.value)}
                            placeholder="pcs"
                            style={{ maxWidth: 60 }}
                          />
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
                    <td data-label={t("common.status")}>
                      <span className={`badge ${badge.cls}`}>{badge.text}</span>
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
                            {t("common.edit")}
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
                  <td colSpan={6} style={{ textAlign: "center", color: "#777" }}>
                    {t("adminShop.noProducts")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

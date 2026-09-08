import { useEffect, useState } from "react";
import api from "../api/axios";

function stockBadge(stock) {
  if (stock <= 0) return { cls: "rejected", text: "Out of stock" };
  if (stock <= 5) return { cls: "pending", text: "Low stock" };
  return { cls: "verified", text: "In stock" };
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
      setError(err.response?.data?.message || "Failed to load products");
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
      setFormError("Please enter a product name");
      return;
    }
    if (price === "" || Number(price) < 0) {
      setFormError("Please enter a valid price");
      return;
    }
    if (stock !== "" && Number(stock) < 0) {
      setFormError("Stock quantity can't be negative");
      return;
    }
    if (!image) {
      setFormError("Please choose a product photo");
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
      setFormError(err.response?.data?.message || "Failed to add product");
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
      alert("Please enter a product name");
      return;
    }
    if (editPrice === "" || Number(editPrice) < 0) {
      alert("Please enter a valid price");
      return;
    }
    if (editStock === "" || Number(editStock) < 0) {
      alert("Please enter a valid stock quantity");
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
      alert(err.response?.data?.message || "Failed to save changes");
    } finally {
      setSavingEdit(false);
    }
  };

  const remove = async (id) => {
    if (!confirm("Delete this product from the shop?")) return;
    try {
      await api.delete(`/products/${id}`);
      load();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to delete product");
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
      alert(err.response?.data?.message || "Failed to update stock");
    } finally {
      setAdjustingId(null);
    }
  };

  return (
    <div className="container dash-body">
      <div className="dash-header">
        <h2>Shop — sports equipment</h2>
        <p>
          Manage products, prices, and stock levels. Everything here (with its photo) also shows up
          on the public shop page — no login needed for buyers to browse and order.
        </p>
      </div>

      <form className="card" style={{ maxWidth: 560, marginBottom: 24 }} onSubmit={handleCreate}>
        <h3 style={{ marginTop: 0 }}>Add a product</h3>
        <div className="field">
          <label>Product name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Match ball, size 5" required />
        </div>
        <div className="field">
          <label>Photo</label>
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
            <label>Price ($)</label>
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
            <label>Starting stock</label>
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
            <label>Unit</label>
            <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="pcs" />
          </div>
        </div>
        {formError && <div className="error-text">{formError}</div>}
        <button className="btn btn-primary" disabled={saving} style={{ marginTop: 14 }}>
          {saving ? "Adding…" : "Add product"}
        </button>
      </form>

      {loading && <p>Loading…</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && !error && (
        <div className="table-scroll">
          <table className="athletes">
            <thead>
              <tr>
                <th>Photo</th>
                <th>Product</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const badge = stockBadge(p.stock);
                const isEditing = editingId === p._id;
                return (
                  <tr key={p._id}>
                    <td data-label="Photo">
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
                    <td data-label="Product">
                      {isEditing ? (
                        <input value={editName} onChange={(e) => setEditName(e.target.value)} style={{ maxWidth: 180 }} />
                      ) : (
                        p.name
                      )}
                    </td>
                    <td data-label="Price">
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
                    <td data-label="Stock">
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
                    <td data-label="Status">
                      <span className={`badge ${badge.cls}`}>{badge.text}</span>
                    </td>
                    <td data-label="Actions" className="actions-cell">
                      {isEditing ? (
                        <>
                          <button className="link-btn" onClick={() => saveEdit(p._id)} disabled={savingEdit}>
                            {savingEdit ? "Saving…" : "Save"}
                          </button>
                          <button className="link-btn" onClick={cancelEdit}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button className="link-btn" onClick={() => startEdit(p)}>
                            Edit
                          </button>
                          <button className="link-btn" onClick={() => remove(p._id)}>
                            Delete
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
                    No products yet — add your first one above.
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

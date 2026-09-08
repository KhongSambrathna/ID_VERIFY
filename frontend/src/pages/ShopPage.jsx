import { useEffect, useState } from "react";
import api from "../api/axios";

const TELEGRAM_USERNAME = "sambrathnajr";

function stockBadge(stock) {
  if (stock <= 0) return { cls: "rejected", text: "Out of stock" };
  if (stock <= 5) return { cls: "pending", text: "Low stock" };
  return { cls: "verified", text: "In stock" };
}

// Opens a chat with the club's Telegram with the product name/price already
// typed in — buyers just hit send. There's no in-app checkout, orders are
// handled over Telegram by a person.
function orderLink(product) {
  const message = `Hello, I'd like to order: ${product.name} ($${Number(product.price).toFixed(2)})`;
  return `https://t.me/${TELEGRAM_USERNAME}?text=${encodeURIComponent(message)}`;
}

// Public storefront — no login required. Reads GET /api/products/public.
export default function ShopPage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    api
      .get("/products/public")
      .then(({ data }) => setProducts(data))
      .catch((err) => setError(err.response?.data?.message || "Failed to load products"))
      .finally(() => setLoading(false));
  }, []);

  const q = search.trim().toLowerCase();
  const filtered = !q ? products : products.filter((p) => p.name.toLowerCase().includes(q));

  return (
    <div className="container">
      <div className="shop-header">
        <h2>Equipment shop</h2>
        <p>Browse our sports equipment. Tap "Order" to message us on Telegram and we'll take it from there.</p>
      </div>

      <div className="field search-field">
        <input
          placeholder="Search products…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading && <p>Loading…</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && !error && (
        <div className="shop-grid">
          {filtered.map((p) => {
            const badge = stockBadge(p.stock);
            const outOfStock = p.stock <= 0;
            return (
              <div key={p._id} className="shop-card">
                <img
                  className="shop-card-photo"
                  src={p.imageUrl || "https://placehold.co/300x300?text=No+Photo"}
                  alt={p.name}
                />
                <div className="shop-card-body">
                  <p className="shop-card-name">{p.name}</p>
                  <span className={`badge ${badge.cls}`}>{badge.text}</span>
                  <div className="shop-card-footer">
                    <span className="shop-card-price">${Number(p.price).toFixed(2)}</span>
                    {outOfStock ? (
                      <span className="shop-order-btn disabled">Order</span>
                    ) : (
                      <a className="shop-order-btn" href={orderLink(p)} target="_blank" rel="noopener noreferrer">
                        Order
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="shop-empty">
              {products.length === 0 ? "No products yet — check back soon." : "No products match your search."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import api from "../api/axios";
import { useLanguage } from "../i18n/LanguageContext";

const TELEGRAM_USERNAME = "sambrathnajr";

function stockBadge(stock) {
  if (stock <= 0) return { cls: "rejected", key: "shopPage.outOfStock" };
  if (stock <= 5) return { cls: "pending", key: "shopPage.lowStock" };
  return { cls: "verified", key: "shopPage.inStock" };
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
  const { t } = useLanguage();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    api
      .get("/products/public")
      .then(({ data }) => setProducts(data))
      .catch((err) => setError(err.response?.data?.message || t("shopPage.failedToLoad")))
      .finally(() => setLoading(false));
  }, []);

  const q = search.trim().toLowerCase();
  const filtered = !q ? products : products.filter((p) => p.name.toLowerCase().includes(q));

  return (
    <div className="container">
      <div className="shop-header">
        <h2>{t("shopPage.title")}</h2>
        <p>{t("shopPage.description")}</p>
      </div>

      <div className="field search-field">
        <input
          placeholder={t("shopPage.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading && <p>{t("common.loading")}</p>}
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
                  <span className={`badge ${badge.cls}`}>{t(badge.key)}</span>
                  <div className="shop-card-footer">
                    <span className="shop-card-price">${Number(p.price).toFixed(2)}</span>
                    {outOfStock ? (
                      <span className="shop-order-btn disabled">{t("shopPage.order")}</span>
                    ) : (
                      <a className="shop-order-btn" href={orderLink(p)} target="_blank" rel="noopener noreferrer">
                        {t("shopPage.order")}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="shop-empty">
              {products.length === 0 ? t("shopPage.noProductsYet") : t("shopPage.noProductsMatch")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import api from "../api/axios";
import { useLanguage } from "../i18n/LanguageContext";
import { formatUSD, approxKHR, formatUSDwithKHR } from "../utils/currency";

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
  const price = product.discountActive ? product.salePrice : product.price;
  const message = `Hello, I'd like to order: ${product.name} (${formatUSDwithKHR(price)})`;
  return `https://t.me/${TELEGRAM_USERNAME}?text=${encodeURIComponent(message)}`;
}

// Same, for a package — lists what's inside so the order is clear.
function packageOrderLink(pkg) {
  const contents = pkg.items.map((it) => `- ${it.quantity} ${it.unit || "x"} ${it.name}`).join("\n");
  const message = `Hello, I'd like to order the package: ${pkg.name} (${formatUSDwithKHR(pkg.finalPrice)})\n${contents}`;
  return `https://t.me/${TELEGRAM_USERNAME}?text=${encodeURIComponent(message)}`;
}

// Public storefront — no login required. Reads GET /api/products/public.
export default function ShopPage() {
  const { t } = useLanguage();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [packages, setPackages] = useState([]);

  useEffect(() => {
    api
      .get("/products/public")
      .then(({ data }) => setProducts(data))
      .catch((err) => setError(err.response?.data?.message || t("shopPage.failedToLoad")))
      .finally(() => setLoading(false));
    // Packages (e.g. tournament package) — optional, ignore errors.
    api.get("/packages/public").then(({ data }) => setPackages(data)).catch(() => {});
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

      {packages.length > 0 && !q && (
        <section className="shop-packages">
          <h3>🎁 {t("packages.shopTitle")}</h3>
          <div className="package-grid">
            {packages.map((pkg) => (
              <div key={pkg._id} className="card package-card">
                <div className="package-card-head">
                  <h3>{pkg.name}</h3>
                  <div className="package-price">
                    {formatUSD(pkg.finalPrice)}
                    <small className="price-khr">{approxKHR(pkg.finalPrice)}</small>
                  </div>
                </div>
                {pkg.description && <p className="package-desc">{pkg.description}</p>}
                <div className="package-label">{t("packages.includes")}:</div>
                <ul className="package-items">
                  {pkg.items.map((it) => (
                    <li key={it._id}>
                      <span>✔ {it.quantity}{it.unit ? ` ${it.unit}` : "×"} {it.name}</span>
                    </li>
                  ))}
                </ul>
                {pkg.saving > 0 && (
                  <div className="package-meta">
                    <span className="badge verified">
                      {t("packages.youSave")} {formatUSD(pkg.saving)}
                    </span>
                  </div>
                )}
                <a className="btn btn-primary" href={packageOrderLink(pkg)} target="_blank" rel="noopener noreferrer" style={{ marginTop: 10 }}>
                  {t("shopPage.order")}
                </a>
              </div>
            ))}
          </div>
        </section>
      )}

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
                  {p.bestSeller && <span className="badge best-seller">🔥 {t("shopPage.bestSeller")}</span>}
                  {p.discountActive && <span className="badge sale-badge">🏷 -{p.discountPercent}%</span>}
                  <span className={`badge ${badge.cls}`}>{t(badge.key)}</span>
                  <div className="shop-card-footer">
                    <span className="shop-card-price">
                      {p.discountActive && <s className="shop-old-price">{formatUSD(p.price)}</s>}
                      {formatUSD(p.discountActive ? p.salePrice : p.price)}
                      <small className="price-khr">{approxKHR(p.discountActive ? p.salePrice : p.price)}</small>
                      {p.wholesalePrice > 0 && (
                        <small className="shop-wholesale">
                          📦 {t("pricing.wholesale")}
                          {p.wholesaleMinQty > 0 ? ` ≥${p.wholesaleMinQty}` : ""}: {formatUSD(p.wholesalePrice)}
                        </small>
                      )}
                    </span>
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

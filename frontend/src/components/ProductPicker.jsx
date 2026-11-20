import { useEffect, useRef, useState } from "react";
import { useLanguage } from "../i18n/LanguageContext";
import { formatUSD } from "../utils/currency";
import { discountActive, salePrice } from "../utils/pricing";

const NO_PHOTO = "https://placehold.co/80x80?text=%20";

// A product chooser that shows each product's photo, price and stock —
// easier than a plain dropdown when products look alike (medals, socks…).
// Type to search. Out-of-stock items are greyed out unless allowOutOfStock.
export default function ProductPicker({ products, value, onChange, allowOutOfStock = false, placeholder }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef(null);
  const inputRef = useRef(null);
  const selected = products.find((p) => p._id === value);

  useEffect(() => {
    if (!open) return;
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
    };
  }, [open]);

  const needle = q.trim().toLowerCase();
  const list = needle ? products.filter((p) => p.name.toLowerCase().includes(needle)) : products;

  const Price = ({ p }) =>
    discountActive(p) ? (
      <>
        <s className="pp-old">{formatUSD(p.price)}</s> <b>{formatUSD(salePrice(p))}</b>
      </>
    ) : (
      <b>{formatUSD(p.price)}</b>
    );

  return (
    <div className={`product-picker ${open ? "open" : ""}`} ref={ref}>
      <button type="button" className="pp-current" onClick={() => setOpen((v) => !v)}>
        {selected ? (
          <>
            <img src={selected.imageUrl || NO_PHOTO} alt="" />
            <span className="pp-name">{selected.name}</span>
            <span className="pp-meta">
              <Price p={selected} /> · {t("invoices.inStock")} {selected.stock}
            </span>
          </>
        ) : (
          <span className="pp-placeholder">{placeholder || t("invoices.chooseProduct")}</span>
        )}
        <span className="pp-caret">▾</span>
      </button>
      {open && (
        <div className="pp-menu">
          <input ref={inputRef} className="pp-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`🔍 ${t("productPicker.search")}`} />
          <div className="pp-list">
            {list.map((p) => {
              const disabled = !allowOutOfStock && p.stock <= 0;
              return (
                <button
                  type="button"
                  key={p._id}
                  className={`pp-item ${p._id === value ? "selected" : ""}`}
                  disabled={disabled}
                  onClick={() => {
                    onChange(p._id);
                    setOpen(false);
                    setQ("");
                  }}
                >
                  <img src={p.imageUrl || NO_PHOTO} alt="" loading="lazy" />
                  <span className="pp-item-text">
                    <span className="pp-name">{p.name}</span>
                    <span className="pp-meta">
                      <Price p={p} />
                      {discountActive(p) && <span className="pp-tag sale">-{p.discountPercent}%</span>}
                      {p.wholesalePrice > 0 && <span className="pp-tag ws">{t("productPicker.wholesale")} {formatUSD(p.wholesalePrice)}</span>}
                    </span>
                  </span>
                  <span className={`pp-stock ${p.stock <= 0 ? "out" : ""}`}>
                    {p.stock} {p.unit || "pcs"}
                  </span>
                </button>
              );
            })}
            {list.length === 0 && <div className="pp-empty">{t("productPicker.noMatch")}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

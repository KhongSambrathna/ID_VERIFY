import { useEffect, useMemo, useState } from "react";
import api from "../api/axios";
import { formatUSD, approxKHR } from "../utils/currency";
import { effectivePrice } from "../utils/pricing";
import { SHOP_INFO } from "../utils/shopInfo";

// Telegram Mini App shop — opened from the bot's "🛍 បើកហាង" button or ☰ menu
// button (see backend bot/shopBot.js). Customers scroll the products,
// tap to see a photo/details, add to the cart and order without leaving
// Telegram. The order goes to POST /api/telegram/webapp/order with
// Telegram's signed initData, so the server knows exactly who ordered; it
// recalculates every price itself and sends the usual ✅/❌ alert to Admin.
// Rendered without the site's navbar (see App.jsx).

const SDK_URL = "https://telegram.org/js/telegram-web-app.js";
const CART_KEY = "tgShopCart";

function loadSdk() {
  if (window.Telegram?.WebApp) return Promise.resolve(window.Telegram.WebApp);
  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = SDK_URL;
    s.onload = () => resolve(window.Telegram?.WebApp || null);
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
}

const readCart = () => {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY) || "{}") || {};
  } catch {
    return {};
  }
};

export default function TgShop() {
  const [tg, setTg] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cart, setCart] = useState(readCart); // { productId: qty }
  const [view, setView] = useState("list"); // list | checkout | done
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState(null); // product shown in the sheet
  const [form, setForm] = useState({ name: "", phone: "", note: "" });
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(null);

  const initData = tg?.initData || "";

  useEffect(() => {
    document.title = SHOP_INFO.name;
    loadSdk().then((app) => {
      if (!app) return;
      app.ready();
      app.expand();
      setTg(app);
    });
    api
      .get("/products/public")
      .then(({ data }) => setProducts(data))
      .catch(() => setError("មិនអាចផ្ទុកទំនិញបានទេ — សូមព្យាយាមម្ដងទៀត"))
      .finally(() => setLoading(false));
  }, []);

  // Pre-fill name/phone from the last order.
  useEffect(() => {
    if (!initData) return;
    api
      .post("/telegram/webapp/session", { initData })
      .then(({ data }) => setForm((f) => ({ ...f, name: f.name || data.name || "", phone: f.phone || data.phone || "" })))
      .catch(() => {});
  }, [initData]);

  useEffect(() => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch {
      /* private mode — cart just isn't remembered */
    }
  }, [cart]);

  const byId = useMemo(() => new Map(products.map((p) => [String(p._id), p])), [products]);
  const lines = useMemo(
    () =>
      Object.entries(cart)
        .map(([id, qty]) => {
          const p = byId.get(id);
          if (!p || qty < 1) return null;
          const { unitPrice, listPrice } = effectivePrice(p, qty, false);
          return { p, qty, unitPrice, listPrice, total: Math.round(unitPrice * qty * 100) / 100 };
        })
        .filter(Boolean),
    [cart, byId]
  );
  const count = lines.reduce((n, l) => n + l.qty, 0);
  const total = Math.round(lines.reduce((s, l) => s + l.total, 0) * 100) / 100;

  const haptic = (kind = "light") => tg?.HapticFeedback?.impactOccurred?.(kind);
  const setQty = (p, qty) => {
    const id = String(p._id);
    const q = Math.max(0, Math.min(qty, p.stock));
    setCart((c) => {
      const next = { ...c };
      if (q <= 0) delete next[id];
      else next[id] = q;
      return next;
    });
    haptic();
  };

  const submit = async () => {
    if (sending) return;
    if (!initData) {
      setError("សូមបើកទំព័រនេះពីក្នុង Telegram bot ដើម្បីកម្មង់");
      return;
    }
    setSending(true);
    setError("");
    tg?.MainButton?.showProgress?.();
    try {
      const { data } = await api.post("/telegram/webapp/order", {
        initData,
        items: lines.map((l) => ({ id: String(l.p._id), qty: l.qty })),
        ...form,
      });
      setCart({});
      setDone(data);
      setView("done");
      tg?.HapticFeedback?.notificationOccurred?.("success");
    } catch (err) {
      setError(err.response?.data?.message || "កម្មង់មិនបានទេ — សូមព្យាយាមម្ដងទៀត");
      tg?.HapticFeedback?.notificationOccurred?.("error");
    } finally {
      setSending(false);
      tg?.MainButton?.hideProgress?.();
    }
  };

  // Telegram's big bottom button + back button follow the current screen.
  useEffect(() => {
    if (!tg) return;
    const mb = tg.MainButton;
    let onMain = null;
    if (view === "list" && count > 0 && !detail) {
      mb.setText(`🧺 កន្ត្រក (${count}) · ${formatUSD(total)}`);
      onMain = () => setView("checkout");
    } else if (view === "checkout" && lines.length) {
      mb.setText(sending ? "កំពុងផ្ញើ…" : `✅ បញ្ជាក់ការកម្មង់ · ${formatUSD(total)}`);
      onMain = submit;
    } else if (view === "done") {
      mb.setText("បិទ");
      onMain = () => tg.close();
    }
    if (onMain) {
      mb.onClick(onMain);
      mb.show();
    } else mb.hide();

    const bb = tg.BackButton;
    const onBack = () => (detail ? setDetail(null) : setView("list"));
    if (detail || view === "checkout") {
      bb.onClick(onBack);
      bb.show();
    } else bb.hide();
    return () => {
      if (onMain) mb.offClick(onMain);
      bb.offClick(onBack);
    };
  });

  const shown = products.filter((p) => !search.trim() || p.name.toLowerCase().includes(search.trim().toLowerCase()));
  const inTelegram = Boolean(tg && initData);

  return (
    <div className="tgshop">
      <style>{CSS}</style>

      {view === "list" && (
        <>
          <header className="tgs-head">
            <img src={SHOP_INFO.logo} alt="" />
            <div>
              <b>{SHOP_INFO.name}</b>
              <small>📞 {SHOP_INFO.phone}</small>
            </div>
          </header>
          <input className="tgs-search" placeholder="🔍 ស្វែងរកទំនិញ…" value={search} onChange={(e) => setSearch(e.target.value)} />
          {loading && <p className="tgs-muted">កំពុងផ្ទុក…</p>}
          {error && <p className="tgs-error">{error}</p>}
          {!loading && !shown.length && <p className="tgs-muted">មិនមានទំនិញទេ</p>}

          <div className="tgs-grid">
            {shown.map((p) => {
              const qty = cart[String(p._id)] || 0;
              const price = p.discountActive ? p.salePrice : p.price;
              return (
                <div key={p._id} className="tgs-card">
                  <button type="button" className="tgs-img" onClick={() => setDetail(p)}>
                    <img src={p.imageUrl || "https://placehold.co/300x300?text=No+Photo"} alt={p.name} loading="lazy" />
                    {p.bestSeller && <span className="tgs-tag hot">🔥 លក់ដាច់</span>}
                    {p.discountActive && <span className="tgs-tag sale">-{p.discountPercent}%</span>}
                  </button>
                  <div className="tgs-body">
                    <div className="tgs-name" onClick={() => setDetail(p)}>{p.name}</div>
                    <div className="tgs-price">
                      {p.discountActive && <s>{formatUSD(p.price)}</s>} {formatUSD(price)}
                      <small>{approxKHR(price)}</small>
                    </div>
                    {qty === 0 ? (
                      <button type="button" className="tgs-add" onClick={() => setQty(p, 1)}>
                        + ដាក់កន្ត្រក
                      </button>
                    ) : (
                      <Stepper qty={qty} max={p.stock} onChange={(q) => setQty(p, q)} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Outside Telegram (or very old Telegram) there's no MainButton. */}
          {count > 0 && !inTelegram && (
            <button type="button" className="tgs-bar" onClick={() => setView("checkout")}>
              🧺 កន្ត្រក ({count}) · {formatUSD(total)}
            </button>
          )}
        </>
      )}

      {view === "checkout" && (
        <div className="tgs-checkout">
          <h3>🧺 កន្ត្រករបស់អ្នក</h3>
          {!lines.length && <p className="tgs-muted">កន្ត្រកនៅទទេ</p>}
          {lines.map((l) => (
            <div key={l.p._id} className="tgs-line">
              <img src={l.p.imageUrl} alt="" />
              <div className="tgs-line-main">
                <div>{l.p.name}</div>
                <small>
                  {formatUSD(l.unitPrice)}
                  {l.unitPrice < l.listPrice && <s> {formatUSD(l.listPrice)}</s>} × {l.qty} = <b>{formatUSD(l.total)}</b>
                </small>
                <Stepper qty={l.qty} max={l.p.stock} onChange={(q) => setQty(l.p, q)} />
              </div>
            </div>
          ))}
          {lines.length > 0 && (
            <>
              <div className="tgs-total">
                សរុប <b>{formatUSD(total)}</b> <small>{approxKHR(total)}</small>
              </div>
              <label>👤 ឈ្មោះ</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ឈ្មោះ ឬឈ្មោះក្រុម/សាលា" />
              <label>📱 លេខទូរស័ព្ទ</label>
              <input type="tel" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="012 345 678" />
              <label>📝 សំណូមពរបន្ថែម (មិនចាំបាច់)</label>
              <textarea rows={3} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="ទីតាំងដឹក ទំហំអាវ ពណ៌…" />
              {error && <p className="tgs-error">{error}</p>}
              <p className="tgs-muted">តម្លៃចុងក្រោយគណនាដោយហាងពេលកម្មង់ (បញ្ចុះតម្លៃ/តម្លៃដុំ)។</p>
              {!inTelegram && (
                <button type="button" className="tgs-bar static" disabled={sending} onClick={submit}>
                  {sending ? "កំពុងផ្ញើ…" : `✅ បញ្ជាក់ការកម្មង់ · ${formatUSD(total)}`}
                </button>
              )}
            </>
          )}
          {!inTelegram && (
            <button type="button" className="tgs-link" onClick={() => setView("list")}>
              ← បន្តទិញ
            </button>
          )}
        </div>
      )}

      {view === "done" && done && (
        <div className="tgs-done">
          <div className="tgs-big">✅</div>
          <h3>ទទួលបានការកម្មង់ {done.orderNo}</h3>
          <p>
            សរុប <b>{formatUSD(done.total)}</b> {approxKHR(done.total)}
          </p>
          <p>ហាងនឹងទាក់ទងអ្នកឆាប់ៗនេះ។ សូមអរគុណ! 🙏</p>
          <button type="button" className="tgs-link" onClick={() => setView("list")}>
            🛍 បន្តទិញ
          </button>
        </div>
      )}

      {detail && (
        <div className="tgs-sheet-bg" onClick={() => setDetail(null)}>
          <div className="tgs-sheet" onClick={(e) => e.stopPropagation()}>
            <img src={detail.imageUrl || "https://placehold.co/600x600?text=No+Photo"} alt={detail.name} />
            <h3>{detail.name}</h3>
            <div className="tgs-price big">
              {detail.discountActive && <s>{formatUSD(detail.price)}</s>} {formatUSD(detail.discountActive ? detail.salePrice : detail.price)}
              <small>{approxKHR(detail.discountActive ? detail.salePrice : detail.price)}</small>
            </div>
            {detail.wholesalePrice > 0 && detail.wholesaleMinQty > 0 && (
              <p className="tgs-muted">
                📦 ទិញចាប់ពី {detail.wholesaleMinQty} {detail.unit || ""} ឡើង: {formatUSD(detail.wholesalePrice)}/{detail.unit || "pcs"}
              </p>
            )}
            {detail.description && <p className="tgs-desc">{detail.description}</p>}
            <p className="tgs-muted">✅ មានក្នុងស្តុក</p>
            {cart[String(detail._id)] ? (
              <Stepper qty={cart[String(detail._id)]} max={detail.stock} onChange={(q) => setQty(detail, q)} />
            ) : (
              <button type="button" className="tgs-add" onClick={() => setQty(detail, 1)}>
                + ដាក់កន្ត្រក
              </button>
            )}
            <button type="button" className="tgs-link" onClick={() => setDetail(null)}>
              ✕ បិទ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stepper({ qty, max, onChange }) {
  return (
    <div className="tgs-stepper">
      <button type="button" onClick={() => onChange(qty - 1)}>−</button>
      <span>{qty}</span>
      <button type="button" disabled={qty >= max} onClick={() => onChange(qty + 1)}>+</button>
    </div>
  );
}

// Colours come from Telegram's theme (light/dark follows the user's app);
// the fallbacks are for opening the page in a normal browser.
const CSS = `
.tgshop { --bg: var(--tg-theme-bg-color, #fff); --text: var(--tg-theme-text-color, #111); --hint: var(--tg-theme-hint-color, #888);
  --btn: var(--tg-theme-button-color, #1a73e8); --btn-text: var(--tg-theme-button-text-color, #fff);
  --card: var(--tg-theme-secondary-bg-color, #f2f3f5); background: var(--bg); color: var(--text);
  min-height: 100vh; padding: 12px 12px 90px; font-family: var(--font-khmer-body, system-ui), system-ui, sans-serif; box-sizing: border-box; }
.tgshop * { box-sizing: border-box; }
.tgs-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.tgs-head img { width: 40px; height: 40px; border-radius: 10px; }
.tgs-head div { display: flex; flex-direction: column; }
.tgs-head small, .tgs-muted { color: var(--hint); font-size: 0.85em; }
.tgs-error { color: #e53935; }
.tgs-search, .tgs-checkout input, .tgs-checkout textarea { width: 100%; padding: 10px 12px; border-radius: 12px; border: 1px solid transparent;
  background: var(--card); color: var(--text); font-size: 15px; margin-bottom: 12px; font-family: inherit; }
.tgs-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
@media (min-width: 560px) { .tgs-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
.tgs-card { background: var(--card); border-radius: 14px; overflow: hidden; display: flex; flex-direction: column; }
.tgs-img { position: relative; padding: 0; border: 0; background: #fff; aspect-ratio: 1; cursor: pointer; }
.tgs-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
.tgs-tag { position: absolute; top: 6px; left: 6px; font-size: 11px; padding: 2px 7px; border-radius: 8px; color: #fff; }
.tgs-tag.hot { background: #ff6d00; } .tgs-tag.sale { background: #e53935; left: auto; right: 6px; }
.tgs-body { padding: 8px; display: flex; flex-direction: column; gap: 6px; flex: 1; }
.tgs-name { font-size: 14px; line-height: 1.3; flex: 1; cursor: pointer; }
.tgs-price { font-weight: 700; display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px; }
.tgs-price s { color: var(--hint); font-weight: 400; font-size: 0.85em; }
.tgs-price small { color: var(--hint); font-weight: 400; font-size: 0.8em; width: 100%; }
.tgs-price.big { font-size: 1.3em; }
.tgs-add { background: var(--btn); color: var(--btn-text); border: 0; border-radius: 10px; padding: 8px; font-size: 14px; font-family: inherit; cursor: pointer; }
.tgs-stepper { display: flex; align-items: center; justify-content: space-between; background: var(--bg); border-radius: 10px; overflow: hidden; }
.tgs-stepper button { background: var(--btn); color: var(--btn-text); border: 0; width: 36px; height: 34px; font-size: 18px; cursor: pointer; }
.tgs-stepper button:disabled { opacity: 0.4; }
.tgs-stepper span { font-weight: 700; }
.tgs-bar { position: fixed; left: 12px; right: 12px; bottom: 12px; background: var(--btn); color: var(--btn-text); border: 0;
  border-radius: 14px; padding: 14px; font-size: 16px; font-weight: 700; font-family: inherit; cursor: pointer; }
.tgs-bar.static { position: static; width: 100%; margin-top: 8px; }
.tgs-link { background: none; border: 0; color: var(--btn); font-size: 15px; padding: 12px 0; font-family: inherit; cursor: pointer; }
.tgs-checkout h3 { margin-top: 0; }
.tgs-checkout label { display: block; font-size: 14px; margin-bottom: 4px; color: var(--hint); }
.tgs-line { display: flex; gap: 10px; background: var(--card); border-radius: 12px; padding: 8px; margin-bottom: 8px; }
.tgs-line img { width: 64px; height: 64px; object-fit: cover; border-radius: 8px; }
.tgs-line-main { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.tgs-line-main .tgs-stepper { max-width: 140px; }
.tgs-line-main small s { color: var(--hint); }
.tgs-total { font-size: 18px; margin: 12px 0 16px; }
.tgs-total small { color: var(--hint); font-size: 0.75em; }
.tgs-done { text-align: center; padding-top: 40px; }
.tgs-big { font-size: 64px; }
.tgs-sheet-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: flex-end; z-index: 50; }
.tgs-sheet { background: var(--bg); width: 100%; max-height: 92vh; overflow-y: auto; border-radius: 18px 18px 0 0; padding: 14px 14px 24px; }
.tgs-sheet img { width: 100%; max-height: 55vh; object-fit: contain; border-radius: 12px; background: #fff; }
.tgs-sheet h3 { margin: 10px 0 6px; }
.tgs-desc { white-space: pre-wrap; }
.tgs-sheet .tgs-add, .tgs-sheet .tgs-stepper { width: 100%; margin-top: 6px; }
`;

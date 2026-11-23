import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import api from "../api/axios";
import { formatUSD } from "../utils/currency";

// KHQR card shown in the Telegram Mini App after ordering: the QR to scan
// with any bank app, the amount, a countdown, and live status. While unpaid
// it asks the server every 5 s (the server checks with the Bakong API);
// when the money arrives it turns into "✅ paid".
const fmt = (amount, currency) =>
  currency === "KHR" ? `៛${Math.round(Number(amount) || 0).toLocaleString("en-US")}` : formatUSD(amount);

export default function KhqrPayCard({ initData, orderId, orderNo, initial }) {
  const [pay, setPay] = useState(initial);
  const [img, setImg] = useState("");
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const stopped = useRef(false);

  // QR picture
  useEffect(() => {
    if (!pay?.qr) return setImg("");
    QRCode.toDataURL(pay.qr, { width: 520, margin: 1, errorCorrectionLevel: "M" })
      .then(setImg)
      .catch(() => setImg(""));
  }, [pay?.qr]);

  // Clock for the countdown
  useEffect(() => {
    const h = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(h);
  }, []);

  const ask = async (extra = {}) => {
    try {
      const { data } = await api.post("/telegram/webapp/payment", { initData, orderId, ...extra });
      if (data.payment) setPay(data.payment);
      return data.payment;
    } catch {
      return null;
    }
  };

  // Poll while unpaid
  useEffect(() => {
    stopped.current = false;
    if (pay?.status !== "unpaid") return undefined;
    const h = setInterval(() => {
      if (!stopped.current) ask({ check: true });
    }, 5000);
    return () => {
      stopped.current = true;
      clearInterval(h);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pay?.status, pay?.qr]);

  useEffect(() => {
    if (pay?.status === "paid") window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.("success");
  }, [pay?.status]);

  if (!pay) return null;
  const left = pay.expiresAt ? Math.max(0, Math.floor((new Date(pay.expiresAt).getTime() - now) / 1000)) : null;
  const timedOut = pay.status === "expired" || (pay.status === "unpaid" && left === 0);

  const checkNow = async () => {
    setBusy(true);
    setNote("");
    const p = await ask({ check: true });
    setBusy(false);
    if (p && p.status !== "paid") setNote("⏳ មិនទាន់ឃើញការបង់ទេ — បើទើបបង់ សូមរង់ចាំបន្តិច");
  };
  const renew = async () => {
    setBusy(true);
    setNote("");
    await ask({ renew: true });
    setBusy(false);
  };

  if (pay.status === "paid") {
    return (
      <div className="khqr-card khqr-paid">
        <div className="tgs-big">✅</div>
        <h3>បានទទួលការបង់ប្រាក់</h3>
        <p>
          <b>{fmt(pay.amount, pay.currency)}</b> · {orderNo}
        </p>
        <p>សូមអរគុណ! 🙏</p>
      </div>
    );
  }

  return (
    <div className="khqr-card">
      <div className="khqr-head">KHQR</div>
      <div className="khqr-amount">{fmt(pay.amount, pay.currency)}</div>
      <div className="khqr-order">{orderNo}</div>
      {timedOut ? (
        <div className="khqr-expired">
          <p>⏰ QR ផុតកំណត់ហើយ</p>
          <button type="button" className="khqr-btn" disabled={busy} onClick={renew}>
            🔁 យក QR ថ្មី
          </button>
        </div>
      ) : (
        <>
          {img ? <img className="khqr-img" src={img} alt="KHQR" /> : <div className="khqr-img khqr-img-empty">…</div>}
          <p className="khqr-help">ស្កេនដោយកម្មវិធីធនាគារណាមួយ (ABA, ACLEDA, Wing, Bakong…)</p>
          {left !== null && (
            <p className="khqr-timer">
              ⏰ {String(Math.floor(left / 60)).padStart(2, "0")}:{String(left % 60).padStart(2, "0")}
            </p>
          )}
          <p className="khqr-wait">
            <span className="khqr-dot" /> កំពុងរង់ចាំការបង់ — ផ្ទៀងផ្ទាត់ដោយស្វ័យប្រវត្តិ
          </p>
          <button type="button" className="khqr-btn" disabled={busy} onClick={checkNow}>
            {busy ? "កំពុងពិនិត្យ…" : "🔄 ខ្ញុំបានបង់រួច — ពិនិត្យ"}
          </button>
        </>
      )}
      {note && <p className="khqr-note">{note}</p>}
      <p className="khqr-small">QR នេះក៏បានផ្ញើក្នុងឆាត bot ដែរ</p>
    </div>
  );
}

export const KHQR_CSS = `
.khqr-card { background:#fff; color:#111; border-radius:16px; box-shadow:0 4px 18px rgba(0,0,0,.12); margin:14px auto; max-width:330px; overflow:hidden; text-align:center; padding-bottom:14px; }
.khqr-head { background:#e1232e; color:#fff; font-weight:800; letter-spacing:2px; padding:10px 0; font-size:18px; }
.khqr-amount { font-size:28px; font-weight:800; margin-top:12px; }
.khqr-order { font-size:13px; opacity:.6; }
.khqr-img { width:240px; height:240px; margin:10px auto 4px; display:block; image-rendering:pixelated; }
.khqr-img-empty { display:flex; align-items:center; justify-content:center; background:#f3f3f3; }
.khqr-help { font-size:13px; margin:4px 14px; }
.khqr-timer { font-size:15px; font-weight:700; margin:6px 0; }
.khqr-wait { font-size:13px; color:#555; margin:6px 14px; }
.khqr-dot { display:inline-block; width:8px; height:8px; border-radius:50%; background:#e1232e; margin-right:6px; animation:khqrPulse 1s infinite alternate; }
@keyframes khqrPulse { from { opacity:.25 } to { opacity:1 } }
.khqr-btn { margin-top:8px; border:0; border-radius:10px; padding:10px 16px; font-weight:700; background:var(--tg-theme-button-color,#2481cc); color:var(--tg-theme-button-text-color,#fff); font-size:14px; }
.khqr-btn:disabled { opacity:.6; }
.khqr-expired p { font-weight:700; margin:16px 0 6px; }
.khqr-note { font-size:13px; margin:8px 14px 0; }
.khqr-small { font-size:11px; opacity:.55; margin:10px 0 0; }
.khqr-paid { padding:18px 14px; }
.khqr-paid h3 { margin:6px 0; }
`;

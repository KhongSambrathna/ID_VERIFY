import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import QRCode from "qrcode";
import api from "../api/axios";
import { useLanguage } from "../i18n/LanguageContext";
import { useAuth } from "../context/AuthContext";
import { formatUSD } from "../utils/currency";
import { KHQR_CSS } from "../components/KhqrPayCard";

// KHQR payment page for student debts and tournament entry fees
// (/payment/return?md5=…). Shows the QR (made on the server), a countdown,
// and asks the server every 5 s — the server checks with the Bakong API and
// takes the payment off what's owed once the money arrives.
const fmt = (amount, currency) =>
  currency === "USD" ? formatUSD(amount) : `៛${Math.round(Number(amount) || 0).toLocaleString("en-US")}`;

export default function BakongPaymentReturn() {
  const { t } = useLanguage();
  const { isAdmin, isHeadCoach } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const md5 = params.get("md5");
  const [p, setP] = useState(null);
  const [err, setErr] = useState("");
  const [img, setImg] = useState("");
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    if (!md5) return setErr(t("paymentReturn.missingReference"));
    api
      .get(`/bakong/payment/${encodeURIComponent(md5)}`)
      .then(({ data }) => setP(data))
      .catch((e) => setErr(e.response?.data?.message || t("paymentReturn.checkFailed")));
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      live.current = false;
      clearInterval(tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [md5]);

  useEffect(() => {
    if (!p?.qr) return setImg("");
    QRCode.toDataURL(p.qr, { width: 520, margin: 1, errorCorrectionLevel: "M" }).then(setImg).catch(() => setImg(""));
  }, [p?.qr]);

  const check = async () => {
    try {
      const { data } = await api.post("/bakong/check-transaction", { md5 });
      if (live.current) setP(data);
      return data;
    } catch {
      return null;
    }
  };

  // Poll while pending
  useEffect(() => {
    if (p?.status !== "PENDING") return undefined;
    const h = setInterval(check, 5000);
    return () => clearInterval(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.status]);

  const checkNow = async () => {
    setBusy(true);
    setNote("");
    const d = await check();
    setBusy(false);
    if (d && d.status === "PENDING") setNote(d.checkError ? `${t("paymentReturn.bakongError")}: ${d.checkError}` : t("paymentReturn.notYet"));
  };
  const markPaid = async () => {
    if (!confirm(t("paymentReturn.confirmMarkPaid").replace("{amount}", fmt(p.amount, p.currency)))) return;
    setBusy(true);
    try {
      const { data } = await api.post("/bakong/mark-paid", { md5 });
      setP(data);
    } catch (e) {
      setNote(e.response?.data?.message || t("paymentReturn.checkFailed"));
    } finally {
      setBusy(false);
    }
  };

  const left = p?.expiresAt ? Math.max(0, Math.floor((new Date(p.expiresAt).getTime() - now) / 1000)) : null;
  const expired = p && (p.status === "EXPIRED" || (p.status === "PENDING" && left === 0));
  const staff = isAdmin || isHeadCoach;

  return (
    <div className="container dash-body" style={{ maxWidth: 480, textAlign: "center", paddingTop: 24 }}>
      <style>{KHQR_CSS}</style>
      {err && <p className="error-text">{err}</p>}
      {!err && !p && <p>{t("paymentReturn.loading")}</p>}

      {p && (
        <>
          <p style={{ margin: "0 0 4px", fontWeight: 700 }}>
            {p.kind === "TOURNAMENT" ? `🏆 ${t("paymentReturn.forTournament")}` : `📉 ${t("paymentReturn.forDebt")}`}
          </p>
          <p className="help-text" style={{ margin: 0, overflowWrap: "anywhere" }}>{p.label}</p>

          {p.status === "COMPLETED" ? (
            <div className="khqr-card khqr-paid">
              <div className="tgs-big" style={{ fontSize: 48 }}>✅</div>
              <h3>{t("paymentReturn.successTitle")}</h3>
              <p><b>{fmt(p.amount, p.currency)}</b></p>
              {p.fromAccount && <p className="help-text">{t("paymentReturn.from")} {p.fromAccount}</p>}
              <p>{t("paymentReturn.successBody")}</p>
            </div>
          ) : expired ? (
            <div className="khqr-card khqr-paid">
              <div style={{ fontSize: 40 }}>⏰</div>
              <h3>{t("paymentReturn.expiredTitle")}</h3>
              <p>{t("paymentReturn.expiredBody")}</p>
            </div>
          ) : p.status === "PENDING" ? (
            <div className="khqr-card">
              <div className="khqr-head">KHQR</div>
              <div className="khqr-amount">{fmt(p.amount, p.currency)}</div>
              {img ? <img className="khqr-img" src={img} alt="KHQR" /> : <div className="khqr-img khqr-img-empty">…</div>}
              <p className="khqr-help">{t("paymentReturn.scanInstructions")}</p>
              {left !== null && (
                <p className="khqr-timer">
                  ⏰ {String(Math.floor(left / 60)).padStart(2, "0")}:{String(left % 60).padStart(2, "0")}
                </p>
              )}
              <p className="khqr-wait">
                <span className="khqr-dot" /> {t("paymentReturn.waiting")}
              </p>
              <button type="button" className="khqr-btn" disabled={busy} onClick={checkNow}>
                🔄 {busy ? t("paymentReturn.checkingNow") : t("paymentReturn.checkNow")}
              </button>
              {note && <p className="khqr-note">{note}</p>}
              {staff && (
                <p style={{ marginTop: 10 }}>
                  <button type="button" className="link-btn" disabled={busy} onClick={markPaid}>
                    💰 {t("paymentReturn.markPaid")}
                  </button>
                </p>
              )}
            </div>
          ) : (
            <div className="khqr-card khqr-paid">
              <h3>{t("paymentReturn.failedTitle")}</h3>
            </div>
          )}
        </>
      )}

      <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 16, flexWrap: "wrap" }}>
        <button type="button" className="btn btn-outline" onClick={() => navigate(-1)}>
          ← {t("paymentReturn.back")}
        </button>
        <Link className="btn btn-primary" to="/">
          {t("paymentReturn.backHome")}
        </Link>
      </div>
    </div>
  );
}

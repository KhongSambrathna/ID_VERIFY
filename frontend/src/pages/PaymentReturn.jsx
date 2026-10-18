import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "../api/axios";
import { useLanguage } from "../i18n/LanguageContext";

// Bakong KHQR payment page. Lands here after a Bakong payment is created
// (POST /api/bakong/payment/create) with ?md5=<reference>. Proxies the QR
// image through the backend so the frontend never touches the Bearer token,
// then polls check-transaction until the payment settles.
export default function BakongPaymentReturn() {
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();
  const md5 = searchParams.get("md5");
  const [status, setStatus] = useState("checking"); // checking | COMPLETED | PENDING | FAILED | error
  const [message, setMessage] = useState("");
  const [qrImageUrl, setQrImageUrl] = useState(null);
  const [polling, setPolling] = useState(true);

  useEffect(() => {
    if (!md5) {
      setStatus("error");
      setMessage(t("paymentReturn.missingReference"));
      setPolling(false);
      return;
    }
    // QR image is proxied through the backend (no Bearer token in frontend).
    setQrImageUrl(`/api/bakong/qr-image?md5=${encodeURIComponent(md5)}`);

    const poll = async () => {
      try {
        const { data } = await api.post("/bakong/check-transaction", { md5 });
        if (data.status === "COMPLETED") {
          setStatus("COMPLETED");
          setPolling(false);
          return;
        }
        if (data.status === "FAILED" || data.status === "CANCELLED") {
          setStatus(data.status);
          setPolling(false);
          return;
        }
        // Still PENDING — poll again after 3 seconds.
        setTimeout(poll, 3000);
      } catch (err) {
        setStatus("error");
        setMessage(err.response?.data?.message || t("paymentReturn.checkFailed"));
        setPolling(false);
      }
    };
    poll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [md5]);

  return (
    <div className="container dash-body" style={{ maxWidth: 480, textAlign: "center", paddingTop: 60 }}>
      {status === "checking" && polling && (
        <>
          <p>{t("paymentReturn.checking")}</p>
          {qrImageUrl && (
            <img
              src={qrImageUrl}
              alt="Bakong KHQR"
              style={{ width: 240, height: 240, objectFit: "contain", margin: "12px auto", display: "block" }}
            />
          )}
          <p className="help-text">{t("paymentReturn.scanInstructions")}</p>
        </>
      )}
      {status === "COMPLETED" && (
        <>
          <h2>{t("paymentReturn.successTitle")}</h2>
          <p>{t("paymentReturn.successBody")}</p>
        </>
      )}
      {status === "PENDING" && (
        <>
          <h2>{t("paymentReturn.pendingTitle")}</h2>
          <p>{t("paymentReturn.pendingBody")}</p>
        </>
      )}
      {(status === "FAILED" || status === "CANCELLED") && (
        <>
          <h2>{t("paymentReturn.failedTitle")}</h2>
          <p>{t("paymentReturn.failedBody")}</p>
        </>
      )}
      {status === "error" && (
        <>
          <h2>{t("paymentReturn.failedTitle")}</h2>
          <p>{message}</p>
        </>
      )}
      <Link className="btn btn-primary" to="/" style={{ marginTop: 20, display: "inline-block" }}>
        {t("paymentReturn.backHome")}
      </Link>
    </div>
  );
}

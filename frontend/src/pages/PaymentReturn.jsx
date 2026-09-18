import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "../api/axios";
import { useLanguage } from "../i18n/LanguageContext";

// Landing page ABA PayWay redirects back to after a checkout attempt
// (success, cancel, or failure all land here — see return_url in
// paymentController.createAbaPayment on the backend). We never trust that
// redirect by itself: this always asks our backend to re-confirm the real
// status, which in turn re-checks directly with ABA's server before
// crediting anything against what's owed.
export default function PaymentReturn() {
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();
  const tranId = searchParams.get("tranId");
  const [status, setStatus] = useState("checking"); // checking | COMPLETED | PENDING | FAILED | CANCELLED | error
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!tranId) {
      setStatus("error");
      setMessage(t("paymentReturn.missingTranId"));
      return;
    }
    api
      .post("/payments/aba/confirm", { tranId })
      .then(({ data }) => setStatus(data.status || "PENDING"))
      .catch((err) => {
        setStatus("error");
        setMessage(err.response?.data?.message || t("paymentReturn.confirmFailed"));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tranId]);

  return (
    <div className="container dash-body" style={{ maxWidth: 480, textAlign: "center", paddingTop: 60 }}>
      {status === "checking" && <p>{t("paymentReturn.checking")}</p>}
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

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../i18n/LanguageContext";

function formatDate(d) {
  const date = new Date(d);
  if (isNaN(date)) return "";
  return date.toISOString().slice(0, 10);
}

// Wraps a Head Coach's management screens (Squad list / Formation /
// Starting XI in CoachDashboard, plus AddAthlete/EditAthlete) so they only
// render while the team's plan subscription (Basic/Pro/Pro Max/Unlimited)
// is active. An Admin account always passes straight through without ever
// calling the API — they're the ones who record payments (see
// AdminSubscriptions.jsx), so they must never be locked out of a team's
// tools by that same team being unpaid. A Player account never renders
// these pages at all.
export default function RequireActiveSubscription({ children }) {
  const { isHeadCoach } = useAuth();
  const { t } = useLanguage();
  // Non-Head-Coach accounts start "active" and never fetch anything.
  const [status, setStatus] = useState(isHeadCoach ? null : { active: true });

  const load = useCallback(() => {
    if (!isHeadCoach) return;
    setStatus(null);
    api
      .get("/teams/mine/subscription")
      .then(({ data }) => setStatus(data))
      .catch(() => setStatus({ active: false, expiresAt: null }));
  }, [isHeadCoach]);

  useEffect(() => {
    load();
  }, [load]);

  if (!isHeadCoach) return children;

  if (status === null) {
    return (
      <div className="container dash-body">
        <p>{t("common.loading")}</p>
      </div>
    );
  }

  if (status.active) return children;

  return (
    <div className="container dash-body">
      <div className="card subscription-lock">
        <h2>{t("subscriptionLock.title")}</h2>
        <p>{t("subscriptionLock.body")}</p>
        {status.expiresAt && (
          <p className="help-text">{t("subscriptionLock.expiredOn").replace("{date}", formatDate(status.expiresAt))}</p>
        )}
        <div className="subscription-lock-actions">
          <button type="button" className="btn btn-outline" onClick={load}>
            {t("subscriptionLock.checkAgain")}
          </button>
          <Link to="/pricing" className="btn btn-outline">
            {t("subscriptionLock.viewPricing")}
          </Link>
        </div>
      </div>
    </div>
  );
}

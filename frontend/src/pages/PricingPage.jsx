import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";
import { useLanguage } from "../i18n/LanguageContext";

const TELEGRAM_USERNAME = "sambrathnajr";

// Public marketing/pricing page — no login required. Reads GET /services/pricing
// (referee + trophy/award pricing, see backend/utils/servicePricing.js). There is
// no in-app checkout — every service is arranged with the Admin outside the app.
export default function PricingPage() {
  const { t } = useLanguage();
  const [services, setServices] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/services/pricing")
      .then(({ data: serviceData }) => {
        setServices(serviceData);
      })
      .catch((err) => setError(err.response?.data?.message || t("pricingPage.failedToLoad")))
      .finally(() => setLoading(false));
  }, []);

  // "Contact Admin" placeholder for any service price not filled in yet.
  const money = (value, suffix = "") =>
    value == null ? t("pricingPage.contactForPrice") : `$${value}${suffix}`;

  const contactHref = `https://t.me/${TELEGRAM_USERNAME}`;

  return (
    <div className="container pricing-page">
      <div className="pricing-hero">
        <h1>{t("pricingPage.title")}</h1>
        <p>{t("pricingPage.subtitle")}</p>
      </div>

      {loading && <p>{t("common.loading")}</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && !error && (
        <>
          <h2 className="pricing-section-title">{t("pricingPage.servicesHeading")}</h2>
          <p className="pricing-section-intro">{t("pricingPage.servicesIntro")}</p>

          <div className="pricing-grid pricing-grid-services">
            <div className="pricing-card">
              <h3 className="pricing-card-name">{t("pricingPage.refereeTitle")}</h3>
              <p className="pricing-card-cap">{t("pricingPage.refereeDesc")}</p>
              <p className="pricing-card-price">
                {services?.referee?.basePrice == null ? (
                  <span className="pricing-amount pricing-amount-contact">{t("pricingPage.contactForPrice")}</span>
                ) : (
                  <>
                    <span className="pricing-amount">${services.referee.basePrice}</span>
                    <span className="pricing-per">/{t("pricingPage.perMatchShort")}</span>
                  </>
                )}
              </p>
              <p className="pricing-card-billed">{t("pricingPage.refereeBase")}</p>
              <ul className="pricing-card-cycles">
                <li>
                  {t("pricingPage.refereeDistance")}:{" "}
                  <strong>{money(services?.referee?.pricePerKm, `/${t("pricingPage.perKmShort")}`)}</strong>
                </li>
                <li>
                  {t("pricingPage.refereeExtraMatch")}:{" "}
                  <strong>{money(services?.referee?.additionalMatchRate, `/${t("pricingPage.perMatchShort")}`)}</strong>
                </li>
              </ul>
            </div>

            <div className="pricing-card">
              <h3 className="pricing-card-name">{t("pricingPage.trophyTitle")}</h3>
              <p className="pricing-card-cap">{t("pricingPage.trophyDesc")}</p>
              <p className="pricing-card-price">
                {services?.trophy?.basePrice == null ? (
                  <span className="pricing-amount pricing-amount-contact">{t("pricingPage.contactForPrice")}</span>
                ) : (
                  <>
                    <span className="pricing-amount">${services.trophy.basePrice}</span>
                    <span className="pricing-per">/{t("pricingPage.perEventShort")}</span>
                  </>
                )}
              </p>
              <p className="pricing-card-billed">{t("pricingPage.trophyBase")}</p>
              <ul className="pricing-card-cycles">
                <li>
                  {t("pricingPage.trophyPerItem")}:{" "}
                  <strong>{money(services?.trophy?.pricePerItem, `/${t("pricingPage.perItemShort")}`)}</strong>
                </li>
              </ul>
            </div>

            <div className="pricing-card">
              <h3 className="pricing-card-name">{t("pricingPage.posterTitle")}</h3>
              <p className="pricing-card-cap">{t("pricingPage.posterDesc")}</p>
              <p className="pricing-card-price">
                {services?.poster?.basePrice == null ? (
                  <span className="pricing-amount pricing-amount-contact">{t("pricingPage.contactForPrice")}</span>
                ) : (
                  <>
                    <span className="pricing-amount">${services.poster.basePrice}</span>
                    <span className="pricing-per">/{t("pricingPage.perDesignShort")}</span>
                  </>
                )}
              </p>
              <p className="pricing-card-billed">{t("pricingPage.posterBase")}</p>
            </div>

            <div className="pricing-card pricing-card-link">
              <h3 className="pricing-card-name">{t("pricingPage.shopTitle")}</h3>
              <p className="pricing-card-cap">{t("pricingPage.shopDesc")}</p>
              <Link to="/shop" className="btn btn-primary pricing-card-link-btn">
                {t("pricingPage.shopCta")}
              </Link>
            </div>
          </div>

          <p className="pricing-contact-note">
            {t("pricingPage.servicesContactNote")}{" "}
            <a href={contactHref} target="_blank" rel="noopener noreferrer">
              Telegram
            </a>
          </p>
        </>
      )}
    </div>
  );
}

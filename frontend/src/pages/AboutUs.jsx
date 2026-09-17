import TrustedBy from "../components/TrustedBy";
import { useLanguage } from "../i18n/LanguageContext";

export default function AboutUs() {
  const { t } = useLanguage();

  return (
    <>
      <section className="hero about-hero">
        <div className="container">
          <h1>{t("aboutUs.heroTitle")}</h1>
          <p>{t("aboutUs.heroDescription")}</p>
        </div>
      </section>

      <section className="features">
        <div className="container">
          <h2>{t("aboutUs.whyTitle")}</h2>
          <p className="about-lead">{t("aboutUs.whyDescription")}</p>
        </div>
      </section>

      <section className="features" id="about-how">
        <div className="container">
          <h2>{t("aboutUs.whatTitle")}</h2>
          <div className="grid">
            <div className="feature-card">
              <div className="num">01</div>
              <h3>{t("aboutUs.feature1Title")}</h3>
              <p>{t("aboutUs.feature1Desc")}</p>
            </div>
            <div className="feature-card">
              <div className="num">02</div>
              <h3>{t("aboutUs.feature2Title")}</h3>
              <p>{t("aboutUs.feature2Desc")}</p>
            </div>
            <div className="feature-card">
              <div className="num">03</div>
              <h3>{t("aboutUs.feature3Title")}</h3>
              <p>{t("aboutUs.feature3Desc")}</p>
            </div>
            <div className="feature-card">
              <div className="num">04</div>
              <h3>{t("aboutUs.feature4Title")}</h3>
              <p>{t("aboutUs.feature4Desc")}</p>
            </div>
          </div>
        </div>
      </section>

      <TrustedBy />

      <section className="features about-cta">
        <div className="container" style={{ textAlign: "center" }}>
          <h2>{t("aboutUs.ctaTitle")}</h2>
          <div className="cta-row" style={{ justifyContent: "center" }}>
            <a href="/search" className="btn btn-primary">
              {t("aboutUs.findPlayerCta")}
            </a>
            <a
              href="/login"
              className="btn btn-outline"
              style={{ color: "var(--navy)", borderColor: "var(--navy)" }}
            >
              {t("aboutUs.adminSignIn")}
            </a>
          </div>
        </div>
      </section>
    </>
  );
}

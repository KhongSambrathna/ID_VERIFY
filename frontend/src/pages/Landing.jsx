import TrustedBy from "../components/TrustedBy";
import { useLanguage } from "../i18n/LanguageContext";

export default function Landing() {
  const { t } = useLanguage();

  return (
    <>
      <section className="hero">
        <div className="container">
          <h1>{t("landing.heroTitle")}</h1>
          <p>{t("landing.heroDescription")}</p>
          <div className="cta-row">
            <a href="/search" className="btn btn-primary">
              {t("landing.findPlayerCta")}
            </a>
            <a href="/login" className="btn btn-outline">
              {t("landing.adminSignIn")}
            </a>
            <a href="#how" className="btn btn-outline">
              {t("landing.howItWorksLink")}
            </a>
          </div>
        </div>
      </section>

      <TrustedBy />

      <section className="features" id="how">
        <div className="container">
          <h2>{t("landing.howVerificationWorksTitle")}</h2>
          <div className="grid">
            <div className="feature-card">
              <div className="num">01</div>
              <h3>{t("landing.step1Title")}</h3>
              <p>{t("landing.step1Desc")}</p>
            </div>
            <div className="feature-card">
              <div className="num">02</div>
              <h3>{t("landing.step2Title")}</h3>
              <p>{t("landing.step2Desc")}</p>
            </div>
            <div className="feature-card">
              <div className="num">03</div>
              <h3>{t("landing.step3Title")}</h3>
              <p>{t("landing.step3Desc")}</p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

import { useState } from "react";
import { Link } from "react-router-dom";
import IDCardBack from "../components/IDCardBack";
import { useLanguage } from "../i18n/LanguageContext";

const MAX_COPIES = 200;

// Prints just the back of the ID card (the terms-of-use side), any number
// of copies on however many sheets it takes — completely standalone, no
// athlete data involved, since every card shares the same back. Pairing a
// printed back with a given athlete's front card is done by hand (cut,
// match up, laminate) rather than by anything on this page.
export default function PrintCardBacksPage() {
  const { t } = useLanguage();
  const [count, setCount] = useState(8);

  const clampedCount = Math.min(MAX_COPIES, Math.max(1, Number(count) || 1));

  return (
    <div className="container" style={{ paddingBottom: 60 }}>
      <div className="dash-header no-print">
        <h2>{t("printCardBacksPage.title")}</h2>
        <div className="dash-actions">
          <Link to="/admin/cards" className="link-btn">
            {t("printCardBacksPage.backToCards")}
          </Link>
          <button className="btn btn-primary" onClick={() => window.print()}>
            {t("printCardBacksPage.print")}
          </button>
        </div>
      </div>

      <div className="no-print filter-row">
        <div className="field" style={{ marginBottom: 0, maxWidth: 220 }}>
          <label>{t("printCardBacksPage.copiesLabel")}</label>
          <input
            type="number"
            min={1}
            max={MAX_COPIES}
            value={count}
            onChange={(e) => setCount(e.target.value)}
          />
          <p className="help-text">{t("printCardBacksPage.copiesHelp")}</p>
        </div>
      </div>

      <div className="cards-grid">
        {Array.from({ length: clampedCount }, (_, i) => (
          <IDCardBack key={i} />
        ))}
      </div>
    </div>
  );
}

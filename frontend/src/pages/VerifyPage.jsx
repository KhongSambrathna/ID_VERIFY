import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../api/axios";
import { resolveFileUrl } from "../utils/fileUrl";
import { km as kmDict, en as enDict } from "../i18n/dict/verifyPage";

const STATUS_META = {
  verified: { icon: "✅", cls: "verified" },
  unverified: { icon: "⏳", cls: "pending" },
};

// Public verify page only — the printed ID card already shows both
// languages side by side permanently, so it doesn't need a toggle. This
// page is viewed live in a browser by anyone scanning the QR code, so
// letting them flip between Khmer and English on demand is what was asked
// for. Defaults to Khmer (the club's primary language) and remembers the
// visitor's last choice on their own device. Strings come from
// i18n/dict/verifyPage.js, but read directly by key (rather than through
// the site-wide useLanguage()/t() hook) since this page's language toggle
// is its own, independent of the global language switcher.

function formatDob(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d)) return null;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}

export default function VerifyPage() {
  const { verifyId } = useParams();
  const [athlete, setAthlete] = useState(null);
  const [error, setError] = useState("");
  const [lang, setLang] = useState(() => {
    try {
      return localStorage.getItem("verifyPageLang") || "km";
    } catch {
      return "km";
    }
  });

  const dict = lang === "km" ? kmDict : enDict;
  const t = (key) => dict[`verifyPage.${key}`] ?? key;

  const changeLang = (next) => {
    setLang(next);
    try {
      localStorage.setItem("verifyPageLang", next);
    } catch {
      // ignore — just won't be remembered next visit
    }
  };

  useEffect(() => {
    api
      .get(`/athletes/verify/${verifyId}`)
      .then(({ data }) => setAthlete(data))
      .catch((err) => setError(err.response?.data?.message || t("recordNotFound")));
  }, [verifyId]);

  return (
    <div className="verify-wrap">
      <div className="card verify-result">
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginBottom: 10 }}>
          <button
            type="button"
            className="btn btn-outline"
            style={{
              padding: "4px 10px",
              fontSize: 13,
              borderColor: "var(--navy)",
              background: lang === "km" ? "var(--navy)" : "transparent",
              color: lang === "km" ? "#fff" : "var(--navy)",
            }}
            onClick={() => changeLang("km")}
          >
            {t("khmerToggleLabel")}
          </button>
          <button
            type="button"
            className="btn btn-outline"
            style={{
              padding: "4px 10px",
              fontSize: 13,
              borderColor: "var(--navy)",
              background: lang === "en" ? "var(--navy)" : "transparent",
              color: lang === "en" ? "#fff" : "var(--navy)",
            }}
            onClick={() => changeLang("en")}
          >
            {t("englishToggleLabel")}
          </button>
        </div>

        {error && (
          <>
            <div className="status-icon">❌</div>
            <h2>{t("notFound")}</h2>
            <p>{error}</p>
          </>
        )}
        {athlete && (
          <>
            <img
              className="id-card-photo"
              style={{ margin: "0 auto 14px" }}
              src={
                athlete.photoUrl
                  ? resolveFileUrl(athlete.photoUrl)
                  : "https://placehold.co/90x110?text=Photo"
              }
              alt={athlete.fullName}
            />
            <div className="status-icon">{STATUS_META[athlete.status].icon}</div>
            <h2 style={{ marginBottom: 2 }}>{athlete.fullName}</h2>
            {athlete.khmerName && <p style={{ margin: "0 0 4px" }}>{athlete.khmerName}</p>}
            <p className="verify-id" style={{ margin: "0 0 10px" }}>
              {t("id")}: {athlete.verifyId}
            </p>

            <span className={`badge ${STATUS_META[athlete.status].cls}`}>
              {t(athlete.status)}
            </span>
            <div style={{ marginTop: 8, marginBottom: 18 }}>
              <span className={`badge ${athlete.isAvailable ? "verified" : "rejected"}`}>
                {athlete.isAvailable ? t("available") : t("notAvailable")}
              </span>
            </div>

            <div className="detail-grid" style={{ textAlign: "left" }}>
              <div className="detail-item">
                <div className="detail-label">{t("dob")}</div>
                <div className="detail-value">{formatDob(athlete.dateOfBirth) || "—"}</div>
              </div>
              <div className="detail-item">
                <div className="detail-label">{t("gender")}</div>
                <div className="detail-value">{athlete.gender || "—"}</div>
              </div>
              {(athlete.memberships?.length
                ? athlete.memberships
                : [{ team: athlete.team, role: athlete.role }]
              ).flatMap((m, i) => [
                <div className="detail-item" key={`team-${i}`}>
                  <div className="detail-label">{t("team")}</div>
                  <div className="detail-value">{m.team || "—"}</div>
                </div>,
                <div className="detail-item" key={`role-${i}`}>
                  <div className="detail-label">{t("role")}</div>
                  <div className="detail-value">{m.role || "—"}</div>
                </div>,
              ])}
              <div className="detail-item detail-item-wide">
                <div className="detail-label">{t("address")}</div>
                <div className="detail-value">{athlete.address || "—"}</div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

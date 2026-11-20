import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../i18n/LanguageContext";

// Shown under the navbar while an Admin is working as a team's Head Coach.
export default function CoachModeBanner() {
  const { inCoachMode, coachTeam, exitCoachMode } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  if (!inCoachMode) return null;
  return (
    <div className="coach-mode-banner no-print">
      <div className="container">
        <span>
          🧢 {t("coachMode.bannerText")} <b>{coachTeam}</b>
        </span>
        <span className="coach-mode-actions">
          <Link to="/admin/coach-mode">{t("coachMode.switchTeam")}</Link>
          <button
            type="button"
            onClick={() => {
              exitCoachMode();
              navigate("/admin");
            }}
          >
            ↩ {t("coachMode.backToAdmin")}
          </button>
        </span>
      </div>
    </div>
  );
}

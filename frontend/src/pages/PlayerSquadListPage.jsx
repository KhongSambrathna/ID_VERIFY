import { useAuth } from "../context/AuthContext";
import SquadListManager from "../components/SquadListManager";
import { useLanguage } from "../i18n/LanguageContext";

// Read-only view of your own team's squad lists (match-day rosters) — the
// same lists a Head Coach/Admin manages under My Team > Squad list, and the
// same ones tournament registrations get auto-added into. A Player can see
// who's in each list and export it as an image/PDF, but never create, edit,
// or delete one.
export default function PlayerSquadListPage() {
  const { t } = useLanguage();
  const { team } = useAuth();

  if (!team) {
    return (
      <div className="container dash-body">
        <p className="error-text">{t("playerSquadListPage.noTeam")}</p>
      </div>
    );
  }

  return (
    <div className="container dash-body">
      <div className="dash-header">
        <h2>{t("playerSquadListPage.title")}</h2>
        <p>{t("playerSquadListPage.intro").replace("{team}", team)}</p>
      </div>
      <SquadListManager team={team} athletes={[]} readOnly />
    </div>
  );
}

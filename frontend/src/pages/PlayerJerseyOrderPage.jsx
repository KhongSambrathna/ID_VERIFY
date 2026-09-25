import { useAuth } from "../context/AuthContext";
import JerseyOrderManager from "../components/JerseyOrderManager";
import { useLanguage } from "../i18n/LanguageContext";

// An individual Player login's own jersey order, alongside the rest of
// their team's — same "mine" basePath the Head Coach's Jersey Orders tab
// uses (CoachDashboard.jsx), just reached from the Player side. A legacy
// shared team-wide Player login (no athleteId) can still see the list, but
// JerseyOrderManager only shows the self-register form for an individual
// login — see its own comment for why.
export default function PlayerJerseyOrderPage() {
  const { t } = useLanguage();
  const { team } = useAuth();

  if (!team) {
    return (
      <div className="container dash-body">
        <p className="error-text">{t("playerJerseyOrderPage.noTeam")}</p>
      </div>
    );
  }

  return (
    <div className="container dash-body">
      <div className="dash-header">
        <h2>{t("playerJerseyOrderPage.title")}</h2>
        <p>{t("playerJerseyOrderPage.intro")}</p>
      </div>
      <JerseyOrderManager team={team} basePath="/teams/mine/jersey-orders" athletes={[]} />
    </div>
  );
}

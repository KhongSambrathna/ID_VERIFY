import { useEffect, useState } from "react";
import api from "../api/axios";
import JerseyOrderManager from "../components/JerseyOrderManager";
import { useLanguage } from "../i18n/LanguageContext";

// Admin-side entry point for jersey orders — unlike Squad list/Formation/
// Starting XI (Head-Coach-only, one team at a time via CoachDashboard),
// jersey orders explicitly need Admin approval too (see
// JerseyOrderManager/jerseyOrderController), so Admin gets its own page
// here with a team picker instead of only reaching it through a Head
// Coach's own dashboard.
export default function AdminJerseyOrders() {
  const { t } = useLanguage();
  const [teams, setTeams] = useState([]);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [selectedTeamId, setSelectedTeamId] = useState("");

  const [athletes, setAthletes] = useState([]);
  const [athletesLoading, setAthletesLoading] = useState(false);

  useEffect(() => {
    api
      .get("/teams")
      .then(({ data }) => setTeams(data))
      .catch(() => {
        // Leave the list empty rather than blocking the rest of the page.
      })
      .finally(() => setTeamsLoading(false));
  }, []);

  const selectedTeam = teams.find((tm) => tm._id === selectedTeamId) || null;

  useEffect(() => {
    if (!selectedTeam) {
      setAthletes([]);
      return;
    }
    setAthletesLoading(true);
    api
      .get("/athletes")
      .then(({ data }) => setAthletes(data.filter((a) => a.team === selectedTeam.name)))
      .catch(() => setAthletes([]))
      .finally(() => setAthletesLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTeamId]);

  return (
    <div className="container dash-body">
      <div className="dash-header">
        <h2>{t("adminJerseyOrders.title")}</h2>
        <p>{t("adminJerseyOrders.intro")}</p>
      </div>

      <div className="field" style={{ maxWidth: 320 }}>
        <label>{t("common.team")}</label>
        {teamsLoading ? (
          <p>{t("common.loading")}</p>
        ) : (
          <select value={selectedTeamId} onChange={(e) => setSelectedTeamId(e.target.value)}>
            <option value="">{t("adminJerseyOrders.chooseTeamPlaceholder")}</option>
            {teams.map((tm) => (
              <option key={tm._id} value={tm._id}>
                {tm.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div style={{ marginTop: 20 }}>
        {!selectedTeam ? (
          <p className="help-text">{t("adminJerseyOrders.chooseTeamHelp")}</p>
        ) : athletesLoading ? (
          <p>{t("common.loading")}</p>
        ) : (
          <JerseyOrderManager
            team={selectedTeam.name}
            basePath={`/teams/${selectedTeam._id}/jersey-orders`}
            athletes={athletes}
          />
        )}
      </div>
    </div>
  );
}

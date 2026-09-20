import { useEffect, useState } from "react";
import api from "../api/axios";
import { useLanguage } from "../i18n/LanguageContext";

function formatDate(d) {
  const date = new Date(d);
  if (isNaN(date)) return "";
  return date.toISOString().slice(0, 10);
}

function ageRuleSummary(tour, t) {
  if (!tour.ageLimitYear) return "";
  let s = t("tournamentsPage.bornYearPlus").replace("{year}", tour.ageLimitYear);
  if (tour.overageSlots > 0) {
    s += t("tournamentsPage.overageDetail")
      .replace("{overageYear}", tour.overageLimitYear || "—")
      .replace("{slots}", tour.overageSlots)
      .replace("{used}", tour.overageUsed || 0);
  }
  return s;
}

// Referee account only — a team-less, read-only login (see Admin model
// and tournamentController's listTournaments comment). Shows the same
// tournament/match schedule info as the rest of the app, across every
// team, with no registration, payment, or roster detail at all.
export default function RefereeSchedulePage() {
  const { t } = useLanguage();
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { data } = await api.get("/tournaments");
        setTournaments(data);
      } catch (err) {
        setError(err.response?.data?.message || t("common.failedToLoad"));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div className="container dash-body">
      <div className="dash-header">
        <h2>{t("refereeSchedule.title")}</h2>
        <p>{t("refereeSchedule.subtitle")}</p>
      </div>

      {loading && <p>{t("common.loading")}</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && !error && (
        <div className="table-scroll">
          <table className="athletes">
            <thead>
              <tr>
                <th>{t("common.name")}</th>
                <th>{t("common.team")}</th>
                <th>{t("tournamentsPage.datesHeader")}</th>
                <th>{t("tournamentsPage.rulesHeader")}</th>
                <th>{t("tournamentsPage.spotsHeader")}</th>
              </tr>
            </thead>
            <tbody>
              {tournaments.map((tour) => (
                <tr key={tour._id}>
                  <td data-label={t("common.name")}>
                    {tour.name}
                    {tour.registrationClosed && (
                      <span className="badge rejected" style={{ marginLeft: 6 }}>
                        {t("tournamentsPage.closedBadge")}
                      </span>
                    )}
                  </td>
                  <td data-label={t("common.team")} className="caps-display">{tour.team || "—"}</td>
                  <td data-label={t("tournamentsPage.datesHeader")}>
                    {tour.matchDates?.length ? tour.matchDates.map(formatDate).join(", ") : "—"}
                  </td>
                  <td data-label={t("tournamentsPage.rulesHeader")}>{ageRuleSummary(tour, t) || t("tournamentsPage.noAgeLimit")}</td>
                  <td data-label={t("tournamentsPage.spotsHeader")}>
                    {tour.maxParticipants ? `${tour.registrationCount}/${tour.maxParticipants}` : tour.registrationCount}
                  </td>
                </tr>
              ))}
              {tournaments.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", color: "#777" }}>
                    {t("refereeSchedule.none")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

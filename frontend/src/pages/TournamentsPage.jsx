import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
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

// Individual Player account only — browse open tournaments and register
// yourself (blocked if you owe a fee on the team you'd be playing under).
export default function TournamentsPage() {
  const { t } = useLanguage();
  const { team, athleteId } = useAuth();
  const navigate = useNavigate();
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [registeringId, setRegisteringId] = useState(null);

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

  useEffect(() => {
    load();
  }, []);

  const register = async (tour) => {
    setRegisteringId(tour._id);
    try {
      await api.post(`/tournaments/${tour._id}/register`, { team });
      navigate(`/tournaments/${tour._id}/squad`);
    } catch (err) {
      alert(err.response?.data?.message || t("tournamentsPage.failedToRegister"));
    } finally {
      setRegisteringId(null);
    }
  };

  // Doesn't remove the registration outright — it just requests it. See
  // registrationSchema.pendingRemoval: an Admin/Head Coach has to confirm
  // (or decline) it before the player actually comes off the roster.
  const unregister = async (tour) => {
    if (!confirm(t("tournamentsPage.confirmCancel").replace("{name}", tour.name))) return;
    setRegisteringId(tour._id);
    try {
      await api.delete(`/tournaments/${tour._id}/registrations/${tour.myRegistrationId}`);
      load();
    } catch (err) {
      alert(err.response?.data?.message || t("tournamentsPage.failedToCancel"));
    } finally {
      setRegisteringId(null);
    }
  };

  if (!athleteId) {
    return (
      <div className="container dash-body">
        <p className="error-text">{t("tournamentsPage.onlyForPlayer")}</p>
      </div>
    );
  }

  return (
    <div className="container dash-body">
      <div className="dash-header">
        <h2>{t("tournamentsPage.title")}</h2>
        <p>{t("tournamentsPage.subtitle")}</p>
      </div>

      {loading && <p>{t("common.loading")}</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && !error && (
        <div className="table-scroll">
          <table className="athletes">
            <thead>
              <tr>
                <th>{t("common.name")}</th>
                <th>{t("tournamentsPage.entryFeeHeader")}</th>
                <th>{t("tournamentsPage.datesHeader")}</th>
                <th>{t("tournamentsPage.rulesHeader")}</th>
                <th>{t("tournamentsPage.spotsHeader")}</th>
                <th>{t("common.actions")}</th>
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
                  <td data-label={t("tournamentsPage.entryFeeHeader")}>${tour.entryFee || 0}</td>
                  <td data-label={t("tournamentsPage.datesHeader")}>
                    {tour.matchDates?.length ? tour.matchDates.map(formatDate).join(", ") : "—"}
                  </td>
                  <td data-label={t("tournamentsPage.rulesHeader")}>{ageRuleSummary(tour, t) || t("tournamentsPage.noAgeLimit")}</td>
                  <td data-label={t("tournamentsPage.spotsHeader")}>
                    {tour.maxParticipants ? `${tour.registrationCount}/${tour.maxParticipants}` : tour.registrationCount}
                  </td>
                  <td data-label={t("common.actions")} className="actions-cell">
                    {tour.myRegistrationId ? (
                      <>
                        {tour.myRegistrationPendingRemoval ? (
                          <span className="badge pending" style={{ marginRight: 6 }}>
                            {t("tournamentsPage.withdrawalPendingBadge")}
                          </span>
                        ) : (
                          <span className="badge verified" style={{ marginRight: 6 }}>
                            {t("tournamentsPage.registeredBadge")}
                          </span>
                        )}
                        <button className="link-btn" onClick={() => navigate(`/tournaments/${tour._id}/squad`)}>
                          {t("tournamentsPage.viewSquad")}
                        </button>
                        {!tour.registrationClosed && !tour.myRegistrationPendingRemoval && (
                          <button className="action-btn danger" disabled={registeringId === tour._id} onClick={() => unregister(tour)}>
                            {t("common.cancel")}
                          </button>
                        )}
                      </>
                    ) : tour.registrationClosed ? (
                      <span className="help-text">{t("tournamentsPage.closedHelp")}</span>
                    ) : (
                      <button className="action-btn positive" disabled={registeringId === tour._id} onClick={() => register(tour)}>
                        {registeringId === tour._id ? t("tournamentsPage.registering") : t("tournamentsPage.registerButton")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {tournaments.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", color: "#777" }}>
                    {t("tournamentsPage.noneOpen")}
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

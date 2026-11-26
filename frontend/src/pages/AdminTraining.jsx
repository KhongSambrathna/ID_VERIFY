import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../api/axios";
import TrainingFeeManager from "../components/TrainingFeeManager";
import AttendanceManager from "../components/AttendanceManager";
import { formatKHR } from "../utils/currency";
import { useLanguage } from "../i18n/LanguageContext";

// 🏃 Admin → Training: manage training (attendance + training fees) for
// EVERY team from one page, no coach mode needed. /admin/training?team=X&tab=fees
export default function AdminTraining() {
  const { t } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const [team, setTeam] = useState(searchParams.get("team") || "");
  const [tab, setTab] = useState(searchParams.get("tab") === "attendance" ? "attendance" : "fees");
  const [teams, setTeams] = useState([]);
  const [athletes, setAthletes] = useState([]);
  const [error, setError] = useState("");
  const [toEnable, setToEnable] = useState("");
  const [enabling, setEnabling] = useState(false);

  const loadTeams = () =>
    api
      .get("/training-fees/teams")
      .then(({ data }) => {
        setTeams(data);
        // only teams with training switched on can be opened here
        const on = data.filter((x) => x.enabled).map((x) => x.name);
        setTeam((cur) => (cur && on.includes(cur) ? cur : on[0] || ""));
      })
      .catch((err) => setError(err.response?.data?.message || t("trainingFee.failed")));

  // ➕ switch training on for another team, then open it
  const enableTeam = async () => {
    if (!toEnable) return;
    setEnabling(true);
    try {
      await api.put("/training-fees/settings", { team: toEnable, enabled: true });
      const name = toEnable;
      setToEnable("");
      await loadTeams();
      setTeam(name);
      setTab("fees");
    } catch (err) {
      alert(err.response?.data?.message || t("trainingFee.failed"));
    } finally {
      setEnabling(false);
    }
  };

  useEffect(() => {
    loadTeams();
  }, []);

  // keep ?team=&tab= in the address bar so a refresh / shared link lands here
  useEffect(() => {
    const p = {};
    if (team) p.team = team;
    if (tab !== "fees") p.tab = tab;
    setSearchParams(p, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team, tab]);

  // roster for the attendance sheet
  useEffect(() => {
    if (!team) return setAthletes([]);
    api
      .get("/athletes", { params: { team } })
      .then(({ data }) => {
        setAthletes(data.filter((a) => !a.team || a.team === team));
        setError("");
      })
      .catch((err) => setError(err.response?.data?.message || t("trainingFee.failed")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team]);

  const teamsOn = teams.filter((x) => x.enabled);
  const teamsOff = teams.filter((x) => !x.enabled);

  return (
    <div className="container dash-body">
      <div className="dash-header">
        <h2>{t("trainingFee.adminTitle")}</h2>
        <p>{t("trainingFee.adminDesc")}</p>
      </div>

      {/* ➕ Admin switches training on for a team */}
      <div className="card" style={{ padding: 14, marginBottom: 16 }}>
        <b>{t("trainingFee.enableForTeam")}</b>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8, alignItems: "center" }}>
          <select value={toEnable} onChange={(e) => setToEnable(e.target.value)} style={{ minWidth: 220 }}>
            <option value="">{teamsOff.length ? t("trainingFee.pickTeam") : t("trainingFee.allTeamsOn")}</option>
            {teamsOff.map((x) => (
              <option key={x.name} value={x.name}>
                {x.nameKm ? `${x.nameKm} (${x.name})` : x.name}
              </option>
            ))}
          </select>
          <button className="btn btn-primary" disabled={!toEnable || enabling} onClick={enableTeam}>
            {t("trainingFee.enable")}
          </button>
        </div>
      </div>

      {/* only teams with training switched on */}
      <div style={{ marginBottom: 16 }}>
        <b>{t("trainingFee.teamsOn")}</b>
        {teamsOn.length === 0 ? (
          <p className="help-text">{t("trainingFee.noTeamsOn")}</p>
        ) : (
          <div className="tabs" style={{ marginTop: 8, flexWrap: "wrap" }}>
            {teamsOn.map((x) => (
              <button
                key={x.name}
                type="button"
                className={`tab-btn ${team === x.name ? "active" : ""}`}
                onClick={() => setTeam(x.name)}
                title={`${formatKHR(x.pricePerSession)} / ${formatKHR(x.monthlyFee)}`}
              >
                ✅ {x.nameKm || x.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {team && (
        <>
          <div className="tabs">
            <button className={`tab-btn ${tab === "fees" ? "active" : ""}`} onClick={() => setTab("fees")}>
              {t("trainingFee.tabFees")}
            </button>
            <button className={`tab-btn ${tab === "attendance" ? "active" : ""}`} onClick={() => setTab("attendance")}>
              {t("attendance.title")}
            </button>
          </div>
          {error && <p className="error-text">{error}</p>}
          <div className="tab-content">
            {tab === "fees" && <TrainingFeeManager key={team} team={team} onSettingsChange={loadTeams} />}
            {tab === "attendance" && <AttendanceManager key={team} team={team} athletes={athletes} />}
          </div>
        </>
      )}
    </div>
  );
}

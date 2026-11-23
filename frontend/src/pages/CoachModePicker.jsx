import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../i18n/LanguageContext";

// Admin → "Work as team captain": pick a team, and the whole app switches
// to that team's Head Coach view (dashboard, squad lists, starting XI,
// tournament registration, attendance, jersey orders…). A banner at the top
// lets the Admin switch team or go back to Admin at any time.
export default function CoachModePicker() {
  const { t } = useLanguage();
  const { isRealAdmin, coachTeam, enterCoachMode, exitCoachMode } = useAuth();
  const navigate = useNavigate();
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isRealAdmin) return;
    api
      .get("/teams", { noCoachMode: true })
      .then(({ data }) => setTeams(data))
      .catch((err) => setError(err.response?.data?.message || t("coachMode.failedToLoad")))
      .finally(() => setLoading(false));
  }, [isRealAdmin]);

  if (!isRealAdmin) return <Navigate to="/" replace />;

  const choose = (name) => {
    enterCoachMode(name);
    navigate("/coach");
  };
  const needle = q.trim().toLowerCase();
  const list = needle ? teams.filter((tm) => tm.name.toLowerCase().includes(needle)) : teams;

  return (
    <div className="container dash-body">
      <div className="dash-header">
        <h2>🧢 {t("coachMode.title")}</h2>
        <p>{t("coachMode.intro")}</p>
      </div>
      {coachTeam && (
        <p>
          {t("coachMode.current")}: <b>{coachTeam}</b>{" "}
          <button className="link-btn" onClick={() => { exitCoachMode(); navigate("/admin"); }}>
            {t("coachMode.backToAdmin")}
          </button>
        </p>
      )}
      <div className="filter-row">
        <input placeholder={`🔍 ${t("coachMode.search")}`} value={q} onChange={(e) => setQ(e.target.value)} style={{ width: "100%", maxWidth: 320 }} />
      </div>
      {loading && <p>{t("common.loading")}</p>}
      {error && <p className="error-text">{error}</p>}
      <div className="coach-team-grid">
        {list.map((tm) => (
          <button key={tm._id} type="button" className={`card coach-team-card ${tm.name === coachTeam ? "current" : ""}`} onClick={() => choose(tm.name)}>
            {tm.logoUrl ? <img src={tm.logoUrl} alt="" /> : <span className="coach-team-noimg">⚽</span>}
            <span className="coach-team-name">{tm.name}</span>
            <span className="mini-empty">{t("coachMode.players").replace("{n}", tm.playerCount ?? 0)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

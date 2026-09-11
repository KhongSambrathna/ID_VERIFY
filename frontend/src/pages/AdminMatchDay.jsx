import { useEffect, useState } from "react";
import api from "../api/axios";
import TeamSelect from "../components/TeamSelect";
import SquadListManager from "../components/SquadListManager";
import FormationManager from "../components/FormationManager";
import StartingXIManager from "../components/StartingXIManager";

export default function AdminMatchDay() {
  const [team, setTeam] = useState("");
  const [athletes, setAthletes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("lineups");

  useEffect(() => {
    if (!team) {
      setAthletes([]);
      return;
    }
    setLoading(true);
    api
      .get("/athletes", { params: { team } })
      .then(({ data }) => {
        setAthletes(data);
        setError("");
      })
      .catch((err) => setError(err.response?.data?.message || "Failed to load team roster"))
      .finally(() => setLoading(false));
  }, [team]);

  return (
    <div className="container dash-body">
      <div className="dash-header">
        <h2>Match day</h2>
        <p>Build a match squad list (15–22 people, exportable as PDF/JPG), lay out a pitch formation, or announce a Starting XI — for any team.</p>
      </div>

      <div style={{ maxWidth: 360, marginBottom: 20 }}>
        <TeamSelect value={team} onChange={setTeam} label="Team" />
      </div>

      {!team && <p className="help-text">Choose a team above to get started.</p>}

      {team && (
        <>
          <div className="tabs">
            <button
              className={`tab-btn ${activeTab === "lineups" ? "active" : ""}`}
              onClick={() => setActiveTab("lineups")}
            >
              Squad list
            </button>
            <button
              className={`tab-btn ${activeTab === "formations" ? "active" : ""}`}
              onClick={() => setActiveTab("formations")}
            >
              Formation
            </button>
            <button
              className={`tab-btn ${activeTab === "startingxi" ? "active" : ""}`}
              onClick={() => setActiveTab("startingxi")}
            >
              Starting XI
            </button>
          </div>

          {loading && <p>Loading roster…</p>}
          {error && <p className="error-text">{error}</p>}

          {!loading && !error && (
            <div className="tab-content">
              {activeTab === "lineups" && <SquadListManager team={team} athletes={athletes} />}
              {activeTab === "formations" && <FormationManager team={team} athletes={athletes} />}
              {activeTab === "startingxi" && <StartingXIManager team={team} />}
            </div>
          )}
        </>
      )}
    </div>
  );
}

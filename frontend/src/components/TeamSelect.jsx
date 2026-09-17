import { useEffect, useState } from "react";
import api from "../api/axios";
import { useLanguage } from "../i18n/LanguageContext";

const ADD_NEW = "__add_new_team__";

// A team dropdown backed by the database, with an inline "add new team"
// flow — so team names are always picked consistently instead of typed
// freehand (which is how records end up split across "U18", "u18 boys",
// "U-18 Boys", etc.).
export default function TeamSelect({ value, onChange, required, label }) {
  const { t } = useLanguage();
  const displayLabel = label ?? t("common.team");
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  const loadTeams = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/teams");
      setTeams(data);
    } catch (err) {
      setError(err.response?.data?.message || t("teamSelect.failedToLoadTeams"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTeams();
  }, []);

  const handleSelectChange = (e) => {
    if (e.target.value === ADD_NEW) {
      setShowAddForm(true);
      setNewTeamName("");
      return;
    }
    onChange(e.target.value);
  };

  const handleAddTeam = async () => {
    const name = newTeamName.trim();
    if (!name) return;
    setAdding(true);
    setError("");
    try {
      const { data: team } = await api.post("/teams", { name });
      setTeams((prev) => [...prev, team].sort((a, b) => a.name.localeCompare(b.name)));
      onChange(team.name);
      setShowAddForm(false);
      setNewTeamName("");
    } catch (err) {
      setError(err.response?.data?.message || t("teamSelect.failedToAddTeam"));
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="field">
      <label>{displayLabel}</label>
      {!showAddForm ? (
        <select value={value || ""} onChange={handleSelectChange} required={required} disabled={loading}>
          <option value="" disabled>
            {loading ? t("teamSelect.loadingTeams") : t("teamSelect.selectTeam")}
          </option>
          {teams.map((team) => (
            <option key={team._id} value={team.name}>
              {team.name}
            </option>
          ))}
          <option value={ADD_NEW}>{t("teamSelect.addNewTeamOption")}</option>
        </select>
      ) : (
        <div className="inline-add-row">
          <input
            autoFocus
            placeholder={t("teamSelect.newTeamNamePlaceholder")}
            value={newTeamName}
            onChange={(e) => setNewTeamName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddTeam();
              }
            }}
          />
          <button type="button" className="btn btn-primary" onClick={handleAddTeam} disabled={adding}>
            {adding ? t("teamSelect.adding") : t("common.add")}
          </button>
          <button
            type="button"
            className="btn btn-outline"
            style={{ color: "var(--navy)", borderColor: "var(--navy)" }}
            onClick={() => setShowAddForm(false)}
          >
            {t("common.cancel")}
          </button>
        </div>
      )}
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}

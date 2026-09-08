import { useEffect, useState } from "react";
import api from "../api/axios";

const ADD_NEW = "__add_new_team__";

// A team dropdown backed by the database, with an inline "add new team"
// flow — so team names are always picked consistently instead of typed
// freehand (which is how records end up split across "U18", "u18 boys",
// "U-18 Boys", etc.).
export default function TeamSelect({ value, onChange, required, label = "Team" }) {
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
      setError(err.response?.data?.message || "Failed to load teams");
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
      setError(err.response?.data?.message || "Failed to add team");
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="field">
      <label>{label}</label>
      {!showAddForm ? (
        <select value={value || ""} onChange={handleSelectChange} required={required} disabled={loading}>
          <option value="" disabled>
            {loading ? "Loading teams…" : "Select a team…"}
          </option>
          {teams.map((t) => (
            <option key={t._id} value={t.name}>
              {t.name}
            </option>
          ))}
          <option value={ADD_NEW}>+ Add new team…</option>
        </select>
      ) : (
        <div className="inline-add-row">
          <input
            autoFocus
            placeholder="New team name"
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
            {adding ? "Adding…" : "Add"}
          </button>
          <button
            type="button"
            className="btn btn-outline"
            style={{ color: "var(--navy)", borderColor: "var(--navy)" }}
            onClick={() => setShowAddForm(false)}
          >
            Cancel
          </button>
        </div>
      )}
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}

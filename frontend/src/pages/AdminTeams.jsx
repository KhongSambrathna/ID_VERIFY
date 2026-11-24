import { useEffect, useState } from "react";
import api from "../api/axios";
import { resolveFileUrl } from "../utils/fileUrl";
import DeleteForeverButton from "../components/DeleteForeverButton";
import { useLanguage } from "../i18n/LanguageContext";
import CoachPermsCard from "../components/CoachPermsCard";

// Admin only — every team in the system: add a team, change its logo, and
// delete a team permanently (with everything that belongs to it — see
// backend utils/purge.js). Head Coaches never see this page; they only
// manage their own team's players.
export default function AdminTeams() {
  const { t } = useLanguage();
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState("");
  const [uploadingId, setUploadingId] = useState(null);
  const [coachAccounts, setCoachAccounts] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/teams", { noCoachMode: true });
      setTeams(data);
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || t("common.failedToLoad"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api
      .get("/auth/users", { noCoachMode: true })
      .then(({ data }) => setCoachAccounts((data || []).filter((u) => u.role === "HEAD_COACH")))
      .catch(() => {});
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addTeam = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setAdding(true);
    setMessage("");
    try {
      await api.post("/teams", { name: newName.trim() });
      setNewName("");
      await load();
    } catch (err) {
      setMessage(err.response?.data?.message || t("adminTeams.failedToAdd"));
    } finally {
      setAdding(false);
    }
  };

  const uploadLogo = async (team, file) => {
    if (!file) return;
    setUploadingId(team._id);
    try {
      const data = new FormData();
      data.append("logo", file);
      await api.put(`/teams/${team._id}/logo`, data, { headers: { "Content-Type": "multipart/form-data" } });
      await load();
    } catch (err) {
      alert(err.response?.data?.message || t("adminTeams.failedToUpload"));
    } finally {
      setUploadingId(null);
    }
  };

  return (
    <div className="container dash-body">
      <div className="dash-header">
        <h2>{t("adminTeams.title")}</h2>
        <p>{t("adminTeams.subtitle")}</p>
      </div>

      <form className="card" style={{ maxWidth: 520, marginBottom: 20, display: "flex", gap: 10, alignItems: "flex-end" }} onSubmit={addTeam}>
        <div className="field" style={{ flex: 1, marginBottom: 0 }}>
          <label>{t("adminTeams.newTeamLabel")}</label>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} />
        </div>
        <button className="btn btn-primary" disabled={adding || !newName.trim()}>
          {adding ? t("adminTeams.adding") : t("adminTeams.addButton")}
        </button>
      </form>
      {message && <div className="error-text">{message}</div>}

      {loading ? (
        <p>{t("common.loading")}</p>
      ) : error ? (
        <div className="error-text">{error}</div>
      ) : teams.length === 0 ? (
        <p>{t("adminTeams.none")}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {teams.map((team) => (
            <div key={team._id} className="card">
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                {team.logoUrl ? (
                  <img src={resolveFileUrl(team.logoUrl)} alt={team.name} style={{ width: 48, height: 48, objectFit: "contain" }} />
                ) : (
                  <div style={{ width: 48, height: 48, borderRadius: 8, background: "#eee" }} />
                )}
                <div style={{ flex: 1 }}>
                  <b className="caps-display">{team.name}</b>
                  <div className="help-text" style={{ margin: 0 }}>
                    {t("adminTeams.playerCount").replace("{count}", team.playerCount || 0)}
                  </div>
                </div>
                <label className="btn btn-outline" style={{ cursor: "pointer" }}>
                  {uploadingId === team._id ? t("adminTeams.uploading") : t("adminTeams.logoButton")}
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={(e) => uploadLogo(team, e.target.files?.[0])}
                  />
                </label>
              </div>
              <CoachPermsCard team={team} coaches={coachAccounts.filter((c) => c.team === team.name)} />
              <div style={{ marginTop: 10 }}>
                <DeleteForeverButton
                  kind="team"
                  label={t("adminTeams.deleteButton")}
                  previewUrl={`/teams/${team._id}/delete-preview`}
                  deleteUrl={`/teams/${team._id}`}
                  confirmName={team.name}
                  onDeleted={load}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { resolveFileUrl } from "../utils/fileUrl";
import SquadListManager from "../components/SquadListManager";
import FormationManager from "../components/FormationManager";

function formatDob(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d)) return null;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}

export default function CoachDashboard() {
  const { team } = useAuth();
  const [athletes, setAthletes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("athletes");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/coach/my-team");
      setAthletes(data);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="container"><p>Loading...</p></div>;
  if (error) return <div className="container"><p className="error-text">{error}</p></div>;

  return (
    <div className="container dash-body">
      <div className="dash-header">
        <h2>Coach Dashboard</h2>
        <p>Pull athletes already registered on your team into a match-day squad list or a pitch formation. Adding new athlete records is admin-only.</p>
      </div>

      <div className="tabs">
        <button
          className={`tab-btn ${activeTab === "athletes" ? "active" : ""}`}
          onClick={() => setActiveTab("athletes")}
        >
          My Team ({athletes.length})
        </button>
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
      </div>

      {/* ATHLETES TAB */}
      {activeTab === "athletes" && (
        <div className="tab-content">
          <h3>Available Athletes</h3>
          {athletes.length === 0 ? (
            <p>No athletes in your team yet.</p>
          ) : (
            <div className="athletes-grid">
              {athletes.map((athlete) => (
                <div key={athlete._id} className="athlete-card">
                  <img
                    src={
                      athlete.photoUrl
                        ? resolveFileUrl(athlete.photoUrl)
                        : "https://placehold.co/150x150?text=Photo"
                    }
                    alt={athlete.fullName}
                    className="athlete-photo"
                  />
                  <h4>{athlete.fullName}</h4>
                  {athlete.khmerName && <p className="khmer-name">{athlete.khmerName}</p>}
                  <p className="role">{athlete.role || "PLAYER"}</p>
                  <p className="verify-id">ID: {athlete.verifyId}</p>
                  <p className="athlete-meta">
                    {formatDob(athlete.dateOfBirth) || "DOB —"} · {athlete.gender || "—"}
                  </p>
                  <div className="athlete-status">
                    <span className={`badge ${athlete.isAvailable ? "verified" : "rejected"}`}>
                      {athlete.isAvailable ? "Available" : "Not available"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SQUAD LIST TAB */}
      {activeTab === "lineups" && (
        <div className="tab-content">
          <SquadListManager team={team} athletes={athletes} />
        </div>
      )}

      {/* FORMATION TAB */}
      {activeTab === "formations" && (
        <div className="tab-content">
          <FormationManager team={team} athletes={athletes} />
        </div>
      )}
    </div>
  );
}

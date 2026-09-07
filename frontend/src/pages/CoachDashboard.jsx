import { useEffect, useState } from "react";
import api from "../api/axios";
import { resolveFileUrl } from "../utils/fileUrl";

export default function CoachDashboard() {
  const [athletes, setAthletes] = useState([]);
  const [lineups, setLineups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("athletes");
  const [selectedAthletes, setSelectedAthletes] = useState([]);
  const [newLineupName, setNewLineupName] = useState("");
  const [showNewLineupForm, setShowNewLineupForm] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [athletesRes, lineupsRes] = await Promise.all([
        api.get("/coach/my-team"),
        api.get("/coach/lineups"),
      ]);
      setAthletes(athletesRes.data);
      setLineups(lineupsRes.data);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const toggleAthlete = (athleteId) => {
    setSelectedAthletes((prev) =>
      prev.includes(athleteId)
        ? prev.filter((id) => id !== athleteId)
        : [...prev, athleteId]
    );
  };

  const createLineup = async () => {
    if (!newLineupName.trim()) {
      alert("Please enter a lineup name");
      return;
    }

    try {
      await api.post("/coach/lineup", {
        name: newLineupName,
        athletes: selectedAthletes.map((id) => ({ athleteId: id })),
      });

      setNewLineupName("");
      setSelectedAthletes([]);
      setShowNewLineupForm(false);
      loadData();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to create lineup");
    }
  };

  const deleteLineup = async (id) => {
    if (!confirm("Delete this lineup?")) return;

    try {
      await api.delete(`/coach/lineup/${id}`);
      loadData();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to delete lineup");
    }
  };

  if (loading) return <div className="container"><p>Loading...</p></div>;
  if (error) return <div className="container"><p className="error-text">{error}</p></div>;

  return (
    <div className="container dash-body">
      <div className="dash-header">
        <h2>Coach Dashboard</h2>
        <p>Manage your team and create lineups</p>
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
          Lineups ({lineups.length})
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

      {/* LINEUPS TAB */}
      {activeTab === "lineups" && (
        <div className="tab-content">
          <div className="lineup-header">
            <h3>Lineups</h3>
            {!showNewLineupForm && (
              <button
                className="btn btn-primary"
                onClick={() => setShowNewLineupForm(true)}
              >
                + Create Lineup
              </button>
            )}
          </div>

          {/* CREATE LINEUP FORM */}
          {showNewLineupForm && (
            <div className="lineup-form card">
              <h4>Create New Lineup</h4>

              <div className="field">
                <label>Lineup Name</label>
                <input
                  type="text"
                  placeholder="e.g., Starting 11, Substitutes"
                  value={newLineupName}
                  onChange={(e) => setNewLineupName(e.target.value)}
                />
              </div>

              <div className="selected-count">
                <p>Selected athletes: {selectedAthletes.length}</p>
              </div>

              <div className="athletes-select">
                {athletes.map((athlete) => (
                  <label key={athlete._id} className="athlete-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedAthletes.includes(athlete._id)}
                      onChange={() => toggleAthlete(athlete._id)}
                    />
                    <span className="checkbox-label">
                      <img
                        src={
                          athlete.photoUrl
                            ? resolveFileUrl(athlete.photoUrl)
                            : "https://placehold.co/50x50?text=Photo"
                        }
                        alt={athlete.fullName}
                        className="small-photo"
                      />
                      {athlete.fullName} ({athlete.role || "PLAYER"})
                    </span>
                  </label>
                ))}
              </div>

              <div className="form-actions">
                <button className="btn btn-primary" onClick={createLineup}>
                  Create Lineup
                </button>
                <button
                  className="btn btn-outline"
                  onClick={() => {
                    setShowNewLineupForm(false);
                    setSelectedAthletes([]);
                    setNewLineupName("");
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* LINEUPS LIST */}
          {lineups.length === 0 ? (
            <p>No lineups yet. Create one to get started.</p>
          ) : (
            <div className="lineups-list">
              {lineups.map((lineup) => (
                <div key={lineup._id} className="lineup-card card">
                  <div className="lineup-header-card">
                    <h4>{lineup.name}</h4>
                    <button
                      className="btn btn-danger"
                      onClick={() => deleteLineup(lineup._id)}
                    >
                      Delete
                    </button>
                  </div>

                  <p className="lineup-count">
                    {lineup.athletes.length} athlete{lineup.athletes.length !== 1 ? "s" : ""}
                  </p>

                  <div className="lineup-athletes">
                    {lineup.athletes.map((item, idx) => (
                      <div key={idx} className="lineup-athlete">
                        <span className="number">{idx + 1}</span>
                        <img
                          src={
                            item.athleteId?.photoUrl
                              ? resolveFileUrl(item.athleteId.photoUrl)
                              : "https://placehold.co/40x40?text=Photo"
                          }
                          alt={item.athleteId?.fullName || "Athlete"}
                          className="tiny-photo"
                        />
                        <div className="athlete-info">
                          <p className="name">{item.athleteId?.fullName || "Unknown"}</p>
                          <p className="role">
                            {item.athleteId?.role || "PLAYER"}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {lineup.notes && (
                    <p className="lineup-notes">
                      <strong>Notes:</strong> {lineup.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

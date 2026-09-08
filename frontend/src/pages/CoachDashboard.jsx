import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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

  const removeAthlete = async (id) => {
    if (!confirm("Delete this athlete record?")) return;
    try {
      await api.delete(`/athletes/${id}`);
      loadData();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to delete athlete");
    }
  };

  if (loading) return <div className="container"><p>Loading...</p></div>;
  if (error) return <div className="container"><p className="error-text">{error}</p></div>;

  const pendingCount = athletes.filter((a) => a.approvalStatus === "pending").length;

  return (
    <div className="container dash-body">
      <div className="dash-header">
        <h2>Coach Dashboard</h2>
        <p>
          Add, edit, and manage athletes on your own team. New records and edits go out as{" "}
          <strong>Pending</strong> until an Admin approves them — they stay hidden from public search and the
          QR verify page until then.
        </p>
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
          <div className="dash-header" style={{ marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>
              My Team Athletes {pendingCount > 0 && `(${pendingCount} pending approval)`}
            </h3>
            <Link to="/admin/new" className="btn btn-primary">
              + Add athlete
            </Link>
          </div>
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
                    {athlete.approvalStatus === "pending" && (
                      <span className="badge rejected">Pending approval</span>
                    )}
                  </div>
                  <div className="athlete-status" style={{ marginTop: 8 }}>
                    <Link className="link-btn" to={`/admin/athlete/${athlete._id}/edit`}>
                      Edit
                    </Link>
                    <button className="link-btn" onClick={() => removeAthlete(athlete._id)}>
                      Delete
                    </button>
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

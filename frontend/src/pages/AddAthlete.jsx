import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";

export default function AddAthlete() {
  const [form, setForm] = useState({
    fullName: "",
    khmerName: "",
    dateOfBirth: "",
    gender: "male",
    team: "",
    role: "PLAYER",
    address: "",
    isAvailable: "true",
  });
  const [photo, setPhoto] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = new FormData();
      Object.entries(form).forEach(([k, v]) => data.append(k, v));
      if (photo) data.append("photo", photo);
      documents.forEach((doc) => data.append("documents", doc));

      const { data: athlete } = await api.post("/athletes", data, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      navigate(`/admin/athlete/${athlete._id}`);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save athlete");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container" style={{ paddingBottom: 60 }}>
      <div className="dash-header">
        <h2>Add athlete</h2>
      </div>
      <form className="card" style={{ maxWidth: 640 }} onSubmit={handleSubmit}>
        <div className="field">
          <label>Full name</label>
          <input value={form.fullName} onChange={update("fullName")} required />
        </div>
        <div className="field">
          <label>Khmer name</label>
          <input value={form.khmerName} onChange={update("khmerName")} />
        </div>
        <div className="field">
          <label>Date of birth</label>
          <input type="date" value={form.dateOfBirth} onChange={update("dateOfBirth")} />
        </div>
        <div className="field">
          <label>Gender</label>
          <select value={form.gender} onChange={update("gender")}>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="field">
          <label>Team</label>
          <input value={form.team} onChange={update("team")} />
        </div>
        <div className="field">
          <label>Role</label>
          <select value={form.role} onChange={update("role")}>
            <option value="PLAYER">Player</option>
            <option value="ASSISTAN COACH">Assistant Coach</option>
            <option value="HEAD COACH">Head Coach</option>
            <option value="TECHNICAL">Technical</option>
            <option value="MEDIC">Medic</option>
          </select>
        </div>
        <div className="field">
          <label>Address</label>
          <input value={form.address} onChange={update("address")} />
        </div>
        <div className="field">
          <label>Availability</label>
          <select value={form.isAvailable} onChange={update("isAvailable")}>
            <option value="true">Available</option>
            <option value="false">Not available</option>
          </select>
        </div>
        <div className="field">
          <label>Photo</label>
          <input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files[0])} />
        </div>
        <div className="field">
          <label>Supporting documents (ID copy, birth certificate, etc.)</label>
          <input
            type="file"
            multiple
            accept="image/*,application/pdf"
            onChange={(e) => setDocuments(Array.from(e.target.files))}
          />
        </div>

        {error && <div className="error-text">{error}</div>}

        <button className="btn btn-primary" disabled={loading}>
          {loading ? "Saving…" : "Save & generate ID"}
        </button>
      </form>
    </div>
  );
}

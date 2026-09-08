import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import api from "../api/axios";
import TeamSelect from "../components/TeamSelect";
import { resolveFileUrl } from "../utils/fileUrl";

function toDateInputValue(dob) {
  if (!dob) return "";
  const d = new Date(dob);
  if (isNaN(d)) return "";
  return d.toISOString().slice(0, 10);
}

export default function EditAthlete() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [form, setForm] = useState(null); // null until the record loads
  const [currentPhotoUrl, setCurrentPhotoUrl] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get(`/athletes/${id}`)
      .then(({ data }) => {
        setForm({
          fullName: data.fullName || "",
          khmerName: data.khmerName || "",
          dateOfBirth: toDateInputValue(data.dateOfBirth),
          gender: data.gender || "male",
          team: data.team || "",
          role: data.role || "PLAYER",
          address: data.address || "",
          isAvailable: data.isAvailable ? "true" : "false",
        });
        setCurrentPhotoUrl(data.photoUrl || null);
      })
      .catch((err) => setError(err.response?.data?.message || "Failed to load athlete"))
      .finally(() => setLoading(false));
  }, [id]);

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const data = new FormData();
      Object.entries(form).forEach(([k, v]) => data.append(k, v));
      if (photo) data.append("photo", photo);

      await api.put(`/athletes/${id}`, data, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      navigate(`/admin/athlete/${id}`);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="container" style={{ paddingBottom: 60 }}>
        <p>Loading…</p>
      </div>
    );
  }

  if (error && !form) {
    return (
      <div className="container" style={{ paddingBottom: 60 }}>
        <p className="error-text">{error}</p>
      </div>
    );
  }

  return (
    <div className="container" style={{ paddingBottom: 60 }}>
      <div className="dash-header">
        <h2>Edit athlete</h2>
        <Link to={`/admin/athlete/${id}`} className="link-btn">
          ← Back to record
        </Link>
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
        <TeamSelect value={form.team} onChange={(team) => setForm({ ...form, team })} required />
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
          {currentPhotoUrl && !photo && (
            <img src={resolveFileUrl(currentPhotoUrl)} alt="Current" className="edit-current-photo" />
          )}
          <input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files[0])} />
          <p className="help-text">Leave empty to keep the current photo.</p>
        </div>

        {error && <div className="error-text">{error}</div>}

        <button className="btn btn-primary" disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </button>
      </form>
    </div>
  );
}

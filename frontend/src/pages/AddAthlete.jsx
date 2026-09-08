import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import TeamSelect from "../components/TeamSelect";
import { resolveFileUrl } from "../utils/fileUrl";
import { useAuth } from "../context/AuthContext";

export default function AddAthlete() {
  const { isHeadCoach, team: coachTeam } = useAuth();
  const [form, setForm] = useState({
    fullName: "",
    khmerName: "",
    dateOfBirth: "",
    gender: "male",
    team: isHeadCoach ? coachTeam || "" : "",
    role: "PLAYER",
    address: "",
    isAvailable: "true",
  });
  const [photo, setPhoto] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Warn (don't block) when a player with the same name is already
  // registered — the same name could still belong to two different people,
  // so this just surfaces the possible duplicate instead of preventing it.
  const [duplicates, setDuplicates] = useState([]);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  useEffect(() => {
    const fullName = form.fullName.trim();
    const khmerName = form.khmerName.trim();
    if (!fullName && !khmerName) {
      setDuplicates([]);
      return;
    }

    setCheckingDuplicate(true);
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get("/athletes/check-duplicate", {
          params: { fullName, khmerName },
        });
        setDuplicates(data.duplicates || []);
      } catch {
        // best-effort — a failed check shouldn't block registration
      } finally {
        setCheckingDuplicate(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [form.fullName, form.khmerName]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (duplicates.length > 0) {
      const names = duplicates.map((d) => `${d.fullName}${d.team ? ` (${d.team})` : ""}`).join(", ");
      const proceed = confirm(
        `A player with this name is already registered: ${names}.\n\nRegister this as a new, separate player anyway?`
      );
      if (!proceed) return;
    }

    setLoading(true);
    try {
      const data = new FormData();
      Object.entries(form).forEach(([k, v]) => data.append(k, v));
      if (photo) data.append("photo", photo);
      documents.forEach((doc) => data.append("documents", doc));

      const { data: athlete } = await api.post("/athletes", data, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      navigate(isHeadCoach ? "/coach" : `/admin/athlete/${athlete._id}`);
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
      {isHeadCoach && (
        <p className="help-text" style={{ maxWidth: 640 }}>
          This player will be added as <strong>Pending</strong> — an Admin needs to approve the record
          before it shows up in public search or the QR verify page.
        </p>
      )}
      <form className="card" style={{ maxWidth: 640 }} onSubmit={handleSubmit}>
        <div className="field">
          <label>Full name</label>
          <input value={form.fullName} onChange={update("fullName")} required />
        </div>
        <div className="field">
          <label>Khmer name</label>
          <input value={form.khmerName} onChange={update("khmerName")} />
        </div>

        {checkingDuplicate && <p className="help-text">Checking for existing players with this name…</p>}
        {!checkingDuplicate && duplicates.length > 0 && (
          <div className="duplicate-warning">
            <p className="duplicate-warning-title">⚠ Possible duplicate — already registered:</p>
            {duplicates.map((d) => (
              <div key={d._id} className="duplicate-warning-row">
                <img
                  src={d.photoUrl ? resolveFileUrl(d.photoUrl) : "https://placehold.co/40x40?text=?"}
                  alt={d.fullName}
                />
                <div>
                  <p className="name">
                    {d.fullName}
                    {d.khmerName ? ` · ${d.khmerName}` : ""}
                  </p>
                  <p className="meta">
                    {d.team || "—"} {d.role ? `· ${d.role}` : ""} · ID {d.verifyId}
                  </p>
                </div>
              </div>
            ))}
            <p className="help-text">You can still save — this is just a heads-up, not a block.</p>
          </div>
        )}

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
        {isHeadCoach ? (
          <div className="field">
            <label>Team</label>
            <input value={form.team} disabled />
          </div>
        ) : (
          <TeamSelect value={form.team} onChange={(team) => setForm({ ...form, team })} required />
        )}
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

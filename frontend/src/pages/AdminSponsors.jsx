import { useEffect, useState } from "react";
import api from "../api/axios";

// Admin page for managing the logos shown in the public "Trusted by" strip
// (Landing + About pages) — add, rename/replace, delete. No code changes
// needed to add a new club logo anymore.
export default function AdminSponsors() {
  const [sponsors, setSponsors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [logo, setLogo] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editLogo, setEditLogo] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/sponsors");
      setSponsors(data);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load sponsors");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setFormError("");
    if (!logo) {
      setFormError("Please choose a logo image");
      return;
    }
    setSaving(true);
    try {
      const data = new FormData();
      data.append("name", name.trim());
      data.append("logo", logo);
      await api.post("/sponsors", data, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setName("");
      setLogo(null);
      document.getElementById("sponsor-logo-input") && (document.getElementById("sponsor-logo-input").value = "");
      load();
    } catch (err) {
      setFormError(err.response?.data?.message || "Failed to add sponsor");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (s) => {
    setEditingId(s._id);
    setEditName(s.name);
    setEditLogo(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditLogo(null);
  };

  const saveEdit = async (id) => {
    setSavingEdit(true);
    try {
      const data = new FormData();
      data.append("name", editName.trim());
      if (editLogo) data.append("logo", editLogo);
      await api.put(`/sponsors/${id}`, data, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      cancelEdit();
      load();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to save changes");
    } finally {
      setSavingEdit(false);
    }
  };

  const remove = async (id) => {
    if (!confirm("Remove this logo from the Trusted by strip?")) return;
    try {
      await api.delete(`/sponsors/${id}`);
      load();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to delete sponsor");
    }
  };

  const move = async (index, direction) => {
    const target = sponsors[index + direction];
    const current = sponsors[index];
    if (!target || !current) return;
    try {
      await Promise.all([
        api.put(`/sponsors/${current._id}`, { order: target.order }),
        api.put(`/sponsors/${target._id}`, { order: current.order }),
      ]);
      load();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to reorder");
    }
  };

  return (
    <div className="container dash-body">
      <div className="dash-header">
        <h2>Trusted by — logos</h2>
        <p>
          These logos show on the public Landing and About pages. Add as many as you want; the strip
          scrolls automatically (and visitors can also scroll it with the arrows) once there are more
          than fit on screen.
        </p>
      </div>

      <form className="card" style={{ maxWidth: 480, marginBottom: 24 }} onSubmit={handleCreate}>
        <h3 style={{ marginTop: 0 }}>Add a logo</h3>
        <div className="field">
          <label>Club / team name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="field">
          <label>Logo image</label>
          <input
            id="sponsor-logo-input"
            type="file"
            accept="image/*"
            onChange={(e) => setLogo(e.target.files[0])}
            required
          />
        </div>
        {formError && <div className="error-text">{formError}</div>}
        <button className="btn btn-primary" disabled={saving}>
          {saving ? "Adding…" : "Add logo"}
        </button>
      </form>

      {loading && <p>Loading…</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && !error && (
        <div className="sponsor-manage-list">
          {sponsors.map((s, i) => (
            <div key={s._id} className="sponsor-manage-row">
              <img src={s.logoUrl} alt={s.name} className="sponsor-manage-thumb" />

              {editingId === s._id ? (
                <div className="sponsor-manage-edit">
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} />
                  <input type="file" accept="image/*" onChange={(e) => setEditLogo(e.target.files[0])} />
                  <div className="sponsor-manage-edit-actions">
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => saveEdit(s._id)}
                      disabled={savingEdit}
                    >
                      {savingEdit ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline"
                      style={{ color: "var(--navy)", borderColor: "var(--navy)" }}
                      onClick={cancelEdit}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="sponsor-manage-name">{s.name}</p>
                  <div className="sponsor-manage-actions">
                    <button className="link-btn" onClick={() => move(i, -1)} disabled={i === 0}>
                      ↑
                    </button>
                    <button
                      className="link-btn"
                      onClick={() => move(i, 1)}
                      disabled={i === sponsors.length - 1}
                    >
                      ↓
                    </button>
                    <button className="link-btn" onClick={() => startEdit(s)}>
                      Edit
                    </button>
                    <button className="link-btn" onClick={() => remove(s._id)}>
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
          {sponsors.length === 0 && <p style={{ color: "#777" }}>No logos yet — add the first one above.</p>}
        </div>
      )}
    </div>
  );
}

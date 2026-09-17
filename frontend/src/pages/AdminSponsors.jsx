import { useEffect, useState } from "react";
import api from "../api/axios";
import { useLanguage } from "../i18n/LanguageContext";

// Admin page for managing the logos shown in the public "Trusted by" strip
// (Landing + About pages) — add, rename/replace, delete. No code changes
// needed to add a new club logo anymore.
export default function AdminSponsors() {
  const { t } = useLanguage();
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
      setError(err.response?.data?.message || t("adminSponsors.failedToLoadSponsors"));
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
      setFormError(t("adminSponsors.pleaseChooseLogo"));
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
      setFormError(err.response?.data?.message || t("adminSponsors.failedToAddSponsor"));
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
      alert(err.response?.data?.message || t("adminSponsors.failedToSaveChanges"));
    } finally {
      setSavingEdit(false);
    }
  };

  const remove = async (id) => {
    if (!confirm(t("adminSponsors.confirmRemove"))) return;
    try {
      await api.delete(`/sponsors/${id}`);
      load();
    } catch (err) {
      alert(err.response?.data?.message || t("adminSponsors.failedToDeleteSponsor"));
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
      alert(err.response?.data?.message || t("adminSponsors.failedToReorder"));
    }
  };

  return (
    <div className="container dash-body">
      <div className="dash-header">
        <h2>{t("adminSponsors.title")}</h2>
        <p>{t("adminSponsors.intro")}</p>
      </div>

      <form className="card" style={{ maxWidth: 480, marginBottom: 24 }} onSubmit={handleCreate}>
        <h3 style={{ marginTop: 0 }}>{t("adminSponsors.addLogo")}</h3>
        <div className="field">
          <label>{t("adminSponsors.clubTeamName")}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="field">
          <label>{t("adminSponsors.logoImage")}</label>
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
          {saving ? t("adminSponsors.adding") : t("adminSponsors.addLogoButton")}
        </button>
      </form>

      {loading && <p>{t("common.loading")}</p>}
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
                      {savingEdit ? t("common.saving") : t("common.save")}
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline"
                      style={{ color: "var(--navy)", borderColor: "var(--navy)" }}
                      onClick={cancelEdit}
                    >
                      {t("common.cancel")}
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
                      {t("common.edit")}
                    </button>
                    <button className="link-btn" onClick={() => remove(s._id)}>
                      {t("common.delete")}
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
          {sponsors.length === 0 && <p style={{ color: "#777" }}>{t("adminSponsors.noLogos")}</p>}
        </div>
      )}
    </div>
  );
}

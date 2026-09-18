import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";
import { resolveFileUrl } from "../utils/fileUrl";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../i18n/LanguageContext";

function toDateInputValue(dob) {
  if (!dob) return "";
  const d = new Date(dob);
  if (isNaN(d)) return "";
  return d.toISOString().slice(0, 10);
}

// Individual Player account only (athleteId set on login) — lets the player
// edit their own shared profile fields and manage their own supporting
// documents ("verify document" uploads). Unlike EditAthlete.jsx (the
// Admin/Head Coach edit form), there's no team/role/fee management here —
// just the person-level fields shared across every team they're on.
//
// Any real change re-triggers the same approvalStatus "pending" gate an
// Admin/Head Coach edit already uses (across every team the player is on,
// not just one), so the record is hidden from public search/verify again
// until an Admin reviews it — same wording as the Head Coach edit page, so
// the expectation is consistent everywhere it appears.
export default function PlayerEditProfile() {
  const { t } = useLanguage();
  const { athleteId } = useAuth();

  const [form, setForm] = useState(null);
  const [currentPhotoUrl, setCurrentPhotoUrl] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [existingDocs, setExistingDocs] = useState([]);
  const [removeDocIds, setRemoveDocIds] = useState(new Set());
  const [newDocs, setNewDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [infoMessage, setInfoMessage] = useState("");

  useEffect(() => {
    if (!athleteId) {
      setLoading(false);
      return;
    }
    api
      .get(`/athletes/${athleteId}`)
      .then(({ data }) => {
        setForm({
          fullName: data.fullName || "",
          khmerName: data.khmerName || "",
          dateOfBirth: toDateInputValue(data.dateOfBirth),
          gender: data.gender || "male",
          address: data.address || "",
        });
        setCurrentPhotoUrl(data.photoUrl || null);
        setExistingDocs(data.supportingDocuments || []);
      })
      .catch((err) => setError(err.response?.data?.message || t("playerEditProfile.failedToLoad")))
      .finally(() => setLoading(false));
  }, [athleteId]);

  const update = (key) => (e) => {
    setInfoMessage("");
    setForm({ ...form, [key]: e.target.value });
  };

  const toggleRemoveDoc = (docId) => {
    setInfoMessage("");
    setRemoveDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setInfoMessage("");
    setSaving(true);
    try {
      const data = new FormData();
      Object.entries(form).forEach(([k, v]) => data.append(k, v));
      if (photo) data.append("photo", photo);
      newDocs.forEach((f) => data.append("documents", f));
      if (removeDocIds.size) data.append("removeDocumentIds", JSON.stringify([...removeDocIds]));

      const { data: result } = await api.put(`/athletes/${athleteId}`, data, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (result?.noChanges) {
        setInfoMessage(t("playerEditProfile.noChangesToSave"));
        return;
      }
      setPhoto(null);
      setNewDocs([]);
      setRemoveDocIds(new Set());
      setExistingDocs(result.supportingDocuments || []);
      setCurrentPhotoUrl(result.photoUrl || null);
      setInfoMessage(t("playerEditProfile.savedPendingApproval"));
    } catch (err) {
      setError(err.response?.data?.message || t("playerEditProfile.failedToSave"));
    } finally {
      setSaving(false);
    }
  };

  if (!athleteId) {
    return (
      <div className="container dash-body">
        <p className="error-text">{t("playerEditProfile.onlyForPlayer")}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container dash-body">
        <p>{t("common.loading")}</p>
      </div>
    );
  }

  if (error && !form) {
    return (
      <div className="container dash-body">
        <p className="error-text">{error}</p>
      </div>
    );
  }

  return (
    <div className="container dash-body">
      <div className="dash-header">
        <h2>{t("playerEditProfile.title")}</h2>
        <p>
          {t("playerEditProfile.descBefore")} <strong>{t("common.pending")}</strong>
          {t("playerEditProfile.descAfter")}
        </p>
      </div>

      <form className="card" style={{ maxWidth: 640 }} onSubmit={handleSubmit}>
        <div className="field">
          <label>{t("playerEditProfile.fullName")}</label>
          <input value={form.fullName} onChange={update("fullName")} required />
        </div>
        <div className="field">
          <label>{t("playerEditProfile.khmerName")}</label>
          <input value={form.khmerName} onChange={update("khmerName")} />
        </div>
        <div className="field">
          <label>{t("playerEditProfile.dateOfBirth")}</label>
          <input type="date" value={form.dateOfBirth} onChange={update("dateOfBirth")} />
        </div>
        <div className="field">
          <label>{t("playerEditProfile.gender")}</label>
          <select value={form.gender} onChange={update("gender")}>
            <option value="male">{t("playerEditProfile.genderMale")}</option>
            <option value="female">{t("playerEditProfile.genderFemale")}</option>
            <option value="other">{t("playerEditProfile.genderOther")}</option>
          </select>
        </div>
        <div className="field">
          <label>{t("playerEditProfile.address")}</label>
          <input value={form.address} onChange={update("address")} />
        </div>
        <div className="field">
          <label>{t("playerEditProfile.photo")}</label>
          {currentPhotoUrl && !photo && (
            <img src={resolveFileUrl(currentPhotoUrl)} alt="Current" className="edit-current-photo" />
          )}
          <input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files[0])} />
          <p className="help-text">{t("playerEditProfile.keepCurrentPhoto")}</p>
        </div>

        <div className="field">
          <label>{t("playerEditProfile.documents")}</label>
          <p className="help-text" style={{ marginTop: -4 }}>
            {t("playerEditProfile.documentsHelp")}
          </p>
          {existingDocs.length > 0 && (
            <ul className="fee-items">
              {existingDocs.map((doc) => (
                <li key={doc._id}>
                  <a href={resolveFileUrl(doc.fileUrl)} target="_blank" rel="noreferrer">
                    {doc.label || t("playerEditProfile.document")}
                  </a>
                  <label style={{ display: "flex", alignItems: "center", gap: 4, fontWeight: 400 }}>
                    <input
                      type="checkbox"
                      checked={removeDocIds.has(String(doc._id))}
                      onChange={() => toggleRemoveDoc(String(doc._id))}
                    />
                    {t("playerEditProfile.removeCheckbox")}
                  </label>
                </li>
              ))}
            </ul>
          )}
          <input
            type="file"
            multiple
            accept="image/*,application/pdf"
            onChange={(e) => setNewDocs(Array.from(e.target.files))}
          />
          <p className="help-text">{t("playerEditProfile.newDocumentsHelp")}</p>
        </div>

        {error && <div className="error-text">{error}</div>}
        {infoMessage && <p className="help-text">{infoMessage}</p>}

        <button className="btn btn-primary" disabled={saving}>
          {saving ? t("playerEditProfile.saving") : t("playerEditProfile.saveChanges")}
        </button>
        <Link to="/player" className="link-btn" style={{ marginLeft: 12 }}>
          {t("playerEditProfile.backToDashboard")}
        </Link>
      </form>
    </div>
  );
}

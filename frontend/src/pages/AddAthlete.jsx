import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import TeamSelect from "../components/TeamSelect";
import { resolveFileUrl } from "../utils/fileUrl";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../i18n/LanguageContext";
import RequireActiveSubscription from "../components/RequireActiveSubscription";

export default function AddAthlete() {
  const { t } = useLanguage();
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
  const [addingToId, setAddingToId] = useState(null); // which match's "add role" is in flight
  const navigate = useNavigate();

  // Notice (don't block) when a player with the same name is already
  // registered — the same name could belong to two different people, or it
  // could be the SAME real person joining another team / taking on another
  // role. Rather than creating an untracked second profile for the latter
  // case, each match offers an "Add this team/role to them instead" button
  // that attaches a new assignment to the existing person (same photo,
  // same ID card, same QR).
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

  // Attaches the team/role currently filled in on this form to an EXISTING
  // matched person, instead of creating a whole new record for them.
  const addToExisting = async (athleteId) => {
    setError("");
    setAddingToId(athleteId);
    try {
      await api.post(`/athletes/${athleteId}/assignments`, {
        team: form.team,
        role: form.role,
      });
      navigate(isHeadCoach ? "/coach" : `/admin/athlete/${athleteId}`);
    } catch (err) {
      setError(err.response?.data?.message || t("addAthlete.failedToLoad"));
    } finally {
      setAddingToId(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (duplicates.length > 0) {
      const names = duplicates.map((d) => `${d.fullName}`).join(", ");
      const proceed = confirm(t("addAthlete.duplicateConfirm").replace("{names}", names));
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
      setError(err.response?.data?.message || t("addAthlete.failedToSave"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <RequireActiveSubscription>
    <div className="container" style={{ paddingBottom: 60 }}>
      <div className="dash-header">
        <h2>{t("addAthlete.title")}</h2>
      </div>
      {isHeadCoach && (
        <p className="help-text" style={{ maxWidth: 640 }}>
          {t("addAthlete.pendingNotice")} <strong>{t("addAthlete.pendingNoticePending")}</strong>
          {t("addAthlete.pendingNoticeRest")}
        </p>
      )}
      <form className="card" style={{ maxWidth: 640 }} onSubmit={handleSubmit}>
        <div className="field">
          <label>{t("addAthlete.fullName")}</label>
          <input value={form.fullName} onChange={update("fullName")} required />
        </div>
        <div className="field">
          <label>{t("addAthlete.khmerName")}</label>
          <input value={form.khmerName} onChange={update("khmerName")} />
        </div>

        {checkingDuplicate && <p className="help-text">{t("addAthlete.checkingDuplicate")}</p>}
        {!checkingDuplicate && duplicates.length > 0 && (
          <div className="duplicate-warning">
            <p className="duplicate-warning-title">{t("addAthlete.duplicateWarningTitle")}</p>
            {duplicates.map((d) => (
              <div key={d._id} className="duplicate-warning-row">
                <img
                  src={d.photoUrl ? resolveFileUrl(d.photoUrl) : "https://placehold.co/40x40?text=?"}
                  alt={d.fullName}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="name">
                    {d.fullName}
                    {d.khmerName ? ` · ${d.khmerName}` : ""}
                  </p>
                  <p className="meta">
                    {(d.assignments || []).map((a) => `${a.team} · ${a.role}`).join(", ") ||
                      t("addAthlete.noTeamYet")}{" "}
                    · {t("addAthlete.idLabel")} {d.verifyId}
                  </p>
                </div>
                <button
                  type="button"
                  className="link-btn"
                  disabled={!form.team || addingToId === d._id}
                  onClick={() => addToExisting(d._id)}
                  style={{ flexShrink: 0 }}
                >
                  {addingToId === d._id
                    ? t("addAthlete.adding")
                    : t("addAthlete.addRoleTeamToThem")
                        .replace("{role}", form.role || t("addAthlete.role"))
                        .replace("{team}", form.team || t("addAthlete.team"))}
                </button>
              </div>
            ))}
            <p className="help-text">{t("addAthlete.duplicateHelpText")}</p>
          </div>
        )}

        <div className="field">
          <label>{t("addAthlete.dateOfBirth")}</label>
          <input type="date" value={form.dateOfBirth} onChange={update("dateOfBirth")} />
        </div>
        <div className="field">
          <label>{t("addAthlete.gender")}</label>
          <select value={form.gender} onChange={update("gender")}>
            <option value="male">{t("addAthlete.genderMale")}</option>
            <option value="female">{t("addAthlete.genderFemale")}</option>
            <option value="other">{t("addAthlete.genderOther")}</option>
          </select>
        </div>
        {isHeadCoach ? (
          <div className="field">
            <label>{t("addAthlete.team.label")}</label>
            <input value={form.team} disabled />
          </div>
        ) : (
          <TeamSelect value={form.team} onChange={(team) => setForm({ ...form, team })} required />
        )}
        <div className="field">
          <label>{t("addAthlete.roleLabel")}</label>
          <select value={form.role} onChange={update("role")}>
            <option value="PLAYER">{t("addAthlete.rolePlayer")}</option>
            <option value="ASSISTAN COACH">{t("addAthlete.roleAssistantCoach")}</option>
            <option value="HEAD COACH">{t("addAthlete.roleHeadCoach")}</option>
            <option value="TECHNICAL">{t("addAthlete.roleTechnical")}</option>
            <option value="MEDIC">{t("addAthlete.roleMedic")}</option>
          </select>
        </div>
        <div className="field">
          <label>{t("addAthlete.address")}</label>
          <input value={form.address} onChange={update("address")} />
        </div>
        <div className="field">
          <label>{t("addAthlete.availability")}</label>
          <select value={form.isAvailable} onChange={update("isAvailable")}>
            <option value="true">{t("addAthlete.available")}</option>
            <option value="false">{t("addAthlete.notAvailable")}</option>
          </select>
        </div>
        <div className="field">
          <label>{t("addAthlete.photo")}</label>
          <input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files[0])} />
        </div>
        <div className="field">
          <label>{t("addAthlete.supportingDocuments")}</label>
          <input
            type="file"
            multiple
            accept="image/*,application/pdf"
            onChange={(e) => setDocuments(Array.from(e.target.files))}
          />
        </div>

        {error && <div className="error-text">{error}</div>}

        <button className="btn btn-primary" disabled={loading}>
          {loading ? t("addAthlete.saving") : t("addAthlete.saveAndGenerateId")}
        </button>
      </form>
    </div>
    </RequireActiveSubscription>
  );
}

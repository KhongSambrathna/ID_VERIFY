import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../api/axios";
import { useLanguage } from "../i18n/LanguageContext";

// PUBLIC self-registration page — reached from the shareable link a Head
// Coach sends (…/register/<token>). No login needed: the whole point is the
// player doesn't have an account yet. On load it validates the token, shows
// which team they're joining, and lets them fill in their OWN details (name,
// DOB, photo, ID documents…). Submitting creates a PENDING record and reveals
// their ID + default password to write down — the login itself is only created
// once an Admin approves (see backend/utils/playerAccount.js).
export default function PlayerRegister() {
  const { token } = useParams();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [linkError, setLinkError] = useState("");

  const [form, setForm] = useState({
    fullName: "",
    khmerName: "",
    dateOfBirth: "",
    gender: "male",
    address: "",
    isAvailable: "true",
  });
  const [photo, setPhoto] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Set only after a successful submit — flips the page to the "here's your
  // ID + password, write it down" success screen.
  const [result, setResult] = useState(null);

  useEffect(() => {
    let active = true;
    api
      .get(`/registration/invites/${token}`)
      .then(({ data }) => {
        if (active) {
          setInvite(data);
          setLinkError("");
        }
      })
      .catch((err) => {
        if (active) setLinkError(err.response?.data?.message || t("playerRegister.linkInvalid"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const data = new FormData();
      Object.entries(form).forEach(([k, v]) => data.append(k, v));
      if (photo) data.append("photo", photo);
      documents.forEach((doc) => data.append("documents", doc));

      const { data: res } = await api.post(`/registration/invites/${token}`, data, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(res);
    } catch (err) {
      setError(err.response?.data?.message || t("playerRegister.submitFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="auth-wrap">
        <div className="card">
          <p>{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  // A dead/used/expired/invalid link — the form never renders.
  if (linkError || !invite) {
    return (
      <div className="auth-wrap">
        <div className="card">
          <h2>{t("playerRegister.title")}</h2>
          <p className="error-text">{linkError || t("playerRegister.linkInvalid")}</p>
          <Link className="link-btn" to="/">
            {t("common.back")}
          </Link>
        </div>
      </div>
    );
  }

  // Success screen — the only place a player ever sees their ID + default
  // password, so they can write them down for after approval.
  if (result) {
    return (
      <div className="auth-wrap">
        <div className="card" style={{ maxWidth: 520 }}>
          <h2>✅ {t("playerRegister.successTitle")}</h2>
          <p>{t("playerRegister.successIntro")}</p>
          <div className="credentials-box">
            <div className="credential-row">
              <span className="credential-label">{t("playerRegister.yourId")}</span>
              <strong className="credential-value">{result.verifyId}</strong>
            </div>
            <div className="credential-row">
              <span className="credential-label">{t("playerRegister.defaultPassword")}</span>
              <strong className="credential-value">{result.defaultPassword}</strong>
            </div>
          </div>
          <p className="help-text">{t("playerRegister.writeDownNote")}</p>
          <p className="help-text">{t("playerRegister.pendingNote")}</p>
          <button
            type="button"
            className="btn btn-primary"
            style={{ width: "100%" }}
            onClick={() => navigate("/login")}
          >
            {t("playerRegister.goToLogin")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-wrap">
      <form className="card" style={{ maxWidth: 560 }} onSubmit={handleSubmit}>
        <h2>{t("playerRegister.title")}</h2>
        <p className="help-text">
          {t("playerRegister.introTeam")} <strong>{invite.team}</strong>
        </p>

        <div className="field">
          <label>{t("addAthlete.fullName")}</label>
          <input value={form.fullName} onChange={update("fullName")} required />
        </div>
        <div className="field">
          <label>{t("addAthlete.khmerName")}</label>
          <input value={form.khmerName} onChange={update("khmerName")} />
        </div>
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
        <div className="field">
          <label>{t("addAthlete.address")}</label>
          <input value={form.address} onChange={update("address")} />
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

        <button className="btn btn-primary" style={{ width: "100%" }} disabled={submitting}>
          {submitting ? t("playerRegister.submitting") : t("playerRegister.submit")}
        </button>
      </form>
    </div>
  );
}

